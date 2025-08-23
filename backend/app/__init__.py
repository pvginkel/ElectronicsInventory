"""Flask application factory for Electronics Inventory backend."""

from typing import TYPE_CHECKING

from flask import Flask, g
from flask_cors import CORS

if TYPE_CHECKING:
    from app.config import Settings

from app.config import get_settings
from app.extensions import SessionLocal, db


def create_app(settings: "Settings | None" = None) -> Flask:
    """Create and configure Flask application."""
    app = Flask(__name__)

    # Load configuration
    if settings is None:
        settings = get_settings()

    app.config.from_object(settings)

    # Initialize extensions
    db.init_app(app)

    # Initialize SessionLocal for per-request sessions
    # This needs to be done in app context since db.engine requires it
    with app.app_context():
        from sqlalchemy.orm import sessionmaker

        import app.extensions as ext

        ext.SessionLocal = sessionmaker(
            bind=db.engine, autoflush=True, expire_on_commit=False
        )

    # Initialize SpecTree for OpenAPI docs
    from spectree import SpecTree

    api = SpecTree("flask", title="Electronics Inventory API", version="0.1.0")
    api.register(app)

    # Configure CORS
    CORS(app, origins=settings.CORS_ORIGINS)

    # Register error handlers
    from app.utils.flask_error_handlers import register_error_handlers

    register_error_handlers(app)

    # Register blueprints
    from app.api import health_bp
    from app.api.boxes import boxes_bp
    from app.api.locations import locations_bp

    app.register_blueprint(health_bp)
    app.register_blueprint(boxes_bp)
    app.register_blueprint(locations_bp)

    # Session per request hooks
    @app.before_request
    def open_session():
        """Create a new database session for each request."""
        from app.extensions import SessionLocal

        if SessionLocal:
            g.db = SessionLocal()

    @app.teardown_request
    def close_session(exc):
        """Close the database session after each request."""
        db_session = getattr(g, "db", None)
        if db_session:
            if exc:
                db_session.rollback()
            else:
                db_session.commit()
            db_session.close()

    return app
