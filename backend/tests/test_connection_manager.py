"""Unit tests for ConnectionManager service."""

import json
from unittest.mock import Mock, patch

import pytest
import requests

from app.services.connection_manager import ConnectionManager


@pytest.fixture
def mock_metrics():
    """Create a mock metrics service."""
    metrics = Mock()
    metrics.record_sse_gateway_connection = Mock()
    metrics.record_sse_gateway_event = Mock()
    metrics.record_sse_gateway_send_duration = Mock()
    return metrics


@pytest.fixture
def connection_manager(mock_metrics):
    """Create ConnectionManager instance with mock metrics."""
    return ConnectionManager(
        gateway_url="http://localhost:3000",
        metrics_service=mock_metrics,
        http_timeout=5.0
    )


class TestConnectionManagerConnect:
    """Tests for connection registration."""

    def test_on_connect_new_connection(self, connection_manager, mock_metrics):
        """Test registering a new connection."""
        # Given no existing connection
        identifier = "task:abc123"
        token = "token-1"
        url = "/api/sse/tasks?task_id=abc123"

        # When registering connection
        connection_manager.on_connect(identifier, token, url)

        # Then mapping is stored
        assert connection_manager.has_connection(identifier)
        assert connection_manager._connections[identifier] == {
            "token": token,
            "url": url,
        }
        assert connection_manager._token_to_identifier[token] == identifier

        # And metrics recorded
        mock_metrics.record_sse_gateway_connection.assert_called_once_with("task", "connect")

    @patch("app.services.connection_manager.requests.post")
    def test_on_connect_replaces_existing_connection(self, mock_post, connection_manager, mock_metrics):
        """Test that new connection closes old one before registering."""
        # Given existing connection
        identifier = "task:abc123"
        old_token = "old-token"
        new_token = "new-token"
        url = "/api/sse/tasks?task_id=abc123"

        connection_manager.on_connect(identifier, old_token, url)
        mock_metrics.reset_mock()

        # Mock successful close response
        mock_response = Mock()
        mock_response.status_code = 200
        mock_post.return_value = mock_response

        # When registering new connection with same identifier
        connection_manager.on_connect(identifier, new_token, url)

        # Then old connection was closed
        assert mock_post.call_count == 1
        call_args = mock_post.call_args
        assert call_args[1]["json"]["token"] == old_token
        assert call_args[1]["json"]["close"] is True

        # And new mapping stored
        assert connection_manager._connections[identifier]["token"] == new_token
        assert connection_manager._token_to_identifier[new_token] == identifier

        # And old reverse mapping removed
        assert old_token not in connection_manager._token_to_identifier

        # And metrics recorded
        assert mock_metrics.record_sse_gateway_connection.call_count == 1
        mock_metrics.record_sse_gateway_connection.assert_called_with("task", "connect")

    @patch("app.services.connection_manager.requests.post")
    def test_on_connect_continues_if_close_old_fails(self, mock_post, connection_manager):
        """Test that connection replacement continues even if closing old connection fails."""
        # Given existing connection
        identifier = "task:abc123"
        old_token = "old-token"
        new_token = "new-token"
        url = "/api/sse/tasks?task_id=abc123"

        connection_manager.on_connect(identifier, old_token, url)

        # Mock failed close response
        mock_post.side_effect = requests.RequestException("Connection failed")

        # When registering new connection
        connection_manager.on_connect(identifier, new_token, url)

        # Then new mapping still stored (best-effort close)
        assert connection_manager._connections[identifier]["token"] == new_token
        assert connection_manager._token_to_identifier[new_token] == identifier


