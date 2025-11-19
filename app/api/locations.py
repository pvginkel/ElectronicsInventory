"""Location management API endpoints."""

from typing import Any

from dependency_injector.wiring import Provide, inject
from flask import Blueprint
from spectree import Response as SpectreeResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.location import Location
from app.schemas.common import ErrorResponseSchema
from app.schemas.location import LocationResponseSchema
from app.services.container import ServiceContainer
from app.utils.error_handling import handle_api_errors
from app.utils.spectree_config import api

locations_bp = Blueprint("locations", __name__, url_prefix="/locations")


@locations_bp.route("/<int:box_no>/<int:loc_no>", methods=["GET"])
@api.validate(resp=SpectreeResponse(HTTP_200=LocationResponseSchema, HTTP_404=ErrorResponseSchema))
@handle_api_errors
@inject
def get_location_details(box_no: int, loc_no: int, session: Session = Provide[ServiceContainer.db_session]) -> Any:
    """Get specific location details."""
    stmt = select(Location).where(
        Location.box_no == box_no,
        Location.loc_no == loc_no
    )
    location = session.execute(stmt).scalar_one_or_none()
    if not location:
        return {"error": "Location not found"}, 404

    return LocationResponseSchema.model_validate(location).model_dump()
