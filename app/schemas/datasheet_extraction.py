"""Datasheet spec extraction schemas for AI-powered datasheet analysis."""

from pydantic import BaseModel, ConfigDict, Field

from app.services.ai_model import PartAnalysisSpecDetails


class ExtractSpecsFromDatasheetRequest(BaseModel):
    """Request schema for datasheet spec extraction function.

    This function validates that a datasheet matches the analysis query,
    then extracts technical specifications from the PDF.
    """

    model_config = ConfigDict(extra="forbid", json_schema_extra={"additionalProperties": False})

    analysis_query: str = Field(
        description="Free-text description of the part being analyzed. Used to validate that the datasheet matches what we're looking for.",
        json_schema_extra={"example": "0.96 inch OLED display module SSD1306"}
    )
    datasheet_url: str = Field(
        description="URL to a PDF datasheet to extract specs from. Should be a direct link to a PDF file.",
        json_schema_extra={"example": "https://cdn-shop.adafruit.com/datasheets/SSD1306.pdf"}
    )


class ExtractSpecsFromDatasheetResponse(BaseModel):
    """Response schema for datasheet spec extraction function.

    Returns either extracted specs OR an error message (never both).
    If the datasheet doesn't match the analysis query, error is populated.
    If extraction succeeds, specs is populated with normalized technical details.
    """

    model_config = ConfigDict(extra="forbid")

    specs: PartAnalysisSpecDetails | None = Field(
        default=None,
        description="Extracted technical specifications if validation succeeded"
    )
    error: str | None = Field(
        default=None,
        description="Error message if datasheet validation or extraction failed (e.g., 'Datasheet is for SSD1305, not SSD1306 as requested')"
    )
