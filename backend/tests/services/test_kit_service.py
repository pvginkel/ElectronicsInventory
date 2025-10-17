"""Tests for KitService behaviour."""

from datetime import UTC, datetime

import pytest

from app.exceptions import InvalidOperationException
from app.models.kit import Kit, KitStatus
from app.models.kit_pick_list import KitPickList, KitPickListStatus
from app.models.kit_shopping_list_link import KitShoppingListLink
from app.models.shopping_list import ShoppingList, ShoppingListStatus
from app.services.kit_service import KitService


class MetricsStub:
    """Minimal metrics collector stub for kit tests."""

    def __init__(self) -> None:
        self.created = 0
        self.archived = 0
        self.unarchived = 0
        self.overview_calls: list[tuple[str, int, int | None]] = []

    def record_kit_created(self) -> None:
        self.created += 1

    def record_kit_archived(self) -> None:
        self.archived += 1

    def record_kit_unarchived(self) -> None:
        self.unarchived += 1

    def record_kit_overview_request(self, status: str, result_count: int, limit: int | None = None) -> None:
        self.overview_calls.append((status, result_count, limit))


@pytest.fixture
def metrics_stub() -> MetricsStub:
    """Provide a fresh metrics stub for each test."""
    return MetricsStub()


@pytest.fixture
def kit_service(session, metrics_stub: MetricsStub) -> KitService:
    """Create KitService instance backed by the test session."""
    return KitService(session, metrics_service=metrics_stub)


class TestKitService:
    """Service-level tests covering kit lifecycle operations."""

    def test_list_kits_filters_and_counts(self, session, kit_service: KitService, metrics_stub: MetricsStub):
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

        active_kit = Kit(
            name="Synth Demo Kit",
            description="Demo kit for synthesizer workshops",
            build_target=3,
            status=KitStatus.ACTIVE,
        )
        archived_kit = Kit(
            name="Archived Reference",
            description="Archived kit for regression testing",
            build_target=1,
            status=KitStatus.ARCHIVED,
            archived_at=datetime.now(UTC),
        )
        session.add_all([active_kit, archived_kit])
        session.flush()

        session.add_all(
            [
                KitShoppingListLink(
                    kit_id=active_kit.id,
                    shopping_list_id=concept_list.id,
                    linked_status=ShoppingListStatus.CONCEPT,
                ),
                KitShoppingListLink(
                    kit_id=active_kit.id,
                    shopping_list_id=ready_list.id,
                    linked_status=ShoppingListStatus.READY,
                ),
                KitShoppingListLink(
                    kit_id=active_kit.id,
                    shopping_list_id=done_list.id,
                    linked_status=ShoppingListStatus.DONE,
                ),
            ]
        )

        session.add_all(
            [
                KitPickList(
                    kit_id=active_kit.id,
                    requested_units=2,
                    status=KitPickListStatus.IN_PROGRESS,
                ),
                KitPickList(
                    kit_id=active_kit.id,
                    requested_units=1,
                    status=KitPickListStatus.DRAFT,
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
        assert result.pick_list_badge_count == 2  # draft + in_progress

        assert metrics_stub.overview_calls
        status, count, limit = metrics_stub.overview_calls[-1]
        assert status == KitStatus.ACTIVE.value
        assert count == 1
        assert limit is None

        archived_results = kit_service.list_kits(status=KitStatus.ARCHIVED)
        assert len(archived_results) == 1
        assert archived_results[0].status == KitStatus.ARCHIVED

    def test_create_kit_enforces_constraints_and_records_metrics(
        self,
        kit_service: KitService,
        metrics_stub: MetricsStub,
    ):
        kit = kit_service.create_kit(name="New Kit", build_target=2)
        assert kit.id is not None
        assert metrics_stub.created == 1

        with pytest.raises(InvalidOperationException):
            kit_service.create_kit(name="Invalid Kit", build_target=0)

    def test_update_kit_prevents_noop_and_archive_guard(
        self,
        session,
        kit_service: KitService,
    ):
        kit = Kit(name="Mutable Kit", description="First", build_target=2)
        archived = Kit(
            name="Frozen Kit",
            build_target=1,
            status=KitStatus.ARCHIVED,
            archived_at=datetime.now(UTC),
        )
        session.add_all([kit, archived])
        session.commit()

        updated = kit_service.update_kit(
            kit.id,
            description="Updated",
            build_target=4,
        )
        assert updated.description == "Updated"
        assert updated.build_target == 4

        with pytest.raises(InvalidOperationException):
            kit_service.update_kit(kit.id)

        with pytest.raises(InvalidOperationException):
            kit_service.update_kit(archived.id, description="Nope")

    def test_update_kit_duplicate_name_raises(self, session, kit_service: KitService):
        first = Kit(name="Alpha Kit", build_target=1)
        second = Kit(name="Beta Kit", build_target=1)
        session.add_all([first, second])
        session.commit()

        with pytest.raises(InvalidOperationException):
            kit_service.update_kit(second.id, name="Alpha Kit")

    def test_archive_and_unarchive_flow_updates_metrics(
        self,
        session,
        kit_service: KitService,
        metrics_stub: MetricsStub,
    ):
        kit = Kit(name="Lifecycle Kit", build_target=2)
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
