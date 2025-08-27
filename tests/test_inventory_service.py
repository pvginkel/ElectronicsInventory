"""Tests for inventory service functionality."""

from flask import Flask
from sqlalchemy.orm import Session

from app.models.part_location import PartLocation
from app.services.box_service import BoxService
from app.services.inventory_service import InventoryService
from app.services.part_service import PartService
from app.exceptions import RecordNotFoundException, InvalidOperationException, InsufficientQuantityException
import pytest


class TestInventoryService:
    """Test cases for InventoryService."""

    def test_add_stock_new_location(self, app: Flask, session: Session):
        """Test adding stock to a new location."""
        with app.app_context():
            # Create box, part
            box = BoxService.create_box(session, "Test Box", 10)
            part = PartService.create_part(session, "Test part")
            session.commit()

            # Add stock
            result = InventoryService.add_stock(
                session, part.id4, box.box_no, 1, 5
            )

            assert isinstance(result, PartLocation)
            assert result.part_id4 == part.id4
            assert result.box_no == box.box_no
            assert result.loc_no == 1
            assert result.qty == 5

    def test_add_stock_existing_location(self, app: Flask, session: Session):
        """Test adding stock to an existing location."""
        with app.app_context():
            # Setup
            box = BoxService.create_box(session, "Test Box", 10)
            part = PartService.create_part(session, "Test part")
            session.commit()

            # Add initial stock
            InventoryService.add_stock(session, part.id4, box.box_no, 1, 3)
            session.commit()

            # Add more stock to same location
            result = InventoryService.add_stock(session, part.id4, box.box_no, 1, 2)

            assert result.qty == 5  # 3 + 2

    def test_add_stock_invalid_location(self, app: Flask, session: Session):
        """Test adding stock to non-existent location."""
        with app.app_context():
            part = PartService.create_part(session, "Test part")
            session.commit()

            # Try to add stock to non-existent location
            with pytest.raises(RecordNotFoundException, match="Location 999-1 was not found"):
                InventoryService.add_stock(session, part.id4, 999, 1, 5)

    def test_add_stock_zero_quantity(self, app: Flask, session: Session):
        """Test adding zero quantity (should fail)."""
        with app.app_context():
            box = BoxService.create_box(session, "Test Box", 10)
            part = PartService.create_part(session, "Test part")
            session.commit()

            with pytest.raises(InvalidOperationException, match="Cannot add negative or zero stock"):
                InventoryService.add_stock(session, part.id4, box.box_no, 1, 0)

    def test_remove_stock_partial(self, app: Flask, session: Session):
        """Test removing partial stock from a location."""
        with app.app_context():
            # Setup with stock
            box = BoxService.create_box(session, "Test Box", 10)
            part = PartService.create_part(session, "Test part")
            session.commit()

            InventoryService.add_stock(session, part.id4, box.box_no, 1, 10)
            session.commit()

            # Remove some stock (no exception thrown)
            InventoryService.remove_stock(session, part.id4, box.box_no, 1, 3)

            # Check remaining quantity
            locations = InventoryService.get_part_locations(session, part.id4)
            assert len(locations) == 1
            assert locations[0].qty == 7

    def test_remove_stock_all(self, app: Flask, session: Session):
        """Test removing all stock from a location."""
        with app.app_context():
            # Setup with stock
            box = BoxService.create_box(session, "Test Box", 10)
            part = PartService.create_part(session, "Test part")
            session.commit()

            InventoryService.add_stock(session, part.id4, box.box_no, 1, 5)
            session.commit()

            # Remove all stock (no exception thrown)
            InventoryService.remove_stock(session, part.id4, box.box_no, 1, 5)

            # Location should be removed
            locations = InventoryService.get_part_locations(session, part.id4)
            assert len(locations) == 0

    def test_remove_stock_insufficient(self, app: Flask, session: Session):
        """Test removing more stock than available."""
        with app.app_context():
            # Setup with limited stock
            box = BoxService.create_box(session, "Test Box", 10)
            part = PartService.create_part(session, "Test part")
            session.commit()

            InventoryService.add_stock(session, part.id4, box.box_no, 1, 3)
            session.commit()

            # Try to remove more than available
            with pytest.raises(InsufficientQuantityException, match="Not enough parts available"):
                InventoryService.remove_stock(session, part.id4, box.box_no, 1, 5)

    def test_remove_stock_nonexistent_location(self, app: Flask, session: Session):
        """Test removing stock from location with no stock."""
        with app.app_context():
            box = BoxService.create_box(session, "Test Box", 10)
            part = PartService.create_part(session, "Test part")
            session.commit()

            # Try to remove from empty location
            with pytest.raises(RecordNotFoundException, match="Part location .* was not found"):
                InventoryService.remove_stock(session, part.id4, box.box_no, 1, 1)

    def test_move_stock_success(self, app: Flask, session: Session):
        """Test successfully moving stock between locations."""
        with app.app_context():
            # Setup with stock in one location
            box = BoxService.create_box(session, "Test Box", 10)
            part = PartService.create_part(session, "Test part")
            session.commit()

            InventoryService.add_stock(session, part.id4, box.box_no, 1, 10)
            session.commit()

            # Move some stock to another location (no exception thrown)
            InventoryService.move_stock(
                session, part.id4, box.box_no, 1, box.box_no, 2, 3
            )

            # Check locations
            locations = InventoryService.get_part_locations(session, part.id4)
            assert len(locations) == 2

            # Find the quantities
            qty_by_loc = {loc.loc_no: loc.qty for loc in locations}
            assert qty_by_loc[1] == 7  # 10 - 3
            assert qty_by_loc[2] == 3

    def test_move_stock_insufficient(self, app: Flask, session: Session):
        """Test moving more stock than available."""
        with app.app_context():
            # Setup with limited stock
            box = BoxService.create_box(session, "Test Box", 10)
            part = PartService.create_part(session, "Test part")
            session.commit()

            InventoryService.add_stock(session, part.id4, box.box_no, 1, 3)
            session.commit()

            # Try to move more than available
            with pytest.raises(InsufficientQuantityException, match="Not enough parts available"):
                InventoryService.move_stock(
                    session, part.id4, box.box_no, 1, box.box_no, 2, 5
                )

    def test_move_stock_invalid_destination(self, app: Flask, session: Session):
        """Test moving stock to invalid destination."""
        with app.app_context():
            # Setup with stock
            box = BoxService.create_box(session, "Test Box", 10)
            part = PartService.create_part(session, "Test part")
            session.commit()

            InventoryService.add_stock(session, part.id4, box.box_no, 1, 5)
            session.commit()

            # Try to move to non-existent location
            with pytest.raises(RecordNotFoundException, match="Location 999-1 was not found"):
                InventoryService.move_stock(
                    session, part.id4, box.box_no, 1, 999, 1, 3
                )

    def test_get_part_locations(self, app: Flask, session: Session):
        """Test getting all locations for a part."""
        with app.app_context():
            # Setup with stock in multiple locations
            box = BoxService.create_box(session, "Test Box", 10)
            part = PartService.create_part(session, "Test part")
            session.commit()

            InventoryService.add_stock(session, part.id4, box.box_no, 1, 5)
            InventoryService.add_stock(session, part.id4, box.box_no, 3, 10)
            session.commit()

            locations = InventoryService.get_part_locations(session, part.id4)

            assert len(locations) == 2
            loc_numbers = [loc.loc_no for loc in locations]
            assert 1 in loc_numbers
            assert 3 in loc_numbers

    def test_suggest_location(self, app: Flask, session: Session):
        """Test location suggestion."""
        with app.app_context():
            # Create a box with locations
            box = BoxService.create_box(session, "Test Box", 5)
            session.commit()

            # Should suggest first available location
            suggestion = InventoryService.suggest_location(session, None)

            assert suggestion is not None
            assert suggestion == (box.box_no, 1)

    def test_suggest_location_with_occupied_locations(self, app: Flask, session: Session):
        """Test location suggestion when some locations are occupied."""
        with app.app_context():
            # Setup with occupied location
            box = BoxService.create_box(session, "Test Box", 5)
            part = PartService.create_part(session, "Test part")
            session.commit()

            # Occupy first location
            InventoryService.add_stock(session, part.id4, box.box_no, 1, 5)
            session.commit()

            # Should suggest next available
            suggestion = InventoryService.suggest_location(session, None)

            assert suggestion is not None
            assert suggestion == (box.box_no, 2)

    def test_cleanup_zero_quantities(self, app: Flask, session: Session):
        """Test cleanup when total quantity reaches zero."""
        with app.app_context():
            # Setup with stock
            box = BoxService.create_box(session, "Test Box", 10)
            part = PartService.create_part(session, "Test part")
            session.commit()

            # Add stock to two locations
            InventoryService.add_stock(session, part.id4, box.box_no, 1, 3)
            InventoryService.add_stock(session, part.id4, box.box_no, 2, 2)
            session.commit()

            # Remove all stock from both locations
            InventoryService.remove_stock(session, part.id4, box.box_no, 1, 3)
            InventoryService.remove_stock(session, part.id4, box.box_no, 2, 2)
            session.commit()

            # All locations should be cleaned up
            locations = InventoryService.get_part_locations(session, part.id4)
            assert len(locations) == 0
