"""Unit tests for DocumentService."""

import io
from unittest.mock import MagicMock, patch

import pytest
from flask import Flask
from sqlalchemy.orm import Session

from app.exceptions import InvalidOperationException, RecordNotFoundException
from app.models.part import Part
from app.models.part_attachment import AttachmentType, PartAttachment
from app.models.type import Type
from app.services.document_service import DocumentService


@pytest.fixture
def mock_s3_service():
    """Create mock S3Service."""
    mock = MagicMock()
    mock.generate_s3_key.return_value = "parts/123/attachments/test.jpg"
    mock.upload_file.return_value = True
    mock.download_file.return_value = io.BytesIO(b"file content")
    return mock


@pytest.fixture
def mock_image_service():
    """Create mock ImageService."""
    mock = MagicMock()
    mock.process_uploaded_image.return_value = (
        io.BytesIO(b"processed image"),
        {"width": 100, "height": 100, "format": "JPEG"}
    )
    mock.get_pdf_icon_data.return_value = (b"<svg>pdf icon</svg>", "image/svg+xml")
    mock.get_thumbnail_path.return_value = "/tmp/thumbnail.jpg"
    return mock


@pytest.fixture
def mock_url_service():
    """Create mock URLThumbnailService."""
    mock = MagicMock()
    mock.validate_url.return_value = True
    mock.download_and_store_thumbnail.return_value = (
        "parts/123/thumbnails/thumb.jpg", "image/jpeg", 1024, {"width": 64, "height": 64}
    )
    return mock


@pytest.fixture
def document_service(app: Flask, session: Session, mock_s3_service, mock_image_service, mock_url_service):
    """Create DocumentService with mocked dependencies."""
    with app.app_context():
        return DocumentService(session, mock_s3_service, mock_image_service, mock_url_service)


