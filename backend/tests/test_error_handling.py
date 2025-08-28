"""Comprehensive test suite for error handling functionality."""

import pytest
from sqlalchemy.orm import Session

from app.exceptions import (
    CapacityExceededException,
    InsufficientQuantityException,
    InvalidOperationException,
    InventoryException,
    RecordNotFoundException,
    ResourceConflictException,
)
from app.services.container import ServiceContainer


class TestDomainExceptions:
    """Test domain exception classes."""

    def test_inventory_exception_base(self):
        """Test base inventory exception."""
        message = "Something went wrong"
        exception = InventoryException(message)
        assert str(exception) == message
        assert exception.message == message

    def test_record_not_found_exception(self):
        """Test RecordNotFoundException formatting."""
        exception = RecordNotFoundException("Box", 5)
        assert exception.message == "Box 5 was not found"
        assert str(exception) == "Box 5 was not found"

    def test_resource_conflict_exception(self):
        """Test ResourceConflictException formatting."""
        exception = ResourceConflictException("Box", "number 5")
        assert exception.message == "A box with number 5 already exists"
        assert str(exception) == "A box with number 5 already exists"

    def test_insufficient_quantity_exception(self):
        """Test InsufficientQuantityException formatting."""
        exception = InsufficientQuantityException(10, 3)
        assert exception.message == "Not enough parts available (requested 10, have 3)"

        exception_with_location = InsufficientQuantityException(10, 3, "7-3")
        assert exception_with_location.message == "Not enough parts available at 7-3 (requested 10, have 3)"

    def test_capacity_exceeded_exception(self):
        """Test CapacityExceededException formatting."""
        exception = CapacityExceededException("Box", 5)
        assert exception.message == "Box 5 is full and cannot hold more items"

    def test_invalid_operation_exception(self):
        """Test InvalidOperationException formatting."""
        exception = InvalidOperationException("delete box 5", "it contains parts")
        assert exception.message == "Cannot delete box 5 because it contains parts"


class TestBoxServiceExceptions:
    """Test BoxService exception handling."""

    def test_get_nonexistent_box(self, session: Session, container: ServiceContainer):
        """Test that getting a non-existent box raises RecordNotFoundException."""
        with pytest.raises(RecordNotFoundException) as exc_info:
            container.box_service().get_box(999)

        assert exc_info.value.message == "Box 999 was not found"

    def test_update_nonexistent_box(self, session: Session, container: ServiceContainer):
        """Test that updating a non-existent box raises RecordNotFoundException."""
        with pytest.raises(RecordNotFoundException) as exc_info:
            container.box_service().update_box_capacity(999, 50, "Updated description")

        assert exc_info.value.message == "Box 999 was not found"

    def test_delete_nonexistent_box(self, session: Session, container: ServiceContainer):
        """Test that deleting a non-existent box raises RecordNotFoundException."""
        with pytest.raises(RecordNotFoundException) as exc_info:
            container.box_service().delete_box(999)

        assert exc_info.value.message == "Box 999 was not found"

    def test_delete_box_with_parts(self, session: Session, container: ServiceContainer):
        """Test that deleting a box with parts raises InvalidOperationException."""
        # Create a box
        box = container.box_service().create_box("Test Box", 10)
        
        # Create a part first
        part = container.part_service().create_part("Test part")
        session.commit()

        # Add the part to the box
        container.inventory_service().add_stock(part.key, box.box_no, 1, 5)
        session.commit()

        # Try to delete the box
        with pytest.raises(InvalidOperationException) as exc_info:
            container.box_service().delete_box(box.box_no)

        assert f"Cannot delete box {box.box_no}" in exc_info.value.message
        assert "it contains parts that must be moved or removed first" in exc_info.value.message


