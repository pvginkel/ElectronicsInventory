"""Integration tests for document API endpoints."""

import io
import logging
from unittest.mock import patch

from flask import Flask
from flask.testing import FlaskClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.part import Part
from app.models.part_attachment import AttachmentType, PartAttachment
from app.services.container import ServiceContainer
from app.exceptions import InvalidOperationException


class TestDocumentAPI:
    """Integration tests for document API endpoints."""

    @patch('app.services.document_service.magic.from_buffer')
    @patch('app.services.s3_service.S3Service.upload_file', return_value=True)
    @patch('app.services.s3_service.S3Service.generate_s3_key', return_value="parts/TEST/attachments/test.jpg")
    def test_create_file_attachment_success(self, _mock_generate_key, _mock_upload, mock_magic, client: FlaskClient, app: Flask, container: ServiceContainer, session: Session, sample_image_file):
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

    @patch('app.services.document_service.magic.from_buffer')
    @patch('app.services.s3_service.S3Service.upload_file')
    @patch('app.services.s3_service.S3Service.generate_s3_key', return_value="parts/TEST/attachments/fail.jpg")
    def test_create_file_attachment_s3_failure_rolls_back(
        self,
        _mock_generate_key,
        mock_upload,
        mock_magic,
        client: FlaskClient,
        app: Flask,
        container: ServiceContainer,
        session: Session,
        sample_image_file,
    ):
        """S3 failures should trigger a rollback and leave the database unchanged."""
        mock_magic.return_value = 'image/jpeg'
        mock_upload.side_effect = InvalidOperationException("upload file", "S3 failure")

        with app.app_context():
            part_type = container.type_service().create_type("S3 Failure Type")
            part = container.part_service().create_part(
                description="S3 failure part",
                manufacturer_code="FAIL-001",
                type_id=part_type.id
            )
            session.commit()
            part_id = part.id

            sample_image_file.seek(0)
            response = client.post(
                f'/api/parts/{part.key}/attachments',
                data={
                    'title': 'Failure Image',
                    'file': (sample_image_file, 'fail.jpg', 'image/jpeg')
                },
                content_type='multipart/form-data'
            )

        assert response.status_code == 409
        error = response.get_json()
        assert error['error'] == 'Cannot upload file because S3 failure'

        session.expire_all()
        remaining = session.scalars(
            select(PartAttachment).where(PartAttachment.part_id == part_id)
        ).all()
        assert remaining == []

        refreshed_part = session.get(Part, part_id)
        assert refreshed_part.cover_attachment_id is None
        mock_upload.assert_called_once()

    @patch('app.services.document_service.DocumentService.process_upload_url')
    def test_create_url_attachment_success(self, mock_process_url, client: FlaskClient, app: Flask, container: ServiceContainer, session: Session):
        """Test successful URL attachment creation via API."""
        # Mock the process_upload_url response
        from app.models.part_attachment import AttachmentType
        from app.schemas.upload_document import (
            DocumentContentSchema,
            UploadDocumentSchema,
        )

        mock_process_url.return_value = UploadDocumentSchema(
            title="Product Page",
            content=DocumentContentSchema(
                content=b"<html>fake content</html>",
                content_type="text/html"
            ),
            detected_type=AttachmentType.URL,
            preview_image=DocumentContentSchema(
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
    def test_delete_attachment(self, _mock_delete, client: FlaskClient, container: ServiceContainer, session: Session):
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

    @patch('app.services.s3_service.S3Service.delete_file')
    def test_delete_attachment_s3_failure_logs(self, mock_delete, client: FlaskClient, container: ServiceContainer, session: Session, caplog):
        """Deleting an attachment should log S3 failures but keep the database consistent."""
        caplog.set_level(logging.WARNING, logger='app.services.document_service')
        mock_delete.side_effect = InvalidOperationException("delete file", "S3 missing")

        part_type = container.type_service().create_type("Delete Failure Type")
        part = container.part_service().create_part(
            description="Delete failure part",
            manufacturer_code="DFLT-001",
            type_id=part_type.id
        )
        session.commit()

        attachment = PartAttachment(
            part_id=part.id,
            attachment_type=AttachmentType.IMAGE,
            title="To Delete",
            s3_key="missing.jpg"
        )
        session.add(attachment)
        session.commit()

        response = client.delete(f'/api/parts/{part.key}/attachments/{attachment.id}')

        assert response.status_code == 204

        session.expire_all()
        remaining = session.scalars(
            select(PartAttachment).where(PartAttachment.part_id == part.id)
        ).all()
        assert remaining == []

        assert any("S3 deletion failed" in record.message for record in caplog.records)

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
            s3_key="test.jpg",
            content_type="image/jpeg"
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

        # Capture part key before API calls (rollback will detach the object)
        part_key = part.key

        # Get non-existent attachment
        response = client.get(f'/api/parts/{part_key}/attachments/99999')
        assert response.status_code == 404

        # Update non-existent attachment
        response = client.put(
            f'/api/parts/{part_key}/attachments/99999',
            json={'title': 'New Title'}
        )
        assert response.status_code == 404

        # Delete non-existent attachment
        response = client.delete(f'/api/parts/{part_key}/attachments/99999')
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
            s3_key="test.jpg",
            content_type="image/jpeg"
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

    # Copy Attachment API Tests

    def test_copy_attachment_success(self, client: FlaskClient, app: Flask, container: ServiceContainer, session: Session):
        """Test successful attachment copying via API."""
        with app.app_context():
            # Create test parts using service
            part_type = container.type_service().create_type("Copy Test Type")

            # Create source part with attachment
            source_part = container.part_service().create_part(
                description="Source part",
                manufacturer_code="SRC-001",
                type_id=part_type.id
            )

            # Create target part
            target_part = container.part_service().create_part(
                description="Target part",
                manufacturer_code="TGT-001",
                type_id=part_type.id
            )

            # Create attachment on source part
            source_attachment = PartAttachment(
                part_id=source_part.id,
                attachment_type=AttachmentType.IMAGE,
                title="Test Image",
                s3_key="parts/123/attachments/test.jpg",
                filename="test.jpg",
                content_type="image/jpeg",
                file_size=1024
            )
            session.add(source_attachment)
            session.commit()

            # Mock S3 operations
            with patch('app.services.s3_service.S3Service.copy_file', return_value=True) as mock_copy, \
                 patch('app.services.s3_service.S3Service.generate_s3_key', return_value="parts/456/attachments/uuid.jpg"):

                response = client.post('/api/parts/copy-attachment',
                    json={
                        'attachment_id': source_attachment.id,
                        'target_part_key': target_part.key,
                        'set_as_cover': False
                    })

        assert response.status_code == 200
        data = response.get_json()

        # Verify response structure
        assert 'attachment' in data
        attachment_data = data['attachment']
        assert attachment_data['title'] == 'Test Image'
        assert attachment_data['attachment_type'] == 'image'
        assert attachment_data['filename'] == 'test.jpg'
        assert attachment_data['content_type'] == 'image/jpeg'
        assert attachment_data['file_size'] == 1024

        # Verify S3 copy was called
        mock_copy.assert_called_once()

    def test_copy_attachment_with_set_as_cover(self, client: FlaskClient, app: Flask, container: ServiceContainer, session: Session):
        """Test copying attachment and setting as cover via API."""
        with app.app_context():
            # Create test parts
            part_type = container.type_service().create_type("Cover Test Type")

            source_part = container.part_service().create_part(
                description="Source part",
                manufacturer_code="SRC-002",
                type_id=part_type.id
            )

            target_part = container.part_service().create_part(
                description="Target part",
                manufacturer_code="TGT-002",
                type_id=part_type.id
            )

            # Create attachment
            source_attachment = PartAttachment(
                part_id=source_part.id,
                attachment_type=AttachmentType.IMAGE,
                title="Cover Image",
                s3_key="parts/123/attachments/cover.jpg",
                filename="cover.jpg",
                content_type="image/jpeg",
                file_size=512
            )
            session.add(source_attachment)
            session.commit()

            # Mock S3 operations
            with patch('app.services.s3_service.S3Service.copy_file', return_value=True), \
                 patch('app.services.s3_service.S3Service.generate_s3_key', return_value="parts/456/attachments/uuid.jpg"):

                response = client.post('/api/parts/copy-attachment',
                    json={
                        'attachment_id': source_attachment.id,
                        'target_part_key': target_part.key,
                        'set_as_cover': True
                    })

        assert response.status_code == 200

        # Verify target part now has cover attachment set by re-querying it from DB
        from sqlalchemy import select
        updated_target_part = session.scalar(select(Part).where(Part.key == target_part.key))
        assert updated_target_part.cover_attachment_id is not None

    def test_copy_attachment_url_type(self, client: FlaskClient, app: Flask, container: ServiceContainer, session: Session):
        """Test copying URL attachment via API."""
        with app.app_context():
            # Create test parts
            part_type = container.type_service().create_type("URL Test Type")

            source_part = container.part_service().create_part(
                description="Source part",
                manufacturer_code="SRC-003",
                type_id=part_type.id
            )

            target_part = container.part_service().create_part(
                description="Target part",
                manufacturer_code="TGT-003",
                type_id=part_type.id
            )

            # Create URL attachment (no S3 content)
            source_attachment = PartAttachment(
                part_id=source_part.id,
                attachment_type=AttachmentType.URL,
                title="Product Page",
                url="https://example.com/product",
                s3_key=None,
                filename=None,
                content_type=None,
                file_size=None
            )
            session.add(source_attachment)
            session.commit()

            response = client.post('/api/parts/copy-attachment',
                json={
                    'attachment_id': source_attachment.id,
                    'target_part_key': target_part.key
                })

        assert response.status_code == 200
        data = response.get_json()

        attachment_data = data['attachment']
        assert attachment_data['attachment_type'] == 'url'
        assert attachment_data['title'] == 'Product Page'
        assert attachment_data['url'] == 'https://example.com/product'
        assert attachment_data['s3_key'] is None

    def test_copy_attachment_source_not_found(self, client: FlaskClient, app: Flask, container: ServiceContainer, session: Session):
        """Test copying non-existent attachment via API."""
        with app.app_context():
            # Create target part
            part_type = container.type_service().create_type("Not Found Test Type")
            target_part = container.part_service().create_part(
                description="Target part",
                manufacturer_code="TGT-404",
                type_id=part_type.id
            )
            session.commit()

            response = client.post('/api/parts/copy-attachment',
                json={
                    'attachment_id': 99999,
                    'target_part_key': target_part.key
                })

        assert response.status_code == 404
        data = response.get_json()
        assert 'error' in data

    def test_copy_attachment_target_not_found(self, client: FlaskClient, app: Flask, container: ServiceContainer, session: Session):
        """Test copying attachment to non-existent target part via API."""
        with app.app_context():
            # Create source part with attachment
            part_type = container.type_service().create_type("Target Not Found Test Type")
            source_part = container.part_service().create_part(
                description="Source part",
                manufacturer_code="SRC-404",
                type_id=part_type.id
            )

            source_attachment = PartAttachment(
                part_id=source_part.id,
                attachment_type=AttachmentType.IMAGE,
                title="Test Image",
                s3_key="parts/123/attachments/test.jpg",
                filename="test.jpg",
                content_type="image/jpeg",
                file_size=1024
            )
            session.add(source_attachment)
            session.commit()

            response = client.post('/api/parts/copy-attachment',
                json={
                    'attachment_id': source_attachment.id,
                    'target_part_key': 'NONEXIST'
                })

        assert response.status_code == 404
        data = response.get_json()
        assert 'error' in data

    def test_copy_attachment_validation_errors(self, client: FlaskClient):
        """Test API validation errors for copy attachment."""
        # Missing required fields
        response = client.post('/api/parts/copy-attachment',
            json={
                'attachment_id': 123
                # Missing target_part_key
            })
        assert response.status_code == 400

        # Invalid attachment_id type
        response = client.post('/api/parts/copy-attachment',
            json={
                'attachment_id': 'invalid',
                'target_part_key': 'TEST'
            })
        assert response.status_code == 400

        # Invalid set_as_cover type
        response = client.post('/api/parts/copy-attachment',
            json={
                'attachment_id': 123,
                'target_part_key': 'TEST',
                'set_as_cover': 'invalid'
            })
        assert response.status_code == 400

    def test_copy_attachment_s3_copy_failure(self, client: FlaskClient, app: Flask, container: ServiceContainer, session: Session):
        """Test handling S3 copy failure via API."""
        with app.app_context():
            # Create test parts and attachment
            part_type = container.type_service().create_type("S3 Failure Test Type")

            source_part = container.part_service().create_part(
                description="Source part",
                manufacturer_code="SRC-S3F",
                type_id=part_type.id
            )

            target_part = container.part_service().create_part(
                description="Target part",
                manufacturer_code="TGT-S3F",
                type_id=part_type.id
            )

            source_attachment = PartAttachment(
                part_id=source_part.id,
                attachment_type=AttachmentType.IMAGE,
                title="Test Image",
                s3_key="parts/123/attachments/test.jpg",
                filename="test.jpg",
                content_type="image/jpeg",
                file_size=1024
            )
            session.add(source_attachment)
            session.commit()

            # Mock S3 copy failure
            from app.exceptions import InvalidOperationException
            with patch('app.services.s3_service.S3Service.copy_file', side_effect=InvalidOperationException("copy file in S3", "source file not found")), \
                 patch('app.services.s3_service.S3Service.generate_s3_key', return_value="parts/456/attachments/uuid.jpg"):

                response = client.post('/api/parts/copy-attachment',
                    json={
                        'attachment_id': source_attachment.id,
                        'target_part_key': target_part.key
                    })

        assert response.status_code == 409  # InvalidOperationException maps to 409
        data = response.get_json()
        assert 'error' in data


class TestUrlPreviewAPI:
    """Integration tests for URL preview API endpoints."""

    @patch('app.services.document_service.DocumentService.process_upload_url')
    def test_attachment_preview_success(self, mock_process_url, client: FlaskClient):
        """Test successful URL preview metadata extraction."""
        from app.models.part_attachment import AttachmentType
        from app.schemas.upload_document import (
            DocumentContentSchema,
            UploadDocumentSchema,
        )

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
        from app.models.part_attachment import AttachmentType
        from app.schemas.upload_document import (
            DocumentContentSchema,
            UploadDocumentSchema,
        )

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
        from app.models.part_attachment import AttachmentType
        from app.schemas.upload_document import (
            DocumentContentSchema,
            UploadDocumentSchema,
        )

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
        from app.schemas.upload_document import DocumentContentSchema

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
        from app.schemas.upload_document import DocumentContentSchema

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
