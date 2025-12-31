"""Attachment set management API endpoints."""

import logging
from typing import Any, BinaryIO, cast

from dependency_injector.wiring import Provide, inject
from flask import Blueprint, jsonify, request
from spectree import Response as SpectreeResponse

from app.schemas.attachment_set import (
    AttachmentCreateUrlSchema,
    AttachmentListSchema,
    AttachmentResponseSchema,
    AttachmentSetCoverSchema,
    AttachmentSetCoverUpdateSchema,
    AttachmentSetResponseSchema,
    AttachmentUpdateSchema,
)
from app.schemas.common import ErrorResponseSchema
from app.services.attachment_set_service import AttachmentSetService
from app.services.container import ServiceContainer
from app.services.document_service import DocumentService
from app.utils.error_handling import handle_api_errors
from app.utils.spectree_config import api

attachment_sets_bp = Blueprint("attachment_sets", __name__, url_prefix="/attachment-sets")

logger = logging.getLogger(__name__)


# Attachment Set Operations
@attachment_sets_bp.route("/<int:set_id>", methods=["GET"])
@api.validate(resp=SpectreeResponse(HTTP_200=AttachmentSetResponseSchema, HTTP_404=ErrorResponseSchema))
@handle_api_errors
@inject
def get_attachment_set(set_id: int, service: AttachmentSetService = Provide[ServiceContainer.attachment_set_service]) -> Any:
    """Get attachment set details with all attachments."""
    attachment_set = service.get_attachment_set(set_id)
    return AttachmentSetResponseSchema.model_validate(attachment_set).model_dump(), 200


# Attachment Operations
@attachment_sets_bp.route("/<int:set_id>/attachments", methods=["POST"])
@handle_api_errors
@inject
def create_attachment(
    set_id: int,
    document_service: DocumentService = Provide[ServiceContainer.document_service]
) -> Any:
    """Create a new attachment (file upload or URL) for an attachment set."""
    content_type = request.content_type

    if content_type and content_type.startswith('multipart/form-data'):
        # File upload
        if 'file' not in request.files:
            return jsonify({'error': 'No file provided'}), 400

        file = request.files['file']
        if not file or not file.filename:
            return jsonify({'error': 'No file selected'}), 400

        title = request.form.get('title')
        if not title:
            return jsonify({'error': 'Title is required'}), 400

        # Create file attachment
        attachment = document_service.create_file_attachment(
            attachment_set_id=set_id,
            title=title,
            file_data=cast(BinaryIO, file.stream),
            filename=file.filename
        )

        return AttachmentResponseSchema.model_validate(attachment).model_dump(), 201

    elif content_type and content_type.startswith('application/json'):
        # URL attachment
        data = AttachmentCreateUrlSchema.model_validate(request.get_json())
        attachment = document_service.create_url_attachment(
            attachment_set_id=set_id,
            title=data.title,
            url=data.url
        )

        return AttachmentResponseSchema.model_validate(attachment).model_dump(), 201

    else:
        return jsonify({'error': 'Invalid content type. Use multipart/form-data for files or application/json for URLs'}), 400


@attachment_sets_bp.route("/<int:set_id>/attachments", methods=["GET"])
@api.validate(resp=SpectreeResponse(HTTP_200=list[AttachmentListSchema], HTTP_404=ErrorResponseSchema))
@handle_api_errors
@inject
def list_attachments(set_id: int, service: AttachmentSetService = Provide[ServiceContainer.attachment_set_service]) -> Any:
    """List all attachments for an attachment set."""
    attachments = service.get_attachments(set_id)
    return [AttachmentListSchema.model_validate(attachment).model_dump() for attachment in attachments], 200


@attachment_sets_bp.route("/<int:set_id>/attachments/<int:attachment_id>", methods=["GET"])
@api.validate(resp=SpectreeResponse(HTTP_200=AttachmentResponseSchema, HTTP_404=ErrorResponseSchema, HTTP_400=ErrorResponseSchema))
@handle_api_errors
@inject
def get_attachment(set_id: int, attachment_id: int, service: AttachmentSetService = Provide[ServiceContainer.attachment_set_service]) -> Any:
    """Get a specific attachment and verify it belongs to the set."""
    attachment = service.get_attachment(set_id, attachment_id)
    return AttachmentResponseSchema.model_validate(attachment).model_dump(), 200


