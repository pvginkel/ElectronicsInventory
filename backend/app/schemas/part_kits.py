"""Schemas for part-centric kit usage listings."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.models.kit import KitStatus


class PartKitUsageSchema(BaseModel):
    """Schema describing an active kit that consumes a specific part."""

    kit_id: int = Field(
        description="Identifier of the kit reserving the part",
        json_schema_extra={"example": 7},
    )
    kit_name: str = Field(
        description="Display name of the kit reserving the part",
        json_schema_extra={"example": "Eurorack Power Module"},
    )
    status: KitStatus = Field(
        description="Current lifecycle status of the reserving kit",
        json_schema_extra={"example": KitStatus.ACTIVE.value},
    )
    build_target: int = Field(
        description="Build target quantity for the reserving kit",
        json_schema_extra={"example": 5},
    )
    required_per_unit: int = Field(
        description="Quantity of this part required for a single kit build",
        json_schema_extra={"example": 2},
    )
    reserved_quantity: int = Field(
        description="Total quantity of the part reserved by the kit",
        json_schema_extra={"example": 10},
    )
    updated_at: datetime = Field(
        description="Timestamp when the reserving kit was last updated",
        json_schema_extra={"example": "2024-05-22T18:30:00Z"},
    )

    model_config = ConfigDict(from_attributes=True)
