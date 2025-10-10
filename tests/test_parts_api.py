"""Tests for parts API endpoints."""

import json
from datetime import UTC, datetime, timedelta
from unittest.mock import patch

from flask import Flask
from flask.testing import FlaskClient
from sqlalchemy.orm import Session

from app.models.shopping_list import ShoppingListStatus
from app.models.shopping_list_line import ShoppingListLine, ShoppingListLineStatus
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
            assert response_data["manufacturer"] is None
            assert response_data["product_page"] is None
            assert response_data["total_quantity"] == 0
            # Extended fields should be None by default
            assert response_data["package"] is None
            assert response_data["pin_count"] is None
            assert response_data["voltage_rating"] is None
            assert response_data["mounting_type"] is None
            assert response_data["series"] is None
            assert response_data["dimensions"] is None
            assert response_data["has_cover_attachment"] is False

    def test_create_part_full_data(self, app: Flask, client: FlaskClient, session: Session, container: ServiceContainer):
        """Test creating a part with full data."""
        with app.app_context():
            # Create type first
            type_obj = container.type_service().create_type("Resistor")

            # Create seller first
            seller = container.seller_service().create_seller("Digi-Key", "https://www.digikey.com")
            session.commit()

            data = {
                "description": "1k ohm resistor",
                "manufacturer_code": "RES-1K-5%",
                "type_id": type_obj.id,
                "tags": ["1k", "5%"],
                "manufacturer": "Vishay",
                "product_page": "https://www.vishay.com/en/resistors/",
                "seller_id": seller.id,
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
            assert response_data["manufacturer"] == "Vishay"
            assert response_data["product_page"] == "https://www.vishay.com/en/resistors/"
            assert response_data["seller"]["name"] == "Digi-Key"
            # Extended fields
            assert response_data["package"] == "0805"
            assert response_data["pin_count"] == 2
            assert response_data["voltage_rating"] == "50V"
            assert response_data["mounting_type"] == "Surface Mount"
            assert response_data["series"] == "Standard"
            assert response_data["dimensions"] == "2.0x1.25mm"
            # Check new voltage fields are None by default
            assert response_data["pin_pitch"] is None
            assert response_data["input_voltage"] is None
            assert response_data["output_voltage"] is None
            assert response_data["has_cover_attachment"] is False

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
            assert all(part["has_cover_attachment"] is False for part in response_data)

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
            assert response_data["has_cover_attachment"] is False

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
                "tags": ["updated"],
                "manufacturer": "Updated Manufacturer",
                "product_page": "https://example.com/product"
            }

            response = client.put(f"/api/parts/{part.key}", json=update_data)

            assert response.status_code == 200
            response_data = json.loads(response.data)

            assert response_data["description"] == "Updated description"
            assert response_data["manufacturer_code"] == "NEW-CODE"
            assert response_data["tags"] == ["updated"]
            assert response_data["manufacturer"] == "Updated Manufacturer"
            assert response_data["product_page"] == "https://example.com/product"
            assert response_data["has_cover_attachment"] is False

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

    def test_list_parts_includes_extended_fields(self, app: Flask, client: FlaskClient, session: Session, container: ServiceContainer):
        """Test that list parts endpoint includes extended fields in response."""
        with app.app_context():
            # Create a part with extended fields
            part_service = container.part_service()
            part = part_service.create_part(
                description="Test IC with extended fields",
                manufacturer_code="TEST123",
                package="DIP-8",
                pin_count=8,
                voltage_rating="5V",
                mounting_type="Through-hole",
                series="74HC",
                dimensions="9.53x6.35mm"
            )
            session.commit()

            # Test the list parts endpoint
            response = client.get("/api/parts")

            assert response.status_code == 200
            response_data = json.loads(response.data)

            # Find our test part in the response
            test_part = None
            for part_data in response_data:
                if part_data["key"] == part.key:
                    test_part = part_data
                    break

            assert test_part is not None, f"Part {part.key} not found in list response"

            # Verify extended fields are included and correct
            assert test_part["package"] == "DIP-8"
            assert test_part["pin_count"] == 8
            assert test_part["voltage_rating"] == "5V"
            assert test_part["mounting_type"] == "Through-hole"
            assert test_part["series"] == "74HC"
            assert test_part["dimensions"] == "9.53x6.35mm"
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

    def test_get_part_includes_extended_fields(self, app: Flask, client: FlaskClient, session: Session, container: ServiceContainer):
        """Test that get single part endpoint includes extended fields in response."""
        with app.app_context():
            # Create a part with extended fields
            part_service = container.part_service()
            part = part_service.create_part(
                description="Test IC for GET endpoint",
                manufacturer_code="TEST456",
                package="SOIC-8",
                pin_count=8,
                voltage_rating="3.3V",
                mounting_type="Surface Mount",
                series="LM324",
                dimensions="4.9x3.9mm"
            )
            session.commit()

            # Test the get part endpoint
            response = client.get(f"/api/parts/{part.key}")

            assert response.status_code == 200
            response_data = json.loads(response.data)

            # Verify extended fields are included and correct
            assert response_data["package"] == "SOIC-8"
            assert response_data["pin_count"] == 8
            assert response_data["voltage_rating"] == "3.3V"
            assert response_data["mounting_type"] == "Surface Mount"
            assert response_data["series"] == "LM324"
            assert response_data["dimensions"] == "4.9x3.9mm"

    def test_put_part_updates_extended_fields(self, app: Flask, client: FlaskClient, session: Session, container: ServiceContainer):
        """Test that PUT endpoint correctly updates extended fields."""
        with app.app_context():
            # Create a part first
            part_service = container.part_service()
            part = part_service.create_part(
                description="IC to update",
                package="DIP-14",
                pin_count=14,
                voltage_rating="5V"
            )
            session.commit()

            # Update via PUT endpoint
            update_data = {
                "package": "SOIC-14",
                "pin_count": 14,
                "voltage_rating": "3.3V-5V",
                "mounting_type": "Surface Mount",
                "series": "74HC",
                "dimensions": "8.7x3.9mm"
            }

            response = client.put(f"/api/parts/{part.key}", json=update_data)

            assert response.status_code == 200
            response_data = json.loads(response.data)

            # Verify all extended fields were updated
            assert response_data["package"] == "SOIC-14"
            assert response_data["pin_count"] == 14
            assert response_data["voltage_rating"] == "3.3V-5V"
            assert response_data["mounting_type"] == "Surface Mount"
            assert response_data["series"] == "74HC"
            assert response_data["dimensions"] == "8.7x3.9mm"

    def test_list_parts_includes_seller_link(self, app: Flask, client: FlaskClient, session: Session, container: ServiceContainer):
        """Test that list parts endpoint includes seller_link field."""
        with app.app_context():
            # Create seller first
            seller = container.seller_service().create_seller("Digi-Key", "https://www.digikey.com")

            # Create a part with seller_link
            part_service = container.part_service()
            part = part_service.create_part(
                description="Part with seller link",
                seller_id=seller.id,
                seller_link="https://www.digikey.com/product/123"
            )
            session.commit()

            response = client.get("/api/parts")

            assert response.status_code == 200
            response_data = json.loads(response.data)

            # Find our test part in the response
            test_part = None
            for part_data in response_data:
                if part_data["key"] == part.key:
                    test_part = part_data
                    break

            assert test_part is not None
            assert test_part["seller"]["name"] == "Digi-Key"
            assert test_part["seller_link"] == "https://www.digikey.com/product/123"

    def test_list_parts_with_locations_basic(self, app: Flask, client: FlaskClient, session: Session, container: ServiceContainer):
        """Test listing parts with location details."""
        with app.app_context():
            # Create seller first
            seller = container.seller_service().create_seller("Test Seller", "https://testseller.com")

            # Create test data
            box = container.box_service().create_box("Test Box", 10)
            part = container.part_service().create_part(
                description="Part with locations",
                seller_id=seller.id,
                seller_link="https://example.com/product"
            )
            session.commit()

            # Add stock in multiple locations
            container.inventory_service().add_stock(part.key, box.box_no, 1, 25)
            container.inventory_service().add_stock(part.key, box.box_no, 3, 50)
            session.commit()

            response = client.get("/api/parts/with-locations")

            assert response.status_code == 200
            response_data = json.loads(response.data)

            assert len(response_data) == 1
            part_data = response_data[0]

            # Check basic part fields
            assert part_data["key"] == part.key
            assert part_data["description"] == "Part with locations"
            assert part_data["seller"]["name"] == "Test Seller"
            assert part_data["seller_link"] == "https://example.com/product"
            assert part_data["total_quantity"] == 75
            assert part_data["has_cover_attachment"] is False

            # Check locations array
            assert "locations" in part_data
            assert len(part_data["locations"]) == 2

            # Sort locations by location number for predictable testing
            locations = sorted(part_data["locations"], key=lambda x: x["loc_no"])

            assert locations[0]["box_no"] == box.box_no
            assert locations[0]["loc_no"] == 1
            assert locations[0]["qty"] == 25

            assert locations[1]["box_no"] == box.box_no
            assert locations[1]["loc_no"] == 3
            assert locations[1]["qty"] == 50

    def test_list_parts_with_locations_empty_locations(self, app: Flask, client: FlaskClient, session: Session, container: ServiceContainer):
        """Test listing parts with locations when part has no stock."""
        with app.app_context():
            # Create part without any stock
            part = container.part_service().create_part("Part without stock")
            session.commit()

            response = client.get("/api/parts/with-locations")

            assert response.status_code == 200
            response_data = json.loads(response.data)

            assert len(response_data) == 1
            part_data = response_data[0]

            assert part_data["key"] == part.key
            assert part_data["total_quantity"] == 0
            assert part_data["locations"] == []
            assert part_data["has_cover_attachment"] is False

    def test_list_parts_with_locations_pagination(self, app: Flask, client: FlaskClient, session: Session, container: ServiceContainer):
        """Test listing parts with locations using pagination parameters."""
        with app.app_context():
            box = container.box_service().create_box("Test Box", 10)

            # Create multiple parts with locations
            for i in range(5):
                part = container.part_service().create_part(f"Part {i}")
                container.inventory_service().add_stock(part.key, box.box_no, i+1, 10)
            session.commit()

            # Test with limit
            response = client.get("/api/parts/with-locations?limit=3")
            assert response.status_code == 200
            response_data = json.loads(response.data)
            assert len(response_data) == 3

            # Test with offset
            response = client.get("/api/parts/with-locations?limit=2&offset=2")
            assert response.status_code == 200
            response_data = json.loads(response.data)
            assert len(response_data) == 2

    def test_list_parts_with_locations_type_filter(self, app: Flask, client: FlaskClient, session: Session, container: ServiceContainer):
        """Test listing parts with locations using type filter."""
        with app.app_context():
            # Create types and parts
            resistor_type = container.type_service().create_type("Resistor")
            capacitor_type = container.type_service().create_type("Capacitor")
            box = container.box_service().create_box("Test Box", 10)
            session.flush()

            # Create parts with different types
            resistor_part = container.part_service().create_part("1k resistor", type_id=resistor_type.id)
            capacitor_part = container.part_service().create_part("100uF capacitor", type_id=capacitor_type.id)

            container.inventory_service().add_stock(resistor_part.key, box.box_no, 1, 10)
            container.inventory_service().add_stock(capacitor_part.key, box.box_no, 2, 20)
            session.commit()

            # Test filtering by resistor type
            response = client.get(f"/api/parts/with-locations?type_id={resistor_type.id}")
            assert response.status_code == 200
            response_data = json.loads(response.data)
            assert len(response_data) == 1
            assert response_data[0]["type_id"] == resistor_type.id

            # Test filtering by capacitor type
            response = client.get(f"/api/parts/with-locations?type_id={capacitor_type.id}")
            assert response.status_code == 200
            response_data = json.loads(response.data)
            assert len(response_data) == 1
            assert response_data[0]["type_id"] == capacitor_type.id

    def test_list_parts_with_locations_multiple_boxes(self, app: Flask, client: FlaskClient, session: Session, container: ServiceContainer):
        """Test listing parts with locations across multiple boxes."""
        with app.app_context():
            # Create multiple boxes
            box1 = container.box_service().create_box("Box 1", 10)
            box2 = container.box_service().create_box("Box 2", 10)

            part = container.part_service().create_part("Multi-box part")
            session.commit()

            # Add stock in different boxes
            container.inventory_service().add_stock(part.key, box1.box_no, 1, 15)
            container.inventory_service().add_stock(part.key, box2.box_no, 1, 35)
            session.commit()

            response = client.get("/api/parts/with-locations")

            assert response.status_code == 200
            response_data = json.loads(response.data)

            assert len(response_data) == 1
            part_data = response_data[0]

            assert part_data["total_quantity"] == 50
            assert len(part_data["locations"]) == 2

            # Sort by box number for predictable testing
            locations = sorted(part_data["locations"], key=lambda x: x["box_no"])

            assert locations[0]["box_no"] == box1.box_no
            assert locations[0]["qty"] == 15

            assert locations[1]["box_no"] == box2.box_no
            assert locations[1]["qty"] == 35

    def test_list_parts_with_locations_includes_all_fields(self, app: Flask, client: FlaskClient, session: Session, container: ServiceContainer):
        """Test that parts with locations includes all extended fields."""
        with app.app_context():
            # Create seller first
            seller = container.seller_service().create_seller("Test Seller", "https://testseller.com")

            type_obj = container.type_service().create_type("Resistor")
            box = container.box_service().create_box("Test Box", 10)

            part = container.part_service().create_part(
                description="Full featured part",
                manufacturer_code="TEST-123",
                type_id=type_obj.id,
                tags=["test", "resistor"],
                manufacturer="Test Manufacturer",
                seller_id=seller.id,
                seller_link="https://example.com/product",
                package="0805",
                pin_count=2,
                voltage_rating="50V",
                mounting_type="Surface Mount",
                series="Standard",
                dimensions="2.0x1.25mm"
            )

            container.inventory_service().add_stock(part.key, box.box_no, 1, 100)
            session.commit()

            response = client.get("/api/parts/with-locations")

            assert response.status_code == 200
            response_data = json.loads(response.data)

            assert len(response_data) == 1
            part_data = response_data[0]

            # Check all fields are present
            assert part_data["key"] == part.key
            assert part_data["description"] == "Full featured part"
            assert part_data["manufacturer_code"] == "TEST-123"
            assert part_data["type_id"] == type_obj.id
            assert part_data["tags"] == ["test", "resistor"]
            assert part_data["manufacturer"] == "Test Manufacturer"
            assert part_data["seller"]["name"] == "Test Seller"
            assert part_data["seller_link"] == "https://example.com/product"
            assert part_data["package"] == "0805"
            assert part_data["pin_count"] == 2
            assert part_data["voltage_rating"] == "50V"
            assert part_data["mounting_type"] == "Surface Mount"
            assert part_data["series"] == "Standard"
            assert part_data["dimensions"] == "2.0x1.25mm"
            assert part_data["total_quantity"] == 100
            assert len(part_data["locations"]) == 1

    def test_list_parts_with_locations_no_results(self, app: Flask, client: FlaskClient, session: Session, container: ServiceContainer):
        """Test listing parts with locations when no parts exist."""
        with app.app_context():
            response = client.get("/api/parts/with-locations")

            assert response.status_code == 200
            response_data = json.loads(response.data)

            assert response_data == []

    def test_list_parts_with_locations_invalid_type_filter(self, app: Flask, client: FlaskClient):
        """Test listing parts with locations using invalid type filter."""
        with app.app_context():
            response = client.get("/api/parts/with-locations?type_id=999")

            assert response.status_code == 200
            response_data = json.loads(response.data)

            assert response_data == []

    def test_create_part_with_new_voltage_fields(self, app: Flask, client: FlaskClient, session: Session, container: ServiceContainer):
        """Test creating a part with pin_pitch, input_voltage, and output_voltage fields."""
        with app.app_context():
            # Create type first
            type_obj = container.type_service().create_type("Power Module")

            # Create seller first
            seller = container.seller_service().create_seller("Digi-Key", "https://www.digikey.com")
            session.commit()

            data = {
                "description": "LM2596 step-down module",
                "manufacturer_code": "LM2596",
                "type_id": type_obj.id,
                "tags": ["step-down", "adjustable"],
                "manufacturer": "Texas Instruments",
                "seller_id": seller.id,
                "seller_link": "https://digikey.com/product/lm2596",
                "package": "TO-220",
                "pin_count": 5,
                "pin_pitch": "2.54mm",
                "voltage_rating": "40V",
                "input_voltage": "4.5V-40V",
                "output_voltage": "1.2V-35V",
                "mounting_type": "Through-hole",
                "series": "LM2596",
                "dimensions": "10.16x13.21mm"
            }

            response = client.post("/api/parts", json=data)

            assert response.status_code == 201
            response_data = json.loads(response.data)

            assert response_data["description"] == "LM2596 step-down module"
            assert response_data["manufacturer_code"] == "LM2596"
            assert response_data["type_id"] == type_obj.id
            assert response_data["tags"] == ["step-down", "adjustable"]
            assert response_data["manufacturer"] == "Texas Instruments"
            assert response_data["seller"]["name"] == "Digi-Key"
            assert response_data["seller_link"] == "https://digikey.com/product/lm2596"
            # Extended fields
            assert response_data["package"] == "TO-220"
            assert response_data["pin_count"] == 5
            assert response_data["pin_pitch"] == "2.54mm"
            assert response_data["voltage_rating"] == "40V"
            assert response_data["input_voltage"] == "4.5V-40V"
            assert response_data["output_voltage"] == "1.2V-35V"
            assert response_data["mounting_type"] == "Through-hole"
            assert response_data["series"] == "LM2596"
            assert response_data["dimensions"] == "10.16x13.21mm"

    def test_update_part_with_new_voltage_fields(self, app: Flask, client: FlaskClient, session: Session, container: ServiceContainer):
        """Test updating a part with pin_pitch, input_voltage, and output_voltage fields."""
        with app.app_context():
            # Create a basic part first
            part = container.part_service().create_part("Basic power supply")
            session.commit()

            update_data = {
                "description": "Updated power supply module",
                "pin_pitch": "1.27mm",
                "input_voltage": "5V-12V",
                "output_voltage": "3.3V",
                "voltage_rating": "15V"
            }

            response = client.put(f"/api/parts/{part.key}", json=update_data)

            assert response.status_code == 200
            response_data = json.loads(response.data)

            assert response_data["description"] == "Updated power supply module"
            assert response_data["pin_pitch"] == "1.27mm"
            assert response_data["input_voltage"] == "5V-12V"
            assert response_data["output_voltage"] == "3.3V"
            assert response_data["voltage_rating"] == "15V"

    def test_list_parts_includes_new_voltage_fields(self, app: Flask, client: FlaskClient, session: Session, container: ServiceContainer):
        """Test that list parts endpoint includes pin_pitch, input_voltage, and output_voltage fields."""
        with app.app_context():
            # Create a part with the new fields
            part_service = container.part_service()
            part = part_service.create_part(
                description="Test IC with new fields",
                pin_pitch="0.65mm",
                input_voltage="3.0V-3.6V",
                output_voltage="1.8V"
            )
            session.commit()

            response = client.get("/api/parts")

            assert response.status_code == 200
            response_data = json.loads(response.data)

            # Find our test part in the response
            test_part = None
            for part_data in response_data:
                if part_data["key"] == part.key:
                    test_part = part_data
                    break

            assert test_part is not None, f"Part {part.key} not found in list response"

            # Verify new fields are included and correct
            assert test_part["pin_pitch"] == "0.65mm"
            assert test_part["input_voltage"] == "3.0V-3.6V"
            assert test_part["output_voltage"] == "1.8V"

    def test_list_parts_with_locations_includes_new_voltage_fields(self, app: Flask, client: FlaskClient, session: Session, container: ServiceContainer):
        """Test that parts with locations includes the new voltage fields."""
        with app.app_context():
            box = container.box_service().create_box("Test Box", 10)

            part = container.part_service().create_part(
                description="Power IC with locations",
                pin_pitch="0.5mm",
                input_voltage="4.75V-5.25V",
                output_voltage="3.3V",
                package="QFN-20"
            )

            container.inventory_service().add_stock(part.key, box.box_no, 1, 50)
            session.commit()

            response = client.get("/api/parts/with-locations")

            assert response.status_code == 200
            response_data = json.loads(response.data)

            assert len(response_data) == 1
            part_data = response_data[0]

            # Check all new fields are present and correct
            assert part_data["pin_pitch"] == "0.5mm"
            assert part_data["input_voltage"] == "4.75V-5.25V"
            assert part_data["output_voltage"] == "3.3V"
            assert part_data["package"] == "QFN-20"
            assert part_data["total_quantity"] == 50
            assert len(part_data["locations"]) == 1

    def test_update_part_pin_count_null_value_not_cleared(self, app: Flask, client: FlaskClient, session: Session, container: ServiceContainer):
        """Test that sending null for pin_count clears existing value in database."""
        with app.app_context():
            # Create a part with pin_count initially set
            part = container.part_service().create_part(
                description="IC with pin count",
                pin_count=16
            )
            session.commit()

            # Verify initial pin_count is set
            response = client.get(f"/api/parts/{part.key}")
            assert response.status_code == 200
            initial_data = json.loads(response.data)
            assert initial_data["pin_count"] == 16

            # Update part with null pin_count (this should clear the field but currently doesn't)
            update_data = {
                "description": "Updated IC description",
                "pin_count": None
            }

            response = client.put(f"/api/parts/{part.key}", json=update_data)
            assert response.status_code == 200

            # Get the part again to check if pin_count was cleared
            response = client.get(f"/api/parts/{part.key}")
            assert response.status_code == 200
            updated_data = json.loads(response.data)

            # Verify that pin_count was cleared as expected
            assert updated_data["description"] == "Updated IC description"
            assert updated_data["pin_count"] is None  # Now works correctly - null value clears the field

    def test_update_part_nullable_fields_can_be_cleared(self, app: Flask, client: FlaskClient, session: Session, container: ServiceContainer):
        """Test that all nullable fields can be cleared by sending null values."""
        with app.app_context():
            # Create seller first
            seller = container.seller_service().create_seller("Test Seller", "https://testseller.com")

            # Create a part with all optional fields set
            part = container.part_service().create_part(
                description="Test part with all fields",
                manufacturer_code="TEST123",
                manufacturer="Test Manufacturer",
                product_page="https://example.com/product",
                seller_id=seller.id,
                seller_link="https://seller.com/item",
                package="DIP-8",
                pin_count=8,
                pin_pitch="2.54mm",
                voltage_rating="5V",
                input_voltage="4.5V-5.5V",
                output_voltage="3.3V",
                mounting_type="THT",
                series="Test Series",
                dimensions="10x8x5mm",
                tags=["test", "component"]
            )
            session.commit()

            # Clear all nullable fields by sending null values
            update_data = {
                "description": "Updated description",  # Required field - keep it
                "manufacturer_code": None,
                "manufacturer": None,
                "product_page": None,
                "seller_id": None,
                "seller_link": None,
                "package": None,
                "pin_count": None,
                "pin_pitch": None,
                "voltage_rating": None,
                "input_voltage": None,
                "output_voltage": None,
                "mounting_type": None,
                "series": None,
                "dimensions": None,
                "tags": None
            }

            response = client.put(f"/api/parts/{part.key}", json=update_data)
            assert response.status_code == 200

            # Verify all nullable fields were cleared
            response = client.get(f"/api/parts/{part.key}")
            assert response.status_code == 200
            updated_data = json.loads(response.data)

            assert updated_data["description"] == "Updated description"
            assert updated_data["manufacturer_code"] is None
            assert updated_data["manufacturer"] is None
            assert updated_data["product_page"] is None
            assert updated_data["seller"] is None
            assert updated_data["seller_link"] is None
            assert updated_data["package"] is None
            assert updated_data["pin_count"] is None
            assert updated_data["pin_pitch"] is None
            assert updated_data["voltage_rating"] is None
            assert updated_data["input_voltage"] is None
            assert updated_data["output_voltage"] is None
            assert updated_data["mounting_type"] is None
            assert updated_data["series"] is None
            assert updated_data["dimensions"] is None
            assert updated_data["tags"] is None

    def test_update_part_multiple_fields_partial_null(self, app: Flask, client: FlaskClient, session: Session, container: ServiceContainer):
        """Test that multiple fields can be cleared in a single update while keeping others."""
        with app.app_context():
            # Create a part with some fields set
            part = container.part_service().create_part(
                description="Test part",
                manufacturer="Original Manufacturer",
                pin_count=16,
                voltage_rating="5V",
                package="QFP-16"
            )
            session.commit()

            # Clear some fields while updating others
            update_data = {
                "manufacturer": None,  # Clear this
                "pin_count": 24,       # Update this
                "voltage_rating": None,  # Clear this
                "package": "QFP-24"    # Update this
                # Note: not setting description to null since it's a required field
            }

            response = client.put(f"/api/parts/{part.key}", json=update_data)
            assert response.status_code == 200

            # Verify selective clearing and updating worked
            response = client.get(f"/api/parts/{part.key}")
            assert response.status_code == 200
            updated_data = json.loads(response.data)

            assert updated_data["manufacturer"] is None  # Cleared
            assert updated_data["pin_count"] == 24       # Updated
            assert updated_data["voltage_rating"] is None  # Cleared
            assert updated_data["package"] == "QFP-24"  # Updated
            assert updated_data["has_cover_attachment"] is False

    @patch('app.services.document_service.magic.from_buffer', return_value='image/png')
    @patch('app.services.s3_service.S3Service.upload_file', return_value=True)
    @patch('app.services.s3_service.S3Service.generate_s3_key', return_value="parts/COVER/attachments/test.png")
    def test_part_cover_attachment_indicator(self, mock_generate_key, mock_upload, mock_magic, app: Flask, client: FlaskClient, session: Session, container: ServiceContainer, sample_image_file):
        """Ensure part responses report cover attachment availability consistently."""
        with app.app_context():
            part = container.part_service().create_part("Part needing cover flag")
            session.commit()

            # Initial detail response should report no cover
            detail_response = client.get(f"/api/parts/{part.key}")
            assert detail_response.status_code == 200
            detail_data = json.loads(detail_response.data)
            assert detail_data["has_cover_attachment"] is False

            # Create an image attachment which becomes the cover
            document_service = container.document_service()
            sample_image_file.seek(0)
            document_service.create_file_attachment(
                part_key=part.key,
                title="Cover image",
                file_data=sample_image_file,
                filename="cover.png"
            )
            session.commit()

            # Detail endpoint should now reflect the cover assignment
            updated_detail = client.get(f"/api/parts/{part.key}")
            assert updated_detail.status_code == 200
            updated_detail_data = json.loads(updated_detail.data)
            assert updated_detail_data["has_cover_attachment"] is True

            # List endpoints should surface the flag as well
            parts_list = client.get("/api/parts")
            assert parts_list.status_code == 200
            list_data = json.loads(parts_list.data)
            assert any(
                item["key"] == part.key and item["has_cover_attachment"] is True
                for item in list_data
            )

            parts_with_locations = client.get("/api/parts/with-locations")
            assert parts_with_locations.status_code == 200
            list_with_locations = json.loads(parts_with_locations.data)
            assert any(
                item["key"] == part.key and item["has_cover_attachment"] is True
                for item in list_with_locations
            )

    def test_get_part_shopping_list_memberships(self, app: Flask, client: FlaskClient, session: Session, container: ServiceContainer):
        """Shopping list membership endpoint returns active memberships for a part."""
        with app.app_context():
            part_service = container.part_service()
            shopping_list_service = container.shopping_list_service()
            shopping_list_line_service = container.shopping_list_line_service()
            seller_service = container.seller_service()

            part = part_service.create_part("Mixer IC")
            other_part = part_service.create_part("Bypass capacitors")
            concept_list = shopping_list_service.create_list("Concept build")
            ready_list = shopping_list_service.create_list("Ready build")
            done_list = shopping_list_service.create_list("Finished build")
            seller = seller_service.create_seller(
                "Component Hub",
                "https://component.example.com",
            )

            concept_line = shopping_list_line_service.add_line(
                concept_list.id,
                part_id=part.id,
                needed=3,
                seller_id=seller.id,
                note="Try alternate vendor if stock is low",
            )
            ready_line = shopping_list_line_service.add_line(
                ready_list.id,
                part_id=part.id,
                needed=1,
            )
            shopping_list_line_service.add_line(
                concept_list.id,
                part_id=other_part.id,
                needed=5,
            )
            done_line = shopping_list_line_service.add_line(
                done_list.id,
                part_id=part.id,
                needed=2,
            )

            shopping_list_service.set_list_status(ready_list.id, ShoppingListStatus.READY)
            shopping_list_service.set_list_status(done_list.id, ShoppingListStatus.READY)
            shopping_list_service.set_list_status(done_list.id, ShoppingListStatus.DONE)

            stored_done_line = session.get(ShoppingListLine, done_line.id)
            assert stored_done_line is not None
            stored_done_line.status = ShoppingListLineStatus.DONE

            now = datetime.now(UTC)
            session.get(ShoppingListLine, ready_line.id).updated_at = now
            session.get(ShoppingListLine, concept_line.id).updated_at = now - timedelta(minutes=15)
            session.flush()
            session.commit()

            response = client.get(f"/api/parts/{part.key}/shopping-list-memberships")

            assert response.status_code == 200
            data = json.loads(response.data)
            assert [entry["line_id"] for entry in data] == [ready_line.id, concept_line.id]
            assert data[0]["shopping_list_status"] == ShoppingListStatus.READY.value
            assert data[1]["note"] == "Try alternate vendor if stock is low"
            assert data[1]["seller"]["id"] == seller.id

    def test_bulk_part_membership_query_success(self, app: Flask, client: FlaskClient, session: Session, container: ServiceContainer):
        """Bulk membership query returns data ordered by requested keys."""
        with app.app_context():
            part_service = container.part_service()
            shopping_list_service = container.shopping_list_service()
            shopping_list_line_service = container.shopping_list_line_service()
            seller_service = container.seller_service()

            primary_part = part_service.create_part("Primary lookup")
            empty_part = part_service.create_part("No memberships")

            concept_list = shopping_list_service.create_list("Concept lookup")
            ready_list = shopping_list_service.create_list("Ready lookup")
            seller = seller_service.create_seller("Lookup Seller", "https://lookup.example.com")

            concept_line = shopping_list_line_service.add_line(
                concept_list.id,
                part_id=primary_part.id,
                needed=2,
                seller_id=seller.id,
                note="Confirm stock levels",
            )
            ready_line = shopping_list_line_service.add_line(
                ready_list.id,
                part_id=primary_part.id,
                needed=4,
            )

            shopping_list_service.set_list_status(ready_list.id, ShoppingListStatus.READY)

            now = datetime.now(UTC)
            session.get(ShoppingListLine, ready_line.id).updated_at = now
            session.get(ShoppingListLine, concept_line.id).updated_at = now - timedelta(minutes=15)
            session.flush()
            session.commit()

            response = client.post(
                "/api/parts/shopping-list-memberships/query",
                json={"part_keys": [primary_part.key, empty_part.key]},
            )

            assert response.status_code == 200
            data = json.loads(response.data)

            assert data["memberships"][0]["part_key"] == primary_part.key
            assert [
                entry["line_id"] for entry in data["memberships"][0]["memberships"]
            ] == [ready_line.id, concept_line.id]
            assert data["memberships"][0]["memberships"][1]["seller"]["id"] == seller.id

            assert data["memberships"][1]["part_key"] == empty_part.key
            assert data["memberships"][1]["memberships"] == []

    def test_bulk_part_membership_query_include_done(self, app: Flask, client: FlaskClient, session: Session, container: ServiceContainer):
        """Done memberships can be included on demand in bulk responses."""
        with app.app_context():
            part_service = container.part_service()
            shopping_list_service = container.shopping_list_service()
            shopping_list_line_service = container.shopping_list_line_service()

            tracked_part = part_service.create_part("Include done")
            concept_list = shopping_list_service.create_list("Concept stage")
            ready_list = shopping_list_service.create_list("Ready stage")
            done_list = shopping_list_service.create_list("Done stage")

            concept_line = shopping_list_line_service.add_line(
                concept_list.id,
                part_id=tracked_part.id,
                needed=3,
            )
            ready_line = shopping_list_line_service.add_line(
                ready_list.id,
                part_id=tracked_part.id,
                needed=2,
            )
            done_line = shopping_list_line_service.add_line(
                done_list.id,
                part_id=tracked_part.id,
                needed=5,
            )

            shopping_list_service.set_list_status(ready_list.id, ShoppingListStatus.READY)
            shopping_list_service.set_list_status(done_list.id, ShoppingListStatus.READY)
            shopping_list_service.set_list_status(done_list.id, ShoppingListStatus.DONE)

            stored_done_line = session.get(ShoppingListLine, done_line.id)
            assert stored_done_line is not None
            stored_done_line.status = ShoppingListLineStatus.DONE

            now = datetime.now(UTC)
            session.get(ShoppingListLine, ready_line.id).updated_at = now
            session.get(ShoppingListLine, concept_line.id).updated_at = now - timedelta(minutes=5)
            session.get(ShoppingListLine, done_line.id).updated_at = now - timedelta(minutes=10)
            session.flush()
            session.commit()

            response = client.post(
                "/api/parts/shopping-list-memberships/query",
                json={
                    "part_keys": [tracked_part.key],
                    "include_done": True,
                },
            )

            assert response.status_code == 200
            data = json.loads(response.data)
            memberships = data["memberships"][0]["memberships"]
            assert [entry["line_id"] for entry in memberships] == [
                ready_line.id,
                concept_line.id,
                done_line.id,
            ]
            assert memberships[2]["line_status"] == ShoppingListLineStatus.DONE.value

    def test_bulk_part_membership_query_validation_errors(self, app: Flask, client: FlaskClient):
        """Bulk query should enforce payload validation rules."""
        empty_response = client.post(
            "/api/parts/shopping-list-memberships/query",
            json={"part_keys": []},
        )
        assert empty_response.status_code == 400

        duplicate_response = client.post(
            "/api/parts/shopping-list-memberships/query",
            json={"part_keys": ["ABCD", "ABCD"]},
        )
        assert duplicate_response.status_code == 400

        oversized_payload = client.post(
            "/api/parts/shopping-list-memberships/query",
            json={"part_keys": [f"K{i:03}" for i in range(101)]},
        )
        assert oversized_payload.status_code == 400

    def test_bulk_part_membership_query_unknown_key(self, app: Flask, client: FlaskClient, session: Session, container: ServiceContainer):
        """Bulk query should surface 404 when any requested key is unknown."""
        with app.app_context():
            part_service = container.part_service()
            part = part_service.create_part("Known")
            session.commit()

            unknown_key = "ZZZZ"
            if part.key == unknown_key:
                unknown_key = "YYYY"

            response = client.post(
                "/api/parts/shopping-list-memberships/query",
                json={"part_keys": [part.key, unknown_key]},
            )

            assert response.status_code == 404

    def test_post_part_shopping_list_memberships_success(self, app: Flask, client: FlaskClient, session: Session, container: ServiceContainer):
        """Posting to memberships endpoint adds a line and returns its summary."""
        with app.app_context():
            part_service = container.part_service()
            shopping_list_service = container.shopping_list_service()
            seller_service = container.seller_service()
            part = part_service.create_part("Quad comparator")
            concept_list = shopping_list_service.create_list("Comparator concept")
            seller = seller_service.create_seller("DC Parts", "https://dcparts.example.com")

            payload = {
                "shopping_list_id": concept_list.id,
                "needed": 4,
                "seller_id": seller.id,
                "note": "Reserve for control board prototypes",
            }

            response = client.post(
                f"/api/parts/{part.key}/shopping-list-memberships",
                json=payload,
            )

            assert response.status_code == 201
            data = json.loads(response.data)
            assert data["shopping_list_id"] == concept_list.id
            assert data["needed"] == 4
            assert data["ordered"] == 0
            assert data["seller"]["id"] == seller.id
            assert data["note"] == "Reserve for control board prototypes"

            memberships = shopping_list_service.list_part_memberships(part.id)
            assert any(line.id == data["line_id"] for line in memberships)

    def test_post_part_shopping_list_memberships_duplicate(self, app: Flask, client: FlaskClient, session: Session, container: ServiceContainer):
        """Posting the same payload twice should surface the duplicate guard."""
        with app.app_context():
            part_service = container.part_service()
            shopping_list_service = container.shopping_list_service()
            seller_service = container.seller_service()

            part = part_service.create_part("Duplicate guard component")
            concept_list = shopping_list_service.create_list("Duplicate guard list")
            seller = seller_service.create_seller(
                "Guard Seller",
                "https://guard.example.com",
            )

            payload = {
                "shopping_list_id": concept_list.id,
                "needed": 2,
                "seller_id": seller.id,
                "note": "Initial request",
            }

            first_response = client.post(
                f"/api/parts/{part.key}/shopping-list-memberships",
                json=payload,
            )
            assert first_response.status_code == 201

            duplicate_response = client.post(
                f"/api/parts/{part.key}/shopping-list-memberships",
                json=payload,
            )

            assert duplicate_response.status_code == 409
            duplicate_data = json.loads(duplicate_response.data)
            assert duplicate_data["error"] == (
                "Cannot add part to shopping list because this part is already on the list; "
                "edit the existing line instead"
            )
            assert duplicate_data["details"]["message"] == "The requested operation cannot be performed"

    def test_post_part_shopping_list_memberships_requires_concept_list(self, app: Flask, client: FlaskClient, session: Session, container: ServiceContainer):
        """Non-concept lists should be rejected by the memberships endpoint."""
        with app.app_context():
            part_service = container.part_service()
            shopping_list_service = container.shopping_list_service()
            shopping_list_line_service = container.shopping_list_line_service()
            part = part_service.create_part("Microcontroller")
            ready_list = shopping_list_service.create_list("MCU ready list")
            filler_part = part_service.create_part("Support resistor")
            shopping_list_line_service.add_line(
                ready_list.id,
                part_id=filler_part.id,
                needed=1,
            )
            shopping_list_service.set_list_status(ready_list.id, ShoppingListStatus.READY)

            payload = {"shopping_list_id": ready_list.id, "needed": 3}

            response = client.post(
                f"/api/parts/{part.key}/shopping-list-memberships",
                json=payload,
            )

            assert response.status_code == 409

    def test_part_shopping_list_memberships_part_not_found(self, client: FlaskClient):
        """Membership endpoints return 404 when the part key does not exist."""
        get_response = client.get("/api/parts/ZZZZ/shopping-list-memberships")
        assert get_response.status_code == 404

        post_response = client.post(
            "/api/parts/ZZZZ/shopping-list-memberships",
            json={"shopping_list_id": 1, "needed": 1},
        )
        assert post_response.status_code == 404
