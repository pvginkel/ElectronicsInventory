"""Type schemas for request/response validation."""

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class TypeCreateSchema(BaseModel):
    """Schema for creating a new type."""

    name: str = Field(
        ...,
        min_length=1,
        max_length=100,
        description="Name of the part type/category",
        json_schema_extra={"example": "Relay"}
    )


class TypeUpdateSchema(BaseModel):
    """Schema for updating an existing type."""

    name: str = Field(
        ...,
        min_length=1,
        max_length=100,
        description="Updated name of the part type/category",
        json_schema_extra={"example": "Power Relay"}
    )


class TypeResponseSchema(BaseModel):
    """Schema for type details."""

    id: int = Field(
        description="Unique identifier for the type",
        json_schema_extra={"example": 1}
    )
    name: str = Field(
        description="Name of the part type/category",
        json_schema_extra={"example": "Relay"}
    )
    created_at: datetime = Field(
        description="Timestamp when the type was created",
        json_schema_extra={"example": "2024-01-15T10:30:00Z"}
    )
    updated_at: datetime = Field(
        description="Timestamp when the type was last modified",
        json_schema_extra={"example": "2024-01-15T14:45:00Z"}
    )

    model_config = ConfigDict(from_attributes=True)
