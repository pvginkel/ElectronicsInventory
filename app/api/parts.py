"""Parts management API endpoints."""

from typing import Any

from dependency_injector.wiring import Provide, inject
from flask import Blueprint, request
from spectree import Response as SpectreeResponse

from app.schemas.common import ErrorResponseSchema
from app.schemas.kit_reservations import (
    KitReservationEntrySchema,
    PartKitReservationsResponseSchema,
)
from app.schemas.part import (
    PartCreateSchema,
    PartLocationListSchema,
    PartLocationResponseSchema,
    PartResponseSchema,
    PartUpdateSchema,
    PartWithTotalSchema,
)
from app.schemas.part_kits import PartKitUsageSchema
from app.schemas.part_shopping_list import (
    PartShoppingListMembershipCreateSchema,
    PartShoppingListMembershipQueryItemSchema,
    PartShoppingListMembershipQueryRequestSchema,
    PartShoppingListMembershipQueryResponseSchema,
    PartShoppingListMembershipSchema,
)
from app.schemas.quantity_history import QuantityHistoryResponseSchema
from app.services.container import ServiceContainer
from app.services.inventory_service import InventoryService
from app.services.kit_reservation_service import KitReservationService
from app.services.metrics_service import MetricsService
from app.services.part_service import PartService
from app.services.shopping_list_line_service import ShoppingListLineService
from app.services.shopping_list_service import ShoppingListService
from app.utils.error_handling import handle_api_errors
from app.utils.spectree_config import api

parts_bp = Blueprint("parts", __name__, url_prefix="/parts")


class IncludeParameterError(Exception):
    """Exception raised for invalid include parameter values."""
    def __init__(self, message: str):
        self.message = message
        super().__init__(message)


def _parse_include_parameter(include_param: str | None) -> tuple[bool, bool, bool, bool]:
    """Parse and validate the include query parameter.

    Args:
        include_param: Comma-separated string of include flags

    Returns:
        Tuple of (include_locations, include_kits, include_shopping_lists, include_cover)

    Raises:
        IncludeParameterError: If include parameter is invalid or too long
    """
    if not include_param:
        return (False, False, False, False)

    # DoS protection: reject if parameter is too long
    if len(include_param) > 200:
        raise IncludeParameterError("include parameter exceeds maximum length of 200 characters")

    # Split and validate tokens
    tokens = [token.strip() for token in include_param.split(",")]

    # DoS protection: reject if too many tokens
    if len(tokens) > 10:
        raise IncludeParameterError("include parameter exceeds maximum of 10 tokens")

    # Validate against allowed values
    allowed_values = {"locations", "kits", "shopping_lists", "cover"}
    for token in tokens:
        if token and token not in allowed_values:
            raise IncludeParameterError(f"invalid include value '{token}'. Allowed values: {', '.join(sorted(allowed_values))}")

    # Return flags
    include_locations = "locations" in tokens
    include_kits = "kits" in tokens
    include_shopping_lists = "shopping_lists" in tokens
    include_cover = "cover" in tokens

    return (include_locations, include_kits, include_shopping_lists, include_cover)


def _convert_part_to_schema_data(part: Any, total_quantity: int) -> dict[str, Any]:
    """Convert Part model to PartWithTotalSchema data dict."""
    # Convert seller relationship to proper schema format
    seller_data = None
    if part.seller:
        seller_data = {
            "id": part.seller.id,
            "name": part.seller.name,
            "website": part.seller.website
        }

    # Convert datetimes to ISO format strings for JSON serialization
    created_at = part.created_at.isoformat() if part.created_at else None
    updated_at = part.updated_at.isoformat() if part.updated_at else None

    return {
        "key": part.key,
        "manufacturer_code": part.manufacturer_code,
        "description": part.description,
        "type_id": part.type_id,
        "tags": part.tags,
        "manufacturer": part.manufacturer,
        "seller": seller_data,
        "seller_link": part.seller_link,
        "cover_url": part.cover_url,
        "package": part.package,
        "pin_count": part.pin_count,
        "pin_pitch": part.pin_pitch,
        "voltage_rating": part.voltage_rating,
        "input_voltage": part.input_voltage,
        "output_voltage": part.output_voltage,
        "mounting_type": part.mounting_type,
        "series": part.series,
        "dimensions": part.dimensions,
        "created_at": created_at,
        "updated_at": updated_at,
        "total_quantity": total_quantity
    }


