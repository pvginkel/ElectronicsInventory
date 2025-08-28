"""Base service class with common functionality."""

from sqlalchemy.orm import Session


class BaseService:
    """Base class for all services with database session injection."""

    def __init__(self, db: Session):
        """Initialize service with database session.

        Args:
            db: SQLAlchemy database session
        """
        self.db = db
