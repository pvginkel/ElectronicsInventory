"""Testing API endpoints for Cypress E2E tests."""

from flask import Blueprint, g, jsonify
from spectree import Response

from app.config import get_settings
from app.utils.error_handling import handle_api_errors
from app.utils.spectree_config import spec

testing_bp = Blueprint("testing", __name__, url_prefix="/api/test")


@testing_bp.before_request
def ensure_testing_environment():
    """Ensure test endpoints only work in testing environment."""
    settings = get_settings()
    if not settings.is_testing:
        return jsonify({"error": "Test endpoints not available"}), 404


@testing_bp.route("/reset", methods=["DELETE"])
@spec.validate(resp=Response(HTTP_200=dict, HTTP_404=dict), tags=["testing"])
@handle_api_errors
def reset_database():
    """Reset database to clean state for testing.

    This endpoint drops all data from the database and recreates
    the tables. Only available when FLASK_ENV=testing.
    """
    from app.extensions import db

    # Drop all data by dropping and recreating tables
    db.drop_all()
    db.create_all()

    # Commit the transaction
    if hasattr(g, 'db') and g.db:
        g.db.commit()

    return jsonify({"message": "Database reset successfully"})


@testing_bp.route("/health", methods=["GET"])
@spec.validate(resp=Response(HTTP_200=dict, HTTP_404=dict), tags=["testing"])
@handle_api_errors
def test_health():
    """Health check endpoint for testing environment."""
    return jsonify({
        "status": "ok",
        "environment": "testing",
        "message": "Test endpoints are available"
    })