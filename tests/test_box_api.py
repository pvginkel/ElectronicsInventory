"""Tests for box API endpoints."""

import json

from flask.testing import FlaskClient
from sqlalchemy.orm import Session

from app.models.box import Box
from app.services.container import ServiceContainer


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

    def test_get_all_boxes_multiple(self, client: FlaskClient, session: Session, container: ServiceContainer):
        """Test getting all boxes when multiple exist."""
        # Create test boxes
        container.box_service().create_box("Box 1", 5)
        container.box_service().create_box("Box 2", 10)
        container.box_service().create_box("Box 3", 3)

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

    def test_get_box_details_existing(self, client: FlaskClient, session: Session, container: ServiceContainer):
        """Test getting details of an existing box."""
        box = container.box_service().create_box("Test Box", 6)
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

    def test_update_box_existing(self, client: FlaskClient, session: Session, container: ServiceContainer):
        """Test updating an existing box."""
        box = container.box_service().create_box("Original Box", 5)
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

    def test_update_box_decrease_capacity(self, client: FlaskClient, session: Session, container: ServiceContainer):
        """Test updating a box with decreased capacity."""
        box = container.box_service().create_box("Test Box", 10)
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

    def test_update_box_invalid_data(self, client: FlaskClient, session: Session, container: ServiceContainer):
        """Test updating a box with invalid data."""
        box = container.box_service().create_box("Test Box", 5)
        box_no = box.box_no

        data = {
            "description": "",  # Empty description
            "capacity": -1,  # Negative capacity
        }
        response = client.put(
            f"/api/boxes/{box_no}", data=json.dumps(data), content_type="application/json"
        )

        assert response.status_code == 400

    def test_delete_box_existing(self, client: FlaskClient, session: Session, container: ServiceContainer):
        """Test deleting an existing box."""
        box = container.box_service().create_box("Test Box", 5)
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

    def test_delete_box_with_parts_fails(self, client: FlaskClient, session: Session, container: ServiceContainer):
        """Test that deleting a box with parts returns a 400 error."""
        # Create box
        box = container.box_service().create_box("Test Box", 5)
        
        # Create a part first
        part = container.part_service().create_part("Test part")
        session.commit()

        # Add the part to the box
        container.inventory_service().add_stock(part.key, box.box_no, 1, 10)
        session.commit()

        # Attempt to delete the box via API
        response = client.delete(f"/api/boxes/{box.box_no}")

        # Should return 409 with proper error message now that we've fixed the Spectree validation
        assert response.status_code == 409
        response_data = json.loads(response.data)
        assert "error" in response_data
        assert "details" in response_data
        assert f"Cannot delete box {box.box_no}" in response_data["error"]
        assert "it contains parts that must be moved or removed first" in response_data["error"]
        assert "message" in response_data["details"]
        assert "The requested operation cannot be performed" in response_data["details"]["message"]

        # Verify box still exists
        verify_response = client.get(f"/api/boxes/{box.box_no}")
        assert verify_response.status_code == 200

    def test_get_box_locations_existing(self, client: FlaskClient, session: Session, container: ServiceContainer):
        """Test getting locations for an existing box."""
        box = container.box_service().create_box("Test Box", 4)
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

    def test_get_box_locations_with_parts_false(self, client: FlaskClient, session: Session, container: ServiceContainer):
        """Test getting basic locations with include_parts=false (backward compatibility)."""
        box = container.box_service().create_box("Test Box", 3)
        session.commit()
        
        # Create parts and add them to test that they're not included when include_parts=false
        part1 = container.part_service().create_part("Resistor")
        part2 = container.part_service().create_part("Capacitor")
        session.flush()
        
        container.inventory_service().add_stock(part1.key, box.box_no, 1, 10)
        container.inventory_service().add_stock(part2.key, box.box_no, 3, 25)
        session.commit()

        response = client.get(f"/api/boxes/{box.box_no}/locations?include_parts=false")

        assert response.status_code == 200
        response_data = json.loads(response.data)

        assert len(response_data) == 3
        for i, location in enumerate(response_data, 1):
            assert location["box_no"] == box.box_no
            assert location["loc_no"] == i
            # Basic schema should not include part information
            assert "is_occupied" not in location
            assert "part_assignments" not in location

    def test_get_box_locations_with_parts_true_empty_box(self, client: FlaskClient, session: Session, container: ServiceContainer):
        """Test getting enhanced locations for empty box with include_parts=true."""
        box = container.box_service().create_box("Empty Box", 4)
        session.commit()

        response = client.get(f"/api/boxes/{box.box_no}/locations?include_parts=true")

        assert response.status_code == 200
        response_data = json.loads(response.data)

        assert len(response_data) == 4
        for i, location in enumerate(response_data, 1):
            assert location["box_no"] == box.box_no
            assert location["loc_no"] == i
            assert location["is_occupied"] == False
            assert location["part_assignments"] is None

    def test_get_box_locations_with_parts_true_with_parts(self, client: FlaskClient, session: Session, container: ServiceContainer):
        """Test getting enhanced locations with parts using include_parts=true."""
        box = container.box_service().create_box("Parts Box", 5)
        
        # Create parts with detailed information
        part1 = container.part_service().create_part(
            "1kΩ resistor, 0603 package",
            manufacturer_code="RES-0603-1K"
        )
        part2 = container.part_service().create_part(
            "100nF capacitor, ceramic",
            manufacturer_code="CAP-0603-100N"
        )
        session.commit()
        
        # Add parts to different locations
        container.inventory_service().add_stock(part1.key, box.box_no, 2, 50)
        container.inventory_service().add_stock(part2.key, box.box_no, 4, 100)
        container.inventory_service().add_stock(part1.key, box.box_no, 5, 25)  # Same part in multiple locations
        session.commit()

        response = client.get(f"/api/boxes/{box.box_no}/locations?include_parts=true")

        assert response.status_code == 200
        response_data = json.loads(response.data)

        assert len(response_data) == 5
        
        # Location 1: empty
        assert response_data[0]["box_no"] == box.box_no
        assert response_data[0]["loc_no"] == 1
        assert response_data[0]["is_occupied"] == False
        assert response_data[0]["part_assignments"] is None
        
        # Location 2: has R001
        assert response_data[1]["box_no"] == box.box_no
        assert response_data[1]["loc_no"] == 2
        assert response_data[1]["is_occupied"] == True
        assert len(response_data[1]["part_assignments"]) == 1
        part_assignment = response_data[1]["part_assignments"][0]
        assert part_assignment["key"] == part1.key
        assert part_assignment["qty"] == 50
        assert part_assignment["manufacturer_code"] == "RES-0603-1K"
        assert part_assignment["description"] == "1kΩ resistor, 0603 package"
        
        # Location 3: empty
        assert response_data[2]["loc_no"] == 3
        assert response_data[2]["is_occupied"] == False
        assert response_data[2]["part_assignments"] is None
        
        # Location 4: has C002
        assert response_data[3]["loc_no"] == 4
        assert response_data[3]["is_occupied"] == True
        assert len(response_data[3]["part_assignments"]) == 1
        part_assignment = response_data[3]["part_assignments"][0]
        assert part_assignment["key"] == part2.key
        assert part_assignment["qty"] == 100
        assert part_assignment["manufacturer_code"] == "CAP-0603-100N"
        assert part_assignment["description"] == "100nF capacitor, ceramic"
        
        # Location 5: has R001 again
        assert response_data[4]["loc_no"] == 5
        assert response_data[4]["is_occupied"] == True
        assert len(response_data[4]["part_assignments"]) == 1
        part_assignment = response_data[4]["part_assignments"][0]
        assert part_assignment["key"] == part1.key
        assert part_assignment["qty"] == 25

    def test_get_box_locations_default_include_parts_false(self, client: FlaskClient, session: Session, container: ServiceContainer):
        """Test that include_parts defaults to false for backward compatibility."""
        box = container.box_service().create_box("Default Test Box", 2)
        
        # Create and add part to verify it's not included by default
        part = container.part_service().create_part("Test part")
        session.commit()
        
        container.inventory_service().add_stock(part.key, box.box_no, 1, 5)
        session.commit()

        # Request without include_parts parameter
        response = client.get(f"/api/boxes/{box.box_no}/locations")

        assert response.status_code == 200
        response_data = json.loads(response.data)

        assert len(response_data) == 2
        for location in response_data:
            # Should use basic schema (no part information)
            assert "is_occupied" not in location
            assert "part_assignments" not in location
            assert "box_no" in location
            assert "loc_no" in location

    def test_get_box_locations_with_parts_parameter_validation(self, client: FlaskClient, session: Session, container: ServiceContainer):
        """Test various values for include_parts parameter."""
        box = container.box_service().create_box("Param Test Box", 2)
        session.commit()

        # Test case-insensitive true values
        for true_value in ["true", "TRUE", "True"]:
            response = client.get(f"/api/boxes/{box.box_no}/locations?include_parts={true_value}")
            assert response.status_code == 200
            response_data = json.loads(response.data)
            # Should use enhanced schema
            assert "is_occupied" in response_data[0]
            assert "part_assignments" in response_data[0]

        # Test case-insensitive false values
        for false_value in ["false", "FALSE", "False", "0", "no"]:
            response = client.get(f"/api/boxes/{box.box_no}/locations?include_parts={false_value}")
            assert response.status_code == 200
            response_data = json.loads(response.data)
            # Should use basic schema
            assert "is_occupied" not in response_data[0]
            assert "part_assignments" not in response_data[0]

    def test_get_box_locations_with_parts_nonexistent_box(self, client: FlaskClient):
        """Test getting enhanced locations for non-existent box."""
        response = client.get("/api/boxes/999/locations?include_parts=true")
        
        assert response.status_code == 404
        response_data = json.loads(response.data)
        assert "error" in response_data

    def test_get_box_locations_multiple_parts_same_location(self, client: FlaskClient, session: Session, container: ServiceContainer):
        """Test enhanced locations when different parts are in different locations."""
        box = container.box_service().create_box("Multi-part Location Box", 2)
        
        # Create the parts first
        part1 = container.part_service().create_part("Part 1")
        part2 = container.part_service().create_part("Part 2")
        session.commit()
        
        # Add different parts to different locations (can't have multiple parts in same location due to unique constraint)
        container.inventory_service().add_stock(part1.key, box.box_no, 1, 10)
        container.inventory_service().add_stock(part2.key, box.box_no, 2, 5)
        session.commit()

        response = client.get(f"/api/boxes/{box.box_no}/locations?include_parts=true")

        assert response.status_code == 200
        response_data = json.loads(response.data)

        # Location 1 should have part1
        location_1 = response_data[0]
        assert location_1["is_occupied"] == True
        assert len(location_1["part_assignments"]) == 1
        assert location_1["part_assignments"][0]["key"] == part1.key
        assert location_1["part_assignments"][0]["qty"] == 10
        
        # Location 2 should have part2
        location_2 = response_data[1]
        assert location_2["is_occupied"] == True
        assert len(location_2["part_assignments"]) == 1
        assert location_2["part_assignments"][0]["key"] == part2.key
        assert location_2["part_assignments"][0]["qty"] == 5


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
