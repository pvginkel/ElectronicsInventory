"""Business logic for kit lifecycle management and overview queries."""

from __future__ import annotations

from collections.abc import Sequence
from datetime import UTC, datetime
from time import perf_counter
from typing import Any

from prometheus_client import Counter, Gauge, Histogram
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
from app.services.inventory_service import InventoryService
from app.services.kit_reservation_service import KitReservationService

# Kit lifecycle metrics
KITS_CREATED_TOTAL = Counter("kits_created_total", "Total kits created")
KITS_ARCHIVED_TOTAL = Counter("kits_archived_total", "Total kits archived")
KITS_UNARCHIVED_TOTAL = Counter(
    "kits_unarchived_total", "Total kits restored from archive"
)
KITS_OVERVIEW_REQUESTS_TOTAL = Counter(
    "kits_overview_requests_total",
    "Total kit overview requests",
    ["status"],
)
KITS_ACTIVE_COUNT = Gauge("kits_active_count", "Current count of active kits")
KITS_ARCHIVED_COUNT = Gauge(
    "kits_archived_count", "Current count of archived kits"
)
KIT_DETAIL_VIEWS_TOTAL = Counter(
    "kit_detail_views_total", "Total kit detail view requests"
)
KIT_CONTENT_MUTATIONS_TOTAL = Counter(
    "kit_content_mutations_total",
    "Total kit content mutations grouped by action",
    ["action"],
)
KIT_CONTENT_UPDATE_DURATION_SECONDS = Histogram(
    "kit_content_update_duration_seconds",
    "Duration of kit content update operations in seconds",
)

MAX_BULK_KIT_QUERY = 100


