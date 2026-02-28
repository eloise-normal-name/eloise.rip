# Admin Audio Upload Page (Simple Design + Implementation)

## Goal

Provide a minimal admin page to upload one `.qta` voice clip, transcode it to `.m4a` with FFmpeg, and download the result.

Route:
- `GET /admin/upload`

## Simple Design

- Single-page form:
  - File picker (`.qta`)
  - Fixed output format (`.m4a`)
  - Submit button
- Lightweight status panel:
  - Shows upload accepted
  - Polls job status every 2 seconds
  - Shows download link when complete

No advanced queue UI, auth UI, or multi-file batching is included in this version.

## Simple Implementation

Implemented in:
- `voice_uploader/app.py`
- `voice_uploader/templates/admin-upload.html`

Backend endpoints:
- `POST /api/upload`
  - Accepts multipart form data: `file`
  - Validates file extension is `.qta`
  - Validates filename contains clip id in `##-##` format (GUID prefix is allowed)
  - Saves input file into `media-source/` (gitignored)
  - Creates an in-memory job record
  - Starts a background thread for FFmpeg (`aac`, `.m4a` output named as `##-##.m4a`)
- `GET /api/jobs/<job_id>`
  - Returns current job status (`pending`, `processing`, `done`, `error`)
  - Returns `download_url` on success
- `GET /api/download/<job_id>`
  - Serves transcoded file from `content/media/voice/` as an attachment

## Environment and Limits

- `MAX_UPLOAD_MB` controls max accepted upload size (default `200`)
- `UPLOAD_DIR` sets input folder (default `media-source`)
- `OUTPUT_DIR` sets output folder (default `content/media/voice`)
- Output format is fixed to `m4a`
- Input extension is fixed to `qta` and filename must include `##-##` (GUID-style prefixes allowed)
- FFmpeg must be available on `PATH`

## Known Constraints (Intentional for Simplicity)

- Job state is in memory only (lost on app restart)
- No persistent database for history
- No automatic cleanup of old files yet
- No additional app-level auth is added here (expected to be gated by Cloudflare Access per project docs)
