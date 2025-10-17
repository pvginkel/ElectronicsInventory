"""Business logic for kit lifecycle management and overview queries."""

from __future__ import annotations

from collections.abc import Sequence
from datetime import UTC, datetime

from sqlalchemy import Select, func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.exceptions import InvalidOperationException, RecordNotFoundException
from app.models.kit import Kit, KitStatus
from app.models.kit_pick_list import KitPickList, KitPickListStatus
from app.models.kit_shopping_list_link import KitShoppingListLink
from app.models.shopping_list import ShoppingListStatus
from app.services.base import BaseService
from app.services.metrics_service import MetricsServiceProtocol


class KitService(BaseService):
    """Service encapsulating kit overview operations and lifecycle rules."""

    def __init__(
        self,
        db: Session,
        metrics_service: MetricsServiceProtocol | None = None,
    ):
        """Initialize service with database session and optional metrics sink."""
        super().__init__(db)
        self.metrics_service = metrics_service

    def list_kits(
        self,
        *,
        status: KitStatus,
        query: str | None = None,
        limit: int | None = None,
    ) -> list[Kit]:
        """Return kits for overview cards with badge counts applied."""
        shopping_badges = (
            select(func.count(KitShoppingListLink.id))
            .where(
                KitShoppingListLink.kit_id == Kit.id,
                KitShoppingListLink.linked_status.in_(
                    self._shopping_badge_statuses()
                ),
            )
            .correlate(Kit)
            .scalar_subquery()
        )
        pick_list_badges = (
            select(func.count(KitPickList.id))
            .where(
                KitPickList.kit_id == Kit.id,
                KitPickList.status != KitPickListStatus.COMPLETED,
            )
            .correlate(Kit)
            .scalar_subquery()
        )

        stmt: Select[tuple[Kit, int, int]] = (
            select(Kit, shopping_badges, pick_list_badges)
            .where(Kit.status == status)
            .order_by(Kit.updated_at.desc())
        )

        if query:
            term = f"%{query.strip().lower()}%"
            stmt = stmt.where(
                or_(
                    func.lower(Kit.name).like(term),
                    Kit.description.ilike(term),
                )
            )

        if limit is not None:
            stmt = stmt.limit(limit)

        rows = self.db.execute(stmt).all()
        kits: list[Kit] = []
        for kit, shopping_badge_count, pick_list_badge_count in rows:
            kit.shopping_list_badge_count = int(shopping_badge_count or 0)
            kit.pick_list_badge_count = int(pick_list_badge_count or 0)
            kits.append(kit)

        self._record_overview_metric(status, len(kits), limit)
        return kits

    def create_kit(
        self,
        *,
        name: str,
        description: str | None = None,
        build_target: int = 1,
    ) -> Kit:
        """Create a new kit in active status."""
        if build_target < 1:
            raise InvalidOperationException(
                "create kit",
                "build target must be at least 1",
            )

        kit = Kit(
            name=name,
            description=description,
            build_target=build_target,
        )
        self.db.add(kit)
        try:
            self.db.flush()
        except IntegrityError as exc:
            self.db.rollback()
            raise InvalidOperationException(
                "create kit",
                f"kit name '{name}' is already in use",
            ) from exc

        self._touch_kit(kit)
        self.db.flush()
        self._record_created_metric()
        return kit

    def update_kit(
        self,
        kit_id: int,
        *,
        name: str | None = None,
        description: str | None = None,
        build_target: int | None = None,
    ) -> Kit:
        """Update basic kit metadata when the kit is active."""
        kit = self._get_kit_for_update(kit_id)

        if kit.status == KitStatus.ARCHIVED:
            raise InvalidOperationException(
                "update kit",
                "kit is archived",
            )

        applied_change = False

        if name is not None:
            kit.name = name
            applied_change = True

        if description is not None:
            kit.description = description
            applied_change = True

        if build_target is not None:
            if build_target < 1:
                raise InvalidOperationException(
                    "update kit",
                    "build target must be at least 1",
                )
            kit.build_target = build_target
            applied_change = True

        if not applied_change:
            raise InvalidOperationException(
                "update kit",
                "no changes were provided",
            )

        self._touch_kit(kit)
        try:
            self.db.flush()
        except IntegrityError as exc:
            self.db.rollback()
            raise InvalidOperationException(
                "update kit",
                f"kit name '{name}' is already in use",
            ) from exc

        return kit

    def archive_kit(self, kit_id: int) -> Kit:
        """Archive a kit, halting further edits."""
        kit = self._get_kit_for_update(kit_id)

        if kit.status == KitStatus.ARCHIVED:
            raise InvalidOperationException(
                "archive kit",
                "kit is already archived",
            )

        kit.status = KitStatus.ARCHIVED
        kit.archived_at = datetime.now(UTC)
        self._touch_kit(kit)
        self.db.flush()
        self._record_archived_metric()
        return kit

    def unarchive_kit(self, kit_id: int) -> Kit:
        """Return an archived kit to active status."""
        kit = self._get_kit_for_update(kit_id)

        if kit.status != KitStatus.ARCHIVED:
            raise InvalidOperationException(
                "unarchive kit",
                "kit is not archived",
            )

        kit.status = KitStatus.ACTIVE
        kit.archived_at = None
        self._touch_kit(kit)
        self.db.flush()
        self._record_unarchived_metric()
        return kit

    # Internal helpers -----------------------------------------------------

    def _touch_kit(self, kit: Kit) -> None:
        """Update kit timestamp to reflect mutations."""
        kit.updated_at = datetime.now(UTC)

    def _get_kit_for_update(self, kit_id: int) -> Kit:
        """Fetch kit by id or raise when missing."""
        kit = self.db.get(Kit, kit_id)
        if kit is None:
            raise RecordNotFoundException("Kit", kit_id)
        return kit

    def _record_created_metric(self) -> None:
        if self.metrics_service is None:
            return
        try:
            self.metrics_service.record_kit_created()
        except Exception:
            # Metrics recording should not block core operations
            pass

    def _record_archived_metric(self) -> None:
        if self.metrics_service is None:
            return
        try:
            self.metrics_service.record_kit_archived()
        except Exception:
            pass

    def _record_unarchived_metric(self) -> None:
        if self.metrics_service is None:
            return
        try:
            self.metrics_service.record_kit_unarchived()
        except Exception:
            pass

    def _record_overview_metric(
        self,
        status: KitStatus,
        count: int,
        limit: int | None,
    ) -> None:
        if self.metrics_service is None:
            return
        try:
            self.metrics_service.record_kit_overview_request(
                status.value,
                count,
                limit,
            )
        except Exception:
            pass

    @staticmethod
    def _shopping_badge_statuses() -> Sequence[ShoppingListStatus]:
        """Statuses that count towards the shopping list badge."""
        return (
            ShoppingListStatus.CONCEPT,
            ShoppingListStatus.READY,
        )
