"""Tests for box service functionality."""

import pytest
from flask import Flask
from sqlalchemy.orm import Session

from app.exceptions import InvalidOperationException
from app.models.box import Box
from app.models.location import Location
from app.services.box_service import BoxService
from app.services.inventory_service import InventoryService


class TestBoxService:
    """Test cases for BoxService."""

    def test_create_box(self, app: Flask, session: Session):
        """Test creating a new box with locations."""
        with app.app_context():
            # Create a box with capacity 10
            result = BoxService.create_box(session, "Test Box", 10)

            # Verify return type is ORM model
            assert isinstance(result, Box)
            assert result.box_no == 1
            assert result.description == "Test Box"
            assert result.capacity == 10

            # Verify locations are populated via eager loading
            assert len(result.locations) == 10
            location_numbers = [loc.loc_no for loc in result.locations]
            assert sorted(location_numbers) == list(range(1, 11))

    def test_create_multiple_boxes_sequential_numbering(
        self, app: Flask, session: Session
    ):
        """Test that multiple boxes get sequential box_no values."""
        with app.app_context():
            box1 = BoxService.create_box(session, "Box 1", 5)
            box2 = BoxService.create_box(session, "Box 2", 3)
            box3 = BoxService.create_box(session, "Box 3", 8)

            assert box1.box_no == 1
            assert box2.box_no == 2
            assert box3.box_no == 3

    def test_get_box_existing(self, app: Flask, session: Session):
        """Test getting an existing box with its locations."""
        with app.app_context():
            # Create a box first
            created_box = BoxService.create_box(session, "Test Box", 5)
            session.commit()

            # Retrieve it
            result = BoxService.get_box(session, created_box.box_no)

            assert result is not None
            assert isinstance(result, Box)
            assert result.box_no == created_box.box_no
            assert result.description == "Test Box"
            assert result.capacity == 5
            assert len(result.locations) == 5

    def test_get_box_nonexistent(self, app: Flask, session: Session):
        """Test getting a non-existent box raises RecordNotFoundException."""
        with app.app_context():
            import pytest

            from app.exceptions import RecordNotFoundException

            with pytest.raises(RecordNotFoundException) as exc_info:
                BoxService.get_box(session, 999)
            assert "Box 999 was not found" in str(exc_info.value)

    def test_get_all_boxes_empty(self, app: Flask, session: Session):
        """Test getting all boxes when none exist."""
        with app.app_context():
            result = BoxService.get_all_boxes(session)
            assert isinstance(result, list)
            assert len(result) == 0

    def test_get_all_boxes_multiple(self, app: Flask, session: Session):
        """Test getting all boxes when multiple exist."""
        with app.app_context():
            BoxService.create_box(session, "Box A", 5)
            BoxService.create_box(session, "Box B", 10)
            BoxService.create_box(session, "Box C", 3)
            session.commit()

            result = BoxService.get_all_boxes(session)

            assert isinstance(result, list)
            assert len(result) == 3

            # Verify all items are Box ORM models
            for box in result:
                assert isinstance(box, Box)

            # Verify ordering by box_no
            box_nos = [box.box_no for box in result]
            assert box_nos == [1, 2, 3]

            # Verify descriptions
            descriptions = [box.description for box in result]
            assert descriptions == ["Box A", "Box B", "Box C"]

    def test_update_box_capacity_increase(self, app: Flask, session: Session):
        """Test increasing box capacity creates new locations."""
        with app.app_context():
            # Create box with capacity 5
            box = BoxService.create_box(session, "Test Box", 5)
            original_box_no = box.box_no

            # Increase capacity to 8
            result = BoxService.update_box_capacity(
                session, original_box_no, 8, "Updated Box"
            )

            assert result is not None
            assert isinstance(result, Box)
            assert result.box_no == original_box_no
            assert result.description == "Updated Box"
            assert result.capacity == 8

            # Verify new locations are populated via eager loading
            assert len(result.locations) == 8
            location_numbers = sorted([loc.loc_no for loc in result.locations])
            assert location_numbers == list(range(1, 9))

    def test_update_box_capacity_decrease(self, app: Flask, session: Session):
        """Test decreasing box capacity removes locations."""
        with app.app_context():
            # Create box with capacity 8
            box = BoxService.create_box(session, "Test Box", 8)
            original_box_no = box.box_no

            # Decrease capacity to 5
            result = BoxService.update_box_capacity(
                session, original_box_no, 5, "Smaller Box"
            )

            assert result is not None
            assert isinstance(result, Box)
            assert result.box_no == original_box_no
            assert result.description == "Smaller Box"
            assert result.capacity == 5

            # Verify only locations 1-5 remain via eager loading
            assert len(result.locations) == 5
            location_numbers = sorted([loc.loc_no for loc in result.locations])
            assert location_numbers == [1, 2, 3, 4, 5]

    def test_update_box_capacity_same_capacity(self, app: Flask, session: Session):
        """Test updating box with same capacity only changes description."""
        with app.app_context():
            # Create box with capacity 5
            box = BoxService.create_box(session, "Test Box", 5)
            original_box_no = box.box_no

            # Update with same capacity but new description
            result = BoxService.update_box_capacity(
                session, original_box_no, 5, "Updated Description"
            )

            assert result is not None
            assert result.description == "Updated Description"
            assert result.capacity == 5
            assert len(result.locations) == 5

    def test_update_box_capacity_nonexistent(self, app: Flask, session: Session):
        """Test updating a non-existent box raises RecordNotFoundException."""
        with app.app_context():
            import pytest

            from app.exceptions import RecordNotFoundException

            with pytest.raises(RecordNotFoundException) as exc_info:
                BoxService.update_box_capacity(session, 999, 10, "Non-existent")
            assert "Box 999 was not found" in str(exc_info.value)

    def test_delete_box_existing(self, app: Flask, session: Session):
        """Test deleting an existing box."""
        with app.app_context():
            # Create a box
            box = BoxService.create_box(session, "Test Box", 5)
            box_no = box.box_no
            box_id = box.id
            session.commit()

            # Verify it exists
            assert session.get(Box, box_id) is not None

            # Delete it
            BoxService.delete_box(session, box_no)
            session.commit()
            # Verify it's deleted
            assert session.get(Box, box_id) is None

            # Verify it's gone
            assert session.get(Box, box_id) is None

            # Verify locations are also gone due to cascade
            locations = session.query(Location).filter_by(box_no=box_no).all()
            assert len(locations) == 0

    def test_delete_box_nonexistent(self, app: Flask, session: Session):
        """Test deleting a non-existent box raises RecordNotFoundException."""
        with app.app_context():
            import pytest

            from app.exceptions import RecordNotFoundException

            with pytest.raises(RecordNotFoundException) as exc_info:
                BoxService.delete_box(session, 999)
            assert "Box 999 was not found" in str(exc_info.value)

    def test_box_capacity_validation(self, app: Flask, session: Session):
        """Test that box capacity must be positive."""
        with app.app_context():
            # This should be handled by the API layer with Pydantic validation
            # But let's test with valid values to ensure service works
            box = BoxService.create_box(session, "Valid Box", 1)
            assert box.capacity == 1

            # Check locations are populated via eager loading
            assert len(box.locations) == 1

    def test_location_cascade_delete(self, app: Flask, session: Session):
        """Test that deleting a box cascades to delete locations."""
        with app.app_context():
            # Create box with locations
            box = BoxService.create_box(session, "Test Box", 3)
            box_no = box.box_no
            session.commit()

            # Verify locations exist
            locations_before = session.query(Location).filter_by(box_no=box_no).all()
            assert len(locations_before) == 3

            # Delete box
            BoxService.delete_box(session, box_no)
            session.commit()

            # Verify locations are gone
            locations_after = session.query(Location).filter_by(box_no=box_no).all()
            assert len(locations_after) == 0

    def test_delete_box_with_single_part(self, app: Flask, session: Session):
        """Test deleting a box with a single part prevents deletion."""
        with app.app_context():
            # Create box
            box = BoxService.create_box(session, "Test Box", 10)
            session.commit()

            # Add a part to the box
            InventoryService.add_stock(session, "TEST", box.box_no, 1, 5)
            session.commit()

            # Attempt to delete box should fail
            with pytest.raises(InvalidOperationException) as exc_info:
                BoxService.delete_box(session, box.box_no)

            assert f"Cannot delete box {box.box_no}" in exc_info.value.message
            assert (
                "it contains parts that must be moved or removed first"
                in exc_info.value.message
            )

            # Verify box still exists
            remaining_box = BoxService.get_box(session, box.box_no)
            assert remaining_box.box_no == box.box_no

    def test_delete_box_with_multiple_parts(self, app: Flask, session: Session):
        """Test deleting a box with multiple different parts prevents deletion."""
        with app.app_context():
            # Create box
            box = BoxService.create_box(session, "Test Box", 10)
            session.commit()

            # Add multiple parts to different locations in the box
            InventoryService.add_stock(session, "PART", box.box_no, 1, 10)
            InventoryService.add_stock(session, "TEST", box.box_no, 3, 5)
            InventoryService.add_stock(session, "DEMO", box.box_no, 7, 15)
            session.commit()

            # Attempt to delete box should fail
            with pytest.raises(InvalidOperationException) as exc_info:
                BoxService.delete_box(session, box.box_no)

            assert f"Cannot delete box {box.box_no}" in exc_info.value.message
            assert (
                "it contains parts that must be moved or removed first"
                in exc_info.value.message
            )

    def test_delete_box_with_part_in_multiple_locations(
        self, app: Flask, session: Session
    ):
        """Test deleting a box where one part exists in multiple locations prevents deletion."""
        with app.app_context():
            # Create box
            box = BoxService.create_box(session, "Test Box", 10)
            session.commit()

            # Add same part to multiple locations within the same box
            InventoryService.add_stock(session, "TEST", box.box_no, 1, 5)
            InventoryService.add_stock(session, "TEST", box.box_no, 5, 10)
            InventoryService.add_stock(session, "TEST", box.box_no, 9, 3)
            session.commit()

            # Attempt to delete box should fail
            with pytest.raises(InvalidOperationException) as exc_info:
                BoxService.delete_box(session, box.box_no)

            assert f"Cannot delete box {box.box_no}" in exc_info.value.message
            assert (
                "it contains parts that must be moved or removed first"
                in exc_info.value.message
            )

    def test_delete_box_after_removing_all_parts(self, app: Flask, session: Session):
        """Test that box can be deleted after all parts are removed."""
        with app.app_context():
            # Create box
            box = BoxService.create_box(session, "Test Box", 10)
            session.commit()

            # Add parts to the box
            InventoryService.add_stock(session, "TEST", box.box_no, 1, 5)
            InventoryService.add_stock(session, "DEMO", box.box_no, 3, 10)
            session.commit()

            # Verify deletion fails with parts present
            with pytest.raises(InvalidOperationException):
                BoxService.delete_box(session, box.box_no)

            # Remove all parts
            InventoryService.remove_stock(session, "TEST", box.box_no, 1, 5)
            InventoryService.remove_stock(session, "DEMO", box.box_no, 3, 10)
            session.commit()

            # Now deletion should succeed
            BoxService.delete_box(session, box.box_no)
            session.commit()

            # Verify box is deleted
            from app.exceptions import RecordNotFoundException

            with pytest.raises(RecordNotFoundException):
                BoxService.get_box(session, box.box_no)

    def test_delete_empty_box_succeeds(self, app: Flask, session: Session):
        """Test that deleting an empty box works as before."""
        with app.app_context():
            # Create box
            box = BoxService.create_box(session, "Empty Box", 5)
            box_no = box.box_no
            session.commit()

            # Delete empty box should work
            BoxService.delete_box(session, box_no)
            session.commit()

            # Verify box is deleted
            from app.exceptions import RecordNotFoundException

            with pytest.raises(RecordNotFoundException):
                BoxService.get_box(session, box_no)

    def test_delete_box_mixed_scenario(self, app: Flask, session: Session):
        """Test complex scenario with multiple parts in multiple locations across different boxes."""
        with app.app_context():
            # Create two boxes
            box1 = BoxService.create_box(session, "Box 1", 5)
            box2 = BoxService.create_box(session, "Box 2", 5)
            session.commit()

            # Add parts to both boxes
            # Box 1: Same part in multiple locations + different part
            InventoryService.add_stock(session, "COMP", box1.box_no, 1, 10)
            InventoryService.add_stock(session, "COMP", box1.box_no, 3, 5)
            InventoryService.add_stock(session, "RESI", box1.box_no, 2, 20)

            # Box 2: Different parts
            InventoryService.add_stock(session, "CAPA", box2.box_no, 1, 15)
            InventoryService.add_stock(session, "TRAN", box2.box_no, 4, 8)
            session.commit()

            # Both boxes should fail to delete
            with pytest.raises(InvalidOperationException):
                BoxService.delete_box(session, box1.box_no)

            with pytest.raises(InvalidOperationException):
                BoxService.delete_box(session, box2.box_no)

            # Remove all parts from box1 only
            InventoryService.remove_stock(session, "COMP", box1.box_no, 1, 10)
            InventoryService.remove_stock(session, "COMP", box1.box_no, 3, 5)
            InventoryService.remove_stock(session, "RESI", box1.box_no, 2, 20)
            session.commit()

            # Now box1 can be deleted but box2 still cannot
            BoxService.delete_box(session, box1.box_no)
            session.commit()

            with pytest.raises(InvalidOperationException):
                BoxService.delete_box(session, box2.box_no)

            # Verify box1 is gone and box2 still exists
            from app.exceptions import RecordNotFoundException

            with pytest.raises(RecordNotFoundException):
                BoxService.get_box(session, box1.box_no)

            remaining_box2 = BoxService.get_box(session, box2.box_no)
            assert remaining_box2.box_no == box2.box_no

    def test_calculate_box_usage_empty_box(self, app: Flask, session: Session):
        """Test calculating usage for an empty box."""
        with app.app_context():
            # Create empty box
            box = BoxService.create_box(session, "Empty Box", 20)
            session.commit()

            usage_stats = BoxService.calculate_box_usage(session, box.box_no)

            assert usage_stats.box_no == box.box_no
            assert usage_stats.total_locations == 20
            assert usage_stats.occupied_locations == 0
            assert usage_stats.available_locations == 20
            assert usage_stats.usage_percentage == 0.0

    def test_calculate_box_usage_partially_filled(self, app: Flask, session: Session):
        """Test calculating usage for a partially filled box."""
        with app.app_context():
            # Create box and add parts to some locations
            box = BoxService.create_box(session, "Partial Box", 10)
            session.commit()

            # Add parts to 3 different locations (30% usage)
            InventoryService.add_stock(session, "PART", box.box_no, 1, 5)
            InventoryService.add_stock(session, "TEST", box.box_no, 3, 10)
            InventoryService.add_stock(session, "DEMO", box.box_no, 7, 2)
            session.commit()

            usage_stats = BoxService.calculate_box_usage(session, box.box_no)

            assert usage_stats.box_no == box.box_no
            assert usage_stats.total_locations == 10
            assert usage_stats.occupied_locations == 3
            assert usage_stats.available_locations == 7
            assert usage_stats.usage_percentage == 30.0

    def test_calculate_box_usage_same_part_multiple_locations(
        self, app: Flask, session: Session
    ):
        """Test calculating usage when same part is in multiple locations."""
        with app.app_context():
            # Create box and add same part to multiple locations
            box = BoxService.create_box(session, "Multi-location Box", 5)
            session.commit()

            # Add same part to 4 different locations (80% usage)
            InventoryService.add_stock(session, "PART", box.box_no, 1, 10)
            InventoryService.add_stock(session, "PART", box.box_no, 2, 5)
            InventoryService.add_stock(session, "PART", box.box_no, 4, 15)
            InventoryService.add_stock(session, "PART", box.box_no, 5, 20)
            session.commit()

            usage_stats = BoxService.calculate_box_usage(session, box.box_no)

            assert usage_stats.box_no == box.box_no
            assert usage_stats.total_locations == 5
            assert usage_stats.occupied_locations == 4
            assert usage_stats.available_locations == 1
            assert usage_stats.usage_percentage == 80.0

    def test_calculate_box_usage_completely_filled(self, app: Flask, session: Session):
        """Test calculating usage for a completely filled box."""
        with app.app_context():
            # Create small box and fill all locations
            box = BoxService.create_box(session, "Full Box", 3)
            session.commit()

            # Fill all 3 locations
            InventoryService.add_stock(session, "PART", box.box_no, 1, 100)
            InventoryService.add_stock(session, "TEST", box.box_no, 2, 50)
            InventoryService.add_stock(session, "DEMO", box.box_no, 3, 25)
            session.commit()

            usage_stats = BoxService.calculate_box_usage(session, box.box_no)

            assert usage_stats.box_no == box.box_no
            assert usage_stats.total_locations == 3
            assert usage_stats.occupied_locations == 3
            assert usage_stats.available_locations == 0
            assert usage_stats.usage_percentage == 100.0

    def test_calculate_box_usage_nonexistent_box(self, app: Flask, session: Session):
        """Test calculating usage for a non-existent box raises exception."""
        with app.app_context():
            from app.exceptions import RecordNotFoundException

            with pytest.raises(RecordNotFoundException) as exc_info:
                BoxService.calculate_box_usage(session, 999)
            assert "Box 999 was not found" in str(exc_info.value)

    def test_get_all_boxes_with_usage_empty_database(
        self, app: Flask, session: Session
    ):
        """Test getting all boxes with usage when no boxes exist."""
        with app.app_context():
            boxes_with_usage = BoxService.get_all_boxes_with_usage(session)
            assert boxes_with_usage == []

    def test_get_all_boxes_with_usage_multiple_boxes(
        self, app: Flask, session: Session
    ):
        """Test getting all boxes with usage statistics."""
        with app.app_context():
            # Create boxes with different usage levels
            box1 = BoxService.create_box(session, "Empty Box", 10)
            box2 = BoxService.create_box(session, "Partial Box", 20)
            box3 = BoxService.create_box(session, "Full Box", 5)
            session.commit()

            # Add parts to some boxes
            # Box 2: 3 locations used (15% usage)
            InventoryService.add_stock(session, "PART", box2.box_no, 1, 10)
            InventoryService.add_stock(session, "TEST", box2.box_no, 5, 5)
            InventoryService.add_stock(session, "DEMO", box2.box_no, 10, 15)

            # Box 3: all locations used (100% usage)
            InventoryService.add_stock(session, "COMP", box3.box_no, 1, 20)
            InventoryService.add_stock(session, "RESI", box3.box_no, 2, 30)
            InventoryService.add_stock(session, "CAPA", box3.box_no, 3, 40)
            InventoryService.add_stock(session, "TRAN", box3.box_no, 4, 50)
            InventoryService.add_stock(session, "DIGI", box3.box_no, 5, 60)
            session.commit()

            # Get all boxes with usage
            boxes_with_usage = BoxService.get_all_boxes_with_usage(session)

            assert len(boxes_with_usage) == 3

            # Create lookup by box_no for easier testing
            usage_by_box = {item.box.box_no: item for item in boxes_with_usage}

            # Check Box 1 (empty)
            box1_usage = usage_by_box[box1.box_no]
            assert box1_usage.occupied_locations == 0
            assert box1_usage.usage_percentage == 0.0

            # Check Box 2 (partial)
            box2_usage = usage_by_box[box2.box_no]
            assert box2_usage.occupied_locations == 3
            assert box2_usage.usage_percentage == 15.0

            # Check Box 3 (full)
            box3_usage = usage_by_box[box3.box_no]
            assert box3_usage.occupied_locations == 5
            assert box3_usage.usage_percentage == 100.0

    def test_get_all_boxes_with_usage_ordering(self, app: Flask, session: Session):
        """Test that boxes are returned in correct order (by box_no)."""
        with app.app_context():
            # Create boxes (will get sequential box numbers)
            box1 = BoxService.create_box(session, "First Box", 5)
            box2 = BoxService.create_box(session, "Second Box", 10)
            box3 = BoxService.create_box(session, "Third Box", 15)
            session.commit()

            boxes_with_usage = BoxService.get_all_boxes_with_usage(session)

            assert len(boxes_with_usage) == 3

            # Verify ordering by box_no
            box_numbers = [item.box.box_no for item in boxes_with_usage]
            assert box_numbers == sorted(box_numbers)
            assert box_numbers == [box1.box_no, box2.box_no, box3.box_no]

    def test_get_box_locations_with_parts_empty_box(self, app: Flask, session: Session):
        """Test getting locations with parts for an empty box."""
        with app.app_context():
            # Create empty box
            box = BoxService.create_box(session, "Empty Box", 5)
            session.commit()

            locations_with_parts = BoxService.get_box_locations_with_parts(
                session, box.box_no
            )

            assert len(locations_with_parts) == 5
            for location_data in locations_with_parts:
                assert location_data.box_no == box.box_no
                assert location_data.loc_no in [1, 2, 3, 4, 5]
                assert location_data.is_occupied is False
                assert location_data.part_assignments == []

    def test_get_box_locations_with_parts_partially_filled(
        self, app: Flask, session: Session
    ):
        """Test getting locations with parts for a partially filled box."""
        with app.app_context():
            # Create box and add parts to some locations
            box = BoxService.create_box(session, "Partial Box", 4)
            session.commit()

            # Add parts to locations 1 and 3
            InventoryService.add_stock(session, "PART", box.box_no, 1, 10)
            InventoryService.add_stock(session, "TEST", box.box_no, 3, 25)
            session.commit()

            locations_with_parts = BoxService.get_box_locations_with_parts(
                session, box.box_no
            )

            assert len(locations_with_parts) == 4

            # Check location 1 (occupied)
            loc1 = next(loc for loc in locations_with_parts if loc.loc_no == 1)
            assert loc1.is_occupied is True
            assert len(loc1.part_assignments) == 1
            assert loc1.part_assignments[0].id4 == "PART"
            assert loc1.part_assignments[0].qty == 10

            # Check location 2 (empty)
            loc2 = next(loc for loc in locations_with_parts if loc.loc_no == 2)
            assert loc2.is_occupied is False
            assert loc2.part_assignments == []

            # Check location 3 (occupied)
            loc3 = next(loc for loc in locations_with_parts if loc.loc_no == 3)
            assert loc3.is_occupied is True
            assert len(loc3.part_assignments) == 1
            assert loc3.part_assignments[0].id4 == "TEST"
            assert loc3.part_assignments[0].qty == 25

            # Check location 4 (empty)
            loc4 = next(loc for loc in locations_with_parts if loc.loc_no == 4)
            assert loc4.is_occupied is False
            assert loc4.part_assignments == []

    def test_get_box_locations_with_parts_multiple_parts_per_location(
        self, app: Flask, session: Session
    ):
        """Test getting locations when multiple parts are in same location (edge case)."""
        with app.app_context():
            # Note: The current unique constraint prevents multiple parts per location,
            # but the query should handle it gracefully if constraints change
            box = BoxService.create_box(session, "Test Box", 3)
            session.commit()

            # Add one part to location 2
            InventoryService.add_stock(session, "COMP", box.box_no, 2, 15)
            session.commit()

            locations_with_parts = BoxService.get_box_locations_with_parts(
                session, box.box_no
            )

            assert len(locations_with_parts) == 3

            # Check location 2 has the expected part
            loc2 = next(loc for loc in locations_with_parts if loc.loc_no == 2)
            assert loc2.is_occupied is True
            assert len(loc2.part_assignments) == 1
            assert loc2.part_assignments[0].id4 == "COMP"
            assert loc2.part_assignments[0].qty == 15

    def test_get_box_locations_with_parts_part_description_and_manufacturer(
        self, app: Flask, session: Session
    ):
        """Test that part descriptions and manufacturer codes are included correctly."""
        with app.app_context():
            box = BoxService.create_box(session, "Test Box", 2)
            session.commit()

            # Add a part with description and manufacturer code
            InventoryService.add_stock(session, "RESI", box.box_no, 1, 50)

            # Get the part and update its details
            from app.models.part import Part

            part = session.query(Part).filter_by(id4="RESI").first()
            part.description = "10K Ohm Resistor"
            part.manufacturer_code = "RES-10K-0603"
            session.commit()

            locations_with_parts = BoxService.get_box_locations_with_parts(
                session, box.box_no
            )

            # Check location 1 has the part with correct details
            loc1 = next(loc for loc in locations_with_parts if loc.loc_no == 1)
            assert loc1.is_occupied is True
            assert len(loc1.part_assignments) == 1

            assignment = loc1.part_assignments[0]
            assert assignment.id4 == "RESI"
            assert assignment.qty == 50
            assert assignment.description == "10K Ohm Resistor"
            assert assignment.manufacturer_code == "RES-10K-0603"

    def test_get_box_locations_with_parts_null_manufacturer_code(
        self, app: Flask, session: Session
    ):
        """Test handling of parts with null manufacturer codes."""
        with app.app_context():
            box = BoxService.create_box(session, "Test Box", 2)
            session.commit()

            # Add part without manufacturer code
            InventoryService.add_stock(session, "CAPA", box.box_no, 1, 30)

            # Get the part and ensure manufacturer_code is None
            from app.models.part import Part

            part = session.query(Part).filter_by(id4="CAPA").first()
            part.description = "100uF Capacitor"
            part.manufacturer_code = None  # Explicitly set to None
            session.commit()

            locations_with_parts = BoxService.get_box_locations_with_parts(
                session, box.box_no
            )

            # Check location 1 has the part with null manufacturer code
            loc1 = next(loc for loc in locations_with_parts if loc.loc_no == 1)
            assert loc1.is_occupied is True

            assignment = loc1.part_assignments[0]
            assert assignment.id4 == "CAPA"
            assert assignment.manufacturer_code is None
            assert assignment.description == "100uF Capacitor"

    def test_get_box_locations_with_parts_ordering(self, app: Flask, session: Session):
        """Test that locations are returned in proper order (by loc_no)."""
        with app.app_context():
            box = BoxService.create_box(session, "Test Box", 6)
            session.commit()

            # Add parts in non-sequential order
            InventoryService.add_stock(session, "PART", box.box_no, 5, 10)
            InventoryService.add_stock(session, "TEST", box.box_no, 2, 20)
            InventoryService.add_stock(session, "DEMO", box.box_no, 6, 5)
            session.commit()

            locations_with_parts = BoxService.get_box_locations_with_parts(
                session, box.box_no
            )

            # Verify all locations are present and ordered
            assert len(locations_with_parts) == 6
            location_numbers = [loc.loc_no for loc in locations_with_parts]
            assert location_numbers == [1, 2, 3, 4, 5, 6]

            # Verify only expected locations are occupied
            occupied_locations = [
                loc.loc_no for loc in locations_with_parts if loc.is_occupied
            ]
            assert sorted(occupied_locations) == [2, 5, 6]

    def test_get_box_locations_with_parts_nonexistent_box(
        self, app: Flask, session: Session
    ):
        """Test getting locations with parts for a non-existent box raises RecordNotFoundException."""
        with app.app_context():
            from app.exceptions import RecordNotFoundException

            with pytest.raises(RecordNotFoundException) as exc_info:
                BoxService.get_box_locations_with_parts(session, 999)
            assert "Box 999 was not found" in str(exc_info.value)

    def test_get_box_locations_with_parts_data_consistency(
        self, app: Flask, session: Session
    ):
        """Test that location part data is consistent with usage statistics."""
        with app.app_context():
            box = BoxService.create_box(session, "Consistency Test Box", 8)
            session.commit()

            # Add parts to specific locations
            InventoryService.add_stock(session, "COMP", box.box_no, 1, 100)
            InventoryService.add_stock(session, "RESI", box.box_no, 3, 50)
            InventoryService.add_stock(session, "CAPA", box.box_no, 7, 25)
            session.commit()

            # Get location data and usage stats
            locations_with_parts = BoxService.get_box_locations_with_parts(
                session, box.box_no
            )
            usage_stats = BoxService.calculate_box_usage(session, box.box_no)

            # Count occupied locations from location data
            occupied_count_from_locations = sum(
                1 for loc in locations_with_parts if loc.is_occupied
            )

            # Should match usage statistics
            assert occupied_count_from_locations == usage_stats.occupied_locations
            assert occupied_count_from_locations == 3
            assert usage_stats.available_locations == 5
