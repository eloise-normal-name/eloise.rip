# Content Organization Plan

**Author:** Sable [cs46]
**Date:** 2026-03-02
**Status:** Proposal — not yet implemented

---

## Current State

The site has **64 articles** spanning Sep 2025 – Mar 2026, all living flat inside `content/articles/`:

```
content/
  articles/
    cat-coin-purse.md
    catgirl-goblin-pics-and-art.md
    boogie-woogie.md
    ... (64 files, no subfolders)
  media/
    images/   ← 135 files, all flat
    video/    ← 188 paired .mp4 + .jpg files, all flat
    voice/    ← 22 .m4a files
```

Articles reference media in three ways:
- `[[video:name]]` → resolves to `/media/video/{name}.mp4`
- `[[carousel:...; media/images/file.avif|caption; ...]]` → resolves to `/media/images/`
- `![alt](../media/images/file.avif)` → standard Markdown relative paths

**Pain points with the flat layout:**
- Finding the images or video for a specific article means scanning 135+ image files and 188+ video files with no grouping
- Editing or replacing media for a post requires knowing the media names ahead of time
- No visual connection between `boogie-woogie.md` and `boogie-and-woogie.mp4` — different naming conventions make the link non-obvious

---

## What Other Systems Do

### Hugo — Page Bundles (leaf bundles)

Hugo's most popular pattern. Each post is a folder; its content and media live together:

```
content/
  posts/
    2025/10/cat-coin-purse/
      index.md
      cat-purse-with-book.avif
      cat-purse-demo.mp4
```

- Media paths in Markdown are relative: `![alt](cat-purse-with-book.avif)`
- Hugo copies the folder's assets into the output at the same path
- **Strong co-location** — everything for a post is in one place
- Used by: Hugo (native), Gatsby (via MDX co-location), Astro (content collections)

### Jekyll — `_posts/` with centralized assets

Jekyll's default keeps posts in a flat `_posts/` folder (date-prefixed filenames) and assets in a separate `assets/` tree:

```
_posts/
  2025-10-07-cat-coin-purse.md
assets/
  images/
    cat-coin-purse/
      cat-purse-with-book.jpg
```

- Some users manually mirror the post slug into the asset path to group related media
- Not natively enforced — it's a convention
- **Moderate co-location** — grouped by name, still separate directories

### Obsidian / plain Markdown wikis

Common in knowledge-management tools (Obsidian, Logseq, Notion exports):

```
notes/
  2025/
    10-October/
      cat-coin-purse.md
      cat-coin-purse-assets/
        cat-purse-with-book.avif
```

- Month folders give chronological browsing in file explorers
- Asset subfolder named after the note keeps everything together
- Popular for personal sites and digital gardens

### Eleventy — `_data` + flexible input

Eleventy has no enforced structure. A common community pattern:

```
src/
  posts/
    2025-10/
      cat-coin-purse.md
      images/
        cat-purse-with-book.avif
```

- Month prefix on the folder groups posts naturally
- Eleventy's `addPassthroughCopy` can serve anything under `src/`

---

## Proposed Options for This Site

### Option A — Articles by Month, Media Stays Flat

**Lowest friction.** Only reorganize the Markdown files. Media stays in `content/media/`.

```
content/
  articles/
    2025/09/
    2025/10/
      cat-coin-purse.md
      halloween-2025.md
      ... (22 articles)
    2025/11/  (17 articles)
    2025/12/  (9 articles)
    2026/01/  (6 articles)
    2026/02/  (8 articles)
    2026/03/  (1 article)
  media/
    images/   ← unchanged
    video/    ← unchanged
    voice/    ← unchanged
```

**What changes:**
- Article files move into date subfolders
- Pelican `ARTICLE_PATHS` or `PATH` config needs updating (Pelican recursively scans subdirectories by default — it *should* just work, but this needs testing)
- The `../media/images/` relative paths in article Markdown **will break** — they'd need to become `../../media/images/` or switch to absolute `/media/images/` paths

**What stays the same:**
- All plugin code unchanged
- All media files unchanged
- Site URLs unchanged (Pelican uses slugs, not file paths, for URLs)

**Pros:** Simple to do, easy to undo, chronological browsing in file explorer
**Cons:** Media and articles still disconnected — finding the video for a post still requires searching the flat media folder

---

### Option B — Articles by Month + Media Mirrored by Month

**Medium effort.** Articles in month folders; media organized into matching month subfolders.

```
content/
  articles/
    2025/10/
      cat-coin-purse.md
  media/
    images/
      2025/10/
        cat-purse-with-book.avif
        cat-purse-blender.avif
    video/
      2025/10/
        cat-purse-demo.mp4
        cat-purse-demo.jpg
```

