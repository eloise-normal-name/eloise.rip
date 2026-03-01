# Pole Dance Video Reframer — Design Document

A local CLI tool that processes pole dance video files in batch. For each
input video it produces a portrait-cropped, subject-tracked output with any
background people blurred out. Everything runs offline: no cloud APIs,
no paid services.

---

## Table of Contents

1. [Purpose](#purpose)
2. [Architecture Overview](#architecture-overview)
3. [Pipeline Walkthrough](#pipeline-walkthrough)
4. [Key Algorithms](#key-algorithms)
   - [Primary Subject Selection](#primary-subject-selection)
   - [EMA Crop Smoothing](#ema-crop-smoothing)
   - [Crop Window Computation](#crop-window-computation)
   - [Background Blur](#background-blur)
5. [Data Flow](#data-flow)
6. [Module Reference](#module-reference)
7. [CLI Reference](#cli-reference)
8. [Dependencies](#dependencies)
9. [Known Limitations](#known-limitations)

---

## Purpose

Raw pole dance footage is typically shot in landscape orientation with a wide
field of view. Publishing to portrait-first platforms (Reels, Shorts, TikTok)
requires a vertical crop. Doing that crop manually per-frame is tedious; doing
it by cutting to a fixed region loses the subject when they move.

This tool automates the crop by tracking the primary performer across frames
and blurring any other people who appear in the background (bystanders,
spotters, other students). The result is a smooth, vertically-framed video
that keeps the performer centred with no manual keyframing.

---

## Architecture Overview

```
Input video(s)
      │
      ▼
┌─────────────────┐
│  FFmpeg extract │  frames → temp/raw/%06d.jpg
└────────┬────────┘
         │
         ▼  (per frame)
┌─────────────────────────────────────────────┐
│  YOLOv8n inference  →  list of BBoxes       │
│  pick_primary()     →  subject BBox          │
│  update_ema()       →  smoothed crop centre  │
│  apply_blur_regions()→  blurred background   │
│  compute_crop_window()→  final rect          │
│  OpenCV crop + write→  temp/proc/%06d.jpg   │
└────────┬────────────────────────────────────┘
         │
         ▼
┌─────────────────┐
│  FFmpeg assemble│  proc frames + original audio → output.mp4
└─────────────────┘
```

Temp directories are created by Python's `tempfile.TemporaryDirectory` and
cleaned up automatically on exit (unless `--keep-frames` is set).

---

## Pipeline Walkthrough

### 1. Input resolution

`resolve_inputs()` expands the `--input` argument as a glob pattern and
filters to known video extensions (`.mp4 .mov .mkv .avi .webm .m4v`). A
literal path is also accepted if no glob matches are found.

### 2. Model loading

YOLOv8n is loaded once before the batch loop begins. The first run downloads
`yolov8n.pt` (~6 MB) from the ultralytics CDN and caches it locally. All
subsequent runs use the cached weights.

### 3. Frame extraction

```
ffmpeg -i input.mp4 -q:v 2 temp/raw/%06d.jpg
```

`-q:v 2` produces near-lossless JPEG (approximately equivalent to 95% quality)
while keeping file sizes manageable. Frames are numbered from `000001.jpg`.

### 4. Per-frame processing loop

For each extracted frame:

1. **Detect** — YOLOv8n infers on the full-resolution frame, returning
   bounding boxes for every detected person (COCO class 0).
2. **Select** — `pick_primary()` selects the subject (see below).
3. **Smooth** — `update_ema()` advances the EMA crop centre toward the
   subject's normalised centroid.
4. **Blur** — `apply_blur_regions()` applies gaussian blur over every
   non-primary bounding box on a copy of the frame.
5. **Crop** — `compute_crop_window()` derives a pixel rectangle from the
   smoothed centre and writes the crop to `temp/proc/`.

If no person is detected in a frame, a warning is logged and the last known
crop position is held (the EMA is not updated).

### 5. Assembly

```
ffmpeg -framerate {fps} -i temp/proc/%06d.jpg \
       -i input.mp4 \
       -map 0:v:0 -map 1:a:0? \
       -c:v libx264 -crf 18 -preset fast \
       -pix_fmt yuv420p -c:a copy \
       -movflags +faststart \
       output/{stem}_reframed.mp4
```

`-map 1:a:0?` muxes the original audio stream if one exists; the `?` makes
it optional so audio-free inputs are handled gracefully. Video is encoded to
H.264 at CRF 18 (visually lossless for typical content).

---

## Key Algorithms

### Primary Subject Selection

The primary subject is whichever detected person's bounding-box centroid is
closest to the frame centre (Euclidean distance). If two people are the same
distance from centre, the one with the larger bounding box wins.

```python
def key(b: BBox) -> tuple[float, int]:
    dist = ((b.cx - fc_x) ** 2 + (b.cy - fc_y) ** 2) ** 0.5
    return (dist, -b.area)  # sort ascending: small dist, large area

primary = min(boxes, key=key)
```

This heuristic works well for pole dance footage because the performer is
almost always the most central and largest figure in the frame. It degrades
gracefully when the performer moves to an edge — the crop follows them rather
than locking to the frame centre.

### EMA Crop Smoothing

Crop positions are smoothed with an exponential moving average applied to
normalised (0–1) coordinates:

```
new_cx = α × raw_cx + (1 − α) × prev_cx
```

- **α = 1.0** — no smoothing; the crop jumps instantly to the detected centre
  each frame.
- **α = 0.1** (default) — 90% inertia; the crop moves slowly and steadily.
  Sudden detection jitter is absorbed.
- **α = 0.0** — crop locked to the first detected position, never updates.

Lower α values produce steadier crops at the cost of lag when the performer
makes large, fast movements. For typical pole dance content (controlled
acrobatics rather than rapid lateral dashes) α = 0.05–0.15 tends to feel
natural.

Coordinates are tracked in normalised space so the smoothing behaviour is
independent of input resolution.

### Crop Window Computation

The crop window must maintain the target aspect ratio and be as large as
possible within the frame (to maximise resolution), centred on the smoothed
subject position.

```
if frame_w / frame_h ≤ target_w / target_h:
    # frame is relatively portrait → width-constrained
    crop_w = frame_w
    crop_h = crop_w / (target_w / target_h)
else:
    # frame is relatively landscape → height-constrained
    crop_h = frame_h
    crop_w = crop_h × (target_w / target_h)
```

The rectangle is then translated so its centre is at the smoothed subject
position, then clamped to frame boundaries. The clamp can cause the subject
to appear slightly off-centre near frame edges, but it avoids blank padding
in the output.

```
Portrait 9:16 crop from 1920×1080 landscape input:
  crop_h = 1080, crop_w = 1080 × (9/16) = 607.5 ≈ 608
  Subject at x=960, y=540 (frame centre):
    x = 960 − 304 = 656, y = 0
  Clamped: x ∈ [0, 1312], y ∈ [0, 0]   → x=656, y=0 (no clamp needed)
```

### Background Blur

Each non-primary bounding box is blurred independently using OpenCV's
`GaussianBlur`. The blur operates on the full frame (before the crop) so
that background people near the crop edge are also blurred correctly.

```python
for box in all_boxes:
    if box is primary:
        continue
    roi = result[box.y1:box.y2, box.x1:box.x2]
    result[box.y1:box.y2, box.x1:box.x2] = cv2.GaussianBlur(roi, (k, k), 0)
```

The kernel size `k` is enforced to be odd (adjusted +1 if even). Larger
values produce a heavier blur but are slower; the default of 51 makes
recognisable faces unreadable while still processing in reasonable time on
CPU.

---

## Data Flow

```
User runs:
  python reframer.py --input "clips/*.mp4" --output-dir out/ --smooth 0.08

    │
    ├─ resolve_inputs()   → [clip1.mp4, clip2.mp4, ...]
    │
    └─ for each video:
         │
         ├─ probe_video()         → {width, height, fps}
         │
         ├─ tempfile.mkdtemp()    → /tmp/reframer_xyz/
         │     ├── raw/           (extracted frames)
         │     └── proc/          (processed frames)
         │
         ├─ extract_frames()      → /tmp/reframer_xyz/raw/000001.jpg ...
         │
         ├─ CropState(cx=0.5, cy=0.5)
         │
         ├─ for each frame:
         │     ├─ cv2.imread()
         │     ├─ YOLO(frame)              → [BBox, BBox, ...]
         │     ├─ pick_primary()           → BBox (or None)
         │     ├─ update_ema()             → CropState mutated
         │     ├─ apply_blur_regions()     → frame (copy with blurs)
         │     ├─ compute_crop_window()    → (x, y, w, h)
         │     └─ cv2.imwrite()            → /tmp/reframer_xyz/proc/000001.jpg
         │
         ├─ assemble_video()      → out/clip1_reframed.mp4
         │
         └─ tempfile cleanup (auto)
```

---

## Module Reference

All code lives in `pole_dance_reframer/reframer.py`. Functions are grouped
by concern:

### Data types

| Type | Fields | Purpose |
|---|---|---|
| `BBox` | `x1 y1 x2 y2` | Single detection bounding box; properties `cx cy area` derived |
| `CropState` | `cx cy initialized` | Mutable EMA state; coordinates normalised to [0, 1] |

### FFmpeg layer

| Function | Signature | Description |
|---|---|---|
| `probe_video` | `(path) → dict` | ffprobe → width, height, fps |
| `extract_frames` | `(video, out_dir) → int` | Extract all frames; return count |
| `assemble_video` | `(frame_dir, source, output, fps)` | Combine frames + audio |

### Detection layer

| Function | Signature | Description |
|---|---|---|
| `detect_persons` | `(frame, model, device) → list[BBox]` | YOLOv8n inference, class 0 only |
| `pick_primary` | `(boxes, fw, fh) → BBox\|None` | Select subject by centre-proximity |

### Crop layer

| Function | Signature | Description |
|---|---|---|
| `parse_aspect` | `(str) → (int, int)` | "9:16" → (9, 16) |
| `compute_crop_window` | `(cx, cy, aw, ah, fw, fh) → (x,y,w,h)` | Aspect-fitted, clamped rect |
| `update_ema` | `(state, nx, ny, alpha)` | In-place EMA update |

### Blur layer

| Function | Signature | Description |
|---|---|---|
| `apply_blur_regions` | `(frame, primary, boxes, kernel) → ndarray` | GaussianBlur non-primary boxes |

### Orchestration

| Function | Description |
|---|---|
| `process_frame` | Full per-frame pipeline: detect → smooth → blur → crop → save |
| `process_file` | Full per-file pipeline with temp dir, progress output, error handling |
| `resolve_inputs` | Glob expand + video extension filter |
| `main` | Arg validation, model load, batch loop, result summary |

---

## CLI Reference

```
python pole_dance_reframer/reframer.py [options]
```

| Flag | Type | Default | Description |
|---|---|---|---|
| `--input` | str | *(required)* | Path or glob pattern to input video(s) |
| `--output-dir` | str | *(required)* | Directory for output files |
| `--aspect` | str | `9:16` | Output crop aspect ratio as `W:H` |
| `--smooth` | float | `0.1` | EMA alpha (0 = locked, 1 = no smoothing) |
| `--blur-strength` | int | `51` | Gaussian kernel size (odd; +1 if even given) |
| `--device` | str | `cpu` | Inference device: `cpu` or `cuda` |
| `--keep-frames` | flag | off | Copy temp frames to output dir for debugging |

Output filenames follow the pattern `{original_stem}_reframed{ext}`.

### Examples

```bash
# Single file, defaults
python pole_dance_reframer/reframer.py \
  --input session.mp4 --output-dir out/

# Batch, CUDA, tighter smoothing (slower crop response, very stable)
python pole_dance_reframer/reframer.py \
  --input "recordings/*.mp4" --output-dir out/ \
  --device cuda --smooth 0.05

# Square crop (1:1) with heavy blur and debug frames kept
python pole_dance_reframer/reframer.py \
  --input session.mp4 --output-dir out/ \
  --aspect 1:1 --blur-strength 99 --keep-frames
```

---

## Dependencies

```
ultralytics>=8.0.0    # YOLOv8n weights + inference runtime
opencv-python>=4.8.0  # Frame I/O, GaussianBlur, imwrite
numpy>=1.24.0         # Array operations (transitive; pinned for stability)
ffmpeg                # On PATH — frame extraction and video assembly
```

Install Python deps:
```bash
pip install -r pole_dance_reframer/requirements.txt
```

FFmpeg must be installed separately and available on `PATH`. On most Linux
distros: `apt install ffmpeg`. On macOS: `brew install ffmpeg`.

YOLOv8n weights (`yolov8n.pt`, ~6 MB) are downloaded on first run from the
ultralytics CDN and cached in `~/.cache/ultralytics/` (or the platform
equivalent). Subsequent runs are offline.

---

## Known Limitations

**Detection accuracy near frame edges.** YOLOv8n is a small model optimised
for speed. Detections become less reliable when the performer is partially
out of frame, heavily occluded, or shot from an unusual angle (overhead, low
angle). In these cases the tool holds the last known position rather than
guessing.

**Lag on fast movements.** EMA smoothing introduces a lag proportional to
`1 / alpha`. At α = 0.1 and 30 fps, the crop centre takes ~3–4 seconds to
fully follow a large jump. Increasing alpha (e.g. 0.3) reduces lag but
makes the crop more jittery. The right value depends on the footage style.

**No temporal occlusion handling.** If the primary subject is briefly
occluded by a bystander who becomes the largest/most-central person, the
wrong person may be selected as primary for those frames. Adding motion
prediction (e.g. Kalman filter) or re-identification across frames would
improve this but is outside the current scope.

**Crop is always maximally large.** The crop window fills the frame in one
dimension. There is no zoom control; you get exactly as much resolution as
the aspect ratio allows. Adding a `--zoom` factor to shrink the crop (and
pad with blur or solid colour) would let the subject have more headroom.

**Single person assumption.** The tool is designed for footage where one
person is the clear primary subject. Duet or ensemble pole work (multiple
performers equally central) will produce unpredictable subject selection.

**CPU speed.** On CPU, YOLOv8n typically processes 5–15 fps depending on
resolution. A 1-minute 1080p clip takes roughly 5–15 minutes to process.
Use `--device cuda` if a GPU is available for a 10–20× speedup.
