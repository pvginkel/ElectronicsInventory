"""Tests for type service functionality."""

import pytest
from flask import Flask
from sqlalchemy.orm import Session

from app.exceptions import InvalidOperationException, RecordNotFoundException
from app.models.type import Type
from app.services.part_service import PartService
from app.services.type_service import TypeService


class TestTypeService:
    """Test cases for TypeService."""

    def test_create_type(self, app: Flask, session: Session):
        """Test creating a new type."""
        with app.app_context():
            type_obj = TypeService.create_type(session, "Resistor")

            assert isinstance(type_obj, Type)
            assert type_obj.name == "Resistor"
            assert type_obj.id is not None

    def test_get_type_existing(self, app: Flask, session: Session):
        """Test getting an existing type."""
        with app.app_context():
            # Create a type
            created_type = TypeService.create_type(session, "Capacitor")
            session.commit()

            # Retrieve it
            retrieved_type = TypeService.get_type(session, created_type.id)

            assert retrieved_type is not None
            assert retrieved_type.id == created_type.id
            assert retrieved_type.name == "Capacitor"

    def test_get_type_nonexistent(self, app: Flask, session: Session):
        """Test getting a non-existent type."""
        with app.app_context():
            with pytest.raises(RecordNotFoundException, match="Type 999 was not found"):
                TypeService.get_type(session, 999)

    def test_get_all_types(self, app: Flask, session: Session):
        """Test listing all types."""
        with app.app_context():
            # Create multiple types
            TypeService.create_type(session, "Resistor")
            TypeService.create_type(session, "Capacitor")
            TypeService.create_type(session, "Inductor")
            session.commit()

            types = TypeService.get_all_types(session)
            assert len(types) == 3

            # Should be ordered by name
            type_names = [t.name for t in types]
            assert type_names == sorted(type_names)

    def test_update_type(self, app: Flask, session: Session):
        """Test updating a type name."""
        with app.app_context():
            # Create a type
            type_obj = TypeService.create_type(session, "Resistor")
            session.commit()

            # Update it
            updated_type = TypeService.update_type(session, type_obj.id, "Fixed Resistor")

            assert updated_type is not None
            assert updated_type.name == "Fixed Resistor"
            assert updated_type.id == type_obj.id

    def test_update_type_nonexistent(self, app: Flask, session: Session):
        """Test updating a non-existent type."""
        with app.app_context():
            with pytest.raises(RecordNotFoundException, match="Type 999 was not found"):
                TypeService.update_type(session, 999, "New Name")

    def test_delete_type_unused(self, app: Flask, session: Session):
        """Test deleting an unused type."""
        with app.app_context():
            # Create a type
            type_obj = TypeService.create_type(session, "Temporary")
            session.commit()

            # Should be able to delete (no exception thrown)
            TypeService.delete_type(session, type_obj.id)

    def test_delete_type_in_use(self, app: Flask, session: Session):
        """Test deleting a type that's in use by parts."""
        with app.app_context():
            # Create a type and a part that uses it
            type_obj = TypeService.create_type(session, "Resistor")
            session.flush()

            PartService.create_part(
                session,
                description="1k resistor",
                type_id=type_obj.id
            )
            session.commit()

            # Should raise InvalidOperationException
            with pytest.raises(InvalidOperationException, match="Cannot delete type .* because it is being used by existing parts"):
                TypeService.delete_type(session, type_obj.id)

    def test_delete_type_nonexistent(self, app: Flask, session: Session):
        """Test deleting a non-existent type."""
        with app.app_context():
            with pytest.raises(RecordNotFoundException, match="Type 999 was not found"):
                TypeService.delete_type(session, 999)

    def test_calculate_type_part_count_no_parts(self, app: Flask, session: Session):
        """Test calculating part count for a type with no parts."""
        with app.app_context():
            # Create a type
            type_obj = TypeService.create_type(session, "Resistor")
            session.commit()

            # Count should be 0
            count = TypeService.calculate_type_part_count(session, type_obj.id)
            assert count == 0

    def test_calculate_type_part_count_with_parts(self, app: Flask, session: Session):
        """Test calculating part count for a type with parts."""
        with app.app_context():
            # Create a type
            type_obj = TypeService.create_type(session, "Resistor")
            session.flush()

            # Create parts using this type
            PartService.create_part(session, "1k resistor", type_id=type_obj.id)
            PartService.create_part(session, "10k resistor", type_id=type_obj.id)
            PartService.create_part(session, "100k resistor", type_id=type_obj.id)
            session.commit()

            # Count should be 3
            count = TypeService.calculate_type_part_count(session, type_obj.id)
            assert count == 3

    def test_calculate_type_part_count_nonexistent_type(self, app: Flask, session: Session):
        """Test calculating part count for a non-existent type."""
        with app.app_context():
            # Should return 0 for non-existent type
            count = TypeService.calculate_type_part_count(session, 999)
            assert count == 0

    def test_get_all_types_with_part_counts_empty(self, app: Flask, session: Session):
        """Test getting all types with part counts when no types exist."""
        with app.app_context():
            types_with_stats = TypeService.get_all_types_with_part_counts(session)
            assert types_with_stats == []

    def test_get_all_types_with_part_counts_no_parts(self, app: Flask, session: Session):
        """Test getting all types with part counts when no parts exist."""
        with app.app_context():
            # Create types
            type1 = TypeService.create_type(session, "Resistor")
            type2 = TypeService.create_type(session, "Capacitor")
            session.commit()

            types_with_stats = TypeService.get_all_types_with_part_counts(session)

            assert len(types_with_stats) == 2
            
            # Verify structure and that all part counts are 0
            for type_with_stats in types_with_stats:
                assert hasattr(type_with_stats, 'type')
                assert hasattr(type_with_stats, 'part_count')
                assert type_with_stats.part_count == 0

    def test_get_all_types_with_part_counts_with_parts(self, app: Flask, session: Session):
        """Test getting all types with part counts when parts exist."""
        with app.app_context():
            # Create types
            resistor_type = TypeService.create_type(session, "Resistor")
            capacitor_type = TypeService.create_type(session, "Capacitor")
            inductor_type = TypeService.create_type(session, "Inductor")
            session.flush()

            # Create parts with different type distributions
            # 3 resistor parts
            PartService.create_part(session, "1k resistor", type_id=resistor_type.id)
            PartService.create_part(session, "10k resistor", type_id=resistor_type.id)
            PartService.create_part(session, "100k resistor", type_id=resistor_type.id)
            
            # 1 capacitor part
            PartService.create_part(session, "10uF capacitor", type_id=capacitor_type.id)
            
            # 0 inductor parts (type exists but unused)
            session.commit()

            types_with_stats = TypeService.get_all_types_with_part_counts(session)

            assert len(types_with_stats) == 3

            # Create lookup by type name for easier testing
            stats_by_name = {item.type.name: item.part_count for item in types_with_stats}
            
            assert stats_by_name["Resistor"] == 3
            assert stats_by_name["Capacitor"] == 1
            assert stats_by_name["Inductor"] == 0

            # Verify data types and structure
            for type_with_stats in types_with_stats:
                assert hasattr(type_with_stats, 'type')
                assert hasattr(type_with_stats, 'part_count')
                assert isinstance(type_with_stats.part_count, int)
                assert type_with_stats.part_count >= 0

    def test_get_all_types_with_part_counts_ordering(self, app: Flask, session: Session):
        """Test that types with part counts are ordered by name."""
        with app.app_context():
            # Create types in non-alphabetical order
            TypeService.create_type(session, "Zener Diode")
            TypeService.create_type(session, "Amplifier")
            TypeService.create_type(session, "Battery")
            session.commit()

            types_with_stats = TypeService.get_all_types_with_part_counts(session)

            assert len(types_with_stats) == 3
            
            # Verify ordering by name
            type_names = [item.type.name for item in types_with_stats]
            assert type_names == sorted(type_names)
            assert type_names == ["Amplifier", "Battery", "Zener Diode"]
