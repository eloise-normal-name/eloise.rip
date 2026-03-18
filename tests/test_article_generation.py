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
                    "model_image_path": image_path,
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
            ))

            self.assertEqual(result["title_ideas"], ["One", "Two", "Three"])
            self.assertEqual(result["summary"], "Short summary")
            self.assertEqual(result["category"], "Pole Dance")
            self.assertEqual(result["tags"], ["Tag A", "Tag B"])
            self.assertIn("input", captured["payload"])
            self.assertEqual(captured["headers"]["Authorization"], "Bearer test-key")

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
