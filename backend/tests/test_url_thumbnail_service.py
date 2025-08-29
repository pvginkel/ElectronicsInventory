"""Unit tests for URLThumbnailService."""

import io
from unittest.mock import Mock, patch

import pytest
import requests
from PIL import Image
from sqlalchemy.orm import Session

from app.exceptions import InvalidOperationException
from app.services.container import ServiceContainer


@pytest.fixture
def mock_response():
    """Create mock HTTP response."""
    response = Mock()
    response.status_code = 200
    response.headers = {'content-type': 'text/html'}
    response.content = b"<html><head><title>Test</title></head></html>"
    response.text = "<html><head><title>Test</title></head></html>"
    return response


@pytest.fixture
def mock_image_response():
    """Create mock HTTP response for image."""
    # Create a small test image
    img = Image.new('RGB', (100, 100), color='red')
    img_bytes = io.BytesIO()
    img.save(img_bytes, format='JPEG')
    image_data = img_bytes.getvalue()

    response = Mock()
    response.status_code = 200
    response.headers = {'content-type': 'image/jpeg'}
    response.content = image_data
    response.iter_content = lambda chunk_size: [image_data[:chunk_size], image_data[chunk_size:]] if len(image_data) > chunk_size else [image_data]
    response.raise_for_status = Mock()
    return response


