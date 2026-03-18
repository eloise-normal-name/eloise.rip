from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from content_manager.config import AppConfig
from content_manager.services.generation_workflow import generate_article_from_sources


class FakeGenerator:
    def __init__(self):
        self.last_request = None

    def generate(self, request):
        self.last_request = request
        return {
            "title_ideas": ["One", "Two", "Three"],
            "summary": "Summary",
            "category": "Pole Dance",
            "tags": ["tag1", "tag2"],
            "content_markdown": "Body",
        }


class GenerationWorkflowTests(unittest.TestCase):
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

    def test_generate_from_existing_media_paths(self):
        with tempfile.TemporaryDirectory() as tmp:
            repo_root = Path(tmp)
            image_path = repo_root / "content" / "media" / "images" / "sample.jpg"
            image_path.parent.mkdir(parents=True, exist_ok=True)
            image_path.write_bytes(b"fake-image")

            config = self.make_config(repo_root)
            generator = FakeGenerator()

            from content_manager.services import generation_workflow as workflow

            original_extract = workflow.extract_media_metadata
            workflow.extract_media_metadata = lambda *args, **kwargs: {
                "captured_at": "2026-03-17T19:00:00",
                "time_of_day": "night",
                "gps": {"latitude": 1.0, "longitude": 2.0},
                "location_name": "Kirkland, Washington, United States",
                "metadata_warnings": [],
                "metadata_status": "ready",
            }
            try:
                result = generate_article_from_sources(
                    config=config,
                    generator=generator,
                    media_paths=["images/sample.jpg"],
                )
            finally:
                workflow.extract_media_metadata = original_extract

            self.assertEqual(result.location, "Kirkland, Washington, United States")
            self.assertEqual(result.captured_at, "2026-03-17T19:00:00")
            self.assertEqual(result.source_media, ["library:images/sample.jpg"])
            self.assertEqual(result.category, "Pole Dance")
            self.assertEqual(generator.last_request.canonical_job["time_of_day"], "night")
            self.assertIn("Pole Dance", generator.last_request.allowed_categories)

    def test_generate_rejects_media_paths_outside_content_media(self):
        with tempfile.TemporaryDirectory() as tmp:
            repo_root = Path(tmp).resolve()
            outside_path = repo_root / "content" / "secret.jpg"
            outside_path.parent.mkdir(parents=True, exist_ok=True)
            outside_path.write_bytes(b"fake-image")

            config = self.make_config(repo_root)
            generator = FakeGenerator()

            with self.assertRaisesRegex(ValueError, "must stay under content/media"):
                generate_article_from_sources(
                    config=config,
                    generator=generator,
                    media_paths=["../secret.jpg"],
                )


if __name__ == "__main__":
    unittest.main()
