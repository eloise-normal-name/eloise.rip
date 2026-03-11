# Admin Content Manager

This document is the canonical reference for the local admin app exposed at `admin.eloise.rip`.

Last updated: March 11, 2026

## Overview

The admin tool is a locally run Flask/Waitress app in `content_manager/`. It is separate from the public Pelican site and is exposed remotely through Cloudflare Access, Cloudflare Tunnel, and a local `nginx` reverse proxy.

Current verified state:
- `http://127.0.0.1:8000/health` returned `200`
- `http://127.0.0.1:5000/admin/upload` returned `200`
- `cloudflared tunnel info audio-app` showed active connectors
- `https://admin.eloise.rip` returned the Cloudflare Access sign-in page

## What It Does

Current admin capabilities include:
- Voice upload at `/admin/upload`
- Article authoring at `/admin/articles/new`
- Media upload API at `/api/media/upload`
- Article publish API at `/api/article/publish`

The public site at `www.eloise.rip` stays completely separate. It is static and deployed through GitHub Pages.

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
- `GET /admin/upload`

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
- [scripts/start-content-manager.sh](../../scripts/start-content-manager.sh)
- [scripts/restart-content-manager.sh](../../scripts/restart-content-manager.sh)

## Setup And Operations

### WSL assumptions

- Run the repo inside the Linux filesystem, not from `/mnt/c/...`.
- Activate the repo venv with `source .venv/bin/activate` before Pelican or Waitress commands.
- Keep `cloudflared`, `nginx`, `curl`, and `ss` available on `PATH`.

### Issues Encountered On WSL

Resolved during the March 11, 2026 WSL migration:

- `content_manager/app.py` imported successfully on newer Python, but Python 3.8 failed on `list[str]` and similar annotations at import time. The app now uses postponed annotation evaluation so Waitress can start cleanly on the host interpreter.
- `nohup`-based background startup was unreliable in this shell environment and left stale PID files. The startup scripts now use `setsid`, and the health-check polling no longer prints noisy transient `curl: (7)` messages during normal boot.
- Ubuntu `nginx` attempted to write temp files under system-owned defaults such as `/var/lib/nginx/body`, which caused the public `502` from Cloudflare. The rendered runtime config now writes temp files under `.run/content-manager/nginx/`.
- `cloudflared` needs both the package on `PATH` and the tunnel credentials JSON referenced by [cloudflared/config.yml](../../cloudflared/config.yml). The startup script now fails early with a specific missing-credentials error instead of continuing to a vague tunnel failure.

Still worth checking first when the admin page is down:

- `curl -fsS http://127.0.0.1:8000/health`
- `curl -I http://127.0.0.1:5000/admin/upload/voice`
- `tail -n 50 .run/content-manager/nginx.err.log`
- `tail -n 50 .run/content-manager/cloudflared.err.log`

### cloudflared

Install `cloudflared` with your WSL distro package manager or the official Cloudflare Linux package instructions, then confirm:

```bash
command -v cloudflared
```

Current shell-resolved version:
- `cloudflared 2026.3.0`

Create and route the tunnel:

```bash
cloudflared tunnel login
cloudflared tunnel create audio-app
cloudflared tunnel route dns audio-app admin.eloise.rip
```

Run with the repo config:

```bash
cloudflared tunnel --config "$PWD/cloudflared/config.yml" run audio-app
```

### nginx

Install `nginx` with your distro package manager, then confirm:

```bash
command -v nginx
```

The repo startup script renders a self-contained config from [nginx/audio-app.conf](../../nginx/audio-app.conf), so you do not need to edit a global Windows `nginx.conf`.

Manual validation after the startup script renders `.run/content-manager/nginx.conf`:

```bash
nginx -t -c "$PWD/.run/content-manager/nginx.conf"
```

### Waitress / Flask

Development:

```bash
python -m content_manager.app
```

Production-style local run:

```bash
python -m waitress --listen=127.0.0.1:8000 content_manager.app:app
```

### One-command startup

Start the local stack:

```bash
./scripts/start-content-manager.sh --tunnel-name audio-app
```

Fast app restart only:

```bash
./scripts/restart-content-manager.sh
```

Runtime artifacts:
- `.run/content-manager/waitress.pid`
- `.run/content-manager/nginx.pid`
- `.run/content-manager/cloudflared.pid`
- `.run/content-manager/*.out.log`
- `.run/content-manager/*.err.log`

## Verification

Useful checks:

```bash
curl -fsS http://127.0.0.1:8000/health
curl -I http://127.0.0.1:5000/admin/upload
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
