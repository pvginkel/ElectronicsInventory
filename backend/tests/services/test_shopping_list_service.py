"""Tests for ShoppingListService."""

import pytest

from app.exceptions import (
    InvalidOperationException,
    ResourceConflictException,
)
from app.models.shopping_list import ShoppingListStatus
from app.models.shopping_list_line import ShoppingListLine, ShoppingListLineStatus
from app.models.shopping_list_seller_note import ShoppingListSellerNote


class TestShoppingListService:
    """Service-level tests covering shopping list lifecycle operations."""

    def test_create_list_defaults(self, session, container):
        shopping_list_service = container.shopping_list_service()

        shopping_list = shopping_list_service.create_list("SMD Rework Kit")

        assert shopping_list.status == ShoppingListStatus.CONCEPT
        assert shopping_list.line_counts == {"new": 0, "ordered": 0, "done": 0}
        assert shopping_list.has_ordered_lines is False

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

    def test_get_list_includes_seller_groups_and_notes(self, session, container):
        shopping_list_service = container.shopping_list_service()
        shopping_list_line_service = container.shopping_list_line_service()
        part_service = container.part_service()
        seller_service = container.seller_service()

        seller_alpha = seller_service.create_seller("Alpha Supply", "https://alpha.example.com")
        seller_beta = seller_service.create_seller("Beta Components", "https://beta.example.com")

        part_with_seller = part_service.create_part(
            description="Precision regulator",
            seller_id=seller_alpha.id,
        )
        part_with_override = part_service.create_part(
            description="Shield can kit",
        )
        part_ungrouped = part_service.create_part(
            description="Fiber washers",
        )

        shopping_list = shopping_list_service.create_list("Ready Groupings")
        override_line = shopping_list_line_service.add_line(
            shopping_list.id,
            part_id=part_with_override.id,
            needed=5,
            seller_id=seller_beta.id,
        )
        default_line = shopping_list_line_service.add_line(
            shopping_list.id,
            part_id=part_with_seller.id,
            needed=4,
        )
        ungrouped_line = shopping_list_line_service.add_line(
            shopping_list.id,
            part_id=part_ungrouped.id,
            needed=3,
        )
        session.commit()

        shopping_list_service.set_list_status(
            shopping_list.id,
            ShoppingListStatus.READY,
        )
        shopping_list_line_service.set_line_ordered(
            override_line.id,
            ordered_qty=5,
            comment="Order submitted with expedited shipping",
        )
        shopping_list_service.upsert_seller_note(
            shopping_list.id,
            seller_beta.id,
            "Combine with bench PSU restock",
        )
        shopping_list_service.upsert_seller_note(
            shopping_list.id,
            seller_alpha.id,
            "Tape and reel packaging only",
        )
        session.commit()

        notes_in_db = session.query(ShoppingListSellerNote).all()
        assert {note.seller_id for note in notes_in_db} == {
            seller_alpha.id,
            seller_beta.id,
        }

        ready_list = shopping_list_service.get_list(shopping_list.id)
        assert ready_list.has_ordered_lines is True

        note_sellers = [note.seller_id for note in ready_list.seller_notes]
        assert note_sellers == [seller_alpha.id, seller_beta.id]

        groups = {group["group_key"]: group for group in ready_list.seller_groups}
        assert str(seller_beta.id) in groups
        assert str(seller_alpha.id) in groups
        assert "ungrouped" in groups

        beta_group = groups[str(seller_beta.id)]
        assert beta_group["totals"] == {"needed": 5, "ordered": 5, "received": 0}
        assert beta_group["order_note"].note == "Combine with bench PSU restock"

        alpha_group = groups[str(seller_alpha.id)]
        assert alpha_group["totals"]["needed"] == default_line.needed

        ungrouped_group = groups["ungrouped"]
        assert ungrouped_group["totals"]["needed"] == ungrouped_line.needed

        grouped_payload = shopping_list_service.group_lines_by_seller(shopping_list.id)
        grouped_keys = {group["group_key"] for group in grouped_payload}
        assert grouped_keys == set(groups.keys())

        ordered_notes = shopping_list_service.get_seller_order_notes(shopping_list.id)
        assert [note.seller_id for note in ordered_notes] == [seller_alpha.id, seller_beta.id]

    def test_upsert_seller_note_validation_and_delete(self, session, container):
        shopping_list_service = container.shopping_list_service()
        shopping_list_line_service = container.shopping_list_line_service()
        part_service = container.part_service()
        seller_service = container.seller_service()

        seller_primary = seller_service.create_seller("Primary", "https://primary.example")
        seller_unused = seller_service.create_seller("Unused", "https://unused.example")
        part = part_service.create_part(description="Latch IC", seller_id=seller_primary.id)

        shopping_list = shopping_list_service.create_list("Seller Notes")
        shopping_list_line_service.add_line(
            shopping_list.id,
            part_id=part.id,
            needed=7,
        )
        session.commit()

        shopping_list_service.set_list_status(
            shopping_list.id,
            ShoppingListStatus.READY,
        )

        created = shopping_list_service.upsert_seller_note(
            shopping_list.id,
            seller_primary.id,
            "Initial MOQ check",
        )
        assert created.note == "Initial MOQ check"

        updated = shopping_list_service.upsert_seller_note(
            shopping_list.id,
            seller_primary.id,
            "Updated instructions",
        )
        assert updated.note == "Updated instructions"

        cleared = shopping_list_service.upsert_seller_note(
            shopping_list.id,
            seller_primary.id,
            "   ",
        )
        assert cleared is None

        with pytest.raises(InvalidOperationException):
            shopping_list_service.upsert_seller_note(
                shopping_list.id,
                seller_unused.id,
                "Should fail",
            )
