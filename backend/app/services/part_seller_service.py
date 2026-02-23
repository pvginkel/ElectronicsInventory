"""Service for managing part-seller link operations."""

from typing import TYPE_CHECKING

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.exceptions import RecordNotFoundException, ResourceConflictException
from app.models.part_seller import PartSeller

if TYPE_CHECKING:
    from sqlalchemy.orm import Session

    from app.services.part_service import PartService
    from app.services.seller_service import SellerService


class PartSellerService:
    """Service for creating, deleting, and querying part-seller links."""

    def __init__(
        self,
        db: "Session",
        part_service: "PartService",
        seller_service: "SellerService",
    ) -> None:
        self.db = db
        self.part_service = part_service
        self.seller_service = seller_service

    def add_seller_link(self, part_key: str, seller_id: int, link: str) -> PartSeller:
        """Create a new part-seller link.

        Args:
            part_key: 4-character part key
            seller_id: ID of the seller to link
            link: Seller-specific product page URL

        Returns:
            The created PartSeller instance

        Raises:
            RecordNotFoundException: If part or seller not found
            ResourceConflictException: If (part_id, seller_id) already linked
        """
        # Validate part exists and get its ID
        part = self.part_service.get_part(part_key)

        # Validate seller exists
        self.seller_service.get_seller(seller_id)

        part_seller = PartSeller(
            part_id=part.id,
            seller_id=seller_id,
            link=link,
        )
        self.db.add(part_seller)

        try:
            self.db.flush()
        except IntegrityError as exc:
            self.db.rollback()
            raise ResourceConflictException(
                "seller link", f"part {part_key} and seller {seller_id}"
            ) from exc

        # Eager-load the seller relationship for the response
        self.db.refresh(part_seller, attribute_names=["seller"])
        return part_seller

    def remove_seller_link(self, part_key: str, seller_link_id: int) -> None:
        """Delete a part-seller link.

        Args:
            part_key: 4-character part key (for ownership validation)
            seller_link_id: ID of the PartSeller row to delete

        Raises:
            RecordNotFoundException: If part or seller link not found,
                or if seller_link_id does not belong to the specified part
        """
        # Validate part exists and get its ID
        part = self.part_service.get_part(part_key)

        stmt = select(PartSeller).where(
            PartSeller.id == seller_link_id,
            PartSeller.part_id == part.id,
        )
        part_seller = self.db.execute(stmt).scalar_one_or_none()

        if part_seller is None:
            raise RecordNotFoundException("Seller link", seller_link_id)

        self.db.delete(part_seller)
        self.db.flush()

    def get_seller_link_url(self, part_id: int, seller_id: int) -> str | None:
        """Look up the seller link URL for a specific (part, seller) pair.

        Returns the link URL if found, None otherwise.
        """
        stmt = select(PartSeller.link).where(
            PartSeller.part_id == part_id,
            PartSeller.seller_id == seller_id,
        )
        return self.db.execute(stmt).scalar_one_or_none()

    def bulk_get_seller_links(
        self, pairs: list[tuple[int, int]]
    ) -> dict[tuple[int, int], str]:
        """Bulk lookup of seller link URLs for multiple (part_id, seller_id) pairs.

        Args:
            pairs: List of (part_id, seller_id) tuples to look up

        Returns:
            Dict mapping (part_id, seller_id) to link URL for found entries
        """
        if not pairs:
            return {}

        # Collect unique part_ids and seller_ids for the query
        part_ids = list({p for p, _ in pairs})
        seller_ids = list({s for _, s in pairs})
        pairs_set = set(pairs)

        stmt = select(
            PartSeller.part_id,
            PartSeller.seller_id,
            PartSeller.link,
        ).where(
            PartSeller.part_id.in_(part_ids),
            PartSeller.seller_id.in_(seller_ids),
        )

        result: dict[tuple[int, int], str] = {}
        for row in self.db.execute(stmt):
            key = (row.part_id, row.seller_id)
            if key in pairs_set:
                result[key] = row.link

        return result
