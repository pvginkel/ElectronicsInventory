"""AI-powered part creation API endpoints."""

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
from app.utils.error_handling import handle_api_errors
from app.utils.spectree_config import api

# Note: SpecTree validation skipped for multipart endpoints due to complexity

ai_parts_bp = Blueprint("ai_parts", __name__, url_prefix="/ai-parts")


@ai_parts_bp.route("/analyze", methods=["POST"])
@api.validate(resp=SpectreeResponse(HTTP_201=TaskStartResponse, HTTP_400=ErrorResponseSchema))
@handle_api_errors
@inject
def analyze_part(
    task_service=Provide[ServiceContainer.task_service],
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
            'error': 'Content-Type must be multipart/form-data'
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
                            f'Supported types: {", ".join(allowed_mime_types)}'
                }), 400

            # Read image data
            image_data = image_file.stream.read()
            image_mime_type = file_mime_type

            # Reset file stream position for potential future use
            image_file.stream.seek(0)

    # Validate that at least one input is provided
    if not text_input and not image_data:
        return jsonify({
            'error': 'At least one of text or image input must be provided'
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
    part_service=Provide[ServiceContainer.part_service],
    document_service=Provide[ServiceContainer.document_service],
    temp_file_manager=Provide[ServiceContainer.temp_file_manager],
):
    pass


