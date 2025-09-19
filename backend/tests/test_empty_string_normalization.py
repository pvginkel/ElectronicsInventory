"""Tests for empty string normalization functionality."""

import pytest
from flask import Flask
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.exceptions import ResourceConflictException
from app.services.container import ServiceContainer


class TestEmptyStringNormalization:
    """Test cases for empty string to NULL normalization."""

    def test_empty_string_on_insert_nullable_field(self, app: Flask, session: Session, container: ServiceContainer):
        """Test empty string conversion to NULL on insert for nullable fields."""
        with app.app_context():
            part_service = container.part_service()

            # Create part with empty string in nullable field
            part = part_service.create_part(
                description="Test part",
                manufacturer_code=""  # Empty string should become NULL
            )
            session.commit()

            # Verify empty string was converted to NULL
            assert part.manufacturer_code is None

    def test_empty_string_on_update_nullable_field(self, app: Flask, session: Session, container: ServiceContainer):
        """Test empty string conversion to NULL on update for nullable fields."""
        with app.app_context():
            part_service = container.part_service()

            # Create part with valid manufacturer_code
            part = part_service.create_part(
                description="Test part",
                manufacturer_code="ABC123"
            )
            session.commit()

            # Verify initial value
            assert part.manufacturer_code == "ABC123"

            # Update to empty string
            part.manufacturer_code = ""
            session.commit()

            # Verify empty string was converted to NULL
            assert part.manufacturer_code is None

    def test_whitespace_only_strings_normalized(self, app: Flask, session: Session, container: ServiceContainer):
        """Test that whitespace-only strings are converted to NULL."""
        with app.app_context():
            part_service = container.part_service()

            test_cases = [
                "   ",      # spaces
                "\t\n",     # tabs and newlines
                " \t \n ",  # mixed whitespace
            ]

            for whitespace_value in test_cases:
                part = part_service.create_part(
                    description="Test part",
                    manufacturer_code=whitespace_value
                )
                session.commit()

                # Verify whitespace-only string was converted to NULL
                assert part.manufacturer_code is None, f"Failed for whitespace: {repr(whitespace_value)}"

    def test_valid_strings_preserved(self, app: Flask, session: Session, container: ServiceContainer):
        """Test that valid strings are not modified."""
        with app.app_context():
            part_service = container.part_service()

            valid_strings = [
                "ABC123",
                " ABC123 ",  # Leading/trailing spaces with content should be preserved
                "A B C",     # Spaces within content
                "\tABC\n",   # Tabs/newlines with content
            ]

            for valid_value in valid_strings:
                part = part_service.create_part(
                    description="Test part",
                    manufacturer_code=valid_value
                )
                session.commit()

                # Verify valid string was preserved exactly
                assert part.manufacturer_code == valid_value, f"Failed for value: {repr(valid_value)}"

    def test_none_values_unchanged(self, app: Flask, session: Session, container: ServiceContainer):
        """Test that None values remain unchanged."""
        with app.app_context():
            part_service = container.part_service()

            # Create part with None value
            part = part_service.create_part(
                description="Test part",
                manufacturer_code=None
            )
            session.commit()

            # Verify None remains None
            assert part.manufacturer_code is None

            # Update other field without touching manufacturer_code
            part.manufacturer = "Test Manufacturer"
            session.commit()

            # Verify manufacturer_code still None
            assert part.manufacturer_code is None

    def test_non_nullable_field_rejects_empty_string(self, app: Flask, session: Session, container: ServiceContainer):
        """Test that non-nullable fields reject empty strings by raising IntegrityError."""
        with app.app_context():
            part_service = container.part_service()

            # Attempt to create Part with empty description (non-nullable)
            with pytest.raises(IntegrityError):
                part_service.create_part(description="")
                session.commit()

            # Reset session after error
            session.rollback()

            # Also test with whitespace-only description
            with pytest.raises(IntegrityError):
                part_service.create_part(description="   ")
                session.commit()

            session.rollback()

    def test_seller_non_nullable_fields(self, app: Flask, session: Session, container: ServiceContainer):
        """Test that Seller non-nullable fields reject empty strings."""
        with app.app_context():
            seller_service = container.seller_service()

            # Test empty name (non-nullable) - service layer catches the IntegrityError
            # and converts it to ResourceConflictException
            with pytest.raises(ResourceConflictException):
                seller_service.create_seller(name="", website="https://example.com")

            # Test empty website (non-nullable) - service layer catches the IntegrityError
            # and converts it to ResourceConflictException
            with pytest.raises(ResourceConflictException):
                seller_service.create_seller(name="Test Seller", website="")

            # Test whitespace-only values
            with pytest.raises(ResourceConflictException):
                seller_service.create_seller(name="   ", website="https://example.com")

            with pytest.raises(ResourceConflictException):
                seller_service.create_seller(name="Test Seller", website="   ")

    def test_multiple_string_fields_normalized(self, app: Flask, session: Session, container: ServiceContainer):
        """Test that all string fields in a model are normalized."""
        with app.app_context():
            part_service = container.part_service()

            # Create part with empty strings in multiple fields
            part = part_service.create_part(
                description="Test part",
                manufacturer_code="",
                manufacturer="",
                product_page="",
                seller_link="",
                package="",
                pin_pitch="",
                voltage_rating="",
                input_voltage="",
                output_voltage="",
                mounting_type="",
                series="",
                dimensions=""
            )
            session.commit()

            # Verify all empty string fields were converted to NULL
            assert part.manufacturer_code is None
            assert part.manufacturer is None
            assert part.product_page is None
            assert part.seller_link is None
            assert part.package is None
            assert part.pin_pitch is None
            assert part.voltage_rating is None
            assert part.input_voltage is None
            assert part.output_voltage is None
            assert part.mounting_type is None
            assert part.series is None
            assert part.dimensions is None

    def test_text_field_normalization(self, app: Flask, session: Session, container: ServiceContainer):
        """Test that Text fields (like description when nullable) are normalized."""
        with app.app_context():
            part_service = container.part_service()

            # Create part with valid description first
            part = part_service.create_part(description="Valid description")
            session.commit()

            # Test that if description were nullable, empty strings would be normalized
            # Since description is NOT NULL, we can't test this directly, but we can
            # test the normalization logic works by using the manufacturer field
            part.manufacturer = "   "  # Whitespace-only
            session.commit()

            # Verify normalization occurred
            assert part.manufacturer is None

    def test_normalization_during_bulk_operations(self, app: Flask, session: Session, container: ServiceContainer):
        """Test normalization works during bulk operations."""
        with app.app_context():
            part_service = container.part_service()

            # Create multiple parts with empty strings
            parts = []
            for i in range(3):
                part = part_service.create_part(
                    description=f"Test part {i}",
                    manufacturer_code=""
                )
                parts.append(part)

            session.commit()

            # Verify all parts had their empty strings normalized
            for part in parts:
                assert part.manufacturer_code is None

    def test_update_existing_part_with_empty_strings(self, app: Flask, session: Session, container: ServiceContainer):
        """Test updating an existing part with empty strings."""
        with app.app_context():
            part_service = container.part_service()

            # Create part with valid data
            part = part_service.create_part(
                description="Test part",
                manufacturer_code="ABC123",
                manufacturer="Test Corp",
                package="SOT-23"
            )
            session.commit()

            # Verify initial values
            assert part.manufacturer_code == "ABC123"
            assert part.manufacturer == "Test Corp"
            assert part.package == "SOT-23"

            # Update some fields to empty strings
            part.manufacturer_code = ""
            part.manufacturer = "   "  # Whitespace
            # Leave package unchanged
            session.commit()

            # Verify normalization
            assert part.manufacturer_code is None
            assert part.manufacturer is None
            assert part.package == "SOT-23"  # Unchanged

    def test_non_string_fields_unaffected(self, app: Flask, session: Session, container: ServiceContainer):
        """Test that non-string fields are not affected by normalization."""
        with app.app_context():
            part_service = container.part_service()
            type_service = container.type_service()

            # Create a type first
            part_type = type_service.create_type("Test Type")
            session.commit()

            # Create part with various field types
            part = part_service.create_part(
                description="Test part",
                type_id=part_type.id,
                pin_count=10
            )
            session.commit()

            # Verify non-string fields are preserved
            assert part.type_id == part_type.id
            assert part.pin_count == 10
            assert part.created_at is not None
            assert part.updated_at is not None
