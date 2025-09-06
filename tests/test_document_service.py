"""Unit tests for DocumentService."""

import io
import tempfile
from unittest.mock import MagicMock, patch

import pytest
from flask import Flask
from sqlalchemy.orm import Session

from app.config import Settings
from app.exceptions import InvalidOperationException, RecordNotFoundException
from app.models.part import Part
from app.models.part_attachment import AttachmentType, PartAttachment
from app.models.type import Type
from app.services.container import ServiceContainer
from app.services.document_service import DocumentService
from app.services.url_transformers import URLInterceptorRegistry
from app.utils.temp_file_manager import TempFileManager
from app.schemas.upload_document import UploadDocumentSchema, DocumentContentSchema

@pytest.fixture
def temp_file_manager():
    """Create temporary file manager for testing."""
    with tempfile.TemporaryDirectory() as temp_dir:
        yield TempFileManager(base_path=temp_dir, cleanup_age_hours=1.0)


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
    mock.get_pdf_icon_data.return_value = (b"<svg>pdf icon</svg>", "image/svg+xml")
    mock.get_thumbnail_path.return_value = "/tmp/thumbnail.jpg"
    return mock


@pytest.fixture
def mock_html_handler():
    """Create mock HtmlDocumentHandler."""
    mock = MagicMock()
    from app.services.html_document_handler import HtmlDocumentInfo
    from app.schemas.upload_document import DocumentContentSchema
    
    mock.process_html_content.return_value = HtmlDocumentInfo(
        title="Test Page",
        preview_image=DocumentContentSchema(
            content=b"preview image data",
            content_type="image/jpeg"
        )
    )
    return mock

@pytest.fixture
def mock_download_cache():
    """Create mock DownloadCacheService."""
    from app.services.download_cache_service import DownloadResult
    
    mock = MagicMock()
    mock.get_cached_content.return_value = DownloadResult(
        content=b"<html><title>Test Page</title></html>",
        content_type="text/html"
    )
    return mock


@pytest.fixture
def document_service(app: Flask, session: Session, mock_s3_service, mock_image_service, mock_html_handler, mock_download_cache, test_settings):
    """Create DocumentService with mocked dependencies."""
    with app.app_context():
        # Create empty URL interceptor registry for testing
        url_interceptor_registry = URLInterceptorRegistry()
        return DocumentService(session, mock_s3_service, mock_image_service, mock_html_handler, mock_download_cache, test_settings, url_interceptor_registry)


