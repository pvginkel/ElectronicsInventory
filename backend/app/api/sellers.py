"""Seller management API endpoints."""

from typing import Any

from dependency_injector.wiring import Provide, inject
from flask import Blueprint, request
from spectree import Response as SpectreeResponse

from app.schemas.common import ErrorResponseSchema
from app.schemas.seller import (
    SellerCreateSchema,
    SellerListSchema,
    SellerResponseSchema,
    SellerUpdateSchema,
)
from app.services.container import ServiceContainer
from app.services.seller_service import SellerService
from app.utils.spectree_config import api

sellers_bp = Blueprint("sellers", __name__, url_prefix="/sellers")


@sellers_bp.route("", methods=["GET"])
@api.validate(resp=SpectreeResponse(HTTP_200=list[SellerListSchema]))
@inject
def list_sellers(seller_service: SellerService = Provide[ServiceContainer.seller_service]) -> Any:
    """List all sellers."""
    sellers = seller_service.get_all_sellers()
    return [SellerListSchema.model_validate(seller).model_dump() for seller in sellers]


@sellers_bp.route("", methods=["POST"])
@api.validate(json=SellerCreateSchema, resp=SpectreeResponse(HTTP_201=SellerResponseSchema, HTTP_400=ErrorResponseSchema, HTTP_409=ErrorResponseSchema))
@inject
def create_seller(seller_service: SellerService = Provide[ServiceContainer.seller_service]) -> Any:
    """Create new seller."""
    data = SellerCreateSchema.model_validate(request.get_json())
    seller = seller_service.create_seller(
        name=data.name,
        website=data.website
    )
    return SellerResponseSchema.model_validate(seller).model_dump(), 201


@sellers_bp.route("/<int:seller_id>", methods=["GET"])
@api.validate(resp=SpectreeResponse(HTTP_200=SellerResponseSchema, HTTP_404=ErrorResponseSchema))
@inject
def get_seller(seller_id: int, seller_service: SellerService = Provide[ServiceContainer.seller_service]) -> Any:
    """Get seller details."""
    seller = seller_service.get_seller(seller_id)
    return SellerResponseSchema.model_validate(seller).model_dump()


@sellers_bp.route("/<int:seller_id>", methods=["PUT"])
@api.validate(json=SellerUpdateSchema, resp=SpectreeResponse(HTTP_200=SellerResponseSchema, HTTP_400=ErrorResponseSchema, HTTP_404=ErrorResponseSchema, HTTP_409=ErrorResponseSchema))
@inject
def update_seller(seller_id: int, seller_service: SellerService = Provide[ServiceContainer.seller_service]) -> Any:
    """Update seller."""
    data = SellerUpdateSchema.model_validate(request.get_json())
    seller = seller_service.update_seller(
        seller_id=seller_id,
        name=data.name,
        website=data.website
    )
    return SellerResponseSchema.model_validate(seller).model_dump()


@sellers_bp.route("/<int:seller_id>", methods=["DELETE"])
@api.validate(resp=SpectreeResponse(HTTP_204=None, HTTP_404=ErrorResponseSchema, HTTP_409=ErrorResponseSchema))
@inject
def delete_seller(seller_id: int, seller_service: SellerService = Provide[ServiceContainer.seller_service]) -> Any:
    """Delete seller."""
    seller_service.delete_seller(seller_id)
    return "", 204
