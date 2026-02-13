"""Unit tests for SSEConnectionManager service - Updated for SSE redesign."""

from unittest.mock import Mock, patch

import pytest

from app.services.sse_connection_manager import SSEConnectionManager


@pytest.fixture
def sse_connection_manager():
    """Create SSEConnectionManager instance for testing."""
    return SSEConnectionManager(
        gateway_url="http://localhost:3000",
        http_timeout=5.0
    )


class TestSSEConnectionManagerConnect:
    """Tests for connection registration."""

    def test_on_connect_new_connection(self, sse_connection_manager):
        """Test registering a new connection."""
        # Given no existing connection
        request_id = "abc123"
        token = "token-1"
        url = "/api/sse/stream?request_id=abc123"

        # When registering connection
        sse_connection_manager.on_connect(request_id, token, url)

        # Then mapping is stored
        assert sse_connection_manager.has_connection(request_id)
        assert sse_connection_manager._connections[request_id] == {
            "token": token,
            "url": url,
        }
        assert sse_connection_manager._token_to_request_id[token] == request_id

    def test_on_connect_notifies_observers(self, sse_connection_manager):
        """Test that on_connect notifies all registered observers."""
        # Given registered observers
        observer1 = Mock()
        observer2 = Mock()
        sse_connection_manager.register_on_connect(observer1)
        sse_connection_manager.register_on_connect(observer2)

        request_id = "abc123"
        token = "token-1"
        url = "/api/sse/stream?request_id=abc123"

        # When connection registered
        sse_connection_manager.on_connect(request_id, token, url)

        # Then all observers notified
        observer1.assert_called_once_with(request_id)
        observer2.assert_called_once_with(request_id)

    def test_on_connect_observer_exception_isolated(self, sse_connection_manager):
        """Test that observer exception doesn't break connection or other observers."""
        # Given first observer raises exception
        failing_observer = Mock(side_effect=Exception("Observer crashed"))
        working_observer = Mock()
        sse_connection_manager.register_on_connect(failing_observer)
        sse_connection_manager.register_on_connect(working_observer)

        request_id = "abc123"
        token = "token-1"
        url = "/api/sse/stream?request_id=abc123"

        # When connection registered (should not raise exception)
        sse_connection_manager.on_connect(request_id, token, url)

        # Then connection still registered
        assert sse_connection_manager.has_connection(request_id)

        # And second observer still called
        working_observer.assert_called_once_with(request_id)

        # And first observer was called (but raised)
        failing_observer.assert_called_once_with(request_id)


class TestBroadcastSend:
    """Tests for broadcast send functionality."""

    @patch("app.services.sse_connection_manager.requests.post")
    def test_broadcast_to_all_connections(self, mock_post, sse_connection_manager):
        """Test broadcasting event to all connections."""
        # Given multiple active connections
        sse_connection_manager.on_connect("req1", "token-1", "/api/sse/stream?request_id=req1")
        sse_connection_manager.on_connect("req2", "token-2", "/api/sse/stream?request_id=req2")
        sse_connection_manager.on_connect("req3", "token-3", "/api/sse/stream?request_id=req3")

        # Mock successful response
        mock_response = Mock()
        mock_response.status_code = 200
        mock_post.return_value = mock_response

        # When broadcasting event (request_id=None)
        event_data = {"version": "1.2.3"}
        result = sse_connection_manager.send_event(
            None,  # Broadcast to all
            event_data,
            event_name="version",
            service_type="version"
        )

        # Then event sent to all 3 connections
        assert result is True
        assert mock_post.call_count == 3

    def test_broadcast_with_no_connections_returns_false(self, sse_connection_manager):
        """Test broadcast returns False when no active connections."""
        # Given no active connections
        # When broadcasting event
        result = sse_connection_manager.send_event(
            None,
            {"version": "1.2.3"},
            event_name="version",
            service_type="version"
        )

        # Then returns False, no error raised
        assert result is False
