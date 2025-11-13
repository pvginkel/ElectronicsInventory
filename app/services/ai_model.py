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


class PartAnalysisDetails(BaseModel):
    """Full part analysis details from LLM."""

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
    product_page_urls: list[str] = Field(...)
    datasheet_urls: list[str] = Field(...)
    pinout_urls: list[str] = Field(...)


class PartAnalysisSuggestion(BaseModel):
    """LLM response with two mutually exclusive paths.

    The LLM populates either analysis_result (full analysis) OR duplicate_parts (duplicates found).
    Both fields are optional; LLM prompt guidance ensures appropriate population.
    """

    model_config = ConfigDict(extra="forbid")

    analysis_result: PartAnalysisDetails | None = Field(default=None)
    duplicate_parts: list[DuplicatePartMatch] | None = Field(default=None)
