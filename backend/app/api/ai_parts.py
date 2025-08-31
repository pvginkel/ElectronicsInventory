"""AI-powered part creation API endpoints."""

import logging

from dependency_injector.wiring import Provide, inject
from flask import Blueprint, jsonify, request
from spectree import Response as SpectreeResponse
from werkzeug.datastructures import FileStorage

from app.schemas.ai_part_analysis import AIPartCreateSchema
from app.schemas.common import ErrorResponseSchema
from app.schemas.part import PartResponseSchema
from app.schemas.task_schema import TaskStartResponse
from app.services.ai_part_analysis_task import AIPartAnalysisTask
from app.services.container import ServiceContainer
from app.services.document_service import DocumentService
from app.services.image_service import ImageService
from app.services.part_service import PartService
from app.utils.error_handling import handle_api_errors
from app.utils.spectree_config import api
from app.utils.temp_file_manager import TempFileManager

logger = logging.getLogger(__name__)

# Note: SpecTree validation skipped for multipart endpoints due to complexity

ai_parts_bp = Blueprint("ai_parts", __name__, url_prefix="/ai-parts")


@ai_parts_bp.route("/analyze", methods=["POST"])
@api.validate(resp=SpectreeResponse(HTTP_201=TaskStartResponse, HTTP_400=ErrorResponseSchema))
@handle_api_errors
@inject
def analyze_part(
    task_service = Provide[ServiceContainer.task_service],
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

    # Lazy-create AI service only after validation to avoid requiring API key for invalid inputs
    from flask import current_app
    container: ServiceContainer = current_app.container
    ai_service = container.ai_service()

    # Create and start the AI analysis task
    task = AIPartAnalysisTask(ai_service=ai_service)

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
    image_service : ImageService = Provide[ServiceContainer.image_service],
    temp_file_manager : TempFileManager = Provide[ServiceContainer.temp_file_manager],
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
        seller=data.seller,
        seller_link=data.seller_link,
        package=data.package,
        pin_count=data.pin_count,
        voltage_rating=data.voltage_rating,
        mounting_type=data.mounting_type,
        series=data.series,
        dimensions=data.dimensions
    )

    # Attach documents from AI suggestions using proper document service methods
    for doc in data.documents:
        try:
            # Create document attachment from URL - this will handle downloading and processing
            document_service.create_url_attachment(
                part_key=part.key,  # Use part key, not ID
                title=doc.description or f"AI suggested {doc.document_type}",
                url=doc.url
            )
            logger.info(f"Successfully attached document from {doc.url} to part {part.key}")
        except Exception as e:
            logger.warning(f"Failed to attach document {doc.url} to part {part.key}: {e}")
            # Continue processing other documents even if one fails

    # Handle suggested image URL if provided
    if data.suggested_image_url:
        try:
            logger.info(f"Processing suggested image for part {part.key} from {data.suggested_image_url}")

            suggested_image = document_service.create_url_attachment(
                part_key=part.key,  # Use part key, not ID
                title="AI suggested image",
                url=data.suggested_image_url
            )
            if suggested_image.attachment_type == "image":
                logger.info(f"Setting suggested image as cover for part {part.key}")
                # Set as cover image if it's the first image attachment
                document_service.set_part_cover_attachment(part.key, suggested_image.id)
        except Exception as e:
            logger.warning(f"Failed to attach suggested image document {data.suggested_image_url} to part {part.key}: {e}")

    return PartResponseSchema.model_validate(part).model_dump(), 201

