"""AI service for part analysis using OpenAI."""

import base64
import json
import logging
import time
from enum import Enum
from pathlib import Path
from typing import TYPE_CHECKING
from urllib.parse import quote

from openai import OpenAI
from pydantic import BaseModel, ConfigDict, Field

from app.config import Settings
from app.schemas.ai_part_analysis import (
    AIPartAnalysisResultSchema,
    DocumentSuggestionSchema,
)
from app.schemas.url_preview import UrlPreviewResponseSchema
from app.services.base import BaseService
from app.services.download_cache_service import DownloadCacheService
from app.services.url_thumbnail_service import URLThumbnailService
from app.utils.temp_file_manager import TempFileManager

if TYPE_CHECKING:
    from app.services.type_service import TypeService

logger = logging.getLogger(__name__)


class AIService(BaseService):
    """Service for AI-powered part analysis using OpenAI."""

    def __init__(self, db, config: Settings, temp_file_manager: TempFileManager, type_service: 'TypeService', url_thumbnail_service: URLThumbnailService, download_cache_service: DownloadCacheService):
        super().__init__(db)
        self.config = config
        self.temp_file_manager = temp_file_manager
        self.type_service = type_service
        self.url_thumbnail_service = url_thumbnail_service
        self.download_cache_service = download_cache_service

        # Initialize OpenAI client
        if not config.OPENAI_API_KEY:
            raise ValueError("OPENAI_API_KEY configuration is required for AI features")

        self.client = OpenAI(api_key=config.OPENAI_API_KEY)

    def analyze_part(self, text_input: str | None = None, image_data: bytes | None = None,
                     image_mime_type: str | None = None) -> AIPartAnalysisResultSchema:
        """
        Analyze part information from text and/or image using OpenAI.

        Args:
            text_input: Optional text description of the part
            image_data: Optional image bytes
            image_mime_type: MIME type of the image if provided

        Returns:
            AIPartAnalysisResultSchema with analysis results

        Raises:
            ValueError: If neither text nor image is provided
            Exception: If OpenAI API call fails
        """
        if not text_input and not image_data:
            raise ValueError("Either text_input or image_data must be provided")

        # Get existing type names for context
        existing_types = self.type_service.get_all_types()
        type_names = [t.name for t in existing_types]

        try:
            if self.config.OPENAI_DUMMY_RESPONSE_PATH:
                with open(self.config.OPENAI_DUMMY_RESPONSE_PATH) as f:
                    ai_response = PartAnalysisSuggestion.model_validate(json.loads(f.read()))

            else:
                # Build input and instructions for Responses API
                instructions, input_content = self._build_responses_api_input(
                    text_input, image_data, image_mime_type, type_names
                )

                logger.info("Starting OpenAI call")

                start = time.perf_counter()

                # Call OpenAI Responses API with structured output
                response = self.client.responses.parse(
                    model=self.config.OPENAI_MODEL,
                    instructions=instructions,
                    input=input_content,
                    text_format=PartAnalysisSuggestion,
                    text={ "verbosity": self.config.OPENAI_VERBOSITY }, # type: ignore
                    max_output_tokens=self.config.OPENAI_MAX_OUTPUT_TOKENS,
                    store=self.config.OPENAI_STORE_REQUESTS,
                    tools=[
                        { "type": "web_search" },
                    ],
                    reasoning = {
                        "effort": self.config.OPENAI_REASONING_EFFORT # type: ignore
                    },
                )

                logger.info(f"OpenAI response status: {response.status}, duration {time.perf_counter() - start}, incomplete details: {response.incomplete_details}")
                logger.info(f"Output text: {response.output_text}")

                ai_response = response.output_parsed
                if not ai_response:
                    raise Exception(f"Empty response from OpenAI status {response.status}, incomplete details: {response.incomplete_details}")

            # Create temporary directory for document downloads
            temp_dir = self.temp_file_manager.create_temp_directory()

            # Download documents if URLs provided
            documents : list[DocumentSuggestionSchema] = []

            for url, type in [
                (ai_response.product_image_url, 'product_image'),
                (ai_response.datasheet_url, 'datasheet'),
                (ai_response.pinout_url, 'pinout'),
                (ai_response.schematic_url, 'schematic'),
                (ai_response.manual_url, 'manual'),
            ]:
                if url:
                    document = self._document_from_link(url, type)
                    if document:
                        documents.append(document)

            # Determine if type is existing or new
            suggested_type = ai_response.component_type
            type_is_existing = False
            existing_type_id = None

            if suggested_type:
                for type_obj in existing_types:
                    if type_obj.name.lower() == suggested_type.lower():
                        type_is_existing = True
                        existing_type_id = type_obj.id
                        break

            # Build result schema

            result = AIPartAnalysisResultSchema(
                manufacturer_code=ai_response.manufacturer_code,
                type=suggested_type,
                description=ai_response.product_name,
                tags=ai_response.tags,
                manufacturer=ai_response.manufacturer,
                product_page=ai_response.product_page_url,
                package=ai_response.component_packaging_type_acronym,
                pin_count=ai_response.component_pin_count,
                voltage_rating=ai_response.voltage_rating,
                mounting_type=ai_response.mounting_type,
                series=ai_response.product_series,
                dimensions=ai_response.physical_dimensions,
                documents=documents,
                type_is_existing=type_is_existing,
                existing_type_id=existing_type_id
            )

            return result

        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse OpenAI response as JSON: {e}")
            raise Exception("Invalid response format from AI service") from e

    def _build_responses_api_input(self, text_input: str | None, image_data: bytes | None,
                                 image_mime_type: str | None, type_names: list[str]) -> tuple[str, str | list]:
        """Build instructions and input for OpenAI Responses API."""

        # Build system instructions
        instructions = f"""You are an expert electronics component analyzer. Analyze the provided text and/or image to identify and find the requested information on the internet.

Available component types in the system: {', '.join(type_names)}

Choose an existing component type that fits best, or suggest a new component type name following similar patterns.

Tags are used as filtering dimensions. Use short labels, lower case, hyphenated if necessary. Allowed categories are the role/function, feature presence and interfaces. Don't duplicate data you can assign to other fields. Disallowed are any numerical values like voltages, currents, frequencies, memory sizing, ratings, tolerances, etc.

Focus on accuracy and technical precision. If uncertain about specific details, omit them rather than guessing. Use tags for important information you can't put into one of the other fields."""

        # Build input content
        if text_input and image_data and image_mime_type:
            # Both text and image - use array format
            base64_image = base64.b64encode(image_data).decode('utf-8')
            data_url = f"data:{image_mime_type};base64,{base64_image}"

            input_content = [
                {"role": "user", "content": [
                    {"type": "text", "text": f"Text description: {text_input}"},
                    {"type": "image_url", "image_url": {"url": data_url}}
                ]}
            ]
        elif text_input:
            # Text only - simple string
            input_content = f"Text description: {text_input}"
        elif image_data and image_mime_type:
            # Image only - array format
            base64_image = base64.b64encode(image_data).decode('utf-8')
            data_url = f"data:{image_mime_type};base64,{base64_image}"

            input_content = [
                {"role": "user", "content": [
                    {"type": "image_url", "image_url": {"url": data_url}}
                ]}
            ]
        else:
            input_content = "Please analyze the provided information."

        return instructions, input_content

    def _document_from_link(self, url: str, document_type: str) -> DocumentSuggestionSchema | None:
        try:
            logger.info(f"Getting preview metadata for URL {url}")

            """Download a document from AI-provided URL."""
            metadata = self.url_thumbnail_service.extract_metadata(url)

            # Generate backend image endpoint URL
            image_url = None
            if metadata.get('og_image') or metadata.get('favicon'):
                encoded_url = quote(url, safe='')
                image_url = f"/api/parts/attachment-preview/image?url={encoded_url}"

            preview = UrlPreviewResponseSchema(
                title=metadata.get('title'),
                image_url=image_url,
                original_url=url,
                content_type=metadata.get('content_type', None)
            )

            return DocumentSuggestionSchema(
                url=url,
                document_type=document_type,
                preview=preview
            )
        except Exception as e:
            logger.warning(f"Failed to extract metadata for URL {url}: {e}")
            return None

    def _sanitize_filename(self, filename: str) -> str:
        """Sanitize filename for safe storage."""
        import re

        # Remove path components
        filename = filename.split('/')[-1].split('\\')[-1]

        # Remove or replace unsafe characters
        filename = re.sub(r'[<>:"/\\|?*]', '_', filename)

        # Limit length
        if len(filename) > 100:
            name, ext = filename.rsplit('.', 1) if '.' in filename else (filename, '')
            filename = name[:90] + ('.' + ext if ext else '')

        return filename or "document.pdf"

