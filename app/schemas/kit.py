"""Schemas for kit overview and lifecycle APIs."""

from __future__ import annotations

from datetime import datetime
from enum import Enum

from pydantic import BaseModel, ConfigDict, Field, computed_field, model_validator

from app.models.kit import KitStatus


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
