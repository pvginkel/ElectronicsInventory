"""Document management API endpoints."""

import io
import logging
from io import BytesIO
from typing import BinaryIO, cast
from urllib.parse import quote

from dependency_injector.wiring import Provide, inject
from flask import Blueprint, jsonify, request, send_file
from spectree import Response as SpectreeResponse
from werkzeug.datastructures import FileStorage

from app.models.part_attachment import AttachmentType
from app.schemas.common import ErrorResponseSchema
from app.schemas.copy_attachment import (
    CopyAttachmentRequestSchema,
    CopyAttachmentResponseSchema,
)
from app.schemas.part_attachment import (
    CoverAttachmentResponseSchema,
    PartAttachmentCreateUrlSchema,
    PartAttachmentListSchema,
    PartAttachmentResponseSchema,
    PartAttachmentUpdateSchema,
    SetCoverAttachmentSchema,
)
from app.schemas.url_preview import UrlPreviewRequestSchema, UrlPreviewResponseSchema
from app.services.container import ServiceContainer
from app.services.document_service import DocumentService
from app.services.url_transformers.registry import URLInterceptorRegistry
from app.utils.error_handling import handle_api_errors
from app.utils.spectree_config import api

documents_bp = Blueprint("documents", __name__, url_prefix="/parts")

logger = logging.getLogger(__name__)


# Part Cover Image Management
@documents_bp.route("/<part_key>/cover", methods=["PUT"])
@api.validate(json=SetCoverAttachmentSchema, resp=SpectreeResponse(HTTP_200=CoverAttachmentResponseSchema, HTTP_400=ErrorResponseSchema, HTTP_404=ErrorResponseSchema))
@handle_api_errors
@inject
def set_part_cover(part_key: str, document_service : DocumentService = Provide[ServiceContainer.document_service]):
    """Set or clear part cover attachment."""
    data = SetCoverAttachmentSchema.model_validate(request.get_json())
    document_service.set_part_cover_attachment(part_key, data.attachment_id)

    # Get updated cover attachment
    cover_attachment = document_service.get_part_cover_attachment(part_key)
    response_data = {
        'attachment_id': cover_attachment.id if cover_attachment else None,
        'attachment': PartAttachmentResponseSchema.model_validate(cover_attachment).model_dump() if cover_attachment else None
    }

    return response_data, 200


@documents_bp.route("/<part_key>/cover", methods=["DELETE"])
@api.validate(resp=SpectreeResponse(HTTP_200=CoverAttachmentResponseSchema, HTTP_404=ErrorResponseSchema))
@handle_api_errors
@inject
def clear_part_cover(part_key: str, document_service : DocumentService = Provide[ServiceContainer.document_service]):
    """Clear part cover attachment."""
    document_service.set_part_cover_attachment(part_key, None)

    response_data = {
        'attachment_id': None,
        'attachment': None
    }

    return response_data, 200


@documents_bp.route("/<part_key>/cover", methods=["GET"])
@api.validate(resp=SpectreeResponse(HTTP_200=CoverAttachmentResponseSchema, HTTP_404=ErrorResponseSchema))
@handle_api_errors
@inject
def get_part_cover(part_key: str, document_service : DocumentService = Provide[ServiceContainer.document_service]):
    """Get part cover attachment details."""
    cover_attachment = document_service.get_part_cover_attachment(part_key)

    response_data = {
        'attachment_id': cover_attachment.id if cover_attachment else None,
        'attachment': PartAttachmentResponseSchema.model_validate(cover_attachment).model_dump() if cover_attachment else None
    }

    return response_data, 200


@documents_bp.route("/<part_key>/cover/thumbnail", methods=["GET"])
@handle_api_errors
@inject
def get_part_cover_thumbnail(part_key: str, document_service : DocumentService = Provide[ServiceContainer.document_service]):
    """Get part cover thumbnail."""
    size = int(request.args.get('size', 150))

    cover_attachment = document_service.get_part_cover_attachment(part_key)
    if not cover_attachment:
        return jsonify({'error': 'No cover attachment set'}), 404

    thumbnail_path, content_type = document_service.get_attachment_thumbnail(cover_attachment.id, size)

    if content_type == 'image/svg+xml':
        # Return SVG data directly
        return thumbnail_path, 200, {'Content-Type': content_type}
    else:
        # Return thumbnail file
        return send_file(thumbnail_path, mimetype=content_type)


