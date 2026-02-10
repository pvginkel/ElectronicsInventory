"""Tests for health check API endpoints."""

from unittest.mock import patch

from flask import Flask
from flask.testing import FlaskClient

from tests.testing_utils import StubShutdownCoordinator


class TestHealthEndpoints:
    """Test health check endpoints for Kubernetes probes."""

    def test_readyz_when_ready(self, client: FlaskClient):
        """Test readiness probe returns 200 when ready."""
        # Mock the database functions since tests use SQLite with create_all() instead of migrations
        with patch('app.api.health.check_db_connection', return_value=True), \
             patch('app.api.health.get_pending_migrations', return_value=[]):

            response = client.get("/health/readyz")

            assert response.status_code == 200
            assert response.json["status"] == "ready"
            assert response.json["ready"] is True

    def test_readyz_when_shutting_down(self, app: Flask, client: FlaskClient):
        """Test readiness probe returns 503 when shutting down."""
        with app.app_context():
            coordinator = app.container.shutdown_coordinator()

            # Use proper interface to trigger shutdown
            if isinstance(coordinator, StubShutdownCoordinator):
                coordinator.simulate_shutdown()
            else:
                # For real coordinator, we'd need to handle sys.exit in tests
                coordinator._shutting_down = True

        response = client.get("/health/readyz")

        assert response.status_code == 503
        assert response.json["status"] == "shutting down"
        assert response.json["ready"] is False

    def test_healthz_always_returns_200(self, client: FlaskClient):
        """Test liveness probe always returns 200."""
        response = client.get("/health/healthz")

        assert response.status_code == 200
        assert response.json["status"] == "alive"
        assert response.json["ready"] is True

    def test_healthz_during_shutdown(self, app: Flask, client: FlaskClient):
        """Test liveness probe returns 200 even during shutdown."""
        with app.app_context():
            coordinator = app.container.shutdown_coordinator()

            # Use proper interface to trigger shutdown
            if isinstance(coordinator, StubShutdownCoordinator):
                coordinator.simulate_shutdown()
            else:
                # For real coordinator, we'd need to handle sys.exit in tests
                coordinator._shutting_down = True

        # Liveness should still return 200
        response = client.get("/health/healthz")

        assert response.status_code == 200
        assert response.json["status"] == "alive"
        assert response.json["ready"] is True

    def test_health_endpoints_response_format(self, client: FlaskClient):
        """Test that health endpoints return correct response format."""
        # Mock the database functions since tests use SQLite with create_all() instead of migrations
        with patch('app.api.health.check_db_connection', return_value=True), \
             patch('app.api.health.get_pending_migrations', return_value=[]):
            # Test readyz format
            readyz_response = client.get("/health/readyz")
            assert "status" in readyz_response.json
            assert "ready" in readyz_response.json
            assert isinstance(readyz_response.json["ready"], bool)

        # Test healthz format
        healthz_response = client.get("/health/healthz")
        assert "status" in healthz_response.json
        assert "ready" in healthz_response.json
        assert isinstance(healthz_response.json["ready"], bool)

    def test_health_endpoints_content_type(self, client: FlaskClient):
        """Test that health endpoints return JSON content type."""
        # Mock the database functions since tests use SQLite with create_all() instead of migrations
        with patch('app.api.health.check_db_connection', return_value=True), \
             patch('app.api.health.get_pending_migrations', return_value=[]):
            readyz_response = client.get("/health/readyz")
            assert readyz_response.content_type == "application/json"

        healthz_response = client.get("/health/healthz")
        assert healthz_response.content_type == "application/json"

    def test_health_endpoint_urls(self, client: FlaskClient):
        """Test that health endpoints are available at expected URLs."""
        # Mock the database functions since tests use SQLite with create_all() instead of migrations
        with patch('app.api.health.check_db_connection', return_value=True), \
             patch('app.api.health.get_pending_migrations', return_value=[]):
            # Test readyz is available
            readyz_response = client.get("/health/readyz")
            assert readyz_response.status_code in [200, 503]

        # Test healthz is available
        healthz_response = client.get("/health/healthz")
        assert healthz_response.status_code == 200

    def test_readyz_status_transitions(self, app: Flask, client: FlaskClient):
        """Test readiness probe status transitions during shutdown."""
        # Mock the database functions since tests use SQLite with create_all() instead of migrations
        with patch('app.api.health.check_db_connection', return_value=True), \
             patch('app.api.health.get_pending_migrations', return_value=[]):

            with app.app_context():
                coordinator = app.container.shutdown_coordinator()

                # Initially should be ready
                response = client.get("/health/readyz")
                assert response.status_code == 200
                assert response.json["ready"] is True

                # After shutdown signal, should not be ready
                if isinstance(coordinator, StubShutdownCoordinator):
                    coordinator.simulate_shutdown()
                else:
                    coordinator._shutting_down = True

                response = client.get("/health/readyz")
                assert response.status_code == 503
            assert response.json["ready"] is False

    def test_multiple_readyz_calls_during_shutdown(self, app: Flask, client: FlaskClient):
        """Test multiple readiness probe calls during shutdown."""
        with app.app_context():
            coordinator = app.container.shutdown_coordinator()

            # Trigger shutdown
            if isinstance(coordinator, StubShutdownCoordinator):
                coordinator.simulate_shutdown()
            else:
                coordinator._shutting_down = True

            # Multiple calls should consistently return 503
            for _ in range(5):
                response = client.get("/health/readyz")
                assert response.status_code == 503
                assert response.json["ready"] is False

    def test_healthz_consistency_during_shutdown(self, app: Flask, client: FlaskClient):
        """Test liveness probe consistency during shutdown."""
        with app.app_context():
            coordinator = app.container.shutdown_coordinator()

            # Trigger shutdown
            if isinstance(coordinator, StubShutdownCoordinator):
                coordinator.simulate_shutdown()
            else:
                coordinator._shutting_down = True

            # Multiple calls should consistently return 200
            for _ in range(5):
                response = client.get("/health/healthz")
                assert response.status_code == 200
                assert response.json["ready"] is True


