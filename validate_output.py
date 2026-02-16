"""Post-build validator for eloise.rip Pelican site.

Validates all internal links, media references, and static assets in the output/
directory before deployment. Reports broken links, missing media files, missing
video posters, and orphaned/unused media.

Usage:
    python validate_output.py                  # default: internal only
    python validate_output.py --check-external # include external links (slow)
    python validate_output.py --output-dir public # custom output directory

Exit codes:
    0 = all validations passed
    1 = validation errors found (broken links or missing media)
"""
from __future__ import annotations

import argparse
import sys
from collections import defaultdict
from pathlib import Path
from urllib.parse import unquote, urlparse

try:
    from bs4 import BeautifulSoup
    import requests
except ImportError:
    print("[ERROR] Missing dependencies. Install with: pip install beautifulsoup4 requests")
    sys.exit(2)


def normalize_path(href: str, source_html: Path, output_dir: Path) -> Path | None:
    """Convert href to absolute filesystem path, or None if external/anchor."""
    href = href.strip()
    
    # Skip external links, mailto, anchors
    if not href or href.startswith(('#', 'mailto:', 'http://', 'https://', '//')):
        return None
    
    # URL decode (carousel plugin encodes paths)
    href = unquote(href)
    
    # Resolve relative to source HTML location
    if href.startswith('/'):
        # Root-relative: /media/video/name.mp4
        abs_path = (output_dir / href.lstrip('/')).resolve()
    elif href.startswith('media/'):
        # Special case: bare "media/" paths (common in voice-practice.html)
        abs_path = (output_dir / href).resolve()
    else:
        # Relative: ../media/images/pic.avif or ./about.html
        source_dir = source_html.parent
        abs_path = (source_dir / href).resolve()
    
    return abs_path


def extract_references(html_file: Path, output_dir: Path) -> dict[str, list[str]]:
    """Extract all href/src references from HTML file."""
    refs = {
        'links': [],      # <a href>
        'images': [],     # <img src>
        'videos': [],     # <source src> in <video>
        'posters': [],    # <video poster>
        'audio': [],      # <audio src>
        'css': [],        # <link href> for stylesheets
        'external': [],   # http/https links
    }
    
    try:
        with open(html_file, 'r', encoding='utf-8') as f:
            soup = BeautifulSoup(f.read(), 'html.parser')
    except Exception as e:
        print(f"[WARN] Failed to parse {html_file.relative_to(output_dir)}: {e}")
        return refs
    
    # Extract <a href>
    for a in soup.find_all('a', href=True):
        href = a['href'].strip()
        if href.startswith(('http://', 'https://', '//')):
            refs['external'].append(href)
        elif not href.startswith(('#', 'mailto:')):
            refs['links'].append(href)
    
    # Extract <img src>
    for img in soup.find_all('img', src=True):
        refs['images'].append(img['src'])
    
    # Extract <video poster> and <source src>
    for video in soup.find_all('video'):
        if video.get('poster'):
            refs['posters'].append(video['poster'])
        for source in video.find_all('source', src=True):
            refs['videos'].append(source['src'])
    
    # Extract <audio src>
    for audio in soup.find_all('audio', src=True):
        refs['audio'].append(audio['src'])
    
    # Extract <link href> for CSS
    for link in soup.find_all('link', href=True, rel='stylesheet'):
        refs['css'].append(link['href'])
    
    return refs


