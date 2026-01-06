"""Tests for KitPickListService workflows."""

from __future__ import annotations

from datetime import UTC, datetime

import pytest
from sqlalchemy import select

from app.exceptions import InvalidOperationException, RecordNotFoundException
from app.models.attachment_set import AttachmentSet
from app.models.box import Box
from app.models.kit import Kit, KitStatus
from app.models.kit_content import KitContent
from app.models.kit_pick_list import KitPickList, KitPickListStatus
from app.models.kit_pick_list_line import KitPickListLine, PickListLineStatus
from app.models.location import Location
from app.models.part import Part
from app.models.part_location import PartLocation
from app.services.inventory_service import InventoryService
from app.services.kit_pick_list_service import KitPickListService
from app.services.kit_reservation_service import KitReservationService
from app.services.part_service import PartService


class AttachmentSetStub:
    """Minimal stub for AttachmentSetService that creates real attachment sets."""

    def __init__(self, db):
        self.db = db

    def create_attachment_set(self) -> AttachmentSet:
        attachment_set = AttachmentSet()
        self.db.add(attachment_set)
        self.db.flush()
        return attachment_set


class PickListMetricsStub:
    """Minimal metrics stub capturing pick list interactions."""

    def __init__(self) -> None:
        self.quantity_changes: list[tuple[str, int]] = []
        self.pick_list_creations: list[tuple[int, int, int]] = []
        self.line_picks: list[tuple[int, int]] = []
        self.line_undo: list[tuple[str, float]] = []
        self.detail_requests: list[int] = []
        self.list_requests: list[tuple[int, int]] = []
        self.line_quantity_updates: list[tuple[int, int, int]] = []

    def record_quantity_change(self, operation: str, delta: int) -> None:
        self.quantity_changes.append((operation, delta))

    def record_pick_list_created(self, kit_id: int, requested_units: int, line_count: int) -> None:
        self.pick_list_creations.append((kit_id, requested_units, line_count))

    def record_pick_list_line_picked(self, line_id: int, quantity: int) -> None:
        self.line_picks.append((line_id, quantity))

    def record_pick_list_line_undo(self, outcome: str, duration_seconds: float) -> None:
        self.line_undo.append((outcome, duration_seconds))

    def record_pick_list_detail_request(self, pick_list_id: int) -> None:
        self.detail_requests.append(pick_list_id)

    def record_pick_list_list_request(self, kit_id: int, result_count: int) -> None:
        self.list_requests.append((kit_id, result_count))

    def record_pick_list_line_quantity_updated(
        self, line_id: int, old_quantity: int, new_quantity: int
    ) -> None:
        self.line_quantity_updates.append((line_id, old_quantity, new_quantity))


@pytest.fixture
def metrics_stub() -> PickListMetricsStub:
    """Provide a metrics stub for each test case."""

    return PickListMetricsStub()


@pytest.fixture
def part_service(session) -> PartService:
    """Create a PartService bound to the test session."""

    return PartService(session, attachment_set_service=AttachmentSetStub(session))


@pytest.fixture
def inventory_service(session, part_service: PartService, metrics_stub: PickListMetricsStub) -> InventoryService:
    """Inventory service using the shared metrics stub."""

    return InventoryService(session, part_service=part_service, metrics_service=metrics_stub)


@pytest.fixture
def kit_pick_list_service(
    session,
    inventory_service: InventoryService,
    kit_reservation_service: KitReservationService,
    metrics_stub: PickListMetricsStub,
) -> KitPickListService:
    """Instantiate the service under test with real dependencies."""

    return KitPickListService(
        session,
        inventory_service=inventory_service,
        kit_reservation_service=kit_reservation_service,
        metrics_service=metrics_stub,
    )


@pytest.fixture
def kit_reservation_service(session) -> KitReservationService:
    """Provide reservation service backed by the test session."""

    return KitReservationService(session)


def _create_location(session, *, box_no: int, loc_no: int) -> Location:
    box = Box(box_no=box_no, description=f"Box {box_no}", capacity=max(loc_no, 1))
    session.add(box)
    session.flush()

    location = Location(box_id=box.id, box_no=box_no, loc_no=loc_no)
    session.add(location)
    session.flush()
    return location


def _create_part(session, make_attachment_set, key: str, description: str) -> Part:
    attachment_set = make_attachment_set()
    part = Part(key=key, description=description, attachment_set_id=attachment_set.id)
    session.add(part)
    session.flush()
    return part


def _attach_location(session, part: Part, location: Location, qty: int) -> PartLocation:
    assignment = PartLocation(
        part_id=part.id,
        box_no=location.box_no,
        loc_no=location.loc_no,
        location_id=location.id,
        qty=qty,
    )
    session.add(assignment)
    session.flush()
    return assignment


def _create_active_kit(session, make_attachment_set, name: str = "Test Kit") -> Kit:
    attachment_set = make_attachment_set()
    kit = Kit(name=name, build_target=1, status=KitStatus.ACTIVE, attachment_set_id=attachment_set.id)
    session.add(kit)
    session.flush()
    return kit


