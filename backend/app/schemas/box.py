"""Box schemas for request/response validation."""

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.location import LocationResponseSchema


class BoxCreateSchema(BaseModel):
    """Schema for creating a new box."""

    description: str = Field(
        ...,
        min_length=1,
        max_length=255,
        description="Descriptive name for the box to help identify its contents or purpose",
        json_schema_extra={"example": "Small Components Storage"}
    )
    capacity: int = Field(
        ...,
        gt=0,
        le=1000,
        description="Maximum number of individual storage locations within this box",
        json_schema_extra={"example": 60}
    )


class BoxUpdateSchema(BaseModel):
    """Schema for updating an existing box."""

    description: str = Field(
        ...,
        min_length=1,
        max_length=255,
        description="Updated descriptive name for the box",
        json_schema_extra={"example": "Updated Components Storage"}
    )
    capacity: int = Field(
        ...,
        gt=0,
        le=1000,
        description="Updated maximum number of storage locations in this box",
        json_schema_extra={"example": 80}
    )


class BoxResponseSchema(BaseModel):
    """Schema for full box details with locations."""

    box_no: int = Field(
        description="Sequential box number assigned automatically",
        json_schema_extra={"example": 7}
    )
    description: str = Field(
        description="Descriptive name for the box",
        json_schema_extra={"example": "Small Components Storage"}
    )
    capacity: int = Field(
        description="Maximum number of storage locations in this box",
        json_schema_extra={"example": 60}
    )
    created_at: datetime = Field(
        description="Timestamp when the box was created",
        json_schema_extra={"example": "2024-01-15T10:30:00Z"}
    )
    updated_at: datetime = Field(
        description="Timestamp when the box was last modified",
        json_schema_extra={"example": "2024-01-15T14:45:00Z"}
    )
    locations: list[LocationResponseSchema] = Field(
        description="List of all storage locations within this box"
    )

    model_config = ConfigDict(from_attributes=True)


class BoxListSchema(BaseModel):
    """Schema for lightweight box list."""

    box_no: int = Field(
        description="Sequential box number",
        json_schema_extra={"example": 7}
    )
    description: str = Field(
        description="Descriptive name for the box",
        json_schema_extra={"example": "Small Components Storage"}
    )
    capacity: int = Field(
        description="Maximum number of storage locations in this box",
        json_schema_extra={"example": 60}
    )

    model_config = ConfigDict(from_attributes=True)


class BoxWithUsageSchema(BaseModel):
    """Schema for box with usage statistics."""

    box_no: int = Field(
        description="Sequential box number",
        json_schema_extra={"example": 7}
    )
    description: str = Field(
        description="Descriptive name for the box",
        json_schema_extra={"example": "Small Components Storage"}
    )
    capacity: int = Field(
        description="Maximum number of storage locations in this box",
        json_schema_extra={"example": 60}
    )
    created_at: datetime = Field(
        description="Timestamp when the box was created",
        json_schema_extra={"example": "2024-01-15T10:30:00Z"}
    )
    updated_at: datetime = Field(
        description="Timestamp when the box was last modified",
        json_schema_extra={"example": "2024-01-15T14:45:00Z"}
    )
    total_locations: int = Field(
        description="Total number of locations in this box",
        json_schema_extra={"example": 60}
    )
    occupied_locations: int = Field(
        description="Number of locations currently occupied by parts",
        json_schema_extra={"example": 42}
    )
    available_locations: int = Field(
        description="Number of locations currently available for new parts",
        json_schema_extra={"example": 18}
    )
    usage_percentage: float = Field(
        description="Percentage of locations that are occupied",
        json_schema_extra={"example": 70.0}
    )

    model_config = ConfigDict(from_attributes=True)


class BoxUsageStatsSchema(BaseModel):
    """Schema for box usage statistics."""

    box_no: int = Field(
        description="Box number",
        json_schema_extra={"example": 7}
    )
    total_locations: int = Field(
        description="Total number of locations in this box",
        json_schema_extra={"example": 60}
    )
    occupied_locations: int = Field(
        description="Number of locations currently occupied by parts",
        json_schema_extra={"example": 42}
    )
    available_locations: int = Field(
        description="Number of locations currently available for new parts",
        json_schema_extra={"example": 18}
    )
    usage_percentage: float = Field(
        description="Percentage of locations that are occupied",
        json_schema_extra={"example": 70.0}
    )

    model_config = ConfigDict(from_attributes=True)
