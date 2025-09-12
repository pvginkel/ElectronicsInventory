"""Tests for infrastructure utility endpoints."""

from unittest.mock import Mock, patch

import pytest
import requests
from flask import Flask

from app.services.container import ServiceContainer
from app.services.version_service import VersionService


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
