"""Location schemas for request/response validation."""

from pydantic import BaseModel, ConfigDict


class LocationResponseSchema(BaseModel):
    """Schema for location details."""

    box_no: int
    loc_no: int

    model_config = ConfigDict(from_attributes=True)
