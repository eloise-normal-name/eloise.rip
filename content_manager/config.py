from __future__ import annotations

import os
import re
import subprocess
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class AppConfig:
    repo_root: Path
    secret_key: str
    upload_dir: Path
    voice_dir: Path
    images_dir: Path
    video_dir: Path
    articles_dir: Path
    output_format: str
    clip_id_pattern: re.Pattern[str]
    auto_commit: bool
    git_remote: str
    git_branch: str
    openai_api_key: str
    openai_model: str
    geocoder_user_agent: str
    max_upload_mb: int
    max_dimension: int
    crf_avif: int
    crf_hevc: int
    hevc_preset: str
    hevc_audio_bitrate: str
    poster_time: str


def load_config() -> AppConfig:
    repo_root = Path(subprocess.run(
        ["git", "rev-parse", "--show-toplevel"],
        capture_output=True, text=True, check=True,
    ).stdout.strip())

    config = AppConfig(
        repo_root=repo_root,
        secret_key=os.getenv("SECRET_KEY", "dev-only-change-me"),
        upload_dir=repo_root / os.getenv("UPLOAD_DIR", "media-source"),
        voice_dir=repo_root / os.getenv("OUTPUT_DIR", "content/media/voice"),
        images_dir=repo_root / "content" / "media" / "images",
        video_dir=repo_root / "content" / "media" / "video",
        articles_dir=repo_root / "content" / "articles",
        output_format="m4a",
        clip_id_pattern=re.compile(r"(\d{2}-\d{2})"),
        auto_commit=os.getenv("AUTO_COMMIT", "false").lower() == "true",
        git_remote=os.getenv("GIT_REMOTE", "origin"),
        git_branch=os.getenv("GIT_BRANCH", "main"),
        openai_api_key=os.getenv("OPENAI_API_KEY", "").strip(),
        openai_model=os.getenv("OPENAI_MODEL", "gpt-4.1-mini").strip(),
        geocoder_user_agent=os.getenv("GEOCODER_USER_AGENT", "eloise-rip-content-manager/1.0"),
        max_upload_mb=int(os.getenv("MAX_UPLOAD_MB", "200")),
        max_dimension=1080,
        crf_avif=32,
        crf_hevc=28,
        hevc_preset="slow",
        hevc_audio_bitrate="160k",
        poster_time="0.5",
    )

    for directory in (
        config.upload_dir,
        config.voice_dir,
        config.images_dir,
        config.video_dir,
        config.articles_dir,
    ):
        directory.mkdir(parents=True, exist_ok=True)

    return config
