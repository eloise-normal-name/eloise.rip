"""Pelican plugin to replace [[video:NAME]] markers in article/page content
with an HTML5 video element referencing generated assets in /videos.

Usage in Markdown:
    Write:  [[video:hop-hop-hop]]
    Renders:
        <figure class="embedded-video">
          <video controls preload="metadata" poster="/videos/hop-hop-hop.jpg">
            <source src="/videos/hop-hop-hop.webm" type="video/webm" />
            <source src="/videos/hop-hop-hop.mp4" type="video/mp4" />
          </video>
        </figure>

Configuration (optional in pelicanconf.py):
    VIDEO_EMBED_CLASS = 'embedded-video'  # outer figure class
    VIDEO_EMBED_RELATIVE = True           # if True and RELATIVE_URLS, omit SITEURL prefix

If relative disabled (or RELATIVE_URLS False), it prefixes SITEURL.

Limitations:
    - No fallback text beyond standard browser message.
    - Assumes poster/MP4/WebM triplet exists.
"""
from __future__ import annotations

import re
from pelican import signals
from pelican.contents import Article, Page

VIDEO_PATTERN = re.compile(r"\[\[video:([a-zA-Z0-9._-]+)]]")


def build_video_html(name: str, siteurl: str, relative: bool, css_class: str) -> str:
    base = f"/videos/{name}" if relative else f"{siteurl}/videos/{name}"
    poster = f"{base}.jpg"
    webm = f"{base}.webm"
    mp4 = f"{base}.mp4"
    return (
        f'<figure class="{css_class}">\n'
        f'  <video controls preload="metadata" poster="{poster}">\n'
        f'    <source src="{webm}" type="video/webm" />\n'
        f'    <source src="{mp4}" type="video/mp4" />\n'
        f'    Your browser does not support the video tag.\n'
        f'  </video>\n'
        f'</figure>'
    )


def replace_markers(instance):  # instance may be Article or Page
    if not isinstance(instance, (Article, Page)):
        return
    if not getattr(instance, 'content', None):  # not yet processed
        return

    settings = instance.settings
    css_class = settings.get('VIDEO_EMBED_CLASS', 'embedded-video')
    relative = settings.get('VIDEO_EMBED_RELATIVE', True) and settings.get('RELATIVE_URLS', False)
    siteurl = settings.get('SITEURL', '').rstrip('/')

    def _repl(match: re.Match) -> str:
        name = match.group(1)
        return build_video_html(name, siteurl, relative, css_class)

    new_content = VIDEO_PATTERN.sub(_repl, instance.content)
    instance._content = new_content  # noqa: SLF001


def register():  # Pelican entry point
    signals.content_object_init.connect(replace_markers)
