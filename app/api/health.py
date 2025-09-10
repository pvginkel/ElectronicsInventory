"""Health check endpoints for Kubernetes probes."""

import logging

from dependency_injector.wiring import Provide, inject
from flask import Blueprint, jsonify
from spectree import Response as SpectreeResponse

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

    Returns 503 when the application is shutting down or not ready to serve requests.
    This signals Kubernetes to remove the pod from service endpoints.
    """
    # Check if shutdown has been initiated
    if shutdown_coordinator.is_shutting_down():
        return jsonify({"status": "shutting down", "ready": False}), 503

    # Could add additional readiness checks here
    # For now, we consider the app ready if it's not shutting down

    return jsonify({"status": "ready", "ready": True}), 200


@health_bp.route("/healthz", methods=["GET"])
@api.validate(resp=SpectreeResponse(HTTP_200=HealthResponse))
def healthz():
    """Liveness probe endpoint for Kubernetes.

    Always returns 200 to indicate the application is alive.
    This keeps the pod running even during graceful shutdown.
    """
    return jsonify({"status": "alive", "ready": True}), 200