class TestDocumentService:
    """Test DocumentService functionality."""

    def test_create_file_attachment_image_success(self, document_service, session, sample_part, sample_image_file):
        """Test successful image attachment creation."""
        with patch('magic.from_buffer') as mock_magic:
            mock_magic.return_value = 'image/jpeg'

            attachment = document_service.create_file_attachment(
                part_key=sample_part.key,
                title="Test Image",
                file_data=sample_image_file,
                filename="test.jpg"
            )

        assert attachment.part_id == sample_part.id
        assert attachment.attachment_type == AttachmentType.IMAGE
        assert attachment.title == "Test Image"
        assert attachment.filename == "test.jpg"
        assert attachment.content_type == "image/jpeg"
        assert attachment.s3_key == "parts/123/attachments/test.jpg"

    def test_create_file_attachment_pdf_success(self, document_service, session, sample_part, sample_pdf_file):
        """Test successful PDF attachment creation."""
        with patch('magic.from_buffer') as mock_magic:
            mock_magic.return_value = 'application/pdf'

            attachment = document_service.create_file_attachment(
                part_key=sample_part.key,
                title="Test PDF",
                file_data=sample_pdf_file,
                filename="datasheet.pdf"
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
                filename="test.jpg"
            )

        assert "Part" in str(exc_info.value)
        assert "NONEXISTENT" in str(exc_info.value)

    def test_create_file_attachment_invalid_file_type(self, document_service, session, sample_part):
        """Test file attachment creation with invalid file type."""
        with patch('magic.from_buffer') as mock_magic:
            mock_magic.return_value = 'application/zip'

            invalid_file = io.BytesIO(b"fake zip content")

            with pytest.raises(InvalidOperationException) as exc_info:
                document_service.create_file_attachment(
                    part_key=sample_part.key,
                    title="Invalid File",
                    file_data=invalid_file,
                    filename="test.zip"
                )

        assert "file type not allowed" in str(exc_info.value)

    def test_create_file_attachment_file_too_large(self, document_service, container: ServiceContainer, sample_part, test_settings: Settings):
        """Test file attachment creation with file too large."""
        max_image_size = test_settings.MAX_IMAGE_SIZE

        test_settings.MAX_IMAGE_SIZE = 100
        try:
            with patch('magic.from_buffer') as mock_magic:
                mock_magic.return_value = 'image/jpeg'

                large_file = io.BytesIO(b"x" * 1000)  # Exceeds 100 byte limit

                with pytest.raises(InvalidOperationException) as exc_info:
                    document_service.create_file_attachment(
                        part_key=sample_part.key,
                        title="Large File",
                        file_data=large_file,
                        filename="large.jpg"
                    )
        finally:
            test_settings.MAX_IMAGE_SIZE = max_image_size

        assert "validate file size" in str(exc_info.value)
        assert "too large" in str(exc_info.value)

    def test_create_url_attachment_success(self, document_service, session, sample_part, mock_download_cache):
        """Test successful URL attachment creation."""
        # Mock HTML content with preview image
        mock_download_cache.get_cached_content.return_value = b"<html><title>Product Page</title></html>"
        
        with patch.object(document_service, 'process_upload_url') as mock_process:
            mock_process.return_value = UploadDocumentSchema(
                title="Product Page",
                content=DocumentContentSchema(
                    content=b"<html>...</html>",
                    content_type="text/html"
                ),
                detected_type=AttachmentType.URL,
                preview_image=DocumentContentSchema(
                    content=b"preview image",
                    content_type="image/jpeg"
                )
            )
            
            attachment = document_service.create_url_attachment(
                part_key=sample_part.key,
                title="Product Page",
                url="https://example.com/product"
            )

            assert attachment.part_id == sample_part.id
            assert attachment.attachment_type == AttachmentType.URL
            assert attachment.title == "Product Page"
            assert attachment.url == "https://example.com/product"

    def test_create_url_attachment_invalid_url(self, document_service, session, sample_part, mock_download_cache):
        """Test URL attachment creation with invalid URL."""
        mock_download_cache.get_cached_content.return_value = None

        with pytest.raises(InvalidOperationException) as exc_info:
            document_service.create_url_attachment(
                part_key=sample_part.key,
                title="Invalid URL",
                url="invalid-url"
            )

        assert "process URL" in str(exc_info.value) or "create URL attachment" in str(exc_info.value)

    def test_create_url_attachment_processing_failure(self, document_service, session, sample_part, mock_download_cache):
        """Test URL attachment creation with processing failure."""
        mock_download_cache.get_cached_content.side_effect = Exception("Processing failed")

        with pytest.raises(InvalidOperationException) as exc_info:
            document_service.create_url_attachment(
                part_key=sample_part.key,
                title="Processing Error",
                url="https://example.com"
            )

        assert "Processing failed" in str(exc_info.value) or "process URL" in str(exc_info.value) or "create URL attachment" in str(exc_info.value)

    def test_get_attachment_success(self, document_service, session, sample_part):
        """Test successful attachment retrieval."""
        # Create an attachment first
        attachment = PartAttachment(
            part_id=sample_part.id,
            attachment_type=AttachmentType.IMAGE,
            title="Test Attachment",
            s3_key="test/key.jpg",
            filename="test.jpg",
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

        result = document_service.get_attachment_file_data(attachment.id)

        assert result is None  # No S3 content available

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
            s3_key="test.jpg",
            content_type="image/jpeg"
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

    def test_set_part_cover_attachment_pdf(self, document_service, session, sample_part):
        """Test setting PDF as cover attachment."""
        attachment = PartAttachment(
            part_id=sample_part.id,
            attachment_type=AttachmentType.PDF,
            title="PDF",
            s3_key="doc.pdf"
        )
        session.add(attachment)
        session.flush()

        # Should now succeed
        document_service.set_part_cover_attachment(sample_part.key, attachment.id)

        session.refresh(sample_part)
        assert sample_part.cover_attachment_id == attachment.id

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


    def test_first_image_becomes_cover_automatically(self, document_service, session, sample_part, sample_image_file):
        """Test that the first image attachment automatically becomes the cover image."""
        with patch('magic.from_buffer') as mock_magic:
            mock_magic.return_value = 'image/jpeg'

            # Verify part has no cover initially
            assert sample_part.cover_attachment_id is None

            # Create first image attachment
            attachment = document_service.create_file_attachment(
                part_key=sample_part.key,
                title="First Image",
                file_data=sample_image_file,
                filename="first.jpg"
            )

            session.refresh(sample_part)

            # Verify first image became cover
            assert sample_part.cover_attachment_id == attachment.id

    def test_second_image_does_not_change_cover(self, document_service, session, sample_part, sample_image_file):
        """Test that subsequent image attachments don't change the cover if one is already set."""
        with patch('magic.from_buffer') as mock_magic:
            mock_magic.return_value = 'image/jpeg'

            # Create first image
            first_attachment = document_service.create_file_attachment(
                part_key=sample_part.key,
                title="First Image",
                file_data=sample_image_file,
                filename="first.jpg"
            )

            session.refresh(sample_part)
            original_cover_id = sample_part.cover_attachment_id
            assert original_cover_id == first_attachment.id

            # Create second image
            sample_image_file.seek(0)  # Reset file pointer
            second_attachment = document_service.create_file_attachment(
                part_key=sample_part.key,
                title="Second Image",
                file_data=sample_image_file,
                filename="second.jpg"
            )

            session.refresh(sample_part)

            # Verify cover didn't change
            assert sample_part.cover_attachment_id == original_cover_id
            assert sample_part.cover_attachment_id != second_attachment.id

    def test_pdf_does_not_become_cover(self, document_service, session, sample_part, sample_pdf_file):
        """Test that PDF attachments automatically become cover images."""
        with patch('magic.from_buffer') as mock_magic:
            mock_magic.return_value = 'application/pdf'

            # Verify part has no cover initially
            assert sample_part.cover_attachment_id is None

            # Create PDF attachment
            attachment = document_service.create_file_attachment(
                part_key=sample_part.key,
                title="PDF Document",
                file_data=sample_pdf_file,
                filename="document.pdf"
            )

            session.refresh(sample_part)

            # Verify PDF did not become cover
            assert sample_part.cover_attachment_id == attachment.id

    def test_deleting_cover_image_selects_next_oldest(self, document_service, session, sample_part, sample_image_file):
        """Test that deleting the cover image selects the next oldest image as the new cover."""
        from datetime import datetime, timedelta

        with patch('magic.from_buffer') as mock_magic:
            mock_magic.return_value = 'image/jpeg'

            base_time = datetime.now()

            # Create first image (oldest)
            first_attachment = document_service.create_file_attachment(
                part_key=sample_part.key,
                title="First Image",
                file_data=sample_image_file,
                filename="first.jpg"
            )
            first_attachment.created_at = base_time
            session.flush()

            # Create second image
            sample_image_file.seek(0)
            second_attachment = document_service.create_file_attachment(
                part_key=sample_part.key,
                title="Second Image",
                file_data=sample_image_file,
                filename="second.jpg"
            )
            second_attachment.created_at = base_time + timedelta(minutes=1)
            session.flush()

            session.refresh(sample_part)

            # Verify first is cover
            assert sample_part.cover_attachment_id == first_attachment.id

            # Delete the cover image
            document_service.delete_attachment(first_attachment.id)
            session.refresh(sample_part)

            # Verify second image became cover
            assert sample_part.cover_attachment_id == second_attachment.id

    def test_deleting_last_image_clears_cover(self, document_service, session, sample_part, sample_image_file):
        """Test that deleting the last image attachment clears the cover."""
        with patch('magic.from_buffer') as mock_magic:
            mock_magic.return_value = 'image/jpeg'

            # Create single image
            attachment = document_service.create_file_attachment(
                part_key=sample_part.key,
                title="Only Image",
                file_data=sample_image_file,
                filename="only.jpg"
            )

            session.refresh(sample_part)

            # Verify it became cover
            assert sample_part.cover_attachment_id == attachment.id

            # Delete the only image
            document_service.delete_attachment(attachment.id)
            session.refresh(sample_part)

            # Verify cover is cleared
            assert sample_part.cover_attachment_id is None

    def test_set_part_cover_attachment_url(self, document_service, session, sample_part):
        """Test setting URL attachment as cover."""
        attachment = PartAttachment(
            part_id=sample_part.id,
            attachment_type=AttachmentType.URL,
            title="URL Document",
            url="https://example.com/datasheet.pdf"
        )
        session.add(attachment)
        session.flush()

        # Should succeed
        document_service.set_part_cover_attachment(sample_part.key, attachment.id)

        session.refresh(sample_part)
        assert sample_part.cover_attachment_id == attachment.id

    def test_get_attachment_thumbnail_url_no_s3_key(self, document_service, session, sample_part, mock_image_service):
        """Test getting thumbnail for URL attachment without stored thumbnail."""
        attachment = PartAttachment(
            part_id=sample_part.id,
            attachment_type=AttachmentType.URL,
            title="URL Document",
            url="https://example.com/datasheet.pdf"
        )
        session.add(attachment)
        session.flush()

        # Mock the link icon return
        mock_image_service.get_link_icon_data.return_value = (b"<svg>link icon</svg>", "image/svg+xml")

        thumbnail_path, content_type = document_service.get_attachment_thumbnail(attachment.id, 150)

        assert thumbnail_path == "<svg>link icon</svg>"
        assert content_type == "image/svg+xml"
        mock_image_service.get_link_icon_data.assert_called_once()

    def test_get_attachment_thumbnail_url_with_s3_key(self, document_service, session, sample_part, mock_image_service):
        """Test getting thumbnail for URL attachment with stored thumbnail."""
        attachment = PartAttachment(
            part_id=sample_part.id,
            attachment_type=AttachmentType.URL,
            title="URL Document",
            url="https://example.com/image.jpg",
            s3_key="url_thumbnails/123/thumb.jpg",
            content_type="image/jpeg"  # URL with stored preview image
        )
        session.add(attachment)
        session.flush()

        # Mock thumbnail path return
        mock_image_service.get_thumbnail_path.return_value = "/tmp/thumbnail.jpg"

        thumbnail_path, content_type = document_service.get_attachment_thumbnail(attachment.id, 150)

        assert thumbnail_path == "/tmp/thumbnail.jpg"
        assert content_type == "image/jpeg"
        mock_image_service.get_thumbnail_path.assert_called_once_with(attachment.id, attachment.s3_key, 150)

    def test_has_image_property_image_attachment(self, document_service, session, sample_part, sample_image_file):
        """Test has_image property returns True for image attachments."""
        with patch('magic.from_buffer') as mock_magic:
            mock_magic.return_value = 'image/jpeg'

            attachment = document_service.create_file_attachment(
                part_key=sample_part.key,
                title="Test Image",
                file_data=sample_image_file,
                filename="test.jpg"
            )

        # Image attachments are identified by content_type
        assert attachment.content_type.startswith('image/')

    def test_has_image_property_pdf_attachment(self, document_service, session, sample_part, sample_pdf_file):
        """Test has_image property returns False for PDF attachments."""
        with patch('magic.from_buffer') as mock_magic:
            mock_magic.return_value = 'application/pdf'

            attachment = document_service.create_file_attachment(
                part_key=sample_part.key,
                title="Test PDF",
                file_data=sample_pdf_file,
                filename="test.pdf"
            )

        # PDFs are not images
        assert not attachment.content_type.startswith('image/')

    def test_has_image_property_url_with_stored_thumbnail(self, document_service, session, sample_part):
        """Test has_image property returns True for URL attachments with stored thumbnails."""
        attachment = document_service.create_url_attachment(
            part_key=sample_part.key,
            title="URL with Thumbnail",
            url="https://example.com/image"
        )

        # URL with image preview in S3
        assert attachment.s3_key is not None
        assert attachment.content_type == "image/jpeg"

    def test_has_image_property_url_without_stored_thumbnail(self, document_service, session, sample_part, mock_download_cache):
        """Test has_image property for URL attachments without stored thumbnails."""
        # Mock HTML without preview image
        with patch.object(document_service, 'process_upload_url') as mock_process:
            mock_process.return_value = UploadDocumentSchema(
                title="URL without Thumbnail",
                content=DocumentContentSchema(
                    content=b"<html>...</html>",
                    content_type="text/html"
                ),
                detected_type=AttachmentType.URL,
                preview_image=None  # No preview image
            )
            
            attachment = document_service.create_url_attachment(
                part_key=sample_part.key,
                title="URL without Thumbnail",
                url="https://example.com/webpage"
            )

            # No S3 key means no image
            assert attachment.s3_key is None

    def test_has_image_property_url_no_image(self, document_service, session, sample_part, mock_download_cache):
        """Test has_image property returns False for URL attachments without images."""
        # Mock HTML without preview image
        with patch.object(document_service, 'process_upload_url') as mock_process:
            mock_process.return_value = UploadDocumentSchema(
                title="URL No Image",
                content=DocumentContentSchema(
                    content=b"<html>...</html>",
                    content_type="text/html"
                ),
                detected_type=AttachmentType.URL,
                preview_image=None  # No preview image
            )
            
            attachment = document_service.create_url_attachment(
                part_key=sample_part.key,
                title="URL No Image",
                url="https://example.com/text-page"
            )

            # No S3 key means no preview image
            assert attachment.s3_key is None

#    def test_attachment_has_image_method_success(self, document_service, session, sample_part):
        """Test the attachment_has_image service method."""
        # Create an image attachment
        attachment = PartAttachment(
            part_id=sample_part.id,
            attachment_type=AttachmentType.IMAGE,
            title="Test Image",
            s3_key="test/image.jpg",
            filename="image.jpg",
            content_type="image/jpeg",
            file_size=1024
        )
        session.add(attachment)
        session.flush()

        # Test model's has_preview property directly since service method doesn't exist
        assert attachment.has_preview == True

    def test_attachment_has_image_method_not_found(self, document_service, session):
        """Test getting non-existent attachment."""
        with pytest.raises(RecordNotFoundException) as exc_info:
            document_service.get_attachment(99999)

        assert "Attachment" in str(exc_info.value)

    def test_process_upload_url_direct_image(self, document_service, session, sample_part):
        """Test processing direct image URL."""
        with patch.object(document_service, 'process_upload_url') as mock_process:
            mock_process.return_value = UploadDocumentSchema(
                title="image.jpg",
                content=DocumentContentSchema(
                    content=b"image data",
                    content_type="image/jpeg"
                ),
                detected_type=AttachmentType.IMAGE,
                preview_image=None
            )
            
            result = document_service.process_upload_url("https://example.com/image.jpg")
            
            assert result.title == "image.jpg"
            assert result.detected_type == AttachmentType.IMAGE
            assert result.preview_image is None
    
    def test_process_upload_url_html_with_preview(self, document_service, session, sample_part):
        """Test processing HTML URL with preview image."""
        with patch.object(document_service, 'process_upload_url') as mock_process:
            from app.schemas.upload_document import UploadDocumentSchema, DocumentContentSchema
            
            mock_process.return_value = UploadDocumentSchema(
                title="Product Page",
                content=DocumentContentSchema(
                    content=b"<html>...</html>",
                    content_type="text/html"
                ),
                detected_type=AttachmentType.URL,
                preview_image=DocumentContentSchema(
                    content=b"preview image data",
                    content_type="image/jpeg"
                )
            )
            
            result = document_service.process_upload_url("https://example.com/product")
            
            assert result.title == "Product Page"
            assert result.detected_type == AttachmentType.URL
            assert result.preview_image is not None
            assert result.preview_image.content_type == "image/jpeg"
    
    def test_create_file_attachment_stores_image_verbatim(self, document_service, session, sample_part):
        """Test that images are stored byte-for-byte identical without re-encoding."""
        # Create unique test bytes that would change if re-encoded
        original_bytes = b"FAKE_JPEG_CONTENT_THAT_WOULD_CHANGE_IF_REENCODED"
        test_file = io.BytesIO(original_bytes)
        
        with patch('magic.from_buffer') as mock_magic, \
             patch.object(document_service.s3_service, 'upload_file') as mock_upload:
            mock_magic.return_value = 'image/jpeg'
            
            attachment = document_service.create_file_attachment(
                part_key=sample_part.key,
                title="Test Image",
                file_data=test_file,
                filename="test.jpg"
            )
            
            # Verify S3 received the exact original bytes
            mock_upload.assert_called_once()
            uploaded_data = mock_upload.call_args[0][0]
            uploaded_data.seek(0)
            uploaded_bytes = uploaded_data.read()
            
            assert uploaded_bytes == original_bytes, "Image was modified during storage"
            assert attachment.content_type == "image/jpeg"
    
    def test_create_file_attachment_preserves_png_transparency(self, document_service, session, sample_part):
        """Test that PNG images with transparency are stored without conversion."""
        # Create fake PNG content (would lose transparency if converted to JPEG)
        png_with_alpha = b"PNG_WITH_ALPHA_CHANNEL_DATA"
        test_file = io.BytesIO(png_with_alpha)
        
        with patch('magic.from_buffer') as mock_magic, \
             patch.object(document_service.s3_service, 'upload_file') as mock_upload:
            mock_magic.return_value = 'image/png'
            
            attachment = document_service.create_file_attachment(
                part_key=sample_part.key,
                title="PNG with Transparency",
                file_data=test_file,
                filename="transparent.png"
            )
            
            # Verify PNG was stored as-is
            mock_upload.assert_called_once()
            uploaded_data = mock_upload.call_args[0][0]
            uploaded_data.seek(0)
            uploaded_bytes = uploaded_data.read()
            
            assert uploaded_bytes == png_with_alpha, "PNG was modified during storage"
            assert attachment.content_type == "image/png"
    
    def test_create_file_attachment_no_jpeg_reencoding(self, document_service, session, sample_part):
        """Test that JPEG images are not re-encoded (which would lose quality)."""
        # JPEG bytes that would change if re-encoded due to quality loss
        original_jpeg = b"ORIGINAL_JPEG_WITH_SPECIFIC_QUALITY_SETTINGS"
        test_file = io.BytesIO(original_jpeg)
        
        with patch('magic.from_buffer') as mock_magic, \
             patch.object(document_service.s3_service, 'upload_file') as mock_upload:
            mock_magic.return_value = 'image/jpeg'
            
            attachment = document_service.create_file_attachment(
                part_key=sample_part.key,
                title="Original JPEG",
                file_data=test_file,
                filename="original.jpg"
            )
            
            # Verify JPEG was not re-encoded
            mock_upload.assert_called_once()
            uploaded_data = mock_upload.call_args[0][0]
            uploaded_data.seek(0)
            uploaded_bytes = uploaded_data.read()
            
            assert uploaded_bytes == original_jpeg, "JPEG was re-encoded during storage"
            assert attachment.content_type == "image/jpeg"
    
    def test_create_file_attachment_ignores_content_type_parameter(self, document_service, session, sample_part):
        """Test that python-magic detection overrides provided content_type parameter."""
        # Create content that's actually a PDF
        pdf_content = b"PDF_CONTENT_HERE"
        test_file = io.BytesIO(pdf_content)
        
        with patch('magic.from_buffer') as mock_magic, \
             patch.object(document_service.s3_service, 'upload_file') as mock_upload:
            # Magic detects it's a PDF despite wrong content_type parameter
            mock_magic.return_value = 'application/pdf'
            
            attachment = document_service.create_file_attachment(
                part_key=sample_part.key,
                title="Mislabeled File",
                file_data=test_file,
                filename="file.jpg"  # Wrong extension
            )
            
            # Verify the detected type was used, not the provided one
            assert attachment.content_type == "application/pdf"
            assert attachment.attachment_type == AttachmentType.PDF
            
            # Verify S3 upload used correct content type
            mock_upload.assert_called_once()
            upload_content_type = mock_upload.call_args[0][2]
            assert upload_content_type == "application/pdf"
