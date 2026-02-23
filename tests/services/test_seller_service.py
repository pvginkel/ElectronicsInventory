"""Test seller service functionality."""

import io
from unittest.mock import patch

import pytest
from flask import Flask
from PIL import Image
from sqlalchemy.orm import Session

from app.exceptions import (
    InvalidOperationException,
    RecordNotFoundException,
    ResourceConflictException,
)
from app.models.part import Part
from app.models.part_seller import PartSeller
from app.models.type import Type
from app.services.container import ServiceContainer


class TestSellerService:
    """Test cases for SellerService functionality."""

    def test_create_seller_minimal(self, app: Flask, session: Session, container: ServiceContainer):
        """Test creating a seller with minimal required fields."""
        service = container.seller_service()

        seller = service.create_seller(
            name="DigiKey",
            website="https://www.digikey.com"
        )

        assert seller.id is not None
        assert seller.name == "DigiKey"
        assert seller.website == "https://www.digikey.com"
        assert seller.created_at is not None
        assert seller.updated_at is not None

    def test_create_seller_duplicate_name(self, app: Flask, session: Session, container: ServiceContainer):
        """Test that creating a seller with duplicate name raises ResourceConflictException."""
        service = container.seller_service()

        # Create first seller
        service.create_seller(
            name="DigiKey",
            website="https://www.digikey.com"
        )

        # Attempt to create duplicate
        with pytest.raises(ResourceConflictException) as exc_info:
            service.create_seller(
                name="DigiKey",
                website="https://www.mouser.com"
            )

        assert "A seller with DigiKey already exists" in str(exc_info.value)

    def test_get_seller_existing(self, app: Flask, session: Session, container: ServiceContainer):
        """Test retrieving an existing seller by ID."""
        service = container.seller_service()

        # Create seller
        created_seller = service.create_seller(
            name="Mouser",
            website="https://www.mouser.com"
        )

        # Retrieve seller
        retrieved_seller = service.get_seller(created_seller.id)

        assert retrieved_seller.id == created_seller.id
        assert retrieved_seller.name == "Mouser"
        assert retrieved_seller.website == "https://www.mouser.com"

    def test_get_seller_nonexistent(self, app: Flask, session: Session, container: ServiceContainer):
        """Test that retrieving non-existent seller raises RecordNotFoundException."""
        service = container.seller_service()

        with pytest.raises(RecordNotFoundException) as exc_info:
            service.get_seller(999)

        assert "Seller 999 was not found" in str(exc_info.value)

    def test_get_all_sellers_empty(self, app: Flask, session: Session, container: ServiceContainer):
        """Test get_all_sellers with empty database."""
        service = container.seller_service()

        sellers = service.get_all_sellers()

        assert sellers == []

    def test_get_all_sellers_ordered_by_name(self, app: Flask, session: Session, container: ServiceContainer):
        """Test get_all_sellers returns sellers ordered by name."""
        service = container.seller_service()

        # Create sellers in non-alphabetical order
        service.create_seller("Mouser", "https://www.mouser.com")
        service.create_seller("Amazon", "https://www.amazon.com")
        service.create_seller("DigiKey", "https://www.digikey.com")

        sellers = service.get_all_sellers()

        assert len(sellers) == 3
        assert sellers[0].name == "Amazon"
        assert sellers[1].name == "DigiKey"
        assert sellers[2].name == "Mouser"

    def test_update_seller_name_only(self, app: Flask, session: Session, container: ServiceContainer):
        """Test updating only the seller name."""
        service = container.seller_service()

        # Create seller
        seller = service.create_seller(
            name="DigiKey",
            website="https://www.digikey.com"
        )
        original_website = seller.website

        # Update name only
        updated_seller = service.update_seller(seller.id, name="Digi-Key Corporation")

        assert updated_seller.id == seller.id
        assert updated_seller.name == "Digi-Key Corporation"
        assert updated_seller.website == original_website

    def test_update_seller_website_only(self, app: Flask, session: Session, container: ServiceContainer):
        """Test updating only the seller website."""
        service = container.seller_service()

        # Create seller
        seller = service.create_seller(
            name="DigiKey",
            website="https://www.digikey.com"
        )
        original_name = seller.name

        # Update website only
        updated_seller = service.update_seller(seller.id, website="https://www.digikey.com/en")

        assert updated_seller.id == seller.id
        assert updated_seller.name == original_name
        assert updated_seller.website == "https://www.digikey.com/en"

    def test_update_seller_both_fields(self, app: Flask, session: Session, container: ServiceContainer):
        """Test updating both name and website."""
        service = container.seller_service()

        # Create seller
        seller = service.create_seller(
            name="DigiKey",
            website="https://www.digikey.com"
        )

        # Update both fields
        updated_seller = service.update_seller(
            seller.id,
            name="Digi-Key Corporation",
            website="https://www.digikey.com/en"
        )

        assert updated_seller.id == seller.id
        assert updated_seller.name == "Digi-Key Corporation"
        assert updated_seller.website == "https://www.digikey.com/en"

    def test_update_seller_no_changes(self, app: Flask, session: Session, container: ServiceContainer):
        """Test updating seller with no changes."""
        service = container.seller_service()

        # Create seller
        seller = service.create_seller(
            name="DigiKey",
            website="https://www.digikey.com"
        )

        # Update with no changes
        updated_seller = service.update_seller(seller.id)

        assert updated_seller.id == seller.id
        assert updated_seller.name == seller.name
        assert updated_seller.website == seller.website

    def test_update_seller_nonexistent(self, app: Flask, session: Session, container: ServiceContainer):
        """Test updating non-existent seller raises RecordNotFoundException."""
        service = container.seller_service()

        with pytest.raises(RecordNotFoundException) as exc_info:
            service.update_seller(999, name="New Name")

        assert "Seller 999 was not found" in str(exc_info.value)

    def test_update_seller_duplicate_name(self, app: Flask, session: Session, container: ServiceContainer):
        """Test updating seller to duplicate name raises ResourceConflictException."""
        service = container.seller_service()

        # Create two sellers
        service.create_seller("DigiKey", "https://www.digikey.com")
        seller2 = service.create_seller("Mouser", "https://www.mouser.com")

        # Try to update seller2 to have seller1's name
        with pytest.raises(ResourceConflictException) as exc_info:
            service.update_seller(seller2.id, name="DigiKey")

        assert "A seller with DigiKey already exists" in str(exc_info.value)

    def test_delete_seller_without_parts(self, app: Flask, session: Session, container: ServiceContainer):
        """Test deleting a seller that has no associated parts."""
        service = container.seller_service()

        # Create seller
        seller = service.create_seller(
            name="DigiKey",
            website="https://www.digikey.com"
        )
        seller_id = seller.id

        # Delete seller
        service.delete_seller(seller_id)

        # Verify seller is deleted
        with pytest.raises(RecordNotFoundException):
            service.get_seller(seller_id)

    def test_delete_seller_with_associated_parts(self, app: Flask, session: Session, container: ServiceContainer, make_attachment_set):
        """Test deleting a seller that has seller links raises InvalidOperationException."""
        service = container.seller_service()

        # Create seller
        seller = service.create_seller(
            name="DigiKey",
            website="https://www.digikey.com"
        )

        # Create a type first
        test_type = Type(name="Test Type")
        session.add(test_type)
        session.flush()

        # Create part and link it to this seller via PartSeller
        attachment_set = make_attachment_set()
        part = Part(
            key="TEST",
            description="Test part",
            type_id=test_type.id,
            attachment_set_id=attachment_set.id,
        )
        session.add(part)
        session.flush()

        part_seller = PartSeller(
            part_id=part.id,
            seller_id=seller.id,
            link="https://www.digikey.com/en/products/detail/test",
        )
        session.add(part_seller)
        session.flush()

        # Try to delete seller with associated part seller link
        with pytest.raises(InvalidOperationException) as exc_info:
            service.delete_seller(seller.id)

        assert "Cannot delete seller because it has associated parts" in str(exc_info.value)

    def test_delete_seller_nonexistent(self, app: Flask, session: Session, container: ServiceContainer):
        """Test deleting non-existent seller raises RecordNotFoundException."""
        service = container.seller_service()

        with pytest.raises(RecordNotFoundException) as exc_info:
            service.delete_seller(999)

        assert "Seller 999 was not found" in str(exc_info.value)

    def test_seller_name_uniqueness_case_sensitive(self, app: Flask, session: Session, container: ServiceContainer):
        """Test that seller names are case-sensitive for uniqueness."""
        service = container.seller_service()

        # Create seller with lowercase
        service.create_seller("digikey", "https://www.digikey.com")

        # Create seller with different case - should succeed
        seller2 = service.create_seller("DigiKey", "https://www.digikey.com")

        assert seller2.name == "DigiKey"

    def test_seller_website_can_be_same(self, app: Flask, session: Session, container: ServiceContainer):
        """Test that multiple sellers can have the same website."""
        service = container.seller_service()

        # Create two sellers with same website
        seller1 = service.create_seller("DigiKey", "https://www.digikey.com")
        seller2 = service.create_seller("Digi-Key", "https://www.digikey.com")

        assert seller1.website == seller2.website
        assert seller1.name != seller2.name

    def test_create_seller_edge_case_lengths(self, app: Flask, session: Session, container: ServiceContainer):
        """Test creating sellers with edge case string lengths."""
        service = container.seller_service()

        # Test maximum length name (255 characters)
        long_name = "A" * 255
        long_website = "https://" + "b" * (500 - 8)  # 500 chars total

        seller = service.create_seller(long_name, long_website)

        assert seller.name == long_name
        assert seller.website == long_website
        assert len(seller.name) == 255
        assert len(seller.website) == 500

    def test_get_or_create_seller_creates_new(self, app: Flask, session: Session, container: ServiceContainer):
        """Test get_or_create_seller creates a new seller when it doesn't exist."""
        service = container.seller_service()

        # Create seller using get_or_create with explicit website
        seller = service.get_or_create_seller("Mouser", "https://www.mouser.com")

        assert seller.id is not None
        assert seller.name == "Mouser"
        assert seller.website == "https://www.mouser.com"
        assert seller.created_at is not None

    def test_get_or_create_seller_creates_new_with_default_website(self, app: Flask, session: Session, container: ServiceContainer):
        """Test get_or_create_seller creates a new seller with generated placeholder website."""
        service = container.seller_service()

        # Create seller using get_or_create without website (generates placeholder)
        seller = service.get_or_create_seller("DigiKey")

        assert seller.id is not None
        assert seller.name == "DigiKey"
        # Should generate placeholder website from seller name
        assert seller.website == "https://www.digikey.com"
        assert seller.created_at is not None

    def test_get_or_create_seller_returns_existing(self, app: Flask, session: Session, container: ServiceContainer):
        """Test get_or_create_seller returns existing seller."""
        service = container.seller_service()

        # Create seller first
        original_seller = service.create_seller("DigiKey", "https://www.digikey.com")
        original_id = original_seller.id

        # Call get_or_create with same name
        retrieved_seller = service.get_or_create_seller("DigiKey")

        # Should return the same seller, not create a new one
        assert retrieved_seller.id == original_id
        assert retrieved_seller.name == "DigiKey"
        assert retrieved_seller.website == "https://www.digikey.com"

    def test_get_or_create_seller_case_insensitive(self, app: Flask, session: Session, container: ServiceContainer):
        """Test get_or_create_seller is case-insensitive."""
        service = container.seller_service()

        # Create seller with lowercase
        original_seller = service.create_seller("mouser", "https://www.mouser.com")
        original_id = original_seller.id

        # Try to get_or_create with different case
        retrieved_seller = service.get_or_create_seller("Mouser")

        # Should return existing seller (case-insensitive match)
        assert retrieved_seller.id == original_id
        assert retrieved_seller.name == "mouser"  # Original case preserved

    def test_get_or_create_seller_case_insensitive_uppercase(self, app: Flask, session: Session, container: ServiceContainer):
        """Test get_or_create_seller is case-insensitive with uppercase."""
        service = container.seller_service()

        # Create seller with uppercase
        original_seller = service.create_seller("DIGIKEY", "https://www.digikey.com")
        original_id = original_seller.id

        # Try to get_or_create with lowercase
        retrieved_seller = service.get_or_create_seller("digikey")

        # Should return existing seller (case-insensitive match)
        assert retrieved_seller.id == original_id
        assert retrieved_seller.name == "DIGIKEY"  # Original case preserved

    def test_get_or_create_seller_race_condition(self, app: Flask, session: Session, container: ServiceContainer):
        """Test get_or_create_seller handles race condition gracefully."""
        from unittest.mock import patch

        from sqlalchemy.exc import IntegrityError

        service = container.seller_service()

        # Simulate race condition: first call creates seller, second call gets IntegrityError
        # then successfully retrieves it
        call_count = [0]

        original_add = session.add

        def mock_add(instance):
            call_count[0] += 1
            if call_count[0] == 1:
                # First call: raise IntegrityError to simulate race condition
                raise IntegrityError("duplicate key", None, None)
            else:
                # Subsequent calls: normal behavior
                return original_add(instance)

        # Pre-create the seller that would be created in the "race"
        service.create_seller("Amazon", "https://www.amazon.com")
        session.flush()

        # Now test the race condition handling
        with patch.object(session, 'add', side_effect=mock_add):
            # This should catch the IntegrityError and retry by querying
            seller = service.get_or_create_seller("Amazon")

            # Should successfully return the existing seller
            assert seller.name == "Amazon"
            assert seller.website == "https://www.amazon.com"


