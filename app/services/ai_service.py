"""AI service for part analysis using OpenAI."""

import base64
import json
import logging
import time
import os

from typing import TYPE_CHECKING, cast
from urllib.parse import quote
from jinja2 import Environment

from openai import OpenAI
from openai.types.responses import ResponseOutputItemDoneEvent, ResponseFunctionWebSearch, ResponseCompletedEvent, ParsedResponseOutputMessage, ParsedResponseOutputText, ResponseOutputMessage,  ResponseOutputText, ResponseContentPartAddedEvent
from openai.types.responses.response_function_web_search import ActionSearch

from app.config import Settings
from app.schemas.ai_part_analysis import (
    AIPartAnalysisResultSchema,
    DocumentSuggestionSchema,
)
from app.schemas.url_preview import UrlPreviewResponseSchema
from app.services.ai_model import PartAnalysisSuggestion
from app.services.base import BaseService
from app.services.base_task import ProgressHandle
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

    def analyze_part(self, text_input: str | None, image_data: bytes | None,
                     image_mime_type: str | None, progress_handle: ProgressHandle) -> AIPartAnalysisResultSchema:
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
                prompt = self._build_prompt(type_names)
                input_content = self._build_responses_api_input(
                    text_input, image_data, image_mime_type, prompt
                )

                logger.info("Starting OpenAI call")

                start = time.perf_counter()
                status = None
                ai_response = None
                output_text = None
                incomplete_details = None

                # Call OpenAI Responses API with structured output
                with self.client.responses.stream(
                    model=self.config.OPENAI_MODEL,
                    input=input_content,
                    text_format=PartAnalysisSuggestion,
                    text={ "verbosity": self.config.OPENAI_VERBOSITY }, # type: ignore
                    max_output_tokens=self.config.OPENAI_MAX_OUTPUT_TOKENS,
                    store=self.config.OPENAI_STORE_REQUESTS,
                    tools=[
                        { "type": "web_search" },
                    ],
                    # tool_choice="required",
                    reasoning = {
                        "effort": self.config.OPENAI_REASONING_EFFORT # type: ignore
                    },
                ) as stream:
                    logger.info("Streaming events")

                    for event in stream:
                        if isinstance(event, ResponseOutputItemDoneEvent):
                            if isinstance(event.item, ResponseFunctionWebSearch):
                                if isinstance(event.item.action, ActionSearch):
                                    if event.item.action.query:
                                        progress_handle.send_progress(f"Searched for {event.item.action.query}", 0.2)
                            if isinstance(event.item, ResponseOutputMessage):
                                for content in event.item.content:
                                    if isinstance(content, ResponseOutputText):
                                        output_text = content.text
                        if isinstance(event, ResponseContentPartAddedEvent):
                            progress_handle.send_progress("Writing response...", 0.5)
                        if isinstance(event, ResponseCompletedEvent):
                            incomplete_details = event.response.incomplete_details

                            for output in event.response.output:
                                if isinstance(output, ParsedResponseOutputMessage):
                                    status = output.status
                                    for content in output.content:
                                        if isinstance(content, ParsedResponseOutputText):
                                            ai_response = cast(PartAnalysisSuggestion, content.parsed)

                        # logger.info(event)
                        # logger.info(event.model_dump_json())

                logger.info(f"OpenAI response status: {status}, duration {time.perf_counter() - start}, incomplete details: {incomplete_details}")
                logger.info(f"Output text: {output_text}")

                if not ai_response:
                    raise Exception(f"Empty response from OpenAI status {status}, incomplete details: {incomplete_details}")

            # Create temporary directory for document downloads
            temp_dir = self.temp_file_manager.create_temp_directory()

            # Download documents if URLs provided
            documents : list[DocumentSuggestionSchema] = []

            for urls, type in [
                (ai_response.product_page_urls, 'product_page'),
                (ai_response.product_image_urls, 'product_image'),
                (ai_response.datasheet_urls, 'datasheet'),
                (ai_response.pinout_urls, 'pinout'),
                (ai_response.schematic_urls, 'schematic'),
                (ai_response.manual_urls, 'manual'),
            ]:
                for url in urls:
                    document = self._document_from_link(url, type)
                    if document:
                        documents.append(document)

            # Determine if type is existing or new
            suggested_type = ai_response.product_category
            type_is_existing = False
            existing_type_id = None

            if suggested_type:
                proposed_prefix = "Proposed:"
                if suggested_type.startswith(proposed_prefix):
                    suggested_type = suggested_type[len(proposed_prefix):].strip()

                for type_obj in existing_types:
                    if type_obj.name.lower() == suggested_type.lower():
                        type_is_existing = True
                        existing_type_id = type_obj.id
                        break

            # Build result schema

            voltage_rating_list : list[str] = []
            if ai_response.voltage_rating:
                voltage_rating_list.append(ai_response.voltage_rating)
            if ai_response.input_voltage:
                voltage_rating_list.append(f"Input: {ai_response.input_voltage}")
            if ai_response.output_voltage:
                voltage_rating_list.append(f"Output: {ai_response.output_voltage}")
            voltage_rating = ", ".join(voltage_rating_list)

            product_page : str | None = None
            if len(ai_response.product_page_urls) > 0:
                product_page = ai_response.product_page_urls[0]

            result = AIPartAnalysisResultSchema(
                manufacturer_code=ai_response.manufacturer_part_number,
                type=suggested_type,
                description=ai_response.product_name,
                tags=ai_response.tags,
                manufacturer=ai_response.manufacturer,
                product_page=product_page,
                package=ai_response.package_type,
                pin_count=ai_response.component_pin_count,
                voltage_rating=voltage_rating,
                mounting_type=ai_response.mounting_type,
                series=ai_response.product_family,
                dimensions=ai_response.physical_dimensions,
                documents=documents,
                type_is_existing=type_is_existing,
                existing_type_id=existing_type_id
            )

            return result

        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse OpenAI response as JSON: {e}")
            raise Exception("Invalid response format from AI service") from e

    def _build_prompt(self, categories: list[str]) -> str:
        context = {
            "categories": categories
        }

        with open(os.path.join(os.path.dirname(__file__), "prompt.md")) as f:
            template_str = f.read()

        env_inline = Environment()
        template_inline = env_inline.from_string(template_str)

        return template_inline.render(**context)

    def _build_responses_api_input(self, text_input: str | None, image_data: bytes | None,
                                   image_mime_type: str | None, prompt: str) -> list:
        """Build instructions and input for OpenAI Responses API."""

        if image_data and image_mime_type:
            raise Exception("Image data currently not supported")

        return [
            {
                "role": "developer",
                "content": [
                    {"type": "input_text", "text": prompt}
                ]
            },
            {
                "role": "user",
                "content": [
                    {"type": "input_text", "text": text_input},
                    # Add an image later, e.g. {"type": "image_url", "image_url": {"url": "https://..."}}
                ]
            }
        ]

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
