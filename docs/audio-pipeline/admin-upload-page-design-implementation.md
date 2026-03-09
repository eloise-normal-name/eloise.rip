# Admin Content Manager

This document is the canonical reference for the local admin app exposed at `admin.eloise.rip`.

Last updated: March 9, 2026

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
- Repo config: [cloudflared/config.yml](/C:/Users/Admin/eloise.rip/eloise.rip/cloudflared/config.yml)

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
- [content_manager/app.py](/C:/Users/Admin/eloise.rip/eloise.rip/content_manager/app.py)
- [content_manager/templates/admin-upload.html](/C:/Users/Admin/eloise.rip/eloise.rip/content_manager/templates/admin-upload.html)
- [content_manager/templates/author-article.html](/C:/Users/Admin/eloise.rip/eloise.rip/content_manager/templates/author-article.html)

Related infrastructure files:
- [nginx/audio-app.conf](/C:/Users/Admin/eloise.rip/eloise.rip/nginx/audio-app.conf)
- [scripts/start-content-manager.ps1](/C:/Users/Admin/eloise.rip/eloise.rip/scripts/start-content-manager.ps1)
- [scripts/restart-content-manager.ps1](/C:/Users/Admin/eloise.rip/eloise.rip/scripts/restart-content-manager.ps1)

## Setup And Operations

### cloudflared

Install:

```powershell
winget install --id Cloudflare.cloudflared -e
```

If the winget package lags the latest upstream release on this machine, install the standalone binary into the user bin directory:

```powershell
curl.exe -L --fail --output C:\Users\Admin\.local\bin\cloudflared.exe `
  https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe
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
cloudflared tunnel --config C:\Users\Admin\eloise.rip\eloise.rip\cloudflared\config.yml run audio-app
```

### nginx

Install:

```powershell
winget install --id nginxinc.nginx -e
```

The installed `nginx.conf` must include:

```nginx
include       C:/Users/Admin/eloise.rip/eloise.rip/nginx/audio-app.conf;
```

Without that include, `nginx` starts with its default config and `cloudflared` cannot reach `localhost:5000`.

Validate:

```powershell
nginx -t -p C:\Users\Admin\AppData\Local\Microsoft\WinGet\Packages\nginxinc.nginx_Microsoft.Winget.Source_8wekyb3d8bbwe\nginx-1.29.5 -c conf/nginx.conf
```

Start or reload:

```powershell
nginx
nginx -s reload
```

### Waitress / Flask

Development:

```powershell
python -m content_manager.app
```

Production-style local run:

```powershell
waitress-serve --listen=127.0.0.1:8000 content_manager.app:app
```

### One-command startup

Start the local stack:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start-content-manager.ps1 -TunnelName audio-app
```

Fast app restart only:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\restart-content-manager.ps1
```

Runtime artifacts:
- `.run/content-manager/waitress.pid`
- `.run/content-manager/nginx.pid`
- `.run/content-manager/cloudflared.pid`
- `.run/content-manager/*.out.log`
- `.run/content-manager/*.err.log`

## Verification

Useful checks:

```powershell
Invoke-WebRequest http://127.0.0.1:8000/health -UseBasicParsing
Invoke-WebRequest http://127.0.0.1:5000/admin/upload -UseBasicParsing
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
