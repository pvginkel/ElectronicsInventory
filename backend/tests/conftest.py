"""Pytest configuration and fixtures."""

from collections.abc import Generator

import pytest
from flask import Flask, g
from sqlalchemy.orm import Session

from app import create_app
from app.config import Settings
from app.extensions import db


@pytest.fixture
def test_settings() -> Settings:
    """Create test settings with in-memory database."""
    return Settings(
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
    )


@pytest.fixture
def app(test_settings: Settings) -> Generator[Flask, None, None]:
    """Create Flask app for testing."""
    app = create_app(test_settings)

    with app.app_context():
        # Ensure SessionLocal is initialized for tests
        from sqlalchemy.orm import sessionmaker

        import app.extensions as ext
        from app.extensions import db as flask_db

        ext.SessionLocal = sessionmaker(  # type: ignore[assignment]
            bind=flask_db.engine, autoflush=True, expire_on_commit=False
        )

        # Note: Flask-SQLAlchemy doesn't easily support configuring autoflush
        # For constraint tests that use db.session directly, manual flush() is needed
        # before accessing auto-generated IDs

        db.create_all()

        g.db = ext.SessionLocal()

        exc = None
        try:
            yield app
        except Exception as e:
            exc = e

        db_session = getattr(g, "db", None)
        if db_session:
            if exc:
                db_session.rollback()
            else:
                db_session.commit()
            db_session.close()

        db.drop_all()

        if exc:
            raise exc


@pytest.fixture
def session(app: Flask) -> Generator[Session, None, None]:
    import app.extensions as ext

    assert ext.SessionLocal is not None
    session = ext.SessionLocal()

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


@pytest.fixture
def client(app: Flask):
    """Create test client."""
    return app.test_client()


@pytest.fixture
def runner(app: Flask):
    """Create test CLI runner."""
    return app.test_cli_runner()


@pytest.fixture
def container(app: Flask, session: Session):
    """Access to the DI container for testing with session provided."""
    container = app.container
    # Provide the test session to the container
    container.db_session.override(session)
    return container


# Import document fixtures to make them available to all tests
from .test_document_fixtures import (  # noqa: F401
    large_image_file,
    mock_html_content,
    mock_url_metadata,
    sample_image_file,
    sample_part,
    sample_pdf_bytes,
    sample_pdf_file,
    temp_thumbnail_dir,
)
