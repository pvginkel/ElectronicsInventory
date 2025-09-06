"""Integration tests for document API endpoints."""

import io
from unittest.mock import patch

from flask import Flask
from flask.testing import FlaskClient
from sqlalchemy.orm import Session

from app.models.part_attachment import AttachmentType, PartAttachment
from app.services.container import ServiceContainer


class TestDocumentAPI:
    """Integration tests for document API endpoints."""

    @patch('app.services.document_service.magic.from_buffer')
    @patch('app.services.s3_service.S3Service.upload_file', return_value=True)
    @patch('app.services.s3_service.S3Service.generate_s3_key', return_value="parts/TEST/attachments/test.jpg")
    def test_create_file_attachment_success(self, mock_generate_key, mock_upload, mock_magic, client: FlaskClient, app: Flask, container: ServiceContainer, session: Session, sample_image_file):
        """Test successful file attachment creation via API."""
        mock_magic.return_value = 'image/jpeg'

        with app.app_context():
            # Create test part using service
            part_type = container.type_service().create_type("File Test Type")
            part = container.part_service().create_part(
                description="File test part",
                manufacturer_code="FILE-001",
                type_id=part_type.id
            )
            session.commit()

            response = client.post(
                f'/api/parts/{part.key}/attachments',
                data={
                    'title': 'Test Image',
                    'file': (sample_image_file, 'test.jpg', 'image/jpeg')
                },
                content_type='multipart/form-data'
            )

        assert response.status_code == 201
        data = response.get_json()
        assert data['title'] == 'Test Image'
        assert data['attachment_type'] == 'image'
        assert data['filename'] == 'test.jpg'
        assert data['has_preview'] is True

    @patch('app.services.document_service.DocumentService.process_upload_url')
    def test_create_url_attachment_success(self, mock_process_url, client: FlaskClient, app: Flask, container: ServiceContainer, session: Session):
        """Test successful URL attachment creation via API."""
        # Mock the process_upload_url response
        from app.schemas.upload_document import UploadDocumentSchema, UploadDocumentContentSchema
        mock_process_url.return_value = UploadDocumentSchema(
            title="Product Page",
            content=UploadDocumentContentSchema(
                content=b"<html>fake content</html>",
                content_type="text/html"
            ),
            detected_type="text/html",
            preview_image=UploadDocumentContentSchema(
                content=b"fake image",
                content_type="image/jpeg"
            )
        )
        
        with app.app_context():
            # Create test part using service
            part_type = container.type_service().create_type("URL Test Type")
            part = container.part_service().create_part(
                description="URL test part",
                manufacturer_code="URL-001",
                type_id=part_type.id
            )
            session.commit()

            response = client.post(
                f'/api/parts/{part.key}/attachments',
                json={
                    'title': 'Product Page',
                    'url': 'https://example.com/product'
                }
            )

        assert response.status_code == 201
        data = response.get_json()
        assert data['title'] == 'Product Page'
        assert data['attachment_type'] == 'url'
        assert data['url'] == 'https://example.com/product'
        assert data['has_preview'] is True  # Should be True because mock returns s3_key

    def test_create_attachment_invalid_json(self, client: FlaskClient, container: ServiceContainer, session: Session):
        """Test attachment creation with invalid JSON."""
        # Create test part using service
        part_type = container.type_service().create_type("Invalid JSON Test Type")
        part = container.part_service().create_part(
            description="Invalid JSON test part",
            manufacturer_code="INV-001",
            type_id=part_type.id
        )
        session.commit()

        response = client.post(
            f'/api/parts/{part.key}/attachments',
            json={
                'title': 'Missing URL or file'
                # Neither 'url' nor 'file' provided
            }
        )

        assert response.status_code == 400

    def test_create_attachment_part_not_found(self, client: FlaskClient):
        """Test attachment creation for non-existent part."""
        response = client.post(
            '/api/parts/NONEXISTENT/attachments',
            json={
                'title': 'Test',
                'url': 'https://example.com'
            }
        )

        assert response.status_code == 404

    def test_list_part_attachments(self, client: FlaskClient, container: ServiceContainer, session: Session):
        """Test listing attachments for a part."""
        # Create test part using service
        part_type = container.type_service().create_type("List Test Type")
        part = container.part_service().create_part(
            description="List test part",
            manufacturer_code="LIST-001",
            type_id=part_type.id
        )
        session.commit()

        # Create test attachments directly (since we're testing listing, not creation)
        attachment1 = PartAttachment(
            part_id=part.id,
            attachment_type=AttachmentType.IMAGE,
            title="Image 1",
            s3_key="test1.jpg",
            filename="test1.jpg",
            content_type="image/jpeg",
            file_size=1024
        )
        attachment2 = PartAttachment(
            part_id=part.id,
            attachment_type=AttachmentType.URL,
            title="URL 1",
            url="https://example.com"
        )
        session.add_all([attachment1, attachment2])
        session.commit()

        response = client.get(f'/api/parts/{part.key}/attachments')

        assert response.status_code == 200
        data = response.get_json()
        assert len(data) == 2

        titles = [item['title'] for item in data]
        assert 'Image 1' in titles
        assert 'URL 1' in titles

        # Verify has_preview field is present and correct
        for item in data:
            assert 'has_preview' in item
            if item['title'] == 'Image 1':
                assert item['has_preview'] is True
            elif item['title'] == 'URL 1':
                assert item['has_preview'] is False  # No s3_key or metadata set

    def test_get_single_attachment(self, client: FlaskClient, container: ServiceContainer, session: Session):
        """Test getting single attachment details."""
        # Create test part using service
        part_type = container.type_service().create_type("Single Test Type")
        part = container.part_service().create_part(
            description="Single test part",
            manufacturer_code="SING-001",
            type_id=part_type.id
        )
        session.commit()

        attachment = PartAttachment(
            part_id=part.id,
            attachment_type=AttachmentType.IMAGE,
            title="Test Attachment",
            s3_key="test.jpg",
            filename="test.jpg",
            content_type="image/jpeg",
            file_size=1024
        )
        session.add(attachment)
        session.commit()

        response = client.get(f'/api/parts/{part.key}/attachments/{attachment.id}')

        assert response.status_code == 200
        data = response.get_json()
        assert data['title'] == 'Test Attachment'
        assert data['filename'] == 'test.jpg'
        assert data['has_preview'] is True

    def test_update_attachment(self, client: FlaskClient, container: ServiceContainer, session: Session):
        """Test updating attachment metadata."""
        # Create test part using service
        part_type = container.type_service().create_type("Update Test Type")
        part = container.part_service().create_part(
            description="Update test part",
            manufacturer_code="UPDT-001",
            type_id=part_type.id
        )
        session.commit()

        attachment = PartAttachment(
            part_id=part.id,
            attachment_type=AttachmentType.IMAGE,
            title="Original Title",
            s3_key="test.jpg"
        )
        session.add(attachment)
        session.commit()

        response = client.put(
            f'/api/parts/{part.key}/attachments/{attachment.id}',
            json={'title': 'Updated Title'}
        )

        assert response.status_code == 200
        data = response.get_json()
        assert data['title'] == 'Updated Title'
        assert 'has_preview' in data  # Field should be present in update responses

    @patch('app.services.s3_service.S3Service.delete_file', return_value=True)
    def test_delete_attachment(self, mock_delete, client: FlaskClient, container: ServiceContainer, session: Session):
        """Test deleting attachment."""
        # Create test part using service
        part_type = container.type_service().create_type("Delete Test Type")
        part = container.part_service().create_part(
            description="Delete test part",
            manufacturer_code="DELT-001",
            type_id=part_type.id
        )
        session.commit()

        attachment = PartAttachment(
            part_id=part.id,
            attachment_type=AttachmentType.IMAGE,
            title="To Delete",
            s3_key="test.jpg"
        )
        session.add(attachment)
        session.commit()
        attachment_id = attachment.id

        response = client.delete(f'/api/parts/{part.key}/attachments/{attachment_id}')

        assert response.status_code == 204

    @patch('app.services.s3_service.S3Service.download_file', return_value=io.BytesIO(b"fake pdf content"))
    def test_download_attachment(self, mock_download, client: FlaskClient, container: ServiceContainer, session: Session):
        """Test downloading attachment file."""
        # Create test part using service
        part_type = container.type_service().create_type("Download Test Type")
        part = container.part_service().create_part(
            description="Download test part",
            manufacturer_code="DOWN-001",
            type_id=part_type.id
        )
        session.commit()

        attachment = PartAttachment(
            part_id=part.id,
            attachment_type=AttachmentType.PDF,
            title="Test PDF",
            s3_key="test.pdf",
            filename="datasheet.pdf",
            content_type="application/pdf"
        )
        session.add(attachment)
        session.commit()

        response = client.get(f'/api/parts/{part.key}/attachments/{attachment.id}/download')

        assert response.status_code == 200
        assert response.content_type == 'application/pdf'

    def test_get_attachment_thumbnail(self, client: FlaskClient, container: ServiceContainer, session: Session, tmp_path):
        """Test getting attachment thumbnail."""
        # Create test part using service
        part_type = container.type_service().create_type("Thumbnail Test Type")
        part = container.part_service().create_part(
            description="Thumbnail test part",
            manufacturer_code="THMB-001",
            type_id=part_type.id
        )
        session.commit()

        attachment = PartAttachment(
            part_id=part.id,
            attachment_type=AttachmentType.IMAGE,
            title="Test Image",
            s3_key="test.jpg"
        )
        session.add(attachment)
        session.commit()

        # Create a real thumbnail file for the test
        thumbnail_file = tmp_path / "thumbnail.jpg"
        thumbnail_file.write_bytes(b"fake thumbnail data")

        with patch('app.services.image_service.ImageService.get_thumbnail_path', return_value=str(thumbnail_file)):
            response = client.get(f'/api/parts/{part.key}/attachments/{attachment.id}/thumbnail')

        assert response.status_code == 200
        assert response.content_type == 'image/jpeg'

    def test_set_part_cover_attachment(self, client: FlaskClient, container: ServiceContainer, session: Session):
        """Test setting part cover attachment."""
        # Create test part using service
        part_type = container.type_service().create_type("Cover Set Test Type")
        part = container.part_service().create_part(
            description="Cover set test part",
            manufacturer_code="COVR-001",
            type_id=part_type.id
        )
        session.commit()

        attachment = PartAttachment(
            part_id=part.id,
            attachment_type=AttachmentType.IMAGE,
            title="Cover Image",
            s3_key="cover.jpg"
        )
        session.add(attachment)
        session.commit()

        response = client.put(
            f'/api/parts/{part.key}/cover',
            json={'attachment_id': attachment.id}
        )

        assert response.status_code == 200
        data = response.get_json()
        assert data['attachment_id'] == attachment.id

    def test_get_part_cover_attachment(self, client: FlaskClient, container: ServiceContainer, session: Session):
        """Test getting part cover attachment."""
        # Create test part using service
        part_type = container.type_service().create_type("Cover Get Test Type")
        part = container.part_service().create_part(
            description="Cover get test part",
            manufacturer_code="GETC-001",
            type_id=part_type.id
        )
        session.commit()

        attachment = PartAttachment(
            part_id=part.id,
            attachment_type=AttachmentType.IMAGE,
            title="Cover Image",
            s3_key="cover.jpg"
        )
        session.add(attachment)
        session.flush()
        part.cover_attachment_id = attachment.id
        session.commit()

        response = client.get(f'/api/parts/{part.key}/cover')

        assert response.status_code == 200
        data = response.get_json()
        assert data['attachment_id'] == attachment.id
        assert data['attachment']['title'] == 'Cover Image'

    def test_clear_part_cover_attachment(self, client: FlaskClient, container: ServiceContainer, session: Session):
        """Test clearing part cover attachment."""
        # Create test part using service
        part_type = container.type_service().create_type("Cover Clear Test Type")
        part = container.part_service().create_part(
            description="Cover clear test part",
            manufacturer_code="CLRC-001",
            type_id=part_type.id
        )
        session.commit()

        attachment = PartAttachment(
            part_id=part.id,
            attachment_type=AttachmentType.IMAGE,
            title="Cover Image",
            s3_key="cover.jpg"
        )
        session.add(attachment)
        session.flush()
        part.cover_attachment_id = attachment.id
        session.commit()

        response = client.delete(f'/api/parts/{part.key}/cover')

        assert response.status_code == 200
        data = response.get_json()
        assert data['attachment_id'] is None

    def test_create_attachment_validation_errors(self, client: FlaskClient, container: ServiceContainer, session: Session):
        """Test various validation errors in attachment creation."""
        # Create test part using service
        part_type = container.type_service().create_type("Validation Test Type")
        part = container.part_service().create_part(
            description="Validation test part",
            manufacturer_code="VALD-001",
            type_id=part_type.id
        )
        session.commit()

        # Missing title
        response = client.post(
            f'/api/parts/{part.key}/attachments',
            json={'url': 'https://example.com'}
        )
        assert response.status_code == 400

        # Title too long
        response = client.post(
            f'/api/parts/{part.key}/attachments',
            json={
                'title': 'x' * 300,  # Exceeds 255 character limit
                'url': 'https://example.com'
            }
        )
        assert response.status_code == 400

        # Invalid URL format
        response = client.post(
            f'/api/parts/{part.key}/attachments',
            json={
                'title': 'Invalid URL',
                'url': 'x' * 2100  # Exceeds 2000 character limit
            }
        )
        assert response.status_code == 400

    def test_attachment_not_found_errors(self, client: FlaskClient, container: ServiceContainer, session: Session):
        """Test 404 errors for non-existent attachments."""
        # Create test part using service
        part_type = container.type_service().create_type("Not Found Test Type")
        part = container.part_service().create_part(
            description="Not found test part",
            manufacturer_code="NOTF-001",
            type_id=part_type.id
        )
        session.commit()

        # Get non-existent attachment
        response = client.get(f'/api/parts/{part.key}/attachments/99999')
        assert response.status_code == 404

        # Update non-existent attachment
        response = client.put(
            f'/api/parts/{part.key}/attachments/99999',
            json={'title': 'New Title'}
        )
        assert response.status_code == 404

        # Delete non-existent attachment
        response = client.delete(f'/api/parts/{part.key}/attachments/99999')
        assert response.status_code == 404

    def test_thumbnail_size_parameter(self, client: FlaskClient, container: ServiceContainer, session: Session, tmp_path):
        """Test thumbnail endpoint with custom size parameter."""
        # Create test part using service
        part_type = container.type_service().create_type("Thumb Size Test Type")
        part = container.part_service().create_part(
            description="Thumb size test part",
            manufacturer_code="SIZE-001",
            type_id=part_type.id
        )
        session.commit()

        attachment = PartAttachment(
            part_id=part.id,
            attachment_type=AttachmentType.IMAGE,
            title="Test Image",
            s3_key="test.jpg"
        )
        session.add(attachment)
        session.commit()

        # Create a real thumbnail file for the test
        thumbnail_file = tmp_path / "thumbnail.jpg"
        thumbnail_file.write_bytes(b"fake thumbnail data")

        with patch('app.services.image_service.ImageService.get_thumbnail_path', return_value=str(thumbnail_file)) as mock_get_thumbnail:
            response = client.get(
                f'/api/parts/{part.key}/attachments/{attachment.id}/thumbnail?size=300'
            )

        assert response.status_code == 200
        # Verify the service was called with the custom size
        mock_get_thumbnail.assert_called_with(attachment.id, 'test.jpg', 300)

    @patch('app.services.document_service.DocumentService.get_part_attachments', side_effect=Exception("Database error"))
    def test_error_handling_in_endpoints(self, mock_get_attachments, client: FlaskClient, container: ServiceContainer, session: Session):
        """Test error handling in API endpoints."""
        # Create test part using service
        part_type = container.type_service().create_type("Error Test Type")
        part = container.part_service().create_part(
            description="Error test part",
            manufacturer_code="ERRO-001",
            type_id=part_type.id
        )
        session.commit()

        response = client.get(f'/api/parts/{part.key}/attachments')

        assert response.status_code == 500


