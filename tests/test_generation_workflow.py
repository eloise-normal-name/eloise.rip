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
            article_dir = repo_root / "content" / "articles" / "2026" / "03"
            article_dir.mkdir(parents=True, exist_ok=True)
            (article_dir / "pole-style.md").write_text(
                "Title: Pole Style\n"
                "Date: 2026-03-01\n"
                "Summary: style summary\n"
                "Category: Pole Dance\n"
                "Tags: Catgirl, Spin\n\n"
                "A polished pole post with specific words.\n",
                encoding="utf-8",
            )

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
                    draft_title="Draft Pole",
                    draft_summary="Draft summary",
                    draft_category="Pole Dance",
                    draft_tags=["Catgirl"],
                    draft_content="specific words from draft",
                )
            finally:
                workflow.extract_media_metadata = original_extract

            self.assertEqual(result.location, "Kirkland, Washington, United States")
            self.assertEqual(result.captured_at, "2026-03-17T19:00:00")
            self.assertEqual(result.source_media, ["library:images/sample.jpg"])
            self.assertEqual(result.category, "Pole Dance")
            self.assertEqual(generator.last_request.canonical_job["time_of_day"], "night")
            self.assertEqual(generator.last_request.media_context[0]["model_input_paths"], [image_path])
            self.assertEqual(generator.last_request.draft_title, "Draft Pole")
            self.assertEqual(generator.last_request.draft_tags, ["Catgirl"])
            self.assertEqual(generator.last_request.related_articles[0]["title"], "Pole Style")
            self.assertIn("Pole Dance", generator.last_request.allowed_categories)
            self.assertIn("Trinity Pole Studio", result.likely_named_locations)

    def test_generate_marks_home_when_gps_is_near_home(self):
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
                "gps": {"latitude": 47.6176, "longitude": -122.3507},
                "location_name": "Seattle, Washington, United States",
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

            self.assertIn("Home", result.likely_named_locations)

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

    def test_generate_from_library_video_samples_frames_without_poster(self):
        with tempfile.TemporaryDirectory() as tmp:
            repo_root = Path(tmp)
            video_path = repo_root / "content" / "media" / "video" / "sample.mp4"
            video_path.parent.mkdir(parents=True, exist_ok=True)
            video_path.write_bytes(b"video")

            config = self.make_config(repo_root)
            generator = FakeGenerator()

            from content_manager.services import generation_workflow as workflow

            original_extract = workflow.extract_media_metadata
            original_probe = workflow.ffprobe_json
            original_run = workflow.subprocess.run
            sampled_commands = []

            workflow.extract_media_metadata = lambda *args, **kwargs: {
                "captured_at": "2026-03-17T19:00:00",
                "time_of_day": "night",
                "gps": {"latitude": 1.0, "longitude": 2.0},
                "location_name": "Kirkland, Washington, United States",
                "metadata_warnings": [],
                "metadata_status": "ready",
            }
            workflow.ffprobe_json = lambda path: {"format": {"duration": "12.0"}}

            def fake_run(command, capture_output, text, check):
                sampled_commands.append(command)
                output_path = Path(command[-1])
                output_path.parent.mkdir(parents=True, exist_ok=True)
                output_path.write_bytes(b"frame")
                return type("Result", (), {"stdout": "", "stderr": ""})()

            workflow.subprocess.run = fake_run
            try:
                result = generate_article_from_sources(
                    config=config,
                    generator=generator,
                    media_paths=["video/sample.mp4"],
                )
            finally:
                workflow.extract_media_metadata = original_extract
                workflow.ffprobe_json = original_probe
                workflow.subprocess.run = original_run

            self.assertEqual(result.source_media, ["library:video/sample.mp4"])
            self.assertEqual(len(generator.last_request.media_context[0]["model_input_paths"]), 4)
            self.assertEqual(len(sampled_commands), 4)
            for frame_path in generator.last_request.media_context[0]["model_input_paths"]:
                self.assertNotIn(str(repo_root), str(frame_path))

    def test_generate_from_uploaded_video_uses_output_path_for_sampled_frames(self):
        with tempfile.TemporaryDirectory() as tmp:
            repo_root = Path(tmp)
            output_path = repo_root / "content" / "media" / "video" / "uploaded.mp4"
            output_path.parent.mkdir(parents=True, exist_ok=True)
            output_path.write_bytes(b"video")

            config = self.make_config(repo_root)
            generator = FakeGenerator()

            from content_manager.services import generation_workflow as workflow
            from content_manager.state import AppState

            state = AppState()
            with state.jobs_lock:
                state.media_jobs["job-1"] = {
                    "status": "done",
                    "media_type": "video",
                    "input_path": str(repo_root / "media-source" / "uploaded.mov"),
                    "output_path": str(output_path),
                    "name": "uploaded",
                    "captured_at": "2026-03-17T19:00:00",
                    "time_of_day": "night",
                    "gps": {"latitude": 1.0, "longitude": 2.0},
                    "location_name": "Kirkland, Washington, United States",
                    "metadata_warnings": [],
                    "metadata_status": "ready",
                }

            original_probe = workflow.ffprobe_json
            original_run = workflow.subprocess.run
            sampled_inputs = []
            workflow.ffprobe_json = lambda path: {"format": {"duration": "12.0"}}

            def fake_run(command, capture_output, text, check):
                sampled_inputs.append(command[5])
                output_frame = Path(command[-1])
                output_frame.parent.mkdir(parents=True, exist_ok=True)
                output_frame.write_bytes(b"frame")
                return type("Result", (), {"stdout": "", "stderr": ""})()

            workflow.subprocess.run = fake_run
            try:
                generate_article_from_sources(
                    config=config,
                    generator=generator,
                    media_job_ids=["job-1"],
                    state=state,
                )
            finally:
                workflow.ffprobe_json = original_probe
                workflow.subprocess.run = original_run

            self.assertEqual(sampled_inputs, [str(output_path)] * 4)

    def test_extract_video_frames_raises_when_no_frames_are_written(self):
        with tempfile.TemporaryDirectory() as tmp:
            from content_manager.services import generation_workflow as workflow

            output_dir = Path(tmp) / "frames"
            output_dir.mkdir(parents=True, exist_ok=True)

            with self.assertRaisesRegex(ValueError, "could not extract sampled frames"):
                workflow.extract_video_frames(
                    Path("sample.mp4"),
                    output_dir,
                    probe_reader=lambda path: {"format": {"duration": "8.0"}},
                    run_ffmpeg=lambda *args, **kwargs: type("Result", (), {"stdout": "", "stderr": ""})(),
                )

    def test_select_related_articles_prefers_same_category_then_recency(self):
        with tempfile.TemporaryDirectory() as tmp:
            from content_manager.services import generation_workflow as workflow

            articles_dir = Path(tmp) / "content" / "articles"
            recent_pole = articles_dir / "2026" / "03" / "recent-pole.md"
            older_pole = articles_dir / "2026" / "02" / "older-pole.md"
            self_article = articles_dir / "2026" / "03" / "self-post.md"
            recent_pole.parent.mkdir(parents=True, exist_ok=True)
            older_pole.parent.mkdir(parents=True, exist_ok=True)
            self_article.parent.mkdir(parents=True, exist_ok=True)
            recent_pole.write_text(
                "Title: Recent Pole\nDate: 2026-03-10\nSummary: recent\nCategory: Pole Dance\nTags: Catgirl\n\nRecent pole body.\n",
                encoding="utf-8",
            )
            older_pole.write_text(
                "Title: Older Pole\nDate: 2026-02-10\nSummary: old\nCategory: Pole Dance\nTags: Catgirl\n\nOlder pole body.\n",
                encoding="utf-8",
            )
            self_article.write_text(
                "Title: Self Post\nDate: 2026-03-18\nSummary: self\nCategory: Self\nTags: Catgirl\n\nSelf body.\n",
                encoding="utf-8",
            )

            related = workflow.select_related_articles(
                articles_dir,
                draft_category="Pole Dance",
                draft_tags=["Catgirl"],
                draft_content="body",
            )

            self.assertEqual([item.title for item in related[:2]], ["Recent Pole", "Older Pole"])
            self.assertNotEqual(related[0].title, "Self Post")

    def test_load_related_article_candidates_ignores_non_markdown_and_parses_excerpt(self):
        with tempfile.TemporaryDirectory() as tmp:
            from content_manager.services import generation_workflow as workflow

            articles_dir = Path(tmp) / "content" / "articles"
            articles_dir.mkdir(parents=True, exist_ok=True)
            (articles_dir / "template.md_").write_text("Title: Template\n", encoding="utf-8")
            (articles_dir / "notes.py").write_text("print('ignore')\n", encoding="utf-8")
            article_path = articles_dir / "post.md"
            article_path.write_text(
                "Title: Parsed Post\nDate: 2026-03-05\nSummary: hello\nCategory: Self\nTags: One, Two\n\nBody line one.\nBody line two.\n",
                encoding="utf-8",
            )

            articles = workflow.load_related_article_candidates(articles_dir)

            self.assertEqual(len(articles), 1)
            self.assertEqual(articles[0].title, "Parsed Post")
            self.assertIn("Body line one.", articles[0].excerpt)


if __name__ == "__main__":
    unittest.main()
