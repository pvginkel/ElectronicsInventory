"""Infrastructure utility endpoints."""

import json
import threading
import time
from queue import Empty
from typing import Any

from dependency_injector.wiring import Provide, inject
from flask import Blueprint, request, stream_with_context

from app.services.container import ServiceContainer
from app.services.version_service import VersionService
from app.utils import ensure_request_id_from_query, get_current_correlation_id
from app.utils.error_handling import handle_api_errors
from app.utils.settings import Settings  # type: ignore[import-untyped]
from app.utils.shutdown_coordinator import LifetimeEvent, ShutdownCoordinatorProtocol
from app.utils.sse_utils import create_sse_response, format_sse_event

utils_bp = Blueprint("utils", __name__, url_prefix="/utils")


@utils_bp.route("/version/stream", methods=["GET"])
@handle_api_errors
@inject
def version_stream(
    version_service: VersionService = Provide[ServiceContainer.version_service],
    shutdown_coordinator: ShutdownCoordinatorProtocol = Provide[ServiceContainer.shutdown_coordinator],
    settings: Settings = Provide[ServiceContainer.config]
) -> Any:
    """SSE stream for frontend version notifications - infrastructure utility endpoint."""
    ensure_request_id_from_query(request.args.get("request_id"))

    def generate_events() -> Any:
        subscriber_queue = None
        registered_with_service = False
        correlation_id = get_current_correlation_id()
        shutdown_flag = threading.Event()
        heartbeat_interval = settings.SSE_HEARTBEAT_INTERVAL
        last_heartbeat = time.perf_counter()
        def on_lifetime_event(event: LifetimeEvent) -> None:
            if event == LifetimeEvent.PREPARE_SHUTDOWN:
                shutdown_flag.set()

        shutdown_coordinator.register_lifetime_notification(on_lifetime_event)

        try:
            # Signal connection established
            yield format_sse_event("connection_open", {"status": "connected"}, correlation_id)
            if correlation_id:
                version_service.mark_subscriber_active(correlation_id)

            if correlation_id:
                subscriber_queue = version_service.register_subscriber(correlation_id)
                registered_with_service = True
            else:
                subscriber_queue = None

            # Always send the current version snapshot first
            try:
                version_json = version_service.fetch_frontend_version()
                try:
                    version_payload = json.loads(version_json)
                except json.JSONDecodeError:
                    version_payload = {"raw": version_json}

                yield format_sse_event("version", version_payload, correlation_id)
                if correlation_id:
                    version_service.mark_subscriber_active(correlation_id)
            except Exception as exc:  # pragma: no cover - exercised in tests with mocks
                yield format_sse_event("error", {"error": str(exc)}, correlation_id)
                yield format_sse_event("connection_close", {"reason": "version_fetch_error"}, correlation_id)
                return

            if subscriber_queue is not None:
                # Drain any backlog accumulated before the stream registered.
                while True:
                    try:
                        event_name, payload = subscriber_queue.get_nowait()
                    except Empty:
                        break

                    yield format_sse_event(event_name, payload, correlation_id)
                    if correlation_id:
                        version_service.mark_subscriber_active(correlation_id)
                    if event_name == "connection_close":
                        return

            while True:
                if shutdown_flag.is_set():
                    yield format_sse_event("connection_close", {"reason": "server_shutdown"}, correlation_id)
                    return

                if subscriber_queue is None:
                    now = time.perf_counter()
                    if now - last_heartbeat >= heartbeat_interval:
                        yield format_sse_event("heartbeat", {"timestamp": "keepalive"}, correlation_id)
                        last_heartbeat = now
                        if correlation_id:
                            version_service.mark_subscriber_active(correlation_id)
                    shutdown_flag.wait(heartbeat_interval)
                    continue

                try:
                    event_name, payload = subscriber_queue.get(timeout=heartbeat_interval)
                    yield format_sse_event(event_name, payload, correlation_id)
                    if correlation_id:
                        version_service.mark_subscriber_active(correlation_id)
                    if event_name == "connection_close":
                        return
                except Empty:
                    now = time.perf_counter()
                    if now - last_heartbeat >= heartbeat_interval:
                        yield format_sse_event("heartbeat", {"timestamp": "keepalive"}, correlation_id)
                        last_heartbeat = now
                        if correlation_id:
                            version_service.mark_subscriber_active(correlation_id)
                except Exception as exc:  # pragma: no cover - defensive guard
                    yield format_sse_event("error", {"error": str(exc)}, correlation_id)
                    return
        finally:
            if registered_with_service and correlation_id:
                version_service.unregister_subscriber(correlation_id)

    return create_sse_response(stream_with_context(generate_events()))
