"""AI-powered part creation API endpoints."""

import logging
import uuid
from typing import Any

from dependency_injector.wiring import Provide, inject
from flask import Blueprint, jsonify, request
from spectree import Response as SpectreeResponse
from werkzeug.datastructures import FileStorage

from app.config import Settings
from app.exceptions import InvalidOperationException, RecordNotFoundException
from app.models.attachment import Attachment
from app.schemas.ai_part_analysis import AIPartCreateSchema
from app.schemas.ai_part_cleanup import CleanupPartRequestSchema
from app.schemas.common import ErrorResponseSchema
from app.schemas.part import PartResponseSchema
from app.schemas.task_schema import TaskStartResponse, TaskStatus
from app.services.ai_part_analysis_task import AIPartAnalysisTask
from app.services.ai_part_cleanup_task import AIPartCleanupTask
from app.services.container import ServiceContainer
from app.services.document_service import DocumentService
from app.services.part_service import PartService
from app.services.task_service import TaskService
from app.utils.flask_error_handlers import build_error_response
from app.utils.spectree_config import api
from app.utils.url_utils import get_filename_from_url

logger = logging.getLogger(__name__)

# Note: SpecTree validation skipped for multipart endpoints due to complexity

ai_parts_bp = Blueprint("ai_parts", __name__, url_prefix="/ai-parts")


@ai_parts_bp.route("/analyze", methods=["POST"])
@api.validate(resp=SpectreeResponse(HTTP_201=TaskStartResponse, HTTP_400=ErrorResponseSchema))
@inject
def analyze_part(
    task_service: TaskService = Provide[ServiceContainer.task_service],
    container: ServiceContainer = Provide[ServiceContainer],
    settings: Settings = Provide[ServiceContainer.config],
) -> Any:
    """
    Start AI analysis task for part creation.

    Accepts multipart/form-data with optional text and image inputs:
    - text: Optional text description of the part
    - image: Optional image file (JPEG, PNG, WebP)

    Returns task ID and stream URL for monitoring progress via SSE.
    """
    # Testing mode short-circuit: return dummy task ID without validation
    if settings.is_testing:
        task_id = str(uuid.uuid4())
        logger.info(f"AI testing mode: /ai-parts/analyze returning dummy task_id {task_id}")
        return TaskStartResponse(task_id=task_id, status=TaskStatus.PENDING).model_dump(), 201

    content_type = request.content_type

    if not content_type or not content_type.startswith('multipart/form-data'):
        return jsonify({
            'error': 'Content-Type must be multipart/form-data',
            'details': {'message': 'Request must use multipart/form-data content type', 'field': 'Content-Type'}
        }), 400

    # Extract text input
    text_input = request.form.get('text')

    # Extract image file
    image_data = None
    image_mime_type = None

    if 'image' in request.files:
        image_file: FileStorage = request.files['image']
        if image_file and image_file.filename:
            # Validate file type
            allowed_mime_types = [
                'image/jpeg', 'image/jpg', 'image/png',
                'image/webp', 'image/gif'
            ]

            file_mime_type = image_file.content_type or ''
            if file_mime_type not in allowed_mime_types:
                return jsonify({
                    'error': f'Unsupported image type: {file_mime_type}. '
                            f'Supported types: {", ".join(allowed_mime_types)}',
                    'details': {'message': f'Unsupported MIME type: {file_mime_type}', 'field': 'image'}
                }), 400

            # Read image data
            image_data = image_file.stream.read()
            image_mime_type = file_mime_type

            # Reset file stream position for potential future use
            image_file.stream.seek(0)

    # Validate that at least one input is provided
    if not text_input and not image_data:
        return jsonify({
            'error': 'At least one of text or image input must be provided',
            'details': {'message': 'Either text field or image file must be provided', 'field': None}
        }), 400

    # Short-circuit when real AI usage is disabled and no cache response is available
    if not settings.real_ai_allowed and not settings.ai_analysis_cache_path:
        exception = InvalidOperationException(
            "perform AI analysis",
            "real AI usage is disabled in testing mode",
        )
        return build_error_response(
            exception.message,
            {"message": "The requested operation cannot be performed"},
            code=exception.error_code,
            status_code=400,
        )

    # Create and start the AI analysis task
    task = AIPartAnalysisTask(container=container)

    task_start_response = task_service.start_task(
        task=task,
        text_input=text_input,
        image_data=image_data,
        image_mime_type=image_mime_type
    )

    return task_start_response.model_dump(), 201


