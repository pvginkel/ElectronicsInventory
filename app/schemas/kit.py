"""Schemas for kit overview and lifecycle APIs."""

from __future__ import annotations

from datetime import datetime
from enum import Enum

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    computed_field,
    field_validator,
    model_validator,
)

from app.models.kit import KitStatus
from app.models.shopping_list import ShoppingListStatus
from app.schemas.kit_reservations import KitReservationEntrySchema
from app.schemas.part import PartListSchema
from app.schemas.pick_list import KitPickListSummarySchema
from app.schemas.shopping_list import ShoppingListResponseSchema


class KitStatusSchema(str, Enum):
    """Pydantic enum mirroring the KitStatus model enum."""

    ACTIVE = KitStatus.ACTIVE.value
    ARCHIVED = KitStatus.ARCHIVED.value


class KitCreateSchema(BaseModel):
    """Schema for creating a new kit definition."""

    name: str = Field(
        ...,
        min_length=1,
        max_length=255,
        description="Human-readable kit name displayed in overviews",
        json_schema_extra={"example": "Portable Synth Voice"},
    )
    description: str | None = Field(
        None,
        description="Optional description for planners reviewing the kit",
        json_schema_extra={
            "example": "All parts to build the self-contained synth voice demo",
        },
    )
    build_target: int = Field(
        default=1,
        ge=0,
        description="Number of complete kits to maintain in stock; must be zero or greater",
        json_schema_extra={"example": 5},
    )


class KitUpdateSchema(BaseModel):
    """Schema for updating kit metadata."""

    name: str | None = Field(
        None,
        min_length=1,
        max_length=255,
        description="Updated kit name",
        json_schema_extra={"example": "Synth Voice Rev B"},
    )
    description: str | None = Field(
        None,
        description="Updated description for the kit",
        json_schema_extra={
            "example": "Rev B adds MIDI DIN breakouts and improves documentation",
        },
    )
    build_target: int | None = Field(
        None,
        ge=0,
        description="Updated build target for inventory planning; must be zero or greater",
        json_schema_extra={"example": 3},
    )


class KitListQuerySchema(BaseModel):
    """Query parameters supported by the kits overview endpoint."""

    status: KitStatusSchema = Field(
        default=KitStatusSchema.ACTIVE,
        description="Filter kits by lifecycle status",
        json_schema_extra={"example": KitStatusSchema.ACTIVE.value},
    )
    query: str | None = Field(
        default=None,
        min_length=1,
        description="Substring search across kit names and descriptions",
        json_schema_extra={"example": "Synth"},
    )
    limit: int | None = Field(
        default=None,
        ge=1,
        le=100,
        description="Optional maximum number of kits to return",
        json_schema_extra={"example": 12},
    )


class KitSummarySchema(BaseModel):
    """Lightweight schema for kit overview cards."""

    model_config = ConfigDict(from_attributes=True)

    id: int = Field(
        description="Unique kit identifier",
        json_schema_extra={"example": 17},
    )
    name: str = Field(
        description="Kit display name",
        json_schema_extra={"example": "Portable Synth Voice"},
    )
    description: str | None = Field(
        description="Optional kit description shown in the overview",
        json_schema_extra={"example": "Compact synth voice for workshop demos"},
    )
    status: KitStatus = Field(
        description="Current lifecycle status of the kit",
        json_schema_extra={"example": KitStatus.ACTIVE.value},
    )
    build_target: int = Field(
        description="Target quantity of complete kits to keep on hand",
        json_schema_extra={"example": 5},
    )
    archived_at: datetime | None = Field(
        description="Timestamp when kit was archived, if applicable",
        json_schema_extra={"example": "2024-03-20T18:45:00Z"},
    )
    updated_at: datetime = Field(
        description="Timestamp when the kit was last modified",
        json_schema_extra={"example": "2024-04-10T15:30:00Z"},
    )
    shopping_list_badge_count: int = Field(
        default=0,
        description="Number of concept/ready shopping lists linked to the kit",
        json_schema_extra={"example": 2},
    )
    pick_list_badge_count: int = Field(
        default=0,
        description="Number of open pick lists for the kit",
        json_schema_extra={"example": 1},
    )

    @computed_field
    def is_archived(self) -> bool:
        """Whether the kit is currently archived."""
        return self.status == KitStatus.ARCHIVED

    @model_validator(mode="after")
    def _default_badges(self) -> KitSummarySchema:
        """Ensure badge fields are always present even when attributes are missing."""
        object.__setattr__(
            self,
            "shopping_list_badge_count",
            getattr(self, "shopping_list_badge_count", 0) or 0,
        )
        object.__setattr__(
            self,
            "pick_list_badge_count",
            getattr(self, "pick_list_badge_count", 0) or 0,
        )
        return self


