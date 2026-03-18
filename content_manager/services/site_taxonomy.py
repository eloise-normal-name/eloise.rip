from __future__ import annotations

from collections import Counter
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class SiteTaxonomy:
    categories: list[str]
    tags: list[str]
    tags_by_category: dict[str, list[str]]


def load_site_taxonomy(articles_dir: Path) -> SiteTaxonomy:
    category_counts: Counter[str] = Counter()
    tag_counts: Counter[str] = Counter()
    category_display: dict[str, str] = {}
    tag_display: dict[str, str] = {}
    category_tag_counts: dict[str, Counter[str]] = {}

    for article_path in articles_dir.rglob("*.md"):
        try:
            raw = article_path.read_text(encoding="utf-8", errors="ignore")
        except OSError:
            continue
        current_category = None
        for line in raw.splitlines():
            if not line.strip():
                break
            if ":" not in line:
                continue
            key, value = line.split(":", 1)
            key = key.strip().lower()
            value = value.strip()
            if key == "category" and value:
                normalized = value.lower()
                category_counts[normalized] += 1
                previous = category_display.get(normalized)
                if previous is None or (previous.islower() and not value.islower()):
                    category_display[normalized] = value
                category_tag_counts.setdefault(normalized, Counter())
                current_category = normalized
            elif key == "tags" and value:
                for tag in [item.strip() for item in value.split(",") if item.strip()]:
                    normalized_tag = tag.lower()
                    tag_counts[normalized_tag] += 1
                    previous = tag_display.get(normalized_tag)
                    if previous is None or (previous.islower() and not tag.islower()):
                        tag_display[normalized_tag] = tag
                    if current_category:
                        category_tag_counts.setdefault(current_category, Counter())[normalized_tag] += 1

    categories = [category_display[key] for key, _ in category_counts.most_common()]
    tags = [tag_display[key] for key, _ in tag_counts.most_common()]
    tags_by_category = {}
    for category_key, counts in category_tag_counts.items():
        display_name = category_display.get(category_key)
        if not display_name:
            continue
        tags_by_category[display_name] = [tag_display[key] for key, _ in counts.most_common() if key in tag_display]
    return SiteTaxonomy(categories=categories, tags=tags, tags_by_category=tags_by_category)


def normalize_category(candidate: str | None, taxonomy: SiteTaxonomy) -> str | None:
    if not candidate:
        return None
    lookup = {value.lower(): value for value in taxonomy.categories}
    return lookup.get(candidate.strip().lower())


def normalize_tags(candidates: list[str] | None, allowed_tags: list[str]) -> list[str]:
    if not candidates:
        return []
    lookup = {value.lower(): value for value in allowed_tags}
    result = []
    seen = set()
    for tag in candidates:
        normalized = lookup.get((tag or "").strip().lower())
        if not normalized or normalized.lower() in seen:
            continue
        seen.add(normalized.lower())
        result.append(normalized)
    return result
