"""Test seller API endpoints."""

import io
import json

from flask import Flask
from flask.testing import FlaskClient
from PIL import Image
from sqlalchemy.orm import Session

from app.models.part import Part
from app.models.part_seller import PartSeller
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

        # Verify structure (SellerListSchema) -- now includes logo_url
        for seller in data:
            assert "id" in seller
            assert "name" in seller
            assert "website" in seller
            assert "logo_url" in seller
            assert len(seller) == 4  # id, name, website, logo_url

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
        assert "logo_url" in data
        assert data["logo_url"] == "https://www.google.com/s2/favicons?domain=www.digikey.com&sz=32"
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
        assert data["logo_url"] == "https://www.google.com/s2/favicons?domain=www.digikey.com&sz=32"
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

        # Create part and link it to this seller via PartSeller
        attachment_set = make_attachment_set()
        part = Part(
            key="TEST",
            description="Test part",
            type_id=test_type.id,
            attachment_set_id=attachment_set.id
        )
        session.add(part)
        session.flush()

        part_seller = PartSeller(
            part_id=part.id,
            seller_id=seller.id,
            link="https://www.digikey.com/en/products/detail/test",
        )
        session.add(part_seller)
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

        # Verify all expected fields are present (now includes logo_url)
        expected_fields = {"id", "name", "website", "logo_url", "created_at", "updated_at"}
        actual_fields = set(data.keys())
        assert actual_fields == expected_fields

        # Verify field types
        assert isinstance(data["id"], int)
        assert isinstance(data["name"], str)
        assert isinstance(data["website"], str)
        assert isinstance(data["logo_url"], str)  # Favicon fallback
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

        # Verify all expected fields are present (SellerListSchema, now includes logo_url)
        expected_fields = {"id", "name", "website", "logo_url"}
        actual_fields = set(seller_data.keys())
        assert actual_fields == expected_fields

        # Verify field types
        assert isinstance(seller_data["id"], int)
        assert isinstance(seller_data["name"], str)
        assert isinstance(seller_data["website"], str)
        assert isinstance(seller_data["logo_url"], str)  # Favicon fallback


