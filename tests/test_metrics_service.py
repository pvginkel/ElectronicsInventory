"""Tests for MetricsService polling infrastructure and decentralized metrics."""

import threading
import time
from unittest.mock import MagicMock, patch

import pytest
from flask import Flask
from sqlalchemy.orm import Session

from app.services.dashboard_service import DashboardService
from app.services.metrics_service import MetricsService
from tests.testing_utils import StubLifecycleCoordinator


class TestMetricsServicePolling:
    """Test the thin MetricsService polling infrastructure."""

    @pytest.fixture
    def lifecycle_coordinator(self):
        return StubLifecycleCoordinator()

    @pytest.fixture
    def metrics_service(self, lifecycle_coordinator):
        container = MagicMock()
        service = MetricsService(
            container=container,
            lifecycle_coordinator=lifecycle_coordinator,
        )
        yield service
        service.shutdown()

    def test_register_for_polling(self, metrics_service):
        """Test that callbacks can be registered for polling."""
        called = threading.Event()

        def callback():
            called.set()

        metrics_service.register_for_polling("test", callback)
        assert "test" in metrics_service._polling_callbacks

    def test_background_updater_lifecycle(self, metrics_service):
        """Test background updater start/stop lifecycle."""
        metrics_service.start_background_updater(1)

        assert metrics_service._updater_thread is not None
        assert metrics_service._updater_thread.is_alive()
        assert not metrics_service._stop_event.is_set()

        metrics_service.shutdown()

        time.sleep(0.1)
        assert metrics_service._stop_event.is_set()

    def test_background_updater_double_start(self, metrics_service):
        """Test that starting background updater twice doesn't create multiple threads."""
        metrics_service.start_background_updater(1)
        first_thread = metrics_service._updater_thread

        metrics_service.start_background_updater(1)
        assert metrics_service._updater_thread is first_thread

    def test_background_updater_invokes_callbacks(self, metrics_service):
        """Test that the background thread invokes registered callbacks."""
        called = threading.Event()

        def callback():
            called.set()

        metrics_service.register_for_polling("test_cb", callback)
        # Use a short interval so the first tick fires quickly (after one wait)
        metrics_service.start_background_updater(interval_seconds=1)

        assert called.wait(timeout=3.0), "Callback was not invoked within timeout"

    def test_background_updater_handles_callback_errors(self, metrics_service):
        """Test that errors in callbacks don't crash the background thread."""
        error_count = 0
        good_called = threading.Event()

        def bad_callback():
            nonlocal error_count
            error_count += 1
            raise Exception("Callback error")

        def good_callback():
            good_called.set()

        metrics_service.register_for_polling("bad", bad_callback)
        metrics_service.register_for_polling("good", good_callback)
        metrics_service.start_background_updater(interval_seconds=1)

        # Good callback should still be invoked despite bad callback raising
        assert good_called.wait(timeout=3.0), "Good callback was not invoked"
        assert error_count > 0

    def test_shutdown_via_lifecycle_event(self, lifecycle_coordinator):
        """Test that MetricsService shuts down via lifecycle events."""
        container = MagicMock()
        service = MetricsService(
            container=container,
            lifecycle_coordinator=lifecycle_coordinator,
        )
        service.start_background_updater(1)

        assert service._updater_thread is not None
        assert service._updater_thread.is_alive()

        # Simulate the SHUTDOWN lifecycle event
        from app.utils.lifecycle_coordinator import LifecycleEvent
        for notification in lifecycle_coordinator._notifications:
            notification(LifecycleEvent.SHUTDOWN)

        time.sleep(0.2)
        assert service._stop_event.is_set()


