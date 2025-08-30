"""Flask application factory for Electronics Inventory backend."""

from typing import TYPE_CHECKING

from flask import Flask, g
from flask_cors import CORS

if TYPE_CHECKING:
    from app.config import Settings

from app.config import get_settings
from app.extensions import SessionLocal, db
from app.services.container import ServiceContainer


def create_app(settings: "Settings | None" = None) -> Flask:
    """Create and configure Flask application."""
    app = Flask(__name__)

    # Load configuration
    if settings is None:
        settings = get_settings()

    app.config.from_object(settings)

    # Initialize extensions
    db.init_app(app)

    # Import models to register them with SQLAlchemy
    from app import models  # noqa: F401

    # Initialize SessionLocal for per-request sessions
    # This needs to be done in app context since db.engine requires it
    with app.app_context():
        from sqlalchemy.orm import sessionmaker

        import app.extensions as ext

        ext.SessionLocal = sessionmaker(  # noqa: F811  # type: ignore[assignment]
            bind=db.engine, autoflush=True, expire_on_commit=False
        )

    # Initialize SpecTree for OpenAPI docs
    from app.utils.spectree_config import configure_spectree

    configure_spectree(app)

    # Initialize service container after SpecTree
    container = ServiceContainer()
    container.config.override(settings)
    container.wire(modules=['app.api.parts', 'app.api.boxes', 'app.api.inventory', 'app.api.types', 'app.api.testing', 'app.api.documents', 'app.api.tasks'])
    app.container = container

    # Configure CORS
    CORS(app, origins=settings.CORS_ORIGINS)

    # Register error handlers
    from app.utils.flask_error_handlers import register_error_handlers

    register_error_handlers(app)

    # Register main API blueprint
    from app.api import api_bp

    app.register_blueprint(api_bp)

    # Register testing blueprint only in testing environment
    if settings.is_testing:
        from app.api.testing import testing_bp
        app.register_blueprint(testing_bp)

    # Session per request hooks
    @app.before_request
    def open_session():
        """Create a new database session for each request."""
        from app.extensions import SessionLocal  # noqa: F811

        if SessionLocal:
            g.db = SessionLocal()
            # Provide database session to container
            container.db_session.override(g.db)

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
