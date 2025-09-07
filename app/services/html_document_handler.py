"""Service for handling HTML document processing."""

import io
import logging
from urllib.parse import urljoin, urlparse

import magic
from bs4 import BeautifulSoup
from PIL import Image

from app.config import Settings
from app.schemas.upload_document import DocumentContentSchema
from app.services.download_cache_service import DownloadCacheService
from app.services.image_service import ImageService

logger = logging.getLogger(__name__)


class HtmlDocumentInfo:
    """Information extracted from HTML document."""

    def __init__(self, title: str | None = None, preview_image: DocumentContentSchema | None = None):
        self.title = title
        self.preview_image = preview_image


class HtmlDocumentHandler:
    """Service for processing HTML documents and extracting metadata."""

    def __init__(self, download_cache_service: DownloadCacheService, settings: Settings, image_service: ImageService):
        self.download_cache_service = download_cache_service
        self.settings = settings
        self.image_service = image_service

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

        logger.info(f"Preview image content type : {preview_image.content_type if preview_image else 'None'}")

        return HtmlDocumentInfo(title=title, preview_image=preview_image)

    def _extract_page_title(self, soup: BeautifulSoup) -> str | None:
        """Extract page title from HTML.

        Args:
            soup: Parsed HTML document

        Returns:
            Page title or None if not found
        """
        title_tag = soup.find('title')
        if title_tag:
            # Try the simple case first (well-formed HTML)
            if title_tag.string:
                title = title_tag.string.strip()
                if title:
                    return title

            # Handle malformed HTML where title contains other elements
            # Extract all text and take the first meaningful line
            title_text = title_tag.get_text().strip()
            if title_text:
                # Split by newlines and take the first non-empty line
                first_line = title_text.split('\n')[0].strip()
                if first_line:
                    return first_line
        return None

    def _find_preview_image(
        self,
        soup: BeautifulSoup,
        url: str,
        download_cache: DownloadCacheService
    ) -> DocumentContentSchema | None:
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
            DocumentContentSchema with image data or None if no valid image found
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
    ) -> DocumentContentSchema | None:
        """Download and validate an image.

        Filters out:
        - Non-image content
        - 1x1 tracking pixels
        - GIFs (simplified: reject all GIFs regardless of animation)
        - Videos

        Args:
            url: Image URL to download
            download_cache: Service for downloading

        Returns:
            DocumentContentSchema with image data or None if invalid
        """
        try:
            # Download image
            download_result = download_cache.get_cached_content(url)
            if not download_result:
                return None

            content = download_result.content

            # Check content type with magic
            content_type = magic.from_buffer(content, mime=True)
            logger.info("1")
            # If it's not in allowed types but magic detected it as an image, try to convert it
            if content_type not in self.settings.ALLOWED_IMAGE_TYPES:
                logger.info("2")
                # Only try conversion if magic detected it as an image
                if content_type.startswith('image/'):
                    logger.info("3")
                    # Try to convert to PNG
                    conversion_result = self.image_service.convert_image_to_png(content)
                    if conversion_result:
                        logger.info("4")
                        content = conversion_result.content
                        content_type = conversion_result.content_type
                    else:
                        logger.info("5")
                        return None  # Conversion failed
                else:
                    logger.info("6")
                    return None  # Not an image at all

            # Skip videos and GIFs (simplified checking)
            if 'video' in content_type or content_type == 'image/gif':
                return None

            # Check image dimensions to filter out 1x1 tracking pixels
            try:
                img = Image.open(io.BytesIO(content))
                width, height = img.size

                # Filter out 1x1 tracking pixels
                if width <= 1 and height <= 1:
                    return None

                # Image is valid
                return DocumentContentSchema(
                    content=content,
                    content_type=content_type
                )

            except Exception:
                # Failed to parse as image
                return None

        except Exception:
            # Download or processing failed
            return None
