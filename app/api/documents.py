"""Document management API endpoints."""

import io
import logging
from io import BytesIO
from typing import Any
from urllib.parse import quote

from dependency_injector.wiring import Provide, inject
from flask import Blueprint, jsonify, request, send_file
from spectree import Response as SpectreeResponse

from app.models.attachment import AttachmentType
from app.schemas.attachment_set import AttachmentResponseSchema
from app.schemas.common import ErrorResponseSchema
from app.schemas.copy_attachment import (
    CopyAttachmentRequestSchema,
    CopyAttachmentResponseSchema,
)
from app.schemas.url_preview import UrlPreviewRequestSchema, UrlPreviewResponseSchema
from app.services.container import ServiceContainer
from app.services.document_service import DocumentService
from app.services.url_transformers.registry import URLInterceptorRegistry
from app.utils.error_handling import handle_api_errors
from app.utils.spectree_config import api

documents_bp = Blueprint("documents", __name__, url_prefix="/parts")

logger = logging.getLogger(__name__)


# Attachment Copying Endpoints
@documents_bp.route("/copy-attachment", methods=["POST"])
@api.validate(json=CopyAttachmentRequestSchema, resp=SpectreeResponse(HTTP_200=CopyAttachmentResponseSchema, HTTP_400=ErrorResponseSchema, HTTP_404=ErrorResponseSchema))
@handle_api_errors
@inject
def copy_attachment(document_service: DocumentService = Provide[ServiceContainer.document_service]) -> Any:
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
        attachment=AttachmentResponseSchema.model_validate(new_attachment)
    )

    return response_data.model_dump(), 200


# URL Preview Endpoints
@documents_bp.route("/attachment-preview", methods=["POST"])
@api.validate(json=UrlPreviewRequestSchema, resp=SpectreeResponse(HTTP_200=UrlPreviewResponseSchema, HTTP_400=ErrorResponseSchema))
@handle_api_errors
@inject
def attachment_preview(document_service: DocumentService = Provide[ServiceContainer.document_service]) -> Any:
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
def attachment_preview_image(document_service: DocumentService = Provide[ServiceContainer.document_service]) -> Any:
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
    document_service: DocumentService = Provide[ServiceContainer.document_service],
    url_interceptor_registry: URLInterceptorRegistry = Provide[ServiceContainer.url_interceptor_registry]
) -> Any:
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
