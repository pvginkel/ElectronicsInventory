"""Document management API endpoints."""


from dependency_injector.wiring import Provide, inject
from flask import Blueprint, jsonify, request, send_file
from spectree import Response as SpectreeResponse
from werkzeug.datastructures import FileStorage

from app.schemas.common import ErrorResponseSchema
from app.schemas.part_attachment import (
    CoverAttachmentResponseSchema,
    PartAttachmentCreateUrlSchema,
    PartAttachmentListSchema,
    PartAttachmentResponseSchema,
    PartAttachmentUpdateSchema,
    SetCoverAttachmentSchema,
)
from app.services.container import ServiceContainer
from app.utils.error_handling import handle_api_errors
from app.utils.spectree_config import api

documents_bp = Blueprint("documents", __name__, url_prefix="/parts")


# Part Cover Image Management
@documents_bp.route("/<part_key>/cover", methods=["PUT"])
@api.validate(json=SetCoverAttachmentSchema, resp=SpectreeResponse(HTTP_200=CoverAttachmentResponseSchema, HTTP_400=ErrorResponseSchema, HTTP_404=ErrorResponseSchema))
@handle_api_errors
@inject
def set_part_cover(part_key: str, document_service=Provide[ServiceContainer.document_service]):
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
def clear_part_cover(part_key: str, document_service=Provide[ServiceContainer.document_service]):
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
def get_part_cover(part_key: str, document_service=Provide[ServiceContainer.document_service]):
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
def get_part_cover_thumbnail(part_key: str, document_service=Provide[ServiceContainer.document_service]):
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
def create_attachment(part_key: str, document_service=Provide[ServiceContainer.document_service]):
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
            file_data=file.stream,
            filename=file.filename,
            content_type=file.content_type or 'application/octet-stream'
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
def list_attachments(part_key: str, document_service=Provide[ServiceContainer.document_service]):
    """List all attachments for a part."""
    attachments = document_service.get_part_attachments(part_key)
    return [PartAttachmentListSchema.model_validate(attachment).model_dump() for attachment in attachments], 200


@documents_bp.route("/<part_key>/attachments/<int:attachment_id>", methods=["GET"])
@api.validate(resp=SpectreeResponse(HTTP_200=PartAttachmentResponseSchema, HTTP_404=ErrorResponseSchema))
@handle_api_errors
@inject
def get_attachment(part_key: str, attachment_id: int, document_service=Provide[ServiceContainer.document_service]):
    """Get attachment details."""
    attachment = document_service.get_attachment(attachment_id)
    return PartAttachmentResponseSchema.model_validate(attachment).model_dump(), 200


@documents_bp.route("/<part_key>/attachments/<int:attachment_id>/download", methods=["GET"])
@handle_api_errors
@inject
def download_attachment(part_key: str, attachment_id: int, document_service=Provide[ServiceContainer.document_service]):
    """Download or stream attachment file."""
    file_data, content_type, filename = document_service.get_attachment_file_data(attachment_id)

    return send_file(
        file_data,
        mimetype=content_type,
        as_attachment=True,
        download_name=filename or f"attachment_{attachment_id}"
    )


@documents_bp.route("/<part_key>/attachments/<int:attachment_id>/thumbnail", methods=["GET"])
@handle_api_errors
@inject
def get_attachment_thumbnail(part_key: str, attachment_id: int, document_service=Provide[ServiceContainer.document_service]):
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
def update_attachment(part_key: str, attachment_id: int, document_service=Provide[ServiceContainer.document_service]):
    """Update attachment metadata."""
    data = PartAttachmentUpdateSchema.model_validate(request.get_json())
    attachment = document_service.update_attachment(attachment_id, data.title)

    return PartAttachmentResponseSchema.model_validate(attachment).model_dump(), 200


@documents_bp.route("/<part_key>/attachments/<int:attachment_id>", methods=["DELETE"])
@api.validate(resp=SpectreeResponse(HTTP_204=None, HTTP_404=ErrorResponseSchema))
@handle_api_errors
@inject
def delete_attachment(part_key: str, attachment_id: int, document_service=Provide[ServiceContainer.document_service]):
    """Delete attachment."""
    document_service.delete_attachment(attachment_id)

    return '', 204
