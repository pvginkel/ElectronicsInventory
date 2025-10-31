"""Pydantic schemas for request/response validation."""

# Import all schemas here for easy access
from app.schemas.box import (
    BoxCreateSchema,
    BoxListSchema,
    BoxResponseSchema,
)
from app.schemas.kit import (
    KitContentCreateSchema,
    KitContentDetailSchema,
    KitContentUpdateSchema,
    KitCreateSchema,
    KitDetailResponseSchema,
    KitListQuerySchema,
    KitResponseSchema,
    KitShoppingListLinkSchema,
    KitSummarySchema,
    KitUpdateSchema,
)
from app.schemas.location import LocationResponseSchema
from app.schemas.pick_list import (
    KitPickListCreateSchema,
    KitPickListDetailSchema,
    KitPickListLineSchema,
    KitPickListSummarySchema,
)
from app.schemas.shopping_list_seller_note import (
    ShoppingListSellerOrderNoteSchema,
    ShoppingListSellerOrderNoteUpdateSchema,
)

__all__: list[str] = [
    "BoxCreateSchema",
    "BoxListSchema",
    "BoxResponseSchema",
    "LocationResponseSchema",
    "KitContentCreateSchema",
    "KitContentDetailSchema",
    "KitContentUpdateSchema",
    "KitCreateSchema",
    "KitDetailResponseSchema",
    "KitListQuerySchema",
    "KitResponseSchema",
    "KitShoppingListLinkSchema",
    "KitSummarySchema",
    "KitUpdateSchema",
    "KitPickListCreateSchema",
    "KitPickListDetailSchema",
    "KitPickListLineSchema",
    "KitPickListSummarySchema",
    "ShoppingListSellerOrderNoteSchema",
    "ShoppingListSellerOrderNoteUpdateSchema",
]
