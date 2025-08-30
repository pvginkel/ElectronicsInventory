"""Part service for managing electronics parts."""

import random
import string

from sqlalchemy import func, select

from app.exceptions import InvalidOperationException, RecordNotFoundException
from app.models.part import Part
from app.models.part_location import PartLocation
from app.services.base import BaseService


class PartService(BaseService):
    """Service class for part management operations."""

    def generate_part_key(self) -> str:
        """Generate unique 4-character part key with collision handling."""
        max_attempts = 3
        for _ in range(max_attempts):
            # Generate 4 random uppercase letters
            key = "".join(random.choices(string.ascii_uppercase, k=4))

            # Check if key already exists
            stmt = select(Part).where(Part.key == key)
            existing = self.db.execute(stmt).scalar_one_or_none()
            if not existing:
                return key

        raise InvalidOperationException("generate unique part key", f"failed after {max_attempts} attempts")

    def create_part(
        self,
        description: str,
        manufacturer_code: str | None = None,
        type_id: int | None = None,
        tags: list[str] | None = None,
        seller: str | None = None,
        seller_link: str | None = None,
        package: str | None = None,
        pin_count: int | None = None,
        voltage_rating: str | None = None,
        mounting_type: str | None = None,
        series: str | None = None,
        dimensions: str | None = None,
    ) -> Part:
        """Create a new part with auto-generated key."""
        key = self.generate_part_key()

        part = Part(
            key=key,
            manufacturer_code=manufacturer_code,
            type_id=type_id,
            description=description,
            tags=tags,
            seller=seller,
            seller_link=seller_link,
            package=package,
            pin_count=pin_count,
            voltage_rating=voltage_rating,
            mounting_type=mounting_type,
            series=series,
            dimensions=dimensions,
        )
        self.db.add(part)
        self.db.flush()  # Get the ID immediately
        return part

    def get_part(self, part_key: str) -> Part:
        """Get part by 4-character key."""
        stmt = select(Part).where(Part.key == part_key)
        part = self.db.execute(stmt).scalar_one_or_none()
        if not part:
            raise RecordNotFoundException("Part", part_key)
        return part

    def get_parts_list(self, limit: int = 50, offset: int = 0, type_id: int | None = None) -> list[Part]:
        """List parts with pagination, ordered by creation date."""
        stmt = select(Part).order_by(Part.created_at.desc())

        # Apply type filter if specified
        if type_id is not None:
            stmt = stmt.where(Part.type_id == type_id)

        stmt = stmt.limit(limit).offset(offset)
        return list(self.db.execute(stmt).scalars().all())

    def update_part_details(
        self,
        part_key: str,
        manufacturer_code: str | None = None,
        type_id: int | None = None,
        description: str | None = None,
        tags: list[str] | None = None,
        seller: str | None = None,
        seller_link: str | None = None,
        package: str | None = None,
        pin_count: int | None = None,
        voltage_rating: str | None = None,
        mounting_type: str | None = None,
        series: str | None = None,
        dimensions: str | None = None,
    ) -> Part:
        """Update part details."""
        stmt = select(Part).where(Part.key == part_key)
        part = self.db.execute(stmt).scalar_one_or_none()
        if not part:
            raise RecordNotFoundException("Part", part_key)

        # Update fields if provided
        if manufacturer_code is not None:
            part.manufacturer_code = manufacturer_code
        if type_id is not None:
            part.type_id = type_id
        if description is not None:
            part.description = description
        if tags is not None:
            part.tags = tags
        if seller is not None:
            part.seller = seller
        if seller_link is not None:
            part.seller_link = seller_link
        if package is not None:
            part.package = package
        if pin_count is not None:
            part.pin_count = pin_count
        if voltage_rating is not None:
            part.voltage_rating = voltage_rating
        if mounting_type is not None:
            part.mounting_type = mounting_type
        if series is not None:
            part.series = series
        if dimensions is not None:
            part.dimensions = dimensions

        return part

    def delete_part(self, part_key: str) -> None:
        """Delete part if it exists and has zero total quantity."""
        stmt = select(Part).where(Part.key == part_key)
        part = self.db.execute(stmt).scalar_one_or_none()
        if not part:
            raise RecordNotFoundException("Part", part_key)

        # Check if part has any quantity
        total_qty = self.get_total_quantity(part_key)
        if total_qty > 0:
            raise InvalidOperationException(f"delete part {part_key}", "it still has parts in inventory that must be removed first")

        # Delete the part (cascaded deletes will handle relationships)
        self.db.delete(part)

    def get_total_quantity(self, part_key: str) -> int:
        """Get total quantity across all locations for a part."""
        # Need to join with Part table since PartLocation now references parts.id
        stmt = select(func.coalesce(func.sum(PartLocation.qty), 0)).join(
            Part, PartLocation.part_id == Part.id
        ).where(Part.key == part_key)
        result = self.db.execute(stmt).scalar()
        return result or 0
