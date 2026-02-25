"""Tests for ShoppingListService."""

from datetime import UTC, datetime, timedelta

import pytest

from app.exceptions import (
    InvalidOperationException,
    RecordNotFoundException,
    ResourceConflictException,
)
from app.models.shopping_list import ShoppingList, ShoppingListStatus
from app.models.shopping_list_line import ShoppingListLine, ShoppingListLineStatus
from app.models.shopping_list_seller import ShoppingListSeller, ShoppingListSellerStatus
from app.services.shopping_list_dtos import (
    LineCounts,
    SellerGroupTotals,
    ShoppingListDetail,
    ShoppingListSummary,
)


class TestShoppingListService:
    """Service-level tests covering shopping list lifecycle operations."""

    def test_create_list_defaults(self, session, container):
        shopping_list_service = container.shopping_list_service()

        result = shopping_list_service.create_list("SMD Rework Kit")

        assert isinstance(result, ShoppingListDetail)
        assert result.status == ShoppingListStatus.ACTIVE
        assert result.line_counts == LineCounts(new=0, ordered=0, done=0)

    def test_duplicate_name_raises_conflict(self, session, container):
        shopping_list_service = container.shopping_list_service()

        shopping_list_service.create_list("FPGA Dev Board")

        with pytest.raises(ResourceConflictException):
            shopping_list_service.create_list("FPGA Dev Board")

    def test_set_list_status_active_to_done(self, session, container):
        """Active lists can transition directly to done."""
        shopping_list_service = container.shopping_list_service()

        shopping_list = shopping_list_service.create_list("Direct Done")

        updated = shopping_list_service.set_list_status(
            shopping_list.id,
            ShoppingListStatus.DONE,
        )
        assert isinstance(updated, ShoppingListDetail)
        assert updated.status == ShoppingListStatus.DONE

    def test_set_list_status_rejects_reopening_done(self, session, container):
        shopping_list_service = container.shopping_list_service()

        shopping_list = shopping_list_service.create_list("Finalized BOM")

        shopping_list_service.set_list_status(
            shopping_list.id,
            ShoppingListStatus.DONE,
        )

        with pytest.raises(InvalidOperationException) as exc:
            shopping_list_service.set_list_status(
                shopping_list.id,
                ShoppingListStatus.ACTIVE,
            )

        assert (
            exc.value.message
            == "Cannot change shopping list status because lists marked as done cannot change status"
        )

    def test_set_list_status_noop_when_same(self, session, container):
        """Setting the same status is a no-op."""
        shopping_list_service = container.shopping_list_service()

        shopping_list = shopping_list_service.create_list("Same Status")
        result = shopping_list_service.set_list_status(
            shopping_list.id,
            ShoppingListStatus.ACTIVE,
        )
        assert isinstance(result, ShoppingListDetail)
        assert result.status == ShoppingListStatus.ACTIVE

    def test_set_list_status_rejects_invalid_transition(self, session, container):
        """Only active -> done is allowed; active -> active (different from done) blocked."""
        shopping_list_service = container.shopping_list_service()
        shopping_list = shopping_list_service.create_list("Bad Transition")

        # active -> done works
        shopping_list_service.set_list_status(shopping_list.id, ShoppingListStatus.DONE)

        # done -> active is rejected
        with pytest.raises(InvalidOperationException):
            shopping_list_service.set_list_status(
                shopping_list.id,
                ShoppingListStatus.ACTIVE,
            )

    def test_list_lists_filters_done_by_default(self, session, container):
        shopping_list_service = container.shopping_list_service()

        active_list = shopping_list_service.create_list("Amplifier Refresh")

        done_list = shopping_list_service.create_list("Archived Build")
        shopping_list_service.set_list_status(done_list.id, ShoppingListStatus.DONE)

        visible_lists = shopping_list_service.list_lists()
        assert all(isinstance(sl, ShoppingListSummary) for sl in visible_lists)
        names = {sl.name for sl in visible_lists}
        assert active_list.name in names
        assert done_list.name not in names

        all_lists = shopping_list_service.list_lists(include_done=True)
        all_names = {sl.name for sl in all_lists}
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
            sl
            for sl in ordered
            if sl.name
            in {"Early Workbench", "Mid Workbench", "Recent Workbench"}
        ]

        assert [sl.name for sl in relevant] == [
            "Recent Workbench",
            "Mid Workbench",
            "Early Workbench",
        ]
        timestamps = [sl.updated_at for sl in relevant]
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

        shopping_list = shopping_list_service.create_list("Locked Metadata")
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

    def test_update_list_returns_detail(self, session, container):
        """update_list returns a ShoppingListDetail with seller groups and line counts."""
        shopping_list_service = container.shopping_list_service()

        result = shopping_list_service.create_list("Before Update")
        updated = shopping_list_service.update_list(
            result.id,
            description="After Update",
        )

        assert isinstance(updated, ShoppingListDetail)
        assert updated.description == "After Update"
        assert updated.line_counts == LineCounts(new=0, ordered=0, done=0)
        assert updated.seller_groups == []

    def test_get_list_includes_seller_groups(self, session, container):
        shopping_list_service = container.shopping_list_service()
        shopping_list_line_service = container.shopping_list_line_service()
        part_service = container.part_service()
        seller_service = container.seller_service()

        seller_alpha = seller_service.create_seller("Alpha Supply", "https://alpha.example.com")
        seller_beta = seller_service.create_seller("Beta Components", "https://beta.example.com")

        part_with_seller = part_service.create_part(
            description="Precision regulator",
        )
        part_with_override = part_service.create_part(
            description="Shield can kit",
        )
        part_ungrouped = part_service.create_part(
            description="Fiber washers",
        )

        shopping_list = shopping_list_service.create_list("Active Groupings")
        shopping_list_line_service.add_line(
            shopping_list.id,
            part_id=part_with_override.id,
            needed=5,
            seller_id=seller_beta.id,
        )
        shopping_list_line_service.add_line(
            shopping_list.id,
            part_id=part_with_seller.id,
            needed=4,
            seller_id=seller_alpha.id,
        )
        ungrouped_line = shopping_list_line_service.add_line(
            shopping_list.id,
            part_id=part_ungrouped.id,
            needed=3,
        )
        session.commit()

        # Create seller groups
        shopping_list_service.create_seller_group(shopping_list.id, seller_alpha.id)
        shopping_list_service.create_seller_group(shopping_list.id, seller_beta.id)
        session.commit()

        fetched_list = shopping_list_service.get_list(shopping_list.id)

        # seller_groups is now a list of SellerGroupDetail dataclasses
        groups = {group.group_key: group for group in fetched_list.seller_groups}
        assert str(seller_beta.id) in groups
        assert str(seller_alpha.id) in groups
        assert "ungrouped" in groups

        beta_group = groups[str(seller_beta.id)]
        assert beta_group.totals.needed == 5

        alpha_group = groups[str(seller_alpha.id)]
        assert alpha_group.totals.needed == 4

        ungrouped_group = groups["ungrouped"]
        assert ungrouped_group.totals.needed == ungrouped_line.needed

    def test_list_part_memberships_filters_and_orders(self, session, container):
        shopping_list_service = container.shopping_list_service()
        shopping_list_line_service = container.shopping_list_line_service()
        part_service = container.part_service()
        seller_service = container.seller_service()

        target_part = part_service.create_part(description="Precision reference")
        other_part = part_service.create_part(description="Spare jumper wires")

        active_list = shopping_list_service.create_list("Active stage")
        active_list_2 = shopping_list_service.create_list("Active stage 2")
        done_list = shopping_list_service.create_list("Completed stage")

        seller = seller_service.create_seller(
            "Parts Direct",
            "https://parts-direct.example.com",
        )

        active_line = shopping_list_line_service.add_line(
            active_list.id,
            part_id=target_part.id,
            needed=6,
            seller_id=seller.id,
            note="Grab a couple of extras",
        )
        active_line_2 = shopping_list_line_service.add_line(
            active_list_2.id,
            part_id=target_part.id,
            needed=2,
        )
        shopping_list_line_service.add_line(
            active_list.id,
            part_id=other_part.id,
            needed=1,
        )
        done_line = shopping_list_line_service.add_line(
            done_list.id,
            part_id=target_part.id,
            needed=4,
        )

        shopping_list_service.set_list_status(done_list.id, ShoppingListStatus.DONE)

        stored_done_line = session.get(ShoppingListLine, done_line.id)
        assert stored_done_line is not None
        stored_done_line.status = ShoppingListLineStatus.DONE

        now = datetime.now(UTC)
        session.get(ShoppingListLine, active_line_2.id).updated_at = now
        session.get(ShoppingListLine, active_line.id).updated_at = now - timedelta(minutes=10)
        session.flush()

        memberships = shopping_list_service.list_part_memberships(target_part.id)

        assert [line.id for line in memberships] == [active_line_2.id, active_line.id]
        active_membership = memberships[1]
        assert active_membership.note == "Grab a couple of extras"
        assert active_membership.seller is not None
        assert active_membership.seller.id == seller.id
        assert all(line.part_id == target_part.id for line in memberships)

    def test_list_part_memberships_bulk_groups_and_filters(self, session, container):
        shopping_list_service = container.shopping_list_service()
        shopping_list_line_service = container.shopping_list_line_service()
        part_service = container.part_service()

        primary_part = part_service.create_part(description="Oscillator IC")
        secondary_part = part_service.create_part(description="Filter capacitor")

        active_list = shopping_list_service.create_list("Active list")
        active_list_2 = shopping_list_service.create_list("Active list 2")
        done_list = shopping_list_service.create_list("Done list")

        active_line = shopping_list_line_service.add_line(
            active_list.id,
            part_id=primary_part.id,
            needed=3,
        )
        active_line_2 = shopping_list_line_service.add_line(
            active_list_2.id,
            part_id=primary_part.id,
            needed=1,
        )
        done_line = shopping_list_line_service.add_line(
            done_list.id,
            part_id=primary_part.id,
            needed=5,
        )

        shopping_list_service.set_list_status(done_list.id, ShoppingListStatus.DONE)

        stored_done_line = session.get(ShoppingListLine, done_line.id)
        assert stored_done_line is not None
        stored_done_line.status = ShoppingListLineStatus.DONE

        now = datetime.now(UTC)
        session.get(ShoppingListLine, active_line_2.id).updated_at = now
        session.get(ShoppingListLine, active_line.id).updated_at = now - timedelta(minutes=20)
        session.get(ShoppingListLine, done_line.id).updated_at = now - timedelta(minutes=40)
        session.flush()

        missing_id = max(primary_part.id, secondary_part.id) + 100
        memberships = shopping_list_service.list_part_memberships_bulk(
            [primary_part.id, secondary_part.id, missing_id]
        )

        assert list(memberships.keys()) == [primary_part.id, secondary_part.id, missing_id]
        assert [line.id for line in memberships[primary_part.id]] == [active_line_2.id, active_line.id]
        assert memberships[secondary_part.id] == []
        assert memberships[missing_id] == []

        with_done = shopping_list_service.list_part_memberships_bulk(
            [primary_part.id],
            include_done=True,
        )
        assert [line.id for line in with_done[primary_part.id]] == [
            active_line_2.id,
            active_line.id,
            done_line.id,
        ]

        single_path = shopping_list_service.list_part_memberships(primary_part.id)
        assert [line.id for line in single_path] == [line.id for line in memberships[primary_part.id]]


