"""Pelican plugin to replace [[video:NAME]] markers in article/page content
with an HTML5 video element referencing generated assets in /media/video.

Usage in Markdown:
        Write:  [[video:hop-hop-hop]]
        Renders:
                <figure class="embedded-video">
                    <video controls preload="metadata" poster="/media/video/hop-hop-hop.jpg">
                        <source src="/media/video/hop-hop-hop.mp4" type="video/mp4" />
                    </video>
                </figure>

Configuration (optional in pelicanconf.py):
    VIDEO_EMBED_CLASS = 'embedded-video'  # outer figure class

If relative disabled (or RELATIVE_URLS False), it prefixes SITEURL.

In RSS/Atom feeds the <video> element is replaced with the poster <img> so
feed readers display a static image instead of a stripped/broken player.

Limitations:
    - No fallback text beyond standard browser message.
    - Assumes poster and MP4 assets exist.
"""
from __future__ import annotations

import re
from pelican import signals
from pelican.contents import Article, Page

VIDEO_PATTERN = re.compile(
    r"(?:(?P<prefix><p[^>]*>)\s*)?\[\[video:(?P<name>[a-zA-Z0-9._-]+)]]\s*(?(prefix)</p>)",
    re.IGNORECASE | re.DOTALL,
)

# Matches the <figure> block produced by build_video_html so we can swap it
# for a plain poster <img> in feed output.
_FEED_VIDEO_PATTERN = re.compile(
    r'<figure\s[^>]*class="[^"]*embedded-video[^"]*"[^>]*>'
    r'.*?'
    r'<video[^>]*\sposter="(?P<poster>[^"]+)"[^>]*>'
    r'.*?</video>'
    r'\s*</figure>',
    re.DOTALL | re.IGNORECASE,
)


def build_video_html(name: str, siteurl: str, relative: bool, css_class: str) -> str:
    base = f"/media/video/{name}"
    poster = f"{base}.jpg"
    mp4 = f"{base}.mp4"
    return (
        f'<figure class="{css_class}">\n'
        f'  <video controls preload="metadata" poster="{poster}">\n'
        f'    <source src="{mp4}" type="video/mp4" />\n'
        f'    Your browser does not support the video tag.\n'
        f'  </video>\n'
        f'</figure>'
    )


def _replace_markers_in_text(text: str, css_class: str) -> str:
    def _repl(match: re.Match) -> str:
        name = match.group('name')
        return build_video_html(name, '', True, css_class)

    return VIDEO_PATTERN.sub(_repl, text)


def _make_feed_safe(content: str) -> str:
    """Replace video figures with poster <img> tags for feed readers."""
    def _repl(m: re.Match) -> str:
        return f'<figure><img src="{m.group("poster")}" alt="Video" /></figure>'
    return _FEED_VIDEO_PATTERN.sub(_repl, content)


def replace_markers(instance):  # instance may be Article or Page
    if not isinstance(instance, (Article, Page)):
        return
    source = getattr(instance, '_content', None) or getattr(instance, 'content', None)
    if not source:
        return

    css_class = instance.settings.get('VIDEO_EMBED_CLASS', 'embedded-video')
    instance._content = _replace_markers_in_text(source, css_class)  # noqa: SLF001


def replace_markers_late(generators):
    for generator in generators:
        for attr in ('articles', 'pages'):
            for instance in getattr(generator, attr, []):
                if not isinstance(instance, (Article, Page)):
                    continue
                css_class = instance.settings.get('VIDEO_EMBED_CLASS', 'embedded-video')
                content = getattr(instance, '_content', None)
                if content:
                    instance._content = _replace_markers_in_text(content, css_class)  # noqa: SLF001
                summary = getattr(instance, '_summary', None)
                if summary:
                    instance._summary = _replace_markers_in_text(summary, css_class)  # noqa: SLF001


def _patch_writer() -> None:
    """Patch Writer to serve poster images instead of <video> in feed entries."""
    from pelican.writers import Writer

    original = Writer._add_item_to_the_feed

    def _patched(self, feed, item):  # noqa: ANN001
        _orig_get_content = item.get_content

        def _feed_get_content(siteurl: str) -> str:
            return _make_feed_safe(_orig_get_content(siteurl))

        item.get_content = _feed_get_content
        try:
            original(self, feed, item)
        finally:
            try:
                del item.get_content
            except AttributeError:
                pass

    Writer._add_item_to_the_feed = _patched


def register():  # Pelican entry point
    signals.content_object_init.connect(replace_markers)
    signals.all_generators_finalized.connect(replace_markers_late)
    _patch_writer()