class TestDashboardPollingCallback:
    """Test the dashboard metrics polling callback."""

    @patch.object(DashboardService, "get_dashboard_stats")
    @patch.object(DashboardService, "get_parts_without_documents")
    @patch.object(DashboardService, "get_storage_summary")
    @patch.object(DashboardService, "get_category_distribution")
    def test_dashboard_callback_updates_gauges(
        self,
        mock_category,
        mock_storage,
        mock_docs,
        mock_stats,
        app: Flask,
        session: Session,
        container,
    ):
        """Test that the dashboard polling callback updates gauge values."""
        from app.services.metrics.dashboard_metrics import (
            INVENTORY_TOTAL_BOXES,
            INVENTORY_TOTAL_PARTS,
            INVENTORY_TOTAL_QUANTITY,
            create_dashboard_polling_callback,
        )

        mock_stats.return_value = {
            "total_parts": 42,
            "total_quantity": 1000,
            "low_stock_count": 5,
            "changes_7d": 10,
            "changes_30d": 30,
        }
        mock_docs.return_value = {"count": 3}
        mock_storage.return_value = [
            {"box_no": 1, "description": "Box 1", "usage_percentage": 50.0},
        ]
        mock_category.return_value = [
            {"type_name": "Resistor", "part_count": 20},
        ]

        callback = create_dashboard_polling_callback(container)
        callback()

        assert INVENTORY_TOTAL_PARTS._value.get() == 42
        assert INVENTORY_TOTAL_QUANTITY._value.get() == 1000
        assert INVENTORY_TOTAL_BOXES._value.get() == 1

    @patch.object(DashboardService, "get_dashboard_stats")
    def test_dashboard_callback_handles_errors(
        self, mock_stats, app: Flask, session: Session, container
    ):
        """Test that the callback handles errors gracefully."""
        from app.services.metrics.dashboard_metrics import (
            create_dashboard_polling_callback,
        )

        mock_stats.side_effect = Exception("Database error")

        callback = create_dashboard_polling_callback(container)
        # Should not raise; errors are handled internally
        callback()


