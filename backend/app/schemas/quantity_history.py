"""Quantity History schemas for request/response validation."""

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


class QuantityHistoryResponseSchema(BaseModel):
    """Schema for quantity history entries."""

    id: int = Field(
        description="Unique identifier for the history entry",
        json_schema_extra={"example": 1}
    )
    part_id4: str = Field(
        description="4-character part identifier",
        json_schema_extra={"example": "BZQP"}
    )
    delta_qty: int = Field(
        description="Quantity change (positive for additions, negative for removals)",
        json_schema_extra={"example": -5}
    )
    location_reference: Optional[str] = Field(
        description="Location reference where change occurred",
        json_schema_extra={"example": "7-3"}
    )
    timestamp: datetime = Field(
        description="When the quantity change occurred",
        json_schema_extra={"example": "2024-01-15T14:45:00Z"}
    )

    model_config = ConfigDict(from_attributes=True)
