"""URL thumbnail service for extracting and processing web page thumbnails."""

from io import BytesIO
from urllib.parse import urljoin, urlparse

import requests
from bs4 import BeautifulSoup
from sqlalchemy.orm import Session

from app.exceptions import InvalidOperationException
from app.services.base import BaseService
from app.services.s3_service import S3Service


class URLThumbnailService(BaseService):
    """Service for extracting thumbnails from web URLs."""

    def __init__(self, db: Session, s3_service: S3Service):
        """Initialize URL thumbnail service with database session and S3 service.

        Args:
            db: SQLAlchemy database session
            s3_service: S3 service for file operations
        """
        super().__init__(db)
        self.s3_service = s3_service

        # Request headers to appear as a regular browser
        self.headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }

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
            response = requests.get(
                url,
                headers=self.headers,
                timeout=10,  # 10 second timeout
                stream=True,
                allow_redirects=True
            )
            response.raise_for_status()

            # Limit response size to 1MB
            content = b''
            max_size = 1024 * 1024  # 1MB

            for chunk in response.iter_content(chunk_size=8192):
                content += chunk
                if len(content) > max_size:
                    break

            return content.decode('utf-8', errors='ignore')

        except requests.exceptions.RequestException as e:
            raise InvalidOperationException("fetch URL content", str(e))

    def _extract_og_image(self, soup: BeautifulSoup) -> str | None:
        """Extract og:image meta tag from HTML.

        Args:
            soup: BeautifulSoup parsed HTML

        Returns:
            URL of og:image or None if not found
        """
        og_image = soup.find('meta', property='og:image')
        if og_image:
            return og_image.get('content')
        return None

    def _extract_twitter_image(self, soup: BeautifulSoup) -> str | None:
        """Extract twitter:image meta tag from HTML.

        Args:
            soup: BeautifulSoup parsed HTML

        Returns:
            URL of twitter:image or None if not found
        """
        twitter_image = soup.find('meta', attrs={'name': 'twitter:image'})
        if twitter_image:
            return twitter_image.get('content')
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

            response = requests.get(
                image_url,
                headers=self.headers,
                timeout=10,
                stream=True
            )
            response.raise_for_status()

            # Check content type
            content_type = response.headers.get('content-type', 'image/jpeg')
            if not content_type.startswith('image/'):
                content_type = 'image/jpeg'  # Default fallback

            # Download image with size limit (5MB)
            image_data = BytesIO()
            max_size = 5 * 1024 * 1024  # 5MB
            total_size = 0

            for chunk in response.iter_content(chunk_size=8192):
                total_size += len(chunk)
                if total_size > max_size:
                    raise InvalidOperationException("download image", "Image too large (>5MB)")
                image_data.write(chunk)

            image_data.seek(0)
            return image_data, content_type

        except requests.exceptions.RequestException as e:
            raise InvalidOperationException("download image", str(e))

    def extract_metadata(self, url: str) -> dict:
        """Extract metadata from web page.

        Args:
            url: URL to extract metadata from

        Returns:
            Dictionary containing page metadata

        Raises:
            InvalidOperationException: If extraction fails
        """
        _, metadata = self.extract_thumbnail_url(url)
        return metadata

    def extract_thumbnail_url(self, url: str) -> tuple[str, dict]:
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
            description = desc_tag.get('content') if desc_tag else None

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
                favicon_url = favicon_tag.get('href') if favicon_tag else self._get_favicon_fallback(url)

            metadata = {
                'title': page_title,
                'page_title': page_title,  # Keep original for backward compatibility
                'description': description,
                'og_image': og_image,
                'favicon': favicon_url,
                'thumbnail_source': source,
                'original_url': url
            }

            return thumbnail_url, metadata

        except Exception as e:
            raise InvalidOperationException("extract thumbnail URL", str(e))

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
        # Extract thumbnail URL and metadata
        thumbnail_url, page_metadata = self.extract_thumbnail_url(url)

        # Download the image
        image_data, content_type = self._download_image(thumbnail_url, url)

        # Generate S3 key for the thumbnail
        filename = f"url_thumbnail.{content_type.split('/')[-1]}"
        s3_key = self.s3_service.generate_s3_key(part_id, filename)

        # Get file size
        file_size = len(image_data.getvalue())

        # Upload to S3
        image_data.seek(0)
        self.s3_service.upload_file(image_data, s3_key, content_type)

        # Combine metadata
        full_metadata = {
            **page_metadata,
            'thumbnail_url': thumbnail_url,
            'file_size': file_size,
            'stored_at': s3_key
        }

        return s3_key, content_type, file_size, full_metadata

    def validate_url(self, url: str) -> bool:
        """Validate if URL is accessible and safe.

        Args:
            url: URL to validate

        Returns:
            True if URL is valid and accessible
        """
        try:
            parsed = urlparse(url)

            # Check for valid scheme
            if parsed.scheme not in ('http', 'https'):
                return False

            # Check for valid netloc
            if not parsed.netloc:
                return False

            # Try to access URL with HEAD request
            response = requests.head(
                url,
                headers=self.headers,
                timeout=5,
                allow_redirects=True
            )

            return response.status_code < 400

        except Exception:
            return False
