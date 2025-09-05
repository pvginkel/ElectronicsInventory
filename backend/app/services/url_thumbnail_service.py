"""URL thumbnail service for extracting and processing web page thumbnails."""

from io import BytesIO
from urllib.parse import urljoin, urlparse

from bs4 import BeautifulSoup
from sqlalchemy.orm import Session

from app.exceptions import InvalidOperationException
from app.schemas.url_metadata import (
    ThumbnailSourceType,
    URLContentType,
    URLMetadataSchema,
)
from app.services.base import BaseService
from app.services.download_cache_service import DownloadCacheService
from app.services.s3_service import S3Service


class URLThumbnailService(BaseService):
    """Service for extracting thumbnails from web URLs."""

    def __init__(self, db: Session, s3_service: S3Service, download_cache_service: DownloadCacheService):
        """Initialize URL thumbnail service with database session, S3 service, and download cache service.

        Args:
            db: SQLAlchemy database session
            s3_service: S3 service for file operations
            download_cache_service: Download cache service for URL content
        """
        super().__init__(db)
        self.s3_service = s3_service
        self.download_cache_service = download_cache_service

        # Request headers to appear as a regular browser
        self.headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }

    def _fetch_content(self, url: str) -> tuple[bytes, str]:
        """Fetch content from URL and return raw bytes with detected content type.

        Args:
            url: URL to fetch

        Returns:
            Tuple of (content_bytes, detected_content_type)

        Raises:
            InvalidOperationException: If fetch fails or times out
        """
        try:
            result = self.download_cache_service.get_cached_content(url)
            return result.content, result.content_type

        except Exception as e:
            # Check if this is an HTTP error with status code
            import requests
            if isinstance(e, requests.HTTPError) and hasattr(e, 'response') and e.response is not None:
                status_code = e.response.status_code
                reason = e.response.reason or "Unknown"
                error_msg = f"HTTP error {status_code} reason {reason}"
            else:
                error_msg = f"Error of type {type(e).__name__}"
            raise InvalidOperationException("fetch URL content", error_msg) from e

    def _process_html_content(self, content: bytes, url: str) -> URLMetadataSchema:
        """Process HTML content to extract metadata.

        Args:
            content: HTML content as bytes
            url: Original URL

        Returns:
            URLMetadataSchema containing page metadata

        Raises:
            InvalidOperationException: If HTML parsing fails
        """
        try:
            html_content = content.decode('utf-8', errors='ignore')
            soup = BeautifulSoup(html_content, 'html.parser')

            # Extract page title
            title_tag = soup.find('title')
            page_title = title_tag.text.strip() if title_tag else None

            # Extract meta description
            desc_tag = soup.find('meta', {'name': 'description'})
            if not desc_tag:
                desc_tag = soup.find('meta', {'property': 'og:description'})
            description = None
            if desc_tag and hasattr(desc_tag, 'get'):
                content_attr = desc_tag.get('content')
                description = content_attr if isinstance(content_attr, str) else None

            # Try og:image first
            thumbnail_url = self._extract_og_image(soup)
            og_image = thumbnail_url
            thumbnail_source = ThumbnailSourceType.PREVIEW_IMAGE

            # Fall back to twitter:image
            if not thumbnail_url:
                thumbnail_url = self._extract_twitter_image(soup)
                thumbnail_source = ThumbnailSourceType.PREVIEW_IMAGE

            # Fall back to Google favicon service
            favicon_url = None
            if not thumbnail_url:
                thumbnail_url = self._get_favicon_fallback(url)
                favicon_url = thumbnail_url
                thumbnail_source = ThumbnailSourceType.FAVICON
            else:
                # Extract favicon separately
                favicon_tag = soup.find('link', {'rel': 'icon'})
                if not favicon_tag:
                    favicon_tag = soup.find('link', {'rel': 'shortcut icon'})
                if favicon_tag and hasattr(favicon_tag, 'get'):
                    href = favicon_tag.get('href')
                    favicon_url = href if isinstance(href, str) else self._get_favicon_fallback(url)
                else:
                    favicon_url = self._get_favicon_fallback(url)

            return URLMetadataSchema(
                title=page_title,
                page_title=page_title,
                description=description,
                og_image=og_image,
                favicon=favicon_url,
                thumbnail_source=thumbnail_source,
                original_url=url,
                content_type=URLContentType.WEBPAGE,
                thumbnail_url=thumbnail_url
            )

        except Exception as e:
            raise InvalidOperationException("process HTML content", str(e)) from e

    def _process_image_content(self, content: bytes, url: str) -> URLMetadataSchema:
        """Process image content to extract metadata.

        Args:
            content: Image content as bytes
            url: Original URL

        Returns:
            URLMetadataSchema containing image metadata
        """
        parsed_url = urlparse(url)
        filename = parsed_url.path.split('/')[-1] if parsed_url.path else None
        title = filename if filename else 'Image'

        return URLMetadataSchema(
            title=title,
            page_title=title,
            description=None,
            og_image=url,  # The image itself is the og:image
            favicon=None,
            thumbnail_source=ThumbnailSourceType.DIRECT_IMAGE,
            original_url=url,
            content_type=URLContentType.IMAGE,
            thumbnail_url=url
        )

    def _process_pdf_content(self, content: bytes, url: str) -> URLMetadataSchema:
        """Process PDF content to extract metadata.

        Args:
            content: PDF content as bytes
            url: Original URL

        Returns:
            URLMetadataSchema containing PDF metadata
        """
        parsed_url = urlparse(url)
        filename = parsed_url.path.split('/')[-1] if parsed_url.path else None
        title = filename if filename else 'PDF Document'

        return URLMetadataSchema(
            title=title,
            page_title=title,
            description=None,
            og_image=None,
            favicon=None,
            thumbnail_source=ThumbnailSourceType.PDF,
            original_url=url,
            content_type=URLContentType.PDF
        )

    def _process_other_content(self, content: bytes, url: str, detected_type: str) -> URLMetadataSchema:
        """Process other content types.

        Args:
            content: Content as bytes
            url: Original URL
            detected_type: MIME type detected by magic

        Returns:
            URLMetadataSchema containing generic metadata
        """
        parsed_url = urlparse(url)
        filename = parsed_url.path.split('/')[-1] if parsed_url.path else None
        title = filename if filename else f'File ({detected_type})'

        return URLMetadataSchema(
            title=title,
            page_title=title,
            description=None,
            og_image=None,
            favicon=None,
            thumbnail_source=ThumbnailSourceType.OTHER,
            original_url=url,
            content_type=URLContentType.OTHER,
            mime_type=detected_type,
            thumbnail_url=None
        )

    def _fetch_page_content(self, url: str) -> str:
        """Fetch HTML content from URL with safety limits.

        Args:
            url: URL to fetch

        Returns:
            HTML content as string

        Raises:
            InvalidOperationException: If fetch fails or times out
        """
        try:
            result = self.download_cache_service.get_cached_content(url)
            return result.content.decode('utf-8', errors='ignore')

        except Exception as e:
            raise InvalidOperationException("fetch URL content", str(e)) from e

    def _extract_og_image(self, soup: BeautifulSoup) -> str | None:
        """Extract og:image meta tag from HTML.

        Args:
            soup: BeautifulSoup parsed HTML

        Returns:
            URL of og:image or None if not found
        """
        og_image = soup.find('meta', property='og:image')
        if og_image and hasattr(og_image, 'get'):
            content = og_image.get('content')
            return content if isinstance(content, str) else None
        return None

    def _extract_twitter_image(self, soup: BeautifulSoup) -> str | None:
        """Extract twitter:image meta tag from HTML.

        Args:
            soup: BeautifulSoup parsed HTML

        Returns:
            URL of twitter:image or None if not found
        """
        twitter_image = soup.find('meta', attrs={'name': 'twitter:image'})
        if twitter_image and hasattr(twitter_image, 'get'):
            content = twitter_image.get('content')
            return content if isinstance(content, str) else None
        return None

    def _get_favicon_fallback(self, url: str) -> str:
        """Get Google favicon service URL as fallback.

        Args:
            url: Original URL

        Returns:
            Google favicon service URL
        """
        parsed_url = urlparse(url)
        domain = f"{parsed_url.scheme}://{parsed_url.netloc}"
        return f"https://www.google.com/s2/favicons?domain={domain}&sz=128"

    def _download_image(self, image_url: str, base_url: str) -> tuple[BytesIO, str]:
        """Download image from URL.

        Args:
            image_url: URL of the image
            base_url: Base URL for resolving relative URLs

        Returns:
            Tuple of (image_data, content_type)

        Raises:
            InvalidOperationException: If download fails
        """
        try:
            # Handle relative URLs
            if image_url.startswith('//'):
                image_url = 'https:' + image_url
            elif image_url.startswith('/'):
                image_url = urljoin(base_url, image_url)
            elif not image_url.startswith(('http://', 'https://')):
                image_url = urljoin(base_url, image_url)

            # Use download cache service for image downloads
            result = self.download_cache_service.get_cached_content(image_url)

            # Check if content type is image
            content_type = result.content_type

            # Check size limit (5MB)
            max_size = 5 * 1024 * 1024  # 5MB
            if len(result.content) > max_size:
                raise InvalidOperationException("download image", "Image too large (>5MB)")

            image_data = BytesIO(result.content)
            return image_data, content_type

        except Exception as e:
            raise InvalidOperationException("download image", str(e)) from e

    def extract_metadata(self, url: str) -> URLMetadataSchema:
        """Extract metadata by downloading content and determining its type.

        Args:
            url: URL to extract metadata from

        Returns:
            URLMetadataSchema containing metadata based on content type

        Raises:
            InvalidOperationException: If extraction fails
        """
        try:
            # Download content and detect its type
            content, detected_type = self._fetch_content(url)

            # Try to process as HTML first - if it succeeds, treat as webpage
            if detected_type.startswith('text/html') or detected_type == 'application/xhtml+xml':
                try:
                    return self._process_html_content(content, url)
                except Exception:
                    # If HTML processing fails but content type suggests HTML,
                    # still try other content types
                    pass

            # Handle different content types based on magic detection
            if detected_type.startswith('image/'):
                return self._process_image_content(content, url)
            elif detected_type == 'application/pdf':
                return self._process_pdf_content(content, url)
            else:
                # For any other content, try HTML processing first as a fallback
                # (some servers return wrong content-type headers)
                try:
                    # Only try HTML processing if content looks like it could be HTML
                    content_str = content.decode('utf-8', errors='ignore')
                    if '<html' in content_str.lower() or '<title' in content_str.lower():
                        return self._process_html_content(content, url)
                except Exception:
                    pass

                # If not HTML-like, process as other content type
                return self._process_other_content(content, url, detected_type)

        except InvalidOperationException:
            # If it's already an InvalidOperationException, re-raise it directly
            raise

        except Exception as e:
            # Check if this is an HTTP error with status code
            import requests
            if isinstance(e, requests.HTTPError) and hasattr(e, 'response') and e.response is not None:
                status_code = e.response.status_code
                reason = e.response.reason or "Unknown"
                error_msg = f"HTTP error {status_code} reason {reason}"
            else:
                error_msg = f"Error of type {type(e).__name__}"
            raise InvalidOperationException("extract metadata", error_msg) from e

    def extract_thumbnail_url(self, url: str) -> tuple[str, URLMetadataSchema]:
        """Extract thumbnail URL from web page using og:image, twitter:image, or favicon fallback.

        Args:
            url: URL to extract thumbnail from

        Returns:
            Tuple of (thumbnail_image_url, metadata)

        Raises:
            InvalidOperationException: If extraction fails
        """
        try:
            # Fetch and parse HTML
            html_content = self._fetch_page_content(url)
            soup = BeautifulSoup(html_content, 'html.parser')

            # Extract page title
            title_tag = soup.find('title')
            page_title = title_tag.text.strip() if title_tag else None

            # Extract meta description
            desc_tag = soup.find('meta', {'name': 'description'})
            if not desc_tag:
                desc_tag = soup.find('meta', {'property': 'og:description'})
            description = None
            if desc_tag and hasattr(desc_tag, 'get'):
                content_attr = desc_tag.get('content')
                description = content_attr if isinstance(content_attr, str) else None

            # Try og:image first
            thumbnail_url = self._extract_og_image(soup)
            og_image = thumbnail_url
            source = 'og:image'

            # Fall back to twitter:image
            if not thumbnail_url:
                thumbnail_url = self._extract_twitter_image(soup)
                source = 'twitter:image'

            # Fall back to Google favicon service
            favicon_url = None
            if not thumbnail_url:
                thumbnail_url = self._get_favicon_fallback(url)
                favicon_url = thumbnail_url
                source = 'favicon'
            else:
                # Extract favicon separately
                favicon_tag = soup.find('link', {'rel': 'icon'})
                if not favicon_tag:
                    favicon_tag = soup.find('link', {'rel': 'shortcut icon'})
                if favicon_tag and hasattr(favicon_tag, 'get'):
                    href = favicon_tag.get('href')
                    favicon_url = href if isinstance(href, str) else self._get_favicon_fallback(url)
                else:
                    favicon_url = self._get_favicon_fallback(url)

            metadata = URLMetadataSchema(
                title=page_title,
                page_title=page_title,  # Keep original for backward compatibility
                description=description,
                og_image=og_image,
                favicon=favicon_url,
                thumbnail_source=ThumbnailSourceType.PREVIEW_IMAGE if source in ['og:image', 'twitter:image'] else ThumbnailSourceType.FAVICON,
                original_url=url,
                content_type=URLContentType.WEBPAGE,
                thumbnail_url=thumbnail_url
            )

            return thumbnail_url, metadata

        except Exception as e:
            raise InvalidOperationException("extract thumbnail URL", str(e)) from e

    def download_and_store_thumbnail(self, url: str, part_id: int) -> tuple[str, str, int, dict]:
        """Download thumbnail image and store in S3.

        Args:
            url: URL to extract thumbnail from
            part_id: ID of the part for S3 key generation

        Returns:
            Tuple of (s3_key, content_type, file_size, metadata)

        Raises:
            InvalidOperationException: If download or storage fails
        """
        # Get metadata and appropriate image URL
        page_metadata = self.extract_metadata(url)
        image_url = self.get_preview_image_url(url)

        # Download the image
        image_data, content_type = self._download_image(image_url or url, url)

        # Generate S3 key for the thumbnail
        filename = f"url_thumbnail.{content_type.split('/')[-1]}"
        s3_key = self.s3_service.generate_s3_key(part_id, filename)

        # Get file size
        file_size = len(image_data.getvalue())

        # Upload to S3
        image_data.seek(0)
        self.s3_service.upload_file(image_data, s3_key, content_type)

        # Combine metadata using model_dump() for backward compatibility
        full_metadata = {
            **page_metadata.model_dump(),
            'thumbnail_url': image_url,
            'file_size': file_size,
            'stored_at': s3_key
        }

        return s3_key, content_type, file_size, full_metadata


    def get_preview_image_url(self, url: str) -> str | None:
        """Get the appropriate image URL for preview based on content type.

        Args:
            url: URL to get preview image for

        Returns:
            Image URL to use for preview

        Raises:
            InvalidOperationException: If no image can be found
        """
        # Extract metadata which includes the thumbnail URL
        metadata = self.extract_metadata(url)

        # Return the thumbnail URL from metadata
        thumbnail_url = metadata.thumbnail_url
        if not thumbnail_url:
            return None

        return thumbnail_url

    def validate_url(self, url: str) -> bool:
        """Validate if URL is accessible and safe.

        Args:
            url: URL to validate

        Returns:
            True if URL is valid and accessible
        """
        return self.download_cache_service.validate_url(url)
