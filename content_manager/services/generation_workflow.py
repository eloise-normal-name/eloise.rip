from __future__ import annotations

import json
import re
import subprocess
import tempfile
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Callable

from content_manager.config import AppConfig
from content_manager.services.article_generation import ArticleGenerator, GenerationRequest
from content_manager.services.location_context import find_likely_named_locations
from content_manager.services.media_metadata import extract_media_metadata, ffprobe_json
from content_manager.services.site_taxonomy import SiteTaxonomy, load_site_taxonomy, normalize_category, normalize_tags
from content_manager.state import AppState

IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".bmp", ".tiff", ".tif", ".webp", ".avif"}
MODEL_SUPPORTED_IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".gif", ".webp"}
VIDEO_EXTENSIONS = {".mp4", ".mov", ".mkv", ".avi", ".webm", ".m4v", ".gif"}
VIDEO_FRAME_SAMPLE_COUNT = 4
RELATED_ARTICLE_LIMIT = 3
ARTICLE_EXCERPT_LENGTH = 360
_KEYWORD_PATTERN = re.compile(r"[a-z0-9]{3,}")
_STOP_WORDS = {
    "this", "that", "with", "from", "have", "they", "them", "were", "what", "when", "just",
    "like", "into", "about", "there", "their", "really", "would", "could", "should", "because",
    "still", "today", "also", "then", "than", "after", "before", "around", "over", "under",
    "very", "more", "some", "much", "many", "only", "your", "mine", "ours", "been", "being",
    "make", "made", "gets", "getting", "post", "article", "draft", "content", "video", "image",
}


@dataclass(frozen=True)
class GeneratedArticleResult:
    title_ideas: list[str]
    summary: str
    category: str
    tags: list[str]
    content_markdown: str
    location: str
    captured_at: str
    likely_named_locations: list[str]
    time_of_day: str
    source_media: list[str]
    warnings: list[str]

    def to_dict(self) -> dict:
        return {
            "status": "ok",
            "title_ideas": self.title_ideas,
            "summary": self.summary,
            "category": self.category,
            "tags": self.tags,
            "content_markdown": self.content_markdown,
            "location": self.location,
            "captured_at": self.captured_at,
            "likely_named_locations": self.likely_named_locations,
            "time_of_day": self.time_of_day,
            "source_media": self.source_media,
            "warnings": self.warnings,
        }


@dataclass(frozen=True)
class RelatedArticleContext:
    path: str
    title: str
    summary: str
    category: str
    tags: list[str]
    body: str
    date: datetime | None
    excerpt: str

    def to_prompt_dict(self) -> dict:
        return {
            "path": self.path,
            "title": self.title,
            "summary": self.summary,
            "category": self.category,
            "tags": self.tags,
            "excerpt": self.excerpt,
        }


def classify_media_path(path: Path) -> str:
    ext = path.suffix.lower()
    if ext in VIDEO_EXTENSIONS:
        return "video"
    if ext in IMAGE_EXTENSIONS:
        return "image"
    raise ValueError(f"unsupported media type: {path.name}")


def ensure_model_supported_image(path: Path) -> None:
    if path.suffix.lower() in MODEL_SUPPORTED_IMAGE_EXTENSIONS:
        return
    allowed = ", ".join(sorted(MODEL_SUPPORTED_IMAGE_EXTENSIONS))
    raise ValueError(
        f"image generation inputs must be one of: {allowed}; got {path.name}"
    )


def resolve_library_media_path(config: AppConfig, raw_path: str) -> tuple[Path, Path]:
    relative = Path(raw_path)
    if relative.is_absolute():
        raise ValueError(f"media_paths must be relative to content/media: {raw_path}")

    media_root = (config.repo_root / "content" / "media").resolve()
    full_path = (media_root / relative).resolve()
    try:
        full_path.relative_to(media_root)
    except ValueError as err:
        raise ValueError(f"media_paths must stay under content/media: {raw_path}") from err
    return relative, full_path


def library_context_from_media_paths(config: AppConfig, media_paths: list[str]) -> list[dict]:
    context = []
    for raw_path in media_paths:
        relative, full_path = resolve_library_media_path(config, raw_path)
        if not full_path.exists():
            raise ValueError(f"media file not found: media/{relative.as_posix()}")
        media_type = classify_media_path(full_path)
        metadata = extract_media_metadata(
            full_path,
            media_type,
            geocoder_user_agent=config.geocoder_user_agent,
        )
        if media_type == "image":
            ensure_model_supported_image(full_path)
        context.append({
            "job_id": f"library:{relative.as_posix()}",
            "name": full_path.stem,
            "media_type": media_type,
            "input_path": str(full_path),
            **metadata,
        })
    return context


