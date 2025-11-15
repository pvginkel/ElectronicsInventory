"""AI part analysis schemas for request/response validation."""


from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.schemas.duplicate_search import DuplicateMatchEntry
from app.schemas.url_preview import UrlPreviewResponseSchema


class DocumentSuggestionSchema(BaseModel):
    """Schema for AI-suggested document."""

    url: str = Field(
        description="Original URL from which the document was downloaded",
        json_schema_extra={"example": "https://www.example.com/datasheet.pdf"}
    )
    document_type: str = Field(
        description="Type of document (datasheet, manual, schematic, etc.)",
        json_schema_extra={"example": "datasheet"}
    )
    is_cover_image: bool = Field(
        default=False,
        description="Image to become the cover image"
    )
    preview: UrlPreviewResponseSchema | None = Field(
        default=None,
        description="URL preview metadata including title and image URL"
    )

    model_config = ConfigDict(from_attributes=True)


class PartAnalysisDetailsSchema(BaseModel):
    """Schema for full AI part analysis details."""

    manufacturer_code: str | None = Field(
        default=None,
        description="AI-suggested manufacturer part number",
        json_schema_extra={"example": "Arduino A000066"}
    )
    type: str | None = Field(
        default=None,
        description="AI-suggested type name for frontend display and type creation (not used in part creation)",
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
    pin_pitch: str | None = Field(
        default=None,
        description="AI-suggested component pin pitch/spacing",
        json_schema_extra={"example": "2.54mm"}
    )
    voltage_rating: str | None = Field(
        default=None,
        description="AI-suggested operating voltage",
        json_schema_extra={"example": "5V/3.3V"}
    )
    input_voltage: str | None = Field(
        default=None,
        description="AI-suggested input voltage range/specification",
        json_schema_extra={"example": "5-12V DC"}
    )
    output_voltage: str | None = Field(
        default=None,
        description="AI-suggested output voltage range/specification",
        json_schema_extra={"example": "3.3V"}
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


class AIPartAnalysisResultSchema(BaseModel):
    """Schema for AI analysis result with flexible response paths.

    The LLM can populate:
    - Only analysis_result (full analysis, no duplicates found)
    - Only duplicate_parts (high-confidence duplicates found, no analysis needed)
    - Only analysis_failure_reason (query too vague/ambiguous, cannot proceed)
    - Multiple fields (e.g., medium-confidence duplicates with full analysis, or partial analysis with failure reason)

    All fields are optional; LLM prompt guidance determines which to populate.
    """

    analysis_result: PartAnalysisDetailsSchema | None = Field(
        default=None,
        description="Full part analysis when no high-confidence duplicates found or duplicate search not performed"
    )
    duplicate_parts: list[DuplicateMatchEntry] | None = Field(
        default=None,
        description="List of potential duplicate parts when duplicates are found (includes high and medium confidence matches)"
    )
    analysis_failure_reason: str | None = Field(
        default=None,
        description="Explanation when the query lacks sufficient information to identify a specific part"
    )

    @model_validator(mode='after')
    def validate_at_least_one_path(self) -> 'AIPartAnalysisResultSchema':
        """Validate that at least one field is meaningfully populated.

        This ensures the LLM provided some result without being overly restrictive.
        Multiple fields can be populated (e.g., when medium-confidence duplicates are found
        alongside full analysis, or partial analysis with a failure reason).

        Raises:
            ValueError: If all fields are None or if analysis_failure_reason is an empty/whitespace-only string
        """
        has_analysis = self.analysis_result is not None
        has_duplicates = self.duplicate_parts is not None

        # For failure_reason, reject empty strings and whitespace-only strings
        has_failure_reason = (
            self.analysis_failure_reason is not None
            and isinstance(self.analysis_failure_reason, str)
            and self.analysis_failure_reason.strip() != ""
        )

        if not (has_analysis or has_duplicates or has_failure_reason):
            raise ValueError(
                "At least one of analysis_result, duplicate_parts, or analysis_failure_reason must be populated. "
                f"Got: analysis_result={has_analysis}, duplicate_parts={has_duplicates}, "
                f"analysis_failure_reason={has_failure_reason}"
            )

        return self

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
        description="Type ID from existing types (frontend handles type creation if needed)",
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
    seller_id: int | None = Field(
        default=None,
        description="Seller ID reference (user provided)",
        json_schema_extra={"example": 1}
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
    pin_pitch: str | None = Field(
        default=None,
        max_length=50,
        description="Component pin pitch/spacing",
        json_schema_extra={"example": "2.54mm"}
    )
    voltage_rating: str | None = Field(
        default=None,
        max_length=100,
        description="Operating voltage",
        json_schema_extra={"example": "5V/3.3V"}
    )
    input_voltage: str | None = Field(
        default=None,
        max_length=100,
        description="Input voltage range/specification",
        json_schema_extra={"example": "5-12V DC"}
    )
    output_voltage: str | None = Field(
        default=None,
        max_length=100,
        description="Output voltage range/specification",
        json_schema_extra={"example": "3.3V"}
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
    documents: list[DocumentSuggestionSchema] = Field(
        default=[],
        description="Documents to attach from temporary storage"
    )

    model_config = ConfigDict(from_attributes=True, extra="forbid")
