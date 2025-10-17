"""Schemas for kit overview and lifecycle APIs."""

from __future__ import annotations

from datetime import datetime
from enum import Enum

from pydantic import BaseModel, ConfigDict, Field, computed_field, model_validator

from app.models.kit import KitStatus
from app.models.kit_pick_list import KitPickListStatus
from app.models.shopping_list import ShoppingListStatus
from app.schemas.part import PartListSchema


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
        ge=1,
        description="Number of complete kits to maintain in stock",
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
        ge=1,
        description="Updated build target for inventory planning",
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
    linked_status: ShoppingListStatus = Field(
        description="Snapshot status of the shopping list when linked",
        json_schema_extra={"example": ShoppingListStatus.READY.value},
    )
    snapshot_kit_updated_at: datetime | None = Field(
        description="Timestamp of the kit update captured by the snapshot",
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

    name: str = Field(
        description="Name of the linked shopping list",
        json_schema_extra={"example": "Concept BOM"},
    )


class KitPickListSchema(BaseModel):
    """Schema detailing pick list chips for the kit detail workspace."""

    model_config = ConfigDict(from_attributes=True)

    id: int = Field(
        description="Unique identifier for the pick list",
        json_schema_extra={"example": 4},
    )
    status: KitPickListStatus = Field(
        description="Current status of the pick list",
        json_schema_extra={"example": KitPickListStatus.IN_PROGRESS.value},
    )
    requested_units: int = Field(
        description="Number of kits requested for fulfillment",
        json_schema_extra={"example": 3},
    )
    first_deduction_at: datetime | None = Field(
        description="Timestamp when parts were first deducted for this pick list",
        json_schema_extra={"example": "2024-04-12T10:42:00Z"},
    )
    completed_at: datetime | None = Field(
        description="Timestamp when the pick list was completed",
        json_schema_extra={"example": "2024-04-20T16:10:00Z"},
    )
    decreased_build_target_by: int = Field(
        description="Amount the kit build target was lowered by this pick list",
        json_schema_extra={"example": 1},
    )
    created_at: datetime = Field(
        description="Timestamp when the pick list was created",
        json_schema_extra={"example": "2024-04-10T08:00:00Z"},
    )
    updated_at: datetime = Field(
        description="Timestamp when the pick list was last updated",
        json_schema_extra={"example": "2024-04-15T09:45:00Z"},
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
    pick_lists: list[KitPickListSchema] = Field(
        default_factory=list,
        description="Pick lists associated with this kit",
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
