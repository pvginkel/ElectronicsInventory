"""Database connection and session management."""

from sqlalchemy import text
from sqlalchemy.engine import Engine

from app.extensions import db


def get_engine() -> Engine:
    """Get SQLAlchemy engine from current Flask app."""
    return db.engine


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
        # Use Flask-SQLAlchemy's session for the health check
        result = db.session.execute(text("SELECT 1"))
        return result.scalar() == 1
    except Exception:
        return False


