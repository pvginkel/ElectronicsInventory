"""Schemas for shopping list seller group operations."""

from pydantic import BaseModel, Field

from app.models.shopping_list_seller import ShoppingListSellerStatus


class ShoppingListSellerGroupCreateSchema(BaseModel):
    """Request schema for creating a new seller group on a shopping list."""

    seller_id: int = Field(
        ...,
        description="Seller identifier to create a group for",
        json_schema_extra={"example": 4},
    )


class ShoppingListSellerGroupUpdateSchema(BaseModel):
    """Request schema for updating a seller group's note and/or status."""

    note: str | None = Field(
        None,
        description="Updated order note for the seller group",
        json_schema_extra={"example": "Consolidate with next order batch."},
    )
    status: ShoppingListSellerStatus | None = Field(
        None,
        description="Target status: 'ordered' to place order, 'active' to reopen",
        json_schema_extra={"example": ShoppingListSellerStatus.ORDERED.value},
    )
