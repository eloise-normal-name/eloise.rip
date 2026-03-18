from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from content_manager.config import AppConfig
from content_manager.services.generation_workflow import (
    canonicalize_generation_context,
    classify_media_path,
    ensure_model_supported_image,
    resolve_library_media_path,
)
from content_manager.services.media_metadata import extract_media_metadata
from content_manager.state import AppState


@dataclass(frozen=True)
class ResolvedMediaItem:
    source_kind: str
    source_id: str
    label: str
    media_type: str | None
    name: str | None
    status: str
    final_url: str | None
    poster_url: str | None
    captured_at: str | None
    time_of_day: str | None
    location_name: str | None
    metadata_status: str
    warnings: list[str]
    generation_ready: bool
    generation_blockers: list[str]

    def to_dict(self) -> dict:
        return {
            "source_kind": self.source_kind,
            "source_id": self.source_id,
            "label": self.label,
            "media_type": self.media_type,
            "name": self.name,
            "status": self.status,
            "final_url": self.final_url,
            "poster_url": self.poster_url,
            "captured_at": self.captured_at,
            "time_of_day": self.time_of_day,
            "location_name": self.location_name,
            "metadata_status": self.metadata_status,
            "warnings": self.warnings,
            "generation_ready": self.generation_ready,
            "generation_blockers": self.generation_blockers,
        }


@dataclass(frozen=True)
class DraftMetadataSnapshot:
    items: list[ResolvedMediaItem]
    source_media: list[str]
    generation_eligible: bool
    blocking_reasons: list[str]
    warnings: list[str]
    canonical_source_id: str | None
    canonical_location: str | None
    canonical_captured_at: str | None
    canonical_time_of_day: str | None
    media_summary: str
    location_summary: str
    time_summary: str

    def to_dict(self) -> dict:
        return {
            "items": [item.to_dict() for item in self.items],
            "source_media": self.source_media,
            "generation_eligible": self.generation_eligible,
            "blocking_reasons": self.blocking_reasons,
            "warnings": self.warnings,
            "canonical_source_id": self.canonical_source_id,
            "location": self.canonical_location,
            "captured_at": self.canonical_captured_at,
            "time_of_day": self.canonical_time_of_day,
            "media_summary": self.media_summary,
            "location_summary": self.location_summary,
            "time_summary": self.time_summary,
        }


def _dedupe(values: list[str]) -> list[str]:
    result: list[str] = []
    seen = set()
    for value in values:
        if not value or value in seen:
            continue
        seen.add(value)
        result.append(value)
    return result


def _uploaded_item(job_id: str, state: AppState) -> ResolvedMediaItem:
    with state.jobs_lock:
        job = dict(state.media_jobs.get(job_id) or {})

    if not job:
        return ResolvedMediaItem(
            source_kind="uploaded_job",
            source_id=job_id,
            label=job_id,
            media_type=None,
            name=None,
            status="missing",
            final_url=None,
            poster_url=None,
            captured_at=None,
            time_of_day=None,
            location_name=None,
            metadata_status="missing",
            warnings=["uploaded media job is no longer available"],
            generation_ready=False,
            generation_blockers=["uploaded media job is no longer available"],
        )

    warnings = list(job.get("metadata_warnings") or [])
    blockers: list[str] = []
    if job.get("status") != "done":
        blockers.append(f"uploaded media job {job_id} is not complete")
    if job.get("media_type") == "image":
        try:
            ensure_model_supported_image(Path(job.get("input_path") or ""))
        except ValueError as err:
            blockers.append(str(err))

    return ResolvedMediaItem(
        source_kind="uploaded_job",
        source_id=job_id,
        label=job.get("name") or job_id,
        media_type=job.get("media_type"),
        name=job.get("name"),
        status=job.get("status") or "unknown",
        final_url=job.get("final_url"),
        poster_url=job.get("poster_url"),
        captured_at=job.get("captured_at"),
        time_of_day=job.get("time_of_day"),
        location_name=job.get("location_name"),
        metadata_status=job.get("metadata_status") or "unknown",
        warnings=warnings,
        generation_ready=job.get("status") == "done" and not blockers,
        generation_blockers=blockers,
    )


