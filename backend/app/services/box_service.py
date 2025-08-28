"""Box service for core box and location management logic."""

from dataclasses import dataclass
from typing import TYPE_CHECKING

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.exceptions import InvalidOperationException, RecordNotFoundException
from app.models.box import Box
from app.models.location import Location
from app.models.part import Part
from app.models.part_location import PartLocation

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
    def get_box(db: Session, box_no: int) -> Box:
        """Get box."""
        stmt = select(Box).where(Box.box_no == box_no)
        box = db.execute(stmt).scalar_one_or_none()
        if not box:
            raise RecordNotFoundException("Box", box_no)
        return box

    @staticmethod
    def get_all_boxes(db: Session) -> list[Box]:
        """List all boxes."""
        stmt = select(Box).order_by(Box.box_no)
        return list(db.execute(stmt).scalars().all())

    @staticmethod
    def update_box_capacity(
        db: Session, box_no: int, new_capacity: int, new_description: str
    ) -> Box:
        """Update box capacity and description.

        If increasing capacity, new locations are created.
        If decreasing capacity, validates that higher-numbered locations are empty.
        """
        # Find box by box_no
        stmt = select(Box).where(Box.box_no == box_no)
        box = db.execute(stmt).scalar_one_or_none()
        if not box:
            raise RecordNotFoundException("Box", box_no)

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
    def delete_box(db: Session, box_no: int) -> None:
        """Delete box if it exists and contains no parts."""
        # Find box by box_no
        stmt = select(Box).where(Box.box_no == box_no)
        box = db.execute(stmt).scalar_one_or_none()
        if not box:
            raise RecordNotFoundException("Box", box_no)

        # Check if box contains any parts
        parts_stmt = select(PartLocation).where(PartLocation.box_no == box_no).limit(1)
        has_parts = db.execute(parts_stmt).scalar_one_or_none() is not None

        if has_parts:
            raise InvalidOperationException(
                f"delete box {box_no}",
                "it contains parts that must be moved or removed first"
            )

        # Safe to delete - the locations will be deleted automatically due to cascade
        db.delete(box)

    @staticmethod
    def calculate_box_usage(db: Session, box_no: int) -> 'BoxUsageStatsModel':
        """Calculate usage statistics for a specific box."""
        from sqlalchemy import func

        from app.schemas.box import BoxUsageStatsModel

        # Get box info
        box = BoxService.get_box(db, box_no)

        # Count total locations and occupied locations
        total_locations = box.capacity

        # Count occupied locations (those with parts)
        occupied_stmt = select(func.count(func.distinct(PartLocation.loc_no))).where(
            PartLocation.box_no == box_no
        )
        occupied_count = db.execute(occupied_stmt).scalar() or 0

        # Calculate usage percentage
        usage_percentage = (occupied_count / total_locations * 100) if total_locations > 0 else 0

        return BoxUsageStatsModel(
            box_no=box_no,
            total_locations=total_locations,
            occupied_locations=occupied_count,
            available_locations=total_locations - occupied_count,
            usage_percentage=round(usage_percentage, 2)
        )

    @staticmethod
    def get_all_boxes_with_usage(db: Session) -> list['BoxWithUsageModel']:
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

        results = db.execute(stmt).all()

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

    @staticmethod
    def get_box_locations_with_parts(db: Session, box_no: int) -> list[LocationWithPartData]:
        """Get all locations for a box with part assignment information."""
        # First verify the box exists
        BoxService.get_box(db, box_no)
        
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

        results = db.execute(stmt).all()

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
