from __future__ import annotations

import re
import subprocess
import threading
import uuid
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

from flask import Flask, abort, jsonify, redirect, render_template, request, send_file
from werkzeug.utils import secure_filename

from content_manager.config import load_config
from content_manager.services.article_generation import ArticleGenerator
from content_manager.services.generation_workflow import generate_article_from_sources, resolve_library_media_path
from content_manager.services.media_metadata import (
    extract_media_metadata,
    extract_video_tags,
    normalize_media_basename,
)
from content_manager.state import AppState

app = Flask(__name__)
config = load_config()
state = AppState()
generator = ArticleGenerator(
    api_key=config.openai_api_key,
    model=config.openai_model,
)

app.secret_key = config.secret_key
app.config["MAX_CONTENT_LENGTH"] = config.max_upload_mb * 1024 * 1024
app.config["TEMPLATES_AUTO_RELOAD"] = True

IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".bmp", ".tiff", ".tif", ".webp", ".avif"}
VIDEO_EXTENSIONS = {".mp4", ".mov", ".mkv", ".avi", ".webm", ".m4v", ".gif"}


def _json_error(message: str, status: int = 400):
    return jsonify({"error": message}), status


def _run_ffmpeg(args: list[str]) -> str:
    result = subprocess.run(["ffmpeg", *args], capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError((result.stderr or "ffmpeg failed")[-1200:])
    return result.stdout


def _copy_image_metadata_exiftool(input_path: Path, output_path: Path) -> None:
    try:
        result = subprocess.run(
            [
                "exiftool",
                "-overwrite_original",
                "-TagsFromFile",
                str(input_path),
                "-EXIF:all",
                "-XMP:all",
                "-IPTC:all",
                str(output_path),
            ],
            capture_output=True,
            text=True,
        )
    except FileNotFoundError as err:
        raise RuntimeError("exiftool not found in PATH; required for image metadata preservation") from err
    if result.returncode != 0:
        raise RuntimeError((result.stderr or result.stdout or "exiftool failed")[-1200:])


def _ffprobe_json(input_path: Path) -> dict:
    result = subprocess.run(
        ["ffprobe", "-v", "quiet", "-print_format", "json", "-show_format", "-show_streams", str(input_path)],
        capture_output=True,
        text=True,
        check=True,
    )
    import json
    return json.loads(result.stdout or "{}")


def _scale_filter() -> str:
    d = config.max_dimension
    return f"scale='if(gt(iw,ih),min({d},iw),-2)':'if(gt(ih,iw),min({d},ih),-2)'"


def _video_metadata_ffmpeg_args(input_path: Path) -> list[str]:
    try:
        tags = extract_video_tags(_ffprobe_json(input_path))
    except (FileNotFoundError, subprocess.CalledProcessError):
        return ["-movflags", "+faststart"]

    metadata_args = ["-map_metadata", "0", "-movflags", "use_metadata_tags+faststart"]
    for source_key, output_key in (
        ("creation_time", "creation_time"),
        ("date", "date"),
        ("location", "location"),
        ("com.apple.quicktime.location.iso6709", "com.apple.quicktime.location.ISO6709"),
        ("com.apple.quicktime.creationdate", "com.apple.quicktime.creationdate"),
        ("com.apple.quicktime.make", "com.apple.quicktime.make"),
        ("com.apple.quicktime.model", "com.apple.quicktime.model"),
        ("com.apple.quicktime.software", "com.apple.quicktime.software"),
        ("com.android.capture.fusedgps", "com.android.capture.fusedgps"),
    ):
        value = tags.get(source_key)
        if value:
            metadata_args.extend(["-metadata", f"{output_key}={value}"])
    return metadata_args


def _classify_media(filename: str) -> str | None:
    ext = Path(filename).suffix.lower()
    if ext in IMAGE_EXTENSIONS:
        return "image"
    if ext in VIDEO_EXTENSIONS:
        return "video"
    return None


def _published_media_paths(name: str, media_type: str) -> list[Path]:
    if media_type == "image":
        return [config.images_dir / f"{name}.avif"]
    if media_type == "video":
        return [
            config.video_dir / f"{name}.mp4",
            config.video_dir / f"{name}.jpg",
        ]
    return []


def _media_name_in_use(name: str, media_type: str) -> bool:
    if any(path.exists() for path in _published_media_paths(name, media_type)):
        return True
    with state.jobs_lock:
        for job in state.media_jobs.values():
            if job.get("media_type") != media_type:
                continue
            if job.get("name") == name and job.get("status") != "error":
                return True
    return False


def transcode_image(input_path: Path, output_path: Path) -> None:
    _run_ffmpeg([
        "-y", "-i", str(input_path),
        "-vf", _scale_filter(),
        "-c:v", "libaom-av1", "-crf", str(config.crf_avif), "-b:v", "0",
        str(output_path),
    ])
    # Intentional for now: fail the job if metadata cannot be preserved on the published AVIF.
    _copy_image_metadata_exiftool(input_path, output_path)


def transcode_video(input_path: Path, mp4_path: Path, poster_path: Path) -> None:
    _run_ffmpeg([
        "-y", "-i", str(input_path),
        "-vf", _scale_filter(),
        "-c:v", "libx265", "-preset", config.hevc_preset, "-crf", str(config.crf_hevc),
        "-pix_fmt", "yuv420p", "-tag:v", "hvc1",
        "-c:a", "aac", "-b:a", config.hevc_audio_bitrate,
        *_video_metadata_ffmpeg_args(input_path),
        str(mp4_path),
    ])
    _run_ffmpeg([
        "-y", "-i", str(input_path),
        "-ss", config.poster_time, "-vframes", "1",
        "-vf", _scale_filter(),
        str(poster_path),
    ])


def git_run(cmd: list[str]) -> None:
    subprocess.run(cmd, capture_output=True, text=True, check=True, cwd=config.repo_root)


def git_push_transcoded(output_path: Path) -> str | None:
    try:
        git_run(["git", "add", str(output_path)])
        git_run(["git", "commit", "-m", f"audio: add {output_path.name}"])
        git_run(["git", "push", config.git_remote, config.git_branch])
        return None
    except FileNotFoundError:
        return "git not found in PATH"
    except subprocess.CalledProcessError as err:
        return (err.stderr or err.stdout or "git command failed")[-800:]


def git_push_article(article_path: Path, media_paths: list[Path]) -> str | None:
    if not config.auto_commit:
        return None
    try:
        git_run(["git", "add", str(article_path), *[str(path) for path in media_paths]])
        git_run(["git", "commit", "-m", f"article: {article_path.stem.replace('-', ' ')}"])
        git_run(["git", "push", config.git_remote, config.git_branch])
        return None
    except FileNotFoundError:
        return "git not found in PATH"
    except subprocess.CalledProcessError as err:
        return (err.stderr or err.stdout or "git command failed")[-800:]


def slugify(text: str) -> str:
    text = text.lower().strip()
    text = re.sub(r"[^\w\s-]", "", text)
    text = re.sub(r"[\s_]+", "-", text)
    text = re.sub(r"-+", "-", text)
    return text.strip("-")


def unique_article_path(slug: str, date_str: str) -> Path:
    folder = config.articles_dir / date_str[:4] / date_str[5:7]
    folder.mkdir(parents=True, exist_ok=True)
    path = folder / f"{slug}.md"
    if not path.exists():
        return path
    suffix = 2
    while True:
        candidate = folder / f"{slug}-{suffix}.md"
        if not candidate.exists():
            return candidate
        suffix += 1


def build_output_filename(input_name: str) -> str | None:
    match = config.clip_id_pattern.search(Path(input_name).stem)
    return f"{match.group(1)}.{config.output_format}" if match else None


def transcode_audio(job_id: str, input_path: Path, output_filename: str) -> None:
    state.set_job(job_id, status="processing")
    output_file = config.voice_dir / output_filename
    try:
        subprocess.run(
            ["ffmpeg", "-y", "-i", str(input_path), "-vn", "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", str(output_file)],
            capture_output=True,
            text=True,
            check=True,
        )
        push_error = git_push_transcoded(output_file)
        state.set_job(
            job_id,
            status="done",
            output_path=str(output_file),
            output_filename=output_filename,
            completed_at=datetime.now(timezone.utc).isoformat(),
            push_error=push_error,
        )
    except FileNotFoundError:
        state.set_job(job_id, status="error", error="ffmpeg not found in PATH")
    except subprocess.CalledProcessError as err:
        state.set_job(job_id, status="error", error=(err.stderr or "ffmpeg failed")[-1200:])


def transcode_media_job(job_id: str, input_path: Path, media_type: str, name: str) -> None:
    state.set_media_job(job_id, status="processing")
    try:
        if media_type == "image":
            output_path = config.images_dir / f"{name}.avif"
            transcode_image(input_path, output_path)
            state.set_media_job(
                job_id,
                status="done",
                output_path=str(output_path),
                final_url=f"/media/images/{name}.avif",
                completed_at=datetime.now(timezone.utc).isoformat(),
            )
        else:
            mp4_path = config.video_dir / f"{name}.mp4"
            poster_path = config.video_dir / f"{name}.jpg"
            transcode_video(input_path, mp4_path, poster_path)
            state.set_media_job(
                job_id,
                status="done",
                output_path=str(mp4_path),
                poster_path=str(poster_path),
                final_url=f"/media/video/{name}.mp4",
                poster_url=f"/media/video/{name}.jpg",
                completed_at=datetime.now(timezone.utc).isoformat(),
            )
    except FileNotFoundError:
        state.set_media_job(job_id, status="error", error="ffmpeg not found in PATH")
    except RuntimeError as err:
        state.set_media_job(job_id, status="error", error=str(err)[-1200:])


def _library_media_context(media_paths: list[str]) -> list[dict]:
    items = []
    for raw_path in media_paths:
        relative, full_path = resolve_library_media_path(config, raw_path)
        if not full_path.exists():
            raise ValueError(f"media file not found: media/{relative.as_posix()}")
        media_type = _classify_media(full_path.name)
        if not media_type:
            raise ValueError(f"unsupported media type: {relative.name}")
        items.append({
            "media_type": media_type,
            "name": full_path.stem,
            "final_url": f"/media/{relative.as_posix()}",
        })
    return items


def _build_media_prefix(media_job_ids: list[str], title: str, media_paths: list[str] | None = None) -> str:
    videos = []
    images = []
    with state.jobs_lock:
        for job_id in media_job_ids:
            job = state.media_jobs.get(job_id)
            if not job or job["status"] != "done":
                continue
            if job["media_type"] == "video":
                videos.append(job["name"])
            elif job["media_type"] == "image":
                images.append(job)
    for item in _library_media_context(media_paths or []):
        if item["media_type"] == "video":
            videos.append(item["name"])
        elif item["media_type"] == "image":
            images.append(item)

    parts = [f"[[video:{name}]]" for name in videos]
    if len(images) == 1:
        url = images[0]["final_url"].lstrip("/")
        parts.append(f"![]({url})")
    elif len(images) > 1:
        label = f"{title} Gallery"
        items = ";\n".join(image["final_url"].lstrip("/") for image in images)
        parts.append(f"[[carousel:label={label};\n{items}]]")
    return "\n\n".join(parts)


def _read_article_metadata(article_path: Path) -> dict:
    try:
        raw = article_path.read_text(encoding="utf-8", errors="ignore")
    except OSError:
        return {"date": None, "tags": []}
    date_value = None
    tags_value = ""
    for line in raw.splitlines():
        if not line.strip():
            break
        if ":" not in line:
            continue
        key, value = line.split(":", 1)
        key = key.strip().lower()
        value = value.strip()
        if key == "date":
            date_value = value
        elif key == "tags":
            tags_value = value
    parsed_date = None
    if date_value:
        try:
            parsed_date = datetime.strptime(date_value[:10], "%Y-%m-%d").date()
        except ValueError:
            pass
    tags = [tag.strip() for tag in tags_value.split(",") if tag.strip()]
    return {"date": parsed_date, "tags": tags}


@app.get("/health")
def health():
    return jsonify({"status": "ok"})


@app.get("/")
def index():
    return redirect("/admin/articles/new", code=302)


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
        return _json_error("no file uploaded")
    safe_name = secure_filename(file.filename)
    if not safe_name.lower().endswith(".qta"):
        return _json_error("unsupported input file type; only .qta is accepted")
    output_filename = build_output_filename(safe_name)
    if not output_filename:
        return _json_error("invalid filename; must include clip id in ##-## format (example: guid_02-10.qta)")
    job_id = str(uuid.uuid4())
    input_path = config.upload_dir / f"{job_id}_{safe_name}"
    file.save(input_path)
    with state.jobs_lock:
        state.jobs[job_id] = {
            "status": "pending",
            "input_filename": safe_name,
            "output_format": config.output_format,
            "output_filename": output_filename,
            "output_path": None,
            "error": None,
            "push_error": None,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "completed_at": None,
        }
    threading.Thread(target=transcode_audio, args=(job_id, input_path, output_filename), daemon=True).start()
    return jsonify({"job_id": job_id, "status_url": f"/api/jobs/{job_id}"})


@app.get("/api/jobs/<job_id>")
def job_status(job_id: str):
    with state.jobs_lock:
        job = state.jobs.get(job_id)
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
    with state.jobs_lock:
        job = state.jobs.get(job_id)
    if not job or job["status"] != "done" or not job.get("output_path"):
        abort(404)
    output_path = Path(job["output_path"])
    if not output_path.exists():
        abort(404)
    return send_file(output_path, as_attachment=True, download_name=job["output_filename"])


@app.post("/api/media/upload")
def upload_media():
    file = request.files.get("file")
    if not file or not file.filename:
        return _json_error("no file uploaded")
    safe_name = secure_filename(file.filename)
    ext = Path(safe_name).suffix.lower()
    normalized_name = normalize_media_basename(Path(safe_name).stem)
    if not normalized_name:
        return _json_error("invalid filename; provide a file name with letters or numbers")
    normalized_filename = f"{normalized_name}{ext}"
    media_type = _classify_media(normalized_filename)
    if not media_type:
        return _json_error(f"unsupported file type; accepted: {', '.join(sorted(IMAGE_EXTENSIONS | VIDEO_EXTENSIONS))}")
    if _media_name_in_use(normalized_name, media_type):
        return _json_error(
            f"media name '{normalized_name}' is already in use; rename the upload before submitting",
            409,
        )
    job_id = str(uuid.uuid4())
    input_path = config.upload_dir / f"{job_id}_{normalized_filename}"
    file.save(input_path)
    metadata = extract_media_metadata(input_path, media_type, geocoder_user_agent=config.geocoder_user_agent)
    with state.jobs_lock:
        state.media_jobs[job_id] = {
            "status": "pending",
            "media_type": media_type,
            "input_filename": normalized_filename,
            "input_path": str(input_path),
            "name": normalized_name,
            "output_path": None,
            "poster_path": None,
            "final_url": None,
            "poster_url": None,
            "error": None,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "completed_at": None,
            **metadata,
        }
    threading.Thread(target=transcode_media_job, args=(job_id, input_path, media_type, normalized_name), daemon=True).start()
    return jsonify({"job_id": job_id, "media_type": media_type, "name": normalized_name, **metadata})


@app.get("/api/media/jobs/<job_id>")
def media_job_status(job_id: str):
    with state.jobs_lock:
        job = state.media_jobs.get(job_id)
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
        "captured_at": job.get("captured_at"),
        "time_of_day": job.get("time_of_day"),
        "location_name": job.get("location_name"),
        "gps": job.get("gps"),
        "metadata_status": job.get("metadata_status"),
        "warnings": job.get("metadata_warnings", []),
    })


