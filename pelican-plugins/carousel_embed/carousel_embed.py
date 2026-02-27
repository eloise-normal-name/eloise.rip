"""Pelican plugin to render inline image carousels from lightweight markers.

Usage in Markdown::

    [[carousel:label=Catgirl and Goblin photo set;
                media/images/tw-catgirl-and-goblin (1).jpg|Catgirl stepping up to the Time Warp machine next to Goblin.;
                media/images/tw-catgirl-and-goblin (2).jpg|Goblin queues up a flip while Catgirl watches.;
                ...]]

Each entry after the optional ``label=`` is a ``path|caption`` pair separated by
semicolons. Paths are interpreted relative to the Pelican ``MEDIA`` folder when
not absolute. Captions double as ``alt`` text; if omitted the file name is used.

Two optional settings customise CSS classes::

    CAROUSEL_CONTAINER_CLASS = 'carousel-gallery'
    CAROUSEL_ITEM_CLASS = 'carousel-item'
    CAROUSEL_SCROLLER_CLASS = 'carousel-scroller'

The plugin simply expands the marker into semantic HTML that can be styled by
`themes/cute-theme/static/css/style.css`.
"""
from __future__ import annotations

from dataclasses import dataclass
from html import escape
from pathlib import Path
import re
from typing import List, Optional, Tuple
from urllib.parse import quote, unquote

from pelican import signals
from pelican.contents import Article, Page

CAROUSEL_PATTERN = re.compile(
    r"(?:(?P<prefix><p[^>]*>)\s*)?\[\[carousel:(?P<spec>.*?)]]\s*(?(prefix)</p>)",
    re.IGNORECASE | re.DOTALL,
)


@dataclass
class CarouselItem:
    src: str
    caption: str
    width: Optional[int] = None
    height: Optional[int] = None

    @property
    def aspect_ratio(self) -> Optional[float]:
        if self.width and self.height:
            try:
                return self.width / self.height
            except ZeroDivisionError:
                return None
        return None


def _normalise_path(raw_path: str) -> str:
    path = raw_path.strip()
    if not path:
        return ''
    if path.startswith(('http://', 'https://', '//')):
        return path
    if path.startswith('/'):
        return quote(path, safe='/:%')
    if path.startswith('media/'):
        return quote(f"/media/{path[len('media/'):]}" if not path.startswith('/media/') else path, safe='/:%')
    if path.startswith('images/'):
        return quote(f"/media/{path}", safe='/:%')
    return quote(path if path.startswith('/') else f"/{path}", safe='/:%')


def _resolve_image_path(raw_path: str, settings, instance) -> Optional[Path]:
    path = unquote(raw_path.strip())
    if not path or path.startswith(('http://', 'https://', '//')):
        return None

    base_content = Path(settings.get('PATH', 'content'))
    candidates: List[Path] = []

    if not path.startswith('/') and getattr(instance, 'source_path', None):
        article_dir = Path(instance.source_path).parent
        candidates.append(article_dir.joinpath(path).resolve())

    trimmed = path.lstrip('/') if path.startswith('/') else path
    candidates.append(base_content / trimmed)
    if not trimmed.startswith('media/'):
        candidates.append(base_content / 'media' / trimmed)

    for candidate in candidates:
        if candidate.exists():
            return candidate
    return None


def _probe_dimensions(raw_path: str, settings, instance) -> Tuple[Optional[int], Optional[int]]:
    local_path = _resolve_image_path(raw_path, settings, instance)
    if not local_path:
        return None, None
    try:
        from PIL import Image
    except ModuleNotFoundError:
        return None, None

    try:
        with Image.open(local_path) as image:
            width, height = image.size
            return int(width), int(height)
    except OSError:
        return None, None


