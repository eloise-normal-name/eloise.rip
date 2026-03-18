from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from content_manager.config import AppConfig
from content_manager.services.article_generation import ArticleGenerator, GenerationRequest
from content_manager.services.location_context import find_likely_named_locations
from content_manager.services.media_metadata import extract_media_metadata
from content_manager.services.site_taxonomy import SiteTaxonomy, load_site_taxonomy, normalize_category, normalize_tags
from content_manager.state import AppState

IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".bmp", ".tiff", ".tif", ".webp", ".avif"}
MODEL_SUPPORTED_IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".gif", ".webp"}
VIDEO_EXTENSIONS = {".mp4", ".mov", ".mkv", ".avi", ".webm", ".m4v", ".gif"}


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
        model_image_path = full_path
        if media_type == "video":
            poster_path = full_path.with_suffix(".jpg")
            if not poster_path.exists():
                raise ValueError(f"video poster not found for generation: media/{relative.as_posix()}")
            model_image_path = poster_path
        else:
            ensure_model_supported_image(model_image_path)
        context.append({
            "job_id": f"library:{relative.as_posix()}",
            "name": full_path.stem,
            "media_type": media_type,
            "input_path": str(full_path),
            "model_image_path": model_image_path,
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
            model_image_path = Path(job["input_path"]) if job["media_type"] == "image" else Path(job.get("poster_path") or "")
            if not model_image_path.exists():
                raise ValueError(f"media asset unavailable for generation: {job['name']}")
            if job["media_type"] == "image":
                ensure_model_supported_image(model_image_path)
            context.append({**job, "job_id": job_id, "model_image_path": model_image_path})
    return context


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
    state: AppState | None = None,
) -> GeneratedArticleResult:
    media_job_ids = media_job_ids or []
    media_paths = media_paths or []
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
        category_hint=fallback_category,
    )
    allowed_tags = taxonomy.tags
    generated = generator.generate(
        GenerationRequest(
            media_context=media_context,
            canonical_job=canonical_job,
            warnings=warnings,
            allowed_categories=taxonomy.categories,
            allowed_tags=allowed_tags,
            likely_named_locations=likely_named_locations,
        )
    )
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
