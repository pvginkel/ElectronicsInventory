"""Schemas supporting part-centric shopping list interactions."""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models.shopping_list import ShoppingListStatus
from app.models.shopping_list_line import ShoppingListLine, ShoppingListLineStatus
from app.schemas.seller import SellerListSchema


class PartShoppingListMembershipSchema(BaseModel):
    """Schema describing an active shopping list membership for a part."""

    model_config = ConfigDict(from_attributes=True)

    shopping_list_id: int = Field(
        description="Identifier of the shopping list containing the part",
        json_schema_extra={"example": 3},
    )
    shopping_list_name: str = Field(
        description="Name of the shopping list",
        json_schema_extra={"example": "Workbench Restock"},
    )
    shopping_list_status: ShoppingListStatus = Field(
        description="Workflow status of the parent shopping list",
        json_schema_extra={"example": ShoppingListStatus.CONCEPT.value},
    )
    line_id: int = Field(
        description="Identifier of the shopping list line",
        json_schema_extra={"example": 17},
    )
    line_status: ShoppingListLineStatus = Field(
        description="Workflow status of the shopping list line",
        json_schema_extra={"example": ShoppingListLineStatus.NEW.value},
    )
    needed: int = Field(
        description="Quantity required on the shopping list",
        json_schema_extra={"example": 5},
    )
    ordered: int = Field(
        description="Quantity that has been ordered",
        json_schema_extra={"example": 0},
    )
    received: int = Field(
        description="Quantity received so far",
        json_schema_extra={"example": 0},
    )
    seller: SellerListSchema | None = Field(
        description="Seller override or default seller context for the line",
        default=None,
    )
    note: str | None = Field(
        description="Optional note attached to the shopping list line",
        default=None,
        json_schema_extra={"example": "Grab extras if on sale"},
    )

    @classmethod
    def from_line(cls, line: ShoppingListLine) -> PartShoppingListMembershipSchema:
        """Build the schema from a fully-loaded shopping list line."""

        seller_obj = line.effective_seller
        seller_schema = (
            SellerListSchema.model_validate(seller_obj)
            if seller_obj is not None
            else None
        )

        shopping_list = line.shopping_list
        if shopping_list is None:
            raise ValueError("Shopping list relationship must be loaded for serialization")

        return cls(
            shopping_list_id=line.shopping_list_id,
            shopping_list_name=shopping_list.name,
            shopping_list_status=shopping_list.status,
            line_id=line.id,
            line_status=line.status,
            needed=line.needed,
            ordered=line.ordered,
            received=line.received,
            seller=seller_schema,
            note=line.note,
    )


class PartShoppingListMembershipCreateSchema(BaseModel):
    """Schema for adding a part to a Concept shopping list from the part view."""

    shopping_list_id: int = Field(
        ...,
        description="Identifier of the Concept shopping list to target",
        json_schema_extra={"example": 3},
    )
    needed: int = Field(
        ...,
        ge=1,
        description="Quantity of the part needed for the project",
        json_schema_extra={"example": 2},
    )
    seller_id: int | None = Field(
        None,
        description="Optional seller override for this line",
        json_schema_extra={"example": 4},
    )
    note: str | None = Field(
        None,
        description="Optional note explaining the request",
        json_schema_extra={"example": "Use green LEDs if available"},
    )


class PartShoppingListMembershipQueryRequestSchema(BaseModel):
    """Schema for querying shopping list memberships for multiple parts."""

    part_keys: list[str] = Field(
        ...,
        min_length=1,
        max_length=250,
        description="Ordered collection of part keys to resolve",
        json_schema_extra={"example": ["ABCD", "EFGH"]},
    )
    include_done: bool | None = Field(
        default=False,
        description="Include DONE list and line statuses when true",
    )

    @field_validator("part_keys")
    @classmethod
    def _validate_part_keys(cls, part_keys: list[str]) -> list[str]:
        """Normalise whitespace and enforce uniqueness."""
        normalised: list[str] = []
        seen: set[str] = set()

        for raw_key in part_keys:
            if not isinstance(raw_key, str):
                raise TypeError("part_keys must contain only strings")

            key = raw_key.strip()
            if not key:
                raise ValueError("part_keys must not contain blank values")

            if key in seen:
                raise ValueError("part_keys must not contain duplicate values")
            seen.add(key)
            normalised.append(key)

        return normalised


class PartShoppingListMembershipQueryItemSchema(BaseModel):
    """Schema encapsulating memberships for a single part within a bulk response."""

    model_config = ConfigDict(from_attributes=True)

    part_key: str = Field(
        description="Requested part key",
        json_schema_extra={"example": "ABCD"},
    )
    memberships: list[PartShoppingListMembershipSchema] = Field(
        description="Memberships associated with the part key",
        default_factory=list,
    )


class PartShoppingListMembershipQueryResponseSchema(BaseModel):
    """Bulk response schema for shopping list membership lookups."""

    model_config = ConfigDict(from_attributes=True)

    memberships: list[PartShoppingListMembershipQueryItemSchema] = Field(
        default_factory=list,
        description="Memberships grouped by requested part key order",
    )
