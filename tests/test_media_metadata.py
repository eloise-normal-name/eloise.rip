from __future__ import annotations

import unittest
from pathlib import Path
from unittest.mock import patch

from content_manager.services import media_metadata


class FakeExif(dict):
    def __init__(self):
        super().__init__({34665: 100, 34853: 200})

    def get_ifd(self, ifd_id):
        if ifd_id == 34665:
            return {
                36867: "2020:10:22 23:12:07",
                36868: "2020:10:22 23:12:07",
            }
        if ifd_id == 34853:
            return {
                1: "N",
                2: (47.0, 38.0, 20.39),
                3: "W",
                4: (122.0, 20.0, 28.66),
            }
        return {}


class FakeImage:
    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False

    def getexif(self):
        return FakeExif()


class FakeResponse:
    def raise_for_status(self):
        return None

    def json(self):
        return {}


class FakeRunResult:
    def __init__(self, stdout: str, returncode: int = 0):
        self.stdout = stdout
        self.stderr = ""
        self.returncode = returncode


class MediaMetadataTests(unittest.TestCase):
    def test_extract_image_metadata_reads_nested_exif_and_gps_ifds(self):
        with patch.object(media_metadata.Image, "open", return_value=FakeImage()):
            metadata = media_metadata.extract_image_metadata(
                Path("sample.jpeg"),
                geocoder_user_agent="test-agent",
                http_get=lambda *args, **kwargs: FakeResponse(),
            )

        self.assertEqual(metadata.captured_at, "2020-10-22T23:12:07")
        self.assertEqual(metadata.time_of_day, "night")
        self.assertAlmostEqual(metadata.gps["latitude"], 47.6389972222, places=5)
        self.assertAlmostEqual(metadata.gps["longitude"], -122.3412944444, places=5)
        self.assertEqual(metadata.location_name, "47.63900, -122.34129")
        self.assertEqual(metadata.metadata_status, "ready")

    def test_extract_image_metadata_falls_back_to_exiftool_for_avif(self):
        exiftool_json = """[{
          "DateTimeOriginal": "2020:10:22 23:12:07",
          "GPSLatitude": 47.6389972222222,
          "GPSLongitude": -122.341294444444
        }]"""

        with patch.object(media_metadata.Image, "open", side_effect=OSError("cannot identify image file")), patch.object(
            media_metadata.subprocess,
            "run",
            return_value=FakeRunResult(exiftool_json),
        ):
            metadata = media_metadata.extract_image_metadata(
                Path("sample.avif"),
                geocoder_user_agent="test-agent",
                http_get=lambda *args, **kwargs: FakeResponse(),
            )

        self.assertEqual(metadata.captured_at, "2020-10-22T23:12:07")
        self.assertAlmostEqual(metadata.gps["latitude"], 47.6389972222, places=5)
        self.assertAlmostEqual(metadata.gps["longitude"], -122.3412944444, places=5)
        self.assertEqual(metadata.location_name, "47.63900, -122.34129")
        self.assertEqual(metadata.metadata_warnings, [])
        self.assertEqual(metadata.metadata_status, "ready")

    def test_extract_video_metadata_prefers_local_quicktime_creation_date(self):
        probe_payload = {
            "format": {
                "tags": {
                    "creation_time": "2026-03-17T02:30:00Z",
                    "com.apple.quicktime.creationdate": "2026-03-16T18:30:00-08:00",
                }
            }
        }

        metadata = media_metadata.extract_video_metadata(
            Path("sample.mov"),
            geocoder_user_agent="test-agent",
            probe_reader=lambda _: probe_payload,
        )

        self.assertEqual(metadata.captured_at, "2026-03-17T02:30:00+00:00")
        self.assertEqual(metadata.time_of_day, "evening")


if __name__ == "__main__":
    unittest.main()
