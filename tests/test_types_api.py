"""Tests for types API endpoints."""

import json

from flask import Flask
from flask.testing import FlaskClient
from sqlalchemy.orm import Session

from app.services.container import ServiceContainer


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

    def test_list_types(self, app: Flask, client: FlaskClient, session: Session, container: ServiceContainer):
        """Test listing all types."""
        with app.app_context():
            # Create some types
            container.type_service().create_type("Resistor")
            container.type_service().create_type("Capacitor")
            container.type_service().create_type("Inductor")
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

    def test_get_type_existing(self, app: Flask, client: FlaskClient, session: Session, container: ServiceContainer):
        """Test getting an existing type."""
        with app.app_context():
            type_obj = container.type_service().create_type("Capacitor")
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

    def test_update_type(self, app: Flask, client: FlaskClient, session: Session, container: ServiceContainer):
        """Test updating a type."""
        with app.app_context():
            type_obj = container.type_service().create_type("Resistor")
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

    def test_update_type_invalid_data(self, app: Flask, client: FlaskClient, session: Session, container: ServiceContainer):
        """Test updating a type with invalid data."""
        with app.app_context():
            type_obj = container.type_service().create_type("Resistor")
            session.commit()

            # Empty name
            update_data = {"name": ""}

            response = client.put(f"/api/types/{type_obj.id}", json=update_data)
            assert response.status_code == 400

    def test_delete_type_unused(self, app: Flask, client: FlaskClient, session: Session, container: ServiceContainer):
        """Test deleting an unused type."""
        with app.app_context():
            type_obj = container.type_service().create_type("Temporary")
            session.commit()

            response = client.delete(f"/api/types/{type_obj.id}")
            assert response.status_code == 204

    def test_delete_type_in_use(self, app: Flask, client: FlaskClient, session: Session, container: ServiceContainer):
        """Test deleting a type that's in use by parts."""
        with app.app_context():
            # Create type and part that uses it
            type_obj = container.type_service().create_type("Resistor")
            session.flush()

            container.part_service().create_part(
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

    def test_list_types_with_stats_false(self, app: Flask, client: FlaskClient, session: Session, container: ServiceContainer):
        """Test listing types with include_stats=false returns normal response."""
        with app.app_context():
            # Create types
            container.type_service().create_type("Resistor")
            container.type_service().create_type("Capacitor")
            session.commit()

            response = client.get("/api/types?include_stats=false")

            assert response.status_code == 200
            response_data = json.loads(response.data)

            assert len(response_data) == 2
            
            # Should not have part_count field
            for type_data in response_data:
                assert "name" in type_data
                assert "id" in type_data
                assert "created_at" in type_data
                assert "updated_at" in type_data
                assert "part_count" not in type_data

    def test_list_types_with_stats_true_no_parts(self, app: Flask, client: FlaskClient, session: Session, container: ServiceContainer):
        """Test listing types with include_stats=true when no parts exist."""
        with app.app_context():
            # Create types but no parts
            resistor_type = container.type_service().create_type("Resistor")
            capacitor_type = container.type_service().create_type("Capacitor")
            session.commit()

            response = client.get("/api/types?include_stats=true")

            assert response.status_code == 200
            response_data = json.loads(response.data)

            assert len(response_data) == 2

            # Should have part_count field set to 0
            for type_data in response_data:
                assert "name" in type_data
                assert "id" in type_data
                assert "created_at" in type_data
                assert "updated_at" in type_data
                assert "part_count" in type_data
                assert type_data["part_count"] == 0

    def test_list_types_with_stats_true_with_parts(self, app: Flask, client: FlaskClient, session: Session, container: ServiceContainer):
        """Test listing types with include_stats=true when parts exist."""
        with app.app_context():
            # Create types
            resistor_type = container.type_service().create_type("Resistor")
            capacitor_type = container.type_service().create_type("Capacitor")
            inductor_type = container.type_service().create_type("Inductor")
            session.flush()

            # Create parts with different type distributions
            # 3 resistor parts
            container.part_service().create_part("1k resistor", type_id=resistor_type.id)
            container.part_service().create_part("10k resistor", type_id=resistor_type.id)
            container.part_service().create_part("100k resistor", type_id=resistor_type.id)
            
            # 1 capacitor part
            container.part_service().create_part("10uF capacitor", type_id=capacitor_type.id)
            
            # 0 inductor parts (type exists but unused)
            session.commit()

            response = client.get("/api/types?include_stats=true")

            assert response.status_code == 200
            response_data = json.loads(response.data)

            assert len(response_data) == 3

            # Create lookup by type name for easier testing
            stats_by_name = {t["name"]: t["part_count"] for t in response_data}
            
            assert stats_by_name["Resistor"] == 3
            assert stats_by_name["Capacitor"] == 1
            assert stats_by_name["Inductor"] == 0

            # Verify all required fields are present
            for type_data in response_data:
                assert "name" in type_data
                assert "id" in type_data
                assert "created_at" in type_data
                assert "updated_at" in type_data
                assert "part_count" in type_data
                assert isinstance(type_data["part_count"], int)
                assert type_data["part_count"] >= 0

    def test_list_types_default_behavior_no_stats(self, app: Flask, client: FlaskClient, session: Session, container: ServiceContainer):
        """Test that default behavior (no query param) returns normal response without stats."""
        with app.app_context():
            # Create types and parts
            resistor_type = container.type_service().create_type("Resistor")
            session.flush()
            container.part_service().create_part("1k resistor", type_id=resistor_type.id)
            session.commit()

            # No query parameter should default to no stats
            response = client.get("/api/types")

            assert response.status_code == 200
            response_data = json.loads(response.data)

            assert len(response_data) == 1
            
            # Should not have part_count field
            type_data = response_data[0]
            assert "name" in type_data
            assert "id" in type_data
            assert "created_at" in type_data
            assert "updated_at" in type_data
            assert "part_count" not in type_data

    def test_list_types_stats_case_insensitive(self, app: Flask, client: FlaskClient, session: Session, container: ServiceContainer):
        """Test that include_stats parameter is case insensitive."""
        with app.app_context():
            # Create types
            container.type_service().create_type("Resistor")
            session.commit()

            # Test various case combinations
            test_cases = ["TRUE", "True", "true", "tRuE"]
            
            for case in test_cases:
                response = client.get(f"/api/types?include_stats={case}")
                assert response.status_code == 200
                
                response_data = json.loads(response.data)
                assert len(response_data) == 1
                assert "part_count" in response_data[0]

            # Test false cases
            false_cases = ["FALSE", "False", "false", "fAlSe", "0", "no", "off"]
            
            for case in false_cases:
                response = client.get(f"/api/types?include_stats={case}")
                assert response.status_code == 200
                
                response_data = json.loads(response.data)
                assert len(response_data) == 1
                assert "part_count" not in response_data[0]
