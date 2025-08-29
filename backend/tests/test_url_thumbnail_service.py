"""Unit tests for URLThumbnailService."""

import io
from unittest.mock import MagicMock, Mock, patch

import pytest
import requests
from flask import Flask
from PIL import Image

from app.exceptions import InvalidOperationException
from app.services.url_thumbnail_service import URLThumbnailService
from tests.test_document_fixtures import mock_html_content, mock_url_metadata


@pytest.fixture
def mock_image_service():
    """Create mock ImageService."""
    mock = MagicMock()
    mock.process_uploaded_image.return_value = (io.BytesIO(b"processed"), {"width": 100, "height": 100})
    return mock


@pytest.fixture
def mock_s3_service():
    """Create mock S3Service."""
    mock = MagicMock()
    mock.generate_s3_key.return_value = "parts/123/thumbnails/thumb.jpg"
    mock.upload_file.return_value = True
    return mock


@pytest.fixture
def url_service(app: Flask, mock_image_service, mock_s3_service):
    """Create URLThumbnailService with mocked dependencies."""
    with app.app_context():
        service = URLThumbnailService(mock_s3_service, mock_image_service)
        return service


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
    
    response = Mock()
    response.status_code = 200
    response.headers = {'content-type': 'image/jpeg'}
    response.content = img_bytes.getvalue()
    return response


