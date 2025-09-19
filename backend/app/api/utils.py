"""Infrastructure utility endpoints."""

import threading

from dependency_injector.wiring import Provide, inject
from flask import Blueprint

from app.services.container import ServiceContainer
from app.utils import get_current_correlation_id
from app.utils.error_handling import handle_api_errors
from app.utils.shutdown_coordinator import LifetimeEvent
from app.utils.sse_utils import create_sse_response, format_sse_event

utils_bp = Blueprint("utils", __name__, url_prefix="/utils")


@utils_bp.route("/version/stream", methods=["GET"])
@handle_api_errors
@inject
def version_stream(
    version_service=Provide[ServiceContainer.version_service],
    shutdown_coordinator=Provide[ServiceContainer.shutdown_coordinator],
    settings=Provide[ServiceContainer.config]
):
    """SSE stream for frontend version notifications - infrastructure utility endpoint."""
    def generate_events():
        correlation_id = get_current_correlation_id()
        shutdown_flag = threading.Event()

        # Send connection_open event
        yield format_sse_event("connection_open", {"status": "connected"}, correlation_id)

        # Register shutdown handler
        def on_lifetime_event(event: LifetimeEvent):
            if event == LifetimeEvent.PREPARE_SHUTDOWN:
                shutdown_flag.set()

        shutdown_coordinator.register_lifetime_notification(on_lifetime_event)

        # Fetch version once at start
        try:
            version_json = version_service.fetch_frontend_version()
            yield format_sse_event("version", version_json, correlation_id)
        except Exception as e:
            yield format_sse_event("error", {"error": str(e)}, correlation_id)
            yield format_sse_event("connection_close", {"reason": "version_fetch_error"}, correlation_id)
            return

        # Keepalive loop with shutdown check
        heartbeat_interval = settings.SSE_HEARTBEAT_INTERVAL
        while not shutdown_flag.wait(heartbeat_interval):
            yield format_sse_event("heartbeat", {"timestamp": "keepalive"}, correlation_id)

        # Send connection_close instead of shutdown before closing
        yield format_sse_event("connection_close", {"reason": "server_shutdown"}, correlation_id)

    return create_sse_response(generate_events())
