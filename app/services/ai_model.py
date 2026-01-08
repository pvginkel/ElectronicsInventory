from enum import Enum
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class MountingTypeEnum(str, Enum):
    THROUGH_HOLE = "Through-Hole"
    SURFACE_MOUNT = "Surface-Mount"
    PANEL_MOUNT = "Panel Mount"
    DIN_RAIL_MOUNT = "DIN Rail Mount"


class DuplicatePartMatch(BaseModel):
    """Schema for duplicate part match in LLM response."""

    model_config = ConfigDict(extra="forbid")

    part_key: str = Field(...)
    confidence: Literal["high", "medium"] = Field(...)
    reasoning: str = Field(...)


class PartAnalysisSpecDetails(BaseModel):
    """Technical specification details extracted from datasheets or AI analysis.

    This base class contains only technical specs - no URLs or seller info.
    Used by datasheet extraction where we only want specs from the PDF.
    """

    model_config = ConfigDict(extra="forbid")

    product_name: str | None = Field(...)
    product_family: str | None = Field(...)
    product_category: str | None = Field(...)
    manufacturer: str | None = Field(...)
    manufacturer_part_number: str | None = Field(...)
    package_type: str | None = Field(...)
    mounting_type: MountingTypeEnum | None = Field(...)
    part_pin_count: int | None = Field(...)
    part_pin_pitch: str | None = Field(...)
    voltage_rating: str | None = Field(...)
    input_voltage: str | None = Field(...)
    output_voltage: str | None = Field(...)
    physical_dimensions: str | None = Field(...)
    tags: list[str] = Field(...)


class PartAnalysisDetails(PartAnalysisSpecDetails):
    """Full part analysis details from LLM including URLs and seller info.

    Extends PartAnalysisSpecDetails with URL and seller fields that come
    from web searches and tool calls during full AI analysis.
    """

    product_page_urls: list[str] = Field(...)
    datasheet_urls: list[str] = Field(...)
    pinout_urls: list[str] = Field(...)
    seller: str | None = Field(default=None, description="Seller name (e.g., 'Mouser')")
    seller_url: str | None = Field(default=None, description="Seller product page URL")


class PartAnalysisSuggestion(BaseModel):
    """LLM response with flexible paths.

    The LLM can populate:
    - analysis_result (full analysis)
    - duplicate_parts (duplicates found)
    - analysis_failure_reason (query too vague/ambiguous)

    All fields are optional; LLM prompt guidance ensures appropriate population.
    """

    model_config = ConfigDict(extra="forbid")

    analysis_result: PartAnalysisDetails | None = Field(default=None)
    duplicate_parts: list[DuplicatePartMatch] | None = Field(default=None)
    analysis_failure_reason: str | None = Field(
        default=None,
        description="Explanation of why it's not possible to find a match"
    )
