"""AI part analysis schemas for request/response validation."""


from pydantic import BaseModel, ConfigDict, Field

from app.schemas.url_preview import UrlPreviewResponseSchema


class DocumentSuggestionSchema(BaseModel):
    """Schema for AI-suggested document."""

    url: str = Field(
        description="Original URL from which the document was downloaded",
        json_schema_extra={"example": "https://www.example.com/datasheet.pdf"}
    )
    url_type: str = Field(
        description="Type of the URL",
        json_schema_extra={"example": "link"}
    )
    document_type: str = Field(
        description="Type of document (datasheet, manual, schematic, etc.)",
        json_schema_extra={"example": "datasheet"}
    )
    description: str | None = Field(
        default=None,
        description="AI-provided description of the document content",
        json_schema_extra={"example": "Complete technical specifications and pinout diagram"}
    )
    preview: UrlPreviewResponseSchema | None = Field(
        default=None,
        description="URL preview metadata including title and image URL"
    )

    model_config = ConfigDict(from_attributes=True)


class AIPartAnalysisResultSchema(BaseModel):
    """Schema for AI analysis result containing all part suggestions."""

    manufacturer_code: str | None = Field(
        default=None,
        description="AI-suggested manufacturer part number",
        json_schema_extra={"example": "Arduino A000066"}
    )
    type: str | None = Field(
        default=None,
        description="AI-suggested type name (existing or new suggestion)",
        json_schema_extra={"example": "Microcontroller"}
    )
    description: str | None = Field(
        default=None,
        description="AI-generated part description",
        json_schema_extra={"example": "Arduino Uno R3 microcontroller development board with ATmega328P"}
    )
    tags: list[str] = Field(
        default=[],
        description="AI-suggested tags for the part",
        json_schema_extra={"example": ["arduino", "microcontroller", "ATmega328P", "development"]}
    )
    manufacturer: str | None = Field(
        default=None,
        description="AI-suggested manufacturer company name",
        json_schema_extra={"example": "Arduino"}
    )
    product_page: str | None = Field(
        default=None,
        description="AI-suggested manufacturer product page URL",
        json_schema_extra={"example": "https://www.arduino.cc/en/Main/arduinoBoardUno"}
    )

    # Extended technical fields
    package: str | None = Field(
        default=None,
        description="AI-suggested physical package/form factor",
        json_schema_extra={"example": "Arduino Uno Form Factor"}
    )
    pin_count: int | None = Field(
        default=None,
        description="AI-suggested number of pins/connections",
        json_schema_extra={"example": 32}
    )
    voltage_rating: str | None = Field(
        default=None,
        description="AI-suggested operating voltage",
        json_schema_extra={"example": "5V/3.3V"}
    )
    mounting_type: str | None = Field(
        default=None,
        description="AI-suggested mounting type",
        json_schema_extra={"example": "Breadboard Compatible"}
    )
    series: str | None = Field(
        default=None,
        description="AI-suggested component series",
        json_schema_extra={"example": "Arduino Uno"}
    )
    dimensions: str | None = Field(
        default=None,
        description="AI-suggested physical dimensions",
        json_schema_extra={"example": "68.6x53.4mm"}
    )

    # Document and image suggestions
    documents: list[DocumentSuggestionSchema] = Field(
        default=[],
        description="AI-suggested and downloaded documents",
        json_schema_extra={"example": []}
    )

    # Metadata
    type_is_existing: bool = Field(
        default=False,
        description="Whether the suggested type matches an existing type in the system",
        json_schema_extra={"example": True}
    )
    existing_type_id: int | None = Field(
        default=None,
        description="ID of existing type if type_is_existing is True",
        json_schema_extra={"example": 5}
    )

    model_config = ConfigDict(from_attributes=True)