class TestConnectionManagerDisconnect:
    """Tests for disconnect handling."""

    def test_on_disconnect_removes_mapping(self, connection_manager, mock_metrics):
        """Test that disconnect removes both mappings."""
        # Given active connection
        identifier = "task:abc123"
        token = "token-1"
        url = "/api/sse/tasks?task_id=abc123"
        connection_manager.on_connect(identifier, token, url)
        mock_metrics.reset_mock()

        # When disconnect called
        connection_manager.on_disconnect(token)

        # Then mappings removed
        assert not connection_manager.has_connection(identifier)
        assert identifier not in connection_manager._connections
        assert token not in connection_manager._token_to_identifier

        # And metrics recorded
        mock_metrics.record_sse_gateway_connection.assert_called_once_with("task", "disconnect")

    def test_on_disconnect_unknown_token(self, connection_manager, mock_metrics):
        """Test disconnect with unknown token (stale disconnect)."""
        # Given no connection
        token = "unknown-token"

        # When disconnect called
        connection_manager.on_disconnect(token)

        # Then no error (logged as debug)
        assert mock_metrics.record_sse_gateway_connection.call_count == 0

    def test_on_disconnect_stale_token_after_replacement(self, connection_manager, mock_metrics):
        """Test disconnect with old token after connection replacement."""
        # Given connection was replaced
        identifier = "task:abc123"
        old_token = "old-token"
        new_token = "new-token"
        url = "/api/sse/tasks?task_id=abc123"

        connection_manager._connections[identifier] = {"token": new_token, "url": url}
        connection_manager._token_to_identifier[new_token] = identifier
        connection_manager._token_to_identifier[old_token] = identifier  # Stale reverse mapping

        # When disconnect called with old token
        connection_manager.on_disconnect(old_token)

        # Then current connection preserved
        assert connection_manager.has_connection(identifier)
        assert connection_manager._connections[identifier]["token"] == new_token

        # And old reverse mapping cleaned up
        assert old_token not in connection_manager._token_to_identifier

        # And no disconnect metric recorded (stale)
        assert mock_metrics.record_sse_gateway_connection.call_count == 0


class TestConnectionManagerSendEvent:
    """Tests for sending events."""

    @patch("app.services.connection_manager.requests.post")
    def test_send_event_success(self, mock_post, connection_manager, mock_metrics):
        """Test sending event successfully."""
        # Given active connection
        identifier = "task:abc123"
        token = "token-1"
        url = "/api/sse/tasks?task_id=abc123"
        connection_manager.on_connect(identifier, token, url)
        mock_metrics.reset_mock()

        # Mock successful response
        mock_response = Mock()
        mock_response.status_code = 200
        mock_post.return_value = mock_response

        # When sending event
        event_data = {"status": "in_progress", "progress": 0.5}
        result = connection_manager.send_event(
            identifier,
            event_data,
            event_name="task_event",
            close=False
        )

        # Then HTTP POST made
        assert result is True
        assert mock_post.call_count == 1
        call_args = mock_post.call_args
        assert call_args[0][0] == "http://localhost:3000/internal/send"
        payload = call_args[1]["json"]
        assert payload["token"] == token
        assert payload["event"]["name"] == "task_event"
        assert json.loads(payload["event"]["data"]) == event_data
        assert payload["close"] is False

        # And metrics recorded
        mock_metrics.record_sse_gateway_event.assert_called_once_with("task", "success")
        assert mock_metrics.record_sse_gateway_send_duration.call_count == 1

    @patch("app.services.connection_manager.requests.post")
    def test_send_event_with_close(self, mock_post, connection_manager):
        """Test sending event with close flag."""
        # Given active connection
        identifier = "version:xyz789"
        token = "token-1"
        url = "/api/sse/utils/version?request_id=xyz789"
        connection_manager.on_connect(identifier, token, url)

        # Mock successful response
        mock_response = Mock()
        mock_response.status_code = 200
        mock_post.return_value = mock_response

        # When sending event with close
        event_data = {"version": "1.2.3"}
        result = connection_manager.send_event(
            identifier,
            event_data,
            event_name="version",
            close=True
        )

        # Then close flag set
        assert result is True
        payload = mock_post.call_args[1]["json"]
        assert payload["close"] is True

    def test_send_event_no_connection(self, connection_manager, mock_metrics):
        """Test sending event when no connection exists."""
        # Given no connection
        identifier = "task:nonexistent"

        # When sending event
        result = connection_manager.send_event(
            identifier,
            {"data": "test"},
            event_name="test"
        )

        # Then fails without HTTP call
        assert result is False
        assert mock_metrics.record_sse_gateway_event.call_count == 0

    @patch("app.services.connection_manager.requests.post")
    def test_send_event_404_removes_stale_mapping(self, mock_post, connection_manager, mock_metrics):
        """Test that 404 response removes stale connection mapping."""
        # Given active connection
        identifier = "task:abc123"
        token = "token-1"
        url = "/api/sse/tasks?task_id=abc123"
        connection_manager.on_connect(identifier, token, url)
        mock_metrics.reset_mock()

        # Mock 404 response (connection gone)
        mock_response = Mock()
        mock_response.status_code = 404
        mock_post.return_value = mock_response

        # When sending event
        result = connection_manager.send_event(identifier, {"data": "test"})

        # Then mapping removed
        assert result is False
        assert not connection_manager.has_connection(identifier)
        assert identifier not in connection_manager._connections
        assert token not in connection_manager._token_to_identifier

        # And error metrics recorded
        mock_metrics.record_sse_gateway_event.assert_called_once_with("task", "error")

    @patch("app.services.connection_manager.requests.post")
    def test_send_event_non_200_error(self, mock_post, connection_manager, mock_metrics):
        """Test handling of non-2xx responses."""
        # Given active connection
        identifier = "task:abc123"
        token = "token-1"
        url = "/api/sse/tasks?task_id=abc123"
        connection_manager.on_connect(identifier, token, url)
        mock_metrics.reset_mock()

        # Mock error response
        mock_response = Mock()
        mock_response.status_code = 500
        mock_response.text = "Internal Server Error"
        mock_post.return_value = mock_response

        # When sending event
        result = connection_manager.send_event(identifier, {"data": "test"})

        # Then fails but mapping preserved (non-404)
        assert result is False
        assert connection_manager.has_connection(identifier)

        # And error metrics recorded
        mock_metrics.record_sse_gateway_event.assert_called_once_with("task", "error")

    @patch("app.services.connection_manager.requests.post")
    def test_send_event_request_exception(self, mock_post, connection_manager, mock_metrics):
        """Test handling of request exceptions."""
        # Given active connection
        identifier = "task:abc123"
        token = "token-1"
        url = "/api/sse/tasks?task_id=abc123"
        connection_manager.on_connect(identifier, token, url)
        mock_metrics.reset_mock()

        # Mock request exception
        mock_post.side_effect = requests.RequestException("Connection timeout")

        # When sending event
        result = connection_manager.send_event(identifier, {"data": "test"})

        # Then fails but mapping preserved
        assert result is False
        assert connection_manager.has_connection(identifier)

        # And error metrics recorded
        mock_metrics.record_sse_gateway_event.assert_called_once_with("task", "error")
        assert mock_metrics.record_sse_gateway_send_duration.call_count == 1


