"""Tests for MetricsService."""

import time
from unittest.mock import patch

from app.services.dashboard_service import DashboardService


def get_real_metrics_service(container):
    """Helper function to get real MetricsService instance for testing."""
    from prometheus_client import CollectorRegistry, Counter, Gauge, Histogram

    from app.services.metrics_service import MetricsService

    # Create a custom MetricsService that uses its own registry
    class TestMetricsService(MetricsService):
        def __init__(self, container):
            # Don't call super().__init__ to avoid double initialization
            self._shutdown_start_time: float | None = None
            self.container = container

            # Create our own registry for this test
            self._test_registry = CollectorRegistry()
            self.initialize_test_metrics()

            # Background update control (needed for background updater tests)
            import threading
            self._stop_event = threading.Event()
            self._updater_thread = None

        def initialize_test_metrics(self):
            """Initialize metrics with test registry."""
            # Inventory Metrics
            self.inventory_total_parts = Gauge(
                'inventory_total_parts',
                'Total parts in system',
                registry=self._test_registry
            )
            self.inventory_total_quantity = Gauge(
                'inventory_total_quantity',
                'Sum of all quantities',
                registry=self._test_registry
            )
            self.inventory_low_stock_parts = Gauge(
                'inventory_low_stock_parts',
                'Parts with qty <= 5',
                registry=self._test_registry
            )
            self.inventory_parts_without_docs = Gauge(
                'inventory_parts_without_docs',
                'Undocumented parts',
                registry=self._test_registry
            )

            # Storage Metrics
            self.inventory_box_utilization_percent = Gauge(
                'inventory_box_utilization_percent',
                'Box usage percentage',
                ['box_no'],
                registry=self._test_registry
            )
            self.inventory_total_boxes = Gauge(
                'inventory_total_boxes',
                'Active storage boxes',
                registry=self._test_registry
            )

            # Activity Metrics
            self.inventory_quantity_changes_total = Counter(
                'inventory_quantity_changes_total',
                'Total changes by type',
                ['operation'],
                registry=self._test_registry
            )
            self.inventory_recent_changes_7d = Gauge(
                'inventory_recent_changes_7d',
                'Changes in last 7 days',
                registry=self._test_registry
            )
            self.inventory_recent_changes_30d = Gauge(
                'inventory_recent_changes_30d',
                'Changes in last 30 days',
                registry=self._test_registry
            )

            # Category Metrics
            self.inventory_parts_by_type = Gauge(
                'inventory_parts_by_type',
                'Parts per category',
                ['type_name'],
                registry=self._test_registry
            )

            # Kit Metrics
            self.kit_detail_views_total = Counter(
                'kit_detail_views_total',
                'Total kit detail view requests',
                registry=self._test_registry
            )
            self.kit_content_mutations_total = Counter(
                'kit_content_mutations_total',
                'Total kit content mutations grouped by action',
                ['action'],
                registry=self._test_registry
            )
            self.kit_content_update_duration_seconds = Histogram(
                'kit_content_update_duration_seconds',
                'Duration of kit content update operations in seconds',
                registry=self._test_registry
            )

            # AI Analysis Metrics
            self.ai_analysis_requests_total = Counter(
                'ai_analysis_requests_total',
                'Total AI analysis requests',
                ['status', 'model', 'verbosity', 'reasoning_effort'],
                registry=self._test_registry
            )
            self.ai_analysis_duration_seconds = Histogram(
                'ai_analysis_duration_seconds',
                'AI analysis request duration',
                ['model', 'verbosity', 'reasoning_effort'],
                registry=self._test_registry
            )
            self.ai_analysis_tokens_total = Counter(
                'ai_analysis_tokens_total',
                'Total tokens used',
                ['type', 'model', 'verbosity', 'reasoning_effort'],
                registry=self._test_registry
            )
            self.ai_analysis_cost_dollars_total = Counter(
                'ai_analysis_cost_dollars_total',
                'Total cost of AI analysis in dollars',
                ['model', 'verbosity', 'reasoning_effort'],
                registry=self._test_registry
            )

        def get_metrics_text(self) -> str:
            """Generate metrics from test registry."""
            from prometheus_client import generate_latest
            return generate_latest(self._test_registry).decode('utf-8')

    return TestMetricsService(container)


