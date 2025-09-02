from enum import Enum
from pydantic import BaseModel, ConfigDict, Field

class MountingTypeEnum(str, Enum):
    THROUGH_HOLE = "Through-Hole"
    SURFACE_MOUNT = "Surface-Mount"
    SOCKET_PLUGGABLE = "Socket / Pluggable"
    PANEL_MOUNT = "Panel Mount"
    DIN_RAIL_MOUNT = "DIN Rail Mount"
    BREADBOARD_COMPATIBLE = "Breadboard Compatible"
    PCB_MOUNT = "PCB Mount"


class PartAnalysisSuggestion(BaseModel):
    model_config = ConfigDict(extra="forbid")

    product_name: str | None = Field(...)
    product_family: str | None = Field(...)
    product_category: str | None = Field(...)
    manufacturer: str | None = Field(...)
    manufacturer_part_number: str | None = Field(...)
    package_type: str | None = Field(...)
    mounting_type: MountingTypeEnum | None = Field(...)
    component_pin_count: int | None = Field(...)
    component_pin_pitch: str | None = Field(...)
    voltage_rating: str | None = Field(...)
    input_voltage: str | None = Field(...)
    output_voltage: str | None = Field(...)
    physical_dimensions: str | None = Field(...)
    tags: list[str] = Field(...)
    product_page_urls: list[str] = Field(...)
    product_image_urls: list[str] = Field(...)
    datasheet_urls: list[str] = Field(...)
    pinout_urls: list[str] = Field(...)
    schematic_urls: list[str] = Field(...)
    manual_urls: list[str] = Field(...)
