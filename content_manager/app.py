import os
import re
import subprocess
import threading
import uuid
from datetime import datetime, timezone
from pathlib import Path

from flask import Flask, abort, jsonify, redirect, render_template, request, send_file
from werkzeug.utils import secure_filename

app = Flask(__name__)
app.secret_key = os.getenv("SECRET_KEY", "dev-only-change-me")
app.config["MAX_CONTENT_LENGTH"] = int(os.getenv("MAX_UPLOAD_MB", "200")) * 1024 * 1024
app.config["TEMPLATES_AUTO_RELOAD"] = True

REPO_ROOT = Path(subprocess.run(
    ["git", "rev-parse", "--show-toplevel"],
    capture_output=True, text=True, check=True,
).stdout.strip())
UPLOAD_DIR = REPO_ROOT / os.getenv("UPLOAD_DIR", "media-source")
VOICE_DIR = REPO_ROOT / os.getenv("OUTPUT_DIR", "content/media/voice")
IMAGES_DIR = REPO_ROOT / "content" / "media" / "images"
VIDEO_DIR = REPO_ROOT / "content" / "media" / "video"
ARTICLES_DIR = REPO_ROOT / "content" / "articles"
OUTPUT_FORMAT = "m4a"
CLIP_ID_PATTERN = re.compile(r"(\d{2}-\d{2})")

AUTO_COMMIT = os.getenv("AUTO_COMMIT", "false").lower() == "true"
GIT_REMOTE = os.getenv("GIT_REMOTE", "origin")
GIT_BRANCH = os.getenv("GIT_BRANCH", "main")

MAX_DIMENSION = 1080
CRF_AVIF = 32
CRF_HEVC = 28
HEVC_PRESET = "slow"
HEVC_AUDIO_BITRATE = "160k"
POSTER_TIME = "0.5"

IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".bmp", ".tiff", ".tif", ".webp"}
VIDEO_EXTENSIONS = {".mp4", ".mov", ".mkv", ".avi", ".webm", ".m4v", ".gif"}

for d in (UPLOAD_DIR, VOICE_DIR, IMAGES_DIR, VIDEO_DIR, ARTICLES_DIR):
    d.mkdir(parents=True, exist_ok=True)

# --- Job tracking ---

jobs_lock = threading.Lock()
jobs = {}          # voice upload jobs
media_jobs = {}    # media transcoding jobs
drafts = {}        # article drafts


def _set_job(store: dict, job_id: str, **updates) -> None:
    with jobs_lock:
        if job_id in store:
            store[job_id].update(updates)


def set_job(job_id: str, **updates) -> None:
    _set_job(jobs, job_id, **updates)


def set_media_job(job_id: str, **updates) -> None:
    _set_job(media_jobs, job_id, **updates)


# --- FFmpeg helpers ---

def _scale_filter() -> str:
    d = MAX_DIMENSION
    return f"scale='if(gt(iw,ih),min({d},iw),-2)':'if(gt(ih,iw),min({d},ih),-2)'"


def _run_ffmpeg(args: list[str]) -> str:
    result = subprocess.run(
        ["ffmpeg", *args],
        capture_output=True, text=True,
    )
    if result.returncode != 0:
        raise RuntimeError((result.stderr or "ffmpeg failed")[-1200:])
    return result.stdout


def transcode_image(input_path: Path, output_path: Path) -> None:
    _run_ffmpeg([
        "-y", "-i", str(input_path),
        "-vf", _scale_filter(),
        "-c:v", "libaom-av1", "-crf", str(CRF_AVIF), "-b:v", "0",
        str(output_path),
    ])


