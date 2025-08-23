"""
Common response schemas for consistent API structure.
"""
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class ErrorResponseSchema(BaseModel):
    """Standard error response format."""
    model_config = ConfigDict(from_attributes=True)

    error: str = Field(..., description="Error message", json_schema_extra={"example": "Validation failed"})
    details: list[str] | str | None = Field(None, description="Additional error details", json_schema_extra={"example": ["box_no: field required"]})


class SuccessResponseSchema(BaseModel):
    """Standard success response format."""
    model_config = ConfigDict(from_attributes=True)

    message: str = Field(..., description="Success message", json_schema_extra={"example": "Operation completed successfully"})
    data: Any | None = Field(None, description="Response data")


class MessageResponseSchema(BaseModel):
    """Simple message response format."""
    model_config = ConfigDict(from_attributes=True)

    message: str = Field(..., description="Response message", json_schema_extra={"example": "Box deleted successfully"})


class PaginationMetaSchema(BaseModel):
    """Pagination metadata for future use."""
    model_config = ConfigDict(from_attributes=True)

    page: int = Field(..., description="Current page number", json_schema_extra={"example": 1})
    per_page: int = Field(..., description="Items per page", json_schema_extra={"example": 20})
    total: int = Field(..., description="Total number of items", json_schema_extra={"example": 150})
    total_pages: int = Field(..., description="Total number of pages", json_schema_extra={"example": 8})


class PaginatedResponseSchema(BaseModel):
    """Paginated response format for future use."""
    model_config = ConfigDict(from_attributes=True)

    data: list[Any] = Field(..., description="Response data items")
    meta: PaginationMetaSchema = Field(..., description="Pagination metadata")