def uploaded_context_from_job_ids(state: AppState, job_ids: list[str]) -> list[dict]:
    context = []
    with state.jobs_lock:
        for job_id in job_ids:
            job = state.media_jobs.get(job_id)
            if not job:
                raise ValueError(f"unknown media job: {job_id}")
            if job["status"] != "done":
                raise ValueError(f"media job {job_id} not complete (status: {job['status']})")
            model_input_path = Path(job["input_path"]) if job["media_type"] == "image" else Path(job.get("output_path") or "")
            if not model_input_path.exists():
                raise ValueError(f"media asset unavailable for generation: {job['name']}")
            if job["media_type"] == "image":
                ensure_model_supported_image(model_input_path)
            context.append({**job, "job_id": job_id, "input_path": str(model_input_path)})
    return context


def _video_duration_seconds(input_path: Path, probe_reader: Callable[[Path], dict] | None = None) -> float:
    probe_reader = probe_reader or ffprobe_json
    try:
        probe_data = probe_reader(input_path)
    except FileNotFoundError as err:
        raise ValueError("ffprobe not found in PATH") from err
    except subprocess.CalledProcessError as err:
        raise ValueError((err.stderr or err.stdout or "ffprobe failed")[-400:]) from err
    except json.JSONDecodeError as err:
        raise ValueError("ffprobe returned invalid JSON") from err

    streams = probe_data.get("streams", []) or []
    for stream in streams:
        duration = stream.get("duration")
        if duration not in (None, ""):
            try:
                return max(float(duration), 0.0)
            except (TypeError, ValueError):
                pass

    format_duration = (probe_data.get("format") or {}).get("duration")
    if format_duration not in (None, ""):
        try:
            return max(float(format_duration), 0.0)
        except (TypeError, ValueError):
            pass

    return 0.0


def _sample_video_timestamps(duration_seconds: float, sample_count: int = VIDEO_FRAME_SAMPLE_COUNT) -> list[str]:
    if sample_count <= 0:
        return []
    if duration_seconds <= 0:
        return [f"{0.5 * (index + 1):.3f}" for index in range(sample_count)]

    step = duration_seconds / (sample_count + 1)
    timestamps = []
    for index in range(sample_count):
        moment = step * (index + 1)
        moment = min(moment, max(duration_seconds - 0.001, 0.0))
        timestamps.append(f"{moment:.3f}")
    return timestamps


def extract_video_frames(
    input_path: Path,
    output_dir: Path,
    *,
    sample_count: int = VIDEO_FRAME_SAMPLE_COUNT,
    probe_reader: Callable[[Path], dict] | None = None,
    run_ffmpeg: Callable[..., subprocess.CompletedProcess] | None = None,
) -> list[Path]:
    probe_reader = probe_reader or ffprobe_json
    run_ffmpeg = run_ffmpeg or subprocess.run
    duration_seconds = _video_duration_seconds(input_path, probe_reader=probe_reader)
    frame_paths: list[Path] = []
    for index, timestamp in enumerate(_sample_video_timestamps(duration_seconds, sample_count), start=1):
        frame_path = output_dir / f"frame-{index:02d}.jpg"
        try:
            run_ffmpeg(
                [
                    "ffmpeg",
                    "-y",
                    "-ss",
                    timestamp,
                    "-i",
                    str(input_path),
                    "-frames:v",
                    "1",
                    str(frame_path),
                ],
                capture_output=True,
                text=True,
                check=True,
            )
        except FileNotFoundError as err:
            raise ValueError("ffmpeg not found in PATH") from err
        except subprocess.CalledProcessError as err:
            raise ValueError((err.stderr or err.stdout or "ffmpeg failed")[-400:]) from err
        if frame_path.exists() and frame_path.stat().st_size > 0:
            frame_paths.append(frame_path)

    if not frame_paths:
        raise ValueError(f"could not extract sampled frames for generation: {input_path.name}")
    return sorted(frame_paths)