class TestSellerLogoAPI:
    """Test cases for seller logo upload and delete API endpoints."""

    def test_set_logo_success(self, app: Flask, client: FlaskClient, session: Session, container: ServiceContainer, sample_png_bytes: bytes):
        """Test PUT /api/sellers/{id}/logo with valid PNG returns 200."""
        service = container.seller_service()
        seller = service.create_seller("DigiKey", "https://www.digikey.com")
        session.commit()

        png_bytes = sample_png_bytes

        response = client.put(
            f"/api/sellers/{seller.id}/logo",
            data={"file": (io.BytesIO(png_bytes), "logo.png")},
            content_type="multipart/form-data",
        )

        assert response.status_code == 200
        data = response.get_json()

        assert data["id"] == seller.id
        assert data["logo_url"] is not None
        assert "/api/cas/" in data["logo_url"]
        assert "name" in data
        assert "website" in data

    def test_set_logo_no_file(self, app: Flask, client: FlaskClient, session: Session, container: ServiceContainer):
        """Test PUT /api/sellers/{id}/logo without file returns 400."""
        service = container.seller_service()
        seller = service.create_seller("DigiKey", "https://www.digikey.com")
        session.commit()

        response = client.put(
            f"/api/sellers/{seller.id}/logo",
            data={},
            content_type="multipart/form-data",
        )

        assert response.status_code == 400
        data = response.get_json()
        assert "error" in data
        assert "No file provided" in data["error"]

    def test_set_logo_invalid_content_type(self, app: Flask, client: FlaskClient, session: Session, container: ServiceContainer):
        """Test PUT /api/sellers/{id}/logo with wrong content type returns 400."""
        service = container.seller_service()
        seller = service.create_seller("DigiKey", "https://www.digikey.com")
        session.commit()

        response = client.put(
            f"/api/sellers/{seller.id}/logo",
            data=json.dumps({"url": "https://example.com/logo.png"}),
            content_type="application/json",
        )

        assert response.status_code == 400
        data = response.get_json()
        assert "error" in data
        assert "multipart/form-data" in data["error"]

    def test_set_logo_invalid_file_type(self, app: Flask, client: FlaskClient, session: Session, container: ServiceContainer, sample_pdf_bytes: bytes):
        """Test PUT /api/sellers/{id}/logo with PDF file returns 409."""
        service = container.seller_service()
        seller = service.create_seller("DigiKey", "https://www.digikey.com")
        session.commit()

        pdf_bytes = sample_pdf_bytes

        response = client.put(
            f"/api/sellers/{seller.id}/logo",
            data={"file": (io.BytesIO(pdf_bytes), "document.pdf")},
            content_type="multipart/form-data",
        )

        assert response.status_code == 409
        data = response.get_json()
        assert "error" in data
        assert "file type not allowed" in data["error"]

    def test_set_logo_seller_not_found(self, app: Flask, client: FlaskClient, session: Session, sample_png_bytes: bytes):
        """Test PUT /api/sellers/{id}/logo with non-existent seller returns 404."""
        png_bytes = sample_png_bytes

        response = client.put(
            "/api/sellers/999/logo",
            data={"file": (io.BytesIO(png_bytes), "logo.png")},
            content_type="multipart/form-data",
        )

        assert response.status_code == 404
        data = response.get_json()
        assert "error" in data
        assert "Seller 999 was not found" in data["error"]

    def test_set_logo_replaces_existing(self, app: Flask, client: FlaskClient, session: Session, container: ServiceContainer, sample_png_bytes: bytes):
        """Test PUT /api/sellers/{id}/logo replaces existing logo."""
        service = container.seller_service()
        seller = service.create_seller("DigiKey", "https://www.digikey.com")
        session.commit()

        # Upload first logo
        png_bytes_1 = sample_png_bytes
        response1 = client.put(
            f"/api/sellers/{seller.id}/logo",
            data={"file": (io.BytesIO(png_bytes_1), "logo1.png")},
            content_type="multipart/form-data",
        )
        assert response1.status_code == 200
        first_url = response1.get_json()["logo_url"]

        # Upload second logo with different content
        img2 = Image.new("RGB", (200, 200), color="green")
        buf2 = io.BytesIO()
        img2.save(buf2, format="PNG")
        png_bytes_2 = buf2.getvalue()

        response2 = client.put(
            f"/api/sellers/{seller.id}/logo",
            data={"file": (io.BytesIO(png_bytes_2), "logo2.png")},
            content_type="multipart/form-data",
        )
        assert response2.status_code == 200
        second_url = response2.get_json()["logo_url"]

        # URLs should differ because content differs
        assert first_url != second_url
        assert "/api/cas/" in second_url

    def test_delete_logo_with_logo(self, app: Flask, client: FlaskClient, session: Session, container: ServiceContainer, sample_png_bytes: bytes):
        """Test DELETE /api/sellers/{id}/logo removes logo and returns 200."""
        service = container.seller_service()
        seller = service.create_seller("DigiKey", "https://www.digikey.com")
        session.commit()

        # Upload logo first
        png_bytes = sample_png_bytes
        upload_resp = client.put(
            f"/api/sellers/{seller.id}/logo",
            data={"file": (io.BytesIO(png_bytes), "logo.png")},
            content_type="multipart/form-data",
        )
        assert upload_resp.status_code == 200
        assert upload_resp.get_json()["logo_url"] is not None

        # Delete logo
        response = client.delete(f"/api/sellers/{seller.id}/logo")

        assert response.status_code == 200
        data = response.get_json()
        assert data["logo_url"] == "https://www.google.com/s2/favicons?domain=www.digikey.com&sz=32"
        assert data["id"] == seller.id
        assert data["name"] == "DigiKey"

    def test_delete_logo_without_logo(self, app: Flask, client: FlaskClient, session: Session, container: ServiceContainer):
        """Test DELETE /api/sellers/{id}/logo when no logo exists returns 200."""
        service = container.seller_service()
        seller = service.create_seller("DigiKey", "https://www.digikey.com")
        session.commit()

        response = client.delete(f"/api/sellers/{seller.id}/logo")

        assert response.status_code == 200
        data = response.get_json()
        assert data["logo_url"] == "https://www.google.com/s2/favicons?domain=www.digikey.com&sz=32"

    def test_delete_logo_seller_not_found(self, app: Flask, client: FlaskClient, session: Session):
        """Test DELETE /api/sellers/{id}/logo with non-existent seller returns 404."""
        response = client.delete("/api/sellers/999/logo")

        assert response.status_code == 404
        data = response.get_json()
        assert "error" in data
        assert "Seller 999 was not found" in data["error"]

    def test_logo_url_in_list_after_upload(self, app: Flask, client: FlaskClient, session: Session, container: ServiceContainer, sample_png_bytes: bytes):
        """Test that logo_url appears in seller list response after upload."""
        service = container.seller_service()
        seller = service.create_seller("DigiKey", "https://www.digikey.com")
        session.commit()

        # Upload logo
        png_bytes = sample_png_bytes
        client.put(
            f"/api/sellers/{seller.id}/logo",
            data={"file": (io.BytesIO(png_bytes), "logo.png")},
            content_type="multipart/form-data",
        )

        # Check list endpoint
        response = client.get("/api/sellers")
        assert response.status_code == 200
        data = response.get_json()

        assert len(data) == 1
        assert data[0]["logo_url"] is not None
        assert "/api/cas/" in data[0]["logo_url"]

    def test_logo_url_in_detail_after_upload(self, app: Flask, client: FlaskClient, session: Session, container: ServiceContainer, sample_png_bytes: bytes):
        """Test that logo_url appears in seller detail response after upload."""
        service = container.seller_service()
        seller = service.create_seller("DigiKey", "https://www.digikey.com")
        session.commit()

        # Upload logo
        png_bytes = sample_png_bytes
        client.put(
            f"/api/sellers/{seller.id}/logo",
            data={"file": (io.BytesIO(png_bytes), "logo.png")},
            content_type="multipart/form-data",
        )

        # Check detail endpoint
        response = client.get(f"/api/sellers/{seller.id}")
        assert response.status_code == 200
        data = response.get_json()

        assert data["logo_url"] is not None
        assert "/api/cas/" in data["logo_url"]
