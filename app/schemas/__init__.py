"""Pydantic schemas for request/response validation."""

# Import all schemas here for easy access
from app.schemas.box import (
    BoxCreateSchema,
    BoxListSchema,
    BoxResponseSchema,
)
from app.schemas.location import LocationResponseSchema
from app.schemas.shopping_list_seller_note import (
    ShoppingListSellerOrderNoteSchema,
    ShoppingListSellerOrderNoteUpdateSchema,
)

__all__: list[str] = [
    "BoxCreateSchema",
    "BoxListSchema",
    "BoxResponseSchema",
    "LocationResponseSchema",
    "ShoppingListSellerOrderNoteSchema",
    "ShoppingListSellerOrderNoteUpdateSchema",
]
