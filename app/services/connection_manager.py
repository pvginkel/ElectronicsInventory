"""Connection manager for SSE Gateway integration.

This service manages the bidirectional mapping between service identifiers
(like "task:abc123" or "version:xyz789") and SSE Gateway tokens. It handles
connection lifecycle events and provides an interface for sending events via
HTTP to the SSE Gateway.

Key responsibilities:
- Maintain bidirectional mappings: identifier <-> token
- Handle connection replacement (close old, register new)
- Send events via HTTP POST to SSE Gateway
- Clean up stale connections on failures
"""

import json
import logging
import threading
from time import perf_counter
from typing import Any

import requests

from app.schemas.sse_gateway_schema import (
    SSEGatewayEventData,
    SSEGatewaySendRequest,
)
from app.services.metrics_service import MetricsServiceProtocol

logger = logging.getLogger(__name__)


class ConnectionManager:
    """Manages SSE Gateway token mappings and event delivery."""

    def __init__(
        self,
        gateway_url: str,
        metrics_service: MetricsServiceProtocol,
        http_timeout: float = 5.0
    ):
        """Initialize ConnectionManager.

        Args:
            gateway_url: Base URL for SSE Gateway (e.g., "http://localhost:3000")
            metrics_service: Metrics service for observability
            http_timeout: Timeout for HTTP requests to SSE Gateway in seconds
        """
        self.gateway_url = gateway_url.rstrip("/")
        self.metrics_service = metrics_service
        self.http_timeout = http_timeout

        # Bidirectional mappings
        # Forward: service_identifier -> connection info (token, url)
        self._connections: dict[str, dict[str, str]] = {}
        # Reverse: token -> service_identifier (for disconnect callback)
        self._token_to_identifier: dict[str, str] = {}

        # Thread safety
        self._lock = threading.RLock()

    def on_connect(self, identifier: str, token: str, url: str) -> None:
        """Register a new connection from SSE Gateway.

        If a connection already exists for this identifier, the old connection
        is closed before registering the new one (only one connection per identifier).

        Args:
            identifier: Service-specific identifier (e.g., "task:abc123")
            token: Gateway-generated connection token
            url: Original client request URL
        """
        t_start = perf_counter()
        logger.info(f"[TIMING] ConnectionManager.on_connect START: {identifier}")

        old_token_to_close: str | None = None

        # Update mappings under lock (fast, no I/O)
        t_lock = perf_counter()
        with self._lock:
            logger.info(f"[TIMING] ConnectionManager.on_connect: lock acquired in {(perf_counter() - t_lock) * 1000:.1f}ms")

            # Check for existing connection
            existing = self._connections.get(identifier)
            if existing:
                old_token_to_close = existing["token"]
                logger.info(
                    "[TIMING] ConnectionManager.on_connect: found existing connection, will close after releasing lock",
                    extra={
                        "identifier": identifier,
                        "old_token": old_token_to_close,
                        "new_token": token,
                    }
                )
                # Remove old reverse mapping
                self._token_to_identifier.pop(old_token_to_close, None)

            # Register new connection (atomic update of both mappings)
            self._connections[identifier] = {
                "token": token,
                "url": url,
            }
            self._token_to_identifier[token] = identifier

            # Extract service type for metrics
            service_type = self._extract_service_type(identifier)
            self.metrics_service.record_sse_gateway_connection(service_type, "connect")

            logger.info(
                "Registered SSE Gateway connection",
                extra={
                    "identifier": identifier,
                    "token": token,
                    "url": url,
                }
            )

        # Close old connection OUTSIDE the lock (best-effort, avoids blocking other callbacks)
        if old_token_to_close:
            t_close = perf_counter()
            self._close_connection_internal(old_token_to_close, identifier)
            logger.info(f"[TIMING] ConnectionManager.on_connect: _close_connection_internal took {(perf_counter() - t_close) * 1000:.1f}ms")

        logger.info(f"[TIMING] ConnectionManager.on_connect END: total {(perf_counter() - t_start) * 1000:.1f}ms for {identifier}")

    def on_disconnect(self, token: str) -> None:
        """Handle disconnect callback from SSE Gateway.

        Uses reverse mapping to find identifier. Verifies token matches current
        connection before removing (ignores stale disconnect callbacks).

        Args:
            token: Gateway connection token from disconnect callback
        """
        with self._lock:
            # Look up identifier via reverse mapping
            identifier = self._token_to_identifier.get(token)
            if not identifier:
                logger.debug(
                    "Disconnect callback for unknown token (expected for stale disconnects)",
                    extra={"token": token}
                )
                return

            # Verify token matches current forward mapping
            current_conn = self._connections.get(identifier)
            if not current_conn or current_conn["token"] != token:
                logger.debug(
                    "Disconnect callback with mismatched token (stale disconnect after replacement)",
                    extra={
                        "token": token,
                        "identifier": identifier,
                        "current_token": current_conn["token"] if current_conn else None,
                    }
                )
                # Clean up reverse mapping but don't touch forward mapping
                self._token_to_identifier.pop(token, None)
                return

            # Remove both mappings
            del self._connections[identifier]
            del self._token_to_identifier[token]

            # Extract service type for metrics
            service_type = self._extract_service_type(identifier)
            self.metrics_service.record_sse_gateway_connection(service_type, "disconnect")

            logger.info(
                "Unregistered SSE Gateway connection",
                extra={
                    "identifier": identifier,
                    "token": token,
                }
            )

    def has_connection(self, identifier: str) -> bool:
        """Check if a connection exists for the given identifier.

        Args:
            identifier: Service-specific identifier

        Returns:
            True if connection exists, False otherwise
        """
        with self._lock:
            return identifier in self._connections

    def send_event(
        self,
        identifier: str,
        event_data: dict[str, Any],
        event_name: str = "message",
        close: bool = False
    ) -> bool:
        """Send an event to the SSE Gateway for delivery to the client.

        Args:
            identifier: Service-specific identifier
            event_data: Event payload (will be JSON-serialized)
            event_name: SSE event name
            close: Whether to close connection after sending

        Returns:
            True if event sent successfully, False otherwise
        """
        with self._lock:
            conn_info = self._connections.get(identifier)
            if not conn_info:
                logger.warning(
                    "Cannot send event: no connection for identifier",
                    extra={"identifier": identifier}
                )
                return False

            token = conn_info["token"]

        # Release lock before HTTP call
        service_type = self._extract_service_type(identifier)
        start_time = perf_counter()

        try:
            # Format event payload
            event = SSEGatewayEventData(
                name=event_name,
                data=json.dumps(event_data)
            )
            send_request = SSEGatewaySendRequest(
                token=token,
                event=event,
                close=close
            )

            # POST to SSE Gateway
            url = f"{self.gateway_url}/internal/send"
            logger.info(f"[TIMING] send_event: starting POST to {url} for {identifier}")
            response = requests.post(
                url,
                json=send_request.model_dump(exclude_none=True),
                timeout=self.http_timeout,
                headers={"Content-Type": "application/json"}
            )
            elapsed_ms = (perf_counter() - start_time) * 1000
            logger.info(f"[TIMING] send_event: POST completed in {elapsed_ms:.1f}ms, status={response.status_code}")

            if response.status_code == 404:
                # Connection gone; clean up stale mapping
                logger.warning(
                    "SSE Gateway returned 404: connection not found; removing stale mapping",
                    extra={"identifier": identifier, "token": token}
                )
                with self._lock:
                    self._connections.pop(identifier, None)
                    self._token_to_identifier.pop(token, None)
                self.metrics_service.record_sse_gateway_event(service_type, "error")
                return False

            if response.status_code != 200:
                logger.error(
                    "SSE Gateway returned non-2xx status",
                    extra={
                        "identifier": identifier,
                        "status_code": response.status_code,
                        "response_body": response.text,
                    }
                )
                self.metrics_service.record_sse_gateway_event(service_type, "error")
                return False

            logger.debug(
                "Sent event to SSE Gateway",
                extra={
                    "identifier": identifier,
                    "event_name": event_name,
                    "close": close,
                }
            )
            self.metrics_service.record_sse_gateway_event(service_type, "success")
            return True

        except requests.RequestException as e:
            logger.error(
                "Failed to send event to SSE Gateway ",
                exc_info=e,
                extra={
                    "identifier": identifier,
                    "error": str(e),
                    "error_type": type(e).__name__,
                }
            )
            self.metrics_service.record_sse_gateway_event(service_type, "error")
            return False

        finally:
            duration = perf_counter() - start_time
            self.metrics_service.record_sse_gateway_send_duration(service_type, duration)

    def _close_connection_internal(self, token: str, identifier: str) -> None:
        """Close a connection via SSE Gateway (best-effort, no retries).

        Args:
            token: Gateway connection token
            identifier: Service-specific identifier (for logging)
        """
        t_start = perf_counter()
        try:
            send_request = SSEGatewaySendRequest(
                token=token,
                event=None,
                close=True
            )
            url = f"{self.gateway_url}/internal/send"
            logger.warning(f"[TIMING] _close_connection_internal: starting POST to {url}")
            response = requests.post(
                url,
                json=send_request.model_dump(exclude_none=True),
                timeout=self.http_timeout,
                headers={"Content-Type": "application/json"}
            )
            logger.warning(f"[TIMING] _close_connection_internal: POST completed in {(perf_counter() - t_start) * 1000:.1f}ms, status={response.status_code}")
            if response.status_code not in (200, 404):
                logger.warning(
                    "Failed to close old connection",
                    extra={
                        "identifier": identifier,
                        "token": token,
                        "status_code": response.status_code,
                    }
                )
        except requests.RequestException as e:
            logger.warning(
                "Exception while closing old connection (continuing anyway)",
                exc_info=True,
                extra={
                    "identifier": identifier,
                    "token": token,
                    "error": str(e),
                }
            )

    def _extract_service_type(self, identifier: str) -> str:
        """Extract service type from identifier (e.g., "task:abc123" -> "task").

        Args:
            identifier: Service-specific identifier with prefix

        Returns:
            Service type string (task or version)
        """
        if ":" in identifier:
            return identifier.split(":", 1)[0]
        return "unknown"
