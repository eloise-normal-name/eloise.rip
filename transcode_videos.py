"""Transcode high-quality source videos and images in media-source/ into optimized
web versions for Pelican static site.

For videos: Creates MP4 (HEVC) + poster JPG
For images: Creates AVIF + WebP + JPEG (+ PNG when transparency is detected)
For audio: Creates AAC M4A

Usage:
    python transcode_videos.py                     # default run
    python transcode_videos.py --force             # re-encode even if outputs exist
    python transcode_videos.py --src media-source --dest content/media --max-dimension 640

Requirements:
    - Python 3.8+
    - ffmpeg & ffprobe available on PATH
    - Pillow + pillow-heif for HEIC source conversion

Strategy:
    1. Discover video and image files in source directory.
    2. For videos: create name.mp4 (HEVC) and name.jpg (poster @ 0.5s)
    3. For images: create name.avif, name.webp, name.jpg (and name.png when transparency is detected)
    4. For audio: create name.m4a inside media/voice
    5. Downscale if either dimension exceeds --max-dimension while preserving aspect ratio.
    6. Skip already existing outputs unless --force.

Exit codes:
    0 = success (even if no files processed)
    1 = ffmpeg missing
    2 = unexpected error
"""
from __future__ import annotations

import argparse
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path
from PIL import Image  # type: ignore
import pillow_heif  # type: ignore

pillow_heif.register_heif_opener()  # pragma: no cover - registration has no return


# --- File Extensions ---
VIDEO_EXT = {".mp4", ".mov", ".mkv", ".avi", ".webm", ".m4v", ".gif"}
HEIC_EXT = {".heic", ".heif"}
IMAGE_EXT = {".jpg", ".jpeg", ".png", ".bmp", ".tiff", ".tif", ".webp"} | HEIC_EXT
AUDIO_EXT = {".wav", ".flac", ".m4a", ".mp3", ".ogg", ".mta", ".qta"}
ALLOWED_EXT = VIDEO_EXT | IMAGE_EXT | AUDIO_EXT

HQ_SUFFIX = "_hq"
HQ_CRF_BONUS = 8  # Lower CRF by this amount (higher quality) for `_hq` masters
HEVC_PRESET = "slow"  # Balance of speed/quality for libx265
HEVC_AUDIO_BITRATE = "160k"
AUDIO_BITRATE = "128k"


# --- Utility Functions ---
def which_or_exit(cmd: str) -> None:
    """Exit if required command is not found."""
    if shutil.which(cmd) is None:
        print(f"[ERROR] Required tool '{cmd}' not found in PATH.", file=sys.stderr)
        sys.exit(1)

def run_ffmpeg(args: list[str]) -> subprocess.CompletedProcess:
    """Run ffmpeg with given arguments."""
    return subprocess.run(args, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)


def run_ffprobe(args: list[str]) -> subprocess.CompletedProcess:
    """Run ffprobe with given arguments."""
    return subprocess.run(args, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)

def build_scale_filter(max_dimension: int) -> str:
    """Return ffmpeg scale filter string for max dimension."""
    return f"scale='if(gt(iw,ih),min({max_dimension},iw),-2)':'if(gt(ih,iw),min({max_dimension},ih),-2)'"

def is_video_file(file_path: Path) -> bool:
    return file_path.suffix.lower() in VIDEO_EXT

def is_image_file(file_path: Path) -> bool:
    return file_path.suffix.lower() in IMAGE_EXT


def is_audio_file(file_path: Path) -> bool:
    return file_path.suffix.lower() in AUDIO_EXT


def is_high_quality_variant(file_path: Path) -> bool:
    """Return True if filename stem ends with the configured HQ suffix."""
    return file_path.stem.lower().endswith(HQ_SUFFIX)


def needs_heic_conversion(src_file: Path) -> bool:
    return src_file.suffix.lower() in HEIC_EXT


def prepare_image_source(src_file: Path) -> tuple[Path, Path | None, bool]:
    """Return an ffmpeg-ready path, temp dir (if any), and a success flag."""
    if not needs_heic_conversion(src_file):
        return src_file, None, True

    tmp_dir = Path(tempfile.mkdtemp(prefix="heic-convert-"))
    tmp_png = tmp_dir / f"{src_file.stem}.png"
    try:
        with Image.open(src_file) as img:  # type: ignore[operator]
            img.save(tmp_png, format="PNG")
    except Exception as exc:  # pragma: no cover - depends on environment
        print(f"[WARN] Failed to convert HEIC source {src_file.name}: {exc}")
        shutil.rmtree(tmp_dir, ignore_errors=True)
        return src_file, None, False

    return tmp_png, tmp_dir, True


