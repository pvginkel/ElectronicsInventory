"""AI function for extracting technical specs from PDF datasheets."""

from typing import cast

from pydantic import BaseModel

from app.schemas.datasheet_extraction import ExtractSpecsFromDatasheetRequest
from app.services.base_task import ProgressHandle
from app.services.datasheet_extraction_service import DatasheetExtractionService
from app.utils.ai.ai_runner import AIFunction


class ExtractSpecsFromDatasheetFunction(AIFunction):
    """AI function that extracts technical specifications from PDF datasheets.

    This function is called by the main AI analysis LLM when it identifies a
    datasheet URL for a part. It delegates to DatasheetExtractionService for
    the actual extraction logic.
    """

    def __init__(self, datasheet_extraction_service: DatasheetExtractionService):
        """Initialize the datasheet extraction function.

        Args:
            datasheet_extraction_service: Service that performs the actual extraction
        """
        self.datasheet_extraction_service = datasheet_extraction_service

    def get_name(self) -> str:
        return "extract_specs_from_datasheet"

    def get_description(self) -> str:
        return (
            "Extract technical specifications from a PDF datasheet. Provide the "
            "analysis query (description of the part being analyzed) and a URL to "
            "a PDF datasheet. The function validates that the datasheet matches the "
            "query, then extracts normalized technical specifications. Returns either "
            "extracted specs or an error message if validation fails or the datasheet "
            "cannot be processed."
        )

    def get_model(self) -> type[BaseModel]:
        return ExtractSpecsFromDatasheetRequest

    def execute(
        self, request: BaseModel, progress_handle: ProgressHandle
    ) -> BaseModel:
        """Execute datasheet spec extraction.

        Args:
            request: ExtractSpecsFromDatasheetRequest with analysis_query and datasheet_url
            progress_handle: Progress handle for reporting (not used)

        Returns:
            ExtractSpecsFromDatasheetResponse with specs or error message
        """
        progress_handle.send_progress_text("Extracting specs from datasheet")

        extraction_request = cast(ExtractSpecsFromDatasheetRequest, request)

        return self.datasheet_extraction_service.extract_specs(
            analysis_query=extraction_request.analysis_query,
            datasheet_url=extraction_request.datasheet_url,
            progress_handle=progress_handle,
        )
