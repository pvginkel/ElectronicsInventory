"""Box management API endpoints."""


from flask import Blueprint, g, request
from spectree import Response as SpectreeResponse

from app.schemas.box import (
    BoxCreateSchema,
    BoxListSchema,
    BoxResponseSchema,
    BoxUpdateSchema,
)
from app.schemas.common import ErrorResponseSchema
from app.schemas.location import LocationResponseSchema
from app.services.box_service import BoxService
from app.utils.error_handling import handle_api_errors
from app.utils.spectree_config import api

boxes_bp = Blueprint("boxes", __name__, url_prefix="/boxes")


@boxes_bp.route("", methods=["POST"])
@api.validate(json=BoxCreateSchema, resp=SpectreeResponse(HTTP_201=BoxResponseSchema, HTTP_400=ErrorResponseSchema))
@handle_api_errors
def create_box():
    """Create new box with specified capacity."""
    # Spectree validates the request, but we still need to access the data
    data = BoxCreateSchema.model_validate(request.get_json())
    box = BoxService.create_box(g.db, data.description, data.capacity)
    return BoxResponseSchema.model_validate(box).model_dump(), 201


@boxes_bp.route("", methods=["GET"])
@api.validate(resp=SpectreeResponse(HTTP_200=list[BoxListSchema]))
@handle_api_errors
def list_boxes():
    """List all boxes with summary info."""
    boxes = BoxService.get_all_boxes(g.db)
    return [BoxListSchema.model_validate(box).model_dump() for box in boxes]


@boxes_bp.route("/<int:box_no>", methods=["GET"])
@api.validate(resp=SpectreeResponse(HTTP_200=BoxResponseSchema, HTTP_404=ErrorResponseSchema))
@handle_api_errors
def get_box_details(box_no: int):
    """Get box details."""
    box = BoxService.get_box(g.db, box_no)
    if not box:
        return {"error": "Box not found"}, 404

    return BoxResponseSchema.model_validate(box).model_dump()


@boxes_bp.route("/<int:box_no>", methods=["PUT"])
@api.validate(json=BoxUpdateSchema, resp=SpectreeResponse(HTTP_200=BoxResponseSchema, HTTP_400=ErrorResponseSchema, HTTP_404=ErrorResponseSchema))
@handle_api_errors
def update_box(box_no: int):
    """Update box (capacity changes require validation)."""
    # Spectree validates the request, but we still need to access the data
    data = BoxUpdateSchema.model_validate(request.get_json())

    box = BoxService.update_box_capacity(g.db, box_no, data.capacity, data.description)
    if not box:
        return {"error": "Box not found"}, 404

    return BoxResponseSchema.model_validate(box).model_dump()


@boxes_bp.route("/<int:box_no>", methods=["DELETE"])
@api.validate(resp=SpectreeResponse(HTTP_204=None, HTTP_404=ErrorResponseSchema))
@handle_api_errors
def delete_box(box_no: int):
    """Delete empty box."""
    if BoxService.delete_box(g.db, box_no):
        return "", 204
    else:
        return {"error": "Box not found"}, 404


@boxes_bp.route("/<int:box_no>/locations", methods=["GET"])
@api.validate(resp=SpectreeResponse(HTTP_200=list[LocationResponseSchema], HTTP_404=ErrorResponseSchema))
@handle_api_errors
def get_box_locations(box_no: int):
    """Get all locations in box."""
    box = BoxService.get_box(g.db, box_no)
    if not box:
        return {"error": "Box not found"}, 404

    return [
        LocationResponseSchema.model_validate(location).model_dump()
        for location in box.locations
    ]
