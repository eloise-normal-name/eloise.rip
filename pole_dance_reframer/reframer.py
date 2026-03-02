#!/usr/bin/env python3
"""
reframer.py — Pole dance video auto-reframer with background blur.

Pipeline per file:
  1. Extract frames via FFmpeg (JPEG, high quality)
  2. Detect persons with YOLOv8n (ultralytics)
  3. EMA-smooth a crop window tracking the primary subject
  4. Gaussian-blur every non-primary detected person
  5. Crop each frame to the target aspect ratio
  6. Reassemble MP4 via FFmpeg, preserving original audio

Usage:
    python reframer.py --input "clips/*.mp4" --output-dir out/
"""

from __future__ import annotations

import argparse
import glob
import json
import logging
import shutil
import subprocess
import sys
import tempfile
import time
from dataclasses import dataclass
from pathlib import Path

import cv2
import numpy as np
from ultralytics import YOLO

log = logging.getLogger(__name__)

VIDEO_EXTENSIONS = {".mp4", ".mov", ".mkv", ".avi", ".webm", ".m4v"}


# ---------------------------------------------------------------------------
# Data types
# ---------------------------------------------------------------------------

@dataclass
class BBox:
    x1: int
    y1: int
    x2: int
    y2: int
    track_id: int | None = None

    @property
    def cx(self) -> float:
        return (self.x1 + self.x2) / 2.0

    @property
    def cy(self) -> float:
        return (self.y1 + self.y2) / 2.0

    @property
    def area(self) -> int:
        return (self.x2 - self.x1) * (self.y2 - self.y1)


@dataclass
class CropState:
    """EMA-smoothed crop center in normalised [0, 1] coordinates."""
    cx: float = 0.5
    cy: float = 0.5
    initialized: bool = False


@dataclass
class SubjectTracker:
    """Locks onto one person's ByteTrack ID across frames."""
    locked_id: int | None = None
    frames_missing: int = 0
    reacquire_after: int = 45  # frames before giving up on a lost subject


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Auto-reframe pole dance videos and blur background persons.",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    parser.add_argument(
        "--input", required=True,
        help="Path or glob pattern to input video file(s)",
    )
    parser.add_argument(
        "--output-dir", required=True,
        help="Directory for output files",
    )
    parser.add_argument(
        "--aspect", default="9:16",
        help="Output crop aspect ratio as W:H",
    )
    parser.add_argument(
        "--smooth", type=float, default=0.1,
        help="EMA alpha for crop smoothing (0.0 = locked, 1.0 = no smoothing)",
    )
    parser.add_argument(
        "--blur-strength", type=int, default=51,
        help="Gaussian blur kernel size (odd number)",
    )
    parser.add_argument(
        "--device", default="cpu", choices=["cpu", "cuda"],
        help="Inference device for YOLOv8",
    )
    parser.add_argument(
        "--reacquire", type=int, default=45,
        help="Frames to hold position after losing the subject before re-selecting a new one",
    )
    parser.add_argument(
        "--blur-overlap", type=float, default=0.3,
        help="IoU threshold: skip blurring a box if it overlaps the primary by this much (catches split detections of the subject)",
    )
    parser.add_argument(
        "--no-blur", action="store_true",
        help="Skip background blurring entirely; output crop-only version (suffix: _framed)",
    )
    parser.add_argument(
        "--keep-frames", action="store_true",
        help="Copy temp frames to output dir for debugging",
    )
    return parser.parse_args()


# ---------------------------------------------------------------------------
# FFmpeg helpers
# ---------------------------------------------------------------------------

def probe_video(path: Path) -> dict:
    """Return {width, height, fps} for a video file via ffprobe."""
    cmd = [
        "ffprobe", "-v", "quiet",
        "-print_format", "json",
        "-show_streams", "-select_streams", "v:0",
        str(path),
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, check=True)
    stream = json.loads(result.stdout)["streams"][0]
    num, den = stream["r_frame_rate"].split("/")
    fps = float(num) / float(den)
    return {
        "width": int(stream["width"]),
        "height": int(stream["height"]),
        "fps": fps,
    }


def extract_frames(video_path: Path, out_dir: Path) -> int:
    """Extract every frame as a high-quality JPEG. Returns total frame count."""
    out_dir.mkdir(parents=True, exist_ok=True)
    cmd = [
        "ffmpeg", "-y",
        "-i", str(video_path),
        "-q:v", "2",          # ~95% quality JPEG
        str(out_dir / "%06d.jpg"),
    ]
    subprocess.run(cmd, capture_output=True, text=True, check=True)
    return len(sorted(out_dir.glob("*.jpg")))


