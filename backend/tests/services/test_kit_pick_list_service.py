"""Tests for KitPickListService workflows."""

from __future__ import annotations

from datetime import UTC, datetime

import pytest
from sqlalchemy import select

from app.exceptions import InvalidOperationException, RecordNotFoundException
from app.models.box import Box
from app.models.kit import Kit, KitStatus
from app.models.kit_content import KitContent
from app.models.kit_pick_list import KitPickList, KitPickListStatus
from app.models.kit_pick_list_line import PickListLineStatus
from app.models.location import Location
from app.models.part import Part
from app.models.part_location import PartLocation
from app.services.inventory_service import InventoryService
from app.services.kit_pick_list_service import KitPickListService
from app.services.kit_reservation_service import KitReservationService
from app.services.part_service import PartService


class PickListMetricsStub:
    """Minimal metrics stub capturing pick list interactions."""

    def __init__(self) -> None:
        self.quantity_changes: list[tuple[str, int]] = []
        self.pick_list_creations: list[tuple[int, int, int]] = []
        self.line_picks: list[tuple[int, int]] = []
        self.line_undo: list[tuple[str, float]] = []
        self.detail_requests: list[int] = []
        self.list_requests: list[tuple[int, int]] = []

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


@pytest.fixture
def metrics_stub() -> PickListMetricsStub:
    """Provide a metrics stub for each test case."""

    return PickListMetricsStub()


@pytest.fixture
def part_service(session) -> PartService:
    """Create a PartService bound to the test session."""

    return PartService(session)


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


def _create_part(session, key: str, description: str) -> Part:
    part = Part(key=key, description=description)
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


def _create_active_kit(session, name: str = "Test Kit") -> Kit:
    kit = Kit(name=name, build_target=1, status=KitStatus.ACTIVE)
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
    ) -> None:
        kit = _create_active_kit(session)
        part_a = _create_part(session, "ALOC", "Amplifier")
        part_b = _create_part(session, "BLOC", "Buffer")
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
    ) -> None:
        kit = _create_active_kit(session)
        part = _create_part(session, "LOW", "Limited Stock Part")
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
    ) -> None:
        kit = _create_active_kit(session)
        competitor = Kit(name="Competing Kit", build_target=3, status=KitStatus.ACTIVE)
        session.add(competitor)
        session.flush()

        part = _create_part(session, "RESF", "Reservation sensitive part")
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
    ) -> None:
        kit = Kit(name="Archived Kit", build_target=1, status=KitStatus.ARCHIVED, archived_at=datetime.now(UTC))
        session.add(kit)
        session.flush()

        part = _create_part(session, "ARCH", "Archived Part")
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
    ) -> None:
        kit = _create_active_kit(session)
        part = _create_part(session, "RESV", "Reserved Part")
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
    ) -> None:
        kit = _create_active_kit(session)
        part = _create_part(session, "PICK", "Picker Part")
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
    ) -> None:
        kit = _create_active_kit(session)
        part = _create_part(session, "UNDO", "Undo Part")
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
    ) -> None:
        kit = _create_active_kit(session)
        part = _create_part(session, "NOOP", "No-op Part")
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
    ) -> None:
        kit = _create_active_kit(session)
        part = _create_part(session, "DETAIL", "Detail Part")
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
    ) -> None:
        kit = _create_active_kit(session)
        part = _create_part(session, "LIST", "List Part")
        _attach_content(session, kit, part, required_per_unit=1)
        location = _create_location(session, box_no=90, loc_no=1)
        _attach_location(session, part, location, qty=10)

        first = kit_pick_list_service.create_pick_list(kit.id, requested_units=1)
        second = kit_pick_list_service.create_pick_list(kit.id, requested_units=2)
        session.flush()

        pick_lists = kit_pick_list_service.list_pick_lists_for_kit(kit.id)
        assert [pick_lists[0].id, pick_lists[1].id] == [second.id, first.id]
        assert metrics_stub.list_requests[-1] == (kit.id, 2)

    def test_list_pick_lists_for_missing_kit_raises(
        self,
        kit_pick_list_service: KitPickListService,
    ) -> None:
        with pytest.raises(RecordNotFoundException):
            kit_pick_list_service.list_pick_lists_for_kit(9999)

    def test_pick_line_updates_parent_timestamp_when_still_open(
        self,
        session,
        kit_pick_list_service: KitPickListService,
    ) -> None:
        kit = _create_active_kit(session)
        part = _create_part(session, "TIME", "Timestamp Part")
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
    ) -> None:
        kit = _create_active_kit(session)
        part = _create_part(session, "UNDO2", "Undo Timestamp Part")
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
