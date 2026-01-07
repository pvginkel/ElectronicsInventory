"""AI service for part analysis using OpenAI."""

import json
import logging
import os
from typing import Any, cast
from urllib.parse import quote

from jinja2 import Environment
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.config import Settings
from app.exceptions import InvalidOperationException, RecordNotFoundException
from app.models.attachment import AttachmentType
from app.models.part import Part
from app.models.seller import Seller
from app.models.type import Type
from app.schemas.ai_part_analysis import (
    AIPartAnalysisResultSchema,
    DocumentSuggestionSchema,
    PartAnalysisDetailsSchema,
)
from app.schemas.ai_part_cleanup import CleanedPartDataSchema
from app.schemas.duplicate_search import DuplicateMatchEntry
from app.services.ai_model import PartAnalysisSuggestion
from app.services.base import BaseService
from app.services.base_task import ProgressHandle
from app.services.document_service import DocumentService
from app.services.download_cache_service import DownloadCacheService
from app.services.metrics_service import MetricsServiceProtocol
from app.services.seller_service import SellerService
from app.services.type_service import TypeService
from app.utils.ai.ai_runner import AIFunction, AIRequest, AIRunner
from app.utils.ai.url_classification import (
    ClassifyUrlsEntry,
    ClassifyUrlsRequest,
    ClassifyUrlsResponse,
    URLClassifierFunction,
)
from app.utils.temp_file_manager import TempFileManager

logger = logging.getLogger(__name__)