def transcode_video(input_path: Path, mp4_path: Path, poster_path: Path) -> None:
    _run_ffmpeg([
        "-y", "-i", str(input_path),
        "-vf", _scale_filter(),
        "-c:v", "libx265", "-preset", HEVC_PRESET, "-crf", str(CRF_HEVC),
        "-pix_fmt", "yuv420p", "-tag:v", "hvc1", "-movflags", "+faststart",
        "-c:a", "aac", "-b:a", HEVC_AUDIO_BITRATE,
        str(mp4_path),
    ])
    _run_ffmpeg([
        "-y", "-i", str(input_path),
        "-ss", POSTER_TIME, "-vframes", "1",
        "-vf", _scale_filter(),
        str(poster_path),
    ])


# --- Git helpers ---

def git_run(cmd: list[str]) -> None:
    subprocess.run(cmd, capture_output=True, text=True, check=True, cwd=REPO_ROOT)


def git_push_transcoded(output_path: Path) -> str | None:
    """Stage, commit, and push one transcoded file. Returns an error string or None."""
    try:
        git_run(["git", "add", str(output_path)])
        git_run(["git", "commit", "-m", f"audio: add {output_path.name}"])
        git_run(["git", "push", GIT_REMOTE, GIT_BRANCH])
        return None
    except FileNotFoundError:
        return "git not found in PATH"
    except subprocess.CalledProcessError as err:
        return (err.stderr or err.stdout or "git command failed")[-800:]


def git_push_article(article_path: Path, media_paths: list[Path]) -> str | None:
    """Stage, commit, and push article + media files. Returns error string or None."""
    if not AUTO_COMMIT:
        return None
    try:
        paths = [str(article_path)] + [str(p) for p in media_paths]
        git_run(["git", "add", *paths])
        title = article_path.stem.replace("-", " ")
        git_run(["git", "commit", "-m", f"article: {title}"])
        git_run(["git", "push", GIT_REMOTE, GIT_BRANCH])
        return None
    except FileNotFoundError:
        return "git not found in PATH"
    except subprocess.CalledProcessError as err:
        return (err.stderr or err.stdout or "git command failed")[-800:]


# --- Slug generation ---

def slugify(text: str) -> str:
    text = text.lower().strip()
    text = re.sub(r"[^\w\s-]", "", text)
    text = re.sub(r"[\s_]+", "-", text)
    text = re.sub(r"-+", "-", text)
    return text.strip("-")


def unique_article_path(slug: str, date_str: str) -> Path:
    year, month = date_str[:4], date_str[5:7]
    folder = ARTICLES_DIR / year / month
    folder.mkdir(parents=True, exist_ok=True)
    path = folder / f"{slug}.md"
    if not path.exists():
        return path
    n = 2
    while True:
        path = folder / f"{slug}-{n}.md"
        if not path.exists():
            return path
        n += 1


# --- Voice upload (existing functionality) ---

def build_output_filename(input_name: str) -> str | None:
    match = CLIP_ID_PATTERN.search(Path(input_name).stem)
    return f"{match.group(1)}.{OUTPUT_FORMAT}" if match else None


def transcode_audio(job_id: str, input_path: Path, output_filename: str) -> None:
    set_job(job_id, status="processing")
    output_file = VOICE_DIR / output_filename

    command = [
        "ffmpeg", "-y", "-i", str(input_path),
        "-vn", "-c:a", "aac", "-b:a", "128k",
        "-movflags", "+faststart",
        str(output_file),
    ]

    try:
        subprocess.run(command, capture_output=True, text=True, check=True)
        push_error = git_push_transcoded(output_file)
        set_job(
            job_id,
            status="done",
            output_path=str(output_file),
            output_filename=output_filename,
            completed_at=datetime.now(timezone.utc).isoformat(),
            push_error=push_error,
        )
    except FileNotFoundError:
        set_job(job_id, status="error", error="ffmpeg not found in PATH")
    except subprocess.CalledProcessError as err:
        set_job(job_id, status="error", error=(err.stderr or "ffmpeg failed")[-1200:])


# --- Media transcoding (new: images + videos) ---

