"""Location management API endpoints."""

from flask import Blueprint, jsonify
from sqlalchemy import select

from app.database import get_session
from app.models.location import Location
from app.schemas.location import LocationResponseSchema

locations_bp = Blueprint("locations", __name__, url_prefix="/locations")


@locations_bp.route("/<int:box_no>/<int:loc_no>", methods=["GET"])
def get_location_details(box_no: int, loc_no: int):
    """Get specific location details."""
    try:
        with get_session() as session:
            stmt = select(Location).where(
                Location.box_no == box_no,
                Location.loc_no == loc_no
            )
            location = session.execute(stmt).scalar_one_or_none()
            if not location:
                return jsonify({"error": "Location not found"}), 404
            
            return jsonify(LocationResponseSchema.model_validate(location).model_dump())
    except Exception as e:
        return jsonify({"error": str(e)}), 500