def _library_item(config: AppConfig, raw_path: str) -> ResolvedMediaItem:
    try:
        relative, full_path = resolve_library_media_path(config, raw_path)
    except ValueError as err:
        return ResolvedMediaItem(
            source_kind="library_path",
            source_id=raw_path,
            label=raw_path,
            media_type=None,
            name=None,
            status="invalid",
            final_url=None,
            poster_url=None,
            captured_at=None,
            time_of_day=None,
            location_name=None,
            metadata_status="invalid",
            warnings=[str(err)],
            generation_ready=False,
            generation_blockers=[str(err)],
        )

    if not full_path.exists():
        message = f"media file not found: media/{relative.as_posix()}"
        return ResolvedMediaItem(
            source_kind="library_path",
            source_id=relative.as_posix(),
            label=relative.as_posix(),
            media_type=None,
            name=None,
            status="missing",
            final_url=None,
            poster_url=None,
            captured_at=None,
            time_of_day=None,
            location_name=None,
            metadata_status="missing",
            warnings=[message],
            generation_ready=False,
            generation_blockers=[message],
        )

    try:
        media_type = classify_media_path(full_path)
    except ValueError as err:
        return ResolvedMediaItem(
            source_kind="library_path",
            source_id=relative.as_posix(),
            label=relative.as_posix(),
            media_type=None,
            name=None,
            status="invalid",
            final_url=f"/media/{relative.as_posix()}",
            poster_url=None,
            captured_at=None,
            time_of_day=None,
            location_name=None,
            metadata_status="invalid",
            warnings=[str(err)],
            generation_ready=False,
            generation_blockers=[str(err)],
        )

    metadata = extract_media_metadata(
        full_path,
        media_type,
        geocoder_user_agent=config.geocoder_user_agent,
    )
    blockers: list[str] = []
    poster_url = None
    if media_type == "video":
        poster_path = full_path.with_suffix(".jpg")
        if poster_path.exists():
            poster_url = f"/media/{relative.with_suffix('.jpg').as_posix()}"
    else:
        try:
            ensure_model_supported_image(full_path)
        except ValueError as err:
            blockers.append(str(err))

    return ResolvedMediaItem(
        source_kind="library_path",
        source_id=relative.as_posix(),
        label=relative.as_posix(),
        media_type=media_type,
        name=full_path.stem,
        status="available",
        final_url=f"/media/{relative.as_posix()}",
        poster_url=poster_url,
        captured_at=metadata.get("captured_at"),
        time_of_day=metadata.get("time_of_day"),
        location_name=metadata.get("location_name"),
        metadata_status=metadata.get("metadata_status") or "unknown",
        warnings=list(metadata.get("metadata_warnings") or []),
        generation_ready=not blockers,
        generation_blockers=blockers,
    )


def _item_generation_context(item: ResolvedMediaItem) -> dict | None:
    if not item.generation_ready:
        return None
    if item.status not in {"done", "available"}:
        return None
    return {
        "job_id": f"{item.source_kind}:{item.source_id}",
        "name": item.name or item.label,
        "location_name": item.location_name,
        "captured_at": item.captured_at,
        "time_of_day": item.time_of_day,
        "metadata_warnings": item.warnings,
    }


