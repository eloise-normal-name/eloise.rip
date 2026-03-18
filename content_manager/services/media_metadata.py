from __future__ import annotations

import json
import re
import subprocess
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable

import requests
from PIL import ExifTags, Image

EXIF_TAGS = ExifTags.TAGS
GPS_TAGS = ExifTags.GPSTAGS
GPS_ALT_TAG_KEYS = {
    "location",
    "com.apple.quicktime.location.iso6709",
    "com.android.capture.fusedgps",
}


@dataclass(frozen=True)
class MediaMetadata:
    captured_at: str | None
    time_of_day: str | None
    gps: dict | None
    location_name: str | None
    metadata_warnings: list[str]
    metadata_status: str

    def to_dict(self) -> dict:
        return {
            "captured_at": self.captured_at,
            "time_of_day": self.time_of_day,
            "gps": self.gps,
            "location_name": self.location_name,
            "metadata_warnings": self.metadata_warnings,
            "metadata_status": self.metadata_status,
        }


def normalize_media_basename(name: str) -> str:
    name = name.strip().lower()
    name = re.sub(r"[^\w\s-]", "", name)
    name = re.sub(r"[\s_]+", "-", name)
    name = re.sub(r"-+", "-", name)
    return name.strip("-")


def to_iso_string(value: datetime | None) -> str | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.isoformat()
    return value.astimezone(timezone.utc).isoformat()


def parse_capture_time(value: str | None) -> datetime | None:
    if not value:
        return None
    raw = value.strip()
    if not raw:
        return None

    candidates = [
        "%Y:%m:%d %H:%M:%S",
        "%Y-%m-%dT%H:%M:%S%z",
        "%Y-%m-%dT%H:%M:%S.%f%z",
        "%Y-%m-%dT%H:%M:%S",
        "%Y-%m-%d %H:%M:%S",
        "%Y-%m-%d %H:%M:%S%z",
        "%Y-%m-%dT%H:%M:%SZ",
    ]
    normalized = raw.replace("Z", "+00:00") if raw.endswith("Z") else raw
    for fmt in candidates:
        try:
            return datetime.strptime(normalized, fmt)
        except ValueError:
            continue
    try:
        return datetime.fromisoformat(normalized)
    except ValueError:
        return None


def derive_time_of_day(captured_at: datetime | None) -> str | None:
    if captured_at is None:
        return None
    hour = captured_at.hour
    if 5 <= hour <= 8:
        return "early morning"
    if 9 <= hour <= 11:
        return "morning"
    if 12 <= hour <= 16:
        return "afternoon"
    if 17 <= hour <= 20:
        return "evening"
    return "night"


def _safe_float(value) -> float | None:
    try:
        return float(value)
    except (TypeError, ValueError, ZeroDivisionError):
        return None


def _gps_rational_to_float(value) -> float | None:
    if isinstance(value, tuple) and len(value) == 2:
        num = _safe_float(value[0])
        den = _safe_float(value[1])
        if num is None or den in (None, 0):
            return None
        return num / den
    if hasattr(value, "numerator") and hasattr(value, "denominator"):
        den = _safe_float(value.denominator)
        if den in (None, 0):
            return None
        num = _safe_float(value.numerator)
        return None if num is None else num / den
    return _safe_float(value)


def _gps_tuple_to_decimal(values, ref: str | None) -> float | None:
    if not values or len(values) < 3:
        return None
    degrees = _gps_rational_to_float(values[0])
    minutes = _gps_rational_to_float(values[1])
    seconds = _gps_rational_to_float(values[2])
    if None in (degrees, minutes, seconds):
        return None
    decimal = degrees + (minutes / 60.0) + (seconds / 3600.0)
    if (ref or "").upper() in {"S", "W"}:
        decimal *= -1
    return decimal


def parse_iso6709(value: str | None) -> tuple[float | None, float | None]:
    if not value:
        return (None, None)
    match = re.match(r"^([+-]\d+(?:\.\d+)?)([+-]\d+(?:\.\d+)?)([+-]\d+(?:\.\d+)?)?/?$", value.strip())
    if not match:
        return (None, None)
    return (_safe_float(match.group(1)), _safe_float(match.group(2)))


def build_coordinate_label(latitude: float | None, longitude: float | None) -> str | None:
    if latitude is None or longitude is None:
        return None
    return f"{latitude:.5f}, {longitude:.5f}"


