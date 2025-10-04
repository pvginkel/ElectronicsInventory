"""Inventory service for managing part locations and quantities."""

from typing import TYPE_CHECKING

from sqlalchemy import and_, select
from sqlalchemy.orm import Session

from app.exceptions import (
    InsufficientQuantityException,
    InvalidOperationException,
    RecordNotFoundException,
)
from app.models.location import Location
from app.models.part_location import PartLocation
from app.models.quantity_history import QuantityHistory
from app.services.base import BaseService
from app.services.metrics_service import MetricsServiceProtocol
from app.services.part_service import PartService

if TYPE_CHECKING:
    from app.schemas.part import PartWithTotalModel


class InventoryService(BaseService):
    """Service class for inventory management operations."""

    def __init__(self, db: Session, part_service: PartService, metrics_service: MetricsServiceProtocol):
        """Initialize service with database session and dependencies.

        Args:
            db: SQLAlchemy database session
            part_service: Instance of PartService
            metrics_service: Instance of MetricsService for recording metrics
        """
        super().__init__(db)
        self.part_service = part_service
        self.metrics_service = metrics_service

    def add_stock(
        self, part_key: str, box_no: int, loc_no: int, qty: int
    ) -> PartLocation:
        """Add stock to a location."""
        if qty <= 0:
            raise InvalidOperationException("add negative or zero stock", "quantity must be positive")

        # Validate location exists
        location = self._get_location(box_no, loc_no)
        if not location:
            raise RecordNotFoundException("Location", f"{box_no}-{loc_no}")

        part = self.part_service.get_part(part_key)

        # Check if part already exists at this location
        stmt = select(PartLocation).where(
            and_(
                PartLocation.part_id == part.id,
                PartLocation.box_no == box_no,
                PartLocation.loc_no == loc_no,
            )
        )
        existing_location = self.db.execute(stmt).scalar_one_or_none()

        if existing_location:
            # Add to existing quantity and refresh relationship collection when already loaded
            existing_location.qty += qty
            part_location = existing_location
            if "part_locations" in part.__dict__ and existing_location not in part.part_locations:
                part.part_locations.append(existing_location)
        else:
            # Create new location assignment and attach to the part relationship
            part_location = PartLocation(
                part=part,
                box_no=box_no,
                loc_no=loc_no,
                location_id=location.id,
                qty=qty,
            )
            self.db.add(part_location)
            if "part_locations" in part.__dict__:
                part.part_locations.append(part_location)

        # Add quantity history record
        history = QuantityHistory(
            part_id=part.id,
            delta_qty=qty,
            location_reference=f"{box_no}-{loc_no}",
        )
        self.db.add(history)

        # Record metrics for quantity change
        self.metrics_service.record_quantity_change("add", qty)

        self.db.flush()
        return part_location

    def remove_stock(
        self, part_key: str, box_no: int, loc_no: int, qty: int
    ) -> None:
        """Remove stock from a location."""
        if qty <= 0:
            raise InvalidOperationException("remove negative or zero stock", "quantity must be positive")

        # Find existing location assignment
        from app.models.part import Part
        stmt = select(PartLocation).join(
            Part, PartLocation.part_id == Part.id
        ).where(
            and_(
                Part.key == part_key,
                PartLocation.box_no == box_no,
                PartLocation.loc_no == loc_no,
            )
        )
        part_location = self.db.execute(stmt).scalar_one_or_none()

        if not part_location:
            raise RecordNotFoundException("Part location", f"{part_key} at {box_no}-{loc_no}")

        if part_location.qty < qty:
            raise InsufficientQuantityException(qty, part_location.qty, f"{box_no}-{loc_no}")

        # Update quantity
        part_location.qty -= qty

        # Remove location assignment if quantity reaches zero
        if part_location.qty == 0:
            self.db.delete(part_location)

        # Add negative quantity history record
        part = self.part_service.get_part(part_key)
        history = QuantityHistory(
            part_id=part.id,
            delta_qty=-qty,
            location_reference=f"{box_no}-{loc_no}",
        )
        self.db.add(history)

        # Record metrics for quantity change
        self.metrics_service.record_quantity_change("remove", qty)

        # Check if total quantity is now zero and cleanup if needed
        self.cleanup_zero_quantities(part_key)

    def move_stock(
        self,
        part_key: str,
        from_box: int,
        from_loc: int,
        to_box: int,
        to_loc: int,
        qty: int,
    ) -> None:
        """Move stock between locations."""
        if qty <= 0:
            raise InvalidOperationException("move negative or zero stock", "quantity must be positive")

        # Validate source has sufficient quantity
        from app.models.part import Part
        stmt = select(PartLocation).join(
            Part, PartLocation.part_id == Part.id
        ).where(
            and_(
                Part.key == part_key,
                PartLocation.box_no == from_box,
                PartLocation.loc_no == from_loc,
            )
        )
        source_location = self.db.execute(stmt).scalar_one_or_none()

        if not source_location:
            raise RecordNotFoundException("Part location", f"{part_key} at {from_box}-{from_loc}")

        if source_location.qty < qty:
            raise InsufficientQuantityException(qty, source_location.qty, f"{from_box}-{from_loc}")

        # Validate destination location exists
        dest_location = self._get_location(to_box, to_loc)
        if not dest_location:
            raise RecordNotFoundException("Location", f"{to_box}-{to_loc}")

        # Begin transaction: remove from source, add to destination
        try:
            # Remove from source
            source_location.qty -= qty
            if source_location.qty == 0:
                self.db.delete(source_location)

            # Add history for removal
            part = self.part_service.get_part(part_key)
            remove_history = QuantityHistory(
                part_id=part.id,
                delta_qty=-qty,
                location_reference=f"{from_box}-{from_loc}",
            )
            self.db.add(remove_history)

            # Add to destination
            stmt = select(PartLocation).join(
                Part, PartLocation.part_id == Part.id
            ).where(
                and_(
                    Part.key == part_key,
                    PartLocation.box_no == to_box,
                    PartLocation.loc_no == to_loc,
                )
            )
            existing_dest = self.db.execute(stmt).scalar_one_or_none()

            if existing_dest:
                existing_dest.qty += qty
            else:
                new_dest = PartLocation(
                    part_id=part.id,
                    box_no=to_box,
                    loc_no=to_loc,
                    location_id=dest_location.id,
                    qty=qty,
                )
                self.db.add(new_dest)

            # Add history for addition
            add_history = QuantityHistory(
                part_id=part.id,
                delta_qty=qty,
                location_reference=f"{to_box}-{to_loc}",
            )
            self.db.add(add_history)

        except Exception:
            # Let the caller handle transaction rollback
            raise

    def get_part_locations(self, part_key: str) -> list[PartLocation]:
        """Get all locations where a part is stored."""
        from app.models.part import Part
        stmt = select(PartLocation).join(
            Part, PartLocation.part_id == Part.id
        ).where(Part.key == part_key)
        return list(self.db.execute(stmt).scalars().all())

    def suggest_location(self, type_id: int | None) -> tuple[int, int]:
        """Suggest a location for a part based on type and availability."""
        # For now, implement simple first-available algorithm
        # Future enhancement: prefer same-category boxes
        from sqlalchemy import exists

        # Find first available location (not in part_locations)
        stmt = (
            select(Location.box_no, Location.loc_no)
            .where(
                ~exists().where(
                    and_(
                        PartLocation.box_no == Location.box_no,
                        PartLocation.loc_no == Location.loc_no,
                    )
                )
            )
            .order_by(Location.box_no, Location.loc_no)
            .limit(1)
        )

        result = self.db.execute(stmt).first()
        if not result:
            raise RecordNotFoundException("Available location", "none found")
        return (result[0], result[1])

    def cleanup_zero_quantities(self, part_key: str) -> None:
        """Remove all location assignments when total quantity reaches zero."""
        total_qty = self.part_service.get_total_quantity(part_key)
        if total_qty == 0:
            # Delete all part_location records for this part
            from app.models.part import Part
            stmt = select(PartLocation).join(
                Part, PartLocation.part_id == Part.id
            ).where(Part.key == part_key)
            part_locations = list(self.db.execute(stmt).scalars().all())
            for part_location in part_locations:
                self.db.delete(part_location)

    def calculate_total_quantity(self, part_key: str) -> int:
        """Calculate total quantity across all locations for a part."""
        from sqlalchemy import func

        from app.models.part import Part
        stmt = select(func.coalesce(func.sum(PartLocation.qty), 0)).join(
            Part, PartLocation.part_id == Part.id
        ).where(Part.key == part_key)
        result = self.db.execute(stmt).scalar()
        return result or 0

    def get_all_parts_with_totals(self, limit: int = 50, offset: int = 0, type_id: int | None = None) -> list['PartWithTotalModel']:
        """Get all parts with their total quantities calculated."""
        from sqlalchemy import func

        from app.models.part import Part
        from app.schemas.part import PartWithTotalModel

        # Base query for parts with total quantity calculation
        stmt = select(
            Part,
            func.coalesce(func.sum(PartLocation.qty), 0).label('total_quantity')
        ).outerjoin(
            PartLocation, Part.id == PartLocation.part_id
        ).group_by(Part.id)

        # Apply type filter if specified
        if type_id is not None:
            stmt = stmt.where(Part.type_id == type_id)

        stmt = stmt.order_by(Part.created_at.desc()).limit(limit).offset(offset)

        results = self.db.execute(stmt).all()

        # Convert to list of PartWithTotalModel instances
        parts_with_totals = []
        for part, total_qty in results:
            part_with_total = PartWithTotalModel(
                part=part,
                total_quantity=int(total_qty)
            )
            parts_with_totals.append(part_with_total)

        return parts_with_totals

    def get_all_parts_with_totals_and_locations(self, limit: int = 50, offset: int = 0, type_id: int | None = None) -> list['PartWithTotalModel']:
        """Get all parts with their total quantities and location data."""


        # First get parts with total quantities
        parts_with_totals = self.get_all_parts_with_totals(limit, offset, type_id)

        # Get part IDs for location lookup
        part_ids = [part_with_total.part.id for part_with_total in parts_with_totals]

        if part_ids:
            # Get all locations for these parts
            location_stmt = select(PartLocation).where(PartLocation.part_id.in_(part_ids))
            locations = self.db.execute(location_stmt).scalars().all()

            # Group locations by part_id
            locations_by_part_id: dict[int, list[PartLocation]] = {}
            for location in locations:
                if location.part_id not in locations_by_part_id:
                    locations_by_part_id[location.part_id] = []
                locations_by_part_id[location.part_id].append(location)

            # Attach location data to parts
            for part_with_total in parts_with_totals:
                part_locations = locations_by_part_id.get(part_with_total.part.id, [])
                # Manually set the part_locations to ensure they're available
                part_with_total.part._part_locations_data = part_locations

        return parts_with_totals

    def _get_location(self, box_no: int, loc_no: int) -> Location | None:
        """Get location by box_no and loc_no."""
        stmt = select(Location).where(
            and_(Location.box_no == box_no, Location.loc_no == loc_no)
        )
        return self.db.execute(stmt).scalar_one_or_none()
