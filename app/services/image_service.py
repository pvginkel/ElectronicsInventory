"""Image service for thumbnail generation and processing."""

import os
from io import BytesIO
from pathlib import Path
from typing import BinaryIO

from flask import current_app
from PIL import Image
from sqlalchemy.orm import Session

from app.exceptions import InvalidOperationException
from app.services.base import BaseService
from app.services.s3_service import S3Service


class ImageService(BaseService):
    """Service for image processing and thumbnail generation."""

    def __init__(self, db: Session, s3_service: S3Service):
        """Initialize image service with database session and S3 service.

        Args:
            db: SQLAlchemy database session
            s3_service: S3 service for file operations
        """
        super().__init__(db)
        self.s3_service = s3_service
        self._ensure_thumbnail_directory()

    def _ensure_thumbnail_directory(self):
        """Ensure thumbnail storage directory exists."""
        thumbnail_path = Path(current_app.config['THUMBNAIL_STORAGE_PATH'])
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
            current_app.config['THUMBNAIL_STORAGE_PATH'],
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

    def process_uploaded_image(self, image_data: BinaryIO) -> tuple[BinaryIO, dict]:
        """Process uploaded image and extract metadata.

        Args:
            image_data: Image file data

        Returns:
            Tuple of (processed_image_data, metadata_dict)

        Raises:
            InvalidOperationException: If image processing fails
        """
        try:
            with Image.open(image_data) as img:
                # Extract metadata
                metadata = {
                    'width': img.width,
                    'height': img.height,
                    'format': img.format,
                    'mode': img.mode
                }

                # Add EXIF data if available
                if hasattr(img, '_getexif') and img._getexif() is not None:
                    exif_data = img._getexif()
                    if exif_data:
                        metadata['has_exif'] = True
                        # Extract useful EXIF data
                        orientation = exif_data.get(274)  # Orientation tag
                        if orientation:
                            metadata['orientation'] = orientation

                # Convert to RGB if necessary
                if img.mode not in ('RGB', 'L'):
                    img = img.convert('RGB')

                # Save processed image
                output = BytesIO()
                img.save(output, 'JPEG', quality=90, optimize=True)
                output.seek(0)

                return output, metadata

        except Exception as e:
            raise InvalidOperationException("process image", f"image processing failed: {str(e)}") from e

    def get_pdf_icon_data(self) -> tuple[bytes, str]:
        """Get PDF icon as SVG data.

        Returns:
            Tuple of (svg_data, content_type)
        """
        pdf_icon_svg = """<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 384 512">
    <path fill="#d32f2f" d="M181.9 256.1c-5-16-4.9-46.9-2-46.9 8.4 0 7.6 36.9 2 46.9zm-1.7 47.2c-7.7 20.2-17.3 43.3-28.4 62.7 18.3-7 39-17.2 62.9-21.9-12.7-9.6-24.9-23.4-34.5-40.8zM86.1 428.1c0 .8 13.2-5.4 34.9-40.2-6.7 6.3-29.1 24.5-34.9 40.2zM248 160h136v328c0 13.3-10.7 24-24 24H24c-13.3 0-24-10.7-24-24V24C0 10.7 10.7 0 24 0h200v136c0 13.2 10.8 24 24 24zm-8 171.8c-20-12.2-33.3-29-42.7-53.8 4.5-18.5 11.6-46.6 6.2-64.2-4.7-29.4-42.4-26.5-47.8-6.8-5 18.5-.4 44.1 8.1 77-11.6 27.6-28.7 64.6-40.8 85.8-.1 0-.1.1-.2.1-27.1 13.9-73.6 44.5-54.5 68 5.6 6.9 16 10 21.5 10 17.9 0 35.7-18 61.1-61.8 25.8-8.5 54.1-19.1 79-23.2 21.7 11.8 47.1 19.5 64 19.5 29.2 0 31.2-32 19.7-43.4-13.9-13.6-54.3-9.7-73.6-7.2zM377 105L279 7c-4.5-4.5-10.6-7-17-7h-6v128h128v-6c0-6.4-2.5-12.5-7-17z"/>
</svg>"""
        return pdf_icon_svg.encode('utf-8'), 'image/svg+xml'

    def cleanup_thumbnails(self, attachment_id: int):
        """Clean up all thumbnails for an attachment.

        Args:
            attachment_id: ID of the attachment
        """
        thumbnail_dir = Path(current_app.config['THUMBNAIL_STORAGE_PATH'])
        pattern = f"{attachment_id}_*.jpg"

        for thumbnail_file in thumbnail_dir.glob(pattern):
            try:
                thumbnail_file.unlink()
            except OSError:
                pass  # Ignore errors during cleanup
