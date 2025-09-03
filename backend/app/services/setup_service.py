"""Setup service for database initialization and sync operations."""

from pathlib import Path

from sqlalchemy import select

from app.exceptions import InvalidOperationException
from app.models.type import Type
from app.services.base import BaseService


class SetupService(BaseService):
    """Service class for database setup and initialization operations."""

    def sync_types_from_setup(self) -> int:
        """Sync types from setup file to database.
        
        Reads types from app/data/setup/types.txt and adds any missing types
        to the database. This is idempotent - safe to run multiple times.
        
        Returns:
            int: Number of new types added to the database
            
        Raises:
            InvalidOperationException: If types.txt file is not found
        """
        # Determine path to types.txt
        types_file_path = Path(__file__).parent.parent / "data" / "setup" / "types.txt"
        
        # Check if file exists
        if not types_file_path.exists():
            raise InvalidOperationException("sync types from setup", "types.txt file not found")
            
        # Get existing type names from database
        stmt = select(Type.name)
        existing_type_names = set(self.db.execute(stmt).scalars().all())
        
        # Parse file line by line and collect new types
        new_type_names = []
        try:
            with open(types_file_path, 'r', encoding='utf-8') as file:
                for line in file:
                    # Strip whitespace from line
                    line = line.strip()
                    
                    # Skip empty lines and comment lines
                    if not line or line.startswith('#'):
                        continue
                        
                    # If line not in existing types, add to new types list
                    if line not in existing_type_names:
                        new_type_names.append(line)
        except Exception as e:
            raise InvalidOperationException("sync types from setup", f"error reading types.txt: {str(e)}")
        
        # Create Type objects for new types
        for type_name in new_type_names:
            type_obj = Type(name=type_name)
            self.db.add(type_obj)
            
        # Commit transaction and return count of new types added
        if new_type_names:
            self.db.flush()
            
        return len(new_type_names)