def _classify_media(filename: str) -> str | None:
    ext = Path(filename).suffix.lower()
    if ext in IMAGE_EXTENSIONS:
        return "image"
    if ext in VIDEO_EXTENSIONS:
        return "video"
    return None


def transcode_media_job(job_id: str, input_path: Path, media_type: str, name: str) -> None:
    set_media_job(job_id, status="processing")
    try:
        if media_type == "image":
            output_path = IMAGES_DIR / f"{name}.avif"
            transcode_image(input_path, output_path)
            set_media_job(
                job_id,
                status="done",
                output_path=str(output_path),
                final_url=f"/media/images/{name}.avif",
                completed_at=datetime.now(timezone.utc).isoformat(),
            )
        elif media_type == "video":
            mp4_path = VIDEO_DIR / f"{name}.mp4"
            poster_path = VIDEO_DIR / f"{name}.jpg"
            transcode_video(input_path, mp4_path, poster_path)
            set_media_job(
                job_id,
                status="done",
                output_path=str(mp4_path),
                poster_path=str(poster_path),
                final_url=f"/media/video/{name}.mp4",
                poster_url=f"/media/video/{name}.jpg",
                completed_at=datetime.now(timezone.utc).isoformat(),
            )
    except FileNotFoundError:
        set_media_job(job_id, status="error", error="ffmpeg not found in PATH")
    except RuntimeError as err:
        set_media_job(job_id, status="error", error=str(err)[-1200:])


# ============================================================
# Routes
# ============================================================

@app.get("/health")
def health():
    return jsonify({"status": "ok"})


@app.get("/")
def index():
    return redirect("/admin/articles/new", code=302)


# --- Voice upload routes (backward-compatible) ---

@app.get("/admin/upload")
def admin_upload_redirect():
    return redirect("/admin/upload/voice", code=302)


@app.get("/admin/upload/voice")
def admin_upload_voice():
    return render_template("admin-upload.html")


@app.post("/api/upload")
def upload_audio():
    file = request.files.get("file")
    if not file or not file.filename:
        return jsonify({"error": "no file uploaded"}), 400

    safe_name = secure_filename(file.filename)
    if not safe_name.lower().endswith(".qta"):
        return jsonify({"error": "unsupported input file type; only .qta is accepted"}), 400

    output_filename = build_output_filename(safe_name)
    if not output_filename:
        return jsonify({"error": "invalid filename; must include clip id in ##-## format (example: guid_02-10.qta)"}), 400

    job_id = str(uuid.uuid4())
    input_path = UPLOAD_DIR / f"{job_id}_{safe_name}"
    file.save(input_path)

    created_at = datetime.now(timezone.utc).isoformat()
    with jobs_lock:
        jobs[job_id] = {
            "status": "pending",
            "input_filename": safe_name,
            "output_format": OUTPUT_FORMAT,
            "output_filename": output_filename,
            "output_path": None,
            "error": None,
            "push_error": None,
            "created_at": created_at,
            "completed_at": None,
        }

    threading.Thread(
        target=transcode_audio,
        args=(job_id, input_path, output_filename),
        daemon=True,
    ).start()

    return jsonify({"job_id": job_id, "status_url": f"/api/jobs/{job_id}"})


@app.get("/api/jobs/<job_id>")
def job_status(job_id: str):
    with jobs_lock:
        job = jobs.get(job_id)
    if not job:
        return jsonify({"status": "not_found"}), 404

    response = {
        "status": job["status"],
        "input_filename": job["input_filename"],
        "output_format": job["output_format"],
        "output_filename": job["output_filename"],
        "error": job["error"],
        "push_error": job["push_error"],
        "created_at": job["created_at"],
        "completed_at": job["completed_at"],
    }
    if job["status"] == "done":
        response["download_url"] = f"/api/download/{job_id}"
    return jsonify(response)


