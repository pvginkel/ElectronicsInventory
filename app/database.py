"""Database connection and session management."""

from sqlalchemy import text
from sqlalchemy.engine import Engine

from app.extensions import db


def get_engine() -> Engine:
    """Get SQLAlchemy engine from current Flask app."""
    return db.engine


def get_session():
    """Get a new database session."""
    return db.session


def init_db() -> None:
    """Initialize database tables."""
    # Import all models to ensure they're registered
    import app.models  # noqa: F401

    # Create all tables
    db.create_all()


def check_db_connection() -> bool:
    """Check if database connection is working."""
    try:
        with get_session() as session:
            result = session.execute(text("SELECT 1"))
            return result.scalar() == 1
    except Exception:
        return False
