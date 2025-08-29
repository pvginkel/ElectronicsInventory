"""URL preview request and response schemas."""

from pydantic import BaseModel, ConfigDict, Field


class UrlPreviewRequestSchema(BaseModel):
    """Schema for URL preview requests."""

    model_config = ConfigDict(from_attributes=True)

    url: str = Field(..., description="URL to preview")


class UrlPreviewResponseSchema(BaseModel):
    """Schema for URL preview responses."""

    model_config = ConfigDict(from_attributes=True)

    title: str | None = Field(None, description="Page title")
    image_url: str | None = Field(None, description="Backend endpoint URL for preview image")
    original_url: str = Field(..., description="Original URL")
