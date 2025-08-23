"""Location management API endpoints."""

from flask import Blueprint, g, jsonify
from flask.wrappers import Response
from sqlalchemy import select

from app.models.location import Location
from app.schemas.location import LocationResponseSchema
from app.utils.error_handling import handle_api_errors

locations_bp = Blueprint("locations", __name__, url_prefix="/locations")


@locations_bp.route("/<int:box_no>/<int:loc_no>", methods=["GET"])
@handle_api_errors
def get_location_details(box_no: int, loc_no: int) -> Response | tuple[Response, int]:
    """Get specific location details."""
    stmt = select(Location).where(
        Location.box_no == box_no,
        Location.loc_no == loc_no
    )
    location = g.db.execute(stmt).scalar_one_or_none()
    if not location:
        return jsonify({"error": "Location not found"}), 404

    return jsonify(LocationResponseSchema.model_validate(location).model_dump())
