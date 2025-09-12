"""Infrastructure utility endpoints."""

import threading

from dependency_injector.wiring import Provide, inject
from flask import Blueprint

from app.services.container import ServiceContainer
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
        shutdown_flag = threading.Event()

        # Register shutdown handler
        def on_lifetime_event(event: LifetimeEvent):
            if event == LifetimeEvent.PREPARE_SHUTDOWN:
                shutdown_flag.set()

        shutdown_coordinator.register_lifetime_notification(on_lifetime_event)

        # Fetch version once at start
        try:
            version_json = version_service.fetch_frontend_version()
            yield format_sse_event("version", version_json)
        except Exception as e:
            yield format_sse_event("error", {"error": str(e)})
            return

        # Keepalive loop with shutdown check
        heartbeat_interval = settings.SSE_HEARTBEAT_INTERVAL
        while not shutdown_flag.wait(heartbeat_interval):
            yield format_sse_event("keepalive", {})

        # Send shutdown event before closing
        yield format_sse_event("shutdown", {"message": "Server shutting down"})

    return create_sse_response(generate_events())
