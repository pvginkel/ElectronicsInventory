"""Tests for ShoppingListService."""

import pytest

from app.exceptions import (
    InvalidOperationException,
    RecordNotFoundException,
    ResourceConflictException,
)
from app.models.shopping_list import ShoppingListStatus
from app.models.shopping_list_line import ShoppingListLine, ShoppingListLineStatus


class TestShoppingListService:
    """Service-level tests covering shopping list lifecycle operations."""

    def test_create_list_defaults(self, session, container):
        shopping_list_service = container.shopping_list_service()

        shopping_list = shopping_list_service.create_list("SMD Rework Kit")

        assert shopping_list.status == ShoppingListStatus.CONCEPT
        assert shopping_list.line_counts == {"new": 0, "ordered": 0, "done": 0}

    def test_duplicate_name_raises_conflict(self, session, container):
        shopping_list_service = container.shopping_list_service()

        shopping_list_service.create_list("FPGA Dev Board")

        with pytest.raises(ResourceConflictException):
            shopping_list_service.create_list("FPGA Dev Board")

    def test_ready_requires_line(self, session, container):
        shopping_list_service = container.shopping_list_service()
        shopping_list_line_service = container.shopping_list_line_service()
        part_service = container.part_service()

        shopping_list = shopping_list_service.create_list("Shift Register Breakout")

        with pytest.raises(InvalidOperationException):
            shopping_list_service.set_list_status(
                shopping_list.id,
                ShoppingListStatus.READY,
            )

        part = part_service.create_part(description="74HC595 shift register")
        shopping_list_line_service.add_line(
            shopping_list.id,
            part_id=part.id,
            needed=4,
        )

        updated = shopping_list_service.set_list_status(
            shopping_list.id,
            ShoppingListStatus.READY,
        )
        assert updated.status == ShoppingListStatus.READY

    def test_revert_ready_requires_no_ordered_lines(self, session, container):
        shopping_list_service = container.shopping_list_service()
        shopping_list_line_service = container.shopping_list_line_service()
        part_service = container.part_service()

        shopping_list = shopping_list_service.create_list("Logic Analyzer BOM")
        part = part_service.create_part(description="Logic analyzer header")
        line = shopping_list_line_service.add_line(
            shopping_list.id,
            part_id=part.id,
            needed=2,
        )

        shopping_list_service.set_list_status(
            shopping_list.id,
            ShoppingListStatus.READY,
        )

        # Manually mark the line as ORDERED to simulate Phase 2 state
        line_for_update = session.get(ShoppingListLine, line.id)
        assert line_for_update is not None
        line_for_update.status = ShoppingListLineStatus.ORDERED
        session.flush()

        with pytest.raises(InvalidOperationException):
            shopping_list_service.set_list_status(
                shopping_list.id,
                ShoppingListStatus.CONCEPT,
            )

    def test_list_lists_filters_done_by_default(self, session, container):
        shopping_list_service = container.shopping_list_service()
        shopping_list_line_service = container.shopping_list_line_service()
        part_service = container.part_service()

        concept_list = shopping_list_service.create_list("Amplifier Refresh")

        ready_list = shopping_list_service.create_list("Bench Supplies")
        ready_part = part_service.create_part(description="ESD mat")
        shopping_list_line_service.add_line(ready_list.id, part_id=ready_part.id, needed=1)
        shopping_list_service.set_list_status(ready_list.id, ShoppingListStatus.READY)

        done_list = shopping_list_service.create_list("Archived Build")
        done_part = part_service.create_part(description="Legacy op-amp")
        shopping_list_line_service.add_line(done_list.id, part_id=done_part.id, needed=2)
        shopping_list_service.set_list_status(done_list.id, ShoppingListStatus.READY)
        shopping_list_service.set_list_status(done_list.id, ShoppingListStatus.DONE)

        visible_lists = shopping_list_service.list_lists()
        names = {shopping_list.name for shopping_list in visible_lists}
        assert concept_list.name in names
        assert ready_list.name in names
        assert done_list.name not in names

        all_lists = shopping_list_service.list_lists(include_done=True)
        all_names = {shopping_list.name for shopping_list in all_lists}
        assert done_list.name in all_names

    def test_delete_list_cascades_lines(self, session, container):
        shopping_list_service = container.shopping_list_service()
        shopping_list_line_service = container.shopping_list_line_service()
        part_service = container.part_service()

        shopping_list = shopping_list_service.create_list("FPV Drone BOM")
        part = part_service.create_part(description="Brushless motor")
        line = shopping_list_line_service.add_line(
            shopping_list.id,
            part_id=part.id,
            needed=4,
        )

        shopping_list_service.delete_list(shopping_list.id)
        session.flush()

        deleted_line = session.get(ShoppingListLine, line.id)
        assert deleted_line is None