def prepare_media_context_for_generation(
    media_context: list[dict],
    *,
    sample_count: int = VIDEO_FRAME_SAMPLE_COUNT,
    probe_reader: Callable[[Path], dict] | None = None,
    run_ffmpeg: Callable[..., subprocess.CompletedProcess] | None = None,
) -> tuple[list[dict], tempfile.TemporaryDirectory[str] | None]:
    probe_reader = probe_reader or ffprobe_json
    run_ffmpeg = run_ffmpeg or subprocess.run
    temp_dir: tempfile.TemporaryDirectory[str] | None = None
    prepared_context: list[dict] = []
    for item in media_context:
        source_path = Path(item["input_path"])
        model_input_paths: list[Path]
        if item["media_type"] == "video":
            if temp_dir is None:
                temp_dir = tempfile.TemporaryDirectory(prefix="generation-video-frames-")
            item_output_dir = Path(temp_dir.name) / item["job_id"].replace("/", "_").replace(":", "_")
            item_output_dir.mkdir(parents=True, exist_ok=True)
            model_input_paths = extract_video_frames(
                source_path,
                item_output_dir,
                sample_count=sample_count,
                probe_reader=probe_reader,
                run_ffmpeg=run_ffmpeg,
            )
        else:
            model_input_paths = [source_path]
        prepared_context.append({**item, "model_input_paths": model_input_paths})
    return prepared_context, temp_dir


def _parse_article_text(article_path: Path) -> RelatedArticleContext | None:
    try:
        raw = article_path.read_text(encoding="utf-8", errors="ignore")
    except OSError:
        return None

    metadata: dict[str, str] = {}
    body_lines: list[str] = []
    in_header = True
    for line in raw.splitlines():
        if in_header and line.strip():
            if ":" in line:
                key, value = line.split(":", 1)
                metadata[key.strip().lower()] = value.strip()
                continue
            in_header = False
        if in_header and not line.strip():
            in_header = False
            continue
        body_lines.append(line)

    title = metadata.get("title", "").strip()
    if not title:
        return None
    summary = metadata.get("summary", "").strip()
    category = metadata.get("category", "").strip()
    tags = [item.strip() for item in metadata.get("tags", "").split(",") if item.strip()]
    body = "\n".join(body_lines).strip()
    collapsed_body = " ".join(body.split())
    excerpt = collapsed_body[:ARTICLE_EXCERPT_LENGTH].strip()
    if len(collapsed_body) > ARTICLE_EXCERPT_LENGTH:
        excerpt += "..."
    parsed_date = None
    date_value = metadata.get("date", "").strip()
    if date_value:
        try:
            parsed_date = datetime.strptime(date_value[:10], "%Y-%m-%d")
        except ValueError:
            parsed_date = None
    return RelatedArticleContext(
        path=article_path.relative_to(article_path.parents[2]).as_posix(),
        title=title,
        summary=summary,
        category=category,
        tags=tags,
        body=body,
        date=parsed_date,
        excerpt=excerpt or summary,
    )


def load_related_article_candidates(articles_dir: Path) -> list[RelatedArticleContext]:
    articles: list[RelatedArticleContext] = []
    for article_path in sorted(articles_dir.rglob("*.md")):
        article = _parse_article_text(article_path)
        if article is not None:
            articles.append(article)
    return articles


def _keyword_set(*values: str) -> set[str]:
    keywords: set[str] = set()
    for value in values:
        for match in _KEYWORD_PATTERN.findall((value or "").lower()):
            if match not in _STOP_WORDS:
                keywords.add(match)
    return keywords


def _score_related_article(
    article: RelatedArticleContext,
    *,
    draft_category: str,
    draft_tags: list[str],
    likely_named_locations: list[str],
    draft_title: str,
    draft_summary: str,
    draft_content: str,
) -> tuple[int, int, float, str]:
    score = 0
    same_category = int(bool(draft_category and article.category.lower() == draft_category.lower()))
    if same_category:
        score += 100

    draft_tag_keys = {tag.strip().lower() for tag in draft_tags if tag.strip()}
    article_tag_keys = {tag.lower() for tag in article.tags}
    score += 12 * len(draft_tag_keys & article_tag_keys)

    article_text = " ".join([article.title, article.summary, article.body]).lower()
    for location in likely_named_locations:
        location = (location or "").strip().lower()
        if location and location in article_text:
            score += 8

    draft_keywords = _keyword_set(draft_title, draft_summary, draft_content, " ".join(draft_tags))
    article_keywords = _keyword_set(article.title, article.summary, article.body, " ".join(article.tags))
    score += min(len(draft_keywords & article_keywords), 8)

    recency = article.date.timestamp() if article.date is not None else float("-inf")
    return (-score, -same_category, -recency, article.path)


