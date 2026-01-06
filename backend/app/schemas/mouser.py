"""Pydantic schemas for Mouser API integration."""

from pydantic import BaseModel, ConfigDict, Field


class MouserSearchByPartNumberRequest(BaseModel):
    """Request schema for Mouser part number search."""

    model_config = ConfigDict(extra="forbid", json_schema_extra={"additionalProperties": False})

    part_number: str = Field(
        ...,
        description="Mouser part number or manufacturer part number to search for"
    )


class MouserSearchByKeywordRequest(BaseModel):
    """Request schema for Mouser keyword search."""

    model_config = ConfigDict(extra="forbid", json_schema_extra={"additionalProperties": False})

    keyword: str = Field(..., description="Keyword to search for")


class MouserPartResult(BaseModel):
    """Filtered Mouser part result (excludes pricing/compliance data)."""

    model_config = ConfigDict(extra="ignore")  # Ignore extra fields from API response

    ManufacturerPartNumber: str | None = None
    Manufacturer: str | None = None
    Description: str | None = None
    ProductDetailUrl: str | None = None
    DataSheetUrl: str | None = None
    Category: str | None = None
    LeadTime: str | None = None
    LifecycleStatus: str | None = None
    Min: str | None = None
    Mult: str | None = None


class MouserSearchResponse(BaseModel):
    """Response schema for Mouser searches (filtered to exclude pricing/compliance)."""

    model_config = ConfigDict(extra="forbid")

    parts: list[MouserPartResult] = Field(default_factory=list)
    total_results: int = Field(default=0)
    error: str | None = Field(default=None, description="Error message if search failed")
