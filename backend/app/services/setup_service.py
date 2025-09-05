"""Setup service for database initialization and sync operations."""

from sqlalchemy import select

from app.models.type import Type
from app.services.base import BaseService
from app.utils.file_parsers import get_types_from_setup


class SetupService(BaseService):
    """Service class for database setup and initialization operations."""

    def sync_types_from_setup(self) -> int:
        """Sync types from setup file to database.

        Reads types from app/data/setup/types.txt and adds any missing types
        to the database. This is idempotent - safe to run multiple times.

        Returns:
            int: Number of new types added to the database

        Raises:
            InvalidOperationException: If types.txt file is not found or parsing fails
        """
        # Get existing type names from database
        stmt = select(Type.name)
        existing_type_names = set(self.db.execute(stmt).scalars().all())

        # Get types from setup file
        setup_type_names = get_types_from_setup()

        # Collect new types that aren't in database yet
        new_type_names = [name for name in setup_type_names if name not in existing_type_names]

        # Create Type objects for new types
        for type_name in new_type_names:
            type_obj = Type(name=type_name)
            self.db.add(type_obj)

        # Commit transaction and return count of new types added
        if new_type_names:
            self.db.flush()

        return len(new_type_names)

