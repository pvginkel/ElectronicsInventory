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
