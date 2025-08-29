"""Integration tests for document API endpoints."""

import io
import json
from unittest.mock import MagicMock, patch

import pytest
from flask import Flask
from sqlalchemy.orm import Session

from app.models.part import Part
from app.models.part_attachment import AttachmentType, PartAttachment
from app.models.type import Type
from tests.test_document_fixtures import sample_image_file, sample_part, sample_pdf_file


@pytest.fixture
def part_with_type(session: Session) -> Part:
    """Create a part with type for API testing."""
    part_type = Type(name="API Test Type")
    session.add(part_type)
    session.flush()
    
    part = Part(
        key="APIP",
        manufacturer_code="API-001",
        type_id=part_type.id,
        description="API test part"
    )
    session.add(part)
    session.flush()
    return part


@pytest.fixture
def mock_services():
    """Create mock services for API testing."""
    s3_service = MagicMock()
    s3_service.generate_s3_key.return_value = "parts/123/attachments/test.jpg"
    s3_service.upload_file.return_value = True
    s3_service.download_file.return_value = io.BytesIO(b"file content")
    
    image_service = MagicMock()
    image_service.process_uploaded_image.return_value = (
        io.BytesIO(b"processed"), {"width": 100, "height": 100, "format": "JPEG"}
    )
    image_service.get_pdf_icon_data.return_value = (b"<svg>pdf</svg>", "image/svg+xml")
    image_service.get_thumbnail_path.return_value = "/tmp/thumb.jpg"
    
    url_service = MagicMock()
    url_service.validate_url.return_value = True
    url_service.download_and_store_thumbnail.return_value = (
        "parts/123/thumbnails/thumb.jpg", "image/jpeg", 1024, {"width": 64, "height": 64}
    )
    
    return s3_service, image_service, url_service