class TestDecentralizedMetricsExist:
    """Verify that module-level metrics are defined in owning services."""

    def test_inventory_service_metrics(self):
        """Check inventory service owns quantity change counter."""
        from app.services.inventory_service import INVENTORY_QUANTITY_CHANGES_TOTAL
        assert INVENTORY_QUANTITY_CHANGES_TOTAL is not None

    def test_kit_service_metrics(self):
        """Check kit service owns lifecycle counters and gauges."""
        from app.services.kit_service import (
            KITS_ACTIVE_COUNT,
            KITS_ARCHIVED_COUNT,
            KITS_CREATED_TOTAL,
        )
        assert KITS_CREATED_TOTAL is not None
        assert KITS_ACTIVE_COUNT is not None
        assert KITS_ARCHIVED_COUNT is not None

    def test_kit_pick_list_service_metrics(self):
        """Check pick list service owns pick list metrics."""
        from app.services.kit_pick_list_service import (
            PICK_LIST_CREATED_TOTAL,
            PICK_LIST_LINE_PICKED_TOTAL,
        )
        assert PICK_LIST_CREATED_TOTAL is not None
        assert PICK_LIST_LINE_PICKED_TOTAL is not None

    def test_connection_manager_metrics(self):
        """Check connection manager owns SSE gateway metrics."""
        from app.services.connection_manager import (
            SSE_GATEWAY_ACTIVE_CONNECTIONS,
            SSE_GATEWAY_CONNECTIONS_TOTAL,
            SSE_GATEWAY_EVENTS_SENT_TOTAL,
        )
        assert SSE_GATEWAY_CONNECTIONS_TOTAL is not None
        assert SSE_GATEWAY_EVENTS_SENT_TOTAL is not None
        assert SSE_GATEWAY_ACTIVE_CONNECTIONS is not None

    def test_auth_service_metrics(self):
        """Check auth service owns validation metrics."""
        from app.services.auth_service import (
            AUTH_VALIDATION_DURATION_SECONDS,
            AUTH_VALIDATION_TOTAL,
            JWKS_REFRESH_TOTAL,
        )
        assert AUTH_VALIDATION_TOTAL is not None
        assert AUTH_VALIDATION_DURATION_SECONDS is not None
        assert JWKS_REFRESH_TOTAL is not None

    def test_oidc_client_service_metrics(self):
        """Check OIDC client service owns token exchange metrics."""
        from app.services.oidc_client_service import (
            AUTH_TOKEN_REFRESH_TOTAL,
            OIDC_TOKEN_EXCHANGE_TOTAL,
        )
        assert OIDC_TOKEN_EXCHANGE_TOTAL is not None
        assert AUTH_TOKEN_REFRESH_TOTAL is not None

    def test_openai_runner_metrics(self):
        """Check OpenAI runner owns AI analysis metrics."""
        from app.utils.ai.openai.openai_runner import (
            AI_ANALYSIS_COST_DOLLARS_TOTAL,
            AI_ANALYSIS_DURATION_SECONDS,
            AI_ANALYSIS_REQUESTS_TOTAL,
            AI_ANALYSIS_TOKENS_TOTAL,
        )
        assert AI_ANALYSIS_REQUESTS_TOTAL is not None
        assert AI_ANALYSIS_DURATION_SECONDS is not None
        assert AI_ANALYSIS_TOKENS_TOTAL is not None
        assert AI_ANALYSIS_COST_DOLLARS_TOTAL is not None

    def test_duplicate_search_service_metrics(self):
        """Check duplicate search service owns its metrics."""
        from app.services.duplicate_search_service import (
            AI_DUPLICATE_SEARCH_DURATION_SECONDS,
            AI_DUPLICATE_SEARCH_MATCHES_FOUND,
            AI_DUPLICATE_SEARCH_PARTS_DUMP_SIZE,
            AI_DUPLICATE_SEARCH_REQUESTS_TOTAL,
        )
        assert AI_DUPLICATE_SEARCH_REQUESTS_TOTAL is not None
        assert AI_DUPLICATE_SEARCH_DURATION_SECONDS is not None
        assert AI_DUPLICATE_SEARCH_MATCHES_FOUND is not None
        assert AI_DUPLICATE_SEARCH_PARTS_DUMP_SIZE is not None

    def test_mouser_service_metrics(self):
        """Check Mouser service owns its metrics."""
        from app.services.mouser_service import (
            MOUSER_API_DURATION_SECONDS,
            MOUSER_API_REQUESTS_TOTAL,
        )
        assert MOUSER_API_REQUESTS_TOTAL is not None
        assert MOUSER_API_DURATION_SECONDS is not None

    def test_lifecycle_coordinator_metrics(self):
        """Check lifecycle coordinator owns shutdown metrics."""
        from app.utils.lifecycle_coordinator import (
            APPLICATION_SHUTTING_DOWN,
            GRACEFUL_SHUTDOWN_DURATION_SECONDS,
        )
        assert APPLICATION_SHUTTING_DOWN is not None
        assert GRACEFUL_SHUTDOWN_DURATION_SECONDS is not None

    def test_task_service_shutdown_metric(self):
        """Check task service owns the active-tasks-at-shutdown gauge."""
        from app.services.task_service import ACTIVE_TASKS_AT_SHUTDOWN
        assert ACTIVE_TASKS_AT_SHUTDOWN is not None

    def test_pick_list_report_service_metrics(self):
        """Check pick list report service owns PDF generation metrics."""
        from app.services.pick_list_report_service import (
            PICK_LIST_PDF_GENERATED_TOTAL,
            PICK_LIST_PDF_GENERATION_DURATION_SECONDS,
        )
        assert PICK_LIST_PDF_GENERATED_TOTAL is not None
        assert PICK_LIST_PDF_GENERATION_DURATION_SECONDS is not None

    def test_parts_api_metric(self, app: Flask):
        """Check parts API owns kit usage request counter."""
        from app.api.parts import PART_KIT_USAGE_REQUESTS_TOTAL
        assert PART_KIT_USAGE_REQUESTS_TOTAL is not None

    def test_dashboard_metrics(self):
        """Check dashboard metrics module owns polling gauges."""
        from app.services.metrics.dashboard_metrics import (
            INVENTORY_TOTAL_BOXES,
            INVENTORY_TOTAL_PARTS,
            INVENTORY_TOTAL_QUANTITY,
        )
        assert INVENTORY_TOTAL_PARTS is not None
        assert INVENTORY_TOTAL_QUANTITY is not None
        assert INVENTORY_TOTAL_BOXES is not None


class TestMetricsEndpoint:
    """Test the /metrics endpoint uses generate_latest() directly."""

    def test_metrics_endpoint_returns_prometheus_format(self, client):
        """Test /metrics returns valid Prometheus exposition format."""
        response = client.get("/metrics")
        assert response.status_code == 200
        assert "text/plain" in response.content_type
        # Prometheus text format contains TYPE and HELP lines
        text = response.data.decode("utf-8")
        assert len(text) > 0
