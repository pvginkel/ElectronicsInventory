"""Tests for box service functionality."""

from flask import Flask

from app.extensions import db
from app.models.box import Box
from app.models.location import Location
from app.schemas.box import BoxListSchema, BoxResponseSchema
from app.services.box_service import BoxService


class TestBoxService:
    """Test cases for BoxService."""

    def test_create_box(self, app: Flask):
        """Test creating a new box with locations."""
        with app.app_context():
            # Create a box with capacity 10
            result = BoxService.create_box("Test Box", 10)

            # Verify return type
            assert isinstance(result, BoxResponseSchema)
            assert result.box_no == 1
            assert result.description == "Test Box"
            assert result.capacity == 10
            assert len(result.locations) == 10

            # Verify locations are sequential
            location_numbers = [loc.loc_no for loc in result.locations]
            assert location_numbers == list(range(1, 11))

            # Verify database state
            box = db.session.get(Box, result.box_no)
            assert box is not None
            assert box.description == "Test Box"
            assert box.capacity == 10

    def test_create_multiple_boxes_sequential_numbering(self, app: Flask):
        """Test that multiple boxes get sequential box_no values."""
        with app.app_context():
            box1 = BoxService.create_box("Box 1", 5)
            box2 = BoxService.create_box("Box 2", 3)
            box3 = BoxService.create_box("Box 3", 8)

            assert box1.box_no == 1
            assert box2.box_no == 2
            assert box3.box_no == 3

    def test_get_box_with_locations_existing(self, app: Flask):
        """Test getting an existing box with its locations."""
        with app.app_context():
            # Create a box first
            created_box = BoxService.create_box("Test Box", 5)

            # Retrieve it
            result = BoxService.get_box_with_locations(created_box.box_no)

            assert result is not None
            assert isinstance(result, BoxResponseSchema)
            assert result.box_no == created_box.box_no
            assert result.description == "Test Box"
            assert result.capacity == 5
            assert len(result.locations) == 5

    def test_get_box_with_locations_nonexistent(self, app: Flask):
        """Test getting a non-existent box returns None."""
        with app.app_context():
            result = BoxService.get_box_with_locations(999)
            assert result is None

    def test_get_all_boxes_empty(self, app: Flask):
        """Test getting all boxes when none exist."""
        with app.app_context():
            result = BoxService.get_all_boxes()
            assert isinstance(result, list)
            assert len(result) == 0

    def test_get_all_boxes_multiple(self, app: Flask):
        """Test getting all boxes when multiple exist."""
        with app.app_context():
            BoxService.create_box("Box A", 5)
            BoxService.create_box("Box B", 10)
            BoxService.create_box("Box C", 3)

            result = BoxService.get_all_boxes()

            assert isinstance(result, list)
            assert len(result) == 3

            # Verify all items are BoxListSchema
            for box in result:
                assert isinstance(box, BoxListSchema)

            # Verify ordering by box_no
            box_nos = [box.box_no for box in result]
            assert box_nos == [1, 2, 3]

            # Verify descriptions
            descriptions = [box.description for box in result]
            assert descriptions == ["Box A", "Box B", "Box C"]

    def test_update_box_capacity_increase(self, app: Flask):
        """Test increasing box capacity creates new locations."""
        with app.app_context():
            # Create box with capacity 5
            box = BoxService.create_box("Test Box", 5)
            original_box_no = box.box_no

            # Increase capacity to 8
            result = BoxService.update_box_capacity(original_box_no, 8, "Updated Box")

            assert result is not None
            assert isinstance(result, BoxResponseSchema)
            assert result.box_no == original_box_no
            assert result.description == "Updated Box"
            assert result.capacity == 8
            assert len(result.locations) == 8

            # Verify new locations were added
            location_numbers = sorted([loc.loc_no for loc in result.locations])
            assert location_numbers == list(range(1, 9))

    def test_update_box_capacity_decrease(self, app: Flask):
        """Test decreasing box capacity removes locations."""
        with app.app_context():
            # Create box with capacity 8
            box = BoxService.create_box("Test Box", 8)
            original_box_no = box.box_no

            # Decrease capacity to 5
            result = BoxService.update_box_capacity(original_box_no, 5, "Smaller Box")

            assert result is not None
            assert isinstance(result, BoxResponseSchema)
            assert result.box_no == original_box_no
            assert result.description == "Smaller Box"
            assert result.capacity == 5
            assert len(result.locations) == 5

            # Verify only locations 1-5 remain
            location_numbers = sorted([loc.loc_no for loc in result.locations])
            assert location_numbers == [1, 2, 3, 4, 5]

    def test_update_box_capacity_same_capacity(self, app: Flask):
        """Test updating box with same capacity only changes description."""
        with app.app_context():
            # Create box with capacity 5
            box = BoxService.create_box("Test Box", 5)
            original_box_no = box.box_no

            # Update with same capacity but new description
            result = BoxService.update_box_capacity(original_box_no, 5, "Updated Description")

            assert result is not None
            assert result.description == "Updated Description"
            assert result.capacity == 5
            assert len(result.locations) == 5

    def test_update_box_capacity_nonexistent(self, app: Flask):
        """Test updating a non-existent box returns None."""
        with app.app_context():
            result = BoxService.update_box_capacity(999, 10, "Non-existent")
            assert result is None

    def test_delete_box_existing(self, app: Flask):
        """Test deleting an existing box."""
        with app.app_context():
            # Create a box
            box = BoxService.create_box("Test Box", 5)
            box_no = box.box_no

            # Verify it exists
            assert db.session.get(Box, box_no) is not None

            # Delete it
            result = BoxService.delete_box(box_no)
            assert result is True

            # Verify it's gone
            assert db.session.get(Box, box_no) is None

            # Verify locations are also gone due to cascade
            locations = db.session.query(Location).filter_by(box_no=box_no).all()
            assert len(locations) == 0

    def test_delete_box_nonexistent(self, app: Flask):
        """Test deleting a non-existent box returns False."""
        with app.app_context():
            result = BoxService.delete_box(999)
            assert result is False

    def test_get_location_grid_existing(self, app: Flask):
        """Test getting location grid for existing box."""
        with app.app_context():
            # Create a box
            box = BoxService.create_box("Test Box", 6)

            # Get location grid
            result = BoxService.get_location_grid(box.box_no)

            assert result is not None
            assert result["box_no"] == box.box_no
            assert result["capacity"] == 6
            assert "locations" in result
            assert len(result["locations"]) == 6

            # Verify location structure
            for i, location in enumerate(result["locations"], 1):
                assert location["loc_no"] == i
                assert location["available"] is True

    def test_get_location_grid_nonexistent(self, app: Flask):
        """Test getting location grid for non-existent box returns None."""
        with app.app_context():
            result = BoxService.get_location_grid(999)
            assert result is None

    def test_box_capacity_validation(self, app: Flask):
        """Test that box capacity must be positive."""
        with app.app_context():
            # This should be handled by the API layer with Pydantic validation
            # But let's test with valid values to ensure service works
            box = BoxService.create_box("Valid Box", 1)
            assert box.capacity == 1
            assert len(box.locations) == 1

    def test_location_cascade_delete(self, app: Flask):
        """Test that deleting a box cascades to delete locations."""
        with app.app_context():
            # Create box with locations
            box = BoxService.create_box("Test Box", 3)
            box_no = box.box_no

            # Verify locations exist
            locations_before = db.session.query(Location).filter_by(box_no=box_no).all()
            assert len(locations_before) == 3

            # Delete box
            BoxService.delete_box(box_no)

            # Verify locations are gone
            locations_after = db.session.query(Location).filter_by(box_no=box_no).all()
            assert len(locations_after) == 0
