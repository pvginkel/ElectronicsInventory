"""Tests for KitService behaviour."""

from datetime import UTC, datetime

import pytest
from sqlalchemy.orm import Session

from app.exceptions import (
    InvalidOperationException,
    RecordNotFoundException,
    ResourceConflictException,
)
from app.models.attachment_set import AttachmentSet
from app.models.kit import Kit, KitStatus
from app.models.kit_content import KitContent
from app.models.kit_pick_list import KitPickList, KitPickListStatus
from app.models.kit_shopping_list_link import KitShoppingListLink
from app.models.part import Part
from app.models.shopping_list import ShoppingList, ShoppingListStatus
from app.services.kit_reservation_service import KitReservationUsage
from app.services.kit_service import KitService


class MetricsStub:
    """Minimal metrics collector stub for kit tests."""

    def __init__(self) -> None:
        self.created = 0
        self.archived = 0
        self.unarchived = 0
        self.overview_calls: list[tuple[str, int, int | None]] = []
        self.detail_views = 0
        self.content_created: list[tuple[int, int, int]] = []
        self.content_updated: list[tuple[int, int, float]] = []
        self.content_deleted: list[tuple[int, int]] = []
        self.quantity_changes: list[tuple[str, int]] = []
        self.pick_list_creations: list[tuple[int, int, int]] = []
        self.pick_list_line_picks: list[tuple[int, int]] = []
        self.pick_list_line_undo: list[tuple[str, float]] = []
        self.pick_list_detail_requests: list[int] = []
        self.pick_list_list_requests: list[tuple[int, int]] = []

    def record_kit_created(self) -> None:
        self.created += 1

    def record_kit_archived(self) -> None:
        self.archived += 1

    def record_kit_unarchived(self) -> None:
        self.unarchived += 1

    def record_kit_overview_request(
        self,
        status: str,
        result_count: int,
        limit: int | None = None,
    ) -> None:
        self.overview_calls.append((status, result_count, limit))

    def record_kit_detail_view(self, kit_id: int) -> None:
        self.detail_views += 1

    def record_kit_content_created(
        self,
        kit_id: int,
        part_id: int,
        required_per_unit: int,
    ) -> None:
        self.content_created.append((kit_id, part_id, required_per_unit))

    def record_kit_content_updated(
        self,
        kit_id: int,
        part_id: int,
        duration_seconds: float,
    ) -> None:
        self.content_updated.append((kit_id, part_id, duration_seconds))

    def record_kit_content_deleted(self, kit_id: int, part_id: int) -> None:
        self.content_deleted.append((kit_id, part_id))

    def record_quantity_change(self, operation: str, delta: int) -> None:
        self.quantity_changes.append((operation, delta))

    def record_pick_list_created(self, kit_id: int, requested_units: int, line_count: int) -> None:
        self.pick_list_creations.append((kit_id, requested_units, line_count))

    def record_pick_list_line_picked(self, line_id: int, quantity: int) -> None:
        self.pick_list_line_picks.append((line_id, quantity))

    def record_pick_list_line_undo(self, outcome: str, duration_seconds: float) -> None:
        self.pick_list_line_undo.append((outcome, duration_seconds))

    def record_pick_list_detail_request(self, pick_list_id: int) -> None:
        self.pick_list_detail_requests.append(pick_list_id)

    def record_pick_list_list_request(self, kit_id: int, result_count: int) -> None:
        self.pick_list_list_requests.append((kit_id, result_count))


class InventoryStub:
    """Stub inventory service returning configurable totals."""

    def __init__(self) -> None:
        self.quantities: dict[str, int] = {}
        self.requests: list[tuple[str, ...]] = []

    def get_total_quantities_by_part_keys(self, part_keys):
        keys = tuple(part_keys)
        self.requests.append(keys)
        return {key: self.quantities.get(key, 0) for key in part_keys}


