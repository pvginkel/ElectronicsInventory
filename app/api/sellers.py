"""Seller management API endpoints."""

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
from app.utils.error_handling import handle_api_errors
from app.utils.spectree_config import api

sellers_bp = Blueprint("sellers", __name__, url_prefix="/sellers")


@sellers_bp.route("", methods=["GET"])
@api.validate(resp=SpectreeResponse(HTTP_200=list[SellerListSchema]))
@handle_api_errors
@inject
def list_sellers(seller_service=Provide[ServiceContainer.seller_service]):
    """List all sellers."""
    sellers = seller_service.get_all_sellers()
    return [SellerListSchema.model_validate(seller).model_dump() for seller in sellers]


@sellers_bp.route("", methods=["POST"])
@api.validate(json=SellerCreateSchema, resp=SpectreeResponse(HTTP_201=SellerResponseSchema, HTTP_400=ErrorResponseSchema, HTTP_409=ErrorResponseSchema))
@handle_api_errors
@inject
def create_seller(seller_service=Provide[ServiceContainer.seller_service]):
    """Create new seller."""
    data = SellerCreateSchema.model_validate(request.get_json())
    seller = seller_service.create_seller(
        name=data.name,
        website=data.website
    )
    return SellerResponseSchema.model_validate(seller).model_dump(), 201


@sellers_bp.route("/<int:seller_id>", methods=["GET"])
@api.validate(resp=SpectreeResponse(HTTP_200=SellerResponseSchema, HTTP_404=ErrorResponseSchema))
@handle_api_errors
@inject
def get_seller(seller_id: int, seller_service=Provide[ServiceContainer.seller_service]):
    """Get seller details."""
    seller = seller_service.get_seller(seller_id)
    return SellerResponseSchema.model_validate(seller).model_dump()


@sellers_bp.route("/<int:seller_id>", methods=["PUT"])
@api.validate(json=SellerUpdateSchema, resp=SpectreeResponse(HTTP_200=SellerResponseSchema, HTTP_400=ErrorResponseSchema, HTTP_404=ErrorResponseSchema, HTTP_409=ErrorResponseSchema))
@handle_api_errors
@inject
def update_seller(seller_id: int, seller_service=Provide[ServiceContainer.seller_service]):
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
@handle_api_errors
@inject
def delete_seller(seller_id: int, seller_service=Provide[ServiceContainer.seller_service]):
    """Delete seller."""
    seller_service.delete_seller(seller_id)
    return "", 204
