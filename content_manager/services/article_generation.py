from __future__ import annotations

import base64
import json
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Callable

import requests


@dataclass(frozen=True)
class GenerationRequest:
    media_context: list[dict]
    canonical_job: dict
    warnings: list[str]
    allowed_categories: list[str]
    allowed_tags: list[str]
    likely_named_locations: list[str]
    draft_title: str = ""
    draft_summary: str = ""
    draft_category: str = ""
    draft_tags: list[str] | None = None
    draft_content: str = ""
    related_articles: list[dict] | None = None


class ArticleGenerator:
    def __init__(
        self,
        *,
        api_key: str,
        model: str,
        request_fn: Callable = requests.post,
    ) -> None:
        self.api_key = api_key
        self.model = model
        self.request_fn = request_fn

    def generate(self, request: GenerationRequest) -> dict:
        if not self.api_key:
            raise RuntimeError("OPENAI_API_KEY is not set")

        response = self.request_fn(
            "https://api.openai.com/v1/responses",
            headers={
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json",
            },
            json=self._build_payload(request),
            timeout=90,
        )
        response.raise_for_status()
        return self._normalize_model_response(response.json())

    def _build_payload(self, request: GenerationRequest) -> dict:
        canonical_job = request.canonical_job
        prompt = (
            "Create a draft pack for a personal blog article. "
            "Use the visible content in the uploaded media and the extracted metadata as the primary factual grounding.\n"
            f"Canonical location: {canonical_job['location_name']}\n"
            f"Canonical capture time: {canonical_job['captured_at']}\n"
            f"Derived time of day: {canonical_job['time_of_day']}\n"
            f"Likely named locations: {request.likely_named_locations or ['none']}\n"
            f"Warnings: {request.warnings or ['none']}\n"
            f"Allowed categories: {request.allowed_categories}\n"
            f"Allowed tags: {request.allowed_tags}\n"
            "Return strict JSON with keys: title_ideas, summary, category, tags, content_markdown.\n"
            "title_ideas must be exactly 3 strings.\n"
            "category must be one of the allowed categories.\n"
            "tags must use only allowed tags.\n"
            "tags must be 5 to 8 concise strings.\n"
            "content_markdown must be 2 to 5 short paragraphs.\n"
            "Write like a personal site post, not a generic explainer.\n"
            "Avoid broad introductions about the subject as a whole.\n"
            "Preserve useful details from the current draft when they do not conflict with visible media or extracted metadata.\n"
            "Use related published posts for style, pacing, and tone only, not as factual evidence for the new article.\n"
            "Do not invent exact venue names, dates, or hidden facts beyond likely named locations."
        )
        content = [{"type": "input_text", "text": prompt}]
        if (
            request.draft_title
            or request.draft_summary
            or request.draft_category
            or request.draft_tags
            or request.draft_content
        ):
            content.append({
                "type": "input_text",
                "text": (
                    "Current draft context to refine and continue:\n"
                    f"Title: {request.draft_title or 'n/a'}\n"
                    f"Summary: {request.draft_summary or 'n/a'}\n"
                    f"Category: {request.draft_category or 'n/a'}\n"
                    f"Tags: {request.draft_tags or ['none']}\n"
                    f"Draft content:\n{request.draft_content or 'n/a'}"
                ),
            })
        for article in request.related_articles or []:
            content.append({
                "type": "input_text",
                "text": (
                    "Related published post for style only:\n"
                    f"Title: {article.get('title') or 'n/a'}\n"
                    f"Category: {article.get('category') or 'n/a'}\n"
                    f"Tags: {article.get('tags') or []}\n"
                    f"Summary: {article.get('summary') or 'n/a'}\n"
                    f"Excerpt: {article.get('excerpt') or 'n/a'}"
                ),
            })
        for item in request.media_context:
            media_summary = (
                f"Media file {item['name']} ({item['media_type']}), "
                f"location={item.get('location_name') or 'n/a'}, "
                f"captured_at={item.get('captured_at') or 'n/a'}, "
                f"time_of_day={item.get('time_of_day') or 'n/a'}."
            )
            if item["media_type"] == "video":
                frame_count = len(item.get("model_input_paths") or [])
                media_summary += f" The following images are sampled frames from this video ({frame_count} frames)."
            content.append({
                "type": "input_text",
                "text": media_summary,
            })
            for path in item.get("model_input_paths") or []:
                content.append({
                    "type": "input_image",
                    "image_url": data_url_for_path(path),
                })

        return {
            "model": self.model,
            "input": [
                {
                    "role": "system",
                    "content": [{"type": "input_text", "text": "Return valid JSON only."}],
                },
                {
                    "role": "user",
                    "content": content,
                },
            ],
        }

    def _normalize_model_response(self, payload: dict) -> dict:
        parsed = parse_generation_json(extract_output_text(payload))
        title_ideas = parsed.get("title_ideas")
        if not isinstance(title_ideas, list):
            raise ValueError("model response missing title_ideas array")
        cleaned_titles = [title.strip() for title in title_ideas if isinstance(title, str) and title.strip()][:3]
        if len(cleaned_titles) != 3:
            raise ValueError("model response did not include exactly 3 usable title ideas")

        summary = parsed.get("summary")
        category = parsed.get("category")
        content_markdown = parsed.get("content_markdown")
        if not isinstance(summary, str) or not summary.strip():
            raise ValueError("model response missing summary")
        if not isinstance(category, str) or not category.strip():
            raise ValueError("model response missing category")
        if not isinstance(content_markdown, str) or not content_markdown.strip():
            raise ValueError("model response missing content_markdown")

        return {
            "title_ideas": cleaned_titles,
            "summary": summary.strip(),
            "category": category.strip(),
            "tags": canonicalize_tags(parsed.get("tags")),
            "content_markdown": content_markdown.strip(),
        }


def guess_mime_type(path: Path) -> str:
    ext = path.suffix.lower()
    return {
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".png": "image/png",
        ".webp": "image/webp",
        ".gif": "image/gif",
        ".bmp": "image/bmp",
        ".tif": "image/tiff",
        ".tiff": "image/tiff",
        ".avif": "image/avif",
    }.get(ext, "application/octet-stream")


def data_url_for_path(path: Path) -> str:
    encoded = base64.b64encode(path.read_bytes()).decode("ascii")
    return f"data:{guess_mime_type(path)};base64,{encoded}"


def extract_output_text(payload: dict) -> str:
    if isinstance(payload.get("output_text"), str):
        return payload["output_text"]
    parts = []
    for item in payload.get("output", []) or []:
        for content in item.get("content", []) or []:
            if content.get("type") == "output_text" and content.get("text"):
                parts.append(content["text"])
    return "\n".join(parts).strip()


def parse_generation_json(text: str) -> dict:
    text = text.strip()
    if not text:
        raise ValueError("model returned an empty response")
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", text, re.DOTALL)
        if not match:
            raise ValueError("model response was not valid JSON")
        return json.loads(match.group(0))


def canonicalize_tags(raw_tags) -> list[str]:
    if not isinstance(raw_tags, list):
        return []
    result = []
    seen = set()
    for tag in raw_tags:
        if not isinstance(tag, str):
            continue
        clean = tag.strip()
        if not clean:
            continue
        key = clean.lower()
        if key in seen:
            continue
        seen.add(key)
        result.append(clean)
    return result
