"""Tests for infrastructure utility endpoints."""

import threading
from unittest.mock import Mock, patch

import pytest
import requests
from flask import Flask

from app.services.container import ServiceContainer
from app.services.version_service import VersionService
from app.utils.shutdown_coordinator import LifetimeEvent


# Note: The /api/utils/version/stream endpoint was removed in favor of SSE Gateway pattern.
# SSE Gateway tests are in tests/api/test_sse.py


class TestVersionService:
    """Test version service methods."""

    @pytest.fixture
    def version_service(self, container: ServiceContainer):
        """Create version service instance for testing."""
        return container.version_service()

    def test_fetch_frontend_version_success(self, version_service: VersionService):
        """Test successful version fetching."""
        test_response = '{"version": "1.2.3", "buildTime": "2024-01-01T00:00:00Z"}'

        with patch('app.services.version_service.requests.get') as mock_get:
            mock_response = Mock()
            mock_response.text = test_response
            mock_response.raise_for_status = Mock()
            mock_get.return_value = mock_response

            result = version_service._fetch_frontend_version()
            assert result == {"version": "1.2.3", "buildTime": "2024-01-01T00:00:00Z"}
            assert mock_get.call_count == 1

    def test_fetch_frontend_version_http_error_fallback(self, version_service: VersionService):
        """Test version fetching with HTTP error returns fallback."""
        with patch('app.services.version_service.requests.get') as mock_get:
            mock_response = Mock()
            mock_response.raise_for_status.side_effect = requests.HTTPError("404 Not Found")
            mock_get.return_value = mock_response

            # Should not raise, returns fallback
            result = version_service._fetch_frontend_version()
            assert "version" in result
            assert result["version"] == "unknown"

    def test_fetch_frontend_version_timeout_fallback(self, version_service: VersionService):
        """Test version fetching with timeout returns fallback."""
        with patch('app.services.version_service.requests.get', side_effect=requests.Timeout("Request timed out")):
            # Should not raise, returns fallback
            result = version_service._fetch_frontend_version()
            assert "version" in result
            assert result["version"] == "unknown"

    def test_fetch_frontend_version_connection_error_fallback(self, version_service: VersionService):
        """Test version fetching with connection error returns fallback."""
        with patch('app.services.version_service.requests.get', side_effect=requests.ConnectionError("Connection failed")):
            # Should not raise, returns fallback
            result = version_service._fetch_frontend_version()
            assert "version" in result
            assert result["version"] == "unknown"

    def test_queue_version_event_for_pending_subscriber(self, version_service: VersionService):
        """Events should be queued for subscribers that have not connected yet."""
        request_id = "vs-pending"

        delivered = version_service.queue_version_event(request_id, "1.0.0")
        assert delivered is False

        queue = version_service.register_subscriber(request_id)
        try:
            event_name, payload = queue.get_nowait()
            assert event_name == "version"
            assert payload["version"] == "1.0.0"
        finally:
            version_service.unregister_subscriber(request_id)

    def test_queue_version_event_for_active_subscriber(self, version_service: VersionService):
        """Events should be delivered immediately to active subscribers."""
        request_id = "vs-active"
        queue = version_service.register_subscriber(request_id)

        try:
            delivered = version_service.queue_version_event(request_id, "2.0.0", changelog="Details")
            assert delivered is True
            event_name, payload = queue.get_nowait()
            assert event_name == "version"
            assert payload == {"version": "2.0.0", "changelog": "Details"}
        finally:
            version_service.unregister_subscriber(request_id)

    def test_unregister_subscriber_removes_listener(self, version_service: VersionService):
        """Unregistering should drop live queues and fall back to pending events."""
        request_id = "vs-unregister"
        version_service.register_subscriber(request_id)
        version_service.unregister_subscriber(request_id)

        delivered = version_service.queue_version_event(request_id, "3.1.4")
        assert delivered is False

        queue = version_service.register_subscriber(request_id)
        try:
            event_name, payload = queue.get_nowait()
            assert event_name == "version"
            assert payload["version"] == "3.1.4"
        finally:
            version_service.unregister_subscriber(request_id)

    def test_shutdown_sends_connection_close(self, version_service: VersionService):
        """Shutdown notifications should flush connection close events to subscribers."""
        request_id = "vs-shutdown"
        queue = version_service.register_subscriber(request_id)

        version_service._handle_lifetime_event(LifetimeEvent.PREPARE_SHUTDOWN)
        event_name, payload = queue.get_nowait()
        assert event_name == "connection_close"
        assert payload["reason"] == "server_shutdown"

        version_service._handle_lifetime_event(LifetimeEvent.SHUTDOWN)

        # Reset service state for subsequent tests
        version_service._is_shutting_down = False
        version_service._pending_events.clear()
        version_service._start_cleanup_thread()

    def test_queue_version_event_thread_safety(self, version_service: VersionService):
        """Concurrent queue writers should not drop events."""
        request_id = "vs-threaded"
        queue = version_service.register_subscriber(request_id)

        try:
            versions = [f"{idx}" for idx in range(10)]

            def worker(version: str) -> None:
                version_service.queue_version_event(request_id, version)

            threads = [threading.Thread(target=worker, args=(version,)) for version in versions]
            for thread in threads:
                thread.start()
            for thread in threads:
                thread.join()

            received = []
            while True:
                received.append(queue.get_nowait()[1]["version"])
                if len(received) == len(versions):
                    break

            assert sorted(received) == sorted(versions)
        finally:
            version_service.unregister_subscriber(request_id)


class TestSSEUtils:
    """Test shared SSE utility functions."""

    def test_format_sse_event_with_dict(self):
        """Test formatting SSE event with dictionary data."""
        from app.utils.sse_utils import format_sse_event

        result = format_sse_event("test_event", {"key": "value", "number": 42})

        expected = 'event: test_event\ndata: {"key": "value", "number": 42}\n\n'
        assert result == expected

    def test_format_sse_event_with_string(self):
        """Test formatting SSE event with string data."""
        from app.utils.sse_utils import format_sse_event

        result = format_sse_event("message", "Hello World")

        expected = 'event: message\ndata: Hello World\n\n'
        assert result == expected

    def test_create_sse_response(self):
        """Test creating SSE response with correct headers."""
        from app.utils.sse_utils import create_sse_response

        def test_generator():
            yield "data: test\n\n"

        response = create_sse_response(test_generator())

        assert response.mimetype == "text/event-stream"
        assert response.headers['Cache-Control'] == "no-cache"
        assert response.headers['Access-Control-Allow-Origin'] == "*"
        assert response.headers['Access-Control-Allow-Headers'] == "Cache-Control"
