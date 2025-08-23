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

        ext.SessionLocal = sessionmaker(
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
