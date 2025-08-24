"""Tests for parts API endpoints."""

import json

from flask import Flask
from flask.testing import FlaskClient
from sqlalchemy.orm import Session

from app.services.box_service import BoxService
from app.services.inventory_service import InventoryService
from app.services.part_service import PartService
from app.services.type_service import TypeService


class TestPartsAPI:
    """Test cases for parts API endpoints."""

    def test_create_part_minimal(self, app: Flask, client: FlaskClient, session: Session):
        """Test creating a part with minimal data."""
        with app.app_context():
            data = {"description": "1k ohm resistor"}

            response = client.post("/parts", json=data)

            assert response.status_code == 201
            response_data = json.loads(response.data)

            assert len(response_data["id4"]) == 4
            assert response_data["description"] == "1k ohm resistor"
            assert response_data["manufacturer_code"] is None
            assert response_data["total_quantity"] == 0

    def test_create_part_full_data(self, app: Flask, client: FlaskClient, session: Session):
        """Test creating a part with full data."""
        with app.app_context():
            # Create type first
            type_obj = TypeService.create_type(session, "Resistor")
            session.commit()

            data = {
                "description": "1k ohm resistor",
                "manufacturer_code": "RES-1K-5%",
                "type_id": type_obj.id,
                "tags": ["1k", "5%"],
                "seller": "Digi-Key",
                "seller_link": "https://digikey.com/product/123"
            }

            response = client.post("/parts", json=data)

            assert response.status_code == 201
            response_data = json.loads(response.data)

            assert response_data["description"] == "1k ohm resistor"
            assert response_data["manufacturer_code"] == "RES-1K-5%"
            assert response_data["type_id"] == type_obj.id
            assert response_data["tags"] == ["1k", "5%"]
            assert response_data["seller"] == "Digi-Key"

    def test_create_part_invalid_data(self, app: Flask, client: FlaskClient):
        """Test creating a part with invalid data."""
        # Missing required description
        data = {"manufacturer_code": "RES-1K"}

        response = client.post("/parts", json=data)
        assert response.status_code == 400

    def test_list_parts(self, app: Flask, client: FlaskClient, session: Session):
        """Test listing parts."""
        with app.app_context():
            # Create some parts
            PartService.create_part(session, "Part 1")
            PartService.create_part(session, "Part 2")
            session.commit()

            response = client.get("/parts")

            assert response.status_code == 200
            response_data = json.loads(response.data)

            assert len(response_data) == 2
            assert all("id4" in part for part in response_data)
            assert all("description" in part for part in response_data)

    def test_list_parts_with_pagination(self, app: Flask, client: FlaskClient, session: Session):
        """Test listing parts with pagination parameters."""
        with app.app_context():
            # Create multiple parts
            for i in range(5):
                PartService.create_part(session, f"Part {i}")
            session.commit()

            # Test with limit
            response = client.get("/parts?limit=3")
            assert response.status_code == 200
            response_data = json.loads(response.data)
            assert len(response_data) == 3

            # Test with offset
            response = client.get("/parts?limit=2&offset=2")
            assert response.status_code == 200
            response_data = json.loads(response.data)
            assert len(response_data) == 2

    def test_list_parts_with_type_filter(self, app: Flask, client: FlaskClient, session: Session):
        """Test listing parts with type filter parameter."""
        with app.app_context():
            # Create types and parts
            resistor_type = TypeService.create_type(session, "Resistor")
            capacitor_type = TypeService.create_type(session, "Capacitor")
            session.flush()

            PartService.create_part(session, "1k resistor", type_id=resistor_type.id)
            PartService.create_part(session, "2k resistor", type_id=resistor_type.id)
            PartService.create_part(session, "100uF capacitor", type_id=capacitor_type.id)
            session.commit()

            # Test filtering by resistor type
            response = client.get(f"/parts?type_id={resistor_type.id}")
            assert response.status_code == 200
            response_data = json.loads(response.data)
            assert len(response_data) == 2

            # Test filtering by capacitor type
            response = client.get(f"/parts?type_id={capacitor_type.id}")
            assert response.status_code == 200
            response_data = json.loads(response.data)
            assert len(response_data) == 1

            # Test with non-existent type
            response = client.get("/parts?type_id=999")
            assert response.status_code == 200
            response_data = json.loads(response.data)
            assert len(response_data) == 0

    def test_get_part_existing(self, app: Flask, client: FlaskClient, session: Session):
        """Test getting an existing part."""
        with app.app_context():
            # Create a part with type
            type_obj = TypeService.create_type(session, "Resistor")
            part = PartService.create_part(
                session,
                "1k resistor",
                manufacturer_code="RES-1K",
                type_id=type_obj.id
            )
            session.commit()

            response = client.get(f"/parts/{part.id4}")

            assert response.status_code == 200
            response_data = json.loads(response.data)

            assert response_data["id4"] == part.id4
            assert response_data["description"] == "1k resistor"
            assert response_data["manufacturer_code"] == "RES-1K"
            assert response_data["type"] is not None
            assert response_data["type"]["name"] == "Resistor"

    def test_get_part_nonexistent(self, app: Flask, client: FlaskClient):
        """Test getting a non-existent part."""
        response = client.get("/parts/AAAA")
        assert response.status_code == 404

    def test_update_part(self, app: Flask, client: FlaskClient, session: Session):
        """Test updating a part."""
        with app.app_context():
            part = PartService.create_part(session, "Original description")
            session.commit()

            update_data = {
                "description": "Updated description",
                "manufacturer_code": "NEW-CODE",
                "tags": ["updated"]
            }

            response = client.put(f"/parts/{part.id4}", json=update_data)

            assert response.status_code == 200
            response_data = json.loads(response.data)

            assert response_data["description"] == "Updated description"
            assert response_data["manufacturer_code"] == "NEW-CODE"
            assert response_data["tags"] == ["updated"]

    def test_update_part_nonexistent(self, app: Flask, client: FlaskClient):
        """Test updating a non-existent part."""
        update_data = {"description": "New description"}

        response = client.put("/parts/AAAA", json=update_data)
        assert response.status_code == 404

    def test_delete_part_zero_quantity(self, app: Flask, client: FlaskClient, session: Session):
        """Test deleting a part with zero quantity."""
        with app.app_context():
            part = PartService.create_part(session, "To be deleted")
            session.commit()

            response = client.delete(f"/parts/{part.id4}")
            assert response.status_code == 204

    def test_delete_part_with_quantity(self, app: Flask, client: FlaskClient, session: Session):
        """Test deleting a part that has quantity."""
        with app.app_context():
            # Create part with stock
            box = BoxService.create_box(session, "Test Box", 10)
            part = PartService.create_part(session, "Has quantity")
            session.commit()

            InventoryService.add_stock(session, part.id4, box.box_no, 1, 5)
            session.commit()

            response = client.delete(f"/parts/{part.id4}")
            assert response.status_code == 409

    def test_delete_part_nonexistent(self, app: Flask, client: FlaskClient):
        """Test deleting a non-existent part."""
        response = client.delete("/parts/AAAA")
        assert response.status_code == 404

    def test_get_part_locations(self, app: Flask, client: FlaskClient, session: Session):
        """Test getting locations for a part."""
        with app.app_context():
            # Create part with stock in multiple locations
            box = BoxService.create_box(session, "Test Box", 10)
            part = PartService.create_part(session, "Multi-location part")
            session.commit()

            InventoryService.add_stock(session, part.id4, box.box_no, 1, 5)
            InventoryService.add_stock(session, part.id4, box.box_no, 3, 10)
            session.commit()

            response = client.get(f"/parts/{part.id4}/locations")

            assert response.status_code == 200
            response_data = json.loads(response.data)

            assert len(response_data) == 2
            locations = {loc["loc_no"]: loc["qty"] for loc in response_data}
            assert locations[1] == 5
            assert locations[3] == 10

    def test_get_part_locations_nonexistent(self, app: Flask, client: FlaskClient):
        """Test getting locations for non-existent part."""
        response = client.get("/parts/AAAA/locations")
        assert response.status_code == 404

    def test_get_part_history(self, app: Flask, client: FlaskClient, session: Session):
        """Test getting quantity history for a part."""
        with app.app_context():
            # Create part and perform some stock operations
            box = BoxService.create_box(session, "Test Box", 10)
            part = PartService.create_part(session, "History part")
            session.commit()

            # Add and remove stock to create history
            InventoryService.add_stock(session, part.id4, box.box_no, 1, 10)
            InventoryService.remove_stock(session, part.id4, box.box_no, 1, 3)
            session.commit()

            response = client.get(f"/parts/{part.id4}/history")

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
        response = client.get("/parts/AAAA/history")
        assert response.status_code == 404
