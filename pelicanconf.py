AUTHOR = 'Eloise'
SITENAME = 'eloise.rip'
SITEURL = ''  # During local dev

PATH = 'content'
TIMEZONE = 'UTC'
DEFAULT_LANG = 'en'

# Content settings
ARTICLE_PATHS = ['articles']
PAGE_PATHS = ['pages']
STATIC_PATHS = ['images']
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
SITESUBTITLE = 'the goblin hole 🕳'

# Plugins (none yet)
PLUGIN_PATHS = ['pelican-plugins']
PLUGINS = []

# Markdown extensions
MARKDOWN = {
    'extensions': ['markdown.extensions.extra', 'markdown.extensions.codehilite', 'markdown.extensions.meta'],
    'extension_configs': {
        'markdown.extensions.codehilite': {'css_class': 'highlight'},
    },
    'output_format': 'html5',
}

RELATIVE_URLS = True

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