class AIService(BaseService):
    """Service for AI-powered part analysis using OpenAI."""

    def __init__(
        self,
        db: Session,
        config: Settings,
        temp_file_manager: TempFileManager,
        type_service: TypeService,
        seller_service: SellerService,
        download_cache_service: DownloadCacheService,
        document_service: DocumentService,
        metrics_service: MetricsServiceProtocol,
        duplicate_search_function: AIFunction,
        mouser_part_number_search_function: AIFunction,
        mouser_keyword_search_function: AIFunction,
    ) -> None:
        super().__init__(db)
        self.config = config
        self.temp_file_manager = temp_file_manager
        self.type_service = type_service
        self.seller_service = seller_service
        self.download_cache_service = download_cache_service
        self.document_service = document_service
        self.url_classifier_function = URLClassifierFunctionImpl(download_cache_service, document_service)
        self.duplicate_search_function = duplicate_search_function
        self.real_ai_allowed = config.real_ai_allowed
        self.runner: AIRunner | None = None

        # Mouser function tools - conditionally enabled based on API key
        self.mouser_enabled = bool(config.MOUSER_SEARCH_API_KEY)
        self.mouser_part_number_search_function = mouser_part_number_search_function
        self.mouser_keyword_search_function = mouser_keyword_search_function

        # Initialize OpenAI client only when real AI interactions are permitted
        if self.real_ai_allowed:
            if not config.OPENAI_API_KEY:
                raise ValueError("OPENAI_API_KEY configuration is required for AI features")

            self.runner = AIRunner(config.OPENAI_API_KEY, metrics_service)

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
            # Check for cached response (record-and-replay pattern)
            cache_path = self.config.AI_ANALYSIS_CACHE_PATH
            if cache_path:
                logger.info(f"AI analysis response cache file configured at {cache_path}")

            if cache_path and os.path.exists(cache_path):
                logger.info(f"Loading cached AI analysis response from {cache_path}")
                with open(cache_path) as f:
                    ai_response = PartAnalysisSuggestion.model_validate(json.loads(f.read()))
            else:
                if not self.real_ai_allowed:
                    raise InvalidOperationException(
                        "perform AI analysis",
                        "real AI usage is disabled in testing mode",
                    )

                if not self.runner:
                    raise InvalidOperationException(
                        "perform AI analysis",
                        "the AI runner is not initialized",
                    )

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

                # Build function tools list
                function_tools: list[AIFunction] = [
                    self.url_classifier_function,
                    self.duplicate_search_function,
                ]

                # Conditionally include Mouser search functions if API key configured
                if self.mouser_enabled:
                    function_tools.extend([
                        self.mouser_part_number_search_function,
                        self.mouser_keyword_search_function,
                    ])

                # Pass all available functions to the runner
                response = self.runner.run(
                    request,
                    function_tools,
                    progress_handle,
                    True
                )

                ai_response = cast(PartAnalysisSuggestion, response.response)

                # Save response to cache file if path configured (for future replay)
                if cache_path:
                    logger.info(f"Saving AI analysis response to cache: {cache_path}")
                    os.makedirs(os.path.dirname(cache_path), exist_ok=True)
                    with open(cache_path, "w", encoding="utf-8") as f:
                        f.write(ai_response.model_dump_json(indent=4))

            # Convert LLM response to API schema
            # The LLM can populate:
            # - Only duplicate_parts (high-confidence duplicates, no analysis)
            # - Only analysis_result (no duplicates or search not performed)
            # - Only analysis_failure_reason (query too vague/ambiguous)
            # - Multiple fields (e.g., medium-confidence duplicates with full analysis)

            # Extract failure reason if present
            failure_reason: str | None = ai_response.analysis_failure_reason
            if failure_reason:
                logger.info(
                    f"LLM returned analysis failure reason: {failure_reason[:100]}{'...' if len(failure_reason) > 100 else ''}"
                )

            # Convert duplicate matches if present
            duplicate_entries: list[DuplicateMatchEntry] | None = None
            if ai_response.duplicate_parts is not None:
                logger.info(f"LLM returned {len(ai_response.duplicate_parts)} duplicate matches")
                duplicate_entries = [
                    DuplicateMatchEntry(
                        part_key=match.part_key,
                        confidence=match.confidence,
                        reasoning=match.reasoning
                    )
                    for match in ai_response.duplicate_parts
                ]

            # Convert analysis result if present
            analysis_result_entry: PartAnalysisDetailsSchema | None = None
            if ai_response.analysis_result is not None:
                logger.info("LLM returned full part analysis")
                analysis_details = ai_response.analysis_result

                # Download documents if URLs provided
                documents: list[DocumentSuggestionSchema] = []

                for urls, type in [
                    (analysis_details.product_page_urls, 'product_page'),
                    (analysis_details.datasheet_urls, 'datasheet'),
                    (analysis_details.pinout_urls, 'pinout'),
                ]:
                    for url in urls:
                        document = self._document_from_link(url, type)
                        if document:
                            documents.append(document)

                # Resolve type and seller against existing records
                suggested_type, type_is_existing, existing_type_id = self._resolve_type(
                    analysis_details.product_category, existing_types
                )
                suggested_seller, seller_is_existing, existing_seller_id = self._resolve_seller(
                    analysis_details.seller
                )

                # Build analysis details schema
                product_page: str | None = None
                if len(analysis_details.product_page_urls) > 0:
                    product_page = analysis_details.product_page_urls[0]

                analysis_result_entry = PartAnalysisDetailsSchema(
                    manufacturer_code=analysis_details.manufacturer_part_number,
                    type=suggested_type,
                    description=analysis_details.product_name,
                    tags=analysis_details.tags,
                    manufacturer=analysis_details.manufacturer,
                    product_page=product_page,
                    package=analysis_details.package_type,
                    pin_count=analysis_details.part_pin_count,
                    pin_pitch=analysis_details.part_pin_pitch,
                    voltage_rating=analysis_details.voltage_rating,
                    input_voltage=analysis_details.input_voltage,
                    output_voltage=analysis_details.output_voltage,
                    mounting_type=analysis_details.mounting_type,
                    series=analysis_details.product_family,
                    dimensions=analysis_details.physical_dimensions,
                    documents=documents,
                    seller=suggested_seller,
                    seller_link=analysis_details.seller_url,
                    type_is_existing=type_is_existing,
                    existing_type_id=existing_type_id,
                    seller_is_existing=seller_is_existing,
                    existing_seller_id=existing_seller_id,
                )

            # Return all fields (any combination can be populated based on LLM response)
            return AIPartAnalysisResultSchema(
                analysis_result=analysis_result_entry,
                duplicate_parts=duplicate_entries,
                analysis_failure_reason=failure_reason
            )

        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse OpenAI response as JSON: {e}")
            raise Exception("Invalid response format from AI service") from e

    def cleanup_part(self, part_key: str, progress_handle: ProgressHandle) -> CleanedPartDataSchema:
        """
        Clean up and improve existing part data using AI.

        Args:
            part_key: 4-character part key to clean up
            progress_handle: Interface for sending progress updates

        Returns:
            CleanedPartDataSchema with improved part data

        Raises:
            RecordNotFoundException: If part not found
            InvalidOperationException: If AI disabled
            Exception: If OpenAI API call fails
        """
        # Fetch target part with relationships
        stmt = select(Part).where(Part.key == part_key).options(
            selectinload(Part.type),
            selectinload(Part.seller)
        )
        target_part = self.db.execute(stmt).scalar_one_or_none()

        if not target_part:
            raise RecordNotFoundException("Part", part_key)

        # Fetch all other parts for context (excluding target)
        all_parts_stmt = select(Part).where(Part.key != part_key).options(
            selectinload(Part.type),
            selectinload(Part.seller)
        )
        all_parts = self.db.execute(all_parts_stmt).scalars().all()

        # Check part count limit to prevent OOM
        if len(all_parts) > 10000:
            raise InvalidOperationException(
                "cleanup part",
                f"Too many parts for cleanup context (limit: 10000, current: {len(all_parts)})"
            )

        # Get existing type names for context
        existing_types = self.type_service.get_all_types()
        type_names = [t.name for t in existing_types]

        # Serialize all parts (except target) to JSON context
        def serialize_part(part: Part) -> dict[str, Any]:
            return {
                "key": part.key,
                "manufacturer_code": part.manufacturer_code,
                "type": part.type.name if part.type else None,
                "description": part.description,
                "manufacturer": part.manufacturer,
                "tags": part.tags or [],
                "package": part.package,
                "pin_count": part.pin_count,
                "pin_pitch": part.pin_pitch,
                "voltage_rating": part.voltage_rating,
                "input_voltage": part.input_voltage,
                "output_voltage": part.output_voltage,
                "mounting_type": part.mounting_type,
                "series": part.series,
                "dimensions": part.dimensions,
                "product_page": part.product_page,
                "seller": part.seller.name if part.seller else None,
                "seller_link": part.seller_link
            }

        context_parts = [serialize_part(p) for p in all_parts]
        target_part_json = serialize_part(target_part)

        # Build cleanup prompt
        user_prompt = f"""Clean up this part:

Target Part:
{json.dumps(target_part_json, indent=2)}

All Other Parts (for consistency reference):
{json.dumps(context_parts, indent=2)}

Review the target part against the field normalization rules and improve data quality. Return the complete cleaned part data in analysis_result."""

        try:
            # Check for cached response (record-and-replay pattern)
            cache_path = self.config.AI_CLEANUP_CACHE_PATH
            if cache_path:
                logger.info(f"AI cleanup response cache file configured at {cache_path}")

            if cache_path and os.path.exists(cache_path):
                logger.info(f"Loading cached AI cleanup response from {cache_path}")
                with open(cache_path) as f:
                    ai_response = PartAnalysisSuggestion.model_validate(json.loads(f.read()))
            else:
                if not self.real_ai_allowed:
                    raise InvalidOperationException(
                        "perform AI cleanup",
                        "real AI usage is disabled in testing mode",
                    )

                if not self.runner:
                    raise InvalidOperationException(
                        "perform AI cleanup",
                        "the AI runner is not initialized",
                    )

                # Build system prompt with mode="cleanup"
                system_prompt = self._build_prompt(type_names, mode="cleanup")

                request = AIRequest(
                    system_prompt=system_prompt,
                    user_prompt=user_prompt,
                    model=self.config.OPENAI_MODEL,
                    verbosity=self.config.OPENAI_VERBOSITY,
                    reasoning_effort=self.config.OPENAI_REASONING_EFFORT,
                    reasoning_summary="auto",
                    response_model=PartAnalysisSuggestion,
                )

                # Pass only url_classifier_function (exclude duplicate_search_function for cleanup)
                response = self.runner.run(
                    request,
                    [self.url_classifier_function],
                    progress_handle,
                    True
                )

                ai_response = cast(PartAnalysisSuggestion, response.response)

                # Save response to cache file if path configured (for future replay)
                if cache_path:
                    logger.info(f"Saving AI cleanup response to cache: {cache_path}")
                    os.makedirs(os.path.dirname(cache_path), exist_ok=True)
                    with open(cache_path, "w", encoding="utf-8") as f:
                        f.write(ai_response.model_dump_json(indent=4))

            # Extract analysis result (cleanup mode always populates this)
            if not ai_response.analysis_result:
                raise Exception("AI cleanup returned no analysis_result")

            analysis_details = ai_response.analysis_result

            # Resolve type against existing types
            suggested_type, type_is_existing, existing_type_id = self._resolve_type(
                analysis_details.product_category, existing_types
            )

            # For cleanup, preserve existing seller from original part data
            suggested_seller = target_part_json.get("seller")
            seller_link = target_part_json.get("seller_link")
            _, seller_is_existing, existing_seller_id = self._resolve_seller(suggested_seller)

            # Map to CleanedPartDataSchema
            cleaned_part = CleanedPartDataSchema(
                key=part_key,
                manufacturer_code=analysis_details.manufacturer_part_number,
                type=suggested_type,
                description=analysis_details.product_name,
                manufacturer=analysis_details.manufacturer,
                tags=analysis_details.tags or [],
                package=analysis_details.package_type,
                pin_count=analysis_details.part_pin_count,
                pin_pitch=analysis_details.part_pin_pitch,
                voltage_rating=analysis_details.voltage_rating,
                input_voltage=analysis_details.input_voltage,
                output_voltage=analysis_details.output_voltage,
                mounting_type=analysis_details.mounting_type,
                series=analysis_details.product_family,
                dimensions=analysis_details.physical_dimensions,
                product_page=analysis_details.product_page_urls[0] if analysis_details.product_page_urls else None,
                seller=suggested_seller,
                seller_link=seller_link,
                type_is_existing=type_is_existing,
                existing_type_id=existing_type_id,
                seller_is_existing=seller_is_existing,
                existing_seller_id=existing_seller_id,
            )

            return cleaned_part

        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse OpenAI cleanup response as JSON: {e}")
            raise Exception("Invalid response format from AI cleanup service") from e

    def _build_prompt(self, categories: list[str], mode: str = "analysis") -> str:
        context = {
            "categories": categories,
            "mouser_api_available": self.mouser_enabled,
            "mode": mode
        }

        prompt_path = os.path.join(
            os.path.dirname(__file__), "prompts", "part_analysis.md"
        )
        with open(prompt_path) as f:
            template_str = f.read()

        env_inline = Environment()
        template_inline = env_inline.from_string(template_str)

        return template_inline.render(**context)

    def _resolve_type(
        self, suggested_type: str | None, existing_types: list[Type]
    ) -> tuple[str | None, bool, int | None]:
        """
        Resolve a suggested type name against existing types.

        Strips "Proposed:" prefix and performs case-insensitive matching.

        Returns:
            Tuple of (resolved_name, is_existing, existing_id)
        """
        if not suggested_type:
            return None, False, None

        # Strip "Proposed:" prefix if present
        proposed_prefix = "Proposed:"
        if suggested_type.startswith(proposed_prefix):
            suggested_type = suggested_type[len(proposed_prefix):].strip()

        # Try case-insensitive match
        for type_obj in existing_types:
            if type_obj.name.lower() == suggested_type.lower():
                return suggested_type, True, type_obj.id

        return suggested_type, False, None

    def _resolve_seller(self, suggested_seller: str | None) -> tuple[str | None, bool, int | None]:
        """
        Resolve a suggested seller name against existing sellers.

        Tries exact match first (case-insensitive), then partial match
        if there's exactly one result.

        Returns:
            Tuple of (seller_name, is_existing, existing_id)
        """
        if not suggested_seller:
            return None, False, None

        existing_sellers = self.seller_service.get_all_sellers()
        suggested_lower = suggested_seller.lower()

        # Try exact match first (case-insensitive)
        for seller_obj in existing_sellers:
            if seller_obj.name.lower() == suggested_lower:
                return suggested_seller, True, seller_obj.id

        # Try partial match - only use if exactly one match
        partial_matches: list[Seller] = []
        for seller_obj in existing_sellers:
            seller_name_lower = seller_obj.name.lower()
            if suggested_lower in seller_name_lower or seller_name_lower in suggested_lower:
                partial_matches.append(seller_obj)

        if len(partial_matches) == 1:
            return suggested_seller, True, partial_matches[0].id

        return suggested_seller, False, None

    def _document_from_link(self, url: str, document_type: str) -> DocumentSuggestionSchema | None:
        try:
            logger.info(f"Getting preview metadata for URL {url}")

            upload_doc = self.document_service.process_upload_url(url)

            # Generate backend image endpoint URL for potential preview
            encoded_url = quote(url, safe='')
            image_url = None
            original_url = url

            # Determine content type string and URLs based on detected type
            from app.models.attachment import AttachmentType
            if upload_doc.detected_type == AttachmentType.PDF:
                content_type_str = "pdf"
                original_url = f"/api/parts/attachment-proxy/content?url={encoded_url}"
            elif upload_doc.detected_type == AttachmentType.IMAGE:
                content_type_str = "image"
                image_url = f"/api/parts/attachment-preview/image?url={encoded_url}"
                original_url = f"/api/parts/attachment-proxy/content?url={encoded_url}"
            elif upload_doc.detected_type == AttachmentType.URL:
                content_type_str = "webpage"
                if upload_doc.preview_image:
                    image_url = f"/api/parts/attachment-preview/image?url={encoded_url}"
            else:
                content_type_str = "other"

            # Use extracted title or document type as fallback
            title = upload_doc.title or document_type.title()

            # Create preview
            from app.schemas.url_preview import UrlPreviewResponseSchema
            preview = UrlPreviewResponseSchema(
                title=title,
                image_url=image_url,
                original_url=original_url,
                content_type=content_type_str
            )

            return DocumentSuggestionSchema(
                url=url,
                document_type=document_type,
                preview=preview
            )
        except Exception as e:
            logger.warning(f"Failed to create document suggestion for URL {url}: {e}")
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

class URLClassifierFunctionImpl(URLClassifierFunction):
    def __init__(self, download_cache_service: DownloadCacheService, document_service: DocumentService):
        self.download_cache_service = download_cache_service
        self.document_service = document_service

    def classify_url(self, request: ClassifyUrlsRequest, progress_handle: ProgressHandle) -> ClassifyUrlsResponse:
        progress_handle.send_progress_text("Classifying URLs")

        classified_urls: list[ClassifyUrlsEntry] = []

        for url in request.urls:
            classification = "invalid"

            try:
                doc_info = self.document_service.process_upload_url(url)
                if doc_info.detected_type:
                    # Map AttachmentType to classification strings
                    if doc_info.detected_type == AttachmentType.PDF:
                        classification = "pdf"
                    elif doc_info.detected_type == AttachmentType.IMAGE:
                        classification = "image"
                    elif doc_info.detected_type == AttachmentType.URL:
                        classification = "webpage"
            except Exception as e:
                logger.warning(f"Error while classifying URL {url}: {e}")

            classified_urls.append(ClassifyUrlsEntry(
                url=url,
                classification=classification
            ))

        return ClassifyUrlsResponse(urls=classified_urls)
