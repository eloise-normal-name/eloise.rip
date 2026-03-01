## Agent Model Identification

When working on this repository, agents should identify themselves based on their underlying model to help track which models are being used and their effectiveness. Agents should reference this list and state their model at the beginning of their interaction.

### Supported Models
- **Claudia** [c35s] - Claude 3.5 Sonnet
- **Olive** [c3o] - Claude 3 Opus
- **Haley** [c3h] - Claude 3 Haiku
- **Opal** [gpt4o] - GPT-4o
- **Nova** [g53c] - GPT-5.3-Codex
- **Gwen** [gpt4] - GPT-4
- **Grace** [gpt3] - GPT-3.5
- **Gemma** [gem15] - Gemini 1.5 Pro
- **Flora** [gem1f] - Gemini 1.5 Flash

### Agent Identification Format
Agents should identify themselves at the start of their work session using the following format:

```
Agent: [Name] [abbr]
```

Example:
```
Agent: Claudia [c35s]
```

If your model is not in the list above, add yourself to this file with a feminine or nonbinary name, then identify yourself using the format above.

---

## Pelican Preview Workflow: Requirements & Common Mistakes

### Requirements for Correct Preview
- The Pelican server (`pelican -l`) must be running before opening any localhost preview.
- Always check server status before opening a preview; never assume.
- Use the correct script path for static assets in output (e.g., `./theme/voice-recorder/script.js`).

### Common Mistakes (Tally)
- Opening localhost preview without checking if Pelican server is running (repeated).
- Not verifying Pelican command availability in PATH.
- Using incorrect script/static asset paths in output.
- Asking unnecessary questions about server status instead of checking directly.

**Always follow these steps to avoid blank pages and ensure reliable previews.**

## Tooling Preflight (Copilot Agent)

- Before making file edits, confirm the patch/edit tool is enabled.
- Switching between Plan/Agent mode (or reconnecting) may disable editing tools without notification; if an edit tool call fails, ask the user to re-enable it and retry.
# eloise.rip - Personal Blog Codebase Guide

## Project Architecture

This is a **Pelican static site generator** project for a personal blog at [eloise.rip](https://eloise.rip). Content is authored in Markdown with custom media embedding and deployed to GitHub Pages.

### Key Components

- **Content Pipeline**: `content/articles/*.md` → Pelican → `output/` (static HTML)
- **Media Files**: Web-optimized media stored in `content/media/{video,images,voice}/` (transcoded locally to avoid Git LFS bandwidth limits)
- **Custom Plugins**: `pelican-plugins/{video_embed,carousel_embed}/` for `[[video:name]]` and `[[carousel:...]]` syntax
- **Theme**: `themes/cute-theme/` (custom Jinja2 templates + CSS)

## Critical Workflows

### Environment Setup

Install Python dependencies before running Pelican:

```bash
pip install -r requirements.txt
```

Key packages: `pelican==4.10.1`, `Markdown==3.6`, `Pillow==11.1.0`, `beautifulsoup4`, `requests`, `flask`, `waitress`.

### Building the Site
```bash
pelican content -ds pelicanconf.py  # Generate site to output/
```

### Local Preview
To preview the site at http://localhost, always ensure Pelican is serving the output directory:
```bash
pelican -l  # Starts local server at http://localhost:8000
```
Never open a localhost address unless the server is running.

### Validation
```bash
python validate_output.py                  # Check for broken links & missing media
python validate_output.py --check-external # Include external link validation (slow)
```
- Validates all internal links (`<a href>`), media files (`<img>`, `<video>`, `<audio>`)
- Checks video poster pairs (both `.mp4` + `.jpg` must exist)
- Reports orphaned/unused media files in `content/media/`
- Run before deployment to catch missing media

### Deployment
```bash
publish.bat  # Uses ghp-import to push output/ to gh-pages branch
```

## Python Code Conventions

**Type Annotations**: Use modern Python syntax - `list[str]`, `dict[str, int]`, `tuple[Path, Path]` - **NOT** the typing module (`List`, `Dict`, `Tuple`).

**Type Checking**: Avoid `isinstance()` for type validation. Rely on duck typing and structural patterns.

## Custom Content Syntax

### Video Embedding
```markdown
[[video:hop-hop-hop]]
```
Renders `<video>` tag with `/media/video/hop-hop-hop.mp4` + `.jpg` poster. Handled by `pelican-plugins/video_embed/`.

### Image Carousel
```markdown
[[carousel:label=Photo Set Name;
media/images/pic1.avif|Caption for pic 1;
media/images/pic2.avif|Caption for pic 2]]
```
Renders CSS-styled carousel. Handled by `pelican-plugins/carousel_embed/carousel_embed.py` - auto-detects image dimensions via PIL.

### Article Template
Use `content/articles/template.md_` as starting point. Metadata format:
```markdown
Title: Post Title
Date: 2025-10-01
Summary: Brief description
Category: Art
Tags: Tag1, Tag2
thumbnail: images/preview.avif
```

## Media Paths

- **Web-optimized media**: `content/media/video/`, `content/media/images/`, `content/media/voice/`
- **In Markdown**: Reference as `media/video/name.mp4` or `images/name.avif` (plugin normalizes paths)
- **Subdirectories**: Media can be organized in subdirs (e.g., `content/media/images/comics/page1.avif`)
- **Note**: Media transcoding happens in a local git repository due to limited Git LFS bandwidth. Only web-optimized files are committed to this repository.

## Configuration Details

- **Pelican config**: [pelicanconf.py](../pelicanconf.py) - sets paths, theme, plugins, markdown extensions
- **Pagination**: 8 posts per page (`DEFAULT_PAGINATION = 8`)
- **URL structure**: Articles → `/blog/{slug}.html`, Pages → `/{slug}.html`
- **Static files**: `content/extra/` files (CNAME, favicons) copied to output root via `EXTRA_PATH_METADATA`

## Development Notes

- **Dependencies**: [requirements.txt](../requirements.txt) - Pelican 4.10.1, Markdown 3.6, Pillow 11.1.0, beautifulsoup4 and requests for validation, flask and waitress for voice uploader
- **Media transcoding** requires `ffmpeg` on PATH
- **CSS analysis**: [analyze_styles.py](../analyze_styles.py) generates reports matching HTML elements to CSS rules
- **Link validation**: [validate_output.py](../validate_output.py) - post-build checker for broken links and missing media
- **Output directory** (`output/`) is gitignored - only source content is versioned

## Plugin Development

Plugins use Pelican's signal system. Example from [video_embed.py](../pelican-plugins/video_embed/video_embed.py):
```python
def register():
    signals.content_object_init.connect(replace_markers)
```

Plugins process `Article` and `Page` instances, modifying `instance._content` during initialization.
