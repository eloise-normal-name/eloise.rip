"""Pelican configuration for the /preview subsite.

Builds the same content as the main site but uses the editorial theme,
outputting to output/preview/ so it is deployed as a hidden subsite at
https://eloise.rip/preview/index.html.

The existing site (pelicanconf.py → output/) is unaffected.
"""
import os
import sys
from pathlib import Path

# Pelican loads settings via importlib.util.spec_from_file_location, which
# does not add the file's directory to sys.path.  Ensure the project root is
# on the path so that `from pelicanconf import *` works when pelican is
# invoked as a console-script entry point (e.g. in CI).
_here = os.path.dirname(os.path.abspath(__file__))
if _here not in sys.path:
    sys.path.insert(0, _here)

# Inherit all base settings
from pelicanconf import *  # noqa: F401, F403

# ── Theme ──────────────────────────────────────────────────────────────────
THEME = 'themes/editorial-theme'

# ── Output ─────────────────────────────────────────────────────────────────
OUTPUT_PATH = 'output/preview'

# ── URLs ───────────────────────────────────────────────────────────────────
# Use absolute URLs so that internal links resolve correctly within /preview/
# and media references (served from the site root /media/) stay separate.
SITEURL = 'https://eloise.rip/preview'
RELATIVE_URLS = False

# ── Static files ───────────────────────────────────────────────────────────
# Keep shared media at the site root to avoid duplicating the larger asset
# tree, but still publish the small favicon/CNAME extras under /preview/ so the
# alternate theme works when previewed as a standalone subsite.
STATIC_PATHS = ['extra']

# ── Feeds ──────────────────────────────────────────────────────────────────
# Feeds are already provided by the main site; suppress duplicates.
FEED_ALL_ATOM = None
FEED_ALL_RSS = None
CATEGORY_FEED_ATOM = None
CATEGORY_FEED_RSS = None

# ── Navigation ──────────────────────────────────────────────────────────────
# Preserve the main-site menu structure, but make manual menu items stay
# within /preview/ instead of jumping back to the root site.
MENUITEMS = tuple(
    (title, link if '://' in link else f'{SITEURL}/{link.lstrip("/")}')
    for title, link in MENUITEMS
)