@app.get("/api/download/<job_id>")
def download_output(job_id: str):
    with jobs_lock:
        job = jobs.get(job_id)
    if not job or job["status"] != "done" or not job.get("output_path"):
        abort(404)

    output_path = Path(job["output_path"])
    if not output_path.exists():
        abort(404)

    return send_file(output_path, as_attachment=True, download_name=job["output_filename"])


# --- Media upload routes (new) ---

@app.post("/api/media/upload")
def upload_media():
    file = request.files.get("file")
    if not file or not file.filename:
        return jsonify({"error": "no file uploaded"}), 400

    safe_name = secure_filename(file.filename)
    media_type = _classify_media(safe_name)
    if not media_type:
        return jsonify({"error": f"unsupported file type; accepted: {', '.join(sorted(IMAGE_EXTENSIONS | VIDEO_EXTENSIONS))}"}), 400

    job_id = str(uuid.uuid4())
    name = Path(safe_name).stem
    # Prefix with job_id to avoid collisions in media-source
    input_path = UPLOAD_DIR / f"{job_id}_{safe_name}"
    file.save(input_path)

    created_at = datetime.now(timezone.utc).isoformat()
    with jobs_lock:
        media_jobs[job_id] = {
            "status": "pending",
            "media_type": media_type,
            "input_filename": safe_name,
            "name": name,
            "output_path": None,
            "poster_path": None,
            "final_url": None,
            "poster_url": None,
            "error": None,
            "created_at": created_at,
            "completed_at": None,
        }

    threading.Thread(
        target=transcode_media_job,
        args=(job_id, input_path, media_type, name),
        daemon=True,
    ).start()

    return jsonify({"job_id": job_id, "media_type": media_type, "name": name})


@app.get("/api/media/jobs/<job_id>")
def media_job_status(job_id: str):
    with jobs_lock:
        job = media_jobs.get(job_id)
    if not job:
        return jsonify({"status": "not_found"}), 404

    return jsonify({
        "status": job["status"],
        "media_type": job["media_type"],
        "input_filename": job["input_filename"],
        "name": job["name"],
        "final_url": job["final_url"],
        "poster_url": job.get("poster_url"),
        "error": job["error"],
        "created_at": job["created_at"],
        "completed_at": job["completed_at"],
    })


@app.get("/api/media/list")
def list_media():
    """List all transcoded media available for article insertion."""
    images = []
    for f in sorted(IMAGES_DIR.glob("*.avif")):
        images.append({
            "name": f.stem,
            "url": f"/media/images/{f.name}",
            "type": "image",
        })

    videos = []
    for f in sorted(VIDEO_DIR.glob("*.mp4")):
        poster = VIDEO_DIR / f"{f.stem}.jpg"
        videos.append({
            "name": f.stem,
            "url": f"/media/video/{f.name}",
            "poster_url": f"/media/video/{f.stem}.jpg" if poster.exists() else None,
            "type": "video",
        })

    return jsonify({"images": images, "videos": videos})


# --- Article routes (new) ---

@app.get("/admin/articles")
def articles_hub():
    return redirect("/admin/articles/new", code=302)


@app.get("/admin/articles/new")
def new_article():
    return render_template("author-article.html")


@app.post("/api/article/draft")
def save_draft():
    data = request.get_json(silent=True)
    if not data:
        return jsonify({"error": "invalid JSON body"}), 400

    draft_id = data.get("draft_id") or str(uuid.uuid4())
    with jobs_lock:
        drafts[draft_id] = {
            "title": data.get("title", ""),
            "summary": data.get("summary", ""),
            "category": data.get("category", ""),
            "tags": data.get("tags", ""),
            "thumbnail": data.get("thumbnail", ""),
            "content": data.get("content", ""),
            "media_jobs": data.get("media_jobs", []),
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }

    return jsonify({"draft_id": draft_id, "status": "saved"})


@app.get("/api/article/draft/<draft_id>")
def get_draft(draft_id: str):
    with jobs_lock:
        draft = drafts.get(draft_id)
    if not draft:
        return jsonify({"error": "draft not found"}), 404
    return jsonify({"draft_id": draft_id, **draft})


