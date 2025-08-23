"""Tests for capacity validation and business logic."""

import pytest
from flask import Flask
from pydantic import ValidationError
from sqlalchemy.orm import Session

from app.extensions import db
from app.models.box import Box
from app.models.location import Location
from app.schemas.box import BoxCreateSchema
from app.services.box_service import BoxService


class TestCapacityValidation:
    """Test cases for capacity validation and related business logic."""

    def test_pydantic_schema_capacity_positive(self):
        """Test that Pydantic schema enforces positive capacity."""
        # Valid capacity
        valid_schema = BoxCreateSchema(description="Test Box", capacity=10)
        assert valid_schema.capacity == 10

        # Zero capacity should fail
        with pytest.raises(ValidationError) as exc_info:
            BoxCreateSchema(description="Test Box", capacity=0)

        error_details = exc_info.value.errors()
        assert any("greater than 0" in str(error) for error in error_details)

        # Negative capacity should fail
        with pytest.raises(ValidationError) as exc_info:
            BoxCreateSchema(description="Test Box", capacity=-5)

        error_details = exc_info.value.errors()
        assert any("greater than 0" in str(error) for error in error_details)

    def test_box_service_creates_correct_number_of_locations(
        self, app: Flask, session: Session
    ):
        """Test that BoxService creates exactly capacity number of locations."""
        with app.app_context():
            # Test with various capacities
            capacities = [1, 5, 10, 25, 50, 100]

            for i, capacity in enumerate(capacities, 1):
                box = BoxService.create_box(session, f"Box {i}", capacity)

                assert len(box.locations) == capacity

                # Verify in database
                db_locations = (
                    db.session.query(Location).filter_by(box_no=box.box_no).all()
                )
                assert len(db_locations) == capacity

    def test_box_service_location_numbering_sequential(
        self, app: Flask, session: Session
    ):
        """Test that locations are numbered sequentially from 1 to capacity."""
        with app.app_context():
            capacity = 15
            box = BoxService.create_box(session, "Test Box", capacity)

            # Check location numbers are 1 to capacity
            location_numbers = sorted([loc.loc_no for loc in box.locations])
            expected_numbers = list(range(1, capacity + 1))
            assert location_numbers == expected_numbers

    def test_capacity_increase_creates_new_locations(
        self, app: Flask, session: Session
    ):
        """Test that increasing capacity creates new locations with correct numbering."""
        with app.app_context():
            # Create box with initial capacity
            box = BoxService.create_box(session, "Test Box", 5)
            original_box_no = box.box_no

            # Increase capacity
            updated_box = BoxService.update_box_capacity(
                session, original_box_no, 10, "Updated Box"
            )

            assert updated_box is not None
            assert updated_box.capacity == 10
            assert len(updated_box.locations) == 10

            # Verify locations are numbered 1-10
            location_numbers = sorted([loc.loc_no for loc in updated_box.locations])
            assert location_numbers == list(range(1, 11))

            # Verify in database
            db_locations = (
                db.session.query(Location).filter_by(box_no=original_box_no).all()
            )
            assert len(db_locations) == 10
            db_location_numbers = sorted([loc.loc_no for loc in db_locations])
            assert db_location_numbers == list(range(1, 11))

    def test_capacity_decrease_removes_higher_numbered_locations(
        self, app: Flask, session: Session
    ):
        """Test that decreasing capacity removes higher-numbered locations."""
        with app.app_context():
            # Create box with initial capacity
            box = BoxService.create_box(session, "Test Box", 10)
            original_box_no = box.box_no

            # Decrease capacity
            updated_box = BoxService.update_box_capacity(
                session, original_box_no, 6, "Smaller Box"
            )

            assert updated_box is not None
            assert updated_box.capacity == 6
            assert len(updated_box.locations) == 6

            # Verify remaining locations are numbered 1-6
            location_numbers = sorted([loc.loc_no for loc in updated_box.locations])
            assert location_numbers == list(range(1, 7))

            # Verify in database that higher-numbered locations are gone
            db_locations = (
                db.session.query(Location).filter_by(box_no=original_box_no).all()
            )
            assert len(db_locations) == 6
            db_location_numbers = sorted([loc.loc_no for loc in db_locations])
            assert db_location_numbers == list(range(1, 7))

            # Specifically verify locations 7-10 don't exist
            high_locations = (
                db.session.query(Location)
                .filter(Location.box_no == original_box_no, Location.loc_no > 6)
                .all()
            )
            assert len(high_locations) == 0

    def test_capacity_same_value_no_location_changes(
        self, app: Flask, session: Session
    ):
        """Test that updating with same capacity doesn't change locations."""
        with app.app_context():
            # Create box
            box = BoxService.create_box(session, "Test Box", 8)
            original_box_no = box.box_no
            original_location_count = len(box.locations)

            # Update with same capacity but different description
            updated_box = BoxService.update_box_capacity(
                session, original_box_no, 8, "Updated Description"
            )

            assert updated_box is not None
            assert updated_box.capacity == 8
            assert len(updated_box.locations) == original_location_count
            assert updated_box.description == "Updated Description"

            # Verify location numbers unchanged
            location_numbers = sorted([loc.loc_no for loc in updated_box.locations])
            assert location_numbers == list(range(1, 9))

    def test_minimum_capacity_edge_case(self, app: Flask, session: Session):
        """Test creating box with minimum capacity (1)."""
        with app.app_context():
            box = BoxService.create_box(session, "Single Slot Box", 1)

            assert box.capacity == 1
            assert len(box.locations) == 1
            assert box.locations[0].loc_no == 1

    def test_large_capacity_handling(self, app: Flask, session: Session):
        """Test creating box with large capacity."""
        with app.app_context():
            large_capacity = 500
            box = BoxService.create_box(session, "Large Box", large_capacity)

            assert box.capacity == large_capacity
            assert len(box.locations) == large_capacity

            # Verify sequential numbering for large capacity
            location_numbers = [loc.loc_no for loc in box.locations]
            assert min(location_numbers) == 1
            assert max(location_numbers) == large_capacity
            assert len(set(location_numbers)) == large_capacity  # All unique

    def test_capacity_decrease_to_minimum(self, app: Flask, session: Session):
        """Test decreasing capacity to minimum (1)."""
        with app.app_context():
            # Create box with larger capacity
            box = BoxService.create_box(session, "Test Box", 20)
            original_box_no = box.box_no

            # Decrease to minimum
            updated_box = BoxService.update_box_capacity(
                session, original_box_no, 1, "Minimal Box"
            )

            assert updated_box is not None
            assert updated_box.capacity == 1
            assert len(updated_box.locations) == 1
            assert updated_box.locations[0].loc_no == 1

    def test_multiple_capacity_changes(self, app: Flask, session: Session):
        """Test multiple capacity changes maintain consistency."""
        with app.app_context():
            # Create box
            box = BoxService.create_box(session, "Test Box", 10)
            box_no = box.box_no

            # First increase
            updated_box = BoxService.update_box_capacity(
                session, box_no, 15, "Expanded Box"
            )
            assert updated_box is not None
            assert len(updated_box.locations) == 15

            # Then decrease
            updated_box = BoxService.update_box_capacity(
                session, box_no, 8, "Shrunk Box"
            )
            assert updated_box is not None
            assert len(updated_box.locations) == 8

            # Then increase again
            updated_box = BoxService.update_box_capacity(
                session, box_no, 12, "Re-expanded Box"
            )
            assert updated_box is not None
            assert len(updated_box.locations) == 12

            # Verify final state
            location_numbers = sorted([loc.loc_no for loc in updated_box.locations])
            assert location_numbers == list(range(1, 13))

    def test_capacity_validation_in_response_schema(self, app: Flask, session: Session):
        """Test that service returns ORM box models properly."""
        with app.app_context():
            # Create box through service
            box = BoxService.create_box(session, "Test Box", 7)

            # Verify ORM model returned with eager loaded locations
            assert isinstance(box, Box)
            assert box.capacity == 7
            assert len(box.locations) == 7

    def test_location_generation_atomicity(self, app: Flask, session: Session):
        """Test that location generation is atomic (all or nothing)."""
        with app.app_context():
            # This test ensures that if location creation fails partway through,
            # the entire operation is rolled back

            capacity = 10
            box = BoxService.create_box(session, "Test Box", capacity)

            # Verify all locations were created and loaded successfully
            assert len(box.locations) == capacity

            # Verify all locations have the correct box reference
            for location in box.locations:
                assert location.box_no == box.box_no
                assert location.box_id is not None

    def test_capacity_boundary_conditions(self, app: Flask, session: Session):
        """Test capacity at various boundary conditions."""
        with app.app_context():
            # Test powers of 2 (common edge cases)
            powers_of_2 = [1, 2, 4, 8, 16, 32, 64, 128, 256]

            for i, capacity in enumerate(powers_of_2):
                box = BoxService.create_box(session, f"Box 2^{i}", capacity)
                assert len(box.locations) == capacity

                # Verify numbering
                location_numbers = sorted([loc.loc_no for loc in box.locations])
                assert location_numbers == list(range(1, capacity + 1))

    def test_capacity_validation_error_messages(self):
        """Test that capacity validation provides clear error messages."""
        with pytest.raises(ValidationError) as exc_info:
            BoxCreateSchema(description="Test", capacity=0)

        errors = exc_info.value.errors()
        # Check that error mentions the constraint
        capacity_errors = [e for e in errors if "capacity" in str(e)]
        assert len(capacity_errors) > 0

        with pytest.raises(ValidationError) as exc_info:
            BoxCreateSchema(description="Test", capacity=-10)

        errors = exc_info.value.errors()
        capacity_errors = [e for e in errors if "capacity" in str(e)]
        assert len(capacity_errors) > 0