def select_related_articles(
    articles_dir: Path,
    *,
    draft_category: str = "",
    draft_tags: list[str] | None = None,
    likely_named_locations: list[str] | None = None,
    draft_title: str = "",
    draft_summary: str = "",
    draft_content: str = "",
    limit: int = RELATED_ARTICLE_LIMIT,
) -> list[RelatedArticleContext]:
    draft_tags = draft_tags or []
    likely_named_locations = likely_named_locations or []
    ranked = sorted(
        load_related_article_candidates(articles_dir),
        key=lambda article: _score_related_article(
            article,
            draft_category=draft_category,
            draft_tags=draft_tags,
            likely_named_locations=likely_named_locations,
            draft_title=draft_title,
            draft_summary=draft_summary,
            draft_content=draft_content,
        ),
    )
    return ranked[:limit]


def canonicalize_generation_context(media_context: list[dict]) -> tuple[dict, list[str]]:
    warnings: list[str] = []
    canonical = None
    for item in media_context:
        warnings.extend(item.get("metadata_warnings") or [])
        if item.get("location_name") and item.get("captured_at") and item.get("time_of_day"):
            canonical = item
            break
    if canonical is None:
        raise ValueError("No media source includes both capture time and location metadata.")
    for item in media_context:
        if item["job_id"] == canonical["job_id"]:
            continue
        if item.get("location_name") and item["location_name"] != canonical["location_name"]:
            warnings.append(f"{item['name']} metadata location differs from canonical source.")
        if item.get("captured_at") and item["captured_at"] != canonical["captured_at"]:
            warnings.append(f"{item['name']} capture time differs from canonical source.")
    deduped = []
    seen = set()
    for warning in warnings:
        if warning and warning not in seen:
            seen.add(warning)
            deduped.append(warning)
    return canonical, deduped


def generate_article_from_sources(
    *,
    config: AppConfig,
    generator: ArticleGenerator,
    media_job_ids: list[str] | None = None,
    media_paths: list[str] | None = None,
    draft_title: str = "",
    draft_summary: str = "",
    draft_category: str = "",
    draft_tags: list[str] | None = None,
    draft_content: str = "",
    state: AppState | None = None,
) -> GeneratedArticleResult:
    media_job_ids = media_job_ids or []
    media_paths = media_paths or []
    draft_tags = draft_tags or []
    state = state or AppState()
    media_context = []
    if media_job_ids:
        media_context.extend(uploaded_context_from_job_ids(state, media_job_ids))
    if media_paths:
        media_context.extend(library_context_from_media_paths(config, media_paths))
    if not media_context:
        raise ValueError("Provide at least one media job or existing media path")

    canonical_job, warnings = canonicalize_generation_context(media_context)
    taxonomy = load_site_taxonomy(config.articles_dir)
    fallback_category = "Self"
    if canonical_job.get("location_name") and "kirkland" in canonical_job["location_name"].lower():
        fallback_category = "Pole Dance"
    if not taxonomy.categories:
        taxonomy = SiteTaxonomy(
            categories=[fallback_category],
            tags=[],
            tags_by_category={fallback_category: []},
        )
    likely_named_locations = find_likely_named_locations(
        canonical_job.get("location_name"),
        gps=canonical_job.get("gps"),
        category_hint=fallback_category,
    )
    related_articles = select_related_articles(
        config.articles_dir,
        draft_category=draft_category,
        draft_tags=draft_tags,
        likely_named_locations=likely_named_locations,
        draft_title=draft_title,
        draft_summary=draft_summary,
        draft_content=draft_content,
    )
    allowed_tags = taxonomy.tags
    prepared_context, temp_dir = prepare_media_context_for_generation(media_context)
    try:
        generated = generator.generate(
            GenerationRequest(
                media_context=prepared_context,
                canonical_job=canonical_job,
                warnings=warnings,
                allowed_categories=taxonomy.categories,
                allowed_tags=allowed_tags,
                likely_named_locations=likely_named_locations,
                draft_title=draft_title,
                draft_summary=draft_summary,
                draft_category=draft_category,
                draft_tags=draft_tags,
                draft_content=draft_content,
                related_articles=[article.to_prompt_dict() for article in related_articles],
            )
        )
    finally:
        if temp_dir is not None:
            temp_dir.cleanup()
    category = normalize_category(generated.get("category"), taxonomy) or fallback_category
    tags = normalize_tags(generated.get("tags"), taxonomy.tags_by_category.get(category) or taxonomy.tags)
    return GeneratedArticleResult(
        title_ideas=generated["title_ideas"],
        summary=generated["summary"],
        category=category,
        tags=tags,
        content_markdown=generated["content_markdown"],
        location=canonical_job["location_name"],
        captured_at=canonical_job["captured_at"],
        likely_named_locations=likely_named_locations,
        time_of_day=canonical_job["time_of_day"],
        source_media=[item["job_id"] for item in media_context],
        warnings=warnings,
    )