@app.post("/api/article/publish")
def publish_article():
    data = request.get_json(silent=True)
    if not data:
        return jsonify({"error": "invalid JSON body"}), 400

    title = (data.get("title") or "").strip()
    if not title:
        return jsonify({"error": "title is required"}), 400

    content = (data.get("content") or "").strip()
    if not content:
        return jsonify({"error": "content is required"}), 400

    summary = (data.get("summary") or "").strip()
    category = (data.get("category") or "").strip()
    tags = (data.get("tags") or "").strip()
    thumbnail = (data.get("thumbnail") or "").strip()
    media_job_ids = data.get("media_jobs", [])

    # Check all media jobs are done
    media_paths = []
    with jobs_lock:
        for mjid in media_job_ids:
            mj = media_jobs.get(mjid)
            if not mj:
                return jsonify({"error": f"unknown media job: {mjid}"}), 400
            if mj["status"] != "done":
                return jsonify({"error": f"media job {mjid} not complete (status: {mj['status']})"}), 400
            if mj.get("output_path"):
                media_paths.append(Path(mj["output_path"]))
            if mj.get("poster_path"):
                media_paths.append(Path(mj["poster_path"]))

    # Build media syntax prefix
    media_prefix = _build_media_prefix(media_job_ids, title)

    # Build markdown
    date_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    slug = slugify(title)
    article_path = unique_article_path(slug, date_str)

    lines = [
        f"Title: {title}",
        f"Date: {date_str}",
    ]
    if summary:
        lines.append(f"Summary: {summary}")
    if category:
        lines.append(f"Category: {category}")
    if tags:
        lines.append(f"Tags: {tags}")
    if thumbnail:
        lines.append(f"thumbnail: {thumbnail}")

    lines.append("")  # blank line after metadata
    if media_prefix:
        lines.append(media_prefix)
        lines.append("")
    lines.append(content)
    lines.append("")  # trailing newline

    article_path.write_text("\n".join(lines), encoding="utf-8")

    # Optional git push
    push_error = git_push_article(article_path, media_paths)

    return jsonify({
        "status": "published",
        "slug": slug,
        "path": str(article_path.relative_to(REPO_ROOT)),
        "push_error": push_error,
    })


def _build_media_prefix(media_job_ids: list[str], title: str) -> str:
    """Generate [[video:]] and [[carousel:]] syntax from completed media jobs."""
    videos = []
    images = []

    with jobs_lock:
        for mjid in media_job_ids:
            mj = media_jobs.get(mjid)
            if not mj or mj["status"] != "done":
                continue
            if mj["media_type"] == "video":
                videos.append(mj["name"])
            elif mj["media_type"] == "image":
                images.append(mj)

    parts = []
    for v in videos:
        parts.append(f"[[video:{v}]]")

    if len(images) == 1:
        # Single image: plain Markdown image (no carousel needed)
        url = images[0]["final_url"]
        if url.startswith("/"):
            url = url[1:]
        parts.append(f"![]({url})")
    elif len(images) > 1:
        label = f"{title} Gallery"
        entries = []
        for img in images:
            url = img["final_url"]
            if url.startswith("/"):
                url = url[1:]
            entries.append(url)
        carousel_items = ";\n".join(entries)
        parts.append(f"[[carousel:label={label};\n{carousel_items}]]")

    return "\n\n".join(parts)


@app.post("/api/article/preview")
def preview_article():
    data = request.get_json(silent=True)
    if not data:
        return jsonify({"error": "invalid JSON body"}), 400

    content = data.get("content", "")
    try:
        import markdown
        html = markdown.markdown(content, extensions=["extra", "codehilite"])
        return jsonify({"html": html})
    except ImportError:
        return jsonify({"html": f"<pre>{content}</pre>", "warning": "markdown library not available"})


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=8000, debug=True)
