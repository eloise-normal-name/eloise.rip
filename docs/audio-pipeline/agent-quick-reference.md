# Content Manager Agent Quick Reference

Last updated: March 17, 2026

## Read This Before Touching `content_manager`

This is the shortest practical reference for future agents and reviewers.

## Scope

The `content_manager` app is a local authoring tool. It is not part of the Cloudflare Pages runtime.

What it does:

- uploads/transcodes voice and media
- extracts media metadata
- generates article drafts from media
- writes article markdown into `content/articles/`

What it does not do:

- serve the public site
- run inside Cloudflare Pages
- persist jobs/drafts across process restarts

## Metadata Coverage Reality (Current)

- Not all media content has complete metadata right now.
- Partial or missing capture-time/location metadata is common in portions of the existing library.
- Treat this as expected current state unless extraction behavior regresses on files that previously worked.
- Reference: [media-metadata-coverage-status.md](./media-metadata-coverage-status.md)

## Local Dependency Contract

These are intentional local-machine requirements, not surprising hidden dependencies:

- `ffmpeg` in `PATH`
- `exiftool` in `PATH`
- Python packages from [requirements.txt](/C:/Users/Admin/eloise.rip/eloise.rip/requirements.txt), especially `Pillow`, `requests`, and `pytest`
- `OPENAI_API_KEY` for generation
- outbound HTTPS for OpenAI and Nominatim when generation or reverse geocoding is used

Do not keep re-flagging these as novel bugs unless the code starts depending on something beyond this documented contract.

## Media Contracts

### Uploaded Media

- images are published as AVIF under `content/media/images/`
- videos are published as MP4 plus poster JPG under `content/media/video/`
- upload names are normalized to lowercase hyphenated basenames
- duplicate normalized names are rejected for normal interactive authoring

### Existing Library Media

- `media_paths` means already-curated files under `content/media/`
- those files are expected to already exist before generation or publish uses them
- existing library video references are expected to already have a poster JPG when the site/theme expects one
- publish is allowed to trust that curated-library contract

Do not treat `media_paths` as if it were the same workflow as a fresh upload job.

## OpenAI Boundary Contract

The repo intentionally separates site-media support from OpenAI vision-input support.

- site media may include AVIF and other formats needed by the site pipeline
- OpenAI generation inputs should only use documented-safe image formats

Current local rule:

- acceptable generation image inputs: `.jpg`, `.jpeg`, `.png`, `.gif`, `.webp`
- unsupported generation image inputs: `.avif`, `.bmp`, `.tif`, `.tiff`

Reference:

- [openai-image-input-reference.md](./openai-image-input-reference.md)

## API Endpoints That Matter Most

- `POST /api/media/upload`
- `GET /api/media/jobs/<job_id>`
- `GET /api/media/list`
- `POST /api/article/generate`
- `POST /api/article/publish`
- `POST /api/article/draft`
- `GET /api/article/draft/<draft_id>`

See:

- [article-generation-contract.md](./article-generation-contract.md)

## Common Review Mistakes To Avoid

- Do not flag aggressive Waitress cleanup in `scripts/restart-content-manager.ps1` as a bug by itself. That behavior is documented and intentional for this repo.
- Do not flag the presence of OpenAI, Nominatim, `ffmpeg`, or `exiftool` dependencies as novel issues by themselves.
- Do not assume publish should auto-commit arbitrary preexisting library media under `content/media/`.
- Do not assume AVIF being valid site media means AVIF is valid OpenAI vision input.
- Do not confuse local authoring safeguards with distributed concurrency guarantees.
- Do not repeatedly raise generic "some media lacks metadata" comments as novel defects; that is a documented current-state constraint.

## When You Need More Detail

- architecture and service boundaries:
  [content-manager-architecture.md](./content-manager-architecture.md)
- generation and publish semantics:
  [article-generation-contract.md](./article-generation-contract.md)
- local operations and startup:
  [admin-upload-page-design-implementation.md](./admin-upload-page-design-implementation.md)