@app.get("/api/media/list")
def list_media():
    images = [{"name": f.stem, "url": f"/media/images/{f.name}", "type": "image"} for f in sorted(config.images_dir.glob("*.avif"))]
    videos = []
    for f in sorted(config.video_dir.glob("*.mp4")):
        poster = config.video_dir / f"{f.stem}.jpg"
        videos.append({
            "name": f.stem,
            "url": f"/media/video/{f.name}",
            "poster_url": f"/media/video/{f.stem}.jpg" if poster.exists() else None,
            "type": "video",
        })
    return jsonify({"images": images, "videos": videos})


@app.get("/admin/articles")
def articles_hub():
    return redirect("/admin/articles/new", code=302)


@app.get("/admin/articles/new")
def new_article():
    return render_template("author-article.html")


@app.get("/api/article/tags/suggestions")
def suggested_tags():
    articles = []
    for article_path in config.articles_dir.rglob("*.md"):
        articles.append(_read_article_metadata(article_path))
    sorted_articles = sorted(articles, key=lambda item: item["date"] or datetime.min.date(), reverse=True)

    recent_tags = []
    recent_keys = set()
    for article in sorted_articles:
        for tag in article["tags"]:
            key = tag.lower()
            if key in recent_keys:
                continue
            recent_keys.add(key)
            recent_tags.append(tag)
            if len(recent_tags) >= 6:
                break
        if len(recent_tags) >= 6:
            break

    counts = Counter()
    last_used = {}
    display = {}
    for article in sorted_articles:
        seen = set()
        for tag in article["tags"]:
            key = tag.lower()
            if key in seen:
                continue
            seen.add(key)
            counts[key] += 1
            display.setdefault(key, tag)
            if key not in last_used or (article["date"] and article["date"] > last_used[key]):
                last_used[key] = article["date"]
    common_candidates = sorted(counts.keys(), key=lambda key: (-counts[key], -(last_used.get(key) or datetime.min.date()).toordinal(), key))
    common_tags = []
    for key in common_candidates:
        if key in recent_keys:
            continue
        common_tags.append(display[key])
        if len(common_tags) >= 6:
            break
    return jsonify({"recent": recent_tags, "common": common_tags})


