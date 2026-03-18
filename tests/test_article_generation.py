from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from content_manager.services.article_generation import ArticleGenerator, GenerationRequest


class FakeResponse:
    def __init__(self, payload: dict):
        self._payload = payload

    def raise_for_status(self) -> None:
        return None

    def json(self) -> dict:
        return self._payload


class ArticleGenerationTests(unittest.TestCase):
    def test_generate_normalizes_json_response(self):
        with tempfile.TemporaryDirectory() as tmp:
            image_path = Path(tmp) / "sample.jpg"
            image_path.write_bytes(b"fake-image")

            captured = {}

            def fake_request(url, headers, json, timeout):
                captured["url"] = url
                captured["headers"] = headers
                captured["payload"] = json
                return FakeResponse({
                    "output_text": json_module.dumps({
                        "title_ideas": ["One", "Two", "Three"],
                        "summary": "Short summary",
                        "category": "Pole Dance",
                        "tags": ["Tag A", "Tag B", "Tag A"],
                        "content_markdown": "Paragraph one.\n\nParagraph two.",
                    })
                })

            json_module = json
            generator = ArticleGenerator(api_key="test-key", model="test-model", request_fn=fake_request)
            result = generator.generate(GenerationRequest(
                media_context=[{
                    "name": "sample",
                    "media_type": "image",
                    "location_name": "Seattle, Washington, United States",
                    "captured_at": "2026-03-17T19:00:00",
                    "time_of_day": "evening",
                    "model_input_paths": [image_path],
                }],
                canonical_job={
                    "location_name": "Seattle, Washington, United States",
                    "captured_at": "2026-03-17T19:00:00",
                    "time_of_day": "evening",
                },
                warnings=[],
                allowed_categories=["Pole Dance", "Self"],
                allowed_tags=["Tag A", "Tag B"],
                likely_named_locations=["Trinity Pole Studio"],
                draft_title="Draft title",
                draft_summary="Draft summary",
                draft_category="Pole Dance",
                draft_tags=["Tag A"],
                draft_content="Draft body line.",
                related_articles=[{
                    "title": "Related Title",
                    "category": "Pole Dance",
                    "tags": ["Tag A"],
                    "summary": "Related summary",
                    "excerpt": "Related excerpt",
                }],
            ))

            self.assertEqual(result["title_ideas"], ["One", "Two", "Three"])
            self.assertEqual(result["summary"], "Short summary")
            self.assertEqual(result["category"], "Pole Dance")
            self.assertEqual(result["tags"], ["Tag A", "Tag B"])
            self.assertIn("input", captured["payload"])
            self.assertEqual(captured["headers"]["Authorization"], "Bearer test-key")
            user_content = captured["payload"]["input"][1]["content"]
            image_parts = [item for item in user_content if item["type"] == "input_image"]
            self.assertEqual(len(image_parts), 1)
            text_parts = [item["text"] for item in user_content if item["type"] == "input_text"]
            self.assertTrue(any("Current draft context to refine and continue" in item for item in text_parts))
            self.assertTrue(any("Related published post for style only" in item for item in text_parts))

    def test_generate_emits_one_input_image_per_video_frame(self):
        with tempfile.TemporaryDirectory() as tmp:
            frame_one = Path(tmp) / "frame-01.jpg"
            frame_two = Path(tmp) / "frame-02.jpg"
            frame_one.write_bytes(b"fake-image-1")
            frame_two.write_bytes(b"fake-image-2")

            captured = {}
            json_module = json

            def fake_request(url, headers, json, timeout):
                captured["payload"] = json
                return FakeResponse({
                    "output_text": json_module.dumps({
                        "title_ideas": ["One", "Two", "Three"],
                        "summary": "Short summary",
                        "category": "Pole Dance",
                        "tags": ["Tag A", "Tag B"],
                        "content_markdown": "Paragraph one.\n\nParagraph two.",
                    })
                })

            generator = ArticleGenerator(api_key="test-key", model="test-model", request_fn=fake_request)
            generator.generate(GenerationRequest(
                media_context=[{
                    "name": "clip",
                    "media_type": "video",
                    "location_name": "Seattle, Washington, United States",
                    "captured_at": "2026-03-17T19:00:00",
                    "time_of_day": "evening",
                    "model_input_paths": [frame_one, frame_two],
                }],
                canonical_job={
                    "location_name": "Seattle, Washington, United States",
                    "captured_at": "2026-03-17T19:00:00",
                    "time_of_day": "evening",
                },
                warnings=[],
                allowed_categories=["Pole Dance", "Self"],
                allowed_tags=["Tag A", "Tag B"],
                likely_named_locations=["Trinity Pole Studio"],
                related_articles=[],
            ))

            user_content = captured["payload"]["input"][1]["content"]
            image_parts = [item for item in user_content if item["type"] == "input_image"]
            text_parts = [item for item in user_content if item["type"] == "input_text"]
            self.assertEqual(len(image_parts), 2)
            self.assertTrue(any("sampled frames from this video" in item["text"] for item in text_parts))

    def test_generate_requires_api_key(self):
        generator = ArticleGenerator(api_key="", model="test-model")
        with self.assertRaises(RuntimeError):
            generator.generate(GenerationRequest(
                media_context=[],
                canonical_job={},
                warnings=[],
                allowed_categories=[],
                allowed_tags=[],
                likely_named_locations=[],
            ))


if __name__ == "__main__":
    unittest.main()
