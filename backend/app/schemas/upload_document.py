"""Schemas for document upload processing."""

from pydantic import BaseModel, Field


class UploadDocumentContentSchema(BaseModel):
    """Schema for uploaded document content."""
    
    content: bytes = Field(description="Raw content of the document")
    content_type: str = Field(description="MIME type of the content")


class UploadDocumentSchema(BaseModel):
    """Schema for processed upload document."""
    
    title: str = Field(description="HTML title or detected filename")
    content: UploadDocumentContentSchema = Field(description="Raw content from URL")
    detected_type: str = Field(description="MIME type detected by python-magic")
    preview_image: UploadDocumentContentSchema | None = Field(
        default=None,
        description="Preview image for websites (what goes in S3)"
    )