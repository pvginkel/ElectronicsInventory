"""Tests for ShoppingListLineService."""

import pytest
from sqlalchemy import select

from app.exceptions import InvalidOperationException, RecordNotFoundException
from app.models.part_location import PartLocation
from app.models.quantity_history import QuantityHistory
from app.models.shopping_list import ShoppingListStatus
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

    def test_add_line_updates_parent_timestamp(self, session, container):
        shopping_list, part = self._create_list_with_part(container)
        shopping_list_line_service = container.shopping_list_line_service()

        session.refresh(shopping_list)
        previous_updated_at = shopping_list.updated_at

        shopping_list_line_service.add_line(
            shopping_list.id,
            part_id=part.id,
            needed=2,
        )

        session.refresh(shopping_list)
        assert shopping_list.updated_at > previous_updated_at

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

    def test_add_part_to_active_list_success(self, session, container):
        shopping_list_service = container.shopping_list_service()
        shopping_list_line_service = container.shopping_list_line_service()
        part_service = container.part_service()
        seller_service = container.seller_service()

        shopping_list = shopping_list_service.create_list("Active Only")
        session.refresh(shopping_list)
        initial_updated_at = shopping_list.updated_at

        part = part_service.create_part(description="Op-amp set")
        seller = seller_service.create_seller(
            "Active Seller",
            "https://active.example.com",
        )

        line = shopping_list_line_service.add_part_to_active_list(
            shopping_list.id,
            part_id=part.id,
            needed=5,
            seller_id=seller.id,
            note="Prototype run",
        )

        session.refresh(shopping_list)

        assert line.shopping_list_id == shopping_list.id
        assert line.part_id == part.id
        assert line.note == "Prototype run"
        assert line.seller is not None and line.seller.id == seller.id
        assert shopping_list.updated_at >= initial_updated_at
        assert shopping_list.updated_at != initial_updated_at

    def test_add_part_to_active_list_rejects_non_active(self, session, container):
        shopping_list_service = container.shopping_list_service()
        shopping_list_line_service = container.shopping_list_line_service()
        part_service = container.part_service()

        shopping_list = shopping_list_service.create_list("Done Only")
        part = part_service.create_part(description="Comparator")

        shopping_list_service.set_list_status(
            shopping_list.id,
            ShoppingListStatus.DONE,
        )

        with pytest.raises(InvalidOperationException):
            shopping_list_line_service.add_part_to_active_list(
                shopping_list.id,
                part_id=part.id,
                needed=1,
            )

    def test_add_part_to_active_list_duplicate_raises(self, session, container):
        shopping_list, part = self._create_list_with_part(container)
        shopping_list_line_service = container.shopping_list_line_service()

        shopping_list_line_service.add_part_to_active_list(
            shopping_list.id,
            part_id=part.id,
            needed=2,
        )

        with pytest.raises(InvalidOperationException):
            shopping_list_line_service.add_part_to_active_list(
                shopping_list.id,
                part_id=part.id,
                needed=1,
            )

    def test_add_line_rejects_done_list(self, session, container):
        shopping_list_service = container.shopping_list_service()
        shopping_list_line_service = container.shopping_list_line_service()
        part_service = container.part_service()

        shopping_list = shopping_list_service.create_list("Immutable After Done")
        part_initial = part_service.create_part(description="Initial component")
        part_followup = part_service.create_part(description="Follow-up component")

        shopping_list_line_service.add_line(
            shopping_list.id,
            part_id=part_initial.id,
            needed=1,
        )
        shopping_list_service.set_list_status(
            shopping_list.id,
            ShoppingListStatus.DONE,
        )

        with pytest.raises(InvalidOperationException) as exc:
            shopping_list_line_service.add_line(
                shopping_list.id,
                part_id=part_followup.id,
                needed=2,
            )

        assert (
            exc.value.message
            == "Cannot add part to shopping list because lines cannot be modified on a list that is marked done"
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
            seller_id_provided=True,
            note="Request ROHS variant",
        )

        assert updated.needed == 7
        assert updated.seller_id == seller.id
        assert updated.note == "Request ROHS variant"

    def test_update_line_updates_parent_timestamp(self, session, container):
        shopping_list, part = self._create_list_with_part(container)
        shopping_list_line_service = container.shopping_list_line_service()

        line = shopping_list_line_service.add_line(
            shopping_list.id,
            part_id=part.id,
            needed=5,
        )
        session.refresh(shopping_list)
        after_add = shopping_list.updated_at

        shopping_list_line_service.update_line(
            line.id,
            note="Updated note",
        )

        session.refresh(shopping_list)
        assert shopping_list.updated_at > after_add

    def test_update_line_rejects_done_list(self, session, container):
        shopping_list_service = container.shopping_list_service()
        shopping_list_line_service = container.shopping_list_line_service()
        part_service = container.part_service()

        shopping_list = shopping_list_service.create_list("No Edits After Done")
        part = part_service.create_part(description="Config jumper")

        line = shopping_list_line_service.add_line(
            shopping_list.id,
            part_id=part.id,
            needed=2,
        )
        shopping_list_service.set_list_status(
            shopping_list.id,
            ShoppingListStatus.DONE,
        )

        with pytest.raises(InvalidOperationException) as exc:
            shopping_list_line_service.update_line(
                line.id,
                note="Attempt edit",
            )

        assert (
            exc.value.message
            == "Cannot update shopping list line because lines cannot be modified on a list that is marked done"
        )

    def test_update_line_allows_clearing_seller_override(self, session, container):
        shopping_list, part = self._create_list_with_part(container)
        shopping_list_line_service = container.shopping_list_line_service()
        seller = container.seller_service().create_seller(
            "Override Seller",
            "https://override.example.com",
        )

        line = shopping_list_line_service.add_line(
            shopping_list.id,
            part_id=part.id,
            needed=5,
            seller_id=seller.id,
        )

        cleared = shopping_list_line_service.update_line(
            line.id,
            seller_id=None,
            seller_id_provided=True,
        )

        assert cleared.seller_id is None

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

    def test_update_line_ordered_field_on_new_line(self, session, container):
        """Ordered quantity can be set on a NEW line."""
        shopping_list, part = self._create_list_with_part(container)
        shopping_list_line_service = container.shopping_list_line_service()

        line = shopping_list_line_service.add_line(
            shopping_list.id,
            part_id=part.id,
            needed=5,
        )

        updated = shopping_list_line_service.update_line(
            line.id,
            ordered=3,
        )

        assert updated.ordered == 3

    def test_update_line_ordered_field_rejects_on_ordered_line(self, session, container):
        """Ordered quantity cannot be changed on an ORDERED line."""
        shopping_list, part = self._create_list_with_part(container)
        shopping_list_line_service = container.shopping_list_line_service()

        line = shopping_list_line_service.add_line(
            shopping_list.id,
            part_id=part.id,
            needed=5,
        )

        # Manually set the line to ORDERED
        stored_line = session.get(ShoppingListLine, line.id)
        stored_line.status = ShoppingListLineStatus.ORDERED
        stored_line.ordered = 5
        session.flush()

        with pytest.raises(InvalidOperationException) as exc:
            shopping_list_line_service.update_line(
                line.id,
                ordered=3,
            )
        assert "ordered quantity can only be set while the line is NEW" in exc.value.message

    def test_update_line_seller_id_blocked_on_ordered_line(self, session, container):
        """Seller cannot be changed on an ORDERED line."""
        shopping_list, part = self._create_list_with_part(container)
        shopping_list_line_service = container.shopping_list_line_service()
        seller_service = container.seller_service()

        seller_a = seller_service.create_seller("Seller A", "https://a.example")
        seller_b = seller_service.create_seller("Seller B", "https://b.example")

        line = shopping_list_line_service.add_line(
            shopping_list.id,
            part_id=part.id,
            needed=5,
            seller_id=seller_a.id,
        )

        # Manually set the line to ORDERED
        stored_line = session.get(ShoppingListLine, line.id)
        stored_line.status = ShoppingListLineStatus.ORDERED
        stored_line.ordered = 5
        session.flush()

        with pytest.raises(InvalidOperationException) as exc:
            shopping_list_line_service.update_line(
                line.id,
                seller_id=seller_b.id,
                seller_id_provided=True,
            )
        assert "seller cannot be changed on an ordered line" in exc.value.message

    def test_update_line_seller_id_same_value_allowed_on_ordered(self, session, container):
        """Setting seller_id to the same value is allowed on ORDERED lines."""
        shopping_list, part = self._create_list_with_part(container)
        shopping_list_line_service = container.shopping_list_line_service()
        seller_service = container.seller_service()

        seller = seller_service.create_seller("Same Seller", "https://same.example")

        line = shopping_list_line_service.add_line(
            shopping_list.id,
            part_id=part.id,
            needed=5,
            seller_id=seller.id,
        )

        # Manually set the line to ORDERED
        stored_line = session.get(ShoppingListLine, line.id)
        stored_line.status = ShoppingListLineStatus.ORDERED
        stored_line.ordered = 5
        session.flush()

        # Same seller_id should not raise
        updated = shopping_list_line_service.update_line(
            line.id,
            seller_id=seller.id,
            seller_id_provided=True,
        )
        assert updated.seller_id == seller.id

    def test_update_line_ordered_rejects_negative(self, session, container):
        """Negative ordered quantity is rejected."""
        shopping_list, part = self._create_list_with_part(container)
        shopping_list_line_service = container.shopping_list_line_service()

        line = shopping_list_line_service.add_line(
            shopping_list.id,
            part_id=part.id,
            needed=5,
        )

        with pytest.raises(InvalidOperationException) as exc:
            shopping_list_line_service.update_line(
                line.id,
                ordered=-1,
            )
        assert "ordered quantity must be zero or greater" in exc.value.message

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

    def test_delete_line_updates_parent_timestamp(self, session, container):
        shopping_list, part = self._create_list_with_part(container)
        shopping_list_line_service = container.shopping_list_line_service()

        line = shopping_list_line_service.add_line(
            shopping_list.id,
            part_id=part.id,
            needed=3,
        )
        session.refresh(shopping_list)
        after_add = shopping_list.updated_at

        shopping_list_line_service.delete_line(line.id)
        session.refresh(shopping_list)

        assert shopping_list.updated_at > after_add

    def test_delete_line_rejects_done_list(self, session, container):
        shopping_list_service = container.shopping_list_service()
        shopping_list_line_service = container.shopping_list_line_service()
        part_service = container.part_service()

        shopping_list = shopping_list_service.create_list("No Deletes After Done")
        part = part_service.create_part(description="Spacer kit")

        line = shopping_list_line_service.add_line(
            shopping_list.id,
            part_id=part.id,
            needed=1,
        )
        shopping_list_service.set_list_status(
            shopping_list.id,
            ShoppingListStatus.DONE,
        )

        with pytest.raises(InvalidOperationException) as exc:
            shopping_list_line_service.delete_line(line.id)

        assert (
            exc.value.message
            == "Cannot delete shopping list line because lines cannot be modified on a list that is marked done"
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

    def test_receive_line_stock_success(self, session, container):
        shopping_list, part = self._create_list_with_part(container)
        box = container.box_service().create_box("Receiving Bin", 5)
        session.flush()

        shopping_list_line_service = container.shopping_list_line_service()
        seller_service = container.seller_service()

        seller = seller_service.create_seller("Receive Seller", "https://receive.example")

        line = shopping_list_line_service.add_line(
            shopping_list.id,
            part_id=part.id,
            needed=5,
            seller_id=seller.id,
        )
        session.flush()

        # Manually set line to ORDERED state for receiving
        stored_line = session.get(ShoppingListLine, line.id)
        stored_line.status = ShoppingListLineStatus.ORDERED
        stored_line.ordered = 5
        session.flush()

        session.refresh(shopping_list)
        previous_updated_at = shopping_list.updated_at

        received_line = shopping_list_line_service.receive_line_stock(
            line.id,
            receive_qty=3,
            allocations=[
                {"box_no": box.box_no, "loc_no": 1, "qty": 2},
                {"box_no": box.box_no, "loc_no": 2, "qty": 1},
            ],
        )

        assert received_line.received == 3
        assert received_line.can_receive is True
        assert received_line.completed_at is None

        db_locations = session.execute(
            select(PartLocation).where(PartLocation.part_id == part.id)
        ).scalars().all()
        assert len(db_locations) == 2

        location_summary = {
            (loc.box_no, loc.loc_no): loc.qty for loc in received_line.part_locations
        }
        assert (box.box_no, 1) in location_summary, location_summary
        assert (box.box_no, 2) in location_summary, location_summary
        assert location_summary[(box.box_no, 1)] == 2
        assert location_summary[(box.box_no, 2)] == 1

        history_entries = session.execute(
            select(QuantityHistory).where(QuantityHistory.part_id == part.id)
        ).scalars().all()
        assert {entry.delta_qty for entry in history_entries} == {2, 1}

        session.refresh(shopping_list)
        assert shopping_list.updated_at >= previous_updated_at

    def test_receive_line_stock_rejects_non_ordered(self, session, container):
        shopping_list, part = self._create_list_with_part(container)
        box = container.box_service().create_box("Pending Bin", 3)
        session.flush()

        shopping_list_line_service = container.shopping_list_line_service()

        line = shopping_list_line_service.add_line(
            shopping_list.id,
            part_id=part.id,
            needed=2,
        )

        with pytest.raises(InvalidOperationException):
            shopping_list_line_service.receive_line_stock(
                line.id,
                receive_qty=1,
                allocations=[
                    {"box_no": box.box_no, "loc_no": 1, "qty": 1},
                ],
            )

    def test_receive_line_stock_rejects_ungrouped_line(self, session, container):
        """Even if a line is somehow ORDERED without a seller, receiving is blocked."""
        shopping_list, part = self._create_list_with_part(container)
        box = container.box_service().create_box("Ungrouped Bin", 2)
        session.flush()

        shopping_list_line_service = container.shopping_list_line_service()

        line = shopping_list_line_service.add_line(
            shopping_list.id,
            part_id=part.id,
            needed=3,
        )
        session.flush()

        # Force ORDERED without a seller (should not happen in normal flow)
        stored_line = session.get(ShoppingListLine, line.id)
        stored_line.status = ShoppingListLineStatus.ORDERED
        stored_line.ordered = 3
        session.flush()

        with pytest.raises(InvalidOperationException):
            shopping_list_line_service.receive_line_stock(
                line.id,
                receive_qty=1,
                allocations=[
                    {"box_no": box.box_no, "loc_no": 1, "qty": 1},
                ],
            )

    def test_complete_line_success_without_mismatch(self, session, container):
        shopping_list, part = self._create_list_with_part(container)
        box = container.box_service().create_box("Completion Bin", 4)
        session.flush()

        shopping_list_line_service = container.shopping_list_line_service()
        seller_service = container.seller_service()
        seller = seller_service.create_seller("Complete Seller", "https://complete.example")

        line = shopping_list_line_service.add_line(
            shopping_list.id,
            part_id=part.id,
            needed=4,
            seller_id=seller.id,
        )
        session.flush()

        # Manually set line to ORDERED for the complete flow
        stored_line = session.get(ShoppingListLine, line.id)
        stored_line.status = ShoppingListLineStatus.ORDERED
        stored_line.ordered = 4
        session.flush()

        shopping_list_line_service.receive_line_stock(
            line.id,
            receive_qty=4,
            allocations=[
                {"box_no": box.box_no, "loc_no": 1, "qty": 4},
            ],
        )

        completed_line = shopping_list_line_service.complete_line(line.id)

        assert completed_line.status == ShoppingListLineStatus.DONE
        assert completed_line.can_receive is False
        assert completed_line.completion_mismatch is False
        assert completed_line.completion_note is None
        assert completed_line.completed_at is not None
        assert completed_line.has_quantity_mismatch is False

    def test_complete_line_requires_mismatch_reason(self, session, container):
        shopping_list, part = self._create_list_with_part(container)
        box = container.box_service().create_box("Mismatch Bin", 2)
        session.flush()

        shopping_list_line_service = container.shopping_list_line_service()
        seller_service = container.seller_service()
        seller = seller_service.create_seller("Mismatch Seller", "https://mismatch.example")

        line = shopping_list_line_service.add_line(
            shopping_list.id,
            part_id=part.id,
            needed=3,
            seller_id=seller.id,
        )
        session.flush()

        # Manually set line to ORDERED
        stored_line = session.get(ShoppingListLine, line.id)
        stored_line.status = ShoppingListLineStatus.ORDERED
        stored_line.ordered = 3
        session.flush()

        shopping_list_line_service.receive_line_stock(
            line.id,
            receive_qty=1,
            allocations=[
                {"box_no": box.box_no, "loc_no": 1, "qty": 1},
            ],
        )

        with pytest.raises(InvalidOperationException):
            shopping_list_line_service.complete_line(line.id)

        completed_line = shopping_list_line_service.complete_line(
            line.id,
            mismatch_reason="Supplier short shipped",
        )

        assert completed_line.completion_mismatch is True
        assert completed_line.completion_note == "Supplier short shipped"
        assert completed_line.status == ShoppingListLineStatus.DONE
