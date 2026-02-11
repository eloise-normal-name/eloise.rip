from pathlib import Path

# --- Site Information ---
SITENAME = 'eloise.rip'
SITEURL = 'https://eloise.rip'
SITESUBTITLE = 'wintertime goblin hole 🕳❄'

# --- Paths ---
PATH = 'content'
ARTICLE_PATHS = ['articles']
PAGE_PATHS = ['pages']
STATIC_PATHS = ['media', 'extra']

# --- Content Settings ---
TIMEZONE = 'UTC'
DEFAULT_LANG = 'en'
ARTICLE_SAVE_AS = 'blog/{slug}.html'
ARTICLE_URL = 'blog/{slug}.html'
PAGE_SAVE_AS = '{slug}.html'
PAGE_URL = '{slug}.html'

# --- Pagination ---
DEFAULT_PAGINATION = 8

# --- Theme Configuration ---
THEME = 'themes/cute-theme'

# --- Plugins ---
PLUGIN_PATHS = ['pelican-plugins']
PLUGINS = ['video_embed', 'carousel_embed', 'jinja2content']

JINJA_GLOBALS = {
    'Path': Path,
}

# --- Markdown Extensions ---
MARKDOWN = {
    'extensions': [
        'markdown.extensions.codehilite',
        'markdown.extensions.extra',
        'markdown.extensions.meta',
    ],
    'extension_configs': {
        'markdown.extensions.codehilite': {'css_class': 'highlight'},
    },
    'output_format': 'html5',
}

# --- URL Settings ---
RELATIVE_URLS = True

# --- Extra Path Metadata ---
EXTRA_PATH_METADATA = {
    f"extra/{name}": {"path": name}
    for name in (
        "CNAME",
        "android-chrome-192x192.png",
        "android-chrome-512x512.png",
        "apple-touch-icon.png",
        "favicon-16x16.png",
        "favicon-32x32.png",
        "favicon.ico",
    )
}


DISPLAY_PAGES_ON_MENU = True
DISPLAY_CATEGORIES_ON_MENU = True
MENUITEMS = (
    ('Archives', '/archives.html'),
)
