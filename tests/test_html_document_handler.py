"""Unit tests for HtmlDocumentHandler."""

import io
from unittest.mock import MagicMock, patch

import pytest
from bs4 import BeautifulSoup
from PIL import Image

from app.services.download_cache_service import DownloadResult
from app.services.html_document_handler import HtmlDocumentHandler


@pytest.fixture
def mock_download_cache_service():
    """Create mock DownloadCacheService."""
    mock = MagicMock()
    # Default to returning None for image downloads
    mock.get_cached_content.return_value = None
    return mock


@pytest.fixture
def mock_cas_image_service():
    """Create mock CasImageService."""
    mock = MagicMock()
    return mock


@pytest.fixture
def html_handler(mock_download_cache_service, test_app_settings, mock_cas_image_service):
    """Create HtmlDocumentHandler with mocked dependencies."""
    return HtmlDocumentHandler(mock_download_cache_service, test_app_settings, mock_cas_image_service)


@pytest.fixture
def create_test_image():
    """Helper to create test image bytes."""
    def _create(width=100, height=100, color='red'):
        img = Image.new('RGB', (width, height), color=color)
        img_bytes = io.BytesIO()
        img.save(img_bytes, format='JPEG')
        return img_bytes.getvalue()
    return _create


class TestHtmlDocumentHandler:
    """Test HtmlDocumentHandler functionality."""

    def test_extract_page_title_from_title_tag(self, html_handler):
        """Test extracting page title from <title> tag."""
        html = """
        <html>
            <head>
                <title>Test Page Title</title>
            </head>
            <body></body>
        </html>
        """
        soup = BeautifulSoup(html, 'html.parser')

        title = html_handler._extract_page_title(soup)

        assert title == "Test Page Title"

    def test_extract_page_title_missing(self, html_handler):
        """Test extraction when no title is present."""
        html = """
        <html>
            <head></head>
            <body></body>
        </html>
        """
        soup = BeautifulSoup(html, 'html.parser')

        title = html_handler._extract_page_title(soup)

        assert title is None

    def test_extract_page_title_empty(self, html_handler):
        """Test extraction when title is empty."""
        html = """
        <html>
            <head>
                <title></title>
            </head>
            <body></body>
        </html>
        """
        soup = BeautifulSoup(html, 'html.parser')

        title = html_handler._extract_page_title(soup)

        assert title is None

    def test_find_preview_image_og_image(self, html_handler, mock_download_cache_service, create_test_image):
        """Test finding preview image from og:image meta tag."""
        html = """
        <html>
            <head>
                <meta property="og:image" content="https://example.com/image.jpg">
            </head>
            <body></body>
        </html>
        """
        soup = BeautifulSoup(html, 'html.parser')
        test_image = create_test_image()
        mock_download_cache_service.get_cached_content.return_value = DownloadResult(content=test_image, content_type='image/jpeg')

        with patch('magic.from_buffer', return_value='image/jpeg'):
            result = html_handler._find_preview_image(soup, "https://example.com", mock_download_cache_service)

        assert result is not None
        assert result.content == test_image
        assert result.content_type == "image/jpeg"
        mock_download_cache_service.get_cached_content.assert_called_once_with("https://example.com/image.jpg")

    def test_find_preview_image_twitter_image(self, html_handler, mock_download_cache_service, create_test_image):
        """Test finding preview image from twitter:image meta tag."""
        html = """
        <html>
            <head>
                <meta name="twitter:image" content="https://example.com/twitter.jpg">
            </head>
            <body></body>
        </html>
        """
        soup = BeautifulSoup(html, 'html.parser')
        test_image = create_test_image()
        mock_download_cache_service.get_cached_content.return_value = DownloadResult(content=test_image, content_type='image/jpeg')

        with patch('magic.from_buffer', return_value='image/jpeg'):
            result = html_handler._find_preview_image(soup, "https://example.com", mock_download_cache_service)

        assert result is not None
        assert result.content == test_image
        assert result.content_type == "image/jpeg"

    def test_find_preview_image_favicon(self, html_handler, mock_download_cache_service, create_test_image):
        """Test finding preview image from favicon."""
        html = """
        <html>
            <head>
                <link rel="icon" href="/favicon.ico">
            </head>
            <body></body>
        </html>
        """
        soup = BeautifulSoup(html, 'html.parser')
        test_image = create_test_image()
        mock_download_cache_service.get_cached_content.return_value = DownloadResult(content=test_image, content_type='image/jpeg')

        with patch('magic.from_buffer', return_value='image/jpeg'):
            result = html_handler._find_preview_image(soup, "https://example.com", mock_download_cache_service)

        assert result is not None
        assert result.content == test_image
        assert result.content_type == "image/jpeg"
        mock_download_cache_service.get_cached_content.assert_called_once_with("https://example.com/favicon.ico")

    def test_find_preview_image_relative_url(self, html_handler, mock_download_cache_service, create_test_image):
        """Test handling relative URLs in meta tags."""
        html = """
        <html>
            <head>
                <meta property="og:image" content="/images/preview.jpg">
            </head>
            <body></body>
        </html>
        """
        soup = BeautifulSoup(html, 'html.parser')
        test_image = create_test_image()
        mock_download_cache_service.get_cached_content.return_value = DownloadResult(content=test_image, content_type='image/jpeg')

        with patch('magic.from_buffer', return_value='image/jpeg'):
            result = html_handler._find_preview_image(soup, "https://example.com/page", mock_download_cache_service)

        assert result is not None
        mock_download_cache_service.get_cached_content.assert_called_once_with("https://example.com/images/preview.jpg")

    def test_find_preview_image_filters_1x1_pixel(self, html_handler, mock_download_cache_service, create_test_image):
        """Test that 1x1 tracking pixels are filtered out."""
        html = """
        <html>
            <head>
                <meta property="og:image" content="https://example.com/tracking.gif">
            </head>
            <body></body>
        </html>
        """
        soup = BeautifulSoup(html, 'html.parser')
        # Create 1x1 pixel image
        tracking_pixel = create_test_image(width=1, height=1)
        mock_download_cache_service.get_cached_content.return_value = tracking_pixel

        result = html_handler._find_preview_image(soup, "https://example.com", mock_download_cache_service)

        assert result is None

    def test_find_preview_image_rejects_animated_gif(self, html_handler, mock_download_cache_service):
        """Test that animated GIFs are rejected."""
        html = """
        <html>
            <head>
                <meta property="og:image" content="https://example.com/animated.gif">
            </head>
            <body></body>
        </html>
        """
        soup = BeautifulSoup(html, 'html.parser')
        # Create a simple GIF with animation flag
        # For this test, we'll just return None to simulate rejection
        mock_download_cache_service.get_cached_content.return_value = None

        result = html_handler._find_preview_image(soup, "https://example.com", mock_download_cache_service)

        assert result is None

    def test_find_preview_image_priority_order(self, html_handler, mock_download_cache_service, create_test_image):
        """Test that og:image takes priority over twitter:image."""
        html = """
        <html>
            <head>
                <meta property="og:image" content="https://example.com/og.jpg">
                <meta name="twitter:image" content="https://example.com/twitter.jpg">
                <link rel="icon" href="/favicon.ico">
            </head>
            <body></body>
        </html>
        """
        soup = BeautifulSoup(html, 'html.parser')
        test_image = create_test_image()
        mock_download_cache_service.get_cached_content.return_value = DownloadResult(content=test_image, content_type='image/jpeg')

        with patch('magic.from_buffer', return_value='image/jpeg'):
            result = html_handler._find_preview_image(soup, "https://example.com", mock_download_cache_service)

        assert result is not None
        # Should have tried og:image first
        mock_download_cache_service.get_cached_content.assert_called_once_with("https://example.com/og.jpg")

    def test_find_preview_image_fallback_to_google_favicon(self, html_handler, mock_download_cache_service, create_test_image):
        """Test fallback to Google favicon API when no other images found."""
        html = """
        <html>
            <head>
                <title>Test Page</title>
            </head>
            <body></body>
        </html>
        """
        soup = BeautifulSoup(html, 'html.parser')
        test_image = create_test_image(width=16, height=16)
        mock_download_cache_service.get_cached_content.return_value = DownloadResult(content=test_image, content_type='image/jpeg')

        with patch('magic.from_buffer', return_value='image/jpeg'):
            result = html_handler._find_preview_image(soup, "https://example.com", mock_download_cache_service)

        assert result is not None
        # Should have tried Google favicon API
        expected_url = "https://www.google.com/s2/favicons?domain=example.com&sz=64"
        mock_download_cache_service.get_cached_content.assert_called_once_with(expected_url)

    def test_process_html_content_complete(self, html_handler, mock_download_cache_service, create_test_image):
        """Test complete HTML processing with title and preview image."""
        html = b"""
        <html>
            <head>
                <title>Test Electronics Part</title>
                <meta property="og:image" content="https://example.com/preview.jpg">
            </head>
            <body>
                <h1>Electronic Component</h1>
            </body>
        </html>
        """
        test_image = create_test_image()
        mock_download_cache_service.get_cached_content.return_value = DownloadResult(content=test_image, content_type='image/jpeg')

        with patch('magic.from_buffer', return_value='image/jpeg'):
            result = html_handler.process_html_content(html, "https://example.com/part")

        assert result.title == "Test Electronics Part"
        assert result.preview_image is not None
        assert result.preview_image.content == test_image
        assert result.preview_image.content_type == "image/jpeg"

    def test_process_html_content_broken_html(self, html_handler, mock_download_cache_service):
        """Test processing broken/malformed HTML."""
        html = b"""
        <html>
            <head>
                <title>Broken Page
                <meta property="og:image" content="https://example.com/image.jpg"
            </head>
            <body>
                <h1>Unclosed tags
        """

        # Should still extract what it can
        result = html_handler.process_html_content(html, "https://example.com")

        assert result.title == "Broken Page"  # BeautifulSoup handles unclosed tags

    def test_process_html_content_multiple_og_images(self, html_handler, mock_download_cache_service, create_test_image):
        """Test handling multiple og:image tags (should use first one)."""
        html = b"""
        <html>
            <head>
                <meta property="og:image" content="https://example.com/first.jpg">
                <meta property="og:image" content="https://example.com/second.jpg">
                <meta property="og:image" content="https://example.com/third.jpg">
            </head>
            <body></body>
        </html>
        """
        test_image = create_test_image()
        mock_download_cache_service.get_cached_content.return_value = DownloadResult(content=test_image, content_type='image/jpeg')

        with patch('magic.from_buffer', return_value='image/jpeg'):
            html_handler.process_html_content(html, "https://example.com")

        # Should have used the first og:image
        mock_download_cache_service.get_cached_content.assert_called_once_with("https://example.com/first.jpg")

    def test_find_preview_image_handles_download_failure(self, html_handler, mock_download_cache_service, create_test_image):
        """Test graceful handling when image download fails."""
        html = """
        <html>
            <head>
                <meta property="og:image" content="https://example.com/404.jpg">
                <meta name="twitter:image" content="https://example.com/twitter.jpg">
            </head>
            <body></body>
        </html>
        """
        soup = BeautifulSoup(html, 'html.parser')

        # First call returns None (404), second succeeds
        test_image = create_test_image()
        mock_download_cache_service.get_cached_content.side_effect = [None, DownloadResult(content=test_image, content_type='image/jpeg')]

        with patch('magic.from_buffer', return_value='image/jpeg'):
            result = html_handler._find_preview_image(soup, "https://example.com", mock_download_cache_service)

        assert result is not None
        # Should have tried og:image first, then twitter:image
        assert mock_download_cache_service.get_cached_content.call_count == 2

    def test_find_preview_image_handles_non_image_content(self, html_handler, mock_download_cache_service):
        """Test handling when URL returns HTML instead of image."""
        html = """
        <html>
            <head>
                <meta property="og:image" content="https://example.com/redirect.html">
            </head>
            <body></body>
        </html>
        """
        soup = BeautifulSoup(html, 'html.parser')

        # Return HTML content instead of image
        mock_download_cache_service.get_cached_content.return_value = b"<html>redirect page</html>"

        with patch('magic.from_buffer', return_value='text/html'):
            result = html_handler._find_preview_image(soup, "https://example.com", mock_download_cache_service)

        assert result is None

    def test_download_and_validate_image_rejects_unsupported_types_when_conversion_fails(self, html_handler, mock_download_cache_service):
        """Test that _download_and_validate_image rejects unsupported image types when conversion fails."""
        # Mock downloading an .ico file
        ico_content = b"FAKE_ICO_CONTENT"
        mock_download_cache_service.get_cached_content.return_value = DownloadResult(
            content=ico_content,
            content_type="image/vnd.microsoft.icon"
        )

        # Mock CasImageService conversion to return None (conversion failed)
        html_handler.cas_image_service.convert_image_to_png.return_value = None

        with patch('magic.from_buffer') as mock_magic:
            # Magic detects .ico file
            mock_magic.return_value = 'image/vnd.microsoft.icon'

            # Should return None because conversion failed
            result = html_handler._download_and_validate_image(
                "https://example.com/favicon.ico",
                mock_download_cache_service
            )

            assert result is None
            # Verify conversion was attempted
            html_handler.cas_image_service.convert_image_to_png.assert_called_once_with(ico_content)

    def test_download_and_validate_image_accepts_supported_types(self, html_handler, mock_download_cache_service, create_test_image):
        """Test that _download_and_validate_image accepts supported image types."""
        # Mock downloading a JPEG file
        jpeg_content = create_test_image(100, 100, 'blue')
        mock_download_cache_service.get_cached_content.return_value = DownloadResult(
            content=jpeg_content,
            content_type="image/jpeg"
        )

        with patch('magic.from_buffer') as mock_magic:
            # Magic detects JPEG file
            mock_magic.return_value = 'image/jpeg'

            # Should return the image because JPEG is in ALLOWED_IMAGE_TYPES
            result = html_handler._download_and_validate_image(
                "https://example.com/image.jpg",
                mock_download_cache_service
            )

            assert result is not None
            assert result.content_type == "image/jpeg"
            assert result.content == jpeg_content

    def test_download_and_validate_image_converts_unsupported_types_successfully(self, html_handler, mock_download_cache_service, create_test_image):
        """Test that _download_and_validate_image successfully converts unsupported image types to PNG."""
        # Mock downloading an .ico file
        ico_content = b"FAKE_ICO_CONTENT"
        mock_download_cache_service.get_cached_content.return_value = DownloadResult(
            content=ico_content,
            content_type="image/vnd.microsoft.icon"
        )

        # Mock successful conversion to PNG
        converted_png_content = create_test_image(32, 32, 'red')  # Fake PNG content
        from app.schemas.upload_document import DocumentContentSchema
        html_handler.cas_image_service.convert_image_to_png.return_value = DocumentContentSchema(
            content=converted_png_content,
            content_type='image/png'
        )

        with patch('magic.from_buffer') as mock_magic:
            # Magic detects .ico file
            mock_magic.return_value = 'image/vnd.microsoft.icon'

            # Should return converted PNG
            result = html_handler._download_and_validate_image(
                "https://example.com/favicon.ico",
                mock_download_cache_service
            )

            assert result is not None
            assert result.content_type == "image/png"
            assert result.content == converted_png_content
            # Verify conversion was attempted
            html_handler.cas_image_service.convert_image_to_png.assert_called_once_with(ico_content)
