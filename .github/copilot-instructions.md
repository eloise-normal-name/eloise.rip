# eloise.rip - Personal Blog Codebase Guide

## Project Architecture

This is a **Pelican static site generator** project for a personal blog at [eloise.rip](https://eloise.rip). Content is authored in Markdown with custom media embedding, transcoded for web delivery, and deployed to GitHub Pages.

### Key Components

- **Content Pipeline**: `content/articles/*.md` → Pelican → `output/` (static HTML)
- **Media Workflow**: `media-source/` → `transcode_videos.py` → `content/media/{video,images,voice}/`
- **Custom Plugins**: `pelican-plugins/{video_embed,carousel_embed}/` for `[[video:name]]` and `[[carousel:...]]` syntax
- **Theme**: `themes/cute-theme/` (custom Jinja2 templates + CSS)

## Critical Workflows

### Environment Setup
```bash
# Windows
.venv\Scripts\activate

# Linux/Mac
source .venv/bin/activate

pip install -r requirements.txt
```

### Building the Site
```bash
pelican content -ds pelicanconf.py  # Generate site to output/
```

### Media Transcoding
```bash
python transcode_videos.py  # Convert media-source/ → content/media/
```
- Creates HEVC MP4 + JPG poster for videos
- Creates AVIF for images (including HEIC sources via pillow-heif)
- Creates AAC M4A for audio files
- Files ending with `_hq` suffix get lower CRF (higher quality) encoding

### Validation
```bash
python validate_output.py                  # Check for broken links & missing media
python validate_output.py --check-external # Include external link validation (slow)
```
- Validates all internal links (`<a href>`), media files (`<img>`, `<video>`, `<audio>`)
- Checks video poster pairs (both `.mp4` + `.jpg` must exist)
- Reports orphaned/unused media files in `content/media/`
- Run before deployment to catch missing transcoded assets

### Deployment
```bash
publish.bat  # Uses ghp-import to push output/ to gh-pages branch
```

## Python Code Conventions

**Type Annotations**: Use modern Python syntax - `list[str]`, `dict[str, int]`, `tuple[Path, Path]` - **NOT** the typing module (`List`, `Dict`, `Tuple`).

**Type Checking**: Avoid `isinstance()` for type validation. Rely on duck typing and structural patterns.

**Example from transcode_videos.py**:
```python
def discover_sources(src_dir: Path) -> list[tuple[Path, Path]]:
    results = []
    for p in sorted(src_dir.rglob('*')):
        if p.is_file() and p.suffix.lower() in ALLOWED_EXT:
            rel_parent = p.parent.relative_to(src_dir)
            results.append((p, rel_parent))
    return results
```

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

- **Source masters**: `media-source/` (original quality videos/images)
- **Web-optimized outputs**: `content/media/video/`, `content/media/images/`, `content/media/voice/`
- **In Markdown**: Reference as `media/video/name.mp4` or `images/name.avif` (plugin normalizes paths)
- **Subdirectories**: Media can be organized in subdirs - `media-source/comics/page1.png` → `content/media/images/comics/page1.avif`

## Configuration Details

- **Pelican config**: [pelicanconf.py](pelicanconf.py) - sets paths, theme, plugins, markdown extensions
- **Pagination**: 8 posts per page (`DEFAULT_PAGINATION = 8`)
- **URL structure**: Articles → `/blog/{slug}.html`, Pages → `/{slug}.html`
- **Static files**: `content/extra/` files (CNAME, favicons) copied to output root via `EXTRA_PATH_METADATA`

## Development Notes

- **Virtual environment**: Use `.venv/` - activate before running any commands (`source .venv/bin/activate` or `.venv\Scripts\activate` on Windows)
- **Dependencies**: [requirements.txt](requirements.txt) - Pelican 4.10.1, Pillow 11.1.0, pillow-heif for HEIC support, beautifulsoup4 and requests for validation
- **Media transcoding** requires `ffmpeg` on PATH
- **CSS analysis**: [analyze_styles.py](analyze_styles.py) generates reports matching HTML elements to CSS rules
- **Link validation**: [validate_output.py](validate_output.py) - post-build checker for broken links and missing media
- **Output directory** (`output/`) is gitignored - only source content is versioned

## Plugin Development

Plugins use Pelican's signal system. Example from [video_embed.py](pelican-plugins/video_embed/video_embed.py):
```python
def register():
    signals.content_object_init.connect(replace_markers)
```

Plugins process `Article` and `Page` instances, modifying `instance._content` during initialization.
