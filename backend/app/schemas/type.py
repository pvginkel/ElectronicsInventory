"""Type schemas for request/response validation."""

from dataclasses import dataclass
from datetime import datetime
from typing import TYPE_CHECKING

from pydantic import BaseModel, ConfigDict, Field

if TYPE_CHECKING:
    from app.models.type import Type


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


class TypeWithStatsResponseSchema(BaseModel):
    """Schema for type details with part count statistics."""

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
    part_count: int = Field(
        description="Number of parts using this type",
        json_schema_extra={"example": 15}
    )

    model_config = ConfigDict(from_attributes=True)


@dataclass
class TypeWithStatsModel:
    """Service layer model combining Type ORM model with part count statistics."""
    type: 'Type'  # Forward reference to avoid circular imports
    part_count: int