class TestSellerGroupService:
    """Service-level tests covering seller group CRUD and state machine."""

    def _create_list_with_seller_group(self, container, session):
        """Helper: create an active list, a seller, a seller group, and lines."""
        shopping_list_service = container.shopping_list_service()
        shopping_list_line_service = container.shopping_list_line_service()
        part_service = container.part_service()
        seller_service = container.seller_service()

        seller = seller_service.create_seller("Test Seller", "https://test.example")
        shopping_list = shopping_list_service.create_list("Seller Group Tests")
        part_a = part_service.create_part(description="Part A")
        part_b = part_service.create_part(description="Part B")

        shopping_list_line_service.add_line(
            shopping_list.id,
            part_id=part_a.id,
            needed=4,
            seller_id=seller.id,
        )
        shopping_list_line_service.add_line(
            shopping_list.id,
            part_id=part_b.id,
            needed=6,
            seller_id=seller.id,
        )
        session.commit()

        seller_group = shopping_list_service.create_seller_group(
            shopping_list.id, seller.id
        )
        session.commit()

        return shopping_list, seller, seller_group

    def test_create_seller_group_success(self, session, container):
        shopping_list_service = container.shopping_list_service()
        seller_service = container.seller_service()

        seller = seller_service.create_seller("New Seller", "https://new.example")
        shopping_list = shopping_list_service.create_list("Group Create")
        session.commit()

        seller_group = shopping_list_service.create_seller_group(
            shopping_list.id, seller.id
        )

        assert seller_group.group_key == str(seller.id)
        assert seller_group.totals == SellerGroupTotals(needed=0, ordered=0, received=0)
        assert seller_group.completed is False

    def test_create_seller_group_duplicate_raises_conflict(self, session, container):
        shopping_list_service = container.shopping_list_service()
        seller_service = container.seller_service()

        seller = seller_service.create_seller("Dupe Seller", "https://dupe.example")
        shopping_list = shopping_list_service.create_list("Group Dupe")
        session.commit()

        shopping_list_service.create_seller_group(shopping_list.id, seller.id)
        session.commit()

        with pytest.raises(ResourceConflictException):
            shopping_list_service.create_seller_group(shopping_list.id, seller.id)

    def test_create_seller_group_rejects_done_list(self, session, container):
        shopping_list_service = container.shopping_list_service()
        seller_service = container.seller_service()

        seller = seller_service.create_seller("Done Seller", "https://done.example")
        shopping_list = shopping_list_service.create_list("Done Group")
        shopping_list_service.set_list_status(shopping_list.id, ShoppingListStatus.DONE)
        session.commit()

        with pytest.raises(InvalidOperationException):
            shopping_list_service.create_seller_group(shopping_list.id, seller.id)

    def test_create_seller_group_rejects_missing_seller(self, session, container):
        shopping_list_service = container.shopping_list_service()
        shopping_list = shopping_list_service.create_list("Missing Seller")
        session.commit()

        with pytest.raises(RecordNotFoundException):
            shopping_list_service.create_seller_group(shopping_list.id, 99999)

    def test_get_seller_group_success(self, session, container):
        shopping_list, seller, _ = self._create_list_with_seller_group(
            container, session
        )
        shopping_list_service = container.shopping_list_service()

        seller_group = shopping_list_service.get_seller_group(
            shopping_list.id, seller.id
        )

        assert seller_group.group_key == str(seller.id)
        assert len(seller_group.lines) == 2
        assert seller_group.totals.needed == 10

    def test_get_seller_group_not_found(self, session, container):
        shopping_list_service = container.shopping_list_service()
        shopping_list = shopping_list_service.create_list("No Group")
        session.commit()

        with pytest.raises(RecordNotFoundException):
            shopping_list_service.get_seller_group(shopping_list.id, 99999)

    def test_update_seller_group_note(self, session, container):
        shopping_list, seller, _ = self._create_list_with_seller_group(
            container, session
        )
        shopping_list_service = container.shopping_list_service()

        updated = shopping_list_service.update_seller_group(
            shopping_list.id,
            seller.id,
            note="Combine with bench order",
        )

        assert updated.lines is not None
        # Verify note was persisted
        row = session.execute(
            session.query(ShoppingListSeller).filter_by(
                shopping_list_id=shopping_list.id,
                seller_id=seller.id,
            ).statement
        ).scalar_one()
        assert row.note == "Combine with bench order"

    def test_update_seller_group_note_allowed_on_done_list(self, session, container):
        shopping_list, seller, _ = self._create_list_with_seller_group(
            container, session
        )
        shopping_list_service = container.shopping_list_service()

        shopping_list_service.set_list_status(shopping_list.id, ShoppingListStatus.DONE)
        session.commit()

        result = shopping_list_service.update_seller_group(
            shopping_list.id,
            seller.id,
            note="Post-completion annotation",
        )
        assert result.note == "Post-completion annotation"

    def test_update_seller_group_status_rejected_on_done_list(self, session, container):
        shopping_list, seller, _ = self._create_list_with_seller_group(
            container, session
        )
        shopping_list_service = container.shopping_list_service()

        shopping_list_service.set_list_status(shopping_list.id, ShoppingListStatus.DONE)
        session.commit()

        with pytest.raises(InvalidOperationException):
            shopping_list_service.update_seller_group(
                shopping_list.id,
                seller.id,
                status=ShoppingListSellerStatus.ORDERED,
            )

    def test_order_seller_group_success(self, session, container):
        """Ordering a seller group transitions all NEW lines to ORDERED."""
        shopping_list, seller, _ = self._create_list_with_seller_group(
            container, session
        )
        shopping_list_service = container.shopping_list_service()
        shopping_list_line_service = container.shopping_list_line_service()

        # Set ordered quantities on lines
        lines = shopping_list_line_service.list_lines(shopping_list.id)
        for line in lines:
            if line.seller_id == seller.id:
                shopping_list_line_service.update_line(
                    line.id,
                    ordered=line.needed,
                )
        session.commit()

        updated = shopping_list_service.update_seller_group(
            shopping_list.id,
            seller.id,
            status=ShoppingListSellerStatus.ORDERED,
        )

        assert all(
            line.status == ShoppingListLineStatus.ORDERED
            for line in updated.lines
        )

    def test_order_seller_group_requires_ordered_qty_on_all_lines(self, session, container):
        """Ordering fails if any line has ordered == 0."""
        shopping_list, seller, _ = self._create_list_with_seller_group(
            container, session
        )
        shopping_list_service = container.shopping_list_service()

        with pytest.raises(InvalidOperationException) as exc:
            shopping_list_service.update_seller_group(
                shopping_list.id,
                seller.id,
                status=ShoppingListSellerStatus.ORDERED,
            )

        assert "ordered quantity > 0" in exc.value.message

    def test_order_seller_group_requires_active_lines(self, session, container):
        """Ordering fails if the group has no non-DONE lines."""
        shopping_list_service = container.shopping_list_service()
        seller_service = container.seller_service()

        seller = seller_service.create_seller("Empty Group Seller", "https://empty.example")
        shopping_list = shopping_list_service.create_list("Empty Group")
        session.commit()

        shopping_list_service.create_seller_group(shopping_list.id, seller.id)
        session.commit()

        with pytest.raises(InvalidOperationException) as exc:
            shopping_list_service.update_seller_group(
                shopping_list.id,
                seller.id,
                status=ShoppingListSellerStatus.ORDERED,
            )
        assert "no active lines" in exc.value.message

    def test_reopen_seller_group_success(self, session, container):
        """Reopening an ordered group reverts all ORDERED lines to NEW."""
        shopping_list, seller, _ = self._create_list_with_seller_group(
            container, session
        )
        shopping_list_service = container.shopping_list_service()
        shopping_list_line_service = container.shopping_list_line_service()

        # Set ordered qty and then order the group
        lines = shopping_list_line_service.list_lines(shopping_list.id)
        for line in lines:
            if line.seller_id == seller.id:
                shopping_list_line_service.update_line(line.id, ordered=line.needed)
        session.commit()

        shopping_list_service.update_seller_group(
            shopping_list.id,
            seller.id,
            status=ShoppingListSellerStatus.ORDERED,
        )
        session.commit()

        # Reopen the group
        reopened = shopping_list_service.update_seller_group(
            shopping_list.id,
            seller.id,
            status=ShoppingListSellerStatus.ACTIVE,
        )

        assert all(
            line.status == ShoppingListLineStatus.NEW
            for line in reopened.lines
        )

    def test_reopen_seller_group_blocked_if_received(self, session, container):
        """Reopening is blocked when any line has received > 0."""
        shopping_list, seller, _ = self._create_list_with_seller_group(
            container, session
        )
        shopping_list_service = container.shopping_list_service()
        shopping_list_line_service = container.shopping_list_line_service()

        # Set ordered qty and then order the group
        lines = shopping_list_line_service.list_lines(shopping_list.id)
        for line in lines:
            if line.seller_id == seller.id:
                shopping_list_line_service.update_line(line.id, ordered=line.needed)
        session.commit()

        shopping_list_service.update_seller_group(
            shopping_list.id,
            seller.id,
            status=ShoppingListSellerStatus.ORDERED,
        )
        session.commit()

        # Simulate receiving stock on one line
        lines_after_order = shopping_list_line_service.list_lines(shopping_list.id)
        ordered_line = next(
            line for line in lines_after_order
            if line.seller_id == seller.id and line.status == ShoppingListLineStatus.ORDERED
        )
        stored_line = session.get(ShoppingListLine, ordered_line.id)
        stored_line.received = 1
        session.flush()

        with pytest.raises(InvalidOperationException) as exc:
            shopping_list_service.update_seller_group(
                shopping_list.id,
                seller.id,
                status=ShoppingListSellerStatus.ACTIVE,
            )
        assert "received stock" in exc.value.message

    def test_reopen_seller_group_noop_when_already_active(self, session, container):
        """Setting status to ACTIVE on an already-active group is a no-op."""
        shopping_list, seller, _ = self._create_list_with_seller_group(
            container, session
        )
        shopping_list_service = container.shopping_list_service()

        # Should succeed silently (no state change needed)
        result = shopping_list_service.update_seller_group(
            shopping_list.id,
            seller.id,
            status=ShoppingListSellerStatus.ACTIVE,
        )
        assert result.status == ShoppingListSellerStatus.ACTIVE

    def test_delete_seller_group_resets_non_done_lines(self, session, container):
        """Deleting a group resets non-DONE lines to ungrouped."""
        shopping_list, seller, _ = self._create_list_with_seller_group(
            container, session
        )
        shopping_list_service = container.shopping_list_service()
        shopping_list_line_service = container.shopping_list_line_service()

        shopping_list_service.delete_seller_group(shopping_list.id, seller.id)
        session.commit()

        # Lines should now be ungrouped (seller_id = None, status = NEW)
        lines = shopping_list_line_service.list_lines(shopping_list.id)
        for line in lines:
            assert line.seller_id is None
            assert line.status == ShoppingListLineStatus.NEW
            assert line.ordered == 0

    def test_delete_seller_group_preserves_done_lines(self, session, container):
        """Deleting a group preserves DONE lines (does not reset them)."""
        shopping_list, seller, _ = self._create_list_with_seller_group(
            container, session
        )
        shopping_list_service = container.shopping_list_service()
        shopping_list_line_service = container.shopping_list_line_service()

        # Mark one line as DONE manually
        lines = shopping_list_line_service.list_lines(shopping_list.id)
        done_line = next(line for line in lines if line.seller_id == seller.id)
        stored_line = session.get(ShoppingListLine, done_line.id)
        stored_line.status = ShoppingListLineStatus.DONE
        stored_line.seller_id = seller.id
        session.flush()

        shopping_list_service.delete_seller_group(shopping_list.id, seller.id)
        session.commit()

        # DONE line should retain its seller_id and status
        refreshed_done = session.get(ShoppingListLine, done_line.id)
        assert refreshed_done.status == ShoppingListLineStatus.DONE
        assert refreshed_done.seller_id == seller.id

    def test_delete_seller_group_blocks_ordered(self, session, container):
        """Cannot delete an ordered seller group."""
        shopping_list, seller, _ = self._create_list_with_seller_group(
            container, session
        )
        shopping_list_service = container.shopping_list_service()
        shopping_list_line_service = container.shopping_list_line_service()

        # Set ordered qty and order
        lines = shopping_list_line_service.list_lines(shopping_list.id)
        for line in lines:
            if line.seller_id == seller.id:
                shopping_list_line_service.update_line(line.id, ordered=line.needed)
        session.commit()

        shopping_list_service.update_seller_group(
            shopping_list.id,
            seller.id,
            status=ShoppingListSellerStatus.ORDERED,
        )
        session.commit()

        with pytest.raises(InvalidOperationException) as exc:
            shopping_list_service.delete_seller_group(shopping_list.id, seller.id)
        assert "reopened before deletion" in exc.value.message

    def test_seller_group_metrics_recorded(self, session, container):
        """Seller group operations record Prometheus metrics."""
        from app.services.shopping_list_service import (
            SHOPPING_LIST_SELLER_GROUP_OPERATIONS_TOTAL,
        )

        shopping_list_service = container.shopping_list_service()
        seller_service = container.seller_service()

        seller = seller_service.create_seller("Metrics Seller", "https://metrics.example")
        shopping_list = shopping_list_service.create_list("Metrics List")
        session.commit()

        before_create = SHOPPING_LIST_SELLER_GROUP_OPERATIONS_TOTAL.labels(
            operation="create"
        )._value.get()

        shopping_list_service.create_seller_group(shopping_list.id, seller.id)

        after_create = SHOPPING_LIST_SELLER_GROUP_OPERATIONS_TOTAL.labels(
            operation="create"
        )._value.get()
        assert after_create - before_create == 1.0