def compact_place_name(address: dict | None) -> str | None:
    if not isinstance(address, dict):
        return None
    city = address.get("city") or address.get("town") or address.get("village") or address.get("hamlet") or address.get("suburb")
    state = address.get("state") or address.get("region") or address.get("county")
    country = address.get("country")
    parts = [part for part in (city, state, country) if part]
    return ", ".join(parts) if parts else None


def reverse_geocode(
    latitude: float | None,
    longitude: float | None,
    *,
    user_agent: str,
    http_get: Callable = requests.get,
) -> tuple[str | None, str | None]:
    if latitude is None or longitude is None:
        return (None, None)
    try:
        response = http_get(
            "https://nominatim.openstreetmap.org/reverse",
            params={"lat": latitude, "lon": longitude, "format": "jsonv2", "zoom": 12},
            headers={"User-Agent": user_agent},
            timeout=10,
        )
        response.raise_for_status()
        payload = response.json()
        place = compact_place_name(payload.get("address")) or payload.get("display_name")
        return (place, None)
    except requests.RequestException as err:
        return (None, f"reverse geocoding failed: {err}")


def extract_image_metadata(
    input_path: Path,
    *,
    geocoder_user_agent: str,
    http_get: Callable = requests.get,
) -> MediaMetadata:
    warnings: list[str] = []
    captured_at = None
    latitude = None
    longitude = None
    pillow_error = None

    try:
        with Image.open(input_path) as image:
            exif = image.getexif()
            if exif:
                for tag_id, value in exif.items():
                    tag_name = EXIF_TAGS.get(tag_id)
                    if tag_name in {"DateTimeOriginal", "DateTimeDigitized", "DateTime"} and captured_at is None:
                        captured_at = parse_capture_time(str(value))
                # Pillow commonly stores DateTimeOriginal and GPS fields in nested IFDs.
                exif_ifd = exif.get_ifd(34665) if 34665 in exif else {}
                for tag_id, value in exif_ifd.items():
                    tag_name = EXIF_TAGS.get(tag_id)
                    if tag_name in {"DateTimeOriginal", "DateTimeDigitized", "DateTime"} and captured_at is None:
                        captured_at = parse_capture_time(str(value))

                gps_ifd = exif.get_ifd(34853) if 34853 in exif else {}
                if gps_ifd:
                    gps_info = {
                        GPS_TAGS.get(gps_key): gps_value
                        for gps_key, gps_value in gps_ifd.items()
                    }
                    latitude = _gps_tuple_to_decimal(gps_info.get("GPSLatitude"), gps_info.get("GPSLatitudeRef"))
                    longitude = _gps_tuple_to_decimal(gps_info.get("GPSLongitude"), gps_info.get("GPSLongitudeRef"))
    except Exception as err:
        pillow_error = f"image metadata read failed: {err}"

    if captured_at is None or latitude is None or longitude is None:
        try:
            exiftool_payload = _exiftool_image_metadata(input_path)
            if captured_at is None:
                captured_at = _exiftool_capture_time(exiftool_payload)
            if latitude is None:
                latitude = _safe_float(exiftool_payload.get("GPSLatitude"))
            if longitude is None:
                longitude = _safe_float(exiftool_payload.get("GPSLongitude"))
        except RuntimeError as err:
            if pillow_error:
                warnings.append(pillow_error)
            warnings.append(str(err))
    elif pillow_error:
        warnings.append(pillow_error)

    location_name = None
    if latitude is not None and longitude is not None:
        location_name, geocode_warning = reverse_geocode(
            latitude,
            longitude,
            user_agent=geocoder_user_agent,
            http_get=http_get,
        )
        if geocode_warning:
            warnings.append(geocode_warning)
        if not location_name:
            location_name = build_coordinate_label(latitude, longitude)
    else:
        warnings.append("image GPS metadata missing")

    if captured_at is None:
        warnings.append("image capture time metadata missing")

    return MediaMetadata(
        captured_at=to_iso_string(captured_at),
        time_of_day=derive_time_of_day(captured_at),
        gps={"latitude": latitude, "longitude": longitude} if latitude is not None and longitude is not None else None,
        location_name=location_name,
        metadata_warnings=warnings,
        metadata_status="ready" if location_name and captured_at else "incomplete",
    )


