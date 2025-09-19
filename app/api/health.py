"""Health check endpoints for Kubernetes probes."""

import logging

from dependency_injector.wiring import Provide, inject
from flask import Blueprint, jsonify, request
from spectree import Response as SpectreeResponse

from app.config import Settings
from app.database import check_db_connection, get_pending_migrations
from app.schemas.health_schema import HealthResponse
from app.services.container import ServiceContainer
from app.utils.shutdown_coordinator import ShutdownCoordinatorProtocol
from app.utils.spectree_config import api

logger = logging.getLogger(__name__)

health_bp = Blueprint("health", __name__, url_prefix="/health")


@health_bp.route("/readyz", methods=["GET"])
@api.validate(resp=SpectreeResponse(HTTP_200=HealthResponse, HTTP_503=HealthResponse))
@inject
def readyz(
    shutdown_coordinator: ShutdownCoordinatorProtocol = Provide[ServiceContainer.shutdown_coordinator]
):
    """Readiness probe endpoint for Kubernetes.

    Returns 503 when the application is shutting down, database is not ready,
    or migrations are pending. This signals Kubernetes to remove the pod from service endpoints.
    """
    # Check if shutdown has been initiated
    if shutdown_coordinator.is_shutting_down():
        return jsonify({"status": "shutting down", "ready": False}), 503

    # Check database connectivity
    db_connected = check_db_connection()
    if not db_connected:
        return jsonify({
            "status": "database unavailable",
            "ready": False,
            "database": {"connected": False}
        }), 503

    # Check for pending migrations
    pending_migrations = get_pending_migrations()
    if pending_migrations:
        return jsonify({
            "status": "migrations pending",
            "ready": False,
            "database": {"connected": True},
            "migrations": {"pending": len(pending_migrations)}
        }), 503

    # All checks passed
    return jsonify({
        "status": "ready",
        "ready": True,
        "database": {"connected": True},
        "migrations": {"pending": 0}
    }), 200


@health_bp.route("/healthz", methods=["GET"])
@api.validate(resp=SpectreeResponse(HTTP_200=HealthResponse))
def healthz():
    """Liveness probe endpoint for Kubernetes.

    Always returns 200 to indicate the application is alive.
    This keeps the pod running even during graceful shutdown.
    """
    return jsonify({"status": "alive", "ready": True}), 200


@health_bp.route("/drain", methods=["GET"])
@api.validate(resp=SpectreeResponse(HTTP_200=HealthResponse, HTTP_401=HealthResponse))
@inject
def drain(
    shutdown_coordinator: ShutdownCoordinatorProtocol = Provide[ServiceContainer.shutdown_coordinator],
    settings: Settings = Provide[ServiceContainer.config]
):
    """Drain endpoint for manual graceful shutdown initiation.

    Requires bearer token authentication against DRAIN_AUTH_KEY config setting.
    Calls drain() on the shutdown coordinator and returns health status.
    """
    # Check if DRAIN_AUTH_KEY is configured
    if not settings.DRAIN_AUTH_KEY:
        logger.error("DRAIN_AUTH_KEY not configured, rejecting drain request")
        return jsonify({"status": "unauthorized", "ready": False}), 401

    # Extract Authorization header
    auth_header = request.headers.get("Authorization", "")

    # Validate token
    if auth_header != f"Bearer {settings.DRAIN_AUTH_KEY}":
        logger.warning("Drain request with invalid token")
        return jsonify({"status": "unauthorized", "ready": False}), 401

    # Call drain on shutdown coordinator
    try:
        logger.info("Authenticated drain request received, calling starting drain")
        shutdown_coordinator.shutdown()
        logger.info("Shutdown complete")
        return jsonify({"status": "alive", "ready": True}), 200
    except Exception as e:
        logger.error(f"Error calling drain(): {e}")
        return jsonify({"status": "error", "ready": False}), 500
