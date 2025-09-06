"""Part attachment schemas for request/response validation."""

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.models.part_attachment import AttachmentType


class PartAttachmentCreateFileSchema(BaseModel):
    """Schema for creating a file attachment (image/PDF)."""

    title: str = Field(
        ...,
        min_length=1,
        max_length=255,
        description="Title or description of the attachment",
        json_schema_extra={"example": "Datasheet - OMRON G5Q-1A4"}
    )


class PartAttachmentCreateUrlSchema(BaseModel):
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


class PartAttachmentUpdateSchema(BaseModel):
    """Schema for updating attachment metadata."""

    title: str | None = Field(
        None,
        min_length=1,
        max_length=255,
        description="Updated title or description",
        json_schema_extra={"example": "Updated Datasheet - OMRON G5Q-1A4"}
    )


class PartAttachmentResponseSchema(BaseModel):
    """Schema for full attachment details."""

    id: int = Field(
        description="Unique attachment identifier",
        json_schema_extra={"example": 123}
    )
    part_id: int = Field(
        description="ID of the associated part",
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
    s3_key: str | None = Field(
        description="S3 storage key for the file",
        json_schema_extra={"example": "parts/456/attachments/abc123.pdf"}
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
    has_preview: bool = Field(
        description="Whether this attachment has a preview image",
        json_schema_extra={"example": True}
    )

    model_config = ConfigDict(from_attributes=True)


class PartAttachmentListSchema(BaseModel):
    """Schema for lightweight attachment listings."""

    id: int = Field(
        description="Unique attachment identifier",
        json_schema_extra={"example": 123}
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
    has_preview: bool = Field(
        description="Whether this attachment has a preview image",
        json_schema_extra={"example": True}
    )

    model_config = ConfigDict(from_attributes=True)


class SetCoverAttachmentSchema(BaseModel):
    """Schema for setting part cover attachment."""

    attachment_id: int | None = Field(
        description="Attachment ID to set as cover, or null to clear",
        json_schema_extra={"example": 123}
    )


class CoverAttachmentResponseSchema(BaseModel):
    """Schema for cover attachment response."""

    attachment_id: int | None = Field(
        description="Current cover attachment ID, or null if none set",
        json_schema_extra={"example": 123}
    )
    attachment: PartAttachmentResponseSchema | None = Field(
        description="Cover attachment details, or null if none set",
        default=None
    )

    model_config = ConfigDict(from_attributes=True)
