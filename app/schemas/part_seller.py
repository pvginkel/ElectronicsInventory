"""Part seller link schemas for request/response validation."""

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class PartSellerCreateSchema(BaseModel):
    """Schema for creating a part-seller link."""

    seller_id: int = Field(
        ...,
        description="ID of the seller to link",
        json_schema_extra={"example": 1}
    )
    link: str = Field(
        ...,
        min_length=1,
        max_length=500,
        description="Seller-specific product page URL",
        json_schema_extra={"example": "https://www.digikey.com/en/products/detail/abc123"}
    )


class PartSellerLinkSchema(BaseModel):
    """Schema for a part-seller link in responses."""

    model_config = ConfigDict(from_attributes=True)

    id: int = Field(
        description="Unique identifier for this seller link",
        json_schema_extra={"example": 1}
    )
    seller_id: int = Field(
        description="ID of the linked seller",
        json_schema_extra={"example": 1}
    )
    seller_name: str = Field(
        description="Name of the linked seller",
        json_schema_extra={"example": "DigiKey"}
    )
    seller_website: str = Field(
        description="Website of the linked seller",
        json_schema_extra={"example": "https://www.digikey.com"}
    )
    link: str = Field(
        description="Seller-specific product page URL",
        json_schema_extra={"example": "https://www.digikey.com/en/products/detail/abc123"}
    )
    logo_url: str | None = Field(
        default=None,
        description="CAS URL for the seller logo image, or null if no logo is uploaded",
        json_schema_extra={"example": "/api/cas/abc123def456"}
    )
    created_at: datetime = Field(
        description="Timestamp when the link was created"
    )
