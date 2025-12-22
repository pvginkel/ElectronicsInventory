"""SSE Gateway callback endpoint for handling connect/disconnect notifications."""

import logging
import time
from urllib.parse import parse_qs, urlparse

from dependency_injector.wiring import Provide, inject
from flask import Blueprint, Response, jsonify, request
from pydantic import ValidationError

from app.config import Settings
from app.schemas.sse_gateway_schema import (
    SSEGatewayConnectCallback,
    SSEGatewayDisconnectCallback,
)
from app.services.container import ServiceContainer
from app.services.task_service import TaskService
from app.services.version_service import VersionService
from app.utils.error_handling import handle_api_errors

logger = logging.getLogger(__name__)

sse_bp = Blueprint("sse", __name__, url_prefix="/api/sse")


def _authenticate_callback(secret_from_query: str | None, settings: Settings) -> bool:
    """Authenticate callback request using shared secret.

    Args:
        secret_from_query: Secret from query parameter
        settings: Application settings

    Returns:
        True if authenticated (or not in production), False otherwise
    """
    # Only require authentication in production
    if settings.FLASK_ENV != "production":
        return True

    expected_secret = settings.SSE_CALLBACK_SECRET
    if not expected_secret:
        logger.error("SSE_CALLBACK_SECRET not configured in production mode")
        return False

    return secret_from_query == expected_secret


def _route_to_service(url: str) -> tuple[str, str] | None:
    """Route callback URL to appropriate service.

    Args:
        url: Client request URL from callback

    Returns:
        Tuple of (service_type, identifier) or None if not routable
    """
    # Parse URL to extract path and query parameters
    parsed = urlparse(url)
    path = parsed.path
    query_params = parse_qs(parsed.query)

    # Route based on URL pattern
    if path.startswith("/api/sse/tasks"):
        # Extract task_id from query parameter
        task_ids = query_params.get("task_id", [])
        if not task_ids or not task_ids[0]:
            logger.error(f"Missing task_id in callback URL: {url}")
            return None
        task_id = task_ids[0]
        # Validate task_id doesn't contain colon (reserved for identifier prefix)
        if ":" in task_id:
            logger.error(f"Invalid task_id contains colon: {task_id}")
            return None
        return ("task", task_id)

    elif path.startswith("/api/sse/utils/version"):
        # Extract request_id from query parameter
        request_ids = query_params.get("request_id", [])
        if not request_ids or not request_ids[0]:
            logger.error(f"Missing request_id in callback URL: {url}")
            return None
        request_id = request_ids[0]
        # Validate request_id doesn't contain colon
        if ":" in request_id:
            logger.error(f"Invalid request_id contains colon: {request_id}")
            return None
        return ("version", request_id)

    else:
        logger.error(f"Unknown callback URL pattern: {url}")
        return None


@sse_bp.route("/callback", methods=["POST"])
@handle_api_errors
@inject
def handle_callback(
    task_service: TaskService = Provide[ServiceContainer.task_service],
    version_service: VersionService = Provide[ServiceContainer.version_service],
    settings: Settings = Provide[ServiceContainer.config],
) -> tuple[Response, int] | Response:
    """Handle SSE Gateway connect/disconnect callbacks.

    This endpoint receives callbacks from the SSE Gateway when clients connect
    or disconnect. It routes the callback to the appropriate service based on
    the URL pattern in the callback payload.

    Returns:
        200 with optional event data on connect
        200 empty on disconnect
        401 if authentication fails (production only)
        400 if payload invalid or URL not routable
    """
    t0 = time.perf_counter()
    logger.info("[TIMING] /api/sse/callback START")

    # Authenticate request (production only)
    secret = request.args.get("secret")
    if not _authenticate_callback(secret, settings):
        logger.warning("SSE Gateway callback authentication failed")
        return jsonify({"error": "Unauthorized"}), 401

    # Parse JSON payload
    try:
        payload = request.get_json(silent=False)
        if payload is None:
            return jsonify({"error": "Missing JSON body"}), 400
    except Exception as e:
        # Handle both UnsupportedMediaType (no Content-Type) and BadRequest (invalid JSON)
        error_class = type(e).__name__
        if error_class == "UnsupportedMediaType":
            error_msg = "Missing JSON body"
        else:
            error_msg = "Invalid JSON"
        return jsonify({"error": error_msg}), 400

    try:
        action = payload.get("action")
        logger.info(f"[TIMING] /api/sse/callback: action={action}, parse took {(time.perf_counter() - t0) * 1000:.1f}ms")

        if action == "connect":
            # Validate as connect callback
            connect_callback = SSEGatewayConnectCallback.model_validate(payload)

            # Route to appropriate service
            route_result = _route_to_service(connect_callback.request.url)
            if not route_result:
                return jsonify(
                    {"error": f"Cannot route URL: {connect_callback.request.url}"}
                ), 400

            service_type, identifier = route_result
            logger.info(f"[TIMING] /api/sse/callback: routing to {service_type}:{identifier}")

            # Call service-specific on_connect handler
            t1 = time.perf_counter()
            if service_type == "task":
                task_service.on_connect(connect_callback, identifier)
            elif service_type == "version":
                version_service.on_connect(connect_callback, identifier)
            else:
                return jsonify({"error": f"Unknown service type: {service_type}"}), 400

            logger.info(f"[TIMING] /api/sse/callback: on_connect took {(time.perf_counter() - t1) * 1000:.1f}ms")
            logger.info(f"[TIMING] /api/sse/callback END: total={(time.perf_counter() - t0) * 1000:.1f}ms")

            # Return empty JSON response (SSE Gateway only checks status code)
            return jsonify({}), 200

        elif action == "disconnect":
            # Validate as disconnect callback
            disconnect_callback = SSEGatewayDisconnectCallback.model_validate(payload)

            # Route to appropriate service
            route_result = _route_to_service(disconnect_callback.request.url)
            if not route_result:
                # Stale disconnect for unknown URL; log and accept
                logger.debug(
                    f"Disconnect callback for unknown URL: "
                    f"{disconnect_callback.request.url}"
                )
                return jsonify({}), 200

            service_type, identifier = route_result

            # Call service-specific on_disconnect handler
            if service_type == "task":
                task_service.on_disconnect(disconnect_callback)
            elif service_type == "version":
                version_service.on_disconnect(disconnect_callback)
            else:
                return jsonify({"error": f"Unknown service type: {service_type}"}), 400

            # Return empty success
            return jsonify({}), 200

        else:
            return jsonify({"error": f"Unknown action: {action}"}), 400

    except ValidationError as e:
        logger.error(f"Invalid callback payload: {e}")
        return jsonify({"error": "Invalid payload", "details": e.errors()}), 400
    except Exception as e:
        logger.error(f"Error handling SSE Gateway callback: {e}", exc_info=True)
        return jsonify({"error": "Internal server error"}), 500
