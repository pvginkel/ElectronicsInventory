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
    effective_seller_id: int | None = Field(
        description="Seller identifier used for grouping (override or part seller)",
        json_schema_extra={"example": 4},
    )
    can_receive: bool = Field(
        description="True when the line can accept stock receipt actions",
        json_schema_extra={"example": True},
    )
    completion_mismatch: bool = Field(
        description="Flag indicating completion with quantity mismatch",
        json_schema_extra={"example": False},
    )
    completion_note: str | None = Field(
        description="Optional note explaining completion mismatch",
        json_schema_extra={"example": "Vendor short-shipped two units"},
    )
    completed_at: datetime | None = Field(
        description="Timestamp when the line was completed",
    )
    has_quantity_mismatch: bool = Field(
        description="True when ordered and received totals differ",
        json_schema_extra={"example": False},
    )


class PartLocationInlineSchema(BaseModel):
    """Inline schema for part location quantities."""

    model_config = ConfigDict(from_attributes=True)

    id: int = Field(
        description="Unique identifier for the part location row",
        json_schema_extra={"example": 501},
    )
    box_no: int = Field(
        description="Box number where stock is stored",
        json_schema_extra={"example": 7},
    )
    loc_no: int = Field(
        description="Location number within the box",
        json_schema_extra={"example": 3},
    )
    qty: int = Field(
        description="Quantity stored at this location",
        json_schema_extra={"example": 10},
    )


class ShoppingListLineResponseSchema(ShoppingListLineListSchema):
    """Detailed schema for shopping list line responses including related entities."""

    model_config = ConfigDict(from_attributes=True)

    part: PartListSchema = Field(
        description="Details about the requested part"
    )
    seller: SellerListSchema | None = Field(
        description="Seller override details if specified"
    )
    effective_seller: SellerListSchema | None = Field(
        description="Seller entity used for Ready grouping",
        default=None,
    )
    is_orderable: bool = Field(
        description="True when the line can be marked as ordered",
        json_schema_extra={"example": True},
    )
    is_revertible: bool = Field(
        description="True when the line can revert from ordered back to new",
        json_schema_extra={"example": False},
    )
    part_locations: list[PartLocationInlineSchema] = Field(
        default_factory=list,
        description="Locations currently holding stock for the part",
    )

    @computed_field
    def is_editable(self) -> bool:
        """Expose whether the line can be modified in Phase 1 (status must remain NEW)."""
        return self.status == ShoppingListLineStatus.NEW


class ShoppingListLineReceiveAllocationSchema(BaseModel):
    """Schema describing a single location allocation for received stock."""

    box_no: int = Field(
        ...,
        ge=1,
        description="Box number where quantity should be stored",
        json_schema_extra={"example": 5},
    )
    loc_no: int = Field(
        ...,
        ge=1,
        description="Location number within the box",
        json_schema_extra={"example": 2},
    )
    qty: int = Field(
        ...,
        ge=1,
        description="Quantity to allocate to the location",
        json_schema_extra={"example": 4},
    )


class ShoppingListLineReceiveSchema(BaseModel):
    """Request schema for receiving stock against an ordered line."""

    receive_qty: int = Field(
        ...,
        ge=1,
        description="Total quantity to receive in this operation",
        json_schema_extra={"example": 6},
    )
    allocations: list[ShoppingListLineReceiveAllocationSchema] = Field(
        ...,
        min_length=1,
        description="Breakdown of where received stock should be stored",
    )


class ShoppingListLineCompleteSchema(BaseModel):
    """Request schema for marking a line as completed without receiving more stock."""

    mismatch_reason: str | None = Field(
        None,
        description="Explanation required when received quantity differs from ordered",
        json_schema_extra={"example": "Supplier discontinued remaining units"},
    )


class ShoppingListLineOrderSchema(BaseModel):
    """Schema for marking a line as ordered."""

    ordered_qty: int | None = Field(
        None,
        ge=0,
        description="Quantity marked as ordered; defaults to needed when omitted",
        json_schema_extra={"example": 5},
    )
    comment: str | None = Field(
        None,
        description="Optional note update to accompany ordering",
        json_schema_extra={"example": "Combine with enclosure order"},
    )


class ShoppingListLineStatusUpdateSchema(BaseModel):
    """Schema for updating the workflow status of a line."""

    status: ShoppingListLineStatus = Field(
        description="Target status for the line",
        json_schema_extra={"example": ShoppingListLineStatus.NEW.value},
    )


class ShoppingListGroupOrderLineSchema(BaseModel):
    """Schema representing a single line entry in a group order action."""

    line_id: int = Field(
        description="Identifier of the line to update",
        json_schema_extra={"example": 42},
    )
    ordered_qty: int | None = Field(
        None,
        ge=0,
        description="Quantity to set as ordered; defaults to current needed quantity",
        json_schema_extra={"example": 10},
    )


class ShoppingListGroupOrderSchema(BaseModel):
    """Request schema for marking a seller group as ordered."""

    lines: list[ShoppingListGroupOrderLineSchema] = Field(
        description="Line-specific ordered quantities for the seller group",
    )