class TestURLThumbnailService:
    """Test URLThumbnailService functionality."""

    def test_validate_url_valid_http(self, url_service):
        """Test validation of valid HTTP URL."""
        with patch('requests.get') as mock_get:
            mock_get.return_value.status_code = 200
            
            result = url_service.validate_url("http://example.com")
            
            assert result is True
            mock_get.assert_called_once_with("http://example.com", timeout=10, allow_redirects=True)

    def test_validate_url_valid_https(self, url_service):
        """Test validation of valid HTTPS URL."""
        with patch('requests.get') as mock_get:
            mock_get.return_value.status_code = 200
            
            result = url_service.validate_url("https://example.com")
            
            assert result is True

    def test_validate_url_invalid_scheme(self, url_service):
        """Test validation of invalid URL scheme."""
        result = url_service.validate_url("ftp://example.com")
        assert result is False

    def test_validate_url_malformed(self, url_service):
        """Test validation of malformed URL."""
        result = url_service.validate_url("not-a-url")
        assert result is False

    def test_validate_url_connection_error(self, url_service):
        """Test validation with connection error."""
        with patch('requests.get') as mock_get:
            mock_get.side_effect = requests.ConnectionError()
            
            result = url_service.validate_url("http://unreachable.com")
            
            assert result is False

    def test_validate_url_http_error(self, url_service):
        """Test validation with HTTP error status."""
        with patch('requests.get') as mock_get:
            mock_get.return_value.status_code = 404
            
            result = url_service.validate_url("http://example.com/notfound")
            
            assert result is False

    def test_extract_metadata_with_og_tags(self, url_service, mock_html_content):
        """Test metadata extraction with Open Graph tags."""
        with patch('requests.get') as mock_get:
            mock_response = Mock()
            mock_response.text = mock_html_content
            mock_response.headers = {'content-type': 'text/html'}
            mock_get.return_value = mock_response
            
            metadata = url_service.extract_metadata("http://example.com")
            
            assert metadata['title'] == 'Test Product Page'
            assert metadata['description'] == 'Test description'
            assert metadata['og_image'] == 'https://example.com/image.jpg'
            assert metadata['favicon'] == 'https://example.com/favicon.ico'

    def test_extract_metadata_fallback_title(self, url_service):
        """Test metadata extraction with fallback to HTML title."""
        html = "<html><head><title>Fallback Title</title></head></html>"
        
        with patch('requests.get') as mock_get:
            mock_response = Mock()
            mock_response.text = html
            mock_response.headers = {'content-type': 'text/html'}
            mock_get.return_value = mock_response
            
            metadata = url_service.extract_metadata("http://example.com")
            
            assert metadata['title'] == 'Fallback Title'
            assert metadata.get('description') is None
            assert metadata.get('og_image') is None

    def test_extract_metadata_no_content(self, url_service):
        """Test metadata extraction with minimal HTML."""
        html = "<html><head></head><body></body></html>"
        
        with patch('requests.get') as mock_get:
            mock_response = Mock()
            mock_response.text = html
            mock_response.headers = {'content-type': 'text/html'}
            mock_get.return_value = mock_response
            
            metadata = url_service.extract_metadata("http://example.com")
            
            assert metadata.get('title') is None
            assert metadata.get('description') is None

    def test_extract_metadata_request_error(self, url_service):
        """Test metadata extraction with request error."""
        with patch('requests.get') as mock_get:
            mock_get.side_effect = requests.RequestException("Connection failed")
            
            with pytest.raises(InvalidOperationException) as exc_info:
                url_service.extract_metadata("http://example.com")
            
            assert "extract URL metadata" in str(exc_info.value)

    def test_download_image_success(self, url_service, mock_image_response):
        """Test successful image download."""
        with patch('requests.get') as mock_get:
            mock_get.return_value = mock_image_response
            
            result = url_service._download_image("http://example.com/image.jpg")
            
            assert isinstance(result, io.BytesIO)
            assert len(result.getvalue()) > 0

    def test_download_image_not_found(self, url_service):
        """Test image download with 404 error."""
        with patch('requests.get') as mock_get:
            mock_get.return_value.status_code = 404
            
            result = url_service._download_image("http://example.com/notfound.jpg")
            
            assert result is None

    def test_download_image_connection_error(self, url_service):
        """Test image download with connection error."""
        with patch('requests.get') as mock_get:
            mock_get.side_effect = requests.ConnectionError()
            
            result = url_service._download_image("http://example.com/image.jpg")
            
            assert result is None

    def test_get_google_favicon_url(self, url_service):
        """Test Google favicon URL generation."""
        url = url_service._get_google_favicon_url("http://example.com")
        expected = "https://www.google.com/s2/favicons?domain=example.com&sz=64"
        assert url == expected

    def test_download_and_store_thumbnail_with_og_image(self, url_service, mock_image_response, 
                                                        mock_image_service, mock_s3_service):
        """Test complete thumbnail download and storage with OG image."""
        html = '''
        <html>
        <head>
            <meta property="og:image" content="http://example.com/og-image.jpg">
            <title>Test Page</title>
        </head>
        </html>
        '''
        
        with patch('requests.get') as mock_get:
            # First call for metadata extraction
            html_response = Mock()
            html_response.text = html
            html_response.headers = {'content-type': 'text/html'}
            
            # Second call for image download
            mock_get.side_effect = [html_response, mock_image_response]
            
            s3_key, content_type, file_size, metadata = url_service.download_and_store_thumbnail(
                "http://example.com", 123
            )
            
            assert s3_key == "parts/123/thumbnails/thumb.jpg"
            assert content_type == "image/jpeg"
            assert file_size > 0
            assert 'width' in metadata
            assert 'height' in metadata
            assert metadata['source'] == 'og_image'
            assert metadata['source_url'] == 'http://example.com/og-image.jpg'

    def test_download_and_store_thumbnail_fallback_to_favicon(self, url_service, mock_image_response,
                                                              mock_image_service, mock_s3_service):
        """Test thumbnail download falling back to favicon."""
        html = '<html><head><title>Test Page</title></head></html>'
        
        with patch('requests.get') as mock_get:
            # First call for metadata (no og:image)
            html_response = Mock()
            html_response.text = html
            html_response.headers = {'content-type': 'text/html'}
            
            # Second call for Google favicon
            mock_get.side_effect = [html_response, mock_image_response]
            
            s3_key, content_type, file_size, metadata = url_service.download_and_store_thumbnail(
                "http://example.com", 123
            )
            
            assert metadata['source'] == 'favicon'
            assert 'google.com/s2/favicons' in metadata['source_url']

    def test_download_and_store_thumbnail_no_image_available(self, url_service, mock_image_service, mock_s3_service):
        """Test thumbnail download when no images are available."""
        html = '<html><head><title>Test Page</title></head></html>'
        
        with patch('requests.get') as mock_get:
            # Metadata call returns HTML without images
            html_response = Mock()
            html_response.text = html
            html_response.headers = {'content-type': 'text/html'}
            
            # Image downloads fail
            not_found_response = Mock()
            not_found_response.status_code = 404
            
            mock_get.side_effect = [html_response, not_found_response]
            
            with pytest.raises(InvalidOperationException) as exc_info:
                url_service.download_and_store_thumbnail("http://example.com", 123)
            
            assert "download URL thumbnail" in str(exc_info.value)
            assert "no suitable image found" in str(exc_info.value)

    def test_download_and_store_thumbnail_metadata_failure(self, url_service):
        """Test thumbnail download when metadata extraction fails."""
        with patch('requests.get') as mock_get:
            mock_get.side_effect = requests.ConnectionError("Connection failed")
            
            with pytest.raises(InvalidOperationException) as exc_info:
                url_service.download_and_store_thumbnail("http://example.com", 123)
            
            assert "download URL thumbnail" in str(exc_info.value)

    def test_download_and_store_thumbnail_image_processing_failure(self, url_service, mock_image_response):
        """Test thumbnail download when image processing fails."""
        html = '''<meta property="og:image" content="http://example.com/image.jpg">'''
        
        with patch('requests.get') as mock_get:
            html_response = Mock()
            html_response.text = html
            html_response.headers = {'content-type': 'text/html'}
            
            mock_get.side_effect = [html_response, mock_image_response]
        
        # Mock image service to fail
        url_service.image_service.process_uploaded_image.side_effect = Exception("Processing failed")
        
        with pytest.raises(InvalidOperationException) as exc_info:
            url_service.download_and_store_thumbnail("http://example.com", 123)
        
        assert "download URL thumbnail" in str(exc_info.value)

    def test_download_and_store_thumbnail_s3_upload_failure(self, url_service, mock_image_response):
        """Test thumbnail download when S3 upload fails."""
        html = '''<meta property="og:image" content="http://example.com/image.jpg">'''
        
        with patch('requests.get') as mock_get:
            html_response = Mock()
            html_response.text = html
            html_response.headers = {'content-type': 'text/html'}
            
            mock_get.side_effect = [html_response, mock_image_response]
        
        # Mock S3 service to fail
        url_service.s3_service.upload_file.side_effect = Exception("Upload failed")
        
        with pytest.raises(InvalidOperationException) as exc_info:
            url_service.download_and_store_thumbnail("http://example.com", 123)
        
        assert "download URL thumbnail" in str(exc_info.value)