def image_has_alpha(src_file: Path) -> bool:
    """Return True if the primary stream reports an alpha channel."""
    probe_cmd = [
        "ffprobe", "-v", "error",
        "-select_streams", "v:0",
        "-show_entries", "stream=pix_fmt",
        "-of", "default=noprint_wrappers=1:nokey=1",
        str(src_file),
    ]
    proc = run_ffprobe(probe_cmd)
    if proc.returncode != 0:
        return False
    pix_fmt = proc.stdout.strip().lower()
    return "a" in pix_fmt


def transcode_image(cfg, src_file: Path) -> None:
    """Process image files into web-optimized formats."""

    name = src_file.stem
    original_suffix = src_file.suffix.lower()
    images_dir = cfg.dest / 'images'
    images_dir.mkdir(parents=True, exist_ok=True)
    vf_chain = build_scale_filter(cfg.max_dimension)

    input_path, tmp_dir, can_process = prepare_image_source(src_file)

    if not can_process:
        print(f"[SKIP] {src_file.name} (HEIC conversion unavailable)")
        return

    avif_out = images_dir / f"{name}.avif"
    avif_cmd = [
        "ffmpeg", "-y", "-i", str(input_path),
        "-vf", vf_chain,
        "-c:v", "libaom-av1", "-crf", "32", "-b:v", "0",
        str(avif_out)
    ]

    webp_out = images_dir / f"{name}.webp"
    webp_cmd = [
        "ffmpeg", "-y", "-i", str(input_path),
        "-vf", vf_chain,
        "-c:v", "libwebp", "-quality", "82", "-lossless", "0",
        str(webp_out)
    ]

    jpg_out = images_dir / f"{name}.jpg"
    jpg_cmd = [
        "ffmpeg", "-y", "-i", str(input_path),
        "-vf", vf_chain,
        "-c:v", "mjpeg", "-q:v", "3",
        str(jpg_out)
    ]

    needs_png = original_suffix in {".png", ".webp"} or image_has_alpha(input_path)
    png_out = images_dir / f"{name}.png"
    png_cmd = [
        "ffmpeg", "-y", "-i", str(input_path),
        "-vf", vf_chain,
        "-c:v", "png",
        str(png_out)
    ]

    encodes = [
        ("AVIF", avif_out, avif_cmd, True),
        ("WEBP", webp_out, webp_cmd, True),
        ("JPEG", jpg_out, jpg_cmd, False),
    ]

    if needs_png:
        encodes.append(("PNG", png_out, png_cmd, False))

    produced_any = False

    for label, out_path, cmd, optional in encodes:
        if not cfg.force and out_path.exists():
            if not cfg.quiet:
                print(f"[SKIP] {src_file.name} ({label} already encoded)")
            produced_any = True
            continue

        proc = run_ffmpeg(cmd)
        if proc.returncode == 0:
            print(f"  [IMAGE] {label}: images/{out_path.name}")
            produced_any = True
            continue

        error_detail = proc.stderr.splitlines()[-1] if proc.stderr.splitlines() else "Unknown error"
        level = "[INFO]" if optional else "[WARN]"
        print(f"{level} {label} encode failed for {src_file.name}: {error_detail}")

    if not produced_any:
        print(f"[WARN] All image encodes failed for {src_file.name}")

    if tmp_dir is not None:
        shutil.rmtree(tmp_dir, ignore_errors=True)


def transcode_audio(cfg, src_file: Path) -> None:
    """Process audio files into M4A outputs suitable for web playback."""
    name = src_file.stem
    audio_dir = cfg.dest / 'voice'
    audio_dir.mkdir(parents=True, exist_ok=True)
    m4a_out = audio_dir / f"{name}.m4a"

    if not cfg.force and m4a_out.exists():
        if not cfg.quiet:
            print(f"[SKIP] {src_file.name} (audio output exists)")
        return

    print(f"  [AUDIO] M4A: voice/{m4a_out.name}")
    audio_cmd = [
        "ffmpeg", "-y", "-i", str(src_file),
        "-vn",
        "-c:a", "aac", "-b:a", AUDIO_BITRATE,
        str(m4a_out)
    ]
    proc = run_ffmpeg(audio_cmd)
    if proc.returncode != 0:
        print(f"[WARN] Audio encode failed for {src_file.name}: {proc.stderr.splitlines()[-1] if proc.stderr.splitlines() else 'Unknown error'}")


