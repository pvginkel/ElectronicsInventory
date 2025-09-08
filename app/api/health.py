"""Health check endpoints for Kubernetes readiness and liveness probes."""

import logging

from dependency_injector.wiring import Provide, inject
from flask import Blueprint, Response, request

from app.config import Settings
from app.services.container import ServiceContainer
from app.utils.graceful_shutdown import GracefulShutdownManager

logger = logging.getLogger(__name__)

health_bp = Blueprint('health', __name__, url_prefix='/health')


@health_bp.route('/readyz', methods=['GET'])
@inject
def readyz(shutdown_manager: GracefulShutdownManager = Provide[ServiceContainer.graceful_shutdown_manager]) -> Response:
    """
    Kubernetes readiness probe endpoint.
    Returns 503 when draining, 200 when ready to accept traffic.
    """
    if shutdown_manager.is_draining():
        logger.debug("Readiness check failed: service is draining")
        return Response("draining", status=503, mimetype='text/plain')

    return Response("ok", status=200, mimetype='text/plain')


@health_bp.route('/healthz', methods=['GET'])
def healthz() -> Response:
    """
    Kubernetes liveness probe endpoint.
    Always returns 200 to keep pod alive during draining.
    """
    return Response("alive", status=200, mimetype='text/plain')


@health_bp.route('/drain', methods=['POST'])
@inject
def drain(
    settings: Settings = Provide[ServiceContainer.config],
    shutdown_manager: GracefulShutdownManager = Provide[ServiceContainer.graceful_shutdown_manager]
) -> Response:
    """
    Manual drain trigger endpoint for testing and operational use.
    
    Security behavior:
    - Production + no auth key configured: Returns 403 (forbidden)
    - Production + auth key configured: Requires X-Auth-Key header
    - Non-production + no auth key: Allowed (no authentication required)  
    - Non-production + auth key configured: Requires X-Auth-Key header
    """
    # Check if drain endpoint should be disabled in production without auth
    if settings.FLASK_ENV == "production" and not settings.DRAIN_AUTH_KEY:
        logger.error("Drain endpoint access attempted in production without authentication key configured")
        return Response("forbidden in production without auth", status=403, mimetype='text/plain')
    
    # Check authentication (only runs if auth key is configured or not in production)
    if settings.DRAIN_AUTH_KEY:
        auth_key = request.headers.get('X-Auth-Key')
        if not auth_key or auth_key != settings.DRAIN_AUTH_KEY:
            logger.warning("Unauthorized drain endpoint access attempted")
            return Response("unauthorized", status=401, mimetype='text/plain')
    
    shutdown_manager.set_draining(True)
    return Response("draining initiated", status=200, mimetype='text/plain')

