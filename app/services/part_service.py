"""Part service for managing electronics parts."""

import random
import string
from typing import Optional

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.part import Part
from app.models.part_location import PartLocation


class PartService:
    """Service class for part management operations."""

    @staticmethod
    def generate_part_id4(db: Session) -> str:
        """Generate unique 4-character part ID with collision handling."""
        max_attempts = 3
        for attempt in range(max_attempts):
            # Generate 4 random uppercase letters
            id4 = "".join(random.choices(string.ascii_uppercase, k=4))

            # Check if ID already exists
            stmt = select(Part).where(Part.id4 == id4)
            existing = db.execute(stmt).scalar_one_or_none()
            if not existing:
                return id4

        raise ValueError(f"Failed to generate unique part ID after {max_attempts} attempts")

    @staticmethod
    def create_part(
        db: Session,
        description: str,
        manufacturer_code: Optional[str] = None,
        type_id: Optional[int] = None,
        image_url: Optional[str] = None,
        tags: Optional[list[str]] = None,
        seller: Optional[str] = None,
        seller_link: Optional[str] = None,
    ) -> Part:
        """Create a new part with auto-generated ID."""
        id4 = PartService.generate_part_id4(db)

        part = Part(
            id4=id4,
            manufacturer_code=manufacturer_code,
            type_id=type_id,
            description=description,
            image_url=image_url,
            tags=tags,
            seller=seller,
            seller_link=seller_link,
        )
        db.add(part)
        db.flush()  # Get the ID immediately
        return part

    @staticmethod
    def get_part(db: Session, part_id4: str) -> Part | None:
        """Get part by 4-character ID."""
        stmt = select(Part).where(Part.id4 == part_id4)
        return db.execute(stmt).scalar_one_or_none()

    @staticmethod
    def get_parts_list(db: Session, limit: int = 50, offset: int = 0) -> list[Part]:
        """List parts with pagination, ordered by creation date."""
        stmt = (
            select(Part)
            .order_by(Part.created_at.desc())
            .limit(limit)
            .offset(offset)
        )
        return list(db.execute(stmt).scalars().all())

    @staticmethod
    def update_part_details(
        db: Session,
        part_id4: str,
        manufacturer_code: Optional[str] = None,
        type_id: Optional[int] = None,
        description: Optional[str] = None,
        image_url: Optional[str] = None,
        tags: Optional[list[str]] = None,
        seller: Optional[str] = None,
        seller_link: Optional[str] = None,
    ) -> Part | None:
        """Update part details."""
        stmt = select(Part).where(Part.id4 == part_id4)
        part = db.execute(stmt).scalar_one_or_none()
        if not part:
            return None

        # Update fields if provided
        if manufacturer_code is not None:
            part.manufacturer_code = manufacturer_code
        if type_id is not None:
            part.type_id = type_id
        if description is not None:
            part.description = description
        if image_url is not None:
            part.image_url = image_url
        if tags is not None:
            part.tags = tags
        if seller is not None:
            part.seller = seller
        if seller_link is not None:
            part.seller_link = seller_link

        return part

    @staticmethod
    def delete_part(db: Session, part_id4: str) -> bool:
        """Delete part if it exists and has zero total quantity."""
        stmt = select(Part).where(Part.id4 == part_id4)
        part = db.execute(stmt).scalar_one_or_none()
        if not part:
            return False

        # Check if part has any quantity
        total_qty = PartService.get_total_quantity(db, part_id4)
        if total_qty > 0:
            return False

        # Delete the part (cascaded deletes will handle relationships)
        db.delete(part)
        return True

    @staticmethod
    def get_total_quantity(db: Session, part_id4: str) -> int:
        """Get total quantity across all locations for a part."""
        stmt = select(func.coalesce(func.sum(PartLocation.qty), 0)).where(
            PartLocation.part_id4 == part_id4
        )
        result = db.execute(stmt).scalar()
        return result or 0
