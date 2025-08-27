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
            f"/api/boxes/{box_no}",
            data=json.dumps(data),
            content_type="application/json",
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
            f"/api/boxes/{box_no}",
            data=json.dumps(data),
            content_type="application/json",
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
            f"/api/boxes/{box_no}",
            data=json.dumps(data),
            content_type="application/json",
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

    def test_delete_box_with_parts_fails(self, client: FlaskClient, session: Session):
        """Test that deleting a box with parts returns a 400 error."""
        from app.services.inventory_service import InventoryService

        # Create box
        box = BoxService.create_box(session, "Test Box", 5)
        session.commit()

        # Add a part to the box
        InventoryService.add_stock(session, "TEST", box.box_no, 1, 10)
        session.commit()

        # Attempt to delete the box via API
        response = client.delete(f"/api/boxes/{box.box_no}")

        # Should return 409 with proper error message now that we've fixed the Spectree validation
        assert response.status_code == 409
        response_data = json.loads(response.data)
        assert "error" in response_data
        assert "details" in response_data
        assert f"Cannot delete box {box.box_no}" in response_data["error"]
        assert (
            "it contains parts that must be moved or removed first"
            in response_data["error"]
        )
        assert "message" in response_data["details"]
        assert (
            "The requested operation cannot be performed"
            in response_data["details"]["message"]
        )

        # Verify box still exists
        verify_response = client.get(f"/api/boxes/{box.box_no}")
        assert verify_response.status_code == 200

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

    def test_get_box_locations_with_parts_empty_box(
        self, client: FlaskClient, session: Session
    ):
        """Test getting locations with parts for an empty box."""
        # Create empty box
        box = BoxService.create_box(session, "Empty Box", 3)
        session.commit()

        response = client.get(f"/api/boxes/{box.box_no}/locations")

        assert response.status_code == 200
        response_data = json.loads(response.data)

        assert len(response_data) == 3

        for location in response_data:
            assert location["box_no"] == box.box_no
            assert location["loc_no"] in [1, 2, 3]
            assert location["is_occupied"] is False
            assert location["part_assignments"] is None

    def test_get_box_locations_with_parts_partially_filled(
        self, client: FlaskClient, session: Session
    ):
        """Test getting locations with parts for a partially filled box."""
        from app.services.inventory_service import InventoryService

        # Create box and add parts
        box = BoxService.create_box(session, "Partial Box", 4)
        session.commit()

        # Add parts to locations 1 and 3
        InventoryService.add_stock(session, "PART", box.box_no, 1, 10)
        InventoryService.add_stock(session, "TEST", box.box_no, 3, 25)
        session.commit()

        # Update part descriptions for better test verification
        from app.models.part import Part

        part = session.query(Part).filter_by(id4="PART").first()
        if part:
            part.description = "Test Part Description"
            part.manufacturer_code = "PART-001"

        test_part = session.query(Part).filter_by(id4="TEST").first()
        if test_part:
            test_part.description = "Test Component"
            test_part.manufacturer_code = None
        session.commit()

        response = client.get(f"/api/boxes/{box.box_no}/locations")

        assert response.status_code == 200
        response_data = json.loads(response.data)

        assert len(response_data) == 4

        # Find location 1 (occupied)
        loc1 = next(loc for loc in response_data if loc["loc_no"] == 1)
        assert loc1["is_occupied"] is True
        assert len(loc1["part_assignments"]) == 1
        assignment1 = loc1["part_assignments"][0]
        assert assignment1["id4"] == "PART"
        assert assignment1["qty"] == 10

        # Find location 2 (empty)
        loc2 = next(loc for loc in response_data if loc["loc_no"] == 2)
        assert loc2["is_occupied"] is False
        assert loc2["part_assignments"] is None

        # Find location 3 (occupied)
        loc3 = next(loc for loc in response_data if loc["loc_no"] == 3)
        assert loc3["is_occupied"] is True
        assert len(loc3["part_assignments"]) == 1
        assignment3 = loc3["part_assignments"][0]
        assert assignment3["id4"] == "TEST"
        assert assignment3["qty"] == 25

    def test_get_box_locations_basic_structure(
        self, client: FlaskClient, session: Session
    ):
        """Test the basic structure of the enhanced endpoint without relying on InventoryService."""
        # Create simple box
        box = BoxService.create_box(session, "Test Box", 2)
        session.commit()

        response = client.get(f"/api/boxes/{box.box_no}/locations")

        assert response.status_code == 200
        response_data = json.loads(response.data)

        assert len(response_data) == 2

        for location in response_data:
            assert "box_no" in location
            assert "loc_no" in location
            assert "is_occupied" in location
            assert "part_assignments" in location
            assert location["is_occupied"] is False
            assert location["part_assignments"] is None

    def test_get_box_locations_with_parts_include_parts_false(
        self, client: FlaskClient, session: Session
    ):
        """Test getting locations with include_parts=false returns basic location data."""
        from app.services.inventory_service import InventoryService

        # Create box and add parts
        box = BoxService.create_box(session, "Test Box", 3)
        session.commit()

        # Add part to location 1
        InventoryService.add_stock(session, "COMP", box.box_no, 1, 15)
        session.commit()

        response = client.get(f"/api/boxes/{box.box_no}/locations?include_parts=false")

        assert response.status_code == 200
        response_data = json.loads(response.data)

        assert len(response_data) == 3

        # Should return enhanced schema but with part data excluded
        for location in response_data:
            assert "box_no" in location
            assert "loc_no" in location
            # Should have enhanced fields but show empty/false values
            assert "is_occupied" in location
            assert "part_assignments" in location
            assert location["is_occupied"] is False
            assert location["part_assignments"] is None

    def test_get_box_locations_with_parts_include_parts_true_explicit(
        self, client: FlaskClient, session: Session
    ):
        """Test getting locations with explicit include_parts=true."""
        # Create empty box
        box = BoxService.create_box(session, "Test Box", 2)
        session.commit()

        response = client.get(f"/api/boxes/{box.box_no}/locations?include_parts=true")

        assert response.status_code == 200
        response_data = json.loads(response.data)

        assert len(response_data) == 2

        for location in response_data:
            assert "is_occupied" in location
            assert "part_assignments" in location
            assert location["is_occupied"] is False
            assert location["part_assignments"] is None

    def test_get_box_locations_with_parts_ordering(
        self, client: FlaskClient, session: Session
    ):
        """Test that locations are returned in proper order."""
        from app.services.inventory_service import InventoryService

        box = BoxService.create_box(session, "Order Test Box", 5)
        session.commit()

        # Add parts in non-sequential order
        InventoryService.add_stock(session, "COMP", box.box_no, 4, 10)
        InventoryService.add_stock(session, "PART", box.box_no, 2, 20)
        session.commit()

        response = client.get(f"/api/boxes/{box.box_no}/locations")

        assert response.status_code == 200
        response_data = json.loads(response.data)

        # Verify ordering by loc_no
        location_numbers = [loc["loc_no"] for loc in response_data]
        assert location_numbers == [1, 2, 3, 4, 5]

        # Verify occupation status
        occupied_locations = [
            loc["loc_no"] for loc in response_data if loc["is_occupied"]
        ]
        assert sorted(occupied_locations) == [2, 4]

    def test_get_box_locations_with_parts_nonexistent_box(self, client: FlaskClient):
        """Test getting locations for a non-existent box returns 404."""
        response = client.get("/api/boxes/999/locations")

        assert response.status_code == 404
        response_data = json.loads(response.data)
        assert "error" in response_data
        assert "Box 999 was not found" in response_data["error"]

    def test_get_box_locations_with_parts_data_consistency(
        self, client: FlaskClient, session: Session
    ):
        """Test that location data is consistent with usage statistics."""
        from app.services.inventory_service import InventoryService

        box = BoxService.create_box(session, "Consistency Box", 6)
        session.commit()

        # Add parts to multiple locations
        InventoryService.add_stock(session, "COMP", box.box_no, 1, 100)
        InventoryService.add_stock(session, "RESI", box.box_no, 3, 50)
        InventoryService.add_stock(session, "CAPA", box.box_no, 5, 25)
        session.commit()

        # Get location data and usage stats
        locations_response = client.get(f"/api/boxes/{box.box_no}/locations")
        usage_response = client.get(f"/api/boxes/{box.box_no}/usage")

        assert locations_response.status_code == 200
        assert usage_response.status_code == 200

        locations_data = json.loads(locations_response.data)
        usage_data = json.loads(usage_response.data)

        # Count occupied locations from API response
        occupied_count = sum(1 for loc in locations_data if loc["is_occupied"])

        # Should match usage statistics
        assert occupied_count == usage_data["occupied_locations"]
        assert occupied_count == 3
        assert usage_data["available_locations"] == 3
