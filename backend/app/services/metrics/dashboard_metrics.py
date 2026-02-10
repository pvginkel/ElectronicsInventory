"""Periodic dashboard gauge metrics updated via background polling.

These gauges are refreshed on each polling tick by a callback registered
with MetricsService.  The callback queries DashboardService for current
inventory, storage, and category statistics.
"""

from __future__ import annotations

import logging
from collections.abc import Callable
from typing import TYPE_CHECKING

from prometheus_client import Gauge

if TYPE_CHECKING:
    from app.services.container import ServiceContainer

logger = logging.getLogger(__name__)

# ---- Inventory gauges ----
INVENTORY_TOTAL_PARTS = Gauge(
    "inventory_total_parts",
    "Total parts in system",
)
INVENTORY_TOTAL_QUANTITY = Gauge(
    "inventory_total_quantity",
    "Sum of all quantities",
)
INVENTORY_LOW_STOCK_PARTS = Gauge(
    "inventory_low_stock_parts",
    "Parts with qty <= 5",
)
INVENTORY_PARTS_WITHOUT_DOCS = Gauge(
    "inventory_parts_without_docs",
    "Undocumented parts",
)
INVENTORY_RECENT_CHANGES_7D = Gauge(
    "inventory_recent_changes_7d",
    "Changes in last 7 days",
)
INVENTORY_RECENT_CHANGES_30D = Gauge(
    "inventory_recent_changes_30d",
    "Changes in last 30 days",
)

# ---- Storage gauges ----
INVENTORY_BOX_UTILIZATION_PERCENT = Gauge(
    "inventory_box_utilization_percent",
    "Box usage percentage",
    ["box_no"],
)
INVENTORY_TOTAL_BOXES = Gauge(
    "inventory_total_boxes",
    "Active storage boxes",
)

# ---- Category gauges ----
INVENTORY_PARTS_BY_TYPE = Gauge(
    "inventory_parts_by_type",
    "Parts per category",
    ["type_name"],
)


def create_dashboard_polling_callback(
    container: ServiceContainer,
) -> Callable[[], None]:
    """Return a closure that updates all dashboard gauges.

    The closure follows the singleton session pattern:
    try / commit / except / rollback / finally / reset.

    Args:
        container: The DI service container (captured by the closure).
    """

    def _poll() -> None:
        session = container.db_session()

        try:
            dashboard_service = container.dashboard_service()

            # Inventory stats
            stats = dashboard_service.get_dashboard_stats()
            INVENTORY_TOTAL_PARTS.set(stats["total_parts"])
            INVENTORY_TOTAL_QUANTITY.set(stats["total_quantity"])
            INVENTORY_LOW_STOCK_PARTS.set(stats["low_stock_count"])
            INVENTORY_RECENT_CHANGES_7D.set(stats["changes_7d"])
            INVENTORY_RECENT_CHANGES_30D.set(stats["changes_30d"])

            # Parts without docs
            undocumented = dashboard_service.get_parts_without_documents()
            INVENTORY_PARTS_WITHOUT_DOCS.set(undocumented["count"])

            # Storage summary (per-box utilization)
            storage_summary = dashboard_service.get_storage_summary()
            INVENTORY_BOX_UTILIZATION_PERCENT.clear()
            for box_data in storage_summary:
                box_no = str(box_data["box_no"])
                utilization = box_data["usage_percentage"]
                INVENTORY_BOX_UTILIZATION_PERCENT.labels(box_no=box_no).set(
                    utilization
                )
            INVENTORY_TOTAL_BOXES.set(len(storage_summary))

            # Category distribution
            category_distribution = dashboard_service.get_category_distribution()
            INVENTORY_PARTS_BY_TYPE.clear()
            for category_data in category_distribution:
                type_name = category_data["type_name"]
                part_count = category_data["part_count"]
                INVENTORY_PARTS_BY_TYPE.labels(type_name=type_name).set(
                    part_count
                )

            session.commit()

        except Exception as e:
            session.rollback()
            logger.error("Error in dashboard polling callback: %s", e)

        finally:
            container.db_session.reset()

    return _poll
