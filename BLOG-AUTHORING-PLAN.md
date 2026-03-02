# Blog Authoring Page Implementation Plan

**Date:** March 1, 2026  
**Status:** Planning  
**Related:** `voice_uploader/` → `content-manager/` expansion

---

## I. Project Restructure

**Rename folder:** `voice_uploader/` → `content-manager/`

This better reflects the expanded scope (articles + voice uploads + general content management).

**Update references:**
- Any scripts in `scripts/` that start the voice uploader
- Documentation mentions (AGENTS.md, CLAUDE.md, README if any)
- Keep backward compatibility: redirect `/admin/upload` → `/admin/upload/voice` or make voice upload a tab in the new interface

---

## II. Backend Architecture (content-manager/app.py)

### A. New Data Structures

```python
# In-memory job tracking (similar to existing `jobs` dict)
article_jobs = {}      # Media transcoding jobs: {job_id: {...}}
drafts = {}            # Article drafts: {draft_id: {title, summary, ...}}
```

### B. New Routes

| Route | Method | Purpose |
|-------|--------|---------|
| `/admin/articles` | GET | Main authoring hub (list recent drafts, create new) |
| `/admin/articles/new` | GET | Article creation form |
| `/api/media/upload` | POST | Upload image/video, start transcoding job |
| `/api/media/jobs/<job_id>` | GET | Check transcoding status |
| `/api/media/list` | GET | List available uploaded media (for insertion) |
| `/api/article/draft` | POST | Save draft (auto-save) |
| `/api/article/publish` | POST | Create final article markdown file |
| `/api/article/preview` | POST | Generate HTML preview (optional) |

### C. Transcoding Pipeline

**Images** → AVIF (content/media/images/)

```bash
ffmpeg -i input.jpg -vf "scale='if(gt(iw,ih),min(1080,iw),-2)':'if(gt(ih,iw),min(1080,ih),-2)'" \
  -c:v libaom-av1 -crf 32 -b:v 0 output.avif
```

**Videos** → HEVC MP4 + JPG poster (content/media/video/)

```bash
# MP4
ffmpeg -i input.mov -vf "scale=..." -c:v libx265 -preset slow -crf 28 \
  -pix_fmt yuv420p -tag:v hvc1 -movflags +faststart \
  -c:a aac -b:a 160k output.mp4

# Poster (frame at 0.5s)
ffmpeg -i input.mov -ss 0.5 -vframes 1 -vf "scale=..." output.jpg
```

**Implementation approach:**
- Reuse Makefile logic but call ffmpeg directly from Python (like voice_uploader does)
- Store uploaded files in `media-source/` with unique prefix (job_id or timestamp)
- After transcoding, move to `content/media/images/` or `content/media/video/`
- Return final URL path (e.g., `/media/video/my-video.mp4`) for article insertion

### D. Article Generation

**Markdown template:**

```markdown
Title: {title}
Date: {date}  # auto-generated (YYYY-MM-DD)
Summary: {summary}
Category: {category}
Tags: {tag1, tag2, ...}
thumbnail: {thumbnail_path}  # e.g., media/video/poster.jpg or media/images/thumb.avif

{content}
```

**Slug generation:**
- From title: lowercase, replace spaces with hyphens, remove special chars
- Filename: `{slug}.md` (or `{date}-{slug}.md` if date prefix preferred)
- Write to `content/articles/`

**Content body:**
- User writes text content in Markdown
- Media syntax is **automatically generated** based on uploaded files:
  - **Single uploaded video** → prepends `[[video:basename]]` (basename without extension)
  - **Multiple uploaded images** → prepends `[[carousel:label={title} Gallery; ...]]` with all images
  - **Mixed media**: video + images → video first, then carousel of images
- Users can also manually add `[[video:]]` and `[[carousel:]]` syntax if they prefer
- The system tracks which media files are associated with the article and generates the appropriate Pelican plugin syntax automatically

### E. Git Integration (Optional)

- After article creation, run:
  ```python
  subprocess.run(["git", "add", str(article_path), *media_paths], ...)
  subprocess.run(["git", "commit", "-m", f"article: {title}"], ...)
  subprocess.run(["git", "push", "origin", "main"], ...)
  ```
- Configurable via env var: `AUTO_COMMIT=true/false`

---

## III. Frontend (content-manager/templates/author-article.html)

### A. Form Layout

**Section 1: Article Metadata**
- Title (text input, required)
- Summary (textarea, short)
- Category (text input or select from existing)
- Tags (autocomplete with existing/common tags + custom new tags, comma-separated)
- Thumbnail (file upload, image only, preview)

**Section 2: Content Editor**
- Large textarea for Markdown content
- Toolbar with buttons to insert uploaded media at cursor:
  - "Insert Video" → opens modal to select uploaded video
  - "Insert Carousel" → opens modal to select multiple images, add captions
- Live preview pane (optional, renders Markdown + video placeholders)

**Section 3: Media Upload**
- Drag-and-drop zone for images/videos
- List of uploads with:
  - Filename
  - Type (image/video)
  - Transcoding status (pending/processing/done/error)
  - Final path (when done)
  - Delete button (before transcoding completes)
- Progress bars for active transcoding jobs

**Section 4: Actions**
- "Save Draft" (auto-saves to in-memory store)
- "Publish" (validates all required fields, ensures all media transcoded, writes file)
- "Preview" (generates temporary HTML)

### B. JavaScript Features

