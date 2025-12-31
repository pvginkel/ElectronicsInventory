"""Tests for AttachmentSetService."""

import io
from unittest.mock import MagicMock, patch

import pytest
from flask import Flask
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import Settings
from app.exceptions import InvalidOperationException, RecordNotFoundException
from app.models.attachment import Attachment, AttachmentType
from app.models.attachment_set import AttachmentSet
from app.services.attachment_set_service import AttachmentSetService


@pytest.fixture
def mock_s3_service():
    """Create mock S3Service."""
    mock = MagicMock()
    mock.generate_cas_key.return_value = "cas/0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
    mock.file_exists.return_value = False
    mock.upload_file.return_value = True
    mock.download_file.return_value = io.BytesIO(b"file content")
    return mock


@pytest.fixture
def mock_image_service():
    """Create mock ImageService."""
    mock = MagicMock()
    return mock


@pytest.fixture
def attachment_set_service(
    app: Flask, session: Session, mock_s3_service, mock_image_service, test_settings: Settings
):
    """Create AttachmentSetService with mocked dependencies."""
    with app.app_context():
        return AttachmentSetService(
            session, mock_s3_service, mock_image_service, test_settings
        )


@pytest.fixture
def attachment_set(session: Session) -> AttachmentSet:
    """Create a sample attachment set for testing."""
    attachment_set = AttachmentSet()
    session.add(attachment_set)
    session.flush()
    return attachment_set


class TestCreateAttachmentSet:
    """Tests for create_attachment_set method."""

    def test_create_attachment_set_success(self, attachment_set_service: AttachmentSetService, session: Session):
        """Test successful attachment set creation."""
        result = attachment_set_service.create_attachment_set()

        assert result.id is not None
        assert result.cover_attachment_id is None
        assert result.attachments == []

        # Verify persisted
        persisted = session.get(AttachmentSet, result.id)
        assert persisted is not None

    def test_create_multiple_attachment_sets(self, attachment_set_service: AttachmentSetService):
        """Test creating multiple attachment sets."""
        set1 = attachment_set_service.create_attachment_set()
        set2 = attachment_set_service.create_attachment_set()

        assert set1.id != set2.id


class TestGetAttachmentSet:
    """Tests for get_attachment_set method."""

    def test_get_attachment_set_success(
        self, attachment_set_service: AttachmentSetService, attachment_set: AttachmentSet
    ):
        """Test retrieving an existing attachment set."""
        result = attachment_set_service.get_attachment_set(attachment_set.id)

        assert result.id == attachment_set.id

    def test_get_attachment_set_not_found(self, attachment_set_service: AttachmentSetService):
        """Test retrieving non-existent attachment set raises exception."""
        with pytest.raises(RecordNotFoundException) as exc_info:
            attachment_set_service.get_attachment_set(99999)

        assert "AttachmentSet" in str(exc_info.value)
        assert "99999" in str(exc_info.value)


