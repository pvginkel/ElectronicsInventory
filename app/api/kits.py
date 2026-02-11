"""Kit overview and lifecycle API endpoints."""

from __future__ import annotations

import logging
from typing import Any

from dependency_injector.wiring import Provide, inject
from flask import Blueprint, request
from spectree import Response as SpectreeResponse

from app.exceptions import RecordNotFoundException
from app.models.kit import KitStatus
from app.schemas.common import ErrorResponseSchema
from app.schemas.kit import (
    KitContentCreateSchema,
    KitContentDetailSchema,
    KitContentUpdateSchema,
    KitCreateSchema,
    KitDetailResponseSchema,
    KitListQuerySchema,
    KitMembershipBulkQueryRequestSchema,
    KitResponseSchema,
    KitShoppingListChipSchema,
    KitShoppingListLinkResponseSchema,
    KitShoppingListLinkSchema,
    KitShoppingListMembershipQueryItemSchema,
    KitShoppingListMembershipQueryResponseSchema,
    KitShoppingListRequestSchema,
    KitSummarySchema,
    KitUpdateSchema,
)
from app.schemas.pick_list import (
    KitPickListMembershipQueryItemSchema,
    KitPickListMembershipQueryResponseSchema,
    KitPickListMembershipSchema,
)
from app.services.container import ServiceContainer
from app.services.kit_pick_list_service import KitPickListService
from app.services.kit_service import KitService
from app.services.kit_shopping_list_service import KitShoppingListService
from app.utils.spectree_config import api

kits_bp = Blueprint("kits", __name__, url_prefix="/kits")
logger = logging.getLogger(__name__)


def _ensure_badge_attributes(kit: Any) -> None:
    """Helper to guarantee badge counts exist before schema conversion."""
    if not hasattr(kit, "shopping_list_badge_count"):
        kit.shopping_list_badge_count = 0
    if not hasattr(kit, "pick_list_badge_count"):
        kit.pick_list_badge_count = 0


def _fetch_content_detail(kit_service: KitService, kit_id: int, content_id: int) -> tuple[Any, Any]:
    """Return kit detail payload alongside a specific content row."""
    kit = kit_service.get_kit_detail(kit_id)
    _ensure_badge_attributes(kit)

    for content in kit.contents:
        if content.id == content_id:
            return kit, content

    raise RecordNotFoundException("Kit content", content_id)


@kits_bp.route("", methods=["GET"])
@api.validate(
    query=KitListQuerySchema,
    resp=SpectreeResponse(
        HTTP_200=list[KitSummarySchema],
        HTTP_400=ErrorResponseSchema,
    ),
)
@inject
def list_kits(
    kit_service: KitService = Provide[ServiceContainer.kit_service],
) -> Any:
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
@inject
def create_kit(
    kit_service: KitService = Provide[ServiceContainer.kit_service],
) -> Any:
    """Create a new kit definition."""
    payload = KitCreateSchema.model_validate(request.get_json())
    kit = kit_service.create_kit(
        name=payload.name,
        description=payload.description,
        build_target=payload.build_target,
    )
    _ensure_badge_attributes(kit)
    return KitResponseSchema.model_validate(kit).model_dump(), 201


@kits_bp.route("/<int:kit_id>", methods=["GET"])
@api.validate(
    resp=SpectreeResponse(
        HTTP_200=KitDetailResponseSchema,
        HTTP_404=ErrorResponseSchema,
    ),
)
@inject
def get_kit_detail(
    kit_id: int,
    kit_service: KitService = Provide[ServiceContainer.kit_service],
) -> Any:
    """Return the kit detail workspace payload."""
    kit = kit_service.get_kit_detail(kit_id)
    _ensure_badge_attributes(kit)
    return KitDetailResponseSchema.model_validate(kit).model_dump()


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
@inject
def update_kit(
    kit_id: int,
    kit_service: KitService = Provide[ServiceContainer.kit_service],
) -> Any:
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


@kits_bp.route("/<int:kit_id>/contents", methods=["POST"])
@api.validate(
    json=KitContentCreateSchema,
    resp=SpectreeResponse(
        HTTP_201=KitContentDetailSchema,
        HTTP_400=ErrorResponseSchema,
        HTTP_404=ErrorResponseSchema,
        HTTP_409=ErrorResponseSchema,
    ),
)
@inject
def create_kit_content(
    kit_id: int,
    kit_service: KitService = Provide[ServiceContainer.kit_service],
) -> Any:
    """Create a new kit content entry."""
    payload = KitContentCreateSchema.model_validate(request.get_json())
    content = kit_service.create_content(
        kit_id,
        part_id=payload.part_id,
        required_per_unit=payload.required_per_unit,
        note=payload.note,
    )
    _, detail_content = _fetch_content_detail(
        kit_service,
        kit_id,
        content.id,
    )
    return (
        KitContentDetailSchema.model_validate(detail_content).model_dump(),
        201,
    )


