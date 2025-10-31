"""Schemas for kit reservation listings and debug endpoints."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.models.kit import KitStatus


class KitReservationEntrySchema(BaseModel):
    """Schema representing an active kit reserving a part."""

    model_config = ConfigDict(from_attributes=True)

    kit_id: int = Field(
        description="Identifier of the kit reserving the part",
        json_schema_extra={"example": 3},
    )
    kit_name: str = Field(
        description="Display name of the kit reserving the part",
        json_schema_extra={"example": "Synth Voice Starter"},
    )
    status: KitStatus = Field(
        description="Current status of the reserving kit",
        json_schema_extra={"example": KitStatus.ACTIVE.value},
    )
    build_target: int = Field(
        description="Build target for the reserving kit",
        json_schema_extra={"example": 2},
    )
    required_per_unit: int = Field(
        description="Quantity of the part required per kit build",
        json_schema_extra={"example": 2},
    )
    reserved_quantity: int = Field(
        description="Total quantity reserved by the kit",
        json_schema_extra={"example": 4},
    )
    updated_at: datetime = Field(
        description="Timestamp when the reserving kit was last updated",
        json_schema_extra={"example": "2024-05-01T12:00:00Z"},
    )


class PartKitReservationsResponseSchema(BaseModel):
    """Response schema for the part reservation debug endpoint."""

    model_config = ConfigDict(from_attributes=True)

    part_id: int = Field(
        description="Identifier of the part being inspected",
        json_schema_extra={"example": 42},
    )
    part_key: str = Field(
        description="Unique key of the part",
        json_schema_extra={"example": "ABCD"},
    )
    part_description: str | None = Field(
        description="Optional description of the part",
        json_schema_extra={"example": "Utility op-amp for signal conditioning"},
    )
    total_reserved: int = Field(
        description="Sum of reserved quantities across all active kits",
        json_schema_extra={"example": 7},
    )
    active_reservations: list[KitReservationEntrySchema] = Field(
        default_factory=list,
        description="Active kits that currently reserve this part",
    )
