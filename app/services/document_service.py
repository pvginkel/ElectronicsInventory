"""Document service for managing part attachments."""

import hashlib
import logging
from collections.abc import Callable
from dataclasses import dataclass
from io import BytesIO
from typing import BinaryIO

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import Settings
from app.exceptions import InvalidOperationException, RecordNotFoundException
from app.models.part import Part
from app.models.part_attachment import AttachmentType, PartAttachment
from app.schemas.upload_document import DocumentContentSchema, UploadDocumentSchema
from app.services.base import BaseService
from app.services.download_cache_service import DownloadCacheService
from app.services.html_document_handler import HtmlDocumentHandler
from app.services.image_service import ImageService
from app.services.s3_service import S3Service
from app.services.url_transformers import URLInterceptorRegistry
from app.utils.mime_handling import detect_mime_type
from app.utils.text_utils import truncate_with_ellipsis
from app.utils.url_utils import get_filename_from_url


@dataclass(frozen=True)
class AttachmentThumbnail:
    """Metadata wrapper for attachment thumbnails."""

    content_type: str
    etag: str
    svg_data: str | None
    _image_loader: Callable[[], str] | None

    @property
    def is_svg(self) -> bool:
        return self.svg_data is not None

    def resolve_image_path(self) -> str:
        if self._image_loader is None:
            raise InvalidOperationException("get attachment thumbnail", "no image loader available")
        return self._image_loader()

logger = logging.getLogger(__name__)


