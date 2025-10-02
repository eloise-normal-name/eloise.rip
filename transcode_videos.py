"""Transcode high-quality source videos and images in media-source/ into optimized
web versions for Pelican static site.

For videos: Creates MP4 + WebM + poster JPG
For images: Creates WebP + JPEG + AVIF (if supported)

Usage:
    python transcode_videos.py                     # default run
    python transcode_videos.py --force             # re-encode even if outputs exist
    python transcode_videos.py --src media-source --dest content/media --max-dimension 640

Requirements:
    - Python 3.8+
    - ffmpeg & ffprobe available on PATH

Strategy:
    1. Discover video and image files in source directory.
    2. For videos: create name.mp4, name.webm, name.jpg (poster @ 0.5s)
    3. For images: create name.webp, name.jpg, name.avif (if encoder available)
    4. Downscale if either dimension exceeds --max-dimension while preserving aspect ratio.
    5. Skip already existing outputs unless --force.

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
from pathlib import Path
from typing import List

VIDEO_EXT = {".mp4", ".mov", ".mkv", ".avi", ".webm", ".m4v", ".gif"}
IMAGE_EXT = {".jpg", ".jpeg", ".png", ".bmp", ".tiff", ".tif", ".webp", ".heic", ".heif"}
ALLOWED_EXT = VIDEO_EXT | IMAGE_EXT

def which_or_exit(cmd: str) -> None:
    if shutil.which(cmd) is None:
        print(f"[ERROR] Required tool '{cmd}' not found in PATH.", file=sys.stderr)
        sys.exit(1)


def run_ffmpeg(args: List[str]) -> subprocess.CompletedProcess:
    return subprocess.run(args, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)


def build_scale_filter(max_dimension: int) -> str:
    # Scale down if either width or height exceeds max_dimension, preserving aspect ratio
    return f"scale='if(gt(iw,ih),min({max_dimension},iw),-2)':'if(gt(ih,iw),min({max_dimension},ih),-2)'"


def is_video_file(file_path: Path) -> bool:
    return file_path.suffix.lower() in VIDEO_EXT


def is_image_file(file_path: Path) -> bool:
    return file_path.suffix.lower() in IMAGE_EXT


def transcode_image(cfg, src_file: Path) -> None:
    """Process image files into web-optimized formats."""
    name = src_file.stem
    webp_out = cfg.dest / f"{name}.webp"
    jpg_out = cfg.dest / f"{name}.jpg"
    avif_out = cfg.dest / f"{name}.avif"

    # Check if all outputs exist
    if not cfg.force and webp_out.exists() and jpg_out.exists():
        if not cfg.quiet:
            print(f"[SKIP] {src_file.name} (image outputs exist)")
        return

    vf_chain = build_scale_filter(cfg.max_dimension)

    # WebP (modern format with good compression)
    if cfg.force or not webp_out.exists():
        print(f"  -> WebP: {webp_out.name}")
        webp_cmd = [
            "ffmpeg", "-y", "-i", str(src_file),
            "-vf", vf_chain,
            "-c:v", "libwebp", "-quality", "85", "-preset", "photo",
            str(webp_out)
        ]
        proc = run_ffmpeg(webp_cmd)
        if proc.returncode != 0:
            print(f"[WARN] WebP encode failed for {src_file.name}: {proc.stderr.splitlines()[-1] if proc.stderr.splitlines() else 'Unknown error'}")

    # JPEG (universal fallback)
    if cfg.force or not jpg_out.exists():
        print(f"  -> JPEG: {jpg_out.name}")
        jpg_cmd = [
            "ffmpeg", "-y", "-i", str(src_file),
            "-vf", vf_chain,
            "-c:v", "mjpeg", "-q:v", "3",
            str(jpg_out)
        ]
        proc = run_ffmpeg(jpg_cmd)
        if proc.returncode != 0:
            print(f"[WARN] JPEG encode failed for {src_file.name}: {proc.stderr.splitlines()[-1] if proc.stderr.splitlines() else 'Unknown error'}")

    # AVIF (next-gen format, if available)
    if cfg.force or not avif_out.exists():
        print(f"  -> AVIF: {avif_out.name}")
        avif_cmd = [
            "ffmpeg", "-y", "-i", str(src_file),
            "-vf", vf_chain,
            "-c:v", "libaom-av1", "-crf", "32", "-b:v", "0",
            str(avif_out)
        ]
        proc = run_ffmpeg(avif_cmd)
        if proc.returncode != 0:
            print(f"[INFO] AVIF encode failed for {src_file.name} (encoder may not be available)")


def transcode_video(cfg, src_file: Path) -> None:
    """Process video files into web-optimized formats."""
    name = src_file.stem
    mp4_out = cfg.dest / f"{name}.mp4"
    webm_out = cfg.dest / f"{name}.webm"
    poster_out = cfg.dest / f"{name}.jpg"

    if not cfg.force and mp4_out.exists() and webm_out.exists() and poster_out.exists():
        if not cfg.quiet:
            print(f"[SKIP] {src_file.name} (video outputs exist)")
        return

    vf_chain = build_scale_filter(cfg.max_dimension)

    # MP4 (H.264)
    if cfg.force or not mp4_out.exists():
        print(f"  -> MP4: {mp4_out.name}")
        mp4_cmd = [
            "ffmpeg", "-y", "-i", str(src_file),
            "-vf", f"{vf_chain}",
            "-c:v", "libx264", "-preset", "veryfast",
            "-crf", str(cfg.crf_mp4),
            "-pix_fmt", "yuv420p", "-movflags", "+faststart",
            "-c:a", "aac", "-b:a", "128k", str(mp4_out)
        ]
        proc = run_ffmpeg(mp4_cmd)
        if proc.returncode != 0:
            print(f"[WARN] MP4 encode failed for {src_file.name}: {proc.stderr.splitlines()[-1] if proc.stderr.splitlines() else 'Unknown error'}")

    # WebM (VP9)
    if cfg.force or not webm_out.exists():
        print(f"  -> WebM: {webm_out.name}")
        webm_cmd = [
            "ffmpeg", "-y", "-i", str(src_file),
            "-vf", f"{vf_chain}",
            "-c:v", "libvpx-vp9", "-b:v", "0", "-crf", str(cfg.crf_webm),
            "-row-mt", "1", "-c:a", "libopus", "-b:a", "96k", str(webm_out)
        ]
        proc = run_ffmpeg(webm_cmd)
        if proc.returncode != 0:
            print(f"[WARN] WebM encode failed for {src_file.name}: {proc.stderr.splitlines()[-1] if proc.stderr.splitlines() else 'Unknown error'}")

    # Poster frame
    if cfg.force or not poster_out.exists():
        print(f"  -> Poster: {poster_out.name}")
        poster_cmd = [
            "ffmpeg", "-y", "-i", str(src_file), "-ss", str(cfg.poster_time),
            "-vframes", "1", "-vf", vf_chain, str(poster_out)
        ]
        proc = run_ffmpeg(poster_cmd)
        if proc.returncode != 0:
            print(f"[WARN] Poster extraction failed for {src_file.name}: {proc.stderr.splitlines()[-1] if proc.stderr.splitlines() else 'Unknown error'}")


def transcode_file(cfg, src_file: Path) -> None:
    """Main function to process either video or image files."""
    if is_video_file(src_file):
        transcode_video(cfg, src_file)
    elif is_image_file(src_file):
        transcode_image(cfg, src_file)
    else:
        print(f"[WARN] Unknown file type: {src_file.name}")
        return

    print(f"  -> Done: {src_file.name}")


def discover_sources(src_dir: Path) -> List[Path]:
    files = []
    for p in sorted(src_dir.iterdir()):
        if p.is_file() and p.suffix.lower() in ALLOWED_EXT:
            files.append(p)
    return files


def parse_args():
    ap = argparse.ArgumentParser(description="Pelican media transcoder (videos and images)")
    ap.add_argument("--src", default="media-source", help="Source directory of master videos and images")
    ap.add_argument("--dest", default="content/media", help="Destination directory for optimized outputs")
    ap.add_argument("--max-dimension", type=int, default=1080, help="Max output dimension (width or height, preserve aspect)")
    ap.add_argument("--crf-mp4", type=int, default=28, help="CRF for H.264 (lower=better quality)")
    ap.add_argument("--crf-webm", type=int, default=34, help="CRF for VP9 (lower=better quality)")
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
        except Exception as e:  # noqa: BLE001
            print(f"[ERROR] Unexpected failure on {src_file.name}: {e}")

    print("=============================================================")
    print("Complete. Embed examples:")
    print("Videos:")
    print('<video controls preload="metadata" poster="{{ SITEURL }}/media/name.jpg">')
    print('  <source src="{{ SITEURL }}/media/name.webm" type="video/webm">')
    print('  <source src="{{ SITEURL }}/media/name.mp4" type="video/mp4">')
    print('</video>')
    print()
    print("Images (responsive with modern formats):")
    print('<picture>')
    print('  <source srcset="{{ SITEURL }}/media/name.avif" type="image/avif">')
    print('  <source srcset="{{ SITEURL }}/media/name.webp" type="image/webp">')
    print('  <img src="{{ SITEURL }}/media/name.jpg" alt="Description">')
    print('</picture>')
    print("=============================================================")
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
