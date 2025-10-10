"""Tests for ShoppingListService."""

from datetime import UTC, datetime, timedelta

import pytest

from app.exceptions import (
    InvalidOperationException,
    ResourceConflictException,
)
from app.models.shopping_list import ShoppingList, ShoppingListStatus
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

    def test_set_list_status_rejects_reopening_done(self, session, container):
        shopping_list_service = container.shopping_list_service()
        shopping_list_line_service = container.shopping_list_line_service()
        part_service = container.part_service()

        shopping_list = shopping_list_service.create_list("Finalized BOM")
        part = part_service.create_part(description="Legacy DAC")
        shopping_list_line_service.add_line(
            shopping_list.id,
            part_id=part.id,
            needed=1,
        )

        shopping_list_service.set_list_status(
            shopping_list.id,
            ShoppingListStatus.READY,
        )
        shopping_list_service.set_list_status(
            shopping_list.id,
            ShoppingListStatus.DONE,
        )

        with pytest.raises(InvalidOperationException) as exc:
            shopping_list_service.set_list_status(
                shopping_list.id,
                ShoppingListStatus.READY,
            )

        assert (
            exc.value.message
            == "Cannot change shopping list status because lists marked as done cannot change status"
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

    def test_list_lists_orders_by_updated_at(self, session, container):
        shopping_list_service = container.shopping_list_service()

        early_list = shopping_list_service.create_list("Early Workbench")
        mid_list = shopping_list_service.create_list("Mid Workbench")
        recent_list = shopping_list_service.create_list("Recent Workbench")

        now = datetime.now(UTC)
        session.get(ShoppingList, early_list.id).updated_at = now - timedelta(hours=2)
        session.get(ShoppingList, mid_list.id).updated_at = now - timedelta(hours=1)
        session.get(ShoppingList, recent_list.id).updated_at = now
        session.flush()

        ordered = shopping_list_service.list_lists()
        relevant = [
            shopping_list
            for shopping_list in ordered
            if shopping_list.name
            in {"Early Workbench", "Mid Workbench", "Recent Workbench"}
        ]

        assert [shopping_list.name for shopping_list in relevant] == [
            "Recent Workbench",
            "Mid Workbench",
            "Early Workbench",
        ]
        timestamps = [shopping_list.updated_at for shopping_list in relevant]
        assert timestamps == sorted(timestamps, reverse=True)

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

    def test_update_list_rejects_done_lists(self, session, container):
        shopping_list_service = container.shopping_list_service()
        shopping_list_line_service = container.shopping_list_line_service()
        part_service = container.part_service()

        shopping_list = shopping_list_service.create_list("Locked Metadata")
        part = part_service.create_part(description="Legacy encoder")
        shopping_list_line_service.add_line(
            shopping_list.id,
            part_id=part.id,
            needed=1,
        )
        shopping_list_service.set_list_status(
            shopping_list.id,
            ShoppingListStatus.READY,
        )
        shopping_list_service.set_list_status(
            shopping_list.id,
            ShoppingListStatus.DONE,
        )

        with pytest.raises(InvalidOperationException) as exc:
            shopping_list_service.update_list(
                shopping_list.id,
                name="Updated Name",
            )

        assert (
            exc.value.message
            == "Cannot update shopping list because lists marked as done cannot be modified"
        )

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

    def test_list_part_memberships_filters_and_orders(self, session, container):
        shopping_list_service = container.shopping_list_service()
        shopping_list_line_service = container.shopping_list_line_service()
        part_service = container.part_service()
        seller_service = container.seller_service()

        target_part = part_service.create_part(description="Precision reference")
        other_part = part_service.create_part(description="Spare jumper wires")

        concept_list = shopping_list_service.create_list("Concept stage")
        ready_list = shopping_list_service.create_list("Ready stage")
        done_list = shopping_list_service.create_list("Completed stage")

        seller = seller_service.create_seller(
            "Parts Direct",
            "https://parts-direct.example.com",
        )

        concept_line = shopping_list_line_service.add_line(
            concept_list.id,
            part_id=target_part.id,
            needed=6,
            seller_id=seller.id,
            note="Grab a couple of extras",
        )
        ready_line = shopping_list_line_service.add_line(
            ready_list.id,
            part_id=target_part.id,
            needed=2,
        )
        shopping_list_line_service.add_line(
            concept_list.id,
            part_id=other_part.id,
            needed=1,
        )
        done_line = shopping_list_line_service.add_line(
            done_list.id,
            part_id=target_part.id,
            needed=4,
        )

        shopping_list_service.set_list_status(ready_list.id, ShoppingListStatus.READY)
        shopping_list_service.set_list_status(done_list.id, ShoppingListStatus.READY)
        shopping_list_service.set_list_status(done_list.id, ShoppingListStatus.DONE)

        stored_done_line = session.get(ShoppingListLine, done_line.id)
        assert stored_done_line is not None
        stored_done_line.status = ShoppingListLineStatus.DONE

        now = datetime.now(UTC)
        session.get(ShoppingListLine, ready_line.id).updated_at = now
        session.get(ShoppingListLine, concept_line.id).updated_at = now - timedelta(minutes=10)
        session.flush()

        memberships = shopping_list_service.list_part_memberships(target_part.id)

        assert [line.id for line in memberships] == [ready_line.id, concept_line.id]
        concept_membership = memberships[1]
        assert concept_membership.note == "Grab a couple of extras"
        assert concept_membership.seller is not None
        assert concept_membership.seller.id == seller.id
        assert all(line.part_id == target_part.id for line in memberships)

    def test_list_part_memberships_bulk_groups_and_filters(self, session, container):
        shopping_list_service = container.shopping_list_service()
        shopping_list_line_service = container.shopping_list_line_service()
        part_service = container.part_service()

        primary_part = part_service.create_part(description="Oscillator IC")
        secondary_part = part_service.create_part(description="Filter capacitor")

        concept_list = shopping_list_service.create_list("Concept list")
        ready_list = shopping_list_service.create_list("Ready list")
        done_list = shopping_list_service.create_list("Done list")

        concept_line = shopping_list_line_service.add_line(
            concept_list.id,
            part_id=primary_part.id,
            needed=3,
        )
        ready_line = shopping_list_line_service.add_line(
            ready_list.id,
            part_id=primary_part.id,
            needed=1,
        )
        done_line = shopping_list_line_service.add_line(
            done_list.id,
            part_id=primary_part.id,
            needed=5,
        )

        shopping_list_service.set_list_status(ready_list.id, ShoppingListStatus.READY)
        shopping_list_service.set_list_status(done_list.id, ShoppingListStatus.READY)
        shopping_list_service.set_list_status(done_list.id, ShoppingListStatus.DONE)

        stored_done_line = session.get(ShoppingListLine, done_line.id)
        assert stored_done_line is not None
        stored_done_line.status = ShoppingListLineStatus.DONE

        now = datetime.now(UTC)
        session.get(ShoppingListLine, ready_line.id).updated_at = now
        session.get(ShoppingListLine, concept_line.id).updated_at = now - timedelta(minutes=20)
        session.get(ShoppingListLine, done_line.id).updated_at = now - timedelta(minutes=40)
        session.flush()

        missing_id = max(primary_part.id, secondary_part.id) + 100
        memberships = shopping_list_service.list_part_memberships_bulk(
            [primary_part.id, secondary_part.id, missing_id]
        )

        assert list(memberships.keys()) == [primary_part.id, secondary_part.id, missing_id]
        assert [line.id for line in memberships[primary_part.id]] == [ready_line.id, concept_line.id]
        assert memberships[secondary_part.id] == []
        assert memberships[missing_id] == []

        with_done = shopping_list_service.list_part_memberships_bulk(
            [primary_part.id],
            include_done=True,
        )
        assert [line.id for line in with_done[primary_part.id]] == [
            ready_line.id,
            concept_line.id,
            done_line.id,
        ]

        single_path = shopping_list_service.list_part_memberships(primary_part.id)
        assert [line.id for line in single_path] == [line.id for line in memberships[primary_part.id]]

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

        shopping_list_service.set_list_status(
            shopping_list.id,
            ShoppingListStatus.DONE,
        )

        with pytest.raises(InvalidOperationException) as exc:
            shopping_list_service.upsert_seller_note(
                shopping_list.id,
                seller_primary.id,
                "Attempt after completion",
            )

        assert (
            exc.value.message
            == "Cannot update seller note because lists marked as done cannot be modified"
        )
