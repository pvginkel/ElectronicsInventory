"""AI function for extracting specifications from product page URLs using LLM."""

import json
import logging
from typing import cast

from bs4 import BeautifulSoup
from pydantic import BaseModel

from app.schemas.mouser import ExtractSpecsRequest, ExtractSpecsResponse
from app.services.base_task import ProgressHandle
from app.services.download_cache_service import DownloadCacheService
from app.utils.ai.ai_runner import AIFunction, AIRequest, AIRunner

logger = logging.getLogger(__name__)


class ExtractPartSpecsFromURLFunction(AIFunction):
    """AI function that extracts specifications from product pages using LLM.

    This function downloads a product page, preprocesses the HTML to reduce token count,
    and uses an LLM to extract structured specifications as JSON.
    """

    def __init__(
        self,
        download_cache_service: DownloadCacheService,
        ai_runner: AIRunner | None
    ):
        """Initialize the spec extraction function.

        Args:
            download_cache_service: Service for downloading and caching web pages
            ai_runner: AI runner for LLM calls (may be None if AI disabled)
        """
        self.download_cache_service = download_cache_service
        self.ai_runner = ai_runner

    def get_name(self) -> str:
        return "extract_specs_from_url"

    def get_description(self) -> str:
        return (
            "Extract technical specifications from a product page URL using AI analysis. "
            "Provide any product page URL (manufacturer site, distributor, etc.) and this "
            "function will download the page, extract the visible content, and use AI to "
            "identify and structure all technical specifications mentioned on the page. "
            "Returns specifications as a JSON object with key-value pairs. Use this when "
            "you need to extract detailed specs from a product page."
        )

    def get_model(self) -> type[BaseModel]:
        return ExtractSpecsRequest

    def execute(
        self, request: BaseModel, progress_handle: ProgressHandle
    ) -> BaseModel:
        """Extract specifications from product page URL.

        Args:
            request: ExtractSpecsRequest with url
            progress_handle: Progress handle for reporting

        Returns:
            ExtractSpecsResponse with specs dict or error
        """
        progress_handle.send_progress_text("Extracting specs from product page")

        specs_request = cast(ExtractSpecsRequest, request)
        url = specs_request.url

        # Check if AI runner is available
        if not self.ai_runner:
            error_msg = "AI runner not available for spec extraction"
            logger.error(error_msg)
            return ExtractSpecsResponse(error=error_msg)

        try:
            logger.info(f"Downloading product page for spec extraction: {url}")

            # Download HTML content (cached)
            download_result = self.download_cache_service.get_cached_content(url)
            html_content = download_result.content.decode('utf-8', errors='ignore')

            # Preprocess HTML to reduce token count
            preprocessed_text = self._preprocess_html(html_content)

            logger.info(
                f"Preprocessed HTML from {len(html_content)} to {len(preprocessed_text)} chars"
            )

            # Build LLM prompt for spec extraction
            system_prompt = (
                "You are an expert at extracting technical specifications from product pages. "
                "Analyze the following HTML content and extract all technical specifications "
                "mentioned on the page. Return the specifications as a JSON object with "
                "key-value pairs. Use descriptive keys (e.g., 'voltage', 'current', 'package', "
                "'temperature_range') and appropriate value types (strings, numbers, booleans). "
                "Only include specifications that are explicitly stated on the page."
            )

            user_prompt = f"Extract all technical specifications from this product page:\n\n{preprocessed_text}"

            # Create dynamic response model for free-form JSON
            class DynamicSpecs(BaseModel):
                """Dynamic model for any spec structure."""
                class Config:
                    extra = "allow"

            # Call LLM to extract specs
            request_obj = AIRequest(
                system_prompt=system_prompt,
                user_prompt=user_prompt,
                model="gpt-5-mini",  # Use fast model for extraction
                verbosity="low",
                reasoning_effort="low",
                reasoning_summary="off",
                response_model=DynamicSpecs
            )

            logger.info("Calling LLM for spec extraction")
            response = self.ai_runner.run(
                request_obj,
                [],  # No function tools for this nested call
                progress_handle,
                False  # Don't use structured outputs
            )

            # Parse LLM response as JSON
            try:
                if isinstance(response.response, str):
                    specs = json.loads(response.response)
                elif isinstance(response.response, dict):
                    specs = response.response
                else:
                    raise ValueError(f"Unexpected response type: {type(response.response)}")

                logger.info(f"Successfully extracted {len(specs)} specifications")
                return ExtractSpecsResponse(specs=specs)

            except json.JSONDecodeError as e:
                error_msg = f"Failed to parse LLM response as JSON: {str(e)}"
                logger.error(error_msg)
                return ExtractSpecsResponse(error=error_msg)

        except Exception as e:
            error_msg = f"Failed to extract specs from URL: {str(e)}"
            logger.error(error_msg, exc_info=True)
            return ExtractSpecsResponse(error=error_msg)

    def _preprocess_html(self, html_content: str) -> str:
        """Preprocess HTML to reduce token count for LLM.

        Removes script and style tags and extracts text content.
        No truncation is applied - if the content exceeds the LLM token limit,
        the error will be returned and the main conversation can proceed without
        the spec extraction result.

        Args:
            html_content: Raw HTML content

        Returns:
            Preprocessed text content
        """
        try:
            soup = BeautifulSoup(html_content, 'html.parser')

            # Remove script and style tags
            for element in soup(['script', 'style']):
                element.decompose()

            # Extract text content, preserving some structure
            text = soup.get_text(separator='\n', strip=True)

            return text

        except Exception as e:
            logger.warning(f"Failed to preprocess HTML, using raw content: {e}")
            return html_content
