"""Health check endpoints for Kubernetes readiness and liveness probes."""

import logging

from dependency_injector.wiring import Provide, inject
from flask import Blueprint, Response

from app.services.container import ServiceContainer
from app.services.task_service import TaskService
from app.utils.graceful_shutdown import GracefulShutdownManager

logger = logging.getLogger(__name__)

health_bp = Blueprint('health', __name__, url_prefix='/health')


@health_bp.route('/readyz', methods=['GET'])
@inject
def readyz(task_service: TaskService = Provide[ServiceContainer.task_service]) -> Response:
    """
    Kubernetes readiness probe endpoint.
    Returns 503 when draining or task service is unhealthy.
    """
    shutdown_manager = GracefulShutdownManager()

    if shutdown_manager.is_draining():
        logger.debug("Readiness check failed: service is draining")
        return Response("draining", status=503, mimetype='text/plain')

    # Check if task service is healthy (basic check - executor not shutdown)
    try:
        # Simple health check - if we can access the executor, service is healthy
        if hasattr(task_service, '_executor') and task_service._executor._shutdown:
            logger.debug("Readiness check failed: task service executor is shutdown")
            return Response("task service unhealthy", status=503, mimetype='text/plain')
    except Exception as e:
        logger.warning(f"Readiness check failed: task service error - {e}")
        return Response("task service unhealthy", status=503, mimetype='text/plain')

    return Response("ok", status=200, mimetype='text/plain')


@health_bp.route('/healthz', methods=['GET'])
def healthz() -> Response:
    """
    Kubernetes liveness probe endpoint.
    Always returns 200 to keep pod alive during draining.
    """
    return Response("alive", status=200, mimetype='text/plain')


@health_bp.route('/drain', methods=['POST'])
def drain() -> Response:
    """
    Manual drain trigger endpoint for testing.
    """
    shutdown_manager = GracefulShutdownManager()
    shutdown_manager.set_draining(True)
    logger.info("Manual drain triggered via API")
    return Response("draining initiated", status=200, mimetype='text/plain')