def assemble_video(
    frame_dir: Path,
    source_video: Path,
    output_path: Path,
    fps: float,
) -> None:
    """Combine processed frames with the original audio stream into an MP4."""
    output_path.parent.mkdir(parents=True, exist_ok=True)
    cmd = [
        "ffmpeg", "-y",
        "-framerate", f"{fps:.6f}",
        "-i", str(frame_dir / "%06d.jpg"),
        "-i", str(source_video),
        "-map", "0:v:0",
        "-map", "1:a:0?",         # optional — won't fail if no audio track
        "-c:v", "libx264",
        "-crf", "18",
        "-preset", "fast",
        "-pix_fmt", "yuv420p",
        "-c:a", "copy",
        "-movflags", "+faststart",
        str(output_path),
    ]
    subprocess.run(cmd, capture_output=True, text=True, check=True)


# ---------------------------------------------------------------------------
# Person detection
# ---------------------------------------------------------------------------

def detect_persons(frame: np.ndarray, model: YOLO, device: str) -> list[BBox]:
    """Run YOLOv8n tracking; return bounding boxes with persistent track IDs."""
    results = model.track(frame, device=device, classes=[0], verbose=False, persist=True)
    boxes: list[BBox] = []
    for r in results:
        if r.boxes is None:
            continue
        for box in r.boxes:
            x1, y1, x2, y2 = (int(v) for v in box.xyxy[0].tolist())
            track_id = int(box.id[0].item()) if box.id is not None else None
            boxes.append(BBox(x1, y1, x2, y2, track_id=track_id))
    return boxes


def pick_primary(
    boxes: list[BBox],
    frame_w: int,
    frame_h: int,
    tracker: SubjectTracker,
) -> BBox | None:
    """
    Return the primary subject box, preferring the locked track ID.

    First call (or after re-acquisition): select by centre proximity + area.
    Subsequent calls: return the box whose track_id matches tracker.locked_id.
    If that ID goes missing, hold position (return None) for up to
    tracker.reacquire_after frames, then re-acquire.
    """
    if not boxes:
        tracker.frames_missing += 1
        if tracker.frames_missing > tracker.reacquire_after:
            tracker.locked_id = None
        return None

    # Prefer the established subject
    if tracker.locked_id is not None:
        for box in boxes:
            if box.track_id == tracker.locked_id:
                tracker.frames_missing = 0
                return box
        # ID not found this frame — hold position for now
        tracker.frames_missing += 1
        if tracker.frames_missing <= tracker.reacquire_after:
            return None
        # Grace period expired — fall through to re-acquire
        tracker.locked_id = None

    # Acquire: pick by closest centroid to frame centre, break ties by area
    fc_x, fc_y = frame_w / 2.0, frame_h / 2.0

    def key(b: BBox) -> tuple[float, int]:
        dist = ((b.cx - fc_x) ** 2 + (b.cy - fc_y) ** 2) ** 0.5
        return (dist, -b.area)

    primary = min(boxes, key=key)
    tracker.locked_id = primary.track_id
    tracker.frames_missing = 0
    return primary


# ---------------------------------------------------------------------------
# Crop window
# ---------------------------------------------------------------------------

def parse_aspect(s: str) -> tuple[int, int]:
    """Parse 'W:H' string into (W, H) ints."""
    try:
        w_str, h_str = s.split(":")
        return int(w_str), int(h_str)
    except (ValueError, AttributeError) as exc:
        raise ValueError(f"Invalid aspect ratio {s!r} — expected W:H, e.g. '9:16'") from exc


def compute_crop_window(
    cx: float,
    cy: float,
    aspect_w: int,
    aspect_h: int,
    frame_w: int,
    frame_h: int,
) -> tuple[int, int, int, int]:
    """
    Return (x, y, crop_w, crop_h): the largest rectangle with the given
    aspect ratio that fits within the frame, centred as closely as possible
    on (cx, cy).
    """
    aspect = aspect_w / aspect_h
    if frame_w / frame_h <= aspect:
        cw = frame_w
        ch = int(round(cw / aspect))
    else:
        ch = frame_h
        cw = int(round(ch * aspect))

    cw = max(1, min(cw, frame_w))
    ch = max(1, min(ch, frame_h))

    x = int(round(cx - cw / 2))
    y = int(round(cy - ch / 2))
    x = max(0, min(x, frame_w - cw))
    y = max(0, min(y, frame_h - ch))
    return x, y, cw, ch


def update_ema(state: CropState, nx: float, ny: float, alpha: float) -> None:
    """Update EMA crop centre in-place using normalised coordinates."""
    if not state.initialized:
        state.cx, state.cy, state.initialized = nx, ny, True
    else:
        state.cx = alpha * nx + (1.0 - alpha) * state.cx
        state.cy = alpha * ny + (1.0 - alpha) * state.cy


