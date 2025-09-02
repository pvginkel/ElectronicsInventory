"""Parts management API endpoints."""

from dependency_injector.wiring import Provide, inject
from flask import Blueprint, request
from spectree import Response as SpectreeResponse

from app.schemas.common import ErrorResponseSchema
from app.schemas.part import (
    PartCreateSchema,
    PartLocationListSchema,
    PartLocationResponseSchema,
    PartResponseSchema,
    PartUpdateSchema,
    PartWithTotalAndLocationsSchema,
    PartWithTotalSchema,
)
from app.schemas.quantity_history import QuantityHistoryResponseSchema
from app.services.container import ServiceContainer
from app.utils.error_handling import handle_api_errors
from app.utils.spectree_config import api

parts_bp = Blueprint("parts", __name__, url_prefix="/parts")


def _convert_part_to_schema_data(part, total_quantity: int) -> dict:
    """Convert Part model to PartWithTotalSchema data dict."""
    return {
        "key": part.key,
        "manufacturer_code": part.manufacturer_code,
        "description": part.description,
        "type_id": part.type_id,
        "tags": part.tags,
        "manufacturer": part.manufacturer,
        "seller": part.seller,
        "seller_link": part.seller_link,
        "package": part.package,
        "pin_count": part.pin_count,
        "voltage_rating": part.voltage_rating,
        "mounting_type": part.mounting_type,
        "series": part.series,
        "dimensions": part.dimensions,
        "created_at": part.created_at,
        "updated_at": part.updated_at,
        "total_quantity": total_quantity
    }


@parts_bp.route("", methods=["POST"])
@api.validate(json=PartCreateSchema, resp=SpectreeResponse(HTTP_201=PartResponseSchema, HTTP_400=ErrorResponseSchema))
@handle_api_errors
@inject
def create_part(part_service=Provide[ServiceContainer.part_service]):
    """Create new part."""
    data = PartCreateSchema.model_validate(request.get_json())
    part = part_service.create_part(
        description=data.description,
        manufacturer_code=data.manufacturer_code,
        type_id=data.type_id,
        tags=data.tags,
        manufacturer=data.manufacturer,
        product_page=data.product_page,
        seller=data.seller,
        seller_link=data.seller_link,
        package=data.package,
        pin_count=data.pin_count,
        voltage_rating=data.voltage_rating,
        mounting_type=data.mounting_type,
        series=data.series,
        dimensions=data.dimensions,
    )

    return PartResponseSchema.model_validate(part).model_dump(), 201


@parts_bp.route("", methods=["GET"])
@api.validate(resp=SpectreeResponse(HTTP_200=list[PartWithTotalSchema]))
@handle_api_errors
@inject
def list_parts(inventory_service=Provide[ServiceContainer.inventory_service]):
    """List parts with pagination and total quantities."""
    limit = int(request.args.get("limit", 50))
    offset = int(request.args.get("offset", 0))
    type_filter = request.args.get("type_id", type=int)

    # Get parts with calculated total quantities only
    parts_with_totals = inventory_service.get_all_parts_with_totals(limit, offset, type_filter)

    result = []
    for part_with_total in parts_with_totals:
        part = part_with_total.part
        total_qty = part_with_total.total_quantity

        # Convert using helper function
        part_data = _convert_part_to_schema_data(part, total_qty)
        result.append(part_data)

    return result


@parts_bp.route("/with-locations", methods=["GET"])
@api.validate(resp=SpectreeResponse(HTTP_200=list[PartWithTotalAndLocationsSchema]))
@handle_api_errors
@inject
def list_parts_with_locations(inventory_service=Provide[ServiceContainer.inventory_service]):
    """List parts with pagination, total quantities, and location details."""
    limit = int(request.args.get("limit", 50))
    offset = int(request.args.get("offset", 0))
    type_filter = request.args.get("type_id", type=int)

    # Get parts with calculated total quantities and location data
    parts_with_totals = inventory_service.get_all_parts_with_totals_and_locations(limit, offset, type_filter)

    result = []
    for part_with_total in parts_with_totals:
        part = part_with_total.part
        total_qty = part_with_total.total_quantity

        # Extract location data from part._part_locations_data (manually attached by service)
        locations = []
        part_locations_data = getattr(part, '_part_locations_data', [])
        for part_location in part_locations_data:
            location_data = PartLocationListSchema(
                box_no=part_location.box_no,
                loc_no=part_location.loc_no,
                qty=part_location.qty
            )
            locations.append(location_data)

        # Create schema instance with calculated total and locations
        part_data = _convert_part_to_schema_data(part, total_qty)
        part_data["locations"] = [loc.model_dump() for loc in locations]
        result.append(part_data)

    return result