class TestCreateFileAttachment:
    """Tests for create_file_attachment method."""

    def test_create_image_attachment_success(
        self,
        attachment_set_service: AttachmentSetService,
        attachment_set: AttachmentSet,
        sample_image_file,
    ):
        """Test successful image attachment creation."""
        with patch("magic.from_buffer") as mock_magic:
            mock_magic.return_value = "image/png"

            attachment = attachment_set_service.create_file_attachment(
                set_id=attachment_set.id,
                title="Test Image",
                file_data=sample_image_file,
                filename="test.png",
            )

        assert attachment.attachment_set_id == attachment_set.id
        assert attachment.attachment_type == AttachmentType.IMAGE
        assert attachment.title == "Test Image"
        assert attachment.filename == "test.png"
        assert attachment.content_type == "image/png"
        assert attachment.s3_key.startswith("cas/")

    def test_create_pdf_attachment_success(
        self,
        attachment_set_service: AttachmentSetService,
        attachment_set: AttachmentSet,
        sample_pdf_file,
    ):
        """Test successful PDF attachment creation."""
        with patch("magic.from_buffer") as mock_magic:
            mock_magic.return_value = "application/pdf"

            attachment = attachment_set_service.create_file_attachment(
                set_id=attachment_set.id,
                title="Datasheet",
                file_data=sample_pdf_file,
                filename="datasheet.pdf",
            )

        assert attachment.attachment_type == AttachmentType.PDF
        assert attachment.title == "Datasheet"
        assert attachment.filename == "datasheet.pdf"
        assert attachment.content_type == "application/pdf"

    def test_create_file_attachment_auto_cover_assignment(
        self,
        attachment_set_service: AttachmentSetService,
        attachment_set: AttachmentSet,
        sample_image_file,
        session: Session,
    ):
        """Test that first image is automatically set as cover."""
        assert attachment_set.cover_attachment_id is None

        with patch("magic.from_buffer") as mock_magic:
            mock_magic.return_value = "image/png"

            attachment = attachment_set_service.create_file_attachment(
                set_id=attachment_set.id,
                title="First Image",
                file_data=sample_image_file,
                filename="first.png",
            )

        # Refresh to get updated cover
        session.refresh(attachment_set)
        assert attachment_set.cover_attachment_id == attachment.id

    def test_create_file_attachment_second_image_not_cover(
        self,
        attachment_set_service: AttachmentSetService,
        attachment_set: AttachmentSet,
        sample_image_file,
        session: Session,
    ):
        """Test that second image does not override cover."""
        with patch("magic.from_buffer") as mock_magic:
            mock_magic.return_value = "image/png"

            # Create first image (becomes cover)
            first = attachment_set_service.create_file_attachment(
                set_id=attachment_set.id,
                title="First Image",
                file_data=sample_image_file,
                filename="first.png",
            )
            sample_image_file.seek(0)

            # Create second image
            attachment_set_service.create_file_attachment(
                set_id=attachment_set.id,
                title="Second Image",
                file_data=sample_image_file,
                filename="second.png",
            )

        session.refresh(attachment_set)
        assert attachment_set.cover_attachment_id == first.id

    def test_create_file_attachment_pdf_not_auto_cover(
        self,
        attachment_set_service: AttachmentSetService,
        attachment_set: AttachmentSet,
        sample_pdf_file,
        session: Session,
    ):
        """Test that PDF is not set as cover."""
        with patch("magic.from_buffer") as mock_magic:
            mock_magic.return_value = "application/pdf"

            attachment_set_service.create_file_attachment(
                set_id=attachment_set.id,
                title="Datasheet",
                file_data=sample_pdf_file,
                filename="datasheet.pdf",
            )

        session.refresh(attachment_set)
        assert attachment_set.cover_attachment_id is None

    def test_create_file_attachment_set_not_found(
        self, attachment_set_service: AttachmentSetService, sample_image_file
    ):
        """Test creating attachment for non-existent set raises exception."""
        with pytest.raises(RecordNotFoundException) as exc_info:
            attachment_set_service.create_file_attachment(
                set_id=99999,
                title="Test",
                file_data=sample_image_file,
                filename="test.png",
            )

        assert "AttachmentSet" in str(exc_info.value)

    def test_create_file_attachment_invalid_file_type(
        self, attachment_set_service: AttachmentSetService, attachment_set: AttachmentSet
    ):
        """Test creating attachment with invalid file type raises exception."""
        with patch("magic.from_buffer") as mock_magic:
            mock_magic.return_value = "application/zip"

            invalid_file = io.BytesIO(b"fake zip content")

            with pytest.raises(InvalidOperationException) as exc_info:
                attachment_set_service.create_file_attachment(
                    set_id=attachment_set.id,
                    title="Invalid File",
                    file_data=invalid_file,
                    filename="test.zip",
                )

        assert "file type not allowed" in str(exc_info.value)

    def test_create_file_attachment_file_too_large(
        self,
        attachment_set_service: AttachmentSetService,
        attachment_set: AttachmentSet,
        test_settings: Settings,
    ):
        """Test creating attachment with file too large raises exception."""
        original_max = test_settings.MAX_IMAGE_SIZE
        test_settings.MAX_IMAGE_SIZE = 100  # 100 bytes

        try:
            with patch("magic.from_buffer") as mock_magic:
                mock_magic.return_value = "image/jpeg"

                large_file = io.BytesIO(b"x" * 1000)  # Exceeds 100 byte limit

                with pytest.raises(InvalidOperationException) as exc_info:
                    attachment_set_service.create_file_attachment(
                        set_id=attachment_set.id,
                        title="Large File",
                        file_data=large_file,
                        filename="large.jpg",
                    )

            assert "file too large" in str(exc_info.value)
        finally:
            test_settings.MAX_IMAGE_SIZE = original_max

    def test_create_file_attachment_s3_failure_marks_rollback(
        self,
        attachment_set_service: AttachmentSetService,
        attachment_set: AttachmentSet,
        sample_image_file,
        mock_s3_service,
        session: Session,
    ):
        """Test S3 upload failure marks transaction for rollback."""
        with patch("magic.from_buffer") as mock_magic:
            mock_magic.return_value = "image/png"
            mock_s3_service.upload_file.side_effect = InvalidOperationException(
                "upload file", "S3 failure"
            )

            sample_image_file.seek(0)
            with pytest.raises(InvalidOperationException):
                attachment_set_service.create_file_attachment(
                    set_id=attachment_set.id,
                    title="Rollback Image",
                    file_data=sample_image_file,
                    filename="rollback.png",
                )

        # Reset side effect
        mock_s3_service.upload_file.side_effect = None

        # Rollback and verify no attachments remain
        session.rollback()
        remaining = session.scalars(select(Attachment)).all()
        assert remaining == []

    def test_create_file_attachment_upload_runs_after_flush(
        self,
        attachment_set_service: AttachmentSetService,
        attachment_set: AttachmentSet,
        sample_image_file,
        mock_s3_service,
        session: Session,
    ):
        """Ensure S3 upload runs after the attachment is flushed to the database."""
        with patch("magic.from_buffer") as mock_magic:
            mock_magic.return_value = "image/png"

            def upload_side_effect(_file_obj, key, _content_type):
                # Verify attachment is persisted before S3 upload
                persisted = session.scalar(
                    select(Attachment).where(Attachment.title == "Flush First")
                )
                assert persisted is not None
                assert persisted.s3_key == key
                return True

            mock_s3_service.upload_file.side_effect = upload_side_effect

            sample_image_file.seek(0)
            attachment = attachment_set_service.create_file_attachment(
                set_id=attachment_set.id,
                title="Flush First",
                file_data=sample_image_file,
                filename="flush.png",
            )

        mock_s3_service.upload_file.side_effect = None

        assert attachment.title == "Flush First"
        assert mock_s3_service.upload_file.called

    def test_create_file_attachment_deduplication(
        self,
        attachment_set_service: AttachmentSetService,
        attachment_set: AttachmentSet,
        sample_image_file,
        mock_s3_service,
    ):
        """Test that duplicate content is not re-uploaded to S3."""
        mock_s3_service.file_exists.return_value = True  # Content already exists

        with patch("magic.from_buffer") as mock_magic:
            mock_magic.return_value = "image/png"

            attachment_set_service.create_file_attachment(
                set_id=attachment_set.id,
                title="Duplicate",
                file_data=sample_image_file,
                filename="dup.png",
            )

        # upload_file should NOT be called due to deduplication
        mock_s3_service.upload_file.assert_not_called()


