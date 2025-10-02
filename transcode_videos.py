"""Transcode high-quality source videos in media-source/ into optimized
web versions (MP4 + WebM + poster JPG) for Pelican static site.

Usage:
    python transcode_videos.py                     # default run
    python transcode_videos.py --force             # re-encode even if outputs exist
    python transcode_videos.py --src media-source --dest content/videos --max-dimension 640

Requirements:
    - Python 3.8+
    - ffmpeg & ffprobe available on PATH

Strategy:
    1. Discover files in source directory with allowed extensions.
    2. For each file create: name.mp4, name.webm, name.jpg (poster @ 0.5s)
    3. Downscale if wider than --max-width while preserving aspect ratio.
    4. Skip already existing triplets unless --force.

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

ALLOWED_EXT = {".mp4", ".mov", ".mkv", ".avi", ".webm", ".m4v", ".gif"}

def which_or_exit(cmd: str) -> None:
    if shutil.which(cmd) is None:
        print(f"[ERROR] Required tool '{cmd}' not found in PATH.", file=sys.stderr)
        sys.exit(1)


def run_ffmpeg(args: List[str]) -> subprocess.CompletedProcess:
    return subprocess.run(args, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)


def build_scale_filter(max_dimension: int) -> str:
    # Scale down if either width or height exceeds max_dimension, preserving aspect ratio
    return f"scale='if(gt(iw,ih),min({max_dimension},iw),-2)':'if(gt(ih,iw),min({max_dimension},ih),-2)'"


def transcode_file(cfg, src_file: Path) -> None:
    name = src_file.stem
    mp4_out = cfg.dest / f"{name}.mp4"
    webm_out = cfg.dest / f"{name}.webm"
    poster_out = cfg.dest / f"{name}.jpg"

    if not cfg.force and mp4_out.exists() and webm_out.exists() and poster_out.exists():
        if not cfg.quiet:
            print(f"[SKIP] {src_file.name} (all outputs exist)")
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
            print(f"[WARN] MP4 encode failed for {src_file.name}: {proc.stderr.splitlines()[-1]}")

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
            print(f"[WARN] WebM encode failed for {src_file.name}: {proc.stderr.splitlines()[-1]}")

    # Poster frame
    if cfg.force or not poster_out.exists():
        print(f"  -> Poster: {poster_out.name}")
        poster_cmd = [
            "ffmpeg", "-y", "-i", str(src_file), "-ss", str(cfg.poster_time),
            "-vframes", "1", "-vf", vf_chain, str(poster_out)
        ]
        proc = run_ffmpeg(poster_cmd)
        if proc.returncode != 0:
            print(f"[WARN] Poster extraction failed for {src_file.name}: {proc.stderr.splitlines()[-1]}")

    print(f"  -> Done: {src_file.name}")


def discover_sources(src_dir: Path) -> List[Path]:
    files = []
    for p in sorted(src_dir.iterdir()):
        if p.is_file() and p.suffix.lower() in ALLOWED_EXT:
            files.append(p)
    return files


def parse_args():
    ap = argparse.ArgumentParser(description="Pelican video transcoder (Python version)")
    ap.add_argument("--src", default="media-source", help="Source directory of master videos")
    ap.add_argument("--dest", default="content/videos", help="Destination directory for optimized outputs")
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
        print("Drop master/source videos there and re-run.")
        return 0

    cfg.dest.mkdir(parents=True, exist_ok=True)

    sources = discover_sources(cfg.src)
    if not sources:
        print(f"[INFO] No source videos in {cfg.src} (allowed: {', '.join(sorted(ALLOWED_EXT))})")
        return 0

    print("=============================================================")
    print(f"Transcoding {len(sources)} file(s) from {cfg.src} -> {cfg.dest}")
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
    print("Complete. Embed with e.g.:")
    print("<video controls preload=\"metadata\" poster=\"{{ SITEURL }}/videos/name.jpg\">\n"
          "  <source src=\"{{ SITEURL }}/videos/name.webm\" type=\"video/webm\">\n"
          "  <source src=\"{{ SITEURL }}/videos/name.mp4\" type=\"video/mp4\">\n"
          "</video>")
    print("=============================================================")
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
