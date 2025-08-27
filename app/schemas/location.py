"""Location schemas for request/response validation."""

from pydantic import BaseModel, ConfigDict, Field


class LocationResponseSchema(BaseModel):
    """Schema for location details."""

    box_no: int = Field(
        ...,
        description="The box number where this location is situated",
        json_schema_extra={"example": 7}
    )
    loc_no: int = Field(
        ...,
        description="The location number within the box (e.g., location 3 in box 7 would be '7-3')",
        json_schema_extra={"example": 15}
    )

    model_config = ConfigDict(from_attributes=True)


class PartAssignmentSchema(BaseModel):
    """Schema for part assignment data within a location."""

    id4: str = Field(
        ...,
        description="4-character part identifier",
        json_schema_extra={"example": "R001"}
    )
    qty: int = Field(
        ...,
        description="Quantity of this part at this location",
        json_schema_extra={"example": 25}
    )
    manufacturer_code: str | None = Field(
        default=None,
        description="Manufacturer's part code for display purposes",
        json_schema_extra={"example": "RES-0603-1K"}
    )
    description: str = Field(
        ...,
        description="Part description for display purposes",
        json_schema_extra={"example": "1kΩ resistor, 0603 package"}
    )

    model_config = ConfigDict(from_attributes=True)


class LocationWithPartResponseSchema(BaseModel):
    """Schema for location details with part assignment information."""

    box_no: int = Field(
        ...,
        description="The box number where this location is situated",
        json_schema_extra={"example": 7}
    )
    loc_no: int = Field(
        ...,
        description="The location number within the box",
        json_schema_extra={"example": 15}
    )
    is_occupied: bool = Field(
        ...,
        description="Whether this location contains any parts",
        json_schema_extra={"example": True}
    )
    part_assignments: list[PartAssignmentSchema] | None = Field(
        default=None,
        description="List of parts stored in this location",
        json_schema_extra={"example": []}
    )

    model_config = ConfigDict(from_attributes=True)
