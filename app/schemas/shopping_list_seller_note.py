"""Schemas for shopping list seller order notes."""

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.seller import SellerListSchema


class ShoppingListSellerOrderNoteSchema(BaseModel):
    """Response schema for seller-specific order notes on a shopping list."""

    model_config = ConfigDict(from_attributes=True)

    seller_id: int = Field(
        description="Seller identifier the note applies to",
        json_schema_extra={"example": 4},
    )
    seller: SellerListSchema = Field(
        description="Seller metadata for display",
    )
    note: str = Field(
        description="Free-form per-seller order note",
        json_schema_extra={"example": "Bundle this order with enclosure purchase."},
    )
    updated_at: datetime = Field(
        description="Timestamp when the note was last updated",
    )


class ShoppingListSellerOrderNoteUpdateSchema(BaseModel):
    """Request schema for updating or clearing a seller order note."""

    note: str = Field(
        description="Updated note content; send empty string to clear",
        json_schema_extra={"example": "Use expedited shipping if in stock."},
    )
