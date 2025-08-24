"""Inventory schemas for request/response validation."""

from pydantic import BaseModel, Field


class AddStockSchema(BaseModel):
    """Schema for adding stock to a location."""

    box_no: int = Field(
        ...,
        description="Box number where stock will be added",
        json_schema_extra={"example": 7}
    )
    loc_no: int = Field(
        ...,
        description="Location number within the box",
        json_schema_extra={"example": 3}
    )
    qty: int = Field(
        ...,
        gt=0,
        description="Quantity to add (must be positive)",
        json_schema_extra={"example": 10}
    )


class RemoveStockSchema(BaseModel):
    """Schema for removing stock from a location."""

    box_no: int = Field(
        ...,
        description="Box number where stock will be removed from",
        json_schema_extra={"example": 7}
    )
    loc_no: int = Field(
        ...,
        description="Location number within the box",
        json_schema_extra={"example": 3}
    )
    qty: int = Field(
        ...,
        gt=0,
        description="Quantity to remove (must be positive)",
        json_schema_extra={"example": 5}
    )


class MoveStockSchema(BaseModel):
    """Schema for moving stock between locations."""

    from_box_no: int = Field(
        ...,
        description="Source box number",
        json_schema_extra={"example": 7}
    )
    from_loc_no: int = Field(
        ...,
        description="Source location number within box",
        json_schema_extra={"example": 3}
    )
    to_box_no: int = Field(
        ...,
        description="Destination box number",
        json_schema_extra={"example": 8}
    )
    to_loc_no: int = Field(
        ...,
        description="Destination location number within box",
        json_schema_extra={"example": 15}
    )
    qty: int = Field(
        ...,
        gt=0,
        description="Quantity to move (must be positive)",
        json_schema_extra={"example": 3}
    )


class LocationSuggestionSchema(BaseModel):
    """Schema for location suggestions."""

    box_no: int = Field(
        description="Suggested box number",
        json_schema_extra={"example": 7}
    )
    loc_no: int = Field(
        description="Suggested location number within box",
        json_schema_extra={"example": 3}
    )
