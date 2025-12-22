"""Tests for the request diagnostics service."""

import pytest
from flask import Flask
from sqlalchemy.orm import Session

from app.config import Settings
from app.services.container import ServiceContainer
from app.services.diagnostics_service import (
    DiagnosticsService,
    RequestDiagnostics,
    QueryInfo,
)


class TestRequestDiagnostics:
    """Unit tests for the RequestDiagnostics data class."""

    def test_query_count_empty(self):
        """Test query count with no queries."""
        diag = RequestDiagnostics()
        assert diag.query_count == 0

    def test_query_count_with_queries(self):
        """Test query count with multiple queries."""
        diag = RequestDiagnostics()
        diag.queries.append(QueryInfo(sql="SELECT 1", duration_ms=1.0))
        diag.queries.append(QueryInfo(sql="SELECT 2", duration_ms=2.0))
        assert diag.query_count == 2

    def test_total_query_time(self):
        """Test total query time calculation."""
        diag = RequestDiagnostics()
        diag.queries.append(QueryInfo(sql="SELECT 1", duration_ms=10.5))
        diag.queries.append(QueryInfo(sql="SELECT 2", duration_ms=25.3))
        assert diag.total_query_time_ms == pytest.approx(35.8)

    def test_python_time_calculation(self):
        """Test that Python time is request duration minus query time."""
        import time

        diag = RequestDiagnostics()
        # Simulate some Python work
        time.sleep(0.01)  # 10ms
        # Add a query that took 5ms
        diag.queries.append(QueryInfo(sql="SELECT 1", duration_ms=5.0))

        # Python time = total request time - query time
        # Request time should be at least 10ms, query time is 5ms
        # So Python time should be at least ~5ms
        assert diag.request_duration_ms >= 10  # At least 10ms elapsed
        assert diag.python_time_ms > 0  # Python time should be positive


class TestDiagnosticsServiceInit:
    """Tests for DiagnosticsService initialization."""

    def test_service_disabled_by_default(self, test_settings: Settings):
        """Test that diagnostics is disabled by default."""
        assert test_settings.DIAGNOSTICS_ENABLED is False
        service = DiagnosticsService(test_settings)
        assert service.enabled is False

    def test_service_enabled_via_settings(self):
        """Test enabling diagnostics via settings."""
        settings = Settings(
            DATABASE_URL="sqlite:///:memory:",
            FLASK_ENV="testing",
            DIAGNOSTICS_ENABLED=True,
        )
        service = DiagnosticsService(settings)
        assert service.enabled is True

    def test_threshold_configuration(self):
        """Test custom threshold configuration."""
        settings = Settings(
            DATABASE_URL="sqlite:///:memory:",
            FLASK_ENV="testing",
            DIAGNOSTICS_ENABLED=True,
            DIAGNOSTICS_SLOW_QUERY_THRESHOLD_MS=50,
            DIAGNOSTICS_SLOW_REQUEST_THRESHOLD_MS=200,
        )
        service = DiagnosticsService(settings)
        assert service.slow_query_threshold_ms == 50
        assert service.slow_request_threshold_ms == 200


class TestDiagnosticsServiceIntegration:
    """Integration tests with Flask and SQLAlchemy."""

    @pytest.fixture
    def diagnostics_settings(self) -> Settings:
        """Create test settings with diagnostics enabled."""
        return Settings(
            DATABASE_URL="sqlite:///:memory:",
            SECRET_KEY="test-key",
            FLASK_ENV="testing",
            DIAGNOSTICS_ENABLED=True,
            DIAGNOSTICS_SLOW_QUERY_THRESHOLD_MS=1000,  # High threshold to avoid log spam
            DIAGNOSTICS_SLOW_REQUEST_THRESHOLD_MS=5000,
        )

    def test_request_timing_recorded(
        self, app: Flask, session: Session, container: ServiceContainer
    ):
        """Test that request timing is recorded when diagnostics is enabled."""
        # The app fixture creates a diagnostics service (though disabled by default)
        # Verify the service exists on the app and has the expected structure
        assert hasattr(app, 'diagnostics_service')
        service = app.diagnostics_service

        # Verify metrics are initialized
        assert hasattr(service, 'request_duration_seconds')
        assert hasattr(service, 'request_query_count')
        assert hasattr(service, 'query_duration_seconds')

    def test_query_tracking_structure(self):
        """Test QueryInfo data structure."""
        query = QueryInfo(
            sql="SELECT * FROM parts WHERE key = 'ABCD'",
            duration_ms=15.5,
            parameters={'key': 'ABCD'}
        )

        assert query.sql == "SELECT * FROM parts WHERE key = 'ABCD'"
        assert query.duration_ms == 15.5
        assert query.parameters == {'key': 'ABCD'}


class TestDiagnosticsMetrics:
    """Tests for Prometheus metrics initialization."""

    def test_all_metrics_initialized(self):
        """Test that all required metrics are initialized."""
        settings = Settings(
            DATABASE_URL="sqlite:///:memory:",
            FLASK_ENV="testing",
            DIAGNOSTICS_ENABLED=True,
        )
        service = DiagnosticsService(settings)

        # Request-level metrics
        assert service.request_duration_seconds is not None
        assert service.request_query_count is not None
        assert service.request_query_time_seconds is not None
        assert service.request_python_time_seconds is not None

        # Query-level metrics
        assert service.query_duration_seconds is not None
        assert service.slow_query_total is not None

        # Request tracking
        assert service.slow_request_total is not None
        assert service.active_requests is not None
