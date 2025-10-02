"""Shopping list line item API endpoints."""

from dependency_injector.wiring import Provide, inject
from flask import Blueprint, request
from spectree import Response as SpectreeResponse

from app.schemas.common import ErrorResponseSchema
from app.schemas.shopping_list import ShoppingListLinesResponseSchema
from app.schemas.shopping_list_line import (
    ShoppingListLineCreateSchema,
    ShoppingListLineListSchema,
    ShoppingListLineResponseSchema,
    ShoppingListLineUpdateSchema,
)
from app.services.container import ServiceContainer
from app.utils.error_handling import handle_api_errors
from app.utils.spectree_config import api

shopping_list_lines_bp = Blueprint("shopping_list_lines", __name__)


def _parse_bool_query_param(param_name: str, default: bool = True) -> bool:
    """Parse boolean query parameters for line endpoints."""
    raw_value = request.args.get(param_name)
    if raw_value is None:
        return default
    return raw_value.lower() in {"true", "1", "yes", "on"}


@shopping_list_lines_bp.route("/shopping-lists/<int:list_id>/lines", methods=["POST"])
@api.validate(
    json=ShoppingListLineCreateSchema,
    resp=SpectreeResponse(
        HTTP_201=ShoppingListLineResponseSchema,
        HTTP_400=ErrorResponseSchema,
        HTTP_404=ErrorResponseSchema,
        HTTP_409=ErrorResponseSchema,
    ),
)
@handle_api_errors
@inject
def add_shopping_list_line(
    list_id: int,
    shopping_list_line_service=Provide[ServiceContainer.shopping_list_line_service],
):
    """Create a shopping list line item."""
    data = ShoppingListLineCreateSchema.model_validate(request.get_json())
    line = shopping_list_line_service.add_line(
        list_id=list_id,
        part_id=data.part_id,
        needed=data.needed,
        seller_id=data.seller_id,
        note=data.note,
    )
    return (
        ShoppingListLineResponseSchema.model_validate(line).model_dump(),
        201,
    )


@shopping_list_lines_bp.route("/shopping-list-lines/<int:line_id>", methods=["PUT"])
@api.validate(
    json=ShoppingListLineUpdateSchema,
    resp=SpectreeResponse(
        HTTP_200=ShoppingListLineResponseSchema,
        HTTP_400=ErrorResponseSchema,
        HTTP_404=ErrorResponseSchema,
        HTTP_409=ErrorResponseSchema,
    ),
)
@handle_api_errors
@inject
def update_shopping_list_line(
    line_id: int,
    shopping_list_line_service=Provide[ServiceContainer.shopping_list_line_service],
):
    """Update an existing shopping list line."""
    data = ShoppingListLineUpdateSchema.model_validate(request.get_json())
    updates = data.model_dump(exclude_unset=True)
    line = shopping_list_line_service.update_line(
        line_id=line_id,
        seller_id=updates.get("seller_id"),
        needed=updates.get("needed"),
        note=updates.get("note"),
    )
    return ShoppingListLineResponseSchema.model_validate(line).model_dump()


@shopping_list_lines_bp.route("/shopping-list-lines/<int:line_id>", methods=["DELETE"])
@api.validate(
    resp=SpectreeResponse(
        HTTP_204=None,
        HTTP_404=ErrorResponseSchema,
    ),
)
@handle_api_errors
@inject
def delete_shopping_list_line(
    line_id: int,
    shopping_list_line_service=Provide[ServiceContainer.shopping_list_line_service],
):
    """Delete a shopping list line."""
    shopping_list_line_service.delete_line(line_id)
    return "", 204


@shopping_list_lines_bp.route("/shopping-lists/<int:list_id>/lines", methods=["GET"])
@api.validate(
    resp=SpectreeResponse(
        HTTP_200=ShoppingListLinesResponseSchema,
        HTTP_404=ErrorResponseSchema,
    ),
)
@handle_api_errors
@inject
def list_shopping_list_lines(
    list_id: int,
    shopping_list_line_service=Provide[ServiceContainer.shopping_list_line_service],
):
    """List line items for a shopping list."""
    include_done = _parse_bool_query_param("include_done", default=True)
    lines = shopping_list_line_service.list_lines(
        list_id=list_id,
        include_done=include_done,
    )
    return ShoppingListLinesResponseSchema(
        lines=[
            ShoppingListLineListSchema.model_validate(line)
            for line in lines
        ]
    ).model_dump()
