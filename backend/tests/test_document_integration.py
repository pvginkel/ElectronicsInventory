"""Integration tests for document handling workflow."""

import io
from unittest.mock import patch

import pytest
from PIL import Image
from sqlalchemy.orm import Session

from app.models.part_attachment import AttachmentType
from app.services.container import ServiceContainer
from app.services.download_cache_service import DownloadResult


@pytest.fixture
def create_test_image():
    """Helper to create test image bytes."""
    def _create(width=100, height=100, color='red', format='JPEG'):
        img = Image.new('RGB', (width, height), color=color)
        img_bytes = io.BytesIO()
        img.save(img_bytes, format=format)
        return img_bytes.getvalue()
    return _create


@pytest.fixture
def create_test_pdf():
    """Helper to create test PDF bytes."""
    # Minimal PDF structure
    return b"""%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>
endobj
xref
0 4
0000000000 65535 f
0000000015 00000 n
0000000074 00000 n
0000000131 00000 n
trailer
<< /Size 4 /Root 1 0 R >>
startxref
217
%%EOF"""


class TestDocumentIntegration:
    """Integration tests for complete document workflows."""

    def test_url_attachment_html_with_og_image(
        self, container: ServiceContainer, session: Session, sample_part, create_test_image
    ):
        """Test complete flow: HTML page with og:image → download → extract → store."""
        document_service = container.document_service()
        
        # Mock HTML response
        html_content = b"""
        <html>
            <head>
                <title>Arduino Uno R3</title>
                <meta property="og:image" content="https://store.arduino.cc/arduino.jpg">
            </head>
            <body>
                <h1>Arduino Uno R3 - Microcontroller Board</h1>
            </body>
        </html>
        """
        
        # Mock image response
        preview_image = create_test_image(200, 200, 'blue')
        
        with patch.object(document_service.download_cache_service, 'get_cached_content') as mock_download:
            # First call returns HTML
            mock_download.return_value = DownloadResult(content=html_content, content_type='text/html')
            
            # Also patch the HtmlDocumentHandler's download_cache_service
            with patch.object(document_service.html_handler.download_cache_service, 'get_cached_content') as mock_html_download:
                # Return preview image when handler tries to download it
                mock_html_download.return_value = DownloadResult(content=preview_image, content_type='image/jpeg')
                
                with patch('magic.from_buffer') as mock_magic:
                    # First call identifies HTML, second identifies image
                    mock_magic.side_effect = ['text/html', 'image/jpeg']
                    
                    result = document_service.process_upload_url("https://store.arduino.cc/arduino-uno")
        
        assert result.title == "Arduino Uno R3"
        assert result.detected_type == AttachmentType.URL
        assert result.preview_image is not None
        assert result.preview_image.content == preview_image
        assert result.preview_image.content_type == "image/jpeg"

    def test_url_attachment_direct_image(
        self, container: ServiceContainer, session: Session, sample_part, create_test_image
    ):
        """Test complete flow: Direct image URL → download → detect → store."""
        document_service = container.document_service()
        
        # Mock direct image download
        image_content = create_test_image(500, 500, 'green')
        
        with patch.object(document_service.download_cache_service, 'get_cached_content') as mock_download:
            mock_download.return_value = DownloadResult(content=image_content, content_type='image/jpeg')
            
            with patch('magic.from_buffer', return_value='image/jpeg'):
                result = document_service.process_upload_url("https://example.com/schematic.jpg")
        
        assert result.title == "schematic.jpg"  # Extracted from URL
        assert result.detected_type == AttachmentType.IMAGE
        assert result.content.content == image_content
        assert result.content.content_type == "image/jpeg"
        assert result.preview_image is None  # Direct images don't have separate preview

    def test_url_attachment_pdf(
        self, container: ServiceContainer, session: Session, sample_part, create_test_pdf
    ):
        """Test complete flow: PDF URL → download → detect → store."""
        document_service = container.document_service()
        
        pdf_content = create_test_pdf
        
        with patch.object(document_service.download_cache_service, 'get_cached_content') as mock_download:
            mock_download.return_value = DownloadResult(content=pdf_content, content_type='application/pdf')
            
            with patch('magic.from_buffer', return_value='application/pdf'):
                result = document_service.process_upload_url("https://example.com/datasheet.pdf")
        
        assert result.title == "datasheet.pdf"
        assert result.detected_type == AttachmentType.PDF
        assert result.content.content == pdf_content
        assert result.content.content_type == "application/pdf"
        assert result.preview_image is None

    def test_url_attachment_website_without_preview(
        self, container: ServiceContainer, session: Session, sample_part
    ):
        """Test website without preview images → store only URL."""
        document_service = container.document_service()
        
        # HTML without any preview images
        html_content = b"""
        <html>
            <head>
                <title>Simple Electronics Blog</title>
            </head>
            <body>
                <h1>Blog Post</h1>
                <p>No images here</p>
            </body>
        </html>
        """
        
        with patch.object(document_service.download_cache_service, 'get_cached_content') as mock_download:
            # Returns HTML for main request, None for all image attempts
            mock_download.side_effect = [DownloadResult(content=html_content, content_type='text/html'), None, None, None, None]
            
            with patch('magic.from_buffer', return_value='text/html'):
                result = document_service.process_upload_url("https://blog.example.com/post")
        
        assert result.title == "Simple Electronics Blog"
        assert result.detected_type == AttachmentType.URL
        assert result.preview_image is None  # No preview found
        # URL will be stored but s3_key will remain empty

    def test_url_attachment_generic_file(
        self, container: ServiceContainer, session: Session, sample_part
    ):
        """Test generic file type (e.g., .zip) → store only URL."""
        document_service = container.document_service()
        
        # Mock ZIP file content
        zip_content = b"PK\x03\x04"  # ZIP file signature
        
        with patch.object(document_service.download_cache_service, 'get_cached_content') as mock_download:
            mock_download.return_value = DownloadResult(content=zip_content, content_type='application/zip')
            
            with patch('magic.from_buffer', return_value='application/zip'):
                result = document_service.process_upload_url("https://example.com/firmware.zip")
        
        assert result.title == "firmware.zip"
        assert result.detected_type == None  # Generic files don't have an attachment type
        assert result.content.content == zip_content
        assert result.preview_image is None
        # Generic files are not stored in S3

    def test_content_type_detection_overrides_http_headers(
        self, container: ServiceContainer, session: Session, create_test_image
    ):
        """Test that python-magic detection overrides wrong HTTP headers."""
        document_service = container.document_service()
        
        # Server says it's HTML but it's actually an image
        image_content = create_test_image()
        
        with patch.object(document_service.download_cache_service, 'get_cached_content') as mock_download:
            mock_download.return_value = DownloadResult(content=image_content, content_type='image/jpeg')
            
            # Mock HTTP response claiming wrong content type
            with patch('magic.from_buffer', return_value='image/jpeg'):
                result = document_service.process_upload_url("https://example.com/mistyped")
        
        # Should detect actual image type, not what HTTP said
        assert result.detected_type == AttachmentType.IMAGE
        assert result.content.content_type == "image/jpeg"

    def test_preview_image_404_fallback(
        self, container: ServiceContainer, session: Session, sample_part, create_test_image
    ):
        """Test fallback when preview image returns 404."""
        document_service = container.document_service()
        
        html_content = b"""
        <html>
            <head>
                <title>Product Page</title>
                <meta property="og:image" content="https://example.com/missing.jpg">
                <meta name="twitter:image" content="https://example.com/twitter.jpg">
            </head>
        </html>
        """
        
        twitter_image = create_test_image(100, 100, 'yellow')
        
        with patch.object(document_service.download_cache_service, 'get_cached_content') as mock_download:
            # First call returns HTML
            mock_download.return_value = DownloadResult(content=html_content, content_type='text/html')
            
            # Also patch the HtmlDocumentHandler's download_cache_service
            with patch.object(document_service.html_handler.download_cache_service, 'get_cached_content') as mock_html_download:
                # Return None for og:image (404), then success for twitter:image
                mock_html_download.side_effect = [None, DownloadResult(content=twitter_image, content_type='image/jpeg')]
                
                with patch('magic.from_buffer') as mock_magic:
                    mock_magic.side_effect = ['text/html', 'image/jpeg']
                    
                    result = document_service.process_upload_url("https://example.com/product")
        
        assert result.title == "Product Page"
        assert result.detected_type == AttachmentType.URL
        assert result.preview_image is not None
        assert result.preview_image.content == twitter_image

    def test_preview_image_is_html_redirect(
        self, container: ServiceContainer, session: Session, sample_part
    ):
        """Test when preview image URL returns HTML redirect page."""
        document_service = container.document_service()
        
        html_content = b"""
        <html>
            <head>
                <title>Component Spec</title>
                <meta property="og:image" content="https://example.com/image-redirect">
            </head>
        </html>
        """
        
        redirect_html = b"<html><body>Redirecting...</body></html>"
        
        with patch.object(document_service.download_cache_service, 'get_cached_content') as mock_download:
            # First call returns HTML
            mock_download.return_value = DownloadResult(content=html_content, content_type='text/html')
            
            # Also patch the HtmlDocumentHandler's download_cache_service
            with patch.object(document_service.html_handler.download_cache_service, 'get_cached_content') as mock_html_download:
                # Return redirect HTML instead of image, then None for fallbacks
                mock_html_download.side_effect = [DownloadResult(content=redirect_html, content_type='text/html'), None]
                
                with patch('magic.from_buffer') as mock_magic:
                    mock_magic.side_effect = ['text/html', 'text/html']
                    
                    result = document_service.process_upload_url("https://example.com/spec")
        
        assert result.title == "Component Spec"
        assert result.detected_type == AttachmentType.URL
        assert result.preview_image is None  # Couldn't find valid image

    def test_preview_image_1x1_pixel_filtered(
        self, container: ServiceContainer, session: Session, sample_part, create_test_image
    ):
        """Test that 1x1 tracking pixels are filtered out."""
        document_service = container.document_service()
        
        html_content = b"""
        <html>
            <head>
                <title>Electronics Store</title>
                <meta property="og:image" content="https://tracking.com/pixel.gif">
                <link rel="icon" href="/favicon.ico">
            </head>
        </html>
        """
        
        tracking_pixel = create_test_image(1, 1, 'white')
        favicon = create_test_image(16, 16, 'blue')
        
        with patch.object(document_service.download_cache_service, 'get_cached_content') as mock_download:
            # First call returns HTML
            mock_download.return_value = DownloadResult(content=html_content, content_type='text/html')
            
            # Also patch the HtmlDocumentHandler's download_cache_service
            with patch.object(document_service.html_handler.download_cache_service, 'get_cached_content') as mock_html_download:
                # Return 1x1 pixel for og:image (gets filtered), then favicon
                mock_html_download.side_effect = [DownloadResult(content=tracking_pixel, content_type='image/jpeg'), DownloadResult(content=favicon, content_type='image/jpeg')]
                
                with patch('magic.from_buffer') as mock_magic:
                    mock_magic.side_effect = ['text/html', 'image/jpeg', 'image/jpeg']
                    
                    result = document_service.process_upload_url("https://store.example.com")
        
        assert result.detected_type == AttachmentType.URL
        assert result.preview_image is not None
        assert result.preview_image.content == favicon  # Used favicon, not tracking pixel

    def test_timeout_during_preview_download(
        self, container: ServiceContainer, session: Session, sample_part
    ):
        """Test handling timeout during preview image download."""
        document_service = container.document_service()
        
        html_content = b"""
        <html>
            <head>
                <title>Slow Loading Page</title>
                <meta property="og:image" content="https://slow.com/image.jpg">
            </head>
        </html>
        """
        
        with patch.object(document_service.download_cache_service, 'get_cached_content') as mock_download:
            # HTML succeeds, image times out
            mock_download.side_effect = [DownloadResult(content=html_content, content_type='text/html'), None]
            
            with patch('magic.from_buffer', return_value='text/html'):
                result = document_service.process_upload_url("https://slow.example.com")
        
        assert result.title == "Slow Loading Page"
        assert result.detected_type == AttachmentType.URL
        assert result.preview_image is None  # Gracefully handled timeout

    def test_real_world_github_pattern(
        self, container: ServiceContainer, session: Session, sample_part, create_test_image
    ):
        """Test parsing real-world HTML pattern from GitHub."""
        document_service = container.document_service()
        
        # Simplified GitHub-style HTML
        html_content = b"""
        <html>
            <head>
                <title>arduino/Arduino: open-source electronics platform</title>
                <meta property="og:image" content="https://opengraph.github.com/abc123/arduino/Arduino">
                <meta property="og:title" content="GitHub - arduino/Arduino">
                <meta name="twitter:image:src" content="https://opengraph.github.com/abc123/arduino/Arduino">
                <link rel="icon" type="image/svg+xml" href="/favicon.svg">
            </head>
        </html>
        """
        
        github_card = create_test_image(1200, 600, 'purple')
        
        with patch.object(document_service.download_cache_service, 'get_cached_content') as mock_download:
            # First call returns HTML
            mock_download.return_value = DownloadResult(content=html_content, content_type='text/html')
            
            # Also patch the HtmlDocumentHandler's download_cache_service
            with patch.object(document_service.html_handler.download_cache_service, 'get_cached_content') as mock_html_download:
                # Return GitHub card for og:image
                mock_html_download.return_value = DownloadResult(content=github_card, content_type='image/jpeg')
                
                with patch('magic.from_buffer') as mock_magic:
                    mock_magic.side_effect = ['text/html', 'image/jpeg']
                    
                    result = document_service.process_upload_url("https://github.com/arduino/Arduino")
        
        assert result.title == "arduino/Arduino: open-source electronics platform"
        assert result.detected_type == AttachmentType.URL
        assert result.preview_image is not None

    def test_real_world_youtube_pattern(
        self, container: ServiceContainer, session: Session, sample_part, create_test_image
    ):
        """Test parsing real-world HTML pattern from YouTube."""
        document_service = container.document_service()
        
        # Simplified YouTube-style HTML
        html_content = b"""
        <html>
            <head>
                <title>How to Solder - YouTube</title>
                <meta property="og:image" content="https://i.ytimg.com/vi/VIDEO_ID/maxresdefault.jpg">
                <meta property="og:title" content="How to Solder">
                <meta name="twitter:image" content="https://i.ytimg.com/vi/VIDEO_ID/maxresdefault.jpg">
            </head>
        </html>
        """
        
        youtube_thumb = create_test_image(1280, 720, 'red')
        
        with patch.object(document_service.download_cache_service, 'get_cached_content') as mock_download:
            # First call returns HTML
            mock_download.return_value = DownloadResult(content=html_content, content_type='text/html')
            
            # Also patch the HtmlDocumentHandler's download_cache_service
            with patch.object(document_service.html_handler.download_cache_service, 'get_cached_content') as mock_html_download:
                # Return YouTube thumbnail for og:image
                mock_html_download.return_value = DownloadResult(content=youtube_thumb, content_type='image/jpeg')
                
                with patch('magic.from_buffer') as mock_magic:
                    mock_magic.side_effect = ['text/html', 'image/jpeg']
                    
                    result = document_service.process_upload_url("https://youtube.com/watch?v=VIDEO_ID")
        
        assert result.title == "How to Solder - YouTube"
        assert result.detected_type == AttachmentType.URL
        assert result.preview_image is not None
        assert result.preview_image.content == youtube_thumb

    def test_file_upload_ignores_provided_content_type(
        self, container: ServiceContainer, session: Session, sample_part, create_test_image
    ):
        """Test that file upload uses python-magic, not provided content_type."""
        document_service = container.document_service()
        
        # Image data but wrong content type provided
        image_data = create_test_image()
        file_obj = io.BytesIO(image_data)
        
        with patch('magic.from_buffer', return_value='image/jpeg'):
            with patch.object(document_service.s3_service, 'upload_file'):
                attachment = document_service.create_file_attachment(
                    part_key=sample_part.key,
                    title="Schematic",
                    file_data=file_obj,
                    filename="schematic.doc"  # Wrong extension
                )
        
        # Should use detected type, not provided type
        assert attachment.content_type == "image/jpeg"
        assert attachment.attachment_type == AttachmentType.IMAGE