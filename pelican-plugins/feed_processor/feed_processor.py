"""Pelican plugin: feed-safe content transformations.

Makes RSS/Atom feeds show full article content with images instead of just
summaries. Replaces <video> elements with their poster <img> so feed readers
display a representative image rather than a broken/stripped video player.

How it works
------------
Pelican's Writer calls ``item.get_content(siteurl)`` to obtain the HTML that
goes into each feed entry.  This plugin patches
``Writer._add_item_to_the_feed`` so that, for the duration of that call, each
article's ``get_content`` method returns a feed-safe version of its content
where every embedded-video figure is replaced with an <img> of the poster.

No article content is permanently modified, so the rendered HTML pages are
completely unaffected.
"""
from __future__ import annotations

import re
from pelican import signals
from pelican.writers import Writer

# Matches the figure block produced by the video_embed plugin:
#   <figure class="embedded-video">
#     <video ... poster="/media/video/name.jpg">...</video>
#   </figure>
_VIDEO_FIGURE = re.compile(
    r'<figure\s[^>]*class="[^"]*embedded-video[^"]*"[^>]*>'
    r'.*?'
    r'<video[^>]*\sposter="(?P<poster>[^"]+)"[^>]*>'
    r'.*?</video>'
    r'\s*</figure>',
    re.DOTALL | re.IGNORECASE,
)


def _make_feed_safe(content: str) -> str:
    """Return *content* with <video> figures replaced by poster <img> tags."""

    def _replace(m: re.Match) -> str:
        poster = m.group("poster")
        return f'<figure><img src="{poster}" alt="Video" /></figure>'

    return _VIDEO_FIGURE.sub(_replace, content)


def _patch_writer() -> None:
    """Wrap Writer._add_item_to_the_feed to serve feed-safe content."""
    original = Writer._add_item_to_the_feed

    def _patched(self, feed, item):  # noqa: ANN001
        # Shadow the instance's get_content with a feed-safe wrapper.
        _original_get_content = item.get_content

        def _feed_get_content(siteurl: str) -> str:
            return _make_feed_safe(_original_get_content(siteurl))

        item.get_content = _feed_get_content
        try:
            original(self, feed, item)
        finally:
            try:
                del item.get_content
            except AttributeError:
                pass

    Writer._add_item_to_the_feed = _patched


def register() -> None:  # Pelican entry point
    _patch_writer()
