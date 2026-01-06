"""AI part cleanup schemas for request/response validation."""

from pydantic import BaseModel, ConfigDict, Field


class CleanupPartRequestSchema(BaseModel):
    """Schema for requesting AI part cleanup."""

    part_key: str = Field(
        min_length=4,
        max_length=4,
        pattern="^[A-Z]{4}$",
        description="4-character part key to clean up",
        json_schema_extra={"example": "ABCD"}
    )

    model_config = ConfigDict(from_attributes=True)


class CleanedPartDataSchema(BaseModel):
    """Schema for cleaned part data returned by AI.

    This mirrors the part data structure and includes all fields that
    the AI can improve during cleanup. The frontend will use this to
    show diffs and apply updates.
    """

    key: str = Field(
        description="Part key (unchanged)",
        json_schema_extra={"example": "ABCD"}
    )
    manufacturer_code: str | None = Field(
        default=None,
        description="Cleaned manufacturer part number",
        json_schema_extra={"example": "STM32F103C8T6"}
    )
    type: str | None = Field(
        default=None,
        description="Cleaned type name (AI can suggest type changes)",
        json_schema_extra={"example": "Microcontroller"}
    )
    description: str | None = Field(
        default=None,
        description="Cleaned part description",
        json_schema_extra={"example": "32-bit ARM Cortex-M3 microcontroller"}
    )
    manufacturer: str | None = Field(
        default=None,
        description="Cleaned manufacturer name",
        json_schema_extra={"example": "STMicroelectronics"}
    )
    tags: list[str] = Field(
        default=[],
        description="Cleaned tags",
        json_schema_extra={"example": ["arm", "cortex-m3", "32-bit", "microcontroller"]}
    )
    package: str | None = Field(
        default=None,
        description="Cleaned package type",
        json_schema_extra={"example": "LQFP-48"}
    )
    pin_count: int | None = Field(
        default=None,
        description="Cleaned pin count",
        json_schema_extra={"example": 48}
    )
    pin_pitch: str | None = Field(
        default=None,
        description="Cleaned pin pitch",
        json_schema_extra={"example": "0.5mm"}
    )
    voltage_rating: str | None = Field(
        default=None,
        description="Cleaned voltage rating",
        json_schema_extra={"example": "3.3V"}
    )
    input_voltage: str | None = Field(
        default=None,
        description="Cleaned input voltage",
        json_schema_extra={"example": "2.0-3.6V"}
    )
    output_voltage: str | None = Field(
        default=None,
        description="Cleaned output voltage",
        json_schema_extra={"example": None}
    )
    mounting_type: str | None = Field(
        default=None,
        description="Cleaned mounting type",
        json_schema_extra={"example": "Surface-Mount"}
    )
    series: str | None = Field(
        default=None,
        description="Cleaned product series",
        json_schema_extra={"example": "STM32F1"}
    )
    dimensions: str | None = Field(
        default=None,
        description="Cleaned physical dimensions",
        json_schema_extra={"example": "7x7mm"}
    )
    product_page: str | None = Field(
        default=None,
        description="Cleaned product page URL",
        json_schema_extra={"example": "https://www.st.com/en/microcontrollers-microprocessors/stm32f103.html"}
    )
    seller: str | None = Field(
        default=None,
        description="Cleaned seller name (not ID)",
        json_schema_extra={"example": "DigiKey"}
    )
    seller_link: str | None = Field(
        default=None,
        description="Cleaned seller product link",
        json_schema_extra={"example": "https://www.digikey.com/..."}
    )

    model_config = ConfigDict(from_attributes=True)


class AIPartCleanupTaskResultSchema(BaseModel):
    """Schema for task result returned by AI cleanup task."""

    success: bool = Field(
        description="Whether the cleanup completed successfully",
        json_schema_extra={"example": True}
    )
    cleaned_part: CleanedPartDataSchema | None = Field(
        default=None,
        description="Cleaned part data if successful"
    )
    error_message: str | None = Field(
        default=None,
        description="Error message if cleanup failed",
        json_schema_extra={"example": "Part not found"}
    )

    model_config = ConfigDict(from_attributes=True)


class AIPartCleanupTaskCancelledResultSchema(BaseModel):
    """Schema for cancelled cleanup task result."""

    cancelled: bool = Field(
        default=True,
        description="Indicates the task was cancelled",
        json_schema_extra={"example": True}
    )
    message: str = Field(
        default="Cleanup cancelled by user",
        description="Cancellation message",
        json_schema_extra={"example": "Cleanup cancelled by user"}
    )

    model_config = ConfigDict(from_attributes=True)
