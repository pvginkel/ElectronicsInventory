"""Unit tests for SSE client helper."""

import json
from unittest.mock import Mock, patch

import pytest
import requests

from tests.integration.sse_client_helper import SSEClient


class TestSSEClient:
    """Unit tests for SSEClient parsing logic."""

    @pytest.fixture
    def mock_response(self):
        """Create a mock response for SSE testing."""
        mock = Mock()
        mock.raise_for_status = Mock()
        return mock

    def _create_sse_stream(self, events: list[tuple[str, dict]]) -> list[str]:
        """Helper to create SSE-formatted stream lines.

        Args:
            events: List of (event_name, data_dict) tuples

        Returns:
            List of SSE-formatted lines (including blank line separators)
        """
        lines = []
        for event_name, data in events:
            lines.append(f"event: {event_name}")
            lines.append(f"data: {json.dumps(data)}")
            lines.append("")  # Blank line separator
        return lines

    def test_parse_single_event(self, mock_response):
        """Test parsing a single SSE event."""
        # Given a simple SSE stream with one event
        sse_lines = self._create_sse_stream([
            ("connection_open", {"status": "connected"})
        ])
        mock_response.iter_lines = Mock(return_value=iter(sse_lines))

        # When parsing the stream
        with patch("requests.get", return_value=mock_response):
            client = SSEClient("http://test.local/stream", strict=True)
            events = list(client.connect(timeout=5))

        # Then we get one parsed event
        assert len(events) == 1
        assert events[0]["event"] == "connection_open"
        assert events[0]["data"] == {"status": "connected"}

    def test_parse_multiple_events(self, mock_response):
        """Test parsing multiple SSE events."""
        # Given a stream with multiple events
        sse_lines = self._create_sse_stream([
            ("connection_open", {"status": "connected"}),
            ("task_event", {"event_type": "progress_update", "progress": 0.5}),
            ("task_event", {"event_type": "task_completed", "result": "done"}),
            ("connection_close", {"reason": "task_completed"})
        ])
        mock_response.iter_lines = Mock(return_value=iter(sse_lines))

        # When parsing the stream
        with patch("requests.get", return_value=mock_response):
            client = SSEClient("http://test.local/stream", strict=True)
            events = list(client.connect(timeout=5))

        # Then all events are parsed correctly
        assert len(events) == 4
        assert events[0]["event"] == "connection_open"
        assert events[1]["event"] == "task_event"
        assert events[1]["data"]["event_type"] == "progress_update"
        assert events[2]["data"]["event_type"] == "task_completed"
        assert events[3]["event"] == "connection_close"

    def test_parse_event_with_correlation_id(self, mock_response):
        """Test that correlation_id is preserved in event data."""
        # Given an event with correlation_id
        sse_lines = self._create_sse_stream([
            ("connection_open", {"status": "connected", "correlation_id": "test-123"})
        ])
        mock_response.iter_lines = Mock(return_value=iter(sse_lines))

        # When parsing
        with patch("requests.get", return_value=mock_response):
            client = SSEClient("http://test.local/stream", strict=True)
            events = list(client.connect())

        # Then correlation_id is preserved
        assert events[0]["data"]["correlation_id"] == "test-123"

    def test_parse_multiline_data(self, mock_response):
        """Test parsing event with multiple data lines (concatenated with newlines)."""
        # Given an event with multi-line data (rare in our implementation but valid SSE)
        sse_lines = [
            "event: multiline_test",
            "data: {",
            'data:   "field1": "value1",',
            'data:   "field2": "value2"',
            "data: }",
            ""
        ]
        mock_response.iter_lines = Mock(return_value=iter(sse_lines))

        # When parsing
        with patch("requests.get", return_value=mock_response):
            client = SSEClient("http://test.local/stream", strict=True)
            events = list(client.connect())

        # Then data lines are concatenated with newlines and parsed as JSON
        assert len(events) == 1
        assert events[0]["event"] == "multiline_test"
        assert events[0]["data"]["field1"] == "value1"
        assert events[0]["data"]["field2"] == "value2"

    def test_ignore_comment_lines(self, mock_response):
        """Test that SSE comment lines (starting with :) are ignored."""
        # Given a stream with comment lines
        sse_lines = [
            ": This is a comment",
            "event: test_event",
            ": Another comment",
            "data: {\"key\": \"value\"}",
            ""
        ]
        mock_response.iter_lines = Mock(return_value=iter(sse_lines))

        # When parsing
        with patch("requests.get", return_value=mock_response):
            client = SSEClient("http://test.local/stream", strict=True)
            events = list(client.connect())

        # Then comments are ignored, event is parsed
        assert len(events) == 1
        assert events[0]["event"] == "test_event"
        assert events[0]["data"] == {"key": "value"}

    def test_ignore_id_and_retry_fields(self, mock_response):
        """Test that optional id and retry fields are ignored."""
        # Given an event with id and retry fields (not used in our implementation)
        sse_lines = [
            "event: test_event",
            "id: 12345",
            "retry: 3000",
            "data: {\"key\": \"value\"}",
            ""
        ]
        mock_response.iter_lines = Mock(return_value=iter(sse_lines))

        # When parsing
        with patch("requests.get", return_value=mock_response):
            client = SSEClient("http://test.local/stream", strict=True)
            events = list(client.connect())

        # Then id/retry are ignored, event is parsed
        assert len(events) == 1
        assert events[0]["data"] == {"key": "value"}

    def test_strict_mode_raises_on_json_parse_error(self, mock_response):
        """Test that strict mode raises ValueError on JSON parse error."""
        # Given an event with invalid JSON
        sse_lines = [
            "event: bad_json",
            "data: {not valid json}",
            ""
        ]
        mock_response.iter_lines = Mock(return_value=iter(sse_lines))

        # When parsing in strict mode
        with patch("requests.get", return_value=mock_response):
            client = SSEClient("http://test.local/stream", strict=True)

            # Then ValueError is raised
            with pytest.raises(ValueError, match="Failed to parse SSE event data as JSON"):
                list(client.connect())

    def test_lenient_mode_continues_on_json_parse_error(self, mock_response):
        """Test that lenient mode logs warning and yields raw string on JSON parse error."""
        # Given an event with invalid JSON
        sse_lines = [
            "event: bad_json",
            "data: {not valid json}",
            "",
            "event: good_event",
            "data: {\"valid\": \"json\"}",
            ""
        ]
        mock_response.iter_lines = Mock(return_value=iter(sse_lines))

        # When parsing in lenient mode
        with patch("requests.get", return_value=mock_response):
            client = SSEClient("http://test.local/stream", strict=False)
            events = list(client.connect())

        # Then bad event yields raw string, good event parses normally
        assert len(events) == 2
        assert events[0]["event"] == "bad_json"
        assert events[0]["data"] == "{not valid json}"  # Raw string
        assert events[1]["event"] == "good_event"
        assert events[1]["data"] == {"valid": "json"}  # Parsed JSON

    def test_strict_mode_raises_on_malformed_line(self, mock_response):
        """Test that strict mode raises ValueError on malformed SSE line."""
        # Given a stream with malformed line (no field:value format)
        sse_lines = [
            "event: test_event",
            "this line has no colon separator",
            "data: {\"key\": \"value\"}",
            ""
        ]
        mock_response.iter_lines = Mock(return_value=iter(sse_lines))

        # When parsing in strict mode
        with patch("requests.get", return_value=mock_response):
            client = SSEClient("http://test.local/stream", strict=True)

            # Then ValueError is raised
            with pytest.raises(ValueError, match="Malformed SSE line"):
                list(client.connect())

    def test_lenient_mode_ignores_malformed_line(self, mock_response):
        """Test that lenient mode ignores malformed SSE lines."""
        # Given a stream with malformed line
        sse_lines = [
            "event: test_event",
            "this line has no colon separator",
            "data: {\"key\": \"value\"}",
            ""
        ]
        mock_response.iter_lines = Mock(return_value=iter(sse_lines))

        # When parsing in lenient mode
        with patch("requests.get", return_value=mock_response):
            client = SSEClient("http://test.local/stream", strict=False)
            events = list(client.connect())

        # Then malformed line is ignored, event is parsed
        assert len(events) == 1
        assert events[0]["event"] == "test_event"
        assert events[0]["data"] == {"key": "value"}

    def test_connection_closes_mid_stream(self, mock_response):
        """Test graceful handling when connection closes mid-stream."""
        # Given a stream that ends without blank line after last event
        sse_lines = [
            "event: connection_open",
            "data: {\"status\": \"connected\"}",
            "",
            "event: incomplete_event",
            "data: {\"partial\": \"data\"}"
            # No trailing blank line - stream closes
        ]
        mock_response.iter_lines = Mock(return_value=iter(sse_lines))

        # When parsing
        with patch("requests.get", return_value=mock_response):
            client = SSEClient("http://test.local/stream", strict=True)
            events = list(client.connect())

        # Then both events are parsed (last event handled at stream end)
        assert len(events) == 2
        assert events[0]["event"] == "connection_open"
        assert events[1]["event"] == "incomplete_event"
        assert events[1]["data"] == {"partial": "data"}

    def test_empty_stream(self, mock_response):
        """Test parsing empty SSE stream."""
        # Given an empty stream
        sse_lines: list[str] = []
        mock_response.iter_lines = Mock(return_value=iter(sse_lines))

        # When parsing
        with patch("requests.get", return_value=mock_response):
            client = SSEClient("http://test.local/stream", strict=True)
            events = list(client.connect())

        # Then no events are yielded
        assert len(events) == 0

    def test_timeout_parameter_passed_to_request(self, mock_response):
        """Test that timeout parameter is passed to requests.get."""
        # Given a client with specific timeout
        sse_lines = self._create_sse_stream([("test", {"data": "value"})])
        mock_response.iter_lines = Mock(return_value=iter(sse_lines))

        # When connecting with custom timeout
        with patch("requests.get", return_value=mock_response) as mock_get:
            client = SSEClient("http://test.local/stream", strict=True)
            list(client.connect(timeout=15.0))

            # Then timeout is passed to requests.get
            mock_get.assert_called_once_with("http://test.local/stream", stream=True, timeout=15.0)

    def test_http_error_raises_exception(self, mock_response):
        """Test that HTTP errors raise RequestException."""
        # Given a response that returns HTTP error
        mock_response.raise_for_status = Mock(side_effect=requests.HTTPError("404 Not Found"))

        # When connecting
        with patch("requests.get", return_value=mock_response):
            client = SSEClient("http://test.local/stream", strict=True)

            # Then HTTPError is raised
            with pytest.raises(requests.HTTPError):
                list(client.connect())
