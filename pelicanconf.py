
# --- Site Information ---
SITENAME = 'eloise.rip'
SITEURL = 'https://eloise.rip'
SITESUBTITLE = 'from the goblin hole 🕳'

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
DELETE_OUTPUT_DIRECTORY = True

# --- Feed Settings (disabled for development) ---
FEED_ALL_ATOM = None
CATEGORY_FEED_ATOM = None
TRANSLATION_FEED_ATOM = None
AUTHOR_FEED_ATOM = None
AUTHOR_FEED_RSS = None

# --- Pagination ---
DEFAULT_PAGINATION = 10

# --- Theme Configuration ---
THEME = 'themes/cute-theme'

# --- Plugins ---
PLUGIN_PATHS = ['pelican-plugins']
PLUGINS = ['video_embed']
# Optional plugin settings
VIDEO_EMBED_CLASS = 'embedded-video'

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


# --- Theme-Specific Settings ---
DISPLAY_PAGES_ON_MENU = True
DISPLAY_CATEGORIES_ON_MENU = True
MENUITEMS = (
    ('Blog', '/archives.html'),
)
