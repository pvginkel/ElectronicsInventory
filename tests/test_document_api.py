"""Integration tests for document API endpoints."""

import io
import json
from unittest.mock import patch

import pytest
from flask import Flask
from flask.testing import FlaskClient
from sqlalchemy.orm import Session

from app.models.part_attachment import AttachmentType, PartAttachment
from app.services.container import ServiceContainer
from tests.test_document_fixtures import sample_image_file, sample_pdf_file





class TestDocumentAPI:
    """Integration tests for document API endpoints."""

    @patch('app.services.document_service.magic.from_buffer')
    @patch('app.services.s3_service.S3Service.upload_file', return_value=True)
    @patch('app.services.s3_service.S3Service.generate_s3_key', return_value="parts/TEST/attachments/test.jpg")
    @patch('app.services.image_service.ImageService.process_uploaded_image')
    def test_create_file_attachment_success(self, mock_process_image, mock_generate_key, mock_upload, mock_magic, client: FlaskClient, app: Flask, container: ServiceContainer, session: Session, sample_image_file):
        """Test successful file attachment creation via API."""
        mock_magic.return_value = 'image/jpeg'
        mock_process_image.return_value = (
            io.BytesIO(b"processed"), {"width": 100, "height": 100, "format": "JPEG"}
        )
        
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

    @patch('app.services.url_thumbnail_service.URLThumbnailService.validate_url', return_value=True)
    @patch('app.services.url_thumbnail_service.URLThumbnailService.download_and_store_thumbnail', return_value=(
        "parts/123/thumbnails/thumb.jpg", "image/jpeg", 1024, {"width": 64, "height": 64}
    ))
    def test_create_url_attachment_success(self, mock_download, mock_validate, client: FlaskClient, app: Flask, container: ServiceContainer, session: Session):
        """Test successful URL attachment creation via API."""
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