def _parse_spec(spec: str, settings, instance) -> Tuple[str, List[CarouselItem]]:
    label = 'Image carousel'
    items: List[CarouselItem] = []
    for raw in spec.split(';'):
        entry = raw.strip()
        if not entry:
            continue
        if entry.lower().startswith('label='):
            label = entry.split('=', 1)[1].strip() or label
            continue
        if '|' in entry:
            path_part, caption_part = entry.split('|', 1)
        else:
            path_part, caption_part = entry, ''
        path = _normalise_path(path_part)
        if not path:
            continue
        caption = caption_part.strip()
        width, height = _probe_dimensions(path_part, settings, instance)
        items.append(CarouselItem(path, caption, width, height))
    return label, items


def _build_html(label: str, items: List[CarouselItem], settings) -> str:
    container_class = settings.get('CAROUSEL_CONTAINER_CLASS', 'carousel-gallery')
    scroller_class = settings.get('CAROUSEL_SCROLLER_CLASS', 'carousel-scroller')
    item_class = settings.get('CAROUSEL_ITEM_CLASS', 'carousel-item')

    explicit_widths = [item.width for item in items if item.width]
    max_card_width = settings.get('CAROUSEL_MAX_CARD_WIDTH', 520)
    target_width = ''
    if explicit_widths:
        max_width = min(max(explicit_widths), max_card_width)
        target_width = f' style="--carousel-item-width: {max_width}px;"'
    else:
        default_width = settings.get('CAROUSEL_DEFAULT_CARD_WIDTH')
        if default_width:
            target_width = f' style="--carousel-item-width: {int(default_width)}px;"'

    label_html = escape(label or 'Image carousel')
    lines = [f'<div class="{container_class}" role="group" aria-label="{label_html}">']
    lines.append(f'  <div class="{scroller_class}" tabindex="0"{target_width}>')
    for item in items:
        alt_text = item.caption if item.caption else item.src.rsplit('/', 1)[-1]
        caption_html = escape(item.caption)
        alt_html = escape(alt_text)
        style_attr = ''
        if item.aspect_ratio:
            style_attr = f' style="--carousel-item-aspect: {item.aspect_ratio:.4f};"'
        width_attr = f' width="{item.width}"' if item.width else ''
        height_attr = f' height="{item.height}"' if item.height else ''
        lines.append(f'    <figure class="{item_class}"{style_attr}>')
        lines.append(
            f'      <img src="{item.src}" alt="{alt_html}" loading="lazy"{width_attr}{height_attr}>'
        )
        if item.caption:
            lines.append(f'      <figcaption>{caption_html}</figcaption>')
        lines.append('    </figure>')
    lines.append('  </div>')
    lines.append('</div>')
    return '\n'.join(lines)


def _replace_carousels_in_text(text: str, settings, instance) -> str:
    def _repl(match: re.Match) -> str:
        spec = match.group('spec')
        label, items = _parse_spec(spec, settings, instance)
        if not items:
            return ''
        return _build_html(label, items, settings)

    replaced = CAROUSEL_PATTERN.sub(_repl, text)
    container_class = settings.get('CAROUSEL_CONTAINER_CLASS', 'carousel-gallery')
    wrapper_pattern = re.compile(
        rf'<p>\s*(<div class="{re.escape(container_class)}".*?</div>)\s*</p>',
        re.IGNORECASE | re.DOTALL,
    )
    return wrapper_pattern.sub(r'\1', replaced)


def replace_carousels(instance):
    if not isinstance(instance, (Article, Page)):
        return
    source = getattr(instance, '_content', None) or getattr(instance, 'content', None)
    if not source:
        return

    instance._content = _replace_carousels_in_text(source, instance.settings, instance)  # noqa: SLF001


def replace_carousels_late(generators):
    for generator in generators:
        for attr in ('articles', 'pages'):
            for instance in getattr(generator, attr, []):
                if not isinstance(instance, (Article, Page)):
                    continue
                content = getattr(instance, '_content', None)
                if content:
                    instance._content = _replace_carousels_in_text(content, instance.settings, instance)  # noqa: SLF001
                summary = getattr(instance, '_summary', None)
                if summary:
                    instance._summary = _replace_carousels_in_text(summary, instance.settings, instance)  # noqa: SLF001


def register():
    signals.content_object_init.connect(replace_carousels)
    signals.all_generators_finalized.connect(replace_carousels_late)
