"""
Responsive Images Plugin for Pelican

This plugin automatically converts image references in article content
to use modern <picture> elements with WebP/AVIF/JPEG fallbacks.

It converts:
  ![Alt text](../media/image.jpg)
  
To:
  <picture>
    <source srcset="/media/image.avif" type="image/avif">
    <source srcset="/media/image.webp" type="image/webp">
    <img src="/media/image.jpg" alt="Alt text" loading="lazy">
  </picture>
"""

import re
from pelican import signals
from pelican.contents import Article, Page


def convert_images_to_responsive(content):
    """Convert HTML image references to responsive picture elements."""
    
    # Pattern to match HTML images with ../media/ paths
    # This covers: <img alt="..." src="..."> and <img src="..." alt="...">
    html_pattern = r'<img\s+(?=.*src=["\']\.\.\/media\/([^"\']+\.(jpg|jpeg|png|webp))["\'])(?=.*alt=["\']([^"\']*)["\'])[^>]*>'
    
    def replace_html_image(match):
        filename = match.group(1)
        alt_text = match.group(3)
        # Extract filename without extension
        image_stem = filename.rsplit('.', 1)[0]
        
        return f'''<picture>
  <source srcset="../media/{image_stem}.avif" type="image/avif">
  <source srcset="../media/{image_stem}.webp" type="image/webp">
  <img src="../media/{image_stem}.jpg" alt="{alt_text}" loading="lazy">
</picture>'''
    
    # Apply transformation
    content = re.sub(html_pattern, replace_html_image, content)
    
    return content


def process_content(article_generator):
    """Process articles to convert images."""
    for article in article_generator.articles:
        if hasattr(article, '_content'):
            article._content = convert_images_to_responsive(article._content)


def process_pages(page_generator):
    """Process pages to convert images."""
    for page in page_generator.pages:
        if hasattr(page, '_content'):
            page._content = convert_images_to_responsive(page._content)


def register():
    """Register the plugin with Pelican."""
    signals.article_generator_finalized.connect(process_content)
    signals.page_generator_finalized.connect(process_pages)