@app.post("/api/article/draft")
def save_draft():
    data = request.get_json(silent=True)
    if not data:
        return _json_error("invalid JSON body")
    draft_id = data.get("draft_id") or str(uuid.uuid4())
    with state.jobs_lock:
        state.drafts[draft_id] = {
            "title": data.get("title", ""),
            "summary": data.get("summary", ""),
            "category": data.get("category", ""),
            "tags": data.get("tags", ""),
            "thumbnail": data.get("thumbnail", ""),
            "existing_media_paths": data.get("existing_media_paths", ""),
            "content": data.get("content", ""),
            "media_jobs": data.get("media_jobs", []),
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
    return jsonify({"draft_id": draft_id, "status": "saved"})


@app.get("/api/article/draft/<draft_id>")
def get_draft(draft_id: str):
    with state.jobs_lock:
        draft = state.drafts.get(draft_id)
    if not draft:
        return jsonify({"error": "draft not found"}), 404
    return jsonify({"draft_id": draft_id, **draft})


@app.post("/api/article/generate")
def generate_article():
    data = request.get_json(silent=True)
    if not data:
        return _json_error("invalid JSON body")
    media_job_ids = data.get("media_jobs", []) or []
    media_paths = data.get("media_paths", []) or []
    if not isinstance(media_job_ids, list) or not isinstance(media_paths, list):
        return _json_error("media_jobs and media_paths must be arrays")
    try:
        generated = generate_article_from_sources(
            config=config,
            generator=generator,
            media_job_ids=media_job_ids,
            media_paths=media_paths,
            state=state,
        )
    except ValueError as err:
        return _json_error(str(err))
    except Exception as err:
        message = str(err)
        status = 502 if "OpenAI" in message or "OPENAI" in message else 500
        return _json_error(message or "generation failed", status)
    return jsonify(generated.to_dict())


@app.post("/api/article/publish")
def publish_article():
    data = request.get_json(silent=True)
    if not data:
        return _json_error("invalid JSON body")
    title = (data.get("title") or "").strip()
    content = (data.get("content") or "").strip()
    if not title:
        return _json_error("title is required")
    if not content:
        return _json_error("content is required")

    media_job_ids = data.get("media_jobs", [])
    existing_media_paths = data.get("media_paths", []) or []
    if not isinstance(media_job_ids, list) or not isinstance(existing_media_paths, list):
        return _json_error("media_jobs and media_paths must be arrays")
    media_paths = []
    with state.jobs_lock:
        for job_id in media_job_ids:
            job = state.media_jobs.get(job_id)
            if not job:
                return _json_error(f"unknown media job: {job_id}")
            if job["status"] != "done":
                return _json_error(f"media job {job_id} not complete (status: {job['status']})")
            if job.get("output_path"):
                media_paths.append(Path(job["output_path"]))
            if job.get("poster_path"):
                media_paths.append(Path(job["poster_path"]))

    date_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    article_path = unique_article_path(slugify(title), date_str)
    lines = [f"Title: {title}", f"Date: {date_str}"]
    for key, field in (("Summary", "summary"), ("Category", "category"), ("Tags", "tags")):
        value = (data.get(field) or "").strip()
        if value:
            lines.append(f"{key}: {value}")
    thumbnail = (data.get("thumbnail") or "").strip()
    if thumbnail:
        lines.append(f"thumbnail: {thumbnail}")
    lines.append("")
    try:
        media_prefix = _build_media_prefix(media_job_ids, title, existing_media_paths)
    except ValueError as err:
        return _json_error(str(err))
    if media_prefix:
        lines.append(media_prefix)
        lines.append("")
    lines.append(content)
    lines.append("")
    article_path.write_text("\n".join(lines), encoding="utf-8")
    push_error = git_push_article(article_path, media_paths)
    return jsonify({
        "status": "published",
        "slug": article_path.stem,
        "path": str(article_path.relative_to(config.repo_root)),
        "push_error": push_error,
    })


@app.post("/api/article/preview")
def preview_article():
    data = request.get_json(silent=True)
    if not data:
        return _json_error("invalid JSON body")
    content = data.get("content", "")
    try:
        import markdown

        return jsonify({"html": markdown.markdown(content, extensions=["extra", "codehilite"])})
    except ImportError:
        return jsonify({"html": f"<pre>{content}</pre>", "warning": "markdown library not available"})


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=8000, debug=True)
