"""Base service class with common functionality."""

from abc import ABC
from sqlalchemy.orm import Session


class BaseService(ABC):
    """Abstract base class for all services."""
    
    def __init__(self, db: Session):
        """Initialize service with database session.
        
        Args:
            db: SQLAlchemy database session
        """
        self.db = db