class KitService:
    """Service encapsulating kit overview operations and lifecycle rules."""

    def __init__(
        self,
        db: Session,
        inventory_service: InventoryService | None = None,
        kit_reservation_service: KitReservationService | None = None,
        attachment_set_service: Any = None,
    ):
        """Initialize service with database session and dependencies."""
        self.db = db
        if inventory_service is None:
            raise ValueError("inventory_service dependency is required")
        if kit_reservation_service is None:
            raise ValueError("kit_reservation_service dependency is required")
        if attachment_set_service is None:
            raise ValueError("attachment_set_service dependency is required")

        self.inventory_service = inventory_service
        self.kit_reservation_service = kit_reservation_service
        self.attachment_set_service = attachment_set_service

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

        # Record overview metrics
        KITS_OVERVIEW_REQUESTS_TOTAL.labels(status=status.value).inc()
        if limit is None:
            if status == KitStatus.ACTIVE:
                KITS_ACTIVE_COUNT.set(len(kits))
            elif status == KitStatus.ARCHIVED:
                KITS_ARCHIVED_COUNT.set(len(kits))
        return kits

    def resolve_kits_for_bulk(
        self,
        kit_ids: Sequence[int],
        *,
        limit: int = MAX_BULK_KIT_QUERY,
    ) -> list[Kit]:
        """Resolve kits for bulk membership queries while preserving order."""
        ordered_ids = list(kit_ids)

        if not ordered_ids:
            return []

        if len(ordered_ids) > limit:
            raise InvalidOperationException(
                "kit bulk membership query",
                f"cannot request more than {limit} kits at once",
            )

        if len(set(ordered_ids)) != len(ordered_ids):
            raise InvalidOperationException(
                "kit bulk membership query",
                "kit_ids must not contain duplicate values",
            )

        stmt = select(Kit).where(Kit.id.in_(ordered_ids))
        rows = self.db.execute(stmt).scalars().all()
        kits_by_id: dict[int, Kit] = {kit.id: kit for kit in rows}

        missing = [kit_id for kit_id in ordered_ids if kit_id not in kits_by_id]
        if missing:
            raise RecordNotFoundException("Kit", missing[0])

        return [kits_by_id[kit_id] for kit_id in ordered_ids]

    def get_kit_detail(self, kit_id: int) -> Kit:
        """Return kit with contents and computed availability details."""
        stmt = (
            select(Kit)
            .options(
                selectinload(Kit.contents).selectinload(KitContent.part),
                selectinload(Kit.shopping_list_links).selectinload(
                    KitShoppingListLink.shopping_list
                ),
                selectinload(Kit.pick_lists).selectinload(KitPickList.lines),
            )
            .where(Kit.id == kit_id)
        )
        kit = self.db.execute(stmt).unique().scalar_one_or_none()
        if kit is None:
            raise RecordNotFoundException("Kit", kit_id)

        contents = list(kit.contents)
        if contents:
            part_ids = [content.part_id for content in contents]
            reservations_by_part = (
                self.kit_reservation_service.get_reservations_by_part_ids(
                    part_ids,
                )
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
                peer_reservations = [
                    entry
                    for entry in reservations_by_part.get(content.part_id, [])
                    if entry.kit_id != kit.id
                ]
                part_reserved = sum(
                    entry.reserved_quantity for entry in peer_reservations
                )
                part_key = content.part.key if content.part is not None else ""
                part_in_stock = in_stock.get(part_key, 0)
                available = max(part_in_stock - part_reserved, 0)
                shortfall = max(total_required - available, 0)

                content.total_required = total_required
                content.in_stock = part_in_stock
                content.reserved = part_reserved
                content.available = available
                content.shortfall = shortfall
                content.active_reservations = peer_reservations

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
        kit.pick_list_badge_count = sum(
            1 for pick_list in kit.pick_lists if not pick_list.is_completed
        )

        KIT_DETAIL_VIEWS_TOTAL.inc()
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
        KIT_CONTENT_MUTATIONS_TOTAL.labels(action="create").inc()
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
        KIT_CONTENT_MUTATIONS_TOTAL.labels(action="update").inc()
        KIT_CONTENT_UPDATE_DURATION_SECONDS.observe(max(duration, 0.0))
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

        KIT_CONTENT_MUTATIONS_TOTAL.labels(action="delete").inc()

    def create_kit(
        self,
        *,
        name: str,
        description: str | None = None,
        build_target: int = 1,
    ) -> Kit:
        """Create a new kit in active status with attachment set.

        Every kit gets an AttachmentSet created during kit creation to
        enforce the invariant that all kits have an attachment set.
        """
        if build_target < 0:
            raise InvalidOperationException(
                "create kit",
                "build target cannot be negative",
            )

        # Create attachment set first (eager creation)
        attachment_set = self.attachment_set_service.create_attachment_set()
        attachment_set_id = attachment_set.id

        kit = Kit(
            name=name,
            description=description,
            build_target=build_target,
            attachment_set_id=attachment_set_id,
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
        KITS_CREATED_TOTAL.inc()
        KITS_ACTIVE_COUNT.inc()
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
            if build_target < 0:
                raise InvalidOperationException(
                    "update kit",
                    "build target cannot be negative",
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
        KITS_ARCHIVED_TOTAL.inc()
        KITS_ACTIVE_COUNT.dec()
        KITS_ARCHIVED_COUNT.inc()
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
        KITS_UNARCHIVED_TOTAL.inc()
        KITS_ARCHIVED_COUNT.dec()
        KITS_ACTIVE_COUNT.inc()
        return kit

    def delete_kit(self, kit_id: int) -> None:
        """Delete a kit and cascade to all child records."""
        kit = self.db.get(Kit, kit_id)
        if kit is None:
            raise RecordNotFoundException("Kit", kit_id)

        self.db.delete(kit)
        self.db.flush()

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

    @staticmethod
    def _shopping_badge_statuses() -> Sequence[ShoppingListStatus]:
        """Statuses that count towards the shopping list badge."""
        return (
            ShoppingListStatus.CONCEPT,
            ShoppingListStatus.READY,
        )