def _exiftool_image_metadata(input_path: Path) -> dict:
    try:
        result = subprocess.run(
            ["exiftool", "-j", "-n", str(input_path)],
            capture_output=True,
            text=True,
        )
    except FileNotFoundError as err:
        raise RuntimeError("exiftool not found in PATH") from err
    if result.returncode != 0:
        raise RuntimeError((result.stderr or result.stdout or "exiftool failed")[-400:])
    try:
        payload = json.loads(result.stdout or "[]")
    except json.JSONDecodeError as err:
        raise RuntimeError("exiftool returned invalid JSON") from err
    if not isinstance(payload, list) or not payload or not isinstance(payload[0], dict):
        raise RuntimeError("exiftool returned no metadata")
    return payload[0]


def _exiftool_capture_time(payload: dict) -> datetime | None:
    for key in ("SubSecDateTimeOriginal", "DateTimeOriginal", "CreateDate", "ModifyDate"):
        value = payload.get(key)
        if isinstance(value, str):
            parsed = parse_capture_time(value)
            if parsed is not None:
                return parsed
    return None


def ffprobe_json(input_path: Path) -> dict:
    result = subprocess.run(
        ["ffprobe", "-v", "quiet", "-print_format", "json", "-show_format", "-show_streams", str(input_path)],
        capture_output=True,
        text=True,
        check=True,
    )
    return json.loads(result.stdout or "{}")


def extract_video_tags(probe_data: dict) -> dict[str, str]:
    tags: dict[str, str] = {}
    format_tags = probe_data.get("format", {}).get("tags", {}) or {}
    for key, value in format_tags.items():
        tags[str(key).lower()] = str(value)
    for stream in probe_data.get("streams", []) or []:
        for key, value in (stream.get("tags", {}) or {}).items():
            lowered = str(key).lower()
            tags.setdefault(lowered, str(value))
    return tags


def extract_video_metadata(
    input_path: Path,
    *,
    geocoder_user_agent: str,
    http_get: Callable = requests.get,
    probe_reader: Callable[[Path], dict] = ffprobe_json,
) -> MediaMetadata:
    warnings: list[str] = []
    captured_at = None
    latitude = None
    longitude = None

    try:
        tags = extract_video_tags(probe_reader(input_path))
        # Prefer local capture-time tags when multiple variants exist.
        # Many cameras include both:
        # - creation_time (commonly UTC)
        # - com.apple.quicktime.creationdate (local with timezone offset)
        # We should derive time_of_day from local capture hour, not UTC.
        for key in ("com.apple.quicktime.creationdate", "date", "creation_time"):
            if captured_at is None:
                captured_at = parse_capture_time(tags.get(key))
        for key in GPS_ALT_TAG_KEYS:
            latitude, longitude = parse_iso6709(tags.get(key))
            if latitude is not None and longitude is not None:
                break
    except FileNotFoundError:
        warnings.append("ffprobe not found in PATH")
    except subprocess.CalledProcessError as err:
        warnings.append((err.stderr or err.stdout or "ffprobe failed")[-400:])
    except json.JSONDecodeError:
        warnings.append("ffprobe returned invalid JSON")

    location_name = None
    if latitude is not None and longitude is not None:
        location_name, geocode_warning = reverse_geocode(
            latitude,
            longitude,
            user_agent=geocoder_user_agent,
            http_get=http_get,
        )
        if geocode_warning:
            warnings.append(geocode_warning)
        if not location_name:
            location_name = build_coordinate_label(latitude, longitude)
    else:
        warnings.append("video GPS metadata missing")

    if captured_at is None:
        warnings.append("video capture time metadata missing")

    return MediaMetadata(
        captured_at=to_iso_string(captured_at),
        time_of_day=derive_time_of_day(captured_at),
        gps={"latitude": latitude, "longitude": longitude} if latitude is not None and longitude is not None else None,
        location_name=location_name,
        metadata_warnings=warnings,
        metadata_status="ready" if location_name and captured_at else "incomplete",
    )


def extract_media_metadata(
    input_path: Path,
    media_type: str,
    *,
    geocoder_user_agent: str,
    http_get: Callable = requests.get,
    probe_reader: Callable[[Path], dict] = ffprobe_json,
) -> dict:
    if media_type == "image":
        metadata = extract_image_metadata(
            input_path,
            geocoder_user_agent=geocoder_user_agent,
            http_get=http_get,
        )
    else:
        metadata = extract_video_metadata(
            input_path,
            geocoder_user_agent=geocoder_user_agent,
            http_get=http_get,
            probe_reader=probe_reader,
        )
    return metadata.to_dict()
