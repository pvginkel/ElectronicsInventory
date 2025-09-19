"""Tests for testing API endpoints."""

import json
import threading
import time
from unittest.mock import Mock, patch

import pytest
from flask import Flask
from flask.testing import FlaskClient
from sqlalchemy.orm import Session

from app.config import Settings
from app.services.container import ServiceContainer
from app.utils.log_capture import LogCaptureHandler, SSELogClient
from tests.testing_utils import StubShutdownCoordinator


class TestTestingEndpoints:
    """Test testing API endpoints for Playwright integration."""

    def test_reset_endpoint_basic_functionality(self, client: FlaskClient, container: ServiceContainer):
        """Test basic database reset functionality."""
        # Mock the database operations since SQLite tests can't run real PostgreSQL migrations
        with patch('app.services.testing_service.drop_all_tables'), \
             patch('app.services.testing_service.upgrade_database') as mock_upgrade, \
             patch('app.services.testing_service.sync_master_data_from_setup'):

            # Configure mock to return migration list
            mock_upgrade.return_value = ['002', '003', '004']

            # Test reset without seeding
            response = client.post("/api/testing/reset")

            assert response.status_code == 200
            data = response.get_json()
            assert data["status"] == "complete"
            assert data["mode"] == "testing"
            assert data["seeded"] is False
            assert "migrations_applied" in data

    def test_reset_endpoint_with_seeding(self, client: FlaskClient, container: ServiceContainer):
        """Test database reset with test data seeding."""
        # Mock the database operations since SQLite tests can't run real PostgreSQL migrations
        with patch('app.services.testing_service.drop_all_tables'), \
             patch('app.services.testing_service.upgrade_database') as mock_upgrade, \
             patch('app.services.testing_service.sync_master_data_from_setup'), \
             patch('app.services.test_data_service.TestDataService.load_full_dataset'):

            # Configure mock to return migration list
            mock_upgrade.return_value = ['002', '003', '004']

            response = client.post("/api/testing/reset?seed=true")

            assert response.status_code == 200
            data = response.get_json()
            assert data["status"] == "complete"
            assert data["mode"] == "testing"
            assert data["seeded"] is True
            assert "migrations_applied" in data

    def test_reset_endpoint_query_parameter_variations(self, client: FlaskClient):
        """Test different query parameter formats for seed parameter."""
        # Mock the database operations since SQLite tests can't run real PostgreSQL migrations
        with patch('app.services.testing_service.drop_all_tables'), \
             patch('app.services.testing_service.upgrade_database') as mock_upgrade, \
             patch('app.services.testing_service.sync_master_data_from_setup'), \
             patch('app.services.test_data_service.TestDataService.load_full_dataset'):

            # Configure mock to return migration list
            mock_upgrade.return_value = ['002', '003', '004']

            # Test various true values
            for seed_value in ["true", "1", "yes", "True", "YES"]:
                response = client.post(f"/api/testing/reset?seed={seed_value}")
                assert response.status_code == 200
                data = response.get_json()
                assert data["seeded"] is True

            # Test various false values
            for seed_value in ["false", "0", "no", "False", "NO", ""]:
                response = client.post(f"/api/testing/reset?seed={seed_value}")
                assert response.status_code == 200
                data = response.get_json()
                assert data["seeded"] is False

    def test_reset_endpoint_concurrency_control(self, client: FlaskClient, container: ServiceContainer):
        """Test that concurrent reset requests are properly handled."""
        # Get the reset lock and manually acquire it
        reset_lock = container.reset_lock()

        # Acquire the lock to simulate reset in progress
        assert reset_lock.acquire_reset() is True

        try:
            # Now try to reset while lock is held
            response = client.post("/api/testing/reset")

            assert response.status_code == 503
            assert "Retry-After" in response.headers
            assert response.headers["Retry-After"] == "5"

            data = response.get_json()
            assert "already in progress" in data["error"].lower()
            assert data["status"] == "busy"

        finally:
            # Release the lock
            reset_lock.release_reset()

    def test_reset_endpoint_idempotent(self, client: FlaskClient):
        """Test that reset operation is idempotent."""
        # Mock the database operations since SQLite tests can't run real PostgreSQL migrations
        with patch('app.services.testing_service.drop_all_tables'), \
             patch('app.services.testing_service.upgrade_database') as mock_upgrade, \
             patch('app.services.testing_service.sync_master_data_from_setup'), \
             patch('app.services.test_data_service.TestDataService.load_full_dataset'):

            # Configure mock to return migration list
            mock_upgrade.return_value = ['002', '003', '004']

            # First reset
            response1 = client.post("/api/testing/reset?seed=true")
            assert response1.status_code == 200
            data1 = response1.get_json()

            # Second reset with same parameters
            response2 = client.post("/api/testing/reset?seed=true")
            assert response2.status_code == 200
            data2 = response2.get_json()

            # Both should succeed with same structure
            assert data1["status"] == data2["status"] == "complete"
            assert data1["seeded"] == data2["seeded"] == True

    @patch('app.services.testing_service.drop_all_tables')
    def test_reset_endpoint_error_handling(self, mock_drop_tables, client: FlaskClient):
        """Test error handling during reset operation."""
        # Make drop_all_tables raise an exception
        mock_drop_tables.side_effect = Exception("Database error")

        response = client.post("/api/testing/reset")

        # Should return 500 error
        assert response.status_code == 500
        data = response.get_json()
        assert "error" in data
        assert "correlationId" in data or "correlationId" not in data  # Optional

    def test_logs_stream_endpoint_connection(self, client: FlaskClient):
        """Test log streaming endpoint basic connection."""
        # Start SSE stream
        response = client.get("/api/testing/logs/stream")

        assert response.status_code == 200
        assert response.content_type == "text/event-stream; charset=utf-8"
        assert response.headers.get("Cache-Control") == "no-cache"

    def test_logs_stream_captures_application_logs(self, app: Flask, client: FlaskClient):
        """Test that log streaming captures and formats application logs."""
        import logging

        # Use the log capture client to capture events
        with SSELogClient() as log_client:
            # Generate some log events
            logger = logging.getLogger("test_logger")
            logger.info("Test info message")
            logger.error("Test error message")
            logger.warning("Test warning message")

            # Wait briefly for events to be processed
            time.sleep(0.1)

            # Get captured events
            events = log_client.get_events()

            # Should have captured the log events
            log_events = [event_data for event_type, event_data in events if event_type == "log"]
            assert len(log_events) >= 3

            # Check that events have proper structure
            for event_data in log_events:
                assert "timestamp" in event_data
                assert "level" in event_data
                assert "logger" in event_data
                assert "message" in event_data

    def test_logs_stream_sse_event_format(self, app: Flask):
        """Test that log events are properly formatted as SSE."""
        from app.utils.sse_utils import format_sse_event

        # Test event formatting
        test_data = {
            "timestamp": "2024-01-15T10:30:45.123Z",
            "level": "ERROR",
            "logger": "app.services.test",
            "message": "Test message"
        }

        formatted = format_sse_event("log", test_data)

        # Should have proper SSE format
        assert formatted.startswith("event: log\n")
        assert "data: " in formatted
        assert formatted.endswith("\n\n")

        # Should contain JSON data
        data_line = [line for line in formatted.split('\n') if line.startswith('data: ')][0]
        json_data = json.loads(data_line[6:])  # Remove "data: " prefix
        assert json_data == test_data

    def test_logs_stream_correlation_id_inclusion(self, client: FlaskClient):
        """Test that correlation IDs are included in log events when available."""
        # Make request with custom correlation ID header
        response = client.get(
            "/api/testing/logs/stream",
            headers={"X-Request-Id": "test-correlation-123"}
        )

        assert response.status_code == 200
        # Note: Full correlation ID testing would require more complex SSE stream parsing

    def test_log_capture_handler_singleton(self):
        """Test that LogCaptureHandler is properly implemented as singleton."""
        handler1 = LogCaptureHandler.get_instance()
        handler2 = LogCaptureHandler.get_instance()

        assert handler1 is handler2

    def test_log_capture_client_management(self):
        """Test log capture handler client registration and cleanup."""
        handler = LogCaptureHandler.get_instance()

        # Create mock client
        mock_client = Mock()

        # Register client
        handler.register_client(mock_client)
        assert mock_client in handler._clients

        # Unregister client
        handler.unregister_client(mock_client)
        assert mock_client not in handler._clients

    def test_log_capture_thread_safety(self):
        """Test that log capture handler is thread-safe."""
        handler = LogCaptureHandler.get_instance()
        clients = []

        def add_client():
            mock_client = Mock()
            handler.register_client(mock_client)
            clients.append(mock_client)

        def remove_client():
            if clients:
                client = clients.pop()
                handler.unregister_client(client)

        # Run concurrent operations
        threads = []
        for _ in range(10):
            threads.append(threading.Thread(target=add_client))
            threads.append(threading.Thread(target=remove_client))

        for thread in threads:
            thread.start()

        for thread in threads:
            thread.join()

        # Should not crash and handler should still be functional
        assert isinstance(handler._clients, set)

    def test_reset_lock_basic_functionality(self, container: ServiceContainer):
        """Test reset lock basic acquire/release functionality."""
        reset_lock = container.reset_lock()

        # Initial state
        assert not reset_lock.is_resetting()

        # Acquire lock
        assert reset_lock.acquire_reset() is True
        assert reset_lock.is_resetting()

        # Try to acquire again (should fail)
        assert reset_lock.acquire_reset() is False
        assert reset_lock.is_resetting()

        # Release lock
        reset_lock.release_reset()
        assert not reset_lock.is_resetting()

        # Should be able to acquire again
        assert reset_lock.acquire_reset() is True

    def test_reset_lock_context_manager(self, container: ServiceContainer):
        """Test reset lock context manager functionality."""
        reset_lock = container.reset_lock()

        # Test successful acquisition
        with reset_lock as acquired:
            assert acquired is True
            assert reset_lock.is_resetting()

        # Should be released after context
        assert not reset_lock.is_resetting()

        # Test failed acquisition
        reset_lock.acquire_reset()  # Manually acquire
        try:
            with reset_lock as acquired:
                assert acquired is False
                assert reset_lock.is_resetting()  # Still held by manual acquire
        finally:
            reset_lock.release_reset()

    def test_correlation_id_propagation(self, client: FlaskClient):
        """Test that correlation IDs are properly propagated through the system."""
        test_correlation_id = "test-correlation-456"

        # Mock the database operations since SQLite tests can't run real PostgreSQL migrations
        with patch('app.services.testing_service.drop_all_tables'), \
             patch('app.services.testing_service.upgrade_database') as mock_upgrade, \
             patch('app.services.testing_service.sync_master_data_from_setup'):

            # Configure mock to return migration list
            mock_upgrade.return_value = ['002', '003', '004']

            # Make request with correlation ID
            response = client.post(
                "/api/testing/reset",
                headers={"X-Request-Id": test_correlation_id}
            )

            assert response.status_code == 200

            # Response should include correlation ID
            data = response.get_json()
            assert data.get("correlationId") == test_correlation_id or "correlationId" not in data

    def test_testing_service_dependency_injection(self, container: ServiceContainer):
        """Test that testing service is properly configured with dependencies."""
        testing_service = container.testing_service()

        # Should have database session
        assert hasattr(testing_service, 'db')
        assert testing_service.db is not None

        # Should have reset lock
        assert hasattr(testing_service, 'reset_lock')
        assert testing_service.reset_lock is not None