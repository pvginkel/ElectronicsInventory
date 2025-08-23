"""Pydantic schemas for request/response validation."""

# Import all schemas here for easy access
from app.schemas.box import (
    BoxCreateSchema,
    BoxListSchema,
    BoxResponseSchema,
)
from app.schemas.location import LocationResponseSchema

__all__: list[str] = [
    "BoxCreateSchema",
    "BoxListSchema",
    "BoxResponseSchema",
    "LocationResponseSchema",
]
