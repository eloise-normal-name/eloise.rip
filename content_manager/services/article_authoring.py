from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

from content_manager.config import AppConfig
from content_manager.services.generation_workflow import classify_media_path, resolve_library_media_path
from content_manager.services.metadata_resolution import DraftMetadataSnapshot, resolve_draft_metadata
from content_manager.state import AppState


def slugify(text: str) -> str:
    import re

    text = text.lower().strip()
    text = re.sub(r"[^\w\s-]", "", text)
    text = re.sub(r"[\s_]+", "-", text)
    text = re.sub(r"-+", "-", text)
    return text.strip("-")


def unique_article_path(config: AppConfig, slug: str, date_str: str) -> Path:
    folder = config.articles_dir / date_str[:4] / date_str[5:7]
    folder.mkdir(parents=True, exist_ok=True)
    path = folder / f"{slug}.md"
    if not path.exists():
        return path
    suffix = 2
    while True:
        candidate = folder / f"{slug}-{suffix}.md"
        if not candidate.exists():
            return candidate
        suffix += 1


def _library_media_context(config: AppConfig, media_paths: list[str]) -> list[dict]:
    items = []
    for raw_path in media_paths:
        relative, full_path = resolve_library_media_path(config, raw_path)
        if not full_path.exists():
            raise ValueError(f"media file not found: media/{relative.as_posix()}")
        media_type = classify_media_path(full_path)
        items.append({
            "media_type": media_type,
            "name": full_path.stem,
            "final_url": f"/media/{relative.as_posix()}",
        })
    return items


def build_media_prefix(config: AppConfig, state: AppState, media_job_ids: list[str], title: str, media_paths: list[str] | None = None) -> str:
    videos = []
    images = []
    with state.jobs_lock:
        for job_id in media_job_ids:
            job = state.media_jobs.get(job_id)
            if not job or job["status"] != "done":
                continue
            if job["media_type"] == "video":
                videos.append(job["name"])
            elif job["media_type"] == "image":
                images.append(job)
    for item in _library_media_context(config, media_paths or []):
        if item["media_type"] == "video":
            videos.append(item["name"])
        elif item["media_type"] == "image":
            images.append(item)

    parts = [f"[[video:{name}]]" for name in videos]
    if len(images) == 1:
        url = images[0]["final_url"].lstrip("/")
        parts.append(f"![]({url})")
    elif len(images) > 1:
        label = f"{title} Gallery"
        items = ";\n".join(image["final_url"].lstrip("/") for image in images)
        parts.append(f"[[carousel:label={label};\n{items}]]")
    return "\n\n".join(parts)


@dataclass(frozen=True)
class DraftArticle:
    draft_id: str
    title: str
    summary: str
    category: str
    tags: str
    thumbnail: str
    existing_media_paths: str
    content: str
    media_jobs: list[str]
    updated_at: str
    metadata: DraftMetadataSnapshot

    def to_dict(self) -> dict:
        return {
            "draft_id": self.draft_id,
            "title": self.title,
            "summary": self.summary,
            "category": self.category,
            "tags": self.tags,
            "thumbnail": self.thumbnail,
            "existing_media_paths": self.existing_media_paths,
            "content": self.content,
            "media_jobs": self.media_jobs,
            "updated_at": self.updated_at,
            "metadata": self.metadata.to_dict(),
        }


@dataclass(frozen=True)
class DraftSummary:
    draft_id: str
    title: str
    updated_at: str
    generation_eligible: bool
    blocking_reasons: list[str]

    def to_dict(self) -> dict:
        return {
            "draft_id": self.draft_id,
            "title": self.title,
            "updated_at": self.updated_at,
            "generation_eligible": self.generation_eligible,
            "blocking_reasons": self.blocking_reasons,
        }


@dataclass(frozen=True)
class PublishArticleCommand:
    title: str
    content: str
    summary: str
    category: str
    tags: str
    thumbnail: str
    media_job_ids: list[str]
    media_paths: list[str]


def _normalize_media_paths(value) -> list[str]:
    if value is None:
        return []
    if isinstance(value, list):
        return [str(item).strip() for item in value if str(item).strip()]
    if isinstance(value, str):
        return [line.strip() for line in value.splitlines() if line.strip()]
    raise ValueError("media_paths and existing_media_paths must be strings or arrays")


def save_draft(state: AppState, config: AppConfig, data: dict) -> DraftArticle:
    draft_id = str(data.get("draft_id") or __import__("uuid").uuid4())
    media_jobs = data.get("media_jobs", []) or []
    if not isinstance(media_jobs, list):
        raise ValueError("media_jobs must be an array")
    existing_media_paths = _normalize_media_paths(data.get("existing_media_paths", ""))
    updated_at = datetime.now(timezone.utc).isoformat()
    metadata = resolve_draft_metadata(
        config=config,
        state=state,
        media_job_ids=media_jobs,
        media_paths=existing_media_paths,
    )
    record = {
        "title": data.get("title", ""),
        "summary": data.get("summary", ""),
        "category": data.get("category", ""),
        "tags": data.get("tags", ""),
        "thumbnail": data.get("thumbnail", ""),
        "existing_media_paths": "\n".join(existing_media_paths),
        "content": data.get("content", ""),
        "media_jobs": media_jobs,
        "updated_at": updated_at,
    }
    with state.jobs_lock:
        state.drafts[draft_id] = record
    return DraftArticle(draft_id=draft_id, metadata=metadata, **record)


