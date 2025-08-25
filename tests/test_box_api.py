"""Tests for box API endpoints."""

import json

from flask.testing import FlaskClient
from sqlalchemy.orm import Session

from app.models.box import Box
from app.services.box_service import BoxService


class TestBoxAPI:
    """Test cases for Box API endpoints."""

    def test_create_box_valid(self, client: FlaskClient, session: Session):
        """Test creating a box with valid data."""
        data = {"description": "Storage Box A", "capacity": 12}
        response = client.post(
            "/api/boxes", data=json.dumps(data), content_type="application/json"
        )

        assert response.status_code == 201
        response_data = json.loads(response.data)

        assert response_data["box_no"] == 1
        assert response_data["description"] == "Storage Box A"
        assert response_data["capacity"] == 12
        assert len(response_data["locations"]) == 12

        # Verify in database
        box = session.get(Box, 1)
        assert box is not None
        assert box.description == "Storage Box A"

    def test_create_box_invalid_capacity_zero(self, client: FlaskClient):
        """Test creating a box with zero capacity fails validation."""
        data = {"description": "Invalid Box", "capacity": 0}
        response = client.post(
            "/api/boxes", data=json.dumps(data), content_type="application/json"
        )

        assert response.status_code == 400

    def test_create_box_invalid_capacity_negative(self, client: FlaskClient):
        """Test creating a box with negative capacity fails validation."""
        data = {"description": "Invalid Box", "capacity": -5}
        response = client.post(
            "/api/boxes", data=json.dumps(data), content_type="application/json"
        )

        assert response.status_code == 400

    def test_create_box_missing_description(self, client: FlaskClient):
        """Test creating a box without description fails validation."""
        data = {"capacity": 10}
        response = client.post(
            "/api/boxes", data=json.dumps(data), content_type="application/json"
        )

        assert response.status_code == 400

    def test_create_box_empty_description(self, client: FlaskClient):
        """Test creating a box with empty description fails validation."""
        data = {"description": "", "capacity": 10}
        response = client.post(
            "/api/boxes", data=json.dumps(data), content_type="application/json"
        )

        assert response.status_code == 400

    def test_create_box_missing_capacity(self, client: FlaskClient):
        """Test creating a box without capacity fails validation."""
        data = {"description": "Test Box"}
        response = client.post(
            "/api/boxes", data=json.dumps(data), content_type="application/json"
        )

        assert response.status_code == 400

    def test_get_all_boxes_empty(self, client: FlaskClient):
        """Test getting all boxes when none exist."""
        response = client.get("/api/boxes")

        assert response.status_code == 200
        response_data = json.loads(response.data)

        assert isinstance(response_data, list)
        assert len(response_data) == 0

    def test_get_all_boxes_multiple(self, client: FlaskClient, session: Session):
        """Test getting all boxes when multiple exist."""
        # Create test boxes
        BoxService.create_box(session, "Box 1", 5)
        BoxService.create_box(session, "Box 2", 10)
        BoxService.create_box(session, "Box 3", 3)

        response = client.get("/api/boxes")

        assert response.status_code == 200
        response_data = json.loads(response.data)

        assert len(response_data) == 3

        # Verify ordering and content
        assert response_data[0]["box_no"] == 1
        assert response_data[0]["description"] == "Box 1"
        assert response_data[0]["capacity"] == 5

        assert response_data[1]["box_no"] == 2
        assert response_data[1]["description"] == "Box 2"
        assert response_data[1]["capacity"] == 10

        assert response_data[2]["box_no"] == 3
        assert response_data[2]["description"] == "Box 3"
        assert response_data[2]["capacity"] == 3

    def test_get_box_details_existing(self, client: FlaskClient, session: Session):
        """Test getting details of an existing box."""
        box = BoxService.create_box(session, "Test Box", 6)
        session.commit()
        box_no = box.box_no

        response = client.get(f"/api/boxes/{box_no}")

        assert response.status_code == 200
        response_data = json.loads(response.data)

        assert response_data["box_no"] == box_no
        assert response_data["description"] == "Test Box"
        assert response_data["capacity"] == 6
        assert len(response_data["locations"]) == 6

        # Verify location structure
        for i, location in enumerate(response_data["locations"], 1):
            assert location["box_no"] == box_no
            assert location["loc_no"] == i

    def test_get_box_details_nonexistent(self, client: FlaskClient):
        """Test getting details of a non-existent box."""
        response = client.get("/api/boxes/999")

        assert response.status_code == 404
        response_data = json.loads(response.data)
        assert "error" in response_data

    def test_update_box_existing(self, client: FlaskClient, session: Session):
        """Test updating an existing box."""
        box = BoxService.create_box(session, "Original Box", 5)
        session.commit()
        box_no = box.box_no

        data = {"description": "Updated Box", "capacity": 8}
        response = client.put(
            f"/api/boxes/{box_no}", data=json.dumps(data), content_type="application/json"
        )

        assert response.status_code == 200
        response_data = json.loads(response.data)

        assert response_data["box_no"] == box_no
        assert response_data["description"] == "Updated Box"
        assert response_data["capacity"] == 8
        assert len(response_data["locations"]) == 8

    def test_update_box_decrease_capacity(self, client: FlaskClient, session: Session):
        """Test updating a box with decreased capacity."""
        box = BoxService.create_box(session, "Test Box", 10)
        session.commit()
        box_no = box.box_no

        data = {"description": "Smaller Box", "capacity": 6}
        response = client.put(
            f"/api/boxes/{box_no}", data=json.dumps(data), content_type="application/json"
        )

        assert response.status_code == 200
        response_data = json.loads(response.data)

        assert response_data["capacity"] == 6
        assert len(response_data["locations"]) == 6

    def test_update_box_nonexistent(self, client: FlaskClient):
        """Test updating a non-existent box."""
        data = {"description": "Updated Box", "capacity": 8}
        response = client.put(
            "/api/boxes/999", data=json.dumps(data), content_type="application/json"
        )

        assert response.status_code == 404
        response_data = json.loads(response.data)
        assert "error" in response_data

    def test_update_box_invalid_data(self, client: FlaskClient, session: Session):
        """Test updating a box with invalid data."""
        box = BoxService.create_box(session, "Test Box", 5)
        box_no = box.box_no

        data = {
            "description": "",  # Empty description
            "capacity": -1,  # Negative capacity
        }
        response = client.put(
            f"/api/boxes/{box_no}", data=json.dumps(data), content_type="application/json"
        )

        assert response.status_code == 400

    def test_delete_box_existing(self, client: FlaskClient, session: Session):
        """Test deleting an existing box."""
        box = BoxService.create_box(session, "Test Box", 5)
        session.commit()
        box_no = box.box_no
        box_id = box.id

        # Verify box exists
        assert session.get(Box, box_id) is not None

        response = client.delete(f"/api/boxes/{box_no}")

        assert response.status_code == 204

        # Verify box is deleted - need to refresh session
        session.expire_all()
        assert session.get(Box, box_id) is None

    def test_delete_box_nonexistent(self, client: FlaskClient):
        """Test deleting a non-existent box."""
        response = client.delete("/api/boxes/999")

        assert response.status_code == 404
        response_data = json.loads(response.data)
        assert "error" in response_data

    def test_get_box_locations_existing(self, client: FlaskClient, session: Session):
        """Test getting locations for an existing box."""
        box = BoxService.create_box(session, "Test Box", 4)
        session.commit()
        box_no = box.box_no

        response = client.get(f"/api/boxes/{box_no}/locations")

        assert response.status_code == 200
        response_data = json.loads(response.data)

        assert len(response_data) == 4
        for i, location in enumerate(response_data, 1):
            assert location["box_no"] == box_no
            assert location["loc_no"] == i

    def test_get_box_locations_nonexistent(self, client: FlaskClient):
        """Test getting locations for a non-existent box."""
        response = client.get("/api/boxes/999/locations")

        assert response.status_code == 404
        response_data = json.loads(response.data)
        assert "error" in response_data


    def test_api_error_handling(self, client: FlaskClient):
        """Test that API endpoints handle errors gracefully."""
        # Invalid JSON
        response = client.post(
            "/api/boxes", data="invalid json", content_type="application/json"
        )

        assert response.status_code == 400

    def test_content_type_validation(self, client: FlaskClient):
        """Test that endpoints require proper content type."""
        data = {"description": "Test Box", "capacity": 5}

        # Send without proper content type
        response = client.post("/api/boxes", data=json.dumps(data))

        # Should handle gracefully (specific behavior depends on implementation)
        assert response.status_code in [400, 415, 500]  # Various possible responses

    def test_sequential_box_numbers(self, client: FlaskClient, session: Session):
        """Test that boxes get sequential numbers when created via API."""
        # Create first box
        data1 = {"description": "Box 1", "capacity": 5}
        response1 = client.post(
            "/api/boxes", data=json.dumps(data1), content_type="application/json"
        )

        assert response1.status_code == 201
        box1_data = json.loads(response1.data)
        assert box1_data["box_no"] == 1

        # Create second box
        data2 = {"description": "Box 2", "capacity": 3}
        response2 = client.post(
            "/api/boxes", data=json.dumps(data2), content_type="application/json"
        )

        assert response2.status_code == 201
        box2_data = json.loads(response2.data)
        assert box2_data["box_no"] == 2
