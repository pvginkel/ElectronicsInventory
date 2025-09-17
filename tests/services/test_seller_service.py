"""Test seller service functionality."""

import pytest
from flask import Flask
from sqlalchemy.orm import Session

from app.exceptions import (
    InvalidOperationException,
    RecordNotFoundException,
    ResourceConflictException,
)
from app.models.part import Part
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

    def test_delete_seller_with_associated_parts(self, app: Flask, session: Session, container: ServiceContainer):
        """Test deleting a seller that has associated parts raises InvalidOperationException."""
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

        # Create part with this seller
        part = Part(
            key="TEST",
            description="Test part",
            seller_id=seller.id,
            type_id=test_type.id
        )
        session.add(part)
        session.flush()

        # Try to delete seller with associated part
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