class TestConnectionManagerHasConnection:
    """Tests for checking connection existence."""

    def test_has_connection_exists(self, connection_manager):
        """Test has_connection returns True for existing connection."""
        # Given active connection
        identifier = "task:abc123"
        connection_manager.on_connect(identifier, "token-1", "/api/sse/tasks?task_id=abc123")

        # When checking
        result = connection_manager.has_connection(identifier)

        # Then returns True
        assert result is True

    def test_has_connection_not_exists(self, connection_manager):
        """Test has_connection returns False for non-existent connection."""
        # Given no connection
        identifier = "task:nonexistent"

        # When checking
        result = connection_manager.has_connection(identifier)

        # Then returns False
        assert result is False


class TestConnectionManagerConcurrency:
    """Tests for thread safety."""

    @patch("app.services.connection_manager.requests.post")
    def test_concurrent_connects_same_identifier(self, mock_post, connection_manager):
        """Test that concurrent connects for same identifier are serialized."""
        import threading

        # Mock successful close response
        mock_response = Mock()
        mock_response.status_code = 200
        mock_post.return_value = mock_response

        identifier = "task:abc123"
        url = "/api/sse/tasks?task_id=abc123"
        results = []

        def connect_thread(token: str):
            connection_manager.on_connect(identifier, token, url)
            results.append(token)

        # When multiple threads connect simultaneously
        threads = [
            threading.Thread(target=connect_thread, args=(f"token-{i}",))
            for i in range(5)
        ]
        for t in threads:
            t.start()
        for t in threads:
            t.join()

        # Then only one connection remains
        assert connection_manager.has_connection(identifier)
        final_token = connection_manager._connections[identifier]["token"]
        assert final_token in [f"token-{i}" for i in range(5)]

        # And reverse mapping is consistent
        assert connection_manager._token_to_identifier[final_token] == identifier


class TestServiceTypeExtraction:
    """Tests for service type extraction."""

    def test_extract_service_type_task(self, connection_manager):
        """Test extracting task service type."""
        service_type = connection_manager._extract_service_type("task:abc123")
        assert service_type == "task"

    def test_extract_service_type_version(self, connection_manager):
        """Test extracting version service type."""
        service_type = connection_manager._extract_service_type("version:xyz789")
        assert service_type == "version"

    def test_extract_service_type_no_colon(self, connection_manager):
        """Test extracting service type without colon."""
        service_type = connection_manager._extract_service_type("invalid")
        assert service_type == "unknown"
