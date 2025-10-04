"""Shopping list line item API endpoints."""

from dependency_injector.wiring import Provide, inject
from flask import Blueprint, request
from spectree import Response as SpectreeResponse

from app.exceptions import InvalidOperationException
from app.models.shopping_list_line import ShoppingListLineStatus
from app.schemas.common import ErrorResponseSchema
from app.schemas.shopping_list import ShoppingListLinesResponseSchema
from app.schemas.shopping_list_line import (
    ShoppingListGroupOrderSchema,
    ShoppingListLineCreateSchema,
    ShoppingListLineListSchema,
    ShoppingListLineOrderSchema,
    ShoppingListLineResponseSchema,
    ShoppingListLineStatusUpdateSchema,
    ShoppingListLineUpdateSchema,
)
from app.services.container import ServiceContainer
from app.utils.error_handling import handle_api_errors
from app.utils.request_parsing import parse_bool_query_param
from app.utils.spectree_config import api

shopping_list_lines_bp = Blueprint("shopping_list_lines", __name__)
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
        seller_id_provided="seller_id" in updates,
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
    include_done = parse_bool_query_param(
        request.args.get("include_done"),
        default=True,
    )
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


@shopping_list_lines_bp.route(
    "/shopping-list-lines/<int:line_id>/order",
    methods=["POST"],
)
@api.validate(
    json=ShoppingListLineOrderSchema,
    resp=SpectreeResponse(
        HTTP_200=ShoppingListLineResponseSchema,
        HTTP_400=ErrorResponseSchema,
        HTTP_404=ErrorResponseSchema,
        HTTP_409=ErrorResponseSchema,
    ),
)
@handle_api_errors
@inject
def mark_line_ordered(
    line_id: int,
    shopping_list_line_service=Provide[ServiceContainer.shopping_list_line_service],
):
    """Mark a single shopping list line as ordered."""
    data = ShoppingListLineOrderSchema.model_validate(request.get_json() or {})
    line = shopping_list_line_service.set_line_ordered(
        line_id,
        ordered_qty=data.ordered_qty,
        comment=data.comment,
    )
    return ShoppingListLineResponseSchema.model_validate(line).model_dump()


@shopping_list_lines_bp.route(
    "/shopping-list-lines/<int:line_id>/revert",
    methods=["POST"],
)
@api.validate(
    json=ShoppingListLineStatusUpdateSchema,
    resp=SpectreeResponse(
        HTTP_200=ShoppingListLineResponseSchema,
        HTTP_400=ErrorResponseSchema,
        HTTP_404=ErrorResponseSchema,
        HTTP_409=ErrorResponseSchema,
    ),
)
@handle_api_errors
@inject
def revert_line_to_new(
    line_id: int,
    shopping_list_line_service=Provide[ServiceContainer.shopping_list_line_service],
):
    """Revert an ordered line back to NEW status."""
    data = ShoppingListLineStatusUpdateSchema.model_validate(request.get_json())
    if data.status != ShoppingListLineStatus.NEW:
        raise InvalidOperationException(
            "revert line to new",
            "request payload must set status to 'new'",
        )
    line = shopping_list_line_service.set_line_new(line_id)
    return ShoppingListLineResponseSchema.model_validate(line).model_dump()


@shopping_list_lines_bp.route(
    "/shopping-lists/<int:list_id>/seller-groups/<group_ref>/order",
    methods=["POST"],
)
@api.validate(
    json=ShoppingListGroupOrderSchema,
    resp=SpectreeResponse(
        HTTP_200=list[ShoppingListLineResponseSchema],
        HTTP_400=ErrorResponseSchema,
        HTTP_404=ErrorResponseSchema,
        HTTP_409=ErrorResponseSchema,
    ),
)
@handle_api_errors
@inject
def mark_group_ordered(
    list_id: int,
    group_ref: str,
    shopping_list_line_service=Provide[ServiceContainer.shopping_list_line_service],
):
    """Mark all lines in a seller grouping as ordered."""
    data = ShoppingListGroupOrderSchema.model_validate(request.get_json())
    if group_ref == "ungrouped":
        seller_id: int | None = None
    else:
        try:
            seller_id = int(group_ref)
        except ValueError as exc:
            raise InvalidOperationException(
                "mark seller group ordered",
                "seller group reference must be an integer or 'ungrouped'",
            ) from exc

    ordered_map = {line.line_id: line.ordered_qty for line in data.lines}
    updated_lines = shopping_list_line_service.set_group_ordered(
        list_id,
        seller_id,
        ordered_map,
    )
    return [
        ShoppingListLineResponseSchema.model_validate(line).model_dump()
        for line in updated_lines
    ]
