"""Unit tests for ImageService."""

import io
import os
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest
from flask import Flask
from PIL import Image
from sqlalchemy.orm import Session

from app.config import Settings
from app.exceptions import InvalidOperationException
from app.services.image_service import ImageService


@pytest.fixture
def temp_dir(tmp_path: Path) -> Path:
    """Create temporary directory for thumbnails."""
    return tmp_path


@pytest.fixture
def mock_s3_service():
    """Create mock S3Service for ImageService."""
    return MagicMock()

@pytest.fixture
def test_settings(temp_dir: Path):
    return Settings(
        THUMBNAIL_STORAGE_PATH=str(temp_dir)
    )


@pytest.fixture
def image_service(app: Flask, session, mock_s3_service, test_settings):
    """Create ImageService with temporary directory."""
    return ImageService(session, mock_s3_service, test_settings)


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

    def test_init_creates_thumbnail_directory(self, session: Session, temp_dir, mock_s3_service, test_settings):
        """Test that ImageService creates thumbnail directory."""
        ImageService(session, mock_s3_service, test_settings)
        assert Path(test_settings.THUMBNAIL_STORAGE_PATH).exists()

    # Note: Tests for old attachment_id-based thumbnail methods removed:
    # - test_generate_thumbnail_creates_file
    # - test_generate_thumbnail_different_sizes
    # - test_get_thumbnail_path_creates_if_not_exists
    # - test_get_thumbnail_path_returns_existing
    # - test_cleanup_thumbnails_removes_files
    # These methods were replaced by get_thumbnail_for_hash()

    def test_get_pdf_icon_data_returns_svg(self, image_service):
        """Test getting PDF icon returns SVG data."""
        svg_data, content_type = image_service.get_pdf_icon_data()

        assert isinstance(svg_data, bytes)
        assert content_type == 'image/svg+xml'
        assert b'<svg' in svg_data
        assert b'</svg>' in svg_data

    # Note: More tests for old attachment_id-based methods removed:
    # - test_thumbnail_path_structure
    # - test_generate_thumbnail_handles_portrait_orientation
    # - test_generate_thumbnail_handles_landscape_orientation
    # These were replaced by get_thumbnail_for_hash() which is tested via CAS endpoint


def test_get_link_icon_data(image_service):
    """Test getting link icon data."""
    link_data, content_type = image_service.get_link_icon_data()

    # Verify content type
    assert content_type == 'image/svg+xml'

    # Verify it's valid SVG content
    assert isinstance(link_data, bytes)
    svg_content = link_data.decode('utf-8')
    assert '<svg' in svg_content
    assert 'xmlns="http://www.w3.org/2000/svg"' in svg_content


def test_get_link_icon_data_file_not_found(image_service):
    """Test link icon data when file doesn't exist."""
    # Mock the builtin open function to raise an exception
    with patch('builtins.open', side_effect=FileNotFoundError("File not found")):
        with pytest.raises(InvalidOperationException) as exc_info:
            image_service.get_link_icon_data()

        assert "get link icon data" in str(exc_info.value)
        assert "failed to read link icon" in str(exc_info.value)


def test_get_pdf_icon_data_file_not_found(image_service):
    """Test PDF icon data when file doesn't exist."""
    # Mock the builtin open function to raise an exception
    with patch('builtins.open', side_effect=FileNotFoundError("File not found")):
        with pytest.raises(InvalidOperationException) as exc_info:
            image_service.get_pdf_icon_data()

        assert "get pdf icon data" in str(exc_info.value)
        assert "failed to read pdf icon" in str(exc_info.value)


def test_convert_image_to_png_success(image_service):
    """Test successful image conversion to PNG."""
    # Create a test JPEG image
    img = Image.new('RGB', (50, 50), color='blue')
    jpeg_buffer = io.BytesIO()
    img.save(jpeg_buffer, format='JPEG')
    jpeg_content = jpeg_buffer.getvalue()

    # Convert to PNG
    result = image_service.convert_image_to_png(jpeg_content)

    assert result is not None
    assert result.content_type == 'image/png'
    assert isinstance(result.content, bytes)
    assert len(result.content) > 0

    # Verify the converted image can be opened and has correct size
    converted_img = Image.open(io.BytesIO(result.content))
    assert converted_img.format == 'PNG'
    assert converted_img.size == (50, 50)


def test_convert_image_to_png_with_transparency(image_service):
    """Test image conversion preserves transparency."""
    # Create a test image with transparency
    img = Image.new('RGBA', (32, 32), color=(255, 0, 0, 128))  # Semi-transparent red
    png_buffer = io.BytesIO()
    img.save(png_buffer, format='PNG')
    original_content = png_buffer.getvalue()

    # Convert (should work even though it's already PNG)
    result = image_service.convert_image_to_png(original_content)

    assert result is not None
    assert result.content_type == 'image/png'

    # Verify transparency is preserved
    converted_img = Image.open(io.BytesIO(result.content))
    assert converted_img.mode in ('RGBA', 'LA')  # Should preserve alpha channel


def test_convert_image_to_png_invalid_data(image_service):
    """Test conversion with invalid image data."""
    invalid_content = b"This is not an image"

    result = image_service.convert_image_to_png(invalid_content)

    assert result is None


def test_convert_image_to_png_empty_data(image_service):
    """Test conversion with empty data."""
    result = image_service.convert_image_to_png(b"")

    assert result is None
