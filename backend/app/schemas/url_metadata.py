"""URL metadata schemas for structured response handling."""

from enum import Enum

from pydantic import BaseModel, ConfigDict, computed_field


class ThumbnailSourceType(str, Enum):
    """Source type for thumbnail images."""

    PREVIEW_IMAGE = "preview_image"  # og:image or twitter:image
    FAVICON = "favicon"
    DIRECT_IMAGE = "direct_image"
    PDF = "pdf"
    OTHER = "other"


class URLContentType(str, Enum):
    """Content type classification for URLs."""

    WEBPAGE = "webpage"
    IMAGE = "image"
    PDF = "pdf"
    OTHER = "other"  # For unknown MIME types


class URLMetadataSchema(BaseModel):
    """Schema for URL metadata extracted from web pages and files."""

    model_config = ConfigDict(from_attributes=True)

    title: str | None = None  # Page/file title
    page_title: str | None = None  # Deprecated, kept for backward compatibility
    description: str | None = None  # Meta description
    og_image: str | None = None  # Open Graph image URL
    favicon: str | None = None  # Favicon URL
    thumbnail_source: ThumbnailSourceType  # Source of thumbnail
    original_url: str  # Original URL requested
    content_type: URLContentType  # Content type enum
    mime_type: str | None = None  # Actual MIME type for OTHER content_type
    thumbnail_url: str | None = None  # URL for thumbnail image

    @computed_field
    def is_pdf(self) -> bool:
        """Check if content is a PDF document."""
        return self.content_type == URLContentType.PDF

    @computed_field
    def is_image(self) -> bool:
        """Check if content is an image."""
        return self.content_type == URLContentType.IMAGE
