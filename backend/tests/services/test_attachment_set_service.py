"""Tests for AttachmentSetService."""

import io
from unittest.mock import MagicMock

import pytest
from flask import Flask
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


def create_test_attachment(
    session: Session,
    attachment_set: AttachmentSet,
    attachment_type: AttachmentType = AttachmentType.URL,
    title: str = "Test Attachment",
    url: str | None = "https://example.com",
    s3_key: str | None = None,
    filename: str | None = None,
    content_type: str | None = None,
    file_size: int | None = None,
) -> Attachment:
    """Helper to create attachments directly in the database for testing."""
    attachment = Attachment(
        attachment_set_id=attachment_set.id,
        attachment_type=attachment_type,
        title=title,
        url=url,
        s3_key=s3_key,
        filename=filename,
        content_type=content_type,
        file_size=file_size,
    )
    session.add(attachment)
    session.flush()
    return attachment


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


class TestGetAttachments:
    """Tests for get_attachments method."""

    def test_get_attachments_success(
        self, attachment_set_service: AttachmentSetService, attachment_set: AttachmentSet, session: Session
    ):
        """Test retrieving attachments from a set."""
        # Create some attachments
        create_test_attachment(session, attachment_set, title="URL 1", url="https://example.com/1")
        create_test_attachment(session, attachment_set, title="URL 2", url="https://example.com/2")

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
        self, attachment_set_service: AttachmentSetService, attachment_set: AttachmentSet, session: Session
    ):
        """Test retrieving a specific attachment."""
        created = create_test_attachment(session, attachment_set, title="Test")

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
        attachment = create_test_attachment(session, set1, title="Test")

        # Try to get attachment using set2's ID
        with pytest.raises(InvalidOperationException) as exc_info:
            attachment_set_service.get_attachment(set2.id, attachment.id)

        assert "does not belong to set" in str(exc_info.value)


