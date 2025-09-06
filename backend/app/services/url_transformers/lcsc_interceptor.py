"""LCSC URL interceptor for extracting PDFs from iframe-wrapped pages."""

import logging
from collections.abc import Callable
from typing import TYPE_CHECKING
from urllib.parse import urljoin, urlparse

from bs4 import BeautifulSoup

from .base import URLInterceptor

if TYPE_CHECKING:
    from app.services.download_cache_service import DownloadResult

logger = logging.getLogger(__name__)


class LCSCInterceptor(URLInterceptor):
    """Interceptor for handling LCSC URLs that wrap PDFs in iframes."""

    def intercept(self, url: str, next: Callable[[str], "DownloadResult"]) -> "DownloadResult":
        """
        Intercept LCSC URL processing to extract PDF from iframe.

        Args:
            url: URL to process
            next: Next function in chain (get_cached_content)

        Returns:
            DownloadResult with potentially transformed content
        """
        # Get the initial download result
        result = next(url)

        # Check if this is an LCSC URL ending in .pdf
        if not self._is_lcsc_pdf_url(url):
            logger.debug(f"URL {url} is not LCSC PDF URL, passing through")
            return result

        # If already a PDF, return as-is
        if result.content_type == 'application/pdf':
            logger.debug(f"URL {url} already returned PDF content, passing through")
            return result

        # If not HTML, can't process iframes
        if result.content_type != 'text/html':
            logger.debug(f"URL {url} returned {result.content_type}, not HTML, passing through")
            return result

        logger.info(f"Processing LCSC iframe extraction for URL: {url}")

        # Try to extract PDF from iframes
        pdf_result = self._extract_pdf_from_iframes(url, result.content, next)
        if pdf_result:
            logger.info(f"Successfully extracted PDF from iframe for URL: {url}")
            return pdf_result

        logger.debug(f"No PDF found in iframes for URL: {url}, returning original result")
        return result

    def _is_lcsc_pdf_url(self, url: str) -> bool:
        """
        Check if URL is from LCSC and ends with .pdf.

        Args:
            url: URL to check

        Returns:
            True if this is an LCSC PDF URL
        """
        try:
            parsed = urlparse(url)
            return (parsed.netloc == 'www.lcsc.com' and
                    parsed.path.endswith('.pdf'))
        except Exception:
            return False

    def _extract_pdf_from_iframes(self, base_url: str, html_content: bytes,
                                 downloader: Callable[[str], "DownloadResult"]) -> "DownloadResult | None":
        """
        Extract PDF from iframes in HTML content.

        Args:
            base_url: Base URL for resolving relative URLs
            html_content: HTML content to parse
            downloader: Function to download iframe URLs

        Returns:
            DownloadResult with PDF content, or None if no PDF found
        """
        try:
            # Parse HTML content
            soup = BeautifulSoup(html_content, 'html.parser')

            # Find all iframe elements
            iframes = soup.find_all('iframe')
            logger.debug(f"Found {len(iframes)} iframe elements")

            for iframe in iframes:
                src = iframe.get('src')
                if not src:
                    continue

                # Check if iframe src ends with .pdf
                if not src.endswith('.pdf'):
                    continue

                # Resolve relative URL to absolute
                iframe_url = urljoin(base_url, src)
                logger.debug(f"Checking iframe URL: {iframe_url}")

                try:
                    # Download iframe content
                    iframe_result = downloader(iframe_url)

                    # Check if it's actually a PDF
                    if iframe_result.content_type == 'application/pdf':
                        logger.info(f"Found PDF in iframe: {iframe_url}")
                        return iframe_result
                    else:
                        logger.debug(f"Iframe URL {iframe_url} returned {iframe_result.content_type}, not PDF")

                except Exception as e:
                    logger.warning(f"Failed to download iframe URL {iframe_url}: {e}")
                    continue

            return None

        except Exception as e:
            logger.warning(f"Failed to parse HTML content: {e}")
            return None