@kits_bp.route("/<int:kit_id>/contents/<int:content_id>", methods=["PATCH"])
@api.validate(
    json=KitContentUpdateSchema,
    resp=SpectreeResponse(
        HTTP_200=KitContentDetailSchema,
        HTTP_400=ErrorResponseSchema,
        HTTP_404=ErrorResponseSchema,
        HTTP_409=ErrorResponseSchema,
    ),
)
@inject
def update_kit_content(
    kit_id: int,
    content_id: int,
    kit_service: KitService = Provide[ServiceContainer.kit_service],
) -> Any:
    """Update an existing kit content row."""
    payload = KitContentUpdateSchema.model_validate(request.get_json())
    updates = payload.model_dump(exclude_unset=True)
    note_provided = "note" in updates

    content = kit_service.update_content(
        kit_id,
        content_id,
        version=payload.version,
        required_per_unit=updates.get("required_per_unit"),
        note=updates.get("note"),
        note_provided=note_provided,
    )
    _, detail_content = _fetch_content_detail(
        kit_service,
        kit_id,
        content.id,
    )
    return KitContentDetailSchema.model_validate(detail_content).model_dump()


@kits_bp.route("/<int:kit_id>/contents/<int:content_id>", methods=["DELETE"])
@api.validate(
    resp=SpectreeResponse(
        HTTP_204=None,
        HTTP_400=ErrorResponseSchema,
        HTTP_404=ErrorResponseSchema,
        HTTP_409=ErrorResponseSchema,
    ),
)
@inject
def delete_kit_content(
    kit_id: int,
    content_id: int,
    kit_service: KitService = Provide[ServiceContainer.kit_service],
) -> Any:
    """Remove a kit content entry."""
    kit_service.delete_content(kit_id, content_id)
    return "", 204


@kits_bp.route("/shopping-list-memberships/query", methods=["POST"])
@api.validate(
    json=KitMembershipBulkQueryRequestSchema,
    resp=SpectreeResponse(
        HTTP_200=KitShoppingListMembershipQueryResponseSchema,
        HTTP_400=ErrorResponseSchema,
        HTTP_404=ErrorResponseSchema,
    ),
)
@inject
def query_shopping_list_memberships_for_kits(
    kit_service: KitService = Provide[ServiceContainer.kit_service],
    kit_shopping_list_service: KitShoppingListService = Provide[ServiceContainer.kit_shopping_list_service],
) -> Any:
    """Return shopping list memberships for the requested kits."""
    payload = KitMembershipBulkQueryRequestSchema.model_validate(request.get_json())
    kit_ids = payload.kit_ids
    include_done = payload.include_done

    kit_service.resolve_kits_for_bulk(kit_ids)
    logger.debug(
        "kit_bulk_membership_query",
        extra={
            "resource": "shopping_lists",
            "kit_count": len(kit_ids),
            "include_done": include_done,
        },
    )

    memberships = kit_shopping_list_service.list_links_for_kits_bulk(
        kit_ids,
        include_done=include_done,
    )
    response_model = KitShoppingListMembershipQueryResponseSchema(
        memberships=[
            KitShoppingListMembershipQueryItemSchema(
                kit_id=kit_id,
                memberships=[
                    KitShoppingListLinkSchema.model_validate(link)
                    for link in memberships.get(kit_id, [])
                ],
            )
            for kit_id in kit_ids
        ],
    )
    return response_model.model_dump()


