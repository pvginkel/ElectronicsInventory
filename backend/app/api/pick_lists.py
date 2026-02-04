"""API endpoints for kit pick list workflows."""

from __future__ import annotations

from typing import Any

from dependency_injector.wiring import Provide, inject
from flask import Blueprint, request, send_file
from spectree import Response as SpectreeResponse

from app.schemas.common import ErrorResponseSchema
from app.schemas.pick_list import (
    KitPickListCreateSchema,
    KitPickListDetailSchema,
    KitPickListPreviewRequestSchema,
    KitPickListPreviewResponseSchema,
    KitPickListSummarySchema,
    PartShortfallSchema,
    PickListLineQuantityUpdateSchema,
)
from app.services.container import ServiceContainer
from app.services.kit_pick_list_service import KitPickListService
from app.services.pick_list_report_service import PickListReportService
from app.utils.error_handling import handle_api_errors
from app.utils.spectree_config import api

pick_lists_bp = Blueprint("pick_lists", __name__)


@pick_lists_bp.route("/kits/<int:kit_id>/pick-lists", methods=["POST"])
@api.validate(
    json=KitPickListCreateSchema,
    resp=SpectreeResponse(
        HTTP_201=KitPickListDetailSchema,
        HTTP_400=ErrorResponseSchema,
        HTTP_404=ErrorResponseSchema,
        HTTP_409=ErrorResponseSchema,
    ),
)
@handle_api_errors
@inject
def create_pick_list(
    kit_id: int,
    kit_pick_list_service: KitPickListService = Provide[ServiceContainer.kit_pick_list_service],
) -> Any:
    """Create a pick list for the specified kit."""
    payload = KitPickListCreateSchema.model_validate(request.get_json())

    # Convert shortfall_handling from schema objects to simple action strings
    shortfall_handling: dict[str, str] | None = None
    if payload.shortfall_handling:
        shortfall_handling = {
            part_key: action_schema.action.value
            for part_key, action_schema in payload.shortfall_handling.items()
        }

    pick_list = kit_pick_list_service.create_pick_list(
        kit_id,
        requested_units=payload.requested_units,
        shortfall_handling=shortfall_handling,
    )
    detail = kit_pick_list_service.get_pick_list_detail(pick_list.id)
    return (
        KitPickListDetailSchema.model_validate(detail).model_dump(),
        201,
    )


@pick_lists_bp.route("/kits/<int:kit_id>/pick-lists/preview", methods=["POST"])
@api.validate(
    json=KitPickListPreviewRequestSchema,
    resp=SpectreeResponse(
        HTTP_200=KitPickListPreviewResponseSchema,
        HTTP_400=ErrorResponseSchema,
        HTTP_404=ErrorResponseSchema,
    ),
)
@handle_api_errors
@inject
def preview_pick_list_shortfall(
    kit_id: int,
    kit_pick_list_service: KitPickListService = Provide[ServiceContainer.kit_pick_list_service],
) -> Any:
    """Preview parts with shortfall for the specified requested units."""
    payload = KitPickListPreviewRequestSchema.model_validate(request.get_json())
    parts_with_shortfall = kit_pick_list_service.preview_shortfall(
        kit_id,
        requested_units=payload.requested_units,
    )
    return KitPickListPreviewResponseSchema(
        parts_with_shortfall=[
            PartShortfallSchema.model_validate(part) for part in parts_with_shortfall
        ]
    ).model_dump()


@pick_lists_bp.route("/kits/<int:kit_id>/pick-lists", methods=["GET"])
@api.validate(
    resp=SpectreeResponse(
        HTTP_200=list[KitPickListSummarySchema],
        HTTP_404=ErrorResponseSchema,
    ),
)
@handle_api_errors
@inject
def list_pick_lists_for_kit(
    kit_id: int,
    kit_pick_list_service: KitPickListService = Provide[ServiceContainer.kit_pick_list_service],
) -> Any:
    """Return pick list summaries for a kit."""
    pick_lists = kit_pick_list_service.list_pick_lists_for_kit(kit_id)
    return [
        KitPickListSummarySchema.model_validate(pick_list).model_dump()
        for pick_list in pick_lists
    ]


@pick_lists_bp.route("/pick-lists/<int:pick_list_id>", methods=["GET"])
@api.validate(
    resp=SpectreeResponse(
        HTTP_200=KitPickListDetailSchema,
        HTTP_404=ErrorResponseSchema,
    ),
)
@handle_api_errors
@inject
def get_pick_list_detail(
    pick_list_id: int,
    kit_pick_list_service: KitPickListService = Provide[ServiceContainer.kit_pick_list_service],
) -> Any:
    """Return a detailed pick list payload with line allocations."""
    pick_list = kit_pick_list_service.get_pick_list_detail(pick_list_id)
    return KitPickListDetailSchema.model_validate(pick_list).model_dump()