class TestHealthEndpointIntegration:
    """Test health endpoints integration with other services."""

    def test_readyz_with_task_service(self, app: Flask, client: FlaskClient):
        """Test readiness during task service operations."""
        # Mock the database functions since tests use SQLite with create_all() instead of migrations
        with patch('app.api.health.check_db_connection', return_value=True), \
             patch('app.api.health.get_pending_migrations', return_value=[]):
            with app.app_context():
                # Verify task service is available
                task_service = app.container.task_service()
                assert task_service is not None

            response = client.get("/health/readyz")
            assert response.status_code == 200

    def test_health_endpoints_with_noop_coordinator(self, app: Flask, client: FlaskClient):
        """Test health endpoints work correctly with StubShutdownCoordinator."""
        # Mock the database functions since tests use SQLite with create_all() instead of migrations
        with patch('app.api.health.check_db_connection', return_value=True), \
             patch('app.api.health.get_pending_migrations', return_value=[]):
            with app.app_context():
                coordinator = app.container.shutdown_coordinator()

                # Should work with either type of coordinator
                response = client.get("/health/readyz")
                assert response.status_code == 200

                response = client.get("/health/healthz")
                assert response.status_code == 200

                # Test shutdown simulation with StubShutdownCoordinator
                if isinstance(coordinator, StubShutdownCoordinator):
                    coordinator.simulate_shutdown()

                    response = client.get("/health/readyz")
                    assert response.status_code == 503

                    # Healthz should still be 200
                    response = client.get("/health/healthz")
                    assert response.status_code == 200

    def test_health_endpoints_basic_functionality(self, app: Flask, client: FlaskClient):
        """Test basic health endpoint functionality."""
        # Test that endpoints work without any special conditions
        response = client.get("/health/readyz")
        assert response.status_code in [200, 503]

        response = client.get("/health/healthz")
        assert response.status_code == 200

    def test_concurrent_health_checks(self, app: Flask, client: FlaskClient):
        """Test concurrent health check requests."""
        import threading

        results = []

        def make_request():
            response = client.get("/health/readyz")
            results.append(response.status_code)

        # Make multiple concurrent requests
        threads = [threading.Thread(target=make_request) for _ in range(10)]

        for thread in threads:
            thread.start()

        for thread in threads:
            thread.join(timeout=5)

        # All requests should succeed
        assert len(results) == 10
        for status_code in results:
            assert status_code in [200, 503]  # Either ready or shutting down

    def test_health_check_service_lifecycle_simple(self, app: Flask, client: FlaskClient):
        """Test health checks during service lifecycle - simplified."""
        # Mock the database functions since tests use SQLite with create_all() instead of migrations
        with patch('app.api.health.check_db_connection', return_value=True), \
             patch('app.api.health.get_pending_migrations', return_value=[]):
            with app.app_context():
                coordinator = app.container.shutdown_coordinator()

                # Test during normal operation
                response = client.get("/health/readyz")
                initial_status = response.status_code
                assert initial_status == 200

                # Test during shutdown (simple simulation)
                if isinstance(coordinator, StubShutdownCoordinator):
                    coordinator.simulate_shutdown()

                    # Health check should now return 503
                    response = client.get("/health/readyz")
                    assert response.status_code == 503

    def test_readyz_status_messages(self, app: Flask, client: FlaskClient):
        """Test that readyz returns appropriate status messages."""
        # Mock the database functions since tests use SQLite with create_all() instead of migrations
        with patch('app.api.health.check_db_connection', return_value=True), \
             patch('app.api.health.get_pending_migrations', return_value=[]):
            with app.app_context():
                coordinator = app.container.shutdown_coordinator()

                # Ready state
                response = client.get("/health/readyz")
                assert response.json["status"] == "ready"

                # Shutting down state
                if isinstance(coordinator, StubShutdownCoordinator):
                    coordinator.simulate_shutdown()
                else:
                    coordinator._shutting_down = True

                response = client.get("/health/readyz")
                assert response.json["status"] == "shutting down"

    def test_healthz_status_consistency(self, app: Flask, client: FlaskClient):
        """Test that healthz always returns consistent status."""
        with app.app_context():
            coordinator = app.container.shutdown_coordinator()

            # Before shutdown
            response = client.get("/health/healthz")
            assert response.json["status"] == "alive"

            # During shutdown
            if isinstance(coordinator, StubShutdownCoordinator):
                coordinator.simulate_shutdown()
            else:
                coordinator._shutting_down = True

            response = client.get("/health/healthz")
            assert response.json["status"] == "alive"  # Should remain alive
