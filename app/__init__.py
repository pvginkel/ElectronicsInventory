"""Flask application factory for Electronics Inventory backend."""

from typing import TYPE_CHECKING

from flask import Flask, g
from flask_cors import CORS

if TYPE_CHECKING:
    from app.config import Settings

from app.app import App
from app.config import get_settings
from app.extensions import db
from app.services.container import ServiceContainer


def create_app(settings: "Settings | None" = None) -> App:
    """Create and configure Flask application."""
    app = App(__name__)

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

        SessionLocal = sessionmaker(  # noqa: F811  # type: ignore[assignment]
            bind=db.engine, autoflush=True, expire_on_commit=False
        )

    # Initialize SpecTree for OpenAPI docs
    from app.utils.spectree_config import configure_spectree

    configure_spectree(app)

    # Initialize service container after SpecTree
    container = ServiceContainer()
    container.config.override(settings)
    container.session_maker.override(SessionLocal)
    container.wire(modules=['app.api.ai_parts', 'app.api.parts', 'app.api.boxes', 'app.api.inventory', 'app.api.types', 'app.api.documents', 'app.api.tasks', 'app.api.dashboard', 'app.api.metrics', 'app.api.health'])

    # Register URL interceptors
    registry = container.url_interceptor_registry()
    lcsc_interceptor = container.lcsc_interceptor()
    registry.register(lcsc_interceptor)

    app.container = container

    # Configure CORS
    CORS(app, origins=settings.CORS_ORIGINS)

    # Register error handlers
    from app.utils.flask_error_handlers import register_error_handlers

    register_error_handlers(app)

    # Register main API blueprint
    from app.api import api_bp

    app.register_blueprint(api_bp)

    @app.teardown_request
    def close_session(exc):
        try:
            """Close the database session after each request."""
            db_session = container.db_session()
            needs_rollback = db_session.info.get('needs_rollback', False)

            if exc or needs_rollback:
                db_session.rollback()
            else:
                db_session.commit()

            # Clear rollback flag after processing
            db_session.info.pop('needs_rollback', None)
            db_session.close()

        finally:
            # Ensure the scoped session is removed after each request
            container.db_session.reset()

    # Start temp file manager cleanup thread during app creation
    temp_file_manager = container.temp_file_manager()
    temp_file_manager.start_cleanup_thread()

    # Ensure S3 bucket exists during startup
    try:
        s3_service = container.s3_service()
        s3_service.ensure_bucket_exists()
    except Exception as e:
        # Log warning but don't fail startup - S3 might be optional
        app.logger.warning(f"Failed to ensure S3 bucket exists: {e}")

    # Initialize and start metrics collection if enabled
    if settings.METRICS_ENABLED:
        try:
            metrics_service = container.metrics_service()
            metrics_service.start_background_updater(settings.METRICS_UPDATE_INTERVAL)
            app.logger.info("Prometheus metrics collection started")
        except Exception as e:
            app.logger.warning(f"Failed to start metrics collection: {e}")

    @app.teardown_appcontext
    def stop_background_services(error):
        """Stop background threads on app teardown."""
        if hasattr(app, 'container'):
            # Stop temp file cleanup thread
            temp_file_manager = app.container.temp_file_manager()
            temp_file_manager.stop_cleanup_thread()

            # Stop metrics collection if enabled
            if settings.METRICS_ENABLED:
                try:
                    metrics_service = app.container.metrics_service()
                    metrics_service.stop_background_updater()
                    app.logger.info("Metrics collection stopped")
                except Exception as e:
                    app.logger.warning(f"Failed to stop metrics collection: {e}")

    return app
