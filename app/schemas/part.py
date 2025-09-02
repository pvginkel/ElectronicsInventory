"""Part schemas for request/response validation."""

from dataclasses import dataclass
from datetime import datetime
from typing import TYPE_CHECKING

from pydantic import BaseModel, ConfigDict, Field, computed_field

from app.schemas.part_attachment import (
    PartAttachmentListSchema,
    PartAttachmentResponseSchema,
)
from app.schemas.type import TypeResponseSchema

if TYPE_CHECKING:
    from app.models.part import Part


class PartCreateSchema(BaseModel):
    """Schema for creating a new part."""

    manufacturer_code: str | None = Field(
        None,
        max_length=255,
        description="Manufacturer's part number or code",
        json_schema_extra={"example": "OMRON G5Q-1A4"}
    )
    type_id: int | None = Field(
        None,
        description="ID of the part type/category",
        json_schema_extra={"example": 1}
    )
    description: str = Field(
        ...,
        min_length=1,
        description="Free text description of the part",
        json_schema_extra={"example": "12V SPDT relay with 40A contacts"}
    )
    tags: list[str] | None = Field(
        None,
        description="Tags for categorization and search",
        json_schema_extra={"example": ["12V", "SPDT", "automotive"]}
    )
    manufacturer: str | None = Field(
        None,
        max_length=255,
        description="Manufacturer company name",
        json_schema_extra={"example": "Texas Instruments"}
    )
    product_page: str | None = Field(
        None,
        max_length=500,
        description="Manufacturer's product page URL",
        json_schema_extra={"example": "https://www.ti.com/product/SN74HC595"}
    )
    seller: str | None = Field(
        None,
        max_length=255,
        description="Vendor/supplier name",
        json_schema_extra={"example": "Digi-Key"}
    )
    seller_link: str | None = Field(
        None,
        max_length=500,
        description="Product page URL at seller",
        json_schema_extra={"example": "https://www.digikey.com/en/products/detail/G5Q-1A4"}
    )

    # Extended technical fields
    package: str | None = Field(
        None,
        max_length=100,
        description="Physical package type for the component",
        json_schema_extra={"example": "DIP-8"}
    )
    pin_count: int | None = Field(
        None,
        gt=0,
        description="Number of pins/connections on the component",
        json_schema_extra={"example": 8}
    )
    voltage_rating: str | None = Field(
        None,
        max_length=50,
        description="Operating or rated voltage for the component",
        json_schema_extra={"example": "3.3V"}
    )
    mounting_type: str | None = Field(
        None,
        max_length=50,
        description="How the component is physically mounted",
        json_schema_extra={"example": "Through-hole"}
    )
    series: str | None = Field(
        None,
        max_length=100,
        description="Component family or series identification",
        json_schema_extra={"example": "74HC"}
    )
    dimensions: str | None = Field(
        None,
        max_length=100,
        description="Physical size of the component",
        json_schema_extra={"example": "20x15x5mm"}
    )


class PartUpdateSchema(BaseModel):
    """Schema for updating an existing part."""

    manufacturer_code: str | None = Field(
        None,
        max_length=255,
        description="Updated manufacturer's part number",
        json_schema_extra={"example": "OMRON G5Q-1A4-DC12"}
    )
    type_id: int | None = Field(
        None,
        description="Updated part type/category ID",
        json_schema_extra={"example": 2}
    )
    description: str | None = Field(
        None,
        min_length=1,
        description="Updated description",
        json_schema_extra={"example": "12V SPDT automotive relay with 40A contacts"}
    )
    tags: list[str] | None = Field(
        None,
        description="Updated tags",
        json_schema_extra={"example": ["12V", "SPDT", "automotive", "waterproof"]}
    )
    manufacturer: str | None = Field(
        None,
        max_length=255,
        description="Updated manufacturer company name",
        json_schema_extra={"example": "Espressif Systems"}
    )
    product_page: str | None = Field(
        None,
        max_length=500,
        description="Updated manufacturer's product page URL",
        json_schema_extra={"example": "https://www.espressif.com/en/products/modules/esp32"}
    )
    seller: str | None = Field(
        None,
        max_length=255,
        description="Updated seller name",
        json_schema_extra={"example": "Mouser Electronics"}
    )
    seller_link: str | None = Field(
        None,
        max_length=500,
        description="Updated product page URL",
        json_schema_extra={"example": "https://www.mouser.com/ProductDetail/G5Q-1A4"}
    )

    # Extended technical fields
    package: str | None = Field(
        None,
        max_length=100,
        description="Updated physical package type",
        json_schema_extra={"example": "SOIC-16"}
    )
    pin_count: int | None = Field(
        None,
        gt=0,
        description="Updated number of pins/connections",
        json_schema_extra={"example": 16}
    )
    voltage_rating: str | None = Field(
        None,
        max_length=50,
        description="Updated operating or rated voltage",
        json_schema_extra={"example": "5V"}
    )
    mounting_type: str | None = Field(
        None,
        max_length=50,
        description="Updated mounting type",
        json_schema_extra={"example": "Surface Mount"}
    )
    series: str | None = Field(
        None,
        max_length=100,
        description="Updated component series",
        json_schema_extra={"example": "STM32F4"}
    )
    dimensions: str | None = Field(
        None,
        max_length=100,
        description="Updated physical dimensions",
        json_schema_extra={"example": "10.3x7.5mm"}
    )


