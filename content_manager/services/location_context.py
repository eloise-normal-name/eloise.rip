from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class KnownLocation:
    name: str
    city: str
    state: str
    country: str
    categories: tuple[str, ...] = ()
    aliases: tuple[str, ...] = ()


KNOWN_LOCATIONS = [
    KnownLocation(
        name="Trinity Pole Studio",
        city="Kirkland",
        state="Washington",
        country="United States",
        categories=("Pole Dance",),
        aliases=("Trinity", "Trinity Pole"),
    ),
]


def find_likely_named_locations(location_name: str | None, category_hint: str | None = None) -> list[str]:
    if not location_name:
        return []
    haystack = location_name.lower()
    matches = []
    for item in KNOWN_LOCATIONS:
        if item.city.lower() not in haystack or item.state.lower() not in haystack:
            continue
        if category_hint and item.categories and category_hint not in item.categories:
            continue
        matches.append(item.name)
    return matches
