"""Pytest configuration and fixtures."""

from collections.abc import Generator

import pytest
from flask import Flask

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
        db.create_all()
        yield app
        db.drop_all()


@pytest.fixture
def client(app: Flask):
    """Create test client."""
    return app.test_client()


@pytest.fixture
def runner(app: Flask):
    """Create test CLI runner."""
    return app.test_cli_runner()
