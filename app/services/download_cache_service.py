"""Download cache service for centralized URL downloading and caching."""

import logging
from typing import NamedTuple

import magic
import requests
import validators

from app.utils.temp_file_manager import TempFileManager

logger = logging.getLogger(__name__)


class DownloadResult(NamedTuple):
    """Result of a download operation."""
    content: bytes
    content_type: str


class DownloadCacheService:
    """
    Service for downloading and caching URL content with automatic MIME type detection.

    This service centralizes URL downloading across the application, providing:
    - Content caching to avoid redundant network requests
    - MIME type detection using python-magic
    - Size and timeout limits for downloads
    - Automatic cache cleanup
    """

    def __init__(self, temp_file_manager: TempFileManager,
                 max_download_size: int = 100 * 1024 * 1024,  # 100MB
                 download_timeout: int = 30):
        """
        Initialize the download cache service.

        Args:
            temp_file_manager: TempFileManager instance for caching
            max_download_size: Maximum download size in bytes
            download_timeout: Download timeout in seconds
        """
        self.temp_file_manager = temp_file_manager
        self.max_download_size = max_download_size
        self.download_timeout = download_timeout

    def get_cached_content(self, url: str) -> DownloadResult:
        """
        Get cached content for a URL, downloading if not cached.

        Args:
            url: URL to download content from

        Returns:
            DownloadResult with content and detected content type

        Raises:
            requests.RequestException: On network errors
            ValueError: On invalid URLs or oversized content
        """
        # Check cache first
        cached = self.temp_file_manager.get_cached(url)
        if cached is not None:
            logger.debug(f"Cache hit for URL: {url}")
            return DownloadResult(
                content=cached.content, content_type=cached.content_type
            )

        # Download if not cached
        logger.debug(f"Cache miss for URL: {url}, downloading...")
        result = self._download_url(url)

        # Cache the result
        if self.temp_file_manager.cache(url, result.content, result.content_type):
            logger.debug(f"Successfully cached content for URL: {url}")
        else:
            logger.warning(f"Failed to cache content for URL: {url}")

        return result

    def validate_url(self, url: str) -> bool:
        """
        Validate URL format. This method does not test whether the URL is accessible.
        This is tested by the download itself that follows this validation call.

        Args:
            url: URL to validate

        Returns:
            True if URL is valid and uses HTTP/HTTPS
        """
        if not validators.url(url):
            logger.warning(f"URL {url} is invalid")
            return False

        # Only allow HTTP/HTTPS URLs
        if not url.startswith(('http://', 'https://')):
            logger.warning(f"URL {url} does not start with http:// or https://")
            return False

        return True

    def _download_url(self, url: str) -> DownloadResult:
        """
        Download content from a URL with size and timeout limits.

        Args:
            url: URL to download from

        Returns:
            DownloadResult with content and detected content type

        Raises:
            requests.RequestException: On network errors
            ValueError: On invalid URLs or oversized content
        """
        if not url or not self.validate_url(url):
            raise ValueError(f"Invalid URL: {url}")

        try:
            # Use streaming to check content length
            response = requests.get(
                url,
                stream=True,
                timeout=self.download_timeout,
                headers={
                    "Accept": "*/*",
                    "Accept-Language": "nl,en-US;q=0.9,en;q=0.8",
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36"
                }
            )
            response.raise_for_status()

            # Check content length if provided
            content_length = response.headers.get('content-length')
            if content_length and int(content_length) > self.max_download_size:
                raise ValueError(
                    f"Content too large: {content_length} bytes "
                    f"(max: {self.max_download_size})"
                )

            # Download content with size limit
            content = b''
            for chunk in response.iter_content(chunk_size=8192):
                content += chunk
                if len(content) > self.max_download_size:
                    raise ValueError(
                        f"Content too large: {len(content)} bytes "
                        f"(max: {self.max_download_size})"
                    )

            # Detect actual MIME type using python-magic
            detected_type = magic.from_buffer(content, mime=True)

            logger.debug(
                f"Downloaded {len(content)} bytes from {url}, "
                f"detected type: {detected_type}"
            )

            return DownloadResult(content=content, content_type=detected_type)

        except requests.RequestException as e:
            logger.error(f"Failed to download from {url}: {e}")
            raise
        except Exception as e:
            logger.error(f"Unexpected error downloading from {url}: {e}")
            raise ValueError(f"Download failed: {e}") from e