@parts_bp.route("/<string:part_key>", methods=["GET"])
@api.validate(resp=SpectreeResponse(HTTP_200=PartResponseSchema, HTTP_404=ErrorResponseSchema))
@handle_api_errors
@inject
def get_part(part_key: str, part_service=Provide[ServiceContainer.part_service]):
    """Get single part with full details."""
    part = part_service.get_part(part_key)
    return PartResponseSchema.model_validate(part).model_dump()


@parts_bp.route("/<string:part_key>", methods=["PUT"])
@api.validate(json=PartUpdateSchema, resp=SpectreeResponse(HTTP_200=PartResponseSchema, HTTP_400=ErrorResponseSchema, HTTP_404=ErrorResponseSchema))
@handle_api_errors
@inject
def update_part(part_key: str, part_service=Provide[ServiceContainer.part_service]):
    """Update part details."""
    data = PartUpdateSchema.model_validate(request.get_json())

    part = part_service.update_part_details(
        part_key,
        manufacturer_code=data.manufacturer_code,
        type_id=data.type_id,
        description=data.description,
        tags=data.tags,
        manufacturer=data.manufacturer,
        product_page=data.product_page,
        seller=data.seller,
        seller_link=data.seller_link,
        package=data.package,
        pin_count=data.pin_count,
        voltage_rating=data.voltage_rating,
        mounting_type=data.mounting_type,
        series=data.series,
        dimensions=data.dimensions,
    )

    return PartResponseSchema.model_validate(part).model_dump()


@parts_bp.route("/<string:part_key>", methods=["DELETE"])
@api.validate(resp=SpectreeResponse(HTTP_204=None, HTTP_404=ErrorResponseSchema, HTTP_409=ErrorResponseSchema))
@handle_api_errors
@inject
def delete_part(part_key: str, part_service=Provide[ServiceContainer.part_service]):
    """Delete part if total quantity is zero."""
    part_service.delete_part(part_key)
    return "", 204


@parts_bp.route("/<string:part_key>/locations", methods=["GET"])
@api.validate(resp=SpectreeResponse(HTTP_200=list[PartLocationResponseSchema], HTTP_404=ErrorResponseSchema))
@handle_api_errors
@inject
def get_part_locations(part_key: str, part_service=Provide[ServiceContainer.part_service], inventory_service=Provide[ServiceContainer.inventory_service]):
    """Get all locations for a part."""
    # Ensure part exists
    part = part_service.get_part(part_key)
    locations = inventory_service.get_part_locations(part_key)

    return [
        PartLocationResponseSchema(
            key=part.key,
            box_no=loc.box_no,
            loc_no=loc.loc_no,
            qty=loc.qty
        ).model_dump()
        for loc in locations
    ]


@parts_bp.route("/<string:part_key>/history", methods=["GET"])
@api.validate(resp=SpectreeResponse(HTTP_200=list[QuantityHistoryResponseSchema], HTTP_404=ErrorResponseSchema))
@handle_api_errors
@inject
def get_part_history(part_key: str, part_service=Provide[ServiceContainer.part_service]):
    """Get quantity change history for a part."""
    # Ensure part exists first
    part = part_service.get_part(part_key)

    # Query history directly instead of relying on relationship
    from sqlalchemy import select

    from app.models.quantity_history import QuantityHistory

    db_session = part_service.db
    stmt = select(QuantityHistory).where(QuantityHistory.part_id == part.id).order_by(QuantityHistory.timestamp.desc())
    history_records = list(db_session.execute(stmt).scalars().all())

    return [
        QuantityHistoryResponseSchema.model_validate(history).model_dump()
        for history in history_records
    ]
