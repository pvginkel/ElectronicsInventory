"""Box schemas for request/response validation."""

from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.location import LocationResponseSchema


class BoxCreateSchema(BaseModel):
    """Schema for creating a new box."""

    description: str = Field(
        ...,
        min_length=1,
        max_length=255,
        description="Descriptive name for the box to help identify its contents or purpose",
        example="Small Components Storage"
    )
    capacity: int = Field(
        ...,
        gt=0,
        le=1000,
        description="Maximum number of individual storage locations within this box",
        example=60
    )


class BoxUpdateSchema(BaseModel):
    """Schema for updating an existing box."""

    description: str = Field(
        ...,
        min_length=1,
        max_length=255,
        description="Updated descriptive name for the box",
        example="Updated Components Storage"
    )
    capacity: int = Field(
        ...,
        gt=0,
        le=1000,
        description="Updated maximum number of storage locations in this box",
        example=80
    )


class BoxResponseSchema(BaseModel):
    """Schema for full box details with locations."""

    box_no: int = Field(
        description="Sequential box number assigned automatically",
        example=7
    )
    description: str = Field(
        description="Descriptive name for the box",
        example="Small Components Storage"
    )
    capacity: int = Field(
        description="Maximum number of storage locations in this box",
        example=60
    )
    created_at: datetime = Field(
        description="Timestamp when the box was created",
        example="2024-01-15T10:30:00Z"
    )
    updated_at: datetime = Field(
        description="Timestamp when the box was last modified",
        example="2024-01-15T14:45:00Z"
    )
    locations: list[LocationResponseSchema] = Field(
        description="List of all storage locations within this box"
    )

    model_config = ConfigDict(from_attributes=True)


class BoxListSchema(BaseModel):
    """Schema for lightweight box list."""

    box_no: int = Field(
        description="Sequential box number",
        example=7
    )
    description: str = Field(
        description="Descriptive name for the box",
        example="Small Components Storage"
    )
    capacity: int = Field(
        description="Maximum number of storage locations in this box",
        example=60
    )

    model_config = ConfigDict(from_attributes=True)


class BoxLocationGridSchema(BaseModel):
    """Schema for box with location grid for UI."""

    box_no: int = Field(
        description="Sequential box number",
        example=7
    )
    description: str = Field(
        description="Descriptive name for the box",
        example="Small Components Storage"
    )
    capacity: int = Field(
        description="Maximum number of storage locations in this box",
        example=60
    )
    location_grid: dict[str, Any] = Field(  # type: ignore[call-overload]
        ...,
        description="Grid layout data for UI display with rows, columns, and location mappings",
        example={"rows": 10, "cols": 6, "locations": {"1": {"available": True}, "2": {"available": False}}}
    )

    model_config = ConfigDict(from_attributes=True)
