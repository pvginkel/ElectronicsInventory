"""Location schemas for request/response validation."""

from pydantic import BaseModel, ConfigDict, Field


class LocationResponseSchema(BaseModel):
    """Schema for location details."""

    box_no: int = Field(  # type: ignore[call-overload]
        ...,
        description="The box number where this location is situated",
        json_schema_extra={"example": 7}
    )
    loc_no: int = Field(  # type: ignore[call-overload]
        ...,
        description="The location number within the box (e.g., location 3 in box 7 would be '7-3')",
        json_schema_extra={"example": 15}
    )

    model_config = ConfigDict(from_attributes=True)
