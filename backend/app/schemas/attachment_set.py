"""Attachment set schemas for request/response validation."""

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.models.attachment import AttachmentType


class AttachmentCreateUrlSchema(BaseModel):
    """Schema for creating a URL attachment."""

    title: str = Field(
        ...,
        min_length=1,
        max_length=255,
        description="Title or description of the attachment",
        json_schema_extra={"example": "Official Product Page"}
    )
    url: str = Field(
        ...,
        max_length=2000,
        description="URL to attach",
        json_schema_extra={"example": "https://www.omron.com/products/G5Q-1A4"}
    )


class AttachmentUpdateSchema(BaseModel):
    """Schema for updating attachment metadata."""

    title: str | None = Field(
        None,
        min_length=1,
        max_length=255,
        description="Updated title or description",
        json_schema_extra={"example": "Updated Datasheet - OMRON G5Q-1A4"}
    )


class AttachmentResponseSchema(BaseModel):
    """Schema for full attachment details."""

    model_config = ConfigDict(from_attributes=True)

    id: int = Field(
        description="Unique attachment identifier",
        json_schema_extra={"example": 123}
    )
    attachment_set_id: int = Field(
        description="ID of the associated attachment set",
        json_schema_extra={"example": 456}
    )
    attachment_type: AttachmentType = Field(
        description="Type of attachment",
        json_schema_extra={"example": "image"}
    )
    title: str = Field(
        description="Title or description of the attachment",
        json_schema_extra={"example": "Datasheet - OMRON G5Q-1A4"}
    )
    url: str | None = Field(
        description="Original URL (for URL attachments)",
        json_schema_extra={"example": "https://www.omron.com/products/G5Q-1A4"}
    )
    filename: str | None = Field(
        description="Original filename (for uploaded files)",
        json_schema_extra={"example": "omron_g5q_datasheet.pdf"}
    )
    content_type: str | None = Field(
        description="MIME type of the file",
        json_schema_extra={"example": "application/pdf"}
    )
    file_size: int | None = Field(
        description="File size in bytes",
        json_schema_extra={"example": 1048576}
    )
    created_at: datetime = Field(
        description="Timestamp when the attachment was created",
        json_schema_extra={"example": "2024-01-15T10:30:00Z"}
    )
    updated_at: datetime = Field(
        description="Timestamp when the attachment was last modified",
        json_schema_extra={"example": "2024-01-15T14:45:00Z"}
    )
    attachment_url: str | None = Field(
        default=None,
        description="Base CAS URL with content_type and filename pre-baked. "
                    "Add &disposition=attachment for downloads or &thumbnail=<size> for thumbnails.",
        json_schema_extra={"example": "/api/cas/abc123...?content_type=application/pdf&filename=datasheet.pdf"}
    )
    preview_url: str | None = Field(
        default=None,
        description="Preview URL (CAS URL for images, PDF icon for PDFs, None for URLs)",
        json_schema_extra={"example": "/api/cas/abc123...?content_type=image/jpeg"}
    )


class AttachmentListSchema(BaseModel):
    """Schema for lightweight attachment listing."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    attachment_type: AttachmentType
    title: str
    url: str | None = None
    attachment_url: str | None = None
    preview_url: str | None = None


class AttachmentSetCoverSchema(BaseModel):
    """Schema for attachment set cover information."""

    cover_attachment_id: int | None = Field(
        description="ID of the cover attachment, or null if no cover set",
        json_schema_extra={"example": 123}
    )
    cover_url: str | None = Field(
        description="CAS URL for the cover image, or null if no cover set",
        json_schema_extra={"example": "/api/cas/abc123...?content_type=image/jpeg"}
    )


class AttachmentSetCoverUpdateSchema(BaseModel):
    """Schema for updating attachment set cover."""

    attachment_id: int | None = Field(
        description="Attachment ID to set as cover, or null to clear cover",
        json_schema_extra={"example": 123}
    )


class AttachmentSetResponseSchema(BaseModel):
    """Schema for full attachment set details."""

    model_config = ConfigDict(from_attributes=True)

    id: int = Field(
        description="Unique attachment set identifier",
        json_schema_extra={"example": 789}
    )
    cover_attachment_id: int | None = Field(
        description="ID of the cover attachment",
        json_schema_extra={"example": 123}
    )
    attachments: list[AttachmentListSchema] = Field(
        description="List of attachments in this set",
        default_factory=list
    )
    created_at: datetime = Field(
        description="Timestamp when the set was created",
        json_schema_extra={"example": "2024-01-15T10:30:00Z"}
    )
    updated_at: datetime = Field(
        description="Timestamp when the set was last modified",
        json_schema_extra={"example": "2024-01-15T14:45:00Z"}
    )
