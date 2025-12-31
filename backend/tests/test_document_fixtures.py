"""Test fixtures and utilities for document testing."""

import io
from pathlib import Path
from typing import BinaryIO

import pytest
from PIL import Image

from app.models.part import Part
from app.models.type import Type


@pytest.fixture
def sample_part(session) -> Part:
    """Create a sample part for testing."""
    from app.models.attachment_set import AttachmentSet

    # Create a part type first
    part_type = Type(name="Test Type")
    session.add(part_type)
    session.flush()

    # Create an attachment set for the part
    attachment_set = AttachmentSet()
    session.add(attachment_set)
    session.flush()

    part = Part(
        key="TEST",
        manufacturer_code="TEST-001",
        type_id=part_type.id,
        description="Test part for document testing",
        attachment_set_id=attachment_set.id
    )
    session.add(part)
    session.flush()
    return part


@pytest.fixture
def sample_image_file() -> BinaryIO:
    """Create a sample PNG image file for testing."""
    # Create a simple 100x100 red image
    img = Image.new('RGB', (100, 100), color='red')
    img_bytes = io.BytesIO()
    img.save(img_bytes, format='PNG')
    img_bytes.seek(0)
    return img_bytes


@pytest.fixture
def sample_pdf_bytes() -> bytes:
    """Create a minimal valid PDF for testing."""
    # Minimal PDF structure
    pdf_content = b"""%PDF-1.4
1 0 obj
<<
/Type /Catalog
/Pages 2 0 R
>>
endobj
2 0 obj
<<
/Type /Pages
/Kids [3 0 R]
/Count 1
>>
endobj
3 0 obj
<<
/Type /Page
/Parent 2 0 R
/MediaBox [0 0 612 792]
>>
endobj
xref
0 4
0000000000 65535 f
0000000009 00000 n
0000000058 00000 n
0000000115 00000 n
trailer
<<
/Size 4
/Root 1 0 R
>>
startxref
196
%%EOF"""
    return pdf_content


@pytest.fixture
def sample_pdf_file(sample_pdf_bytes) -> BinaryIO:
    """Create a sample PDF file for testing."""
    return io.BytesIO(sample_pdf_bytes)


@pytest.fixture
def large_image_file() -> BinaryIO:
    """Create a large image file for size validation testing."""
    # Create a larger image that might exceed limits
    img = Image.new('RGB', (2000, 2000), color='blue')
    img_bytes = io.BytesIO()
    img.save(img_bytes, format='PNG')
    img_bytes.seek(0)
    return img_bytes


@pytest.fixture
def mock_url_metadata() -> dict:
    """Mock metadata for URL processing tests."""
    return {
        'title': 'Test Product Page',
        'description': 'Test description',
        'og_image': 'https://example.com/image.jpg',
        'favicon': 'https://example.com/favicon.ico'
    }


@pytest.fixture
def mock_html_content() -> str:
    """Mock HTML content for URL scraping tests."""
    return """
    <!DOCTYPE html>
    <html>
    <head>
        <title>Test Product Page</title>
        <meta property="og:title" content="Test Product Page">
        <meta property="og:description" content="Test description">
        <meta property="og:image" content="https://example.com/image.jpg">
        <link rel="icon" href="https://example.com/favicon.ico">
    </head>
    <body>
        <h1>Test Product</h1>
    </body>
    </html>
    """


@pytest.fixture
def temp_thumbnail_dir(tmp_path) -> Path:
    """Create a temporary directory for thumbnail storage."""
    thumbnail_dir = tmp_path / "thumbnails"
    thumbnail_dir.mkdir()
    return thumbnail_dir