@pick_lists_bp.route("/pick-lists/<int:pick_list_id>", methods=["DELETE"])
@api.validate(
    resp=SpectreeResponse(
        HTTP_204=None,
        HTTP_404=ErrorResponseSchema,
    ),
)
@handle_api_errors
@inject
def delete_pick_list(
    pick_list_id: int,
    kit_pick_list_service: KitPickListService = Provide[ServiceContainer.kit_pick_list_service],
) -> Any:
    """Delete a pick list."""
    kit_pick_list_service.delete_pick_list(pick_list_id)
    return "", 204


@pick_lists_bp.route(
    "/pick-lists/<int:pick_list_id>/lines/<int:line_id>/pick",
    methods=["POST"],
)
@api.validate(
    resp=SpectreeResponse(
        HTTP_200=KitPickListDetailSchema,
        HTTP_404=ErrorResponseSchema,
        HTTP_409=ErrorResponseSchema,
    ),
)
@handle_api_errors
@inject
def pick_pick_list_line(
    pick_list_id: int,
    line_id: int,
    kit_pick_list_service: KitPickListService = Provide[ServiceContainer.kit_pick_list_service],
) -> Any:
    """Mark a pick list line as picked and return updated detail payload."""
    kit_pick_list_service.pick_line(pick_list_id, line_id)
    detail = kit_pick_list_service.get_pick_list_detail(pick_list_id)
    return KitPickListDetailSchema.model_validate(detail).model_dump()


@pick_lists_bp.route(
    "/pick-lists/<int:pick_list_id>/lines/<int:line_id>/undo",
    methods=["POST"],
)
@api.validate(
    resp=SpectreeResponse(
        HTTP_200=KitPickListDetailSchema,
        HTTP_404=ErrorResponseSchema,
        HTTP_409=ErrorResponseSchema,
    ),
)
@handle_api_errors
@inject
def undo_pick_list_line(
    pick_list_id: int,
    line_id: int,
    kit_pick_list_service: KitPickListService = Provide[ServiceContainer.kit_pick_list_service],
) -> Any:
    """Undo a pick list line and return the refreshed detail payload."""
    kit_pick_list_service.undo_line(pick_list_id, line_id)
    detail = kit_pick_list_service.get_pick_list_detail(pick_list_id)
    return KitPickListDetailSchema.model_validate(detail).model_dump()


@pick_lists_bp.route(
    "/pick-lists/<int:pick_list_id>/lines/<int:line_id>",
    methods=["PATCH"],
)
@api.validate(
    json=PickListLineQuantityUpdateSchema,
    resp=SpectreeResponse(
        HTTP_200=KitPickListDetailSchema,
        HTTP_400=ErrorResponseSchema,
        HTTP_404=ErrorResponseSchema,
        HTTP_409=ErrorResponseSchema,
    ),
)
@handle_api_errors
@inject
def update_pick_list_line_quantity(
    pick_list_id: int,
    line_id: int,
    kit_pick_list_service: KitPickListService = Provide[ServiceContainer.kit_pick_list_service],
) -> Any:
    """Update the quantity_to_pick for a pick list line."""
    payload = PickListLineQuantityUpdateSchema.model_validate(request.get_json())
    pick_list = kit_pick_list_service.update_line_quantity(
        pick_list_id,
        line_id,
        payload.quantity_to_pick,
    )
    return KitPickListDetailSchema.model_validate(pick_list).model_dump()


@pick_lists_bp.route("/pick-lists/<int:pick_list_id>/pdf", methods=["GET"])
@handle_api_errors
@inject
def get_pick_list_pdf(
    pick_list_id: int,
    kit_pick_list_service: KitPickListService = Provide[ServiceContainer.kit_pick_list_service],
    pick_list_report_service: PickListReportService = Provide[ServiceContainer.pick_list_report_service],
) -> Any:
    """Generate and return a PDF report for the pick list."""
    # Fetch the pick list with all related data
    pick_list = kit_pick_list_service.get_pick_list_detail(pick_list_id)

    # Generate PDF
    pdf_buffer = pick_list_report_service.generate_pdf(pick_list)

    # Return as inline PDF with filename
    filename = f"pick_list_{pick_list_id}.pdf"
    response = send_file(
        pdf_buffer,
        mimetype="application/pdf",
        as_attachment=False,
    )
    response.headers["Content-Disposition"] = f'inline; filename="{filename}"'
    response.headers["Cache-Control"] = "no-cache"

    return response
