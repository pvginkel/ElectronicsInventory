from typing import TYPE_CHECKING

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.exceptions import (
    InvalidOperationException,
    RecordNotFoundException,
    ResourceConflictException,
)
from app.models.part import Part
from app.models.seller import Seller

if TYPE_CHECKING:
    from sqlalchemy.orm import Session


class SellerService:
    """Service for managing seller operations."""

    def __init__(self, db: "Session") -> None:
        self.db = db

    def create_seller(self, name: str, website: str) -> Seller:
        """Create a new seller.

        Args:
            name: Unique seller name
            website: Seller website URL

        Returns:
            Created Seller instance

        Raises:
            ResourceConflictException: If seller name already exists
        """
        try:
            seller = Seller(name=name, website=website)
            self.db.add(seller)
            self.db.flush()
            return seller
        except IntegrityError as e:
            self.db.rollback()
            raise ResourceConflictException("seller", name) from e

    def get_seller(self, seller_id: int) -> Seller:
        """Get a seller by ID.

        Args:
            seller_id: Seller ID

        Returns:
            Seller instance

        Raises:
            RecordNotFoundException: If seller not found
        """
        seller = self.db.scalar(select(Seller).where(Seller.id == seller_id))
        if not seller:
            raise RecordNotFoundException("Seller", seller_id)
        return seller

    def get_all_sellers(self) -> list[Seller]:
        """Get all sellers ordered by name.

        Returns:
            List of all sellers
        """
        return list(self.db.scalars(select(Seller).order_by(Seller.name)).all())

    def update_seller(self, seller_id: int, name: str | None = None, website: str | None = None) -> Seller:
        """Update a seller.

        Args:
            seller_id: Seller ID
            name: New name (optional)
            website: New website (optional)

        Returns:
            Updated Seller instance

        Raises:
            RecordNotFoundException: If seller not found
            ResourceConflictException: If name already exists for another seller
        """
        seller = self.get_seller(seller_id)

        try:
            if name is not None:
                seller.name = name
            if website is not None:
                seller.website = website

            self.db.flush()
            return seller
        except IntegrityError as e:
            self.db.rollback()
            raise ResourceConflictException("seller", name or seller.name) from e

    def delete_seller(self, seller_id: int) -> None:
        """Delete a seller.

        Args:
            seller_id: Seller ID

        Raises:
            RecordNotFoundException: If seller not found
            InvalidOperationException: If seller has associated parts
        """
        seller = self.get_seller(seller_id)

        # Check if seller has associated parts
        parts_count = self.db.scalar(
            select(Part.id).where(Part.seller_id == seller_id).limit(1)
        )

        if parts_count:
            raise InvalidOperationException(
                "delete seller",
                "it has associated parts"
            )

        self.db.delete(seller)
        self.db.flush()

    def get_or_create_seller(self, name: str, website: str | None = None) -> Seller:
        """Get an existing seller by name or create a new one with minimal data.

        Args:
            name: Seller name
            website: Seller website (defaults to placeholder if not provided)

        Returns:
            Existing or newly created Seller instance
        """
        # Try to find existing seller (case-insensitive)
        seller = self.db.scalar(
            select(Seller).where(Seller.name.ilike(name))
        )

        if seller:
            return seller

        # Create new seller with placeholder website if not provided
        if website is None:
            website = f"https://www.{name.lower().replace(' ', '')}.com"

        # Create new seller
        try:
            seller = Seller(name=name, website=website)
            self.db.add(seller)
            self.db.flush()
            return seller
        except IntegrityError as e:
            # Handle race condition: another transaction created the seller
            self.db.rollback()
            seller = self.db.scalar(
                select(Seller).where(Seller.name.ilike(name))
            )
            if seller:
                return seller
            raise ResourceConflictException("seller", name) from e
