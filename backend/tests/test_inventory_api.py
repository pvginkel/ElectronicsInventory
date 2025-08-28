"""Tests for inventory API endpoints."""

import json

from flask import Flask
from flask.testing import FlaskClient
from sqlalchemy.orm import Session

from app.services.container import ServiceContainer


class TestInventoryAPI:
    """Test cases for inventory API endpoints."""

    def test_add_stock(self, app: Flask, client: FlaskClient, session: Session, container: ServiceContainer):
        """Test adding stock to a location."""
        with app.app_context():
            # Setup
            box = container.box_service().create_box("Test Box", 10)
            part = container.part_service().create_part("Test part")
            session.commit()

            data = {
                "box_no": box.box_no,
                "loc_no": 1,
                "qty": 5
            }

            response = client.post(f"/api/inventory/parts/{part.key}/stock", json=data)

            assert response.status_code == 201
            response_data = json.loads(response.data)

            assert response_data["key"] == part.key
            assert response_data["box_no"] == box.box_no
            assert response_data["loc_no"] == 1
            assert response_data["qty"] == 5

    def test_add_stock_nonexistent_part(self, app: Flask, client: FlaskClient):
        """Test adding stock for non-existent part."""
        data = {"box_no": 1, "loc_no": 1, "qty": 5}

        response = client.post("/api/inventory/parts/AAAA/stock", json=data)
        assert response.status_code == 404

    def test_add_stock_invalid_location(self, app: Flask, client: FlaskClient, session: Session, container: ServiceContainer):
        """Test adding stock to invalid location."""
        with app.app_context():
            part = container.part_service().create_part("Test part")
            session.commit()

            data = {"box_no": 999, "loc_no": 1, "qty": 5}

            response = client.post(f"/api/inventory/parts/{part.key}/stock", json=data)
            assert response.status_code == 404

    def test_add_stock_invalid_quantity(self, app: Flask, client: FlaskClient, session: Session, container: ServiceContainer):
        """Test adding stock with invalid quantity."""
        with app.app_context():
            box = container.box_service().create_box("Test Box", 10)
            part = container.part_service().create_part("Test part")
            session.commit()

            # Zero quantity
            data = {"box_no": box.box_no, "loc_no": 1, "qty": 0}

            response = client.post(f"/api/inventory/parts/{part.key}/stock", json=data)
            assert response.status_code == 400

    def test_remove_stock(self, app: Flask, client: FlaskClient, session: Session, container: ServiceContainer):
        """Test removing stock from a location."""
        with app.app_context():
            # Setup with stock
            box = container.box_service().create_box("Test Box", 10)
            part = container.part_service().create_part("Test part")
            session.commit()

            container.inventory_service().add_stock(part.key, box.box_no, 1, 10)
            session.commit()

            data = {"box_no": box.box_no, "loc_no": 1, "qty": 3}

            response = client.delete(f"/api/inventory/parts/{part.key}/stock", json=data)
            assert response.status_code == 204

    def test_remove_stock_nonexistent_part(self, app: Flask, client: FlaskClient):
        """Test removing stock for non-existent part."""
        data = {"box_no": 1, "loc_no": 1, "qty": 3}

        response = client.delete("/api/inventory/parts/AAAA/stock", json=data)
        assert response.status_code == 404

    def test_remove_stock_insufficient(self, app: Flask, client: FlaskClient, session: Session, container: ServiceContainer):
        """Test removing more stock than available."""
        with app.app_context():
            # Setup with limited stock
            box = container.box_service().create_box("Test Box", 10)
            part = container.part_service().create_part("Test part")
            session.commit()

            container.inventory_service().add_stock(part.key, box.box_no, 1, 3)
            session.commit()

            data = {"box_no": box.box_no, "loc_no": 1, "qty": 5}

            response = client.delete(f"/api/inventory/parts/{part.key}/stock", json=data)
            assert response.status_code == 409

    def test_remove_stock_nonexistent_location(self, app: Flask, client: FlaskClient, session: Session, container: ServiceContainer):
        """Test removing stock from location with no stock."""
        with app.app_context():
            box = container.box_service().create_box("Test Box", 10)
            part = container.part_service().create_part("Test part")
            session.commit()

            data = {"box_no": box.box_no, "loc_no": 1, "qty": 1}

            response = client.delete(f"/api/inventory/parts/{part.key}/stock", json=data)
            assert response.status_code == 404

    def test_move_stock(self, app: Flask, client: FlaskClient, session: Session, container: ServiceContainer):
        """Test moving stock between locations."""
        with app.app_context():
            # Setup with stock
            box = container.box_service().create_box("Test Box", 10)
            part = container.part_service().create_part("Test part")
            session.commit()

            container.inventory_service().add_stock(part.key, box.box_no, 1, 10)
            session.commit()

            data = {
                "from_box_no": box.box_no,
                "from_loc_no": 1,
                "to_box_no": box.box_no,
                "to_loc_no": 2,
                "qty": 3
            }

            response = client.post(f"/api/inventory/parts/{part.key}/move", json=data)
            assert response.status_code == 204

    def test_move_stock_nonexistent_part(self, app: Flask, client: FlaskClient):
        """Test moving stock for non-existent part."""
        data = {
            "from_box_no": 1,
            "from_loc_no": 1,
            "to_box_no": 1,
            "to_loc_no": 2,
            "qty": 3
        }

        response = client.post("/api/inventory/parts/AAAA/move", json=data)
        assert response.status_code == 404

    def test_move_stock_insufficient(self, app: Flask, client: FlaskClient, session: Session, container: ServiceContainer):
        """Test moving more stock than available."""
        with app.app_context():
            # Setup with limited stock
            box = container.box_service().create_box("Test Box", 10)
            part = container.part_service().create_part("Test part")
            session.commit()

            container.inventory_service().add_stock(part.key, box.box_no, 1, 3)
            session.commit()

            data = {
                "from_box_no": box.box_no,
                "from_loc_no": 1,
                "to_box_no": box.box_no,
                "to_loc_no": 2,
                "qty": 5
            }

            response = client.post(f"/api/inventory/parts/{part.key}/move", json=data)
            assert response.status_code == 409

    def test_move_stock_invalid_destination(self, app: Flask, client: FlaskClient, session: Session, container: ServiceContainer):
        """Test moving stock to invalid destination."""
        with app.app_context():
            # Setup with stock
            box = container.box_service().create_box("Test Box", 10)
            part = container.part_service().create_part("Test part")
            session.commit()

            container.inventory_service().add_stock(part.key, box.box_no, 1, 5)
            session.commit()

            data = {
                "from_box_no": box.box_no,
                "from_loc_no": 1,
                "to_box_no": 999,  # Non-existent box
                "to_loc_no": 1,
                "qty": 3
            }

            response = client.post(f"/api/inventory/parts/{part.key}/move", json=data)
            assert response.status_code == 404

    def test_get_location_suggestion(self, app: Flask, client: FlaskClient, session: Session, container: ServiceContainer):
        """Test getting location suggestions."""
        with app.app_context():
            # Create a box
            box = container.box_service().create_box("Test Box", 5)
            session.commit()

            response = client.get("/api/inventory/suggestions/1")  # Type ID 1

            assert response.status_code == 200
            response_data = json.loads(response.data)

            assert "box_no" in response_data
            assert "loc_no" in response_data
            assert response_data["box_no"] == box.box_no
            assert response_data["loc_no"] == 1

    def test_get_location_suggestion_with_occupied_locations(self, app: Flask, client: FlaskClient, session: Session, container: ServiceContainer):
        """Test location suggestion when some locations are occupied."""
        with app.app_context():
            # Setup with occupied location
            box = container.box_service().create_box("Test Box", 5)
            part = container.part_service().create_part("Test part")
            session.commit()

            # Occupy first location
            container.inventory_service().add_stock(part.key, box.box_no, 1, 5)
            session.commit()

            response = client.get("/api/inventory/suggestions/1")

            assert response.status_code == 200
            response_data = json.loads(response.data)

            # Should suggest next available location
            assert response_data["box_no"] == box.box_no
            assert response_data["loc_no"] == 2

    def test_get_location_suggestion_no_available(self, app: Flask, client: FlaskClient):
        """Test location suggestion when no locations are available."""
        # No boxes created, so no locations available
        response = client.get("/api/inventory/suggestions/1")
        assert response.status_code == 404
