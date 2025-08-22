"""Database connection and session management."""

from collections.abc import Generator
from contextlib import contextmanager
from typing import Any

from sqlalchemy import text
from sqlalchemy.engine import Engine

from app.extensions import db


def get_engine() -> Engine:
    """Get SQLAlchemy engine from current Flask app."""
    return db.engine


@contextmanager
def get_session() -> Generator[Any, None, None]:
    """Get a database session with proper cleanup.

    This follows SQLAlchemy 2.x best practices for session management.
    Use as a context manager to ensure proper cleanup.
    """
    session = db.session
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


def init_db() -> None:
    """Initialize database tables.

    Only creates tables if they don't exist. Safe to call multiple times.
    """
    # Import all models to ensure they're registered with SQLAlchemy
    import app.models  # noqa: F401

    # Create all tables (only if they don't exist)
    db.create_all()


def check_db_connection() -> bool:
    """Check if database connection is working."""
    try:
        with get_session() as session:
            result = session.execute(text("SELECT 1"))
            return result.scalar() == 1
    except Exception:
        return False