# ---------------------------------------------------------------------------
# Background blur
# ---------------------------------------------------------------------------

def iou(a: BBox, b: BBox) -> float:
    """Intersection over Union for two bounding boxes."""
    ix1, iy1 = max(a.x1, b.x1), max(a.y1, b.y1)
    ix2, iy2 = min(a.x2, b.x2), min(a.y2, b.y2)
    if ix2 <= ix1 or iy2 <= iy1:
        return 0.0
    intersection = (ix2 - ix1) * (iy2 - iy1)
    union = a.area + b.area - intersection
    return intersection / union if union > 0 else 0.0


def centroid_inside(box: BBox, primary: BBox) -> bool:
    """True if box's centroid falls within primary's bounding box.

    A reliable indicator that box is a partial/split detection of the same
    person (e.g. just the legs when the subject is inverted), since a
    genuinely different background person's centroid would not overlap the
    subject's bounding box.
    """
    return primary.x1 <= box.cx <= primary.x2 and primary.y1 <= box.cy <= primary.y2


def apply_blur_regions(
    frame: np.ndarray,
    primary: BBox,
    all_boxes: list[BBox],
    kernel: int,
    overlap_threshold: float = 0.3,
) -> np.ndarray:
    """Gaussian-blur every detected person except the primary subject.

    A box is skipped (not blurred) when any of:
    - it IS the primary (identity check)
    - its centroid falls inside the primary's bounding box (split detection —
      subject's limbs detected separately in unusual poses)
    - its IoU with the primary >= overlap_threshold (heavy overlap —
      partial occlusion by pole, inversion, etc.)
    """
    k = kernel if kernel % 2 == 1 else kernel + 1
    h, w = frame.shape[:2]
    result = frame.copy()
    for box in all_boxes:
        if box is primary:
            continue
        if centroid_inside(box, primary):
            continue  # split detection — centroid is inside subject's box
        if iou(box, primary) >= overlap_threshold:
            continue  # heavy overlap — split detection of the subject
        y1, y2 = max(0, box.y1), min(h, box.y2)
        x1, x2 = max(0, box.x1), min(w, box.x2)
        if x2 > x1 and y2 > y1:
            result[y1:y2, x1:x2] = cv2.GaussianBlur(result[y1:y2, x1:x2], (k, k), 0)
    return result


# ---------------------------------------------------------------------------
# Per-frame processing
# ---------------------------------------------------------------------------

def process_frame(
    frame_path: Path,
    out_path: Path,
    model: YOLO,
    state: CropState,
    tracker: SubjectTracker,
    aspect_w: int,
    aspect_h: int,
    alpha: float,
    blur_strength: int,
    overlap_threshold: float,
    no_blur: bool,
    device: str,
) -> None:
    """Detect → smooth → blur → crop → save one frame."""
    frame = cv2.imread(str(frame_path))
    if frame is None:
        raise OSError(f"Cannot read frame: {frame_path}")

    fh, fw = frame.shape[:2]
    boxes = detect_persons(frame, model, device)
    primary = pick_primary(boxes, fw, fh, tracker)

    if primary is None:
        log.debug("No person detected in %s — holding crop position", frame_path.name)
    else:
        update_ema(state, primary.cx / fw, primary.cy / fh, alpha)

    # Default to frame centre if nothing detected yet
    if not state.initialized:
        state.cx, state.cy, state.initialized = 0.5, 0.5, True

    # Blur background persons before cropping (operates on full frame)
    if not no_blur and primary is not None and len(boxes) > 1:
        frame = apply_blur_regions(frame, primary, boxes, blur_strength, overlap_threshold)

    x, y, cw, ch = compute_crop_window(
        state.cx * fw, state.cy * fh, aspect_w, aspect_h, fw, fh,
    )
    cropped = frame[y:y + ch, x:x + cw]
    cv2.imwrite(str(out_path), cropped, [cv2.IMWRITE_JPEG_QUALITY, 95])


# ---------------------------------------------------------------------------
# Per-file pipeline
# ---------------------------------------------------------------------------