def validate_internal_references(output_dir: Path) -> tuple[dict, set[Path]]:
    """Validate all internal links and media. Returns (errors, referenced_media)."""
    errors = defaultdict(list)
    referenced_media = set()  # Track which media files are used
    html_files = list(output_dir.rglob('*.html'))
    
    print(f"[INFO] Validating {len(html_files)} HTML files in {output_dir}...")
    
    for html_file in html_files:
        refs = extract_references(html_file, output_dir)
        rel_source = html_file.relative_to(output_dir)
        
        # Validate article/page links
        for href in refs['links']:
            target = normalize_path(href, html_file, output_dir)
            if target and not target.exists():
                errors[str(rel_source)].append(f"Broken link: {href} → {target.relative_to(output_dir)}")
        
        # Validate images
        for src in refs['images']:
            target = normalize_path(src, html_file, output_dir)
            if target:
                referenced_media.add(target)  # Track reference regardless of existence
                if not target.exists():
                    errors[str(rel_source)].append(f"Missing image: {src}")
        
        # Validate videos (requires both .mp4 and .jpg poster)
        for src in refs['videos']:
            target = normalize_path(src, html_file, output_dir)
            if target:
                referenced_media.add(target)  # Track reference regardless of existence
                if not target.exists():
                    errors[str(rel_source)].append(f"Missing video: {src}")
        
        # Validate video posters
        for src in refs['posters']:
            target = normalize_path(src, html_file, output_dir)
            if target:
                referenced_media.add(target)  # Track reference regardless of existence
                if not target.exists():
                    errors[str(rel_source)].append(f"Missing poster: {src}")
        
        # Validate audio
        for src in refs['audio']:
            target = normalize_path(src, html_file, output_dir)
            if target:
                referenced_media.add(target)  # Track reference regardless of existence
                if not target.exists():
                    errors[str(rel_source)].append(f"Missing audio: {src}")
        
        # Validate CSS
        for href in refs['css']:
            target = normalize_path(href, html_file, output_dir)
            if target and not target.exists():
                errors[str(rel_source)].append(f"Missing CSS: {href}")
    
    return errors, referenced_media


def check_external_links(output_dir: Path) -> dict[str, list[str]]:
    """Optionally validate external HTTP(S) links (slow)."""
    errors = defaultdict(list)
    external_links = set()
    html_files = list(output_dir.rglob('*.html'))
    
    print(f"[INFO] Checking external links (this may take a while)...")
    
    # Collect all unique external links
    for html_file in html_files:
        refs = extract_references(html_file, output_dir)
        external_links.update(refs['external'])
    
    print(f"[INFO] Found {len(external_links)} unique external links to check...")
    
    # Check each link
    for url in sorted(external_links):
        try:
            resp = requests.head(url, timeout=10, allow_redirects=True)
            if resp.status_code >= 400:
                errors['external'].append(f"{url} → HTTP {resp.status_code}")
        except requests.RequestException as e:
            errors['external'].append(f"{url} → {type(e).__name__}: {e}")
    
    return errors


def find_orphaned_media(output_dir: Path, referenced_media: set[Path]) -> dict[str, list[Path]]:
    """Find media files that exist but aren't referenced in any HTML."""
    orphaned = {
        'images': [],
        'videos': [],
        'audio': [],
        'fallbacks': [],  # JPG fallbacks for AVIF images
    }
    media_dir = output_dir / 'media'
    
    if not media_dir.exists():
        return orphaned
    
    # Collect all media files (resolve to absolute paths for consistency)
    all_media = set()
    for ext_pattern in ['**/*.avif', '**/*.jpg', '**/*.mp4', '**/*.m4a']:
        all_media.update(p.resolve() for p in media_dir.glob(ext_pattern))
    
    # Find unreferenced files
    unreferenced = all_media - referenced_media
    
    # Categorize orphaned files
    for media_file in sorted(unreferenced):
        rel_path = media_file.relative_to(output_dir)
        
        # Check if it's a JPG fallback for an AVIF image
        if media_file.suffix == '.jpg':
            avif_equivalent = media_file.with_suffix('.avif')
            if avif_equivalent in referenced_media:
                orphaned['fallbacks'].append(media_file)
                continue
        
        # Categorize by location and type
        if 'images' in str(rel_path):
            orphaned['images'].append(media_file)
        elif 'video' in str(rel_path):
            orphaned['videos'].append(media_file)
        elif 'voice' in str(rel_path):
            orphaned['audio'].append(media_file)
    
    return orphaned