class KitResponseSchema(BaseModel):
    """Detailed schema for kit lifecycle operations."""

    model_config = ConfigDict(from_attributes=True)

    id: int = Field(
        description="Unique kit identifier",
        json_schema_extra={"example": 17},
    )
    name: str = Field(
        description="Kit display name",
        json_schema_extra={"example": "Portable Synth Voice"},
    )
    description: str | None = Field(
        description="Optional kit description",
        json_schema_extra={"example": "Compact synth voice for workshop demos"},
    )
    status: KitStatus = Field(
        description="Current lifecycle status of the kit",
        json_schema_extra={"example": KitStatus.ACTIVE.value},
    )
    build_target: int = Field(
        description="Target quantity of complete kits to keep on hand",
        json_schema_extra={"example": 5},
    )
    archived_at: datetime | None = Field(
        description="Timestamp when kit was archived, if applicable",
        json_schema_extra={"example": "2024-03-20T18:45:00Z"},
    )
    created_at: datetime = Field(
        description="Timestamp when the kit was created",
        json_schema_extra={"example": "2024-03-15T11:10:00Z"},
    )
    updated_at: datetime = Field(
        description="Timestamp when the kit was last modified",
        json_schema_extra={"example": "2024-04-10T15:30:00Z"},
    )
    shopping_list_badge_count: int = Field(
        default=0,
        description="Number of concept/ready shopping lists linked to the kit",
        json_schema_extra={"example": 2},
    )
    pick_list_badge_count: int = Field(
        default=0,
        description="Number of open pick lists for the kit",
        json_schema_extra={"example": 1},
    )

    @computed_field
    def is_archived(self) -> bool:
        """Whether the kit is currently archived."""
        return self.status == KitStatus.ARCHIVED

    @model_validator(mode="after")
    def _default_badges(self) -> KitResponseSchema:
        """Ensure badge fields default to zero for non-list operations."""
        object.__setattr__(
            self,
            "shopping_list_badge_count",
            getattr(self, "shopping_list_badge_count", 0) or 0,
        )
        object.__setattr__(
            self,
            "pick_list_badge_count",
            getattr(self, "pick_list_badge_count", 0) or 0,
        )
        return self


class KitContentCreateSchema(BaseModel):
    """Schema for creating a kit content entry."""

    part_id: int = Field(
        ...,
        description="Identifier of the part to include in the kit",
        json_schema_extra={"example": 105},
    )
    required_per_unit: int = Field(
        ...,
        ge=1,
        description="Quantity of the part required for a single kit",
        json_schema_extra={"example": 4},
    )
    note: str | None = Field(
        default=None,
        description="Optional note about this part within the kit",
        json_schema_extra={"example": "Use gold-plated headers for final builds."},
    )


class KitContentUpdateSchema(BaseModel):
    """Schema for updating a kit content entry with optimistic locking."""

    version: int = Field(
        ...,
        ge=1,
        description="Row version used for optimistic locking",
        json_schema_extra={"example": 2},
    )
    required_per_unit: int | None = Field(
        default=None,
        ge=1,
        description="Updated quantity required per kit",
        json_schema_extra={"example": 6},
    )
    note: str | None = Field(
        default=None,
        description="Updated note for this kit content (null clears the note)",
        json_schema_extra={"example": "Swap for 2% tolerance for QA builds."},
    )


class KitShoppingListLinkSchema(BaseModel):
    """Schema describing shopping lists linked to a kit."""

    model_config = ConfigDict(from_attributes=True)

    id: int = Field(
        description="Unique identifier for the kit to shopping list link",
        json_schema_extra={"example": 9},
    )
    shopping_list_id: int = Field(
        description="Identifier of the linked shopping list",
        json_schema_extra={"example": 21},
    )
    shopping_list_name: str = Field(
        description="Name of the linked shopping list",
        json_schema_extra={"example": "Concept BOM"},
    )
    status: ShoppingListStatus = Field(
        description="Current status of the linked shopping list",
        json_schema_extra={"example": ShoppingListStatus.READY.value},
    )
    requested_units: int = Field(
        description="Number of kit build units used when pushing to the list",
        ge=1,
        json_schema_extra={"example": 3},
    )
    honor_reserved: bool = Field(
        description="Whether reserved quantities were honored during the push",
        json_schema_extra={"example": False},
    )
    snapshot_kit_updated_at: datetime = Field(
        description="Kit timestamp captured when the link was last refreshed",
        json_schema_extra={"example": "2024-05-01T14:15:00Z"},
    )
    is_stale: bool = Field(
        description="Indicates whether the link needs resynchronization",
        json_schema_extra={"example": True},
    )
    created_at: datetime = Field(
        description="Timestamp when the link was created",
        json_schema_extra={"example": "2024-04-01T09:30:00Z"},
    )
    updated_at: datetime = Field(
        description="Timestamp when the link was last updated",
        json_schema_extra={"example": "2024-04-08T12:05:00Z"},
    )


