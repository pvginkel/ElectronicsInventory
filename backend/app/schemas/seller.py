"""Seller schemas for request/response validation."""

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class SellerCreateSchema(BaseModel):
    """Schema for creating a new seller."""

    name: str = Field(
        ...,
        min_length=1,
        max_length=255,
        description="Unique seller name",
        json_schema_extra={"example": "DigiKey"}
    )
    website: str = Field(
        ...,
        min_length=1,
        max_length=500,
        description="Seller website URL",
        json_schema_extra={"example": "https://www.digikey.com"}
    )


class SellerUpdateSchema(BaseModel):
    """Schema for updating an existing seller."""

    name: str | None = Field(
        None,
        min_length=1,
        max_length=255,
        description="Seller name",
        json_schema_extra={"example": "DigiKey"}
    )
    website: str | None = Field(
        None,
        min_length=1,
        max_length=500,
        description="Seller website URL",
        json_schema_extra={"example": "https://www.digikey.com"}
    )


class SellerResponseSchema(BaseModel):
    """Schema for seller API responses."""

    model_config = ConfigDict(from_attributes=True)

    id: int = Field(
        description="Unique seller ID",
        json_schema_extra={"example": 1}
    )
    name: str = Field(
        description="Seller name",
        json_schema_extra={"example": "DigiKey"}
    )
    website: str = Field(
        description="Seller website URL",
        json_schema_extra={"example": "https://www.digikey.com"}
    )
    created_at: datetime = Field(
        description="Timestamp when seller was created"
    )
    updated_at: datetime = Field(
        description="Timestamp when seller was last updated"
    )


class SellerListSchema(BaseModel):
    """Lightweight schema for seller dropdowns and listings."""

    model_config = ConfigDict(from_attributes=True)

    id: int = Field(
        description="Unique seller ID",
        json_schema_extra={"example": 1}
    )
    name: str = Field(
        description="Seller name",
        json_schema_extra={"example": "DigiKey"}
    )
    website: str = Field(
        description="Seller website URL",
        json_schema_extra={"example": "https://www.digikey.com"}
    )
