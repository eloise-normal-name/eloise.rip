from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from content_manager.config import AppConfig
from content_manager.services import article_authoring, metadata_resolution
from content_manager.state import AppState


class ArticleAuthoringTests(unittest.TestCase):
    def make_config(self, repo_root: Path) -> AppConfig:
        return AppConfig(
            repo_root=repo_root,
            secret_key="dev",
            upload_dir=repo_root / "media-source",
            voice_dir=repo_root / "content" / "media" / "voice",
            images_dir=repo_root / "content" / "media" / "images",
            video_dir=repo_root / "content" / "media" / "video",
            articles_dir=repo_root / "content" / "articles",
            output_format="m4a",
            clip_id_pattern=__import__("re").compile(r"(\d{2}-\d{2})"),
            auto_commit=False,
            git_remote="origin",
            git_branch="main",
            openai_api_key="test-key",
            openai_model="test-model",
            geocoder_user_agent="test-agent",
            max_upload_mb=200,
            max_dimension=1080,
            crf_avif=32,
            crf_hevc=28,
            hevc_preset="slow",
            hevc_audio_bitrate="160k",
            poster_time="0.5",
        )

    def test_save_and_load_draft_recomputes_metadata_snapshot(self):
        with tempfile.TemporaryDirectory() as tmp:
            repo_root = Path(tmp)
            config = self.make_config(repo_root)
            state = AppState()
            with state.jobs_lock:
                state.media_jobs["job-1"] = {
                    "status": "done",
                    "media_type": "image",
                    "input_path": str(repo_root / "media-source" / "sample.jpg"),
                    "name": "sample",
                    "final_url": "/media/images/sample.avif",
                    "poster_url": None,
                    "captured_at": "2026-03-17T19:00:00",
                    "time_of_day": "evening",
                    "location_name": "Seattle, Washington, United States",
                    "metadata_status": "ready",
                    "metadata_warnings": [],
                }

            draft = article_authoring.save_draft(state, config, {
                "title": "Draft",
                "content": "Body",
                "media_jobs": ["job-1"],
            })
            loaded = article_authoring.load_draft(state, config, draft.draft_id)

            self.assertIsNotNone(loaded)
            self.assertEqual(loaded.draft_id, draft.draft_id)
            self.assertTrue(loaded.metadata.generation_eligible)
            self.assertEqual(loaded.metadata.canonical_location, "Seattle, Washington, United States")
            self.assertIn("uploaded", loaded.metadata.media_summary)
            self.assertIn("Canonical: Seattle, Washington, United States", loaded.metadata.location_summary)

    def test_publish_validation_does_not_require_generation_eligibility(self):
        command = article_authoring.validate_publish_request({
            "title": "My Post",
            "content": "Body",
            "media_jobs": [],
            "media_paths": [],
        })
        self.assertEqual(command.title, "My Post")
        self.assertEqual(command.content, "Body")

    def test_resolve_in_progress_draft_uses_current_editor_state(self):
        with tempfile.TemporaryDirectory() as tmp:
            repo_root = Path(tmp)
            config = self.make_config(repo_root)
            state = AppState()
            with state.jobs_lock:
                state.media_jobs["job-1"] = {
                    "status": "done",
                    "media_type": "image",
                    "input_path": str(repo_root / "media-source" / "sample.jpg"),
                    "name": "sample",
                    "final_url": "/media/images/sample.avif",
                    "poster_url": None,
                    "captured_at": "2026-03-17T19:00:00",
                    "time_of_day": "evening",
                    "location_name": "Seattle, Washington, United States",
                    "metadata_status": "ready",
                    "metadata_warnings": [],
                }

            metadata = article_authoring.resolve_in_progress_draft(state, config, {
                "title": "Unsaved draft",
                "existing_media_paths": "",
                "media_jobs": ["job-1"],
            })

            self.assertTrue(metadata.generation_eligible)
            self.assertIn("currently available for generation", metadata.media_summary)


