"""Tests for parts API endpoints."""

import json

from flask import Flask
from flask.testing import FlaskClient
from sqlalchemy.orm import Session

from app.services.container import ServiceContainer


class TestPartsAPI:
    """Test cases for parts API endpoints."""

    def test_create_part_minimal(self, app: Flask, client: FlaskClient, session: Session):
        """Test creating a part with minimal data."""
        with app.app_context():
            data = {"description": "1k ohm resistor"}

            response = client.post("/api/parts", json=data)

            assert response.status_code == 201
            response_data = json.loads(response.data)

            assert len(response_data["key"]) == 4
            assert response_data["description"] == "1k ohm resistor"
            assert response_data["manufacturer_code"] is None
            assert response_data["total_quantity"] == 0
            # Extended fields should be None by default
            assert response_data["package"] is None
            assert response_data["pin_count"] is None
            assert response_data["voltage_rating"] is None
            assert response_data["mounting_type"] is None
            assert response_data["series"] is None
            assert response_data["dimensions"] is None

    def test_create_part_full_data(self, app: Flask, client: FlaskClient, session: Session, container: ServiceContainer):
        """Test creating a part with full data."""
        with app.app_context():
            # Create type first
            type_obj = container.type_service().create_type("Resistor")
            session.commit()

            data = {
                "description": "1k ohm resistor",
                "manufacturer_code": "RES-1K-5%",
                "type_id": type_obj.id,
                "tags": ["1k", "5%"],
                "seller": "Digi-Key",
                "seller_link": "https://digikey.com/product/123",
                "package": "0805",
                "pin_count": 2,
                "voltage_rating": "50V",
                "mounting_type": "Surface Mount",
                "series": "Standard",
                "dimensions": "2.0x1.25mm"
            }

            response = client.post("/api/parts", json=data)

            assert response.status_code == 201
            response_data = json.loads(response.data)

            assert response_data["description"] == "1k ohm resistor"
            assert response_data["manufacturer_code"] == "RES-1K-5%"
            assert response_data["type_id"] == type_obj.id
            assert response_data["tags"] == ["1k", "5%"]
            assert response_data["seller"] == "Digi-Key"
            # Extended fields
            assert response_data["package"] == "0805"
            assert response_data["pin_count"] == 2
            assert response_data["voltage_rating"] == "50V"
            assert response_data["mounting_type"] == "Surface Mount"
            assert response_data["series"] == "Standard"
            assert response_data["dimensions"] == "2.0x1.25mm"

    def test_create_part_invalid_data(self, app: Flask, client: FlaskClient):
        """Test creating a part with invalid data."""
        # Missing required description
        data = {"manufacturer_code": "RES-1K"}

        response = client.post("/api/parts", json=data)
        assert response.status_code == 400

    def test_list_parts(self, app: Flask, client: FlaskClient, session: Session, container: ServiceContainer):
        """Test listing parts."""
        with app.app_context():
            # Create some parts
            container.part_service().create_part("Part 1")
            container.part_service().create_part("Part 2")
            session.commit()

            response = client.get("/api/parts")

            assert response.status_code == 200
            response_data = json.loads(response.data)

            assert len(response_data) == 2
            assert all("key" in part for part in response_data)
            assert all("description" in part for part in response_data)

    def test_list_parts_with_pagination(self, app: Flask, client: FlaskClient, session: Session, container: ServiceContainer):
        """Test listing parts with pagination parameters."""
        with app.app_context():
            # Create multiple parts
            for i in range(5):
                container.part_service().create_part(f"Part {i}")
            session.commit()

            # Test with limit
            response = client.get("/api/parts?limit=3")
            assert response.status_code == 200
            response_data = json.loads(response.data)
            assert len(response_data) == 3

            # Test with offset
            response = client.get("/api/parts?limit=2&offset=2")
            assert response.status_code == 200
            response_data = json.loads(response.data)
            assert len(response_data) == 2

    def test_list_parts_with_type_filter(self, app: Flask, client: FlaskClient, session: Session, container: ServiceContainer):
        """Test listing parts with type filter parameter."""
        with app.app_context():
            # Create types and parts
            resistor_type = container.type_service().create_type("Resistor")
            capacitor_type = container.type_service().create_type("Capacitor")
            session.flush()

            container.part_service().create_part("1k resistor", type_id=resistor_type.id)
            container.part_service().create_part("2k resistor", type_id=resistor_type.id)
            container.part_service().create_part("100uF capacitor", type_id=capacitor_type.id)
            session.commit()

            # Test filtering by resistor type
            response = client.get(f"/api/parts?type_id={resistor_type.id}")
            assert response.status_code == 200
            response_data = json.loads(response.data)
            assert len(response_data) == 2

            # Test filtering by capacitor type
            response = client.get(f"/api/parts?type_id={capacitor_type.id}")
            assert response.status_code == 200
            response_data = json.loads(response.data)
            assert len(response_data) == 1

            # Test with non-existent type
            response = client.get("/api/parts?type_id=999")
            assert response.status_code == 200
            response_data = json.loads(response.data)
            assert len(response_data) == 0

    def test_get_part_existing(self, app: Flask, client: FlaskClient, session: Session, container: ServiceContainer):
        """Test getting an existing part."""
        with app.app_context():
            # Create a part with type
            type_obj = container.type_service().create_type("Resistor")
            part = container.part_service().create_part(
                "1k resistor",
                manufacturer_code="RES-1K",
                type_id=type_obj.id
            )
            session.commit()

            response = client.get(f"/api/parts/{part.key}")

            assert response.status_code == 200
            response_data = json.loads(response.data)

            assert response_data["key"] == part.key
            assert response_data["description"] == "1k resistor"
            assert response_data["manufacturer_code"] == "RES-1K"
            assert response_data["type"] is not None
            assert response_data["type"]["name"] == "Resistor"

    def test_get_part_nonexistent(self, app: Flask, client: FlaskClient):
        """Test getting a non-existent part."""
        response = client.get("/api/parts/AAAA")
        assert response.status_code == 404

    def test_update_part(self, app: Flask, client: FlaskClient, session: Session, container: ServiceContainer):
        """Test updating a part."""
        with app.app_context():
            part = container.part_service().create_part("Original description")
            session.commit()

            update_data = {
                "description": "Updated description",
                "manufacturer_code": "NEW-CODE",
                "tags": ["updated"]
            }

            response = client.put(f"/api/parts/{part.key}", json=update_data)

            assert response.status_code == 200
            response_data = json.loads(response.data)

            assert response_data["description"] == "Updated description"
            assert response_data["manufacturer_code"] == "NEW-CODE"
            assert response_data["tags"] == ["updated"]

    def test_update_part_nonexistent(self, app: Flask, client: FlaskClient):
        """Test updating a non-existent part."""
        update_data = {"description": "New description"}

        response = client.put("/api/parts/AAAA", json=update_data)
        assert response.status_code == 404

    def test_delete_part_zero_quantity(self, app: Flask, client: FlaskClient, session: Session, container: ServiceContainer):
        """Test deleting a part with zero quantity."""
        with app.app_context():
            part = container.part_service().create_part("To be deleted")
            session.commit()

            response = client.delete(f"/api/parts/{part.key}")
            assert response.status_code == 204

    def test_delete_part_with_quantity(self, app: Flask, client: FlaskClient, session: Session, container: ServiceContainer):
        """Test deleting a part that has quantity."""
        with app.app_context():
            # Create part with stock
            box = container.box_service().create_box("Test Box", 10)
            part = container.part_service().create_part("Has quantity")
            session.commit()

            container.inventory_service().add_stock(part.key, box.box_no, 1, 5)
            session.commit()

            response = client.delete(f"/api/parts/{part.key}")
            assert response.status_code == 409

    def test_delete_part_nonexistent(self, app: Flask, client: FlaskClient):
        """Test deleting a non-existent part."""
        response = client.delete("/api/parts/AAAA")
        assert response.status_code == 404

    def test_get_part_locations(self, app: Flask, client: FlaskClient, session: Session, container: ServiceContainer):
        """Test getting locations for a part."""
        with app.app_context():
            # Create part with stock in multiple locations
            box = container.box_service().create_box("Test Box", 10)
            part = container.part_service().create_part("Multi-location part")
            session.commit()

            container.inventory_service().add_stock(part.key, box.box_no, 1, 5)
            container.inventory_service().add_stock(part.key, box.box_no, 3, 10)
            session.commit()

            response = client.get(f"/api/parts/{part.key}/locations")

            assert response.status_code == 200
            response_data = json.loads(response.data)

            assert len(response_data) == 2
            locations = {loc["loc_no"]: loc["qty"] for loc in response_data}
            assert locations[1] == 5
            assert locations[3] == 10

    def test_get_part_locations_nonexistent(self, app: Flask, client: FlaskClient):
        """Test getting locations for non-existent part."""
        response = client.get("/api/parts/AAAA/locations")
        assert response.status_code == 404

    def test_get_part_history(self, app: Flask, client: FlaskClient, session: Session, container: ServiceContainer):
        """Test getting quantity history for a part."""
        with app.app_context():
            # Create part and perform some stock operations
            box = container.box_service().create_box("Test Box", 10)
            part = container.part_service().create_part("History part")
            session.commit()

            # Add and remove stock to create history
            container.inventory_service().add_stock(part.key, box.box_no, 1, 10)
            container.inventory_service().remove_stock(part.key, box.box_no, 1, 3)
            session.commit()

            response = client.get(f"/api/parts/{part.key}/history")

            assert response.status_code == 200
            response_data = json.loads(response.data)

            # Should have 2 history entries
            assert len(response_data) >= 2

            # Check we have positive and negative deltas
            deltas = [entry["delta_qty"] for entry in response_data]
            assert 10 in deltas  # addition
            assert -3 in deltas  # removal

    def test_get_part_history_nonexistent(self, app: Flask, client: FlaskClient):
        """Test getting history for non-existent part."""
        response = client.get("/api/parts/AAAA/history")
        assert response.status_code == 404

    def test_create_part_with_extended_fields_only(self, app: Flask, client: FlaskClient):
        """Test creating a part with only extended fields."""
        with app.app_context():
            data = {
                "description": "DIP-8 Logic IC",
                "package": "DIP-8",
                "pin_count": 8,
                "voltage_rating": "5V",
                "mounting_type": "Through-hole",
                "series": "74HC",
                "dimensions": "9.53x6.35mm"
            }

            response = client.post("/api/parts", json=data)

            assert response.status_code == 201
            response_data = json.loads(response.data)

            assert response_data["description"] == "DIP-8 Logic IC"
            assert response_data["package"] == "DIP-8"
            assert response_data["pin_count"] == 8
            assert response_data["voltage_rating"] == "5V"
            assert response_data["mounting_type"] == "Through-hole"
            assert response_data["series"] == "74HC"
            assert response_data["dimensions"] == "9.53x6.35mm"
            # Non-extended fields should be None
            assert response_data["manufacturer_code"] is None
            assert response_data["type_id"] is None
            assert response_data["seller"] is None

    def test_update_part_extended_fields(self, app: Flask, client: FlaskClient, session: Session, container: ServiceContainer):
        """Test updating a part's extended fields via API."""
        with app.app_context():
            # Create a part first
            part = container.part_service().create_part("Basic IC")
            session.commit()

            update_data = {
                "package": "SOIC-16",
                "pin_count": 16,
                "voltage_rating": "3.3V",
                "mounting_type": "Surface Mount",
                "series": "STM32F4",
                "dimensions": "10.3x7.5mm"
            }

            response = client.put(f"/api/parts/{part.key}", json=update_data)

            assert response.status_code == 200
            response_data = json.loads(response.data)

            assert response_data["package"] == "SOIC-16"
            assert response_data["pin_count"] == 16
            assert response_data["voltage_rating"] == "3.3V"
            assert response_data["mounting_type"] == "Surface Mount"
            assert response_data["series"] == "STM32F4"
            assert response_data["dimensions"] == "10.3x7.5mm"
            # Original description should remain unchanged
            assert response_data["description"] == "Basic IC"

    def test_create_part_invalid_pin_count(self, app: Flask, client: FlaskClient):
        """Test creating a part with invalid pin count."""
        with app.app_context():
            data = {
                "description": "Invalid IC",
                "pin_count": 0  # Should be > 0
            }

            response = client.post("/api/parts", json=data)

            assert response.status_code == 400  # Validation error
            response_data = json.loads(response.data)
            assert "pin_count" in str(response_data).lower()

    def test_create_part_field_length_validation(self, app: Flask, client: FlaskClient):
        """Test field length validation for extended fields."""
        with app.app_context():
            # Test package field length (max 100 chars)
            long_package = "x" * 101
            data = {
                "description": "Test part",
                "package": long_package
            }

            response = client.post("/api/parts", json=data)

            assert response.status_code == 400  # Validation error

            # Test voltage_rating field length (max 50 chars)
            long_voltage = "x" * 51
            data = {
                "description": "Test part",
                "voltage_rating": long_voltage
            }

            response = client.post("/api/parts", json=data)

            assert response.status_code == 400  # Validation error
