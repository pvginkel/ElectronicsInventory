"""Inventory management API endpoints."""

from flask import Blueprint, g, request
from spectree import Response as SpectreeResponse

from app.schemas.common import ErrorResponseSchema
from app.schemas.inventory import (
    AddStockSchema,
    LocationSuggestionSchema,
    MoveStockSchema,
    RemoveStockSchema,
)
from app.schemas.part import PartLocationResponseSchema
from app.services.inventory_service import InventoryService
from app.services.part_service import PartService
from app.utils.error_handling import handle_api_errors
from app.utils.spectree_config import api

inventory_bp = Blueprint("inventory", __name__, url_prefix="/inventory")


@inventory_bp.route("/parts/<string:part_id4>/stock", methods=["POST"])
@api.validate(json=AddStockSchema, resp=SpectreeResponse(HTTP_201=PartLocationResponseSchema, HTTP_400=ErrorResponseSchema, HTTP_404=ErrorResponseSchema))
@handle_api_errors
def add_stock(part_id4: str):
    """Add stock to a location."""
    # Check if part exists (this will raise RecordNotFoundException if not found)
    PartService.get_part(g.db, part_id4)

    data = AddStockSchema.model_validate(request.get_json())

    part_location = InventoryService.add_stock(
        g.db, part_id4, data.box_no, data.loc_no, data.qty
    )

    return PartLocationResponseSchema(
        id4=part_location.part_id4,
        box_no=part_location.box_no,
        loc_no=part_location.loc_no,
        qty=part_location.qty
    ).model_dump(), 201


@inventory_bp.route("/parts/<string:part_id4>/stock", methods=["DELETE"])
@api.validate(json=RemoveStockSchema, resp=SpectreeResponse(HTTP_204=None, HTTP_400=ErrorResponseSchema, HTTP_404=ErrorResponseSchema))
@handle_api_errors
def remove_stock(part_id4: str):
    """Remove stock from a location."""
    # Check if part exists (this will raise RecordNotFoundException if not found)
    PartService.get_part(g.db, part_id4)

    data = RemoveStockSchema.model_validate(request.get_json())

    InventoryService.remove_stock(
        g.db, part_id4, data.box_no, data.loc_no, data.qty
    )
    return "", 204


@inventory_bp.route("/parts/<string:part_id4>/move", methods=["POST"])
@api.validate(json=MoveStockSchema, resp=SpectreeResponse(HTTP_204=None, HTTP_400=ErrorResponseSchema, HTTP_404=ErrorResponseSchema))
@handle_api_errors
def move_stock(part_id4: str):
    """Move stock between locations."""
    # Check if part exists (this will raise RecordNotFoundException if not found)
    PartService.get_part(g.db, part_id4)

    data = MoveStockSchema.model_validate(request.get_json())

    InventoryService.move_stock(
        g.db,
        part_id4,
        data.from_box_no,
        data.from_loc_no,
        data.to_box_no,
        data.to_loc_no,
        data.qty,
    )
    return "", 204


@inventory_bp.route("/suggestions/<int:type_id>", methods=["GET"])
@api.validate(resp=SpectreeResponse(HTTP_200=LocationSuggestionSchema, HTTP_404=ErrorResponseSchema))
@handle_api_errors
def get_location_suggestion(type_id: int):
    """Get location suggestions for part type."""
    box_no, loc_no = InventoryService.suggest_location(g.db, type_id)
    return LocationSuggestionSchema(box_no=box_no, loc_no=loc_no).model_dump()