def _summarize_items(items: list[ResolvedMediaItem], canonical_source_id: str | None) -> tuple[str, str, str]:
    if not items:
        return ("No media attached yet.", "No location metadata yet.", "No capture-time metadata yet.")

    uploaded_count = sum(1 for item in items if item.source_kind == "uploaded_job")
    library_count = sum(1 for item in items if item.source_kind == "library_path")
    available_count = sum(1 for item in items if item.status in {"done", "available"})
    parts = []
    if uploaded_count:
        parts.append(f"{uploaded_count} uploaded")
    if library_count:
        parts.append(f"{library_count} existing library")
    media_summary = ", ".join(parts) if parts else "0 media"
    media_summary = f"{media_summary}; {available_count} currently available for generation."

    location_parts = _dedupe([
        item.location_name
        for item in items
        if item.location_name
    ])
    time_parts = _dedupe([
        f"{item.time_of_day} ({item.captured_at})" if item.time_of_day and item.captured_at else item.time_of_day or item.captured_at
        for item in items
        if item.time_of_day or item.captured_at
    ])

    canonical = next((item for item in items if f"{item.source_kind}:{item.source_id}" == canonical_source_id), None)
    location_summary = "No location metadata yet."
    time_summary = "No capture-time metadata yet."
    if canonical and canonical.location_name:
        location_summary = f"Canonical: {canonical.location_name}"
        remaining_locations = [value for value in location_parts if value != canonical.location_name]
        if remaining_locations:
            location_summary += f" | Also seen: {', '.join(remaining_locations)}"
    elif location_parts:
        location_summary = ", ".join(location_parts)

    if canonical and (canonical.time_of_day or canonical.captured_at):
        time_summary = f"Canonical: {canonical.time_of_day or 'time unknown'}"
        if canonical.captured_at:
            time_summary += f" at {canonical.captured_at}"
        remaining_times = [
            value
            for value in time_parts
            if value and value != (f"{canonical.time_of_day} ({canonical.captured_at})" if canonical.time_of_day and canonical.captured_at else canonical.time_of_day or canonical.captured_at)
        ]
        if remaining_times:
            time_summary += f" | Also seen: {', '.join(remaining_times)}"
    elif time_parts:
        time_summary = ", ".join(time_parts)

    return (media_summary, location_summary, time_summary)


def resolve_draft_metadata(
    *,
    config: AppConfig,
    state: AppState,
    media_job_ids: list[str] | None = None,
    media_paths: list[str] | None = None,
) -> DraftMetadataSnapshot:
    media_job_ids = media_job_ids or []
    media_paths = media_paths or []

    items: list[ResolvedMediaItem] = []
    for job_id in media_job_ids:
        items.append(_uploaded_item(job_id, state))
    for raw_path in media_paths:
        items.append(_library_item(config, raw_path))

    generation_context = [
        context
        for item in items
        if (context := _item_generation_context(item)) is not None
    ]

    warnings = _dedupe([warning for item in items for warning in item.warnings])
    blocking_reasons = _dedupe([reason for item in items for reason in item.generation_blockers])
    canonical_source_id = None
    canonical_location = None
    canonical_captured_at = None
    canonical_time_of_day = None
    generation_eligible = False

    if not items:
        blocking_reasons.append("Attach uploaded media or provide existing media paths before generating.")
    elif not generation_context:
        blocking_reasons.append("No selected media sources are currently available for generation.")
    else:
        try:
            canonical, canonical_warnings = canonicalize_generation_context(generation_context)
            canonical_source_id = canonical["job_id"]
            canonical_location = canonical["location_name"]
            canonical_captured_at = canonical["captured_at"]
            canonical_time_of_day = canonical["time_of_day"]
            generation_eligible = True
            warnings = _dedupe(warnings + canonical_warnings)
        except ValueError as err:
            blocking_reasons.append(str(err))

    media_summary, location_summary, time_summary = _summarize_items(items, canonical_source_id)

    return DraftMetadataSnapshot(
        items=items,
        source_media=[item.source_id for item in items],
        generation_eligible=generation_eligible,
        blocking_reasons=_dedupe(blocking_reasons),
        warnings=warnings,
        canonical_source_id=canonical_source_id,
        canonical_location=canonical_location,
        canonical_captured_at=canonical_captured_at,
        canonical_time_of_day=canonical_time_of_day,
        media_summary=media_summary,
        location_summary=location_summary,
        time_summary=time_summary,
    )
