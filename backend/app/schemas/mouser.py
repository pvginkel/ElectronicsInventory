"""Pydantic schemas for Mouser API integration."""

from pydantic import BaseModel, ConfigDict, Field


class MouserSearchByPartNumberRequest(BaseModel):
    """Request schema for Mouser part number search."""

    model_config = ConfigDict(extra="forbid")

    part_number: str = Field(
        ...,
        description="Mouser part number or manufacturer part number to search for"
    )


class MouserSearchByKeywordRequest(BaseModel):
    """Request schema for Mouser keyword search."""

    model_config = ConfigDict(extra="forbid")

    keyword: str = Field(..., description="Keyword to search for")
    record_count: int = Field(default=10, description="Number of results to return")
    starting_record: int = Field(default=0, description="Starting record for pagination")


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


class GetMouserImageRequest(BaseModel):
    """Request schema for extracting image from Mouser product page."""

    model_config = ConfigDict(extra="forbid")

    product_url: str = Field(
        ...,
        description="Mouser product detail page URL to extract image from"
    )


class GetMouserImageResponse(BaseModel):
    """Response schema for Mouser image extraction."""

    model_config = ConfigDict(extra="forbid")

    image_url: str | None = Field(
        default=None,
        description="High-quality image URL from ld+json metadata, or null if not found"
    )
    error: str | None = Field(
        default=None,
        description="Error message if extraction failed"
    )


class ExtractSpecsRequest(BaseModel):
    """Request schema for extracting specs from product page URL."""

    model_config = ConfigDict(extra="forbid")

    url: str = Field(..., description="Product page URL to extract specifications from")


class ExtractSpecsResponse(BaseModel):
    """Response schema for spec extraction."""

    model_config = ConfigDict(extra="forbid")

    specs: dict[str, str | int | float | bool | None] = Field(
        default_factory=dict,
        description="Dynamic JSON object with extracted specifications"
    )
    error: str | None = Field(
        default=None,
        description="Error message if extraction failed"
    )
