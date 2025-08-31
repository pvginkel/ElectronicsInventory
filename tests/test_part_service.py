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
            # Extended fields should be None by default
            assert part.package is None
            assert part.pin_count is None
            assert part.voltage_rating is None
            assert part.mounting_type is None
            assert part.series is None
            assert part.dimensions is None

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
                manufacturer="Vishay",
                product_page="https://www.vishay.com/en/resistors/",
                seller="Digi-Key",
                seller_link="https://digikey.com/product/123",
                package="0805",
                pin_count=2,
                voltage_rating="50V",
                mounting_type="Surface Mount",
                series="Standard",
                dimensions="2.0x1.25mm"
            )

            assert part.description == "1k ohm resistor"
            assert part.manufacturer_code == "RES-1K-5%"
            assert part.type_id == type_obj.id
            assert part.tags == ["1k", "5%", "THT"]
            assert part.manufacturer == "Vishay"
            assert part.product_page == "https://www.vishay.com/en/resistors/"
            assert part.seller == "Digi-Key"
            assert part.seller_link == "https://digikey.com/product/123"
            # Extended fields
            assert part.package == "0805"
            assert part.pin_count == 2
            assert part.voltage_rating == "50V"
            assert part.mounting_type == "Surface Mount"
            assert part.series == "Standard"
            assert part.dimensions == "2.0x1.25mm"

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
                tags=["100uF", "25V"],
                manufacturer="Panasonic",
                product_page="https://www.panasonic.com/capacitors"
            )

            assert updated_part is not None
            assert updated_part.manufacturer_code == "CAP-100UF"
            assert updated_part.type_id == type_obj.id
            assert updated_part.tags == ["100uF", "25V"]
            assert updated_part.manufacturer == "Panasonic"
            assert updated_part.product_page == "https://www.panasonic.com/capacitors"
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

    def test_create_part_with_extended_fields_only(self, app: Flask, session: Session, container: ServiceContainer):
        """Test creating a part with only extended fields populated."""
        with app.app_context():
            part_service = container.part_service()
            part = part_service.create_part(
                description="DIP-8 IC",
                package="DIP-8",
                pin_count=8,
                voltage_rating="5V",
                mounting_type="Through-hole",
                series="74HC",
                dimensions="9.53x6.35mm"
            )

            assert part.description == "DIP-8 IC"
            assert part.package == "DIP-8"
            assert part.pin_count == 8
            assert part.voltage_rating == "5V"
            assert part.mounting_type == "Through-hole"
            assert part.series == "74HC"
            assert part.dimensions == "9.53x6.35mm"
            # Non-extended fields should be None
            assert part.manufacturer_code is None
            assert part.type_id is None
            assert part.tags is None
            assert part.seller is None
            assert part.seller_link is None

    def test_update_part_extended_fields(self, app: Flask, session: Session, container: ServiceContainer):
        """Test updating a part's extended fields."""
        with app.app_context():
            # Create a part first
            part_service = container.part_service()
            part = part_service.create_part("Basic IC")
            session.flush()

            # Update extended fields
            updated_part = part_service.update_part_details(
                part.key,
                package="SOIC-16",
                pin_count=16,
                voltage_rating="3.3V",
                mounting_type="Surface Mount",
                series="STM32F4",
                dimensions="10.3x7.5mm"
            )

            assert updated_part.package == "SOIC-16"
            assert updated_part.pin_count == 16
            assert updated_part.voltage_rating == "3.3V"
            assert updated_part.mounting_type == "Surface Mount"
            assert updated_part.series == "STM32F4"
            assert updated_part.dimensions == "10.3x7.5mm"
            # Original description should remain unchanged
            assert updated_part.description == "Basic IC"

    def test_update_part_partial_extended_fields(self, app: Flask, session: Session, container: ServiceContainer):
        """Test updating only some extended fields."""
        with app.app_context():
            # Create a part with all extended fields
            part_service = container.part_service()
            part = part_service.create_part(
                description="Test IC",
                package="DIP-8",
                pin_count=8,
                voltage_rating="5V",
                mounting_type="Through-hole",
                series="Original",
                dimensions="Original size"
            )
            session.flush()

            # Update only some fields
            updated_part = part_service.update_part_details(
                part.key,
                voltage_rating="3.3V",
                series="Updated"
            )

            # Updated fields should change
            assert updated_part.voltage_rating == "3.3V"
            assert updated_part.series == "Updated"
            # Other extended fields should remain unchanged
            assert updated_part.package == "DIP-8"
            assert updated_part.pin_count == 8
            assert updated_part.mounting_type == "Through-hole"
            assert updated_part.dimensions == "Original size"

    def test_pin_count_validation(self, app: Flask, session: Session, container: ServiceContainer):
        """Test that pin_count validation works correctly."""
        with app.app_context():
            part_service = container.part_service()

            # Valid pin counts should work
            part1 = part_service.create_part("8-pin IC", pin_count=8)
            assert part1.pin_count == 8

            part2 = part_service.create_part("Single pin", pin_count=1)
            assert part2.pin_count == 1

            part3 = part_service.create_part("No pins", pin_count=None)
            assert part3.pin_count is None

    def test_extended_fields_in_repr(self, app: Flask, session: Session, container: ServiceContainer):
        """Test that extended fields appear correctly in __repr__."""
        with app.app_context():
            part_service = container.part_service()

            # Test part with package and voltage
            part1 = part_service.create_part(
                description="Test IC",
                manufacturer_code="TEST123",
                package="DIP-8",
                voltage_rating="5V"
            )
            repr_str = repr(part1)
            assert "DIP-8" in repr_str
            assert "5V" in repr_str
            assert "TEST123" in repr_str

            # Test part with pin count included
            part2 = part_service.create_part(
                description="Another IC",
                manufacturer_code="TEST456",
                package="SOIC-16",
                pin_count=16,
                voltage_rating="3.3V"
            )
            repr_str2 = repr(part2)
            assert "SOIC-16" in repr_str2
            assert "3.3V" in repr_str2
            assert "16-pin" in repr_str2
