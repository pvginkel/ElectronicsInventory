"""Attachment set service for managing attachments across entities."""

import logging
from io import BytesIO
from typing import BinaryIO

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import Settings
from app.exceptions import InvalidOperationException, RecordNotFoundException
from app.models.attachment import Attachment, AttachmentType
from app.models.attachment_set import AttachmentSet
from app.services.base import BaseService
from app.services.image_service import ImageService
from app.services.s3_service import S3Service
from app.utils.mime_handling import detect_mime_type

logger = logging.getLogger(__name__)


class AttachmentSetService(BaseService):
    """Service for managing attachment sets and their attachments."""

    def __init__(self, db: Session, s3_service: S3Service, image_service: ImageService,
                 settings: Settings):
        """Initialize attachment set service with dependencies.

        Args:
            db: SQLAlchemy database session
            s3_service: S3 service for file operations
            image_service: Image processing service
            settings: Application settings
        """
        super().__init__(db)
        self.s3_service = s3_service
        self.image_service = image_service
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

    def _validate_file_size(self, file_size: int, is_image: bool = False) -> None:
        """Validate file size against limits.

        Args:
            file_size: Size of the file in bytes
            is_image: Whether this is an image file

        Raises:
            InvalidOperationException: If file size exceeds limits
        """
        if is_image:
            max_size = self.settings.MAX_IMAGE_SIZE
        else:
            max_size = self.settings.MAX_FILE_SIZE

        if file_size > max_size:
            max_mb = max_size / (1024 * 1024)
            raise InvalidOperationException("validate file size", f"file too large, maximum size: {max_mb:.1f}MB")

    def create_file_attachment(self, set_id: int, title: str, file_data: BinaryIO,
                                 filename: str) -> Attachment:
        """Create a file attachment (image or PDF) for an attachment set.

        Args:
            set_id: AttachmentSet ID
            title: Title/description of the attachment
            file_data: File data
            filename: Original filename

        Returns:
            Created Attachment instance

        Raises:
            RecordNotFoundException: If attachment set not found
            InvalidOperationException: If file validation fails or S3 upload fails
        """
        # Verify attachment set exists
        attachment_set = self.get_attachment_set(set_id)

        # Read and validate file data
        file_data.seek(0)
        file_bytes = file_data.read()
        file_size = len(file_bytes)

        # Detect actual content type using python-magic
        detected_type = detect_mime_type(file_bytes, None)

        # Validate file type
        allowed_image_types = self.settings.ALLOWED_IMAGE_TYPES
        allowed_file_types = self.settings.ALLOWED_FILE_TYPES
        all_allowed = allowed_image_types + allowed_file_types

        if detected_type not in all_allowed:
            raise InvalidOperationException("create file attachment", f"file type not allowed: {detected_type}")

        # Validate file size
        is_image = detected_type.startswith('image/')
        self._validate_file_size(file_size, is_image)

        # Determine attachment type
        if detected_type == 'application/pdf':
            attachment_type = AttachmentType.PDF
        elif is_image:
            attachment_type = AttachmentType.IMAGE
        else:
            raise InvalidOperationException("create file attachment", f"unsupported file type: {detected_type}")

        # Generate CAS key (content-addressable storage)
        s3_key = self.s3_service.generate_cas_key(file_bytes)

        # Create attachment instance
        attachment = Attachment(
            attachment_set_id=attachment_set.id,
            attachment_type=attachment_type,
            title=title,
            s3_key=s3_key,
            filename=filename,
            content_type=detected_type,
            file_size=file_size
        )

        self.db.add(attachment)
        self.db.flush()

        # Auto-set as cover if this is the first image and set has no cover
        if attachment_type == AttachmentType.IMAGE and not attachment_set.cover_attachment_id:
            attachment_set.cover_attachment_id = attachment.id
            self.db.flush()
            logger.info(f"Auto-assigned attachment {attachment.id} as cover for set {set_id}")

        # Upload to S3 (with deduplication check)
        if self.s3_service.file_exists(s3_key):
            logger.info(f"Content already exists in CAS for attachment {attachment.id}, skipping upload")
        else:
            # Database state is durable; perform external upload
            try:
                self.s3_service.upload_file(BytesIO(file_bytes), s3_key, detected_type)
            except InvalidOperationException:
                logger.exception(
                    "Failed to upload attachment to S3 for set %s (attachment_id=%s, key=%s)",
                    set_id,
                    attachment.id,
                    s3_key,
                )
                raise
            except Exception as exc:  # pragma: no cover - unexpected failure path
                logger.exception(
                    "Unexpected error uploading attachment to S3 for set %s (attachment_id=%s, key=%s)",
                    set_id,
                    attachment.id,
                    s3_key,
                )
                raise InvalidOperationException("upload attachment", "unexpected S3 upload error") from exc

        return attachment

    def create_url_attachment(self, set_id: int, title: str, url: str) -> Attachment:
        """Create a URL attachment for an attachment set.

        Args:
            set_id: AttachmentSet ID
            title: Title/description of the attachment
            url: URL to attach

        Returns:
            Created Attachment instance

        Raises:
            RecordNotFoundException: If attachment set not found
        """
        # Verify attachment set exists
        attachment_set = self.get_attachment_set(set_id)

        # Create URL attachment (no S3 content)
        attachment = Attachment(
            attachment_set_id=attachment_set.id,
            attachment_type=AttachmentType.URL,
            title=title,
            url=url
        )

        self.db.add(attachment)
        self.db.flush()

        return attachment

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
