"""Business logic for kit lifecycle management and overview queries."""

from __future__ import annotations

from collections.abc import Sequence
from datetime import UTC, datetime
from time import perf_counter

from sqlalchemy import Select, func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload
from sqlalchemy.orm.exc import StaleDataError

from app.exceptions import (
    InvalidOperationException,
    RecordNotFoundException,
    ResourceConflictException,
)
from app.models.kit import Kit, KitStatus
from app.models.kit_content import KitContent
from app.models.kit_pick_list import KitPickList, KitPickListStatus
from app.models.kit_shopping_list_link import KitShoppingListLink
from app.models.part import Part
from app.models.shopping_list import ShoppingList, ShoppingListStatus
from app.services.base import BaseService
from app.services.inventory_service import InventoryService
from app.services.kit_reservation_service import KitReservationService
from app.services.metrics_service import MetricsServiceProtocol


class KitService(BaseService):
    """Service encapsulating kit overview operations and lifecycle rules."""

    def __init__(
        self,
        db: Session,
        metrics_service: MetricsServiceProtocol | None = None,
        inventory_service: InventoryService | None = None,
        kit_reservation_service: KitReservationService | None = None,
    ):
        """Initialize service with database session and dependencies."""
        super().__init__(db)
        if inventory_service is None:
            raise ValueError("inventory_service dependency is required")
        if kit_reservation_service is None:
            raise ValueError("kit_reservation_service dependency is required")

        self.metrics_service = metrics_service
        self.inventory_service = inventory_service
        self.kit_reservation_service = kit_reservation_service

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
            .join(
                ShoppingList,
                ShoppingList.id == KitShoppingListLink.shopping_list_id,
            )
            .where(
                KitShoppingListLink.kit_id == Kit.id,
                ShoppingList.status.in_(self._shopping_badge_statuses()),
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

    def get_kit_detail(self, kit_id: int) -> Kit:
        """Return kit with contents and computed availability details."""
        stmt = (
            select(Kit)
            .options(
                selectinload(Kit.contents).selectinload(KitContent.part),
                selectinload(Kit.shopping_list_links).selectinload(
                    KitShoppingListLink.shopping_list
                ),
                selectinload(Kit.pick_lists),
            )
            .where(Kit.id == kit_id)
        )
        kit = self.db.execute(stmt).unique().scalar_one_or_none()
        if kit is None:
            raise RecordNotFoundException("Kit", kit_id)

        contents = list(kit.contents)
        if contents:
            part_ids = [content.part_id for content in contents]
            reserved = self.kit_reservation_service.get_reserved_totals_for_parts(
                part_ids,
                exclude_kit_id=kit.id,
            )
            part_keys = [
                content.part.key
                for content in contents
                if content.part is not None
            ]
            in_stock = self.inventory_service.get_total_quantities_by_part_keys(
                part_keys
            )

            for content in contents:
                total_required = content.required_per_unit * kit.build_target
                part_reserved = reserved.get(content.part_id, 0)
                part_key = content.part.key if content.part is not None else ""
                part_in_stock = in_stock.get(part_key, 0)
                available = max(part_in_stock - part_reserved, 0)
                shortfall = max(total_required - available, 0)

                content.total_required = total_required
                content.in_stock = part_in_stock
                content.reserved = part_reserved
                content.available = available
                content.shortfall = shortfall

            kit.contents[:] = sorted(
                contents,
                key=lambda content: (
                    content.part.key if content.part else "",
                    content.id or 0,
                ),
            )

        kit.shopping_list_links[:] = sorted(
            kit.shopping_list_links,
            key=lambda link: (
                link.created_at or datetime.min,
                link.id or 0,
            ),
        )
        for link in kit.shopping_list_links:
            if link.shopping_list is not None:
                link.shopping_list_name = link.shopping_list.name
                link.shopping_list_status = link.shopping_list.status
                link.status = link.shopping_list.status
            else:
                link.shopping_list_name = ""
                link.shopping_list_status = ShoppingListStatus.CONCEPT
                link.status = ShoppingListStatus.CONCEPT
        kit.pick_lists[:] = sorted(
            kit.pick_lists,
            key=lambda pick_list: (
                pick_list.created_at or datetime.min,
                pick_list.id or 0,
            ),
        )

        self._record_detail_metric(kit.id)
        return kit

    def get_active_kit_for_flow(self, kit_id: int, *, operation: str) -> Kit:
        """Ensure kit exists and is active before proceeding with workflow."""
        kit = self.db.get(Kit, kit_id)
        if kit is None:
            raise RecordNotFoundException("Kit", kit_id)
        self._ensure_active_kit(kit, operation)
        return kit

    def create_content(
        self,
        kit_id: int,
        *,
        part_id: int,
        required_per_unit: int,
        note: str | None = None,
    ) -> KitContent:
        """Create a new bill-of-material entry for a kit."""
        kit = self._get_kit_for_update(kit_id)
        self._ensure_active_kit(kit, "create kit content")

        part = self.db.get(Part, part_id)
        if part is None:
            raise RecordNotFoundException("Part", part_id)

        if required_per_unit < 1:
            raise InvalidOperationException(
                "create kit content",
                "required quantity must be at least 1",
            )

        content = KitContent(
            kit=kit,
            part=part,
            required_per_unit=required_per_unit,
            note=note,
        )
        self.db.add(content)

        try:
            self.db.flush()
        except IntegrityError as exc:
            self.db.rollback()
            raise ResourceConflictException(
                "kit content",
                f"kit {kit_id} already includes part {part_id}",
            ) from exc

        self._touch_kit(kit)
        try:
            self.db.flush()
        except IntegrityError as exc:
            self.db.rollback()
            raise ResourceConflictException(
                "kit content",
                f"kit {kit_id} already includes part {part_id}",
            ) from exc
        self._record_content_created(kit.id, part.id, required_per_unit)
        return content

    def update_content(
        self,
        kit_id: int,
        content_id: int,
        *,
        version: int,
        required_per_unit: int | None = None,
        note: str | None = None,
        note_provided: bool = False,
    ) -> KitContent:
        """Update an existing kit content row using optimistic locking."""
        kit = self._get_kit_for_update(kit_id)
        self._ensure_active_kit(kit, "update kit content")

        content = self._load_content_for_update(kit_id, content_id)

        if version < 1:
            raise InvalidOperationException(
                "update kit content",
                "version must be at least 1",
            )

        if content.version != version:
            raise ResourceConflictException(
                "kit content",
                "the row was updated by another request",
            )

        applied_change = False

        if required_per_unit is not None:
            if required_per_unit < 1:
                raise InvalidOperationException(
                    "update kit content",
                    "required quantity must be at least 1",
                )
            if content.required_per_unit != required_per_unit:
                content.required_per_unit = required_per_unit
                applied_change = True

        if note_provided and content.note != note:
            content.note = note
            applied_change = True

        if not applied_change:
            raise InvalidOperationException(
                "update kit content",
                "no changes were provided",
            )

        self._touch_kit(kit)
        start = perf_counter()
        try:
            self.db.flush()
        except StaleDataError as exc:
            self.db.rollback()
            raise ResourceConflictException(
                "kit content",
                "the row was updated by another request",
            ) from exc
        except IntegrityError as exc:
            self.db.rollback()
            raise ResourceConflictException(
                "kit content",
                f"kit {kit_id} already includes part {content.part_id}",
            ) from exc

        duration = perf_counter() - start
        self._record_content_updated(kit.id, content.part_id, duration)
        return content

    def delete_content(
        self,
        kit_id: int,
        content_id: int,
    ) -> None:
        """Delete an existing kit content entry."""
        kit = self._get_kit_for_update(kit_id)
        self._ensure_active_kit(kit, "delete kit content")

        content = self._load_content_for_update(kit_id, content_id)
        part_id = content.part_id

        self.db.delete(content)
        self._touch_kit(kit)
        try:
            self.db.flush()
        except IntegrityError as exc:
            self.db.rollback()
            raise InvalidOperationException(
                "delete kit content",
                "database rejected removal",
            ) from exc

        self._record_content_deleted(kit.id, part_id)

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

    def _ensure_active_kit(self, kit: Kit, operation: str) -> None:
        """Ensure the kit is active before permitting modifications."""
        if kit.status == KitStatus.ARCHIVED:
            raise InvalidOperationException(operation, "kit is archived")

    def _load_content_for_update(
        self,
        kit_id: int,
        content_id: int,
    ) -> KitContent:
        """Load a kit content row scoped to a kit."""
        stmt = (
            select(KitContent)
            .options(selectinload(KitContent.part))
            .where(
                KitContent.kit_id == kit_id,
                KitContent.id == content_id,
            )
        )
        content = self.db.execute(stmt).scalar_one_or_none()
        if content is None:
            raise RecordNotFoundException("Kit content", content_id)
        return content

    def _record_detail_metric(self, kit_id: int) -> None:
        if self.metrics_service is None:
            return
        try:
            self.metrics_service.record_kit_detail_view(kit_id)
        except Exception:
            pass

    def _record_content_created(
        self,
        kit_id: int,
        part_id: int,
        required_per_unit: int,
    ) -> None:
        if self.metrics_service is None:
            return
        try:
            self.metrics_service.record_kit_content_created(
                kit_id,
                part_id,
                required_per_unit,
            )
        except Exception:
            pass

    def _record_content_updated(
        self,
        kit_id: int,
        part_id: int,
        duration_seconds: float,
    ) -> None:
        if self.metrics_service is None:
            return
        try:
            self.metrics_service.record_kit_content_updated(
                kit_id,
                part_id,
                duration_seconds,
            )
        except Exception:
            pass

    def _record_content_deleted(
        self,
        kit_id: int,
        part_id: int,
    ) -> None:
        if self.metrics_service is None:
            return
        try:
            self.metrics_service.record_kit_content_deleted(
                kit_id,
                part_id,
            )
        except Exception:
            pass

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
