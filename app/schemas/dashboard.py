"""Pydantic schemas for dashboard API responses."""

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class DashboardStatsSchema(BaseModel):
    """Schema for dashboard statistics response."""

    model_config = ConfigDict(from_attributes=True)

    total_parts: int = Field(..., description="Total number of parts in inventory", ge=0)
    total_quantity: int = Field(..., description="Total quantity across all parts", ge=0)
    total_boxes: int = Field(..., description="Total number of storage boxes", ge=0)
    total_types: int = Field(..., description="Total number of part types/categories", ge=0)
    changes_7d: int = Field(..., description="Number of quantity changes in last 7 days", ge=0)
    changes_30d: int = Field(..., description="Number of quantity changes in last 30 days", ge=0)
    low_stock_count: int = Field(..., description="Number of parts with quantity <= 5", ge=0)


class RecentActivitySchema(BaseModel):
    """Schema for recent activity item response."""

    model_config = ConfigDict(from_attributes=True)

    part_key: str = Field(..., description="4-character part ID", max_length=4)
    part_description: str = Field(..., description="Part description")
    delta_qty: int = Field(..., description="Quantity change (positive or negative)")
    location_reference: str | None = Field(None, description="Location reference for the change")
    timestamp: datetime = Field(..., description="When the change occurred")


class StorageSummarySchema(BaseModel):
    """Schema for storage box utilization response."""

    model_config = ConfigDict(from_attributes=True)

    box_no: int = Field(..., description="Box number", gt=0)
    description: str = Field(..., description="Box description")
    total_locations: int = Field(..., description="Total capacity of the box", gt=0)
    occupied_locations: int = Field(..., description="Number of locations currently in use", ge=0)
    usage_percentage: float = Field(..., description="Percentage of box capacity used", ge=0, le=100)


class LowStockItemSchema(BaseModel):
    """Schema for low stock item response."""

    model_config = ConfigDict(from_attributes=True)

    part_key: str = Field(..., description="4-character part ID", max_length=4)
    description: str = Field(..., description="Part description")
    type_name: str | None = Field(None, description="Part type/category name")
    current_quantity: int = Field(..., description="Current total quantity", ge=0)


class CategoryDistributionSchema(BaseModel):
    """Schema for category distribution response."""

    model_config = ConfigDict(from_attributes=True)

    type_name: str = Field(..., description="Part type/category name")
    part_count: int = Field(..., description="Number of parts in this category", ge=0)


class PartsWithoutDocumentsSchema(BaseModel):
    """Schema for parts without documents response."""

    model_config = ConfigDict(from_attributes=True)

    part_key: str = Field(..., description="4-character part ID", max_length=4)
    description: str = Field(..., description="Part description")
    type_name: str | None = Field(None, description="Part type/category name")


class UndocumentedPartsSchema(BaseModel):
    """Schema for undocumented parts summary response."""

    model_config = ConfigDict(from_attributes=True)

    count: int = Field(..., description="Total number of parts without documents", ge=0)
    sample_parts: list[PartsWithoutDocumentsSchema] = Field(..., description="Sample of up to 10 undocumented parts")
