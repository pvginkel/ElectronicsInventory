"""SQLAlchemy models for Electronics Inventory."""

# Import all models here for Alembic auto-generation
from app.models.box import Box
from app.models.location import Location
from app.models.part import Part
from app.models.part_location import PartLocation
from app.models.quantity_history import QuantityHistory
from app.models.type import Type

__all__: list[str] = ["Box", "Location", "Part", "PartLocation", "QuantityHistory", "Type"]
