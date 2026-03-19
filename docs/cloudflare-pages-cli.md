# Cloudflare Pages CLI

Use Wrangler for agent-driven Cloudflare Pages work so site changes can be deployed and inspected without opening the Cloudflare dashboard.

## Prerequisites

- Wrangler available on PATH
- Cloudflare Pages project name: `eloise-rip`
- Repo-tracked Pages config: `wrangler.toml`
- Cloudflare account credentials available as environment variables:
  - `CLOUDFLARE_API_TOKEN`
  - `CLOUDFLARE_ACCOUNT_ID`
- Cloudflare Pages build settings should stay as simple as possible and rely on the standard Pelican setup unless a specific override is needed
- GitHub Actions are not used for site deployment or validation in this repo; Cloudflare Pages is the deploy system

Recommended token scope:

- `Cloudflare Pages:Edit`
- Add zone/DNS permissions only if agents also need to manage `eloise.rip` DNS

## Local Commands

List Pages projects:

```powershell
wrangler pages project list
```

Download the Pages dashboard config for `eloise-rip`:

```powershell
wrangler pages download config eloise-rip
```

Deploy the generated static site in `output/` directly to Cloudflare Pages:

```powershell
wrangler pages deploy output --project-name=eloise-rip
```

Tail the active Pages deployment:

```powershell
wrangler pages deployment tail --project-name=eloise-rip
```

## Typical Agent Flow

1. Build the site:

```powershell
pelican
```

2. Validate the generated output:

```powershell
python validate_output.py
```

3. Deploy to Cloudflare Pages:

```powershell
wrangler pages deploy output --project-name=eloise-rip
```

## Notes

- The default Cloudflare preview domain for this project is expected to stay on `*.eloise-rip.pages.dev`
- These commands do not replace the existing `admin.eloise.rip` tunnel workflow
- If the Pages project name changes, update the direct `wrangler` commands in this doc and in `publish.sh`
- `wrangler.toml` should be kept aligned with the live Cloudflare Pages project settings

## Git-Driven Build Filters

The live Pages project is connected directly to GitHub and currently auto-builds `main` with these path filters:

- Includes: `content/**`, `themes/**`, `pelican-plugins/**`, `pelicanconf.py`, `requirements.txt`
- Excludes: `.github/**`, `docs/**`, `AGENTS.md`, `Makefile`, `package.json`, `package-lock.json`, `wrangler.toml`, `publish.sh`, `scripts/**`, `nginx/**`, `cloudflared/**`, `content_manager/**`, `media-source/**`, `.run/**`, `worktrees/**`

The `**` syntax is correct here. Cloudflare Pages uses glob-style recursive matching, so `content/**` means "anything under `content/` at any depth". The recent skipped deploys were consistent with these live filters.
