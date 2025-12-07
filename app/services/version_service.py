"""Service for version-related infrastructure operations."""

from __future__ import annotations

import json
import logging
import threading
import time
from queue import Empty, Queue
from typing import Any

import requests

from app.config import Settings
from app.schemas.sse_gateway_schema import (
    SSEGatewayConnectCallback,
    SSEGatewayDisconnectCallback,
)
from app.services.connection_manager import ConnectionManager
from app.utils.shutdown_coordinator import LifetimeEvent, ShutdownCoordinatorProtocol

logger = logging.getLogger(__name__)

VersionEvent = tuple[str, dict[str, Any]]


class VersionService:
    """Service for managing frontend version notifications and subscribers."""

    def __init__(
        self,
        settings: Settings,
        shutdown_coordinator: ShutdownCoordinatorProtocol,
        connection_manager: ConnectionManager
    ):
        """Initialize version service and subscribe to lifecycle events."""
        self.settings = settings
        self.shutdown_coordinator = shutdown_coordinator
        self.connection_manager = connection_manager

        self._lock = threading.RLock()
        self._subscribers: dict[str, Queue[VersionEvent]] = {}
        self._pending_events: dict[str, list[VersionEvent]] = {}
        self._last_activity: dict[str, float] = {}
        self._is_shutting_down = False

        self._cleanup_interval = max(1, self.settings.SSE_HEARTBEAT_INTERVAL)
        self._idle_timeout = max(3, self._cleanup_interval * 3)
        self._cleanup_stop = threading.Event()
        self._cleanup_thread: threading.Thread | None = None
        self._start_cleanup_thread()

        shutdown_coordinator.register_lifetime_notification(self._handle_lifetime_event)

    def _fetch_frontend_version(self) -> str:
        """Fetch `version.json` from the frontend service."""
        url = self.settings.FRONTEND_VERSION_URL
        response = requests.get(url, timeout=2)
        response.raise_for_status()
        return response.text

    def on_connect(self, callback: SSEGatewayConnectCallback, request_id: str) -> None:
        """Handle SSE Gateway connect callback for version streams.

        Args:
            callback: Connect callback from SSE Gateway
            request_id: Request ID extracted from callback URL
        """
        identifier = f"version:{request_id}"
        token = callback.token
        url = callback.request.url

        logger.info(f"Version stream connection: request_id={request_id}, token={token}")

        # Register connection with ConnectionManager
        self.connection_manager.on_connect(identifier, token, url)

        # Flush any pending events for this request_id
        with self._lock:
            pending_events = self._pending_events.pop(request_id, [])
            failed_events: list[VersionEvent] = []

            # Send the current version snapshot if there are no pending events
            if len(pending_events) == 0:
                version_json = self._fetch_frontend_version()
                version_payload = json.loads(version_json)

                event: VersionEvent = ("version", version_payload)
                pending_events.insert(0, event)

            # Playback the queued events
            for event_name, event_data in pending_events:
                success = self.connection_manager.send_event(
                    identifier,
                    event_data,
                    event_name=event_name,
                    close=False
                )
                if not success:
                    # Re-queue failed event
                    failed_events.append((event_name, event_data))
                    logger.warning(
                        f"Failed to send pending event '{event_name}' for request_id {request_id}; re-queuing"
                    )

            # Re-queue any failed events
            if failed_events:
                self._pending_events[request_id] = failed_events

            if pending_events:
                sent_count = len(pending_events) - len(failed_events)
                logger.debug(
                    f"Sent {sent_count}/{len(pending_events)} pending events for request_id {request_id}"
                )

    def on_disconnect(self, callback: SSEGatewayDisconnectCallback) -> None:
        """Handle SSE Gateway disconnect callback for version streams.

        Args:
            callback: Disconnect callback from SSE Gateway
        """
        token = callback.token
        reason = callback.reason

        logger.debug(f"Version stream disconnected: token={token}, reason={reason}")

        # Notify ConnectionManager
        self.connection_manager.on_disconnect(token)

    def register_subscriber(self, request_id: str) -> Queue[VersionEvent]:
        """Register an SSE subscriber for deterministic event delivery."""
        with self._lock:
            queue = self._subscribers.get(request_id)
            if queue is None:
                queue = Queue()
                self._subscribers[request_id] = queue

            if self._is_shutting_down:
                queue.put_nowait(("connection_close", {"reason": "server_shutdown"}))
                return queue

            backlog = self._pending_events.pop(request_id, [])
            for event in backlog:
                queue.put_nowait(event)

            self._last_activity[request_id] = time.perf_counter()

            logger.debug(
                "Registered version subscriber",
                extra={"request_id": request_id, "backlog": len(backlog)},
            )
            return queue

    def unregister_subscriber(self, request_id: str) -> None:
        """Remove an SSE subscriber when the client disconnects."""
        with self._lock:
            removed = self._subscribers.pop(request_id, None)
            self._last_activity.pop(request_id, None)
            if removed:
                logger.debug("Unregistered version subscriber", extra={"request_id": request_id})

    def queue_version_event(
        self,
        request_id: str,
        version: str,
        changelog: str | None = None
    ) -> bool:
        """Queue a deployment notification for the given subscriber.

        Returns True when the event was delivered to a live subscriber, False when
        the payload was stored for later because the stream has not connected yet.
        """
        event_payload: dict[str, Any] = {"version": version}
        if changelog:
            event_payload["changelog"] = changelog

        event: VersionEvent = ("version", event_payload)

        with self._lock:
            if self._is_shutting_down:
                logger.debug(
                    "Ignoring deployment trigger during shutdown",
                    extra={"request_id": request_id}
                )
                return False

            # Check if connected via SSE Gateway
            identifier = f"version:{request_id}"
            if self.connection_manager.has_connection(identifier):
                # Send via ConnectionManager
                success = self.connection_manager.send_event(
                    identifier,
                    event_payload,
                    event_name="version",
                    close=False
                )
                if success:
                    logger.debug("Sent version event via SSE Gateway", extra={"request_id": request_id})
                    return True
                else:
                    logger.warning(f"Failed to send version event via SSE Gateway for {request_id}")
                    # Fall through to queue it

            # No connection yet, queue as pending
            backlog = self._pending_events.setdefault(request_id, [])
            backlog.append(event)
            logger.debug("Queued deployment event for dormant subscriber", extra={"request_id": request_id})
            return False

    def _handle_lifetime_event(self, event: LifetimeEvent) -> None:
        """Handle application shutdown events."""
        if event == LifetimeEvent.PREPARE_SHUTDOWN:
            with self._lock:
                self._is_shutting_down = True
                for queue in self._subscribers.values():
                    queue.put_nowait(("connection_close", {"reason": "server_shutdown"}))
        elif event == LifetimeEvent.SHUTDOWN:
            self._stop_cleanup_thread()
            with self._lock:
                self._subscribers.clear()
                self._pending_events.clear()
                self._last_activity.clear()

    def mark_subscriber_active(self, request_id: str) -> None:
        """Record subscriber activity to defer idle cleanup."""
        if not request_id:
            return
        with self._lock:
            if request_id in self._subscribers:
                self._last_activity[request_id] = time.perf_counter()

    def _cleanup_worker(self) -> None:
        """Background worker that reclaims idle subscribers."""
        while not self._cleanup_stop.wait(timeout=self._cleanup_interval):
            self._cleanup_idle_subscribers()

    def _cleanup_idle_subscribers(self) -> None:
        now = time.perf_counter()
        idle_ids: list[str] = []

        with self._lock:
            for request_id, last_seen in list(self._last_activity.items()):
                if now - last_seen < self._idle_timeout:
                    continue

                queue = self._subscribers.get(request_id)
                if queue is None:
                    idle_ids.append(request_id)
                    continue

                pending = self._pending_events.setdefault(request_id, [])
                while True:
                    try:
                        pending.append(queue.get_nowait())
                    except Empty:
                        break

                queue.put_nowait(("connection_close", {"reason": "idle_timeout"}))
                idle_ids.append(request_id)

            for request_id in idle_ids:
                self._subscribers.pop(request_id, None)
                self._last_activity.pop(request_id, None)

        if idle_ids:
            logger.debug("Cleaned up idle version subscribers", extra={"ids": idle_ids})

    def _start_cleanup_thread(self) -> None:
        if self._cleanup_thread and self._cleanup_thread.is_alive():
            return
        self._cleanup_stop = threading.Event()
        self._cleanup_thread = threading.Thread(
            target=self._cleanup_worker,
            name="VersionServiceCleanup",
            daemon=True,
        )
        self._cleanup_thread.start()

    def _stop_cleanup_thread(self) -> None:
        self._cleanup_stop.set()
        if self._cleanup_thread and self._cleanup_thread.is_alive():
            self._cleanup_thread.join(timeout=self._cleanup_interval)
        self._cleanup_thread = None
