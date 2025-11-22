"""Baseline integration tests for version stream SSE endpoint.

These tests validate the current Flask SSE implementation behavior before migrating
to SSE Gateway. They use a real Flask server (waitress) and SSE client to test
actual streaming behavior.
"""

import time

import pytest


@pytest.mark.integration
class TestVersionStreamBaseline:
    """Baseline integration tests for /api/utils/version/stream endpoint."""

    def test_version_event_received_immediately(self, sse_server: str, sse_client_factory):
        """Test that version event is received immediately on connect."""
        # When connecting to version stream
        client = sse_client_factory("/api/utils/version/stream")
        events = []

        for event in client.connect(timeout=10.0):
            events.append(event)
            # Collect first few events then stop
            if len(events) >= 3:
                break

        # Then version event is the first event
        assert len(events) >= 1
        assert events[0]["event"] == "version"

        # Validate version event data
        version_data = events[0]["data"]
        assert "version" in version_data
        assert "environment" in version_data
        assert "git_commit" in version_data
        # Note: correlation_id may or may not be present

        # Ensure all fields are JSON-serializable (no datetime objects)
        assert isinstance(version_data["version"], str)
        assert isinstance(version_data["environment"], str)

        # Verify mocked version data is returned
        assert version_data["version"] == "test-1.0.0"
        assert version_data["environment"] == "test"
        assert version_data["git_commit"] == "abc123"

    def test_heartbeat_events_received(self, sse_server: str, sse_client_factory):
        """Test that periodic heartbeat events are received."""
        # When connecting to version stream and waiting
        client = sse_client_factory("/api/utils/version/stream")
        events = []
        start_time = time.perf_counter()

        for event in client.connect(timeout=10.0):
            events.append(event)
            # Collect events for a few seconds to see heartbeats
            if time.perf_counter() - start_time > 3.0:
                break

        # Then we receive heartbeat events
        heartbeat_events = [e for e in events if e["event"] == "heartbeat"]

        # With SSE_HEARTBEAT_INTERVAL=1s in tests, we should see multiple heartbeats in 3s
        assert len(heartbeat_events) >= 1, "Should receive at least one heartbeat"

        # Validate heartbeat structure
        for hb in heartbeat_events:
            assert "timestamp" in hb["data"]
            # Note: correlation_id may or may not be present
            # Version stream uses "keepalive" as timestamp value (baseline behavior)
            assert hb["data"]["timestamp"] == "keepalive"

    def test_heartbeat_timing_within_configured_interval(self, sse_server: str, sse_client_factory):
        """Test that heartbeat events occur within 2x the configured interval."""
        # When connecting and collecting heartbeat timestamps
        client = sse_client_factory("/api/utils/version/stream")
        heartbeat_times = []
        start_time = time.perf_counter()

        for event in client.connect(timeout=10.0):
            if event["event"] == "heartbeat":
                heartbeat_times.append(time.perf_counter() - start_time)
            # Collect enough heartbeats to measure intervals
            if len(heartbeat_times) >= 3:
                break
            # Safety timeout
            if time.perf_counter() - start_time > 10.0:
                break

        # Then heartbeat intervals are within expected range
        # SSE_HEARTBEAT_INTERVAL = 1s in tests
        # Allow generous window (2x) for CI timing variability
        max_interval = 2.0

        for i in range(1, len(heartbeat_times)):
            interval = heartbeat_times[i] - heartbeat_times[i - 1]
            assert interval <= max_interval, \
                f"Heartbeat interval {interval}s exceeds maximum {max_interval}s"

    def test_event_ordering_is_correct(self, sse_server: str, sse_client_factory):
        """Test that events arrive in correct order: version -> heartbeats."""
        # When connecting to version stream
        client = sse_client_factory("/api/utils/version/stream")
        events = []

        for event in client.connect(timeout=10.0):
            events.append(event)
            # Collect enough events to validate ordering
            if len(events) >= 3:
                break

        # Then events are in correct order
        assert events[0]["event"] == "version", "First event must be version"

        # Subsequent events should be heartbeats
        for event in events[1:]:
            assert event["event"] == "heartbeat", \
                f"Expected heartbeat, got {event['event']}"

    def test_correlation_id_when_present(self, sse_server: str, sse_client_factory):
        """Test that correlation_id is consistent across events when present."""
        # When connecting to version stream
        client = sse_client_factory("/api/utils/version/stream")
        events = []

        for event in client.connect(timeout=10.0):
            events.append(event)
            # Collect a few events
            if len(events) >= 5:
                break

        # Then if correlation_id is present, it should be consistent
        correlation_ids = [
            event["data"].get("correlation_id")
            for event in events
            if "correlation_id" in event["data"]
        ]

        # If any events have correlation_id, check they're all the same
        if correlation_ids:
            assert all(cid == correlation_ids[0] for cid in correlation_ids), \
                "Correlation IDs should be consistent across all events in a stream"

    def test_connection_remains_open(self, sse_server: str, sse_client_factory):
        """Test that connection remains open and continues sending events."""
        # When connecting and collecting events over time
        client = sse_client_factory("/api/utils/version/stream")
        events = []
        start_time = time.perf_counter()

        for event in client.connect(timeout=10.0):
            events.append(event)
            # Collect events for several seconds
            if time.perf_counter() - start_time > 4.0:
                break

        # Then we receive multiple events (connection stays open)
        # Should have: version + multiple heartbeats
        assert len(events) >= 3, "Should receive multiple events over time"

        # No connection_close event should be present (connection still open)
        close_events = [e for e in events if e["event"] == "connection_close"]
        assert len(close_events) == 0, "Connection should remain open"

    def test_version_event_format(self, sse_server: str, sse_client_factory):
        """Test that version event has correct format and event name."""
        # When connecting to version stream
        client = sse_client_factory("/api/utils/version/stream")
        events = []

        for event in client.connect(timeout=10.0):
            events.append(event)
            if len(events) >= 3:
                break

        # Then version event uses "version" event name (not "version_info")
        version_events = [e for e in events if e["event"] == "version"]
        assert len(version_events) == 1, "Should receive exactly one version event"

        # Validate version event structure
        version_event = version_events[0]
        assert version_event["event"] == "version"
        assert isinstance(version_event["data"], dict)

        # Required fields
        assert "version" in version_event["data"]
        assert "environment" in version_event["data"]
        assert "git_commit" in version_event["data"]
        # Note: correlation_id appears at outer event level for connection lifecycle events,
        # not in version event data

        # All values should be JSON-serializable primitives (no datetime objects)
        for key, value in version_event["data"].items():
            assert isinstance(value, str | int | float | bool | type(None)), \
                f"Field {key} has non-serializable type {type(value)}"

    def test_request_id_query_parameter_accepted(self, sse_server: str, sse_client_factory):
        """Test that request_id query parameter is accepted and processed."""
        # Given a version stream URL with request_id query parameter
        import requests

        url = f"{sse_server}/api/utils/version/stream?request_id=test-request-123"

        # When connecting with request_id
        response = requests.get(url, stream=True, timeout=5.0)

        # Then connection is successful
        assert response.status_code == 200
        assert response.headers["Content-Type"].startswith("text/event-stream")

        # Parse first few events to verify stream works
        events = []
        for line in response.iter_lines(decode_unicode=True):
            if line.startswith("event:"):
                event_name = line[6:].strip()
                events.append(event_name)
            if len(events) >= 2:
                break

        # Verify we received expected events
        assert "version" in events