@parts_bp.route("", methods=["POST"])
@api.validate(json=PartCreateSchema, resp=SpectreeResponse(HTTP_201=PartResponseSchema, HTTP_400=ErrorResponseSchema))
@handle_api_errors
@inject
def create_part(part_service: PartService = Provide[ServiceContainer.part_service]) -> Any:
    """Create new part."""
    data = PartCreateSchema.model_validate(request.get_json())
    part = part_service.create_part(
        description=data.description,
        manufacturer_code=data.manufacturer_code,
        type_id=data.type_id,
        tags=data.tags,
        manufacturer=data.manufacturer,
        product_page=data.product_page,
        seller_id=data.seller_id,
        seller_link=data.seller_link,
        package=data.package,
        pin_count=data.pin_count,
        pin_pitch=data.pin_pitch,
        voltage_rating=data.voltage_rating,
        input_voltage=data.input_voltage,
        output_voltage=data.output_voltage,
        mounting_type=data.mounting_type,
        series=data.series,
        dimensions=data.dimensions,
    )

    return PartResponseSchema.model_validate(part).model_dump(), 201


@parts_bp.route("", methods=["GET"])
@api.validate(resp=SpectreeResponse(HTTP_200=list[PartWithTotalSchema], HTTP_400=ErrorResponseSchema))
@handle_api_errors
@inject
def list_parts(inventory_service: InventoryService = Provide[ServiceContainer.inventory_service]) -> Any:
    """List parts with pagination, total quantities, and optional related data.

    Query Parameters:
        limit: Maximum number of parts to return (default: 50)
        offset: Number of parts to skip (default: 0)
        type_id: Filter by part type ID (optional)
        include: Comma-separated list of optional data to include (optional)
            - locations: Include location details
            - kits: Include kit memberships
            - shopping_lists: Include shopping list memberships
            - cover: Include cover attachment URLs
    """
    limit = int(request.args.get("limit", 50))
    offset = int(request.args.get("offset", 0))
    type_filter = request.args.get("type_id", type=int)
    include_param = request.args.get("include", type=str)

    # Parse include parameter - return 400 on validation errors
    try:
        include_locations, include_kits, include_shopping_lists, include_cover = _parse_include_parameter(include_param)
    except IncludeParameterError as e:
        return {
            "error": "Invalid parameter",
            "details": {"message": e.message}
        }, 400

    # Get parts with calculated total quantities and optional bulk-loaded data
    parts_with_totals = inventory_service.get_all_parts_with_totals(
        limit=limit,
        offset=offset,
        type_id=type_filter,
        include_locations=include_locations,
        include_kits=include_kits,
        include_shopping_lists=include_shopping_lists,
        include_cover=include_cover,
    )

    result = []
    for part_with_total in parts_with_totals:
        part = part_with_total.part
        total_qty = part_with_total.total_quantity

        # Convert using helper function
        part_data = _convert_part_to_schema_data(part, total_qty)

        # Add locations if requested
        if include_locations:
            locations = []
            part_locations_data = getattr(part, '_part_locations_data', [])
            for part_location in part_locations_data:
                location_data = PartLocationListSchema(
                    box_no=part_location.box_no,
                    loc_no=part_location.loc_no,
                    qty=part_location.qty
                )
                locations.append(location_data.model_dump())
            part_data["locations"] = locations

        # Add kit memberships if requested
        if include_kits:
            from app.schemas.part_kits import PartKitUsageSchema
            kits = []
            kit_reservations_data = getattr(part, '_kit_reservations_data', [])
            for reservation in kit_reservations_data:
                kit_data = PartKitUsageSchema.model_validate(reservation)
                kits.append(kit_data.model_dump())
            part_data["kits"] = kits

        # Add shopping list memberships if requested
        if include_shopping_lists:
            from app.schemas.part_shopping_list import PartShoppingListMembershipSchema
            shopping_lists = []
            shopping_list_memberships_data = getattr(part, '_shopping_list_memberships_data', [])
            for line in shopping_list_memberships_data:
                membership = PartShoppingListMembershipSchema.from_line(line)
                shopping_lists.append(membership.model_dump())
            part_data["shopping_lists"] = shopping_lists

        # Validate through schema to compute cover_url and exclude internal fields
        validated_data = PartWithTotalSchema.model_validate(part_data).model_dump()
        result.append(validated_data)

    return result


