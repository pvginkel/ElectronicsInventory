"""Test seller API endpoints."""

import json

from flask import Flask
from flask.testing import FlaskClient
from sqlalchemy.orm import Session

from app.models.part import Part
from app.models.seller import Seller
from app.models.type import Type
from app.services.container import ServiceContainer


class TestSellerAPI:
    """Test cases for Seller API endpoints."""

    def test_list_sellers_empty(self, app: Flask, client: FlaskClient, session: Session):
        """Test GET /api/sellers with empty database returns empty list."""
        response = client.get("/api/sellers")

        assert response.status_code == 200
        data = response.get_json()
        assert data == []

    def test_list_sellers_with_data(self, app: Flask, client: FlaskClient, session: Session, container: ServiceContainer):
        """Test GET /api/sellers returns sellers ordered by name."""
        # Create sellers using service
        service = container.seller_service()
        service.create_seller("Mouser", "https://www.mouser.com")
        service.create_seller("Amazon", "https://www.amazon.com")
        service.create_seller("DigiKey", "https://www.digikey.com")
        session.commit()

        response = client.get("/api/sellers")

        assert response.status_code == 200
        data = response.get_json()
        assert len(data) == 3

        # Verify ordering by name
        assert data[0]["name"] == "Amazon"
        assert data[1]["name"] == "DigiKey"
        assert data[2]["name"] == "Mouser"

        # Verify structure (SellerListSchema)
        for seller in data:
            assert "id" in seller
            assert "name" in seller
            assert "website" in seller
            assert len(seller) == 3  # id, name, and website in list schema

    def test_create_seller_success(self, app: Flask, client: FlaskClient, session: Session):
        """Test POST /api/sellers creates seller successfully."""
        payload = {
            "name": "DigiKey",
            "website": "https://www.digikey.com"
        }

        response = client.post(
            "/api/sellers",
            data=json.dumps(payload),
            content_type="application/json"
        )

        assert response.status_code == 201
        data = response.get_json()

        # Verify response structure (SellerResponseSchema)
        assert data["name"] == "DigiKey"
        assert data["website"] == "https://www.digikey.com"
        assert "id" in data
        assert "created_at" in data
        assert "updated_at" in data

        # Verify seller was created in database
        seller = session.query(Seller).filter_by(name="DigiKey").first()
        assert seller is not None
        assert seller.website == "https://www.digikey.com"

    def test_create_seller_duplicate_name(self, app: Flask, client: FlaskClient, session: Session, container: ServiceContainer):
        """Test POST /api/sellers with duplicate name returns 409."""
        # Create first seller
        service = container.seller_service()
        service.create_seller("DigiKey", "https://www.digikey.com")
        session.commit()

        # Try to create duplicate
        payload = {
            "name": "DigiKey",
            "website": "https://www.mouser.com"
        }

        response = client.post(
            "/api/sellers",
            data=json.dumps(payload),
            content_type="application/json"
        )

        assert response.status_code == 409
        data = response.get_json()
        assert "error" in data
        assert "DigiKey already exists" in data["error"]

    def test_create_seller_invalid_payload(self, app: Flask, client: FlaskClient, session: Session):
        """Test POST /api/sellers with invalid payload returns 400."""
        payload = {
            "name": "",  # Empty name should fail validation
            "website": "https://www.digikey.com"
        }

        response = client.post(
            "/api/sellers",
            data=json.dumps(payload),
            content_type="application/json"
        )

        assert response.status_code == 400
        data = response.get_json()
        assert "error" in data

    def test_create_seller_missing_fields(self, app: Flask, client: FlaskClient, session: Session):
        """Test POST /api/sellers with missing required fields returns 400."""
        payload = {
            "name": "DigiKey"
            # Missing website
        }

        response = client.post(
            "/api/sellers",
            data=json.dumps(payload),
            content_type="application/json"
        )

        assert response.status_code == 400
        data = response.get_json()
        assert "error" in data

    def test_get_seller_success(self, app: Flask, client: FlaskClient, session: Session, container: ServiceContainer):
        """Test GET /api/sellers/{id} returns seller details."""
        # Create seller
        service = container.seller_service()
        seller = service.create_seller("DigiKey", "https://www.digikey.com")
        session.commit()

        response = client.get(f"/api/sellers/{seller.id}")

        assert response.status_code == 200
        data = response.get_json()

        # Verify response structure (SellerResponseSchema)
        assert data["id"] == seller.id
        assert data["name"] == "DigiKey"
        assert data["website"] == "https://www.digikey.com"
        assert "created_at" in data
        assert "updated_at" in data

    def test_get_seller_not_found(self, app: Flask, client: FlaskClient, session: Session):
        """Test GET /api/sellers/{id} with non-existent ID returns 404."""
        response = client.get("/api/sellers/999")

        assert response.status_code == 404
        data = response.get_json()
        assert "error" in data
        assert "Seller 999 was not found" in data["error"]

    def test_update_seller_success_partial(self, app: Flask, client: FlaskClient, session: Session, container: ServiceContainer):
        """Test PUT /api/sellers/{id} with partial update."""
        # Create seller
        service = container.seller_service()
        seller = service.create_seller("DigiKey", "https://www.digikey.com")
        session.commit()

        # Update only name
        payload = {
            "name": "Digi-Key Corporation"
        }

        response = client.put(
            f"/api/sellers/{seller.id}",
            data=json.dumps(payload),
            content_type="application/json"
        )

        assert response.status_code == 200
        data = response.get_json()

        assert data["id"] == seller.id
        assert data["name"] == "Digi-Key Corporation"
        assert data["website"] == "https://www.digikey.com"  # Should remain unchanged

    def test_update_seller_success_full(self, app: Flask, client: FlaskClient, session: Session, container: ServiceContainer):
        """Test PUT /api/sellers/{id} with full update."""
        # Create seller
        service = container.seller_service()
        seller = service.create_seller("DigiKey", "https://www.digikey.com")
        session.commit()

        # Update both fields
        payload = {
            "name": "Digi-Key Corporation",
            "website": "https://www.digikey.com/en"
        }

        response = client.put(
            f"/api/sellers/{seller.id}",
            data=json.dumps(payload),
            content_type="application/json"
        )

        assert response.status_code == 200
        data = response.get_json()

        assert data["id"] == seller.id
        assert data["name"] == "Digi-Key Corporation"
        assert data["website"] == "https://www.digikey.com/en"

    def test_update_seller_not_found(self, app: Flask, client: FlaskClient, session: Session):
        """Test PUT /api/sellers/{id} with non-existent ID returns 404."""
        payload = {
            "name": "New Name"
        }

        response = client.put(
            "/api/sellers/999",
            data=json.dumps(payload),
            content_type="application/json"
        )

        assert response.status_code == 404
        data = response.get_json()
        assert "error" in data
        assert "Seller 999 was not found" in data["error"]

    def test_update_seller_duplicate_name(self, app: Flask, client: FlaskClient, session: Session, container: ServiceContainer):
        """Test PUT /api/sellers/{id} with duplicate name returns 409."""
        # Create two sellers
        service = container.seller_service()
        service.create_seller("DigiKey", "https://www.digikey.com")
        seller2 = service.create_seller("Mouser", "https://www.mouser.com")
        session.commit()

        # Try to update seller2 to have seller1's name
        payload = {
            "name": "DigiKey"
        }

        response = client.put(
            f"/api/sellers/{seller2.id}",
            data=json.dumps(payload),
            content_type="application/json"
        )

        assert response.status_code == 409
        data = response.get_json()
        assert "error" in data
        assert "DigiKey already exists" in data["error"]

    def test_update_seller_invalid_payload(self, app: Flask, client: FlaskClient, session: Session, container: ServiceContainer):
        """Test PUT /api/sellers/{id} with invalid payload returns 400."""
        # Create seller
        service = container.seller_service()
        seller = service.create_seller("DigiKey", "https://www.digikey.com")
        session.commit()

        # Invalid payload with empty name
        payload = {
            "name": ""
        }

        response = client.put(
            f"/api/sellers/{seller.id}",
            data=json.dumps(payload),
            content_type="application/json"
        )

        assert response.status_code == 400
        data = response.get_json()
        assert "error" in data

    def test_delete_seller_success(self, app: Flask, client: FlaskClient, session: Session, container: ServiceContainer):
        """Test DELETE /api/sellers/{id} removes seller successfully."""
        # Create seller
        service = container.seller_service()
        seller = service.create_seller("DigiKey", "https://www.digikey.com")
        seller_id = seller.id
        session.commit()

        response = client.delete(f"/api/sellers/{seller_id}")

        assert response.status_code == 204
        assert response.data == b""

        # Verify seller was deleted
        deleted_seller = session.query(Seller).filter_by(id=seller_id).first()
        assert deleted_seller is None

    def test_delete_seller_not_found(self, app: Flask, client: FlaskClient, session: Session):
        """Test DELETE /api/sellers/{id} with non-existent ID returns 404."""
        response = client.delete("/api/sellers/999")

        assert response.status_code == 404
        data = response.get_json()
        assert "error" in data
        assert "Seller 999 was not found" in data["error"]

    def test_delete_seller_with_parts(self, app: Flask, client: FlaskClient, session: Session, container: ServiceContainer, make_attachment_set):
        """Test DELETE /api/sellers/{id} with associated parts returns 409."""
        # Create seller
        service = container.seller_service()
        seller = service.create_seller("DigiKey", "https://www.digikey.com")

        # Create type first
        test_type = Type(name="Test Type")
        session.add(test_type)
        session.flush()

        # Create part with this seller
        attachment_set = make_attachment_set()
        part = Part(
            key="TEST",
            description="Test part",
            seller_id=seller.id,
            type_id=test_type.id,
            attachment_set_id=attachment_set.id
        )
        session.add(part)
        session.commit()

        response = client.delete(f"/api/sellers/{seller.id}")

        assert response.status_code == 409
        data = response.get_json()
        assert "error" in data
        assert "has associated parts" in data["error"]

    def test_seller_api_content_type_validation(self, app: Flask, client: FlaskClient, session: Session):
        """Test API endpoints require correct content-type."""
        payload = {
            "name": "DigiKey",
            "website": "https://www.digikey.com"
        }

        # Test without content-type header
        response = client.post(
            "/api/sellers",
            data=json.dumps(payload)
        )

        # Should fail due to missing/incorrect content-type
        assert response.status_code == 400

    def test_seller_api_malformed_json(self, app: Flask, client: FlaskClient, session: Session):
        """Test API endpoints handle malformed JSON gracefully."""
        response = client.post(
            "/api/sellers",
            data='{"name": "DigiKey", "website":}',  # Malformed JSON
            content_type="application/json"
        )

        assert response.status_code == 400
        data = response.get_json()
        assert "error" in data

    def test_seller_response_schema_structure(self, app: Flask, client: FlaskClient, session: Session, container: ServiceContainer):
        """Test that seller responses have exactly the expected fields."""
        # Create seller
        service = container.seller_service()
        seller = service.create_seller("DigiKey", "https://www.digikey.com")
        session.commit()

        response = client.get(f"/api/sellers/{seller.id}")
        assert response.status_code == 200
        data = response.get_json()

        # Verify all expected fields are present
        expected_fields = {"id", "name", "website", "created_at", "updated_at"}
        actual_fields = set(data.keys())
        assert actual_fields == expected_fields

        # Verify field types
        assert isinstance(data["id"], int)
        assert isinstance(data["name"], str)
        assert isinstance(data["website"], str)
        assert isinstance(data["created_at"], str)
        assert isinstance(data["updated_at"], str)

    def test_seller_list_schema_structure(self, app: Flask, client: FlaskClient, session: Session, container: ServiceContainer):
        """Test that seller list responses have exactly the expected fields."""
        # Create seller
        service = container.seller_service()
        service.create_seller("DigiKey", "https://www.digikey.com")
        session.commit()

        response = client.get("/api/sellers")
        assert response.status_code == 200
        data = response.get_json()

        assert len(data) == 1
        seller_data = data[0]

        # Verify all expected fields are present (SellerListSchema)
        expected_fields = {"id", "name", "website"}
        actual_fields = set(seller_data.keys())
        assert actual_fields == expected_fields

        # Verify field types
        assert isinstance(seller_data["id"], int)
        assert isinstance(seller_data["name"], str)
        assert isinstance(seller_data["website"], str)
