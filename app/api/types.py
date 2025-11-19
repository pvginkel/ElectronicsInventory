"""Type management API endpoints."""

from typing import Any

from dependency_injector.wiring import Provide, inject
from flask import Blueprint, request
from spectree import Response as SpectreeResponse

from app.schemas.common import ErrorResponseSchema
from app.schemas.type import (
    TypeCreateSchema,
    TypeResponseSchema,
    TypeUpdateSchema,
    TypeWithStatsResponseSchema,
)
from app.services.container import ServiceContainer
from app.services.type_service import TypeService
from app.utils.error_handling import handle_api_errors
from app.utils.spectree_config import api

types_bp = Blueprint("types", __name__, url_prefix="/types")


@types_bp.route("", methods=["POST"])
@api.validate(json=TypeCreateSchema, resp=SpectreeResponse(HTTP_201=TypeResponseSchema, HTTP_400=ErrorResponseSchema))
@handle_api_errors
@inject
def create_type(type_service: TypeService = Provide[ServiceContainer.type_service]) -> Any:
    """Create new part type."""
    data = TypeCreateSchema.model_validate(request.get_json())
    type_obj = type_service.create_type(data.name)
    return TypeResponseSchema.model_validate(type_obj).model_dump(), 201


@types_bp.route("", methods=["GET"])
@api.validate(resp=SpectreeResponse(HTTP_200=list[TypeResponseSchema]))
@handle_api_errors
@inject
def list_types(type_service: TypeService = Provide[ServiceContainer.type_service]) -> Any:
    """List all part types with optional statistics."""
    include_stats = request.args.get("include_stats", "false").lower() == "true"

    if include_stats:
        types_with_stats = type_service.get_all_types_with_part_counts()
        result = []
        for type_with_stats in types_with_stats:
            type_obj = type_with_stats.type
            # Create schema instance with part count stats
            type_data = TypeWithStatsResponseSchema(
                id=type_obj.id,
                name=type_obj.name,
                created_at=type_obj.created_at,
                updated_at=type_obj.updated_at,
                part_count=type_with_stats.part_count
            )
            result.append(type_data.model_dump())
        return result
    else:
        types = type_service.get_all_types()
        return [TypeResponseSchema.model_validate(type_obj).model_dump() for type_obj in types]


@types_bp.route("/<int:type_id>", methods=["GET"])
@api.validate(resp=SpectreeResponse(HTTP_200=TypeResponseSchema, HTTP_404=ErrorResponseSchema))
@handle_api_errors
@inject
def get_type(type_id: int, type_service: TypeService = Provide[ServiceContainer.type_service]) -> Any:
    """Get single type details."""
    type_obj = type_service.get_type(type_id)
    return TypeResponseSchema.model_validate(type_obj).model_dump()


@types_bp.route("/<int:type_id>", methods=["PUT"])
@api.validate(json=TypeUpdateSchema, resp=SpectreeResponse(HTTP_200=TypeResponseSchema, HTTP_400=ErrorResponseSchema, HTTP_404=ErrorResponseSchema))
@handle_api_errors
@inject
def update_type(type_id: int, type_service: TypeService = Provide[ServiceContainer.type_service]) -> Any:
    """Update type name."""
    data = TypeUpdateSchema.model_validate(request.get_json())
    type_obj = type_service.update_type(type_id, data.name)
    return TypeResponseSchema.model_validate(type_obj).model_dump()


@types_bp.route("/<int:type_id>", methods=["DELETE"])
@api.validate(resp=SpectreeResponse(HTTP_204=None, HTTP_404=ErrorResponseSchema, HTTP_409=ErrorResponseSchema))
@handle_api_errors
@inject
def delete_type(type_id: int, type_service: TypeService = Provide[ServiceContainer.type_service]) -> Any:
    """Delete type if not in use."""
    type_service.delete_type(type_id)
    return "", 204