class TestDocumentAPI:
    """Integration tests for document API endpoints."""

    def test_create_file_attachment_success(self, client, app: Flask, part_with_type, mock_services):
        """Test successful file attachment creation via API."""
        s3_service, image_service, url_service = mock_services
        
        with app.app_context():
            with patch('app.api.documents.current_app.config') as mock_config:
                mock_config.get.side_effect = lambda key, default=None: {
                    'ALLOWED_IMAGE_TYPES': ['image/jpeg', 'image/png'],
                    'ALLOWED_FILE_TYPES': ['application/pdf'],
                    'MAX_IMAGE_SIZE': 10 * 1024 * 1024
                }.get(key, default)
                
                with patch('magic.from_buffer') as mock_magic:
                    mock_magic.return_value = 'image/jpeg'
                    
                    # Mock the container to return our mocked services
                    with patch.object(app.container, 'document_service') as mock_service_factory:
                        from app.services.document_service import DocumentService
                        mock_document_service = DocumentService(
                            app.container.db_session(), s3_service, image_service, url_service
                        )
                        mock_service_factory.return_value = mock_document_service
                        
                        # Create test image data
                        from PIL import Image
                        img = Image.new('RGB', (100, 100), color='red')
                        img_bytes = io.BytesIO()
                        img.save(img_bytes, format='JPEG')
                        img_bytes.seek(0)
                        
                        response = client.post(
                            f'/api/documents/{part_with_type.key}/attachments',
                            data={
                                'title': 'Test Image',
                                'file': (img_bytes, 'test.jpg', 'image/jpeg')
                            },
                            content_type='multipart/form-data'
                        )
        
        assert response.status_code == 201
        data = response.get_json()
        assert data['title'] == 'Test Image'
        assert data['attachment_type'] == 'image'
        assert data['filename'] == 'test.jpg'

    def test_create_url_attachment_success(self, client, app: Flask, part_with_type, mock_services):
        """Test successful URL attachment creation via API."""
        s3_service, image_service, url_service = mock_services
        
        with app.app_context():
            with patch.object(app.container, 'document_service') as mock_service_factory:
                from app.services.document_service import DocumentService
                mock_document_service = DocumentService(
                    app.container.db_session(), s3_service, image_service, url_service
                )
                mock_service_factory.return_value = mock_document_service
                
                response = client.post(
                    f'/api/documents/{part_with_type.key}/attachments',
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

    def test_create_attachment_invalid_json(self, client, part_with_type):
        """Test attachment creation with invalid JSON."""
        response = client.post(
            f'/api/documents/{part_with_type.key}/attachments',
            json={
                'title': 'Missing URL or file'
                # Neither 'url' nor 'file' provided
            }
        )
        
        assert response.status_code == 400

    def test_create_attachment_part_not_found(self, client):
        """Test attachment creation for non-existent part."""
        response = client.post(
            '/api/documents/NONEXISTENT/attachments',
            json={
                'title': 'Test',
                'url': 'https://example.com'
            }
        )
        
        assert response.status_code == 404

    def test_list_part_attachments(self, client, part_with_type, session):
        """Test listing attachments for a part."""
        # Create test attachments
        attachment1 = PartAttachment(
            part_id=part_with_type.id,
            attachment_type=AttachmentType.IMAGE,
            title="Image 1",
            s3_key="test1.jpg",
            filename="test1.jpg",
            content_type="image/jpeg",
            file_size=1024
        )
        attachment2 = PartAttachment(
            part_id=part_with_type.id,
            attachment_type=AttachmentType.URL,
            title="URL 1",
            url="https://example.com"
        )
        session.add_all([attachment1, attachment2])
        session.flush()
        
        response = client.get(f'/api/documents/{part_with_type.key}/attachments')
        
        assert response.status_code == 200
        data = response.get_json()
        assert len(data) == 2
        
        titles = [item['title'] for item in data]
        assert 'Image 1' in titles
        assert 'URL 1' in titles

    def test_get_single_attachment(self, client, part_with_type, session):
        """Test getting single attachment details."""
        attachment = PartAttachment(
            part_id=part_with_type.id,
            attachment_type=AttachmentType.IMAGE,
            title="Test Attachment",
            s3_key="test.jpg",
            filename="test.jpg",
            content_type="image/jpeg",
            file_size=1024
        )
        session.add(attachment)
        session.flush()
        
        response = client.get(f'/api/documents/{part_with_type.key}/attachments/{attachment.id}')
        
        assert response.status_code == 200
        data = response.get_json()
        assert data['title'] == 'Test Attachment'
        assert data['filename'] == 'test.jpg'

    def test_update_attachment(self, client, part_with_type, session):
        """Test updating attachment metadata."""
        attachment = PartAttachment(
            part_id=part_with_type.id,
            attachment_type=AttachmentType.IMAGE,
            title="Original Title",
            s3_key="test.jpg"
        )
        session.add(attachment)
        session.flush()
        
        response = client.put(
            f'/api/documents/{part_with_type.key}/attachments/{attachment.id}',
            json={'title': 'Updated Title'}
        )
        
        assert response.status_code == 200
        data = response.get_json()
        assert data['title'] == 'Updated Title'

    def test_delete_attachment(self, client, app: Flask, part_with_type, session, mock_services):
        """Test deleting attachment."""
        s3_service, image_service, url_service = mock_services
        
        attachment = PartAttachment(
            part_id=part_with_type.id,
            attachment_type=AttachmentType.IMAGE,
            title="To Delete",
            s3_key="test.jpg"
        )
        session.add(attachment)
        session.flush()
        attachment_id = attachment.id
        
        with app.app_context():
            with patch.object(app.container, 'document_service') as mock_service_factory:
                from app.services.document_service import DocumentService
                mock_document_service = DocumentService(
                    app.container.db_session(), s3_service, image_service, url_service
                )
                mock_service_factory.return_value = mock_document_service
                
                response = client.delete(f'/api/documents/{part_with_type.key}/attachments/{attachment_id}')
        
        assert response.status_code == 204

    def test_download_attachment(self, client, app: Flask, part_with_type, session, mock_services):
        """Test downloading attachment file."""
        s3_service, image_service, url_service = mock_services
        
        attachment = PartAttachment(
            part_id=part_with_type.id,
            attachment_type=AttachmentType.PDF,
            title="Test PDF",
            s3_key="test.pdf",
            filename="datasheet.pdf",
            content_type="application/pdf"
        )
        session.add(attachment)
        session.flush()
        
        with app.app_context():
            with patch.object(app.container, 'document_service') as mock_service_factory:
                from app.services.document_service import DocumentService
                mock_document_service = DocumentService(
                    app.container.db_session(), s3_service, image_service, url_service
                )
                mock_service_factory.return_value = mock_document_service
                
                response = client.get(f'/api/documents/{part_with_type.key}/attachments/{attachment.id}/download')
        
        assert response.status_code == 200
        assert response.content_type == 'application/pdf'

    def test_get_attachment_thumbnail(self, client, app: Flask, part_with_type, session, mock_services):
        """Test getting attachment thumbnail."""
        s3_service, image_service, url_service = mock_services
        
        attachment = PartAttachment(
            part_id=part_with_type.id,
            attachment_type=AttachmentType.IMAGE,
            title="Test Image",
            s3_key="test.jpg"
        )
        session.add(attachment)
        session.flush()
        
        with app.app_context():
            with patch.object(app.container, 'document_service') as mock_service_factory:
                from app.services.document_service import DocumentService
                mock_document_service = DocumentService(
                    app.container.db_session(), s3_service, image_service, url_service
                )
                mock_service_factory.return_value = mock_document_service
                
                # Mock file read for thumbnail
                with patch('builtins.open', create=True) as mock_open:
                    mock_open.return_value.__enter__.return_value.read.return_value = b"thumbnail data"
                    
                    response = client.get(f'/api/documents/{part_with_type.key}/attachments/{attachment.id}/thumbnail')
        
        assert response.status_code == 200
        assert response.content_type == 'image/jpeg'

    def test_set_part_cover_attachment(self, client, part_with_type, session):
        """Test setting part cover attachment."""
        attachment = PartAttachment(
            part_id=part_with_type.id,
            attachment_type=AttachmentType.IMAGE,
            title="Cover Image",
            s3_key="cover.jpg"
        )
        session.add(attachment)
        session.flush()
        
        response = client.put(
            f'/api/documents/{part_with_type.key}/cover',
            json={'attachment_id': attachment.id}
        )
        
        assert response.status_code == 200
        data = response.get_json()
        assert data['attachment_id'] == attachment.id

    def test_get_part_cover_attachment(self, client, part_with_type, session):
        """Test getting part cover attachment."""
        attachment = PartAttachment(
            part_id=part_with_type.id,
            attachment_type=AttachmentType.IMAGE,
            title="Cover Image",
            s3_key="cover.jpg"
        )
        session.add(attachment)
        session.flush()
        part_with_type.cover_attachment_id = attachment.id
        session.flush()
        
        response = client.get(f'/api/documents/{part_with_type.key}/cover')
        
        assert response.status_code == 200
        data = response.get_json()
        assert data['attachment_id'] == attachment.id
        assert data['attachment']['title'] == 'Cover Image'

    def test_clear_part_cover_attachment(self, client, part_with_type, session):
        """Test clearing part cover attachment."""
        attachment = PartAttachment(
            part_id=part_with_type.id,
            attachment_type=AttachmentType.IMAGE,
            title="Cover Image",
            s3_key="cover.jpg"
        )
        session.add(attachment)
        session.flush()
        part_with_type.cover_attachment_id = attachment.id
        session.flush()
        
        response = client.delete(f'/api/documents/{part_with_type.key}/cover')
        
        assert response.status_code == 200
        data = response.get_json()
        assert data['attachment_id'] is None

    def test_create_attachment_validation_errors(self, client, part_with_type):
        """Test various validation errors in attachment creation."""
        # Missing title
        response = client.post(
            f'/api/documents/{part_with_type.key}/attachments',
            json={'url': 'https://example.com'}
        )
        assert response.status_code == 422
        
        # Title too long
        response = client.post(
            f'/api/documents/{part_with_type.key}/attachments',
            json={
                'title': 'x' * 300,  # Exceeds 255 character limit
                'url': 'https://example.com'
            }
        )
        assert response.status_code == 422
        
        # Invalid URL format
        response = client.post(
            f'/api/documents/{part_with_type.key}/attachments',
            json={
                'title': 'Invalid URL',
                'url': 'x' * 2100  # Exceeds 2000 character limit
            }
        )
        assert response.status_code == 422

    def test_attachment_not_found_errors(self, client, part_with_type):
        """Test 404 errors for non-existent attachments."""
        # Get non-existent attachment
        response = client.get(f'/api/documents/{part_with_type.key}/attachments/99999')
        assert response.status_code == 404
        
        # Update non-existent attachment
        response = client.put(
            f'/api/documents/{part_with_type.key}/attachments/99999',
            json={'title': 'New Title'}
        )
        assert response.status_code == 404
        
        # Delete non-existent attachment
        response = client.delete(f'/api/documents/{part_with_type.key}/attachments/99999')
        assert response.status_code == 404

    def test_thumbnail_size_parameter(self, client, app: Flask, part_with_type, session, mock_services):
        """Test thumbnail endpoint with custom size parameter."""
        s3_service, image_service, url_service = mock_services
        
        attachment = PartAttachment(
            part_id=part_with_type.id,
            attachment_type=AttachmentType.IMAGE,
            title="Test Image",
            s3_key="test.jpg"
        )
        session.add(attachment)
        session.flush()
        
        with app.app_context():
            with patch.object(app.container, 'document_service') as mock_service_factory:
                from app.services.document_service import DocumentService
                mock_document_service = DocumentService(
                    app.container.db_session(), s3_service, image_service, url_service
                )
                mock_service_factory.return_value = mock_document_service
                
                with patch('builtins.open', create=True) as mock_open:
                    mock_open.return_value.__enter__.return_value.read.return_value = b"thumbnail data"
                    
                    response = client.get(
                        f'/api/documents/{part_with_type.key}/attachments/{attachment.id}/thumbnail?size=300'
                    )
        
        assert response.status_code == 200
        # Verify the service was called with the custom size
        image_service.get_thumbnail_path.assert_called_with(attachment.id, 'test.jpg', 300)

    def test_error_handling_in_endpoints(self, client, app: Flask, part_with_type):
        """Test error handling in API endpoints."""
        with app.app_context():
            with patch.object(app.container, 'document_service') as mock_service_factory:
                # Mock service to raise an exception
                mock_document_service = MagicMock()
                mock_document_service.get_part_attachments.side_effect = Exception("Database error")
                mock_service_factory.return_value = mock_document_service
                
                response = client.get(f'/api/documents/{part_with_type.key}/attachments')
        
        assert response.status_code == 500