class TestCreateUrlAttachment:
    """Tests for create_url_attachment method."""

    def test_create_url_attachment_success(
        self, attachment_set_service: AttachmentSetService, attachment_set: AttachmentSet
    ):
        """Test successful URL attachment creation."""
        attachment = attachment_set_service.create_url_attachment(
            set_id=attachment_set.id,
            title="Product Page",
            url="https://example.com/product",
        )

        assert attachment.attachment_set_id == attachment_set.id
        assert attachment.attachment_type == AttachmentType.URL
        assert attachment.title == "Product Page"
        assert attachment.url == "https://example.com/product"
        assert attachment.s3_key is None

    def test_create_url_attachment_set_not_found(
        self, attachment_set_service: AttachmentSetService
    ):
        """Test creating URL attachment for non-existent set raises exception."""
        with pytest.raises(RecordNotFoundException) as exc_info:
            attachment_set_service.create_url_attachment(
                set_id=99999,
                title="Test",
                url="https://example.com",
            )

        assert "AttachmentSet" in str(exc_info.value)


class TestGetAttachments:
    """Tests for get_attachments method."""

    def test_get_attachments_success(
        self, attachment_set_service: AttachmentSetService, attachment_set: AttachmentSet
    ):
        """Test retrieving attachments from a set."""
        # Create some attachments
        attachment_set_service.create_url_attachment(
            set_id=attachment_set.id, title="URL 1", url="https://example.com/1"
        )
        attachment_set_service.create_url_attachment(
            set_id=attachment_set.id, title="URL 2", url="https://example.com/2"
        )

        attachments = attachment_set_service.get_attachments(attachment_set.id)

        assert len(attachments) == 2
        titles = [a.title for a in attachments]
        assert "URL 1" in titles
        assert "URL 2" in titles

    def test_get_attachments_empty(
        self, attachment_set_service: AttachmentSetService, attachment_set: AttachmentSet
    ):
        """Test retrieving attachments from empty set."""
        attachments = attachment_set_service.get_attachments(attachment_set.id)

        assert attachments == []

    def test_get_attachments_set_not_found(
        self, attachment_set_service: AttachmentSetService
    ):
        """Test retrieving attachments from non-existent set raises exception."""
        with pytest.raises(RecordNotFoundException):
            attachment_set_service.get_attachments(99999)