@parts_bp.route("/<string:part_key>", methods=["GET"])
@api.validate(resp=SpectreeResponse(HTTP_200=PartResponseSchema, HTTP_404=ErrorResponseSchema))
@handle_api_errors
@inject
def get_part(
    part_key: str,
    part_service: PartService = Provide[ServiceContainer.part_service],
    kit_reservation_service: KitReservationService = Provide[ServiceContainer.kit_reservation_service],
) -> Any:
    """Get single part with full details."""
    part = part_service.get_part(part_key)
    reservations = kit_reservation_service.list_active_reservations_for_part(part.id)
    part_schema = PartResponseSchema.model_validate(part)
    return part_schema.model_copy(
        update={"used_in_kits": bool(reservations)}
    ).model_dump()


@parts_bp.route("/<string:part_key>/kits", methods=["GET"])
@api.validate(
    resp=SpectreeResponse(
        HTTP_200=list[PartKitUsageSchema],
        HTTP_404=ErrorResponseSchema,
    )
)
@handle_api_errors
@inject
def list_part_kits(
    part_key: str,
    kit_reservation_service: KitReservationService = Provide[ServiceContainer.kit_reservation_service],
    metrics_service: MetricsService = Provide[ServiceContainer.metrics_service],
) -> Any:
    """List active kits consuming the specified part."""
    usage_entries = kit_reservation_service.list_kits_for_part(part_key)
    has_results = bool(usage_entries)
    metrics_service.record_part_kit_usage_request(has_results=has_results)

    return [
        PartKitUsageSchema.model_validate(entry).model_dump()
        for entry in usage_entries
    ]


@parts_bp.route("/<string:part_key>/kit-reservations", methods=["GET"])
@api.validate(
    resp=SpectreeResponse(
        HTTP_200=PartKitReservationsResponseSchema,
        HTTP_404=ErrorResponseSchema,
    )
)
@handle_api_errors
@inject
def get_part_kit_reservations(
    part_key: str,
    part_service: PartService = Provide[ServiceContainer.part_service],
    kit_reservation_service: KitReservationService = Provide[ServiceContainer.kit_reservation_service],
) -> Any:
    """Return active kit reservations for the specified part."""
    part = part_service.get_part(part_key)
    reservations = kit_reservation_service.list_active_reservations_for_part(
        part.id
    )
    response = PartKitReservationsResponseSchema(
        part_id=part.id,
        part_key=part.key,
        part_description=part.description,
        total_reserved=sum(entry.reserved_quantity for entry in reservations),
        active_reservations=[
            KitReservationEntrySchema.model_validate(entry) for entry in reservations
        ],
    )
    return response.model_dump()


@parts_bp.route("/<string:part_key>", methods=["PUT"])
@api.validate(json=PartUpdateSchema, resp=SpectreeResponse(HTTP_200=PartResponseSchema, HTTP_400=ErrorResponseSchema, HTTP_404=ErrorResponseSchema))
@handle_api_errors
@inject
def update_part(part_key: str, part_service: PartService = Provide[ServiceContainer.part_service]) -> Any:
    """Update part details."""
    data = PartUpdateSchema.model_validate(request.get_json())

    # Only pass fields that were explicitly provided in the request
    update_fields = data.model_dump(exclude_unset=True)
    part = part_service.update_part_details(part_key, **update_fields)

    return PartResponseSchema.model_validate(part).model_dump()


@parts_bp.route("/<string:part_key>", methods=["DELETE"])
@api.validate(resp=SpectreeResponse(HTTP_204=None, HTTP_404=ErrorResponseSchema, HTTP_409=ErrorResponseSchema))
@handle_api_errors
@inject
def delete_part(part_key: str, part_service: PartService = Provide[ServiceContainer.part_service]) -> Any:
    """Delete part if total quantity is zero."""
    part_service.delete_part(part_key)
    return "", 204


