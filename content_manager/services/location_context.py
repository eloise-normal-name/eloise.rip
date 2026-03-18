from __future__ import annotations

from dataclasses import dataclass
from math import asin, cos, radians, sin, sqrt


@dataclass(frozen=True)
class KnownLocation:
    name: str
    city: str
    state: str
    country: str
    address: str | None = None
    latitude: float | None = None
    longitude: float | None = None
    match_radius_meters: float | None = None
    categories: tuple[str, ...] = ()
    aliases: tuple[str, ...] = ()


KNOWN_LOCATIONS = [
    KnownLocation(
        name="Home",
        city="Seattle",
        state="Washington",
        country="United States",
        address="2550 3rd Ave, Seattle, WA",
        latitude=47.6175,
        longitude=-122.3508,
        match_radius_meters=1200,
        aliases=("At Home",),
    ),
    KnownLocation(
        name="Trinity Pole Studio",
        city="Kirkland",
        state="Washington",
        country="United States",
        categories=("Pole Dance",),
        aliases=("Trinity", "Trinity Pole"),
    ),
]


def _as_float(value: object) -> float | None:
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _distance_meters(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    earth_radius_m = 6_371_000.0
    d_lat = radians(lat2 - lat1)
    d_lon = radians(lon2 - lon1)
    a = sin(d_lat / 2) ** 2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(d_lon / 2) ** 2
    c = 2 * asin(sqrt(a))
    return earth_radius_m * c


def find_likely_named_locations(
    location_name: str | None,
    *,
    gps: dict | None = None,
    category_hint: str | None = None,
) -> list[str]:
    if not location_name and not gps:
        return []
    haystack = (location_name or "").lower()
    latitude = _as_float((gps or {}).get("latitude")) if isinstance(gps, dict) else None
    longitude = _as_float((gps or {}).get("longitude")) if isinstance(gps, dict) else None

    matches = []
    for item in KNOWN_LOCATIONS:
        if category_hint and item.categories and category_hint not in item.categories:
            continue

        matched = False
        if (
            latitude is not None
            and longitude is not None
            and item.latitude is not None
            and item.longitude is not None
        ):
            radius = item.match_radius_meters or 500.0
            matched = _distance_meters(latitude, longitude, item.latitude, item.longitude) <= radius

        if not matched and haystack:
            if item.city.lower() in haystack and item.state.lower() in haystack:
                matched = True
            elif item.name.lower() in haystack:
                matched = True
            elif any(alias.lower() in haystack for alias in item.aliases):
                matched = True

        if not matched:
            continue
        matches.append(item.name)
    return matches
