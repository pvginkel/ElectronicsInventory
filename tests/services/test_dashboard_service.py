"""Test dashboard service functionality."""

from datetime import datetime, timedelta

from flask import Flask
from sqlalchemy.orm import Session

from app.models.part import Part
from app.models.part_attachment import PartAttachment
from app.models.quantity_history import QuantityHistory
from app.models.type import Type
from app.services.container import ServiceContainer


class TestDashboardService:
    """Test cases for DashboardService functionality."""

    def test_get_dashboard_stats_empty_database(
        self, app: Flask, session: Session, container: ServiceContainer
    ):
        """Test get_dashboard_stats with empty database returns zeros."""
        service = container.dashboard_service()

        stats = service.get_dashboard_stats()

        assert stats == {
            'total_parts': 0,
            'total_quantity': 0,
            'total_boxes': 0,
            'total_types': 0,
            'changes_7d': 0,
            'changes_30d': 0,
            'low_stock_count': 0
        }

    def test_get_dashboard_stats_with_data(
        self, app: Flask, session: Session, container: ServiceContainer
    ):
        """Test get_dashboard_stats with realistic data."""
        with app.app_context():
            service = container.dashboard_service()

            # Create test data using services
            box = container.box_service().create_box("Test Box", 10)

            # Create type first
            test_type = Type(name="Test Type")
            session.add(test_type)
            session.flush()

            # Create parts using part service
            part1 = container.part_service().create_part("Test Part 1", type_id=test_type.id)
            part2 = container.part_service().create_part("Test Part 2", type_id=test_type.id)
            session.commit()

            # Add stock using inventory service (this handles locations properly)
            container.inventory_service().add_stock(part1.key, box.box_no, 1, 20)
            container.inventory_service().add_stock(part2.key, box.box_no, 2, 3)  # Low stock

            # Create quantity history (recent changes)
            now = datetime.utcnow()
            history1 = QuantityHistory(
                part_id=part1.id, delta_qty=10, timestamp=now - timedelta(days=3),
                location_reference="1-1"
            )
            history2 = QuantityHistory(
                part_id=part2.id, delta_qty=-5, timestamp=now - timedelta(days=15),
                location_reference="1-2"
            )
            session.add_all([history1, history2])
            session.commit()

            stats = service.get_dashboard_stats()

            assert stats['total_parts'] == 2
            assert stats['total_quantity'] == 23
            assert stats['total_boxes'] == 1
            assert stats['total_types'] == 1
            assert stats['changes_7d'] == 3  # Two add_stock operations + history1 are within 7 days
            assert stats['changes_30d'] == 4  # Two add_stock operations + both manual history entries are within 30 days
            assert stats['low_stock_count'] == 1  # part2 has qty=3 <= 5

    def test_get_recent_activity_empty_history(
        self, app: Flask, session: Session, container: ServiceContainer
    ):
        """Test get_recent_activity with no history returns empty list."""
        service = container.dashboard_service()

        activities = service.get_recent_activity()

        assert activities == []

    def test_get_recent_activity_with_limit(
        self, app: Flask, session: Session, container: ServiceContainer
    ):
        """Test get_recent_activity respects limit parameter."""
        service = container.dashboard_service()

        # Create test data
        type_obj = Type(name="Test Type")
        session.add(type_obj)
        session.flush()

        part = Part(key="ABCD", description="Test Part", type_id=type_obj.id)
        session.add(part)
        session.flush()

        # Create multiple history entries
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
        activities = service.get_recent_activity(limit=3)

        assert len(activities) == 3
        # Should be ordered by timestamp descending (most recent first)
        assert activities[0]['delta_qty'] == 1  # Most recent (i=0)
        assert activities[1]['delta_qty'] == 2  # Second most recent (i=1)
        assert activities[2]['delta_qty'] == 3  # Third most recent (i=2)

    def test_get_recent_activity_includes_part_details(
        self, app: Flask, session: Session, container: ServiceContainer
    ):
        """Test get_recent_activity includes correct part details."""
        service = container.dashboard_service()

        # Create test data
        type_obj = Type(name="Resistor")
        session.add(type_obj)
        session.flush()

        part = Part(key="RSTR", description="10k Ohm Resistor", type_id=type_obj.id)
        session.add(part)
        session.flush()

        history = QuantityHistory(
            part_id=part.id,
            delta_qty=15,
            timestamp=datetime.utcnow(),
            location_reference="2-5"
        )
        session.add(history)
        session.commit()

        activities = service.get_recent_activity()

        assert len(activities) == 1
        activity = activities[0]
        assert activity['part_key'] == 'RSTR'
        assert activity['part_description'] == '10k Ohm Resistor'
        assert activity['delta_qty'] == 15
        assert activity['location_reference'] == '2-5'
        assert isinstance(activity['timestamp'], datetime)

    def test_get_storage_summary_empty_boxes(
        self, app: Flask, session: Session, container: ServiceContainer
    ):
        """Test get_storage_summary with no boxes returns empty list."""
        service = container.dashboard_service()

        summary = service.get_storage_summary()

        assert summary == []

    def test_get_storage_summary_with_boxes(
        self, app: Flask, session: Session, container: ServiceContainer
    ):
        """Test get_storage_summary with boxes shows correct utilization."""
        service = container.dashboard_service()

        # Create boxes using proper services
        box1 = container.box_service().create_box("Small Parts", 20)
        box2 = container.box_service().create_box("Large Parts", 50)

        # Create parts and locations
        type_obj = Type(name="Test Type")
        session.add(type_obj)
        session.flush()

        part1 = container.part_service().create_part("Part 1", type_id=type_obj.id)
        part2 = container.part_service().create_part("Part 2", type_id=type_obj.id)
        session.commit()

        # Box 1: 5 occupied locations out of 20 (25% usage)
        for i in range(1, 6):
            container.inventory_service().add_stock(part1.key, box1.box_no, i, 10)

        # Box 2: 10 occupied locations out of 50 (20% usage)
        for i in range(1, 11):
            container.inventory_service().add_stock(part2.key, box2.box_no, i, 5)

        session.commit()

        summary = service.get_storage_summary()

        assert len(summary) == 2

        # Results should be ordered by box_no
        box1_summary = summary[0]
        assert box1_summary['box_no'] == box1.box_no
        assert box1_summary['description'] == "Small Parts"
        assert box1_summary['total_locations'] == 20
        assert box1_summary['occupied_locations'] == 5
        assert box1_summary['usage_percentage'] == 25.0

        box2_summary = summary[1]
        assert box2_summary['box_no'] == box2.box_no
        assert box2_summary['description'] == "Large Parts"
        assert box2_summary['total_locations'] == 50
        assert box2_summary['occupied_locations'] == 10
        assert box2_summary['usage_percentage'] == 20.0

    def test_get_low_stock_items_default_threshold(
        self, app: Flask, session: Session, container: ServiceContainer
    ):
        """Test get_low_stock_items with default threshold of 5."""
        service = container.dashboard_service()

        # Create test data using proper services
        type_obj = Type(name="Capacitor")
        session.add(type_obj)
        session.flush()

        # Create a box with locations
        box = container.box_service().create_box("Test Box", 10)

        # Create parts using part service
        part1 = container.part_service().create_part("Low Stock Capacitor", type_id=type_obj.id)
        part2 = container.part_service().create_part("Good Stock Capacitor", type_id=type_obj.id)
        container.part_service().create_part("Zero Stock Capacitor", type_id=type_obj.id)
        session.commit()

        # Add stock using inventory service
        container.inventory_service().add_stock(part1.key, box.box_no, 1, 3)   # Low stock
        container.inventory_service().add_stock(part2.key, box.box_no, 2, 15)  # Good stock
        # part3 has no stock (zero stock)
        session.commit()

        low_stock = service.get_low_stock_items()

        # Should only return part1 (qty=3 <= 5)
        assert len(low_stock) == 1
        item = low_stock[0]
        assert item['part_key'] == part1.key
        assert item['description'] == 'Low Stock Capacitor'
        assert item['type_name'] == 'Capacitor'
        assert item['current_quantity'] == 3

    def test_get_low_stock_items_custom_threshold(
        self, app: Flask, session: Session, container: ServiceContainer
    ):
        """Test get_low_stock_items with custom threshold."""
        service = container.dashboard_service()

        # Create test data using proper services
        type_obj = Type(name="LED")
        session.add(type_obj)
        session.flush()

        # Create a box with locations
        box = container.box_service().create_box("LED Box", 5)

        # Create part using part service
        part = container.part_service().create_part("Red LED", type_id=type_obj.id)
        session.commit()

        # Add stock using inventory service
        container.inventory_service().add_stock(part.key, box.box_no, 1, 8)
        session.commit()

        # With threshold=10, part with qty=8 should be included
        low_stock = service.get_low_stock_items(threshold=10)
        assert len(low_stock) == 1
        assert low_stock[0]['current_quantity'] == 8

        # With threshold=5, part with qty=8 should NOT be included
        low_stock = service.get_low_stock_items(threshold=5)
        assert len(low_stock) == 0

    def test_get_category_distribution_empty_types(
        self, app: Flask, session: Session, container: ServiceContainer
    ):
        """Test get_category_distribution with no types returns empty list."""
        service = container.dashboard_service()

        distribution = service.get_category_distribution()

        assert distribution == []

    def test_get_category_distribution_ordered_by_count(
        self, app: Flask, session: Session, container: ServiceContainer
    ):
        """Test get_category_distribution returns types ordered by part count descending."""
        service = container.dashboard_service()

        # Create types
        type1 = Type(name="Resistor")
        type2 = Type(name="Capacitor")
        type3 = Type(name="LED")
        session.add_all([type1, type2, type3])
        session.flush()

        # Create parts (Resistor: 3, Capacitor: 1, LED: 2)
        parts = [
            Part(key="RES1", description="Resistor 1", type_id=type1.id),
            Part(key="RES2", description="Resistor 2", type_id=type1.id),
            Part(key="RES3", description="Resistor 3", type_id=type1.id),
            Part(key="CAP1", description="Capacitor 1", type_id=type2.id),
            Part(key="LED1", description="LED 1", type_id=type3.id),
            Part(key="LED2", description="LED 2", type_id=type3.id),
        ]
        session.add_all(parts)
        session.commit()

        distribution = service.get_category_distribution()

        assert len(distribution) == 3
        # Should be ordered by part count descending
        assert distribution[0]['type_name'] == 'Resistor'
        assert distribution[0]['part_count'] == 3
        assert distribution[1]['type_name'] == 'LED'
        assert distribution[1]['part_count'] == 2
        assert distribution[2]['type_name'] == 'Capacitor'
        assert distribution[2]['part_count'] == 1

    def test_get_parts_without_documents_empty_parts(
        self, app: Flask, session: Session, container: ServiceContainer
    ):
        """Test get_parts_without_documents with no parts returns zero count."""
        service = container.dashboard_service()

        result = service.get_parts_without_documents()

        assert result['count'] == 0
        assert result['sample_parts'] == []

    def test_get_parts_without_documents_all_documented(
        self, app: Flask, session: Session, container: ServiceContainer
    ):
        """Test get_parts_without_documents when all parts have documents."""
        service = container.dashboard_service()

        # Create test data
        type_obj = Type(name="IC")
        session.add(type_obj)
        session.flush()

        part = Part(key="IC01", description="Microcontroller", type_id=type_obj.id)
        session.add(part)
        session.flush()

        # Add attachment to part
        from app.models.part_attachment import AttachmentType
        attachment = PartAttachment(
            part_id=part.id,
            attachment_type=AttachmentType.PDF,
            title="Component Datasheet",
            filename="datasheet.pdf",
            file_size=1000,
            content_type="application/pdf"
        )
        session.add(attachment)
        session.commit()

        result = service.get_parts_without_documents()

        assert result['count'] == 0
        assert result['sample_parts'] == []

    def test_get_parts_without_documents_mixed_documentation(
        self, app: Flask, session: Session, container: ServiceContainer
    ):
        """Test get_parts_without_documents with mixed documentation status."""
        service = container.dashboard_service()

        # Create test data
        type_obj = Type(name="Sensor")
        session.add(type_obj)
        session.flush()

        # Create parts
        documented_part = Part(key="SEN1", description="Documented Sensor", type_id=type_obj.id)
        undocumented_part1 = Part(key="SEN2", description="Undocumented Sensor 1", type_id=type_obj.id)
        undocumented_part2 = Part(key="SEN3", description="Undocumented Sensor 2", type_id=type_obj.id)
        session.add_all([documented_part, undocumented_part1, undocumented_part2])
        session.flush()

        # Add attachment only to documented_part
        from app.models.part_attachment import AttachmentType
        attachment = PartAttachment(
            part_id=documented_part.id,
            attachment_type=AttachmentType.PDF,
            title="Sensor Specification",
            filename="sensor_spec.pdf",
            file_size=500,
            content_type="application/pdf"
        )
        session.add(attachment)
        session.commit()

        result = service.get_parts_without_documents()

        assert result['count'] == 2
        assert len(result['sample_parts']) == 2

        # Check sample data structure
        sample_keys = [part['part_key'] for part in result['sample_parts']]
        assert 'SEN2' in sample_keys
        assert 'SEN3' in sample_keys
        assert 'SEN1' not in sample_keys  # Should not include documented part

        # Check sample part structure
        sample_part = result['sample_parts'][0]
        assert 'part_key' in sample_part
        assert 'description' in sample_part
        assert 'type_name' in sample_part
        assert sample_part['type_name'] == 'Sensor'

    def test_get_parts_without_documents_sample_limit(
        self, app: Flask, session: Session, container: ServiceContainer
    ):
        """Test get_parts_without_documents limits sample to 10 parts."""
        service = container.dashboard_service()

        # Create test data
        type_obj = Type(name="Connector")
        session.add(type_obj)
        session.flush()

        # Create 15 undocumented parts
        parts = []
        for i in range(15):
            part = Part(key=f"CON{i:02d}", description=f"Connector {i}", type_id=type_obj.id)
            parts.append(part)

        session.add_all(parts)
        session.commit()

        result = service.get_parts_without_documents()

        assert result['count'] == 15
        assert len(result['sample_parts']) == 10  # Limited to 10
