"""Box management API endpoints."""

from flask import Blueprint, jsonify, request
from spectree import Response

from app.schemas.box import (
    BoxCreateSchema,
    BoxListSchema,
    BoxLocationGridSchema,
    BoxResponseSchema,
)
from app.schemas.location import LocationResponseSchema
from app.services.box_service import BoxService

boxes_bp = Blueprint("boxes", __name__, url_prefix="/boxes")


@boxes_bp.route("", methods=["POST"])
def create_box():
    """Create new box with specified capacity."""
    try:
        data = BoxCreateSchema.model_validate(request.get_json())
        box = BoxService.create_box(data.description, data.capacity)
        return jsonify(BoxResponseSchema.model_validate(box).model_dump()), 201
    except Exception as e:
        return jsonify({"error": str(e)}), 400


@boxes_bp.route("", methods=["GET"])
def list_boxes():
    """List all boxes with summary info."""
    try:
        boxes = BoxService.get_all_boxes()
        return jsonify([
            BoxListSchema.model_validate(box).model_dump() for box in boxes
        ])
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@boxes_bp.route("/<int:box_no>", methods=["GET"])
def get_box_details(box_no: int):
    """Get box details with location grid."""
    try:
        box = BoxService.get_box_with_locations(box_no)
        if not box:
            return jsonify({"error": "Box not found"}), 404
        
        return jsonify(BoxResponseSchema.model_validate(box).model_dump())
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@boxes_bp.route("/<int:box_no>", methods=["PUT"])
def update_box(box_no: int):
    """Update box (capacity changes require validation)."""
    try:
        data = request.get_json()
        description = data.get("description", "")
        capacity = data.get("capacity")
        
        if not description or capacity is None or capacity <= 0:
            return jsonify({"error": "Description and positive capacity required"}), 400
        
        box = BoxService.update_box_capacity(box_no, capacity, description)
        if not box:
            return jsonify({"error": "Box not found"}), 404
        
        return jsonify(BoxResponseSchema.model_validate(box).model_dump())
    except Exception as e:
        return jsonify({"error": str(e)}), 400


@boxes_bp.route("/<int:box_no>", methods=["DELETE"])
def delete_box(box_no: int):
    """Delete empty box."""
    try:
        if BoxService.delete_box(box_no):
            return "", 204
        else:
            return jsonify({"error": "Box not found"}), 404
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@boxes_bp.route("/<int:box_no>/locations", methods=["GET"])
def get_box_locations(box_no: int):
    """Get all locations in box."""
    try:
        box = BoxService.get_box_with_locations(box_no)
        if not box:
            return jsonify({"error": "Box not found"}), 404
        
        return jsonify([
            LocationResponseSchema.model_validate(location).model_dump()
            for location in box.locations
        ])
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@boxes_bp.route("/<int:box_no>/grid", methods=["GET"])
def get_box_grid(box_no: int):
    """Get box location grid for UI display."""
    try:
        grid = BoxService.get_location_grid(box_no)
        if not grid:
            return jsonify({"error": "Box not found"}), 404
        
        return jsonify(grid)
    except Exception as e:
        return jsonify({"error": str(e)}), 500