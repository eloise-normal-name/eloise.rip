# Admin Content Manager

This document is the canonical reference for the local admin app exposed at `admin.eloise.rip`.

Last updated: March 15, 2026

## Overview

The admin tool is a locally run Flask/Waitress app in `content_manager/`. It is separate from the public Pelican site and is exposed remotely through Cloudflare Access, Cloudflare Tunnel, and a local `nginx` reverse proxy.

Current verified state:
- `http://127.0.0.1:8000/health` returned `200`
- `http://127.0.0.1:5000/admin/articles/new` returned `200`
- `cloudflared tunnel info audio-app` showed active connectors
- `https://admin.eloise.rip` returned the Cloudflare Access sign-in page

## What It Does

Current admin capabilities include:
- Voice upload at `/admin/upload/voice`
- Article authoring at `/admin/articles/new`
- Media upload API at `/api/media/upload`
- Article generation API at `/api/article/generate`
- Article publish API at `/api/article/publish`

The public site at `eloise.rip` stays completely separate. It is static and hosted on Cloudflare Pages.

Local environment contract for the admin app:
- `ffmpeg` must be installed and available in `PATH`.
- `exiftool` must be installed and available in `PATH` for image metadata preservation and fallback metadata reads.
- Existing-media article flows assume referenced files under `content/media/` are already curated and committed.
- These dependencies apply only to the local admin/content-manager machine. Cloudflare Pages only serves generated static files and does not execute this pipeline.

## Runtime Architecture

Requests flow through these layers:

1. Browser requests `https://admin.eloise.rip`
2. Cloudflare Access checks the allowlist and session
3. Cloudflare Tunnel forwards traffic to `http://localhost:5000`
4. `nginx` on port `5000` proxies to Waitress on `127.0.0.1:8000`
5. `content_manager.app` handles the request

Key local ports:
- `127.0.0.1:8000` for Waitress
- `localhost:5000` for `nginx`

Key tunnel details:
- Tunnel name: `audio-app`
- Tunnel ID: `3c11812a-c895-4274-b17a-c32a7605e9c3`
- Repo config: [cloudflared/config.yml](../../cloudflared/config.yml)

## Upload Page

Route:
- `GET /admin/upload/voice`

Backward-compatible redirect:
- `GET /admin/upload` -> `/admin/upload/voice`

Current simplified upload behavior:
- Accepts one `.qta` file
- Requires a clip id in `##-##` format somewhere in the filename
- Stores source files in `media-source/`
- Runs FFmpeg in the background
- Writes output to `content/media/voice/`
- Polls job state until a download link is available

Intentional constraints:
- Job state is in memory only
- No persistent history yet
- No automatic cleanup yet

## App Files

Primary implementation:
- [content_manager/app.py](../../content_manager/app.py)
- [content_manager/templates/admin-upload.html](../../content_manager/templates/admin-upload.html)
- [content_manager/templates/author-article.html](../../content_manager/templates/author-article.html)

Related infrastructure files:
- [nginx/audio-app.conf](../../nginx/audio-app.conf)
- [scripts/start-content-manager.ps1](../../scripts/start-content-manager.ps1)
- [scripts/restart-content-manager.ps1](../../scripts/restart-content-manager.ps1)

## Setup And Operations

### PowerShell assumptions

- Run the repo from Windows PowerShell.
- Keep `cloudflared` and `nginx` available on `PATH`.
- Keep the repo venv available at `.venv\Scripts\python.exe`.
- Keep `cloudflared/config.yml` pointed at the Windows credentials file path, not a WSL path like `/home/...`.

The PowerShell scripts intentionally halt immediately when either of these WSL leftovers are detected:
- `.venv\Scripts\python.exe` is missing but `.venv\bin\python` exists
- `cloudflared/config.yml` references `/home/...` or `/mnt/...`

Still worth checking first when the admin page is down:

- `Invoke-WebRequest http://127.0.0.1:8000/health -UseBasicParsing`
- `Invoke-WebRequest http://127.0.0.1:5000/admin/articles/new -UseBasicParsing`
- `Get-Content .run\content-manager\nginx.err.log -Tail 50`
- `Get-Content .run\content-manager\cloudflared.err.log -Tail 50`

### cloudflared

Install `cloudflared` on Windows and confirm:

```powershell
Get-Command cloudflared
```

Current shell-resolved version:
- `cloudflared 2026.3.0`

Create and route the tunnel:

```powershell
cloudflared tunnel login
cloudflared tunnel create audio-app
cloudflared tunnel route dns audio-app admin.eloise.rip
```

Run with the repo config:

```powershell
cloudflared tunnel --config "$PWD\cloudflared\config.yml" run audio-app
```

### nginx

Install `nginx` on Windows and confirm:

```powershell
Get-Command nginx
```

The PowerShell startup script renders a repo-managed nginx config into `.run\content-manager\nginx.conf`, so the local stack uses the repo template instead of a hand-edited global config.

### Waitress / Flask

Development:

```powershell
python -m content_manager.app
```

Production-style local run:

```powershell
python -m waitress --listen=127.0.0.1:8000 content_manager.app:app
```

### One-command startup

Start the local stack:

```powershell
.\scripts\start-content-manager.ps1 -TunnelName audio-app
```

Fast app restart only:

```powershell
.\scripts\restart-content-manager.ps1
```

Intentional restart behavior:
- `scripts/restart-content-manager.ps1` may kill extra `python -m waitress ... content_manager.app:app` processes beyond the current `127.0.0.1:8000` listener.
- This is a deliberate local-ops safeguard for this machine and repo because stale Waitress instances have survived pid-file and port-based cleanup.
- Reviewers should treat that scope as an accepted operational contract unless the script broadens beyond `content_manager.app:app` or the deployment model changes.

Runtime artifacts:
- `.run/content-manager/waitress.pid`
- `.run/content-manager/nginx.pid`
- `.run/content-manager/cloudflared.pid`
- `.run/content-manager/audio-app.conf`
- `.run/content-manager/nginx.conf`
- `.run/content-manager/*.out.log`
- `.run/content-manager/*.err.log`

## Verification

Useful checks:

```powershell
Invoke-WebRequest http://127.0.0.1:8000/health -UseBasicParsing
Invoke-WebRequest http://127.0.0.1:5000/admin/articles/new -UseBasicParsing
cloudflared tunnel info audio-app
```

Public check:
- Visit `https://admin.eloise.rip`
- Expected result for an unauthenticated browser: Cloudflare Access sign-in page

## Security Notes

Cloudflare Access blocks unauthenticated internet traffic before it reaches the home machine.

You are still responsible for:
- keeping `SECRET_KEY` private
- validating uploaded files before handing them to FFmpeg
- cleaning up old uploads and outputs as needed

## Related Docs

- [audio-pipeline-docs.md](./audio-pipeline-docs.md) for the legacy path and pointer
