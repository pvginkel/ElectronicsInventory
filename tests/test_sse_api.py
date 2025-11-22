"""Tests for SSE Gateway callback API endpoint."""

from unittest.mock import Mock

import pytest

from app.services.connection_manager import ConnectionManager
from app.services.task_service import TaskService
from app.services.version_service import VersionService


class TestSSECallbackAPI:
    """Test SSE Gateway callback endpoint."""

    @pytest.fixture
    def mock_task_service(self):
        """Create mock TaskService with necessary methods."""
        mock = Mock(spec=TaskService)
        mock.on_connect = Mock()
        mock.on_disconnect = Mock()
        return mock

    @pytest.fixture
    def mock_version_service(self):
        """Create mock VersionService with necessary methods."""
        mock = Mock(spec=VersionService)
        mock.on_connect = Mock()
        mock.on_disconnect = Mock()
        return mock

    @pytest.fixture
    def mock_connection_manager(self):
        """Create mock ConnectionManager."""
        return Mock(spec=ConnectionManager)

    def test_connect_callback_routes_to_task_service(
        self, client, app, mock_task_service, mock_version_service
    ):
        """Test connect callback routes to TaskService for task URLs."""
        payload = {
            "action": "connect",
            "token": "test-token-123",
            "request": {
                "url": "/api/sse/tasks?task_id=abc123",
                "headers": {}
            }
        }

        with app.app_context():
            app.container.task_service.override(mock_task_service)
            app.container.version_service.override(mock_version_service)

            response = client.post("/api/sse/callback", json=payload)

            assert response.status_code == 200
            # Verify TaskService.on_connect was called
            mock_task_service.on_connect.assert_called_once()
            call_args = mock_task_service.on_connect.call_args
            # First argument is the connect callback
            connect_callback = call_args[0][0]
            assert connect_callback.token == "test-token-123"
            assert connect_callback.request.url == "/api/sse/tasks?task_id=abc123"
            # Second argument is the task_id
            assert call_args[0][1] == "abc123"
            # Verify VersionService.on_connect was NOT called
            mock_version_service.on_connect.assert_not_called()

    def test_connect_callback_routes_to_version_service(
        self, client, app, mock_task_service, mock_version_service
    ):
        """Test connect callback routes to VersionService for version URLs."""
        payload = {
            "action": "connect",
            "token": "test-token-456",
            "request": {
                "url": "/api/sse/utils/version/stream?request_id=xyz789",
                "headers": {}
            }
        }

        with app.app_context():
            app.container.task_service.override(mock_task_service)
            app.container.version_service.override(mock_version_service)

            response = client.post("/api/sse/callback", json=payload)

            assert response.status_code == 200
            # Verify VersionService.on_connect was called
            mock_version_service.on_connect.assert_called_once()
            call_args = mock_version_service.on_connect.call_args
            # First argument is the connect callback
            connect_callback = call_args[0][0]
            assert connect_callback.token == "test-token-456"
            # Second argument is the request_id
            assert call_args[0][1] == "xyz789"
            # Verify TaskService.on_connect was NOT called
            mock_task_service.on_connect.assert_not_called()

    def test_connect_callback_returns_empty_json(
        self, client, app, mock_task_service, mock_version_service
    ):
        """Test connect callback returns empty JSON response."""
        payload = {
            "action": "connect",
            "token": "test-token",
            "request": {
                "url": "/api/sse/tasks?task_id=test123",
                "headers": {}
            }
        }

        with app.app_context():
            app.container.task_service.override(mock_task_service)
            app.container.version_service.override(mock_version_service)

            response = client.post("/api/sse/callback", json=payload)

            assert response.status_code == 200
            json_data = response.get_json()
            # SSE Gateway only checks status code, response body is empty
            assert json_data == {}
            # Ensure no connection_open event is present
            assert "event" not in json_data
            assert "connection_open" not in str(json_data)

    def test_disconnect_callback_routes_to_task_service(
        self, client, app, mock_task_service, mock_version_service
    ):
        """Test disconnect callback routes to TaskService for task URLs."""
        payload = {
            "action": "disconnect",
            "token": "test-token-123",
            "reason": "client_disconnect",
            "request": {
                "url": "/api/sse/tasks?task_id=abc123",
                "headers": {}
            }
        }

        with app.app_context():
            app.container.task_service.override(mock_task_service)
            app.container.version_service.override(mock_version_service)

            response = client.post("/api/sse/callback", json=payload)

            assert response.status_code == 200
            # Verify TaskService.on_disconnect was called
            mock_task_service.on_disconnect.assert_called_once()
            call_args = mock_task_service.on_disconnect.call_args
            disconnect_callback = call_args[0][0]
            assert disconnect_callback.token == "test-token-123"
            assert disconnect_callback.reason == "client_disconnect"
            # Verify VersionService.on_disconnect was NOT called
            mock_version_service.on_disconnect.assert_not_called()

    def test_disconnect_callback_routes_to_version_service(
        self, client, app, mock_task_service, mock_version_service
    ):
        """Test disconnect callback routes to VersionService for version URLs."""
        payload = {
            "action": "disconnect",
            "token": "test-token-456",
            "reason": "timeout",
            "request": {
                "url": "/api/sse/utils/version/stream?request_id=xyz789",
                "headers": {}
            }
        }

        with app.app_context():
            app.container.task_service.override(mock_task_service)
            app.container.version_service.override(mock_version_service)

            response = client.post("/api/sse/callback", json=payload)

            assert response.status_code == 200
            # Verify VersionService.on_disconnect was called
            mock_version_service.on_disconnect.assert_called_once()
            # Verify TaskService.on_disconnect was NOT called
            mock_task_service.on_disconnect.assert_not_called()

    def test_authentication_enforced_in_production_mode(self):
        """Test authentication function in production mode."""
        from app.api.sse import _authenticate_callback
        from app.config import Settings

        # Create settings for production
        settings = Settings(
            FLASK_ENV="production",
            SSE_CALLBACK_SECRET="my-secret-key",
            DATABASE_URL="sqlite:///:memory:",
            SECRET_KEY="test"
        )

        # Without secret - should fail
        assert _authenticate_callback(None, settings) is False

        # With wrong secret - should fail
        assert _authenticate_callback("wrong-secret", settings) is False

        # With correct secret - should succeed
        assert _authenticate_callback("my-secret-key", settings) is True

        # No secret configured in production - should fail
        settings_no_secret = Settings(
            FLASK_ENV="production",
            SSE_CALLBACK_SECRET="",
            DATABASE_URL="sqlite:///:memory:",
            SECRET_KEY="test"
        )
        assert _authenticate_callback("any-secret", settings_no_secret) is False

    def test_authentication_skipped_in_dev_mode(
        self, client, app, mock_task_service, mock_version_service
    ):
        """Test secret authentication skipped in development mode."""
        payload = {
            "action": "connect",
            "token": "test-token",
            "request": {
                "url": "/api/sse/tasks?task_id=test123",
                "headers": {}
            }
        }

        with app.app_context():
            app.container.task_service.override(mock_task_service)
            app.container.version_service.override(mock_version_service)

            # No secret parameter - should still succeed in dev mode
            response = client.post("/api/sse/callback", json=payload)
            assert response.status_code == 200

    def test_unknown_url_pattern_returns_400(
        self, client, app, mock_task_service, mock_version_service
    ):
        """Test unknown URL pattern returns 400 for connect."""
        payload = {
            "action": "connect",
            "token": "test-token",
            "request": {
                "url": "/api/unknown/endpoint",
                "headers": {}
            }
        }

        with app.app_context():
            app.container.task_service.override(mock_task_service)
            app.container.version_service.override(mock_version_service)

            response = client.post("/api/sse/callback", json=payload)

            assert response.status_code == 400
            json_data = response.get_json()
            assert "error" in json_data
            assert "Cannot route URL" in json_data["error"]

    def test_disconnect_unknown_url_returns_200(
        self, client, app, mock_task_service, mock_version_service
    ):
        """Test disconnect callback for unknown URL returns 200 (stale disconnect)."""
        payload = {
            "action": "disconnect",
            "token": "test-token",
            "reason": "client_disconnect",
            "request": {
                "url": "/api/unknown/endpoint",
                "headers": {}
            }
        }

        with app.app_context():
            app.container.task_service.override(mock_task_service)
            app.container.version_service.override(mock_version_service)

            response = client.post("/api/sse/callback", json=payload)

            # Stale disconnect for unknown URL should succeed silently
            assert response.status_code == 200

    def test_missing_task_id_returns_400(
        self, client, app, mock_task_service, mock_version_service
    ):
        """Test missing task_id query parameter returns 400."""
        payload = {
            "action": "connect",
            "token": "test-token",
            "request": {
                "url": "/api/sse/tasks",  # Missing task_id parameter
                "headers": {}
            }
        }

        with app.app_context():
            app.container.task_service.override(mock_task_service)
            app.container.version_service.override(mock_version_service)

            response = client.post("/api/sse/callback", json=payload)

            assert response.status_code == 400
            json_data = response.get_json()
            assert "error" in json_data

    def test_missing_request_id_returns_400(
        self, client, app, mock_task_service, mock_version_service
    ):
        """Test missing request_id query parameter returns 400."""
        payload = {
            "action": "connect",
            "token": "test-token",
            "request": {
                "url": "/api/sse/utils/version/stream",  # Missing request_id
                "headers": {}
            }
        }

        with app.app_context():
            app.container.task_service.override(mock_task_service)
            app.container.version_service.override(mock_version_service)

            response = client.post("/api/sse/callback", json=payload)

            assert response.status_code == 400
            json_data = response.get_json()
            assert "error" in json_data

    def test_invalid_json_returns_400(self, client, app, mock_task_service, mock_version_service):
        """Test invalid JSON payload returns 400."""
        with app.app_context():
            app.container.task_service.override(mock_task_service)
            app.container.version_service.override(mock_version_service)

            # Send invalid JSON
            response = client.post(
                "/api/sse/callback",
                data="not-valid-json",
                content_type="application/json"
            )

            assert response.status_code == 400

    def test_missing_json_body_returns_400(self, client, app, mock_task_service, mock_version_service):
        """Test missing JSON body returns 400."""
        with app.app_context():
            app.container.task_service.override(mock_task_service)
            app.container.version_service.override(mock_version_service)

            response = client.post("/api/sse/callback")

            assert response.status_code == 400
            json_data = response.get_json()
            assert "error" in json_data
            assert "Missing JSON body" in json_data["error"]

    def test_unknown_action_returns_400(self, client, app, mock_task_service, mock_version_service):
        """Test unknown action returns 400."""
        payload = {
            "action": "unknown_action",
            "token": "test-token",
            "request": {
                "url": "/api/sse/tasks?task_id=test123",
                "headers": {}
            }
        }

        with app.app_context():
            app.container.task_service.override(mock_task_service)
            app.container.version_service.override(mock_version_service)

            response = client.post("/api/sse/callback", json=payload)

            assert response.status_code == 400
            json_data = response.get_json()
            assert "error" in json_data
            assert "Unknown action" in json_data["error"]

    def test_validation_error_returns_400(self, client, app, mock_task_service, mock_version_service):
        """Test Pydantic validation error returns 400 with details."""
        payload = {
            "action": "connect",
            # Missing required 'token' field
            "request": {
                "url": "/api/sse/tasks?task_id=test123",
                "headers": {}
            }
        }

        with app.app_context():
            app.container.task_service.override(mock_task_service)
            app.container.version_service.override(mock_version_service)

            response = client.post("/api/sse/callback", json=payload)

            assert response.status_code == 400
            json_data = response.get_json()
            assert "error" in json_data
            assert "Invalid payload" in json_data["error"]
            assert "details" in json_data

    def test_task_id_with_colon_returns_400(self, client, app, mock_task_service, mock_version_service):
        """Test task_id containing colon (reserved character) returns 400."""
        payload = {
            "action": "connect",
            "token": "test-token",
            "request": {
                "url": "/api/sse/tasks?task_id=invalid:id",
                "headers": {}
            }
        }

        with app.app_context():
            app.container.task_service.override(mock_task_service)
            app.container.version_service.override(mock_version_service)

            response = client.post("/api/sse/callback", json=payload)

            assert response.status_code == 400
            json_data = response.get_json()
            assert "error" in json_data

    def test_request_id_with_colon_returns_400(self, client, app, mock_task_service, mock_version_service):
        """Test request_id containing colon (reserved character) returns 400."""
        payload = {
            "action": "connect",
            "token": "test-token",
            "request": {
                "url": "/api/sse/utils/version/stream?request_id=invalid:id",
                "headers": {}
            }
        }

        with app.app_context():
            app.container.task_service.override(mock_task_service)
            app.container.version_service.override(mock_version_service)

            response = client.post("/api/sse/callback", json=payload)

            assert response.status_code == 400
            json_data = response.get_json()
            assert "error" in json_data
