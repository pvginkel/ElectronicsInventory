"""Tests for infrastructure utility endpoints."""

import threading
from unittest.mock import Mock, patch

import pytest
import requests

from app.services.container import ServiceContainer
from app.services.version_service import VersionService
from app.utils.lifecycle_coordinator import LifecycleEvent

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

    def test_queue_version_event_stores_as_pending(self, version_service: VersionService, container: ServiceContainer):
        """Events should be stored as pending and broadcast."""
        from unittest.mock import Mock

        request_id = "vs-pending"

        # Mock ConnectionManager to verify broadcast
        mock_connection_manager = Mock()
        version_service.connection_manager = mock_connection_manager

        # Queue a version event
        delivered = version_service.queue_version_event(request_id, "1.0.0")
        assert delivered is True  # Returns True after broadcasting

        # Verify it was broadcast via ConnectionManager
        mock_connection_manager.send_event.assert_called_once()
        call_args = mock_connection_manager.send_event.call_args
        # call_args has positional args and kwargs
        assert call_args.args[0] is None  # None = broadcast mode
        assert call_args.args[1] == {"version": "1.0.0"}
        assert call_args.kwargs["event_name"] == "version"
        assert call_args.kwargs["service_type"] == "version"

        # Verify it was stored as pending
        assert request_id in version_service._pending_version
        assert version_service._pending_version[request_id] == {"version": "1.0.0"}

    def test_queue_version_event_with_changelog(self, version_service: VersionService):
        """Events with changelog should be stored and broadcast."""
        from unittest.mock import Mock

        request_id = "vs-active"

        # Mock ConnectionManager
        mock_connection_manager = Mock()
        version_service.connection_manager = mock_connection_manager

        # Queue version with changelog
        delivered = version_service.queue_version_event(request_id, "2.0.0", changelog="Details")
        assert delivered is True

        # Verify it was broadcast
        call_args = mock_connection_manager.send_event.call_args
        assert call_args.args[1] == {"version": "2.0.0", "changelog": "Details"}

        # Verify it was stored as pending
        assert version_service._pending_version[request_id] == {"version": "2.0.0", "changelog": "Details"}

    def test_shutdown_returns_false_for_queue_version_event(self, version_service: VersionService):
        """Shutdown should prevent new version events from being queued."""
        request_id = "vs-shutdown"

        # Trigger shutdown
        version_service._handle_lifecycle_event(LifecycleEvent.PREPARE_SHUTDOWN)

        # Try to queue event during shutdown
        delivered = version_service.queue_version_event(request_id, "3.1.4")
        assert delivered is False

        # Clean up shutdown state for other tests
        version_service._handle_lifecycle_event(LifecycleEvent.SHUTDOWN)
        version_service._is_shutting_down = False

    def test_queue_version_event_thread_safety(self, version_service: VersionService):
        """Concurrent queue writers should not drop events."""
        from unittest.mock import Mock

        request_id = "vs-threaded"

        # Mock ConnectionManager to avoid real HTTP calls
        mock_connection_manager = Mock()
        version_service.connection_manager = mock_connection_manager

        versions = [f"{idx}" for idx in range(10)]

        def worker(version: str) -> None:
            version_service.queue_version_event(request_id, version)

        threads = [threading.Thread(target=worker, args=(version,)) for version in versions]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join()

        # Verify all events were broadcast
        assert mock_connection_manager.send_event.call_count == len(versions)

        # Last pending version should be one of the queued versions
        assert request_id in version_service._pending_version
        assert version_service._pending_version[request_id]["version"] in versions

    def test_pending_version_persists_after_send(self, version_service: VersionService):
        """Test pending version NOT cleared after sending, persists for reconnect."""
        from unittest.mock import Mock

        request_id = "req1"

        # Mock ConnectionManager
        mock_connection_manager = Mock()
        mock_connection_manager.send_event.return_value = True
        version_service.connection_manager = mock_connection_manager

        # Given pending version queued
        version_service.queue_version_event(request_id, "1.2.3", "Bug fixes")

        # Verify it was stored
        assert request_id in version_service._pending_version
        assert version_service._pending_version[request_id]["version"] == "1.2.3"

        # Reset mock to track next call
        mock_connection_manager.reset_mock()
        mock_connection_manager.send_event.return_value = True

        # When connection established and version sent
        version_service._on_connect_callback(request_id)

        # Verify version was sent (targeted send with request_id)
        mock_connection_manager.send_event.assert_called_once()
        call_args = mock_connection_manager.send_event.call_args
        assert call_args.args[0] == request_id  # Targeted send
        assert call_args.args[1]["version"] == "1.2.3"

        # Then pending version still stored (NOT cleared)
        assert request_id in version_service._pending_version
        assert version_service._pending_version[request_id]["version"] == "1.2.3"

        # Reset mock again
        mock_connection_manager.reset_mock()
        mock_connection_manager.send_event.return_value = True

        # When same request_id reconnects
        version_service._on_connect_callback(request_id)

        # Then same pending version sent again
        assert mock_connection_manager.send_event.call_count == 1
        second_call_args = mock_connection_manager.send_event.call_args
        assert second_call_args.args[0] == request_id
        assert second_call_args.args[1]["version"] == "1.2.3"


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
