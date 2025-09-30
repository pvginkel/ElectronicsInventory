"""Tests for infrastructure utility endpoints."""

import threading
from unittest.mock import Mock, patch

import pytest
import requests
from flask import Flask

from app.services.container import ServiceContainer
from app.services.version_service import VersionService
from app.utils.shutdown_coordinator import LifetimeEvent


class TestUtilsAPI:
    """Test utils API endpoints."""

    def test_version_stream_endpoint_exists(self, client, app: Flask, container: ServiceContainer):
        """Test that version stream endpoint exists and returns correct headers."""
        # Mock the version service to prevent actual HTTP calls
        with patch.object(VersionService, 'fetch_frontend_version', side_effect=requests.RequestException("Test error")):
            response = client.get('/api/utils/version/stream')

            assert response.status_code == 200
            assert 'text/event-stream' in response.headers['Content-Type']
            assert response.headers['Cache-Control'] == 'no-cache'
            assert 'Access-Control-Allow-Origin' in response.headers

    def test_version_stream_with_request_id_registers_subscriber(
        self,
        client,
        container: ServiceContainer,
    ):
        """Providing request_id should register with VersionService and include correlation IDs."""
        version_service = container.version_service()
        request_id = "stream-test-id"

        with patch.object(version_service, 'fetch_frontend_version', return_value='{"version":"1.0.0"}'), \
             patch.object(version_service, 'register_subscriber', wraps=version_service.register_subscriber) as mock_register, \
             patch.object(version_service, 'unregister_subscriber', wraps=version_service.unregister_subscriber) as mock_unregister:

            response = client.get('/api/utils/version/stream?request_id=' + request_id, buffered=False)
            stream = response.response

            first_chunk = next(stream).decode()
            second_chunk = next(stream).decode()
            third_chunk = next(stream).decode()

            response.close()

        assert mock_register.called
        assert mock_unregister.called
        assert 'connection_open' in first_chunk
        assert f'"correlation_id": "{request_id}"' in first_chunk
        assert 'event: version' in second_chunk
        assert f'"correlation_id": "{request_id}"' in second_chunk
        assert f'"correlation_id": "{request_id}"' in third_chunk

    def test_version_stream_without_request_id_still_registers(
        self,
        client,
        container: ServiceContainer,
    ):
        """Without request_id the stream registers with the generated correlation ID."""
        version_service = container.version_service()

        with patch.object(version_service, 'fetch_frontend_version', return_value='{"version":"1.0.0"}'), \
             patch.object(version_service, 'register_subscriber', wraps=version_service.register_subscriber) as mock_register:

            response = client.get('/api/utils/version/stream', buffered=False)
            stream = response.response

            first_chunk = next(stream).decode()
            second_chunk = next(stream).decode()

            response.close()

        mock_register.assert_called_once()
        assert 'correlation_id' in first_chunk
        assert 'correlation_id' in second_chunk


class TestVersionService:
    """Test version service methods."""

    @pytest.fixture
    def version_service(self, container: ServiceContainer):
        """Create version service instance for testing."""
        return container.version_service()

    def test_fetch_frontend_version_success(self, version_service: VersionService):
        """Test successful version fetching."""
        test_response = '{"version": "1.2.3", "buildTime": "2024-01-01T00:00:00Z"}'

        with patch('requests.get') as mock_get:
            mock_response = Mock()
            mock_response.text = test_response
            mock_response.raise_for_status = Mock()
            mock_get.return_value = mock_response

            result = version_service.fetch_frontend_version()

            assert result == test_response
            mock_get.assert_called_once_with(version_service.settings.FRONTEND_VERSION_URL, timeout=5)
            mock_response.raise_for_status.assert_called_once()

    def test_fetch_frontend_version_http_error(self, version_service: VersionService):
        """Test version fetching with HTTP error."""
        with patch('requests.get') as mock_get:
            mock_response = Mock()
            mock_response.raise_for_status.side_effect = requests.HTTPError("404 Not Found")
            mock_get.return_value = mock_response

            with pytest.raises(requests.HTTPError):
                version_service.fetch_frontend_version()

    def test_fetch_frontend_version_timeout(self, version_service: VersionService):
        """Test version fetching with timeout."""
        with patch('requests.get', side_effect=requests.Timeout("Request timed out")) as mock_get:
            with pytest.raises(requests.Timeout):
                version_service.fetch_frontend_version()

            mock_get.assert_called_once_with(version_service.settings.FRONTEND_VERSION_URL, timeout=5)

    def test_fetch_frontend_version_connection_error(self, version_service: VersionService):
        """Test version fetching with connection error."""
        with patch('requests.get', side_effect=requests.ConnectionError("Connection failed")):
            with pytest.raises(requests.ConnectionError):
                version_service.fetch_frontend_version()

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
