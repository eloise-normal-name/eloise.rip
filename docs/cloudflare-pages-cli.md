# Cloudflare Pages CLI

Use Wrangler for agent-driven Cloudflare Pages work so site changes can be deployed and inspected without opening the Cloudflare dashboard.

## Prerequisites

- Node.js 20+ available on PATH
- Local install: `npm install`
- Cloudflare Pages project name: `eloise-rip`
- Cloudflare account credentials available as environment variables:
  - `CLOUDFLARE_API_TOKEN`
  - `CLOUDFLARE_ACCOUNT_ID`

Recommended token scope:

- `Cloudflare Pages:Edit`
- Add zone/DNS permissions only if agents also need to manage `eloise.rip` DNS

## Repo Commands

List Pages projects:

```powershell
npm run cf:pages:list
```

Download the Pages dashboard config for `eloise-rip`:

```powershell
npm run cf:pages:download-config
```

Deploy the generated static site in `output/` directly to Cloudflare Pages:

```powershell
npm run cf:pages:deploy
```

Tail the active Pages deployment:

```powershell
npm run cf:pages:tail
```

## Typical Agent Flow

1. Build the site:

```powershell
pelican content -o output -s pelicanconf.py
```

2. Validate the generated output:

```powershell
python validate_output.py
```

3. Deploy to Cloudflare Pages:

```powershell
npm run cf:pages:deploy
```

## Notes

- The default Cloudflare preview domain for this project is expected to stay on `*.eloise-rip.pages.dev`
- These commands do not replace the existing `admin.eloise.rip` tunnel workflow
- If the Pages project name changes, update the `cf:pages:*` scripts in `package.json`
