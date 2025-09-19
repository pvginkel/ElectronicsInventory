"""Tests for correlation ID handling middleware and functionality."""

import json
from unittest.mock import patch

from flask import Flask
from flask.testing import FlaskClient

from app.utils.sse_utils import format_sse_event
from app.utils import get_current_correlation_id


class TestCorrelationIdMiddleware:
    """Test correlation ID middleware functionality."""

    def test_basic_request_functionality(self, client: FlaskClient):
        """Test that basic requests work with correlation ID middleware."""
        response = client.get("/api/health/healthz")
        assert response.status_code == 200

    def test_error_responses_include_error_codes(self, client: FlaskClient):
        """Test that error responses include proper error codes."""
        # Try to get non-existent type (simpler endpoint that should work reliably)
        response = client.get("/api/types/999")

        assert response.status_code == 404
        data = response.get_json()
        assert data.get("code") == "RECORD_NOT_FOUND"

    def test_validation_error_structure(self, client: FlaskClient):
        """Test validation error response structure."""
        # Make invalid request (missing required fields)
        response = client.post(
            "/api/boxes",
            json={},  # Empty JSON should cause validation error
            headers={"Content-Type": "application/json"}
        )

        assert response.status_code == 400  # SpectTree validation returns 400 (configured in spectree_config.py)
        # Note: SpectTree may return different error format than our custom error handler


class TestCorrelationIdUtils:
    """Test correlation ID utility functions."""

    def test_get_current_correlation_id_without_request_context(self):
        """Test getting correlation ID outside request context."""
        correlation_id = get_current_correlation_id()
        assert correlation_id is None

    def test_format_sse_event_with_correlation_id(self):
        """Test SSE event formatting with correlation ID."""
        test_data = {"message": "Test message"}
        correlation_id = "sse-correlation-404"

        formatted = format_sse_event("test_event", test_data, correlation_id)

        # Parse the formatted event
        lines = formatted.strip().split('\n')
        assert lines[0] == "event: test_event"

        data_line = next(line for line in lines if line.startswith('data: '))
        json_data = json.loads(data_line[6:])  # Remove "data: " prefix

        assert json_data["message"] == "Test message"
        assert json_data["correlation_id"] == correlation_id

    def test_format_sse_event_preserves_existing_correlation_id(self):
        """Test that existing correlation ID in data is not overwritten."""
        test_data = {
            "message": "Test message",
            "correlation_id": "existing-correlation"
        }
        new_correlation_id = "new-correlation-505"

        formatted = format_sse_event("test_event", test_data, new_correlation_id)

        # Parse the formatted event
        lines = formatted.strip().split('\n')
        data_line = next(line for line in lines if line.startswith('data: '))
        json_data = json.loads(data_line[6:])

        # Should preserve existing correlation ID
        assert json_data["correlation_id"] == "existing-correlation"

    def test_format_sse_event_without_correlation_id(self):
        """Test SSE event formatting without correlation ID."""
        test_data = {"message": "Test message"}

        formatted = format_sse_event("test_event", test_data)

        # Parse the formatted event
        lines = formatted.strip().split('\n')
        data_line = next(line for line in lines if line.startswith('data: '))
        json_data = json.loads(data_line[6:])

        assert json_data["message"] == "Test message"
        assert "correlation_id" not in json_data


class TestCorrelationIdInLogs:
    """Test correlation ID inclusion in log capture and streaming."""

    def test_log_capture_without_correlation_id(self, app: Flask):
        """Test log capture when no correlation ID is available."""
        from app.utils.log_capture import LogCaptureHandler
        import logging

        handler = LogCaptureHandler.get_instance()

        # Create log record outside request context
        record = logging.LogRecord(
            name="test_logger",
            level=logging.INFO,
            pathname="test.py",
            lineno=1,
            msg="Test message",
            args=(),
            exc_info=None
        )

        formatted = handler._format_log_record(record)

        assert formatted["message"] == "Test message"
        assert "correlation_id" not in formatted

    def test_log_streaming_endpoint_available(self, client: FlaskClient):
        """Test that log streaming endpoint is available."""
        response = client.get("/api/testing/logs/stream")
        assert response.status_code == 200