- **Upload handling:** Fetch API with FormData, show progress
- **Job polling:** Every 2 seconds check status, update UI
- **Media library:** Fetch `/api/media/list` to show previously uploaded items (read-only)
- **Automatic syntax generation:** When media is uploaded, the system tracks it and automatically prepends `[[video:]]` or `[[carousel:]]` to the content editor based on media type count (no manual insertion needed)
- **Form validation:** Title and content required; if thumbnail missing, warn but allow
- **Auto-save draft:** Every 30 seconds or on field change (debounced)

### C. Styling

- Reuse CSS variables from `admin-upload.html`
- Card-based layout, responsive
- Status colors: blue (pending), yellow (processing), green (done), red (error)

---

## IV. Integration with Existing System

- **No changes to pelicanconf.py** (plugins already handle `[[video:]]` and `[[carousel:]]`)
- **No changes to Makefile** (still used for batch transcoding, but new feature uses direct ffmpeg)
- **Validation:** Run `make validate` after publishing to catch issues
- **Media storage:** All transcoded files go under `content/media/` (images, video, voice)
- **Git workflow:** Optional auto-commit; otherwise user commits manually

---

## V. Configuration & Environment

**Existing env vars (from voice_uploader):**
- `SECRET_KEY` - Flask secret
- `MAX_UPLOAD_MB` - Max upload size (default 200)
- `UPLOAD_DIR` - Source media dir (default `media-source`)
- `OUTPUT_DIR` - Transcoded output dir (default `content/media`)

**New env vars:**
- `AUTO_COMMIT` - If "true", commit article + media after publish (default "false")
- `GIT_REMOTE` - Git remote name (default "origin")
- `GIT_BRANCH` - Branch to push (default "main")
- `CONTENT_MANAGER_DEBUG` - Enable debug mode

---

## VI. Implementation Steps (Order of Work)

1. **Rename folder** `voice_uploader/` → `content-manager/`
   - Update any startup scripts
   - Test existing voice upload still works (if needed; could deprecate later)

2. **Extend app.py with media upload API**
   - Add `/api/media/upload` endpoint (handle images/videos)
   - Implement transcoding functions for images and videos
   - Add job tracking for media transcoding
   - Add `/api/media/jobs/<id>` and `/api/media/list` endpoints
   - Test by uploading media and checking output in `content/media/`

3. **Add article creation endpoints**
   - `/admin/articles/new` route (render form)
   - `/api/article/publish` endpoint (validate, write markdown)
   - Implement slug generation, frontmatter formatting
   - Test creating simple article with text only

4. **Build frontend form**
   - Create `author-article.html` template
   - Implement upload UI with status display
   - Add media insertion buttons (generate syntax)
   - Connect JavaScript to backend APIs
   - Test full flow: upload image → transcode → insert into content → publish

5. **Add draft saving** (optional but nice)
   - `/api/article/draft` endpoint
   - Auto-save logic in frontend

6. **Git integration**
   - Add commit/push logic after successful publish (if AUTO_COMMIT=true)
   - Show commit status in UI

7. **Validation & Testing**
   - Build site: `pelican content`
   - Run `python validate_output.py` - ensure no broken links
   - Test article appears on homepage, category pages, RSS
   - Test video embed and carousel rendering

8. **Documentation**
   - Update AGENTS.md and CLAUDE.md with new content-manager usage
   - Add README in content-manager/ with API docs and env vars
   - Update any deployment notes

---

## VII. Future Enhancements (Post-MVP)

- **Rich text editor** (e.g., SimpleMDE, Toast UI Editor) instead of raw textarea
- **Image carousel builder UI** (drag to reorder, caption editing)
- **Tag/category autocomplete** from existing articles
- **Draft persistence** to disk (not just memory)
- **Edit existing articles** (load markdown, update)
- **Delete article** (remove file, optionally remove unused media)
- **Media library cleanup** (find orphaned files)
- **Batch upload** (multiple files at once)
- **Video thumbnail selector** (choose poster frame)
- **Image optimization** (strip EXIF, compress further)
- **Accessibility improvements** (ARIA labels, keyboard nav)

---

## VIII. Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Transcoding failures (ffmpeg not installed) | Check ffmpeg availability at startup; show clear error |
| Large uploads time out | Increase `MAX_UPLOAD_MB`; show progress; allow background jobs |
| Git push conflicts | Pull before push; or skip auto-commit by default |
| Slug collisions | Append number if slug exists (e.g., `my-title-2.md`) |

| Memory leak from job/draft dicts | Add cleanup task (prune old jobs >24h, drafts >7d) |

---

## IX. Success Criteria

- [ ] Can create article with title, summary, category, tags, thumbnail
- [ ] Can upload images/videos and see them transcoded to `content/media/`
- [ ] Can insert `[[video:]]` and `[[carousel:]]` syntax into content
- [ ] Article appears in Pelican output after `pelican content`
- [ ] `validate_output.py` reports zero broken links and missing media
- [ ] (Optional) Auto-commit pushes to GitHub

---

## X. Notes

- The existing `voice_uploader` already demonstrates the pattern: Flask app, background transcoding via threading, git push integration
- The Makefile contains robust transcoding logic that can be adapted to Python subprocess calls
- Pelican plugins (`video_embed`, `carousel_embed`) already handle the custom syntax
- Media paths in articles should reference `/media/...` which maps to `content/media/` in output
- The `validate_output.py` script will catch any broken links or missing media before deployment
