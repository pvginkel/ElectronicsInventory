"""Box schemas for request/response validation."""

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field

from app.schemas.location import LocationResponseSchema


class BoxCreateSchema(BaseModel):
    """Schema for creating a new box."""

    description: str = Field(..., min_length=1, description="Box description")
    capacity: int = Field(..., gt=0, description="Number of locations in the box")


class BoxResponseSchema(BaseModel):
    """Schema for full box details with locations."""

    box_no: int
    description: str
    capacity: int
    created_at: datetime
    updated_at: datetime
    locations: list[LocationResponseSchema]

    class Config:
        from_attributes = True


class BoxListSchema(BaseModel):
    """Schema for lightweight box list."""

    box_no: int
    description: str
    capacity: int

    class Config:
        from_attributes = True


class BoxLocationGridSchema(BaseModel):
    """Schema for box with location grid for UI."""

    box_no: int
    description: str
    capacity: int
    location_grid: dict[str, Any] = Field(
        description="Grid layout data for UI display"
    )

    class Config:
        from_attributes = True