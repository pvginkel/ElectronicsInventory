from enum import Enum
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class MountingTypeEnum(str, Enum):
    THROUGH_HOLE = "Through-Hole"
    SURFACE_MOUNT = "Surface-Mount"
    PANEL_MOUNT = "Panel Mount"
    DIN_RAIL_MOUNT = "DIN Rail Mount"


class BasicInformationSchema(BaseModel):
    model_config = ConfigDict(extra="forbid")

    product_name: str | None = Field(...)
    manufacturer: str | None = Field(...)
    mpn: str | None = Field(..., description="Manufacturer Part Number")
    confidence: float = Field(..., ge=0.0, le=1.0)


class PartDetailsSchema(BaseModel):
    model_config = ConfigDict(extra="forbid")

    product_family: str | None = Field(...)
    product_category: str | None = Field(...)
    package_type: str | None = Field(...)
    mounting_type: MountingTypeEnum | None = Field(...)
    part_pin_count: int | None = Field(...)
    part_pin_pitch: str | None = Field(...)
    voltage_rating: str | None = Field(...)
    input_voltage: str | None = Field(...)
    output_voltage: str | None = Field(...)
    physical_dimensions: str | None = Field(...)
    tags: list[str] = Field(...)
    confidence: float = Field(..., ge=0.0, le=1.0)


class UrlsSchema(BaseModel):
    model_config = ConfigDict(extra="forbid")

    urls: list[str] = Field(...)
    confidence: float = Field(..., ge=0.0, le=1.0)


class AllUrlsSchema(BaseModel):
    model_config = ConfigDict(extra="forbid")

    product_page_urls: list[str] = Field(...)
    datasheet_urls: list[str] = Field(...)
    pinout_urls: list[str] = Field(...)
    confidence: float = Field(..., ge=0.0, le=1.0)