class TestUpdateAttachment:
    """Tests for update_attachment method."""

    def test_update_attachment_title(
        self, attachment_set_service: AttachmentSetService, attachment_set: AttachmentSet, session: Session
    ):
        """Test updating attachment title."""
        attachment = create_test_attachment(session, attachment_set, title="Old Title")

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
        attachment = create_test_attachment(session, attachment_set, title="To Delete")
        attachment_id = attachment.id

        attachment_set_service.delete_attachment(attachment_set.id, attachment_id)

        # Verify deleted
        deleted = session.get(Attachment, attachment_id)
        assert deleted is None

    def test_delete_attachment_cover_reassignment(
        self,
        attachment_set_service: AttachmentSetService,
        attachment_set: AttachmentSet,
        session: Session,
    ):
        """Test deleting cover image reassigns cover to next image."""
        # Create first image (set as cover)
        first = create_test_attachment(
            session, attachment_set,
            attachment_type=AttachmentType.IMAGE,
            title="First",
            s3_key="cas/first",
            content_type="image/png",
        )
        attachment_set.cover_attachment_id = first.id
        session.flush()

        # Create second image
        second = create_test_attachment(
            session, attachment_set,
            attachment_type=AttachmentType.IMAGE,
            title="Second",
            s3_key="cas/second",
            content_type="image/png",
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
        session: Session,
    ):
        """Test deleting last image clears cover."""
        attachment = create_test_attachment(
            session, attachment_set,
            attachment_type=AttachmentType.IMAGE,
            title="Only Image",
            s3_key="cas/only",
            content_type="image/png",
        )
        attachment_set.cover_attachment_id = attachment.id
        session.flush()

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
        session: Session,
    ):
        """Test deleting non-cover attachment doesn't affect cover."""
        first = create_test_attachment(
            session, attachment_set,
            attachment_type=AttachmentType.IMAGE,
            title="First",
            s3_key="cas/first",
            content_type="image/png",
        )
        attachment_set.cover_attachment_id = first.id
        session.flush()

        second = create_test_attachment(
            session, attachment_set,
            attachment_type=AttachmentType.IMAGE,
            title="Second",
            s3_key="cas/second",
            content_type="image/png",
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
        attachment = create_test_attachment(session, attachment_set, title="Cover")

        result = attachment_set_service.set_cover_attachment(
            attachment_set.id, attachment.id
        )

        assert result.cover_attachment_id == attachment.id

    def test_clear_cover_attachment(
        self,
        attachment_set_service: AttachmentSetService,
        attachment_set: AttachmentSet,
        session: Session,
    ):
        """Test clearing cover attachment."""
        attachment = create_test_attachment(
            session, attachment_set,
            attachment_type=AttachmentType.IMAGE,
            title="Image",
            s3_key="cas/image",
            content_type="image/png",
        )
        attachment_set.cover_attachment_id = attachment.id
        session.flush()

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

        attachment = create_test_attachment(session, set1, title="Test")

        with pytest.raises(InvalidOperationException) as exc_info:
            attachment_set_service.set_cover_attachment(set2.id, attachment.id)

        assert "does not belong to set" in str(exc_info.value)


class TestGetAttachmentFileData:
    """Tests for get_attachment_file_data method."""

    def test_get_file_data_success(
        self,
        attachment_set_service: AttachmentSetService,
        attachment_set: AttachmentSet,
        session: Session,
        mock_s3_service,
    ):
        """Test retrieving file data for attachment with S3 content."""
        attachment = create_test_attachment(
            session, attachment_set,
            attachment_type=AttachmentType.IMAGE,
            title="Image",
            s3_key="cas/image",
            filename="image.png",
            content_type="image/png",
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
        self, attachment_set_service: AttachmentSetService, attachment_set: AttachmentSet, session: Session
    ):
        """Test retrieving file data for URL attachment returns None."""
        attachment = create_test_attachment(session, attachment_set, title="URL")

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

        attachment = create_test_attachment(session, set1, title="Test")

        with pytest.raises(InvalidOperationException) as exc_info:
            attachment_set_service.get_attachment_file_data(set2.id, attachment.id)

        assert "does not belong to set" in str(exc_info.value)


class TestAttachmentPreviewUrl:
    """Tests for attachment preview_url property behavior."""

    def test_image_attachment_has_preview_url(
        self,
        attachment_set: AttachmentSet,
        session: Session,
    ):
        """Test that image attachments have preview_url set to the CAS URL."""
        attachment = create_test_attachment(
            session, attachment_set,
            attachment_type=AttachmentType.IMAGE,
            title="Test Image",
            url=None,  # Images don't have URL, they have s3_key
            s3_key="cas/0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
            filename="test.png",
            content_type="image/png",
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
        attachment_set: AttachmentSet,
        session: Session,
    ):
        """Test that PDF attachments have preview_url set to the PDF icon."""
        attachment = create_test_attachment(
            session, attachment_set,
            attachment_type=AttachmentType.PDF,
            title="Test PDF",
            url=None,  # PDFs don't have URL, they have s3_key
            s3_key="cas/0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
            filename="test.pdf",
            content_type="application/pdf",
        )

        # Verify has_preview is False for PDFs
        assert attachment.has_preview is False

        # Verify preview_url is set to PDF icon
        assert attachment.preview_url is not None
        assert attachment.preview_url.startswith("/api/icons/pdf")
        assert "version=" in attachment.preview_url

    def test_url_attachment_has_no_preview_url(
        self,
        attachment_set: AttachmentSet,
        session: Session,
    ):
        """Test that URL attachments have no preview_url."""
        attachment = create_test_attachment(
            session, attachment_set,
            attachment_type=AttachmentType.URL,
            title="External Link",
            url="https://example.com/document",
        )

        # Verify has_preview is False for URLs
        assert attachment.has_preview is False

        # Verify preview_url is None
        assert attachment.preview_url is None

    def test_image_preview_url_serialized_in_response_schema(
        self,
        attachment_set: AttachmentSet,
        session: Session,
    ):
        """Test that preview_url is included when serializing to response schema."""
        from app.schemas.attachment_set import (
            AttachmentListSchema,
            AttachmentResponseSchema,
        )

        attachment = create_test_attachment(
            session, attachment_set,
            attachment_type=AttachmentType.IMAGE,
            title="JPEG Image",
            url=None,  # Images don't have URL, they have s3_key
            s3_key="cas/0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
            filename="photo.jpg",
            content_type="image/jpeg",
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
        attachment_set: AttachmentSet,
        session: Session,
    ):
        """Test that preview_url is included when serializing attachment set with attachments."""
        from app.schemas.attachment_set import AttachmentSetResponseSchema

        create_test_attachment(
            session, attachment_set,
            attachment_type=AttachmentType.IMAGE,
            title="Image 1",
            url=None,  # Images don't have URL, they have s3_key
            s3_key="cas/0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
            filename="image1.png",
            content_type="image/png",
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
        attachment_set: AttachmentSet,
        session: Session,
    ):
        """Test that model_dump() includes preview_url in the output dictionary."""
        from app.schemas.attachment_set import AttachmentResponseSchema

        attachment = create_test_attachment(
            session, attachment_set,
            attachment_type=AttachmentType.IMAGE,
            title="PNG Image",
            url=None,  # Images don't have URL, they have s3_key
            s3_key="cas/0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
            filename="image.png",
            content_type="image/png",
        )

        response = AttachmentResponseSchema.model_validate(attachment)
        dumped = response.model_dump()

        # Verify preview_url is in the dumped dictionary
        assert "preview_url" in dumped
        assert dumped["preview_url"] is not None
        assert dumped["preview_url"].startswith("/api/cas/")
        assert "content_type=image/png" in dumped["preview_url"]
