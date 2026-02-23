"""Part seller links API endpoints."""

from typing import Any

from dependency_injector.wiring import Provide, inject
from flask import Blueprint, request
from spectree import Response as SpectreeResponse

from app.schemas.common import ErrorResponseSchema
from app.schemas.part_seller import (
    PartSellerCreateSchema,
    PartSellerLinkSchema,
)
from app.services.container import ServiceContainer
from app.services.part_seller_service import PartSellerService
from app.utils.spectree_config import api

part_seller_links_bp = Blueprint(
    "part_seller_links", __name__, url_prefix="/parts"
)


@part_seller_links_bp.route("/<string:part_key>/seller-links", methods=["POST"])
@api.validate(
    json=PartSellerCreateSchema,
    resp=SpectreeResponse(
        HTTP_201=PartSellerLinkSchema,
        HTTP_404=ErrorResponseSchema,
        HTTP_409=ErrorResponseSchema,
    ),
)
@inject
def add_seller_link(
    part_key: str,
    part_seller_service: PartSellerService = Provide[ServiceContainer.part_seller_service],
) -> Any:
    """Add a seller link to a part."""
    data = PartSellerCreateSchema.model_validate(request.get_json())
    part_seller = part_seller_service.add_seller_link(
        part_key=part_key,
        seller_id=data.seller_id,
        link=data.link,
    )

    response = PartSellerLinkSchema(
        id=part_seller.id,
        seller_id=part_seller.seller_id,
        seller_name=part_seller.seller.name,
        seller_website=part_seller.seller.website,
        link=part_seller.link,
        created_at=part_seller.created_at,
    )
    return response.model_dump(), 201


@part_seller_links_bp.route(
    "/<string:part_key>/seller-links/<int:seller_link_id>", methods=["DELETE"]
)
@api.validate(
    resp=SpectreeResponse(HTTP_204=None, HTTP_404=ErrorResponseSchema),
)
@inject
def remove_seller_link(
    part_key: str,
    seller_link_id: int,
    part_seller_service: PartSellerService = Provide[ServiceContainer.part_seller_service],
) -> Any:
    """Remove a seller link from a part."""
    part_seller_service.remove_seller_link(
        part_key=part_key,
        seller_link_id=seller_link_id,
    )
    return "", 204
