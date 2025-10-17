"""Pytest configuration and fixtures."""

from collections.abc import Generator
import sqlite3

import pytest
from flask import Flask
from prometheus_client import REGISTRY
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app import create_app
from app.config import Settings
from app.database import upgrade_database
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


def _build_test_settings() -> Settings:
    """Construct base Settings object for tests."""
    return Settings(
        DATABASE_URL="sqlite:///:memory:",
        SECRET_KEY="test-secret-key",
        DEBUG=True,
        FLASK_ENV="testing",
        DISABLE_REAL_AI_ANALYSIS=True,
        OPENAI_DUMMY_RESPONSE_PATH=None,
        CORS_ORIGINS=["http://localhost:3000"],
        # Document service configuration
        ALLOWED_IMAGE_TYPES=["image/jpeg", "image/png"],
        ALLOWED_FILE_TYPES=["application/pdf"],
        MAX_IMAGE_SIZE=10 * 1024 * 1024,  # 10MB
        MAX_FILE_SIZE=100 * 1024 * 1024,  # 100MB
        SSE_HEARTBEAT_INTERVAL=1,
    )

@pytest.fixture
def test_settings() -> Settings:
    """Create test settings with in-memory database."""
    return _build_test_settings()


@pytest.fixture(scope="session")
def template_connection() -> Generator[sqlite3.Connection, None, None]:
    """Create a template SQLite database once and apply migrations."""
    conn = sqlite3.connect(":memory:", check_same_thread=False)

    settings = _build_test_settings().model_copy()
    settings.DATABASE_URL = "sqlite://"
    settings.SQLALCHEMY_ENGINE_OPTIONS = {
        "poolclass": StaticPool,
        "creator": lambda: conn,
    }

    template_app = create_app(settings)
    with template_app.app_context():
        upgrade_database(recreate=True)

    yield conn

    conn.close()


@pytest.fixture
def app(test_settings: Settings, template_connection: sqlite3.Connection) -> Generator[Flask, None, None]:
    """Create Flask app for testing using a fresh copy of the template database."""
    clone_conn = sqlite3.connect(":memory:", check_same_thread=False)
    template_connection.backup(clone_conn)

    settings = test_settings.model_copy()
    settings.DATABASE_URL = "sqlite://"
    settings.SQLALCHEMY_ENGINE_OPTIONS = {
        "poolclass": StaticPool,
        "creator": lambda: clone_conn,
    }

    app = create_app(settings)

    try:
        yield app
    finally:
        with app.app_context():
            from app.extensions import db as flask_db

            flask_db.session.remove()

        clone_conn.close()


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
