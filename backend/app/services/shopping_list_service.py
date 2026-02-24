"""Business logic for shopping list lifecycle management."""

from __future__ import annotations

from collections.abc import Iterable, Sequence
from datetime import UTC, datetime
from typing import TYPE_CHECKING, Any

from prometheus_client import Counter
from sqlalchemy import case, delete, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import selectinload

from app.exceptions import (
    InvalidOperationException,
    RecordNotFoundException,
    ResourceConflictException,
)
from app.models.part import Part
from app.models.part_location import PartLocation
from app.models.seller import Seller
from app.models.shopping_list import ShoppingList, ShoppingListStatus
from app.models.shopping_list_line import ShoppingListLine, ShoppingListLineStatus
from app.models.shopping_list_seller import ShoppingListSeller, ShoppingListSellerStatus

if TYPE_CHECKING:
    from sqlalchemy.orm import Session

    from app.services.part_seller_service import PartSellerService

# Seller group operation metrics
SHOPPING_LIST_SELLER_GROUP_OPERATIONS_TOTAL = Counter(
    "shopping_list_seller_group_operations_total",
    "Total seller group operations on shopping lists",
    ["operation"],
)


class ShoppingListService:
    """Service encapsulating shopping list operations and invariants."""

    def __init__(self, db: Session, part_seller_service: PartSellerService) -> None:
        self.db = db
        self.part_seller_service = part_seller_service

    def create_list(self, name: str, description: str | None = None) -> ShoppingList:
        """Create a new shopping list in active status."""
        shopping_list = ShoppingList(name=name, description=description)
        self.db.add(shopping_list)
        try:
            self.db.flush()
        except IntegrityError as exc:
            self.db.rollback()
            raise ResourceConflictException("shopping list", name) from exc
        return self._attach_line_counts(shopping_list)

    def get_list(self, list_id: int) -> ShoppingList:
        """Retrieve a shopping list with its associated lines."""
        shopping_list = self._load_list_with_lines(list_id)
        shopping_list = self._attach_seller_group_payload(shopping_list)
        return self._attach_line_counts(shopping_list)

    def get_active_list_for_append(self, list_id: int) -> ShoppingList:
        """Fetch a shopping list for append workflows ensuring Active status."""
        stmt = (
            select(ShoppingList)
            .where(ShoppingList.id == list_id)
            .with_for_update()
        )
        shopping_list = self.db.execute(stmt).scalar_one_or_none()
        if shopping_list is None:
            raise RecordNotFoundException("Shopping list", list_id)
        if shopping_list.status != ShoppingListStatus.ACTIVE:
            raise InvalidOperationException(
                "append kit shopping list",
                "shopping list must be in active status to receive kit pushes",
            )
        return shopping_list

    def update_list(
        self,
        list_id: int,
        *,
        name: str | None = None,
        description: str | None = None,
    ) -> ShoppingList:
        """Update shopping list metadata."""
        shopping_list = self._get_list_for_update(list_id)

        if shopping_list.status == ShoppingListStatus.DONE:
            raise InvalidOperationException(
                "update shopping list",
                "lists marked as done cannot be modified",
            )

        if name is not None:
            shopping_list.name = name
        if description is not None:
            shopping_list.description = description

        if name is not None or description is not None:
            self._touch_list(shopping_list)

        try:
            self.db.flush()
        except IntegrityError as exc:
            self.db.rollback()
            raise ResourceConflictException("shopping list", name or shopping_list.name) from exc
        return self._attach_line_counts(shopping_list)

    def delete_list(self, list_id: int) -> None:
        """Delete a shopping list and cascade delete its lines."""
        shopping_list = self._get_list_for_update(list_id)
        self.db.execute(
            delete(ShoppingListLine).where(
                ShoppingListLine.shopping_list_id == shopping_list.id
            )
        )
        self.db.delete(shopping_list)
        self.db.flush()

    def set_list_status(self, list_id: int, status: ShoppingListStatus) -> ShoppingList:
        """Update list workflow status: only active -> done is allowed."""
        shopping_list = self._get_list_for_update(list_id)

        if shopping_list.status == status:
            return self._attach_line_counts(shopping_list)

        if shopping_list.status == ShoppingListStatus.DONE:
            raise InvalidOperationException(
                "change shopping list status",
                "lists marked as done cannot change status",
            )

        if status != ShoppingListStatus.DONE:
            raise InvalidOperationException(
                "change shopping list status",
                f"transition from {shopping_list.status.value} to {status.value} is not allowed",
            )

        # active -> done: no preconditions
        shopping_list.status = status
        self._touch_list(shopping_list)
        self.db.flush()
        refreshed = self._attach_seller_group_payload(
            self._load_list_with_lines(shopping_list.id)
        )
        return self._attach_line_counts(refreshed)

    def list_lists(
        self,
        include_done: bool = False,
        *,
        statuses: Sequence[ShoppingListStatus] | None = None,
    ) -> list[ShoppingList]:
        """Return shopping lists filtered by workflow status with derived counts."""
        stmt = select(ShoppingList).options(
            selectinload(ShoppingList.seller_groups).selectinload(
                ShoppingListSeller.seller
            )
        )
        if not include_done:
            stmt = stmt.where(ShoppingList.status != ShoppingListStatus.DONE)

        if statuses is not None:
            normalized_statuses = tuple(dict.fromkeys(statuses))
            if not normalized_statuses:
                return []
            stmt = stmt.where(ShoppingList.status.in_(normalized_statuses))

        stmt = stmt.order_by(ShoppingList.updated_at.desc(), ShoppingList.id.desc())
        shopping_lists = list(self.db.execute(stmt).scalars().all())
        counts_map = self._counts_for_lists([shopping_list.id for shopping_list in shopping_lists])
        return [
            self._attach_line_counts(shopping_list, counts_map)
            for shopping_list in shopping_lists
        ]

    def get_list_stats(self, list_id: int) -> dict[ShoppingListLineStatus, int]:
        """Return counts of lines by status for the specified list."""
        self._ensure_list_exists(list_id)
        counts_stmt = (
            select(
                func.coalesce(
                    func.sum(
                        case(
                            (ShoppingListLine.status == ShoppingListLineStatus.NEW, 1),
                            else_=0,
                        )
                    ),
                    0,
                ).label("new_count"),
                func.coalesce(
                    func.sum(
                        case(
                            (ShoppingListLine.status == ShoppingListLineStatus.ORDERED, 1),
                            else_=0,
                        )
                    ),
                    0,
                ).label("ordered_count"),
                func.coalesce(
                    func.sum(
                        case(
                            (ShoppingListLine.status == ShoppingListLineStatus.DONE, 1),
                            else_=0,
                        )
                    ),
                    0,
                ).label("done_count"),
            )
            .where(ShoppingListLine.shopping_list_id == list_id)
        )
        result = self.db.execute(counts_stmt).one()
        return {
            ShoppingListLineStatus.NEW: result.new_count or 0,
            ShoppingListLineStatus.ORDERED: result.ordered_count or 0,
            ShoppingListLineStatus.DONE: result.done_count or 0,
        }

    # -- Seller group CRUD --

    def create_seller_group(self, list_id: int, seller_id: int) -> ShoppingListSeller:
        """Create a new seller group on a shopping list."""
        shopping_list = self._get_list_for_update(list_id)
        if shopping_list.status == ShoppingListStatus.DONE:
            raise InvalidOperationException(
                "create seller group",
                "cannot create seller groups on a completed list",
            )

        seller = self.db.get(Seller, seller_id)
        if seller is None:
            raise RecordNotFoundException("Seller", seller_id)

        seller_group = ShoppingListSeller(
            shopping_list_id=list_id,
            seller_id=seller_id,
        )
        self.db.add(seller_group)
        try:
            self.db.flush()
        except IntegrityError as exc:
            self.db.rollback()
            raise ResourceConflictException(
                "seller group",
                f"list={list_id} seller={seller_id}",
            ) from exc

        self._touch_list(shopping_list)
        self.db.flush()

        SHOPPING_LIST_SELLER_GROUP_OPERATIONS_TOTAL.labels(operation="create").inc()
        return self._get_seller_group_with_lines(list_id, seller_id)

    def get_seller_group(self, list_id: int, seller_id: int) -> ShoppingListSeller:
        """Retrieve a seller group with lines and totals."""
        self._ensure_list_exists(list_id)
        return self._get_seller_group_with_lines(list_id, seller_id)

    def update_seller_group(
        self,
        list_id: int,
        seller_id: int,
        *,
        note: str | None = None,
        status: ShoppingListSellerStatus | None = None,
    ) -> ShoppingListSeller:
        """Update a seller group's note and/or status."""
        shopping_list = self._get_list_for_update(list_id)
        if shopping_list.status == ShoppingListStatus.DONE:
            raise InvalidOperationException(
                "update seller group",
                "cannot modify seller groups on a completed list",
            )

        seller_group = self._get_seller_group_row(list_id, seller_id)

        if note is not None:
            seller_group.note = note

        if status is not None and status != seller_group.status:
            if status == ShoppingListSellerStatus.ORDERED:
                self._order_seller_group(shopping_list, seller_group)
            elif status == ShoppingListSellerStatus.ACTIVE:
                self._reopen_seller_group(shopping_list, seller_group)

        self._touch_list(shopping_list)
        self.db.flush()
        return self._get_seller_group_with_lines(list_id, seller_id)

    def delete_seller_group(self, list_id: int, seller_id: int) -> None:
        """Delete a seller group, resetting non-DONE lines to ungrouped."""
        shopping_list = self._get_list_for_update(list_id)
        seller_group = self._get_seller_group_row(list_id, seller_id)

        if seller_group.status == ShoppingListSellerStatus.ORDERED:
            raise InvalidOperationException(
                "delete seller group",
                "ordered groups must be reopened before deletion",
            )

        # Reset non-DONE lines: clear seller assignment, ordered qty, and revert to NEW.
        # DONE lines are left untouched to preserve completion metadata.
        lines = list(
            self.db.execute(
                select(ShoppingListLine).where(
                    ShoppingListLine.shopping_list_id == list_id,
                    ShoppingListLine.seller_id == seller_id,
                )
            ).scalars().all()
        )
        for line in lines:
            if line.status != ShoppingListLineStatus.DONE:
                line.seller_id = None
                line.ordered = 0
                line.status = ShoppingListLineStatus.NEW

        self.db.delete(seller_group)
        self._touch_list(shopping_list)
        self.db.flush()

        SHOPPING_LIST_SELLER_GROUP_OPERATIONS_TOTAL.labels(operation="delete").inc()

    # -- Seller group internal helpers --

    def _order_seller_group(
        self, shopping_list: ShoppingList, seller_group: ShoppingListSeller
    ) -> None:
        """Transition a seller group from active to ordered.

        Precondition: all lines in the group must have ordered > 0.
        Effect: all NEW lines become ORDERED atomically.
        """
        lines = list(
            self.db.execute(
                select(ShoppingListLine).where(
                    ShoppingListLine.shopping_list_id == shopping_list.id,
                    ShoppingListLine.seller_id == seller_group.seller_id,
                    ShoppingListLine.status != ShoppingListLineStatus.DONE,
                )
            ).scalars().all()
        )

        if not lines:
            raise InvalidOperationException(
                "order seller group",
                "seller group has no active lines to order",
            )

        # Validate: every non-DONE line must have ordered > 0
        zero_ordered = [line for line in lines if line.ordered <= 0]
        if zero_ordered:
            raise InvalidOperationException(
                "order seller group",
                "all lines must have ordered quantity > 0 before the group can be ordered",
            )

        # Atomically transition all non-DONE lines to ORDERED
        for line in lines:
            if line.status == ShoppingListLineStatus.NEW:
                line.status = ShoppingListLineStatus.ORDERED

        seller_group.status = ShoppingListSellerStatus.ORDERED
        seller_group.updated_at = datetime.now(UTC)
        self.db.flush()

        SHOPPING_LIST_SELLER_GROUP_OPERATIONS_TOTAL.labels(operation="order").inc()

    def _reopen_seller_group(
        self, shopping_list: ShoppingList, seller_group: ShoppingListSeller
    ) -> None:
        """Transition a seller group from ordered back to active.

        Precondition: no line in the group may have received > 0.
        Effect: all ORDERED lines revert to NEW.
        """
        if seller_group.status != ShoppingListSellerStatus.ORDERED:
            raise InvalidOperationException(
                "reopen seller group",
                "only ordered groups can be reopened",
            )

        lines = list(
            self.db.execute(
                select(ShoppingListLine).where(
                    ShoppingListLine.shopping_list_id == shopping_list.id,
                    ShoppingListLine.seller_id == seller_group.seller_id,
                )
            ).scalars().all()
        )

        # Validate: no line with received > 0
        received_lines = [line for line in lines if line.received > 0]
        if received_lines:
            raise InvalidOperationException(
                "reopen seller group",
                "cannot reopen a group with lines that have received stock",
            )

        # Revert all ORDERED lines back to NEW
        for line in lines:
            if line.status == ShoppingListLineStatus.ORDERED:
                line.status = ShoppingListLineStatus.NEW

        seller_group.status = ShoppingListSellerStatus.ACTIVE
        seller_group.updated_at = datetime.now(UTC)
        self.db.flush()

        SHOPPING_LIST_SELLER_GROUP_OPERATIONS_TOTAL.labels(operation="reopen").inc()

    def _get_seller_group_row(self, list_id: int, seller_id: int) -> ShoppingListSeller:
        """Fetch a seller group row for mutation."""
        stmt = (
            select(ShoppingListSeller)
            .where(
                ShoppingListSeller.shopping_list_id == list_id,
                ShoppingListSeller.seller_id == seller_id,
            )
        )
        seller_group = self.db.execute(stmt).scalar_one_or_none()
        if seller_group is None:
            raise RecordNotFoundException("Seller group", f"list={list_id} seller={seller_id}")
        return seller_group

    def _get_seller_group_with_lines(
        self, list_id: int, seller_id: int
    ) -> ShoppingListSeller:
        """Load a seller group with its lines and attach derived fields."""
        stmt = (
            select(ShoppingListSeller)
            .options(selectinload(ShoppingListSeller.seller))
            .where(
                ShoppingListSeller.shopping_list_id == list_id,
                ShoppingListSeller.seller_id == seller_id,
            )
        )
        seller_group = self.db.execute(stmt).scalar_one_or_none()
        if seller_group is None:
            raise RecordNotFoundException("Seller group", f"list={list_id} seller={seller_id}")

        # Load lines for this seller in this list
        line_stmt = (
            select(ShoppingListLine)
            .options(
                selectinload(ShoppingListLine.part).options(
                    selectinload(Part.part_locations).selectinload(
                        PartLocation.location
                    ),
                ),
                selectinload(ShoppingListLine.seller),
                selectinload(ShoppingListLine.shopping_list),
            )
            .where(
                ShoppingListLine.shopping_list_id == list_id,
                ShoppingListLine.seller_id == seller_id,
            )
            .order_by(ShoppingListLine.created_at.asc())
        )
        lines = list(self.db.execute(line_stmt).scalars().all())
        if lines:
            self._enrich_seller_links(lines)

        # Attach derived fields as transient attributes
        seller_group.group_key = str(seller_id)
        seller_group.lines = lines
        seller_group.totals = {
            "needed": sum(line.needed for line in lines),
            "ordered": sum(line.ordered for line in lines),
            "received": sum(line.received for line in lines),
        }
        seller_group.completed = all(
            line.status == ShoppingListLineStatus.DONE for line in lines
        ) if lines else False

        return seller_group

    # -- Part membership queries --

    def list_part_memberships_bulk(
        self,
        part_ids: Sequence[int],
        include_done: bool = False,
    ) -> dict[int, list[ShoppingListLine]]:
        """Return shopping list lines grouped by part ID according to input order."""
        if not part_ids:
            return {}

        stmt = (
            select(ShoppingListLine)
            .join(ShoppingList, ShoppingListLine.shopping_list_id == ShoppingList.id)
            .options(
                selectinload(ShoppingListLine.shopping_list),
                selectinload(ShoppingListLine.part),
                selectinload(ShoppingListLine.seller),
            )
            .where(ShoppingListLine.part_id.in_(part_ids))
        )

        if not include_done:
            stmt = stmt.where(
                ShoppingListLine.status != ShoppingListLineStatus.DONE,
                ShoppingList.status != ShoppingListStatus.DONE,
            )

        stmt = stmt.order_by(
            ShoppingListLine.updated_at.desc(),
            ShoppingList.updated_at.desc(),
            ShoppingListLine.created_at.asc(),
        )

        memberships_by_part_id: dict[int, list[ShoppingListLine]] = {
            part_id: [] for part_id in part_ids
        }

        for line in self.db.execute(stmt).scalars():
            memberships_by_part_id.setdefault(line.part_id, []).append(line)

        # Ensure every requested part ID is present, even if no memberships were found
        for part_id in part_ids:
            memberships_by_part_id.setdefault(part_id, [])

        return memberships_by_part_id

    def list_part_memberships(self, part_id: int, include_done: bool = False) -> list[ShoppingListLine]:
        """Return active shopping list lines that reference the provided part."""
        memberships = self.list_part_memberships_bulk([part_id], include_done=include_done)
        return memberships.get(part_id, [])

    def _enrich_seller_links(self, lines: list[ShoppingListLine]) -> None:
        """Attach seller_link URLs as transient attributes on each line."""
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

    def _get_list_for_update(self, list_id: int) -> ShoppingList:
        """Load a shopping list for updates without eager loading relationships."""
        stmt = select(ShoppingList).where(ShoppingList.id == list_id)
        shopping_list = self.db.execute(stmt).scalar_one_or_none()
        if not shopping_list:
            raise RecordNotFoundException("Shopping list", list_id)
        return shopping_list

    def _ensure_list_exists(self, list_id: int) -> None:
        """Raise if the shopping list does not exist."""
        exists_stmt = select(ShoppingList.id).where(ShoppingList.id == list_id)
        exists = self.db.execute(exists_stmt).scalar_one_or_none()
        if exists is None:
            raise RecordNotFoundException("Shopping list", list_id)

    def _attach_line_counts(
        self,
        shopping_list: ShoppingList,
        counts_map: dict[int, dict[ShoppingListLineStatus, int]] | None = None,
    ) -> ShoppingList:
        """Attach computed line counts to the shopping list instance.

        This helper is the single place that populates the derived counters so
        both detail and overview payloads stay perfectly aligned.
        """
        if counts_map is None:
            counts_map = self._counts_for_lists([shopping_list.id])
        counts = counts_map.get(shopping_list.id)
        if counts is None:
            counts = {
                ShoppingListLineStatus.NEW: 0,
                ShoppingListLineStatus.ORDERED: 0,
                ShoppingListLineStatus.DONE: 0,
            }

        shopping_list.line_counts = {
            "new": counts[ShoppingListLineStatus.NEW],
            "ordered": counts[ShoppingListLineStatus.ORDERED],
            "done": counts[ShoppingListLineStatus.DONE],
        }
        shopping_list.has_ordered_lines = counts[
            ShoppingListLineStatus.ORDERED
        ] > 0
        return shopping_list

    def _counts_for_lists(
        self, list_ids: Iterable[int]
    ) -> dict[int, dict[ShoppingListLineStatus, int]]:
        """Batch load counts for the provided list identifiers."""
        ids = list(list_ids)
        if not ids:
            return {}

        counts_stmt = (
            select(
                ShoppingListLine.shopping_list_id,
                func.coalesce(
                    func.sum(
                        case(
                            (ShoppingListLine.status == ShoppingListLineStatus.NEW, 1),
                            else_=0,
                        )
                    ),
                    0,
                ).label("new_count"),
                func.coalesce(
                    func.sum(
                        case(
                            (ShoppingListLine.status == ShoppingListLineStatus.ORDERED, 1),
                            else_=0,
                        )
                    ),
                    0,
                ).label("ordered_count"),
                func.coalesce(
                    func.sum(
                        case(
                            (ShoppingListLine.status == ShoppingListLineStatus.DONE, 1),
                            else_=0,
                        )
                    ),
                    0,
                ).label("done_count"),
            )
            .where(ShoppingListLine.shopping_list_id.in_(ids))
            .group_by(ShoppingListLine.shopping_list_id)
        )

        counts: dict[int, dict[ShoppingListLineStatus, int]] = {
            list_id: {
                ShoppingListLineStatus.NEW: 0,
                ShoppingListLineStatus.ORDERED: 0,
                ShoppingListLineStatus.DONE: 0,
            }
            for list_id in ids
        }

        for row in self.db.execute(counts_stmt):
            counts[row.shopping_list_id] = {
                ShoppingListLineStatus.NEW: row.new_count or 0,
                ShoppingListLineStatus.ORDERED: row.ordered_count or 0,
                ShoppingListLineStatus.DONE: row.done_count or 0,
            }

        return counts

    def _load_list_with_lines(self, list_id: int) -> ShoppingList:
        """Load a shopping list with line and seller group relationships."""
        stmt = (
            select(ShoppingList)
            .options(
                selectinload(ShoppingList.lines).options(
                    selectinload(ShoppingListLine.part).options(
                        selectinload(Part.part_locations).selectinload(
                            PartLocation.location
                        ),
                    ),
                    selectinload(ShoppingListLine.seller),
                ),
                selectinload(ShoppingList.seller_groups).selectinload(
                    ShoppingListSeller.seller
                ),
            )
            .where(ShoppingList.id == list_id)
            .execution_options(populate_existing=True)
        )
        shopping_list = self.db.execute(stmt).scalar_one_or_none()
        if shopping_list is None:
            raise RecordNotFoundException("Shopping list", list_id)
        # Enrich lines with seller link URLs for schema serialization
        if shopping_list.lines:
            self._enrich_seller_links(list(shopping_list.lines))
        return shopping_list

    def _attach_seller_group_payload(self, shopping_list: ShoppingList) -> ShoppingList:
        """Build seller groups from persisted ShoppingListSeller rows and lines.

        Expunges the shopping list from the session before replacing the
        seller_groups relationship with dict-based payloads.  This prevents
        the non-ORM dicts from polluting the session identity map and
        causing IntegrityErrors on later flushes.
        """
        if shopping_list.lines:
            shopping_list.lines.sort(key=lambda line: line.created_at)

        # Build groups from the persisted seller group rows
        groups: list[dict[str, Any]] = []

        # Index lines by seller_id for fast lookup
        lines_by_seller: dict[int | None, list[ShoppingListLine]] = {}
        for line in (shopping_list.lines or []):
            lines_by_seller.setdefault(line.seller_id, []).append(line)

        # Named seller groups from the shopping_list_sellers table
        for sg in (shopping_list.seller_groups or []):
            sg_lines = lines_by_seller.get(sg.seller_id, [])
            groups.append({
                "group_key": str(sg.seller_id),
                "seller_id": sg.seller_id,
                "seller": sg.seller,
                "lines": sg_lines,
                "totals": {
                    "needed": sum(ln.needed for ln in sg_lines),
                    "ordered": sum(ln.ordered for ln in sg_lines),
                    "received": sum(ln.received for ln in sg_lines),
                },
                "note": sg.note,
                "status": sg.status.value if sg.status else None,
                "completed": all(
                    ln.status == ShoppingListLineStatus.DONE for ln in sg_lines
                ) if sg_lines else False,
            })

        # Sort named groups alphabetically by seller name
        groups.sort(key=lambda g: (g["seller"].name.lower() if g["seller"] else "", g["group_key"]))

        # Add ungrouped bucket (lines with seller_id = NULL)
        ungrouped_lines = lines_by_seller.get(None, [])
        if ungrouped_lines:
            groups.append({
                "group_key": "ungrouped",
                "seller_id": None,
                "seller": None,
                "lines": ungrouped_lines,
                "totals": {
                    "needed": sum(ln.needed for ln in ungrouped_lines),
                    "ordered": sum(ln.ordered for ln in ungrouped_lines),
                    "received": sum(ln.received for ln in ungrouped_lines),
                },
                "note": None,
                "status": None,
                "completed": all(
                    ln.status == ShoppingListLineStatus.DONE for ln in ungrouped_lines
                ),
            })

        # Detach from session before replacing the relationship attribute
        # with dict-based payloads to avoid corrupting the identity map.
        # Use __dict__ to bypass the instrumented descriptor which would
        # try to process the dicts through backref event handlers.
        self.db.expunge(shopping_list)
        shopping_list.__dict__["seller_groups"] = groups
        return shopping_list

    def _touch_list(self, shopping_list: ShoppingList) -> None:
        """Update list timestamp to reflect related mutations."""
        shopping_list.updated_at = datetime.now(UTC)
