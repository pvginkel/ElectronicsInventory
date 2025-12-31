"""Tests for part service functionality."""

import string

import pytest
from flask import Flask
from sqlalchemy.orm import Session

from app.exceptions import RecordNotFoundException
from app.models.attachment_set import AttachmentSet
from app.models.part import Part
from app.services.container import ServiceContainer


class AttachmentSetStub:
    """Minimal stub for AttachmentSetService that creates real attachment sets."""

    def __init__(self, db):
        self.db = db

    def create_attachment_set(self) -> AttachmentSet:
        attachment_set = AttachmentSet()
        self.db.add(attachment_set)
        self.db.flush()
        return attachment_set


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
            assert part.pin_pitch is None
            assert part.input_voltage is None
            assert part.output_voltage is None

    def test_create_part_full_data(self, app: Flask, session: Session, container: ServiceContainer):
        """Test creating a part with all fields populated."""
        with app.app_context():
            # Create a type first
            type_service = container.type_service()
            type_obj = type_service.create_type("Resistor")
            session.flush()

            # Create a seller first
            seller_service = container.seller_service()
            seller = seller_service.create_seller("Digi-Key", "https://www.digikey.com")
            session.flush()

            part_service = container.part_service()
            part = part_service.create_part(
                description="1k ohm resistor",
                manufacturer_code="RES-1K-5%",
                type_id=type_obj.id,
                tags=["1k", "5%", "THT"],
                manufacturer="Vishay",
                product_page="https://www.vishay.com/en/resistors/",
                seller_id=seller.id,
                seller_link="https://digikey.com/product/123",
                package="0805",
                pin_count=2,
                voltage_rating="50V",
                mounting_type="Surface Mount",
                series="Standard",
                dimensions="2.0x1.25mm",
                pin_pitch="1.27mm",
                input_voltage="5V",
                output_voltage="3.3V"
            )

            assert part.description == "1k ohm resistor"
            assert part.manufacturer_code == "RES-1K-5%"
            assert part.type_id == type_obj.id
            assert part.tags == ["1k", "5%", "THT"]
            assert part.manufacturer == "Vishay"
            assert part.product_page == "https://www.vishay.com/en/resistors/"
            assert part.seller_id == seller.id
            assert part.seller_link == "https://digikey.com/product/123"
            # Extended fields
            assert part.package == "0805"
            assert part.pin_count == 2
            assert part.voltage_rating == "50V"
            assert part.mounting_type == "Surface Mount"
            assert part.series == "Standard"
            assert part.dimensions == "2.0x1.25mm"
            assert part.pin_pitch == "1.27mm"
            assert part.input_voltage == "5V"
            assert part.output_voltage == "3.3V"

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

    def test_create_part_with_new_fields(self, app: Flask, session: Session, container: ServiceContainer):
        """Test creating parts with the new pin_pitch, input_voltage, and output_voltage fields."""
        with app.app_context():
            part_service = container.part_service()

            # Test creating a microcontroller with all new fields
            ic_part = part_service.create_part(
                description="ESP32 microcontroller",
                pin_pitch="1.27mm",
                input_voltage="3.0V-3.6V",
                output_voltage="3.3V"
            )

            assert ic_part.pin_pitch == "1.27mm"
            assert ic_part.input_voltage == "3.0V-3.6V"
            assert ic_part.output_voltage == "3.3V"

            # Test creating a power module with input/output voltages
            power_part = part_service.create_part(
                description="LM2596 step-down module",
                pin_pitch=None,
                input_voltage="3V-40V",
                output_voltage="1.5V-35V"
            )

            assert power_part.pin_pitch is None
            assert power_part.input_voltage == "3V-40V"
            assert power_part.output_voltage == "1.5V-35V"

            # Test creating a resistor (passive component) with no voltage specs
            resistor_part = part_service.create_part(
                description="10k ohm resistor",
                pin_pitch=None,
                input_voltage=None,
                output_voltage=None
            )

            assert resistor_part.pin_pitch is None
            assert resistor_part.input_voltage is None
            assert resistor_part.output_voltage is None

    def test_update_part_with_new_fields(self, app: Flask, session: Session, container: ServiceContainer):
        """Test updating parts with the new fields."""
        with app.app_context():
            part_service = container.part_service()
            part = part_service.create_part("Basic IC")
            session.flush()

            # Update with new fields
            updated_part = part_service.update_part_details(
                part.key,
                pin_pitch="2.54mm",
                input_voltage="5V",
                output_voltage="3.3V"
            )

            assert updated_part.pin_pitch == "2.54mm"
            assert updated_part.input_voltage == "5V"
            assert updated_part.output_voltage == "3.3V"

            # Update just one field
            updated_part2 = part_service.update_part_details(
                part.key,
                pin_pitch="1.27mm"
            )

            assert updated_part2.pin_pitch == "1.27mm"
            # Other fields should remain unchanged
            assert updated_part2.input_voltage == "5V"
            assert updated_part2.output_voltage == "3.3V"

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

    def test_get_part_ids_by_keys_preserves_order(self, app: Flask, session: Session, container: ServiceContainer):
        """Part key resolution should preserve caller ordering."""
        with app.app_context():
            part_service = container.part_service()
            first_part = part_service.create_part("First part")
            second_part = part_service.create_part("Second part")
            session.commit()

            keys = [second_part.key, first_part.key]
            resolved = part_service.get_part_ids_by_keys(keys)

            assert resolved == [
                (second_part.key, second_part.id),
                (first_part.key, first_part.id),
            ]

    def test_get_part_ids_by_keys_missing_key(self, app: Flask, session: Session, container: ServiceContainer):
        """Resolve should raise when any requested key is unknown."""
        with app.app_context():
            part_service = container.part_service()
            part = part_service.create_part("Existing part")
            session.commit()

            unknown_key = "ZZZZ"
            if part.key == unknown_key:
                unknown_key = "YYYY"

            with pytest.raises(RecordNotFoundException, match=f"Part {unknown_key} was not found"):
                part_service.get_part_ids_by_keys([part.key, unknown_key])