def transcode_video(cfg, src_file: Path) -> None:
    """Process video files into HEVC MP4 plus a poster still."""
    name = src_file.stem
    video_dir = cfg.dest / 'video'
    video_dir.mkdir(parents=True, exist_ok=True)
    vf_chain = build_scale_filter(cfg.max_dimension)
    is_hq = is_high_quality_variant(src_file)
    crf_hevc = max(cfg.crf_hevc - (HQ_CRF_BONUS if is_hq else 0), 0)
    quality_tag = " (HQ)" if is_hq else ""
    hevc_out = video_dir / f"{name}.mp4"
    poster_out = video_dir / f"{name}.jpg"

    if not cfg.force and hevc_out.exists() and poster_out.exists():
        if not cfg.quiet:
            print(f"[SKIP] {src_file.name} (video outputs exist)")
        return

    if cfg.force or not hevc_out.exists():
        print(f"  [VIDEO] HEVC{quality_tag}: video/{hevc_out.name}")
        hevc_cmd = [
            "ffmpeg", "-y", "-i", str(src_file),
            "-vf", vf_chain,
            "-c:v", "libx265", "-preset", HEVC_PRESET, "-crf", str(crf_hevc),
            "-pix_fmt", "yuv420p", "-tag:v", "hvc1", "-movflags", "+faststart",
            "-c:a", "aac", "-b:a", HEVC_AUDIO_BITRATE,
            str(hevc_out)
        ]
        proc = run_ffmpeg(hevc_cmd)
        if proc.returncode != 0:
            print(f"[WARN] HEVC encode failed for {src_file.name}: {proc.stderr.splitlines()[-1] if proc.stderr.splitlines() else 'Unknown error'}")

    if cfg.force or not poster_out.exists():
        print(f"  [VIDEO] Poster: video/{poster_out.name}")
        poster_cmd = [
            "ffmpeg", "-y", "-i", str(src_file), "-ss", str(cfg.poster_time),
            "-vframes", "1", "-vf", vf_chain, str(poster_out)
        ]
        proc = run_ffmpeg(poster_cmd)
        if proc.returncode != 0:
            print(f"[WARN] Poster extraction failed for {src_file.name}: {proc.stderr.splitlines()[-1] if proc.stderr.splitlines() else 'Unknown error'}")


def transcode_file(cfg, src_file: Path) -> None:
    """Process a single media file (video, image, or audio)."""
    if is_video_file(src_file):
        transcode_video(cfg, src_file)
    elif is_image_file(src_file):
        transcode_image(cfg, src_file)
    elif is_audio_file(src_file):
        transcode_audio(cfg, src_file)
    else:
        print(f"[WARN] Unknown file type: {src_file.name}")
        return
    print(f"  [DONE] {src_file.name}")


def discover_sources(src_dir: Path) -> list[Path]:
    return [p for p in sorted(src_dir.iterdir()) if p.is_file() and p.suffix.lower() in ALLOWED_EXT]


def parse_args():
    ap = argparse.ArgumentParser(description="Pelican media transcoder (HEVC video and optimized images)")
    ap.add_argument("--src", default="media-source", help="Source directory of master videos and images")
    ap.add_argument("--dest", default="content/media", help="Destination directory for optimized outputs")
    ap.add_argument("--max-dimension", type=int, default=1080, help="Max output dimension (width or height, preserve aspect)")
    ap.add_argument("--crf-hevc", type=int, default=28, help="CRF for HEVC (lower=better quality)")
    ap.add_argument("--poster-time", type=float, default=0.5, help="Timestamp (seconds) for poster frame")
    ap.add_argument("--force", action="store_true", help="Re-encode even if outputs exist")
    ap.add_argument("--quiet", action="store_true", help="Reduce console output")
    args = ap.parse_args()

    # Normalize path-like args now for convenience
    args.src = Path(args.src)
    args.dest = Path(args.dest)
    return args


def main() -> int:
    cfg = parse_args()
    which_or_exit("ffmpeg")
    which_or_exit("ffprobe")

    # Ensure source and destination directories exist
    if not cfg.src.exists():
        print(f"[INFO] Source directory '{cfg.src}' does not exist. Creating it.")
        cfg.src.mkdir(parents=True, exist_ok=True)
        print("Drop master/source videos and images there and re-run.")
        return 0
    cfg.dest.mkdir(parents=True, exist_ok=True)

    sources = discover_sources(cfg.src)
    if not sources:
        print(f"[INFO] No source media in {cfg.src} (allowed: {', '.join(sorted(ALLOWED_EXT))})")
        return 0

    print("=============================================================")
    print(f"Processing {len(sources)} media file(s) from {cfg.src} -> {cfg.dest}")
    print("=============================================================")

    for src_file in sources:
        print(f"[PROCESS] {src_file.name}")
        try:
            transcode_file(cfg, src_file)
        except KeyboardInterrupt:
            print("[ABORT] Interrupted by user.")
            return 2
        except Exception as e:
            print(f"[ERROR] Unexpected failure on {src_file.name}: {e}")

    print("=============================================================")
    print("Complete.")
    print("=============================================================")
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