def print_report(internal_errors: dict, external_errors: dict, orphaned: dict[str, list[Path]], output_dir: Path) -> int:
    """Print validation report and return exit code."""
    has_errors = bool(internal_errors or external_errors)
    
    print("\n" + "=" * 70)
    print("VALIDATION REPORT")
    print("=" * 70)
    
    # Internal validation results
    if internal_errors:
        total_errors = sum(len(v) for v in internal_errors.values())
        print(f"\n❌ INTERNAL ERRORS ({total_errors} total):\n")
        
        # Group by error type
        missing_videos = []
        missing_images = []
        missing_audio = []
        broken_links = []
        
        for source, issues in sorted(internal_errors.items()):
            print(f"  {source}:")
            for issue in issues:
                print(f"    • {issue}")
                if 'Missing video:' in issue or 'Missing poster:' in issue:
                    missing_videos.append(issue)
                elif 'Missing image:' in issue:
                    missing_images.append(issue)
                elif 'Missing audio:' in issue:
                    missing_audio.append(issue)
                elif 'Broken link:' in issue:
                    broken_links.append(issue)
        
        # Suggestions
        print("\n  💡 Suggestions:")
        if missing_videos or missing_images or missing_audio:
            print("     • Add missing media files to content/media/ (transcoding happens in a local repository due to Git LFS bandwidth limits)")
        if broken_links:
            print("     • Check article cross-references and navigation links")
        
    else:
        print("\n✅ All internal links and media validated successfully!")
    
    # External validation results
    if external_errors:
        print(f"\n❌ EXTERNAL LINK ERRORS ({len(external_errors['external'])} total):\n")
        for issue in external_errors['external']:
            print(f"  • {issue}")
    
    # Orphaned media report
    orphaned_count = sum(len(files) for key, files in orphaned.items() if key != 'fallbacks')
    
    if orphaned_count > 0:
        print(f"\n⚠️  ORPHANED MEDIA ({orphaned_count} unreferenced files):\n")
        
        if orphaned['images']:
            print(f"  Images ({len(orphaned['images'])}):")
            for media_file in orphaned['images'][:10]:  # Show first 10
                rel_path = media_file.relative_to(output_dir)
                size_kb = media_file.stat().st_size / 1024
                print(f"    • {rel_path} ({size_kb:.1f} KB)")
            if len(orphaned['images']) > 10:
                print(f"    ... and {len(orphaned['images']) - 10} more")
        
        if orphaned['videos']:
            print(f"\n  Videos ({len(orphaned['videos'])}):")
            for media_file in orphaned['videos'][:5]:
                rel_path = media_file.relative_to(output_dir)
                size_kb = media_file.stat().st_size / 1024
                print(f"    • {rel_path} ({size_kb:.1f} KB)")
            if len(orphaned['videos']) > 5:
                print(f"    ... and {len(orphaned['videos']) - 5} more")
        
        if orphaned['audio']:
            print(f"\n  Audio ({len(orphaned['audio'])}):")
            for media_file in orphaned['audio'][:5]:
                rel_path = media_file.relative_to(output_dir)
                size_kb = media_file.stat().st_size / 1024
                print(f"    • {rel_path} ({size_kb:.1f} KB)")
            if len(orphaned['audio']) > 5:
                print(f"    ... and {len(orphaned['audio']) - 5} more")
        
        if orphaned['fallbacks']:
            print(f"\n  ℹ️  JPG fallbacks ({len(orphaned['fallbacks'])}) - OK to keep for browser compatibility")
        
        print(f"\n  💡 Consider removing unused media or check for missing [[video:]] / [[carousel:]] references.")
    else:
        print("\n✅ No orphaned media files found.")
    
    # Summary
    print("\n" + "=" * 70)
    print("SUMMARY:")
    print(f"  • HTML files checked: {len(list(output_dir.rglob('*.html')))}")
    print(f"  • Internal errors: {sum(len(v) for v in internal_errors.values())}")
    if external_errors:
        print(f"  • External errors: {len(external_errors.get('external', []))}")
    print(f"  • Orphaned media: {orphaned_count}")
    print("=" * 70)
    
    if has_errors:
        print("\n💥 Validation FAILED - fix errors before deploying!")
        return 1
    else:
        print("\n✨ Validation PASSED - site is ready to deploy!")
        return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Validate eloise.rip output for broken links and missing media")
    parser.add_argument('--output-dir', default='output', help='Output directory to validate (default: output)')
    parser.add_argument('--check-external', action='store_true', help='Check external HTTP(S) links (slow)')
    args = parser.parse_args()
    
    output_dir = Path(args.output_dir).resolve()  # Resolve to absolute path for consistency
    if not output_dir.exists():
        print(f"[ERROR] Output directory not found: {output_dir}")
        print("Run 'pelican content' to generate the site first.")
        return 1
    
    # Validate internal references
    internal_errors, referenced_media = validate_internal_references(output_dir)
    
    # Optionally check external links
    external_errors = {}
    if args.check_external:
        external_errors = check_external_links(output_dir)
    
    # Find orphaned media
    orphaned = find_orphaned_media(output_dir, referenced_media)
    
    # Print report and return exit code
    return print_report(internal_errors, external_errors, orphaned, output_dir)


if __name__ == '__main__':
    sys.exit(main())