# Part Attachments Management
@documents_bp.route("/<part_key>/attachments", methods=["POST"])
@handle_api_errors
@inject
def create_attachment(part_key: str, document_service : DocumentService = Provide[ServiceContainer.document_service]):
    """Create a new attachment (file upload or URL)."""
    content_type = request.content_type

    if content_type and content_type.startswith('multipart/form-data'):
        # File upload
        if 'file' not in request.files:
            return jsonify({'error': 'No file provided'}), 400

        file: FileStorage = request.files['file']
        if not file or not file.filename:
            return jsonify({'error': 'No file selected'}), 400

        title = request.form.get('title')
        if not title:
            return jsonify({'error': 'Title is required'}), 400

        # Create file attachment
        attachment = document_service.create_file_attachment(
            part_key=part_key,
            title=title,
            file_data=cast(BinaryIO, file.stream),
            filename=file.filename
        )

        return PartAttachmentResponseSchema.model_validate(attachment).model_dump(), 201

    elif content_type and content_type.startswith('application/json'):
        # URL attachment
        data = PartAttachmentCreateUrlSchema.model_validate(request.get_json())
        attachment = document_service.create_url_attachment(
            part_key=part_key,
            title=data.title,
            url=data.url
        )

        return PartAttachmentResponseSchema.model_validate(attachment).model_dump(), 201

    else:
        return jsonify({'error': 'Invalid content type. Use multipart/form-data for files or application/json for URLs'}), 400


@documents_bp.route("/<part_key>/attachments", methods=["GET"])
@api.validate(resp=SpectreeResponse(HTTP_200=list[PartAttachmentListSchema], HTTP_404=ErrorResponseSchema))
@handle_api_errors
@inject
def list_attachments(part_key: str, document_service : DocumentService = Provide[ServiceContainer.document_service]):
    """List all attachments for a part."""
    attachments = document_service.get_part_attachments(part_key)
    return [PartAttachmentListSchema.model_validate(attachment).model_dump() for attachment in attachments], 200


@documents_bp.route("/<part_key>/attachments/<int:attachment_id>", methods=["GET"])
@api.validate(resp=SpectreeResponse(HTTP_200=PartAttachmentResponseSchema, HTTP_404=ErrorResponseSchema))
@handle_api_errors
@inject
def get_attachment(part_key: str, attachment_id: int, document_service : DocumentService = Provide[ServiceContainer.document_service]):
    """Get attachment details."""
    attachment = document_service.get_attachment(attachment_id)
    return PartAttachmentResponseSchema.model_validate(attachment).model_dump(), 200


@documents_bp.route("/<part_key>/attachments/<int:attachment_id>/download", methods=["GET"])
@handle_api_errors
@inject
def download_attachment(part_key: str, attachment_id: int, document_service : DocumentService = Provide[ServiceContainer.document_service]):
    """Download or stream attachment file."""
    file_payload = document_service.get_attachment_file_data(attachment_id)
    if file_payload is None:
        return jsonify({'error': 'Attachment file content not available'}), 404

    file_data, content_type, filename = file_payload

    # Check for inline query parameter to set Content-Disposition to inline
    inline = request.args.get('inline') is not None

    return send_file(  # type: ignore[call-arg]
        file_data,
        mimetype=content_type,
        as_attachment=not inline,
        download_name=filename
    )


@documents_bp.route("/<part_key>/attachments/<int:attachment_id>/thumbnail", methods=["GET"])
@handle_api_errors
@inject
def get_attachment_thumbnail(part_key: str, attachment_id: int, document_service : DocumentService = Provide[ServiceContainer.document_service]):
    """Get attachment thumbnail."""
    size = int(request.args.get('size', 150))

    thumbnail_path, content_type = document_service.get_attachment_thumbnail(attachment_id, size)

    if content_type == 'image/svg+xml':
        # Return SVG data directly
        return thumbnail_path, 200, {'Content-Type': content_type}
    else:
        # Return thumbnail file
        return send_file(thumbnail_path, mimetype=content_type)


@documents_bp.route("/<part_key>/attachments/<int:attachment_id>", methods=["PUT"])
@api.validate(json=PartAttachmentUpdateSchema, resp=SpectreeResponse(HTTP_200=PartAttachmentResponseSchema, HTTP_400=ErrorResponseSchema, HTTP_404=ErrorResponseSchema))
@handle_api_errors
@inject
def update_attachment(part_key: str, attachment_id: int, document_service : DocumentService = Provide[ServiceContainer.document_service]):
    """Update attachment metadata."""
    data = PartAttachmentUpdateSchema.model_validate(request.get_json())
    attachment = document_service.update_attachment(attachment_id, data.title)

    return PartAttachmentResponseSchema.model_validate(attachment).model_dump(), 200


@documents_bp.route("/<part_key>/attachments/<int:attachment_id>", methods=["DELETE"])
@api.validate(resp=SpectreeResponse(HTTP_204=None, HTTP_404=ErrorResponseSchema))
@handle_api_errors
@inject
def delete_attachment(part_key: str, attachment_id: int, document_service : DocumentService = Provide[ServiceContainer.document_service]):
    """Delete attachment."""
    document_service.delete_attachment(attachment_id)

    return '', 204


