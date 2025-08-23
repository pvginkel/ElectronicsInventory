"""Location schemas for request/response validation."""

from pydantic import BaseModel


class LocationResponseSchema(BaseModel):
    """Schema for location details."""

    box_no: int
    loc_no: int

    class Config:
        from_attributes = True
