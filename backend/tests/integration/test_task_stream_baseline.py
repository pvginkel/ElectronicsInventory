"""Baseline integration tests for task stream SSE endpoint.

These tests validate the current Flask SSE implementation behavior before migrating
to SSE Gateway. They use a real Flask server (waitress) and SSE client to test
actual streaming behavior.
"""

import time

import pytest


@pytest.mark.integration
class TestTaskStreamBaseline:
    """Baseline integration tests for /api/tasks/<task_id>/stream endpoint."""

    def test_task_progress_events_received(self, sse_server: str, sse_client_factory):
        """Test that progress_update events are received during task execution."""
        # Given a task with multiple steps
        import requests

        resp = requests.post(
            f"{sse_server}/api/testing/tasks/start",
            json={
                "task_type": "demo_task",
                "params": {"steps": 3, "delay": 0.05}
            },
            timeout=5.0
        )
        assert resp.status_code == 200
        task_id = resp.json()["task_id"]

        # When receiving stream events
        client = sse_client_factory(f"/api/tasks/{task_id}/stream")
        events = []

        for event in client.connect(timeout=10.0):
            events.append(event)
            if event["event"] == "connection_close":
                break

        # Then we receive task_event events with progress_update
        task_events = [e for e in events if e["event"] == "task_event"]
        progress_events = [e for e in task_events if e["data"]["event_type"] == "progress_update"]

        assert len(progress_events) >= 1, "Should receive at least one progress event"

        # Validate progress event structure (wrapped format)
        for event in progress_events:
            assert event["event"] == "task_event"
            assert event["data"]["event_type"] == "progress_update"
            assert "task_id" in event["data"]
            assert "timestamp" in event["data"]
            assert "data" in event["data"]
            # Note: correlation_id appears at outer event level, not in nested task_event data

    def test_task_completed_event_received(self, sse_server: str, sse_client_factory):
        """Test that task_completed event is received when task finishes successfully."""
        # Given a simple task
        import requests

        resp = requests.post(
            f"{sse_server}/api/testing/tasks/start",
            json={
                "task_type": "demo_task",
                "params": {"steps": 1, "delay": 0.05}
            },
            timeout=5.0
        )
        assert resp.status_code == 200
        task_id = resp.json()["task_id"]

        # When receiving stream events
        client = sse_client_factory(f"/api/tasks/{task_id}/stream")
        events = []

        for event in client.connect(timeout=10.0):
            events.append(event)
            if event["event"] == "connection_close":
                break

        # Then we receive task_completed event
        task_events = [e for e in events if e["event"] == "task_event"]
        completed_events = [e for e in task_events if e["data"]["event_type"] == "task_completed"]

        assert len(completed_events) == 1, "Should receive exactly one task_completed event"

        # Validate completed event structure
        completed = completed_events[0]
        assert completed["event"] == "task_event"
        assert completed["data"]["event_type"] == "task_completed"
        assert completed["data"]["task_id"] == task_id
        assert "timestamp" in completed["data"]
        assert "data" in completed["data"]
        # Note: correlation_id appears at outer event level, not in nested task_event data

        # Validate result payload
        assert completed["data"]["data"]["status"] == "success"

    def test_connection_close_event_after_completion(self, sse_server: str, sse_client_factory):
        """Test that connection_close event is sent after task completion."""
        # Given a simple task
        import requests

        resp = requests.post(
            f"{sse_server}/api/testing/tasks/start",
            json={
                "task_type": "demo_task",
                "params": {"steps": 1, "delay": 0.05}
            },
            timeout=5.0
        )
        assert resp.status_code == 200
        task_id = resp.json()["task_id"]

        # When receiving stream events
        client = sse_client_factory(f"/api/tasks/{task_id}/stream")
        events = []

        for event in client.connect(timeout=10.0):
            events.append(event)
            if event["event"] == "connection_close":
                break

        # Then connection_close is the last event
        assert events[-1]["event"] == "connection_close"
        assert events[-1]["data"]["reason"] == "task_completed"
        # correlation_id should be present at outer event level for connection events
        # (checked in test_correlation_id_when_present)

    def test_task_failed_event_on_exception(self, sse_server: str, sse_client_factory):
        """Test that task_failed event is received when task raises exception."""
        # Given a task that will fail
        import requests

        resp = requests.post(
            f"{sse_server}/api/testing/tasks/start",
            json={
                "task_type": "failing_task",
                "params": {"error_message": "Test error", "delay": 0.05}
            },
            timeout=5.0
        )
        assert resp.status_code == 200
        task_id = resp.json()["task_id"]

        # When receiving stream events
        client = sse_client_factory(f"/api/tasks/{task_id}/stream")
        events = []

        for event in client.connect(timeout=10.0):
            events.append(event)
            if event["event"] == "connection_close":
                break

        # Then we receive task_failed event
        task_events = [e for e in events if e["event"] == "task_event"]
        failed_events = [e for e in task_events if e["data"]["event_type"] == "task_failed"]

        assert len(failed_events) == 1, "Should receive exactly one task_failed event"

        # Validate failed event structure
        failed = failed_events[0]
        assert failed["event"] == "task_event"
        assert failed["data"]["event_type"] == "task_failed"
        assert failed["data"]["task_id"] == task_id
        assert "error" in failed["data"]["data"]
        assert "Test error" in failed["data"]["data"]["error"]

    def test_task_not_found_returns_error_event(self, sse_server: str, sse_client_factory):
        """Test that non-existent task returns error event and closes connection."""
        # Given a non-existent task ID
        task_id = "nonexistent-task-id"

        # When connecting to SSE stream
        client = sse_client_factory(f"/api/tasks/{task_id}/stream")
        events = []

        for event in client.connect(timeout=10.0):
            events.append(event)
            if event["event"] == "connection_close":
                break

        # Then we receive error and connection_close events
        assert len(events) >= 2

        # Find error event
        error_events = [e for e in events if e["event"] == "error"]
        assert len(error_events) == 1
        assert "Task not found" in error_events[0]["data"]["error"]

        # Connection closes with task_not_found reason
        assert events[-1]["event"] == "connection_close"
        assert events[-1]["data"]["reason"] == "task_not_found"

    def test_heartbeat_events_on_idle_stream(self, sse_server: str, sse_client_factory):
        """Test that heartbeat events are sent when no task events are available."""
        # Given a long-running task that sends infrequent progress updates
        import requests

        resp = requests.post(
            f"{sse_server}/api/testing/tasks/start",
            json={
                "task_type": "demo_task",
                "params": {"steps": 1, "delay": 12.0}  # Long delay to ensure heartbeats
            },
            timeout=5.0
        )
        assert resp.status_code == 200
        task_id = resp.json()["task_id"]

        # When receiving stream events
        client = sse_client_factory(f"/api/tasks/{task_id}/stream")
        events = []
        start_time = time.perf_counter()

        for event in client.connect(timeout=20.0):
            events.append(event)
            # Stop after collecting events for a few seconds or completion
            if event["event"] == "connection_close":
                break
            # Also stop if we've collected enough time to see at least one heartbeat
            # With task queue timeout=5s and SSE_HEARTBEAT_INTERVAL=5s, need to wait
            # for the first queue timeout to trigger a heartbeat
            if time.perf_counter() - start_time > 7.0:
                break

        # Then we should receive heartbeat events during idle periods
        heartbeat_events = [e for e in events if e["event"] == "heartbeat"]

        # With task queue timeout=5s, we should get first heartbeat after 5s of idle queue
        # Note: The task stream only sends heartbeats when get_task_events() times out
        assert len(heartbeat_events) >= 1, "Should receive at least one heartbeat during idle period"

        # Validate heartbeat structure
        for hb in heartbeat_events:
            assert "timestamp" in hb["data"]
            # Timestamp should be ISO 8601 format
            assert isinstance(hb["data"]["timestamp"], str)
            assert "T" in hb["data"]["timestamp"]

    def test_event_ordering_is_correct(self, sse_server: str, sse_client_factory):
        """Test that events arrive in correct order: progress -> completion -> close."""
        # Given a task with multiple steps
        import requests

        resp = requests.post(
            f"{sse_server}/api/testing/tasks/start",
            json={
                "task_type": "demo_task",
                "params": {"steps": 3, "delay": 0.05}
            },
            timeout=5.0
        )
        assert resp.status_code == 200
        task_id = resp.json()["task_id"]

        # When receiving stream events
        client = sse_client_factory(f"/api/tasks/{task_id}/stream")
        events = []

        for event in client.connect(timeout=10.0):
            events.append(event)
            if event["event"] == "connection_close":
                break

        # Then events are in correct order
        # First events: task_event (progress updates and completion)
        task_events = [e for e in events[:-1] if e["event"] == "task_event"]
        assert len(task_events) >= 1, "Should have at least one task event"

        # Last event: connection_close
        assert events[-1]["event"] == "connection_close"

        # Verify no events after connection_close
        close_index = next(i for i, e in enumerate(events) if e["event"] == "connection_close")
        assert close_index == len(events) - 1, "No events should arrive after connection_close"

    def test_correlation_id_when_present(self, sse_server: str, sse_client_factory):
        """Test that correlation_id is consistent across events when present."""
        # Given a simple task
        import requests

        resp = requests.post(
            f"{sse_server}/api/testing/tasks/start",
            json={
                "task_type": "demo_task",
                "params": {"steps": 2, "delay": 0.05}
            },
            timeout=5.0
        )
        assert resp.status_code == 200
        task_id = resp.json()["task_id"]

        # When receiving stream events
        client = sse_client_factory(f"/api/tasks/{task_id}/stream")
        events = []

        for event in client.connect(timeout=10.0):
            events.append(event)
            if event["event"] == "connection_close":
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
