from __future__ import annotations

import io
import json
import unittest
from contextlib import redirect_stdout

from content_manager import cli


class CliTests(unittest.TestCase):
    def test_generate_command_prints_json(self):
        original_load_config = cli.load_config
        original_generator = cli.ArticleGenerator
        original_workflow = cli.generate_article_from_sources

        class FakeGenerator:
            def __init__(self, api_key: str, model: str):
                self.api_key = api_key
                self.model = model

        class FakeResult:
            def to_dict(self):
                return {"status": "ok", "location": "Kirkland"}

        try:
            cli.load_config = lambda: type("Cfg", (), {"openai_api_key": "key", "openai_model": "model"})()
            cli.ArticleGenerator = FakeGenerator
            cli.generate_article_from_sources = lambda **kwargs: FakeResult()

            buffer = io.StringIO()
            with redirect_stdout(buffer):
                exit_code = cli.main(["generate", "--media-path", "video/bungle-babes-duo-choreo.mp4"])
            payload = json.loads(buffer.getvalue())

            self.assertEqual(exit_code, 0)
            self.assertEqual(payload["status"], "ok")
        finally:
            cli.load_config = original_load_config
            cli.ArticleGenerator = original_generator
            cli.generate_article_from_sources = original_workflow


if __name__ == "__main__":
    unittest.main()
