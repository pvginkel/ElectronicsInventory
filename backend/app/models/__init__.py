"""SQLAlchemy models for Electronics Inventory."""

# Import all models here for Alembic auto-generation
from app.models.box import Box
from app.models.kit import Kit, KitStatus
from app.models.kit_content import KitContent
from app.models.kit_pick_list import KitPickList, KitPickListStatus
from app.models.kit_pick_list_line import KitPickListLine, PickListLineStatus
from app.models.kit_shopping_list_link import KitShoppingListLink
from app.models.location import Location
from app.models.part import Part
from app.models.part_attachment import AttachmentType, PartAttachment
from app.models.part_location import PartLocation
from app.models.quantity_history import QuantityHistory
from app.models.shopping_list import ShoppingList, ShoppingListStatus
from app.models.shopping_list_line import (
    ShoppingListLine,
    ShoppingListLineStatus,
)
from app.models.shopping_list_seller_note import ShoppingListSellerNote
from app.models.type import Type

__all__: list[str] = [
    "AttachmentType",
    "Box",
    "Location",
    "Part",
    "PartAttachment",
    "PartLocation",
    "QuantityHistory",
    "KitContent",
    "Kit",
    "KitStatus",
    "KitPickList",
    "KitPickListLine",
    "KitPickListStatus",
    "PickListLineStatus",
    "KitShoppingListLink",
    "ShoppingList",
    "ShoppingListLine",
    "ShoppingListSellerNote",
    "ShoppingListLineStatus",
    "ShoppingListStatus",
    "Type"
]
