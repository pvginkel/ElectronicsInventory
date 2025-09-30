"""Pytest configuration and fixtures."""

from collections.abc import Generator

import pytest
from flask import Flask
from prometheus_client import REGISTRY
from sqlalchemy.orm import Session

from app import create_app
from app.config import Settings
from app.extensions import db
from app.services.container import ServiceContainer


@pytest.fixture(autouse=True)
def clear_prometheus_registry():
    """Clear Prometheus registry before each test to avoid conflicts."""
    # Clear all collectors from the global registry
    collectors = list(REGISTRY._collector_to_names.keys())
    for collector in collectors:
        try:
            REGISTRY.unregister(collector)
        except KeyError:
            # Collector may have already been unregistered
            pass
    yield
    # Clean up after test too
    collectors = list(REGISTRY._collector_to_names.keys())
    for collector in collectors:
        try:
            REGISTRY.unregister(collector)
        except KeyError:
            pass


@pytest.fixture
def test_settings() -> Settings:
    """Create test settings with in-memory database."""
    settings = Settings(
        DATABASE_URL="sqlite:///:memory:",
        SECRET_KEY="test-secret-key",
        DEBUG=True,
        FLASK_ENV="testing",
        CORS_ORIGINS=["http://localhost:3000"],
        # Document service configuration
        ALLOWED_IMAGE_TYPES=["image/jpeg", "image/png"],
        ALLOWED_FILE_TYPES=["application/pdf"],
        MAX_IMAGE_SIZE=10 * 1024 * 1024,  # 10MB
        MAX_FILE_SIZE=100 * 1024 * 1024,  # 100MB
        SSE_HEARTBEAT_INTERVAL=1,
    )

    return settings


@pytest.fixture
def app(test_settings: Settings) -> Flask:
    """Create Flask app for testing."""
    app = create_app(test_settings)

    with app.app_context():
        # Note: Flask-SQLAlchemy doesn't easily support configuring autoflush
        # For constraint tests that use db.session directly, manual flush() is needed
        # before accessing auto-generated IDs

        db.create_all()

    return app


@pytest.fixture
def session(container: ServiceContainer) -> Generator[Session, None, None]:
    """Create a new database session for a test."""

    session = container.db_session()

    exc = None
    try:
        yield session
    except Exception as e:
        exc = e

    if exc:
        session.rollback()
    else:
        session.commit()
    session.close()

    container.db_session.reset()


@pytest.fixture
def client(app: Flask):
    """Create test client."""
    return app.test_client()


@pytest.fixture
def runner(app: Flask):
    """Create test CLI runner."""
    return app.test_cli_runner()


@pytest.fixture
def container(app: Flask):
    """Access to the DI container for testing with session provided."""
    container = app.container

    with app.app_context():
        # Ensure SessionLocal is initialized for tests
        from sqlalchemy.orm import sessionmaker

        from app.extensions import db as flask_db

        SessionLocal = sessionmaker(
            bind=flask_db.engine, autoflush=True, expire_on_commit=False
        )

        # Note: Flask-SQLAlchemy doesn't easily support configuring autoflush
        # For constraint tests that use db.session directly, manual flush() is needed
        # before accessing auto-generated IDs

        db.create_all()

    container.session_maker.override(SessionLocal)

    return container


# Import document fixtures to make them available to all tests
from .test_document_fixtures import (  # noqa
    large_image_file,
    mock_html_content,
    mock_url_metadata,
    sample_image_file,
    sample_part,
    sample_pdf_bytes,
    sample_pdf_file,
    temp_thumbnail_dir,
)