class TestGetAttachment:
    """Tests for get_attachment method."""

    def test_get_attachment_success(
        self, attachment_set_service: AttachmentSetService, attachment_set: AttachmentSet
    ):
        """Test retrieving a specific attachment."""
        created = attachment_set_service.create_url_attachment(
            set_id=attachment_set.id, title="Test", url="https://example.com"
        )

        result = attachment_set_service.get_attachment(attachment_set.id, created.id)

        assert result.id == created.id
        assert result.title == "Test"

    def test_get_attachment_not_found(
        self, attachment_set_service: AttachmentSetService, attachment_set: AttachmentSet
    ):
        """Test retrieving non-existent attachment raises exception."""
        with pytest.raises(RecordNotFoundException) as exc_info:
            attachment_set_service.get_attachment(attachment_set.id, 99999)

        assert "Attachment" in str(exc_info.value)

    def test_get_attachment_wrong_set(
        self, attachment_set_service: AttachmentSetService, session: Session
    ):
        """Test retrieving attachment from wrong set raises exception."""
        # Create two attachment sets
        set1 = attachment_set_service.create_attachment_set()
        set2 = attachment_set_service.create_attachment_set()

        # Create attachment in set1
        attachment = attachment_set_service.create_url_attachment(
            set_id=set1.id, title="Test", url="https://example.com"
        )

        # Try to get attachment using set2's ID
        with pytest.raises(InvalidOperationException) as exc_info:
            attachment_set_service.get_attachment(set2.id, attachment.id)

        assert "does not belong to set" in str(exc_info.value)


class TestUpdateAttachment:
    """Tests for update_attachment method."""

    def test_update_attachment_title(
        self, attachment_set_service: AttachmentSetService, attachment_set: AttachmentSet
    ):
        """Test updating attachment title."""
        attachment = attachment_set_service.create_url_attachment(
            set_id=attachment_set.id, title="Old Title", url="https://example.com"
        )

        result = attachment_set_service.update_attachment(
            set_id=attachment_set.id, attachment_id=attachment.id, title="New Title"
        )

        assert result.title == "New Title"

    def test_update_attachment_not_found(
        self, attachment_set_service: AttachmentSetService, attachment_set: AttachmentSet
    ):
        """Test updating non-existent attachment raises exception."""
        with pytest.raises(RecordNotFoundException):
            attachment_set_service.update_attachment(
                set_id=attachment_set.id, attachment_id=99999, title="New"
            )


