from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from content_manager import app


class PublishMediaPrefixTests(unittest.TestCase):
    def test_build_media_prefix_includes_existing_library_media(self):
        with tempfile.TemporaryDirectory() as tmp:
            repo_root = Path(tmp).resolve()
            original_repo_root = app.config.repo_root
            try:
                object.__setattr__(app.config, "repo_root", repo_root)
                video_path = repo_root / "content" / "media" / "video" / "bungle-babes-duo-choreo.mp4"
                image_path = repo_root / "content" / "media" / "images" / "duo-smooch.avif"
                video_path.parent.mkdir(parents=True, exist_ok=True)
                image_path.parent.mkdir(parents=True, exist_ok=True)
                video_path.write_bytes(b"video")
                image_path.write_bytes(b"image")

                prefix = app._build_media_prefix(
                    [],
                    "Bungle Babes",
                    ["video/bungle-babes-duo-choreo.mp4", "images/duo-smooch.avif"],
                )
            finally:
                object.__setattr__(app.config, "repo_root", original_repo_root)

        self.assertIn("[[video:bungle-babes-duo-choreo]]", prefix)
        self.assertIn("![](media/images/duo-smooch.avif)", prefix)

    def test_build_media_prefix_rejects_paths_outside_content_media(self):
        with tempfile.TemporaryDirectory() as tmp:
            repo_root = Path(tmp).resolve()
            original_repo_root = app.config.repo_root
            try:
                object.__setattr__(app.config, "repo_root", repo_root)
                outside_path = repo_root / "content" / "secret.jpg"
                outside_path.parent.mkdir(parents=True, exist_ok=True)
                outside_path.write_bytes(b"image")

                with self.assertRaisesRegex(ValueError, "must stay under content/media"):
                    app._build_media_prefix([], "Bungle Babes", ["../secret.jpg"])
            finally:
                object.__setattr__(app.config, "repo_root", original_repo_root)


if __name__ == "__main__":
    unittest.main()
