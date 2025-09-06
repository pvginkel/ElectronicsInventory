"""Image service for thumbnail generation and processing."""

import os
from io import BytesIO
from pathlib import Path
from typing import BinaryIO

from PIL import Image
from sqlalchemy.orm import Session

from app.config import Settings
from app.exceptions import InvalidOperationException
from app.services.base import BaseService
from app.services.s3_service import S3Service


class ImageService(BaseService):
    """Service for image processing and thumbnail generation."""

    def __init__(self, db: Session, s3_service: S3Service, settings: Settings):
        """Initialize image service with database session and S3 service.

        Args:
            db: SQLAlchemy database session
            s3_service: S3 service for file operations
        """
        super().__init__(db)
        self.s3_service = s3_service
        self.settings = settings
        self._ensure_thumbnail_directory()

    def _ensure_thumbnail_directory(self):
        """Ensure thumbnail storage directory exists."""
        thumbnail_path = Path(self.settings.THUMBNAIL_STORAGE_PATH)
        thumbnail_path.mkdir(parents=True, exist_ok=True)

    def _get_thumbnail_path(self, attachment_id: int, size: int) -> str:
        """Get thumbnail file path on disk.

        Args:
            attachment_id: ID of the attachment
            size: Thumbnail size in pixels

        Returns:
            Path to thumbnail file
        """
        return os.path.join(
            self.settings.THUMBNAIL_STORAGE_PATH,
            f"{attachment_id}_{size}.jpg"
        )

    def _is_image_format_supported(self, content_type: str) -> bool:
        """Check if image format is supported for thumbnail generation.

        Args:
            content_type: MIME type of the image

        Returns:
            True if format is supported
        """
        supported_types = [
            'image/jpeg',
            'image/png',
            'image/webp',
            'image/bmp',
            'image/tiff'
        ]
        return content_type.lower() in supported_types

    def generate_thumbnail(self, attachment_id: int, s3_key: str, size: int) -> str:
        """Generate thumbnail for image attachment with lazy loading.

        Args:
            attachment_id: ID of the attachment
            s3_key: S3 key of the original image
            size: Thumbnail size in pixels (square)

        Returns:
            Path to generated thumbnail file

        Raises:
            InvalidOperationException: If thumbnail generation fails
        """
        thumbnail_path = self._get_thumbnail_path(attachment_id, size)

        # Check if thumbnail already exists
        if os.path.exists(thumbnail_path):
            return thumbnail_path

        try:
            # Download original image from S3
            image_data = self.s3_service.download_file(s3_key)

            # Open and process image with PIL
            with Image.open(image_data) as img:
                # Convert to RGB if necessary (for PNG with transparency, etc.)
                if img.mode not in ('RGB', 'L'):
                    img = img.convert('RGB')

                # Create thumbnail maintaining aspect ratio
                img.thumbnail((size, size), Image.Resampling.LANCZOS)

                # Save thumbnail to disk
                img.save(thumbnail_path, 'JPEG', quality=85, optimize=True)

            return thumbnail_path

        except Exception as e:
            raise InvalidOperationException("generate thumbnail", str(e)) from e

    def get_thumbnail_path(self, attachment_id: int, s3_key: str, size: int) -> str:
        """Get thumbnail path, generating if necessary.

        Args:
            attachment_id: ID of the attachment
            s3_key: S3 key of the original image
            size: Thumbnail size in pixels

        Returns:
            Path to thumbnail file
        """
        thumbnail_path = self._get_thumbnail_path(attachment_id, size)

        # Generate thumbnail if it doesn't exist
        if not os.path.exists(thumbnail_path):
            return self.generate_thumbnail(attachment_id, s3_key, size)

        return thumbnail_path

    def get_pdf_icon_data(self) -> tuple[bytes, str]:
        """Get PDF icon as SVG data.

        Returns:
            Tuple of (svg_data, content_type)
        """
        try:
            pdf_icon_path = Path(__file__).parent.parent / "assets" / "pdf-icon.svg"
            with open(pdf_icon_path, 'rb') as f:
                pdf_icon_svg = f.read()
            return pdf_icon_svg, 'image/svg+xml'
        except Exception as e:
            raise InvalidOperationException("get pdf icon data", f"failed to read pdf icon: {str(e)}") from e

    def get_link_icon_data(self) -> tuple[bytes, str]:
        """Get link icon as SVG data.

        Returns:
            Tuple of (svg_data, content_type)
        """
        try:
            link_icon_path = Path(__file__).parent.parent / "assets" / "link-icon.svg"
            with open(link_icon_path, 'rb') as f:
                link_icon_svg = f.read()
            return link_icon_svg, 'image/svg+xml'
        except Exception as e:
            raise InvalidOperationException("get link icon data", f"failed to read link icon: {str(e)}") from e

    def cleanup_thumbnails(self, attachment_id: int):
        """Clean up all thumbnails for an attachment.

        Args:
            attachment_id: ID of the attachment
        """
        thumbnail_dir = Path(self.settings.THUMBNAIL_STORAGE_PATH)
        pattern = f"{attachment_id}_*.jpg"

        for thumbnail_file in thumbnail_dir.glob(pattern):
            try:
                thumbnail_file.unlink()
            except OSError:
                pass  # Ignore errors during cleanup