class MetadataResolutionTests(unittest.TestCase):
    def make_config(self, repo_root: Path) -> AppConfig:
        return ArticleAuthoringTests().make_config(repo_root)

    def test_resolve_draft_metadata_handles_complete_and_missing_sources(self):
        with tempfile.TemporaryDirectory() as tmp:
            repo_root = Path(tmp)
            config = self.make_config(repo_root)
            state = AppState()
            with state.jobs_lock:
                state.media_jobs["job-1"] = {
                    "status": "done",
                    "media_type": "image",
                    "input_path": str(repo_root / "media-source" / "sample.jpg"),
                    "name": "sample",
                    "final_url": "/media/images/sample.avif",
                    "poster_url": None,
                    "captured_at": "2026-03-17T19:00:00",
                    "time_of_day": "evening",
                    "location_name": "Seattle, Washington, United States",
                    "metadata_status": "ready",
                    "metadata_warnings": [],
                }

            snapshot = metadata_resolution.resolve_draft_metadata(
                config=config,
                state=state,
                media_job_ids=["job-1", "missing-job"],
            )

            self.assertEqual(len(snapshot.items), 2)
            self.assertTrue(snapshot.generation_eligible)
            self.assertIn("uploaded media job is no longer available", snapshot.warnings)

    def test_resolve_draft_metadata_allows_library_video_without_poster(self):
        with tempfile.TemporaryDirectory() as tmp:
            repo_root = Path(tmp)
            video_path = repo_root / "content" / "media" / "video" / "sample.mp4"
            video_path.parent.mkdir(parents=True, exist_ok=True)
            video_path.write_bytes(b"video")
            config = self.make_config(repo_root)
            state = AppState()

            original_extract = metadata_resolution.extract_media_metadata
            metadata_resolution.extract_media_metadata = lambda *args, **kwargs: {
                "captured_at": "2026-03-17T19:00:00",
                "time_of_day": "evening",
                "gps": {"latitude": 1.0, "longitude": 2.0},
                "location_name": "Seattle, Washington, United States",
                "metadata_warnings": [],
                "metadata_status": "ready",
            }
            try:
                snapshot = metadata_resolution.resolve_draft_metadata(
                    config=config,
                    state=state,
                    media_paths=["video/sample.mp4"],
                )
            finally:
                metadata_resolution.extract_media_metadata = original_extract

            self.assertTrue(snapshot.generation_eligible)
            self.assertEqual(snapshot.blocking_reasons, [])
            self.assertIn("existing library", snapshot.media_summary)

    def test_resolve_draft_metadata_allows_uploaded_video_without_poster(self):
        with tempfile.TemporaryDirectory() as tmp:
            repo_root = Path(tmp)
            config = self.make_config(repo_root)
            state = AppState()
            output_path = repo_root / "content" / "media" / "video" / "sample.mp4"
            output_path.parent.mkdir(parents=True, exist_ok=True)
            output_path.write_bytes(b"video")
            with state.jobs_lock:
                state.media_jobs["job-1"] = {
                    "status": "done",
                    "media_type": "video",
                    "input_path": str(repo_root / "media-source" / "sample.mov"),
                    "output_path": str(output_path),
                    "name": "sample",
                    "final_url": "/media/video/sample.mp4",
                    "poster_url": None,
                    "captured_at": "2026-03-17T19:00:00",
                    "time_of_day": "evening",
                    "location_name": "Seattle, Washington, United States",
                    "metadata_status": "ready",
                    "metadata_warnings": [],
                }

            snapshot = metadata_resolution.resolve_draft_metadata(
                config=config,
                state=state,
                media_job_ids=["job-1"],
            )

            self.assertTrue(snapshot.generation_eligible)
            self.assertEqual(snapshot.items[0].generation_blockers, [])


if __name__ == "__main__":
    unittest.main()
