"""Unit tests for ImageService."""

import io
import os
from unittest.mock import MagicMock, patch

import pytest
from flask import Flask
from PIL import Image
from sqlalchemy.orm import Session

from app.exceptions import InvalidOperationException
from app.services.image_service import ImageService


@pytest.fixture
def temp_dir(tmp_path):
    """Create temporary directory for thumbnails."""
    return tmp_path


@pytest.fixture
def mock_s3_service():
    """Create mock S3Service for ImageService."""
    return MagicMock()


@pytest.fixture
def image_service(app: Flask, session, temp_dir, mock_s3_service):
    """Create ImageService with temporary directory."""
    with app.app_context():
        with patch('app.services.image_service.current_app') as mock_current_app:
            mock_current_app.config = {'THUMBNAIL_STORAGE_PATH': str(temp_dir)}
            service = ImageService(session, mock_s3_service)
            service.thumbnail_base_path = temp_dir
            return service


@pytest.fixture
def sample_image_bytes():
    """Create sample image bytes for testing."""
    img = Image.new('RGB', (800, 600), color='red')
    img_bytes = io.BytesIO()
    img.save(img_bytes, format='JPEG')
    return img_bytes.getvalue()


@pytest.fixture
def large_image_bytes():
    """Create large image bytes for testing."""
    img = Image.new('RGB', (4000, 3000), color='blue')
    img_bytes = io.BytesIO()
    img.save(img_bytes, format='PNG')
    return img_bytes.getvalue()


