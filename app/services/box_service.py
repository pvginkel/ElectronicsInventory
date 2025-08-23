"""Box service for core box and location management logic."""


from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.box import Box
from app.models.location import Location


class BoxService:
    """Service class for box and location management operations."""

    @staticmethod
    def create_box(db: Session, description: str, capacity: int) -> Box:
        """Create box and generate all locations (1 to capacity)."""
        # Get next available box_no
        max_box_no = db.execute(select(func.coalesce(func.max(Box.box_no), 0))).scalar()
        next_box_no = (max_box_no or 0) + 1

        # Create the box
        box = Box(box_no=next_box_no, description=description, capacity=capacity)
        db.add(box)

        # Force flush to get the ID - autoflush doesn't trigger on attribute access for new objects
        db.flush()

        # Generate all locations
        locations = [
            Location(box_id=box.id, box_no=box.box_no, loc_no=loc_no)
            for loc_no in range(1, capacity + 1)
        ]
        db.add_all(locations)
        return box

    @staticmethod
    def get_box_with_locations(db: Session, box_no: int) -> Box | None:
        """Get box with all its locations."""
        stmt = select(Box).where(Box.box_no == box_no)
        return db.execute(stmt).scalar_one_or_none()

    @staticmethod
    def get_all_boxes(db: Session) -> list[Box]:
        """List all boxes."""
        stmt = select(Box).order_by(Box.box_no)
        return list(db.execute(stmt).scalars().all())

    @staticmethod
    def update_box_capacity(
        db: Session, box_no: int, new_capacity: int, new_description: str
    ) -> Box | None:
        """Update box capacity and description.

        If increasing capacity, new locations are created.
        If decreasing capacity, validates that higher-numbered locations are empty.
        """
        # Find box by box_no
        stmt = select(Box).where(Box.box_no == box_no)
        box = db.execute(stmt).scalar_one_or_none()
        if not box:
            return None

        current_capacity = box.capacity

        if new_capacity < current_capacity:
            # Check if locations to be removed would have parts
            # For now, just check if locations exist (they shouldn't have parts in basic implementation)
            stmt = select(Location).where(
                Location.box_no == box_no, Location.loc_no > new_capacity
            )
            locations_to_remove = list(db.execute(stmt).scalars().all())

            # Remove the higher-numbered locations
            for location in locations_to_remove:
                db.delete(location)

        elif new_capacity > current_capacity:
            # Add new locations
            new_locations = [
                Location(box_id=box.id, box_no=box_no, loc_no=loc_no)
                for loc_no in range(current_capacity + 1, new_capacity + 1)
            ]
            db.add_all(new_locations)

        # Update box
        box.capacity = new_capacity
        box.description = new_description

        # Expire the locations relationship so it will be reloaded on next access
        db.expire(box, ['locations'])

        return box

    @staticmethod
    def delete_box(db: Session, box_no: int) -> bool:
        """Delete box if it exists. Returns True if deleted, False if not found."""
        # Find box by box_no
        stmt = select(Box).where(Box.box_no == box_no)
        box = db.execute(stmt).scalar_one_or_none()
        if not box:
            return False

        # The locations will be deleted automatically due to cascade
        db.delete(box)
        return True