class TestDocumentService:
    """Test DocumentService functionality."""

    def test_create_file_attachment_image_success(self, document_service, session, sample_part, sample_image_file):
        """Test successful image attachment creation."""
        with patch('flask.current_app.config') as mock_config:
            mock_config.get.side_effect = lambda key, default=None: {
                'ALLOWED_IMAGE_TYPES': ['image/jpeg', 'image/png'],
                'ALLOWED_FILE_TYPES': ['application/pdf'],
                'MAX_IMAGE_SIZE': 10 * 1024 * 1024
            }.get(key, default)

            with patch('magic.from_buffer') as mock_magic:
                mock_magic.return_value = 'image/jpeg'

                attachment = document_service.create_file_attachment(
                    part_key=sample_part.key,
                    title="Test Image",
                    file_data=sample_image_file,
                    filename="test.jpg",
                    content_type="image/jpeg"
                )

        assert attachment.part_id == sample_part.id
        assert attachment.attachment_type == AttachmentType.IMAGE
        assert attachment.title == "Test Image"
        assert attachment.filename == "test.jpg"
        assert attachment.content_type == "image/jpeg"
        assert attachment.s3_key == "parts/123/attachments/test.jpg"
        assert attachment.attachment_metadata is not None

    def test_create_file_attachment_pdf_success(self, document_service, session, sample_part, sample_pdf_file):
        """Test successful PDF attachment creation."""
        with patch('flask.current_app.config') as mock_config:
            mock_config.get.side_effect = lambda key, default=None: {
                'ALLOWED_IMAGE_TYPES': ['image/jpeg', 'image/png'],
                'ALLOWED_FILE_TYPES': ['application/pdf'],
                'MAX_FILE_SIZE': 100 * 1024 * 1024
            }.get(key, default)

            with patch('magic.from_buffer') as mock_magic:
                mock_magic.return_value = 'application/pdf'

                attachment = document_service.create_file_attachment(
                    part_key=sample_part.key,
                    title="Test PDF",
                    file_data=sample_pdf_file,
                    filename="datasheet.pdf",
                    content_type="application/pdf"
                )

        assert attachment.attachment_type == AttachmentType.PDF
        assert attachment.title == "Test PDF"
        assert attachment.filename == "datasheet.pdf"
        assert attachment.content_type == "application/pdf"

    def test_create_file_attachment_part_not_found(self, document_service, session, sample_image_file):
        """Test file attachment creation with non-existent part."""
        with pytest.raises(RecordNotFoundException) as exc_info:
            document_service.create_file_attachment(
                part_key="NONEXISTENT",
                title="Test",
                file_data=sample_image_file,
                filename="test.jpg",
                content_type="image/jpeg"
            )

        assert "Part" in str(exc_info.value)
        assert "NONEXISTENT" in str(exc_info.value)

    def test_create_file_attachment_invalid_file_type(self, document_service, session, sample_part):
        """Test file attachment creation with invalid file type."""
        with patch('flask.current_app.config') as mock_config:
            mock_config.get.side_effect = lambda key, default=None: {
                'ALLOWED_IMAGE_TYPES': ['image/jpeg', 'image/png'],
                'ALLOWED_FILE_TYPES': ['application/pdf']
            }.get(key, default)

            with patch('magic.from_buffer') as mock_magic:
                mock_magic.return_value = 'application/zip'

                invalid_file = io.BytesIO(b"fake zip content")

                with pytest.raises(InvalidOperationException) as exc_info:
                    document_service.create_file_attachment(
                        part_key=sample_part.key,
                        title="Invalid File",
                        file_data=invalid_file,
                        filename="test.zip",
                        content_type="application/zip"
                    )

        assert "validate file type" in str(exc_info.value)
        assert "not allowed" in str(exc_info.value)

    def test_create_file_attachment_file_too_large(self, document_service, session, sample_part):
        """Test file attachment creation with file too large."""
        with patch('flask.current_app.config') as mock_config:
            mock_config.get.side_effect = lambda key, default=None: {
                'ALLOWED_IMAGE_TYPES': ['image/jpeg'],
                'ALLOWED_FILE_TYPES': ['application/pdf'],
                'MAX_IMAGE_SIZE': 100  # Very small limit
            }.get(key, default)

            with patch('magic.from_buffer') as mock_magic:
                mock_magic.return_value = 'image/jpeg'

                large_file = io.BytesIO(b"x" * 1000)  # Exceeds 100 byte limit

                with pytest.raises(InvalidOperationException) as exc_info:
                    document_service.create_file_attachment(
                        part_key=sample_part.key,
                        title="Large File",
                        file_data=large_file,
                        filename="large.jpg",
                        content_type="image/jpeg"
                    )

        assert "validate file size" in str(exc_info.value)
        assert "too large" in str(exc_info.value)

    def test_create_url_attachment_success(self, document_service, session, sample_part):
        """Test successful URL attachment creation."""
        attachment = document_service.create_url_attachment(
            part_key=sample_part.key,
            title="Product Page",
            url="https://example.com/product"
        )

        assert attachment.part_id == sample_part.id
        assert attachment.attachment_type == AttachmentType.URL
        assert attachment.title == "Product Page"
        assert attachment.url == "https://example.com/product"
        assert attachment.s3_key == "parts/123/thumbnails/thumb.jpg"

    def test_create_url_attachment_invalid_url(self, document_service, session, sample_part, mock_url_service):
        """Test URL attachment creation with invalid URL."""
        mock_url_service.validate_url.return_value = False

        with pytest.raises(InvalidOperationException) as exc_info:
            document_service.create_url_attachment(
                part_key=sample_part.key,
                title="Invalid URL",
                url="invalid-url"
            )

        assert "create URL attachment" in str(exc_info.value)
        assert "invalid or inaccessible" in str(exc_info.value)

    def test_create_url_attachment_processing_failure(self, document_service, session, sample_part, mock_url_service):
        """Test URL attachment creation with processing failure."""
        mock_url_service.download_and_store_thumbnail.side_effect = Exception("Processing failed")

        with pytest.raises(InvalidOperationException) as exc_info:
            document_service.create_url_attachment(
                part_key=sample_part.key,
                title="Processing Error",
                url="https://example.com"
            )

        assert "create URL attachment" in str(exc_info.value)
        assert "failed to process URL" in str(exc_info.value)

    def test_get_attachment_success(self, document_service, session, sample_part):
        """Test successful attachment retrieval."""
        # Create an attachment first
        attachment = PartAttachment(
            part_id=sample_part.id,
            attachment_type=AttachmentType.IMAGE,
            title="Test Attachment",
            s3_key="test/key.jpg",
            filename="test.jpg",
            content_type="image/jpeg",
            file_size=1024
        )
        session.add(attachment)
        session.flush()

        retrieved = document_service.get_attachment(attachment.id)

        assert retrieved.id == attachment.id
        assert retrieved.title == "Test Attachment"

    def test_get_attachment_not_found(self, document_service, session):
        """Test attachment retrieval with non-existent ID."""
        with pytest.raises(RecordNotFoundException) as exc_info:
            document_service.get_attachment(99999)

        assert "Attachment" in str(exc_info.value)

    def test_get_part_attachments_success(self, document_service, session, sample_part):
        """Test retrieving all attachments for a part."""
        # Create multiple attachments
        attachment1 = PartAttachment(
            part_id=sample_part.id,
            attachment_type=AttachmentType.IMAGE,
            title="Image 1",
            s3_key="test1.jpg"
        )
        attachment2 = PartAttachment(
            part_id=sample_part.id,
            attachment_type=AttachmentType.PDF,
            title="PDF 1",
            s3_key="test1.pdf"
        )
        session.add_all([attachment1, attachment2])
        session.flush()

        attachments = document_service.get_part_attachments(sample_part.key)

        assert len(attachments) == 2
        titles = [att.title for att in attachments]
        assert "Image 1" in titles
        assert "PDF 1" in titles

    def test_get_part_attachments_part_not_found(self, document_service, session):
        """Test retrieving attachments for non-existent part."""
        with pytest.raises(RecordNotFoundException) as exc_info:
            document_service.get_part_attachments("NONEXISTENT")

        assert "Part" in str(exc_info.value)

    def test_update_attachment_success(self, document_service, session, sample_part):
        """Test successful attachment update."""
        attachment = PartAttachment(
            part_id=sample_part.id,
            attachment_type=AttachmentType.IMAGE,
            title="Original Title",
            s3_key="test.jpg"
        )
        session.add(attachment)
        session.flush()

        updated = document_service.update_attachment(attachment.id, title="Updated Title")

        assert updated.title == "Updated Title"

    def test_update_attachment_no_changes(self, document_service, session, sample_part):
        """Test attachment update with no changes."""
        attachment = PartAttachment(
            part_id=sample_part.id,
            attachment_type=AttachmentType.IMAGE,
            title="Original Title",
            s3_key="test.jpg"
        )
        session.add(attachment)
        session.flush()

        updated = document_service.update_attachment(attachment.id)

        assert updated.title == "Original Title"  # No change

    def test_delete_attachment_success(self, document_service, session, sample_part, mock_s3_service, mock_image_service):
        """Test successful attachment deletion."""
        attachment = PartAttachment(
            part_id=sample_part.id,
            attachment_type=AttachmentType.IMAGE,
            title="To Delete",
            s3_key="test.jpg"
        )
        session.add(attachment)
        session.flush()
        attachment_id = attachment.id

        document_service.delete_attachment(attachment_id)

        # Verify attachment is deleted from database
        with pytest.raises(RecordNotFoundException):
            document_service.get_attachment(attachment_id)

        # Verify S3 cleanup was called
        mock_s3_service.delete_file.assert_called_once_with("test.jpg")
        # Verify image cleanup was called
        mock_image_service.cleanup_thumbnails.assert_called_once_with(attachment_id)

    def test_delete_attachment_s3_cleanup_fails(self, document_service, session, sample_part, mock_s3_service):
        """Test attachment deletion when S3 cleanup fails."""
        mock_s3_service.delete_file.side_effect = InvalidOperationException("delete", "S3 error")

        attachment = PartAttachment(
            part_id=sample_part.id,
            attachment_type=AttachmentType.PDF,
            title="To Delete",
            s3_key="test.pdf"
        )
        session.add(attachment)
        session.flush()
        attachment_id = attachment.id

        # Should not raise exception - continues with database deletion
        document_service.delete_attachment(attachment_id)

        # Verify attachment is still deleted from database
        with pytest.raises(RecordNotFoundException):
            document_service.get_attachment(attachment_id)

    def test_get_attachment_file_data_pdf_with_file(self, document_service, session, sample_part):
        """Test getting file data for PDF with stored file."""
        attachment = PartAttachment(
            part_id=sample_part.id,
            attachment_type=AttachmentType.PDF,
            title="PDF with file",
            s3_key="test.pdf",
            filename="datasheet.pdf",
            content_type="application/pdf"
        )
        session.add(attachment)
        session.flush()

        file_data, content_type, filename = document_service.get_attachment_file_data(attachment.id)

        assert isinstance(file_data, io.BytesIO)
        assert content_type == "application/pdf"
        assert filename == "datasheet.pdf"

    def test_get_attachment_file_data_pdf_without_file(self, document_service, session, sample_part):
        """Test getting file data for PDF without stored file."""
        attachment = PartAttachment(
            part_id=sample_part.id,
            attachment_type=AttachmentType.PDF,
            title="PDF without file",
            s3_key=None  # No stored file
        )
        session.add(attachment)
        session.flush()

        file_data, content_type, filename = document_service.get_attachment_file_data(attachment.id)

        assert isinstance(file_data, io.BytesIO)
        assert content_type == "image/svg+xml"
        assert filename == "pdf_icon.svg"

    def test_get_attachment_thumbnail_pdf(self, document_service, session, sample_part, mock_image_service):
        """Test getting thumbnail for PDF."""
        attachment = PartAttachment(
            part_id=sample_part.id,
            attachment_type=AttachmentType.PDF,
            title="PDF",
            s3_key="test.pdf"
        )
        session.add(attachment)
        session.flush()

        thumbnail_path, content_type = document_service.get_attachment_thumbnail(attachment.id, 150)

        assert thumbnail_path == "<svg>pdf icon</svg>"
        assert content_type == "image/svg+xml"

    def test_get_attachment_thumbnail_image(self, document_service, session, sample_part, mock_image_service):
        """Test getting thumbnail for image."""
        attachment = PartAttachment(
            part_id=sample_part.id,
            attachment_type=AttachmentType.IMAGE,
            title="Image",
            s3_key="test.jpg"
        )
        session.add(attachment)
        session.flush()

        thumbnail_path, content_type = document_service.get_attachment_thumbnail(attachment.id, 150)

        assert thumbnail_path == "/tmp/thumbnail.jpg"
        assert content_type == "image/jpeg"
        mock_image_service.get_thumbnail_path.assert_called_once_with(attachment.id, "test.jpg", 150)

    def test_set_part_cover_attachment_success(self, document_service, session, sample_part):
        """Test setting part cover attachment."""
        attachment = PartAttachment(
            part_id=sample_part.id,
            attachment_type=AttachmentType.IMAGE,
            title="Cover Image",
            s3_key="cover.jpg"
        )
        session.add(attachment)
        session.flush()

        document_service.set_part_cover_attachment(sample_part.key, attachment.id)

        session.refresh(sample_part)
        assert sample_part.cover_attachment_id == attachment.id

    def test_set_part_cover_attachment_clear(self, document_service, session, sample_part):
        """Test clearing part cover attachment."""
        # Set initial cover
        attachment = PartAttachment(
            part_id=sample_part.id,
            attachment_type=AttachmentType.IMAGE,
            title="Cover Image",
            s3_key="cover.jpg"
        )
        session.add(attachment)
        session.flush()
        sample_part.cover_attachment_id = attachment.id
        session.flush()

        # Clear cover
        document_service.set_part_cover_attachment(sample_part.key, None)

        session.refresh(sample_part)
        assert sample_part.cover_attachment_id is None

    def test_set_part_cover_attachment_not_image(self, document_service, session, sample_part):
        """Test setting non-image as cover attachment."""
        attachment = PartAttachment(
            part_id=sample_part.id,
            attachment_type=AttachmentType.PDF,
            title="PDF",
            s3_key="doc.pdf"
        )
        session.add(attachment)
        session.flush()

        with pytest.raises(InvalidOperationException) as exc_info:
            document_service.set_part_cover_attachment(sample_part.key, attachment.id)

        assert "set part cover attachment" in str(exc_info.value)
        assert "only images" in str(exc_info.value)

    def test_set_part_cover_attachment_wrong_part(self, document_service, session):
        """Test setting cover attachment from different part."""
        # Create two parts
        part_type = Type(name="Test")
        session.add(part_type)
        session.flush()

        part1 = Part(key="PART1", manufacturer_code="P1", type_id=part_type.id, description="Part 1")
        part2 = Part(key="PART2", manufacturer_code="P2", type_id=part_type.id, description="Part 2")
        session.add_all([part1, part2])
        session.flush()

        # Create attachment for part2
        attachment = PartAttachment(
            part_id=part2.id,
            attachment_type=AttachmentType.IMAGE,
            title="Image",
            s3_key="image.jpg"
        )
        session.add(attachment)
        session.flush()

        # Try to set as cover for part1
        with pytest.raises(InvalidOperationException) as exc_info:
            document_service.set_part_cover_attachment(part1.key, attachment.id)

        assert "set part cover attachment" in str(exc_info.value)
        assert "does not belong to this part" in str(exc_info.value)

    def test_get_part_cover_attachment_success(self, document_service, session, sample_part):
        """Test getting part cover attachment."""
        attachment = PartAttachment(
            part_id=sample_part.id,
            attachment_type=AttachmentType.IMAGE,
            title="Cover",
            s3_key="cover.jpg"
        )
        session.add(attachment)
        session.flush()
        sample_part.cover_attachment_id = attachment.id
        session.flush()

        cover = document_service.get_part_cover_attachment(sample_part.key)

        assert cover is not None
        assert cover.id == attachment.id
        assert cover.title == "Cover"

    def test_get_part_cover_attachment_none_set(self, document_service, session, sample_part):
        """Test getting part cover attachment when none set."""
        cover = document_service.get_part_cover_attachment(sample_part.key)
        assert cover is None