class TestMetricsService:
    """Test suite for MetricsService."""

    def test_initialize_metrics(self, app, session, container):
        """Test that metric objects are initialized correctly."""
        service = get_real_metrics_service(container)

        # Check that all expected metrics exist
        assert hasattr(service, 'inventory_total_parts')
        assert hasattr(service, 'inventory_total_quantity')
        assert hasattr(service, 'inventory_low_stock_parts')
        assert hasattr(service, 'inventory_parts_without_docs')
        assert hasattr(service, 'inventory_box_utilization_percent')
        assert hasattr(service, 'inventory_total_boxes')
        assert hasattr(service, 'inventory_quantity_changes_total')
        assert hasattr(service, 'inventory_recent_changes_7d')
        assert hasattr(service, 'inventory_recent_changes_30d')
        assert hasattr(service, 'inventory_parts_by_type')
        assert hasattr(service, 'ai_analysis_requests_total')
        assert hasattr(service, 'ai_analysis_duration_seconds')
        assert hasattr(service, 'ai_analysis_tokens_total')
        assert hasattr(service, 'ai_analysis_cost_dollars_total')

        # Verify container is available (no longer has persistent dashboard service)
        assert service.container is not None

    @patch.object(DashboardService, 'get_dashboard_stats')
    @patch.object(DashboardService, 'get_parts_without_documents')
    def test_update_inventory_metrics(self, mock_parts_without_docs, mock_dashboard_stats, app, session, container):
        """Test inventory metrics update."""
        service = get_real_metrics_service(container)

        # Mock dashboard service responses
        mock_dashboard_stats.return_value = {
            'total_parts': 150,
            'total_quantity': 2500,
            'low_stock_count': 12,
            'changes_7d': 25,
            'changes_30d': 78
        }
        mock_parts_without_docs.return_value = {'count': 18}

        # Update metrics
        service.update_inventory_metrics()

        # Verify mock calls
        mock_dashboard_stats.assert_called_once()
        mock_parts_without_docs.assert_called_once()

        # Verify metrics values are set (we can't easily check exact values due to Prometheus internals)
        # But we can verify the methods were called without errors

    @patch.object(DashboardService, 'get_storage_summary')
    def test_update_storage_metrics(self, mock_storage_summary, app, session, container):
        """Test storage metrics update."""
        service = get_real_metrics_service(container)

        # Mock storage summary response
        mock_storage_summary.return_value = [
            {'box_no': 1, 'description': 'Box 1', 'usage_percentage': 75.5},
            {'box_no': 2, 'description': 'Box 2', 'usage_percentage': 42.3},
            {'box_no': 3, 'description': 'Box 3', 'usage_percentage': 0.0}
        ]

        # Update metrics
        service.update_storage_metrics()

        # Verify mock call
        mock_storage_summary.assert_called_once()

    @patch.object(DashboardService, 'get_category_distribution')
    def test_update_category_metrics(self, mock_category_distribution, app, session, container):
        """Test category metrics update."""
        service = get_real_metrics_service(container)

        # Mock category distribution response
        mock_category_distribution.return_value = [
            {'type_name': 'Resistor', 'part_count': 45},
            {'type_name': 'Capacitor', 'part_count': 32},
            {'type_name': 'IC', 'part_count': 18}
        ]

        # Update metrics
        service.update_category_metrics()

        # Verify mock call
        mock_category_distribution.assert_called_once()

    def test_record_kit_content_metrics(self, app, session, container):
        """Ensure kit detail and content metrics increment correctly."""
        service = get_real_metrics_service(container)

        service.record_kit_detail_view(kit_id=1)
        assert service.kit_detail_views_total._value.get() == 1

        service.record_kit_content_created(kit_id=1, part_id=2, required_per_unit=3)
        assert service.kit_content_mutations_total.labels(action="create")._value.get() == 1

        service.record_kit_content_updated(kit_id=1, part_id=2, duration_seconds=0.5)
        assert service.kit_content_mutations_total.labels(action="update")._value.get() == 1
        assert service.kit_content_update_duration_seconds._sum.get() == 0.5

        service.record_kit_content_deleted(kit_id=1, part_id=2)
        assert service.kit_content_mutations_total.labels(action="delete")._value.get() == 1

    def test_record_quantity_change(self, app, session, container):
        """Test recording quantity changes."""
        service = get_real_metrics_service(container)

        # Record some quantity changes
        service.record_quantity_change("add", 100)
        service.record_quantity_change("remove", 25)
        service.record_quantity_change("add", 50)

        # These should not raise exceptions
        # We can't easily verify counter values without inspecting Prometheus internals

    def test_record_ai_analysis_success(self, app, session, container):
        """Test recording successful AI analysis metrics."""
        service = get_real_metrics_service(container)

        # Record a successful AI analysis
        service.record_ai_analysis(
            status="success",
            model="gpt-4o",
            verbosity="medium",
            reasoning_effort="medium",
            duration=5.5,
            tokens_input=1000,
            tokens_output=500,
            tokens_reasoning=200,
            tokens_cached_input=100,
            cost_dollars=0.15
        )

        # Should not raise exceptions

    def test_record_ai_analysis_error(self, app, session, container):
        """Test recording failed AI analysis metrics."""
        service = get_real_metrics_service(container)

        # Record a failed AI analysis
        service.record_ai_analysis(
            status="error",
            model="gpt-4o",
            verbosity="high",
            reasoning_effort="low",
            duration=2.1,
            tokens_input=500,
            tokens_output=0,
            tokens_reasoning=0,
            tokens_cached_input=50,
            cost_dollars=0.05
        )

        # Should not raise exceptions

    def test_record_ai_analysis_minimal(self, app, session, container):
        """Test recording AI analysis with minimal parameters."""
        service = get_real_metrics_service(container)

        # Record with minimal parameters
        service.record_ai_analysis(
            status="success",
            model="gpt-4o-mini",
            verbosity="low",
            reasoning_effort="low",
            duration=1.0
        )

        # Should not raise exceptions

    def test_background_updater_lifecycle(self, app, session, container):
        """Test background updater start/stop lifecycle."""
        service = get_real_metrics_service(container)

        # Start background updater with short interval
        service.start_background_updater(1)

        # Verify thread is running
        assert service._updater_thread is not None
        assert service._updater_thread.is_alive()
        assert not service._stop_event.is_set()

        # Stop background updater
        service.shutdown()

        # Verify thread is stopped (give it a moment)
        time.sleep(0.1)
        assert service._stop_event.is_set()

        # Thread should eventually stop (we can't wait too long in tests)

    def test_background_updater_double_start(self, app, session, container):
        """Test that starting background updater twice doesn't create multiple threads."""
        service = get_real_metrics_service(container)

        # Start background updater
        service.start_background_updater(1)
        first_thread = service._updater_thread

        # Start again - should not create new thread
        service.start_background_updater(1)

        # Should be same thread
        assert service._updater_thread is first_thread

        # Cleanup
        service.shutdown()

    @patch.object(DashboardService, 'get_dashboard_stats')
    def test_background_update_error_handling(self, mock_dashboard_stats, app, session, container):
        """Test that background update handles errors gracefully."""
        service = get_real_metrics_service(container)

        # Make dashboard stats raise exception
        mock_dashboard_stats.side_effect = Exception("Database error")

        # This should not raise - errors should be handled gracefully
        service.update_inventory_metrics()

    def test_get_metrics_text(self, app, session, container):
        """Test getting metrics in Prometheus text format."""
        service = get_real_metrics_service(container)

        # Record some metrics first
        service.record_quantity_change("add", 10)

        # Get metrics text
        metrics_text = service.get_metrics_text()

        # Should be a non-empty string
        assert isinstance(metrics_text, str)
        assert len(metrics_text) > 0

        # Should contain Prometheus format indicators
        assert "# HELP" in metrics_text or "# TYPE" in metrics_text

    def test_record_task_execution_placeholder(self, app, session, container):
        """Test task execution recording (currently a placeholder)."""
        # Use the real metrics service for comprehensive testing
        service = get_real_metrics_service(container)

        # This is currently a placeholder method
        service.record_task_execution("test_task", 5.0, "success")

        # Should not raise exceptions

    def test_update_activity_metrics_placeholder(self, app, session, container):
        """Test activity metrics update (currently a placeholder)."""
        # Use the real metrics service for comprehensive testing
        service = get_real_metrics_service(container)

        # This is currently a placeholder method
        service.update_activity_metrics()

        # Should not raise exceptions
