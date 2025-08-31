"""URL metadata extraction utilities."""

import re
from typing import Any, TYPE_CHECKING
from urllib.parse import urljoin, urlparse

from bs4 import BeautifulSoup

from app.exceptions import InvalidOperationException

if TYPE_CHECKING:
    from app.services.download_cache_service import DownloadCacheService


def validate_url(url: str, download_cache_service: "DownloadCacheService") -> bool:
    """Validate URL format and accessibility.

    Args:
        url: URL to validate
        download_cache_service: Service to use for URL validation

    Returns:
        True if URL is valid and accessible
    """
    return download_cache_service.validate_url(url)


def extract_page_metadata(url: str, download_cache_service: "DownloadCacheService") -> dict[str, Any]:
    """Extract metadata from web page.

    Args:
        url: URL to extract metadata from
        download_cache_service: Service to use for downloading content

    Returns:
        Dictionary containing extracted metadata

    Raises:
        InvalidOperationException: If metadata extraction fails
    """
    try:
        # Download content using cache service
        download_result = download_cache_service.get_cached_content(url)
        content = download_result.content
        
        # Limit content size for parsing
        content = content[:1024 * 1024]  # 1MB limit
        soup = BeautifulSoup(content, 'html.parser')

        metadata = {
            'url': url,
            'title': None,
            'description': None,
            'og_image': None,
            'twitter_image': None,
            'favicon': None,
            'site_name': None
        }

        # Extract title
        title_tag = soup.find('title')
        if title_tag:
            metadata['title'] = title_tag.get_text().strip()

        # Extract description
        desc_tag = soup.find('meta', attrs={'name': 'description'})
        if desc_tag:
            metadata['description'] = desc_tag.get('content', '').strip()

        # Extract Open Graph metadata
        og_title = soup.find('meta', property='og:title')
        if og_title:
            metadata['og_title'] = og_title.get('content', '').strip()

        og_description = soup.find('meta', property='og:description')
        if og_description:
            metadata['og_description'] = og_description.get('content', '').strip()

        og_image = soup.find('meta', property='og:image')
        if og_image:
            metadata['og_image'] = og_image.get('content', '').strip()

        og_site_name = soup.find('meta', property='og:site_name')
        if og_site_name:
            metadata['site_name'] = og_site_name.get('content', '').strip()

        # Extract Twitter Card metadata
        twitter_title = soup.find('meta', attrs={'name': 'twitter:title'})
        if twitter_title:
            metadata['twitter_title'] = twitter_title.get('content', '').strip()

        twitter_description = soup.find('meta', attrs={'name': 'twitter:description'})
        if twitter_description:
            metadata['twitter_description'] = twitter_description.get('content', '').strip()

        twitter_image = soup.find('meta', attrs={'name': 'twitter:image'})
        if twitter_image:
            metadata['twitter_image'] = twitter_image.get('content', '').strip()

        # Extract favicon
        favicon_link = soup.find('link', rel=re.compile(r'.*icon.*', re.I))
        if favicon_link:
            favicon_href = favicon_link.get('href', '')
            if favicon_href:
                metadata['favicon'] = urljoin(url, favicon_href)

        return metadata

    except Exception as e:
        raise InvalidOperationException("extract page metadata", str(e)) from e


def get_best_thumbnail_url(metadata: dict[str, Any], download_cache_service: "DownloadCacheService") -> str | None:
    """Get the best thumbnail URL from page metadata.

    Args:
        metadata: Metadata dictionary from extract_page_metadata
        download_cache_service: Service to use for URL validation

    Returns:
        Best thumbnail URL or None if none found
    """
    # Priority order: og:image, twitter:image, favicon
    for key in ['og_image', 'twitter_image', 'favicon']:
        url = metadata.get(key)
        if url and validate_url(url, download_cache_service):
            return url
    return None


def get_best_title(metadata: dict[str, Any]) -> str | None:
    """Get the best title from page metadata.

    Args:
        metadata: Metadata dictionary from extract_page_metadata

    Returns:
        Best title or None if none found
    """
    # Priority order: og:title, twitter:title, title
    for key in ['og_title', 'twitter_title', 'title']:
        title = metadata.get(key)
        if title and title.strip():
            return title.strip()
    return None


def get_best_description(metadata: dict[str, Any]) -> str | None:
    """Get the best description from page metadata.

    Args:
        metadata: Metadata dictionary from extract_page_metadata

    Returns:
        Best description or None if none found
    """
    # Priority order: og:description, twitter:description, description
    for key in ['og_description', 'twitter_description', 'description']:
        desc = metadata.get(key)
        if desc and desc.strip():
            return desc.strip()
    return None


def generate_favicon_url(url: str, size: int = 128) -> str:
    """Generate Google favicon service URL for a domain.

    Args:
        url: Original URL
        size: Favicon size in pixels

    Returns:
        Google favicon service URL
    """
    parsed_url = urlparse(url)
    domain = f"{parsed_url.scheme}://{parsed_url.netloc}"
    return f"https://www.google.com/s2/favicons?domain={domain}&sz={size}"


def clean_url(url: str) -> str:
    """Clean and normalize URL.

    Args:
        url: URL to clean

    Returns:
        Cleaned URL
    """
    # Remove common tracking parameters
    tracking_params = [
        'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
        'fbclid', 'gclid', 'ref', 'source', 'campaign'
    ]

    parsed = urlparse(url)
    query_parts = []

    if parsed.query:
        from urllib.parse import parse_qsl
        for key, value in parse_qsl(parsed.query):
            if key.lower() not in tracking_params:
                query_parts.append(f"{key}={value}")

    # Reconstruct URL
    from urllib.parse import urlunparse
    clean_query = '&'.join(query_parts)
    cleaned = urlunparse((
        parsed.scheme,
        parsed.netloc,
        parsed.path,
        parsed.params,
        clean_query,
        ''  # Remove fragment
    ))

    return cleaned


def extract_domain(url: str) -> str:
    """Extract domain from URL.

    Args:
        url: URL to extract domain from

    Returns:
        Domain name
    """
    parsed = urlparse(url)
    return parsed.netloc.lower()


def is_image_url(url: str) -> bool:
    """Check if URL appears to be an image based on extension.

    Args:
        url: URL to check

    Returns:
        True if URL appears to be an image
    """
    image_extensions = {'.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg'}
    parsed = urlparse(url)
    path = parsed.path.lower()
    return any(path.endswith(ext) for ext in image_extensions)


def resolve_relative_url(base_url: str, relative_url: str) -> str:
    """Resolve relative URL against base URL.

    Args:
        base_url: Base URL to resolve against
        relative_url: Relative URL to resolve

    Returns:
        Absolute URL
    """
    # Handle protocol-relative URLs
    if relative_url.startswith('//'):
        parsed_base = urlparse(base_url)
        return f"{parsed_base.scheme}:{relative_url}"

    # Handle absolute URLs
    if relative_url.startswith(('http://', 'https://')):
        return relative_url

    # Handle relative URLs
    return urljoin(base_url, relative_url)