class TestImageService:
    """Test ImageService functionality."""

    def test_init_creates_thumbnail_directory(self, app: Flask, session: Session, temp_dir, mock_s3_service):
        """Test that ImageService creates thumbnail directory."""
        with app.app_context():
            with patch('app.services.image_service.current_app') as mock_current_app:
                mock_current_app.config = {'THUMBNAIL_STORAGE_PATH': str(temp_dir / "thumbnails")}
                service = ImageService(session, mock_s3_service)
                assert (temp_dir / "thumbnails").exists()

    def test_process_uploaded_image_normal_size(self, image_service, sample_image_bytes):
        """Test processing a normal-sized image."""
        file_data = io.BytesIO(sample_image_bytes)

        result_data, metadata = image_service.process_uploaded_image(file_data)

        assert isinstance(result_data, io.BytesIO)
        assert isinstance(metadata, dict)
        assert 'width' in metadata
        assert 'height' in metadata
        assert 'format' in metadata
        assert metadata['format'] in ['JPEG', 'PNG', 'WEBP']

        # Verify image was processed
        result_data.seek(0)
        processed_img = Image.open(result_data)
        assert processed_img.size[0] <= 800  # Width should be <= 800
        assert processed_img.size[1] <= 600  # Height should be <= 600

    def test_process_uploaded_image_invalid_format(self, image_service):
        """Test processing invalid image data."""
        invalid_data = io.BytesIO(b"not an image")

        with pytest.raises(InvalidOperationException) as exc_info:
            image_service.process_uploaded_image(invalid_data)

        assert "process image" in str(exc_info.value)

    def test_generate_thumbnail_creates_file(self, image_service, sample_image_bytes, temp_dir):
        """Test thumbnail generation creates the file."""
        attachment_id = 123
        s3_key = "test/image.jpg"
        size = 150

        # Mock S3 service to return image data
        image_service.s3_service.download_file.return_value = io.BytesIO(sample_image_bytes)

        thumbnail_path = image_service.generate_thumbnail(attachment_id, s3_key, size)

        # Check that thumbnail file was created
        assert os.path.exists(thumbnail_path)

        # Verify thumbnail size
        with Image.open(thumbnail_path) as thumb_img:
            assert max(thumb_img.size) <= size

    def test_generate_thumbnail_different_sizes(self, image_service, sample_image_bytes, temp_dir):
        """Test generating thumbnails of different sizes."""
        attachment_id = 123
        s3_key = "test/image.jpg"

        # Mock S3 service to return image data
        image_service.s3_service.download_file.return_value = io.BytesIO(sample_image_bytes)

        # Generate different sizes
        path_150 = image_service.generate_thumbnail(attachment_id, s3_key, 150)
        path_300 = image_service.generate_thumbnail(attachment_id, s3_key, 300)

        # Both should exist and be different files
        assert os.path.exists(path_150)
        assert os.path.exists(path_300)
        assert path_150 != path_300

        # Verify sizes
        with Image.open(path_150) as thumb_150:
            with Image.open(path_300) as thumb_300:
                assert max(thumb_150.size) <= 150
                assert max(thumb_300.size) <= 300
                assert max(thumb_300.size) >= max(thumb_150.size)

    def test_get_thumbnail_path_creates_if_not_exists(self, image_service, temp_dir):
        """Test getting thumbnail path creates thumbnail if it doesn't exist."""
        attachment_id = 456
        s3_key = "parts/456/test.jpg"
        size = 150

        # Ensure thumbnail doesn't exist yet
        thumbnail_path = image_service._get_thumbnail_path(attachment_id, size)
        if os.path.exists(thumbnail_path):
            os.remove(thumbnail_path)

        # Mock S3 service to return image data
        mock_s3_service = MagicMock()
        sample_img = Image.new('RGB', (400, 300), color='green')
        img_bytes = io.BytesIO()
        sample_img.save(img_bytes, format='JPEG')
        mock_s3_service.download_file.return_value = img_bytes

        with patch.object(image_service, 's3_service', mock_s3_service):
            returned_path = image_service.get_thumbnail_path(attachment_id, s3_key, size)

        assert os.path.exists(returned_path)
        mock_s3_service.download_file.assert_called_once_with(s3_key)

    def test_get_thumbnail_path_returns_existing(self, image_service, sample_image_bytes, temp_dir):
        """Test getting thumbnail path returns existing file."""
        attachment_id = 789
        size = 150
        s3_key = "test/image.jpg"

        # Mock S3 service to return image data
        image_service.s3_service.download_file.return_value = io.BytesIO(sample_image_bytes)

        # Create thumbnail first
        expected_path = image_service.generate_thumbnail(attachment_id, s3_key, size)

        # Now get the path - should return same path without regenerating
        with patch.object(image_service, 's3_service') as mock_s3:
            returned_path = image_service.get_thumbnail_path(attachment_id, "any/key", size)

        assert returned_path == expected_path
        # S3 service should not have been called since thumbnail exists
        mock_s3.download_file.assert_not_called()

    def test_cleanup_thumbnails_removes_files(self, image_service, sample_image_bytes, temp_dir):
        """Test cleanup removes all thumbnails for an attachment."""
        attachment_id = 999
        s3_key = "test/image.jpg"

        # Mock S3 service to return image data
        image_service.s3_service.download_file.return_value = io.BytesIO(sample_image_bytes)

        # Create multiple thumbnail sizes
        path_150 = image_service.generate_thumbnail(attachment_id, s3_key, 150)
        path_300 = image_service.generate_thumbnail(attachment_id, s3_key, 300)

        # Verify they exist
        assert os.path.exists(path_150)
        assert os.path.exists(path_300)

        # Cleanup
        image_service.cleanup_thumbnails(attachment_id)

        # Verify they're gone
        assert not os.path.exists(path_150)
        assert not os.path.exists(path_300)

    def test_get_pdf_icon_data_returns_svg(self, image_service):
        """Test getting PDF icon returns SVG data."""
        svg_data, content_type = image_service.get_pdf_icon_data()

        assert isinstance(svg_data, bytes)
        assert content_type == 'image/svg+xml'
        assert b'<svg' in svg_data
        assert b'</svg>' in svg_data

    def test_thumbnail_path_structure(self, app: Flask, session, temp_dir, mock_s3_service):
        """Test thumbnail path structure is consistent."""
        attachment_id = 123
        size = 150

        # Create service with explicit path
        with app.app_context():
            with patch('app.services.image_service.current_app') as mock_current_app:
                mock_current_app.config = {'THUMBNAIL_STORAGE_PATH': str(temp_dir)}
                service = ImageService(session, mock_s3_service)

                path = service._get_thumbnail_path(attachment_id, size)

                # Should be in format: {base_path}/{id}_{size}.jpg
                expected = temp_dir / f"{attachment_id}_{size}.jpg"
                assert path == str(expected)

    def test_process_image_preserves_quality(self, image_service):
        """Test that image processing preserves reasonable quality."""
        # Create a high-quality image
        original = Image.new('RGB', (1000, 800), color='red')
        original_bytes = io.BytesIO()
        original.save(original_bytes, format='JPEG', quality=95)

        file_data = io.BytesIO(original_bytes.getvalue())
        result_data, metadata = image_service.process_uploaded_image(file_data)

        # Check that result is still reasonable quality (not too compressed)
        result_size = len(result_data.getvalue())
        original_size = len(original_bytes.getvalue())

        # Result shouldn't be more than 10x smaller (indicating over-compression)
        assert result_size > original_size / 10

    def test_generate_thumbnail_handles_portrait_orientation(self, image_service):
        """Test thumbnail generation with portrait images."""
        # Create tall portrait image
        portrait = Image.new('RGB', (400, 800), color='purple')
        portrait_bytes = io.BytesIO()
        portrait.save(portrait_bytes, format='JPEG')

        attachment_id = 111
        s3_key = "test/portrait.jpg"

        # Mock S3 service to return image data
        image_service.s3_service.download_file.return_value = io.BytesIO(portrait_bytes.getvalue())

        thumbnail_path = image_service.generate_thumbnail(attachment_id, s3_key, 150)

        # Check thumbnail maintains aspect ratio
        with Image.open(thumbnail_path) as thumb:
            # Height should be the limiting dimension
            assert thumb.size[1] == 150
            assert thumb.size[0] < 150  # Width should be proportionally smaller

    def test_generate_thumbnail_handles_landscape_orientation(self, image_service):
        """Test thumbnail generation with landscape images."""
        # Create wide landscape image
        landscape = Image.new('RGB', (800, 400), color='orange')
        landscape_bytes = io.BytesIO()
        landscape.save(landscape_bytes, format='JPEG')

        attachment_id = 222
        s3_key = "test/landscape.jpg"

        # Mock S3 service to return image data
        image_service.s3_service.download_file.return_value = io.BytesIO(landscape_bytes.getvalue())

        thumbnail_path = image_service.generate_thumbnail(attachment_id, s3_key, 150)

        # Check thumbnail maintains aspect ratio
        with Image.open(thumbnail_path) as thumb:
            # Width should be the limiting dimension
            assert thumb.size[0] == 150
            assert thumb.size[1] < 150  # Height should be proportionally smaller