@attachment_sets_bp.route("/<int:set_id>/attachments/<int:attachment_id>", methods=["PUT"])
@api.validate(json=AttachmentUpdateSchema, resp=SpectreeResponse(HTTP_200=AttachmentResponseSchema, HTTP_404=ErrorResponseSchema, HTTP_400=ErrorResponseSchema))
@handle_api_errors
@inject
def update_attachment(set_id: int, attachment_id: int, service: AttachmentSetService = Provide[ServiceContainer.attachment_set_service]) -> Any:
    """Update attachment metadata."""
    data = AttachmentUpdateSchema.model_validate(request.get_json())
    attachment = service.update_attachment(set_id, attachment_id, title=data.title)
    return AttachmentResponseSchema.model_validate(attachment).model_dump(), 200


@attachment_sets_bp.route("/<int:set_id>/attachments/<int:attachment_id>", methods=["DELETE"])
@api.validate(resp=SpectreeResponse(HTTP_204=None, HTTP_404=ErrorResponseSchema, HTTP_400=ErrorResponseSchema))
@handle_api_errors
@inject
def delete_attachment(set_id: int, attachment_id: int, service: AttachmentSetService = Provide[ServiceContainer.attachment_set_service]) -> Any:
    """Delete an attachment and reassign cover if necessary."""
    service.delete_attachment(set_id, attachment_id)
    return '', 204


# Cover Management
@attachment_sets_bp.route("/<int:set_id>/cover", methods=["GET"])
@api.validate(resp=SpectreeResponse(HTTP_200=AttachmentSetCoverSchema, HTTP_404=ErrorResponseSchema))
@handle_api_errors
@inject
def get_cover(set_id: int, service: AttachmentSetService = Provide[ServiceContainer.attachment_set_service]) -> Any:
    """Get cover attachment details for an attachment set."""
    attachment_set = service.get_attachment_set(set_id)

    cover_url = None
    if attachment_set.cover_attachment and attachment_set.cover_attachment.has_preview:
        from app.utils.cas_url import build_cas_url
        cover_url = build_cas_url(attachment_set.cover_attachment.s3_key)

    response_data = {
        'cover_attachment_id': attachment_set.cover_attachment_id,
        'cover_url': cover_url
    }

    return response_data, 200


@attachment_sets_bp.route("/<int:set_id>/cover", methods=["PUT"])
@api.validate(json=AttachmentSetCoverUpdateSchema, resp=SpectreeResponse(HTTP_200=AttachmentSetCoverSchema, HTTP_404=ErrorResponseSchema, HTTP_400=ErrorResponseSchema))
@handle_api_errors
@inject
def set_cover(set_id: int, service: AttachmentSetService = Provide[ServiceContainer.attachment_set_service]) -> Any:
    """Set cover attachment for an attachment set."""
    data = AttachmentSetCoverUpdateSchema.model_validate(request.get_json())
    attachment_set = service.set_cover_attachment(set_id, data.attachment_id)

    cover_url = None
    if attachment_set.cover_attachment and attachment_set.cover_attachment.has_preview:
        from app.utils.cas_url import build_cas_url
        cover_url = build_cas_url(attachment_set.cover_attachment.s3_key)

    response_data = {
        'cover_attachment_id': attachment_set.cover_attachment_id,
        'cover_url': cover_url
    }

    return response_data, 200


@attachment_sets_bp.route("/<int:set_id>/cover", methods=["DELETE"])
@api.validate(resp=SpectreeResponse(HTTP_200=AttachmentSetCoverSchema, HTTP_404=ErrorResponseSchema))
@handle_api_errors
@inject
def clear_cover(set_id: int, service: AttachmentSetService = Provide[ServiceContainer.attachment_set_service]) -> Any:
    """Clear cover attachment for an attachment set."""
    service.set_cover_attachment(set_id, None)

    response_data = {
        'cover_attachment_id': None,
        'cover_url': None
    }

    return response_data, 200
