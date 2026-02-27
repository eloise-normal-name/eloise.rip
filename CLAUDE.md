# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Agent Identification

Identify yourself at the start of a work session using: `Agent: [Name] [abbr]`

Known models: Claudia [c35s], Olive [c3o], Haley [c3h], Opal [gpt4o], Nova [g53c], Gwen [gpt4], Grace [gpt3], Gemma [gem15], Flora [gem1f]. If your model isn't listed, add yourself to `.github/copilot-instructions.md` with a feminine or nonbinary name, then identify yourself.

Claude Sonnet 4.6 → **Sable [cs46]**

## Environment Setup

```bash
# Activate virtual environment (required before any Pelican commands)
.venv\Scripts\activate          # Windows
source .venv/bin/activate       # Linux/Mac

pip install -r requirements.txt
```

If `pelican` is not found, the virtual environment is not activated.

## Common Commands

```bash
# Build site
pelican content -o output -s pelicanconf.py

# Local preview (must be running before opening localhost:8000)
pelican -l

# Validate output (broken links, missing media, video/poster pairs)
python validate_output.py
python validate_output.py --check-external   # include external links (slow)

# Media transcoding (requires ffmpeg on PATH)
make transcode          # incremental
make transcode-force    # re-encode all

```

## Architecture

**Pelican** (Python static site generator) builds Markdown content into static HTML deployed to GitHub Pages.

### Content Pipeline
`content/articles/*.md` → Pelican + custom plugins → `output/` (static HTML, git-ignored)

- Articles: `content/articles/` → URL `/blog/{slug}.html`
- Pages: `content/pages/` → URL `/{slug}.html`
- Static extras (CNAME, favicons): `content/extra/` → output root
- Theme: `themes/cute-theme/` (Jinja2 templates + CSS)
- Pagination: 8 posts per page

### Media Pipeline
High-quality source files (`media-source/`, git-ignored) are transcoded via the Makefile+FFmpeg pipeline into web-optimized assets committed to `content/media/`:
- Images → AVIF (`content/media/images/`)
- Videos → HEVC MP4 + JPG poster (`content/media/video/`)
- Audio → M4A (`content/media/voice/`)

Only web-optimized files are committed (no Git LFS).

### Custom Plugins (`pelican-plugins/`)
Plugins hook into `signals.content_object_init` to replace inline markers in article/page content:

- **`video_embed`**: `[[video:name]]` → `<figure>` with `<video src="/media/video/name.mp4" poster="name.jpg">`
- **`carousel_embed`**: `[[carousel:label=Name;media/images/img.avif|Caption]]` → CSS carousel; uses PIL to probe image dimensions for aspect-ratio CSS variables

### Interactive Web Apps
- **Voice Recorder** (`content/pages/voice-recorder/`): Web Audio API app for pitch detection and recording. See `docs/voice-recorder.md` for architecture. Specialized agent available at `.github/agents/voice-affirming-audio-engineer.md`.
- **Hearing Age Test** (`content/pages/hearing-age/`): Canvas-based hearing assessment tool.

## Custom Content Syntax

Article template: `content/articles/template.md_`

```markdown
Title: Post Title
Date: 2025-10-01
Summary: Brief description
Category: Art
Tags: Tag1, Tag2
thumbnail: images/preview.avif

[[video:clip-name]]

[[carousel:label=Photo Set;
media/images/pic1.avif|Caption 1;
media/images/pic2.avif|Caption 2]]
```

## Python Conventions

- Use modern type hint syntax: `list[str]`, `dict[str, int]`, `tuple[Path, Path]` — not `List`, `Dict`, `Tuple` from `typing`
- Avoid `isinstance()` for type checking; use duck typing

## Working Rules

- Prefer minimal, targeted changes over broad refactors
- Do not introduce new build tools unless explicitly requested
- Keep edits consistent with existing file structure and naming

## Pull Request Expectations

- Explain what changed and why; include validation steps performed
- Keep diffs focused, avoid unrelated changes
- When resolving review comments: fix issues systematically, commit with a clear message, then post a review comment summarizing each issue's status (FIXED / ALREADY CORRECT / VERIFIED), the fixing commit hash, and validation results (build passing, zero broken links)
