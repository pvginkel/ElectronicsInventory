"""Metrics API for Prometheus scraping endpoint."""

from dependency_injector.wiring import Provide, inject
from flask import Blueprint, Response

from app.services.container import ServiceContainer
from app.utils.error_handling import handle_api_errors

metrics_bp = Blueprint("metrics", __name__, url_prefix="/metrics")


@metrics_bp.route("", methods=["GET"])
@handle_api_errors
@inject
def get_metrics(metrics_service=Provide[ServiceContainer.metrics_service]):
    """Return metrics in Prometheus text format.

    Returns:
        Response with metrics data in Prometheus exposition format
    """
    metrics_text = metrics_service.get_metrics_text()

    return Response(
        metrics_text,
        content_type='text/plain; version=0.0.4; charset=utf-8'
    )
