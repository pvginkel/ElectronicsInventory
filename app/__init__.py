"""Flask application factory for Electronics Inventory backend."""

import logging
from typing import TYPE_CHECKING

from flask import Flask, g
from flask_cors import CORS

if TYPE_CHECKING:
    from app.config import Settings

from app.app import App
from app.config import get_settings
from app.extensions import db
from app.services.container import ServiceContainer


def create_app(settings: "Settings | None" = None, skip_background_services: bool = False) -> App:
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

    # Import empty string normalization to register event handlers
    from app.utils import empty_string_normalization  # noqa: F401

    # Initialize SessionLocal for per-request sessions
    # This needs to be done in app context since db.engine requires it
    with app.app_context():
        from sqlalchemy.orm import Session, sessionmaker

        SessionLocal: sessionmaker[Session] = sessionmaker(
            class_=Session,
            bind=db.engine,
            autoflush=True,
            expire_on_commit=False,
        )

        # Enable SQLAlchemy pool logging via events if configured
        # (echo_pool config option doesn't work reliably in SQLAlchemy 2.x)
        if settings.DB_POOL_ECHO:
            import traceback

            from sqlalchemy import event
            from sqlalchemy.pool import Pool

            pool_logger = logging.getLogger("sqlalchemy.pool")
            pool_logger.setLevel(logging.DEBUG)
            if not pool_logger.handlers:
                pool_logger.addHandler(logging.StreamHandler())

            engine = db.engine  # Capture engine reference for closures

            def _get_pool_stats(pool: Pool) -> str:
                # QueuePool has checkedout(), size(), overflow() methods not on base Pool type
                return f"checkedout={pool.checkedout()} size={pool.size()} overflow={pool.overflow()}"  # type: ignore[attr-defined]

            def _get_caller_info() -> str:
                """Extract the first app-level caller from the stack trace."""
                # Skip SQLAlchemy/library internals, find app code
                skip_prefixes = (
                    "sqlalchemy",
                    "flask_sqlalchemy",
                    "werkzeug",
                    "flask",
                    "waitress",
                    "paste",
                )
                frames = []
                for frame_info in traceback.extract_stack():
                    # Skip this file and library code
                    if "/app/__init__.py" in frame_info.filename:
                        continue
                    if any(p in frame_info.filename for p in skip_prefixes):
                        continue
                    if "/app/" in frame_info.filename or "/tests/" in frame_info.filename:
                        # Extract just the relevant part of the path
                        path = frame_info.filename
                        if "/app/" in path:
                            path = "app/" + path.split("/app/")[-1]
                        elif "/tests/" in path:
                            path = "tests/" + path.split("/tests/")[-1]
                        frames.append(f"{path}:{frame_info.lineno}:{frame_info.name}")
                # Return the most recent app-level callers (last 3)
                return " <- ".join(frames[-3:]) if frames else "unknown"

            @event.listens_for(engine, "checkout")
            def _on_checkout(
                dbapi_conn: object, conn_record: object, conn_proxy: object
            ) -> None:
                caller = _get_caller_info()
                pool_logger.debug(
                    "CHECKOUT %s | conn=%s %s",
                    caller,
                    id(dbapi_conn),
                    _get_pool_stats(engine.pool),
                )

            @event.listens_for(engine, "checkin")
            def _on_checkin(dbapi_conn: object, conn_record: object) -> None:
                caller = _get_caller_info()
                pool_logger.debug(
                    "CHECKIN %s | conn=%s %s",
                    caller,
                    id(dbapi_conn),
                    _get_pool_stats(engine.pool),
                )

    # Initialize SpecTree for OpenAPI docs
    from app.utils.spectree_config import configure_spectree

    configure_spectree(app)

    # Initialize service container after SpecTree
    container = ServiceContainer()
    container.config.override(settings)
    container.session_maker.override(SessionLocal)

    # Wire container with API modules (always include testing for OpenAPI)
    wire_modules = [
        'app.api.ai_parts', 'app.api.parts', 'app.api.boxes', 'app.api.inventory',
        'app.api.kits', 'app.api.pick_lists', 'app.api.kit_shopping_list_links', 'app.api.types', 'app.api.sellers', 'app.api.shopping_lists',
        'app.api.shopping_list_lines', 'app.api.documents', 'app.api.tasks',
        'app.api.dashboard', 'app.api.metrics', 'app.api.health', 'app.api.utils',
        'app.api.sse', 'app.api.cas', 'app.api.testing'
    ]

    container.wire(modules=wire_modules)

    # Register URL interceptors
    registry = container.url_interceptor_registry()
    lcsc_interceptor = container.lcsc_interceptor()
    registry.register(lcsc_interceptor)

    app.container = container

    # Configure CORS
    CORS(app, origins=settings.CORS_ORIGINS)

    # Initialize Flask-Log-Request-ID for correlation tracking
    from flask_log_request_id import RequestID
    RequestID(app)

    # Set up log capture handler in testing mode
    if settings.is_testing:
        from app.utils.log_capture import LogCaptureHandler
        log_handler = LogCaptureHandler.get_instance()

        # Set shutdown coordinator for connection_close events
        shutdown_coordinator = container.shutdown_coordinator()
        log_handler.set_shutdown_coordinator(shutdown_coordinator)

        # Attach to root logger
        root_logger = logging.getLogger()
        root_logger.addHandler(log_handler)
        root_logger.setLevel(logging.INFO)

        app.logger.info("Log capture handler initialized for testing mode")

    # Register error handlers
    from app.utils.flask_error_handlers import register_error_handlers

    register_error_handlers(app)

    # Register main API blueprint
    from app.api import api_bp

    app.register_blueprint(api_bp)

    # Always register testing blueprint (runtime check handles access control)
    from app.api.testing import testing_bp
    app.register_blueprint(testing_bp)

    # Register SSE Gateway callback blueprint
    from app.api.sse import sse_bp
    app.register_blueprint(sse_bp)

    # Register CAS (Content-Addressable Storage) blueprint
    from app.api.cas import cas_bp
    app.register_blueprint(cas_bp)

    # Register static icons blueprint (for attachment previews)
    from app.api.icons import icons_bp
    app.register_blueprint(icons_bp)

    @app.teardown_request
    def close_session(exc: Exception | None) -> None:
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

    # Start background services only when not in CLI mode
    if not skip_background_services:
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

        # Initialize and start metrics collection
        try:
            metrics_service = container.metrics_service()
            metrics_service.start_background_updater(settings.METRICS_UPDATE_INTERVAL)
            app.logger.info("Prometheus metrics collection started")
        except Exception as e:
            app.logger.warning(f"Failed to start metrics collection: {e}")

        # Initialize request diagnostics if enabled
        from app.services.diagnostics_service import DiagnosticsService
        diagnostics_service = DiagnosticsService(settings)
        with app.app_context():
            diagnostics_service.init_app(app, db.engine)
        app.diagnostics_service = diagnostics_service

    return app
