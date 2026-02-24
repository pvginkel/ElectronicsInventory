"""Shopping list line item API endpoints."""

from typing import Any

from dependency_injector.wiring import Provide, inject
from flask import Blueprint, request
from spectree import Response as SpectreeResponse

from app.schemas.common import ErrorResponseSchema
from app.schemas.shopping_list import ShoppingListLinesResponseSchema
from app.schemas.shopping_list_line import (
    ShoppingListLineCompleteSchema,
    ShoppingListLineCreateSchema,
    ShoppingListLineListSchema,
    ShoppingListLineReceiveSchema,
    ShoppingListLineResponseSchema,
    ShoppingListLineUpdateSchema,
)
from app.services.container import ServiceContainer
from app.services.shopping_list_line_service import ShoppingListLineService
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
@inject
def add_shopping_list_line(
    list_id: int,
    shopping_list_line_service: ShoppingListLineService = Provide[ServiceContainer.shopping_list_line_service],
) -> Any:
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
@inject
def update_shopping_list_line(
    line_id: int,
    shopping_list_line_service: ShoppingListLineService = Provide[ServiceContainer.shopping_list_line_service],
) -> Any:
    """Update an existing shopping list line."""
    data = ShoppingListLineUpdateSchema.model_validate(request.get_json())
    updates = data.model_dump(exclude_unset=True)
    line = shopping_list_line_service.update_line(
        line_id=line_id,
        seller_id=updates.get("seller_id"),
        seller_id_provided="seller_id" in updates,
        needed=updates.get("needed"),
        note=updates.get("note"),
        ordered=updates.get("ordered"),
    )
    return ShoppingListLineResponseSchema.model_validate(line).model_dump()


@shopping_list_lines_bp.route("/shopping-list-lines/<int:line_id>", methods=["DELETE"])
@api.validate(
    resp=SpectreeResponse(
        HTTP_204=None,
        HTTP_404=ErrorResponseSchema,
    ),
)
@inject
def delete_shopping_list_line(
    line_id: int,
    shopping_list_line_service: ShoppingListLineService = Provide[ServiceContainer.shopping_list_line_service],
) -> Any:
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
@inject
def list_shopping_list_lines(
    list_id: int,
    shopping_list_line_service: ShoppingListLineService = Provide[ServiceContainer.shopping_list_line_service],
) -> Any:
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
    "/shopping-list-lines/<int:line_id>/receive",
    methods=["POST"],
)
@api.validate(
    json=ShoppingListLineReceiveSchema,
    resp=SpectreeResponse(
        HTTP_200=ShoppingListLineResponseSchema,
        HTTP_400=ErrorResponseSchema,
        HTTP_404=ErrorResponseSchema,
        HTTP_409=ErrorResponseSchema,
    ),
)
@inject
def receive_shopping_list_line_stock(
    line_id: int,
    shopping_list_line_service: ShoppingListLineService = Provide[ServiceContainer.shopping_list_line_service],
) -> Any:
    """Receive stock for an ordered shopping list line."""
    payload = ShoppingListLineReceiveSchema.model_validate(request.get_json())
    allocations = [allocation.model_dump() for allocation in payload.allocations]
    line = shopping_list_line_service.receive_line_stock(
        line_id=line_id,
        receive_qty=payload.receive_qty,
        allocations=allocations,
    )
    return ShoppingListLineResponseSchema.model_validate(line).model_dump()


@shopping_list_lines_bp.route(
    "/shopping-list-lines/<int:line_id>/complete",
    methods=["POST"],
)
@api.validate(
    json=ShoppingListLineCompleteSchema,
    resp=SpectreeResponse(
        HTTP_200=ShoppingListLineResponseSchema,
        HTTP_400=ErrorResponseSchema,
        HTTP_404=ErrorResponseSchema,
        HTTP_409=ErrorResponseSchema,
    ),
)
@inject
def complete_shopping_list_line(
    line_id: int,
    shopping_list_line_service: ShoppingListLineService = Provide[ServiceContainer.shopping_list_line_service],
) -> Any:
    """Mark an ordered shopping list line as completed."""
    payload = ShoppingListLineCompleteSchema.model_validate(request.get_json() or {})
    line = shopping_list_line_service.complete_line(
        line_id=line_id,
        mismatch_reason=payload.mismatch_reason,
    )
    return ShoppingListLineResponseSchema.model_validate(line).model_dump()
