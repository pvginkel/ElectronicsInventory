"""Parts management API endpoints."""

from flask import Blueprint, g, request
from spectree import Response as SpectreeResponse

from app.schemas.common import ErrorResponseSchema
from app.schemas.part import (
    PartCreateSchema,
    PartListSchema,
    PartLocationResponseSchema,
    PartResponseSchema,
    PartUpdateSchema,
)
from app.schemas.quantity_history import QuantityHistoryResponseSchema
from app.services.inventory_service import InventoryService
from app.services.part_service import PartService
from app.utils.error_handling import handle_api_errors
from app.utils.spectree_config import api

parts_bp = Blueprint("parts", __name__, url_prefix="/parts")


@parts_bp.route("", methods=["POST"])
@api.validate(json=PartCreateSchema, resp=SpectreeResponse(HTTP_201=PartResponseSchema, HTTP_400=ErrorResponseSchema))
@handle_api_errors
def create_part():
    """Create new part."""
    data = PartCreateSchema.model_validate(request.get_json())
    part = PartService.create_part(
        g.db,
        description=data.description,
        manufacturer_code=data.manufacturer_code,
        type_id=data.type_id,
        tags=data.tags,
        seller=data.seller,
        seller_link=data.seller_link,
    )

    return PartResponseSchema.model_validate(part).model_dump(), 201


@parts_bp.route("", methods=["GET"])
@api.validate(resp=SpectreeResponse(HTTP_200=list[PartListSchema]))
@handle_api_errors
def list_parts():
    """List parts with pagination."""
    limit = int(request.args.get("limit", 50))
    offset = int(request.args.get("offset", 0))
    type_filter = request.args.get("type_id", type=int)

    # Get parts with optional type filtering
    parts = PartService.get_parts_list(g.db, limit, offset, type_filter)

    return [PartListSchema.model_validate(part).model_dump() for part in parts]


@parts_bp.route("/<string:part_id4>", methods=["GET"])
@api.validate(resp=SpectreeResponse(HTTP_200=PartResponseSchema, HTTP_404=ErrorResponseSchema))
@handle_api_errors
def get_part(part_id4: str):
    """Get single part with full details."""
    part = PartService.get_part(g.db, part_id4)
    if not part:
        return {"error": "Part not found"}, 404

    return PartResponseSchema.model_validate(part).model_dump()


@parts_bp.route("/<string:part_id4>", methods=["PUT"])
@api.validate(json=PartUpdateSchema, resp=SpectreeResponse(HTTP_200=PartResponseSchema, HTTP_400=ErrorResponseSchema, HTTP_404=ErrorResponseSchema))
@handle_api_errors
def update_part(part_id4: str):
    """Update part details."""
    data = PartUpdateSchema.model_validate(request.get_json())

    part = PartService.update_part_details(
        g.db,
        part_id4,
        manufacturer_code=data.manufacturer_code,
        type_id=data.type_id,
        description=data.description,
        tags=data.tags,
        seller=data.seller,
        seller_link=data.seller_link,
    )

    if not part:
        return {"error": "Part not found"}, 404

    return PartResponseSchema.model_validate(part).model_dump()


@parts_bp.route("/<string:part_id4>", methods=["DELETE"])
@api.validate(resp=SpectreeResponse(HTTP_204=None, HTTP_404=ErrorResponseSchema, HTTP_409=ErrorResponseSchema))
@handle_api_errors
def delete_part(part_id4: str):
    """Delete part if total quantity is zero."""
    if PartService.delete_part(g.db, part_id4):
        return "", 204
    else:
        # Check if part exists to give appropriate error
        part = PartService.get_part(g.db, part_id4)
        if not part:
            return {"error": "Part not found"}, 404
        else:
            total_qty = PartService.get_total_quantity(g.db, part_id4)
            return {"error": f"Cannot delete part with quantity {total_qty}. Remove all stock first."}, 409


@parts_bp.route("/<string:part_id4>/locations", methods=["GET"])
@api.validate(resp=SpectreeResponse(HTTP_200=list[PartLocationResponseSchema], HTTP_404=ErrorResponseSchema))
@handle_api_errors
def get_part_locations(part_id4: str):
    """Get all locations for a part."""
    part = PartService.get_part(g.db, part_id4)
    if not part:
        return {"error": "Part not found"}, 404

    locations = InventoryService.get_part_locations(g.db, part_id4)

    return [
        PartLocationResponseSchema(
            id4=loc.part_id4,
            box_no=loc.box_no,
            loc_no=loc.loc_no,
            qty=loc.qty
        ).model_dump()
        for loc in locations
    ]


@parts_bp.route("/<string:part_id4>/history", methods=["GET"])
@api.validate(resp=SpectreeResponse(HTTP_200=list[QuantityHistoryResponseSchema], HTTP_404=ErrorResponseSchema))
@handle_api_errors
def get_part_history(part_id4: str):
    """Get quantity change history for a part."""
    part = PartService.get_part(g.db, part_id4)
    if not part:
        return {"error": "Part not found"}, 404

    # History is loaded with the part via relationship
    return [
        QuantityHistoryResponseSchema.model_validate(history).model_dump()
        for history in part.quantity_history
    ]