def process_file(video_path: Path, args: argparse.Namespace, model: YOLO) -> bool:
    """Full pipeline for one video file. Returns True on success."""
    try:
        aspect_w, aspect_h = parse_aspect(args.aspect)
    except ValueError as exc:
        log.error("%s", exc)
        return False

    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    label = "framed" if args.no_blur else "reframed"
    output_path = output_dir / f"{video_path.stem}_{label}{video_path.suffix}"

    log.info("Processing: %s → %s", video_path.name, output_path.name)

    try:
        info = probe_video(video_path)
    except subprocess.CalledProcessError as exc:
        log.error("ffprobe failed for %s: %s", video_path.name, (exc.stderr or "").strip()[:400])
        return False

    fw, fh, fps = info["width"], info["height"], info["fps"]
    log.info("  %dx%d @ %.3f fps", fw, fh, fps)

    # Validate aspect ratio fits within frame dimensions
    aspect = aspect_w / aspect_h
    if fw / fh <= aspect:
        crop_w_check, crop_h_check = fw, int(round(fw / aspect))
    else:
        crop_h_check, crop_w_check = fh, int(round(fh * aspect))
    if crop_w_check > fw or crop_h_check > fh:
        log.error(
            "Aspect ratio %s would require a %dx%d crop exceeding the %dx%d frame — skipping",
            args.aspect, crop_w_check, crop_h_check, fw, fh,
        )
        return False

    with tempfile.TemporaryDirectory(prefix="reframer_") as tmp:
        tmp_path = Path(tmp)
        raw_dir = tmp_path / "raw"
        proc_dir = tmp_path / "proc"
        proc_dir.mkdir()

        log.info("  Extracting frames…")
        try:
            frame_count = extract_frames(video_path, raw_dir)
        except subprocess.CalledProcessError as exc:
            log.error("Frame extraction failed: %s", (exc.stderr or "").strip()[:400])
            return False

        log.info("  %d frames extracted", frame_count)

        raw_frames = sorted(raw_dir.glob("*.jpg"))
        state = CropState()
        tracker = SubjectTracker(reacquire_after=args.reacquire)
        # Reset ByteTrack state so IDs don't bleed across files
        model.predictor = None
        t0 = time.monotonic()

        for i, fp in enumerate(raw_frames, start=1):
            try:
                process_frame(
                    fp, proc_dir / fp.name, model, state, tracker,
                    aspect_w, aspect_h, args.smooth, args.blur_strength,
                    args.blur_overlap, args.no_blur, args.device,
                )
            except Exception as exc:
                log.warning("  Skipping frame %s: %s", fp.name, exc)

            if i % 10 == 0 or i == frame_count:
                elapsed = time.monotonic() - t0
                fps_est = i / elapsed if elapsed > 0 else 0.0
                print(f"\r  Frame {i}/{frame_count}  ({fps_est:.1f} fps)", end="", flush=True)

        print()  # newline after progress line

        if args.keep_frames:
            debug_dir = output_dir / f"{video_path.stem}_frames"
            shutil.copytree(str(tmp_path), str(debug_dir), dirs_exist_ok=True)
            log.info("  Debug frames saved to: %s", debug_dir)

        log.info("  Assembling output…")
        try:
            assemble_video(proc_dir, video_path, output_path, fps)
        except subprocess.CalledProcessError as exc:
            log.error("Assembly failed: %s", (exc.stderr or "").strip()[:400])
            return False

    log.info("  Done: %s", output_path)
    return True


# ---------------------------------------------------------------------------
# Input resolution
# ---------------------------------------------------------------------------

def resolve_inputs(pattern: str) -> list[Path]:
    """Expand a glob pattern or accept a literal path; filter to video files."""
    paths = [Path(p) for p in sorted(glob.glob(pattern, recursive=True))]
    if not paths:
        literal = Path(pattern)
        if literal.exists():
            paths = [literal]
    return [p for p in paths if p.suffix.lower() in VIDEO_EXTENSIONS]


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    args = parse_args()

    if not (0.0 <= args.smooth <= 1.0):
        log.error("--smooth must be between 0.0 and 1.0")
        sys.exit(1)

    if args.blur_strength % 2 == 0:
        args.blur_strength += 1
        log.warning("--blur-strength adjusted to %d (must be odd)", args.blur_strength)

    log.info("Loading YOLOv8n model…")
    model = YOLO("yolov8n.pt")

    inputs = resolve_inputs(args.input)
    if not inputs:
        log.error("No video files found for pattern: %s", args.input)
        sys.exit(1)

    log.info("%d file(s) to process", len(inputs))

    results: list[tuple[Path, bool]] = []
    for video in inputs:
        try:
            ok = process_file(video, args, model)
        except Exception:
            log.exception("Unexpected error processing %s", video)
            ok = False
        results.append((video, ok))

    print("\n=== Results ===")
    for path, ok in results:
        mark = "OK" if ok else "FAILED"
        print(f"  [{mark}] {path}")

    if any(not ok for _, ok in results):
        sys.exit(1)


if __name__ == "__main__":
    main()
