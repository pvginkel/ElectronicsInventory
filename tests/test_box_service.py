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
            assert "it contains parts that must be moved or removed first" in exc_info.value.message

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
            assert "it contains parts that must be moved or removed first" in exc_info.value.message

    def test_delete_box_with_part_in_multiple_locations(self, app: Flask, session: Session):
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
            assert "it contains parts that must be moved or removed first" in exc_info.value.message

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