@parts_bp.route("/shopping-list-memberships/query", methods=["POST"])
@api.validate(
    json=PartShoppingListMembershipQueryRequestSchema,
    resp=SpectreeResponse(
        HTTP_200=PartShoppingListMembershipQueryResponseSchema,
        HTTP_400=ErrorResponseSchema,
        HTTP_404=ErrorResponseSchema,
    ),
)
@handle_api_errors
@inject
def query_part_shopping_list_memberships(
    part_service: PartService = Provide[ServiceContainer.part_service],
    shopping_list_service: ShoppingListService = Provide[ServiceContainer.shopping_list_service],
) -> Any:
    """Bulk lookup of shopping list memberships for multiple parts."""
    payload = PartShoppingListMembershipQueryRequestSchema.model_validate(request.get_json())

    include_done = bool(payload.include_done)
    key_id_pairs = part_service.get_part_ids_by_keys(payload.part_keys)
    part_ids = [part_id for _, part_id in key_id_pairs]

    memberships_by_part = shopping_list_service.list_part_memberships_bulk(
        part_ids,
        include_done=include_done,
    )

    response_items: list[PartShoppingListMembershipQueryItemSchema] = []
    for part_key, part_id in key_id_pairs:
        line_memberships = memberships_by_part.get(part_id, [])
        membership_schemas = [
            PartShoppingListMembershipSchema.from_line(line)
            for line in line_memberships
        ]
        response_items.append(
            PartShoppingListMembershipQueryItemSchema(
                part_key=part_key,
                memberships=membership_schemas,
            )
        )

    response = PartShoppingListMembershipQueryResponseSchema(
        memberships=response_items,
    )
    return response.model_dump()


@parts_bp.route("/<string:part_key>/shopping-list-memberships", methods=["GET"])
@api.validate(
    resp=SpectreeResponse(
        HTTP_200=list[PartShoppingListMembershipSchema],
        HTTP_404=ErrorResponseSchema,
    )
)
@handle_api_errors
@inject
def list_part_shopping_list_memberships(
    part_key: str,
    part_service: PartService = Provide[ServiceContainer.part_service],
    shopping_list_service: ShoppingListService = Provide[ServiceContainer.shopping_list_service],
) -> Any:
    """List active shopping list memberships for a part."""
    part = part_service.get_part(part_key)
    memberships = shopping_list_service.list_part_memberships(part.id)

    return [
        PartShoppingListMembershipSchema.from_line(line).model_dump()
        for line in memberships
    ]


@parts_bp.route("/<string:part_key>/shopping-list-memberships", methods=["POST"])
@api.validate(
    json=PartShoppingListMembershipCreateSchema,
    resp=SpectreeResponse(
        HTTP_201=PartShoppingListMembershipSchema,
        HTTP_400=ErrorResponseSchema,
        HTTP_404=ErrorResponseSchema,
    ),
)
@handle_api_errors
@inject
def add_part_shopping_list_membership(
    part_key: str,
    part_service: PartService = Provide[ServiceContainer.part_service],
    shopping_list_line_service: ShoppingListLineService = Provide[ServiceContainer.shopping_list_line_service],
) -> Any:
    """Add a part to a Concept shopping list and return the new membership."""
    payload = PartShoppingListMembershipCreateSchema.model_validate(request.get_json())
    part = part_service.get_part(part_key)
    line = shopping_list_line_service.add_part_to_concept_list(
        list_id=payload.shopping_list_id,
        part_id=part.id,
        needed=payload.needed,
        seller_id=payload.seller_id,
        note=payload.note,
    )

    return PartShoppingListMembershipSchema.from_line(line).model_dump(), 201


@parts_bp.route("/<string:part_key>/locations", methods=["GET"])
@api.validate(resp=SpectreeResponse(HTTP_200=list[PartLocationResponseSchema], HTTP_404=ErrorResponseSchema))
@handle_api_errors
@inject
def get_part_locations(part_key: str, part_service: PartService = Provide[ServiceContainer.part_service], inventory_service: InventoryService = Provide[ServiceContainer.inventory_service]) -> Any:
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
def get_part_history(part_key: str, part_service: PartService = Provide[ServiceContainer.part_service]) -> Any:
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
