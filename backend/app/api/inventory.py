"""Inventory management API endpoints."""

from flask import Blueprint, g, request
from spectree import Response as SpectreeResponse
from dependency_injector.wiring import Provide, inject

from app.schemas.common import ErrorResponseSchema
from app.schemas.inventory import (
    AddStockSchema,
    LocationSuggestionSchema,
    MoveStockSchema,
    RemoveStockSchema,
)
from app.schemas.part import PartLocationResponseSchema
from app.services.container import ServiceContainer
from app.utils.error_handling import handle_api_errors
from app.utils.spectree_config import api

inventory_bp = Blueprint("inventory", __name__, url_prefix="/inventory")


@inventory_bp.route("/parts/<string:part_key>/stock", methods=["POST"])
@api.validate(json=AddStockSchema, resp=SpectreeResponse(HTTP_201=PartLocationResponseSchema, HTTP_400=ErrorResponseSchema, HTTP_404=ErrorResponseSchema))
@handle_api_errors
@inject
def add_stock(part_key: str, part_service=Provide[ServiceContainer.part_service], inventory_service=Provide[ServiceContainer.inventory_service]):
    """Add stock to a location."""
    # Check if part exists (this will raise RecordNotFoundException if not found)
    part = part_service.get_part(part_key)

    data = AddStockSchema.model_validate(request.get_json())

    part_location = inventory_service.add_stock(
        part_key, data.box_no, data.loc_no, data.qty
    )

    return PartLocationResponseSchema(
        key=part.key,
        box_no=part_location.box_no,
        loc_no=part_location.loc_no,
        qty=part_location.qty
    ).model_dump(), 201


@inventory_bp.route("/parts/<string:part_key>/stock", methods=["DELETE"])
@api.validate(json=RemoveStockSchema, resp=SpectreeResponse(HTTP_204=None, HTTP_400=ErrorResponseSchema, HTTP_404=ErrorResponseSchema))
@handle_api_errors
@inject
def remove_stock(part_key: str, part_service=Provide[ServiceContainer.part_service], inventory_service=Provide[ServiceContainer.inventory_service]):
    """Remove stock from a location."""
    # Check if part exists (this will raise RecordNotFoundException if not found)
    part_service.get_part(part_key)

    data = RemoveStockSchema.model_validate(request.get_json())

    inventory_service.remove_stock(
        part_key, data.box_no, data.loc_no, data.qty
    )
    return "", 204


@inventory_bp.route("/parts/<string:part_key>/move", methods=["POST"])
@api.validate(json=MoveStockSchema, resp=SpectreeResponse(HTTP_204=None, HTTP_400=ErrorResponseSchema, HTTP_404=ErrorResponseSchema))
@handle_api_errors
@inject
def move_stock(part_key: str, part_service=Provide[ServiceContainer.part_service], inventory_service=Provide[ServiceContainer.inventory_service]):
    """Move stock between locations."""
    # Check if part exists (this will raise RecordNotFoundException if not found)
    part_service.get_part(part_key)

    data = MoveStockSchema.model_validate(request.get_json())

    inventory_service.move_stock(
        part_key,
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
@inject
def get_location_suggestion(type_id: int, inventory_service=Provide[ServiceContainer.inventory_service]):
    """Get location suggestions for part type."""
    box_no, loc_no = inventory_service.suggest_location(type_id)
    return LocationSuggestionSchema(box_no=box_no, loc_no=loc_no).model_dump()