class TestURLThumbnailService:
    """Test URLThumbnailService functionality."""

    @patch('requests.head')
    def test_validate_url_valid_http(self, mock_head, container: ServiceContainer, session: Session):
        """Test validation of valid HTTP URL."""
        mock_head.return_value.status_code = 200
        url_service = container.url_thumbnail_service()

        result = url_service.validate_url("http://example.com")

        assert result is True
        mock_head.assert_called_once_with(
            "http://example.com",
            headers=url_service.headers,
            timeout=5,
            allow_redirects=True
        )

    @patch('requests.head')
    def test_validate_url_valid_https(self, mock_head, container: ServiceContainer, session: Session):
        """Test validation of valid HTTPS URL."""
        mock_head.return_value.status_code = 200
        url_service = container.url_thumbnail_service()

        result = url_service.validate_url("https://example.com")

        assert result is True

    def test_validate_url_invalid_scheme(self, container: ServiceContainer, session: Session):
        """Test validation of invalid URL scheme."""
        url_service = container.url_thumbnail_service()
        result = url_service.validate_url("ftp://example.com")
        assert result is False

    def test_validate_url_malformed(self, container: ServiceContainer, session: Session):
        """Test validation of malformed URL."""
        url_service = container.url_thumbnail_service()
        result = url_service.validate_url("not-a-url")
        assert result is False

    @patch('requests.head')
    def test_validate_url_connection_error(self, mock_head, container: ServiceContainer, session: Session):
        """Test validation with connection error."""
        mock_head.side_effect = requests.ConnectionError()
        url_service = container.url_thumbnail_service()

        result = url_service.validate_url("http://unreachable.com")

        assert result is False

    @patch('requests.head')
    def test_validate_url_http_error(self, mock_head, container: ServiceContainer, session: Session):
        """Test validation with HTTP error status."""
        mock_head.return_value.status_code = 404
        url_service = container.url_thumbnail_service()

        result = url_service.validate_url("http://example.com/notfound")

        assert result is False

    @patch('requests.get')
    def test_extract_metadata_with_og_tags(self, mock_get, container: ServiceContainer, session: Session, mock_html_content):
        """Test metadata extraction with Open Graph tags."""
        mock_response = Mock()
        mock_response.text = mock_html_content
        mock_response.headers = {'content-type': 'text/html'}
        mock_response.status_code = 200
        mock_response.iter_content = lambda chunk_size: [mock_html_content.encode('utf-8')]
        mock_get.return_value = mock_response

        url_service = container.url_thumbnail_service()
        metadata = url_service.extract_metadata("http://example.com")

        assert metadata['title'] == 'Test Product Page'
        assert metadata['description'] == 'Test description'
        assert metadata['og_image'] == 'https://example.com/image.jpg'
        assert metadata['favicon'] == 'https://example.com/favicon.ico'

    @patch('requests.get')
    def test_extract_metadata_fallback_title(self, mock_get, container: ServiceContainer, session: Session):
        """Test metadata extraction with fallback to HTML title."""
        html = "<html><head><title>Fallback Title</title></head></html>"

        mock_response = Mock()
        mock_response.text = html
        mock_response.headers = {'content-type': 'text/html'}
        mock_response.status_code = 200
        mock_response.iter_content = lambda chunk_size: [html.encode('utf-8')]
        mock_get.return_value = mock_response

        url_service = container.url_thumbnail_service()
        metadata = url_service.extract_metadata("http://example.com")

        assert metadata['title'] == 'Fallback Title'
        assert metadata.get('description') is None
        assert metadata.get('og_image') is None

    @patch('requests.get')
    def test_extract_metadata_no_content(self, mock_get, container: ServiceContainer, session: Session):
        """Test metadata extraction with minimal HTML."""
        html = "<html><head></head><body></body></html>"

        mock_response = Mock()
        mock_response.text = html
        mock_response.headers = {'content-type': 'text/html'}
        mock_response.status_code = 200
        mock_response.iter_content = lambda chunk_size: [html.encode('utf-8')]
        mock_get.return_value = mock_response

        url_service = container.url_thumbnail_service()
        metadata = url_service.extract_metadata("http://example.com")

        assert metadata.get('title') is None
        assert metadata.get('description') is None

    @patch('requests.get')
    def test_extract_metadata_request_error(self, mock_get, container: ServiceContainer, session: Session):
        """Test metadata extraction with request error."""
        mock_get.side_effect = requests.RequestException("Connection failed")
        url_service = container.url_thumbnail_service()

        with pytest.raises(InvalidOperationException) as exc_info:
            url_service.extract_metadata("http://example.com")

        assert "Cannot fetch URL content" in str(exc_info.value)

    @patch('requests.get')
    def test_download_image_success(self, mock_get, container: ServiceContainer, session: Session, mock_image_response):
        """Test successful image download."""
        mock_get.return_value = mock_image_response
        url_service = container.url_thumbnail_service()

        image_data, content_type = url_service._download_image("http://example.com/image.jpg", "http://example.com")

        assert isinstance(image_data, io.BytesIO)
        assert len(image_data.getvalue()) > 0
        assert content_type == 'image/jpeg'

    @patch('requests.get')
    def test_download_image_not_found(self, mock_get, container: ServiceContainer, session: Session):
        """Test image download with 404 error."""
        mock_response = Mock()
        mock_response.status_code = 404
        mock_response.raise_for_status.side_effect = requests.HTTPError("404 Client Error")
        mock_get.return_value = mock_response
        url_service = container.url_thumbnail_service()

        with pytest.raises(InvalidOperationException):
            url_service._download_image("http://example.com/notfound.jpg", "http://example.com")

    @patch('requests.get')
    def test_download_image_connection_error(self, mock_get, container: ServiceContainer, session: Session):
        """Test image download with connection error."""
        mock_get.side_effect = requests.ConnectionError()
        url_service = container.url_thumbnail_service()

        with pytest.raises(InvalidOperationException):
            url_service._download_image("http://example.com/image.jpg", "http://example.com")

    def test_get_favicon_fallback(self, container: ServiceContainer, session: Session):
        """Test favicon fallback URL generation."""
        url_service = container.url_thumbnail_service()
        url = url_service._get_favicon_fallback("http://example.com")
        expected = "https://www.google.com/s2/favicons?domain=http://example.com&sz=128"
        assert url == expected

    # Complex integration tests removed - these tested too many implementation details
    # The core functionality is covered by the document API integration tests



    @patch('requests.get')
    def test_download_and_store_thumbnail_metadata_failure(self, mock_get, container: ServiceContainer, session: Session):
        """Test thumbnail download when metadata extraction fails."""
        mock_get.side_effect = requests.ConnectionError("Connection failed")

        url_service = container.url_thumbnail_service()
        with pytest.raises(InvalidOperationException) as exc_info:
            url_service.download_and_store_thumbnail("http://example.com", 123)

        assert "Cannot extract thumbnail URL" in str(exc_info.value)