# Attachment Copying Endpoints
@documents_bp.route("/copy-attachment", methods=["POST"])
@api.validate(json=CopyAttachmentRequestSchema, resp=SpectreeResponse(HTTP_200=CopyAttachmentResponseSchema, HTTP_400=ErrorResponseSchema, HTTP_404=ErrorResponseSchema))
@handle_api_errors
@inject
def copy_attachment(document_service: DocumentService = Provide[ServiceContainer.document_service]):
    """Copy an individual attachment from one part to another."""
    data = CopyAttachmentRequestSchema.model_validate(request.get_json())

    # Copy the attachment
    new_attachment = document_service.copy_attachment_to_part(
        attachment_id=data.attachment_id,
        target_part_key=data.target_part_key,
        set_as_cover=data.set_as_cover
    )

    # Return response with created attachment details
    response_data = CopyAttachmentResponseSchema(
        attachment=PartAttachmentResponseSchema.model_validate(new_attachment)
    )

    return response_data.model_dump(), 200


# URL Preview Endpoints
@documents_bp.route("/attachment-preview", methods=["POST"])
@api.validate(json=UrlPreviewRequestSchema, resp=SpectreeResponse(HTTP_200=UrlPreviewResponseSchema, HTTP_400=ErrorResponseSchema))
@handle_api_errors
@inject
def attachment_preview(document_service : DocumentService = Provide[ServiceContainer.document_service]):
    """Get URL preview metadata (title and backend image endpoint URL)."""
    data = UrlPreviewRequestSchema.model_validate(request.get_json())

    # Process URL to extract metadata
    try:
        upload_doc = document_service.process_upload_url(data.url)

        # Generate backend image endpoint URL if preview available
        image_url = None
        if upload_doc.preview_image or upload_doc.detected_type == AttachmentType.IMAGE:
            encoded_url = quote(data.url, safe='')
            image_url = f"/api/parts/attachment-preview/image?url={encoded_url}"

        # Determine content type for response
        content_type = 'webpage'
        if upload_doc.detected_type == AttachmentType.IMAGE:
            content_type = 'image'
        elif upload_doc.detected_type == AttachmentType.PDF:
            content_type = 'pdf'

        response_data = UrlPreviewResponseSchema(
            title=upload_doc.title,
            image_url=image_url,
            original_url=data.url,
            content_type=content_type
        )

        return response_data.model_dump(), 200

    except Exception as e:
        from app.schemas.common import ErrorDetailsSchema, ErrorResponseSchema
        error_response = ErrorResponseSchema(
            error='Failed to extract URL preview',
            details=ErrorDetailsSchema(message=str(e), field=None)
        )
        return error_response.model_dump(), 422


@documents_bp.route("/attachment-preview/image", methods=["GET"])
@handle_api_errors
@inject
def attachment_preview_image(document_service : DocumentService = Provide[ServiceContainer.document_service]):
    """Get preview image for URL."""
    url = request.args.get('url')
    if not url:
        return jsonify({'error': 'URL parameter required'}), 400

    try:
        # Get preview image using new method
        result = document_service.get_preview_image(url)
        if not result:
            return jsonify({'error': 'No preview image available'}), 404

        # Return image data directly
        return send_file(
            BytesIO(result.content),
            mimetype=result.content_type,
            as_attachment=False
        )

    except Exception as e:
        return jsonify({'error': f'Failed to retrieve image: {str(e)}'}), 404


@documents_bp.route("/attachment-proxy/content", methods=["GET"])
@handle_api_errors
@inject
def attachment_proxy_content(
    document_service : DocumentService = Provide[ServiceContainer.document_service],
    url_interceptor_registry : URLInterceptorRegistry = Provide[ServiceContainer.url_interceptor_registry]
):
    """Proxy external URL content to avoid CORS issues when displaying PDFs and images in iframes."""
    url = request.args.get('url')
    if not url:
        return jsonify({'error': 'URL parameter required'}), 400

    try:
        # Use download cache service to get content with proper MIME type detection
        chain = url_interceptor_registry.build_chain(document_service.download_cache_service.get_cached_content)
        content = chain(url)
        if not content:
            return jsonify({'error': 'Failed to retrieve content'}), 404

        # Return the content with appropriate headers for iframe display
        return send_file(
            io.BytesIO(content.content),
            mimetype=content.content_type,
            as_attachment=False  # Use Content-Disposition: inline for iframe display
        )

    except Exception as e:
        return jsonify({'error': f'Failed to retrieve content: {str(e)}'}), 404
