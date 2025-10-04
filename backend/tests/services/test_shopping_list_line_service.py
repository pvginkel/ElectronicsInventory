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

    def test_add_part_to_concept_list_success(self, session, container):
        shopping_list_service = container.shopping_list_service()
        shopping_list_line_service = container.shopping_list_line_service()
        part_service = container.part_service()
        seller_service = container.seller_service()

        shopping_list = shopping_list_service.create_list("Concept Only")
        session.refresh(shopping_list)
        initial_updated_at = shopping_list.updated_at

        part = part_service.create_part(description="Op-amp set")
        seller = seller_service.create_seller(
            "Concept Seller",
            "https://concept.example.com",
        )

        line = shopping_list_line_service.add_part_to_concept_list(
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

    def test_add_part_to_concept_list_rejects_non_concept(self, session, container):
        shopping_list_service = container.shopping_list_service()
        shopping_list_line_service = container.shopping_list_line_service()
        part_service = container.part_service()

        shopping_list = shopping_list_service.create_list("Ready Only")
        part = part_service.create_part(description="Comparator")
        other_part = part_service.create_part(description="Support component")

        shopping_list_line_service.add_line(
            shopping_list.id,
            part_id=other_part.id,
            needed=1,
        )
        shopping_list_service.set_list_status(
            shopping_list.id,
            ShoppingListStatus.READY,
        )

        with pytest.raises(InvalidOperationException):
            shopping_list_line_service.add_part_to_concept_list(
                shopping_list.id,
                part_id=part.id,
                needed=1,
            )

    def test_add_part_to_concept_list_duplicate_raises(self, session, container):
        shopping_list, part = self._create_list_with_part(container)
        shopping_list_line_service = container.shopping_list_line_service()

        shopping_list_line_service.add_part_to_concept_list(
            shopping_list.id,
            part_id=part.id,
            needed=2,
        )

        with pytest.raises(InvalidOperationException):
            shopping_list_line_service.add_part_to_concept_list(
                shopping_list.id,
                part_id=part.id,
                needed=1,
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

    def test_set_line_ordered_updates_status_and_comment(self, session, container):
        shopping_list, part = self._create_list_with_part(container)
        shopping_list_service = container.shopping_list_service()
        shopping_list_line_service = container.shopping_list_line_service()

        line = shopping_list_line_service.add_line(
            shopping_list.id,
            part_id=part.id,
            needed=4,
        )

        with pytest.raises(InvalidOperationException):
            shopping_list_line_service.set_line_ordered(line.id)

        shopping_list_service.set_list_status(
            shopping_list.id,
            ShoppingListStatus.READY,
        )

        ordered_line = shopping_list_line_service.set_line_ordered(
            line.id,
            ordered_qty=3,
            comment="Ordered for weekend build",
        )

        assert ordered_line.status == ShoppingListLineStatus.ORDERED
        assert ordered_line.ordered == 3
        assert ordered_line.note == "Ordered for weekend build"
        assert ordered_line.is_revertible is True

    def test_set_line_ordered_rejects_done_lines(self, session, container):
        shopping_list, part = self._create_list_with_part(container)
        shopping_list_service = container.shopping_list_service()
        shopping_list_line_service = container.shopping_list_line_service()

        line = shopping_list_line_service.add_line(
            shopping_list.id,
            part_id=part.id,
            needed=2,
        )
        shopping_list_service.set_list_status(
            shopping_list.id,
            ShoppingListStatus.READY,
        )

        stored_line = session.get(ShoppingListLine, line.id)
        assert stored_line is not None
        stored_line.status = ShoppingListLineStatus.DONE
        session.flush()

        with pytest.raises(InvalidOperationException):
            shopping_list_line_service.set_line_ordered(line.id, ordered_qty=2)

    def test_set_line_new_resets_state(self, session, container):
        shopping_list, part = self._create_list_with_part(container)
        shopping_list_service = container.shopping_list_service()
        shopping_list_line_service = container.shopping_list_line_service()

        line = shopping_list_line_service.add_line(
            shopping_list.id,
            part_id=part.id,
            needed=6,
        )
        shopping_list_service.set_list_status(
            shopping_list.id,
            ShoppingListStatus.READY,
        )
        shopping_list_line_service.set_line_ordered(line.id, ordered_qty=6)

        reverted = shopping_list_line_service.set_line_new(line.id)
        assert reverted.status == ShoppingListLineStatus.NEW
        assert reverted.ordered == 0
        assert reverted.is_revertible is False

        stored_line = session.get(ShoppingListLine, line.id)
        assert stored_line.status == ShoppingListLineStatus.NEW

    def test_set_line_new_requires_no_received(self, session, container):
        shopping_list, part = self._create_list_with_part(container)
        shopping_list_service = container.shopping_list_service()
        shopping_list_line_service = container.shopping_list_line_service()

        line = shopping_list_line_service.add_line(
            shopping_list.id,
            part_id=part.id,
            needed=2,
        )
        shopping_list_service.set_list_status(
            shopping_list.id,
            ShoppingListStatus.READY,
        )
        shopping_list_line_service.set_line_ordered(line.id, ordered_qty=2)

        stored_line = session.get(ShoppingListLine, line.id)
        assert stored_line is not None
        stored_line.received = 1
        session.flush()

        with pytest.raises(InvalidOperationException):
            shopping_list_line_service.set_line_new(line.id)

    def test_set_group_ordered_updates_multiple_lines(self, session, container):
        shopping_list_service = container.shopping_list_service()
        shopping_list_line_service = container.shopping_list_line_service()
        part_service = container.part_service()
        seller_service = container.seller_service()

        seller = seller_service.create_seller("Ready Seller", "https://seller.example")
        part_default = part_service.create_part(
            description="Logic buffer",
            seller_id=seller.id,
        )
        part_override = part_service.create_part(
            description="Harness kit",
        )
        part_other = part_service.create_part(
            description="Nylon standoff",
        )

        shopping_list = shopping_list_service.create_list("Group Order")
        default_line = shopping_list_line_service.add_line(
            shopping_list.id,
            part_id=part_default.id,
            needed=4,
        )
        override_line = shopping_list_line_service.add_line(
            shopping_list.id,
            part_id=part_override.id,
            needed=7,
            seller_id=seller.id,
        )
        ungrouped_line = shopping_list_line_service.add_line(
            shopping_list.id,
            part_id=part_other.id,
            needed=5,
        )
        session.commit()

        shopping_list_service.set_list_status(
            shopping_list.id,
            ShoppingListStatus.READY,
        )

        updated_lines = shopping_list_line_service.set_group_ordered(
            shopping_list.id,
            seller.id,
            {
                default_line.id: 6,
                override_line.id: 8,
            },
        )

        updated_ids = {line.id for line in updated_lines}
        assert updated_ids == {default_line.id, override_line.id}
        for line in updated_lines:
            assert line.status == ShoppingListLineStatus.ORDERED

        untouched = session.get(ShoppingListLine, ungrouped_line.id)
        assert untouched.status == ShoppingListLineStatus.NEW

        with pytest.raises(InvalidOperationException):
            shopping_list_line_service.set_group_ordered(
                shopping_list.id,
                seller.id,
                {ungrouped_line.id: 2},
            )

    def test_set_group_ordered_handles_ungrouped_bucket(self, session, container):
        shopping_list_service = container.shopping_list_service()
        shopping_list_line_service = container.shopping_list_line_service()
        part_service = container.part_service()

        shopping_list = shopping_list_service.create_list("Ungrouped Order")
        part_one = part_service.create_part(description="Spare washer")
        part_two = part_service.create_part(description="Clip lead")

        line_one = shopping_list_line_service.add_line(
            shopping_list.id,
            part_id=part_one.id,
            needed=3,
        )
        line_two = shopping_list_line_service.add_line(
            shopping_list.id,
            part_id=part_two.id,
            needed=2,
        )
        session.commit()

        shopping_list_service.set_list_status(
            shopping_list.id,
            ShoppingListStatus.READY,
        )

        updated_lines = shopping_list_line_service.set_group_ordered(
            shopping_list.id,
            None,
            {line_one.id: None, line_two.id: 5},
        )

        assert {line.id for line in updated_lines} == {line_one.id, line_two.id}
        assert all(line.status == ShoppingListLineStatus.ORDERED for line in updated_lines)

        first_line = next(line for line in updated_lines if line.id == line_one.id)
        second_line = next(line for line in updated_lines if line.id == line_two.id)
        assert first_line.ordered == line_one.needed
        assert second_line.ordered == 5

    def test_set_group_ordered_rejects_done_lines(self, session, container):
        shopping_list_service = container.shopping_list_service()
        shopping_list_line_service = container.shopping_list_line_service()
        part_service = container.part_service()
        seller_service = container.seller_service()

        seller = seller_service.create_seller("Done Seller", "https://done.example")
        part_default = part_service.create_part(
            description="Comparator",
            seller_id=seller.id,
        )

        shopping_list = shopping_list_service.create_list("Group Done")
        line = shopping_list_line_service.add_line(
            shopping_list.id,
            part_id=part_default.id,
            needed=3,
        )
        session.commit()

        shopping_list_service.set_list_status(
            shopping_list.id,
            ShoppingListStatus.READY,
        )

        stored_line = session.get(ShoppingListLine, line.id)
        assert stored_line is not None
        stored_line.status = ShoppingListLineStatus.DONE
        session.flush()

        with pytest.raises(InvalidOperationException):
            shopping_list_line_service.set_group_ordered(
                shopping_list.id,
                seller.id,
                {line.id: 3},
            )

    def test_receive_line_stock_success(self, session, container):
        shopping_list, part = self._create_list_with_part(container)
        box = container.box_service().create_box("Receiving Bin", 5)
        session.flush()

        shopping_list_service = container.shopping_list_service()
        shopping_list_line_service = container.shopping_list_line_service()

        line = shopping_list_line_service.add_line(
            shopping_list.id,
            part_id=part.id,
            needed=5,
        )
        shopping_list_service.set_list_status(
            shopping_list.id,
            ShoppingListStatus.READY,
        )
        session.flush()

        shopping_list_line_service.set_line_ordered(
            line.id,
            ordered_qty=5,
        )
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

    def test_complete_line_success_without_mismatch(self, session, container):
        shopping_list, part = self._create_list_with_part(container)
        box = container.box_service().create_box("Completion Bin", 4)
        session.flush()

        shopping_list_service = container.shopping_list_service()
        shopping_list_line_service = container.shopping_list_line_service()

        line = shopping_list_line_service.add_line(
            shopping_list.id,
            part_id=part.id,
            needed=4,
        )
        shopping_list_service.set_list_status(
            shopping_list.id,
            ShoppingListStatus.READY,
        )
        session.flush()
        shopping_list_line_service.set_line_ordered(line.id, ordered_qty=4)

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

        shopping_list_service = container.shopping_list_service()
        shopping_list_line_service = container.shopping_list_line_service()

        line = shopping_list_line_service.add_line(
            shopping_list.id,
            part_id=part.id,
            needed=3,
        )
        shopping_list_service.set_list_status(
            shopping_list.id,
            ShoppingListStatus.READY,
        )
        session.flush()
        shopping_list_line_service.set_line_ordered(line.id, ordered_qty=3)

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
