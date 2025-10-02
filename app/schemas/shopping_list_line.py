"""Schemas for shopping list line operations."""

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, computed_field

from app.models.shopping_list_line import ShoppingListLineStatus
from app.schemas.part import PartListSchema
from app.schemas.seller import SellerListSchema


class ShoppingListLineCreateSchema(BaseModel):
    """Schema for adding a part to a shopping list."""

    part_id: int = Field(
        ...,
        description="Identifier of the part to add",
        json_schema_extra={"example": 101}
    )
    seller_id: int | None = Field(
        None,
        description="Optional seller override",
        json_schema_extra={"example": 3}
    )
    needed: int = Field(
        ...,
        ge=1,
        description="Quantity required for the build",
        json_schema_extra={"example": 4}
    )
    note: str | None = Field(
        None,
        description="Optional note about this line item",
        json_schema_extra={"example": "Prefer black solder mask variant"}
    )


class ShoppingListLineUpdateSchema(BaseModel):
    """Schema for updating a shopping list line."""

    seller_id: int | None = Field(
        None,
        description="Optional seller override",
        json_schema_extra={"example": 5}
    )
    needed: int | None = Field(
        None,
        ge=1,
        description="Updated required quantity",
        json_schema_extra={"example": 6}
    )
    note: str | None = Field(
        None,
        description="Updated note about this line item",
        json_schema_extra={"example": "Need ROHS compliant"}
    )


class ShoppingListLineListSchema(BaseModel):
    """Lightweight schema for listing shopping list lines."""

    model_config = ConfigDict(from_attributes=True)

    id: int = Field(description="Unique line identifier", json_schema_extra={"example": 42})
    shopping_list_id: int = Field(
        description="Parent shopping list identifier",
        json_schema_extra={"example": 9}
    )
    part_id: int = Field(
        description="Part identifier on this line",
        json_schema_extra={"example": 101}
    )
    seller_id: int | None = Field(
        description="Seller override identifier",
        json_schema_extra={"example": 3}
    )
    needed: int = Field(description="Requested quantity", json_schema_extra={"example": 4})
    ordered: int = Field(description="Ordered quantity", json_schema_extra={"example": 0})
    received: int = Field(description="Received quantity", json_schema_extra={"example": 0})
    status: ShoppingListLineStatus = Field(
        description="Workflow status for this line",
        json_schema_extra={"example": ShoppingListLineStatus.NEW.value}
    )
    note: str | None = Field(
        description="Optional notes for procurement",
        json_schema_extra={"example": "Optional color variant acceptable"}
    )
    created_at: datetime = Field(description="Timestamp when the line was created")
    updated_at: datetime = Field(description="Timestamp when the line was last updated")


class ShoppingListLineResponseSchema(ShoppingListLineListSchema):
    """Detailed schema for shopping list line responses including related entities."""

    model_config = ConfigDict(from_attributes=True)

    part: PartListSchema = Field(
        description="Details about the requested part"
    )
    seller: SellerListSchema | None = Field(
        description="Seller override details if specified"
    )

    @computed_field
    def is_editable(self) -> bool:
        """Expose whether the line can be modified in Phase 1 (status must remain NEW)."""
        return self.status == ShoppingListLineStatus.NEW
