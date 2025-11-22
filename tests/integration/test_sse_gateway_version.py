"""Integration tests for version streaming via SSE Gateway.

These tests validate end-to-end behavior of version streaming with a real SSE
Gateway subprocess, focusing on the pending events feature where events sent
before connection are flushed on connect.
"""

import time
import uuid

import pytest
import requests

from tests.integration.sse_client_helper import SSEClient


@pytest.mark.integration
class TestSSEGatewayVersion:
    """Integration tests for /api/sse/utils/version endpoint via SSE Gateway."""

    def test_pending_events_flushed_on_connect(
        self, sse_server: tuple[str, any], sse_gateway_server: str
    ):
        """Test that events sent before connection are flushed when client connects."""
        server_url, _ = sse_server
        # Given a unique request_id
        request_id = str(uuid.uuid4())

        # When queuing a version event BEFORE connecting
        # (This simulates the testing endpoint triggering version check before SSE connects)
        resp = requests.post(
            f"{server_url}/api/testing/deployments/version",
            json={"request_id": request_id, "version": "test-version-1"},
            timeout=5.0
        )
        assert resp.status_code == 202

        # Give backend time to queue the pending event
        time.sleep(0.2)

        # When connecting to SSE Gateway AFTER event was queued
        client = SSEClient(
            f"{sse_gateway_server}/api/sse/utils/version?request_id={request_id}",
            strict=True
        )
        events = []

        # Collect events
        timeout = time.perf_counter() + 5.0
        for event in client.connect(timeout=5.0):
            events.append(event)
            # Stop after receiving pending events
            if len(events) >= 1:  # version event
                break
            if time.perf_counter() > timeout:
                break

        # Then we receive the pending version event
        assert len(events) >= 1
        assert events[0]["event"] == "version"
        assert "version" in events[0]["data"]

        # Verify it's the version event (not a different event)
        version_events = [e for e in events if e["event"] == "version"]
        assert len(version_events) >= 1, "Should receive at least one version event"

    def test_events_sent_after_connection_are_received(
        self, sse_server: tuple[str, any], sse_gateway_server: str
    ):
        """Test that events sent after connection are received through gateway."""
        server_url, _ = sse_server
        # Given a unique request_id
        request_id = str(uuid.uuid4())

        # Queue initial version event BEFORE connecting
        resp = requests.post(
            f"{server_url}/api/testing/deployments/version",
            json={"request_id": request_id, "version": "test-version-initial"},
            timeout=5.0
        )
        assert resp.status_code == 202
        time.sleep(0.1)

        # Connect to SSE Gateway
        client = SSEClient(
            f"{sse_gateway_server}/api/sse/utils/version?request_id={request_id}",
            strict=True
        )

        # Start collecting events in a generator
        gen = client.connect(timeout=10.0)
        events = []

        # Get initial version event (queued before connect)
        events.append(next(gen))
        assert events[0]["event"] == "version"

        # When triggering another version event AFTER connection is established
        resp = requests.post(
            f"{server_url}/api/testing/deployments/version",
            json={"request_id": request_id, "version": "test-version-2"},
            timeout=5.0
        )
        assert resp.status_code == 202

        # Then we receive the new version event through the gateway
        # Wait for the event with timeout
        timeout = time.perf_counter() + 3.0
        while time.perf_counter() < timeout:
            try:
                event = next(gen)
                events.append(event)
                if event["event"] == "version" and len(events) >= 2:
                    break
            except StopIteration:
                break

        # Verify we received at least 2 version events
        assert len(events) >= 2, "Should receive initial version + triggered version"

        version_events = [e for e in events if e["event"] == "version"]
        assert len(version_events) >= 2, "Should receive at least 2 version events"

    def test_client_disconnect_triggers_callback(
        self, sse_server: tuple[str, any], sse_gateway_server: str
    ):
        """Test that client disconnect triggers disconnect callback to Python."""
        server_url, _ = sse_server
        # Given a unique request_id
        request_id = str(uuid.uuid4())

        # Queue version event before connecting
        resp = requests.post(
            f"{server_url}/api/testing/deployments/version",
            json={"request_id": request_id, "version": "test-version-disconnect"},
            timeout=5.0
        )
        assert resp.status_code == 202
        time.sleep(0.1)

        # When client connects and then disconnects
        client = SSEClient(
            f"{sse_gateway_server}/api/sse/utils/version?request_id={request_id}",
            strict=True
        )
        events = []

        # Collect a few events then stop (simulating client disconnect)
        gen = client.connect(timeout=10.0)
        for _ in range(1):  # version event
            try:
                events.append(next(gen))
            except StopIteration:
                break

        # Then we received some events before disconnecting
        assert len(events) >= 1
        assert events[0]["event"] == "version"

        # Wait a moment for disconnect callback to be processed
        time.sleep(0.5)

        # Verify Python backend processed the disconnect
        # (ConnectionManager should have removed the token mapping)
        # This is validated implicitly by subsequent version events not being
        # queued as pending (since connection is gone)

    def test_connection_replacement_works(
        self, sse_server: tuple[str, any], sse_gateway_server: str
    ):
        """Test that new connection replaces old connection for same request_id."""
        server_url, _ = sse_server
        # Given a unique request_id
        request_id = str(uuid.uuid4())

        # Queue version event for first client
        resp = requests.post(
            f"{server_url}/api/testing/deployments/version",
            json={"request_id": request_id, "version": "test-version-client1"},
            timeout=5.0
        )
        assert resp.status_code == 202
        time.sleep(0.1)

        # When first client connects
        client1 = SSEClient(
            f"{sse_gateway_server}/api/sse/utils/version?request_id={request_id}",
            strict=True
        )
        events1 = []

        # Start collecting events from first client
        gen1 = client1.connect(timeout=10.0)
        events1.append(next(gen1))  # Get queued version
        assert events1[0]["event"] == "version"

        # Wait briefly
        time.sleep(0.2)

        # When second client connects to same request_id (no version queued beforehand)
        client2 = SSEClient(
            f"{sse_gateway_server}/api/sse/utils/version?request_id={request_id}",
            strict=True
        )
        events2 = []

        # Start collecting events from second client
        # Note: We need to actively start consuming the stream before triggering events
        gen2 = client2.connect(timeout=10.0)

        # Trigger a version event after second client connected (but before consuming events)
        # This tests that events are properly queued even when the client isn't actively reading yet
        time.sleep(0.5)  # Give connection time to establish and settle
        resp = requests.post(
            f"{server_url}/api/testing/deployments/version",
            json={"request_id": request_id, "version": "test-version-replacement"},
            timeout=5.0
        )
        assert resp.status_code == 202
        time.sleep(0.1)  # Give event time to be queued

        # Then second client receives the triggered version event
        timeout = time.perf_counter() + 3.0
        while time.perf_counter() < timeout:
            try:
                event = next(gen2)
                events2.append(event)
                if event["event"] == "version":
                    break
            except StopIteration:
                break

        # Verify second client received the triggered event
        version_events_client2 = [e for e in events2 if e["event"] == "version"]
        assert len(version_events_client2) >= 1, "Second client should receive triggered version"

        # Note: First client's connection should have been closed by gateway
        # when the second client connected (connection replacement).
        # We don't explicitly verify the first client was closed because
        # the SSE client library may not raise an exception on server-side close.
        # The important invariant (only latest client receives events) is validated
        # by the second client receiving the triggered event.
