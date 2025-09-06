"""Service for handling HTML document processing."""

from urllib.parse import urljoin, urlparse

import magic
from bs4 import BeautifulSoup
from PIL import Image
import io

from app.services.download_cache_service import DownloadCacheService


class HtmlDocumentInfo:
    """Information extracted from HTML document."""
    
    def __init__(self, title: str | None = None, preview_image: tuple[bytes, str] | None = None):
        self.title = title
        self.preview_image = preview_image


class HtmlDocumentHandler:
    """Service for processing HTML documents and extracting metadata."""
    
    def __init__(self, download_cache_service: DownloadCacheService):
        self.download_cache_service = download_cache_service
    
    def process_html_content(self, content: bytes, url: str) -> HtmlDocumentInfo:
        """Process HTML content and extract metadata.
        
        Args:
            content: Raw HTML bytes
            url: Original URL for resolving relative paths
            
        Returns:
            HtmlDocumentInfo with extracted metadata
        """
        soup = BeautifulSoup(content, 'html.parser')
        
        # Extract title
        title = self._extract_page_title(soup)
        
        # Find preview image
        preview_image = self._find_preview_image(soup, url, self.download_cache_service)
        
        return HtmlDocumentInfo(title=title, preview_image=preview_image)
    
    def _extract_page_title(self, soup: BeautifulSoup) -> str | None:
        """Extract page title from HTML.
        
        Args:
            soup: Parsed HTML document
            
        Returns:
            Page title or None if not found
        """
        title_tag = soup.find('title')
        if title_tag and title_tag.string:
            title = title_tag.string.strip()
            if title:
                return title
        return None
    
    def _find_preview_image(
        self, 
        soup: BeautifulSoup, 
        url: str, 
        download_cache: DownloadCacheService
    ) -> tuple[bytes, str] | None:
        """Find and download preview image from HTML.
        
        Priority order:
        1. og:image meta tag
        2. twitter:image meta tag
        3. link rel="icon"
        4. Google favicon API fallback
        
        Args:
            soup: Parsed HTML document
            url: Base URL for resolving relative paths
            download_cache: Service for downloading images
            
        Returns:
            Tuple of (image_bytes, content_type) or None if no valid image found
        """
        # Try og:image first
        og_image = soup.find('meta', property='og:image')
        if og_image and og_image.get('content'):
            image_url = self._resolve_url(og_image['content'], url)
            result = self._download_and_validate_image(image_url, download_cache)
            if result:
                return result
        
        # Try twitter:image
        twitter_image = soup.find('meta', attrs={'name': 'twitter:image'})
        if not twitter_image:
            twitter_image = soup.find('meta', attrs={'name': 'twitter:image:src'})
        if twitter_image and twitter_image.get('content'):
            image_url = self._resolve_url(twitter_image['content'], url)
            result = self._download_and_validate_image(image_url, download_cache)
            if result:
                return result
        
        # Try favicon
        favicon = soup.find('link', rel='icon')
        if not favicon:
            favicon = soup.find('link', rel='shortcut icon')
        if favicon and favicon.get('href'):
            image_url = self._resolve_url(favicon['href'], url)
            result = self._download_and_validate_image(image_url, download_cache)
            if result:
                return result
        
        # Google favicon API as last resort
        domain = urlparse(url).netloc
        if domain:
            google_favicon_url = f"https://www.google.com/s2/favicons?domain={domain}&sz=64"
            result = self._download_and_validate_image(google_favicon_url, download_cache)
            if result:
                return result
        
        return None
    
    def _resolve_url(self, image_url: str, base_url: str) -> str:
        """Resolve relative URLs to absolute URLs.
        
        Args:
            image_url: URL from HTML (may be relative)
            base_url: Base URL for resolution
            
        Returns:
            Absolute URL
        """
        return urljoin(base_url, image_url)
    
    def _download_and_validate_image(
        self, 
        url: str, 
        download_cache: DownloadCacheService
    ) -> tuple[bytes, str] | None:
        """Download and validate an image.
        
        Filters out:
        - Non-image content
        - 1x1 tracking pixels
        - Animated GIFs
        - Videos
        
        Args:
            url: Image URL to download
            download_cache: Service for downloading
            
        Returns:
            Tuple of (image_bytes, content_type) or None if invalid
        """
        try:
            # Download image
            content = download_cache.get_cached_content(url)
            if not content:
                return None
            
            # Check content type with magic
            content_type = magic.from_buffer(content, mime=True)
            if not content_type.startswith('image/'):
                return None
            
            # Skip videos and animated content
            if 'video' in content_type or content_type == 'image/gif':
                # Check if GIF is animated
                if content_type == 'image/gif':
                    try:
                        img = Image.open(io.BytesIO(content))
                        # Check if it has multiple frames (animated)
                        try:
                            img.seek(1)
                            # If we can seek to frame 1, it's animated
                            return None
                        except EOFError:
                            # Not animated, continue validation
                            img.seek(0)
                    except Exception:
                        return None
                else:
                    # It's a video
                    return None
            
            # Check image dimensions to filter out 1x1 tracking pixels
            try:
                img = Image.open(io.BytesIO(content))
                width, height = img.size
                
                # Filter out 1x1 tracking pixels
                if width <= 1 and height <= 1:
                    return None
                
                # Image is valid
                return (content, content_type)
                
            except Exception:
                # Failed to parse as image
                return None
                
        except Exception:
            # Download or processing failed
            return None