@ai_parts_bp.route("/create", methods=["POST"])
@api.validate(json=AIPartCreateSchema, resp=SpectreeResponse(HTTP_201=PartResponseSchema, HTTP_400=ErrorResponseSchema))
@inject
def create_part_from_ai_analysis(
    part_service: PartService = Provide[ServiceContainer.part_service],
    document_service: DocumentService = Provide[ServiceContainer.document_service],
) -> Any:
    """
    Create a new part from AI analysis suggestions.

    Accepts AI analysis results and creates a part with attached documents
    and suggested image from temporary storage.
    """

    data = AIPartCreateSchema.model_validate(request.get_json())

    # Create the part with extended fields
    part = part_service.create_part(
        manufacturer_code=data.manufacturer_code,
        type_id=data.type_id,
        description=data.description,
        tags=data.tags,
        manufacturer=data.manufacturer,
        product_page=data.product_page,
        seller_id=data.seller_id,
        seller_link=data.seller_link,
        package=data.package,
        pin_count=data.pin_count,
        pin_pitch=data.pin_pitch,
        voltage_rating=data.voltage_rating,
        input_voltage=data.input_voltage,
        output_voltage=data.output_voltage,
        mounting_type=data.mounting_type,
        series=data.series,
        dimensions=data.dimensions
    )

    cover_image: Attachment | None = None

    # Attach documents from AI suggestions using proper document service methods
    for doc in data.documents:
        # Resolve document title using the following priority:
        # 1. Use doc.preview.title if available
        # 2. Extract filename from URL path
        # 3. Fallback to "AI suggested {doc.document_type}"
        if doc.preview and doc.preview.title:
            title = doc.preview.title
        else:
            title = get_filename_from_url(doc.url, doc.document_type)

        # Create document attachment from URL - this will handle downloading and processing
        attachment = document_service.create_url_attachment(
            attachment_set_id=part.attachment_set_id,
            title=title,
            url=doc.url
        )
        logger.info(f"Successfully attached document from {doc.url} to part {part.key}")

        if not cover_image and doc.is_cover_image:
            cover_image = attachment

    if cover_image:
        logger.info(f"Setting suggested image as cover for part {part.key}")
        # Set as cover image if it's the first image attachment
        document_service.set_part_cover_attachment(part.key, cover_image.id)

    return PartResponseSchema.model_validate(part).model_dump(), 201


@ai_parts_bp.route("/cleanup", methods=["POST"])
@api.validate(
    json=CleanupPartRequestSchema,
    resp=SpectreeResponse(HTTP_201=TaskStartResponse, HTTP_400=ErrorResponseSchema),
)
@inject
def cleanup_part(
    task_service: TaskService = Provide[ServiceContainer.task_service],
    container: ServiceContainer = Provide[ServiceContainer],
    settings: Settings = Provide[ServiceContainer.config],
    part_service: PartService = Provide[ServiceContainer.part_service],
) -> Any:
    """
    Start AI cleanup task for an existing part.

    Accepts JSON with part_key and returns task ID and stream URL for
    monitoring progress via SSE.
    """
    # Testing mode short-circuit: return dummy task ID without validation
    if settings.is_testing:
        task_id = str(uuid.uuid4())
        logger.info(f"AI testing mode: /ai-parts/cleanup returning dummy task_id {task_id}")
        return TaskStartResponse(task_id=task_id, status=TaskStatus.PENDING).model_dump(), 201

    data = CleanupPartRequestSchema.model_validate(request.get_json())

    # Validate part exists
    try:
        part_service.get_part(data.part_key)
    except RecordNotFoundException:
        return jsonify(
            {
                "error": f"Part with key {data.part_key} not found",
                "details": {
                    "message": f"No part found with key: {data.part_key}",
                    "field": "part_key",
                },
            }
        ), 400

    # Short-circuit when real AI usage is disabled and no cache response is available
    if not settings.real_ai_allowed and not settings.ai_cleanup_cache_path:
        exception = InvalidOperationException(
            "perform AI cleanup",
            "real AI usage is disabled in testing mode",
        )
        return build_error_response(
            exception.message,
            {"message": "The requested operation cannot be performed"},
            code=exception.error_code,
            status_code=400,
        )

    # Create and start the AI cleanup task
    task = AIPartCleanupTask(container=container)

    task_start_response = task_service.start_task(task=task, part_key=data.part_key)

    return task_start_response.model_dump(), 201
