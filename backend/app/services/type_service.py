"""Type service for managing part types/categories."""

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.exceptions import InvalidOperationException, RecordNotFoundException
from app.models.type import Type


class TypeService:
    """Service class for type management operations."""

    @staticmethod
    def create_type(db: Session, name: str) -> Type:
        """Create a new type."""
        type_obj = Type(name=name)
        db.add(type_obj)
        db.flush()  # Get the ID immediately
        return type_obj

    @staticmethod
    def get_type(db: Session, type_id: int) -> Type:
        """Get type by ID."""
        stmt = select(Type).where(Type.id == type_id)
        type_obj = db.execute(stmt).scalar_one_or_none()
        if not type_obj:
            raise RecordNotFoundException("Type", type_id)
        return type_obj

    @staticmethod
    def get_all_types(db: Session) -> list[Type]:
        """List all types ordered by name."""
        stmt = select(Type).order_by(Type.name)
        return list(db.execute(stmt).scalars().all())

    @staticmethod
    def update_type(db: Session, type_id: int, name: str) -> Type:
        """Update type name."""
        stmt = select(Type).where(Type.id == type_id)
        type_obj = db.execute(stmt).scalar_one_or_none()
        if not type_obj:
            raise RecordNotFoundException("Type", type_id)

        type_obj.name = name
        return type_obj

    @staticmethod
    def delete_type(db: Session, type_id: int) -> None:
        """Delete type if it exists and is not in use."""
        stmt = select(Type).where(Type.id == type_id)
        type_obj = db.execute(stmt).scalar_one_or_none()
        if not type_obj:
            raise RecordNotFoundException("Type", type_id)

        # Check if any parts use this type
        if type_obj.parts:
            raise InvalidOperationException(f"delete type {type_id}", "it is being used by existing parts")

        db.delete(type_obj)