class TestSellerServiceLogo:
    """Test cases for SellerService logo upload and delete functionality."""

    def test_set_logo_valid_png(self, app: Flask, session: Session, container: ServiceContainer, sample_png_bytes: bytes):
        """Test uploading a valid PNG logo sets logo_s3_key and logo_url."""
        service = container.seller_service()
        seller = service.create_seller("DigiKey", "https://www.digikey.com")

        updated = service.set_logo(seller.id, sample_png_bytes)

        assert updated.logo_s3_key is not None
        assert updated.logo_s3_key.startswith("cas/")
        assert updated.logo_url is not None
        assert "/api/cas/" in updated.logo_url

    def test_set_logo_valid_jpeg(self, app: Flask, session: Session, container: ServiceContainer):
        """Test uploading a valid JPEG logo sets logo_s3_key."""
        service = container.seller_service()
        seller = service.create_seller("Mouser", "https://www.mouser.com")
        img = Image.new("RGB", (100, 100), color="blue")
        buf = io.BytesIO()
        img.save(buf, format="JPEG")
        jpeg_bytes = buf.getvalue()

        updated = service.set_logo(seller.id, jpeg_bytes)

        assert updated.logo_s3_key is not None
        assert updated.logo_s3_key.startswith("cas/")
        assert updated.logo_url is not None

    def test_set_logo_invalid_file_type_pdf(self, app: Flask, session: Session, container: ServiceContainer, sample_pdf_bytes):
        """Test uploading a PDF as logo raises InvalidOperationException."""
        service = container.seller_service()
        seller = service.create_seller("DigiKey", "https://www.digikey.com")

        with pytest.raises(InvalidOperationException) as exc_info:
            service.set_logo(seller.id, sample_pdf_bytes)

        assert "file type not allowed" in str(exc_info.value)

    def test_set_logo_invalid_file_type_text(self, app: Flask, session: Session, container: ServiceContainer):
        """Test uploading a text file as logo raises InvalidOperationException."""
        service = container.seller_service()
        seller = service.create_seller("DigiKey", "https://www.digikey.com")
        text_bytes = b"This is not an image file at all."

        with pytest.raises(InvalidOperationException) as exc_info:
            service.set_logo(seller.id, text_bytes)

        assert "file type not allowed" in str(exc_info.value)

    def test_set_logo_file_too_large(self, app: Flask, session: Session, container: ServiceContainer):
        """Test uploading an oversized file raises InvalidOperationException."""
        service = container.seller_service()
        seller = service.create_seller("DigiKey", "https://www.digikey.com")

        # Create bytes larger than max_image_size (default 10MB)
        oversized_bytes = b"\x89PNG" + b"\x00" * (10 * 1024 * 1024 + 1)

        with pytest.raises(InvalidOperationException) as exc_info:
            service.set_logo(seller.id, oversized_bytes)

        assert "file too large" in str(exc_info.value)

    def test_set_logo_nonexistent_seller(self, app: Flask, session: Session, container: ServiceContainer, sample_png_bytes: bytes):
        """Test set_logo for non-existent seller raises RecordNotFoundException."""
        service = container.seller_service()
        png_bytes = sample_png_bytes

        with pytest.raises(RecordNotFoundException) as exc_info:
            service.set_logo(999, png_bytes)

        assert "Seller 999 was not found" in str(exc_info.value)

    def test_set_logo_replaces_existing(self, app: Flask, session: Session, container: ServiceContainer, sample_png_bytes: bytes):
        """Test uploading a new logo replaces the previous one."""
        service = container.seller_service()
        seller = service.create_seller("DigiKey", "https://www.digikey.com")

        # Set first logo
        png_bytes_1 = sample_png_bytes
        service.set_logo(seller.id, png_bytes_1)
        first_key = seller.logo_s3_key

        # Set second logo with different content
        img2 = Image.new("RGB", (200, 200), color="green")
        buf2 = io.BytesIO()
        img2.save(buf2, format="PNG")
        png_bytes_2 = buf2.getvalue()

        service.set_logo(seller.id, png_bytes_2)
        second_key = seller.logo_s3_key

        # The CAS key should be different (different content)
        assert first_key != second_key
        assert second_key is not None
        assert second_key.startswith("cas/")

    def test_set_logo_cas_dedup_skips_upload(self, app: Flask, session: Session, container: ServiceContainer, sample_png_bytes: bytes):
        """Test CAS dedup: when file already exists in S3, upload is skipped."""
        service = container.seller_service()
        seller = service.create_seller("DigiKey", "https://www.digikey.com")
        png_bytes = sample_png_bytes

        # First upload -- puts the blob into S3
        service.set_logo(seller.id, png_bytes)
        first_key = seller.logo_s3_key

        # Create a second seller and upload the same image
        seller2 = service.create_seller("Mouser", "https://www.mouser.com")

        # Spy on s3_service.upload_file to verify dedup
        with patch.object(service.s3_service, "upload_file", wraps=service.s3_service.upload_file) as spy_upload:
            service.set_logo(seller2.id, png_bytes)

            # file_exists should return True, so upload_file should NOT be called
            spy_upload.assert_not_called()

        # Both sellers should share the same CAS key
        assert seller2.logo_s3_key == first_key

    def test_set_logo_s3_upload_failure_rolls_back(self, app: Flask, session: Session, container: ServiceContainer, sample_png_bytes: bytes):
        """Test that S3 upload failure propagates and allows transaction rollback."""
        service = container.seller_service()
        seller = service.create_seller("DigiKey", "https://www.digikey.com")
        assert seller.logo_s3_key is None

        png_bytes = sample_png_bytes

        # Mock file_exists to return False (no dedup) and upload_file to fail
        with patch.object(service.s3_service, "file_exists", return_value=False), \
             patch.object(service.s3_service, "upload_file", side_effect=InvalidOperationException("upload file to S3", "connection refused")):
            with pytest.raises(InvalidOperationException) as exc_info:
                service.set_logo(seller.id, png_bytes)

            assert "upload file to S3" in str(exc_info.value)

    def test_delete_logo_with_logo(self, app: Flask, session: Session, container: ServiceContainer, sample_png_bytes: bytes):
        """Test deleting logo sets logo_s3_key to None."""
        service = container.seller_service()
        seller = service.create_seller("DigiKey", "https://www.digikey.com")
        png_bytes = sample_png_bytes

        # Set logo first
        service.set_logo(seller.id, png_bytes)
        assert seller.logo_s3_key is not None
        assert seller.logo_url is not None

        # Delete logo
        updated = service.delete_logo(seller.id)

        assert updated.logo_s3_key is None
        assert updated.logo_url is None

    def test_delete_logo_without_logo(self, app: Flask, session: Session, container: ServiceContainer):
        """Test deleting logo when none is set does not raise an error."""
        service = container.seller_service()
        seller = service.create_seller("DigiKey", "https://www.digikey.com")
        assert seller.logo_s3_key is None

        # Should not raise
        updated = service.delete_logo(seller.id)

        assert updated.logo_s3_key is None
        assert updated.logo_url is None

    def test_delete_logo_nonexistent_seller(self, app: Flask, session: Session, container: ServiceContainer):
        """Test delete_logo for non-existent seller raises RecordNotFoundException."""
        service = container.seller_service()

        with pytest.raises(RecordNotFoundException) as exc_info:
            service.delete_logo(999)

        assert "Seller 999 was not found" in str(exc_info.value)

    def test_logo_url_none_when_no_logo(self, app: Flask, session: Session, container: ServiceContainer):
        """Test that logo_url property is None when logo_s3_key is None."""
        service = container.seller_service()
        seller = service.create_seller("DigiKey", "https://www.digikey.com")

        assert seller.logo_s3_key is None
        assert seller.logo_url is None

    def test_logo_url_returns_cas_url_when_set(self, app: Flask, session: Session, container: ServiceContainer, sample_png_bytes: bytes):
        """Test that logo_url returns a proper CAS URL when logo is set."""
        service = container.seller_service()
        seller = service.create_seller("DigiKey", "https://www.digikey.com")
        png_bytes = sample_png_bytes

        service.set_logo(seller.id, png_bytes)

        assert seller.logo_url is not None
        assert seller.logo_url.startswith("/api/cas/")
        # CAS URL should contain the 64-char hex hash
        hash_part = seller.logo_url.replace("/api/cas/", "")
        assert len(hash_part) == 64
