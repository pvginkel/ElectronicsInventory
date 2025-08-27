"""Location schemas for request/response validation."""

from pydantic import BaseModel, ConfigDict, Field


class LocationResponseSchema(BaseModel):
    """Schema for location details."""

    box_no: int = Field(  # type: ignore[call-overload]
        ...,
        description="The box number where this location is situated",
        json_schema_extra={"example": 7},
    )
    loc_no: int = Field(  # type: ignore[call-overload]
        ...,
        description="The location number within the box (e.g., location 3 in box 7 would be '7-3')",
        json_schema_extra={"example": 15},
    )

    model_config = ConfigDict(from_attributes=True)


class PartAssignmentSchema(BaseModel):
    """Schema for minimal part data within location display."""

    id4: str = Field(  # type: ignore[call-overload]
        ...,
        description="4-character part identifier",
        json_schema_extra={"example": "ABCD"},
    )
    qty: int = Field(  # type: ignore[call-overload]
        ..., description="Quantity at this location", json_schema_extra={"example": 25}
    )
    manufacturer_code: str | None = Field(
        None,
        description="Manufacturer part code for display purposes",
        json_schema_extra={"example": "OMRON G5Q-1A4"},
    )
    description: str = Field(  # type: ignore[call-overload]
        ...,
        description="Part description for display purposes",
        json_schema_extra={"example": "SPDT Relay 5VDC"},
    )

    model_config = ConfigDict(from_attributes=True)


class LocationWithPartResponseSchema(BaseModel):
    """Schema for location details including part assignment information."""

    box_no: int = Field(  # type: ignore[call-overload]
        ...,
        description="The box number where this location is situated",
        json_schema_extra={"example": 7},
    )
    loc_no: int = Field(  # type: ignore[call-overload]
        ...,
        description="The location number within the box (e.g., location 3 in box 7 would be '7-3')",
        json_schema_extra={"example": 15},
    )
    is_occupied: bool = Field(  # type: ignore[call-overload]
        ...,
        description="Whether location contains parts",
        json_schema_extra={"example": True},
    )
    part_assignments: list[PartAssignmentSchema] | None = Field(
        None,
        description="Parts stored in this location",
        json_schema_extra={"example": []},
    )

    model_config = ConfigDict(from_attributes=True)