def test_get_all_parts_for_search_returns_all_parts(session: Session, make_attachment_set):
    """Test get_all_parts_for_search returns all parts with proper structure."""
    from app.models.part import Part
    from app.models.type import Type
    from app.services.part_service import PartService

    # Create sample types
    relay_type = Type(name="Relay")
    micro_type = Type(name="Microcontroller")
    session.add_all([relay_type, micro_type])
    session.flush()

    # Create attachment sets
    attachment_set1 = make_attachment_set()
    attachment_set2 = make_attachment_set()
    attachment_set3 = make_attachment_set()

    # Create sample parts
    part1 = Part(
        key="ABCD",
        description="Test relay",
        manufacturer_code="G5Q-1A4",
        manufacturer="OMRON",
        type=relay_type,
        package="DIP-8",
        pin_count=8,
        pin_pitch="2.54mm",
        voltage_rating="12V",
        series="G5Q",
        attachment_set_id=attachment_set1.id
    )
    part2 = Part(
        key="EFGH",
        description="Arduino board",
        manufacturer_code="A000066",
        manufacturer="Arduino",
        type=micro_type,
        attachment_set_id=attachment_set2.id
    )
    part3 = Part(
        key="IJKL",
        description="Minimal part",
        # All optional fields are None
        attachment_set_id=attachment_set3.id
    )
    session.add_all([part1, part2, part3])
    session.flush()

    # Get parts for search
    attachment_set_service = AttachmentSetStub(db=session)
    service = PartService(db=session, attachment_set_service=attachment_set_service)
    result = service.get_all_parts_for_search()

    # Verify all parts returned
    assert len(result) == 3

    # Verify part1 structure (full data)
    part1_data = next(p for p in result if p["key"] == "ABCD")
    assert part1_data["manufacturer_code"] == "G5Q-1A4"
    assert part1_data["manufacturer"] == "OMRON"
    assert part1_data["type_name"] == "Relay"
    assert part1_data["description"] == "Test relay"
    assert part1_data["package"] == "DIP-8"
    assert part1_data["pin_count"] == 8
    assert part1_data["pin_pitch"] == "2.54mm"
    assert part1_data["voltage_rating"] == "12V"
    assert part1_data["series"] == "G5Q"
    assert part1_data["tags"] == []

    # Verify part3 structure (minimal data with nulls)
    part3_data = next(p for p in result if p["key"] == "IJKL")
    assert part3_data["manufacturer_code"] is None
    assert part3_data["manufacturer"] is None
    assert part3_data["type_name"] is None
    assert part3_data["package"] is None
    assert part3_data["pin_count"] is None


def test_get_all_parts_for_search_handles_empty_database(session: Session):
    """Test get_all_parts_for_search with empty database."""
    from app.services.part_service import PartService

    attachment_set_service = AttachmentSetStub(db=session)
    service = PartService(db=session, attachment_set_service=attachment_set_service)
    result = service.get_all_parts_for_search()

    assert result == []


def test_get_all_parts_for_search_handles_tags(session: Session, make_attachment_set):
    """Test get_all_parts_for_search properly includes tags."""
    from app.models.part import Part
    from app.services.part_service import PartService

    # Create attachment set
    attachment_set = make_attachment_set()

    # Create part with tags
    part = Part(
        key="TEST",
        description="Part with tags",
        tags=["SMD", "0603", "10k"],
        attachment_set_id=attachment_set.id
    )
    session.add(part)
    session.flush()

    # Get parts for search
    attachment_set_service = AttachmentSetStub(db=session)
    service = PartService(db=session, attachment_set_service=attachment_set_service)
    result = service.get_all_parts_for_search()

    assert len(result) == 1
    assert result[0]["tags"] == ["SMD", "0603", "10k"]


def test_get_all_parts_for_search_excludes_quantity_and_images(session: Session, make_attachment_set):
    """Test that search data excludes quantity, locations, images, and documents."""
    from app.models.part import Part
    from app.services.part_service import PartService

    # Create attachment set
    attachment_set = make_attachment_set()

    # Create part (quantity tracked separately in part_locations)
    part = Part(
        key="TEST",
        description="Test part",
        attachment_set_id=attachment_set.id
    )
    session.add(part)
    session.flush()

    # Get parts for search
    attachment_set_service = AttachmentSetStub(db=session)
    service = PartService(db=session, attachment_set_service=attachment_set_service)
    result = service.get_all_parts_for_search()

    # Verify excluded fields are not present
    assert len(result) == 1
    assert "quantity" not in result[0]
    assert "locations" not in result[0]
    assert "images" not in result[0]
    assert "documents" not in result[0]
    assert "created_at" not in result[0]
    assert "updated_at" not in result[0]
