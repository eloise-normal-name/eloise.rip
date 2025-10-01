SITENAME = 'eloise.rip'
SITEURL = ''  # During local dev

PATH = 'content'
TIMEZONE = 'UTC'
DEFAULT_LANG = 'en'

# Content settings
ARTICLE_PATHS = ['articles']
PAGE_PATHS = ['pages']
STATIC_PATHS = ['images', 'videos', 'extra']  # 'videos' for optimized media; 'extra' if you add custom files
ARTICLE_SAVE_AS = 'articles/{slug}.html'
ARTICLE_URL = 'articles/{slug}.html'
PAGE_SAVE_AS = '{slug}.html'
PAGE_URL = '{slug}.html'

# Feed generation is usually not desired when developing
FEED_ALL_ATOM = None
CATEGORY_FEED_ATOM = None
TRANSLATION_FEED_ATOM = None
AUTHOR_FEED_ATOM = None
AUTHOR_FEED_RSS = None

DEFAULT_PAGINATION = 10

# Theme configuration
THEME = 'themes/cute-theme'
SITESUBTITLE = 'from the goblin hole 🕳'

# Plugins
PLUGIN_PATHS = ['pelican-plugins']
PLUGINS = [
    'video_embed',
]

# Optional plugin settings
VIDEO_EMBED_CLASS = 'embedded-video'
VIDEO_EMBED_RELATIVE = True  # use relative /videos/... paths when RELATIVE_URLS is True

# Markdown extensions
MARKDOWN = {
    'extensions': ['markdown.extensions.extra', 'markdown.extensions.codehilite', 'markdown.extensions.meta'],
    'extension_configs': {
        'markdown.extensions.codehilite': {'css_class': 'highlight'},
    },
    'output_format': 'html5',
}

RELATIVE_URLS = True

# Ensure any extra files (like CNAME) get correct target names
EXTRA_PATH_METADATA = {
    'extra/CNAME': {'path': 'CNAME'},
}

# Theme-specific settings
DISPLAY_PAGES_ON_MENU = True
DISPLAY_CATEGORIES_ON_MENU = True
MENUITEMS = (
    ('Archives', '/archives.html'),
)

# Social and site info
SOCIAL = ()
GITHUB_URL = ''
TWITTER_URL = ''