**What changes:**
- Both articles and media move into `YYYY/MM/` subfolders
- All Markdown image references update to include the date subfolder: `../media/images/2025/10/file.avif` (or absolute `/media/images/2025/10/file.avif`)
- All `[[carousel:...]]` paths update to include the date subfolder
- `[[video:name]]` plugin needs the path prefix made configurable (currently hardcoded to `/media/video/`) — could stay flat if videos aren't moved, or plugin updated to accept a path
- The `validate_output.py` script likely continues working since it checks the built `output/` directory
- The transcode Makefile (`make transcode`) references source/dest paths — those paths need updating

**Pros:** Articles and their media are in parallel date folders — easy to match up by date
**Cons:** Media shared across articles (rare but possible) is ambiguous on which folder to put it in; more files to move; more reference paths to update

---

### Option C — Per-Article Bundle (Hugo-style, most co-located)

**Highest effort, highest payoff.** Each article becomes a folder with its own media.

```
content/
  articles/
    2025/10/
      cat-coin-purse/
        index.md
        cat-purse-with-book.avif
        cat-purse-blender.avif
        cat-purse-demo.mp4
        cat-purse-demo.jpg    ← video poster
      halloween-2025/
        index.md
        ...
  media/
    voice/    ← audio stays centralized (not post-specific)
    voice-recorder/
```

Pelican does not natively support page bundles. Making this work would require a custom plugin that:
1. Copies article-local media files into `output/media/<slug>/` during the build
2. Rewrites image paths in the rendered HTML
3. Possibly extends `video_embed` and `carousel_embed` to look for local files first

**Pros:** Maximum co-location — open a post folder, everything for that post is right there; easiest for editing/replacing individual post media
**Cons:** Significant plugin work; Pelican not designed for this; shared media (site-wide images used across posts) needs a separate home; moves ~300+ media files

---

## Recommendation

**Start with Option A, then selectively do Option B for new articles going forward.**

Rationale:
- Option A is low-risk and immediately solves the "64 articles flat in one folder" problem with minimal code changes
- Once articles are date-organized, any new article and its media can be placed in the right month folder manually (Option B), without needing a mass migration of existing media
- Option C is a compelling long-term target but requires non-trivial Pelican plugin work that should be a separate project

### Phased Plan

**Phase 1 — Organize articles into `YYYY/MM/` subfolders**
1. Create `content/articles/2025/09/`, `2025/10/`, etc.
2. Move each `.md` file into the matching folder based on its `Date:` frontmatter
3. Fix relative image paths: change `../media/images/` → `/media/images/` (absolute paths avoid depth-sensitivity and are simpler)
4. Test: `pelican content -o output -s pelicanconf.py` — confirm all 64 articles still build, URLs unchanged
5. Run `python validate_output.py` — confirm zero broken links

**Phase 2 — New articles co-locate media (going forward only)**
- When writing a new article, place it in `content/articles/YYYY/MM/`
- Place that article's images in `content/media/images/YYYY/MM/` and its videos in `content/media/video/YYYY/MM/`
- Use absolute paths in Markdown and carousel markers: `/media/images/2026/03/my-image.avif`
- `[[video:2026/03/my-video]]` — this requires a minor update to `video_embed.py` to support slashes in the name field (currently only allows `[a-zA-Z0-9._-]`)

**Phase 3 (optional, future) — Per-article bundles**
- Research Pelican page bundle plugins or write a custom one
- Migrate high-traffic or frequently-edited articles first as a pilot

---

## Implementation Notes

### Absolute vs. Relative Paths

Currently articles use `../media/images/file.avif`. Moving articles into subfolders makes these paths break (`../../media/images/` for one level, `../../../media/images/` for two).

**Recommended fix during Phase 1:** Globally replace `../media/` with `/media/` in all article files. Absolute paths are depth-independent and Pelican serves them correctly.

### Pelican Config

Pelican's default `ARTICLE_PATHS = ['articles']` scans recursively, so subdirectories under `content/articles/` should be picked up automatically. No config change expected, but confirm with a test build after Phase 1.

### video_embed Plugin

The name regex `[a-zA-Z0-9._-]+` would need a `/` added to support `[[video:2026/03/name]]` in Phase 2. Small one-line change.

### content_manager

The Flask content manager's article-creation endpoint writes new articles to a configured path. If Phase 1 is done, the content manager should be updated to write new articles to `content/articles/YYYY/MM/` based on the post date.

---

## Migration Script Sketch (Phase 1)

A Python script could automate Phase 1:

```python
import re, shutil
from pathlib import Path

articles = Path("content/articles")
for md in articles.glob("*.md"):
    date_match = re.search(r"^Date:\s*(\d{4})-(\d{2})", md.read_text(), re.M)
    if not date_match:
        continue
    year, month = date_match.groups()
    dest = articles / year / month / md.name
    dest.parent.mkdir(parents=True, exist_ok=True)
    # Fix relative media paths before moving
    text = md.read_text().replace("../media/", "/media/")
    dest.write_text(text)
    md.unlink()
```

This script should be reviewed and run with a dry-run mode first.
