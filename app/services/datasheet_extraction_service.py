"""Service for extracting technical specs from PDF datasheets."""

import logging
import tempfile
from pathlib import Path

from jinja2 import Environment, FileSystemLoader

from app.config import Settings
from app.models.attachment import AttachmentType
from app.schemas.datasheet_extraction import ExtractSpecsFromDatasheetResponse
from app.services.base_task import ProgressHandle
from app.services.document_service import DocumentService
from app.services.type_service import TypeService
from app.utils.ai.ai_runner import AIRequest, AIRunner
from app.utils.temp_file_manager import TempFileManager

logger = logging.getLogger(__name__)


class DatasheetExtractionService:
    """Service for extracting technical specifications from PDF datasheets.

    This service downloads a PDF datasheet, sends it to the AI for extraction,
    and returns normalized technical specs. It can be used directly or via
    the ExtractSpecsFromDatasheetFunction for AI function calling.
    """

    def __init__(
        self,
        config: Settings,
        document_service: DocumentService,
        type_service: TypeService,
        ai_runner: AIRunner | None,
        temp_file_manager: TempFileManager,
    ):
        """Initialize the datasheet extraction service.

        Args:
            config: Application configuration
            document_service: Service for downloading and validating URLs
            type_service: Service for retrieving product categories
            ai_runner: AI runner for making OpenAI API calls (None if AI disabled)
            temp_file_manager: Manager for temporary file storage
        """
        self.config = config
        self.document_service = document_service
        self.type_service = type_service
        self.ai_runner = ai_runner
        self.temp_file_manager = temp_file_manager

        # Load the spec extraction prompt template
        prompt_dir = Path(__file__).parent / "prompts"
        self.jinja_env = Environment(loader=FileSystemLoader(str(prompt_dir)))
        self.template = self.jinja_env.get_template("spec_extraction.md")

    def extract_specs(
        self, analysis_query: str, datasheet_url: str, progress_handle: ProgressHandle
    ) -> ExtractSpecsFromDatasheetResponse:
        """Extract technical specifications from a PDF datasheet.

        Downloads the PDF from the given URL, validates it matches the analysis
        query, and extracts normalized technical specifications using AI.

        Args:
            analysis_query: Description of the part being analyzed, used to
                validate that the datasheet matches the intended part
            datasheet_url: URL to a PDF document containing the datasheet

        Returns:
            ExtractSpecsFromDatasheetResponse with either:
            - specs: Extracted PartAnalysisDetails if successful
            - error: Explanation of why extraction failed
        """
        try:
            logger.info(
                f"Extracting specs from datasheet: {datasheet_url} "
                f"for query: {analysis_query[:100]}"
            )

            # Download and validate PDF using DocumentService
            # This goes through the URL interceptor chain (e.g., LCSCInterceptor)
            try:
                upload_doc = self.document_service.process_upload_url(datasheet_url)
            except Exception as e:
                error_msg = f"Failed to download datasheet: {str(e)}"
                logger.warning(error_msg)
                return ExtractSpecsFromDatasheetResponse(specs=None, error=error_msg)

            # Verify it's a PDF
            if upload_doc.detected_type != AttachmentType.PDF:
                error_msg = "URL is not a valid PDF datasheet"
                logger.warning(error_msg)
                return ExtractSpecsFromDatasheetResponse(specs=None, error=error_msg)

            # Write PDF to temporary file using Python's tempfile for random naming
            try:
                fd, temp_path_str = tempfile.mkstemp(
                    suffix=".pdf",
                    prefix="datasheet_",
                    dir=self.temp_file_manager.base_path
                )
                temp_path = Path(temp_path_str)
                # Write content and close the file descriptor
                with open(fd, 'wb') as f:
                    f.write(upload_doc.content.content)
                logger.debug(f"Wrote PDF to temporary file: {temp_path}")
            except Exception as e:
                error_msg = f"Failed to write temporary file: {str(e)}"
                logger.error(error_msg)
                return ExtractSpecsFromDatasheetResponse(specs=None, error=error_msg)

            # Build the prompt for spec extraction
            prompt = self.build_prompt(analysis_query)

            # Create AI request with PDF attachment
            ai_request = AIRequest(
                system_prompt=prompt,
                user_prompt="Extract technical specifications from the attached datasheet PDF.",
                model=self.config.OPENAI_MODEL,
                verbosity=self.config.OPENAI_VERBOSITY,
                reasoning_effort=None,
                reasoning_summary="auto",
                response_model=ExtractSpecsFromDatasheetResponse,
                attachments=[str(temp_path)],
            )

            # Check AI runner is available before making the call
            if not self.ai_runner:
                return ExtractSpecsFromDatasheetResponse(
                    specs=None, error="AI runner not available"
                )

            # Execute AI request (cleanup happens in OpenAIRunner finally block)
            try:
                ai_response = self.ai_runner.run(ai_request, [], progress_handle, True)

                if not isinstance(ai_response.response, ExtractSpecsFromDatasheetResponse):
                    error_msg = f"Unexpected response type: {type(ai_response.response)}"
                    logger.error(error_msg)
                    return ExtractSpecsFromDatasheetResponse(specs=None, error=error_msg)

                response = ai_response.response

                if response.specs:
                    logger.info("Successfully extracted specs from datasheet")
                else:
                    logger.info(f"Datasheet extraction returned error: {response.error}")

                return response

            except Exception as e:
                error_msg = f"AI extraction failed: {str(e)}"
                logger.error(error_msg, exc_info=True)
                return ExtractSpecsFromDatasheetResponse(specs=None, error=error_msg)

        except Exception as e:
            # Catch-all for unexpected errors - log and return graceful degradation
            error_msg = f"Unexpected error during datasheet extraction: {str(e)}"
            logger.error(error_msg, exc_info=True)
            return ExtractSpecsFromDatasheetResponse(specs=None, error=error_msg)

    def build_prompt(self, analysis_query: str) -> str:
        """Build the prompt for the AI model using Jinja2 template.

        Args:
            analysis_query: Description of the part being analyzed
        Returns:
            Rendered prompt string
        """

        # Generate prompt for spec extraction
        categories = self.type_service.get_all_types()
        prompt = self.template.render(
            analysis_query=analysis_query,
            categories=[cat.name for cat in categories],
        )
        return prompt
