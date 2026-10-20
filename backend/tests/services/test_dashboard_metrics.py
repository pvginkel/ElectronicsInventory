"""Test the dashboard gauges' polling callback and its registration at startup."""

from unittest.mock import Mock

import pytest
from flask import Flask
from sqlalchemy.orm import Session

from app.models.type import Type
from app.services.container import (
    ServiceContainer,
    _background_starters,
    _start_metrics_polling,
)
from app.services.metrics.dashboard_metrics import (
    INVENTORY_BOX_UTILIZATION_PERCENT,
    INVENTORY_LOW_STOCK_PARTS,
    INVENTORY_PARTS_BY_TYPE,
    INVENTORY_PARTS_WITHOUT_DOCS,
    INVENTORY_RECENT_CHANGES_7D,
    INVENTORY_RECENT_CHANGES_30D,
    INVENTORY_TOTAL_BOXES,
    INVENTORY_TOTAL_PARTS,
    INVENTORY_TOTAL_QUANTITY,
    create_dashboard_polling_callback,
)
from app.services.metrics_service import MetricsService

pytestmark = pytest.mark.usefixtures("without_seeded_types")


class TestDashboardPollingCallback:
    """Test cases for the dashboard polling callback."""

    def test_poll_sets_dashboard_gauges(
        self, app: Flask, session: Session, container: ServiceContainer
    ):
        """A poll sets all nine dashboard gauges from the current inventory."""
        with app.app_context():
            box = container.box_service().create_box("Test Box", 10)

            test_type = Type(name="Test Type")
            session.add(test_type)
            session.flush()

            part1 = container.part_service().create_part("Test Part 1", type_id=test_type.id)
            part2 = container.part_service().create_part("Test Part 2", type_id=test_type.id)
            container.inventory_service().add_stock(part1.key, box.box_no, 1, 20)
            container.inventory_service().add_stock(part2.key, box.box_no, 2, 3)  # Low stock
            session.commit()

            create_dashboard_polling_callback(container)()

            assert INVENTORY_TOTAL_PARTS._value.get() == 2
            assert INVENTORY_TOTAL_QUANTITY._value.get() == 23
            assert INVENTORY_LOW_STOCK_PARTS._value.get() == 1
            # Neither part has an attachment
            assert INVENTORY_PARTS_WITHOUT_DOCS._value.get() == 2
            # Each add_stock records one quantity change
            assert INVENTORY_RECENT_CHANGES_7D._value.get() == 2
            assert INVENTORY_RECENT_CHANGES_30D._value.get() == 2
            assert INVENTORY_TOTAL_BOXES._value.get() == 1
            # 2 of the box's 10 locations are occupied
            assert (
                INVENTORY_BOX_UTILIZATION_PERCENT.labels(box_no=str(box.box_no))._value.get()
                == 20.0
            )
            assert INVENTORY_PARTS_BY_TYPE.labels(type_name="Test Type")._value.get() == 2


class TestMetricsPollingStartup:
    """Test cases for starting the dashboard polling with the background services."""

    def test_startup_registers_dashboard_callback_and_starts_updater(
        self, container: ServiceContainer
    ):
        """The background startup registers the dashboard callback and starts polling."""
        assert _start_metrics_polling in _background_starters

        metrics_service = Mock(spec=MetricsService)
        with container.metrics_service.override(metrics_service):
            _start_metrics_polling(container)

        metrics_service.register_for_polling.assert_called_once()
        name, callback = metrics_service.register_for_polling.call_args.args
        assert name == "dashboard"
        assert callable(callback)
        metrics_service.start_background_updater.assert_called_once_with(
            container.config().metrics_update_interval
        )
