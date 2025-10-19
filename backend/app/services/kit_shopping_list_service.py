"""Business logic for linking kits to shopping lists."""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from time import perf_counter

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.exceptions import InvalidOperationException, RecordNotFoundException
from app.models.kit import Kit, KitStatus
from app.models.kit_content import KitContent
from app.models.kit_shopping_list_link import KitShoppingListLink
from app.models.shopping_list import ShoppingList, ShoppingListStatus
from app.services.base import BaseService
from app.services.inventory_service import InventoryService
from app.services.kit_reservation_service import KitReservationService
from app.services.metrics_service import MetricsServiceProtocol
from app.services.shopping_list_line_service import ShoppingListLineService
from app.services.shopping_list_service import ShoppingListService


@dataclass(slots=True)
class KitShoppingListOperationResult:
    """Structured result for create-or-append operations."""

    link: KitShoppingListLink | None
    shopping_list: ShoppingList | None
    created_new_list: bool
    lines_modified: int
    total_needed_quantity: int
    noop: bool


@dataclass(slots=True)
class _NeededEntry:
    """Internal representation of a calculated required quantity."""

    content: KitContent
    needed: int
    provenance_note: str | None


class KitShoppingListService(BaseService):
    """Service encapsulating kit-to-shopping-list linkage workflows."""

    def __init__(
        self,
        db: Session,
        inventory_service: InventoryService,
        kit_reservation_service: KitReservationService,
        shopping_list_service: ShoppingListService,
        shopping_list_line_service: ShoppingListLineService,
        metrics_service: MetricsServiceProtocol | None = None,
    ) -> None:
        super().__init__(db)
        self.inventory_service = inventory_service
        self.kit_reservation_service = kit_reservation_service
        self.shopping_list_service = shopping_list_service
        self.shopping_list_line_service = shopping_list_line_service
        self.metrics_service = metrics_service

    def create_or_append_list(
        self,
        kit_id: int,
        *,
        units: int | None = None,
        honor_reserved: bool,
        shopping_list_id: int | None = None,
        note_prefix: str | None = None,
        new_list_name: str | None = None,
        new_list_description: str | None = None,
    ) -> KitShoppingListOperationResult:
        """Push kit contents to a shopping list, creating one when requested.

        Returns a structured result describing the linkage and affected list.
        """
        timer_start = perf_counter()
        try:
            result = self._create_or_append_list(
                kit_id,
                units=units,
                honor_reserved=honor_reserved,
                shopping_list_id=shopping_list_id,
                note_prefix=note_prefix,
                new_list_name=new_list_name,
                new_list_description=new_list_description,
            )
        except Exception:
            if self.metrics_service is not None:
                self.metrics_service.record_kit_shopping_list_push(
                    outcome="error",
                    honor_reserved=honor_reserved,
                    duration_seconds=perf_counter() - timer_start,
                )
            raise

        if self.metrics_service is not None:
            outcome = "noop" if result.noop else "success"
            self.metrics_service.record_kit_shopping_list_push(
                outcome=outcome,
                honor_reserved=honor_reserved,
                duration_seconds=perf_counter() - timer_start,
            )
        return result

    def list_links_for_kit(self, kit_id: int) -> list[KitShoppingListLink]:
        """Return shopping list links for the specified kit ordered by recency."""
        self._ensure_kit_exists(kit_id)
        stmt = (
            select(KitShoppingListLink)
            .options(
                selectinload(KitShoppingListLink.shopping_list),
                selectinload(KitShoppingListLink.kit),
            )
            .where(KitShoppingListLink.kit_id == kit_id)
            .order_by(
                KitShoppingListLink.created_at.desc(),
                KitShoppingListLink.id.desc(),
            )
        )
        links = list(self.db.execute(stmt).scalars().all())
        for link in links:
            self._hydrate_link_metadata(link)
        return links

    def list_links_for_kits_bulk(
        self,
        kit_ids: Sequence[int],
        *,
        include_done: bool = False,
    ) -> dict[int, list[KitShoppingListLink]]:
        """Return shopping list links grouped by kit according to input order."""
        if not kit_ids:
            return {}

        ordered_ids = list(kit_ids)
        stmt = (
            select(KitShoppingListLink)
            .options(
                selectinload(KitShoppingListLink.shopping_list),
                selectinload(KitShoppingListLink.kit),
            )
            .where(KitShoppingListLink.kit_id.in_(ordered_ids))
        )

        if not include_done:
            stmt = stmt.join(
                ShoppingList,
                ShoppingList.id == KitShoppingListLink.shopping_list_id,
            ).where(ShoppingList.status != ShoppingListStatus.DONE)

        stmt = stmt.order_by(
            KitShoppingListLink.created_at.desc(),
            KitShoppingListLink.id.desc(),
        )

        grouped: dict[int, list[KitShoppingListLink]] = {
            kit_id: [] for kit_id in ordered_ids
        }

        for link in self.db.execute(stmt).scalars().all():
            self._hydrate_link_metadata(link)
            grouped.setdefault(link.kit_id, []).append(link)

        for kit_id in ordered_ids:
            grouped.setdefault(kit_id, [])

        return grouped

    def list_kits_for_shopping_list(self, list_id: int) -> list[KitShoppingListLink]:
        """Return reciprocal kit chips for the provided shopping list."""
        self._ensure_shopping_list_exists(list_id)
        stmt = (
            select(KitShoppingListLink)
            .options(
                selectinload(KitShoppingListLink.kit),
                selectinload(KitShoppingListLink.shopping_list),
            )
            .where(KitShoppingListLink.shopping_list_id == list_id)
            .order_by(
                KitShoppingListLink.created_at.desc(),
                KitShoppingListLink.id.desc(),
            )
        )
        links = list(self.db.execute(stmt).scalars().all())
        for link in links:
            self._hydrate_link_metadata(link)
        return links

    def unlink(self, link_id: int) -> None:
        """Remove a kit-shopping-list link without touching list contents."""
        metrics_service = self.metrics_service

        link = self._load_link_for_update(link_id)
        if link is None:
            if metrics_service is not None:
                metrics_service.record_kit_shopping_list_unlink("not_found")
            raise RecordNotFoundException("Kit shopping list link", link_id)

        self.db.delete(link)
        self.db.flush()

        if metrics_service is not None:
            metrics_service.record_kit_shopping_list_unlink("success")

    # Internal helpers -----------------------------------------------------------------

    def _create_or_append_list(
        self,
        kit_id: int,
        *,
        units: int | None,
        honor_reserved: bool,
        shopping_list_id: int | None,
        note_prefix: str | None,
        new_list_name: str | None,
        new_list_description: str | None,
    ) -> KitShoppingListOperationResult:
        kit = self._load_active_kit(kit_id)
        requested_units = units if units is not None else kit.build_target
        if requested_units < 1:
            raise InvalidOperationException(
                "push kit to shopping list",
                "requested units must be at least 1",
            )

        needed_entries = self._calculate_needed_entries(
            kit,
            requested_units=requested_units,
            honor_reserved=honor_reserved,
            note_prefix=note_prefix,
        )

        if not needed_entries:
            return KitShoppingListOperationResult(
                link=None,
                shopping_list=None,
                created_new_list=False,
                lines_modified=0,
                total_needed_quantity=0,
                noop=True,
            )

        if shopping_list_id is not None:
            shopping_list = self.shopping_list_service.get_concept_list_for_append(
                shopping_list_id
            )
            created_new_list = False
        else:
            if not new_list_name:
                raise InvalidOperationException(
                    "create kit shopping list",
                    "new shopping list name is required when shopping_list_id is not provided",
                )
            shopping_list = self.shopping_list_service.create_list(
                new_list_name,
                new_list_description,
            )
            created_new_list = True

        total_needed = 0
        for entry in needed_entries:
            self.shopping_list_line_service.merge_line_for_concept_list(
                shopping_list,
                part_id=entry.content.part_id,
                needed=entry.needed,
                provenance_note=entry.provenance_note,
            )
            total_needed += entry.needed

        link = self._upsert_link(
            kit,
            shopping_list,
            requested_units=requested_units,
            honor_reserved=honor_reserved,
        )

        refreshed_list = self.shopping_list_service.get_list(shopping_list.id)
        hydrated_link = self._load_link(link.id)

        return KitShoppingListOperationResult(
            link=hydrated_link,
            shopping_list=refreshed_list,
            created_new_list=created_new_list,
            lines_modified=len(needed_entries),
            total_needed_quantity=total_needed,
            noop=False,
        )

    def _load_active_kit(self, kit_id: int) -> Kit:
        stmt = (
            select(Kit)
            .options(
                selectinload(Kit.contents).selectinload(KitContent.part),
                selectinload(Kit.shopping_list_links),
            )
            .where(Kit.id == kit_id)
        )
        kit = self.db.execute(stmt).unique().scalar_one_or_none()
        if kit is None:
            raise RecordNotFoundException("Kit", kit_id)
        if kit.status == KitStatus.ARCHIVED:
            raise InvalidOperationException(
                "push kit to shopping list",
                "archived kits cannot push to shopping lists",
            )
        return kit

    def _calculate_needed_entries(
        self,
        kit: Kit,
        *,
        requested_units: int,
        honor_reserved: bool,
        note_prefix: str | None,
    ) -> list[_NeededEntry]:
        part_ids = [
            content.part_id
            for content in kit.contents
            if content.part_id is not None
        ]
        part_keys = [
            content.part.key
            for content in kit.contents
            if content.part is not None
        ]

        reservations_by_part = (
            self.kit_reservation_service.get_reservations_by_part_ids(part_ids)
        )
        reserved_totals: dict[int, int] = {}
        for part_id in part_ids:
            reserved_totals[part_id] = sum(
                entry.reserved_quantity
                for entry in reservations_by_part.get(part_id, [])
                if entry.kit_id != kit.id
            )
        in_stock_totals = self.inventory_service.get_total_quantities_by_part_keys(
            part_keys
        )

        prefix = note_prefix.strip() if note_prefix else ""
        entries: list[_NeededEntry] = []
        for content in kit.contents:
            if content.part is None:
                continue

            base_required = content.required_per_unit * requested_units
            available = in_stock_totals.get(content.part.key, 0)
            if honor_reserved:
                available = max(
                    available - reserved_totals.get(content.part_id, 0),
                    0,
                )
            needed = max(base_required - available, 0)
            if needed == 0:
                continue

            note_body = (content.note or "").strip()
            if not note_body and prefix:
                note_body = prefix

            provenance_note = (
                f"[From Kit {kit.name}]: {note_body}" if note_body else None
            )
            entries.append(
                _NeededEntry(
                    content=content,
                    needed=needed,
                    provenance_note=provenance_note,
                )
            )

        return entries

    def _upsert_link(
        self,
        kit: Kit,
        shopping_list: ShoppingList,
        *,
        requested_units: int,
        honor_reserved: bool,
    ) -> KitShoppingListLink:
        stmt = (
            select(KitShoppingListLink)
            .where(
                KitShoppingListLink.kit_id == kit.id,
                KitShoppingListLink.shopping_list_id == shopping_list.id,
            )
            .with_for_update()
        )
        link = self.db.execute(stmt).scalar_one_or_none()
        if link is None:
            link = KitShoppingListLink(
                kit_id=kit.id,
                shopping_list_id=shopping_list.id,
                requested_units=requested_units,
                honor_reserved=honor_reserved,
                snapshot_kit_updated_at=kit.updated_at,
            )
            self.db.add(link)
        else:
            link.requested_units = requested_units
            link.honor_reserved = honor_reserved
            link.snapshot_kit_updated_at = kit.updated_at
        self.db.flush()
        return link

    def _load_link(self, link_id: int) -> KitShoppingListLink:
        stmt = (
            select(KitShoppingListLink)
            .options(
                selectinload(KitShoppingListLink.shopping_list),
                selectinload(KitShoppingListLink.kit),
            )
            .where(KitShoppingListLink.id == link_id)
        )
        link = self.db.execute(stmt).scalar_one_or_none()
        if link is None:
            raise RecordNotFoundException("Kit shopping list link", link_id)
        self._hydrate_link_metadata(link)
        return link

    def _load_link_for_update(self, link_id: int) -> KitShoppingListLink | None:
        stmt = (
            select(KitShoppingListLink)
            .where(KitShoppingListLink.id == link_id)
            .with_for_update()
        )
        return self.db.execute(stmt).scalar_one_or_none()

    def _ensure_kit_exists(self, kit_id: int) -> None:
        stmt = select(Kit.id).where(Kit.id == kit_id)
        if self.db.execute(stmt).scalar_one_or_none() is None:
            raise RecordNotFoundException("Kit", kit_id)

    def _ensure_shopping_list_exists(self, list_id: int) -> None:
        stmt = select(ShoppingList.id).where(ShoppingList.id == list_id)
        if self.db.execute(stmt).scalar_one_or_none() is None:
            raise RecordNotFoundException("Shopping list", list_id)

    def _hydrate_link_metadata(self, link: KitShoppingListLink) -> None:
        """Attach denormalized attributes used by response schemas."""
        shopping_list = getattr(link, "shopping_list", None)
        if shopping_list is not None:
            link.shopping_list_name = shopping_list.name
            link.shopping_list_status = shopping_list.status
            link.status = shopping_list.status
        else:
            link.shopping_list_name = ""
            link.shopping_list_status = ShoppingListStatus.CONCEPT
            link.status = ShoppingListStatus.CONCEPT

        kit = getattr(link, "kit", None)
        if kit is not None:
            link.kit_name = kit.name
            link.kit_status = kit.status
        else:
            link.kit_name = ""
            link.kit_status = KitStatus.ACTIVE
