"""API endpoints for kit-to-shopping-list link management."""

from dependency_injector.wiring import Provide, inject
from flask import Blueprint
from spectree import Response as SpectreeResponse

from app.schemas.common import ErrorResponseSchema
from app.services.container import ServiceContainer
from app.utils.error_handling import handle_api_errors
from app.utils.spectree_config import api

kit_shopping_list_links_bp = Blueprint(
    "kit_shopping_list_links",
    __name__,
    url_prefix="/kit-shopping-list-links",
)


@kit_shopping_list_links_bp.route("/<int:link_id>", methods=["DELETE"])
@api.validate(
    resp=SpectreeResponse(
        HTTP_204=None,
        HTTP_404=ErrorResponseSchema,
    ),
)
@handle_api_errors
@inject
def delete_kit_shopping_list_link(
    link_id: int,
    kit_shopping_list_service=Provide[ServiceContainer.kit_shopping_list_service],
):
    """Remove a kit shopping list link without modifying list contents."""
    kit_shopping_list_service.unlink(link_id)
    return "", 204