class KitReservationStub:
    """Stub reservation service returning configurable totals."""

    def __init__(self) -> None:
        self.totals: dict[int, int] = {}
        self.requests: list[tuple[int, ...]] = []

    def get_reserved_totals_for_parts(
        self,
        part_ids,
        *,
        exclude_kit_id=None,
    ):
        ids = tuple(part_ids)
        self.requests.append(ids)
        return {part_id: self.totals.get(part_id, 0) for part_id in part_ids}

    def get_reserved_quantity(
        self,
        part_id: int,
        *,
        exclude_kit_id=None,
    ) -> int:
        return self.totals.get(part_id, 0)

    def get_reservations_by_part_ids(self, part_ids):
        ids = tuple(part_ids)
        self.requests.append(ids)
        reservations: dict[int, list[KitReservationUsage]] = {}
        for part_id in part_ids:
            total = self.totals.get(part_id, 0)
            if total:
                reservations[part_id] = [
                    KitReservationUsage(
                        part_id=part_id,
                        kit_id=-1,
                        kit_name="stub",
                        status=KitStatus.ACTIVE,
                        build_target=1,
                        required_per_unit=total,
                        reserved_quantity=total,
                        updated_at=datetime.now(UTC),
                    )
                ]
            else:
                reservations[part_id] = []
        return reservations


@pytest.fixture
def metrics_stub() -> MetricsStub:
    """Provide a fresh metrics stub for each test."""
    return MetricsStub()


@pytest.fixture
def inventory_stub() -> InventoryStub:
    """Provide a configurable inventory stub."""
    return InventoryStub()


@pytest.fixture
def kit_reservation_stub() -> KitReservationStub:
    """Provide a configurable reservation stub."""
    return KitReservationStub()


class AttachmentSetStub:
    """Minimal stub for AttachmentSetService that creates real attachment sets."""

    def __init__(self, db: Session):
        self.db = db

    def create_attachment_set(self) -> AttachmentSet:
        attachment_set = AttachmentSet()
        self.db.add(attachment_set)
        self.db.flush()
        return attachment_set


@pytest.fixture
def kit_service(
    session,
    metrics_stub: MetricsStub,
    inventory_stub: InventoryStub,
    kit_reservation_stub: KitReservationStub,
) -> KitService:
    """Create KitService instance backed by the test session."""
    return KitService(
        session,
        metrics_service=metrics_stub,
        inventory_service=inventory_stub,
        kit_reservation_service=kit_reservation_stub,
        attachment_set_service=AttachmentSetStub(session),
    )