def _attach_content(session, kit: Kit, part: Part, required_per_unit: int) -> KitContent:
    content = KitContent(kit=kit, part=part, required_per_unit=required_per_unit)
    session.add(content)
    session.flush()
    return content


class TestKitPickListService:
    """Service-level tests for pick list workflows."""

    def test_create_pick_list_allocates_across_locations(
        self,
        session,
        kit_pick_list_service: KitPickListService,
        metrics_stub: PickListMetricsStub,

        make_attachment_set,

    ) -> None:
        kit = _create_active_kit(session, make_attachment_set)
        part_a = _create_part(session, make_attachment_set, "ALOC", "Amplifier")
        part_b = _create_part(session, make_attachment_set, "BLOC", "Buffer")
        content_a = _attach_content(session, kit, part_a, required_per_unit=3)
        content_b = _attach_content(session, kit, part_b, required_per_unit=1)

        location_a1 = _create_location(session, box_no=21, loc_no=1)
        _attach_location(session, part_a, location_a1, qty=2)
        location_a2 = _create_location(session, box_no=22, loc_no=1)
        _attach_location(session, part_a, location_a2, qty=5)
        location_b = _create_location(session, box_no=23, loc_no=1)
        _attach_location(session, part_b, location_b, qty=4)

        pick_list = kit_pick_list_service.create_pick_list(kit.id, requested_units=2)
        session.flush()

        assert pick_list.status is KitPickListStatus.OPEN
        assert len(pick_list.lines) == 3

        quantities_for_a = sorted(
            line.quantity_to_pick
            for line in pick_list.lines
            if line.kit_content_id == content_a.id
        )
        assert quantities_for_a == [2, 4]

        quantities_for_b = [
            line.quantity_to_pick
            for line in pick_list.lines
            if line.kit_content_id == content_b.id
        ]
        assert quantities_for_b == [2]

        assert metrics_stub.pick_list_creations[-1] == (kit.id, 2, 3)

    def test_create_pick_list_requires_sufficient_stock(
        self,
        session,
        kit_pick_list_service: KitPickListService,
        metrics_stub: PickListMetricsStub,

        make_attachment_set,

    ) -> None:
        kit = _create_active_kit(session, make_attachment_set)
        part = _create_part(session, make_attachment_set, "LOW", "Limited Stock Part")
        _attach_content(session, kit, part, required_per_unit=5)

        location = _create_location(session, box_no=30, loc_no=1)
        _attach_location(session, part, location, qty=4)

        with pytest.raises(InvalidOperationException):
            kit_pick_list_service.create_pick_list(kit.id, requested_units=1)

        assert not metrics_stub.pick_list_creations
        remaining_lists = session.execute(select(KitPickList)).all()
        assert not remaining_lists

    def test_create_pick_list_blocks_other_kit_reservations(
        self,
        session,
        kit_pick_list_service: KitPickListService,

        make_attachment_set,

    ) -> None:
        kit = _create_active_kit(session, make_attachment_set)
        competitor = Kit(name="Competing Kit", build_target=3, status=KitStatus.ACTIVE, attachment_set_id=make_attachment_set().id)
        session.add(competitor)
        session.flush()

        part = _create_part(session, make_attachment_set, "RESF", "Reservation sensitive part")
        _attach_content(session, kit, part, required_per_unit=2)
        _attach_content(session, competitor, part, required_per_unit=1)

        location = _create_location(session, box_no=31, loc_no=1)
        _attach_location(session, part, location, qty=5)

        with pytest.raises(InvalidOperationException) as excinfo:
            kit_pick_list_service.create_pick_list(kit.id, requested_units=2)

        assert "honoring kit reservations" in str(excinfo.value).lower()

    def test_create_pick_list_rejects_archived_kit(
        self,
        session,
        kit_pick_list_service: KitPickListService,

        make_attachment_set,

    ) -> None:
        kit = Kit(name="Archived Kit", build_target=1, status=KitStatus.ARCHIVED, archived_at=datetime.now(UTC), attachment_set_id=make_attachment_set().id)
        session.add(kit)
        session.flush()

        part = _create_part(session, make_attachment_set, "ARCH", "Archived Part")
        _attach_content(session, kit, part, required_per_unit=1)
        location = _create_location(session, box_no=40, loc_no=1)
        _attach_location(session, part, location, qty=1)

        with pytest.raises(InvalidOperationException):
            kit_pick_list_service.create_pick_list(kit.id, requested_units=1)

    def test_create_pick_list_accounts_for_existing_reservations(
        self,
        session,
        kit_pick_list_service: KitPickListService,
        metrics_stub: PickListMetricsStub,

        make_attachment_set,

    ) -> None:
        kit = _create_active_kit(session, make_attachment_set)
        part = _create_part(session, make_attachment_set, "RESV", "Reserved Part")
        _attach_content(session, kit, part, required_per_unit=1)
        location = _create_location(session, box_no=41, loc_no=1)
        _attach_location(session, part, location, qty=1)

        first = kit_pick_list_service.create_pick_list(kit.id, requested_units=1)
        session.flush()

        assert first.lines[0].quantity_to_pick == 1

        with pytest.raises(InvalidOperationException):
            kit_pick_list_service.create_pick_list(kit.id, requested_units=1)

        assert len(metrics_stub.pick_list_creations) == 1

    def test_pick_line_completes_line_and_updates_parent(
        self,
        session,
        kit_pick_list_service: KitPickListService,
        metrics_stub: PickListMetricsStub,

        make_attachment_set,

    ) -> None:
        kit = _create_active_kit(session, make_attachment_set)
        part = _create_part(session, make_attachment_set, "PICK", "Picker Part")
        _attach_content(session, kit, part, required_per_unit=2)
        location = _create_location(session, box_no=50, loc_no=1)
        assignment = _attach_location(session, part, location, qty=3)

        pick_list = kit_pick_list_service.create_pick_list(kit.id, requested_units=1)
        line = pick_list.lines[0]
        original_qty = assignment.qty

        updated_line = kit_pick_list_service.pick_line(pick_list.id, line.id)
        session.flush()

        assert updated_line.status is PickListLineStatus.COMPLETED
        assert updated_line.inventory_change_id is not None
        assert updated_line.picked_at is not None
        assert pick_list.status is KitPickListStatus.COMPLETED
        assert pick_list.completed_at is not None

        persisted_assignment = session.get(PartLocation, assignment.id)
        assert persisted_assignment is not None
        assert persisted_assignment.qty == original_qty - updated_line.quantity_to_pick

        assert metrics_stub.line_picks[-1][0] == updated_line.id
        assert metrics_stub.quantity_changes[-1] == ("remove", updated_line.quantity_to_pick)

    def test_undo_line_restores_inventory_and_status(
        self,
        session,
        kit_pick_list_service: KitPickListService,
        metrics_stub: PickListMetricsStub,

        make_attachment_set,

    ) -> None:
        kit = _create_active_kit(session, make_attachment_set)
        part = _create_part(session, make_attachment_set, "UNDO", "Undo Part")
        _attach_content(session, kit, part, required_per_unit=1)
        location = _create_location(session, box_no=60, loc_no=1)
        assignment = _attach_location(session, part, location, qty=2)
        initial_qty = assignment.qty

        pick_list = kit_pick_list_service.create_pick_list(kit.id, requested_units=1)
        line = pick_list.lines[0]
        kit_pick_list_service.pick_line(pick_list.id, line.id)
        session.flush()
        consumed_qty = line.quantity_to_pick

        reopened = kit_pick_list_service.undo_line(pick_list.id, line.id)
        session.flush()

        assert reopened.status is PickListLineStatus.OPEN
        assert reopened.inventory_change_id is None
        assert reopened.picked_at is None
        assert pick_list.status is KitPickListStatus.OPEN
        assert pick_list.completed_at is None

        refreshed_assignment = session.get(PartLocation, assignment.id)
        assert refreshed_assignment is not None
        assert refreshed_assignment.qty == initial_qty

        assert metrics_stub.line_undo[-1][0] == "success"
        assert metrics_stub.quantity_changes[-1] == ("add", consumed_qty)

    def test_undo_line_noop_when_line_open(
        self,
        kit_pick_list_service: KitPickListService,
        session,
        metrics_stub: PickListMetricsStub,

        make_attachment_set,

    ) -> None:
        kit = _create_active_kit(session, make_attachment_set)
        part = _create_part(session, make_attachment_set, "NOOP", "No-op Part")
        _attach_content(session, kit, part, required_per_unit=1)
        location = _create_location(session, box_no=70, loc_no=1)
        _attach_location(session, part, location, qty=1)

        pick_list = kit_pick_list_service.create_pick_list(kit.id, requested_units=1)
        line = pick_list.lines[0]

        result = kit_pick_list_service.undo_line(pick_list.id, line.id)
        assert result.status is PickListLineStatus.OPEN
        assert metrics_stub.line_undo[-1][0] == "noop"

    def test_get_pick_list_detail_records_metrics(
        self,
        session,
        kit_pick_list_service: KitPickListService,
        metrics_stub: PickListMetricsStub,

        make_attachment_set,

    ) -> None:
        kit = _create_active_kit(session, make_attachment_set)
        part = _create_part(session, make_attachment_set, "DETAIL", "Detail Part")
        _attach_content(session, kit, part, required_per_unit=1)
        location = _create_location(session, box_no=80, loc_no=1)
        _attach_location(session, part, location, qty=2)

        pick_list = kit_pick_list_service.create_pick_list(kit.id, requested_units=1)

        detail = kit_pick_list_service.get_pick_list_detail(pick_list.id)
        assert detail.id == pick_list.id
        assert metrics_stub.detail_requests[-1] == pick_list.id

    def test_list_pick_lists_for_kit_orders_newest_first(
        self,
        session,
        kit_pick_list_service: KitPickListService,
        metrics_stub: PickListMetricsStub,

        make_attachment_set,

    ) -> None:
        kit = _create_active_kit(session, make_attachment_set)
        part = _create_part(session, make_attachment_set, "LIST", "List Part")
        _attach_content(session, kit, part, required_per_unit=1)
        location = _create_location(session, box_no=90, loc_no=1)
        _attach_location(session, part, location, qty=10)

        first = kit_pick_list_service.create_pick_list(kit.id, requested_units=1)
        second = kit_pick_list_service.create_pick_list(kit.id, requested_units=2)
        session.flush()

        pick_lists = kit_pick_list_service.list_pick_lists_for_kit(kit.id)
        assert [pick_lists[0].id, pick_lists[1].id] == [second.id, first.id]
        assert metrics_stub.list_requests[-1] == (kit.id, 2)

    def test_list_pick_lists_for_kits_bulk_groups_and_orders(
        self,
        session,
        kit_pick_list_service: KitPickListService,
        metrics_stub: PickListMetricsStub,

        make_attachment_set,

    ) -> None:
        kit_a = _create_active_kit(session, make_attachment_set, name="Kit A")
        kit_b = _create_active_kit(session, make_attachment_set, name="Kit B")
        kit_empty = _create_active_kit(session, make_attachment_set, name="Kit Empty")

        part_a = _create_part(session, make_attachment_set, "PA", "Kit A Part")
        _attach_content(session, kit_a, part_a, required_per_unit=1)
        location_a = _create_location(session, box_no=95, loc_no=1)
        _attach_location(session, part_a, location_a, qty=10)

        part_b = _create_part(session, make_attachment_set, "PB", "Kit B Part")
        _attach_content(session, kit_b, part_b, required_per_unit=1)
        location_b = _create_location(session, box_no=96, loc_no=1)
        _attach_location(session, part_b, location_b, qty=10)

        first_a = kit_pick_list_service.create_pick_list(kit_a.id, requested_units=1)
        first_b = kit_pick_list_service.create_pick_list(kit_b.id, requested_units=1)
        second_b = kit_pick_list_service.create_pick_list(kit_b.id, requested_units=2)
        session.flush()

        before_metrics = len(metrics_stub.list_requests)
        memberships = kit_pick_list_service.list_pick_lists_for_kits_bulk(
            [kit_a.id, kit_b.id, kit_empty.id],
            include_done=False,
        )
        after_metrics = metrics_stub.list_requests[before_metrics:]

        assert list(memberships.keys()) == [kit_a.id, kit_b.id, kit_empty.id]
        assert [pick_list.id for pick_list in memberships[kit_a.id]] == [first_a.id]
        assert [pick_list.id for pick_list in memberships[kit_b.id]] == [
            second_b.id,
            first_b.id,
        ]
        assert memberships[kit_empty.id] == []
        assert after_metrics == [
            (kit_a.id, 1),
            (kit_b.id, 2),
            (kit_empty.id, 0),
        ]

    def test_list_pick_lists_for_kits_bulk_include_done_flag(
        self,
        session,
        kit_pick_list_service: KitPickListService,
        metrics_stub: PickListMetricsStub,

        make_attachment_set,

    ) -> None:
        kit = _create_active_kit(session, make_attachment_set, name="Kit Done")
        part = _create_part(session, make_attachment_set, "PD", "Done Part")
        _attach_content(session, kit, part, required_per_unit=1)
        location = _create_location(session, box_no=97, loc_no=1)
        _attach_location(session, part, location, qty=5)

        pick_list = kit_pick_list_service.create_pick_list(kit.id, requested_units=1)
        pick_list.status = KitPickListStatus.COMPLETED
        pick_list.completed_at = datetime.now(UTC)
        session.commit()

        filtered = kit_pick_list_service.list_pick_lists_for_kits_bulk(
            [kit.id],
            include_done=False,
        )
        assert filtered.get(kit.id) == []

        all_lists = kit_pick_list_service.list_pick_lists_for_kits_bulk(
            [kit.id],
            include_done=True,
        )
        assert len(all_lists.get(kit.id, [])) == 1
        assert all_lists[kit.id][0].status is KitPickListStatus.COMPLETED

    def test_list_pick_lists_for_missing_kit_raises(
        self,
        kit_pick_list_service: KitPickListService,

        make_attachment_set,

    ) -> None:
        with pytest.raises(RecordNotFoundException):
            kit_pick_list_service.list_pick_lists_for_kit(9999)

    def test_pick_line_updates_parent_timestamp_when_still_open(
        self,
        session,
        kit_pick_list_service: KitPickListService,

        make_attachment_set,

    ) -> None:
        kit = _create_active_kit(session, make_attachment_set)
        part = _create_part(session, make_attachment_set, "TIME", "Timestamp Part")
        _attach_content(session, kit, part, required_per_unit=1)
        location_a = _create_location(session, box_no=101, loc_no=1)
        _attach_location(session, part, location_a, qty=1)
        location_b = _create_location(session, box_no=102, loc_no=1)
        _attach_location(session, part, location_b, qty=1)

        pick_list = kit_pick_list_service.create_pick_list(kit.id, requested_units=2)
        session.flush()
        initial_updated_at = pick_list.updated_at

        open_line = pick_list.lines[0]
        kit_pick_list_service.pick_line(pick_list.id, open_line.id)
        session.flush()
        session.refresh(pick_list)

        assert pick_list.status is KitPickListStatus.OPEN
        assert pick_list.updated_at != initial_updated_at

    def test_undo_line_updates_parent_timestamp(
        self,
        session,
        kit_pick_list_service: KitPickListService,

        make_attachment_set,

    ) -> None:
        kit = _create_active_kit(session, make_attachment_set)
        part = _create_part(session, make_attachment_set, "UNDO2", "Undo Timestamp Part")
        _attach_content(session, kit, part, required_per_unit=1)
        location = _create_location(session, box_no=103, loc_no=1)
        _attach_location(session, part, location, qty=1)

        pick_list = kit_pick_list_service.create_pick_list(kit.id, requested_units=1)
        line = pick_list.lines[0]
        kit_pick_list_service.pick_line(pick_list.id, line.id)
        session.flush()
        session.refresh(pick_list)
        post_pick_updated_at = pick_list.updated_at

        kit_pick_list_service.undo_line(pick_list.id, line.id)
        session.flush()
        session.refresh(pick_list)

        assert pick_list.updated_at != post_pick_updated_at

    def test_undo_zero_quantity_line_resets_status_without_inventory_change(
        self,
        session,
        kit_pick_list_service: KitPickListService,

        make_attachment_set,

    ) -> None:
        """Undoing a zero-quantity picked line should reset status without inventory ops."""
        kit = _create_active_kit(session, make_attachment_set)
        part = _create_part(session, make_attachment_set, "UNDZ", "Undo Zero Part")
        _attach_content(session, kit, part, required_per_unit=1)
        location = _create_location(session, box_no=104, loc_no=1)
        _attach_location(session, part, location, qty=10)

        pick_list = kit_pick_list_service.create_pick_list(kit.id, requested_units=1)
        line = pick_list.lines[0]

        # Update line to zero quantity
        kit_pick_list_service.update_line_quantity(pick_list.id, line.id, 0)
        session.flush()
        session.refresh(line)
        assert line.quantity_to_pick == 0

        # Pick the zero-quantity line (marks it COMPLETED but no inventory change)
        kit_pick_list_service.pick_line(pick_list.id, line.id)
        session.flush()
        session.refresh(line)
        assert line.status is PickListLineStatus.COMPLETED
        assert line.inventory_change_id is None  # No inventory change for zero qty

        # Undo the zero-quantity line - should reset to OPEN without error
        kit_pick_list_service.undo_line(pick_list.id, line.id)
        session.flush()
        session.refresh(line)

        assert line.status is PickListLineStatus.OPEN
        assert line.picked_at is None

    def test_delete_pick_list_removes_open_pick_list_and_lines(
        self,
        session,
        kit_pick_list_service: KitPickListService,

        make_attachment_set,

    ) -> None:
        kit = _create_active_kit(session, make_attachment_set)
        part = _create_part(session, make_attachment_set, "DEL1", "Delete Part")
        _attach_content(session, kit, part, required_per_unit=1)
        location = _create_location(session, box_no=110, loc_no=1)
        _attach_location(session, part, location, qty=5)

        pick_list = kit_pick_list_service.create_pick_list(kit.id, requested_units=2)
        session.flush()
        pick_list_id = pick_list.id
        line_ids = [line.id for line in pick_list.lines]

        kit_pick_list_service.delete_pick_list(pick_list_id)
        session.flush()

        assert session.get(KitPickList, pick_list_id) is None
        for line_id in line_ids:
            assert session.execute(
                select(KitPickListLine).where(KitPickListLine.id == line_id)
            ).scalar_one_or_none() is None

    def test_delete_pick_list_removes_completed_pick_list_preserves_history(
        self,
        session,
        kit_pick_list_service: KitPickListService,

        make_attachment_set,

    ) -> None:
        kit = _create_active_kit(session, make_attachment_set)
        part = _create_part(session, make_attachment_set, "DEL2", "Delete Completed Part")
        _attach_content(session, kit, part, required_per_unit=1)
        location = _create_location(session, box_no=111, loc_no=1)
        _attach_location(session, part, location, qty=3)

        pick_list = kit_pick_list_service.create_pick_list(kit.id, requested_units=1)
        line = pick_list.lines[0]
        kit_pick_list_service.pick_line(pick_list.id, line.id)
        session.flush()

        pick_list_id = pick_list.id
        inventory_change_id = line.inventory_change_id

        kit_pick_list_service.delete_pick_list(pick_list_id)
        session.flush()

        assert session.get(KitPickList, pick_list_id) is None
        assert session.execute(
            select(KitPickListLine).where(KitPickListLine.id == line.id)
        ).scalar_one_or_none() is None

        from app.models.quantity_history import QuantityHistory
        history_record = session.get(QuantityHistory, inventory_change_id)
        assert history_record is not None

    def test_delete_pick_list_removes_mixed_status_lines(
        self,
        session,
        kit_pick_list_service: KitPickListService,

        make_attachment_set,

    ) -> None:
        kit = _create_active_kit(session, make_attachment_set)
        part = _create_part(session, make_attachment_set, "DEL3", "Delete Mixed Part")
        _attach_content(session, kit, part, required_per_unit=1)
        location_a = _create_location(session, box_no=112, loc_no=1)
        _attach_location(session, part, location_a, qty=1)
        location_b = _create_location(session, box_no=113, loc_no=1)
        _attach_location(session, part, location_b, qty=1)

        pick_list = kit_pick_list_service.create_pick_list(kit.id, requested_units=2)
        first_line = pick_list.lines[0]
        kit_pick_list_service.pick_line(pick_list.id, first_line.id)
        session.flush()

        pick_list_id = pick_list.id
        line_ids = [line.id for line in pick_list.lines]

        kit_pick_list_service.delete_pick_list(pick_list_id)
        session.flush()

        assert session.get(KitPickList, pick_list_id) is None
        for line_id in line_ids:
            assert session.execute(
                select(KitPickListLine).where(KitPickListLine.id == line_id)
            ).scalar_one_or_none() is None

    def test_delete_pick_list_raises_for_nonexistent_id(
        self,
        kit_pick_list_service: KitPickListService,

        make_attachment_set,

    ) -> None:
        with pytest.raises(RecordNotFoundException):
            kit_pick_list_service.delete_pick_list(9999)

    def test_delete_pick_list_removes_from_list_results(
        self,
        session,
        kit_pick_list_service: KitPickListService,

        make_attachment_set,

    ) -> None:
        kit = _create_active_kit(session, make_attachment_set)
        part = _create_part(session, make_attachment_set, "DEL4", "Delete List Part")
        _attach_content(session, kit, part, required_per_unit=1)
        location = _create_location(session, box_no=114, loc_no=1)
        _attach_location(session, part, location, qty=10)

        first = kit_pick_list_service.create_pick_list(kit.id, requested_units=1)
        second = kit_pick_list_service.create_pick_list(kit.id, requested_units=2)
        session.flush()

        kit_pick_list_service.delete_pick_list(first.id)
        session.flush()

        remaining = kit_pick_list_service.list_pick_lists_for_kit(kit.id)
        assert len(remaining) == 1
        assert remaining[0].id == second.id

    def test_update_line_quantity_updates_quantity_and_timestamp(
        self,
        session,
        kit_pick_list_service: KitPickListService,
        metrics_stub: PickListMetricsStub,

        make_attachment_set,

    ) -> None:
        kit = _create_active_kit(session, make_attachment_set)
        part = _create_part(session, make_attachment_set, "UPD1", "Update quantity part")
        _attach_content(session, kit, part, required_per_unit=10)
        location = _create_location(session, box_no=200, loc_no=1)
        _attach_location(session, part, location, qty=50)

        pick_list = kit_pick_list_service.create_pick_list(kit.id, requested_units=1)
        session.flush()
        initial_updated_at = pick_list.updated_at

        line = pick_list.lines[0]
        original_quantity = line.quantity_to_pick

        kit_pick_list_service.update_line_quantity(pick_list.id, line.id, 5)
        session.flush()
        session.refresh(pick_list)

        refreshed_line = session.get(KitPickListLine, line.id)
        assert refreshed_line is not None
        assert refreshed_line.quantity_to_pick == 5
        assert pick_list.updated_at > initial_updated_at
        assert len(metrics_stub.line_quantity_updates) == 1
        assert metrics_stub.line_quantity_updates[0] == (line.id, original_quantity, 5)

    def test_update_line_quantity_allows_zero(
        self,
        session,
        kit_pick_list_service: KitPickListService,

        make_attachment_set,

    ) -> None:
        kit = _create_active_kit(session, make_attachment_set)
        part = _create_part(session, make_attachment_set, "UPD2", "Zero quantity part")
        _attach_content(session, kit, part, required_per_unit=5)
        location = _create_location(session, box_no=201, loc_no=1)
        _attach_location(session, part, location, qty=20)

        pick_list = kit_pick_list_service.create_pick_list(kit.id, requested_units=1)
        session.flush()
        line = pick_list.lines[0]

        kit_pick_list_service.update_line_quantity(pick_list.id, line.id, 0)
        session.flush()

        refreshed_line = session.get(KitPickListLine, line.id)
        assert refreshed_line is not None
        assert refreshed_line.quantity_to_pick == 0
        assert refreshed_line.status == PickListLineStatus.OPEN

    def test_update_line_quantity_recalculates_derived_totals(
        self,
        session,
        kit_pick_list_service: KitPickListService,

        make_attachment_set,

    ) -> None:
        kit = _create_active_kit(session, make_attachment_set)
        part = _create_part(session, make_attachment_set, "UPD3", "Recalc totals part")
        _attach_content(session, kit, part, required_per_unit=8)
        location = _create_location(session, box_no=202, loc_no=1)
        _attach_location(session, part, location, qty=30)

        pick_list = kit_pick_list_service.create_pick_list(kit.id, requested_units=1)
        session.flush()
        line = pick_list.lines[0]

        original_total = pick_list.total_quantity_to_pick
        assert original_total == 8

        updated_pick_list = kit_pick_list_service.update_line_quantity(
            pick_list.id, line.id, 3
        )

        assert updated_pick_list.total_quantity_to_pick == 3
        assert updated_pick_list.remaining_quantity == 3

    def test_update_line_quantity_raises_for_completed_line(
        self,
        session,
        kit_pick_list_service: KitPickListService,

        make_attachment_set,

    ) -> None:
        kit = _create_active_kit(session, make_attachment_set)
        part = _create_part(session, make_attachment_set, "UPD4", "Completed line part")
        _attach_content(session, kit, part, required_per_unit=2)
        location = _create_location(session, box_no=203, loc_no=1)
        _attach_location(session, part, location, qty=10)

        pick_list = kit_pick_list_service.create_pick_list(kit.id, requested_units=1)
        session.flush()
        line = pick_list.lines[0]

        kit_pick_list_service.pick_line(pick_list.id, line.id)
        session.flush()

        with pytest.raises(InvalidOperationException) as exc_info:
            kit_pick_list_service.update_line_quantity(pick_list.id, line.id, 5)

        assert "cannot edit completed pick list line" in str(exc_info.value)

    def test_update_line_quantity_raises_for_completed_pick_list(
        self,
        session,
        kit_pick_list_service: KitPickListService,

        make_attachment_set,

    ) -> None:
        kit = _create_active_kit(session, make_attachment_set)
        part = _create_part(session, make_attachment_set, "UPD5", "Completed pick list part")
        _attach_content(session, kit, part, required_per_unit=3)
        location = _create_location(session, box_no=204, loc_no=1)
        _attach_location(session, part, location, qty=15)

        pick_list = kit_pick_list_service.create_pick_list(kit.id, requested_units=1)
        session.flush()
        line = pick_list.lines[0]

        kit_pick_list_service.pick_line(pick_list.id, line.id)
        session.flush()

        with pytest.raises(InvalidOperationException) as exc_info:
            kit_pick_list_service.update_line_quantity(pick_list.id, line.id, 5)

        # Line status is checked before pick list status, so this triggers "completed line" error
        assert "cannot edit completed pick list line" in str(exc_info.value)

    def test_update_line_quantity_raises_for_nonexistent_pick_list(
        self,
        kit_pick_list_service: KitPickListService,

        make_attachment_set,

    ) -> None:
        with pytest.raises(RecordNotFoundException):
            kit_pick_list_service.update_line_quantity(9999, 1, 5)

    def test_update_line_quantity_raises_for_nonexistent_line(
        self,
        session,
        kit_pick_list_service: KitPickListService,

        make_attachment_set,

    ) -> None:
        kit = _create_active_kit(session, make_attachment_set)
        part = _create_part(session, make_attachment_set, "UPD6", "Nonexistent line part")
        _attach_content(session, kit, part, required_per_unit=2)
        location = _create_location(session, box_no=205, loc_no=1)
        _attach_location(session, part, location, qty=10)

        pick_list = kit_pick_list_service.create_pick_list(kit.id, requested_units=1)
        session.flush()

        with pytest.raises(RecordNotFoundException):
            kit_pick_list_service.update_line_quantity(pick_list.id, 9999, 5)

    def test_update_line_quantity_raises_for_line_from_different_pick_list(
        self,
        session,
        kit_pick_list_service: KitPickListService,

        make_attachment_set,

    ) -> None:
        kit = _create_active_kit(session, make_attachment_set)
        part = _create_part(session, make_attachment_set, "UPD7", "Different pick list part")
        _attach_content(session, kit, part, required_per_unit=2)
        location = _create_location(session, box_no=206, loc_no=1)
        _attach_location(session, part, location, qty=20)

        first_pick_list = kit_pick_list_service.create_pick_list(kit.id, requested_units=1)
        second_pick_list = kit_pick_list_service.create_pick_list(kit.id, requested_units=1)
        session.flush()

        first_line = first_pick_list.lines[0]

        with pytest.raises(RecordNotFoundException):
            kit_pick_list_service.update_line_quantity(second_pick_list.id, first_line.id, 5)

    def test_zero_quantity_line_blocks_pick_list_completion(
        self,
        session,
        kit_pick_list_service: KitPickListService,

        make_attachment_set,

    ) -> None:
        kit = _create_active_kit(session, make_attachment_set)
        part1 = _create_part(session, make_attachment_set, "UPD8", "First part")
        part2 = _create_part(session, make_attachment_set, "UPD9", "Second part")
        _attach_content(session, kit, part1, required_per_unit=3)
        _attach_content(session, kit, part2, required_per_unit=5)
        location = _create_location(session, box_no=207, loc_no=1)
        _attach_location(session, part1, location, qty=10)
        _attach_location(session, part2, location, qty=10)

        pick_list = kit_pick_list_service.create_pick_list(kit.id, requested_units=1)
        session.flush()

        lines = sorted(pick_list.lines, key=lambda line: line.id)
        first_line = lines[0]
        second_line = lines[1]

        kit_pick_list_service.update_line_quantity(pick_list.id, first_line.id, 0)
        session.flush()

        kit_pick_list_service.pick_line(pick_list.id, second_line.id)
        session.flush()

        refreshed_pick_list = session.get(KitPickList, pick_list.id)
        assert refreshed_pick_list is not None
        assert refreshed_pick_list.status == KitPickListStatus.OPEN

    def test_zero_quantity_line_can_be_picked_for_completion(
        self,
        session,
        kit_pick_list_service: KitPickListService,

        make_attachment_set,

    ) -> None:
        kit = _create_active_kit(session, make_attachment_set)
        part = _create_part(session, make_attachment_set, "UP10", "Zero pick part")
        _attach_content(session, kit, part, required_per_unit=4)
        location = _create_location(session, box_no=208, loc_no=1)
        _attach_location(session, part, location, qty=10)

        pick_list = kit_pick_list_service.create_pick_list(kit.id, requested_units=1)
        session.flush()
        line = pick_list.lines[0]

        kit_pick_list_service.update_line_quantity(pick_list.id, line.id, 0)
        session.flush()

        kit_pick_list_service.pick_line(pick_list.id, line.id)
        session.flush()

        refreshed_line = session.get(KitPickListLine, line.id)
        refreshed_pick_list = session.get(KitPickList, pick_list.id)
        assert refreshed_line is not None
        assert refreshed_line.status == PickListLineStatus.COMPLETED
        assert refreshed_pick_list is not None
        assert refreshed_pick_list.status == KitPickListStatus.COMPLETED

    def test_create_pick_list_allows_multiple_parts_at_same_location(
        self,
        session,
        kit_pick_list_service: KitPickListService,

        make_attachment_set,

    ) -> None:
        """Verify parts sharing a location can all be allocated independently.

        Regression test for bug where reservation tracking was keyed by location_id
        alone, causing later parts to incorrectly see earlier parts' allocations as
        blocking their own stock at the same physical location.
        """
        kit = _create_active_kit(session, make_attachment_set)

        # Create a shared location
        shared_location = _create_location(session, box_no=300, loc_no=1)

        # Create multiple parts at the same location, each with exactly 1 unit
        part_a = _create_part(session, make_attachment_set, "SAMA", "Part A at shared loc")
        part_b = _create_part(session, make_attachment_set, "SAMB", "Part B at shared loc")
        part_c = _create_part(session, make_attachment_set, "SAMC", "Part C at shared loc")

        _attach_content(session, kit, part_a, required_per_unit=1)
        _attach_content(session, kit, part_b, required_per_unit=1)
        _attach_content(session, kit, part_c, required_per_unit=1)

        _attach_location(session, part_a, shared_location, qty=1)
        _attach_location(session, part_b, shared_location, qty=1)
        _attach_location(session, part_c, shared_location, qty=1)

        # Should succeed - each part has independent stock at the same location
        pick_list = kit_pick_list_service.create_pick_list(kit.id, requested_units=1)
        session.flush()

        assert pick_list.status is KitPickListStatus.OPEN
        assert len(pick_list.lines) == 3
        assert all(line.quantity_to_pick == 1 for line in pick_list.lines)
        assert all(line.location_id == shared_location.id for line in pick_list.lines)

    def test_create_pick_list_respects_per_part_reservations_at_shared_location(
        self,
        session,
        kit_pick_list_service: KitPickListService,

        make_attachment_set,

    ) -> None:
        """Verify existing open pick list lines correctly reserve per-part stock.

        When an existing pick list has reserved stock at a location for one part,
        it should NOT block allocation for a different part at the same location.
        """
        kit = _create_active_kit(session, make_attachment_set)

        # Create a shared location with enough stock for two pick lists
        shared_location = _create_location(session, box_no=301, loc_no=1)

        part_a = _create_part(session, make_attachment_set, "RSVA", "Reserved Part A")
        part_b = _create_part(session, make_attachment_set, "RSVB", "Reserved Part B")

        _attach_content(session, kit, part_a, required_per_unit=1)
        _attach_content(session, kit, part_b, required_per_unit=1)

        # Part A has 2 units, Part B has 1 unit - both at same location
        _attach_location(session, part_a, shared_location, qty=2)
        _attach_location(session, part_b, shared_location, qty=1)

        # First pick list reserves 1 of Part A and 1 of Part B
        first_pick_list = kit_pick_list_service.create_pick_list(kit.id, requested_units=1)
        session.flush()

        # Second pick list should succeed for Part A (has 1 remaining)
        # but Part B reservation should correctly block (only 1 total, already reserved)
        with pytest.raises(InvalidOperationException) as exc_info:
            kit_pick_list_service.create_pick_list(kit.id, requested_units=1)

        # Should fail on Part B, not Part A
        assert "RSVB" in str(exc_info.value)

        # Verify first pick list was created correctly
        assert len(first_pick_list.lines) == 2
