# Content Manager Architecture

Last updated: March 17, 2026

## Overview

The content manager is a local Flask app used to upload media, draft articles, and publish markdown into the static site content tree.

Local toolchain contract for this app:

- `ffmpeg` must be available in `PATH` for audio, image, and video transcoding.
- `exiftool` must be available in `PATH` on the authoring machine for image metadata preservation and fallback metadata extraction.
- `Pillow` and `requests` from [requirements.txt](/C:/Users/Admin/eloise.rip/eloise.rip/requirements.txt) are required Python dependencies for metadata extraction and outbound API calls.
- `OPENAI_API_KEY` is required for `/api/article/generate` and `python -m content_manager.cli generate`.
- Outbound HTTPS access is required for OpenAI Responses API calls and for Nominatim reverse geocoding when GPS metadata is present.
- These binaries are required only where `content_manager` runs locally. Cloudflare Pages serves static output and does not run the content manager pipeline.
- These AI/metadata dependencies are intentional parts of the local authoring workflow, not incidental transitive requirements.

Primary entrypoints:

- [app.py](/C:/Users/Admin/eloise.rip/eloise.rip/content_manager/app.py): HTTP routes and request orchestration
- [cli.py](/C:/Users/Admin/eloise.rip/eloise.rip/content_manager/cli.py): CLI entrypoint for generation workflows
- [author-article.html](/C:/Users/Admin/eloise.rip/eloise.rip/content_manager/templates/author-article.html): article authoring UI

## Runtime Structure

### Configuration

- [config.py](/C:/Users/Admin/eloise.rip/eloise.rip/content_manager/config.py) loads environment-backed settings and repo paths.
- The config object is shared by both Flask routes and CLI workflows.

### State

- [state.py](/C:/Users/Admin/eloise.rip/eloise.rip/content_manager/state.py) holds in-memory job and draft stores.
- This state is process-local and not persisted across restarts.

### Services

- [media_metadata.py](/C:/Users/Admin/eloise.rip/eloise.rip/content_manager/services/media_metadata.py)
  - extracts EXIF/video metadata
  - reverse geocodes coordinates
  - derives time-of-day
- [article_generation.py](/C:/Users/Admin/eloise.rip/eloise.rip/content_manager/services/article_generation.py)
  - builds the OpenAI request
  - normalizes structured JSON output
- [generation_workflow.py](/C:/Users/Admin/eloise.rip/eloise.rip/content_manager/services/generation_workflow.py)
  - resolves media sources from uploaded jobs or existing `content/media/...` files
  - chooses canonical location/time metadata
  - invokes the generator
- [site_taxonomy.py](/C:/Users/Admin/eloise.rip/eloise.rip/content_manager/services/site_taxonomy.py)
  - loads existing categories and tags from article front matter
  - normalizes model output back onto the site’s current vocabulary
- [location_context.py](/C:/Users/Admin/eloise.rip/eloise.rip/content_manager/services/location_context.py)
  - enriches geocoded places with curated likely named venues

## Main Flows

### Media Upload

1. Browser posts file to `/api/media/upload`
2. Flask stores the original under `media-source/`
3. Metadata is extracted from the original file immediately
4. A background thread transcodes:
   - images -> AVIF in `content/media/images/`
   - videos -> MP4 + JPG poster in `content/media/video/`
5. The UI polls `/api/media/jobs/<id>`

### Article Generation

Generation can start from either:

- uploaded media jobs from the admin UI
- existing files under `content/media/` through the CLI or API

Flow:

1. Resolve media source records
2. Extract or reuse metadata
3. Select one canonical location/time context
4. Send multimodal request to OpenAI
5. Return structured fields for review:
   - title ideas
   - summary
   - category
   - tags
   - markdown body

### Article Publish

1. Browser posts form data to `/api/article/publish`
2. Flask validates title/content
3. Uploaded media job ids are converted into embed syntax
4. Markdown is written to `content/articles/YYYY/MM/slug.md`
5. Optional git commit/push runs when enabled

Existing library media contract:

- `media_paths` is for assets that already exist under `content/media/` as part of the curated media library.
- Those library assets are expected to already be committed before publish.
- `publish_article()` auto-commit behavior is intentionally scoped to the new article plus files produced by uploaded media jobs in the current session.
- It is acceptable that publish does not try to discover and auto-commit unrelated preexisting files under `content/media/`.
- If uncommitted files are sitting in `content/media/`, that is considered a local workflow issue rather than a publish-path bug under the current contract.

## Testability

The generation code is split so it can be exercised without running Flask:

- unit-test prompt/request normalization in [article_generation.py](/C:/Users/Admin/eloise.rip/eloise.rip/content_manager/services/article_generation.py)
- unit-test source resolution and canonical metadata selection in [generation_workflow.py](/C:/Users/Admin/eloise.rip/eloise.rip/content_manager/services/generation_workflow.py)
- run end-to-end generation from the CLI:

```powershell
python -m content_manager.cli generate --media-path video/bungle-babes-duo-choreo.mp4 --pretty
```

## Current Constraints

- job and draft state is in-memory only
- generation depends on metadata presence in source media
- reverse geocoding and OpenAI calls are live network dependencies
- location enrichment beyond raw geocoding is currently heuristic and curated, not globally authoritative
