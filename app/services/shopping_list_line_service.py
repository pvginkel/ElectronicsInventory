"""Business logic for shopping list line item management."""

from datetime import UTC, datetime
from typing import TYPE_CHECKING

from prometheus_client import Counter
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from app.exceptions import InvalidOperationException, RecordNotFoundException
from app.models.part import Part
from app.models.part_location import PartLocation
from app.models.shopping_list import ShoppingList, ShoppingListStatus
from app.models.shopping_list_line import (
    ShoppingListLine,
    ShoppingListLineStatus,
)
from app.services.seller_service import SellerService

if TYPE_CHECKING:
    from app.services.inventory_service import InventoryService
    from app.services.part_seller_service import PartSellerService

# Shopping list metrics
SHOPPING_LIST_LINES_RECEIVED_TOTAL = Counter(
    "shopping_list_lines_received_total",
    "Total shopping list lines that have received stock",
)
SHOPPING_LIST_RECEIVE_QUANTITY_TOTAL = Counter(
    "shopping_list_receive_quantity_total",
    "Total quantity received via shopping list stock updates",
)


class ShoppingListLineService:
    """Service encapsulating CRUD operations for shopping list lines."""

    def __init__(
        self,
        db: Session,
        seller_service: SellerService,
        inventory_service: "InventoryService",
        part_seller_service: "PartSellerService",
    ) -> None:
        self.db = db
        self.seller_service = seller_service
        self.inventory_service = inventory_service
        self.part_seller_service = part_seller_service

    def add_line(
        self,
        list_id: int,
        part_id: int,
        needed: int,
        *,
        seller_id: int | None = None,
        note: str | None = None,
    ) -> ShoppingListLine:
        """Add a new line to a shopping list with duplicate prevention."""
        shopping_list = self._get_list_for_update(list_id)
        self._ensure_part_exists(part_id)

        if shopping_list.status == ShoppingListStatus.DONE:
            raise InvalidOperationException(
                "add part to shopping list",
                "lines cannot be modified on a list that is marked done",
            )

        if seller_id is not None:
            self.seller_service.get_seller(seller_id)

        if self.check_duplicate(list_id, part_id):
            raise InvalidOperationException(
                "add part to shopping list",
                "this part is already on the list; edit the existing line instead",
            )

        line = ShoppingListLine(
            shopping_list_id=shopping_list.id,
            part_id=part_id,
            seller_id=seller_id,
            needed=needed,
            note=note,
        )
        self.db.add(line)

        self._touch_list(shopping_list)

        try:
            self.db.flush()
        except IntegrityError as exc:
            self.db.rollback()
            raise InvalidOperationException(
                "add part to shopping list",
                "the part could not be added due to a uniqueness constraint",
            ) from exc

        return self._get_line(line.id)

    def add_part_to_active_list(
        self,
        list_id: int,
        part_id: int,
        needed: int,
        *,
        seller_id: int | None = None,
        note: str | None = None,
    ) -> ShoppingListLine:
        """Add a part to an Active shopping list enforcing workflow rules."""
        shopping_list = self._get_list_for_update(list_id)
        if shopping_list.status != ShoppingListStatus.ACTIVE:
            raise InvalidOperationException(
                "add part to active list",
                "parts can only be added via this workflow while the list is in Active status",
            )

        line = self.add_line(
            list_id,
            part_id,
            needed,
            seller_id=seller_id,
            note=note,
        )

        self._touch_list(shopping_list)
        self.db.flush()
        return self._get_line(line.id)

    def merge_line_for_active_list(
        self,
        shopping_list: ShoppingList,
        *,
        part_id: int,
        needed: int,
        provenance_note: str | None = None,
    ) -> ShoppingListLine:
        """Increase needed quantity for existing lines or create new entries.

        This helper is used by kit push flows to ensure Active lists are the only
        append targets while preserving existing notes.
        """
        if needed <= 0:
            raise InvalidOperationException(
                "merge part into active list",
                "needed quantity must be positive",
            )

        if shopping_list.status != ShoppingListStatus.ACTIVE:
            raise InvalidOperationException(
                "merge part into active list",
                "lines can only be merged while the list is in Active status",
            )

        stmt = (
            select(ShoppingListLine)
            .where(
                ShoppingListLine.shopping_list_id == shopping_list.id,
                ShoppingListLine.part_id == part_id,
            )
            .with_for_update()
        )
        existing_line = self.db.execute(stmt).scalar_one_or_none()

        note_to_apply = provenance_note.strip() if provenance_note else None
        if existing_line is not None:
            existing_line.needed += needed
            if note_to_apply:
                if existing_line.note:
                    existing_line.note = f"{existing_line.note}\n{note_to_apply}"
                else:
                    existing_line.note = note_to_apply
            self._touch_list(shopping_list)
            self.db.flush()
            return existing_line

        line = ShoppingListLine(
            shopping_list_id=shopping_list.id,
            part_id=part_id,
            needed=needed,
            note=note_to_apply,
        )
        self.db.add(line)
        self._touch_list(shopping_list)
        self.db.flush()
        return line

    def update_line(
        self,
        line_id: int,
        *,
        seller_id: int | None = None,
        seller_id_provided: bool = False,
        needed: int | None = None,
        note: str | None = None,
        ordered: int | None = None,
    ) -> ShoppingListLine:
        """Update a shopping list line while keeping progress fields read-only."""
        line = self._get_line_for_update(line_id)
        shopping_list = self._get_list_for_update(line.shopping_list_id)

        if shopping_list.status == ShoppingListStatus.DONE:
            raise InvalidOperationException(
                "update shopping list line",
                "lines cannot be modified on a list that is marked done",
            )

        if line.status == ShoppingListLineStatus.DONE:
            raise InvalidOperationException(
                "update shopping list line",
                "completed lines cannot be edited",
            )

        if seller_id_provided and seller_id is not None:
            self.seller_service.get_seller(seller_id)
        if needed is not None and needed < 1:
            raise InvalidOperationException(
                "update shopping list line",
                "needed quantity must be at least 1",
            )

        # Block seller_id changes on ORDERED lines
        if seller_id_provided and line.status == ShoppingListLineStatus.ORDERED:
            if seller_id != line.seller_id:
                raise InvalidOperationException(
                    "update shopping list line",
                    "seller cannot be changed on an ordered line",
                )

        # Block ordered field changes on non-NEW lines
        if ordered is not None and line.status != ShoppingListLineStatus.NEW:
            raise InvalidOperationException(
                "update shopping list line",
                "ordered quantity can only be set while the line is NEW",
            )

        changed = False
        if needed is not None:
            if line.status != ShoppingListLineStatus.NEW:
                raise InvalidOperationException(
                    "update shopping list line",
                    "needed quantity can only change while the line is NEW",
                )
            if line.needed != needed:
                changed = True
            line.needed = needed
        if seller_id_provided:
            if line.seller_id != seller_id:
                changed = True
            line.seller_id = seller_id
        if note is not None:
            if line.note != note:
                changed = True
            line.note = note
        if ordered is not None:
            if ordered < 0:
                raise InvalidOperationException(
                    "update shopping list line",
                    "ordered quantity must be zero or greater",
                )
            if line.ordered != ordered:
                changed = True
            line.ordered = ordered

        if changed:
            self._touch_list(shopping_list)

        try:
            self.db.flush()
        except IntegrityError as exc:
            self.db.rollback()
            raise InvalidOperationException(
                "update shopping list line",
                "update would violate list uniqueness constraints",
            ) from exc

        return self._get_line(line.id)

    def delete_line(self, line_id: int) -> None:
        """Remove a shopping list line from its list."""
        line = self._get_line_for_update(line_id)
        shopping_list = self._get_list_for_update(line.shopping_list_id)

        if shopping_list.status == ShoppingListStatus.DONE:
            raise InvalidOperationException(
                "delete shopping list line",
                "lines cannot be modified on a list that is marked done",
            )

        self.db.delete(line)
        self._touch_list(shopping_list)
        self.db.flush()

    def list_lines(self, list_id: int, include_done: bool = True) -> list[ShoppingListLine]:
        """List all lines for a shopping list with optional filtering of completed items."""
        self._ensure_list_exists(list_id)

        stmt = (
            select(ShoppingListLine)
            .options(
                selectinload(ShoppingListLine.part),
                selectinload(ShoppingListLine.seller),
                selectinload(ShoppingListLine.shopping_list),
            )
            .where(ShoppingListLine.shopping_list_id == list_id)
            .order_by(ShoppingListLine.created_at.asc())
        )
        if not include_done:
            stmt = stmt.where(ShoppingListLine.status != ShoppingListLineStatus.DONE)

        lines = list(self.db.execute(stmt).scalars().all())
        self._enrich_seller_links(lines)
        return lines

    def receive_line_stock(
        self,
        line_id: int,
        receive_qty: int,
        allocations: list[dict[str, int]],
    ) -> ShoppingListLine:
        """Apply received stock to an ordered shopping list line."""

        if receive_qty < 1:
            raise InvalidOperationException(
                "receive shopping list line stock",
                "receive quantity must be at least 1",
            )
        if not allocations:
            raise InvalidOperationException(
                "receive shopping list line stock",
                "at least one location allocation is required",
            )

        seen_locations: set[tuple[int, int]] = set()
        allocation_map: dict[tuple[int, int], int] = {}
        allocation_total = 0
        for entry in allocations:
            box_no = entry.get("box_no")
            loc_no = entry.get("loc_no")
            qty = entry.get("qty")

            if box_no is None or loc_no is None or qty is None:
                raise InvalidOperationException(
                    "receive shopping list line stock",
                    "allocations must include box_no, loc_no, and qty",
                )
            if qty < 1:
                raise InvalidOperationException(
                    "receive shopping list line stock",
                    "allocation quantities must be at least 1",
                )

            location_key = (box_no, loc_no)
            if location_key in seen_locations:
                raise InvalidOperationException(
                    "receive shopping list line stock",
                    "each location may only appear once per receipt",
                )
            seen_locations.add(location_key)
            allocation_map[location_key] = qty
            allocation_total += qty

        if allocation_total != receive_qty:
            raise InvalidOperationException(
                "receive shopping list line stock",
                "allocation quantities must sum to the receive quantity",
            )

        line = self._get_line_for_update(line_id)
        shopping_list = self._get_list_for_update(line.shopping_list_id)

        if shopping_list.status == ShoppingListStatus.DONE:
            raise InvalidOperationException(
                "receive shopping list line stock",
                "cannot receive stock for lines on a completed list",
            )
        if not line.can_receive:
            raise InvalidOperationException(
                "receive shopping list line stock",
                "line is not receivable (must be ordered and assigned to a seller)",
            )

        part = self.db.execute(
            select(Part).where(Part.id == line.part_id)
        ).scalar_one_or_none()
        if part is None:
            raise RecordNotFoundException("Part", line.part_id)

        for (box_no, loc_no), qty in allocation_map.items():
            self.inventory_service.add_stock(part.key, box_no, loc_no, qty)

        line.received += receive_qty
        self._touch_list(shopping_list)
        self.db.flush()

        SHOPPING_LIST_LINES_RECEIVED_TOTAL.inc(1)
        SHOPPING_LIST_RECEIVE_QUANTITY_TOTAL.inc(receive_qty)

        return self._get_line(line.id)

    def complete_line(
        self,
        line_id: int,
        *,
        mismatch_reason: str | None = None,
    ) -> ShoppingListLine:
        """Mark an ordered line as completed, optionally recording a mismatch note."""

        line = self._get_line_for_update(line_id)
        shopping_list = self._get_list_for_update(line.shopping_list_id)

        if shopping_list.status == ShoppingListStatus.DONE:
            raise InvalidOperationException(
                "complete shopping list line",
                "cannot modify lines on a completed list",
            )
        if line.status != ShoppingListLineStatus.ORDERED:
            raise InvalidOperationException(
                "complete shopping list line",
                "only ordered lines can be marked as done",
            )

        mismatch_required = line.received != line.ordered
        note_value = (mismatch_reason or "").strip()
        if mismatch_required and not note_value:
            raise InvalidOperationException(
                "complete shopping list line",
                "mismatch reason is required when quantities differ",
            )

        line.status = ShoppingListLineStatus.DONE
        line.completed_at = datetime.now(UTC)
        line.completion_mismatch = mismatch_required
        line.completion_note = note_value if note_value else None

        self._touch_list(shopping_list)
        self.db.flush()

        return self._get_line(line.id)

    def check_duplicate(self, list_id: int, part_id: int) -> bool:
        """Return whether the given part already exists on the shopping list."""
        stmt = (
            select(ShoppingListLine.id)
            .where(
                ShoppingListLine.shopping_list_id == list_id,
                ShoppingListLine.part_id == part_id,
            )
            .limit(1)
        )
        return self.db.execute(stmt).scalar_one_or_none() is not None

    def _enrich_seller_links(self, lines: list[ShoppingListLine]) -> None:
        """Attach seller_link URLs as transient attributes on each line.

        Collects (part_id, seller_id) pairs from lines that have a seller,
        batch-fetches URLs from the part_sellers table, and sets
        ``line.seller_link`` on every line (None when no link exists).
        """
        pairs: list[tuple[int, int]] = [
            (line.part_id, line.seller_id)
            for line in lines
            if line.seller_id is not None
        ]

        link_map = self.part_seller_service.bulk_get_seller_links(pairs)

        for line in lines:
            if line.seller_id is not None:
                line.seller_link = link_map.get((line.part_id, line.seller_id))
            else:
                line.seller_link = None

    def _get_line(self, line_id: int) -> ShoppingListLine:
        """Fetch a line with relationships for response payloads."""
        stmt = (
            select(ShoppingListLine)
            .options(
                selectinload(ShoppingListLine.part)
                .selectinload(Part.part_locations)
                .selectinload(PartLocation.location),
                selectinload(ShoppingListLine.seller),
                selectinload(ShoppingListLine.shopping_list),
            )
            .where(ShoppingListLine.id == line_id)
        )
        line = self.db.execute(stmt).scalar_one_or_none()
        if not line:
            raise RecordNotFoundException("Shopping list line", line_id)
        self.db.refresh(line, attribute_names=["seller"])
        self._enrich_seller_links([line])
        return line

    def _get_line_for_update(self, line_id: int) -> ShoppingListLine:
        """Fetch a line without eager loading for mutation."""
        stmt = select(ShoppingListLine).where(ShoppingListLine.id == line_id)
        line = self.db.execute(stmt).scalar_one_or_none()
        if not line:
            raise RecordNotFoundException("Shopping list line", line_id)
        return line

    def _get_list_for_update(self, list_id: int) -> ShoppingList:
        """Fetch parent shopping list for validation."""
        stmt = select(ShoppingList).where(ShoppingList.id == list_id)
        shopping_list = self.db.execute(stmt).scalar_one_or_none()
        if not shopping_list:
            raise RecordNotFoundException("Shopping list", list_id)
        return shopping_list

    def _ensure_list_exists(self, list_id: int) -> None:
        """Raise if the shopping list does not exist."""
        stmt = select(ShoppingList.id).where(ShoppingList.id == list_id)
        if self.db.execute(stmt).scalar_one_or_none() is None:
            raise RecordNotFoundException("Shopping list", list_id)

    def _ensure_part_exists(self, part_id: int) -> None:
        """Raise if the part referenced by ID does not exist."""
        stmt = select(Part.id).where(Part.id == part_id)
        if self.db.execute(stmt).scalar_one_or_none() is None:
            raise RecordNotFoundException("Part", part_id)

    def _touch_list(self, shopping_list: ShoppingList) -> None:
        """Update parent shopping list timestamp when related lines change."""
        shopping_list.updated_at = datetime.now(UTC)
