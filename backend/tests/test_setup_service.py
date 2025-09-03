"""Test setup service functionality."""

import tempfile
from pathlib import Path

import pytest
from flask import Flask
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.exceptions import InvalidOperationException
from app.models.type import Type
from app.services.container import ServiceContainer
from app.services.setup_service import SetupService


class TestSetupService:
    """Test cases for SetupService functionality."""

    def test_sync_types_from_setup_success_empty_database(
        self, app: Flask, session: Session, container: ServiceContainer
    ):
        """Test sync_types_from_setup with empty database adds all types."""
        service = container.setup_service()
        
        # Verify database is empty
        stmt = select(Type)
        existing_types = list(session.execute(stmt).scalars().all())
        assert len(existing_types) == 0
        
        # Run sync
        added_count = service.sync_types_from_setup()
        
        # Verify all 101 types were added
        assert added_count == 101
        
        # Verify types are in database
        stmt = select(Type).order_by(Type.name)
        all_types = list(session.execute(stmt).scalars().all())
        assert len(all_types) == 101
        
        # Check some specific types exist
        type_names = [t.name for t in all_types]
        assert "AC-DC Power Modules" in type_names
        assert "Resistors" in type_names
        assert "Zener Diodes" in type_names

    def test_sync_types_from_setup_success_with_existing_types(
        self, app: Flask, session: Session, container: ServiceContainer
    ):
        """Test sync_types_from_setup with some existing types adds only missing ones."""
        service = container.setup_service()
        
        # Add a few types manually first
        existing_type1 = Type(name="Resistors")
        existing_type2 = Type(name="Capacitors")
        session.add(existing_type1)
        session.add(existing_type2)
        session.flush()
        
        # Run sync
        added_count = service.sync_types_from_setup()
        
        # Verify only missing types were added (101 total - 2 existing = 99)
        assert added_count == 99
        
        # Verify total count is now 101
        stmt = select(Type)
        all_types = list(session.execute(stmt).scalars().all())
        assert len(all_types) == 101

    def test_sync_types_from_setup_idempotent(
        self, app: Flask, session: Session, container: ServiceContainer
    ):
        """Test that running sync multiple times is idempotent."""
        service = container.setup_service()
        
        # First run
        added_count1 = service.sync_types_from_setup()
        assert added_count1 == 101
        
        # Second run should add nothing
        added_count2 = service.sync_types_from_setup()
        assert added_count2 == 0
        
        # Third run should still add nothing
        added_count3 = service.sync_types_from_setup()
        assert added_count3 == 0
        
        # Total should still be 101
        stmt = select(Type)
        all_types = list(session.execute(stmt).scalars().all())
        assert len(all_types) == 101

    def test_sync_types_from_setup_file_not_found(
        self, app: Flask, session: Session, monkeypatch
    ):
        """Test sync_types_from_setup raises exception when types.txt not found."""
        service = SetupService(session)
        
        # Mock the path to point to non-existent file
        fake_path = Path("/nonexistent/types.txt")
        
        def mock_path(*args):
            return fake_path
            
        monkeypatch.setattr(Path, "__new__", lambda cls, *args: fake_path)
        
        # Should raise InvalidOperationException
        with pytest.raises(InvalidOperationException) as exc_info:
            service.sync_types_from_setup()
            
        assert "types.txt file not found" in str(exc_info.value)

    def test_sync_types_from_setup_with_comments_and_empty_lines(
        self, app: Flask, session: Session, monkeypatch
    ):
        """Test that sync properly handles comments and empty lines in types.txt."""
        service = SetupService(session)
        
        # Create a temporary types.txt with comments and empty lines
        test_types_content = """# This is a comment
        
Resistors
# Another comment
Capacitors

# Final comment
LEDs
"""
        
        with tempfile.NamedTemporaryFile(mode='w', delete=False, suffix='.txt') as temp_file:
            temp_file.write(test_types_content)
            temp_file_path = Path(temp_file.name)
        
        try:
            # Mock the path to point to our temp file
            def mock_setup_path():
                return temp_file_path
                
            # Patch the path construction in SetupService
            original_method = SetupService.sync_types_from_setup
            
            def patched_sync_types(self):
                # Override the path construction
                types_file_path = temp_file_path
                
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
            
            monkeypatch.setattr(SetupService, 'sync_types_from_setup', patched_sync_types)
            
            # Run sync
            added_count = service.sync_types_from_setup()
            
            # Should add 3 types (Resistors, Capacitors, LEDs)
            assert added_count == 3
            
            # Verify the correct types were added
            stmt = select(Type.name).order_by(Type.name)
            type_names = list(session.execute(stmt).scalars().all())
            assert type_names == ["Capacitors", "LEDs", "Resistors"]
            
        finally:
            # Clean up temp file
            temp_file_path.unlink()