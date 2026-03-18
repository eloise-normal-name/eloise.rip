# Media Metadata Coverage Status

Last updated: March 17, 2026

## Why this page exists

Not all media in this repository currently carries complete machine-readable metadata.

That is expected **right now** and should be treated as a normal state of the library,
not as an automatic bug.

## Current reality (important)

- Some files have both capture time and GPS metadata.
- Some files have only partial metadata (time-only, location-only, or ambiguous tags).
- Some files have no usable metadata at all.
- Metadata quality varies by source device, export workflow, transcoding history, and file format.

## What this means for generation

- `/api/article/generate` requires at least one source with both usable capture time and usable location.
- If no source has both, generation fails with a validation error by design.
- Warnings about missing or conflicting metadata are expected for mixed libraries.
- The canonical metadata source is selected from available media; disagreement warnings may be returned.

## Why coverage is incomplete

Common causes include:

- source devices that did not record GPS or timestamp tags
- privacy-preserving exports that removed EXIF/QuickTime tags
- format conversions that dropped or altered metadata keys
- old curated library items added before current extraction/generation rules

## Operational guidance

- Treat missing metadata warnings as informative first, not immediate defects.
- Confirm whether the article can still be authored/published manually.
- For generation-dependent workflows, prefer media known to contain both time and location tags.
- Do not assume that every existing `content/media/` asset can satisfy generation requirements.

## Review guidance

Reviewers and agents should **not** repeatedly file the blanket issue
"metadata is missing on some files" as a novel defect.

Only flag issues when:

- extraction logic regresses for files that previously parsed correctly,
- contract/documentation claims become incorrect,
- or product requirements explicitly change to require full metadata coverage.

## Related docs

- [README.md](./README.md)
- [agent-quick-reference.md](./agent-quick-reference.md)
- [content-manager-architecture.md](./content-manager-architecture.md)
- [article-generation-contract.md](./article-generation-contract.md)
- [article-generation-from-media-plan.md](./article-generation-from-media-plan.md)
- [admin-upload-page-design-implementation.md](./admin-upload-page-design-implementation.md)