class TestKitService:
    """Service-level tests covering kit lifecycle operations."""

    def test_list_kits_filters_and_counts(
        self,
        session,
        kit_service: KitService,
        metrics_stub: MetricsStub,
        make_attachment_set,
    ):
        concept_list = ShoppingList(
            name="Concept BOM",
            status=ShoppingListStatus.CONCEPT,
        )
        ready_list = ShoppingList(
            name="Ready BOM",
            status=ShoppingListStatus.READY,
        )
        done_list = ShoppingList(
            name="Legacy BOM",
            status=ShoppingListStatus.DONE,
        )
        session.add_all([concept_list, ready_list, done_list])

        active_kit_attachment_set = make_attachment_set()
        active_kit = Kit(
            name="Synth Demo Kit",
            description="Demo kit for synthesizer workshops",
            build_target=3,
            status=KitStatus.ACTIVE,
            attachment_set_id=active_kit_attachment_set.id,
        )
        archived_kit_attachment_set = make_attachment_set()
        archived_kit = Kit(
            name="Archived Reference",
            description="Archived kit for regression testing",
            build_target=1,
            status=KitStatus.ARCHIVED,
            archived_at=datetime.now(UTC),
            attachment_set_id=archived_kit_attachment_set.id,
        )
        session.add_all([active_kit, archived_kit])
        session.flush()

        session.add_all(
            [
                KitShoppingListLink(
                    kit_id=active_kit.id,
                    shopping_list_id=concept_list.id,
                    requested_units=active_kit.build_target,
                    honor_reserved=False,
                    snapshot_kit_updated_at=datetime.now(UTC),
                ),
                KitShoppingListLink(
                    kit_id=active_kit.id,
                    shopping_list_id=ready_list.id,
                    requested_units=active_kit.build_target,
                    honor_reserved=True,
                    snapshot_kit_updated_at=datetime.now(UTC),
                ),
                KitShoppingListLink(
                    kit_id=active_kit.id,
                    shopping_list_id=done_list.id,
                    requested_units=active_kit.build_target,
                    honor_reserved=False,
                    snapshot_kit_updated_at=datetime.now(UTC),
                ),
            ]
        )

        session.add_all(
            [
                KitPickList(
                    kit_id=active_kit.id,
                    requested_units=2,
                    status=KitPickListStatus.OPEN,
                ),
                KitPickList(
                    kit_id=active_kit.id,
                    requested_units=1,
                    status=KitPickListStatus.OPEN,
                ),
                KitPickList(
                    kit_id=active_kit.id,
                    requested_units=1,
                    status=KitPickListStatus.COMPLETED,
                ),
            ]
        )
        session.commit()

        results = kit_service.list_kits(status=KitStatus.ACTIVE, query="synth")
        assert len(results) == 1
        result = results[0]
        assert result.name == "Synth Demo Kit"
        assert result.shopping_list_badge_count == 2  # concept + ready only
        assert result.pick_list_badge_count == 2  # open pick lists remain

        assert metrics_stub.overview_calls
        status, count, limit = metrics_stub.overview_calls[-1]
        assert status == KitStatus.ACTIVE.value
        assert count == 1
        assert limit is None

        archived_results = kit_service.list_kits(status=KitStatus.ARCHIVED)
        assert len(archived_results) == 1
        assert archived_results[0].status == KitStatus.ARCHIVED

    def test_resolve_kits_for_bulk_preserves_order(
        self,
        session,
        kit_service: KitService,
        make_attachment_set,
    ) -> None:
        first_attachment_set = make_attachment_set()
        first = Kit(name="First Kit", build_target=1, status=KitStatus.ACTIVE, attachment_set_id=first_attachment_set.id)
        second_attachment_set = make_attachment_set()
        second = Kit(name="Second Kit", build_target=1, status=KitStatus.ACTIVE, attachment_set_id=second_attachment_set.id)
        session.add_all([first, second])
        session.commit()

        result = kit_service.resolve_kits_for_bulk([second.id, first.id])
        assert [kit.id for kit in result] == [second.id, first.id]

    def test_resolve_kits_for_bulk_rejects_duplicates(
        self,
        session,
        kit_service: KitService,
        make_attachment_set,
    ) -> None:
        attachment_set = make_attachment_set()
        kit = Kit(name="Unique Kit", build_target=1, status=KitStatus.ACTIVE, attachment_set_id=attachment_set.id)
        session.add(kit)
        session.commit()

        with pytest.raises(InvalidOperationException):
            kit_service.resolve_kits_for_bulk([kit.id, kit.id])

    def test_resolve_kits_for_bulk_missing_kit(
        self,
        session,
        kit_service: KitService,
        make_attachment_set,
    ) -> None:
        attachment_set = make_attachment_set()
        kit = Kit(name="Present Kit", build_target=1, status=KitStatus.ACTIVE, attachment_set_id=attachment_set.id)
        session.add(kit)
        session.commit()

        with pytest.raises(RecordNotFoundException):
            kit_service.resolve_kits_for_bulk([kit.id, kit.id + 1])

    def test_resolve_kits_for_bulk_enforces_limit(
        self,
        session,
        kit_service: KitService,
        make_attachment_set,
    ) -> None:
        kits = [
            Kit(name=f"Kit {index}", build_target=1, status=KitStatus.ACTIVE, attachment_set_id=make_attachment_set().id)
            for index in range(3)
        ]
        session.add_all(kits)
        session.commit()

        with pytest.raises(InvalidOperationException):
            kit_service.resolve_kits_for_bulk(
                [kit.id for kit in kits],
                limit=2,
            )

    def test_create_kit_enforces_constraints_and_records_metrics(
        self,
        kit_service: KitService,
        metrics_stub: MetricsStub,
    ):
        kit = kit_service.create_kit(name="New Kit", build_target=2)
        assert kit.id is not None
        assert metrics_stub.created == 1

        zero_target = kit_service.create_kit(name="Zero Kit", build_target=0)
        assert zero_target.build_target == 0
        assert metrics_stub.created == 2

        with pytest.raises(InvalidOperationException):
            kit_service.create_kit(name="Invalid Kit", build_target=-1)

    def test_update_kit_prevents_noop_and_archive_guard(
        self,
        session,
        kit_service: KitService,
        make_attachment_set,
    ):
        kit_attachment_set = make_attachment_set()
        kit = Kit(name="Mutable Kit", description="First", build_target=2, attachment_set_id=kit_attachment_set.id)
        archived_attachment_set = make_attachment_set()
        archived = Kit(
            name="Frozen Kit",
            build_target=1,
            status=KitStatus.ARCHIVED,
            archived_at=datetime.now(UTC),
            attachment_set_id=archived_attachment_set.id,
        )
        session.add_all([kit, archived])
        session.commit()

        updated = kit_service.update_kit(
            kit.id,
            description="Updated",
            build_target=0,
        )
        assert updated.description == "Updated"
        assert updated.build_target == 0

        with pytest.raises(InvalidOperationException):
            kit_service.update_kit(kit.id, build_target=-1)

        with pytest.raises(InvalidOperationException):
            kit_service.update_kit(kit.id)

        with pytest.raises(InvalidOperationException):
            kit_service.update_kit(archived.id, description="Nope")

    def test_update_kit_duplicate_name_raises(
        self,
        session,
        kit_service: KitService,
        make_attachment_set,
    ):
        first_attachment_set = make_attachment_set()
        first = Kit(name="Alpha Kit", build_target=1, attachment_set_id=first_attachment_set.id)
        second_attachment_set = make_attachment_set()
        second = Kit(name="Beta Kit", build_target=1, attachment_set_id=second_attachment_set.id)
        session.add_all([first, second])
        session.commit()

        with pytest.raises(InvalidOperationException):
            kit_service.update_kit(second.id, name="Alpha Kit")

    def test_archive_and_unarchive_flow_updates_metrics(
        self,
        session,
        kit_service: KitService,
        metrics_stub: MetricsStub,
        make_attachment_set,
    ):
        attachment_set = make_attachment_set()
        kit = Kit(name="Lifecycle Kit", build_target=2, attachment_set_id=attachment_set.id)
        session.add(kit)
        session.commit()

        archived = kit_service.archive_kit(kit.id)
        assert archived.status == KitStatus.ARCHIVED
        assert archived.archived_at is not None
        assert metrics_stub.archived == 1

        restored = kit_service.unarchive_kit(kit.id)
        assert restored.status == KitStatus.ACTIVE
        assert restored.archived_at is None
        assert metrics_stub.unarchived == 1

        with pytest.raises(InvalidOperationException):
            kit_service.unarchive_kit(kit.id)

        kit_service.archive_kit(kit.id)
        with pytest.raises(InvalidOperationException):
            kit_service.archive_kit(kit.id)

    def test_get_kit_detail_calculates_availability(
        self,
        session,
        kit_service: KitService,
        metrics_stub: MetricsStub,
        inventory_stub: InventoryStub,
        kit_reservation_stub: KitReservationStub,
        make_attachment_set,
    ):
        kit_attachment_set = make_attachment_set()
        kit = Kit(name="Detail Kit", build_target=2, status=KitStatus.ACTIVE, attachment_set_id=kit_attachment_set.id)
        part_a_attachment_set = make_attachment_set()
        part_a = Part(key="P001", description="Shift register", attachment_set_id=part_a_attachment_set.id)
        part_b_attachment_set = make_attachment_set()
        part_b = Part(key="P002", description="Op amp", attachment_set_id=part_b_attachment_set.id)
        session.add_all([kit, part_a, part_b])
        session.flush()

        session.add_all(
            [
                KitContent(kit=kit, part=part_a, required_per_unit=3, note="Socket for reuse"),
                KitContent(kit=kit, part=part_b, required_per_unit=1),
            ]
        )
        session.commit()

        inventory_stub.quantities = {"P001": 5, "P002": 1}
        kit_reservation_stub.totals = {part_a.id: 1, part_b.id: 0}

        detail = kit_service.get_kit_detail(kit.id)

        assert metrics_stub.detail_views == 1
        assert inventory_stub.requests[-1] == ("P001", "P002")
        assert kit_reservation_stub.requests[-1] == (part_a.id, part_b.id)

        # Contents sorted by part key for deterministic ordering
        keys = [content.part.key for content in detail.contents]
        assert keys == ["P001", "P002"]

        content_a, content_b = detail.contents
        assert content_a.total_required == 6
        assert content_a.in_stock == 5
        assert content_a.reserved == 1
        assert content_a.available == 4
        assert content_a.shortfall == 2
        assert content_a.note == "Socket for reuse"
        assert len(content_a.active_reservations) == 1
        assert content_a.active_reservations[0].reserved_quantity == 1

        assert content_b.total_required == 2
        assert content_b.in_stock == 1
        assert content_b.reserved == 0
        assert content_b.available == 1
        assert content_b.shortfall == 1
        assert content_b.active_reservations == []

    def test_create_content_enforces_rules_and_records_metrics(
        self,
        session,
        kit_service: KitService,
        metrics_stub: MetricsStub,
        make_attachment_set,
    ):
        kit_attachment_set = make_attachment_set()
        kit = Kit(name="Create Kit", build_target=1, attachment_set_id=kit_attachment_set.id)
        part_attachment_set = make_attachment_set()
        part = Part(key="CA01", description="Capacitor", attachment_set_id=part_attachment_set.id)
        session.add_all([kit, part])
        session.commit()

        original_updated = kit.updated_at

        content = kit_service.create_content(
            kit.id,
            part_id=part.id,
            required_per_unit=2,
            note="Electrolytic",
        )

        session.refresh(kit)
        assert kit.updated_at > original_updated
        assert content.required_per_unit == 2
        assert metrics_stub.content_created[-1] == (kit.id, part.id, 2)

        with pytest.raises(ResourceConflictException):
            kit_service.create_content(kit.id, part_id=part.id, required_per_unit=1)

    def test_update_content_handles_version_conflicts(
        self,
        session,
        kit_service: KitService,
        metrics_stub: MetricsStub,
        make_attachment_set,
    ):
        kit_attachment_set = make_attachment_set()
        kit = Kit(name="Update Kit", build_target=2, attachment_set_id=kit_attachment_set.id)
        part_attachment_set = make_attachment_set()
        part = Part(key="UP01", description="Timer", attachment_set_id=part_attachment_set.id)
        content = KitContent(kit=kit, part=part, required_per_unit=2)
        session.add_all([kit, part, content])
        session.commit()

        baseline_updated = kit.updated_at
        current_version = content.version

        updated = kit_service.update_content(
            kit.id,
            content.id,
            version=current_version,
            required_per_unit=4,
            note="Tight tolerance",
            note_provided=True,
        )

        session.refresh(kit)
        assert kit.updated_at > baseline_updated
        assert updated.required_per_unit == 4
        assert updated.note == "Tight tolerance"
        assert updated.version == current_version + 1
        assert metrics_stub.content_updated[-1][0:2] == (kit.id, part.id)

        with pytest.raises(ResourceConflictException):
            kit_service.update_content(
                kit.id,
                content.id,
                version=current_version,
                required_per_unit=5,
            )

    def test_delete_content_removes_entry_and_records_metric(
        self,
        session,
        kit_service: KitService,
        metrics_stub: MetricsStub,
        make_attachment_set,
    ):
        kit_attachment_set = make_attachment_set()
        kit = Kit(name="Delete Kit", build_target=1, attachment_set_id=kit_attachment_set.id)
        part_attachment_set = make_attachment_set()
        part = Part(key="DL01", description="LED", attachment_set_id=part_attachment_set.id)
        content = KitContent(kit=kit, part=part, required_per_unit=1)
        session.add_all([kit, part, content])
        session.commit()

        content_id = content.id
        kit_service.delete_content(kit.id, content_id)

        assert session.get(KitContent, content_id) is None
        session.refresh(kit)
        assert not kit.contents
        assert metrics_stub.content_deleted[-1] == (kit.id, part.id)

    def test_delete_kit_removes_kit_from_database(
        self,
        session,
        kit_service: KitService,
        make_attachment_set,
    ):
        """Delete a kit with no child records."""
        attachment_set = make_attachment_set()
        kit = Kit(name="Simple Kit", build_target=1, attachment_set_id=attachment_set.id)
        session.add(kit)
        session.commit()

        kit_id = kit.id
        kit_service.delete_kit(kit_id)

        assert session.get(Kit, kit_id) is None

    def test_delete_kit_cascades_contents(
        self,
        session,
        kit_service: KitService,
        make_attachment_set,
    ):
        """Delete a kit with contents removes all content records."""
        kit_attachment_set = make_attachment_set()
        kit = Kit(name="Kit With Contents", build_target=1, attachment_set_id=kit_attachment_set.id)
        part_a_attachment_set = make_attachment_set()
        part_a = Part(key="KDC1", description="Resistor", attachment_set_id=part_a_attachment_set.id)
        part_b_attachment_set = make_attachment_set()
        part_b = Part(key="KDC2", description="Capacitor", attachment_set_id=part_b_attachment_set.id)
        session.add_all([kit, part_a, part_b])
        session.flush()

        content_a = KitContent(kit=kit, part=part_a, required_per_unit=2)
        content_b = KitContent(kit=kit, part=part_b, required_per_unit=3)
        session.add_all([content_a, content_b])
        session.commit()

        kit_id = kit.id
        content_a_id = content_a.id
        content_b_id = content_b.id

        kit_service.delete_kit(kit_id)

        assert session.get(Kit, kit_id) is None
        assert session.get(KitContent, content_a_id) is None
        assert session.get(KitContent, content_b_id) is None

    def test_delete_kit_cascades_pick_lists_and_lines(
        self,
        session,
        kit_service: KitService,
        make_attachment_set,
    ):
        """Delete a kit with pick lists removes all pick list records and lines."""
        attachment_set = make_attachment_set()
        kit = Kit(name="Kit With Pick Lists", build_target=1, attachment_set_id=attachment_set.id)
        session.add(kit)
        session.flush()

        pick_list = KitPickList(
            kit_id=kit.id,
            requested_units=1,
            status=KitPickListStatus.OPEN,
        )
        session.add(pick_list)
        session.commit()

        kit_id = kit.id
        pick_list_id = pick_list.id

        kit_service.delete_kit(kit_id)

        assert session.get(Kit, kit_id) is None
        assert session.get(KitPickList, pick_list_id) is None

    def test_delete_kit_cascades_shopping_list_links(
        self,
        session,
        kit_service: KitService,
        make_attachment_set,
    ):
        """Delete a kit with shopping list links removes all link records."""
        attachment_set = make_attachment_set()
        kit = Kit(name="Kit With Links", build_target=1, attachment_set_id=attachment_set.id)
        shopping_list = ShoppingList(
            name="Test List",
            status=ShoppingListStatus.CONCEPT,
        )
        session.add_all([kit, shopping_list])
        session.flush()

        link = KitShoppingListLink(
            kit_id=kit.id,
            shopping_list_id=shopping_list.id,
            requested_units=1,
            honor_reserved=False,
            snapshot_kit_updated_at=datetime.now(UTC),
        )
        session.add(link)
        session.commit()

        kit_id = kit.id
        link_id = link.id

        kit_service.delete_kit(kit_id)

        assert session.get(Kit, kit_id) is None
        assert session.get(KitShoppingListLink, link_id) is None
        # Shopping list should still exist
        assert session.get(ShoppingList, shopping_list.id) is not None

    def test_delete_active_kit_succeeds(
        self,
        session,
        kit_service: KitService,
        make_attachment_set,
    ):
        """Delete an active kit without status restriction."""
        attachment_set = make_attachment_set()
        kit = Kit(name="Active Kit", build_target=1, status=KitStatus.ACTIVE, attachment_set_id=attachment_set.id)
        session.add(kit)
        session.commit()

        kit_id = kit.id
        kit_service.delete_kit(kit_id)

        assert session.get(Kit, kit_id) is None

    def test_delete_archived_kit_succeeds(
        self,
        session,
        kit_service: KitService,
        make_attachment_set,
    ):
        """Delete an archived kit without status restriction."""
        attachment_set = make_attachment_set()
        kit = Kit(
            name="Archived Kit",
            build_target=1,
            status=KitStatus.ARCHIVED,
            archived_at=datetime.now(UTC),
            attachment_set_id=attachment_set.id,
        )
        session.add(kit)
        session.commit()

        kit_id = kit.id
        kit_service.delete_kit(kit_id)

        assert session.get(Kit, kit_id) is None

    def test_delete_nonexistent_kit_raises_not_found(
        self,
        session,
        kit_service: KitService,
    ):
        """Delete a nonexistent kit raises RecordNotFoundException."""
        with pytest.raises(RecordNotFoundException):
            kit_service.delete_kit(99999)