@kits_bp.route("/pick-list-memberships/query", methods=["POST"])
@api.validate(
    json=KitMembershipBulkQueryRequestSchema,
    resp=SpectreeResponse(
        HTTP_200=KitPickListMembershipQueryResponseSchema,
        HTTP_400=ErrorResponseSchema,
        HTTP_404=ErrorResponseSchema,
    ),
)
@inject
def query_pick_list_memberships_for_kits(
    kit_service: KitService = Provide[ServiceContainer.kit_service],
    kit_pick_list_service: KitPickListService = Provide[ServiceContainer.kit_pick_list_service],
) -> Any:
    """Return pick list memberships for the requested kits."""
    payload = KitMembershipBulkQueryRequestSchema.model_validate(request.get_json())
    kit_ids = payload.kit_ids
    include_done = payload.include_done

    kit_service.resolve_kits_for_bulk(kit_ids)
    logger.debug(
        "kit_bulk_membership_query",
        extra={
            "resource": "pick_lists",
            "kit_count": len(kit_ids),
            "include_done": include_done,
        },
    )

    pick_lists = kit_pick_list_service.list_pick_lists_for_kits_bulk(
        kit_ids,
        include_done=include_done,
    )
    response_model = KitPickListMembershipQueryResponseSchema(
        memberships=[
            KitPickListMembershipQueryItemSchema(
                kit_id=kit_id,
                pick_lists=[
                    KitPickListMembershipSchema.model_validate(pick_list)
                    for pick_list in pick_lists.get(kit_id, [])
                ],
            )
            for kit_id in kit_ids
        ],
    )
    return response_model.model_dump()


@kits_bp.route("/<int:kit_id>/shopping-lists", methods=["GET"])
@api.validate(
    resp=SpectreeResponse(
        HTTP_200=list[KitShoppingListChipSchema],
        HTTP_404=ErrorResponseSchema,
    ),
)
@inject
def list_kit_shopping_lists(
    kit_id: int,
    kit_shopping_list_service: KitShoppingListService = Provide[ServiceContainer.kit_shopping_list_service],
) -> Any:
    """Return shopping list chips linked to the specified kit."""
    links = kit_shopping_list_service.list_links_for_kit(kit_id)
    return [
        KitShoppingListChipSchema.model_validate(link).model_dump()
        for link in links
    ]


@kits_bp.route("/<int:kit_id>/shopping-lists", methods=["POST"])
@api.validate(
    json=KitShoppingListRequestSchema,
    resp=SpectreeResponse(
        HTTP_200=KitShoppingListLinkResponseSchema,
        HTTP_201=KitShoppingListLinkResponseSchema,
        HTTP_400=ErrorResponseSchema,
        HTTP_404=ErrorResponseSchema,
        HTTP_409=ErrorResponseSchema,
    ),
)
@inject
def push_kit_to_shopping_list(
    kit_id: int,
    kit_service: KitService = Provide[ServiceContainer.kit_service],
    kit_shopping_list_service: KitShoppingListService = Provide[ServiceContainer.kit_shopping_list_service],
) -> Any:
    """Create or append a shopping list from kit contents."""
    payload = KitShoppingListRequestSchema.model_validate(request.get_json())
    kit_service.get_active_kit_for_flow(
        kit_id,
        operation="push kit to shopping list",
    )
    result = kit_shopping_list_service.create_or_append_list(
        kit_id,
        units=payload.units,
        honor_reserved=payload.honor_reserved,
        shopping_list_id=payload.shopping_list_id,
        note_prefix=payload.note_prefix,
        new_list_name=payload.new_list_name,
        new_list_description=payload.new_list_description,
    )
    response_model = KitShoppingListLinkResponseSchema.model_validate(result)
    status_code = 201 if result.created_new_list else 200
    return response_model.model_dump(), status_code


@kits_bp.route("/<int:kit_id>/archive", methods=["POST"])
@api.validate(
    resp=SpectreeResponse(
        HTTP_200=KitResponseSchema,
        HTTP_400=ErrorResponseSchema,
        HTTP_404=ErrorResponseSchema,
    ),
)
@inject
def archive_kit(
    kit_id: int,
    kit_service: KitService = Provide[ServiceContainer.kit_service],
) -> Any:
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
@inject
def unarchive_kit(
    kit_id: int,
    kit_service: KitService = Provide[ServiceContainer.kit_service],
) -> Any:
    """Restore a kit to active status."""
    kit = kit_service.unarchive_kit(kit_id)
    _ensure_badge_attributes(kit)
    return KitResponseSchema.model_validate(kit).model_dump()


@kits_bp.route("/<int:kit_id>", methods=["DELETE"])
@api.validate(
    resp=SpectreeResponse(
        HTTP_204=None,
        HTTP_404=ErrorResponseSchema,
    ),
)
@inject
def delete_kit(
    kit_id: int,
    kit_service: KitService = Provide[ServiceContainer.kit_service],
) -> Any:
    """Permanently delete a kit and all child records."""
    kit_service.delete_kit(kit_id)
    return "", 204
