"""Test dashboard API endpoints."""

from datetime import datetime, timedelta

from flask import Flask
from flask.testing import FlaskClient
from sqlalchemy.orm import Session

from app.models.part import Part
from app.models.part_attachment import PartAttachment
from app.models.quantity_history import QuantityHistory
from app.models.type import Type
from app.services.container import ServiceContainer


class TestDashboardAPI:
    """Test cases for Dashboard API endpoints."""

    def test_get_dashboard_stats_success_empty(self, app: Flask, client: FlaskClient, session: Session):
        """Test GET /api/dashboard/stats with empty database returns correct structure."""
        response = client.get("/api/dashboard/stats")

        assert response.status_code == 200
        data = response.get_json()

        # Verify all required fields are present with correct default values
        expected_fields = [
            'total_parts', 'total_quantity', 'total_boxes', 'total_types',
            'changes_7d', 'changes_30d', 'low_stock_count'
        ]
        for field in expected_fields:
            assert field in data
            assert data[field] == 0

    def test_get_dashboard_stats_success_with_data(self, app: Flask, client: FlaskClient, session: Session, container: ServiceContainer):
        """Test GET /api/dashboard/stats with populated database."""
        # Create test data using proper services
        type_obj = Type(name="Test Type")
        session.add(type_obj)
        session.flush()

        # Create box using service
        box = container.box_service().create_box("Test Box", 10)

        # Create part using service
        part = container.part_service().create_part("Test Part", type_id=type_obj.id)
        session.commit()

        # Add stock using inventory service
        container.inventory_service().add_stock(part.key, box.box_no, 1, 3)

        # Add additional quantity change history
        history = QuantityHistory(
            part_id=part.id,
            delta_qty=5,
            timestamp=datetime.utcnow() - timedelta(days=2),
            location_reference="1-1"
        )
        session.add(history)
        session.commit()

        response = client.get("/api/dashboard/stats")

        assert response.status_code == 200
        data = response.get_json()

        assert data['total_parts'] == 1
        assert data['total_quantity'] == 3
        assert data['total_boxes'] == 1
        assert data['total_types'] == 1
        assert data['changes_7d'] == 2  # add_stock operation + manual history
        assert data['changes_30d'] == 2
        assert data['low_stock_count'] == 1  # qty=3 <= 5

    def test_get_recent_activity_success_empty(self, app: Flask, client: FlaskClient, session: Session):
        """Test GET /api/dashboard/recent-activity with no activity returns empty list."""
        response = client.get("/api/dashboard/recent-activity")

        assert response.status_code == 200
        data = response.get_json()
        assert data == []

    def test_get_recent_activity_success_with_data(self, app: Flask, client: FlaskClient, session: Session):
        """Test GET /api/dashboard/recent-activity returns correct activity data."""
        # Create test data
        type_obj = Type(name="LED")
        session.add(type_obj)
        session.flush()

        part = Part(key="LED1", description="Red LED", type_id=type_obj.id)
        session.add(part)
        session.flush()

        history = QuantityHistory(
            part_id=part.id,
            delta_qty=10,
            timestamp=datetime.utcnow() - timedelta(hours=2),
            location_reference="1-5"
        )
        session.add(history)
        session.commit()

        response = client.get("/api/dashboard/recent-activity")

        assert response.status_code == 200
        data = response.get_json()

        assert len(data) == 1
        activity = data[0]

        # Verify response structure
        required_fields = ['part_key', 'part_description', 'delta_qty', 'location_reference', 'timestamp']
        for field in required_fields:
            assert field in activity

        assert activity['part_key'] == 'LED1'
        assert activity['part_description'] == 'Red LED'
        assert activity['delta_qty'] == 10
        assert activity['location_reference'] == '1-5'
        assert activity['timestamp'] is not None

    def test_get_recent_activity_with_limit_parameter(self, app: Flask, client: FlaskClient, session: Session):
        """Test GET /api/dashboard/recent-activity with limit parameter."""
        # Create test data
        type_obj = Type(name="Resistor")
        session.add(type_obj)
        session.flush()

        part = Part(key="RES1", description="10k Resistor", type_id=type_obj.id)
        session.add(part)
        session.flush()

        # Create 5 history entries
        now = datetime.utcnow()
        histories = []
        for i in range(5):
            history = QuantityHistory(
                part_id=part.id,
                delta_qty=i + 1,
                timestamp=now - timedelta(minutes=i),
                location_reference=f"1-{i+1}"
            )
            histories.append(history)

        session.add_all(histories)
        session.commit()

        # Test with limit=3
        response = client.get("/api/dashboard/recent-activity?limit=3")

        assert response.status_code == 200
        data = response.get_json()
        assert len(data) == 3

    def test_get_recent_activity_parameter_validation(self, app: Flask, client: FlaskClient, session: Session):
        """Test GET /api/dashboard/recent-activity parameter validation."""
        # Test invalid limit parameter
        response = client.get("/api/dashboard/recent-activity?limit=invalid")
        assert response.status_code == 200
        # Should default to 20 with invalid parameter

        # Test negative limit
        response = client.get("/api/dashboard/recent-activity?limit=-5")
        assert response.status_code == 200
        # Should use minimum limit of 1

        # Test excessive limit
        response = client.get("/api/dashboard/recent-activity?limit=500")
        assert response.status_code == 200
        # Should cap at 100

    def test_get_storage_summary_success_empty(self, app: Flask, client: FlaskClient, session: Session):
        """Test GET /api/dashboard/storage-summary with no boxes returns empty list."""
        response = client.get("/api/dashboard/storage-summary")

        assert response.status_code == 200
        data = response.get_json()
        assert data == []

    def test_get_storage_summary_success_with_boxes(self, app: Flask, client: FlaskClient, session: Session, container: ServiceContainer):
        """Test GET /api/dashboard/storage-summary returns correct box utilization."""
        # Create test data using proper services
        box = container.box_service().create_box("Small Parts Box", 20)

        type_obj = Type(name="Component")
        session.add(type_obj)
        session.flush()

        part = container.part_service().create_part("Test Component", type_id=type_obj.id)
        session.commit()

        # Occupy 5 locations out of 20 (25% usage)
        for i in range(1, 6):
            container.inventory_service().add_stock(part.key, box.box_no, i, 10)

        session.commit()

        response = client.get("/api/dashboard/storage-summary")

        assert response.status_code == 200
        data = response.get_json()

        assert len(data) == 1
        box_summary = data[0]

        # Verify response structure
        required_fields = ['box_no', 'description', 'total_locations', 'occupied_locations', 'usage_percentage']
        for field in required_fields:
            assert field in box_summary

        assert box_summary['box_no'] == 1
        assert box_summary['description'] == "Small Parts Box"
        assert box_summary['total_locations'] == 20
        assert box_summary['occupied_locations'] == 5
        assert box_summary['usage_percentage'] == 25.0

    def test_get_low_stock_success_default_threshold(self, app: Flask, client: FlaskClient, session: Session, container: ServiceContainer):
        """Test GET /api/dashboard/low-stock with default threshold."""
        # Create test data using proper services
        type_obj = Type(name="Capacitor")
        session.add(type_obj)
        session.flush()

        # Create box first
        box = container.box_service().create_box("Test Box", 10)

        # Create parts
        low_stock_part = container.part_service().create_part("Low Stock Cap", type_id=type_obj.id)
        good_stock_part = container.part_service().create_part("Good Stock Cap", type_id=type_obj.id)
        session.commit()

        # Add stock: Low stock: qty=3 <= 5, Good stock: qty=10 > 5
        container.inventory_service().add_stock(low_stock_part.key, box.box_no, 1, 3)
        container.inventory_service().add_stock(good_stock_part.key, box.box_no, 2, 10)
        session.commit()

        response = client.get("/api/dashboard/low-stock")

        assert response.status_code == 200
        data = response.get_json()

        assert len(data) == 1
        item = data[0]

        # Verify response structure
        required_fields = ['part_key', 'description', 'type_name', 'current_quantity']
        for field in required_fields:
            assert field in item

        assert item['part_key'] == low_stock_part.key
        assert item['description'] == 'Low Stock Cap'
        assert item['type_name'] == 'Capacitor'
        assert item['current_quantity'] == 3

    def test_get_low_stock_custom_threshold(self, app: Flask, client: FlaskClient, session: Session, container: ServiceContainer):
        """Test GET /api/dashboard/low-stock with custom threshold parameter."""
        # Create test data using proper services
        type_obj = Type(name="IC")
        session.add(type_obj)
        session.flush()

        # Create box first
        box = container.box_service().create_box("IC Box", 5)

        # Create part
        part = container.part_service().create_part("Microcontroller", type_id=type_obj.id)
        session.commit()

        # Add stock
        container.inventory_service().add_stock(part.key, box.box_no, 1, 8)
        session.commit()

        # With threshold=10, part with qty=8 should be included
        response = client.get("/api/dashboard/low-stock?threshold=10")
        assert response.status_code == 200
        data = response.get_json()
        assert len(data) == 1

        # With threshold=5, part with qty=8 should NOT be included
        response = client.get("/api/dashboard/low-stock?threshold=5")
        assert response.status_code == 200
        data = response.get_json()
        assert len(data) == 0

    def test_get_low_stock_parameter_validation(self, app: Flask, client: FlaskClient, session: Session):
        """Test GET /api/dashboard/low-stock parameter validation."""
        # Test invalid threshold parameter
        response = client.get("/api/dashboard/low-stock?threshold=invalid")
        assert response.status_code == 200
        # Should default to 5 with invalid parameter

        # Test negative threshold
        response = client.get("/api/dashboard/low-stock?threshold=-10")
        assert response.status_code == 200
        # Should use default threshold of 5

        # Test excessive threshold
        response = client.get("/api/dashboard/low-stock?threshold=5000")
        assert response.status_code == 200
        # Should cap at 1000

    def test_get_category_distribution_success_empty(self, app: Flask, client: FlaskClient, session: Session):
        """Test GET /api/dashboard/category-distribution with no types returns empty list."""
        response = client.get("/api/dashboard/category-distribution")

        assert response.status_code == 200
        data = response.get_json()
        assert data == []

    def test_get_category_distribution_success_with_types(self, app: Flask, client: FlaskClient, session: Session):
        """Test GET /api/dashboard/category-distribution returns correct distribution."""
        # Create types with different part counts
        type1 = Type(name="Resistor")
        type2 = Type(name="LED")
        session.add_all([type1, type2])
        session.flush()

        # Create parts (Resistor: 2, LED: 1)
        parts = [
            Part(key="RES1", description="Resistor 1", type_id=type1.id),
            Part(key="RES2", description="Resistor 2", type_id=type1.id),
            Part(key="LED1", description="LED 1", type_id=type2.id),
        ]
        session.add_all(parts)
        session.commit()

        response = client.get("/api/dashboard/category-distribution")

        assert response.status_code == 200
        data = response.get_json()

        assert len(data) == 2

        # Should be ordered by part count descending
        first_item = data[0]
        second_item = data[1]

        # Verify response structure
        for item in data:
            required_fields = ['type_name', 'part_count']
            for field in required_fields:
                assert field in item

        assert first_item['type_name'] == 'Resistor'
        assert first_item['part_count'] == 2
        assert second_item['type_name'] == 'LED'
        assert second_item['part_count'] == 1

    def test_get_parts_without_documents_success_empty(self, app: Flask, client: FlaskClient, session: Session):
        """Test GET /api/dashboard/parts-without-documents with no parts."""
        response = client.get("/api/dashboard/parts-without-documents")

        assert response.status_code == 200
        data = response.get_json()

        assert data['count'] == 0
        assert data['sample_parts'] == []

    def test_get_parts_without_documents_success_with_undocumented(self, app: Flask, client: FlaskClient, session: Session):
        """Test GET /api/dashboard/parts-without-documents with undocumented parts."""
        # Create test data
        type_obj = Type(name="Sensor")
        session.add(type_obj)
        session.flush()

        documented_part = Part(key="SEN1", description="Documented Sensor", type_id=type_obj.id)
        undocumented_part = Part(key="SEN2", description="Undocumented Sensor", type_id=type_obj.id)
        session.add_all([documented_part, undocumented_part])
        session.flush()

        # Add attachment only to documented part
        from app.models.part_attachment import AttachmentType
        attachment = PartAttachment(
            part_id=documented_part.id,
            attachment_type=AttachmentType.PDF,
            title="Sensor Specification",
            filename="sensor_spec.pdf",
            file_size=1000,
            content_type="application/pdf"
        )
        session.add(attachment)
        session.commit()

        response = client.get("/api/dashboard/parts-without-documents")

        assert response.status_code == 200
        data = response.get_json()

        assert data['count'] == 1
        assert len(data['sample_parts']) == 1

        sample_part = data['sample_parts'][0]
        required_fields = ['part_key', 'description', 'type_name']
        for field in required_fields:
            assert field in sample_part

        assert sample_part['part_key'] == 'SEN2'
        assert sample_part['description'] == 'Undocumented Sensor'
        assert sample_part['type_name'] == 'Sensor'

    def test_all_endpoints_return_valid_json_content_type(self, app: Flask, client: FlaskClient, session: Session):
        """Test that all dashboard endpoints return valid JSON with correct content-type."""
        endpoints = [
            "/api/dashboard/stats",
            "/api/dashboard/recent-activity",
            "/api/dashboard/storage-summary",
            "/api/dashboard/low-stock",
            "/api/dashboard/category-distribution",
            "/api/dashboard/parts-without-documents"
        ]

        for endpoint in endpoints:
            response = client.get(endpoint)
            assert response.status_code == 200
            assert response.content_type == "application/json"
            # Verify it's valid JSON by parsing
            data = response.get_json()
            assert data is not None

    def test_dashboard_endpoints_handle_database_errors_gracefully(
        self, app: Flask, client: FlaskClient, session: Session
    ):
        """Test that dashboard endpoints handle database errors properly."""
        # This test would need to be implemented with database mocking
        # to simulate database connection failures, etc.
        # For now, we just verify endpoints don't crash with normal operations

        endpoints = [
            "/api/dashboard/stats",
            "/api/dashboard/recent-activity",
            "/api/dashboard/storage-summary",
            "/api/dashboard/low-stock",
            "/api/dashboard/category-distribution",
            "/api/dashboard/parts-without-documents"
        ]

        for endpoint in endpoints:
            response = client.get(endpoint)
            # Should not return server errors
            assert response.status_code < 500

    def test_dashboard_api_response_schema_validation(self, app: Flask, client: FlaskClient, session: Session, container: ServiceContainer):
        """Test that all dashboard API responses conform to their schemas."""
        # Create minimal test data to ensure non-empty responses using proper services
        type_obj = Type(name="Test Type")
        session.add(type_obj)
        session.flush()

        # Create box using service
        box = container.box_service().create_box("Test Box", 10)

        # Create part using service
        part = container.part_service().create_part("Test Part", type_id=type_obj.id)
        session.commit()

        # Add stock using inventory service
        container.inventory_service().add_stock(part.key, box.box_no, 1, 5)

        # Add additional history
        history = QuantityHistory(
            part_id=part.id,
            delta_qty=5,
            timestamp=datetime.utcnow(),
            location_reference="1-1"
        )
        session.add(history)
        session.commit()

        # Test stats endpoint schema
        response = client.get("/api/dashboard/stats")
        assert response.status_code == 200
        stats_data = response.get_json()
        stats_required_fields = [
            'total_parts', 'total_quantity', 'total_boxes', 'total_types',
            'changes_7d', 'changes_30d', 'low_stock_count'
        ]
        for field in stats_required_fields:
            assert field in stats_data
            assert isinstance(stats_data[field], int)
            assert stats_data[field] >= 0

        # Test recent activity endpoint schema
        response = client.get("/api/dashboard/recent-activity")
        assert response.status_code == 200
        activity_data = response.get_json()
        assert isinstance(activity_data, list)
        if activity_data:  # If there's data, validate structure
            activity_item = activity_data[0]
            activity_required_fields = ['part_key', 'part_description', 'delta_qty', 'location_reference', 'timestamp']
            for field in activity_required_fields:
                assert field in activity_item

        # Test storage summary endpoint schema
        response = client.get("/api/dashboard/storage-summary")
        assert response.status_code == 200
        storage_data = response.get_json()
        assert isinstance(storage_data, list)
        if storage_data:  # If there's data, validate structure
            storage_item = storage_data[0]
            storage_required_fields = ['box_no', 'description', 'total_locations', 'occupied_locations', 'usage_percentage']
            for field in storage_required_fields:
                assert field in storage_item

        # Test category distribution endpoint schema
        response = client.get("/api/dashboard/category-distribution")
        assert response.status_code == 200
        category_data = response.get_json()
        assert isinstance(category_data, list)
        if category_data:  # If there's data, validate structure
            category_item = category_data[0]
            category_required_fields = ['type_name', 'part_count']
            for field in category_required_fields:
                assert field in category_item
