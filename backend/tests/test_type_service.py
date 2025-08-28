"""Tests for type service functionality."""

import pytest
from flask import Flask
from sqlalchemy.orm import Session

from app.exceptions import InvalidOperationException, RecordNotFoundException
from app.models.type import Type
from app.services.container import ServiceContainer


class TestTypeService:
    """Test cases for TypeService."""

    def test_create_type(self, app: Flask, session: Session, container: ServiceContainer):
        """Test creating a new type."""
        with app.app_context():
            type_service = container.type_service()
            type_obj = type_service.create_type("Resistor")

            assert isinstance(type_obj, Type)
            assert type_obj.name == "Resistor"
            assert type_obj.id is not None

    def test_get_type_existing(self, app: Flask, session: Session, container: ServiceContainer):
        """Test getting an existing type."""
        with app.app_context():
            # Create a type
            type_service = container.type_service()
            created_type = type_service.create_type("Capacitor")
            session.commit()

            # Retrieve it
            retrieved_type = type_service.get_type(created_type.id)

            assert retrieved_type is not None
            assert retrieved_type.id == created_type.id
            assert retrieved_type.name == "Capacitor"

    def test_get_type_nonexistent(self, app: Flask, session: Session, container: ServiceContainer):
        """Test getting a non-existent type."""
        with app.app_context():
            type_service = container.type_service()
            with pytest.raises(RecordNotFoundException, match="Type 999 was not found"):
                type_service.get_type(999)

    def test_get_all_types(self, app: Flask, session: Session, container: ServiceContainer):
        """Test listing all types."""
        with app.app_context():
            # Create multiple types
            type_service = container.type_service()
            type_service.create_type("Resistor")
            type_service.create_type("Capacitor")
            type_service.create_type("Inductor")
            session.commit()

            types = type_service.get_all_types()
            assert len(types) == 3

            # Should be ordered by name
            type_names = [t.name for t in types]
            assert type_names == sorted(type_names)

    def test_update_type(self, app: Flask, session: Session, container: ServiceContainer):
        """Test updating a type name."""
        with app.app_context():
            # Create a type
            type_service = container.type_service()
            type_obj = type_service.create_type("Resistor")
            session.commit()

            # Update it
            updated_type = type_service.update_type(type_obj.id, "Fixed Resistor")

            assert updated_type is not None
            assert updated_type.name == "Fixed Resistor"
            assert updated_type.id == type_obj.id

    def test_update_type_nonexistent(self, app: Flask, session: Session, container: ServiceContainer):
        """Test updating a non-existent type."""
        with app.app_context():
            type_service = container.type_service()
            with pytest.raises(RecordNotFoundException, match="Type 999 was not found"):
                type_service.update_type(999, "New Name")

    def test_delete_type_unused(self, app: Flask, session: Session, container: ServiceContainer):
        """Test deleting an unused type."""
        with app.app_context():
            # Create a type
            type_service = container.type_service()
            type_obj = type_service.create_type("Temporary")
            session.commit()

            # Should be able to delete (no exception thrown)
            type_service.delete_type(type_obj.id)

    def test_delete_type_in_use(self, app: Flask, session: Session, container: ServiceContainer):
        """Test deleting a type that's in use by parts."""
        with app.app_context():
            # Create a type and a part that uses it
            type_service = container.type_service()
            part_service = container.part_service()
            type_obj = type_service.create_type("Resistor")
            session.flush()

            part_service.create_part(
                description="1k resistor",
                type_id=type_obj.id
            )
            session.commit()

            # Should raise InvalidOperationException
            with pytest.raises(InvalidOperationException, match="Cannot delete type .* because it is being used by existing parts"):
                type_service.delete_type(type_obj.id)

    def test_delete_type_nonexistent(self, app: Flask, session: Session, container: ServiceContainer):
        """Test deleting a non-existent type."""
        with app.app_context():
            type_service = container.type_service()
            with pytest.raises(RecordNotFoundException, match="Type 999 was not found"):
                type_service.delete_type(999)

    def test_calculate_type_part_count_no_parts(self, app: Flask, session: Session, container: ServiceContainer):
        """Test calculating part count for a type with no parts."""
        with app.app_context():
            # Create a type
            type_service = container.type_service()
            type_obj = type_service.create_type("Resistor")
            session.commit()

            # Count should be 0
            count = type_service.calculate_type_part_count(type_obj.id)
            assert count == 0

    def test_calculate_type_part_count_with_parts(self, app: Flask, session: Session, container: ServiceContainer):
        """Test calculating part count for a type with parts."""
        with app.app_context():
            # Create a type
            type_service = container.type_service()
            part_service = container.part_service()
            type_obj = type_service.create_type("Resistor")
            session.flush()

            # Create parts using this type
            part_service.create_part("1k resistor", type_id=type_obj.id)
            part_service.create_part("10k resistor", type_id=type_obj.id)
            part_service.create_part("100k resistor", type_id=type_obj.id)
            session.commit()

            # Count should be 3
            count = type_service.calculate_type_part_count(type_obj.id)
            assert count == 3

    def test_calculate_type_part_count_nonexistent_type(self, app: Flask, session: Session, container: ServiceContainer):
        """Test calculating part count for a non-existent type."""
        with app.app_context():
            # Should return 0 for non-existent type
            type_service = container.type_service()
            count = type_service.calculate_type_part_count(999)
            assert count == 0

    def test_get_all_types_with_part_counts_empty(self, app: Flask, session: Session, container: ServiceContainer):
        """Test getting all types with part counts when no types exist."""
        with app.app_context():
            type_service = container.type_service()
            types_with_stats = type_service.get_all_types_with_part_counts()
            assert types_with_stats == []

    def test_get_all_types_with_part_counts_no_parts(self, app: Flask, session: Session, container: ServiceContainer):
        """Test getting all types with part counts when no parts exist."""
        with app.app_context():
            # Create types
            type_service = container.type_service()
            type1 = type_service.create_type("Resistor")
            type2 = type_service.create_type("Capacitor")
            session.commit()

            types_with_stats = type_service.get_all_types_with_part_counts()

            assert len(types_with_stats) == 2
            
            # Verify structure and that all part counts are 0
            for type_with_stats in types_with_stats:
                assert hasattr(type_with_stats, 'type')
                assert hasattr(type_with_stats, 'part_count')
                assert type_with_stats.part_count == 0

    def test_get_all_types_with_part_counts_with_parts(self, app: Flask, session: Session, container: ServiceContainer):
        """Test getting all types with part counts when parts exist."""
        with app.app_context():
            # Create types
            type_service = container.type_service()
            part_service = container.part_service()
            resistor_type = type_service.create_type("Resistor")
            capacitor_type = type_service.create_type("Capacitor")
            inductor_type = type_service.create_type("Inductor")
            session.flush()

            # Create parts with different type distributions
            # 3 resistor parts
            part_service.create_part("1k resistor", type_id=resistor_type.id)
            part_service.create_part("10k resistor", type_id=resistor_type.id)
            part_service.create_part("100k resistor", type_id=resistor_type.id)
            
            # 1 capacitor part
            part_service.create_part("10uF capacitor", type_id=capacitor_type.id)
            
            # 0 inductor parts (type exists but unused)
            session.commit()

            types_with_stats = type_service.get_all_types_with_part_counts()

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

    def test_get_all_types_with_part_counts_ordering(self, app: Flask, session: Session, container: ServiceContainer):
        """Test that types with part counts are ordered by name."""
        with app.app_context():
            # Create types in non-alphabetical order
            type_service = container.type_service()
            type_service.create_type("Zener Diode")
            type_service.create_type("Amplifier")
            type_service.create_type("Battery")
            session.commit()

            types_with_stats = type_service.get_all_types_with_part_counts()

            assert len(types_with_stats) == 3
            
            # Verify ordering by name
            type_names = [item.type.name for item in types_with_stats]
            assert type_names == sorted(type_names)
            assert type_names == ["Amplifier", "Battery", "Zener Diode"]