class TestDeleteAttachment:
    """Tests for delete_attachment method."""

    def test_delete_attachment_success(
        self,
        attachment_set_service: AttachmentSetService,
        attachment_set: AttachmentSet,
        session: Session,
    ):
        """Test deleting an attachment."""
        attachment = attachment_set_service.create_url_attachment(
            set_id=attachment_set.id, title="To Delete", url="https://example.com"
        )
        attachment_id = attachment.id

        attachment_set_service.delete_attachment(attachment_set.id, attachment_id)

        # Verify deleted
        deleted = session.get(Attachment, attachment_id)
        assert deleted is None

    def test_delete_attachment_cover_reassignment(
        self,
        attachment_set_service: AttachmentSetService,
        attachment_set: AttachmentSet,
        sample_image_file,
        session: Session,
    ):
        """Test deleting cover image reassigns cover to next image."""
        with patch("magic.from_buffer") as mock_magic:
            mock_magic.return_value = "image/png"

            # Create first image (becomes cover)
            first = attachment_set_service.create_file_attachment(
                set_id=attachment_set.id,
                title="First",
                file_data=sample_image_file,
                filename="first.png",
            )
            sample_image_file.seek(0)

            # Create second image
            second = attachment_set_service.create_file_attachment(
                set_id=attachment_set.id,
                title="Second",
                file_data=sample_image_file,
                filename="second.png",
            )

        session.refresh(attachment_set)
        assert attachment_set.cover_attachment_id == first.id

        # Delete first (cover)
        attachment_set_service.delete_attachment(attachment_set.id, first.id)

        session.refresh(attachment_set)
        assert attachment_set.cover_attachment_id == second.id

    def test_delete_last_image_clears_cover(
        self,
        attachment_set_service: AttachmentSetService,
        attachment_set: AttachmentSet,
        sample_image_file,
        session: Session,
    ):
        """Test deleting last image clears cover."""
        with patch("magic.from_buffer") as mock_magic:
            mock_magic.return_value = "image/png"

            attachment = attachment_set_service.create_file_attachment(
                set_id=attachment_set.id,
                title="Only Image",
                file_data=sample_image_file,
                filename="only.png",
            )

        session.refresh(attachment_set)
        assert attachment_set.cover_attachment_id == attachment.id

        # Delete the only image
        attachment_set_service.delete_attachment(attachment_set.id, attachment.id)

        session.refresh(attachment_set)
        assert attachment_set.cover_attachment_id is None

    def test_delete_non_cover_attachment(
        self,
        attachment_set_service: AttachmentSetService,
        attachment_set: AttachmentSet,
        sample_image_file,
        session: Session,
    ):
        """Test deleting non-cover attachment doesn't affect cover."""
        with patch("magic.from_buffer") as mock_magic:
            mock_magic.return_value = "image/png"

            first = attachment_set_service.create_file_attachment(
                set_id=attachment_set.id,
                title="First",
                file_data=sample_image_file,
                filename="first.png",
            )
            sample_image_file.seek(0)

            second = attachment_set_service.create_file_attachment(
                set_id=attachment_set.id,
                title="Second",
                file_data=sample_image_file,
                filename="second.png",
            )

        session.refresh(attachment_set)
        assert attachment_set.cover_attachment_id == first.id

        # Delete second (not cover)
        attachment_set_service.delete_attachment(attachment_set.id, second.id)

        session.refresh(attachment_set)
        assert attachment_set.cover_attachment_id == first.id

    def test_delete_attachment_not_found(
        self, attachment_set_service: AttachmentSetService, attachment_set: AttachmentSet
    ):
        """Test deleting non-existent attachment raises exception."""
        with pytest.raises(RecordNotFoundException):
            attachment_set_service.delete_attachment(attachment_set.id, 99999)


class TestSetCoverAttachment:
    """Tests for set_cover_attachment method."""

    def test_set_cover_attachment_success(
        self,
        attachment_set_service: AttachmentSetService,
        attachment_set: AttachmentSet,
        session: Session,
    ):
        """Test setting cover attachment."""
        attachment = attachment_set_service.create_url_attachment(
            set_id=attachment_set.id, title="Cover", url="https://example.com"
        )

        result = attachment_set_service.set_cover_attachment(
            attachment_set.id, attachment.id
        )

        assert result.cover_attachment_id == attachment.id

    def test_clear_cover_attachment(
        self,
        attachment_set_service: AttachmentSetService,
        attachment_set: AttachmentSet,
        sample_image_file,
        session: Session,
    ):
        """Test clearing cover attachment."""
        with patch("magic.from_buffer") as mock_magic:
            mock_magic.return_value = "image/png"

            attachment_set_service.create_file_attachment(
                set_id=attachment_set.id,
                title="Image",
                file_data=sample_image_file,
                filename="image.png",
            )

        session.refresh(attachment_set)
        assert attachment_set.cover_attachment_id is not None

        # Clear cover
        result = attachment_set_service.set_cover_attachment(attachment_set.id, None)

        assert result.cover_attachment_id is None

    def test_set_cover_wrong_set(
        self, attachment_set_service: AttachmentSetService, session: Session
    ):
        """Test setting cover with attachment from wrong set raises exception."""
        set1 = attachment_set_service.create_attachment_set()
        set2 = attachment_set_service.create_attachment_set()

        attachment = attachment_set_service.create_url_attachment(
            set_id=set1.id, title="Test", url="https://example.com"
        )

        with pytest.raises(InvalidOperationException) as exc_info:
            attachment_set_service.set_cover_attachment(set2.id, attachment.id)

        assert "does not belong to set" in str(exc_info.value)


