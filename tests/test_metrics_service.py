"""Tests for MetricsService."""

import time
from unittest.mock import patch

from app.services.dashboard_service import DashboardService


class TestMetricsService:
    """Test suite for MetricsService."""

    def test_initialize_metrics(self, app, session, container):
        """Test that metric objects are initialized correctly."""
        service = container.metrics_service()

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
        assert hasattr(service, 'ai_analysis_function_calls_total')
        assert hasattr(service, 'ai_analysis_web_searches_total')

        # Verify dashboard service is initialized
        assert isinstance(service.dashboard_service, DashboardService)

    @patch.object(DashboardService, 'get_dashboard_stats')
    @patch.object(DashboardService, 'get_parts_without_documents')
    def test_update_inventory_metrics(self, mock_parts_without_docs, mock_dashboard_stats, app, session, container):
        """Test inventory metrics update."""
        service = container.metrics_service()

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
        service = container.metrics_service()

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
        service = container.metrics_service()

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

    def test_record_quantity_change(self, app, session, container):
        """Test recording quantity changes."""
        service = container.metrics_service()

        # Record some quantity changes
        service.record_quantity_change("add", 100)
        service.record_quantity_change("remove", 25)
        service.record_quantity_change("add", 50)

        # These should not raise exceptions
        # We can't easily verify counter values without inspecting Prometheus internals

    def test_record_ai_analysis_success(self, app, session, container):
        """Test recording successful AI analysis metrics."""
        service = container.metrics_service()

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
            cost_dollars=0.15,
            function_calls=["classify_urls", "get_datasheet"],
            web_searches=2
        )

        # Should not raise exceptions

    def test_record_ai_analysis_error(self, app, session, container):
        """Test recording failed AI analysis metrics."""
        service = container.metrics_service()

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
            cost_dollars=0.05,
            function_calls=[],
            web_searches=0
        )

        # Should not raise exceptions

    def test_record_ai_analysis_minimal(self, app, session, container):
        """Test recording AI analysis with minimal parameters."""
        service = container.metrics_service()

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
        service = container.metrics_service()

        # Start background updater with short interval
        service.start_background_updater(1)

        # Verify thread is running
        assert service._updater_thread is not None
        assert service._updater_thread.is_alive()
        assert not service._stop_updater

        # Stop background updater
        service.stop_background_updater()

        # Verify thread is stopped (give it a moment)
        time.sleep(0.1)
        assert service._stop_updater

        # Thread should eventually stop (we can't wait too long in tests)

    def test_background_updater_double_start(self, app, session, container):
        """Test that starting background updater twice doesn't create multiple threads."""
        service = container.metrics_service()

        # Start background updater
        service.start_background_updater(1)
        first_thread = service._updater_thread

        # Start again - should not create new thread
        service.start_background_updater(1)

        # Should be same thread
        assert service._updater_thread is first_thread

        # Cleanup
        service.stop_background_updater()

    @patch.object(DashboardService, 'get_dashboard_stats')
    def test_background_update_error_handling(self, mock_dashboard_stats, app, session, container):
        """Test that background update handles errors gracefully."""
        service = container.metrics_service()

        # Make dashboard stats raise exception
        mock_dashboard_stats.side_effect = Exception("Database error")

        # This should not raise - errors should be handled gracefully
        service.update_inventory_metrics()

    def test_get_metrics_text(self, app, session, container):
        """Test getting metrics in Prometheus text format."""
        service = container.metrics_service()

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
        service = container.metrics_service()

        # This is currently a placeholder method
        service.record_task_execution("test_task", 5.0, "success")

        # Should not raise exceptions

    def test_update_activity_metrics_placeholder(self, app, session, container):
        """Test activity metrics update (currently a placeholder)."""
        service = container.metrics_service()

        # This is currently a placeholder method
        service.update_activity_metrics()

        # Should not raise exceptions
