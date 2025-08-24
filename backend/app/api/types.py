"""Type management API endpoints."""

from flask import Blueprint, g, request
from spectree import Response as SpectreeResponse

from app.schemas.common import ErrorResponseSchema
from app.schemas.type import TypeCreateSchema, TypeResponseSchema, TypeUpdateSchema
from app.services.type_service import TypeService
from app.utils.error_handling import handle_api_errors
from app.utils.spectree_config import api

types_bp = Blueprint("types", __name__, url_prefix="/types")


@types_bp.route("", methods=["POST"])
@api.validate(json=TypeCreateSchema, resp=SpectreeResponse(HTTP_201=TypeResponseSchema, HTTP_400=ErrorResponseSchema))
@handle_api_errors
def create_type():
    """Create new part type."""
    data = TypeCreateSchema.model_validate(request.get_json())
    type_obj = TypeService.create_type(g.db, data.name)
    return TypeResponseSchema.model_validate(type_obj).model_dump(), 201


@types_bp.route("", methods=["GET"])
@api.validate(resp=SpectreeResponse(HTTP_200=list[TypeResponseSchema]))
@handle_api_errors
def list_types():
    """List all part types."""
    types = TypeService.get_all_types(g.db)
    return [TypeResponseSchema.model_validate(type_obj).model_dump() for type_obj in types]


@types_bp.route("/<int:type_id>", methods=["GET"])
@api.validate(resp=SpectreeResponse(HTTP_200=TypeResponseSchema, HTTP_404=ErrorResponseSchema))
@handle_api_errors
def get_type(type_id: int):
    """Get single type details."""
    type_obj = TypeService.get_type(g.db, type_id)
    if not type_obj:
        return {"error": "Type not found"}, 404

    return TypeResponseSchema.model_validate(type_obj).model_dump()


@types_bp.route("/<int:type_id>", methods=["PUT"])
@api.validate(json=TypeUpdateSchema, resp=SpectreeResponse(HTTP_200=TypeResponseSchema, HTTP_400=ErrorResponseSchema, HTTP_404=ErrorResponseSchema))
@handle_api_errors
def update_type(type_id: int):
    """Update type name."""
    data = TypeUpdateSchema.model_validate(request.get_json())
    type_obj = TypeService.update_type(g.db, type_id, data.name)
    if not type_obj:
        return {"error": "Type not found"}, 404

    return TypeResponseSchema.model_validate(type_obj).model_dump()


@types_bp.route("/<int:type_id>", methods=["DELETE"])
@api.validate(resp=SpectreeResponse(HTTP_204=None, HTTP_404=ErrorResponseSchema, HTTP_409=ErrorResponseSchema))
@handle_api_errors
def delete_type(type_id: int):
    """Delete type if not in use."""
    if TypeService.delete_type(g.db, type_id):
        return "", 204
    else:
        # Check if type exists to give appropriate error
        type_obj = TypeService.get_type(g.db, type_id)
        if not type_obj:
            return {"error": "Type not found"}, 404
        else:
            return {"error": "Cannot delete type that is in use by parts"}, 409
