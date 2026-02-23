"""Test part seller service functionality."""

import pytest
from flask import Flask
from sqlalchemy.orm import Session

from app.exceptions import RecordNotFoundException, ResourceConflictException
from app.models.part import Part
from app.models.part_seller import PartSeller
from app.models.seller import Seller
from app.models.type import Type
from app.services.container import ServiceContainer


class TestPartSellerService:
    """Test cases for PartSellerService functionality."""

    def _create_part_and_seller(
        self,
        session: Session,
        container: ServiceContainer,
        part_key: str = "TEST",
        seller_name: str = "DigiKey",
    ) -> tuple[Part, Seller]:
        """Helper to create a part and seller for testing."""
        test_type = Type(name="Test Type")
        session.add(test_type)
        session.flush()

        part_service = container.part_service()
        part = part_service.create_part(
            description="Test part for seller link testing",
        )
        session.flush()

        seller_service = container.seller_service()
        seller = seller_service.create_seller(seller_name, f"https://www.{seller_name.lower()}.com")
        session.flush()

        return part, seller

    def test_add_seller_link_success(self, app: Flask, session: Session, container: ServiceContainer):
        """Test creating a seller link successfully."""
        part, seller = self._create_part_and_seller(session, container)
        service = container.part_seller_service()

        result = service.add_seller_link(
            part_key=part.key,
            seller_id=seller.id,
            link="https://www.digikey.com/en/products/detail/test-part/123",
        )

        assert result.id is not None
        assert result.part_id == part.id
        assert result.seller_id == seller.id
        assert result.link == "https://www.digikey.com/en/products/detail/test-part/123"
        assert result.created_at is not None
        # Verify seller relationship is eager-loaded
        assert result.seller is not None
        assert result.seller.name == "DigiKey"
        assert result.seller.website == "https://www.digikey.com"

    def test_add_seller_link_multiple_sellers_for_one_part(
        self, app: Flask, session: Session, container: ServiceContainer
    ):
        """Test adding links from multiple sellers to a single part."""
        part, seller1 = self._create_part_and_seller(session, container, seller_name="DigiKey")
        seller_service = container.seller_service()
        seller2 = seller_service.create_seller("Mouser", "https://www.mouser.com")
        session.flush()

        service = container.part_seller_service()

        link1 = service.add_seller_link(
            part_key=part.key,
            seller_id=seller1.id,
            link="https://www.digikey.com/product/123",
        )
        link2 = service.add_seller_link(
            part_key=part.key,
            seller_id=seller2.id,
            link="https://www.mouser.com/product/456",
        )

        assert link1.id != link2.id
        assert link1.seller_id == seller1.id
        assert link2.seller_id == seller2.id

    def test_add_seller_link_duplicate_raises_conflict(
        self, app: Flask, session: Session, container: ServiceContainer
    ):
        """Test that adding a duplicate (part_id, seller_id) pair raises ResourceConflictException."""
        part, seller = self._create_part_and_seller(session, container)
        service = container.part_seller_service()

        # First link succeeds
        service.add_seller_link(
            part_key=part.key,
            seller_id=seller.id,
            link="https://www.digikey.com/product/123",
        )

        # Second link with same part+seller raises conflict
        with pytest.raises(ResourceConflictException) as exc_info:
            service.add_seller_link(
                part_key=part.key,
                seller_id=seller.id,
                link="https://www.digikey.com/product/456",
            )

        assert f"part {part.key} and seller {seller.id}" in str(exc_info.value)

    def test_add_seller_link_nonexistent_part(
        self, app: Flask, session: Session, container: ServiceContainer
    ):
        """Test that adding a link for a nonexistent part raises RecordNotFoundException."""
        _, seller = self._create_part_and_seller(session, container)
        service = container.part_seller_service()

        with pytest.raises(RecordNotFoundException) as exc_info:
            service.add_seller_link(
                part_key="ZZZZ",
                seller_id=seller.id,
                link="https://www.digikey.com/product/123",
            )

        assert "Part ZZZZ was not found" in str(exc_info.value)

    def test_add_seller_link_nonexistent_seller(
        self, app: Flask, session: Session, container: ServiceContainer
    ):
        """Test that adding a link for a nonexistent seller raises RecordNotFoundException."""
        part, _ = self._create_part_and_seller(session, container)
        service = container.part_seller_service()

        with pytest.raises(RecordNotFoundException) as exc_info:
            service.add_seller_link(
                part_key=part.key,
                seller_id=99999,
                link="https://www.digikey.com/product/123",
            )

        assert "Seller 99999 was not found" in str(exc_info.value)

    def test_remove_seller_link_success(
        self, app: Flask, session: Session, container: ServiceContainer
    ):
        """Test removing a seller link successfully."""
        part, seller = self._create_part_and_seller(session, container)
        service = container.part_seller_service()

        # Create a link first
        link = service.add_seller_link(
            part_key=part.key,
            seller_id=seller.id,
            link="https://www.digikey.com/product/123",
        )
        link_id = link.id

        # Remove the link
        service.remove_seller_link(part_key=part.key, seller_link_id=link_id)

        # Verify it's gone
        remaining = session.query(PartSeller).filter_by(id=link_id).first()
        assert remaining is None

    def test_remove_seller_link_nonexistent_link(
        self, app: Flask, session: Session, container: ServiceContainer
    ):
        """Test removing a nonexistent seller link raises RecordNotFoundException."""
        part, _ = self._create_part_and_seller(session, container)
        service = container.part_seller_service()

        with pytest.raises(RecordNotFoundException) as exc_info:
            service.remove_seller_link(part_key=part.key, seller_link_id=99999)

        assert "Seller link 99999 was not found" in str(exc_info.value)

    def test_remove_seller_link_nonexistent_part(
        self, app: Flask, session: Session, container: ServiceContainer
    ):
        """Test removing a link for a nonexistent part raises RecordNotFoundException."""
        service = container.part_seller_service()

        with pytest.raises(RecordNotFoundException) as exc_info:
            service.remove_seller_link(part_key="ZZZZ", seller_link_id=1)

        assert "Part ZZZZ was not found" in str(exc_info.value)

    def test_remove_seller_link_wrong_part_key(
        self, app: Flask, session: Session, container: ServiceContainer
    ):
        """Test removing a link that belongs to a different part raises RecordNotFoundException."""
        part1, seller = self._create_part_and_seller(session, container, seller_name="DigiKey")

        # Create a second part
        part_service = container.part_service()
        part2 = part_service.create_part(description="Second test part")
        session.flush()

        service = container.part_seller_service()

        # Create a link on part1
        link = service.add_seller_link(
            part_key=part1.key,
            seller_id=seller.id,
            link="https://www.digikey.com/product/123",
        )

        # Try to remove it using part2's key
        with pytest.raises(RecordNotFoundException) as exc_info:
            service.remove_seller_link(part_key=part2.key, seller_link_id=link.id)

        assert f"Seller link {link.id} was not found" in str(exc_info.value)

    def test_get_seller_link_url_found(
        self, app: Flask, session: Session, container: ServiceContainer
    ):
        """Test looking up a seller link URL that exists."""
        part, seller = self._create_part_and_seller(session, container)
        service = container.part_seller_service()

        service.add_seller_link(
            part_key=part.key,
            seller_id=seller.id,
            link="https://www.digikey.com/product/123",
        )

        url = service.get_seller_link_url(part_id=part.id, seller_id=seller.id)
        assert url == "https://www.digikey.com/product/123"

    def test_get_seller_link_url_not_found(
        self, app: Flask, session: Session, container: ServiceContainer
    ):
        """Test looking up a seller link URL that does not exist."""
        part, seller = self._create_part_and_seller(session, container)
        service = container.part_seller_service()

        url = service.get_seller_link_url(part_id=part.id, seller_id=seller.id)
        assert url is None

    def test_bulk_get_seller_links_success(
        self, app: Flask, session: Session, container: ServiceContainer
    ):
        """Test bulk lookup of seller link URLs for multiple (part_id, seller_id) pairs."""
        part, seller1 = self._create_part_and_seller(session, container, seller_name="DigiKey")
        seller_service = container.seller_service()
        seller2 = seller_service.create_seller("Mouser", "https://www.mouser.com")
        session.flush()

        service = container.part_seller_service()

        service.add_seller_link(
            part_key=part.key,
            seller_id=seller1.id,
            link="https://www.digikey.com/product/123",
        )
        service.add_seller_link(
            part_key=part.key,
            seller_id=seller2.id,
            link="https://www.mouser.com/product/456",
        )

        result = service.bulk_get_seller_links([
            (part.id, seller1.id),
            (part.id, seller2.id),
        ])

        assert len(result) == 2
        assert result[(part.id, seller1.id)] == "https://www.digikey.com/product/123"
        assert result[(part.id, seller2.id)] == "https://www.mouser.com/product/456"

    def test_bulk_get_seller_links_empty_pairs(
        self, app: Flask, session: Session, container: ServiceContainer
    ):
        """Test bulk lookup with empty pairs list returns empty dict."""
        service = container.part_seller_service()

        result = service.bulk_get_seller_links([])
        assert result == {}

    def test_bulk_get_seller_links_partial_match(
        self, app: Flask, session: Session, container: ServiceContainer
    ):
        """Test bulk lookup where only some pairs have matching records."""
        part, seller1 = self._create_part_and_seller(session, container, seller_name="DigiKey")
        seller_service = container.seller_service()
        seller2 = seller_service.create_seller("Mouser", "https://www.mouser.com")
        session.flush()

        service = container.part_seller_service()

        # Only create a link for seller1
        service.add_seller_link(
            part_key=part.key,
            seller_id=seller1.id,
            link="https://www.digikey.com/product/123",
        )

        result = service.bulk_get_seller_links([
            (part.id, seller1.id),
            (part.id, seller2.id),  # No link for this pair
        ])

        assert len(result) == 1
        assert result[(part.id, seller1.id)] == "https://www.digikey.com/product/123"
        assert (part.id, seller2.id) not in result

    def test_bulk_get_seller_links_filters_by_exact_pairs(
        self, app: Flask, session: Session, container: ServiceContainer
    ):
        """Test that bulk lookup only returns links for requested pairs, not all combinations."""
        part1, seller1 = self._create_part_and_seller(session, container, seller_name="DigiKey")
        seller_service = container.seller_service()
        seller2 = seller_service.create_seller("Mouser", "https://www.mouser.com")

        part_service = container.part_service()
        part2 = part_service.create_part(description="Second part")
        session.flush()

        service = container.part_seller_service()

        # Create links: part1-seller1, part1-seller2, part2-seller1
        service.add_seller_link(part_key=part1.key, seller_id=seller1.id, link="https://dk.com/1")
        service.add_seller_link(part_key=part1.key, seller_id=seller2.id, link="https://mouser.com/1")
        service.add_seller_link(part_key=part2.key, seller_id=seller1.id, link="https://dk.com/2")

        # Only request part1-seller1 and part2-seller1
        result = service.bulk_get_seller_links([
            (part1.id, seller1.id),
            (part2.id, seller1.id),
        ])

        assert len(result) == 2
        assert result[(part1.id, seller1.id)] == "https://dk.com/1"
        assert result[(part2.id, seller1.id)] == "https://dk.com/2"
        # part1-seller2 should NOT be included since it wasn't requested
        assert (part1.id, seller2.id) not in result

    def test_seller_link_persisted_to_database(
        self, app: Flask, session: Session, container: ServiceContainer
    ):
        """Test that created seller links are properly persisted in the database."""
        part, seller = self._create_part_and_seller(session, container)
        service = container.part_seller_service()

        link = service.add_seller_link(
            part_key=part.key,
            seller_id=seller.id,
            link="https://www.digikey.com/product/123",
        )

        # Verify via direct query
        db_link = session.query(PartSeller).filter_by(id=link.id).first()
        assert db_link is not None
        assert db_link.part_id == part.id
        assert db_link.seller_id == seller.id
        assert db_link.link == "https://www.digikey.com/product/123"
        assert db_link.created_at is not None

    def test_part_seller_links_relationship(
        self, app: Flask, session: Session, container: ServiceContainer
    ):
        """Test that Part.seller_links relationship is populated correctly."""
        part, seller = self._create_part_and_seller(session, container)
        service = container.part_seller_service()

        service.add_seller_link(
            part_key=part.key,
            seller_id=seller.id,
            link="https://www.digikey.com/product/123",
        )

        # Refresh and check the relationship
        session.refresh(part)
        assert len(part.seller_links) == 1
        assert part.seller_links[0].seller_id == seller.id
        assert part.seller_links[0].link == "https://www.digikey.com/product/123"
