"""AI-powered part creation API endpoints."""

import logging

from dependency_injector.wiring import Provide, inject
from flask import Blueprint, jsonify, request
from spectree import Response as SpectreeResponse
from werkzeug.datastructures import FileStorage

from app.models.part_attachment import PartAttachment
from app.schemas.ai_part_analysis import (
    AIPartAnalysisTaskResultSchema,
    AIPartCreateSchema,
)
from app.schemas.common import ErrorResponseSchema
from app.schemas.part import PartResponseSchema
from app.schemas.task_schema import TaskStartResponse
from app.services.ai_part_analysis_task import AIPartAnalysisTask
from app.services.container import ServiceContainer
from app.services.document_service import DocumentService
from app.services.part_service import PartService
from app.services.task_service import TaskService
from app.utils.error_handling import handle_api_errors
from app.utils.spectree_config import api

logger = logging.getLogger(__name__)

# Note: SpecTree validation skipped for multipart endpoints due to complexity

ai_parts_bp = Blueprint("ai_parts", __name__, url_prefix="/ai-parts")


@ai_parts_bp.route("/analyze", methods=["POST"])
@api.validate(resp=SpectreeResponse(HTTP_201=TaskStartResponse, HTTP_400=ErrorResponseSchema))
@handle_api_errors
@inject
def analyze_part(
    task_service : TaskService = Provide[ServiceContainer.task_service],
    container : ServiceContainer = Provide[ServiceContainer],
):
    """
    Start AI analysis task for part creation.

    Accepts multipart/form-data with optional text and image inputs:
    - text: Optional text description of the part
    - image: Optional image file (JPEG, PNG, WebP)

    Returns task ID and stream URL for monitoring progress via SSE.
    """
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
@handle_api_errors
@inject
def create_part_from_ai_analysis(
    part_service : PartService = Provide[ServiceContainer.part_service],
    document_service : DocumentService = Provide[ServiceContainer.document_service],
):
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
        seller=data.seller,
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

    cover_image : PartAttachment | None = None

    # Attach documents from AI suggestions using proper document service methods
    for doc in data.documents:
        # Resolve document title using the following priority:
        # 1. Use doc.preview.title if available
        # 2. Extract filename from URL path
        # 3. Fallback to "AI suggested {doc.document_type}"
        title = None
        if doc.preview and doc.preview.title:
            title = doc.preview.title
        else:
            # Try to extract filename from URL path
            try:
                import os
                from urllib.parse import urlparse
                parsed_url = urlparse(doc.url)
                filename = os.path.basename(parsed_url.path)
                if filename and filename != '/':
                    title = filename
            except Exception:
                pass  # Ignore URL parsing errors, will use fallback

        # Use fallback if no title was resolved
        if not title:
            title = f"AI suggested {doc.document_type}"

        # Create document attachment from URL - this will handle downloading and processing
        attachment = document_service.create_url_attachment(
            part_key=part.key,  # Use part key, not ID
            title=title,
            url=doc.url
        )
        logger.info(f"Successfully attached document from {doc.url} to part {part.key}")

        if not cover_image and doc.is_cover_image and attachment.attachment_type == "image":
            cover_image = attachment

    if cover_image:
        logger.info(f"Setting suggested image as cover for part {part.key}")
        # Set as cover image if it's the first image attachment
        document_service.set_part_cover_attachment(part.key, cover_image.id)

    return PartResponseSchema.model_validate(part).model_dump(), 201


@ai_parts_bp.route("/analyze/<task_id>/result", methods=["GET"])
@api.validate(resp=SpectreeResponse(HTTP_200=AIPartAnalysisTaskResultSchema, HTTP_404=ErrorResponseSchema))
@handle_api_errors
@inject
def get_analysis_result(
    task_id: str,
    task_service = Provide[ServiceContainer.task_service],
):
    """
    Get the result of a completed AI part analysis task.

    This endpoint provides access to the structured analysis result data
    with proper OpenAPI schema documentation. While the same data is available
    via SSE during task execution, this endpoint ensures the result schema
    is included in the API documentation for client code generation.

    Args:
        task_id: The UUID of the completed analysis task

    Returns:
        AIPartAnalysisTaskResultSchema: The structured analysis result

    Raises:
        404: If task is not found or not completed
    """
    # Get task status
    task_info = task_service.get_task_status(task_id)
    if not task_info:
        return jsonify({
            'error': 'Task not found',
            'details': {'message': f'No task found with ID: {task_id}', 'field': 'task_id'}
        }), 404

    # Check if task is completed
    if task_info.status != 'completed':
        return jsonify({
            'error': f'Task not completed (status: {task_info.status})',
            'details': {'message': 'Task must be completed to retrieve results', 'field': 'status'}
        }), 404

    # Check if task has result data
    if not task_info.result:
        return jsonify({
            'error': 'No result data available',
            'details': {'message': 'Task completed but no result data found', 'field': 'result'}
        }), 404

    # Validate and return the result as properly typed schema
    try:
        result = AIPartAnalysisTaskResultSchema.model_validate(task_info.result)
        return result.model_dump(), 200
    except Exception as e:
        logger.error(f"Failed to validate task result for task {task_id}: {e}")
        return jsonify({
            'error': 'Invalid result data format',
            'details': {'message': f'Task result validation failed: {str(e)}', 'field': 'result'}
        }), 404

