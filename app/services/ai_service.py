"""AI service for part analysis using OpenAI."""

import json
import logging
import os
from typing import TYPE_CHECKING, cast
from urllib.parse import quote

from jinja2 import Environment

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
from app.utils.ai.ai_runner import AIRequest, AIRunner
from app.utils.ai.url_classification import ClassifyUrlsEntry, ClassifyUrlsRequest, ClassifyUrlsResponse, URLClassifierFunction
from app.utils.temp_file_manager import TempFileManager

if TYPE_CHECKING:
    from app.services.type_service import TypeService

logger = logging.getLogger(__name__)


class AIService(BaseService):
    """Service for AI-powered part analysis using OpenAI."""

    def __init__(self, db, config: Settings, temp_file_manager: TempFileManager, type_service: 'TypeService', download_cache_service: DownloadCacheService):
        super().__init__(db)
        self.config = config
        self.temp_file_manager = temp_file_manager
        self.type_service = type_service
        self.download_cache_service = download_cache_service
        self.url_classifier_function = URLClassifierFunctionImpl(download_cache_service)

        # Initialize OpenAI client
        if not config.OPENAI_API_KEY:
            raise ValueError("OPENAI_API_KEY configuration is required for AI features")

        self.runner = AIRunner(config.OPENAI_API_KEY)

    def analyze_part(self, user_prompt: str | None, image_data: bytes | None,
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
        if not user_prompt:
            raise NotImplementedError("Image input is not yet implemented; user_prompt is required")

        # Get existing type names for context
        existing_types = self.type_service.get_all_types()
        type_names = [t.name for t in existing_types]

        try:
            if self.config.OPENAI_DUMMY_RESPONSE_PATH:
                with open(self.config.OPENAI_DUMMY_RESPONSE_PATH) as f:
                    ai_response = PartAnalysisSuggestion.model_validate(json.loads(f.read()))
            else:
                # Build input and instructions for Responses API
                system_prompt = self._build_prompt(type_names)

                request = AIRequest(
                    system_prompt=system_prompt,
                    user_prompt=user_prompt,
                    model=self.config.OPENAI_MODEL,
                    verbosity=self.config.OPENAI_VERBOSITY,
                    reasoning_effort=self.config.OPENAI_REASONING_EFFORT,
                    reasoning_summary="auto",
                    response_model=PartAnalysisSuggestion,
                )

                response = self.runner.run(request, [self.url_classifier_function], progress_handle, True)

                ai_response = cast(PartAnalysisSuggestion, response.response)

            # Download documents if URLs provided
            documents : list[DocumentSuggestionSchema] = []

            for urls, type in [
                (ai_response.product_page_urls, 'product_page'),
                (ai_response.datasheet_urls, 'datasheet'),
                (ai_response.pinout_urls, 'pinout'),
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
                pin_count=ai_response.part_pin_count,
                pin_pitch=ai_response.part_pin_pitch,
                voltage_rating=ai_response.voltage_rating,
                input_voltage=ai_response.input_voltage,
                output_voltage=ai_response.output_voltage,
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

    def _document_from_link(self, url: str, document_type: str) -> DocumentSuggestionSchema | None:
        try:
            logger.info(f"Getting preview metadata for URL {url}")

            """Download a document from AI-provided URL."""
            metadata = self.url_thumbnail_service.extract_metadata(url)

            # Generate backend image endpoint URL
            image_url = None
            if metadata.og_image or metadata.favicon:
                encoded_url = quote(url, safe='')
                image_url = f"/api/parts/attachment-preview/image?url={encoded_url}"

            # For PDFs and images, set original_url to proxy endpoint for iframe display
            original_url = url  # Keep actual URL for document saving
            if metadata.is_pdf or metadata.is_image:
                encoded_url = quote(url, safe='')
                original_url = f"/api/parts/attachment-proxy/content?url={encoded_url}"

            preview = UrlPreviewResponseSchema(
                title=metadata.title,
                image_url=image_url,
                original_url=original_url,
                content_type=metadata.content_type.value
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

    def _calculate_cost(self, input_tokens: int, cached_input_tokens: int, output_tokens: int, reasoning_tokens: int) -> float | None:
        match self.config.OPENAI_MODEL:
            case "gpt-5":
                input_tokens_pm = 1.25
                cached_input_pm = 0.125
                output_pm = 10
            case "gpt-5-mini":
                input_tokens_pm = 0.25
                cached_input_pm = 0.025
                output_pm = 2
            case "gpt-5-nano":
                input_tokens_pm = 0.05
                cached_input_pm = 0.005
                output_pm = 0.4
            case _:
                return None

        return (
            cached_input_tokens * (cached_input_pm / 1_000_000) +
            (input_tokens - cached_input_tokens) * (input_tokens_pm / 1_000_000) +
            output_tokens * (output_pm / 1_000_000)
        )

class URLClassifierFunctionImpl(URLClassifierFunction):
    def __init__(self, download_cache_service: DownloadCacheService):
        self.download_cache_service = download_cache_service

    def classify_url(self, request: ClassifyUrlsRequest, progress_handle: ProgressHandle) -> ClassifyUrlsResponse:
        progress_handle.send_progress_text("Classifying URLs")
        
        classified_urls: list[ClassifyUrlsEntry] = []

        for url in request.urls:
            try:
                # Download and detect content type
                content = self.download_cache_service.get_cached_content(url)
                if not content:
                    classification = "invalid"
                else:
                    import magic
                    content_type = magic.from_buffer(content, mime=True)
                    
                    # Map content types to classifications
                    if content_type == 'application/pdf':
                        classification = "pdf"
                    elif content_type.startswith('image/'):
                        classification = "image"
                    elif content_type == 'text/html':
                        classification = "webpage"
                    else:
                        classification = "invalid"

                classified_urls.append(ClassifyUrlsEntry(
                    url=url,
                    classification=classification
                ))

            except Exception as e:
                logger.warning(f"Error while classifying URL {url}: {e}")
                
                classified_urls.append(ClassifyUrlsEntry(
                    url=url,
                    classification="invalid"
                ))

        return ClassifyUrlsResponse(urls=classified_urls)