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
from app.services.html_document_handler import HtmlDocumentHandler
from app.schemas.upload_document import UploadDocumentSchema, UploadDocumentContentSchema


class DocumentService(BaseService):
    """Service for managing part documents and attachments."""

    def __init__(self, db: Session, s3_service: S3Service, image_service: ImageService,
                 html_handler: HtmlDocumentHandler, download_cache_service: DownloadCacheService,
                 settings: Settings):
        """Initialize document service with dependencies.

        Args:
            db: SQLAlchemy database session
            s3_service: S3 service for file operations
            image_service: Image processing service
            html_handler: HTML document handler for preview extraction
            download_cache_service: Download cache service for URL content
        """
        super().__init__(db)
        self.s3_service = s3_service
        self.image_service = image_service
        self.html_handler = html_handler
        self.download_cache_service = download_cache_service
        self.settings = settings

    def process_upload_url(self, url: str) -> UploadDocumentSchema:
        """Process a URL to determine content and extract metadata.
        
        This is the main bottleneck for URL processing that determines:
        - What content to store in S3 (image, PDF, or preview image for HTML)
        - What metadata to extract (title, content type)
        
        Args:
            url: URL to process
            
        Returns:
            UploadDocumentSchema with processed content and metadata
        """
        # Download content
        content = self.download_cache_service.get_cached_content(url)
        if not content:
            raise InvalidOperationException("process URL", f"failed to download content from {url}")
        
        # Detect actual content type from bytes
        detected_type = magic.from_buffer(content, mime=True)
        
        # Extract filename from URL for non-HTML content
        from urllib.parse import urlparse
        import os
        parsed_url = urlparse(url)
        path = parsed_url.path
        filename = os.path.basename(path) if path else "upload"
        if not filename or filename == "/":
            filename = "upload"
        
        # Handle based on detected content type
        if detected_type == 'text/html':
            # Process as HTML document
            html_info = self.html_handler.process_html_content(content, url)
            
            # Create content schema for HTML
            content_schema = UploadDocumentContentSchema(
                content=content,
                content_type=detected_type
            )
            
            # Create preview schema if image found
            preview_schema = None
            if html_info.preview_image:
                preview_content, preview_type = html_info.preview_image
                preview_schema = UploadDocumentContentSchema(
                    content=preview_content,
                    content_type=preview_type
                )
            
            return UploadDocumentSchema(
                title=html_info.title or filename,
                content=content_schema,
                detected_type=detected_type,
                preview_image=preview_schema
            )
            
        elif detected_type.startswith('image/'):
            # Direct image - store as-is
            content_schema = UploadDocumentContentSchema(
                content=content,
                content_type=detected_type
            )
            
            return UploadDocumentSchema(
                title=filename,
                content=content_schema,
                detected_type=detected_type,
                preview_image=None  # Direct images don't have separate preview
            )
            
        elif detected_type == 'application/pdf':
            # PDF - store as-is
            content_schema = UploadDocumentContentSchema(
                content=content,
                content_type=detected_type
            )
            
            return UploadDocumentSchema(
                title=filename,
                content=content_schema,
                detected_type=detected_type,
                preview_image=None
            )
            
        else:
            # Generic file type - only store metadata, no S3 content
            content_schema = UploadDocumentContentSchema(
                content=content,
                content_type=detected_type
            )
            
            return UploadDocumentSchema(
                title=filename,
                content=content_schema,
                detected_type=detected_type,
                preview_image=None
            )

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

        # Use python-magic to detect actual content type (ignore provided content_type)
        validated_content_type = magic.from_buffer(file_bytes, mime=True)
        
        # Validate against allowed types
        allowed_image_types = self.settings.ALLOWED_IMAGE_TYPES
        allowed_file_types = self.settings.ALLOWED_FILE_TYPES
        all_allowed = allowed_image_types + allowed_file_types
        
        if validated_content_type not in all_allowed:
            raise InvalidOperationException("create file attachment", f"file type not allowed: {validated_content_type}")
        
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

        # Store images verbatim without conversion
        # No longer process/convert images

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
            file_size=file_size
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

        # Process URL to determine content
        try:
            upload_doc = self.process_upload_url(url)
        except Exception as e:
            raise InvalidOperationException("create URL attachment", f"failed to process URL: {str(e)}") from e

        # Determine what to store in S3 and attachment type
        s3_key = None
        content_type = None
        file_size = 0
        
        if upload_doc.detected_type.startswith('image/'):
            # Direct image URL - store the image
            attachment_type = AttachmentType.IMAGE
            s3_key = self.s3_service.generate_s3_key(part.id, upload_doc.title)
            file_data = BytesIO(upload_doc.content.content)
            self.s3_service.upload_file(file_data, s3_key, upload_doc.content.content_type)
            content_type = upload_doc.content.content_type
            file_size = len(upload_doc.content.content)
            
        elif upload_doc.detected_type == 'application/pdf':
            # Direct PDF URL - store the PDF
            attachment_type = AttachmentType.PDF
            s3_key = self.s3_service.generate_s3_key(part.id, upload_doc.title)
            file_data = BytesIO(upload_doc.content.content)
            self.s3_service.upload_file(file_data, s3_key, upload_doc.content.content_type)
            content_type = upload_doc.content.content_type
            file_size = len(upload_doc.content.content)
            
        elif upload_doc.detected_type == 'text/html' and upload_doc.preview_image:
            # HTML with preview image - store the preview
            attachment_type = AttachmentType.URL
            s3_key = self.s3_service.generate_s3_key(part.id, "preview.jpg")
            file_data = BytesIO(upload_doc.preview_image.content)
            self.s3_service.upload_file(file_data, s3_key, upload_doc.preview_image.content_type)
            content_type = upload_doc.preview_image.content_type
            file_size = len(upload_doc.preview_image.content)
            
        else:
            # Other content or HTML without preview - no S3 storage
            attachment_type = AttachmentType.URL
            s3_key = None
            content_type = None
            file_size = 0

        # Use provided title or extracted title
        final_title = title or upload_doc.title

        # Create attachment record
        attachment = PartAttachment(
            part_id=part.id,
            attachment_type=attachment_type,
            title=final_title,
            s3_key=s3_key,
            url=url,
            content_type=content_type,
            file_size=file_size
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
        if attachment.attachment_type == AttachmentType.IMAGE:
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

        if attachment.attachment_type == AttachmentType.PDF and attachment.s3_key:
            # Download PDF from S3
            file_data = self.s3_service.download_file(attachment.s3_key)
            return file_data, attachment.content_type, attachment.filename
        elif attachment.attachment_type == AttachmentType.PDF:
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

        # Check if content_type starts with 'image/' and s3_key exists
        if attachment.content_type and attachment.content_type.startswith('image/') and attachment.s3_key:
            # Generate/retrieve thumbnail from S3 content
            thumbnail_path = self.image_service.get_thumbnail_path(attachment.id, attachment.s3_key, size)
            return thumbnail_path, 'image/jpeg'
        elif attachment.attachment_type == AttachmentType.PDF:
            # Return PDF icon SVG
            pdf_data, content_type = self.image_service.get_pdf_icon_data()
            return pdf_data.decode('utf-8'), content_type
        elif attachment.attachment_type == AttachmentType.URL:
            # Return link icon SVG
            link_data, content_type = self.image_service.get_link_icon_data()
            return link_data.decode('utf-8'), content_type
        else:
            raise InvalidOperationException("get attachment thumbnail", "thumbnail not available for this attachment type")
    
    def get_preview_image(self, url: str) -> tuple[bytes, str] | None:
        """Get preview image for a URL.
        
        Replaces URLThumbnailService.get_preview_image_url functionality.
        
        Args:
            url: URL to get preview for
            
        Returns:
            Tuple of (image_bytes, content_type) or None if no preview available
        """
        try:
            # Process URL to get metadata
            upload_doc = self.process_upload_url(url)
            
            # Return appropriate image data
            if upload_doc.preview_image:
                # HTML with preview image
                return (upload_doc.preview_image.content, upload_doc.preview_image.content_type)
            elif upload_doc.detected_type.startswith('image/'):
                # Direct image URL
                return (upload_doc.content.content, upload_doc.content.content_type)
            else:
                # No preview available
                return None
        except Exception:
            # Failed to get preview
            return None

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
        # Images are identified by content_type starting with 'image/'
        return attachment.content_type and attachment.content_type.startswith('image/')
