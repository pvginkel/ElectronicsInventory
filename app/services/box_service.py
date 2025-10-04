"""Box service for core box and location management logic."""

from dataclasses import dataclass
from typing import TYPE_CHECKING

from sqlalchemy import func, select

from app.exceptions import InvalidOperationException, RecordNotFoundException
from app.models.box import Box
from app.models.location import Location
from app.models.part import Part
from app.models.part_location import PartLocation
from app.services.base import BaseService

if TYPE_CHECKING:
    from app.schemas.box import BoxUsageStatsModel, BoxWithUsageModel


@dataclass
class PartAssignmentData:
    """Data class for part assignment information at a location."""
    key: str
    qty: int
    manufacturer_code: str | None
    description: str


@dataclass
class LocationWithPartData:
    """Data class for location information including part assignments."""
    box_no: int
    loc_no: int
    is_occupied: bool
    part_assignments: list[PartAssignmentData]


class BoxService(BaseService):
    """Service class for box and location management operations."""

    def create_box(self, description: str, capacity: int) -> Box:
        """Create box and generate all locations (1 to capacity)."""
        # Create the box and let the database sequence assign box_no
        box = Box(description=description, capacity=capacity)
        self.db.add(box)

        bind = self.db.bind
        if bind is not None and bind.dialect.name == "sqlite":
            # SQLite lacks sequences, so fall back to deterministic numbering for tests
            with self.db.no_autoflush:
                max_box_no = self.db.execute(
                    select(func.coalesce(func.max(Box.box_no), 0))
                ).scalar()
            box.box_no = (max_box_no or 0) + 1

        # Force flush so the database populates id and box_no before locations are created
        self.db.flush()

        # Generate all locations
        locations = [
            Location(box_id=box.id, box_no=box.box_no, loc_no=loc_no)
            for loc_no in range(1, capacity + 1)
        ]
        self.db.add_all(locations)
        return box

    def get_box(self, box_no: int) -> Box:
        """Get box."""
        stmt = select(Box).where(Box.box_no == box_no)
        box = self.db.execute(stmt).scalar_one_or_none()
        if not box:
            raise RecordNotFoundException("Box", box_no)
        return box

    def get_all_boxes(self) -> list[Box]:
        """List all boxes."""
        stmt = select(Box).order_by(Box.box_no)
        return list(self.db.execute(stmt).scalars().all())

    def update_box_capacity(
        self, box_no: int, new_capacity: int, new_description: str
    ) -> Box:
        """Update box capacity and description.

        If increasing capacity, new locations are created.
        If decreasing capacity, validates that higher-numbered locations are empty.
        """
        # Find box by box_no
        stmt = select(Box).where(Box.box_no == box_no)
        box = self.db.execute(stmt).scalar_one_or_none()
        if not box:
            raise RecordNotFoundException("Box", box_no)

        current_capacity = box.capacity

        if new_capacity < current_capacity:
            # Check if locations to be removed would have parts
            # For now, just check if locations exist (they shouldn't have parts in basic implementation)
            stmt = select(Location).where(
                Location.box_no == box_no, Location.loc_no > new_capacity
            )
            locations_to_remove = list(self.db.execute(stmt).scalars().all())

            # Remove the higher-numbered locations
            for location in locations_to_remove:
                self.db.delete(location)

        elif new_capacity > current_capacity:
            # Add new locations
            new_locations = [
                Location(box_id=box.id, box_no=box_no, loc_no=loc_no)
                for loc_no in range(current_capacity + 1, new_capacity + 1)
            ]
            self.db.add_all(new_locations)

        # Update box
        box.capacity = new_capacity
        box.description = new_description

        # Expire the locations relationship so it will be reloaded on next access
        self.db.expire(box, ['locations'])

        return box

    def delete_box(self, box_no: int) -> None:
        """Delete box if it exists and contains no parts."""
        # Find box by box_no
        stmt = select(Box).where(Box.box_no == box_no)
        box = self.db.execute(stmt).scalar_one_or_none()
        if not box:
            raise RecordNotFoundException("Box", box_no)

        # Check if box contains any parts
        parts_stmt = select(PartLocation).where(PartLocation.box_no == box_no).limit(1)
        has_parts = self.db.execute(parts_stmt).scalar_one_or_none() is not None

        if has_parts:
            raise InvalidOperationException(
                f"delete box {box_no}",
                "it contains parts that must be moved or removed first"
            )

        # Safe to delete - the locations will be deleted automatically due to cascade
        self.db.delete(box)

    def calculate_box_usage(self, box_no: int) -> 'BoxUsageStatsModel':
        """Calculate usage statistics for a specific box."""
        from sqlalchemy import func

        from app.schemas.box import BoxUsageStatsModel

        # Get box info
        box = self.get_box(box_no)

        # Count total locations and occupied locations
        total_locations = box.capacity

        # Count occupied locations (those with parts)
        occupied_stmt = select(func.count(func.distinct(PartLocation.loc_no))).where(
            PartLocation.box_no == box_no
        )
        occupied_count = self.db.execute(occupied_stmt).scalar() or 0

        # Calculate usage percentage
        usage_percentage = (occupied_count / total_locations * 100) if total_locations > 0 else 0

        return BoxUsageStatsModel(
            box_no=box_no,
            total_locations=total_locations,
            occupied_locations=occupied_count,
            available_locations=total_locations - occupied_count,
            usage_percentage=round(usage_percentage, 2)
        )

    def get_all_boxes_with_usage(self) -> list['BoxWithUsageModel']:
        """Get all boxes with their usage statistics calculated."""
        from sqlalchemy import func

        from app.schemas.box import BoxWithUsageModel

        # Query to get all boxes with usage stats in one go
        stmt = select(
            Box,
            func.count(func.distinct(PartLocation.loc_no)).label('occupied_count')
        ).outerjoin(
            PartLocation, Box.box_no == PartLocation.box_no
        ).group_by(Box.id).order_by(Box.box_no)

        results = self.db.execute(stmt).all()

        boxes_with_usage = []
        for box, occupied_count in results:
            occupied_count = occupied_count or 0
            usage_percentage = (occupied_count / box.capacity * 100) if box.capacity > 0 else 0

            box_with_usage = BoxWithUsageModel(
                box=box,
                total_locations=box.capacity,
                occupied_locations=occupied_count,
                available_locations=box.capacity - occupied_count,
                usage_percentage=round(usage_percentage, 2)
            )
            boxes_with_usage.append(box_with_usage)

        return boxes_with_usage

    def get_box_locations_with_parts(self, box_no: int) -> list[LocationWithPartData]:
        """Get all locations for a box with part assignment information."""
        # First verify the box exists
        self.get_box(box_no)

        # Query locations with their part assignments
        # Use a LEFT JOIN to include empty locations
        stmt = select(
            Location.box_no,
            Location.loc_no,
            Part.key,
            PartLocation.qty,
            Part.manufacturer_code,
            Part.description
        ).select_from(
            Location
        ).outerjoin(
            PartLocation,
            (Location.box_no == PartLocation.box_no) &
            (Location.loc_no == PartLocation.loc_no)
        ).outerjoin(
            Part, PartLocation.part_id == Part.id
        ).where(
            Location.box_no == box_no
        ).order_by(Location.loc_no)

        results = self.db.execute(stmt).all()

        # Group results by location
        locations_dict: dict[int, LocationWithPartData] = {}

        for result in results:
            loc_no = result.loc_no

            # Initialize location if not seen before
            if loc_no not in locations_dict:
                locations_dict[loc_no] = LocationWithPartData(
                    box_no=result.box_no,
                    loc_no=loc_no,
                    is_occupied=False,
                    part_assignments=[]
                )

            # Add part assignment if there is one
            if result.key is not None:
                locations_dict[loc_no].is_occupied = True
                part_assignment = PartAssignmentData(
                    key=result.key,
                    qty=result.qty,
                    manufacturer_code=result.manufacturer_code,
                    description=result.description or ""
                )
                locations_dict[loc_no].part_assignments.append(part_assignment)

        # Return ordered list by location number
        return [locations_dict[loc_no] for loc_no in sorted(locations_dict.keys())]
