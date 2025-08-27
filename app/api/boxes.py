"""Box management API endpoints."""


from flask import Blueprint, g, request
from spectree import Response as SpectreeResponse

from app.schemas.box import (
    BoxCreateSchema,
    BoxListSchema,
    BoxResponseSchema,
    BoxUpdateSchema,
    BoxUsageStatsSchema,
    BoxWithUsageSchema,
)
from app.schemas.common import ErrorResponseSchema
from app.schemas.location import LocationResponseSchema, LocationWithPartResponseSchema, PartAssignmentSchema
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
@api.validate(resp=SpectreeResponse(HTTP_200=list[BoxWithUsageSchema]))
@handle_api_errors
def list_boxes():
    """List all boxes with usage statistics."""
    # Check if client wants usage stats
    include_usage = request.args.get("include_usage", "true").lower() == "true"

    if include_usage:
        boxes_with_usage = BoxService.get_all_boxes_with_usage(g.db)
        result = []
        for box_with_usage in boxes_with_usage:
            box = box_with_usage.box
            # Create schema instance with calculated usage stats
            box_data = BoxWithUsageSchema(
                box_no=box.box_no,
                description=box.description,
                capacity=box.capacity,
                created_at=box.created_at,
                updated_at=box.updated_at,
                total_locations=box_with_usage.total_locations,
                occupied_locations=box_with_usage.occupied_locations,
                available_locations=box_with_usage.available_locations,
                usage_percentage=box_with_usage.usage_percentage
            )
            result.append(box_data.model_dump())
        return result
    else:
        boxes = BoxService.get_all_boxes(g.db)
        return [BoxListSchema.model_validate(box).model_dump() for box in boxes]


@boxes_bp.route("/<int:box_no>", methods=["GET"])
@api.validate(resp=SpectreeResponse(HTTP_200=BoxResponseSchema, HTTP_404=ErrorResponseSchema))
@handle_api_errors
def get_box_details(box_no: int):
    """Get box details."""
    box = BoxService.get_box(g.db, box_no)
    return BoxResponseSchema.model_validate(box).model_dump()


@boxes_bp.route("/<int:box_no>", methods=["PUT"])
@api.validate(json=BoxUpdateSchema, resp=SpectreeResponse(HTTP_200=BoxResponseSchema, HTTP_400=ErrorResponseSchema, HTTP_404=ErrorResponseSchema))
@handle_api_errors
def update_box(box_no: int):
    """Update box (capacity changes require validation)."""
    # Spectree validates the request, but we still need to access the data
    data = BoxUpdateSchema.model_validate(request.get_json())

    box = BoxService.update_box_capacity(g.db, box_no, data.capacity, data.description)
    return BoxResponseSchema.model_validate(box).model_dump()


@boxes_bp.route("/<int:box_no>", methods=["DELETE"])
@api.validate(resp=SpectreeResponse(HTTP_204=None, HTTP_400=ErrorResponseSchema, HTTP_404=ErrorResponseSchema))
@handle_api_errors
def delete_box(box_no: int):
    """Delete empty box."""
    BoxService.delete_box(g.db, box_no)
    return "", 204


@boxes_bp.route("/<int:box_no>/usage", methods=["GET"])
@api.validate(resp=SpectreeResponse(HTTP_200=BoxUsageStatsSchema, HTTP_404=ErrorResponseSchema))
@handle_api_errors
def get_box_usage(box_no: int):
    """Get usage statistics for a specific box."""
    usage_stats = BoxService.calculate_box_usage(g.db, box_no)
    return BoxUsageStatsSchema(
        box_no=usage_stats.box_no,
        total_locations=usage_stats.total_locations,
        occupied_locations=usage_stats.occupied_locations,
        available_locations=usage_stats.available_locations,
        usage_percentage=usage_stats.usage_percentage
    ).model_dump()


@boxes_bp.route("/<int:box_no>/locations", methods=["GET"])
@api.validate(resp=SpectreeResponse(HTTP_200=list[LocationResponseSchema], HTTP_404=ErrorResponseSchema))
@handle_api_errors
def get_box_locations(box_no: int):
    """Get all locations in box.
    
    Query parameters:
    - include_parts (bool): Include part assignment data for each location (default: false)
    """
    include_parts = request.args.get("include_parts", "false").lower() == "true"
    
    if include_parts:
        # Use enhanced service method with part data
        locations_with_parts = BoxService.get_box_locations_with_parts(g.db, box_no)
        result = []
        for location_data in locations_with_parts:
            # Convert PartAssignmentData to PartAssignmentSchema
            part_assignments = [
                PartAssignmentSchema(
                    id4=part.id4,
                    qty=part.qty,
                    manufacturer_code=part.manufacturer_code,
                    description=part.description
                )
                for part in location_data.part_assignments
            ]
            
            location_response = LocationWithPartResponseSchema(
                box_no=location_data.box_no,
                loc_no=location_data.loc_no,
                is_occupied=location_data.is_occupied,
                part_assignments=part_assignments if part_assignments else None
            )
            result.append(location_response.model_dump())
        return result
    else:
        # Use existing logic for basic location data
        box = BoxService.get_box(g.db, box_no)
        return [
            LocationResponseSchema.model_validate(location).model_dump()
            for location in box.locations
        ]
