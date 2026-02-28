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

REPO_ROOT = Path(subprocess.run(
    ["git", "rev-parse", "--show-toplevel"],
    capture_output=True, text=True, check=True,
).stdout.strip())
UPLOAD_DIR = REPO_ROOT / os.getenv("UPLOAD_DIR", "media-source")
TRANSCODED_DIR = REPO_ROOT / os.getenv("OUTPUT_DIR", "content/media/voice")
OUTPUT_FORMAT = "m4a"
CLIP_ID_PATTERN = re.compile(r"(\d{2}-\d{2})")

UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
TRANSCODED_DIR.mkdir(parents=True, exist_ok=True)

jobs = {}
jobs_lock = threading.Lock()


def set_job(job_id: str, **updates) -> None:
    with jobs_lock:
        if job_id in jobs:
            jobs[job_id].update(updates)


def git_push_transcoded(output_path: Path) -> str | None:
    """Stage, commit, and push one transcoded file. Returns an error string or None."""
    def run(cmd: list[str]) -> None:
        subprocess.run(cmd, capture_output=True, text=True, check=True, cwd=REPO_ROOT)

    try:
        run(["git", "add", str(output_path)])
        run(["git", "commit", "-m", f"audio: add {output_path.name}"])
        run(["git", "push", "origin", "main"])
        return None
    except FileNotFoundError:
        return "git not found in PATH"
    except subprocess.CalledProcessError as err:
        return (err.stderr or err.stdout or "git command failed")[-800:]


def build_output_filename(input_name: str) -> str | None:
    match = CLIP_ID_PATTERN.search(Path(input_name).stem)
    return f"{match.group(1)}.{OUTPUT_FORMAT}" if match else None


def transcode_audio(job_id: str, input_path: Path, output_filename: str) -> None:
    set_job(job_id, status="processing")
    output_file = TRANSCODED_DIR / output_filename

    command = [
        "ffmpeg",
        "-y",
        "-i",
        str(input_path),
        "-vn",
        "-c:a",
        "aac",
        "-b:a",
        "128k",
        "-movflags",
        "+faststart",
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


@app.get("/health")
def health():
    return jsonify({"status": "ok"})


@app.get("/")
def index():
    return redirect("/admin/upload", code=302)


@app.get("/admin/upload")
def admin_upload():
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


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=8000, debug=True)