class AIPartAnalysisTaskResultSchema(BaseModel):
    """Schema for task result returned by AI analysis task."""

    success: bool = Field(
        description="Whether the analysis completed successfully",
        json_schema_extra={"example": True}
    )
    analysis: AIPartAnalysisResultSchema | None = Field(
        default=None,
        description="Analysis results if successful"
    )
    error_message: str | None = Field(
        default=None,
        description="Error message if analysis failed",
        json_schema_extra={"example": "Failed to analyze image: unsupported format"}
    )

    model_config = ConfigDict(from_attributes=True)


class AIPartAnalysisTaskCancelledResultSchema(BaseModel):
    """Schema for cancelled task result."""

    cancelled: bool = Field(
        default=True,
        description="Indicates the task was cancelled",
        json_schema_extra={"example": True}
    )
    message: str = Field(
        default="Analysis cancelled by user",
        description="Cancellation message",
        json_schema_extra={"example": "Analysis cancelled by user"}
    )

    model_config = ConfigDict(from_attributes=True)


class AIPartCreateSchema(BaseModel):
    """Schema for creating a part from AI suggestions."""

    manufacturer_code: str | None = Field(
        default=None,
        max_length=255,
        description="Manufacturer part number from AI analysis",
        json_schema_extra={"example": "Arduino A000066"}
    )
    type_id: int | None = Field(
        default=None,
        description="Type ID (user can override AI suggestion)",
        json_schema_extra={"example": 15}
    )
    description: str = Field(
        min_length=1,
        description="Part description (can be edited from AI suggestion)",
        json_schema_extra={"example": "Arduino Uno R3 microcontroller development board"}
    )
    tags: list[str] = Field(
        default=[],
        description="Tags for the part (can be edited from AI suggestion)",
        json_schema_extra={"example": ["arduino", "microcontroller", "development"]}
    )
    manufacturer: str | None = Field(
        default=None,
        max_length=255,
        description="Manufacturer company name from AI analysis",
        json_schema_extra={"example": "Arduino"}
    )
    product_page: str | None = Field(
        default=None,
        max_length=500,
        description="Manufacturer product page URL from AI analysis",
        json_schema_extra={"example": "https://www.arduino.cc/en/Main/arduinoBoardUno"}
    )
    seller: str | None = Field(
        default=None,
        max_length=255,
        description="Seller/vendor name (user provided)",
        json_schema_extra={"example": "Digi-Key"}
    )
    seller_link: str | None = Field(
        default=None,
        max_length=500,
        description="Seller product page URL (user provided)",
        json_schema_extra={"example": "https://www.digikey.com/en/products/detail/arduino/A000066"}
    )

    # Extended technical fields
    package: str | None = Field(
        default=None,
        max_length=100,
        description="Physical package/form factor",
        json_schema_extra={"example": "Arduino Uno Form Factor"}
    )
    pin_count: int | None = Field(
        default=None,
        gt=0,
        description="Number of pins/connections",
        json_schema_extra={"example": 32}
    )
    voltage_rating: str | None = Field(
        default=None,
        max_length=50,
        description="Operating voltage",
        json_schema_extra={"example": "5V/3.3V"}
    )
    mounting_type: str | None = Field(
        default=None,
        max_length=50,
        description="Mounting type",
        json_schema_extra={"example": "Breadboard Compatible"}
    )
    series: str | None = Field(
        default=None,
        max_length=100,
        description="Component series",
        json_schema_extra={"example": "Arduino Uno"}
    )
    dimensions: str | None = Field(
        default=None,
        max_length=100,
        description="Physical dimensions",
        json_schema_extra={"example": "68.6x53.4mm"}
    )

    # Document and image references
    documents: list[DocumentSuggestionSchema] = Field(
        default=[],
        description="Documents to attach from temporary storage"
    )
    suggested_image_url: str | None = Field(
        default=None,
        description="Temporary image URL to use as part cover image",
        json_schema_extra={"example": "/tmp/ai-analysis/20240830_143022_a1b2c3d4/part_image.jpg"}
    )

    model_config = ConfigDict(from_attributes=True)

