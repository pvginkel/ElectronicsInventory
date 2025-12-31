"""Unit tests for DocumentService - URL processing and download cache only."""

import tempfile
from unittest.mock import MagicMock

import pytest

from app.models.attachment import AttachmentType
from app.services.url_transformers import URLInterceptorRegistry
from app.utils.temp_file_manager import TempFileManager


@pytest.fixture
def temp_file_manager():
    """Create temporary file manager for testing."""
    with tempfile.TemporaryDirectory() as temp_dir:
        yield TempFileManager(base_path=temp_dir, cleanup_age_hours=1.0)


@pytest.fixture
def mock_s3_service():
    """Create mock S3Service."""
    mock = MagicMock()
    # CAS key generation for uploads
    mock.generate_cas_key.return_value = "cas/0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
    mock.file_exists.return_value = False  # For deduplication check
    mock.upload_file.return_value = True
    return mock


@pytest.fixture
def mock_image_service():
    """Create mock ImageService."""
    mock = MagicMock()
    mock.get_thumbnail_path.return_value = "/tmp/thumbnail.jpg"
    return mock


@pytest.fixture
def mock_html_handler():
    """Create mock HtmlDocumentHandler."""
    mock = MagicMock()
    from app.schemas.upload_document import DocumentContentSchema
    from app.services.html_document_handler import HtmlDocumentInfo

    mock.process_html_content.return_value = HtmlDocumentInfo(
        title="Test Page",
        preview_image=DocumentContentSchema(
            content=b"preview image data",
            content_type="image/jpeg"
        )
    )
    return mock

@pytest.fixture
def mock_download_cache():
    """Create mock DownloadCacheService."""
    from app.services.download_cache_service import DownloadResult

    mock = MagicMock()
    mock.get_cached_content.return_value = DownloadResult(
        content=b"<html><title>Test Page</title></html>",
        content_type="text/html"
    )
    return mock


@pytest.fixture
def document_service(app, session, mock_s3_service, mock_image_service, mock_html_handler, mock_download_cache, test_settings):
    """Create DocumentService with mocked dependencies."""
    with app.app_context():
        from app.services.document_service import DocumentService
        # Create empty URL interceptor registry for testing
        url_interceptor_registry = URLInterceptorRegistry()
        return DocumentService(session, mock_s3_service, mock_image_service, mock_html_handler, mock_download_cache, test_settings, url_interceptor_registry)


class TestDocumentService:
    """Test DocumentService functionality - URL processing only."""

    def test_process_upload_url_direct_image(self, document_service):
        """Test processing direct image URL."""
        from unittest.mock import patch

        from app.schemas.upload_document import (
            DocumentContentSchema,
            UploadDocumentSchema,
        )

        with patch.object(document_service, 'process_upload_url') as mock_process:
            mock_process.return_value = UploadDocumentSchema(
                title="image.jpg",
                content=DocumentContentSchema(
                    content=b"image data",
                    content_type="image/jpeg"
                ),
                detected_type=AttachmentType.IMAGE,
                preview_image=None
            )

            result = document_service.process_upload_url("https://example.com/image.jpg")

            assert result.title == "image.jpg"
            assert result.detected_type == AttachmentType.IMAGE
            assert result.preview_image is None

    def test_process_upload_url_html_with_preview(self, document_service):
        """Test processing HTML URL with preview image."""
        from unittest.mock import patch

        from app.schemas.upload_document import (
            DocumentContentSchema,
            UploadDocumentSchema,
        )

        with patch.object(document_service, 'process_upload_url') as mock_process:
            mock_process.return_value = UploadDocumentSchema(
                title="Product Page",
                content=DocumentContentSchema(
                    content=b"<html>...</html>",
                    content_type="text/html"
                ),
                detected_type=AttachmentType.URL,
                preview_image=DocumentContentSchema(
                    content=b"preview image data",
                    content_type="image/jpeg"
                )
            )

            result = document_service.process_upload_url("https://example.com/product")

            assert result.title == "Product Page"
            assert result.detected_type == AttachmentType.URL
            assert result.preview_image is not None
            assert result.preview_image.content_type == "image/jpeg"

    def test_create_url_attachment_unsupported_image_type(self, document_service, session, sample_part, mock_download_cache):
        """Test that unsupported image types (like .ico) are properly rejected."""
        from unittest.mock import patch

        from app.exceptions import InvalidOperationException
        from app.services.download_cache_service import DownloadResult

        # Mock downloading a .ico file
        ico_content = b"FAKE_ICO_FILE_CONTENT"
        mock_download_cache.get_cached_content.return_value = DownloadResult(
            content=ico_content,
            content_type="image/vnd.microsoft.icon"
        )

        with patch('magic.from_buffer') as mock_magic:
            # Magic detects .ico file
            mock_magic.return_value = 'image/vnd.microsoft.icon'

            # With the fix, _mime_type_to_attachment_type returns None for unsupported image types
            # This means detected_type will be None, and the attachment creation should fail
            # when it tries to validate the unsupported content type

            with pytest.raises(InvalidOperationException) as exc_info:
                document_service.create_url_attachment(
                    attachment_set_id=sample_part.attachment_set_id,
                    title="Favicon",
                    url="https://example.com/favicon.ico"
                )

            # Should get error about unsupported file type
            error_message = str(exc_info.value)
            assert "file type not allowed: image/vnd.microsoft.icon" in error_message

    def test_mime_type_to_attachment_type_unsupported_image(self, document_service):
        """Test that _mime_type_to_attachment_type properly handles unsupported image types."""
        # Test unsupported image types return None (not IMAGE)
        result = document_service._mime_type_to_attachment_type("image/vnd.microsoft.icon")
        assert result is None, "Unsupported image types should return None"

        # Test supported image types still work
        result = document_service._mime_type_to_attachment_type("image/jpeg")
        assert result == AttachmentType.IMAGE

        result = document_service._mime_type_to_attachment_type("image/png")
        assert result == AttachmentType.IMAGE