class TestInventoryServiceExceptions:
    """Test InventoryService exception handling."""

    def test_add_stock_invalid_quantity(self, session: Session, container: ServiceContainer):
        """Test adding negative or zero stock raises InvalidOperationException."""
        # Create a box first
        box = container.box_service().create_box("Test Box", 10)
        session.commit()

        with pytest.raises(InvalidOperationException) as exc_info:
            container.inventory_service().add_stock("TEST", box.box_no, 1, 0)

        assert "Cannot add negative or zero stock" in exc_info.value.message
        assert "quantity must be positive" in exc_info.value.message

        with pytest.raises(InvalidOperationException) as exc_info:
            container.inventory_service().add_stock("TEST", box.box_no, 1, -5)

        assert "Cannot add negative or zero stock" in exc_info.value.message

    def test_add_stock_nonexistent_location(self, session: Session, container: ServiceContainer):
        """Test adding stock to non-existent location raises RecordNotFoundException."""
        with pytest.raises(RecordNotFoundException) as exc_info:
            container.inventory_service().add_stock("TEST", 999, 1, 10)

        assert exc_info.value.message == "Location 999-1 was not found"

    def test_remove_stock_invalid_quantity(self, session: Session, container: ServiceContainer):
        """Test removing negative or zero stock raises InvalidOperationException."""
        # Create a box first
        box = container.box_service().create_box("Test Box", 10)
        session.commit()

        with pytest.raises(InvalidOperationException) as exc_info:
            container.inventory_service().remove_stock("TEST", box.box_no, 1, 0)

        assert "Cannot remove negative or zero stock" in exc_info.value.message
        assert "quantity must be positive" in exc_info.value.message

    def test_remove_stock_nonexistent_location(self, session: Session, container: ServiceContainer):
        """Test removing stock from non-existent part location raises RecordNotFoundException."""
        # Create a box first
        box = container.box_service().create_box("Test Box", 10)
        session.commit()

        with pytest.raises(RecordNotFoundException) as exc_info:
            container.inventory_service().remove_stock("TEST", box.box_no, 1, 10)

        assert exc_info.value.message == f"Part location TEST at {box.box_no}-1 was not found"

    def test_remove_stock_insufficient_quantity(self, session: Session, container: ServiceContainer):
        """Test removing more stock than available raises InsufficientQuantityException."""
        # Create a box and add some stock
        box = container.box_service().create_box("Test Box", 10)
        
        # Create a part first
        part = container.part_service().create_part("Test part")
        session.commit()

        # Add 5 parts to location 1
        container.inventory_service().add_stock(part.key, box.box_no, 1, 5)
        session.commit()

        # Try to remove 10 parts (more than available)
        with pytest.raises(InsufficientQuantityException) as exc_info:
            container.inventory_service().remove_stock(part.key, box.box_no, 1, 10)

        assert exc_info.value.message == f"Not enough parts available at {box.box_no}-1 (requested 10, have 5)"

    def test_move_stock_invalid_quantity(self, session: Session, container: ServiceContainer):
        """Test moving negative or zero stock raises InvalidOperationException."""
        # Create a box first
        box = container.box_service().create_box("Test Box", 10)
        session.commit()

        with pytest.raises(InvalidOperationException) as exc_info:
            container.inventory_service().move_stock("TEST", box.box_no, 1, box.box_no, 2, 0)

        assert "Cannot move negative or zero stock" in exc_info.value.message
        assert "quantity must be positive" in exc_info.value.message

    def test_move_stock_nonexistent_source(self, session: Session, container: ServiceContainer):
        """Test moving stock from non-existent source raises RecordNotFoundException."""
        # Create a box first
        box = container.box_service().create_box("Test Box", 10)
        session.commit()

        with pytest.raises(RecordNotFoundException) as exc_info:
            container.inventory_service().move_stock("TEST", box.box_no, 1, box.box_no, 2, 5)

        assert exc_info.value.message == f"Part location TEST at {box.box_no}-1 was not found"

    def test_move_stock_insufficient_quantity(self, session: Session, container: ServiceContainer):
        """Test moving more stock than available raises InsufficientQuantityException."""
        # Create a box and add some stock
        box = container.box_service().create_box("Test Box", 10)
        
        # Create a part first
        part = container.part_service().create_part("Test part")
        session.commit()

        # Add 5 parts to location 1
        container.inventory_service().add_stock(part.key, box.box_no, 1, 5)
        session.commit()

        # Try to move 10 parts (more than available)
        with pytest.raises(InsufficientQuantityException) as exc_info:
            container.inventory_service().move_stock(part.key, box.box_no, 1, box.box_no, 2, 10)

        assert exc_info.value.message == f"Not enough parts available at {box.box_no}-1 (requested 10, have 5)"

    def test_move_stock_nonexistent_destination(self, session: Session, container: ServiceContainer):
        """Test moving stock to non-existent destination raises RecordNotFoundException."""
        # Create a box and add some stock
        box = container.box_service().create_box("Test Box", 10)
        
        # Create a part first
        part = container.part_service().create_part("Test part")
        session.commit()

        # Add 5 parts to location 1
        container.inventory_service().add_stock(part.key, box.box_no, 1, 5)
        session.commit()

        # Try to move to non-existent location
        with pytest.raises(RecordNotFoundException) as exc_info:
            container.inventory_service().move_stock(part.key, box.box_no, 1, 999, 1, 3)

        assert exc_info.value.message == "Location 999-1 was not found"


class TestErrorHandlingIntegration:
    """Test error handling integration scenarios."""

    def test_successful_operations_dont_raise_exceptions(self, session: Session, container: ServiceContainer):
        """Test that successful operations work without exceptions."""
        # Create a box
        box = container.box_service().create_box("Test Box", 10)
        
        # Create a part first
        part = container.part_service().create_part("Test part")
        session.commit()

        # Get the box (should work)
        retrieved_box = container.box_service().get_box(box.box_no)
        assert retrieved_box.box_no == box.box_no

        # Add stock (should work)
        part_location = container.inventory_service().add_stock(part.key, box.box_no, 1, 10)
        assert part_location.qty == 10
        session.commit()

        # Remove some stock (should work)
        container.inventory_service().remove_stock(part.key, box.box_no, 1, 3)
        session.commit()

        # Move stock (should work)
        container.inventory_service().move_stock(part.key, box.box_no, 1, box.box_no, 2, 5)
        session.commit()

        # Update box capacity (should work)
        updated_box = container.box_service().update_box_capacity(box.box_no, 20, "Updated description")
        assert updated_box.capacity == 20
        session.commit()

        # Remove all remaining stock before deleting box
        # After the above operations: 2 items in location 1, 5 items in location 2
        container.inventory_service().remove_stock(part.key, box.box_no, 1, 2)  # Remove remaining from location 1
        container.inventory_service().remove_stock(part.key, box.box_no, 2, 5)  # Remove all from location 2
        session.commit()

        # Delete box (should work now that it's empty)
        container.box_service().delete_box(box.box_no)
        session.commit()
