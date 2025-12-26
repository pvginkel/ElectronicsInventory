"""Pydantic schemas for pick list APIs."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, computed_field

from app.models.kit_pick_list import KitPickListStatus
from app.models.kit_pick_list_line import PickListLineStatus


class KitPickListCreateSchema(BaseModel):
    """Request payload for creating a pick list."""

    requested_units: int = Field(
        description="Number of kit builds to fulfill with this pick list",
        ge=1,
        json_schema_extra={"example": 2},
    )


class PickListLineLocationSchema(BaseModel):
    """Location metadata for a pick list line."""

    model_config = ConfigDict(from_attributes=True)

    id: int = Field(
        description="Unique identifier of the storage location",
        json_schema_extra={"example": 42},
    )
    box_no: int = Field(
        description="Box number containing the location",
        json_schema_extra={"example": 3},
    )
    loc_no: int = Field(
        description="Location number inside the box",
        json_schema_extra={"example": 7},
    )


class PickListLineContentSchema(BaseModel):
    """Kit content information attached to a pick list line."""

    model_config = ConfigDict(from_attributes=True)

    id: int = Field(
        description="Kit content identifier referenced by the line",
        json_schema_extra={"example": 128},
    )
    part_id: int = Field(
        description="Identifier of the part to pick",
        json_schema_extra={"example": 64},
    )
    part_key: str = Field(
        description="Unique key of the part to pick",
        json_schema_extra={"example": "ABCD"},
    )
    part_description: str | None = Field(
        description="Description of the part to pick",
        json_schema_extra={"example": "NE555 timer in DIP package"},
    )
    cover_url: str | None = Field(
        default=None,
        description="Base CAS URL for cover image. Add ?thumbnail=<size> for thumbnails.",
        json_schema_extra={"example": "/api/cas/abc123def456..."},
    )


class KitPickListLineSchema(BaseModel):
    """Detailed representation of a pick list line."""

    model_config = ConfigDict(from_attributes=True)

    id: int = Field(
        description="Unique identifier of the pick list line",
        json_schema_extra={"example": 512},
    )
    status: PickListLineStatus = Field(
        description="Current status of the line",
        json_schema_extra={"example": PickListLineStatus.OPEN.value},
    )
    quantity_to_pick: int = Field(
        description="Quantity of the part to pick from the location",
        json_schema_extra={"example": 4},
    )
    inventory_change_id: int | None = Field(
        description="Quantity history entry recorded when picked",
        json_schema_extra={"example": 2048},
    )
    picked_at: datetime | None = Field(
        description="Timestamp when the line was picked",
        json_schema_extra={"example": "2024-04-18T14:30:00Z"},
    )
    kit_content: PickListLineContentSchema = Field(
        description="Kit content metadata referenced by the line",
    )
    location: PickListLineLocationSchema = Field(
        description="Location to pull inventory from",
    )


class KitPickListSummarySchema(BaseModel):
    """Summary information for a pick list used in listings."""

    model_config = ConfigDict(from_attributes=True)

    id: int = Field(
        description="Unique identifier for the pick list",
        json_schema_extra={"example": 12},
    )
    kit_id: int = Field(
        description="Identifier of the kit that owns the pick list",
        json_schema_extra={"example": 3},
    )
    requested_units: int = Field(
        description="Number of kit builds requested for the pick list",
        json_schema_extra={"example": 2},
    )
    status: KitPickListStatus = Field(
        description="Lifecycle status for the pick list",
        json_schema_extra={"example": KitPickListStatus.OPEN.value},
    )
    created_at: datetime = Field(
        description="Timestamp when the pick list was created",
        json_schema_extra={"example": "2024-04-15T09:00:00Z"},
    )
    updated_at: datetime = Field(
        description="Timestamp when the pick list was last updated",
        json_schema_extra={"example": "2024-04-15T11:10:00Z"},
    )
    completed_at: datetime | None = Field(
        description="Timestamp when the pick list was completed",
        json_schema_extra={"example": "2024-04-16T13:25:00Z"},
    )
    line_count: int = Field(
        description="Total number of lines in the pick list",
        json_schema_extra={"example": 5},
    )
    open_line_count: int = Field(
        description="Number of lines that still need to be picked",
        json_schema_extra={"example": 2},
    )
    completed_line_count: int = Field(
        description="Number of lines that have already been picked",
        json_schema_extra={"example": 3},
    )
    total_quantity_to_pick: int = Field(
        description="Sum of quantities across all lines",
        json_schema_extra={"example": 12},
    )
    picked_quantity: int = Field(
        description="Quantity already picked for the pick list",
        json_schema_extra={"example": 8},
    )
    remaining_quantity: int = Field(
        description="Quantity still outstanding for the pick list",
        json_schema_extra={"example": 4},
    )

    @computed_field
    def is_archived_ui(self) -> bool:
        """True when the pick list is completed."""
        return self.status is KitPickListStatus.COMPLETED


class KitPickListDetailSchema(KitPickListSummarySchema):
    """Detailed pick list payload including line breakdown."""

    kit_name: str = Field(
        description="Display name of the kit that owns the pick list",
        json_schema_extra={"example": "Synth Voice Starter"},
    )
    lines: list[KitPickListLineSchema] = Field(
        default_factory=list,
        description="Detailed picking instructions grouped by location",
    )


class KitPickListMembershipSchema(KitPickListSummarySchema):
    """Schema describing pick list membership for bulk kit queries."""


class KitPickListMembershipQueryItemSchema(BaseModel):
    """Schema encapsulating pick list memberships for a single kit."""

    kit_id: int = Field(
        description="Requested kit identifier",
        json_schema_extra={"example": 7},
    )
    pick_lists: list[KitPickListMembershipSchema] = Field(
        default_factory=list,
        description="Pick lists associated with the kit",
    )


class KitPickListMembershipQueryResponseSchema(BaseModel):
    """Bulk response schema for pick list memberships grouped by kit."""

    memberships: list[KitPickListMembershipQueryItemSchema] = Field(
        default_factory=list,
        description="Memberships grouped by kit identifier order",
    )
