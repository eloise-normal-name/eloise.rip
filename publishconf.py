import os, sys
sys.path.insert(0, os.path.dirname(__file__))
from pelicanconf import *  # noqa

SITEURL = 'https://eloise.rip'
RELATIVE_URLS = True

FEED_ALL_ATOM = 'feeds/all.atom.xml'
CATEGORY_FEED_ATOM = 'feeds/{slug}.atom.xml'
DELETE_OUTPUT_DIRECTORY = True

# Production settings overrides
GOOGLE_ANALYTICS = ''  # Add if needed
