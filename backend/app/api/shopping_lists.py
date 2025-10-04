"""Shopping list API endpoints."""

from dependency_injector.wiring import Provide, inject
from flask import Blueprint, request
from spectree import Response as SpectreeResponse

from app.schemas.common import ErrorResponseSchema
from app.schemas.shopping_list import (
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
from app.utils.error_handling import handle_api_errors
from app.utils.request_parsing import parse_bool_query_param
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
@handle_api_errors
@inject
def create_shopping_list(
    shopping_list_service=Provide[ServiceContainer.shopping_list_service],
):
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
@handle_api_errors
@inject
def list_shopping_lists(
    shopping_list_service=Provide[ServiceContainer.shopping_list_service],
):
    """List shopping lists, optionally including completed ones."""
    include_done = parse_bool_query_param(
        request.args.get("include_done"),
        default=False,
    )
    shopping_lists = shopping_list_service.list_lists(include_done=include_done)
    return [
        ShoppingListListSchema.model_validate(shopping_list).model_dump()
        for shopping_list in shopping_lists
    ]


@shopping_lists_bp.route("/<int:list_id>", methods=["GET"])
@api.validate(
    resp=SpectreeResponse(
        HTTP_200=ShoppingListResponseSchema,
        HTTP_404=ErrorResponseSchema,
    ),
)
@handle_api_errors
@inject
def get_shopping_list(
    list_id: int,
    shopping_list_service=Provide[ServiceContainer.shopping_list_service],
):
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
@handle_api_errors
@inject
def update_shopping_list(
    list_id: int,
    shopping_list_service=Provide[ServiceContainer.shopping_list_service],
):
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
@handle_api_errors
@inject
def delete_shopping_list(
    list_id: int,
    shopping_list_service=Provide[ServiceContainer.shopping_list_service],
):
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
@handle_api_errors
@inject
def update_shopping_list_status(
    list_id: int,
    shopping_list_service=Provide[ServiceContainer.shopping_list_service],
):
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
@handle_api_errors
@inject
def upsert_seller_order_note(
    list_id: int,
    seller_id: int,
    shopping_list_service=Provide[ServiceContainer.shopping_list_service],
):
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