class KitShoppingListChipSchema(KitShoppingListLinkSchema):
    """Compact schema for chip renderings on kit and shopping list detail views."""


class KitShoppingListRequestSchema(BaseModel):
    """Request payload for pushing kit contents to a shopping list."""

    units: int | None = Field(
        default=None,
        ge=1,
        description="Number of kit units to plan for; defaults to the kit build target when omitted",
        json_schema_extra={"example": 2},
    )
    honor_reserved: bool = Field(
        default=False,
        description="Subtract reserved quantities belonging to other kits when true",
        json_schema_extra={"example": False},
    )
    shopping_list_id: int | None = Field(
        default=None,
        description="Existing Concept shopping list to append to",
        json_schema_extra={"example": 18},
    )
    new_list_name: str | None = Field(
        default=None,
        description="Name for a new Concept shopping list when creating one",
        json_schema_extra={"example": "Synth Voice Purchasing"},
    )
    new_list_description: str | None = Field(
        default=None,
        description="Optional description for the new shopping list",
        json_schema_extra={"example": "Sourcing pass for the spring synth kits"},
    )
    note_prefix: str | None = Field(
        default=None,
        description="Fallback text appended to line notes when kit BOM rows lack notes",
        json_schema_extra={"example": "General replenishment"},
    )

    @model_validator(mode="after")
    def _validate_target(self) -> KitShoppingListRequestSchema:
        """Ensure the request targets an existing or new list."""
        new_list_name = (
            self.new_list_name.strip() if self.new_list_name else None
        )
        note_prefix = self.note_prefix.strip() if self.note_prefix else None

        object.__setattr__(self, "new_list_name", new_list_name or None)
        object.__setattr__(self, "note_prefix", note_prefix or None)

        if self.shopping_list_id is None and not (new_list_name):
            raise ValueError(
                "provide either shopping_list_id or new_list_name when pushing kit contents"
            )
        return self


class KitMembershipBulkQueryRequestSchema(BaseModel):
    """Schema for querying kit memberships across related resources."""

    kit_ids: list[int] = Field(
        ...,
        min_length=1,
        max_length=100,
        description="Ordered collection of kit identifiers to resolve",
        json_schema_extra={"example": [1, 2, 3]},
    )
    include_done: bool = Field(
        default=False,
        description="Include archived or completed memberships when true",
    )

    @field_validator("kit_ids")
    @classmethod
    def _validate_kit_ids(cls, kit_ids: list[int]) -> list[int]:
        """Normalise kit identifiers and enforce uniqueness."""
        seen: set[int] = set()
        ordered: list[int] = []

        for raw_id in kit_ids:
            if not isinstance(raw_id, int):
                raise TypeError("kit_ids must contain only integers")
            if raw_id < 1:
                raise ValueError("kit_ids must be positive integers")
            if raw_id in seen:
                raise ValueError("kit_ids must not contain duplicate values")
            seen.add(raw_id)
            ordered.append(raw_id)

        return ordered


class KitShoppingListMembershipQueryItemSchema(BaseModel):
    """Schema encapsulating shopping list memberships for a single kit."""

    kit_id: int = Field(
        description="Requested kit identifier",
        json_schema_extra={"example": 7},
    )
    memberships: list[KitShoppingListLinkSchema] = Field(
        default_factory=list,
        description="Shopping list memberships associated with the kit",
    )


class KitShoppingListMembershipQueryResponseSchema(BaseModel):
    """Bulk response schema for shopping list memberships grouped by kit."""

    memberships: list[KitShoppingListMembershipQueryItemSchema] = Field(
        default_factory=list,
        description="Memberships grouped by kit identifier order",
    )


class KitShoppingListLinkResponseSchema(BaseModel):
    """Response payload after creating or appending a kit shopping list link."""

    model_config = ConfigDict(from_attributes=True)

    link: KitShoppingListLinkSchema | None = Field(
        default=None,
        description="Link metadata after the push completes; omitted when no changes occurred",
    )
    shopping_list: ShoppingListResponseSchema | None = Field(
        default=None,
        description="Refreshed shopping list payload reflecting merged lines",
    )
    created_new_list: bool = Field(
        description="Indicates whether a new shopping list was created during the push",
        json_schema_extra={"example": True},
    )
    lines_modified: int = Field(
        description="Number of shopping list lines created or updated",
        json_schema_extra={"example": 4},
    )
    total_needed_quantity: int = Field(
        description="Total needed quantity summed across affected lines",
        json_schema_extra={"example": 16},
    )
    noop: bool = Field(
        description="True when no shopping list lines required changes (no link created)",
        json_schema_extra={"example": False},
    )


