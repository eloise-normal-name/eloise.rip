from __future__ import annotations

import subprocess
import unittest
from pathlib import Path
from unittest.mock import patch

from content_manager import app


class ImageTranscodeTests(unittest.TestCase):
    def test_transcode_image_copies_metadata_with_exiftool(self):
        calls = []

        def fake_run(command, capture_output, text):
            calls.append(command)
            return type("Result", (), {"returncode": 0, "stderr": "", "stdout": "1 image files updated"})()

        with patch.object(app, "_run_ffmpeg", return_value=""), patch.object(subprocess, "run", side_effect=fake_run):
            app.transcode_image(Path("input.jpeg"), Path("output.avif"))

        self.assertEqual(len(calls), 1)
        self.assertEqual(calls[0][0], "exiftool")
        self.assertIn("-TagsFromFile", calls[0])
        self.assertIn("input.jpeg", calls[0])
        self.assertIn("output.avif", calls[0])

    def test_transcode_image_requires_exiftool(self):
        with patch.object(app, "_run_ffmpeg", return_value=""), patch.object(subprocess, "run", side_effect=FileNotFoundError()):
            with self.assertRaisesRegex(RuntimeError, "exiftool not found in PATH"):
                app.transcode_image(Path("input.jpeg"), Path("output.avif"))

    def test_video_metadata_ffmpeg_args_preserve_android_fusedgps(self):
        with patch.object(app, "_ffprobe_json", return_value={
            "format": {
                "tags": {
                    "creation_time": "2026-03-17T18:30:00Z",
                }
            },
            "streams": [
                {
                    "tags": {
                        "com.android.capture.fusedgps": "+47.62050-122.34930/",
                    }
                }
            ],
        }):
            args = app._video_metadata_ffmpeg_args(Path("input.mp4"))

        self.assertIn("-map_metadata", args)
        self.assertIn("com.android.capture.fusedgps=+47.62050-122.34930/", args)

    def test_media_name_in_use_detects_existing_published_output(self):
        with patch.object(app, "_published_media_paths", return_value=[Path("occupied.avif")]), patch.object(Path, "exists", return_value=True):
            self.assertTrue(app._media_name_in_use("my-clip", "image"))

    def test_media_name_in_use_ignores_failed_jobs(self):
        with app.state.jobs_lock:
            original_jobs = app.state.media_jobs
            app.state.media_jobs = {
                "job-1": {"name": "my-clip", "media_type": "image", "status": "error"},
            }
        try:
            with patch.object(app, "_published_media_paths", return_value=[]):
                self.assertFalse(app._media_name_in_use("my-clip", "image"))
        finally:
            with app.state.jobs_lock:
                app.state.media_jobs = original_jobs


if __name__ == "__main__":
    unittest.main()
