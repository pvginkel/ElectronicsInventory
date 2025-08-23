"""SQLAlchemy models for Electronics Inventory."""

# Import all models here for Alembic auto-generation
from app.models.box import Box
from app.models.location import Location

__all__: list[str] = ["Box", "Location"]
