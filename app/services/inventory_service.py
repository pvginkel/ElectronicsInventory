"""Inventory service for managing part locations and quantities."""

from typing import Optional

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
from app.services.part_service import PartService


class InventoryService:
    """Service class for inventory management operations."""

    @staticmethod
    def add_stock(
        db: Session, part_id4: str, box_no: int, loc_no: int, qty: int
    ) -> PartLocation:
        """Add stock to a location."""
        if qty <= 0:
            raise InvalidOperationException("add negative or zero stock", "quantity must be positive")

        # Validate location exists
        location = InventoryService._get_location(db, box_no, loc_no)
        if not location:
            raise RecordNotFoundException("Location", f"{box_no}-{loc_no}")

        # Check if part already exists at this location
        stmt = select(PartLocation).where(
            and_(
                PartLocation.part_id4 == part_id4,
                PartLocation.box_no == box_no,
                PartLocation.loc_no == loc_no,
            )
        )
        existing_location = db.execute(stmt).scalar_one_or_none()

        if existing_location:
            # Add to existing quantity
            existing_location.qty += qty
            part_location = existing_location
        else:
            # Create new location assignment
            part_location = PartLocation(
                part_id4=part_id4,
                box_no=box_no,
                loc_no=loc_no,
                location_id=location.id,
                qty=qty,
            )
            db.add(part_location)

        # Add quantity history record
        history = QuantityHistory(
            part_id4=part_id4,
            delta_qty=qty,
            location_reference=f"{box_no}-{loc_no}",
        )
        db.add(history)

        db.flush()
        return part_location

    @staticmethod
    def remove_stock(
        db: Session, part_id4: str, box_no: int, loc_no: int, qty: int
    ) -> None:
        """Remove stock from a location."""
        if qty <= 0:
            raise InvalidOperationException("remove negative or zero stock", "quantity must be positive")

        # Find existing location assignment
        stmt = select(PartLocation).where(
            and_(
                PartLocation.part_id4 == part_id4,
                PartLocation.box_no == box_no,
                PartLocation.loc_no == loc_no,
            )
        )
        part_location = db.execute(stmt).scalar_one_or_none()

        if not part_location:
            raise RecordNotFoundException("Part location", f"{part_id4} at {box_no}-{loc_no}")

        if part_location.qty < qty:
            raise InsufficientQuantityException(qty, part_location.qty, f"{box_no}-{loc_no}")

        # Update quantity
        part_location.qty -= qty

        # Remove location assignment if quantity reaches zero
        if part_location.qty == 0:
            db.delete(part_location)

        # Add negative quantity history record
        history = QuantityHistory(
            part_id4=part_id4,
            delta_qty=-qty,
            location_reference=f"{box_no}-{loc_no}",
        )
        db.add(history)

        # Check if total quantity is now zero and cleanup if needed
        InventoryService.cleanup_zero_quantities(db, part_id4)

    @staticmethod
    def move_stock(
        db: Session,
        part_id4: str,
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
        stmt = select(PartLocation).where(
            and_(
                PartLocation.part_id4 == part_id4,
                PartLocation.box_no == from_box,
                PartLocation.loc_no == from_loc,
            )
        )
        source_location = db.execute(stmt).scalar_one_or_none()

        if not source_location:
            raise RecordNotFoundException("Part location", f"{part_id4} at {from_box}-{from_loc}")

        if source_location.qty < qty:
            raise InsufficientQuantityException(qty, source_location.qty, f"{from_box}-{from_loc}")

        # Validate destination location exists
        dest_location = InventoryService._get_location(db, to_box, to_loc)
        if not dest_location:
            raise RecordNotFoundException("Location", f"{to_box}-{to_loc}")

        # Begin transaction: remove from source, add to destination
        try:
            # Remove from source
            source_location.qty -= qty
            if source_location.qty == 0:
                db.delete(source_location)

            # Add history for removal
            remove_history = QuantityHistory(
                part_id4=part_id4,
                delta_qty=-qty,
                location_reference=f"{from_box}-{from_loc}",
            )
            db.add(remove_history)

            # Add to destination
            stmt = select(PartLocation).where(
                and_(
                    PartLocation.part_id4 == part_id4,
                    PartLocation.box_no == to_box,
                    PartLocation.loc_no == to_loc,
                )
            )
            existing_dest = db.execute(stmt).scalar_one_or_none()

            if existing_dest:
                existing_dest.qty += qty
            else:
                new_dest = PartLocation(
                    part_id4=part_id4,
                    box_no=to_box,
                    loc_no=to_loc,
                    location_id=dest_location.id,
                    qty=qty,
                )
                db.add(new_dest)

            # Add history for addition
            add_history = QuantityHistory(
                part_id4=part_id4,
                delta_qty=qty,
                location_reference=f"{to_box}-{to_loc}",
            )
            db.add(add_history)

        except Exception:
            # Let the caller handle transaction rollback
            raise

    @staticmethod
    def get_part_locations(db: Session, part_id4: str) -> list[PartLocation]:
        """Get all locations where a part is stored."""
        stmt = select(PartLocation).where(PartLocation.part_id4 == part_id4)
        return list(db.execute(stmt).scalars().all())

    @staticmethod
    def suggest_location(db: Session, type_id: Optional[int]) -> tuple[int, int]:
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

        result = db.execute(stmt).first()
        if not result:
            raise RecordNotFoundException("Available location", "none found")
        return (result[0], result[1])

    @staticmethod
    def cleanup_zero_quantities(db: Session, part_id4: str) -> None:
        """Remove all location assignments when total quantity reaches zero."""
        total_qty = PartService.get_total_quantity(db, part_id4)
        if total_qty == 0:
            # Delete all part_location records for this part
            stmt = select(PartLocation).where(PartLocation.part_id4 == part_id4)
            part_locations = list(db.execute(stmt).scalars().all())
            for part_location in part_locations:
                db.delete(part_location)

    @staticmethod
    def _get_location(db: Session, box_no: int, loc_no: int) -> Location | None:
        """Get location by box_no and loc_no."""
        stmt = select(Location).where(
            and_(Location.box_no == box_no, Location.loc_no == loc_no)
        )
        return db.execute(stmt).scalar_one_or_none()
