"""Shopping list API endpoints."""

from typing import Any

from dependency_injector.wiring import Provide, inject
from flask import Blueprint, request
from spectree import Response as SpectreeResponse

from app.exceptions import InvalidOperationException
from app.models.shopping_list import ShoppingListStatus
from app.schemas.common import ErrorResponseSchema
from app.schemas.shopping_list import (
    KitChipSchema,
    ShoppingListCreateSchema,
    ShoppingListListQuerySchema,
    ShoppingListListSchema,
    ShoppingListResponseSchema,
    ShoppingListStatusUpdateSchema,
    ShoppingListUpdateSchema,
)
from app.schemas.shopping_list_seller_note import (
    ShoppingListSellerOrderNoteSchema,
    ShoppingListSellerOrderNoteUpdateSchema,
)
from app.services.container import ServiceContainer
from app.services.kit_shopping_list_service import KitShoppingListService
from app.services.shopping_list_service import ShoppingListService
from app.utils.request_parsing import (
    parse_bool_query_param,
    parse_enum_list_query_param,
)
from app.utils.spectree_config import api

shopping_lists_bp = Blueprint("shopping_lists", __name__, url_prefix="/shopping-lists")
@shopping_lists_bp.route("", methods=["POST"])
@api.validate(
    json=ShoppingListCreateSchema,
    resp=SpectreeResponse(
        HTTP_201=ShoppingListResponseSchema,
        HTTP_400=ErrorResponseSchema,
        HTTP_409=ErrorResponseSchema,
    ),
)
@inject
def create_shopping_list(
    shopping_list_service: ShoppingListService = Provide[ServiceContainer.shopping_list_service],
) -> Any:
    """Create a new shopping list."""
    data = ShoppingListCreateSchema.model_validate(request.get_json())
    shopping_list = shopping_list_service.create_list(
        name=data.name,
        description=data.description,
    )
    return (
        ShoppingListResponseSchema.model_validate(shopping_list).model_dump(),
        201,
    )


@shopping_lists_bp.route("", methods=["GET"])
@api.validate(
    query=ShoppingListListQuerySchema,
    resp=SpectreeResponse(
        HTTP_200=list[ShoppingListListSchema],
    ),
)
@inject
def list_shopping_lists(
    shopping_list_service: ShoppingListService = Provide[ServiceContainer.shopping_list_service],
) -> Any:
    """List shopping lists, optionally including completed ones."""
    include_done = parse_bool_query_param(
        request.args.get("include_done"),
        default=False,
    )
    raw_status_params = request.args.getlist("status")
    statuses: list[ShoppingListStatus] | None = None
    if raw_status_params:
        try:
            parsed_statuses = parse_enum_list_query_param(
                raw_status_params,
                ShoppingListStatus,
            )
        except ValueError as exc:
            raise InvalidOperationException("list shopping lists", str(exc)) from exc
        statuses = parsed_statuses

    shopping_lists = shopping_list_service.list_lists(
        include_done=include_done,
        statuses=statuses,
    )
    return [
        ShoppingListListSchema.model_validate(shopping_list).model_dump()
        for shopping_list in shopping_lists
    ]


@shopping_lists_bp.route("/<int:list_id>/kits", methods=["GET"])
@api.validate(
    resp=SpectreeResponse(
        HTTP_200=list[KitChipSchema],
        HTTP_404=ErrorResponseSchema,
    ),
)
@inject
def list_kits_for_shopping_list(
    list_id: int,
    kit_shopping_list_service: KitShoppingListService = Provide[ServiceContainer.kit_shopping_list_service],
) -> Any:
    """Return kits linked to a shopping list."""
    links = kit_shopping_list_service.list_kits_for_shopping_list(list_id)
    return [
        KitChipSchema.model_validate(link).model_dump()
        for link in links
    ]