class PartResponseSchema(BaseModel):
    """Schema for full part details with relationships."""

    key: str = Field(
        description="4-character unique part identifier",
        json_schema_extra={"example": "BZQP"}
    )
    manufacturer_code: str | None = Field(
        description="Manufacturer's part number",
        json_schema_extra={"example": "OMRON G5Q-1A4"}
    )
    type_id: int | None = Field(
        description="Part type/category ID",
        json_schema_extra={"example": 1}
    )
    type: TypeResponseSchema | None = Field(
        description="Part type/category details",
        default=None
    )
    description: str = Field(
        description="Free text description",
        json_schema_extra={"example": "12V SPDT relay with 40A contacts"}
    )
    tags: list[str] | None = Field(
        description="Tags for categorization",
        json_schema_extra={"example": ["12V", "SPDT", "automotive"]}
    )
    manufacturer: str | None = Field(
        default=None,
        description="Manufacturer company name",
        json_schema_extra={"example": "Texas Instruments"}
    )
    product_page: str | None = Field(
        default=None,
        description="Manufacturer's product page URL",
        json_schema_extra={"example": "https://www.ti.com/product/SN74HC595"}
    )
    seller: str | None = Field(
        description="Vendor/supplier name",
        json_schema_extra={"example": "Digi-Key"}
    )
    seller_link: str | None = Field(
        description="Product page URL",
        json_schema_extra={"example": "https://www.digikey.com/en/products/detail/G5Q-1A4"}
    )
    cover_attachment_id: int | None = Field(
        description="ID of the cover attachment image",
        json_schema_extra={"example": 123}
    )
    attachments: list[PartAttachmentListSchema] = Field(
        description="List of part attachments (images, PDFs, URLs)",
        default=[]
    )
    cover_attachment: PartAttachmentResponseSchema | None = Field(
        description="Cover attachment details",
        default=None
    )

    # Extended technical fields
    package: str | None = Field(
        default=None,
        description="Physical package type",
        json_schema_extra={"example": "DIP-8"}
    )
    pin_count: int | None = Field(
        default=None,
        description="Number of pins/connections",
        json_schema_extra={"example": 8}
    )
    voltage_rating: str | None = Field(
        default=None,
        description="Operating or rated voltage",
        json_schema_extra={"example": "3.3V"}
    )
    mounting_type: str | None = Field(
        default=None,
        description="Physical mounting type",
        json_schema_extra={"example": "Through-hole"}
    )
    series: str | None = Field(
        default=None,
        description="Component series identification",
        json_schema_extra={"example": "74HC"}
    )
    dimensions: str | None = Field(
        default=None,
        description="Physical dimensions",
        json_schema_extra={"example": "20x15x5mm"}
    )

    created_at: datetime = Field(
        description="Timestamp when the part was created",
        json_schema_extra={"example": "2024-01-15T10:30:00Z"}
    )
    updated_at: datetime = Field(
        description="Timestamp when the part was last modified",
        json_schema_extra={"example": "2024-01-15T14:45:00Z"}
    )

    @computed_field  # type: ignore[prop-decorator]
    @property
    def total_quantity(self) -> int:
        """Computed field for total quantity across all locations."""
        # This will access the part_locations relationship from the ORM model
        return sum(location.qty for location in self.part_locations) if hasattr(self, 'part_locations') and self.part_locations else 0

    model_config = ConfigDict(from_attributes=True)


