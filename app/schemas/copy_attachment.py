"""Schemas for copying attachments between parts."""

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.attachment_set import AttachmentResponseSchema


class CopyAttachmentRequestSchema(BaseModel):
    """Schema for copy attachment request."""

    model_config = ConfigDict(from_attributes=True)

    attachment_id: int = Field(
        ...,
        description="ID of the attachment to copy",
        json_schema_extra={"example": 123}
    )
    target_part_key: str = Field(
        ...,
        description="Key of the part to copy attachment to",
        json_schema_extra={"example": "ABCD"}
    )
    set_as_cover: bool = Field(
        default=False,
        description="Whether to set the copied attachment as the target part's cover image",
        json_schema_extra={"example": True}
    )


class CopyAttachmentResponseSchema(BaseModel):
    """Schema for copy attachment response."""

    model_config = ConfigDict(from_attributes=True)

    attachment: AttachmentResponseSchema = Field(
        ...,
        description="Details of the newly created attachment"
    )
