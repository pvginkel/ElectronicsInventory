"""Type service for managing part types/categories."""

from typing import TYPE_CHECKING

from sqlalchemy import select

from app.exceptions import (
    DependencyException,
    RecordNotFoundException,
)
from app.models.type import Type
from app.services.base import BaseService

if TYPE_CHECKING:
    from app.schemas.type import TypeWithStatsModel


class TypeService(BaseService):
    """Service class for type management operations."""

    def create_type(self, name: str) -> Type:
        """Create a new type."""
        type_obj = Type(name=name)
        self.db.add(type_obj)
        self.db.flush()  # Get the ID immediately
        return type_obj

    def get_type(self, type_id: int) -> Type:
        """Get type by ID."""
        stmt = select(Type).where(Type.id == type_id)
        type_obj = self.db.execute(stmt).scalar_one_or_none()
        if not type_obj:
            raise RecordNotFoundException("Type", type_id)
        return type_obj

    def get_all_types(self) -> list[Type]:
        """List all types ordered by name."""
        stmt = select(Type).order_by(Type.name)
        return list(self.db.execute(stmt).scalars().all())

    def update_type(self, type_id: int, name: str) -> Type:
        """Update type name."""
        stmt = select(Type).where(Type.id == type_id)
        type_obj = self.db.execute(stmt).scalar_one_or_none()
        if not type_obj:
            raise RecordNotFoundException("Type", type_id)

        type_obj.name = name
        return type_obj

    def delete_type(self, type_id: int) -> None:
        """Delete type if it exists and is not in use."""
        stmt = select(Type).where(Type.id == type_id)
        type_obj = self.db.execute(stmt).scalar_one_or_none()
        if not type_obj:
            raise RecordNotFoundException("Type", type_id)

        # Check if any parts use this type
        if type_obj.parts:
            raise DependencyException("Type", type_id, "it is being used by existing parts")

        self.db.delete(type_obj)

    def calculate_type_part_count(self, type_id: int) -> int:
        """Calculate the number of parts using a specific type."""
        from sqlalchemy import func

        from app.models.part import Part

        stmt = select(func.count(Part.id)).where(Part.type_id == type_id)
        result = self.db.execute(stmt).scalar()
        return result or 0

    def get_all_types_with_part_counts(self) -> list['TypeWithStatsModel']:
        """Get all types with their part counts calculated."""
        from sqlalchemy import func

        from app.models.part import Part
        from app.schemas.type import TypeWithStatsModel

        # Query to get all types with part counts in one go
        stmt = select(
            Type,
            func.count(Part.id).label('part_count')
        ).outerjoin(
            Part, Type.id == Part.type_id
        ).group_by(Type.id).order_by(Type.name)

        results = self.db.execute(stmt).all()

        types_with_stats = []
        for type_obj, part_count in results:
            type_with_stats = TypeWithStatsModel(
                type=type_obj,
                part_count=part_count or 0
            )
            types_with_stats.append(type_with_stats)

        return types_with_stats
