"""Tests for SSE Gateway callback API endpoint."""

from unittest.mock import Mock

import pytest

from app.services.connection_manager import ConnectionManager


class TestSSECallbackAPI:
    """Test SSE Gateway callback endpoint."""

    @pytest.fixture
    def mock_connection_manager(self):
        """Create mock ConnectionManager."""
        return Mock(spec=ConnectionManager)

    def test_connect_callback_extracts_request_id_and_calls_connection_manager(
        self, client, app, mock_connection_manager
    ):
        """Test connect callback extracts request_id and calls ConnectionManager."""
        payload = {
            "action": "connect",
            "token": "test-token-123",
            "request": {
                "url": "/api/sse/stream?request_id=abc123",
                "headers": {}
            }
        }

        with app.app_context():
            app.container.connection_manager.override(mock_connection_manager)

            response = client.post("/api/sse/callback", json=payload)

            assert response.status_code == 200
            # Verify ConnectionManager.on_connect was called with request_id, token, and url
            mock_connection_manager.on_connect.assert_called_once_with(
                "abc123",  # request_id
                "test-token-123",  # token
                "/api/sse/stream?request_id=abc123"  # url
            )

    def test_connect_callback_returns_empty_json(
        self, client, app, mock_connection_manager
    ):
        """Test connect callback returns empty JSON response."""
        payload = {
            "action": "connect",
            "token": "test-token",
            "request": {
                "url": "/api/sse/stream?request_id=test123",
                "headers": {}
            }
        }

        with app.app_context():
            app.container.connection_manager.override(mock_connection_manager)

            response = client.post("/api/sse/callback", json=payload)

            assert response.status_code == 200
            json_data = response.get_json()
            # SSE Gateway only checks status code, response body is empty
            assert json_data == {}
            # Ensure no connection_open event is present
            assert "event" not in json_data
            assert "connection_open" not in str(json_data)

    def test_disconnect_callback_calls_connection_manager(
        self, client, app, mock_connection_manager
    ):
        """Test disconnect callback calls ConnectionManager.on_disconnect."""
        payload = {
            "action": "disconnect",
            "token": "test-token-123",
            "reason": "client_disconnect",
            "request": {
                "url": "/api/sse/stream?request_id=abc123",
                "headers": {}
            }
        }

        with app.app_context():
            app.container.connection_manager.override(mock_connection_manager)

            response = client.post("/api/sse/callback", json=payload)

            assert response.status_code == 200
            # Verify ConnectionManager.on_disconnect was called with token
            mock_connection_manager.on_disconnect.assert_called_once_with("test-token-123")

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
        self, client, app, mock_connection_manager
    ):
        """Test secret authentication skipped in development mode."""
        payload = {
            "action": "connect",
            "token": "test-token",
            "request": {
                "url": "/api/sse/stream?request_id=test123",
                "headers": {}
            }
        }

        with app.app_context():
            app.container.connection_manager.override(mock_connection_manager)

            # No secret parameter - should still succeed in dev mode
            response = client.post("/api/sse/callback", json=payload)
            assert response.status_code == 200

    def test_missing_request_id_returns_400(
        self, client, app, mock_connection_manager
    ):
        """Test missing request_id query parameter returns 400."""
        payload = {
            "action": "connect",
            "token": "test-token",
            "request": {
                "url": "/api/sse/stream",  # Missing request_id
                "headers": {}
            }
        }

        with app.app_context():
            app.container.connection_manager.override(mock_connection_manager)

            response = client.post("/api/sse/callback", json=payload)

            assert response.status_code == 400
            json_data = response.get_json()
            assert "error" in json_data

    def test_invalid_json_returns_400(self, client, app, mock_connection_manager):
        """Test invalid JSON payload returns 400."""
        with app.app_context():
            app.container.connection_manager.override(mock_connection_manager)

            # Send invalid JSON
            response = client.post(
                "/api/sse/callback",
                data="not-valid-json",
                content_type="application/json"
            )

            assert response.status_code == 400

    def test_missing_json_body_returns_400(self, client, app, mock_connection_manager):
        """Test missing JSON body returns 400."""
        with app.app_context():
            app.container.connection_manager.override(mock_connection_manager)

            response = client.post("/api/sse/callback")

            assert response.status_code == 400
            json_data = response.get_json()
            assert "error" in json_data
            assert "Missing JSON body" in json_data["error"]

    def test_unknown_action_returns_400(self, client, app, mock_connection_manager):
        """Test unknown action returns 400."""
        payload = {
            "action": "unknown_action",
            "token": "test-token",
            "request": {
                "url": "/api/sse/stream?request_id=test123",
                "headers": {}
            }
        }

        with app.app_context():
            app.container.connection_manager.override(mock_connection_manager)

            response = client.post("/api/sse/callback", json=payload)

            assert response.status_code == 400
            json_data = response.get_json()
            assert "error" in json_data
            assert "Unknown action" in json_data["error"]

    def test_validation_error_returns_400(self, client, app, mock_connection_manager):
        """Test Pydantic validation error returns 400 with details."""
        payload = {
            "action": "connect",
            # Missing required 'token' field
            "request": {
                "url": "/api/sse/stream?request_id=test123",
                "headers": {}
            }
        }

        with app.app_context():
            app.container.connection_manager.override(mock_connection_manager)

            response = client.post("/api/sse/callback", json=payload)

            assert response.status_code == 400
            json_data = response.get_json()
            assert "error" in json_data
            assert "Invalid payload" in json_data["error"]
            assert "details" in json_data

    def test_request_id_with_colon_returns_400(self, client, app, mock_connection_manager):
        """Test request_id containing colon (reserved character) returns 400."""
        payload = {
            "action": "connect",
            "token": "test-token",
            "request": {
                "url": "/api/sse/stream?request_id=invalid:id",
                "headers": {}
            }
        }

        with app.app_context():
            app.container.connection_manager.override(mock_connection_manager)

            response = client.post("/api/sse/callback", json=payload)

            assert response.status_code == 400
            json_data = response.get_json()
            assert "error" in json_data
