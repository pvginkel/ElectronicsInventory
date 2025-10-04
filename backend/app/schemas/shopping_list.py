"""Schemas for shopping list request and response payloads."""

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, computed_field

from app.models.shopping_list import ShoppingListStatus
from app.schemas.seller import SellerListSchema
from app.schemas.shopping_list_line import (
    ShoppingListLineListSchema,
    ShoppingListLineResponseSchema,
)
from app.schemas.shopping_list_seller_note import (
    ShoppingListSellerOrderNoteSchema,
)


class ShoppingListCreateSchema(BaseModel):
    """Schema for creating a new shopping list."""

    name: str = Field(
        ...,
        min_length=1,
        max_length=255,
        description="Unique name for the shopping list",
        json_schema_extra={"example": "Spring Synth Build"}
    )
    description: str | None = Field(
        None,
        description="Optional description of the list's purpose",
        json_schema_extra={"example": "Parts needed for the new eurorack module"}
    )


class ShoppingListUpdateSchema(BaseModel):
    """Schema for updating list metadata."""

    name: str | None = Field(
        None,
        min_length=1,
        max_length=255,
        description="Updated name for the list",
        json_schema_extra={"example": "Synthesizer BOM"}
    )
    description: str | None = Field(
        None,
        description="Updated description",
        json_schema_extra={"example": "Shopping list for the multi-effects pedal"}
    )


class ShoppingListStatusUpdateSchema(BaseModel):
    """Schema for updating the workflow status of a list."""

    status: ShoppingListStatus = Field(
        ...,
        description="New status for the shopping list",
        json_schema_extra={"example": ShoppingListStatus.READY.value}
    )


class ShoppingListLineCountsSchema(BaseModel):
    """Aggregated counts of shopping list lines by status."""

    new: int = Field(description="Number of lines in NEW status")
    ordered: int = Field(description="Number of lines marked ORDERED")
    done: int = Field(description="Number of lines marked DONE")

    @computed_field
    def total(self) -> int:
        """Total number of lines across all statuses."""
        return self.new + self.ordered + self.done


class ShoppingListListSchema(BaseModel):
    """Lightweight schema for shopping list listings."""

    model_config = ConfigDict(from_attributes=True)

    id: int = Field(description="Unique shopping list identifier", json_schema_extra={"example": 7})
    name: str = Field(
        description="Shopping list name",
        json_schema_extra={"example": "Synth Voice Build"}
    )
    description: str | None = Field(
        description="Optional list description",
        json_schema_extra={"example": "Collect everything for the VCF section"}
    )
    status: ShoppingListStatus = Field(
        description="Workflow status",
        json_schema_extra={"example": ShoppingListStatus.CONCEPT.value}
    )
    updated_at: datetime = Field(
        description="Timestamp when the list was last updated",
        json_schema_extra={"example": "2024-04-10T15:30:00Z"},
    )
    line_counts: ShoppingListLineCountsSchema = Field(
        description="Line counts grouped by status for overview counters",
        json_schema_extra={
            "example": {"new": 3, "ordered": 1, "done": 2},
        },
    )
    seller_notes: list[ShoppingListSellerOrderNoteSchema] = Field(
        default_factory=list,
        description="Seller-specific notes associated with the list",
    )

    @computed_field
    def last_updated(self) -> datetime:
        """Expose a semantic alias for UI bindings expecting last_updated."""
        return self.updated_at

    @computed_field
    def has_ordered_lines(self) -> bool:
        """Expose whether any lines are marked as ordered."""
        return self.line_counts.ordered > 0


class ShoppingListListQuerySchema(BaseModel):
    """Query parameters supported by the shopping list overview endpoint."""

    include_done: bool = Field(
        default=False,
        description="Include lists whose status is DONE when true",
        json_schema_extra={"example": False},
    )


class ShoppingListSellerGroupTotalsSchema(BaseModel):
    """Aggregated totals for a seller grouping."""

    needed: int = Field(
        description="Total needed quantity for the group",
        json_schema_extra={"example": 12},
    )
    ordered: int = Field(
        description="Total ordered quantity for the group",
        json_schema_extra={"example": 8},
    )
    received: int = Field(
        description="Total received quantity for the group",
        json_schema_extra={"example": 0},
    )


class ShoppingListSellerGroupSchema(BaseModel):
    """Schema representing seller-based grouping in Ready view."""

    group_key: str = Field(
        description="Identifier for the seller grouping (seller id or 'ungrouped')",
        json_schema_extra={"example": "seller-4"},
    )
    seller_id: int | None = Field(
        description="Seller identifier if group is seller-backed",
        json_schema_extra={"example": 4},
    )
    seller: SellerListSchema | None = Field(
        description="Seller metadata for the group when available",
    )
    lines: list[ShoppingListLineResponseSchema] = Field(
        description="Lines that belong to this grouping",
    )
    totals: ShoppingListSellerGroupTotalsSchema = Field(
        description="Aggregated quantities for the group",
    )
    order_note: ShoppingListSellerOrderNoteSchema | None = Field(
        description="Seller note if the group is associated with a seller",
        default=None,
    )


class ShoppingListResponseSchema(BaseModel):
    """Detailed schema for shopping list responses including line items."""

    model_config = ConfigDict(from_attributes=True)

    id: int = Field(description="Unique shopping list identifier", json_schema_extra={"example": 7})
    name: str = Field(
        description="Shopping list name",
        json_schema_extra={"example": "Synth Voice Build"}
    )
    description: str | None = Field(
        description="Optional list description",
        json_schema_extra={"example": "Collect everything for the VCF section"}
    )
    status: ShoppingListStatus = Field(
        description="Workflow status",
        json_schema_extra={"example": ShoppingListStatus.READY.value}
    )
    created_at: datetime = Field(description="Timestamp when the list was created")
    updated_at: datetime = Field(description="Timestamp when the list was last updated")
    line_counts: ShoppingListLineCountsSchema = Field(
        description="Line counts grouped by status"
    )
    lines: list[ShoppingListLineResponseSchema] = Field(
        description="Line items associated with this list"
    )
    seller_notes: list[ShoppingListSellerOrderNoteSchema] = Field(
        default_factory=list,
        description="Seller-specific notes for Ready view",
    )
    seller_groups: list[ShoppingListSellerGroupSchema] = Field(
        default_factory=list,
        description="Grouping of lines by seller for Ready planning",
    )

    @computed_field
    def has_ordered_lines(self) -> bool:
        """Expose whether Ordered lines exist on the list."""
        return self.line_counts.ordered > 0


class ShoppingListLinesResponseSchema(BaseModel):
    """Schema for returning only shopping list lines (used by list lines endpoint)."""

    model_config = ConfigDict(from_attributes=True)

    lines: list[ShoppingListLineListSchema] = Field(
        description="Collection of shopping list line items"
    )
