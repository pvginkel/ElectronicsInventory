"""AI-powered part creation API endpoints."""

from dependency_injector.wiring import Provide, inject
from flask import Blueprint, jsonify, request
from werkzeug.datastructures import FileStorage

from app.schemas.ai_part_analysis import AIPartCreateSchema
from app.schemas.part import PartResponseSchema
from app.services.ai_part_analysis_task import AIPartAnalysisTask
from app.services.container import ServiceContainer
from app.utils.error_handling import handle_api_errors

# Note: SpecTree validation skipped for multipart endpoints due to complexity

ai_parts_bp = Blueprint("ai_parts", __name__, url_prefix="/ai-parts")


@ai_parts_bp.route("/analyze", methods=["POST"])
@handle_api_errors
@inject
def analyze_part(
    task_service=Provide[ServiceContainer.task_service],
    ai_service=Provide[ServiceContainer.ai_service],
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
@handle_api_errors
@inject
def create_part_from_ai_analysis(
    part_service=Provide[ServiceContainer.part_service],
    document_service=Provide[ServiceContainer.document_service],
    temp_file_manager=Provide[ServiceContainer.temp_file_manager],
):
    """
    Create a part from AI analysis suggestions.

    Takes the AI analysis results and creates a new part with attachments.
    Documents and images are moved from temporary storage to permanent storage.
    """
    data = AIPartCreateSchema.model_validate(request.get_json())

    # Create the part first
    part = part_service.create_part(
        description=data.description,
        manufacturer_code=data.manufacturer_code,
        type_id=data.type_id,
        tags=data.tags,
        seller=data.seller,
        seller_link=data.seller_link,
        package=data.package,
        pin_count=data.pin_count,
        voltage_rating=data.voltage_rating,
        mounting_type=data.mounting_type,
        series=data.series,
        dimensions=data.dimensions,
    )

    # Process suggested image as cover attachment if provided
    cover_attachment_id = None
    if data.suggested_image_url:
        try:
            # Resolve temporary URL to file path
            temp_image_path = temp_file_manager.resolve_temp_url(data.suggested_image_url)
            if temp_image_path and temp_image_path.exists():
                # Create attachment from temporary file
                with open(temp_image_path, 'rb') as f:
                    cover_attachment = document_service.create_file_attachment(
                        part_key=part.key,
                        title="AI-suggested part image",
                        file_data=f,
                        filename=temp_image_path.name,
                        content_type="image/jpeg"  # Default, will be detected
                    )
                    cover_attachment_id = cover_attachment.id
        except Exception as e:
            # Log error but don't fail part creation
            import logging
            logger = logging.getLogger(__name__)
            logger.warning(f"Failed to process suggested image: {e}")

    # Process document attachments
    for doc_suggestion in data.documents:
        try:
            # Resolve temporary path
            temp_doc_path = temp_file_manager.resolve_temp_url(
                f"/tmp/ai-analysis/{doc_suggestion.temp_path.split('/')[-2]}/{doc_suggestion.filename}"
            )

            if temp_doc_path and temp_doc_path.exists():
                # Create attachment from temporary file
                with open(temp_doc_path, 'rb') as f:
                    document_service.create_file_attachment(
                        part_key=part.key,
                        title=f"{doc_suggestion.document_type.title()}: {doc_suggestion.filename}",
                        file_data=f,
                        filename=doc_suggestion.filename,
                        content_type="application/pdf" if doc_suggestion.filename.endswith('.pdf') else None
                    )
        except Exception as e:
            # Log error but don't fail part creation
            import logging
            logger = logging.getLogger(__name__)
            logger.warning(f"Failed to process document {doc_suggestion.filename}: {e}")

    # Set cover attachment if we created one
    if cover_attachment_id:
        try:
            document_service.set_part_cover_attachment(part.key, cover_attachment_id)
        except Exception as e:
            import logging
            logger = logging.getLogger(__name__)
            logger.warning(f"Failed to set cover attachment: {e}")

    return PartResponseSchema.model_validate(part).model_dump(), 201


# Temporary file serving endpoint for AI analysis results
@ai_parts_bp.route("/temp/<path:temp_path>", methods=["GET"])
@handle_api_errors
@inject
def serve_temp_file(temp_path: str, temp_file_manager=Provide[ServiceContainer.temp_file_manager]):
    """
    Serve temporary files from AI analysis.

    Security: Files are only accessible for a limited time and within the temp directory.
    """
    from flask import send_file

    temp_url = f"/tmp/ai-analysis/{temp_path}"
    file_path = temp_file_manager.resolve_temp_url(temp_url)

    if not file_path or not file_path.exists():
        return jsonify({'error': 'File not found or expired'}), 404

    # Determine MIME type based on extension
    suffix = file_path.suffix.lower()
    mime_type = {
        '.pdf': 'application/pdf',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.png': 'image/png',
        '.webp': 'image/webp',
        '.gif': 'image/gif'
    }.get(suffix, 'application/octet-stream')

    return send_file(file_path, mimetype=mime_type)

