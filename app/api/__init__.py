"""API blueprints for Electronics Inventory."""

from flask import Blueprint, jsonify

from app.api.boxes import boxes_bp
from app.api.locations import locations_bp

# Health check blueprint
health_bp = Blueprint("health", __name__)


@health_bp.route("/health")
def health_check():
    """Health check endpoint for container orchestration."""
    return jsonify({"status": "healthy"})


# Import other blueprints here when they're created
# from app.api.parts import parts_bp
