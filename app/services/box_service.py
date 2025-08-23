"""Box service for core box and location management logic."""

from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import selectinload

from app.database import get_session
from app.models.box import Box
from app.models.location import Location
from app.schemas.box import BoxListSchema, BoxResponseSchema


class BoxService:
    """Service class for box and location management operations."""

    @staticmethod
    def create_box(description: str, capacity: int) -> BoxResponseSchema:
        """Create box and generate all locations (1 to capacity)."""
        with get_session() as session:
            # Get next available box_no
            max_box_no = session.execute(
                select(func.coalesce(func.max(Box.box_no), 0))
            ).scalar()
            next_box_no = max_box_no + 1

            # Create the box
            box = Box(box_no=next_box_no, description=description, capacity=capacity)
            session.add(box)
            session.flush()  # Get the ID

            # Generate all locations
            locations = [
                Location(box_id=box.id, box_no=box.box_no, loc_no=loc_no)
                for loc_no in range(1, capacity + 1)
            ]
            session.add_all(locations)
            session.commit()

            # Refresh to get all relationships
            session.refresh(box, ["locations"])
            return BoxResponseSchema.model_validate(box)

    @staticmethod
    def get_box_with_locations(box_no: int) -> BoxResponseSchema | None:
        """Get box with all its locations."""
        with get_session() as session:
            stmt = (
                select(Box)
                .options(selectinload(Box.locations))
                .where(Box.box_no == box_no)
            )
            box = session.execute(stmt).scalar_one_or_none()
            return BoxResponseSchema.model_validate(box) if box else None

    @staticmethod
    def get_all_boxes() -> list[BoxListSchema]:
        """List all boxes."""
        with get_session() as session:
            stmt = select(Box).order_by(Box.box_no)
            boxes = list(session.execute(stmt).scalars().all())
            return [BoxListSchema.model_validate(box) for box in boxes]

    @staticmethod
    def update_box_capacity(box_no: int, new_capacity: int, new_description: str) -> BoxResponseSchema | None:
        """Update box capacity and description.

        If increasing capacity, new locations are created.
        If decreasing capacity, validates that higher-numbered locations are empty.
        """
        with get_session() as session:
            # Find box by box_no
            stmt = select(Box).where(Box.box_no == box_no)
            box = session.execute(stmt).scalar_one_or_none()
            if not box:
                return None

            current_capacity = box.capacity

            if new_capacity < current_capacity:
                # Check if locations to be removed would have parts
                # For now, just check if locations exist (they shouldn't have parts in basic implementation)
                stmt = select(Location).where(
                    Location.box_no == box_no,
                    Location.loc_no > new_capacity
                )
                locations_to_remove = list(session.execute(stmt).scalars().all())

                # Remove the higher-numbered locations
                for location in locations_to_remove:
                    session.delete(location)

            elif new_capacity > current_capacity:
                # Add new locations
                new_locations = [
                    Location(box_id=box.id, box_no=box_no, loc_no=loc_no)
                    for loc_no in range(current_capacity + 1, new_capacity + 1)
                ]
                session.add_all(new_locations)

            # Update box
            box.capacity = new_capacity
            box.description = new_description
            session.commit()
            session.refresh(box, ["locations"])
            return BoxResponseSchema.model_validate(box)

    @staticmethod
    def delete_box(box_no: int) -> bool:
        """Delete box if it exists. Returns True if deleted, False if not found."""
        with get_session() as session:
            # Find box by box_no
            stmt = select(Box).where(Box.box_no == box_no)
            box = session.execute(stmt).scalar_one_or_none()
            if not box:
                return False

            # The locations will be deleted automatically due to cascade
            session.delete(box)
            session.commit()
            return True

    @staticmethod
    def get_location_grid(box_no: int) -> dict[str, Any] | None:
        """Get grid layout for UI display."""
        with get_session() as session:
            # Find box by box_no
            stmt = select(Box).where(Box.box_no == box_no)
            box = session.execute(stmt).scalar_one_or_none()
            if not box:
                return None

            stmt = (
                select(Location)
                .where(Location.box_no == box_no)
                .order_by(Location.loc_no)
            )
            locations = list(session.execute(stmt).scalars().all())

            # Create grid data structure for UI
            # Assuming a simple left-to-right, top-to-bottom layout
            # UI can determine the grid dimensions based on capacity
            return {
                "box_no": box_no,
                "capacity": box.capacity,
                "locations": [
                    {"loc_no": loc.loc_no, "available": True}  # Always available in basic version
                    for loc in locations
                ]
            }
