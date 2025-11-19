"""Dashboard API endpoints for aggregated inventory statistics."""

from typing import Any

from dependency_injector.wiring import Provide, inject
from flask import Blueprint, request
from spectree import Response as SpectreeResponse

from app.schemas.common import ErrorResponseSchema
from app.schemas.dashboard import (
    CategoryDistributionSchema,
    DashboardStatsSchema,
    LowStockItemSchema,
    RecentActivitySchema,
    StorageSummarySchema,
    UndocumentedPartsSchema,
)
from app.services.container import ServiceContainer
from app.services.dashboard_service import DashboardService
from app.utils.error_handling import handle_api_errors
from app.utils.spectree_config import api

dashboard_bp = Blueprint("dashboard", __name__, url_prefix="/dashboard")


@dashboard_bp.route("/stats", methods=["GET"])
@api.validate(resp=SpectreeResponse(HTTP_200=DashboardStatsSchema, HTTP_500=ErrorResponseSchema))
@handle_api_errors
@inject
def get_dashboard_stats(dashboard_service: DashboardService = Provide[ServiceContainer.dashboard_service]) -> Any:
    """Get aggregated dashboard statistics.

    Returns:
        JSON response containing dashboard statistics including total parts,
        quantity, boxes, types, recent activity counts, and low stock count.
    """
    stats = dashboard_service.get_dashboard_stats()
    return DashboardStatsSchema.model_validate(stats).model_dump(), 200


@dashboard_bp.route("/recent-activity", methods=["GET"])
@api.validate(resp=SpectreeResponse(HTTP_200=list[RecentActivitySchema], HTTP_500=ErrorResponseSchema))
@handle_api_errors
@inject
def get_recent_activity(dashboard_service: DashboardService = Provide[ServiceContainer.dashboard_service]) -> Any:
    """Get recent stock changes and activity.

    Query Parameters:
        limit (int): Maximum number of activity records to return (default: 20)

    Returns:
        JSON response containing list of recent activity items with part details,
        quantity changes, and timestamps.
    """
    # Validate and sanitize limit parameter
    try:
        limit = int(request.args.get("limit", 20))
    except (ValueError, TypeError):
        limit = 20

    # Enforce reasonable bounds
    if limit < 1:
        limit = 1
    elif limit > 100:  # Cap the limit for performance
        limit = 100

    activities = dashboard_service.get_recent_activity(limit)
    result = [RecentActivitySchema.model_validate(activity).model_dump() for activity in activities]
    return result, 200


@dashboard_bp.route("/storage-summary", methods=["GET"])
@api.validate(resp=SpectreeResponse(HTTP_200=list[StorageSummarySchema], HTTP_500=ErrorResponseSchema))
@handle_api_errors
@inject
def get_storage_summary(dashboard_service: DashboardService = Provide[ServiceContainer.dashboard_service]) -> Any:
    """Get storage box utilization summary.

    Returns:
        JSON response containing list of storage boxes with their capacity,
        occupied locations, and usage percentages.
    """
    summary = dashboard_service.get_storage_summary()
    result = [StorageSummarySchema.model_validate(box).model_dump() for box in summary]
    return result, 200


@dashboard_bp.route("/low-stock", methods=["GET"])
@api.validate(resp=SpectreeResponse(HTTP_200=list[LowStockItemSchema], HTTP_500=ErrorResponseSchema))
@handle_api_errors
@inject
def get_low_stock_items(dashboard_service: DashboardService = Provide[ServiceContainer.dashboard_service]) -> Any:
    """Get parts with low stock quantities.

    Query Parameters:
        threshold (int): Quantity threshold below which parts are considered low stock (default: 5)

    Returns:
        JSON response containing list of parts below the threshold quantity
        with part details and current quantities.
    """
    # Validate and sanitize threshold parameter
    try:
        threshold = int(request.args.get("threshold", 5))
    except (ValueError, TypeError):
        threshold = 5

    # Enforce reasonable bounds
    if threshold < 0:
        threshold = 5
    elif threshold > 1000:  # Reasonable upper bound
        threshold = 1000

    low_stock = dashboard_service.get_low_stock_items(threshold)
    result = [LowStockItemSchema.model_validate(item).model_dump() for item in low_stock]
    return result, 200


@dashboard_bp.route("/category-distribution", methods=["GET"])
@api.validate(resp=SpectreeResponse(HTTP_200=list[CategoryDistributionSchema], HTTP_500=ErrorResponseSchema))
@handle_api_errors
@inject
def get_category_distribution(dashboard_service: DashboardService = Provide[ServiceContainer.dashboard_service]) -> Any:
    """Get part count distribution by category/type.

    Returns:
        JSON response containing list of part types with their names,
        colors, and part counts, ordered by part count descending.
    """
    distribution = dashboard_service.get_category_distribution()
    result = [CategoryDistributionSchema.model_validate(item).model_dump() for item in distribution]
    return result, 200


@dashboard_bp.route("/parts-without-documents", methods=["GET"])
@api.validate(resp=SpectreeResponse(HTTP_200=UndocumentedPartsSchema, HTTP_500=ErrorResponseSchema))
@handle_api_errors
@inject
def get_parts_without_documents(dashboard_service: DashboardService = Provide[ServiceContainer.dashboard_service]) -> Any:
    """Get count and sample of parts without attached documents.

    Returns:
        JSON response containing total count of parts without documents
        and a sample of up to 10 undocumented parts.
    """
    result = dashboard_service.get_parts_without_documents()
    return UndocumentedPartsSchema.model_validate(result).model_dump(), 200
