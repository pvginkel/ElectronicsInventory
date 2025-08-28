"""Tests for part service functionality."""

import string

import pytest
from flask import Flask
from sqlalchemy.orm import Session

from app.exceptions import RecordNotFoundException
from app.models.part import Part
from app.services.container import ServiceContainer


class TestPartService:
    """Test cases for PartService."""

    def test_generate_part_key(self, app: Flask, session: Session, container: ServiceContainer):
        """Test part key generation."""
        with app.app_context():
            part_service = container.part_service()
            key = part_service.generate_part_key()

            # Should be 4 characters
            assert len(key) == 4

            # Should be all uppercase letters
            assert all(c in string.ascii_uppercase for c in key)

    def test_generate_part_key_uniqueness(self, app: Flask, session: Session, container: ServiceContainer):
        """Test that generated keys are unique."""
        with app.app_context():
            # Create a part to occupy one key
            part_service = container.part_service()
            part = part_service.create_part("Test description")
            session.commit()

            # Generate new key should be different
            new_key = part_service.generate_part_key()
            assert new_key != part.key

    def test_create_part_minimal(self, app: Flask, session: Session, container: ServiceContainer):
        """Test creating a part with minimal data."""
        with app.app_context():
            part_service = container.part_service()
            part = part_service.create_part("Basic resistor")

            assert isinstance(part, Part)
            assert len(part.key) == 4
            assert part.description == "Basic resistor"
            assert part.manufacturer_code is None
            assert part.type_id is None
            assert part.tags is None
            assert part.seller is None
            assert part.seller_link is None

    def test_create_part_full_data(self, app: Flask, session: Session, container: ServiceContainer):
        """Test creating a part with all fields populated."""
        with app.app_context():
            # Create a type first
            type_service = container.type_service()
            type_obj = type_service.create_type("Resistor")
            session.flush()

            part_service = container.part_service()
            part = part_service.create_part(
                description="1k ohm resistor",
                manufacturer_code="RES-1K-5%",
                type_id=type_obj.id,
                tags=["1k", "5%", "THT"],
                seller="Digi-Key",
                seller_link="https://digikey.com/product/123"
            )

            assert part.description == "1k ohm resistor"
            assert part.manufacturer_code == "RES-1K-5%"
            assert part.type_id == type_obj.id
            assert part.tags == ["1k", "5%", "THT"]
            assert part.seller == "Digi-Key"
            assert part.seller_link == "https://digikey.com/product/123"

    def test_get_part_existing(self, app: Flask, session: Session, container: ServiceContainer):
        """Test getting an existing part."""
        with app.app_context():
            # Create a part
            part_service = container.part_service()
            created_part = part_service.create_part("Test part")
            session.commit()

            # Retrieve it
            retrieved_part = part_service.get_part(created_part.key)

            assert retrieved_part is not None
            assert retrieved_part.key == created_part.key
            assert retrieved_part.description == "Test part"

    def test_get_part_nonexistent(self, app: Flask, session: Session, container: ServiceContainer):
        """Test getting a non-existent part."""
        with app.app_context():
            part_service = container.part_service()
            with pytest.raises(RecordNotFoundException, match="Part AAAA was not found"):
                part_service.get_part("AAAA")

    def test_get_parts_list(self, app: Flask, session: Session, container: ServiceContainer):
        """Test listing parts with pagination."""
        with app.app_context():
            # Create multiple parts
            part_service = container.part_service()
            parts = []
            for i in range(5):
                part = part_service.create_part(f"Part {i}")
                parts.append(part)
            session.commit()

            # Test default pagination
            result = part_service.get_parts_list()
            assert len(result) == 5

            # Test with limit
            result = part_service.get_parts_list(limit=3)
            assert len(result) == 3

            # Test with offset
            result = part_service.get_parts_list(limit=2, offset=2)
            assert len(result) == 2

    def test_get_parts_list_with_type_filter(self, app: Flask, session: Session, container: ServiceContainer):
        """Test listing parts with type filtering."""
        with app.app_context():
            # Create types
            type_service = container.type_service()
            resistor_type = type_service.create_type("Resistor")
            capacitor_type = type_service.create_type("Capacitor")
            session.flush()

            # Create parts with different types
            part_service = container.part_service()
            part_service.create_part("1k resistor", type_id=resistor_type.id)
            part_service.create_part("2k resistor", type_id=resistor_type.id)
            part_service.create_part("100uF capacitor", type_id=capacitor_type.id)
            part_service.create_part("No type part")  # No type_id
            session.commit()

            # Test filtering by resistor type
            resistors = part_service.get_parts_list(type_id=resistor_type.id)
            assert len(resistors) == 2
            assert all(part.type_id == resistor_type.id for part in resistors)

            # Test filtering by capacitor type
            capacitors = part_service.get_parts_list(type_id=capacitor_type.id)
            assert len(capacitors) == 1
            assert capacitors[0].type_id == capacitor_type.id

            # Test with non-existent type
            empty_result = part_service.get_parts_list(type_id=999)
            assert len(empty_result) == 0

            # Test no filter (should get all parts)
            all_parts = part_service.get_parts_list()
            assert len(all_parts) == 4

    def test_update_part_details(self, app: Flask, session: Session, container: ServiceContainer):
        """Test updating part details."""
        with app.app_context():
            # Create type and part
            type_service = container.type_service()
            part_service = container.part_service()
            type_obj = type_service.create_type("Capacitor")
            part = part_service.create_part("Basic part")
            session.flush()

            # Update some fields
            updated_part = part_service.update_part_details(
                part.key,
                manufacturer_code="CAP-100UF",
                type_id=type_obj.id,
                tags=["100uF", "25V"]
            )

            assert updated_part is not None
            assert updated_part.manufacturer_code == "CAP-100UF"
            assert updated_part.type_id == type_obj.id
            assert updated_part.tags == ["100uF", "25V"]
            # Unchanged fields should remain the same
            assert updated_part.description == "Basic part"

    def test_update_part_nonexistent(self, app: Flask, session: Session, container: ServiceContainer):
        """Test updating a non-existent part."""
        with app.app_context():
            part_service = container.part_service()
            with pytest.raises(RecordNotFoundException, match="Part AAAA was not found"):
                part_service.update_part_details("AAAA", description="New desc")

    def test_delete_part_zero_quantity(self, app: Flask, session: Session, container: ServiceContainer):
        """Test deleting a part with zero quantity."""
        with app.app_context():
            # Create a part (no locations/quantity by default)
            part_service = container.part_service()
            part = part_service.create_part("To be deleted")
            session.commit()

            # Should be able to delete (no exception thrown)
            part_service.delete_part(part.key)

    def test_delete_part_nonexistent(self, app: Flask, session: Session, container: ServiceContainer):
        """Test deleting a non-existent part."""
        with app.app_context():
            part_service = container.part_service()
            with pytest.raises(RecordNotFoundException, match="Part AAAA was not found"):
                part_service.delete_part("AAAA")

    def test_get_total_quantity_no_locations(self, app: Flask, session: Session, container: ServiceContainer):
        """Test getting total quantity for part with no locations."""
        with app.app_context():
            part_service = container.part_service()
            part = part_service.create_part("Empty part")
            session.commit()

            total_qty = part_service.get_total_quantity(part.key)
            assert total_qty == 0

    def test_get_total_quantity_nonexistent_part(self, app: Flask, session: Session, container: ServiceContainer):
        """Test getting total quantity for non-existent part."""
        with app.app_context():
            part_service = container.part_service()
            total_qty = part_service.get_total_quantity("AAAA")
            assert total_qty == 0
