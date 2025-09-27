"""Testing API endpoints for Playwright test suite support."""

import logging
import time
from queue import Empty, Queue
from threading import Event

from dependency_injector.wiring import Provide, inject
from flask import Blueprint, current_app, jsonify, request
from spectree import Response as SpectreeResponse

from app.exceptions import RouteNotAvailableException
from app.schemas.testing import (
    FakeImageQuerySchema,
    TestErrorResponseSchema,
    TestResetResponseSchema,
)
from app.services.container import ServiceContainer
from app.services.testing_service import TestingService
from app.utils import get_current_correlation_id
from app.utils.error_handling import handle_api_errors
from app.utils.log_capture import LogCaptureHandler
from app.utils.spectree_config import api
from app.utils.sse_utils import create_sse_response, format_sse_event

logger = logging.getLogger(__name__)

testing_bp = Blueprint("testing", __name__, url_prefix="/api/testing")


@testing_bp.before_request
def check_testing_mode():
    """Check if the server is running in testing mode before processing any testing endpoint."""
    from app.utils.error_handling import _build_error_response

    container = current_app.container
    settings = container.config()

    if not settings.is_testing:
        # Return error response directly since before_request handlers don't go through @handle_api_errors
        exception = RouteNotAvailableException()
        return _build_error_response(
            exception.message,
            {"message": "Testing endpoints require FLASK_ENV=testing"},
            code=exception.error_code,
            status_code=400
        )


@testing_bp.route("/reset", methods=["POST"])
@api.validate(resp=SpectreeResponse(HTTP_200=TestResetResponseSchema, HTTP_503=TestErrorResponseSchema))
@handle_api_errors
@inject
def reset_database(
    testing_service: TestingService = Provide[ServiceContainer.testing_service]
):
    """
    Reset database to clean state with optional test data seeding.

    Query Parameters:
        seed: boolean, default false - Whether to load test data after reset

    Returns:
        200: Reset completed successfully
        503: Reset already in progress (with Retry-After header)
    """
    # Check if reset is already in progress
    if testing_service.is_reset_in_progress():
        return jsonify({
            "error": "Database reset already in progress",
            "status": "busy"
        }), 503, {"Retry-After": "5"}

    # Get seed parameter from query string
    seed = request.args.get("seed", "false").lower() in ("true", "1", "yes")

    # Perform database reset
    result = testing_service.reset_database(seed=seed)

    return jsonify(result), 200


@testing_bp.route("/logs/stream", methods=["GET"])
@handle_api_errors
def stream_logs():
    """
    SSE endpoint for streaming backend application logs in real-time.

    Streams logs from all loggers at INFO level and above.
    Each log entry is formatted as structured JSON with correlation ID when available.

    Event Types:
        - log: Application log entries
        - connection_open: Sent when client connects
        - heartbeat: Sent every 30 seconds for keepalive
        - connection_close: Sent when server shuts down

    Returns:
        SSE stream of log events
    """
    def log_stream():
        # Get correlation ID for this request
        correlation_id = get_current_correlation_id()

        # Set up event queue for receiving log events
        event_queue: Queue = Queue()
        stop_event = Event()

        # Custom client class that works with queue
        class QueueLogClient:
            def __init__(self, queue: Queue):
                self.queue = queue

            def put(self, event_data):
                """Receive event from log handler."""
                self.queue.put(event_data)

        client = QueueLogClient(event_queue)

        # Register with log capture handler
        log_handler = LogCaptureHandler.get_instance()
        log_handler.register_client(client)

        try:
            # Send connection_open event
            yield format_sse_event("connection_open", {"status": "connected"}, correlation_id)

            last_heartbeat = time.perf_counter()
            heartbeat_interval = 30.0  # 30 seconds

            while not stop_event.is_set():
                try:
                    # Check for log events with timeout
                    event_type, event_data = event_queue.get(timeout=1.0)

                    # Add correlation ID to event if available
                    if correlation_id and "correlation_id" not in event_data:
                        event_data["correlation_id"] = correlation_id

                    yield format_sse_event(event_type, event_data)

                except Empty:
                    # No log events, check if we need to send heartbeat
                    current_time = time.perf_counter()
                    if current_time - last_heartbeat >= heartbeat_interval:
                        yield format_sse_event("heartbeat", {"timestamp": time.time()}, correlation_id)
                        last_heartbeat = current_time

        except GeneratorExit:
            # Client disconnected
            logger.info("Log stream client disconnected", extra={"correlation_id": correlation_id})
        finally:
            # Cleanup
            log_handler.unregister_client(client)

            # Send connection_close event if possible
            try:
                yield format_sse_event("connection_close", {"reason": "client_disconnect"}, correlation_id)
            except Exception:
                # Ignore errors during cleanup
                pass

    return create_sse_response(log_stream())


@testing_bp.route("/fake-image", methods=["GET"])
@api.validate(query=FakeImageQuerySchema)
@handle_api_errors
@inject
def generate_fake_image(
    testing_service: TestingService = Provide[ServiceContainer.testing_service]
):
    """Return a fake PNG image containing the requested text.

    Query Parameters:
        text: Text string to render on the generated image.

    Returns:
        Response: PNG image response with caching disabled for deterministic tests.
    """
    query = FakeImageQuerySchema.model_validate(request.args.to_dict())
    image_bytes = testing_service.create_fake_image(query.text)

    response = current_app.response_class(image_bytes, mimetype="image/png")
    response.headers["Content-Disposition"] = "attachment; filename=fake-image.png"
    response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
    response.headers["Pragma"] = "no-cache"
    response.headers["Content-Length"] = str(len(image_bytes))
    return response


