"""Tests for kit shopping list service operations."""

from __future__ import annotations

from datetime import UTC, datetime

import pytest

from app.exceptions import InvalidOperationException, RecordNotFoundException
from app.models.kit import Kit, KitStatus
from app.models.kit_content import KitContent
from app.models.part import Part
from app.models.shopping_list import ShoppingList, ShoppingListStatus
from app.services.kit_reservation_service import KitReservationUsage


def _create_kit_with_content(session, *, note: str = "BOM note") -> tuple[Kit, KitContent]:
    kit = Kit(name=f"Kit-{datetime.now(UTC).timestamp()}", build_target=2, status=KitStatus.ACTIVE)
    part = Part(key=f"P{int(datetime.now(UTC).timestamp())}", description="Test part")
    session.add_all([kit, part])
    session.flush()

    content = KitContent(
        kit_id=kit.id,
        part_id=part.id,
        required_per_unit=3,
        note=note,
    )
    session.add(content)
    session.commit()
    session.refresh(content)
    session.refresh(kit)
    return kit, content


class TestKitShoppingListService:
    """Service tests covering create, append, listing, and unlink flows."""

    def test_create_list_creates_link_and_lines(self, session, container):
        service = container.kit_shopping_list_service()
        kit, content = _create_kit_with_content(session)

        result = service.create_or_append_list(
            kit.id,
            units=None,
            honor_reserved=False,
            shopping_list_id=None,
            note_prefix="Fallback",
            new_list_name="Concept Push",
        )

        assert result.created_new_list is True
        assert result.noop is False
        assert result.lines_modified == 1
        assert result.total_needed_quantity == kit.build_target * content.required_per_unit

        link = result.link
        assert link is not None
        assert link.kit_id == kit.id
        assert link.requested_units == kit.build_target
        assert link.honor_reserved is False
        assert link.shopping_list_name == "Concept Push"
        assert link.status == ShoppingListStatus.CONCEPT
        assert link.is_stale is False

        shopping_list = result.shopping_list
        assert shopping_list is not None
        assert shopping_list.status == ShoppingListStatus.CONCEPT
        assert len(shopping_list.lines) == 1
        line = shopping_list.lines[0]
        assert line.needed == kit.build_target * content.required_per_unit
        assert "[From Kit" in (line.note or "")
        assert "BOM note" in (line.note or "")

    def test_append_existing_list_merges_quantities_and_notes(self, session, container):
        service = container.kit_shopping_list_service()
        shopping_list_service = container.shopping_list_service()
        kit, content = _create_kit_with_content(session)

        initial = service.create_or_append_list(
            kit.id,
            units=None,
            honor_reserved=False,
            shopping_list_id=None,
            note_prefix="Fallback",
            new_list_name="Append Target",
        )
        shopping_list = initial.shopping_list
        assert shopping_list is not None

        append = service.create_or_append_list(
            kit.id,
            units=1,
            honor_reserved=False,
            shopping_list_id=shopping_list.id,
            note_prefix="Fallback",
            new_list_name=None,
        )

        assert append.created_new_list is False
        assert append.noop is False
        assert append.lines_modified == 1
        # Total needed now includes prior quantity plus new 1-unit push
        expected_needed = (kit.build_target * content.required_per_unit) + content.required_per_unit
        refreshed = shopping_list_service.get_list(shopping_list.id)
        assert refreshed.lines[0].needed == expected_needed
        assert refreshed.lines[0].note.count("[From Kit") == 2

    def test_honor_reserved_adjusts_needed_quantities(self, session, container, monkeypatch):
        service = container.kit_shopping_list_service()
        kit, content = _create_kit_with_content(session, note="")
        part = content.part

        monkeypatch.setattr(
            service.inventory_service,
            "get_total_quantities_by_part_keys",
            lambda keys: {part.key: 5},
        )

        def fake_reservations(part_ids):
            return {
                part_ids[0]: [
                    KitReservationUsage(
                        part_id=part_ids[0],
                        kit_id=999,
                        kit_name="Other Kit",
                        status=KitStatus.ACTIVE,
                        build_target=1,
                        required_per_unit=3,
                        reserved_quantity=3,
                        updated_at=datetime.now(UTC),
                    )
                ]
            }

        monkeypatch.setattr(
            service.kit_reservation_service,
            "get_reservations_by_part_ids",
            fake_reservations,
        )

        result = service.create_or_append_list(
            kit.id,
            units=2,
            honor_reserved=True,
            shopping_list_id=None,
            note_prefix="Fallback",
            new_list_name="Honor Reserved",
        )

        # Base required = 2 * 3 = 6, available after honor reserved = max(5 - 3, 0) = 2 -> needed 4
        assert result.total_needed_quantity == 4
        assert result.link is not None
        assert result.link.honor_reserved is True

    def test_zero_shortage_returns_noop(self, session, container, monkeypatch):
        service = container.kit_shopping_list_service()
        kit, content = _create_kit_with_content(session, note="")
        part = content.part

        monkeypatch.setattr(
            service.inventory_service,
            "get_total_quantities_by_part_keys",
            lambda keys: {part.key: kit.build_target * content.required_per_unit},
        )
        monkeypatch.setattr(
            service.kit_reservation_service,
            "get_reservations_by_part_ids",
            lambda part_ids: {part_ids[0]: []},
        )

        result = service.create_or_append_list(
            kit.id,
            units=None,
            honor_reserved=False,
            shopping_list_id=None,
            note_prefix="Fallback",
            new_list_name="No Changes",
        )

        assert result.noop is True
        assert result.link is None
        assert result.shopping_list is None

    def test_archived_kit_rejected(self, session, container):
        service = container.kit_shopping_list_service()
        kit = Kit(
            name="Archived",
            build_target=1,
            status=KitStatus.ARCHIVED,
            archived_at=datetime.now(UTC),
        )
        session.add(kit)
        session.commit()

        with pytest.raises(InvalidOperationException):
            service.create_or_append_list(
                kit.id,
                units=None,
                honor_reserved=False,
                shopping_list_id=None,
                note_prefix="Fallback",
                new_list_name="Should Fail",
            )

    def test_non_concept_target_rejected(self, session, container):
        service = container.kit_shopping_list_service()
        kit, _ = _create_kit_with_content(session)
        shopping_list = ShoppingList(
            name="Ready List",
            status=ShoppingListStatus.READY,
        )
        session.add(shopping_list)
        session.commit()

        with pytest.raises(InvalidOperationException):
            service.create_or_append_list(
                kit.id,
                units=None,
                honor_reserved=False,
                shopping_list_id=shopping_list.id,
                note_prefix="Fallback",
                new_list_name=None,
            )

    def test_list_endpoints_return_hydrated_metadata(self, session, container):
        service = container.kit_shopping_list_service()
        kit, _ = _create_kit_with_content(session)
        result = service.create_or_append_list(
            kit.id,
            units=None,
            honor_reserved=False,
            shopping_list_id=None,
            note_prefix="Fallback",
            new_list_name="Metadata",
        )
        link = result.link
        assert link is not None

        kit_links = service.list_links_for_kit(kit.id)
        assert len(kit_links) == 1
        assert kit_links[0].shopping_list_name == "Metadata"
        assert kit_links[0].status == ShoppingListStatus.CONCEPT

        list_links = service.list_kits_for_shopping_list(link.shopping_list_id)
        assert len(list_links) == 1
        assert list_links[0].kit_name == kit.name
        assert list_links[0].kit_status == KitStatus.ACTIVE

    def test_unlink_deletes_row(self, session, container):
        service = container.kit_shopping_list_service()
        kit, _ = _create_kit_with_content(session)
        result = service.create_or_append_list(
            kit.id,
            units=None,
            honor_reserved=False,
            shopping_list_id=None,
            note_prefix="Fallback",
            new_list_name="Delete Link",
        )
        link = result.link
        assert link is not None

        service.unlink(link.id)
        remaining = service.list_links_for_kit(kit.id)
        assert remaining == []

        with pytest.raises(RecordNotFoundException):
            service.unlink(link.id)
