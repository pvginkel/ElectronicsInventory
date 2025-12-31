"""Integration tests for document API endpoints."""

from unittest.mock import patch

from flask.testing import FlaskClient

from app.models.attachment import AttachmentType
from app.schemas.upload_document import DocumentContentSchema, UploadDocumentSchema


class TestUrlPreviewAPI:
    """Integration tests for URL preview API endpoints."""

    @patch('app.services.document_service.DocumentService.process_upload_url')
    def test_attachment_preview_success(self, mock_process_url, client: FlaskClient):
        """Test successful URL preview metadata extraction."""
        # Mock successful URL processing with preview image
        mock_process_url.return_value = UploadDocumentSchema(
            title='Test Page Title',
            content=DocumentContentSchema(
                content=b"<html>content</html>",
                content_type="text/html"
            ),
            detected_type=AttachmentType.URL,
            preview_image=DocumentContentSchema(
                content=b"image data",
                content_type="image/jpeg"
            )
        )

        response = client.post(
            '/api/parts/attachment-preview',
            json={'url': 'https://example.com'}
        )

        assert response.status_code == 200
        data = response.get_json()
        assert data['title'] == 'Test Page Title'
        assert data['image_url'] == '/api/parts/attachment-preview/image?url=https%3A%2F%2Fexample.com'
        assert data['original_url'] == 'https://example.com'
        assert data['content_type'] == 'webpage'

        mock_process_url.assert_called_once_with('https://example.com')

    @patch('app.services.document_service.DocumentService.process_upload_url')
    def test_attachment_preview_direct_image_title(self, mock_process_url, client: FlaskClient):
        """Test URL preview with direct image URL extracts title from filename."""
        # Mock direct image processing
        mock_process_url.return_value = UploadDocumentSchema(
            title='dht22-thermometer-temperature-and-humidity-sensor.jpg',
            content=DocumentContentSchema(
                content=b"fake image content",
                content_type="image/jpeg"
            ),
            detected_type=AttachmentType.IMAGE,
            preview_image=None  # Direct images don't need separate preview
        )

        response = client.post(
            '/api/parts/attachment-preview',
            json={'url': 'https://www.tinytronics.nl/image/catalog/products_2023/dht22-thermometer-temperature-and-humidity-sensor.jpg'}
        )

        assert response.status_code == 200
        data = response.get_json()
        assert data['title'] == 'dht22-thermometer-temperature-and-humidity-sensor.jpg'
        assert data['image_url'] is not None  # Should have image URL for direct images
        assert data['original_url'] == 'https://www.tinytronics.nl/image/catalog/products_2023/dht22-thermometer-temperature-and-humidity-sensor.jpg'
        assert data['content_type'] == 'image'

        url = 'https://www.tinytronics.nl/image/catalog/products_2023/dht22-thermometer-temperature-and-humidity-sensor.jpg'
        mock_process_url.assert_called_once_with(url)

    @patch('app.services.document_service.DocumentService.process_upload_url')
    def test_attachment_preview_no_image(self, mock_process_url, client: FlaskClient):
        """Test URL preview with no image available."""
        # Mock HTML page with no preview image
        mock_process_url.return_value = UploadDocumentSchema(
            title='Test Page Title',
            content=DocumentContentSchema(
                content=b"<html>content</html>",
                content_type="text/html"
            ),
            detected_type=AttachmentType.URL,
            preview_image=None  # No preview image available
        )

        response = client.post(
            '/api/parts/attachment-preview',
            json={'url': 'https://example.com'}
        )

        assert response.status_code == 200
        data = response.get_json()
        assert data['title'] == 'Test Page Title'
        assert data['image_url'] is None  # No preview image available
        assert data['original_url'] == 'https://example.com'
        assert data['content_type'] == 'webpage'

        mock_process_url.assert_called_once_with('https://example.com')

    @patch('app.services.document_service.DocumentService.process_upload_url')
    def test_attachment_preview_invalid_url(self, mock_process_url, client: FlaskClient):
        """Test URL preview with invalid URL."""
        # Mock URL processing failure
        mock_process_url.side_effect = Exception("Invalid URL format")

        response = client.post(
            '/api/parts/attachment-preview',
            json={'url': 'invalid-url'}
        )

        assert response.status_code == 422
        data = response.get_json()
        assert data['error'] == 'Failed to extract URL preview'
        assert 'Invalid URL format' in data['details']['message']

        mock_process_url.assert_called_once_with('invalid-url')

    @patch('app.services.document_service.DocumentService.process_upload_url')
    def test_attachment_preview_extraction_error(self, mock_process_url, client: FlaskClient):
        """Test URL preview with extraction failure."""
        # Mock processing failure
        mock_process_url.side_effect = Exception("Extraction failed")

        response = client.post(
            '/api/parts/attachment-preview',
            json={'url': 'https://example.com'}
        )

        assert response.status_code == 422
        data = response.get_json()
        assert data['error'] == 'Failed to extract URL preview'
        assert 'Extraction failed' in data['details']['message']

        mock_process_url.assert_called_once_with('https://example.com')

    def test_attachment_preview_invalid_json(self, client: FlaskClient):
        """Test URL preview with invalid request data."""
        response = client.post(
            '/api/parts/attachment-preview',
            json={'invalid_field': 'test'}
        )

        assert response.status_code == 400

    @patch('app.services.document_service.DocumentService.get_preview_image')
    def test_attachment_preview_image_success(self, mock_get_preview_image, client: FlaskClient):
        """Test successful preview image retrieval."""
        # Mock successful preview image retrieval
        mock_get_preview_image.return_value = DocumentContentSchema(
            content=b"fake image data",
            content_type='image/jpeg'
        )

        response = client.get('/api/parts/attachment-preview/image?url=https%3A//example.com')

        assert response.status_code == 200
        assert response.content_type == 'image/jpeg'
        assert response.data == b"fake image data"

        mock_get_preview_image.assert_called_once_with('https://example.com')

    def test_attachment_preview_image_no_url(self, client: FlaskClient):
        """Test preview image endpoint without URL parameter."""
        response = client.get('/api/parts/attachment-preview/image')

        assert response.status_code == 400
        data = response.get_json()
        assert 'URL parameter required' in data['error']

    @patch('app.services.document_service.DocumentService.get_preview_image')
    def test_attachment_preview_image_invalid_url(self, mock_get_preview_image, client: FlaskClient):
        """Test preview image with invalid URL."""
        # Mock get_preview_image to raise an exception for invalid URL
        mock_get_preview_image.side_effect = Exception("Invalid URL format")

        response = client.get('/api/parts/attachment-preview/image?url=invalid-url')

        assert response.status_code == 404
        data = response.get_json()
        assert 'Failed to retrieve image' in data['error']
        assert 'Invalid URL format' in data['error']

        mock_get_preview_image.assert_called_once_with('invalid-url')

    @patch('app.services.document_service.DocumentService.get_preview_image')
    def test_attachment_preview_image_extraction_error(self, mock_get_preview_image, client: FlaskClient):
        """Test preview image with extraction failure."""
        # Mock extraction failure
        mock_get_preview_image.side_effect = Exception("Image extraction failed")

        response = client.get('/api/parts/attachment-preview/image?url=https%3A//example.com')

        assert response.status_code == 404
        data = response.get_json()
        assert 'Failed to retrieve image' in data['error']
        assert 'Image extraction failed' in data['error']

        mock_get_preview_image.assert_called_once_with('https://example.com')

    @patch('app.services.document_service.DocumentService.get_preview_image')
    def test_attachment_preview_direct_image_url(self, mock_get_preview_image, client: FlaskClient):
        """Test preview image with direct image URL."""
        # Mock direct image retrieval
        mock_get_preview_image.return_value = DocumentContentSchema(
            content=b"direct image data",
            content_type='image/jpeg'
        )

        response = client.get('/api/parts/attachment-preview/image?url=https%3A//example.com/image.jpg')

        assert response.status_code == 200
        assert response.content_type == 'image/jpeg'
        assert response.data == b"direct image data"

        mock_get_preview_image.assert_called_once_with('https://example.com/image.jpg')