class TestUrlPreviewAPI:
    """Integration tests for URL preview API endpoints."""

    @patch('app.services.url_thumbnail_service.URLThumbnailService.validate_url', return_value=True)
    @patch('app.services.url_thumbnail_service.URLThumbnailService.extract_metadata')
    def test_attachment_preview_success(self, mock_extract_metadata, mock_validate_url, client: FlaskClient):
        """Test successful URL preview metadata extraction."""
        from app.schemas.url_metadata import (
            ThumbnailSourceType,
            URLContentType,
            URLMetadataSchema,
        )
        mock_extract_metadata.return_value = URLMetadataSchema(
            title='Test Page Title',
            og_image='https://example.com/image.jpg',
            favicon='https://example.com/favicon.ico',
            thumbnail_source=ThumbnailSourceType.PREVIEW_IMAGE,
            original_url='https://example.com',
            content_type=URLContentType.WEBPAGE
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

        mock_validate_url.assert_called_once_with('https://example.com')
        mock_extract_metadata.assert_called_once_with('https://example.com')

    @patch('app.services.url_thumbnail_service.URLThumbnailService.validate_url', return_value=True)
    @patch('app.services.url_thumbnail_service.URLThumbnailService.extract_metadata')
    def test_attachment_preview_direct_image_title(self, mock_extract_metadata, mock_validate_url, client: FlaskClient):
        """Test URL preview with direct image URL extracts title from filename."""
        from app.schemas.url_metadata import (
            ThumbnailSourceType,
            URLContentType,
            URLMetadataSchema,
        )
        # Mock the metadata that would be returned for a direct image
        mock_extract_metadata.return_value = URLMetadataSchema(
            title='dht22-thermometer-temperature-and-humidity-sensor.jpg',
            page_title='dht22-thermometer-temperature-and-humidity-sensor.jpg',
            description=None,
            og_image='https://www.tinytronics.nl/image/catalog/products_2023/dht22-thermometer-temperature-and-humidity-sensor.jpg',
            favicon=None,
            thumbnail_source=ThumbnailSourceType.DIRECT_IMAGE,
            original_url='https://www.tinytronics.nl/image/catalog/products_2023/dht22-thermometer-temperature-and-humidity-sensor.jpg',
            content_type=URLContentType.IMAGE
        )

        response = client.post(
            '/api/parts/attachment-preview',
            json={'url': 'https://www.tinytronics.nl/image/catalog/products_2023/dht22-thermometer-temperature-and-humidity-sensor.jpg'}
        )

        assert response.status_code == 200
        data = response.get_json()
        assert data['title'] == 'dht22-thermometer-temperature-and-humidity-sensor.jpg'
        assert data['image_url'] is not None  # Should have an image URL since og_image exists
        assert data['original_url'] == 'https://www.tinytronics.nl/image/catalog/products_2023/dht22-thermometer-temperature-and-humidity-sensor.jpg'

        mock_validate_url.assert_called_once()
        mock_extract_metadata.assert_called_once()

    @patch('app.services.url_thumbnail_service.URLThumbnailService.validate_url', return_value=True)
    @patch('app.services.url_thumbnail_service.URLThumbnailService.extract_metadata')
    def test_attachment_preview_no_image(self, mock_extract_metadata, mock_validate_url, client: FlaskClient):
        """Test URL preview with no image available."""
        from app.schemas.url_metadata import (
            ThumbnailSourceType,
            URLContentType,
            URLMetadataSchema,
        )
        mock_extract_metadata.return_value = URLMetadataSchema(
            title='Test Page Title',
            og_image=None,
            favicon=None,
            thumbnail_source=ThumbnailSourceType.OTHER,
            original_url='https://example.com',
            content_type=URLContentType.WEBPAGE
        )

        response = client.post(
            '/api/parts/attachment-preview',
            json={'url': 'https://example.com'}
        )

        assert response.status_code == 200
        data = response.get_json()
        assert data['title'] == 'Test Page Title'
        assert data['image_url'] is None
        assert data['original_url'] == 'https://example.com'

    @patch('app.services.url_thumbnail_service.URLThumbnailService.validate_url', return_value=False)
    def test_attachment_preview_invalid_url(self, mock_validate_url, client: FlaskClient):
        """Test URL preview with invalid URL."""
        response = client.post(
            '/api/parts/attachment-preview',
            json={'url': 'invalid-url'}
        )

        assert response.status_code == 422
        data = response.get_json()
        assert data['error'] == 'Invalid URL'
        assert data['details']['message'] == 'The provided URL is not valid or cannot be accessed'

    @patch('app.services.url_thumbnail_service.URLThumbnailService.validate_url', return_value=True)
    @patch('app.services.url_thumbnail_service.URLThumbnailService.extract_metadata', side_effect=Exception("Extraction failed"))
    def test_attachment_preview_extraction_error(self, mock_extract_metadata, mock_validate_url, client: FlaskClient):
        """Test URL preview with extraction failure."""
        response = client.post(
            '/api/parts/attachment-preview',
            json={'url': 'https://example.com'}
        )

        assert response.status_code == 422
        data = response.get_json()
        assert data['error'] == 'Failed to extract URL preview'
        assert data['details']['message'] == 'Extraction failed'

    def test_attachment_preview_invalid_json(self, client: FlaskClient):
        """Test URL preview with invalid request data."""
        response = client.post(
            '/api/parts/attachment-preview',
            json={'invalid_field': 'test'}
        )

        assert response.status_code == 400

    @patch('app.services.url_thumbnail_service.URLThumbnailService.validate_url', return_value=True)
    @patch('app.services.url_thumbnail_service.URLThumbnailService.get_preview_image_url')
    @patch('app.services.url_thumbnail_service.URLThumbnailService._download_image')
    def test_attachment_preview_image_success(self, mock_download_image, mock_get_preview_image_url, mock_validate_url, client: FlaskClient):
        """Test successful preview image retrieval."""
        mock_get_preview_image_url.return_value = 'https://example.com/image.jpg'
        mock_download_image.return_value = (io.BytesIO(b"fake image data"), 'image/jpeg')

        response = client.get('/api/parts/attachment-preview/image?url=https%3A//example.com')

        assert response.status_code == 200
        assert response.content_type == 'image/jpeg'
        assert response.data == b"fake image data"

        mock_validate_url.assert_called_once_with('https://example.com')
        mock_get_preview_image_url.assert_called_once_with('https://example.com')
        mock_download_image.assert_called_once_with('https://example.com/image.jpg', 'https://example.com')

    def test_attachment_preview_image_no_url(self, client: FlaskClient):
        """Test preview image endpoint without URL parameter."""
        response = client.get('/api/parts/attachment-preview/image')

        assert response.status_code == 400
        data = response.get_json()
        assert 'URL parameter required' in data['error']

    @patch('app.services.url_thumbnail_service.URLThumbnailService.validate_url', return_value=False)
    def test_attachment_preview_image_invalid_url(self, mock_validate_url, client: FlaskClient):
        """Test preview image with invalid URL."""
        response = client.get('/api/parts/attachment-preview/image?url=invalid-url')

        assert response.status_code == 400
        data = response.get_json()
        assert 'Invalid URL' in data['error']

    @patch('app.services.url_thumbnail_service.URLThumbnailService.validate_url', return_value=True)
    @patch('app.services.url_thumbnail_service.URLThumbnailService.get_preview_image_url', side_effect=Exception("Image extraction failed"))
    def test_attachment_preview_image_extraction_error(self, mock_get_preview_image_url, mock_validate_url, client: FlaskClient):
        """Test preview image with extraction failure."""
        response = client.get('/api/parts/attachment-preview/image?url=https%3A//example.com')

        assert response.status_code == 404
        data = response.get_json()
        assert 'Failed to retrieve image' in data['error']

    @patch('app.services.url_thumbnail_service.URLThumbnailService.validate_url', return_value=True)
    @patch('app.services.url_thumbnail_service.URLThumbnailService.get_preview_image_url')
    @patch('app.services.url_thumbnail_service.URLThumbnailService._download_image')
    def test_attachment_preview_direct_image_url(self, mock_download_image, mock_get_preview_image_url, mock_validate_url, client: FlaskClient):
        """Test preview image with direct image URL."""
        # Simulate direct image URL - should return the URL itself
        mock_get_preview_image_url.return_value = 'https://example.com/image.jpg'
        mock_download_image.return_value = (io.BytesIO(b"direct image data"), 'image/jpeg')

        response = client.get('/api/parts/attachment-preview/image?url=https%3A//example.com/image.jpg')

        assert response.status_code == 200
        assert response.content_type == 'image/jpeg'
        assert response.data == b"direct image data"

        mock_validate_url.assert_called_once_with('https://example.com/image.jpg')
        mock_get_preview_image_url.assert_called_once_with('https://example.com/image.jpg')
        mock_download_image.assert_called_once_with('https://example.com/image.jpg', 'https://example.com/image.jpg')
