"""Tests for part service functionality."""

import string

from flask import Flask
from sqlalchemy.orm import Session

from app.models.part import Part
from app.services.part_service import PartService
from app.services.type_service import TypeService
from app.exceptions import RecordNotFoundException, InvalidOperationException
import pytest


class TestPartService:
    """Test cases for PartService."""

    def test_generate_part_id4(self, app: Flask, session: Session):
        """Test part ID generation."""
        with app.app_context():
            id4 = PartService.generate_part_id4(session)

            # Should be 4 characters
            assert len(id4) == 4

            # Should be all uppercase letters
            assert all(c in string.ascii_uppercase for c in id4)

    def test_generate_part_id4_uniqueness(self, app: Flask, session: Session):
        """Test that generated IDs are unique."""
        with app.app_context():
            # Create a part to occupy one ID
            part = PartService.create_part(session, "Test description")
            session.commit()

            # Generate new ID should be different
            new_id = PartService.generate_part_id4(session)
            assert new_id != part.id4

    def test_create_part_minimal(self, app: Flask, session: Session):
        """Test creating a part with minimal data."""
        with app.app_context():
            part = PartService.create_part(session, "Basic resistor")

            assert isinstance(part, Part)
            assert len(part.id4) == 4
            assert part.description == "Basic resistor"
            assert part.manufacturer_code is None
            assert part.type_id is None
            assert part.tags is None
            assert part.seller is None
            assert part.seller_link is None

    def test_create_part_full_data(self, app: Flask, session: Session):
        """Test creating a part with all fields populated."""
        with app.app_context():
            # Create a type first
            type_obj = TypeService.create_type(session, "Resistor")
            session.flush()

            part = PartService.create_part(
                session,
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

    def test_get_part_existing(self, app: Flask, session: Session):
        """Test getting an existing part."""
        with app.app_context():
            # Create a part
            created_part = PartService.create_part(session, "Test part")
            session.commit()

            # Retrieve it
            retrieved_part = PartService.get_part(session, created_part.id4)

            assert retrieved_part is not None
            assert retrieved_part.id4 == created_part.id4
            assert retrieved_part.description == "Test part"

    def test_get_part_nonexistent(self, app: Flask, session: Session):
        """Test getting a non-existent part."""
        with app.app_context():
            with pytest.raises(RecordNotFoundException, match="Part AAAA was not found"):
                PartService.get_part(session, "AAAA")

    def test_get_parts_list(self, app: Flask, session: Session):
        """Test listing parts with pagination."""
        with app.app_context():
            # Create multiple parts
            parts = []
            for i in range(5):
                part = PartService.create_part(session, f"Part {i}")
                parts.append(part)
            session.commit()

            # Test default pagination
            result = PartService.get_parts_list(session)
            assert len(result) == 5

            # Test with limit
            result = PartService.get_parts_list(session, limit=3)
            assert len(result) == 3

            # Test with offset
            result = PartService.get_parts_list(session, limit=2, offset=2)
            assert len(result) == 2

    def test_get_parts_list_with_type_filter(self, app: Flask, session: Session):
        """Test listing parts with type filtering."""
        with app.app_context():
            # Create types
            resistor_type = TypeService.create_type(session, "Resistor")
            capacitor_type = TypeService.create_type(session, "Capacitor")
            session.flush()

            # Create parts with different types
            PartService.create_part(session, "1k resistor", type_id=resistor_type.id)
            PartService.create_part(session, "2k resistor", type_id=resistor_type.id)
            PartService.create_part(session, "100uF capacitor", type_id=capacitor_type.id)
            PartService.create_part(session, "No type part")  # No type_id
            session.commit()

            # Test filtering by resistor type
            resistors = PartService.get_parts_list(session, type_id=resistor_type.id)
            assert len(resistors) == 2
            assert all(part.type_id == resistor_type.id for part in resistors)

            # Test filtering by capacitor type
            capacitors = PartService.get_parts_list(session, type_id=capacitor_type.id)
            assert len(capacitors) == 1
            assert capacitors[0].type_id == capacitor_type.id

            # Test with non-existent type
            empty_result = PartService.get_parts_list(session, type_id=999)
            assert len(empty_result) == 0

            # Test no filter (should get all parts)
            all_parts = PartService.get_parts_list(session)
            assert len(all_parts) == 4

    def test_update_part_details(self, app: Flask, session: Session):
        """Test updating part details."""
        with app.app_context():
            # Create type and part
            type_obj = TypeService.create_type(session, "Capacitor")
            part = PartService.create_part(session, "Basic part")
            session.flush()

            # Update some fields
            updated_part = PartService.update_part_details(
                session,
                part.id4,
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

    def test_update_part_nonexistent(self, app: Flask, session: Session):
        """Test updating a non-existent part."""
        with app.app_context():
            with pytest.raises(RecordNotFoundException, match="Part AAAA was not found"):
                PartService.update_part_details(session, "AAAA", description="New desc")

    def test_delete_part_zero_quantity(self, app: Flask, session: Session):
        """Test deleting a part with zero quantity."""
        with app.app_context():
            # Create a part (no locations/quantity by default)
            part = PartService.create_part(session, "To be deleted")
            session.commit()

            # Should be able to delete (no exception thrown)
            PartService.delete_part(session, part.id4)

    def test_delete_part_nonexistent(self, app: Flask, session: Session):
        """Test deleting a non-existent part."""
        with app.app_context():
            with pytest.raises(RecordNotFoundException, match="Part AAAA was not found"):
                PartService.delete_part(session, "AAAA")

    def test_get_total_quantity_no_locations(self, app: Flask, session: Session):
        """Test getting total quantity for part with no locations."""
        with app.app_context():
            part = PartService.create_part(session, "Empty part")
            session.commit()

            total_qty = PartService.get_total_quantity(session, part.id4)
            assert total_qty == 0

    def test_get_total_quantity_nonexistent_part(self, app: Flask, session: Session):
        """Test getting total quantity for non-existent part."""
        with app.app_context():
            total_qty = PartService.get_total_quantity(session, "AAAA")
            assert total_qty == 0
