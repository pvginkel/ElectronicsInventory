"""Tests for ShoppingListLineService."""

import pytest

from app.exceptions import InvalidOperationException, RecordNotFoundException
from app.models.shopping_list_line import ShoppingListLine, ShoppingListLineStatus


class TestShoppingListLineService:
    """Service-level tests for shopping list line business rules."""

    def _create_list_with_part(self, container):
        shopping_list_service = container.shopping_list_service()
        part_service = container.part_service()

        shopping_list = shopping_list_service.create_list("Modulator Build")
        part = part_service.create_part(description="Precision resistor pack")
        return shopping_list, part

    def test_add_line_success(self, session, container):
        shopping_list, part = self._create_list_with_part(container)
        shopping_list_line_service = container.shopping_list_line_service()

        line = shopping_list_line_service.add_line(
            shopping_list.id,
            part_id=part.id,
            needed=3,
        )

        assert line.part_id == part.id
        assert line.status == ShoppingListLineStatus.NEW

    def test_add_line_duplicate_prevented(self, session, container):
        shopping_list, part = self._create_list_with_part(container)
        shopping_list_line_service = container.shopping_list_line_service()

        shopping_list_line_service.add_line(
            shopping_list.id,
            part_id=part.id,
            needed=1,
        )

        with pytest.raises(InvalidOperationException):
            shopping_list_line_service.add_line(
                shopping_list.id,
                part_id=part.id,
                needed=2,
            )

    def test_update_line_changes_fields(self, session, container):
        shopping_list, part = self._create_list_with_part(container)
        shopping_list_line_service = container.shopping_list_line_service()
        seller_service = container.seller_service()

        line = shopping_list_line_service.add_line(
            shopping_list.id,
            part_id=part.id,
            needed=5,
        )
        seller = seller_service.create_seller("Fixture Seller", "https://fixture.example.com")

        updated = shopping_list_line_service.update_line(
            line.id,
            needed=7,
            seller_id=seller.id,
            note="Request ROHS variant",
        )

        assert updated.needed == 7
        assert updated.seller_id == seller.id
        assert updated.note == "Request ROHS variant"

    def test_update_line_rejects_invalid_needed(self, session, container):
        shopping_list, part = self._create_list_with_part(container)
        shopping_list_line_service = container.shopping_list_line_service()

        line = shopping_list_line_service.add_line(
            shopping_list.id,
            part_id=part.id,
            needed=3,
        )

        with pytest.raises(InvalidOperationException):
            shopping_list_line_service.update_line(
                line.id,
                needed=0,
            )

    def test_delete_line_removes_record(self, session, container):
        shopping_list, part = self._create_list_with_part(container)
        shopping_list_line_service = container.shopping_list_line_service()

        line = shopping_list_line_service.add_line(
            shopping_list.id,
            part_id=part.id,
            needed=2,
        )

        shopping_list_line_service.delete_line(line.id)
        session.flush()

        with pytest.raises(RecordNotFoundException):
            shopping_list_line_service.update_line(
                line.id,
                needed=5,
            )

    def test_list_lines_filters_done(self, session, container):
        shopping_list, part = self._create_list_with_part(container)
        shopping_list_line_service = container.shopping_list_line_service()
        extra_part = container.part_service().create_part(description="Toggle switch")

        line_new = shopping_list_line_service.add_line(
            shopping_list.id,
            part_id=part.id,
            needed=1,
        )
        line_done = shopping_list_line_service.add_line(
            shopping_list.id,
            part_id=extra_part.id,
            needed=2,
        )

        stored_line = session.get(ShoppingListLine, line_done.id)
        assert stored_line is not None
        stored_line.status = ShoppingListLineStatus.DONE
        session.flush()

        all_lines = shopping_list_line_service.list_lines(shopping_list.id)
        assert {line.id for line in all_lines} == {line_new.id, line_done.id}

        active_lines = shopping_list_line_service.list_lines(
            shopping_list.id,
            include_done=False,
        )
        assert {line.id for line in active_lines} == {line_new.id}
