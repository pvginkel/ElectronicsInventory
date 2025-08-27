"""Part schemas for request/response validation."""

from dataclasses import dataclass
from datetime import datetime
from typing import TYPE_CHECKING

from pydantic import BaseModel, ConfigDict, Field, computed_field

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


class PartResponseSchema(BaseModel):
    """Schema for full part details with relationships."""

    id4: str = Field(
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
    seller: str | None = Field(
        description="Vendor/supplier name",
        json_schema_extra={"example": "Digi-Key"}
    )
    seller_link: str | None = Field(
        description="Product page URL",
        json_schema_extra={"example": "https://www.digikey.com/en/products/detail/G5Q-1A4"}
    )
    created_at: datetime = Field(
        description="Timestamp when the part was created",
        json_schema_extra={"example": "2024-01-15T10:30:00Z"}
    )
    updated_at: datetime = Field(
        description="Timestamp when the part was last modified",
        json_schema_extra={"example": "2024-01-15T14:45:00Z"}
    )

    @computed_field
    @property
    def total_quantity(self) -> int:
        """Computed field for total quantity across all locations."""
        # This will access the part_locations relationship from the ORM model
        return sum(location.qty for location in self.part_locations) if hasattr(self, 'part_locations') and self.part_locations else 0

    model_config = ConfigDict(from_attributes=True)


class PartListSchema(BaseModel):
    """Schema for lightweight part listings."""

    id4: str = Field(
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

    @computed_field
    @property
    def total_quantity(self) -> int:
        """Computed field for total quantity across all locations."""
        return sum(location.qty for location in self.part_locations) if hasattr(self, 'part_locations') and self.part_locations else 0

    model_config = ConfigDict(from_attributes=True)


class PartWithTotalSchema(BaseModel):
    """Schema for part with calculated total quantity."""

    id4: str = Field(
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
    seller: str | None = Field(
        description="Vendor/supplier name",
        json_schema_extra={"example": "Digi-Key"}
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


class PartLocationResponseSchema(BaseModel):
    """Schema for part location details with quantity."""

    id4: str = Field(
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
