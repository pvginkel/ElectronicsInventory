"""Tests for types API endpoints."""

import json

from flask import Flask
from flask.testing import FlaskClient
from sqlalchemy.orm import Session

from app.services.part_service import PartService
from app.services.type_service import TypeService


class TestTypesAPI:
    """Test cases for types API endpoints."""

    def test_create_type(self, app: Flask, client: FlaskClient):
        """Test creating a new type."""
        data = {"name": "Resistor"}

        response = client.post("/api/types", json=data)

        assert response.status_code == 201
        response_data = json.loads(response.data)

        assert response_data["name"] == "Resistor"
        assert "id" in response_data
        assert "created_at" in response_data

    def test_create_type_invalid_data(self, app: Flask, client: FlaskClient):
        """Test creating a type with invalid data."""
        # Missing required name
        data = {}

        response = client.post("/api/types", json=data)
        assert response.status_code == 400

    def test_create_type_empty_name(self, app: Flask, client: FlaskClient):
        """Test creating a type with empty name."""
        data = {"name": ""}

        response = client.post("/api/types", json=data)
        assert response.status_code == 400

    def test_list_types(self, app: Flask, client: FlaskClient, session: Session):
        """Test listing all types."""
        with app.app_context():
            # Create some types
            TypeService.create_type(session, "Resistor")
            TypeService.create_type(session, "Capacitor")
            TypeService.create_type(session, "Inductor")
            session.commit()

            response = client.get("/api/types")

            assert response.status_code == 200
            response_data = json.loads(response.data)

            assert len(response_data) == 3

            # Should be sorted by name
            type_names = [t["name"] for t in response_data]
            assert type_names == sorted(type_names)

    def test_list_types_empty(self, app: Flask, client: FlaskClient):
        """Test listing types when none exist."""
        response = client.get("/api/types")

        assert response.status_code == 200
        response_data = json.loads(response.data)
        assert response_data == []

    def test_get_type_existing(self, app: Flask, client: FlaskClient, session: Session):
        """Test getting an existing type."""
        with app.app_context():
            type_obj = TypeService.create_type(session, "Capacitor")
            session.commit()

            response = client.get(f"/api/types/{type_obj.id}")

            assert response.status_code == 200
            response_data = json.loads(response.data)

            assert response_data["id"] == type_obj.id
            assert response_data["name"] == "Capacitor"

    def test_get_type_nonexistent(self, app: Flask, client: FlaskClient):
        """Test getting a non-existent type."""
        response = client.get("/api/types/999")
        assert response.status_code == 404

    def test_update_type(self, app: Flask, client: FlaskClient, session: Session):
        """Test updating a type."""
        with app.app_context():
            type_obj = TypeService.create_type(session, "Resistor")
            session.commit()

            update_data = {"name": "Fixed Resistor"}

            response = client.put(f"/api/types/{type_obj.id}", json=update_data)

            assert response.status_code == 200
            response_data = json.loads(response.data)

            assert response_data["name"] == "Fixed Resistor"
            assert response_data["id"] == type_obj.id

    def test_update_type_nonexistent(self, app: Flask, client: FlaskClient):
        """Test updating a non-existent type."""
        update_data = {"name": "New Name"}

        response = client.put("/api/types/999", json=update_data)
        assert response.status_code == 404

    def test_update_type_invalid_data(self, app: Flask, client: FlaskClient, session: Session):
        """Test updating a type with invalid data."""
        with app.app_context():
            type_obj = TypeService.create_type(session, "Resistor")
            session.commit()

            # Empty name
            update_data = {"name": ""}

            response = client.put(f"/api/types/{type_obj.id}", json=update_data)
            assert response.status_code == 400

    def test_delete_type_unused(self, app: Flask, client: FlaskClient, session: Session):
        """Test deleting an unused type."""
        with app.app_context():
            type_obj = TypeService.create_type(session, "Temporary")
            session.commit()

            response = client.delete(f"/api/types/{type_obj.id}")
            assert response.status_code == 204

    def test_delete_type_in_use(self, app: Flask, client: FlaskClient, session: Session):
        """Test deleting a type that's in use by parts."""
        with app.app_context():
            # Create type and part that uses it
            type_obj = TypeService.create_type(session, "Resistor")
            session.flush()

            PartService.create_part(
                session,
                description="1k resistor",
                type_id=type_obj.id
            )
            session.commit()

            response = client.delete(f"/api/types/{type_obj.id}")
            assert response.status_code == 409

    def test_delete_type_nonexistent(self, app: Flask, client: FlaskClient):
        """Test deleting a non-existent type."""
        response = client.delete("/api/types/999")
        assert response.status_code == 404
