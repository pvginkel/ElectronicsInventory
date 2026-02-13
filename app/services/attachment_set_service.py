"""Attachment set service for managing attachments across entities."""

import logging
from io import BytesIO

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import Settings
from app.exceptions import InvalidOperationException, RecordNotFoundException
from app.models.attachment import Attachment, AttachmentType
from app.models.attachment_set import AttachmentSet
from app.services.cas_image_service import CasImageService
from app.services.s3_service import S3Service

logger = logging.getLogger(__name__)


class AttachmentSetService:
    """Service for managing attachment sets and their attachments."""

    def __init__(self, db: Session, s3_service: S3Service, cas_image_service: CasImageService,
                 settings: Settings):
        """Initialize attachment set service with dependencies.

        Args:
            db: SQLAlchemy database session
            s3_service: S3 service for file operations
            cas_image_service: CAS image processing service
            settings: Application settings
        """
        self.db = db
        self.s3_service = s3_service
        self.cas_image_service = cas_image_service
        self.settings = settings

    def create_attachment_set(self) -> AttachmentSet:
        """Create a new empty attachment set.

        Returns:
            Created AttachmentSet instance

        This method is called during Part and Kit creation to ensure every
        entity has an attachment set from the start.
        """
        attachment_set = AttachmentSet()
        self.db.add(attachment_set)
        self.db.flush()
        return attachment_set

    def get_attachment_set(self, set_id: int) -> AttachmentSet:
        """Get attachment set by ID.

        Args:
            set_id: ID of the attachment set

        Returns:
            AttachmentSet instance

        Raises:
            RecordNotFoundException: If attachment set not found
        """
        stmt = select(AttachmentSet).where(AttachmentSet.id == set_id)
        attachment_set = self.db.scalar(stmt)
        if not attachment_set:
            raise RecordNotFoundException("AttachmentSet", set_id)
        return attachment_set

    def get_attachments(self, set_id: int) -> list[Attachment]:
        """Get all attachments for an attachment set.

        Args:
            set_id: AttachmentSet ID

        Returns:
            List of Attachment instances

        Raises:
            RecordNotFoundException: If attachment set not found
        """
        attachment_set = self.get_attachment_set(set_id)
        return attachment_set.attachments

    def get_attachment(self, set_id: int, attachment_id: int) -> Attachment:
        """Get a specific attachment and verify ownership.

        Args:
            set_id: AttachmentSet ID
            attachment_id: Attachment ID

        Returns:
            Attachment instance

        Raises:
            RecordNotFoundException: If attachment not found
            InvalidOperationException: If attachment doesn't belong to set
        """
        stmt = select(Attachment).where(Attachment.id == attachment_id)
        attachment = self.db.scalar(stmt)
        if not attachment:
            raise RecordNotFoundException("Attachment", attachment_id)

        # Verify ownership
        if attachment.attachment_set_id != set_id:
            raise InvalidOperationException(
                "get attachment",
                f"attachment {attachment_id} does not belong to set {set_id}"
            )

        return attachment

    def update_attachment(self, set_id: int, attachment_id: int, title: str | None = None) -> Attachment:
        """Update attachment metadata.

        Args:
            set_id: AttachmentSet ID
            attachment_id: Attachment ID
            title: New title (optional)

        Returns:
            Updated Attachment instance

        Raises:
            RecordNotFoundException: If attachment or set not found
            InvalidOperationException: If attachment doesn't belong to set
        """
        attachment = self.get_attachment(set_id, attachment_id)

        if title is not None:
            attachment.title = title

        self.db.flush()
        return attachment

    def delete_attachment(self, set_id: int, attachment_id: int) -> None:
        """Delete attachment and reassign cover if necessary.

        Args:
            set_id: AttachmentSet ID
            attachment_id: Attachment ID

        Raises:
            RecordNotFoundException: If attachment or set not found
            InvalidOperationException: If attachment doesn't belong to set
        """
        attachment = self.get_attachment(set_id, attachment_id)
        attachment_set = self.get_attachment_set(set_id)

        # Check if deleting the current cover
        is_cover = attachment_set.cover_attachment_id == attachment_id

        if is_cover:
            # Find next image attachment to use as cover
            stmt = select(Attachment).where(
                Attachment.attachment_set_id == set_id,
                Attachment.attachment_type == AttachmentType.IMAGE,
                Attachment.id != attachment_id
            ).order_by(Attachment.created_at)

            new_cover = self.db.scalar(stmt)
            attachment_set.cover_attachment_id = new_cover.id if new_cover else None
            self.db.flush()

            if new_cover:
                logger.info(f"Reassigned cover from {attachment_id} to {new_cover.id} for set {set_id}")
            else:
                logger.info(f"Cleared cover for set {set_id} (no remaining images)")

        # Delete attachment
        self.db.delete(attachment)
        self.db.flush()

        # Note: With CAS, we don't delete S3 objects when deleting attachments because:
        # 1. CAS objects may be shared by multiple attachments (deduplication)
        # 2. Orphaned CAS objects can be cleaned up separately if needed

    def set_cover_attachment(self, set_id: int, attachment_id: int | None) -> AttachmentSet:
        """Set or clear cover attachment for a set.

        Args:
            set_id: AttachmentSet ID
            attachment_id: Attachment ID or None to clear cover

        Returns:
            Updated AttachmentSet instance

        Raises:
            RecordNotFoundException: If set or attachment not found
            InvalidOperationException: If attachment doesn't belong to set
        """
        attachment_set = self.get_attachment_set(set_id)

        if attachment_id is not None:
            # Verify attachment exists and belongs to this set
            _ = self.get_attachment(set_id, attachment_id)

        attachment_set.cover_attachment_id = attachment_id
        self.db.flush()

        return attachment_set

    def get_attachment_file_data(self, set_id: int, attachment_id: int) -> tuple[BytesIO, str, str] | None:
        """Get attachment file data for download.

        Args:
            set_id: AttachmentSet ID
            attachment_id: Attachment ID

        Returns:
            Tuple of (file_data, content_type, filename) or None if no file data available

        Raises:
            RecordNotFoundException: If attachment or set not found
            InvalidOperationException: If attachment doesn't belong to set
        """
        # Verify ownership
        attachment = self.get_attachment(set_id, attachment_id)

        if attachment.s3_key:
            # Download content from S3
            file_data = self.s3_service.download_file(attachment.s3_key)
            content_type = attachment.content_type or "application/octet-stream"
            filename = attachment.filename or attachment.title
            return file_data, content_type, filename
        else:
            # No S3 content available (e.g., URL attachment)
            return None
