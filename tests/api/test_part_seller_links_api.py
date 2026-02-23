"""Test part seller links API endpoints."""

import json

from flask import Flask
from flask.testing import FlaskClient
from sqlalchemy.orm import Session

from app.models.part_seller import PartSeller
from app.models.type import Type
from app.services.container import ServiceContainer


class TestPartSellerLinksAPI:
    """Test cases for part seller links API endpoints."""

    def _create_part_and_seller(
        self,
        session: Session,
        container: ServiceContainer,
        seller_name: str = "DigiKey",
    ) -> tuple:
        """Helper to create a part and seller for testing.

        Returns (part, seller) tuple. Commits the transaction so data is
        visible to the test client.
        """
        test_type = Type(name="Test Type")
        session.add(test_type)
        session.flush()

        part_service = container.part_service()
        part = part_service.create_part(
            description="Test part for seller link API testing",
        )
        session.flush()

        seller_service = container.seller_service()
        seller = seller_service.create_seller(seller_name, f"https://www.{seller_name.lower()}.com")
        session.flush()
        session.commit()

        return part, seller

    # -----------------------------------------------------------------------
    # POST /api/parts/<part_key>/seller-links
    # -----------------------------------------------------------------------

    def test_add_seller_link_success(
        self, app: Flask, client: FlaskClient, session: Session, container: ServiceContainer
    ):
        """Test POST creates seller link and returns 201 with correct schema."""
        part, seller = self._create_part_and_seller(session, container)

        payload = {
            "seller_id": seller.id,
            "link": "https://www.digikey.com/en/products/detail/test-part/123",
        }

        response = client.post(
            f"/api/parts/{part.key}/seller-links",
            data=json.dumps(payload),
            content_type="application/json",
        )

        assert response.status_code == 201
        data = response.get_json()

        # Verify response structure (PartSellerLinkSchema)
        assert "id" in data
        assert data["seller_id"] == seller.id
        assert data["seller_name"] == "DigiKey"
        assert data["seller_website"] == "https://www.digikey.com"
        assert data["link"] == "https://www.digikey.com/en/products/detail/test-part/123"
        assert "created_at" in data

    def test_add_seller_link_response_schema_structure(
        self, app: Flask, client: FlaskClient, session: Session, container: ServiceContainer
    ):
        """Test that the response contains exactly the expected fields."""
        part, seller = self._create_part_and_seller(session, container)

        payload = {
            "seller_id": seller.id,
            "link": "https://www.digikey.com/product/123",
        }

        response = client.post(
            f"/api/parts/{part.key}/seller-links",
            data=json.dumps(payload),
            content_type="application/json",
        )

        assert response.status_code == 201
        data = response.get_json()

        expected_fields = {"id", "seller_id", "seller_name", "seller_website", "link", "created_at"}
        actual_fields = set(data.keys())
        assert actual_fields == expected_fields

        # Verify field types
        assert isinstance(data["id"], int)
        assert isinstance(data["seller_id"], int)
        assert isinstance(data["seller_name"], str)
        assert isinstance(data["seller_website"], str)
        assert isinstance(data["link"], str)
        assert isinstance(data["created_at"], str)

    def test_add_seller_link_persisted_to_database(
        self, app: Flask, client: FlaskClient, session: Session, container: ServiceContainer
    ):
        """Test that the created seller link is persisted in the database."""
        part, seller = self._create_part_and_seller(session, container)

        payload = {
            "seller_id": seller.id,
            "link": "https://www.digikey.com/product/123",
        }

        response = client.post(
            f"/api/parts/{part.key}/seller-links",
            data=json.dumps(payload),
            content_type="application/json",
        )

        assert response.status_code == 201
        data = response.get_json()

        # Verify via direct query
        db_link = session.query(PartSeller).filter_by(id=data["id"]).first()
        assert db_link is not None
        assert db_link.part_id == part.id
        assert db_link.seller_id == seller.id
        assert db_link.link == "https://www.digikey.com/product/123"

    def test_add_seller_link_duplicate_returns_409(
        self, app: Flask, client: FlaskClient, session: Session, container: ServiceContainer
    ):
        """Test POST with duplicate (part_key, seller_id) returns 409 conflict."""
        part, seller = self._create_part_and_seller(session, container)

        payload = {
            "seller_id": seller.id,
            "link": "https://www.digikey.com/product/123",
        }

        # First request succeeds
        response1 = client.post(
            f"/api/parts/{part.key}/seller-links",
            data=json.dumps(payload),
            content_type="application/json",
        )
        assert response1.status_code == 201

        # Second request with same part+seller returns conflict
        payload["link"] = "https://www.digikey.com/product/456"
        response2 = client.post(
            f"/api/parts/{part.key}/seller-links",
            data=json.dumps(payload),
            content_type="application/json",
        )

        assert response2.status_code == 409
        data = response2.get_json()
        assert "error" in data

    def test_add_seller_link_nonexistent_part_returns_404(
        self, app: Flask, client: FlaskClient, session: Session, container: ServiceContainer
    ):
        """Test POST with nonexistent part key returns 404."""
        # Create seller only
        seller_service = container.seller_service()
        seller = seller_service.create_seller("DigiKey", "https://www.digikey.com")
        session.commit()

        payload = {
            "seller_id": seller.id,
            "link": "https://www.digikey.com/product/123",
        }

        response = client.post(
            "/api/parts/ZZZZ/seller-links",
            data=json.dumps(payload),
            content_type="application/json",
        )

        assert response.status_code == 404
        data = response.get_json()
        assert "error" in data
        assert "ZZZZ" in data["error"]

    def test_add_seller_link_nonexistent_seller_returns_404(
        self, app: Flask, client: FlaskClient, session: Session, container: ServiceContainer
    ):
        """Test POST with nonexistent seller ID returns 404."""
        test_type = Type(name="Test Type")
        session.add(test_type)
        session.flush()

        part_service = container.part_service()
        part = part_service.create_part(description="Test part")
        session.flush()
        session.commit()

        payload = {
            "seller_id": 99999,
            "link": "https://www.digikey.com/product/123",
        }

        response = client.post(
            f"/api/parts/{part.key}/seller-links",
            data=json.dumps(payload),
            content_type="application/json",
        )

        assert response.status_code == 404
        data = response.get_json()
        assert "error" in data
        assert "99999" in data["error"]

    def test_add_seller_link_missing_seller_id(
        self, app: Flask, client: FlaskClient, session: Session, container: ServiceContainer
    ):
        """Test POST with missing seller_id returns 400 validation error."""
        test_type = Type(name="Test Type")
        session.add(test_type)
        session.flush()

        part_service = container.part_service()
        part = part_service.create_part(description="Test part")
        session.flush()
        session.commit()

        payload = {
            "link": "https://www.digikey.com/product/123",
            # Missing seller_id
        }

        response = client.post(
            f"/api/parts/{part.key}/seller-links",
            data=json.dumps(payload),
            content_type="application/json",
        )

        assert response.status_code == 400

    def test_add_seller_link_missing_link(
        self, app: Flask, client: FlaskClient, session: Session, container: ServiceContainer
    ):
        """Test POST with missing link returns 400 validation error."""
        test_type = Type(name="Test Type")
        session.add(test_type)
        session.flush()

        part_service = container.part_service()
        part = part_service.create_part(description="Test part")
        session.flush()
        session.commit()

        payload = {
            "seller_id": 1,
            # Missing link
        }

        response = client.post(
            f"/api/parts/{part.key}/seller-links",
            data=json.dumps(payload),
            content_type="application/json",
        )

        assert response.status_code == 400

    def test_add_seller_link_empty_link(
        self, app: Flask, client: FlaskClient, session: Session, container: ServiceContainer
    ):
        """Test POST with empty link string returns 400 validation error."""
        test_type = Type(name="Test Type")
        session.add(test_type)
        session.flush()

        part_service = container.part_service()
        part = part_service.create_part(description="Test part")
        session.flush()
        session.commit()

        payload = {
            "seller_id": 1,
            "link": "",  # Empty link should fail min_length=1 validation
        }

        response = client.post(
            f"/api/parts/{part.key}/seller-links",
            data=json.dumps(payload),
            content_type="application/json",
        )

        assert response.status_code == 400

    def test_add_seller_link_malformed_json(
        self, app: Flask, client: FlaskClient, session: Session
    ):
        """Test POST with malformed JSON returns 400."""
        response = client.post(
            "/api/parts/TEST/seller-links",
            data='{"seller_id": 1, "link":}',  # Malformed JSON
            content_type="application/json",
        )

        assert response.status_code == 400

    def test_add_seller_link_missing_content_type(
        self, app: Flask, client: FlaskClient, session: Session
    ):
        """Test POST without content-type header returns 400."""
        payload = {
            "seller_id": 1,
            "link": "https://www.digikey.com/product/123",
        }

        response = client.post(
            "/api/parts/TEST/seller-links",
            data=json.dumps(payload),
        )

        assert response.status_code == 400

    def test_add_multiple_sellers_to_same_part(
        self, app: Flask, client: FlaskClient, session: Session, container: ServiceContainer
    ):
        """Test adding links from multiple sellers to the same part."""
        part, seller1 = self._create_part_and_seller(session, container, seller_name="DigiKey")
        seller_service = container.seller_service()
        seller2 = seller_service.create_seller("Mouser", "https://www.mouser.com")
        session.commit()

        # Add first seller link
        response1 = client.post(
            f"/api/parts/{part.key}/seller-links",
            data=json.dumps({"seller_id": seller1.id, "link": "https://www.digikey.com/product/123"}),
            content_type="application/json",
        )
        assert response1.status_code == 201

        # Add second seller link
        response2 = client.post(
            f"/api/parts/{part.key}/seller-links",
            data=json.dumps({"seller_id": seller2.id, "link": "https://www.mouser.com/product/456"}),
            content_type="application/json",
        )
        assert response2.status_code == 201

        data1 = response1.get_json()
        data2 = response2.get_json()
        assert data1["id"] != data2["id"]
        assert data1["seller_name"] == "DigiKey"
        assert data2["seller_name"] == "Mouser"

    # -----------------------------------------------------------------------
    # DELETE /api/parts/<part_key>/seller-links/<seller_link_id>
    # -----------------------------------------------------------------------

    def test_remove_seller_link_success(
        self, app: Flask, client: FlaskClient, session: Session, container: ServiceContainer
    ):
        """Test DELETE removes seller link and returns 204."""
        part, seller = self._create_part_and_seller(session, container)

        # Create a link via the API first
        create_response = client.post(
            f"/api/parts/{part.key}/seller-links",
            data=json.dumps({"seller_id": seller.id, "link": "https://www.digikey.com/product/123"}),
            content_type="application/json",
        )
        assert create_response.status_code == 201
        link_id = create_response.get_json()["id"]

        # Delete the link
        delete_response = client.delete(
            f"/api/parts/{part.key}/seller-links/{link_id}"
        )

        assert delete_response.status_code == 204
        assert delete_response.data == b""

        # Verify it's gone from the database
        remaining = session.query(PartSeller).filter_by(id=link_id).first()
        assert remaining is None

    def test_remove_seller_link_nonexistent_link_returns_404(
        self, app: Flask, client: FlaskClient, session: Session, container: ServiceContainer
    ):
        """Test DELETE with nonexistent seller link ID returns 404."""
        test_type = Type(name="Test Type")
        session.add(test_type)
        session.flush()

        part_service = container.part_service()
        part = part_service.create_part(description="Test part")
        session.flush()
        session.commit()

        response = client.delete(
            f"/api/parts/{part.key}/seller-links/99999"
        )

        assert response.status_code == 404
        data = response.get_json()
        assert "error" in data
        assert "99999" in data["error"]

    def test_remove_seller_link_nonexistent_part_returns_404(
        self, app: Flask, client: FlaskClient, session: Session
    ):
        """Test DELETE with nonexistent part key returns 404."""
        response = client.delete(
            "/api/parts/ZZZZ/seller-links/1"
        )

        assert response.status_code == 404
        data = response.get_json()
        assert "error" in data
        assert "ZZZZ" in data["error"]

    def test_remove_seller_link_wrong_part_key_returns_404(
        self, app: Flask, client: FlaskClient, session: Session, container: ServiceContainer
    ):
        """Test DELETE with a seller link that belongs to a different part returns 404."""
        part1, seller = self._create_part_and_seller(session, container, seller_name="DigiKey")

        # Create a second part
        part_service = container.part_service()
        part2 = part_service.create_part(description="Second test part")
        session.flush()
        session.commit()

        # Create a link on part1
        create_response = client.post(
            f"/api/parts/{part1.key}/seller-links",
            data=json.dumps({"seller_id": seller.id, "link": "https://www.digikey.com/product/123"}),
            content_type="application/json",
        )
        assert create_response.status_code == 201
        link_id = create_response.get_json()["id"]

        # Try to delete using part2's key
        delete_response = client.delete(
            f"/api/parts/{part2.key}/seller-links/{link_id}"
        )

        assert delete_response.status_code == 404
        data = delete_response.get_json()
        assert "error" in data

        # Original link should still exist
        remaining = session.query(PartSeller).filter_by(id=link_id).first()
        assert remaining is not None

    def test_seller_links_visible_in_part_response(
        self, app: Flask, client: FlaskClient, session: Session, container: ServiceContainer
    ):
        """Test that seller links appear in the part detail response."""
        part, seller = self._create_part_and_seller(session, container)

        # Add a seller link
        client.post(
            f"/api/parts/{part.key}/seller-links",
            data=json.dumps({"seller_id": seller.id, "link": "https://www.digikey.com/product/123"}),
            content_type="application/json",
        )

        # Clear the identity map so the GET handler's selectinload re-fetches
        # seller_links from the database. In production each request uses a
        # fresh session; in tests the ContextLocalSingleton shares one.
        session.expire_all()

        # Fetch the part and check seller_links are included
        response = client.get(f"/api/parts/{part.key}")

        assert response.status_code == 200
        data = response.get_json()
        assert "seller_links" in data
        assert len(data["seller_links"]) == 1

        link_data = data["seller_links"][0]
        assert link_data["seller_id"] == seller.id
        assert link_data["seller_name"] == "DigiKey"
        assert link_data["link"] == "https://www.digikey.com/product/123"

    def test_seller_links_removed_from_part_response_after_delete(
        self, app: Flask, client: FlaskClient, session: Session, container: ServiceContainer
    ):
        """Test that deleted seller links no longer appear in the part response."""
        part, seller = self._create_part_and_seller(session, container)

        # Add a seller link
        create_response = client.post(
            f"/api/parts/{part.key}/seller-links",
            data=json.dumps({"seller_id": seller.id, "link": "https://www.digikey.com/product/123"}),
            content_type="application/json",
        )
        link_id = create_response.get_json()["id"]

        # Delete the seller link
        client.delete(f"/api/parts/{part.key}/seller-links/{link_id}")

        # Clear identity map for same reason as test_seller_links_visible_in_part_response
        session.expire_all()

        # Fetch the part and verify seller_links is empty
        response = client.get(f"/api/parts/{part.key}")

        assert response.status_code == 200
        data = response.get_json()
        assert "seller_links" in data
        assert data["seller_links"] == []
