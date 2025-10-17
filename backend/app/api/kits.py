"""Kit overview and lifecycle API endpoints."""

from __future__ import annotations

from dependency_injector.wiring import Provide, inject
from flask import Blueprint, request
from spectree import Response as SpectreeResponse

from app.models.kit import KitStatus
from app.schemas.common import ErrorResponseSchema
from app.schemas.kit import (
    KitCreateSchema,
    KitListQuerySchema,
    KitResponseSchema,
    KitSummarySchema,
    KitUpdateSchema,
)
from app.services.container import ServiceContainer
from app.utils.error_handling import handle_api_errors
from app.utils.spectree_config import api

kits_bp = Blueprint("kits", __name__, url_prefix="/kits")


def _ensure_badge_attributes(kit) -> None:
    """Helper to guarantee badge counts exist before schema conversion."""
    if not hasattr(kit, "shopping_list_badge_count"):
        kit.shopping_list_badge_count = 0
    if not hasattr(kit, "pick_list_badge_count"):
        kit.pick_list_badge_count = 0


@kits_bp.route("", methods=["GET"])
@api.validate(
    query=KitListQuerySchema,
    resp=SpectreeResponse(
        HTTP_200=list[KitSummarySchema],
        HTTP_400=ErrorResponseSchema,
    ),
)
@handle_api_errors
@inject
def list_kits(
    kit_service=Provide[ServiceContainer.kit_service],
):
    """List kits filtered by status and optional text query."""
    query_params = KitListQuerySchema.model_validate(request.args.to_dict())
    status = KitStatus(query_params.status.value)
    kits = kit_service.list_kits(
        status=status,
        query=query_params.query,
        limit=query_params.limit,
    )
    results = []
    for kit in kits:
        _ensure_badge_attributes(kit)
        results.append(KitSummarySchema.model_validate(kit).model_dump())
    return results


@kits_bp.route("", methods=["POST"])
@api.validate(
    json=KitCreateSchema,
    resp=SpectreeResponse(
        HTTP_201=KitResponseSchema,
        HTTP_400=ErrorResponseSchema,
        HTTP_409=ErrorResponseSchema,
    ),
)
@handle_api_errors
@inject
def create_kit(
    kit_service=Provide[ServiceContainer.kit_service],
):
    """Create a new kit definition."""
    payload = KitCreateSchema.model_validate(request.get_json())
    kit = kit_service.create_kit(
        name=payload.name,
        description=payload.description,
        build_target=payload.build_target,
    )
    _ensure_badge_attributes(kit)
    return KitResponseSchema.model_validate(kit).model_dump(), 201


@kits_bp.route("/<int:kit_id>", methods=["PATCH"])
@api.validate(
    json=KitUpdateSchema,
    resp=SpectreeResponse(
        HTTP_200=KitResponseSchema,
        HTTP_400=ErrorResponseSchema,
        HTTP_404=ErrorResponseSchema,
        HTTP_409=ErrorResponseSchema,
    ),
)
@handle_api_errors
@inject
def update_kit(
    kit_id: int,
    kit_service=Provide[ServiceContainer.kit_service],
):
    """Update the metadata for an active kit."""
    payload = KitUpdateSchema.model_validate(request.get_json())
    updates = payload.model_dump(exclude_unset=True)

    kit = kit_service.update_kit(
        kit_id,
        name=updates.get("name"),
        description=updates.get("description"),
        build_target=updates.get("build_target"),
    )
    _ensure_badge_attributes(kit)
    return KitResponseSchema.model_validate(kit).model_dump()


@kits_bp.route("/<int:kit_id>/archive", methods=["POST"])
@api.validate(
    resp=SpectreeResponse(
        HTTP_200=KitResponseSchema,
        HTTP_400=ErrorResponseSchema,
        HTTP_404=ErrorResponseSchema,
    ),
)
@handle_api_errors
@inject
def archive_kit(
    kit_id: int,
    kit_service=Provide[ServiceContainer.kit_service],
):
    """Archive a kit."""
    kit = kit_service.archive_kit(kit_id)
    _ensure_badge_attributes(kit)
    return KitResponseSchema.model_validate(kit).model_dump()


@kits_bp.route("/<int:kit_id>/unarchive", methods=["POST"])
@api.validate(
    resp=SpectreeResponse(
        HTTP_200=KitResponseSchema,
        HTTP_400=ErrorResponseSchema,
        HTTP_404=ErrorResponseSchema,
    ),
)
@handle_api_errors
@inject
def unarchive_kit(
    kit_id: int,
    kit_service=Provide[ServiceContainer.kit_service],
):
    """Restore a kit to active status."""
    kit = kit_service.unarchive_kit(kit_id)
    _ensure_badge_attributes(kit)
    return KitResponseSchema.model_validate(kit).model_dump()