class MountingTypeEnum(str, Enum):
    THROUGH_HOLE = "Through-hole"
    SURFACE_MOUNT = "Surface Mount"
    BREADBOARD_COMPATIBLE = "Breadboard Compatible"
    DIN_RAIL = "DIN Rail"
    PANEL_MOUNT = "Panel Mount"
    PCB_MOUNT = "PCB Mount"


class PartAnalysisSuggestion(BaseModel):
    model_config = ConfigDict(extra="forbid")

    product_name: str | None = Field(...)
    product_series: str | None = Field(...)
    component_type: str | None = Field(...)
    manufacturer: str | None = Field(...)
    manufacturer_code: str | None = Field(...)
    tags: list[str] = Field(...)
    component_packaging_type_acronym: str | None = Field(...)
    component_pin_count: int | None = Field(...)
    voltage_rating: str | None = Field(...)
    mounting_type: MountingTypeEnum | None = Field(...)
    physical_dimensions: str | None = Field(...)
    product_page_url: str | None = Field(...)
    product_image_url: str | None = Field(..., description="URL to a marketing image of the product")
    datasheet_url: str | None = Field(..., description="URL to a PDF document that has the English language data sheet")
    pinout_url: str | None = Field(..., description="URL to a PDF or image document with the pinout of the component")
    schematic_url: str | None = Field(..., description="URL to a PDF document that has the schematic of the component")
    manual_url: str | None = Field(..., description="URL to the manual or usage page of the document")