class TestGetAttachmentFileData:
    """Tests for get_attachment_file_data method."""

    def test_get_file_data_success(
        self,
        attachment_set_service: AttachmentSetService,
        attachment_set: AttachmentSet,
        sample_image_file,
        mock_s3_service,
    ):
        """Test retrieving file data for attachment with S3 content."""
        with patch("magic.from_buffer") as mock_magic:
            mock_magic.return_value = "image/png"

            attachment = attachment_set_service.create_file_attachment(
                set_id=attachment_set.id,
                title="Image",
                file_data=sample_image_file,
                filename="image.png",
            )

        result = attachment_set_service.get_attachment_file_data(
            attachment_set.id, attachment.id
        )

        assert result is not None
        file_data, content_type, filename = result
        assert content_type == "image/png"
        assert filename == "image.png"
        mock_s3_service.download_file.assert_called_once()

    def test_get_file_data_url_attachment(
        self, attachment_set_service: AttachmentSetService, attachment_set: AttachmentSet
    ):
        """Test retrieving file data for URL attachment returns None."""
        attachment = attachment_set_service.create_url_attachment(
            set_id=attachment_set.id, title="URL", url="https://example.com"
        )

        result = attachment_set_service.get_attachment_file_data(
            attachment_set.id, attachment.id
        )

        assert result is None

    def test_get_file_data_not_found(
        self, attachment_set_service: AttachmentSetService, attachment_set: AttachmentSet
    ):
        """Test retrieving file data for non-existent attachment raises exception."""
        with pytest.raises(RecordNotFoundException):
            attachment_set_service.get_attachment_file_data(attachment_set.id, 99999)

    def test_get_file_data_wrong_set(
        self, attachment_set_service: AttachmentSetService, session: Session
    ):
        """Test retrieving file data from wrong set raises exception."""
        set1 = attachment_set_service.create_attachment_set()
        set2 = attachment_set_service.create_attachment_set()

        attachment = attachment_set_service.create_url_attachment(
            set_id=set1.id, title="Test", url="https://example.com"
        )

        with pytest.raises(InvalidOperationException) as exc_info:
            attachment_set_service.get_attachment_file_data(set2.id, attachment.id)

        assert "does not belong to set" in str(exc_info.value)


