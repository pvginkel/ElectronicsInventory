"""Box management API endpoints."""

from typing import Any

from flask import Blueprint, jsonify, request
from flask.wrappers import Response

from app.schemas.box import (
    BoxCreateSchema,
    BoxListSchema,
    BoxResponseSchema,
)
from app.schemas.location import LocationResponseSchema
from app.services.box_service import BoxService
from app.utils.error_handling import handle_api_errors

boxes_bp = Blueprint("boxes", __name__, url_prefix="/boxes")


@boxes_bp.route("", methods=["POST"])
@handle_api_errors
def create_box() -> tuple[Response, int]:
    """Create new box with specified capacity."""
    data = BoxCreateSchema.model_validate(request.get_json())
    box = BoxService.create_box(data.description, data.capacity)
    return jsonify(BoxResponseSchema.model_validate(box).model_dump()), 201


@boxes_bp.route("", methods=["GET"])
@handle_api_errors
def list_boxes() -> Response:
    """List all boxes with summary info."""
    boxes = BoxService.get_all_boxes()
    return jsonify([
        BoxListSchema.model_validate(box).model_dump() for box in boxes
    ])


@boxes_bp.route("/<int:box_no>", methods=["GET"])
@handle_api_errors
def get_box_details(box_no: int) -> Response | tuple[Response, int]:
    """Get box details with location grid."""
    box = BoxService.get_box_with_locations(box_no)
    if not box:
        return jsonify({"error": "Box not found"}), 404

    return jsonify(BoxResponseSchema.model_validate(box).model_dump())


@boxes_bp.route("/<int:box_no>", methods=["PUT"])
@handle_api_errors
def update_box(box_no: int) -> Response | tuple[Response, int]:
    """Update box (capacity changes require validation)."""
    data: dict[str, Any] | None = request.get_json()
    if not data:
        return jsonify({"error": "JSON data required"}), 400

    description: str = data.get("description", "")
    capacity: int | None = data.get("capacity")

    if not description or capacity is None or capacity <= 0:
        return jsonify({"error": "Description and positive capacity required"}), 400

    box = BoxService.update_box_capacity(box_no, capacity, description)
    if not box:
        return jsonify({"error": "Box not found"}), 404

    return jsonify(BoxResponseSchema.model_validate(box).model_dump())


@boxes_bp.route("/<int:box_no>", methods=["DELETE"])
@handle_api_errors
def delete_box(box_no: int) -> tuple[str, int] | tuple[Response, int]:
    """Delete empty box."""
    if BoxService.delete_box(box_no):
        return "", 204
    else:
        return jsonify({"error": "Box not found"}), 404


@boxes_bp.route("/<int:box_no>/locations", methods=["GET"])
@handle_api_errors
def get_box_locations(box_no: int) -> Response | tuple[Response, int]:
    """Get all locations in box."""
    box = BoxService.get_box_with_locations(box_no)
    if not box:
        return jsonify({"error": "Box not found"}), 404

    return jsonify([
        LocationResponseSchema.model_validate(location).model_dump()
        for location in box.locations
    ])


@boxes_bp.route("/<int:box_no>/grid", methods=["GET"])
@handle_api_errors
def get_box_grid(box_no: int) -> Response | tuple[Response, int]:
    """Get box location grid for UI display."""
    grid = BoxService.get_location_grid(box_no)
    if not grid:
        return jsonify({"error": "Box not found"}), 404

    return jsonify(grid)
