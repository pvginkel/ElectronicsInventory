"""Document service for managing part attachments."""

from io import BytesIO
from typing import BinaryIO

import magic
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import Settings
from app.exceptions import InvalidOperationException, RecordNotFoundException
from app.models.part import Part
from app.models.part_attachment import AttachmentType, PartAttachment
from app.services.base import BaseService
from app.services.download_cache_service import DownloadCacheService
from app.services.image_service import ImageService
from app.services.s3_service import S3Service
from app.services.url_thumbnail_service import URLThumbnailService


class DocumentService(BaseService):
    """Service for managing part documents and attachments."""

    def __init__(self, db: Session, s3_service: S3Service, image_service: ImageService,
                 url_service: URLThumbnailService, download_cache_service: DownloadCacheService,
                 settings: Settings):
        """Initialize document service with dependencies.

        Args:
            db: SQLAlchemy database session
            s3_service: S3 service for file operations
            image_service: Image processing service
            url_service: URL thumbnail extraction service
            download_cache_service: Download cache service for URL content
        """
        super().__init__(db)
        self.s3_service = s3_service
        self.image_service = image_service
        self.url_service = url_service
        self.download_cache_service = download_cache_service
        self.settings = settings

    def _validate_file_type(self, content_type: str, file_data: bytes) -> str:
        """Validate file type using python-magic and MIME type.

        Args:
            content_type: Declared MIME type
            file_data: File data for validation

        Returns:
            Validated content type

        Raises:
            InvalidOperationException: If file type is not allowed
        """
        try:
            # Use python-magic to detect actual file type
            detected_type = magic.from_buffer(file_data, mime=True)

            # Allowed file types from config
            allowed_image_types = self.settings.ALLOWED_IMAGE_TYPES
            allowed_file_types = self.settings.ALLOWED_FILE_TYPES
            all_allowed = allowed_image_types + allowed_file_types

            # Use detected type if it's more specific/reliable
            final_type = detected_type if detected_type in all_allowed else content_type

            if final_type not in all_allowed:
                raise InvalidOperationException("validate file type", f"file type not allowed: {final_type}")

            return final_type

        except Exception as e:
            raise InvalidOperationException("validate file type", f"validation failed: {str(e)}") from e

    def _validate_file_size(self, file_size: int, is_image: bool = False):
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

    def create_file_attachment(self, part_key: str, title: str, file_data: BinaryIO, filename: str, content_type: str) -> PartAttachment:
        """Create a file attachment (image or PDF) for a part.

        Args:
            part_key: Part key to attach to
            title: Title/description of the attachment
            file_data: File data
            filename: Original filename
            content_type: MIME type of the file

        Returns:
            Created PartAttachment

        Raises:
            RecordNotFoundException: If part not found
            InvalidOperationException: If file validation fails
        """
        # Get the part
        stmt = select(Part).where(Part.key == part_key)
        part = self.db.scalar(stmt)
        if not part:
            raise RecordNotFoundException("Part", part_key)

        # Read file data for validation
        file_data.seek(0)
        file_bytes = file_data.read()
        file_size = len(file_bytes)

        # Validate file type and size
        validated_content_type = self._validate_file_type(content_type, file_bytes)
        is_image = validated_content_type.startswith('image/')
        self._validate_file_size(file_size, is_image)

        # Determine attachment type
        if validated_content_type == 'application/pdf':
            attachment_type = AttachmentType.PDF
        elif is_image:
            attachment_type = AttachmentType.IMAGE
        else:
            raise InvalidOperationException("create file attachment", f"unsupported file type: {validated_content_type}")

        # Generate S3 key
        s3_key = self.s3_service.generate_s3_key(part.id, filename)

        # Process image if it's an image file
        attachment_metadata = {}
        if attachment_type == AttachmentType.IMAGE:
            file_data = BytesIO(file_bytes)
            processed_image, image_metadata = self.image_service.process_uploaded_image(file_data)
            file_bytes = processed_image.read()
            file_size = len(file_bytes)
            attachment_metadata.update(image_metadata)

        # Upload to S3
        file_data = BytesIO(file_bytes)
        self.s3_service.upload_file(file_data, s3_key, validated_content_type)

        # Create attachment record
        attachment = PartAttachment(
            part_id=part.id,
            attachment_type=attachment_type,
            title=title,
            s3_key=s3_key,
            filename=filename,
            content_type=validated_content_type,
            file_size=file_size,
            attachment_metadata=attachment_metadata
        )

        self.db.add(attachment)
        self.db.flush()

        # Auto-set as cover image if this is the first image attachment and part has no cover
        if attachment_type == AttachmentType.IMAGE and not part.cover_attachment_id:
            part.cover_attachment_id = attachment.id
            self.db.flush()

        return attachment

    def create_url_attachment(self, part_key: str, title: str, url: str) -> PartAttachment:
        """Create a URL attachment with thumbnail extraction.

        Args:
            part_key: Part key to attach to
            title: Title/description of the attachment
            url: URL to attach

        Returns:
            Created PartAttachment

        Raises:
            RecordNotFoundException: If part not found
            InvalidOperationException: If URL processing fails
        """
        # Get the part
        stmt = select(Part).where(Part.key == part_key)
        part = self.db.scalar(stmt)
        if not part:
            raise RecordNotFoundException("Part", part_key)

        # Validate URL
        if not self.url_service.validate_url(url):
            raise InvalidOperationException("create URL attachment", f"invalid URL: {url}")

        # Download and store thumbnail
        try:
            s3_key, content_type, file_size, metadata = self.url_service.download_and_store_thumbnail(url, part.id)
        except Exception as e:
            raise InvalidOperationException("create URL attachment", f"failed to process URL: {str(e)}") from e

        # Determine attachment type based on content type (same logic as preview)
        if metadata.get('content_type') == 'image':
            attachment_type = AttachmentType.IMAGE
        elif metadata.get('content_type') == 'pdf':
            attachment_type = AttachmentType.PDF
        else:
            attachment_type = AttachmentType.URL

        # Determine if this attachment has an image and cache it in metadata
        has_image = self._attachment_has_image_from_metadata(attachment_type, s3_key, metadata)
        if metadata:
            metadata['has_image'] = has_image
        else:
            metadata = {'has_image': has_image}

        # Create attachment record
        attachment = PartAttachment(
            part_id=part.id,
            attachment_type=attachment_type,
            title=title,
            s3_key=s3_key,
            url=url,
            content_type=content_type,
            file_size=file_size,
            attachment_metadata=metadata
        )

        self.db.add(attachment)
        self.db.flush()

        # Auto-set as cover image if this is the first image attachment and part has no cover
        if attachment_type == AttachmentType.IMAGE and not part.cover_attachment_id:
            part.cover_attachment_id = attachment.id
            self.db.flush()

        return attachment

    def get_attachment(self, attachment_id: int) -> PartAttachment:
        """Get attachment by ID.

        Args:
            attachment_id: ID of the attachment

        Returns:
            PartAttachment

        Raises:
            RecordNotFoundException: If attachment not found
        """
        stmt = select(PartAttachment).where(PartAttachment.id == attachment_id)
        attachment = self.db.scalar(stmt)
        if not attachment:
            raise RecordNotFoundException("Attachment", attachment_id)
        return attachment

    def get_part_attachments(self, part_key: str) -> list[PartAttachment]:
        """Get all attachments for a part.

        Args:
            part_key: Part key

        Returns:
            List of PartAttachment

        Raises:
            RecordNotFoundException: If part not found
        """
        stmt = select(Part).where(Part.key == part_key)
        part = self.db.scalar(stmt)
        if not part:
            raise RecordNotFoundException("Part", part_key)

        return part.attachments

    def update_attachment(self, attachment_id: int, title: str | None = None) -> PartAttachment:
        """Update attachment metadata.

        Args:
            attachment_id: ID of the attachment
            title: New title (optional)

        Returns:
            Updated PartAttachment

        Raises:
            RecordNotFoundException: If attachment not found
        """
        attachment = self.get_attachment(attachment_id)

        attachment.title = title

        self.db.flush()
        return attachment

    def delete_attachment(self, attachment_id: int):
        """Delete attachment and clean up files.

        Args:
            attachment_id: ID of the attachment

        Raises:
            RecordNotFoundException: If attachment not found
        """
        attachment = self.get_attachment(attachment_id)
        part = attachment.part

        # Check if this attachment is the current cover image
        is_cover_image = (part.cover_attachment_id == attachment_id)

        # Clean up S3 file if exists
        if attachment.s3_key:
            try:
                self.s3_service.delete_file(attachment.s3_key)
            except InvalidOperationException:
                pass  # File might not exist, continue with deletion

        # Clean up thumbnails if it's an image
        if attachment.is_image:
            self.image_service.cleanup_thumbnails(attachment.id)

        # If we just deleted the cover image, find a new one
        if is_cover_image:
            # Find the oldest remaining image attachment for this part (excluding the one being deleted)
            stmt = select(PartAttachment).where(
                PartAttachment.part_id == part.id,
                PartAttachment.attachment_type == AttachmentType.IMAGE,
                PartAttachment.id != attachment_id
            ).order_by(PartAttachment.created_at)

            new_cover = self.db.scalar(stmt)
            part.cover_attachment_id = new_cover.id if new_cover else None
            self.db.flush()

        # Remove from database
        self.db.delete(attachment)
        self.db.flush()

    def get_attachment_file_data(self, attachment_id: int) -> tuple[BytesIO, str, str]:
        """Get attachment file data for download.

        Args:
            attachment_id: ID of the attachment

        Returns:
            Tuple of (file_data, content_type, filename)

        Raises:
            RecordNotFoundException: If attachment not found
            InvalidOperationException: If file retrieval fails
        """
        attachment = self.get_attachment(attachment_id)

        if attachment.is_pdf and attachment.s3_key:
            # Download PDF from S3
            file_data = self.s3_service.download_file(attachment.s3_key)
            return file_data, attachment.content_type, attachment.filename
        elif attachment.is_pdf:
            # Return PDF icon for PDFs without stored files
            pdf_data, content_type = self.image_service.get_pdf_icon_data()
            return BytesIO(pdf_data), content_type, "pdf_icon.svg"
        elif attachment.s3_key:
            # Download image from S3
            file_data = self.s3_service.download_file(attachment.s3_key)
            return file_data, attachment.content_type, attachment.filename
        else:
            raise InvalidOperationException("get attachment file data", "no file data available for attachment")

    def get_attachment_thumbnail(self, attachment_id: int, size: int = 150) -> tuple[str, str]:
        """Get thumbnail for attachment.

        Args:
            attachment_id: ID of the attachment
            size: Thumbnail size in pixels

        Returns:
            Tuple of (thumbnail_path, content_type)

        Raises:
            RecordNotFoundException: If attachment not found
            InvalidOperationException: If thumbnail generation fails
        """
        attachment = self.get_attachment(attachment_id)

        if attachment.is_pdf:
            # Return PDF icon
            pdf_data, content_type = self.image_service.get_pdf_icon_data()
            # For PDFs, we return the SVG data directly
            return pdf_data.decode('utf-8'), content_type
        elif attachment.is_image and attachment.s3_key:
            # Generate thumbnail for image
            thumbnail_path = self.image_service.get_thumbnail_path(attachment.id, attachment.s3_key, size)
            return thumbnail_path, 'image/jpeg'
        elif attachment.is_url:
            # For URL attachments
            if attachment.s3_key:
                # If we have a stored thumbnail, use it
                thumbnail_path = self.image_service.get_thumbnail_path(attachment.id, attachment.s3_key, size)
                return thumbnail_path, 'image/jpeg'
            else:
                # No stored thumbnail, return link icon
                link_data, content_type = self.image_service.get_link_icon_data()
                return link_data.decode('utf-8'), content_type
        else:
            raise InvalidOperationException("get attachment thumbnail", "thumbnail not available for this attachment type")

    def set_part_cover_attachment(self, part_key: str, attachment_id: int | None):
        """Set or clear part cover attachment.

        Args:
            part_key: Part key
            attachment_id: Attachment ID or None to clear

        Raises:
            RecordNotFoundException: If part or attachment not found
            InvalidOperationException: If attachment doesn't belong to part
        """
        stmt = select(Part).where(Part.key == part_key)
        part = self.db.scalar(stmt)
        if not part:
            raise RecordNotFoundException("Part", part_key)

        if attachment_id is not None:
            # Verify attachment exists and belongs to this part
            attachment = self.get_attachment(attachment_id)
            if attachment.part_id != part.id:
                raise InvalidOperationException("set part cover attachment", "attachment does not belong to this part")

        part.cover_attachment_id = attachment_id
        self.db.commit()
        # Refresh the part to reload the relationship
        self.db.refresh(part)

    def get_part_cover_attachment(self, part_key: str) -> PartAttachment | None:
        """Get part cover attachment.

        Args:
            part_key: Part key

        Returns:
            PartAttachment or None if no cover set

        Raises:
            RecordNotFoundException: If part not found
        """
        stmt = select(Part).where(Part.key == part_key)
        part = self.db.scalar(stmt)
        if not part:
            raise RecordNotFoundException("Part", part_key)

        return part.cover_attachment

    def _attachment_has_image_from_metadata(self, attachment_type: AttachmentType, s3_key: str | None, metadata: dict | None) -> bool:
        """Determine if an attachment has an associated image based on type and metadata.

        Args:
            attachment_type: Type of the attachment
            s3_key: S3 key if image is stored
            metadata: Attachment metadata

        Returns:
            True if attachment has an associated image
        """
        if attachment_type == AttachmentType.IMAGE:
            return True
        elif attachment_type == AttachmentType.PDF:
            return False
        else:  # URL attachment
            # If we have a stored thumbnail
            if s3_key:
                return True
            return False

    def attachment_has_image(self, attachment_id: int) -> bool:
        """Check if an attachment has an associated image for display.

        Args:
            attachment_id: ID of the attachment

        Returns:
            True if attachment has an associated image

        Raises:
            RecordNotFoundException: If attachment not found
        """
        attachment = self.get_attachment(attachment_id)
        return attachment.has_image
