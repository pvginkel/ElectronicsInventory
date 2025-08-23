"""Flask application factory for Electronics Inventory backend."""

from typing import TYPE_CHECKING

from flask import Flask
from flask_cors import CORS

if TYPE_CHECKING:
    from app.config import Settings

from app.config import get_settings
from app.extensions import db


def create_app(settings: "Settings | None" = None) -> Flask:
    """Create and configure Flask application."""
    app = Flask(__name__)

    # Load configuration
    if settings is None:
        settings = get_settings()

    app.config.from_object(settings)

    # Initialize extensions
    db.init_app(app)

    # Initialize SpecTree for OpenAPI docs
    from spectree import SpecTree

    api = SpecTree("flask", title="Electronics Inventory API", version="0.1.0")
    api.register(app)

    # Configure CORS
    CORS(app, origins=settings.CORS_ORIGINS)

    # Register blueprints
    from app.api import health_bp
    from app.api.boxes import boxes_bp
    from app.api.locations import locations_bp

    app.register_blueprint(health_bp)
    app.register_blueprint(boxes_bp)
    app.register_blueprint(locations_bp)

    return app
