"""Tests for box service functionality."""

import pytest
from flask import Flask
from sqlalchemy.orm import Session

from app.exceptions import InvalidOperationException
from app.models.box import Box
from app.models.location import Location
from app.services.container import ServiceContainer


class TestBoxService:
    """Test cases for BoxService."""

    def test_create_box(self, app: Flask, session: Session, container: ServiceContainer):
        """Test creating a new box with locations."""
        with app.app_context():
            # Create a box with capacity 10
            result = container.box_service().create_box("Test Box", 10)

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
        self, app: Flask, session: Session, container: ServiceContainer
    ):
        """Test that multiple boxes get sequential box_no values."""
        with app.app_context():
            box1 = container.box_service().create_box("Box 1", 5)
            box2 = container.box_service().create_box("Box 2", 3)
            box3 = container.box_service().create_box("Box 3", 8)

            assert box1.box_no == 1
            assert box2.box_no == 2
            assert box3.box_no == 3

    def test_get_box_existing(self, app: Flask, session: Session, container: ServiceContainer):
        """Test getting an existing box with its locations."""
        with app.app_context():
            # Create a box first
            created_box = container.box_service().create_box("Test Box", 5)
            session.commit()

            # Retrieve it
            result = container.box_service().get_box(created_box.box_no)

            assert result is not None
            assert isinstance(result, Box)
            assert result.box_no == created_box.box_no
            assert result.description == "Test Box"
            assert result.capacity == 5
            assert len(result.locations) == 5

    def test_get_box_nonexistent(self, app: Flask, session: Session, container: ServiceContainer):
        """Test getting a non-existent box raises RecordNotFoundException."""
        with app.app_context():
            import pytest

            from app.exceptions import RecordNotFoundException

            with pytest.raises(RecordNotFoundException) as exc_info:
                container.box_service().get_box(999)
            assert "Box 999 was not found" in str(exc_info.value)

    def test_get_all_boxes_empty(self, app: Flask, session: Session, container: ServiceContainer):
        """Test getting all boxes when none exist."""
        with app.app_context():
            result = container.box_service().get_all_boxes()
            assert isinstance(result, list)
            assert len(result) == 0

    def test_get_all_boxes_multiple(self, app: Flask, session: Session, container: ServiceContainer):
        """Test getting all boxes when multiple exist."""
        with app.app_context():
            container.box_service().create_box("Box A", 5)
            container.box_service().create_box("Box B", 10)
            container.box_service().create_box("Box C", 3)
            session.commit()

            result = container.box_service().get_all_boxes()

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

    def test_update_box_capacity_increase(self, app: Flask, session: Session, container: ServiceContainer):
        """Test increasing box capacity creates new locations."""
        with app.app_context():
            # Create box with capacity 5
            box = container.box_service().create_box("Test Box", 5)
            original_box_no = box.box_no

            # Increase capacity to 8
            result = container.box_service().update_box_capacity(
                original_box_no, 8, "Updated Box"
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

    def test_update_box_capacity_decrease(self, app: Flask, session: Session, container: ServiceContainer):
        """Test decreasing box capacity removes locations."""
        with app.app_context():
            # Create box with capacity 8
            box = container.box_service().create_box("Test Box", 8)
            original_box_no = box.box_no

            # Decrease capacity to 5
            result = container.box_service().update_box_capacity(
                original_box_no, 5, "Smaller Box"
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

    def test_update_box_capacity_same_capacity(self, app: Flask, session: Session, container: ServiceContainer):
        """Test updating box with same capacity only changes description."""
        with app.app_context():
            # Create box with capacity 5
            box = container.box_service().create_box("Test Box", 5)
            original_box_no = box.box_no

            # Update with same capacity but new description
            result = container.box_service().update_box_capacity(
                original_box_no, 5, "Updated Description"
            )

            assert result is not None
            assert result.description == "Updated Description"
            assert result.capacity == 5
            assert len(result.locations) == 5

    def test_update_box_capacity_nonexistent(self, app: Flask, session: Session, container: ServiceContainer):
        """Test updating a non-existent box raises RecordNotFoundException."""
        with app.app_context():
            import pytest

            from app.exceptions import RecordNotFoundException

            with pytest.raises(RecordNotFoundException) as exc_info:
                container.box_service().update_box_capacity(999, 10, "Non-existent")
            assert "Box 999 was not found" in str(exc_info.value)

    def test_delete_box_existing(self, app: Flask, session: Session, container: ServiceContainer):
        """Test deleting an existing box."""
        with app.app_context():
            # Create a box
            box = container.box_service().create_box("Test Box", 5)
            box_no = box.box_no
            box_id = box.id
            session.commit()

            # Verify it exists
            assert session.get(Box, box_id) is not None

            # Delete it
            container.box_service().delete_box(box_no)
            session.commit()
            # Verify it's deleted
            assert session.get(Box, box_id) is None

            # Verify it's gone
            assert session.get(Box, box_id) is None

            # Verify locations are also gone due to cascade
            locations = session.query(Location).filter_by(box_no=box_no).all()
            assert len(locations) == 0

    def test_delete_box_nonexistent(self, app: Flask, session: Session, container: ServiceContainer):
        """Test deleting a non-existent box raises RecordNotFoundException."""
        with app.app_context():
            import pytest

            from app.exceptions import RecordNotFoundException

            with pytest.raises(RecordNotFoundException) as exc_info:
                container.box_service().delete_box(999)
            assert "Box 999 was not found" in str(exc_info.value)

    def test_box_capacity_validation(self, app: Flask, session: Session, container: ServiceContainer):
        """Test that box capacity must be positive."""
        with app.app_context():
            # This should be handled by the API layer with Pydantic validation
            # But let's test with valid values to ensure service works
            box = container.box_service().create_box("Valid Box", 1)
            assert box.capacity == 1

            # Check locations are populated via eager loading
            assert len(box.locations) == 1

    def test_location_cascade_delete(self, app: Flask, session: Session, container: ServiceContainer):
        """Test that deleting a box cascades to delete locations."""
        with app.app_context():
            # Create box with locations
            box = container.box_service().create_box("Test Box", 3)
            box_no = box.box_no
            session.commit()

            # Verify locations exist
            locations_before = session.query(Location).filter_by(box_no=box_no).all()
            assert len(locations_before) == 3

            # Delete box
            container.box_service().delete_box(box_no)
            session.commit()

            # Verify locations are gone
            locations_after = session.query(Location).filter_by(box_no=box_no).all()
            assert len(locations_after) == 0

    def test_delete_box_with_single_part(self, app: Flask, session: Session, container: ServiceContainer):
        """Test deleting a box with a single part prevents deletion."""
        with app.app_context():
            # Create box
            box = container.box_service().create_box("Test Box", 10)
            
            # Create a part first
            part = container.part_service().create_part("Test part")
            session.commit()

            # Add the part to the box
            container.inventory_service().add_stock(part.key, box.box_no, 1, 5)
            session.commit()

            # Attempt to delete box should fail
            with pytest.raises(InvalidOperationException) as exc_info:
                container.box_service().delete_box(box.box_no)

            assert f"Cannot delete box {box.box_no}" in exc_info.value.message
            assert "it contains parts that must be moved or removed first" in exc_info.value.message

            # Verify box still exists
            remaining_box = container.box_service().get_box(box.box_no)
            assert remaining_box.box_no == box.box_no

    def test_delete_box_with_multiple_parts(self, app: Flask, session: Session, container: ServiceContainer):
        """Test deleting a box with multiple different parts prevents deletion."""
        with app.app_context():
            # Create box
            box = container.box_service().create_box("Test Box", 10)
            
            # Create multiple parts first
            part1 = container.part_service().create_part("Part 1")
            part2 = container.part_service().create_part("Part 2")
            part3 = container.part_service().create_part("Part 3")
            session.commit()

            # Add multiple parts to different locations in the box
            container.inventory_service().add_stock(part1.key, box.box_no, 1, 10)
            container.inventory_service().add_stock(part2.key, box.box_no, 3, 5)
            container.inventory_service().add_stock(part3.key, box.box_no, 7, 15)
            session.commit()

            # Attempt to delete box should fail
            with pytest.raises(InvalidOperationException) as exc_info:
                container.box_service().delete_box(box.box_no)

            assert f"Cannot delete box {box.box_no}" in exc_info.value.message
            assert "it contains parts that must be moved or removed first" in exc_info.value.message

    def test_delete_box_with_part_in_multiple_locations(self, app: Flask, session: Session, container: ServiceContainer):
        """Test deleting a box where one part exists in multiple locations prevents deletion."""
        with app.app_context():
            # Create box
            box = container.box_service().create_box("Test Box", 10)
            
            # Create a part first
            part = container.part_service().create_part("Test part")
            session.commit()

            # Add same part to multiple locations within the same box
            container.inventory_service().add_stock(part.key, box.box_no, 1, 5)
            container.inventory_service().add_stock(part.key, box.box_no, 5, 10)
            container.inventory_service().add_stock(part.key, box.box_no, 9, 3)
            session.commit()

            # Attempt to delete box should fail
            with pytest.raises(InvalidOperationException) as exc_info:
                container.box_service().delete_box(box.box_no)

            assert f"Cannot delete box {box.box_no}" in exc_info.value.message
            assert "it contains parts that must be moved or removed first" in exc_info.value.message

    def test_delete_box_after_removing_all_parts(self, app: Flask, session: Session, container: ServiceContainer):
        """Test that box can be deleted after all parts are removed."""
        with app.app_context():
            # Create box
            box = container.box_service().create_box("Test Box", 10)
            
            # Create parts first
            part1 = container.part_service().create_part("Test part")
            part2 = container.part_service().create_part("Demo part")
            session.commit()

            # Add parts to the box
            container.inventory_service().add_stock(part1.key, box.box_no, 1, 5)
            container.inventory_service().add_stock(part2.key, box.box_no, 3, 10)
            session.commit()

            # Verify deletion fails with parts present
            with pytest.raises(InvalidOperationException):
                container.box_service().delete_box(box.box_no)

            # Remove all parts
            container.inventory_service().remove_stock(part1.key, box.box_no, 1, 5)
            container.inventory_service().remove_stock(part2.key, box.box_no, 3, 10)
            session.commit()

            # Now deletion should succeed
            container.box_service().delete_box(box.box_no)
            session.commit()

            # Verify box is deleted
            from app.exceptions import RecordNotFoundException
            with pytest.raises(RecordNotFoundException):
                container.box_service().get_box(box.box_no)

    def test_delete_empty_box_succeeds(self, app: Flask, session: Session, container: ServiceContainer):
        """Test that deleting an empty box works as before."""
        with app.app_context():
            # Create box
            box = container.box_service().create_box("Empty Box", 5)
            box_no = box.box_no
            session.commit()

            # Delete empty box should work
            container.box_service().delete_box(box_no)
            session.commit()

            # Verify box is deleted
            from app.exceptions import RecordNotFoundException
            with pytest.raises(RecordNotFoundException):
                container.box_service().get_box(box_no)

    def test_delete_box_mixed_scenario(self, app: Flask, session: Session, container: ServiceContainer):
        """Test complex scenario with multiple parts in multiple locations across different boxes."""
        with app.app_context():
            # Create two boxes
            box1 = container.box_service().create_box("Box 1", 5)
            box2 = container.box_service().create_box("Box 2", 5)
            
            # Create parts first
            comp_part = container.part_service().create_part("Component")
            resi_part = container.part_service().create_part("Resistor")
            capa_part = container.part_service().create_part("Capacitor")
            tran_part = container.part_service().create_part("Transistor")
            session.commit()

            # Add parts to both boxes
            # Box 1: Same part in multiple locations + different part
            container.inventory_service().add_stock(comp_part.key, box1.box_no, 1, 10)
            container.inventory_service().add_stock(comp_part.key, box1.box_no, 3, 5)
            container.inventory_service().add_stock(resi_part.key, box1.box_no, 2, 20)

            # Box 2: Different parts
            container.inventory_service().add_stock(capa_part.key, box2.box_no, 1, 15)
            container.inventory_service().add_stock(tran_part.key, box2.box_no, 4, 8)
            session.commit()

            # Both boxes should fail to delete
            with pytest.raises(InvalidOperationException):
                container.box_service().delete_box(box1.box_no)

            with pytest.raises(InvalidOperationException):
                container.box_service().delete_box(box2.box_no)

            # Remove all parts from box1 only
            container.inventory_service().remove_stock(comp_part.key, box1.box_no, 1, 10)
            container.inventory_service().remove_stock(comp_part.key, box1.box_no, 3, 5)
            container.inventory_service().remove_stock(resi_part.key, box1.box_no, 2, 20)
            session.commit()

            # Now box1 can be deleted but box2 still cannot
            container.box_service().delete_box(box1.box_no)
            session.commit()

            with pytest.raises(InvalidOperationException):
                container.box_service().delete_box(box2.box_no)

            # Verify box1 is gone and box2 still exists
            from app.exceptions import RecordNotFoundException
            with pytest.raises(RecordNotFoundException):
                container.box_service().get_box(box1.box_no)

            remaining_box2 = container.box_service().get_box(box2.box_no)
            assert remaining_box2.box_no == box2.box_no

    def test_calculate_box_usage_empty_box(self, app: Flask, session: Session, container: ServiceContainer):
        """Test calculating usage for an empty box."""
        with app.app_context():
            # Create empty box
            box = container.box_service().create_box("Empty Box", 20)
            session.commit()

            usage_stats = container.box_service().calculate_box_usage(box.box_no)

            assert usage_stats.box_no == box.box_no
            assert usage_stats.total_locations == 20
            assert usage_stats.occupied_locations == 0
            assert usage_stats.available_locations == 20
            assert usage_stats.usage_percentage == 0.0

    def test_calculate_box_usage_partially_filled(self, app: Flask, session: Session, container: ServiceContainer):
        """Test calculating usage for a partially filled box."""
        with app.app_context():
            # Create box and add parts to some locations
            box = container.box_service().create_box("Partial Box", 10)
            
            # Create parts first
            part1 = container.part_service().create_part("Part 1")
            part2 = container.part_service().create_part("Part 2")
            part3 = container.part_service().create_part("Part 3")
            session.commit()

            # Add parts to 3 different locations (30% usage)
            container.inventory_service().add_stock(part1.key, box.box_no, 1, 5)
            container.inventory_service().add_stock(part2.key, box.box_no, 3, 10)
            container.inventory_service().add_stock(part3.key, box.box_no, 7, 2)
            session.commit()

            usage_stats = container.box_service().calculate_box_usage(box.box_no)

            assert usage_stats.box_no == box.box_no
            assert usage_stats.total_locations == 10
            assert usage_stats.occupied_locations == 3
            assert usage_stats.available_locations == 7
            assert usage_stats.usage_percentage == 30.0

    def test_calculate_box_usage_same_part_multiple_locations(self, app: Flask, session: Session, container: ServiceContainer):
        """Test calculating usage when same part is in multiple locations."""
        with app.app_context():
            # Create box and add same part to multiple locations
            box = container.box_service().create_box("Multi-location Box", 5)
            
            # Create part first
            part = container.part_service().create_part("Test part")
            session.commit()

            # Add same part to 4 different locations (80% usage)
            container.inventory_service().add_stock(part.key, box.box_no, 1, 10)
            container.inventory_service().add_stock(part.key, box.box_no, 2, 5)
            container.inventory_service().add_stock(part.key, box.box_no, 4, 15)
            container.inventory_service().add_stock(part.key, box.box_no, 5, 20)
            session.commit()

            usage_stats = container.box_service().calculate_box_usage(box.box_no)

            assert usage_stats.box_no == box.box_no
            assert usage_stats.total_locations == 5
            assert usage_stats.occupied_locations == 4
            assert usage_stats.available_locations == 1
            assert usage_stats.usage_percentage == 80.0

    def test_calculate_box_usage_completely_filled(self, app: Flask, session: Session, container: ServiceContainer):
        """Test calculating usage for a completely filled box."""
        with app.app_context():
            # Create small box and fill all locations
            box = container.box_service().create_box("Full Box", 3)
            
            # Create parts first
            part1 = container.part_service().create_part("Part 1")
            part2 = container.part_service().create_part("Part 2")
            part3 = container.part_service().create_part("Part 3")
            session.commit()

            # Fill all 3 locations
            container.inventory_service().add_stock(part1.key, box.box_no, 1, 100)
            container.inventory_service().add_stock(part2.key, box.box_no, 2, 50)
            container.inventory_service().add_stock(part3.key, box.box_no, 3, 25)
            session.commit()

            usage_stats = container.box_service().calculate_box_usage(box.box_no)

            assert usage_stats.box_no == box.box_no
            assert usage_stats.total_locations == 3
            assert usage_stats.occupied_locations == 3
            assert usage_stats.available_locations == 0
            assert usage_stats.usage_percentage == 100.0

    def test_calculate_box_usage_nonexistent_box(self, app: Flask, session: Session, container: ServiceContainer):
        """Test calculating usage for a non-existent box raises exception."""
        with app.app_context():
            from app.exceptions import RecordNotFoundException

            with pytest.raises(RecordNotFoundException) as exc_info:
                container.box_service().calculate_box_usage(999)
            assert "Box 999 was not found" in str(exc_info.value)

    def test_get_all_boxes_with_usage_empty_database(self, app: Flask, session: Session, container: ServiceContainer):
        """Test getting all boxes with usage when no boxes exist."""
        with app.app_context():
            boxes_with_usage = container.box_service().get_all_boxes_with_usage()
            assert boxes_with_usage == []

    def test_get_all_boxes_with_usage_multiple_boxes(self, app: Flask, session: Session, container: ServiceContainer):
        """Test getting all boxes with usage statistics."""
        with app.app_context():
            # Create boxes with different usage levels
            box1 = container.box_service().create_box("Empty Box", 10)
            box2 = container.box_service().create_box("Partial Box", 20)
            box3 = container.box_service().create_box("Full Box", 5)
            session.commit()

            # Create parts first
            part1 = container.part_service().create_part("Part 1")
            part2 = container.part_service().create_part("Part 2")
            part3 = container.part_service().create_part("Part 3")
            comp_part = container.part_service().create_part("Component")
            resi_part = container.part_service().create_part("Resistor")
            capa_part = container.part_service().create_part("Capacitor")
            tran_part = container.part_service().create_part("Transistor")
            digi_part = container.part_service().create_part("Digital")
            session.flush()
            
            # Add parts to some boxes
            # Box 2: 3 locations used (15% usage)
            container.inventory_service().add_stock(part1.key, box2.box_no, 1, 10)
            container.inventory_service().add_stock(part2.key, box2.box_no, 5, 5)
            container.inventory_service().add_stock(part3.key, box2.box_no, 10, 15)

            # Box 3: all locations used (100% usage)
            container.inventory_service().add_stock(comp_part.key, box3.box_no, 1, 20)
            container.inventory_service().add_stock(resi_part.key, box3.box_no, 2, 30)
            container.inventory_service().add_stock(capa_part.key, box3.box_no, 3, 40)
            container.inventory_service().add_stock(tran_part.key, box3.box_no, 4, 50)
            container.inventory_service().add_stock(digi_part.key, box3.box_no, 5, 60)
            session.commit()

            # Get all boxes with usage
            boxes_with_usage = container.box_service().get_all_boxes_with_usage()

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

    def test_get_all_boxes_with_usage_ordering(self, app: Flask, session: Session, container: ServiceContainer):
        """Test that boxes are returned in correct order (by box_no)."""
        with app.app_context():
            # Create boxes (will get sequential box numbers)
            box1 = container.box_service().create_box("First Box", 5)
            box2 = container.box_service().create_box("Second Box", 10)
            box3 = container.box_service().create_box("Third Box", 15)
            session.commit()

            boxes_with_usage = container.box_service().get_all_boxes_with_usage()

            assert len(boxes_with_usage) == 3

            # Verify ordering by box_no
            box_numbers = [item.box.box_no for item in boxes_with_usage]
            assert box_numbers == sorted(box_numbers)
            assert box_numbers == [box1.box_no, box2.box_no, box3.box_no]

    def test_get_box_locations_with_parts_empty_box(self, app: Flask, session: Session, container: ServiceContainer):
        """Test getting locations with parts for an empty box."""
        with app.app_context():
            # Create empty box
            box = container.box_service().create_box("Empty Box", 5)
            session.commit()

            locations_with_parts = container.box_service().get_box_locations_with_parts(box.box_no)

            assert len(locations_with_parts) == 5
            for i, location_data in enumerate(locations_with_parts, 1):
                assert location_data.box_no == box.box_no
                assert location_data.loc_no == i
                assert location_data.is_occupied == False
                assert location_data.part_assignments == []

    def test_get_box_locations_with_parts_single_part(self, app: Flask, session: Session, container: ServiceContainer):
        """Test getting locations with parts when box has one part in one location."""
        with app.app_context():
            # Create box and add one part
            box = container.box_service().create_box("Single Part Box", 3)
            
            # Create part first
            part = container.part_service().create_part("Resistor")
            session.commit()
            
            # Add part to location 2
            container.inventory_service().add_stock(part.key, box.box_no, 2, 25)
            session.commit()

            locations_with_parts = container.box_service().get_box_locations_with_parts(box.box_no)

            assert len(locations_with_parts) == 3
            
            # Location 1: empty
            assert locations_with_parts[0].box_no == box.box_no
            assert locations_with_parts[0].loc_no == 1
            assert locations_with_parts[0].is_occupied == False
            assert locations_with_parts[0].part_assignments == []
            
            # Location 2: has part
            assert locations_with_parts[1].box_no == box.box_no
            assert locations_with_parts[1].loc_no == 2
            assert locations_with_parts[1].is_occupied == True
            assert len(locations_with_parts[1].part_assignments) == 1
            
            part_assignment = locations_with_parts[1].part_assignments[0]
            assert part_assignment.key == part.key
            assert part_assignment.qty == 25
            assert part_assignment.manufacturer_code is None
            assert part_assignment.description == "Resistor"
            
            # Location 3: empty
            assert locations_with_parts[2].box_no == box.box_no
            assert locations_with_parts[2].loc_no == 3
            assert locations_with_parts[2].is_occupied == False
            assert locations_with_parts[2].part_assignments == []

    def test_get_box_locations_with_parts_multiple_parts(self, app: Flask, session: Session, container: ServiceContainer):
        """Test getting locations with parts when multiple parts in different locations."""
        with app.app_context():
            # Create box and add multiple parts
            box = container.box_service().create_box("Multi Part Box", 5)
            session.commit()
            
            # Create parts first
            part1 = container.part_service().create_part("Resistor")
            part2 = container.part_service().create_part("Capacitor")
            part3 = container.part_service().create_part("Inductor")
            session.flush()
            
            # Add parts to different locations
            container.inventory_service().add_stock(part1.key, box.box_no, 1, 10)
            container.inventory_service().add_stock(part2.key, box.box_no, 3, 50)
            container.inventory_service().add_stock(part3.key, box.box_no, 5, 5)
            session.commit()

            locations_with_parts = container.box_service().get_box_locations_with_parts(box.box_no)

            assert len(locations_with_parts) == 5
            
            # Location 1: has resistor
            assert locations_with_parts[0].is_occupied == True
            assert len(locations_with_parts[0].part_assignments) == 1
            assert locations_with_parts[0].part_assignments[0].key == part1.key
            assert locations_with_parts[0].part_assignments[0].qty == 10
            
            # Location 2: empty
            assert locations_with_parts[1].is_occupied == False
            assert locations_with_parts[1].part_assignments == []
            
            # Location 3: has capacitor
            assert locations_with_parts[2].is_occupied == True
            assert len(locations_with_parts[2].part_assignments) == 1
            assert locations_with_parts[2].part_assignments[0].key == part2.key
            assert locations_with_parts[2].part_assignments[0].qty == 50
            
            # Location 4: empty
            assert locations_with_parts[3].is_occupied == False
            assert locations_with_parts[3].part_assignments == []
            
            # Location 5: has inductor
            assert locations_with_parts[4].is_occupied == True
            assert len(locations_with_parts[4].part_assignments) == 1
            assert locations_with_parts[4].part_assignments[0].key == part3.key
            assert locations_with_parts[4].part_assignments[0].qty == 5

    def test_get_box_locations_with_parts_same_part_multiple_locations(self, app: Flask, session: Session, container: ServiceContainer):
        """Test getting locations when same part is in multiple locations."""
        with app.app_context():
            # Create box and add same part to multiple locations
            box = container.box_service().create_box("Same Part Box", 4)
            session.commit()
            
            # Create part first
            part = container.part_service().create_part("Resistor")
            session.flush()
            
            # Add same part to different locations with different quantities
            container.inventory_service().add_stock(part.key, box.box_no, 1, 100)
            container.inventory_service().add_stock(part.key, box.box_no, 3, 200)
            container.inventory_service().add_stock(part.key, box.box_no, 4, 50)
            session.commit()

            locations_with_parts = container.box_service().get_box_locations_with_parts(box.box_no)

            assert len(locations_with_parts) == 4
            
            # Location 1: has resistor (qty=100)
            assert locations_with_parts[0].is_occupied == True
            assert len(locations_with_parts[0].part_assignments) == 1
            assert locations_with_parts[0].part_assignments[0].key == part.key
            assert locations_with_parts[0].part_assignments[0].qty == 100
            
            # Location 2: empty
            assert locations_with_parts[1].is_occupied == False
            assert locations_with_parts[1].part_assignments == []
            
            # Location 3: has R001 (qty=200)
            assert locations_with_parts[2].is_occupied == True
            assert len(locations_with_parts[2].part_assignments) == 1
            assert locations_with_parts[2].part_assignments[0].key == part.key
            assert locations_with_parts[2].part_assignments[0].qty == 200
            
            # Location 4: has R001 (qty=50)
            assert locations_with_parts[3].is_occupied == True
            assert len(locations_with_parts[3].part_assignments) == 1
            assert locations_with_parts[3].part_assignments[0].key == part.key
            assert locations_with_parts[3].part_assignments[0].qty == 50

    def test_get_box_locations_with_parts_with_part_details(self, app: Flask, session: Session, container: ServiceContainer):
        """Test getting locations with parts including manufacturer code and description."""
        with app.app_context():
            # Create box and part with full details
            box = container.box_service().create_box("Detailed Parts Box", 3)
            part = container.part_service().create_part(
                "1kΩ resistor, 0603 package",
                manufacturer_code="RES-0603-1K"
            )
            session.commit()
            
            # Add part to location
            container.inventory_service().add_stock(part.key, box.box_no, 2, 100)
            session.commit()

            locations_with_parts = container.box_service().get_box_locations_with_parts(box.box_no)

            assert len(locations_with_parts) == 3
            
            # Location 2: has detailed part
            location_2 = locations_with_parts[1]
            assert location_2.is_occupied == True
            assert len(location_2.part_assignments) == 1
            
            part_assignment = location_2.part_assignments[0]
            assert part_assignment.key == part.key
            assert part_assignment.qty == 100
            assert part_assignment.manufacturer_code == "RES-0603-1K"
            assert part_assignment.description == "1kΩ resistor, 0603 package"

    def test_get_box_locations_with_parts_nonexistent_box(self, app: Flask, session: Session, container: ServiceContainer):
        """Test getting locations with parts for non-existent box raises exception."""
        with app.app_context():
            from app.exceptions import RecordNotFoundException

            with pytest.raises(RecordNotFoundException) as exc_info:
                container.box_service().get_box_locations_with_parts(999)
            assert "Box 999 was not found" in str(exc_info.value)

    def test_get_box_locations_with_parts_ordering(self, app: Flask, session: Session, container: ServiceContainer):
        """Test that locations are returned in correct order by location number."""
        with app.app_context():
            # Create box with larger capacity
            box = container.box_service().create_box("Ordered Box", 10)
            session.commit()
            
            # Create parts first
            part1 = container.part_service().create_part("Part 1")
            part2 = container.part_service().create_part("Part 2")
            part3 = container.part_service().create_part("Part 3")
            part4 = container.part_service().create_part("Part 4")
            session.flush()
            
            # Add parts to non-sequential locations
            container.inventory_service().add_stock(part1.key, box.box_no, 8, 10)
            container.inventory_service().add_stock(part2.key, box.box_no, 3, 20)
            container.inventory_service().add_stock(part3.key, box.box_no, 1, 5)
            container.inventory_service().add_stock(part4.key, box.box_no, 10, 15)
            session.commit()

            locations_with_parts = container.box_service().get_box_locations_with_parts(box.box_no)

            assert len(locations_with_parts) == 10
            
            # Verify locations are ordered by loc_no
            location_numbers = [loc.loc_no for loc in locations_with_parts]
            assert location_numbers == sorted(location_numbers)
            assert location_numbers == list(range(1, 11))
            
            # Verify the correct parts are at the correct locations
            # Location 1: part3
            assert locations_with_parts[0].is_occupied == True
            assert locations_with_parts[0].part_assignments[0].key == part3.key
            assert locations_with_parts[0].part_assignments[0].qty == 5
            
            # Location 3: part2  
            assert locations_with_parts[2].is_occupied == True
            assert locations_with_parts[2].part_assignments[0].key == part2.key
            assert locations_with_parts[2].part_assignments[0].qty == 20
            
            # Location 8: part1
            assert locations_with_parts[7].is_occupied == True
            assert locations_with_parts[7].part_assignments[0].key == part1.key
            assert locations_with_parts[7].part_assignments[0].qty == 10
            
            # Location 10: part4
            assert locations_with_parts[9].is_occupied == True
            assert locations_with_parts[9].part_assignments[0].key == part4.key
            assert locations_with_parts[9].part_assignments[0].qty == 15