class PartListSchema(BaseModel):
    """Schema for lightweight part listings."""

    key: str = Field(
        description="4-character unique part identifier",
        json_schema_extra={"example": "BZQP"}
    )
    manufacturer_code: str | None = Field(
        description="Manufacturer's part number",
        json_schema_extra={"example": "OMRON G5Q-1A4"}
    )
    description: str = Field(
        description="Free text description",
        json_schema_extra={"example": "12V SPDT relay with 40A contacts"}
    )

    @computed_field  # type: ignore[prop-decorator]
    @property
    def total_quantity(self) -> int:
        """Computed field for total quantity across all locations."""
        return sum(location.qty for location in self.part_locations) if hasattr(self, 'part_locations') and self.part_locations else 0

    model_config = ConfigDict(from_attributes=True)


class PartWithTotalSchema(BaseModel):
    """Schema for part with calculated total quantity."""

    key: str = Field(
        description="4-character unique part identifier",
        json_schema_extra={"example": "BZQP"}
    )
    manufacturer_code: str | None = Field(
        description="Manufacturer's part number",
        json_schema_extra={"example": "OMRON G5Q-1A4"}
    )
    description: str = Field(
        description="Free text description",
        json_schema_extra={"example": "12V SPDT relay with 40A contacts"}
    )
    type_id: int | None = Field(
        description="Part type/category ID",
        json_schema_extra={"example": 1}
    )
    tags: list[str] | None = Field(
        description="Tags for categorization",
        json_schema_extra={"example": ["12V", "SPDT", "automotive"]}
    )
    manufacturer: str | None = Field(
        default=None,
        description="Manufacturer company name",
        json_schema_extra={"example": "Texas Instruments"}
    )
    seller: str | None = Field(
        description="Vendor/supplier name",
        json_schema_extra={"example": "Digi-Key"}
    )
    seller_link: str | None = Field(
        default=None,
        description="Product page URL at seller",
        json_schema_extra={"example": "https://www.digikey.com/product-detail/..."}
    )

    # Extended technical fields
    package: str | None = Field(
        default=None,
        description="Physical package type",
        json_schema_extra={"example": "DIP-8"}
    )
    pin_count: int | None = Field(
        default=None,
        description="Number of pins/connections",
        json_schema_extra={"example": 8}
    )
    voltage_rating: str | None = Field(
        default=None,
        description="Operating or rated voltage",
        json_schema_extra={"example": "3.3V"}
    )
    mounting_type: str | None = Field(
        default=None,
        description="Physical mounting type",
        json_schema_extra={"example": "Through-hole"}
    )
    series: str | None = Field(
        default=None,
        description="Component series identification",
        json_schema_extra={"example": "74HC"}
    )
    dimensions: str | None = Field(
        default=None,
        description="Physical dimensions",
        json_schema_extra={"example": "20x15x5mm"}
    )

    created_at: datetime = Field(
        description="Timestamp when the part was created",
        json_schema_extra={"example": "2024-01-15T10:30:00Z"}
    )
    updated_at: datetime = Field(
        description="Timestamp when the part was last modified",
        json_schema_extra={"example": "2024-01-15T14:45:00Z"}
    )
    total_quantity: int = Field(
        description="Total quantity across all locations",
        json_schema_extra={"example": 150}
    )

    model_config = ConfigDict(from_attributes=True)


class PartLocationListSchema(BaseModel):
    """Schema for simplified location data in part responses."""

    box_no: int = Field(
        description="Box number",
        json_schema_extra={"example": 7}
    )
    loc_no: int = Field(
        description="Location number within box",
        json_schema_extra={"example": 3}
    )
    qty: int = Field(
        description="Quantity at this location",
        json_schema_extra={"example": 25}
    )

    model_config = ConfigDict(from_attributes=True)


class PartWithTotalAndLocationsSchema(PartWithTotalSchema):
    """Schema for part with calculated total quantity and location details."""

    locations: list[PartLocationListSchema] = Field(
        description="Location details with quantities",
        json_schema_extra={"example": [
            {"box_no": 7, "loc_no": 3, "qty": 25},
            {"box_no": 8, "loc_no": 12, "qty": 50}
        ]}
    )


class PartLocationResponseSchema(BaseModel):
    """Schema for part location details with quantity."""

    key: str = Field(
        description="4-character part identifier",
        json_schema_extra={"example": "BZQP"}
    )
    box_no: int = Field(
        description="Box number",
        json_schema_extra={"example": 7}
    )
    loc_no: int = Field(
        description="Location number within box",
        json_schema_extra={"example": 3}
    )
    qty: int = Field(
        description="Quantity at this location",
        json_schema_extra={"example": 10}
    )

    model_config = ConfigDict(from_attributes=True)


@dataclass
class PartWithTotalModel:
    """Service layer model combining Part ORM model with total quantity."""
    part: 'Part'  # Forward reference to avoid circular imports
    total_quantity: int