class DocumentService(BaseService):
    """Service for managing part documents and attachments."""

    def __init__(self, db: Session, s3_service: S3Service, image_service: ImageService,
                 html_handler: HtmlDocumentHandler, download_cache_service: DownloadCacheService,
                 settings: Settings, url_interceptor_registry: URLInterceptorRegistry):
        """Initialize document service with dependencies.

        Args:
            db: SQLAlchemy database session
            s3_service: S3 service for file operations
            image_service: Image processing service
            html_handler: HTML document handler for preview extraction
            download_cache_service: Download cache service for URL content
            url_interceptor_registry: Registry for URL interceptors
        """
        super().__init__(db)
        self.s3_service = s3_service
        self.image_service = image_service
        self.html_handler = html_handler
        self.download_cache_service = download_cache_service
        self.settings = settings
        self.url_interceptor_registry = url_interceptor_registry

    def _mime_type_to_attachment_type(self, mime_type: str) -> AttachmentType | None:
        """Convert MIME type to AttachmentType."""
        if mime_type == 'text/html':
            return AttachmentType.URL
        elif mime_type in self.settings.ALLOWED_IMAGE_TYPES:
            return AttachmentType.IMAGE
        elif mime_type == 'application/pdf':
            return AttachmentType.PDF
        else:
            return None

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
        # Download content with interceptor chain
        chain = self.url_interceptor_registry.build_chain(self.download_cache_service.get_cached_content)
        download_result = chain(url)
        if not download_result:
            raise InvalidOperationException("process URL", f"failed to download content from {url}")

        content = download_result.content

        # Detect actual content type from bytes
        detected_mime_type = detect_mime_type(content, download_result.content_type)
        detected_attachment_type = self._mime_type_to_attachment_type(detected_mime_type)

        logger.info(f"Download content type {download_result.content_type}, detected content type {detected_mime_type} for URL {url}")

        # Extract filename from URL for non-HTML content
        filename = get_filename_from_url(url, "upload")

        content_schema = DocumentContentSchema(
            content=content,
            content_type=detected_mime_type
        )

        # Handle based on detected content type
        if detected_mime_type == 'text/html':
            # Process as HTML document
            html_info = self.html_handler.process_html_content(content, url)

            # Truncate title to prevent database errors (title field has 255 char limit)
            title = truncate_with_ellipsis(html_info.title or filename, 200)

            return UploadDocumentSchema(
                title=title,
                content=content_schema,
                detected_type=detected_attachment_type,
                preview_image=html_info.preview_image
            )

        # Truncate title to prevent database errors (title field has 255 char limit)
        title = truncate_with_ellipsis(filename, 200)

        return UploadDocumentSchema(
            title=title,
            content=content_schema,
            detected_type=detected_attachment_type,
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
            detected_type = detect_mime_type(file_data, content_type)

            # Allowed file types from config
            allowed_image_types = self.settings.ALLOWED_IMAGE_TYPES
            allowed_file_types = self.settings.ALLOWED_FILE_TYPES
            all_allowed = allowed_image_types + allowed_file_types

            if detected_type not in all_allowed:
                raise InvalidOperationException("validate file type", f"file type not allowed: {detected_type}")

            return detected_type

        except Exception as e:
            raise InvalidOperationException("validate file type", f"validation failed: {str(e)}") from e

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

    def create_file_attachment(self, part_key: str, title: str, file_data: BinaryIO, filename: str) -> PartAttachment:
        """Create a file attachment (image or PDF) for a part.

        Args:
            part_key: Part key to attach to
            title: Title/description of the attachment
            file_data: File data
            filename: Original filename

        Returns:
            Created PartAttachment

        Raises:
            RecordNotFoundException: If part not found
            InvalidOperationException: If file validation fails
        """
        # Read file data for validation
        file_data.seek(0)
        file_bytes = file_data.read()

        validated_content_type = detect_mime_type(file_bytes, None)

        return self._create_attachment(
            part_key=part_key,
            content=DocumentContentSchema(
                content=file_bytes,
                content_type=validated_content_type
            ),
            filename=filename,
            title=title)

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
        # Process URL to determine content
        try:
            upload_doc = self.process_upload_url(url)
        except Exception as e:
            raise InvalidOperationException("create URL attachment", f"failed to process URL: {str(e)}") from e

        final_title = title or upload_doc.title

        if upload_doc.detected_type == AttachmentType.URL:
            content = upload_doc.preview_image
        else:
            content = upload_doc.content

        return self._create_attachment(
            part_key=part_key,
            content=content,
            url=url,
            title=final_title,
            attachment_type=upload_doc.detected_type
        )

    def _create_attachment(self, part_key: str, content: DocumentContentSchema | None, title: str,
                            url: str | None = None, filename: str | None = None,
                            attachment_type: AttachmentType | None = None) -> PartAttachment:
        if not content and not url:
            raise InvalidOperationException("create attachment", "either content or URL must be provided")

        stmt = select(Part).where(Part.key == part_key)
        part = self.db.scalar(stmt)
        if not part:
            raise RecordNotFoundException("Part", part_key)

        upload_payload: DocumentContentSchema | None = content
        upload_s3_key: str | None
        file_size: int | None

        if upload_payload:
            file_size = len(upload_payload.content)

            allowed_image_types = self.settings.ALLOWED_IMAGE_TYPES
            allowed_file_types = self.settings.ALLOWED_FILE_TYPES
            all_allowed = allowed_image_types + allowed_file_types

            if upload_payload.content_type not in all_allowed:
                raise InvalidOperationException("create file attachment", f"file type not allowed: {upload_payload.content_type}")

            is_image = upload_payload.content_type.startswith('image/')
            self._validate_file_size(file_size, is_image)

            if not attachment_type:
                if upload_payload.content_type == 'application/pdf':
                    attachment_type = AttachmentType.PDF
                elif is_image:
                    attachment_type = AttachmentType.IMAGE
                else:
                    raise InvalidOperationException("create file attachment", f"unsupported file type: {upload_payload.content_type}")

            filename_for_s3 = filename
            if not filename_for_s3:
                filename_for_s3 = get_filename_from_url(url, title) if url else "upload"

            upload_s3_key = self.s3_service.generate_s3_key(part.id, filename_for_s3)
        else:
            upload_s3_key = None
            file_size = None

        attachment = PartAttachment(
            part_id=part.id,
            attachment_type=attachment_type,
            title=title,
            s3_key=upload_s3_key,
            filename=filename,
            content_type=upload_payload.content_type if upload_payload else None,
            file_size=file_size,
            url=url
        )

        self.db.add(attachment)
        self.db.flush()

        if not part.cover_attachment_id:
            part.cover_attachment_id = attachment.id
            self.db.flush()

        if upload_payload and upload_s3_key:
            # Database state is durable at this point; perform external upload now.
            try:
                self.s3_service.upload_file(BytesIO(upload_payload.content), upload_s3_key, upload_payload.content_type)
            except InvalidOperationException:
                logger.exception(
                    "Failed to upload attachment to S3 for part %s (attachment_id=%s, key=%s)",
                    part_key,
                    attachment.id,
                    upload_s3_key,
                )
                raise
            except Exception as exc:  # pragma: no cover - unexpected failure path
                logger.exception(
                    "Unexpected error uploading attachment to S3 for part %s (attachment_id=%s, key=%s)",
                    part_key,
                    attachment.id,
                    upload_s3_key,
                )
                raise InvalidOperationException("upload attachment", "unexpected S3 upload error") from exc

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

        if title is not None:
            attachment.title = title

        self.db.flush()
        return attachment

    def delete_attachment(self, attachment_id: int) -> None:
        """Delete attachment and clean up files.

        Args:
            attachment_id: ID of the attachment

        Raises:
            RecordNotFoundException: If attachment not found
        """
        attachment = self.get_attachment(attachment_id)
        part = attachment.part
        is_cover_image = part.cover_attachment_id == attachment_id
        s3_key = attachment.s3_key
        attachment_type = attachment.attachment_type

        if is_cover_image:
            stmt = select(PartAttachment).where(
                PartAttachment.part_id == part.id,
                PartAttachment.attachment_type == AttachmentType.IMAGE,
                PartAttachment.id != attachment_id
            ).order_by(PartAttachment.created_at)

            new_cover = self.db.scalar(stmt)
            part.cover_attachment_id = new_cover.id if new_cover else None

        self.db.delete(attachment)
        self.db.flush()

        if attachment_type == AttachmentType.IMAGE:
            self.image_service.cleanup_thumbnails(attachment_id)

        if s3_key:
            # S3 is best-effort after database state is durable.
            try:
                self.s3_service.delete_file(s3_key)
            except InvalidOperationException as exc:
                logger.warning(
                    "S3 deletion failed for attachment %s (key=%s); leaving orphaned object",
                    attachment_id,
                    s3_key,
                )
                logger.debug("Ignored S3 deletion failure due to non-transactional storage", exc_info=exc)
            except Exception as exc:  # pragma: no cover - unexpected failure path
                logger.warning(
                    "Unexpected error deleting S3 object for attachment %s (key=%s); continuing",
                    attachment_id,
                    s3_key,
                )
                logger.debug("Unexpected S3 deletion error", exc_info=exc)

    def get_attachment_file_data(self, attachment_id: int) -> tuple[BytesIO, str, str] | None:
        """Get attachment file data for download.

        Args:
            attachment_id: ID of the attachment

        Returns:
            Tuple of (file_data, content_type, filename) or None if no file data available

        Raises:
            RecordNotFoundException: If attachment not found
        """
        attachment = self.get_attachment(attachment_id)

        if attachment.s3_key:
            # Download content from S3
            file_data = self.s3_service.download_file(attachment.s3_key)
            content_type = attachment.content_type or "application/octet-stream"
            filename = attachment.filename or attachment.title
            return file_data, content_type, filename
        else:
            # No S3 content available
            return None

    def get_attachment_thumbnail(self, attachment_id: int, size: int = 150) -> AttachmentThumbnail:
        """Get thumbnail metadata for attachment, lazily loading image files.

        Args:
            attachment_id: ID of the attachment
            size: Thumbnail size in pixels

        Returns:
            AttachmentThumbnail metadata

        Raises:
            RecordNotFoundException: If attachment not found
            InvalidOperationException: If thumbnail generation fails
        """
        attachment = self.get_attachment(attachment_id)

        # Check if content_type starts with 'image/' and s3_key exists
        if attachment.content_type and attachment.content_type.startswith('image/') and attachment.s3_key:
            s3_key = attachment.s3_key
            etag = hashlib.sha256(s3_key.encode("utf-8")).hexdigest()

            def _load_path() -> str:
                return self.image_service.get_thumbnail_path(attachment.id, s3_key, size)

            return AttachmentThumbnail(
                content_type='image/jpeg',
                etag=etag,
                svg_data=None,
                _image_loader=_load_path,
            )
        elif attachment.attachment_type == AttachmentType.PDF:
            # Return PDF icon SVG
            pdf_data, content_type = self.image_service.get_pdf_icon_data()
            etag = hashlib.sha256(pdf_data).hexdigest()
            return AttachmentThumbnail(
                content_type=content_type,
                etag=etag,
                svg_data=pdf_data.decode('utf-8'),
                _image_loader=None,
            )
        elif attachment.attachment_type == AttachmentType.URL:
            # Return link icon SVG
            link_data, content_type = self.image_service.get_link_icon_data()
            etag = hashlib.sha256(link_data).hexdigest()
            return AttachmentThumbnail(
                content_type=content_type,
                etag=etag,
                svg_data=link_data.decode('utf-8'),
                _image_loader=None,
            )
        else:
            raise InvalidOperationException("get attachment thumbnail", "thumbnail not available for this attachment type")

    def get_preview_image(self, url: str) -> DocumentContentSchema | None:
        """Get preview image for a URL.

        Replaces URLThumbnailService.get_preview_image_url functionality.

        Args:
            url: URL to get preview for

        Returns:
            DocumentContentSchema with image data or None if no preview available
        """
        try:
            # Process URL to get metadata
            upload_doc = self.process_upload_url(url)

            # Return appropriate image data
            if upload_doc.preview_image:
                # HTML with preview image
                return upload_doc.preview_image
            elif upload_doc.detected_type == AttachmentType.IMAGE:
                # Direct image URL
                return upload_doc.content
            else:
                # No preview available
                return None
        except Exception:
            # Failed to get preview
            return None

    def set_part_cover_attachment(self, part_key: str, attachment_id: int | None) -> None:
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

    def copy_attachment_to_part(self, attachment_id: int, target_part_key: str, set_as_cover: bool = False) -> PartAttachment:
        """Copy a single attachment from one part to another.

        Args:
            attachment_id: ID of the attachment to copy
            target_part_key: Key of the part to copy attachment to
            set_as_cover: Whether to set the copied attachment as target part's cover

        Returns:
            Newly created PartAttachment

        Raises:
            RecordNotFoundException: If source attachment or target part not found
            InvalidOperationException: If S3 copy fails or other validation errors
        """
        # Validate source attachment exists
        source_attachment = self.get_attachment(attachment_id)

        # Validate target part exists
        stmt = select(Part).where(Part.key == target_part_key)
        target_part = self.db.scalar(stmt)
        if not target_part:
            raise RecordNotFoundException("Part", target_part_key)

        original_filename = source_attachment.filename or "attachment"
        new_s3_key = self.s3_service.generate_s3_key(target_part.id, original_filename) if source_attachment.s3_key else None

        new_attachment = PartAttachment(
            part_id=target_part.id,
            attachment_type=source_attachment.attachment_type,
            title=source_attachment.title,
            s3_key=new_s3_key,
            filename=source_attachment.filename,
            content_type=source_attachment.content_type,
            file_size=source_attachment.file_size,
            url=source_attachment.url
        )

        self.db.add(new_attachment)
        self.db.flush()

        # Handle cover attachment logic
        if set_as_cover:
            target_part.cover_attachment_id = new_attachment.id
            self.db.flush()

        if source_attachment.s3_key and new_s3_key:
            try:
                self.s3_service.copy_file(source_attachment.s3_key, new_s3_key)
            except InvalidOperationException:
                logger.exception(
                    "Failed to copy attachment %s to part %s (new_attachment_id=%s, key=%s)",
                    source_attachment.id,
                    target_part_key,
                    new_attachment.id,
                    new_s3_key,
                )
                raise
            except Exception as exc:  # pragma: no cover - unexpected failure path
                logger.exception(
                    "Unexpected error copying attachment %s to part %s (new_attachment_id=%s, key=%s)",
                    source_attachment.id,
                    target_part_key,
                    new_attachment.id,
                    new_s3_key,
                )
                raise InvalidOperationException("copy attachment", "unexpected S3 copy error") from exc

        return new_attachment