class KitContentDetailSchema(BaseModel):
    """Schema representing a kit content row with availability math."""

    model_config = ConfigDict(from_attributes=True)

    id: int = Field(
        description="Unique identifier for the kit content row",
        json_schema_extra={"example": 312},
    )
    kit_id: int = Field(
        description="Identifier of the parent kit",
        json_schema_extra={"example": 17},
    )
    part_id: int = Field(
        description="Identifier of the part referenced by this content",
        json_schema_extra={"example": 88},
    )
    required_per_unit: int = Field(
        description="Quantity required per kit build",
        json_schema_extra={"example": 2},
    )
    note: str | None = Field(
        description="Optional note about the part within the kit",
        json_schema_extra={"example": "Match polarity markings carefully"},
    )
    version: int = Field(
        description="Current optimistic locking version for this row",
        json_schema_extra={"example": 1},
    )
    created_at: datetime = Field(
        description="Timestamp when the kit content row was created",
        json_schema_extra={"example": "2024-03-28T11:20:00Z"},
    )
    updated_at: datetime = Field(
        description="Timestamp when the kit content row was last updated",
        json_schema_extra={"example": "2024-04-05T13:55:00Z"},
    )
    part: PartListSchema = Field(
        description="Lightweight details about the referenced part",
    )

    total_required: int = Field(
        description="Total quantity required to fulfill the kit build target",
        json_schema_extra={"example": 6},
    )
    in_stock: int = Field(
        description="Quantity currently in stock for this part",
        json_schema_extra={"example": 4},
    )
    reserved: int = Field(
        description="Quantity reserved by other active kits",
        json_schema_extra={"example": 1},
    )
    available: int = Field(
        description="Quantity available for this kit after reservations",
        json_schema_extra={"example": 3},
    )
    shortfall: int = Field(
        description="Quantity short of the total requirement",
        json_schema_extra={"example": 3},
    )
    active_reservations: list[KitReservationEntrySchema] = Field(
        default_factory=list,
        description="Active kits reserving this part excluding the current kit",
    )


class KitDetailResponseSchema(BaseModel):
    """Schema for the kit detail workspace response."""

    model_config = ConfigDict(from_attributes=True)

    id: int = Field(
        description="Unique kit identifier",
        json_schema_extra={"example": 17},
    )
    name: str = Field(
        description="Kit display name",
        json_schema_extra={"example": "Portable Synth Voice"},
    )
    description: str | None = Field(
        description="Optional kit description",
        json_schema_extra={"example": "Compact synth voice for workshop demos"},
    )
    status: KitStatus = Field(
        description="Current lifecycle status of the kit",
        json_schema_extra={"example": KitStatus.ACTIVE.value},
    )
    build_target: int = Field(
        description="Target quantity of complete kits to keep on hand",
        json_schema_extra={"example": 5},
    )
    archived_at: datetime | None = Field(
        description="Timestamp when kit was archived, if applicable",
        json_schema_extra={"example": "2024-03-20T18:45:00Z"},
    )
    created_at: datetime = Field(
        description="Timestamp when the kit was created",
        json_schema_extra={"example": "2024-03-15T11:10:00Z"},
    )
    updated_at: datetime = Field(
        description="Timestamp when the kit was last modified",
        json_schema_extra={"example": "2024-04-10T15:30:00Z"},
    )
    shopping_list_badge_count: int = Field(
        default=0,
        description="Number of concept/ready shopping lists linked to the kit",
        json_schema_extra={"example": 2},
    )
    pick_list_badge_count: int = Field(
        default=0,
        description="Number of open pick lists for the kit",
        json_schema_extra={"example": 1},
    )
    contents: list[KitContentDetailSchema] = Field(
        default_factory=list,
        description="Bill-of-material entries for the kit with availability data",
    )
    shopping_list_links: list[KitShoppingListLinkSchema] = Field(
        default_factory=list,
        description="Shopping lists linked to this kit",
    )
    pick_lists: list[KitPickListSummarySchema] = Field(
        default_factory=list,
        description="Pick list summaries associated with this kit",
    )

    @computed_field
    def is_archived(self) -> bool:
        """Whether the kit is currently archived."""
        return self.status == KitStatus.ARCHIVED

    @model_validator(mode="after")
    def _default_badges(self) -> KitDetailResponseSchema:
        """Ensure badge fields default to zero when not set."""
        object.__setattr__(
            self,
            "shopping_list_badge_count",
            getattr(self, "shopping_list_badge_count", 0) or 0,
        )
        object.__setattr__(
            self,
            "pick_list_badge_count",
            getattr(self, "pick_list_badge_count", 0) or 0,
        )
        return self
