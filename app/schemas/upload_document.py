"""Schemas for document upload processing."""

from pydantic import BaseModel, Field

from app.models.attachment import AttachmentType


class DocumentContentSchema(BaseModel):
    """Schema for document content."""

    content: bytes = Field(description="Raw content of the document")
    content_type: str = Field(description="MIME type of the content")


class UploadDocumentSchema(BaseModel):
    """Schema for processed upload document."""

    title: str = Field(description="HTML title or detected filename")
    content: DocumentContentSchema = Field(description="Raw content from URL")
    detected_type: AttachmentType | None = Field(description="Attachment type detected from content")
    preview_image: DocumentContentSchema | None = Field(
        default=None,
        description="Preview image for websites (what goes in S3)"
    )
