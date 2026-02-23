from io import BytesIO
from typing import TYPE_CHECKING

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.exceptions import (
    InvalidOperationException,
    RecordNotFoundException,
    ResourceConflictException,
)
from app.models.part_seller import PartSeller
from app.models.seller import Seller
from app.utils.mime_handling import detect_mime_type

if TYPE_CHECKING:
    from sqlalchemy.orm import Session

    from app.app_config import AppSettings
    from app.services.s3_service import S3Service


class SellerService:
    """Service for managing seller operations."""

    def __init__(
        self,
        db: "Session",
        s3_service: "S3Service",
        app_settings: "AppSettings",
    ) -> None:
        self.db = db
        self.s3_service = s3_service
        self.app_settings = app_settings

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

        # Check if seller has associated part seller links
        has_links = self.db.scalar(
            select(PartSeller.id).where(PartSeller.seller_id == seller_id).limit(1)
        )

        if has_links:
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

    def set_logo(self, seller_id: int, file_bytes: bytes) -> Seller:
        """Upload and set a logo image for a seller.

        Follows the "persist DB before S3" pattern: updates logo_s3_key and
        flushes, then uploads to S3 with CAS deduplication.

        Args:
            seller_id: Seller ID
            file_bytes: Raw image file bytes

        Returns:
            Updated Seller instance with logo_s3_key set

        Raises:
            RecordNotFoundException: If seller not found
            InvalidOperationException: If file is not an allowed image type or exceeds size limit
        """
        seller = self.get_seller(seller_id)

        # Validate file size
        if len(file_bytes) > self.app_settings.max_image_size:
            max_mb = self.app_settings.max_image_size / (1024 * 1024)
            raise InvalidOperationException(
                "set logo",
                f"file too large, maximum size: {max_mb:.1f}MB",
            )

        # Detect and validate MIME type using magic-based detection.
        # Pass None as http_content_type because for direct file uploads
        # there is no authoritative HTTP header -- we rely on content detection.
        detected_type = detect_mime_type(file_bytes, None)
        if detected_type not in self.app_settings.allowed_image_types:
            raise InvalidOperationException(
                "set logo",
                f"file type not allowed: {detected_type}",
            )

        # Generate CAS key from content hash
        cas_key = self.s3_service.generate_cas_key(file_bytes)

        # Persist before S3: update the column and flush so a failed upload
        # causes the transaction to roll back cleanly.
        seller.logo_s3_key = cas_key
        self.db.flush()

        # CAS dedup: skip upload if the blob already exists in S3
        if not self.s3_service.file_exists(cas_key):
            self.s3_service.upload_file(BytesIO(file_bytes), cas_key, detected_type)

        return seller

    def delete_logo(self, seller_id: int) -> Seller:
        """Remove the logo from a seller.

        Sets logo_s3_key to None. No S3 deletion is performed because CAS
        blobs may be shared across entities.

        Args:
            seller_id: Seller ID

        Returns:
            Updated Seller instance with logo_s3_key cleared

        Raises:
            RecordNotFoundException: If seller not found
        """
        seller = self.get_seller(seller_id)
        seller.logo_s3_key = None
        self.db.flush()
        return seller