class TestAttachmentPreviewUrl:
    """Tests for attachment preview_url property behavior."""

    def test_image_attachment_has_preview_url(
        self,
        attachment_set_service: AttachmentSetService,
        attachment_set: AttachmentSet,
        sample_image_file,
    ):
        """Test that image attachments have preview_url set to the CAS URL."""
        with patch("magic.from_buffer") as mock_magic:
            mock_magic.return_value = "image/png"

            attachment = attachment_set_service.create_file_attachment(
                set_id=attachment_set.id,
                title="Test Image",
                file_data=sample_image_file,
                filename="test.png",
            )

        # Verify has_preview is True for images
        assert attachment.has_preview is True

        # Verify preview_url is set and matches attachment_url
        assert attachment.preview_url is not None
        assert attachment.preview_url == attachment.attachment_url

        # Verify it's a valid CAS URL
        assert attachment.preview_url.startswith("/api/cas/")
        assert "content_type=image/png" in attachment.preview_url

    def test_pdf_attachment_has_icon_preview_url(
        self,
        attachment_set_service: AttachmentSetService,
        attachment_set: AttachmentSet,
        sample_pdf_file,
    ):
        """Test that PDF attachments have preview_url set to the PDF icon."""
        with patch("magic.from_buffer") as mock_magic:
            mock_magic.return_value = "application/pdf"

            attachment = attachment_set_service.create_file_attachment(
                set_id=attachment_set.id,
                title="Test PDF",
                file_data=sample_pdf_file,
                filename="test.pdf",
            )

        # Verify has_preview is False for PDFs
        assert attachment.has_preview is False

        # Verify preview_url is set to PDF icon
        assert attachment.preview_url is not None
        assert attachment.preview_url.startswith("/api/icons/pdf")
        assert "version=" in attachment.preview_url

    def test_url_attachment_has_no_preview_url(
        self,
        attachment_set_service: AttachmentSetService,
        attachment_set: AttachmentSet,
    ):
        """Test that URL attachments have no preview_url."""
        attachment = attachment_set_service.create_url_attachment(
            set_id=attachment_set.id,
            title="External Link",
            url="https://example.com/document",
        )

        # Verify has_preview is False for URLs
        assert attachment.has_preview is False

        # Verify preview_url is None
        assert attachment.preview_url is None

    def test_image_preview_url_serialized_in_response_schema(
        self,
        attachment_set_service: AttachmentSetService,
        attachment_set: AttachmentSet,
        sample_image_file,
    ):
        """Test that preview_url is included when serializing to response schema."""
        from app.schemas.attachment_set import AttachmentResponseSchema, AttachmentListSchema

        with patch("magic.from_buffer") as mock_magic:
            mock_magic.return_value = "image/jpeg"

            attachment = attachment_set_service.create_file_attachment(
                set_id=attachment_set.id,
                title="JPEG Image",
                file_data=sample_image_file,
                filename="photo.jpg",
            )

        # Test AttachmentResponseSchema serialization
        response = AttachmentResponseSchema.model_validate(attachment)
        assert response.preview_url is not None
        assert response.preview_url.startswith("/api/cas/")
        assert "content_type=image/jpeg" in response.preview_url

        # Test AttachmentListSchema serialization
        list_schema = AttachmentListSchema.model_validate(attachment)
        assert list_schema.preview_url is not None
        assert list_schema.preview_url == response.preview_url

    def test_preview_url_in_attachment_set_response(
        self,
        attachment_set_service: AttachmentSetService,
        attachment_set: AttachmentSet,
        sample_image_file,
        session: Session,
    ):
        """Test that preview_url is included when serializing attachment set with attachments."""
        from app.schemas.attachment_set import AttachmentSetResponseSchema

        with patch("magic.from_buffer") as mock_magic:
            mock_magic.return_value = "image/png"

            attachment_set_service.create_file_attachment(
                set_id=attachment_set.id,
                title="Image 1",
                file_data=sample_image_file,
                filename="image1.png",
            )

        # Refresh to get updated relationships
        session.refresh(attachment_set)

        # Serialize the entire attachment set
        response = AttachmentSetResponseSchema.model_validate(attachment_set)

        assert len(response.attachments) == 1
        assert response.attachments[0].preview_url is not None
        assert response.attachments[0].preview_url.startswith("/api/cas/")

    def test_preview_url_model_dump_includes_value(
        self,
        attachment_set_service: AttachmentSetService,
        attachment_set: AttachmentSet,
        sample_image_file,
    ):
        """Test that model_dump() includes preview_url in the output dictionary."""
        from app.schemas.attachment_set import AttachmentResponseSchema

        with patch("magic.from_buffer") as mock_magic:
            mock_magic.return_value = "image/png"

            attachment = attachment_set_service.create_file_attachment(
                set_id=attachment_set.id,
                title="PNG Image",
                file_data=sample_image_file,
                filename="image.png",
            )

        response = AttachmentResponseSchema.model_validate(attachment)
        dumped = response.model_dump()

        # Verify preview_url is in the dumped dictionary
        assert "preview_url" in dumped
        assert dumped["preview_url"] is not None
        assert dumped["preview_url"].startswith("/api/cas/")
        assert "content_type=image/png" in dumped["preview_url"]