@shopping_lists_bp.route("/<int:list_id>", methods=["GET"])
@api.validate(
    resp=SpectreeResponse(
        HTTP_200=ShoppingListResponseSchema,
        HTTP_404=ErrorResponseSchema,
    ),
)
@inject
def get_shopping_list(
    list_id: int,
    shopping_list_service: ShoppingListService = Provide[ServiceContainer.shopping_list_service],
) -> Any:
    """Fetch a shopping list and its line items."""
    shopping_list = shopping_list_service.get_list(list_id)
    return ShoppingListResponseSchema.model_validate(shopping_list).model_dump()


@shopping_lists_bp.route("/<int:list_id>", methods=["PUT"])
@api.validate(
    json=ShoppingListUpdateSchema,
    resp=SpectreeResponse(
        HTTP_200=ShoppingListResponseSchema,
        HTTP_400=ErrorResponseSchema,
        HTTP_404=ErrorResponseSchema,
        HTTP_409=ErrorResponseSchema,
    ),
)
@inject
def update_shopping_list(
    list_id: int,
    shopping_list_service: ShoppingListService = Provide[ServiceContainer.shopping_list_service],
) -> Any:
    """Update the metadata for a shopping list."""
    data = ShoppingListUpdateSchema.model_validate(request.get_json())
    updates = data.model_dump(exclude_unset=True)
    shopping_list = shopping_list_service.update_list(
        list_id=list_id,
        name=updates.get("name"),
        description=updates.get("description"),
    )
    return ShoppingListResponseSchema.model_validate(shopping_list).model_dump()


@shopping_lists_bp.route("/<int:list_id>", methods=["DELETE"])
@api.validate(
    resp=SpectreeResponse(
        HTTP_204=None,
        HTTP_404=ErrorResponseSchema,
    ),
)
@inject
def delete_shopping_list(
    list_id: int,
    shopping_list_service: ShoppingListService = Provide[ServiceContainer.shopping_list_service],
) -> Any:
    """Delete a shopping list and its line items."""
    shopping_list_service.delete_list(list_id)
    return "", 204


@shopping_lists_bp.route("/<int:list_id>/status", methods=["PUT"])
@api.validate(
    json=ShoppingListStatusUpdateSchema,
    resp=SpectreeResponse(
        HTTP_200=ShoppingListResponseSchema,
        HTTP_400=ErrorResponseSchema,
        HTTP_404=ErrorResponseSchema,
        HTTP_409=ErrorResponseSchema,
    ),
)
@inject
def update_shopping_list_status(
    list_id: int,
    shopping_list_service: ShoppingListService = Provide[ServiceContainer.shopping_list_service],
) -> Any:
    """Update the workflow status for a shopping list."""
    data = ShoppingListStatusUpdateSchema.model_validate(request.get_json())
    shopping_list = shopping_list_service.set_list_status(
        list_id=list_id,
        status=data.status,
    )
    return ShoppingListResponseSchema.model_validate(shopping_list).model_dump()


@shopping_lists_bp.route(
    "/<int:list_id>/seller-groups/<int:seller_id>/order-note",
    methods=["PUT"],
)
@api.validate(
    json=ShoppingListSellerOrderNoteUpdateSchema,
    resp=SpectreeResponse(
        HTTP_200=ShoppingListSellerOrderNoteSchema,
        HTTP_204=None,
        HTTP_400=ErrorResponseSchema,
        HTTP_404=ErrorResponseSchema,
        HTTP_409=ErrorResponseSchema,
    ),
)
@inject
def upsert_seller_order_note(
    list_id: int,
    seller_id: int,
    shopping_list_service: ShoppingListService = Provide[ServiceContainer.shopping_list_service],
) -> Any:
    """Create, update, or delete a seller order note for a Ready view seller group."""
    data = ShoppingListSellerOrderNoteUpdateSchema.model_validate(
        request.get_json()
    )
    note = shopping_list_service.upsert_seller_note(
        list_id=list_id,
        seller_id=seller_id,
        note=data.note,
    )

    if note is None:
        return "", 204

    return ShoppingListSellerOrderNoteSchema.model_validate(note).model_dump()