def resolve_in_progress_draft(state: AppState, config: AppConfig, data: dict) -> DraftMetadataSnapshot:
    media_jobs = data.get("media_jobs", []) or []
    if not isinstance(media_jobs, list):
        raise ValueError("media_jobs must be an array")
    existing_media_paths = _normalize_media_paths(
        data.get("existing_media_paths", data.get("media_paths", ""))
    )
    return resolve_draft_metadata(
        config=config,
        state=state,
        media_job_ids=media_jobs,
        media_paths=existing_media_paths,
    )


def load_draft(state: AppState, config: AppConfig, draft_id: str) -> DraftArticle | None:
    with state.jobs_lock:
        draft = dict(state.drafts.get(draft_id) or {})
    if not draft:
        return None
    existing_media_paths = _normalize_media_paths(draft.get("existing_media_paths", ""))
    metadata = resolve_draft_metadata(
        config=config,
        state=state,
        media_job_ids=list(draft.get("media_jobs", []) or []),
        media_paths=existing_media_paths,
    )
    return DraftArticle(draft_id=draft_id, metadata=metadata, **draft)


def list_drafts(state: AppState, config: AppConfig) -> list[DraftSummary]:
    with state.jobs_lock:
        rows = [(draft_id, dict(payload)) for draft_id, payload in state.drafts.items()]
    summaries = []
    for draft_id, payload in rows:
        existing_media_paths = _normalize_media_paths(payload.get("existing_media_paths", ""))
        metadata = resolve_draft_metadata(
            config=config,
            state=state,
            media_job_ids=list(payload.get("media_jobs", []) or []),
            media_paths=existing_media_paths,
        )
        summaries.append(DraftSummary(
            draft_id=draft_id,
            title=(payload.get("title") or "").strip() or "Untitled draft",
            updated_at=payload.get("updated_at") or "",
            generation_eligible=metadata.generation_eligible,
            blocking_reasons=metadata.blocking_reasons,
        ))
    summaries.sort(key=lambda item: item.updated_at, reverse=True)
    return summaries


def validate_publish_request(data: dict) -> PublishArticleCommand:
    title = (data.get("title") or "").strip()
    content = (data.get("content") or "").strip()
    if not title:
        raise ValueError("title is required")
    if not content:
        raise ValueError("content is required")
    media_job_ids = data.get("media_jobs", []) or []
    if not isinstance(media_job_ids, list):
        raise ValueError("media_jobs must be arrays")
    media_paths = data.get("media_paths", []) or []
    if not isinstance(media_paths, list):
        raise ValueError("media_paths must be arrays")
    return PublishArticleCommand(
        title=title,
        content=content,
        summary=(data.get("summary") or "").strip(),
        category=(data.get("category") or "").strip(),
        tags=(data.get("tags") or "").strip(),
        thumbnail=(data.get("thumbnail") or "").strip(),
        media_job_ids=media_job_ids,
        media_paths=media_paths,
    )


def publish_article(config: AppConfig, state: AppState, command: PublishArticleCommand, git_push_fn) -> dict:
    media_paths: list[Path] = []
    with state.jobs_lock:
        for job_id in command.media_job_ids:
            job = state.media_jobs.get(job_id)
            if not job:
                raise ValueError(f"unknown media job: {job_id}")
            if job["status"] != "done":
                raise ValueError(f"media job {job_id} not complete (status: {job['status']})")
            if job.get("output_path"):
                media_paths.append(Path(job["output_path"]))
            if job.get("poster_path"):
                media_paths.append(Path(job["poster_path"]))

    date_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    article_path = unique_article_path(config, slugify(command.title), date_str)
    lines = [f"Title: {command.title}", f"Date: {date_str}"]
    for key, value in (("Summary", command.summary), ("Category", command.category), ("Tags", command.tags)):
        if value:
            lines.append(f"{key}: {value}")
    if command.thumbnail:
        lines.append(f"thumbnail: {command.thumbnail}")
    lines.append("")
    media_prefix = build_media_prefix(config, state, command.media_job_ids, command.title, command.media_paths)
    if media_prefix:
        lines.append(media_prefix)
        lines.append("")
    lines.append(command.content)
    lines.append("")
    article_path.write_text("\n".join(lines), encoding="utf-8")
    push_error = git_push_fn(article_path, media_paths)
    return {
        "status": "published",
        "slug": article_path.stem,
        "path": str(article_path.relative_to(config.repo_root)),
        "push_error": push_error,
    }
