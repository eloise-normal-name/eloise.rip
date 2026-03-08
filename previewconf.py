"""Pelican configuration for the /preview subsite.

Builds the same content as the main site but uses the editorial theme,
outputting to output/preview/ so it is deployed as a hidden subsite at
https://eloise.rip/preview/index.html.

The existing site (pelicanconf.py → output/) is unaffected.
"""
from pathlib import Path

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
# Media and favicons are served from the root (/media/, /favicon.ico, etc.)
# rather than being duplicated under /preview/.  The editorial theme templates
# use root-relative /media/... paths so no copying is needed here.
STATIC_PATHS = []
EXTRA_PATH_METADATA = {}

# ── Feeds ──────────────────────────────────────────────────────────────────
# Feeds are already provided by the main site; suppress duplicates.
FEED_ALL_ATOM = None
FEED_ALL_RSS = None
CATEGORY_FEED_ATOM = None
CATEGORY_FEED_RSS = None
