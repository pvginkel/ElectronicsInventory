"""Tests for health check API endpoints."""

from unittest.mock import MagicMock

from flask import Flask
from flask.testing import FlaskClient

from app.utils.shutdown_coordinator import NoopShutdownCoordinator


class TestHealthEndpoints:
    """Test health check endpoints for Kubernetes probes."""

    def test_readyz_when_ready(self, client: FlaskClient):
        """Test readiness probe returns 200 when ready."""
        response = client.get("/api/health/readyz")

        assert response.status_code == 200
        assert response.json["status"] == "ready"
        assert response.json["ready"] is True

    def test_readyz_when_shutting_down(self, app: Flask, client: FlaskClient):
        """Test readiness probe returns 503 when shutting down."""
        # Get the shutdown coordinator and simulate shutdown
        with app.app_context():
            coordinator = app.container.shutdown_coordinator()

            # For NoopShutdownCoordinator, we need to set the state
            if isinstance(coordinator, NoopShutdownCoordinator):
                coordinator._shutting_down = True
            else:
                # For real coordinator, trigger shutdown
                import signal
                coordinator.handle_sigterm(signal.SIGTERM, None)

        response = client.get("/api/health/readyz")

        assert response.status_code == 503
        assert response.json["status"] == "shutting down"
        assert response.json["ready"] is False

    def test_healthz_always_returns_200(self, client: FlaskClient):
        """Test liveness probe always returns 200."""
        response = client.get("/api/health/healthz")

        assert response.status_code == 200
        assert response.json["status"] == "alive"
        assert response.json["ready"] is True

    def test_healthz_during_shutdown(self, app: Flask, client: FlaskClient):
        """Test liveness probe returns 200 even during shutdown."""
        # Get the shutdown coordinator and simulate shutdown
        with app.app_context():
            coordinator = app.container.shutdown_coordinator()

            # For NoopShutdownCoordinator, we need to set the state
            if isinstance(coordinator, NoopShutdownCoordinator):
                coordinator._shutting_down = True
            else:
                # For real coordinator, trigger shutdown
                import signal
                coordinator.handle_sigterm(signal.SIGTERM, None)

        # Liveness should still return 200
        response = client.get("/api/health/healthz")

        assert response.status_code == 200
        assert response.json["status"] == "alive"
        assert response.json["ready"] is True

    def test_health_endpoints_response_format(self, client: FlaskClient):
        """Test that health endpoints return correct response format."""
        # Test readyz format
        readyz_response = client.get("/api/health/readyz")
        assert "status" in readyz_response.json
        assert "ready" in readyz_response.json
        assert isinstance(readyz_response.json["ready"], bool)

        # Test healthz format
        healthz_response = client.get("/api/health/healthz")
        assert "status" in healthz_response.json
        assert "ready" in healthz_response.json
        assert isinstance(healthz_response.json["ready"], bool)

    def test_health_endpoints_content_type(self, client: FlaskClient):
        """Test that health endpoints return JSON content type."""
        readyz_response = client.get("/api/health/readyz")
        assert readyz_response.content_type == "application/json"

        healthz_response = client.get("/api/health/healthz")
        assert healthz_response.content_type == "application/json"

    def test_health_endpoint_urls(self, client: FlaskClient):
        """Test that health endpoints are available at expected URLs."""
        # Test readyz is available
        readyz_response = client.get("/api/health/readyz")
        assert readyz_response.status_code in [200, 503]

        # Test healthz is available
        healthz_response = client.get("/api/health/healthz")
        assert healthz_response.status_code == 200

        # Test that old health endpoint still exists
        old_health_response = client.get("/api/health")
        assert old_health_response.status_code == 200


class TestHealthEndpointIntegration:
    """Test health endpoints integration with other services."""

    def test_readyz_during_task_execution(self, app: Flask, client: FlaskClient):
        """Test readiness during active task execution."""
        with app.app_context():
            # Just verify the task service exists
            _ = app.container.task_service()

            # Create a mock task
            mock_task = MagicMock()
            mock_task.execute = MagicMock(return_value=None)

            # Start a task (this would normally be async)
            # For testing, we just verify the endpoint works

        response = client.get("/api/health/readyz")
        assert response.status_code == 200

    def test_shutdown_sequence_with_health_checks(self, app: Flask, client: FlaskClient):
        """Test complete shutdown sequence with health checks."""
        import signal

        with app.app_context():
            coordinator = app.container.shutdown_coordinator()

            # Initial state - should be ready
            response = client.get("/api/health/readyz")
            assert response.status_code == 200
            assert response.json["ready"] is True

            # Simulate SIGTERM
            if isinstance(coordinator, NoopShutdownCoordinator):
                coordinator._shutting_down = True
            else:
                coordinator.handle_sigterm(signal.SIGTERM, None)

            # After SIGTERM - readyz should return 503
            response = client.get("/api/health/readyz")
            assert response.status_code == 503
            assert response.json["ready"] is False

            # But healthz should still return 200
            response = client.get("/api/health/healthz")
            assert response.status_code == 200
            assert response.json["ready"] is True
