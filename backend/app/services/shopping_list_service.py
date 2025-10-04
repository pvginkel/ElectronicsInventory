"""Business logic for shopping list lifecycle management."""

from __future__ import annotations

from collections.abc import Iterable
from datetime import datetime
from typing import Any

from sqlalchemy import and_, case, delete, func, or_, select
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
from app.models.shopping_list_seller_note import ShoppingListSellerNote
from app.services.base import BaseService


class ShoppingListService(BaseService):
    """Service encapsulating shopping list operations and invariants."""

    def create_list(self, name: str, description: str | None = None) -> ShoppingList:
        """Create a new shopping list in concept status."""
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
        shopping_list = self._attach_ready_payload(shopping_list)
        return self._attach_line_counts(shopping_list)

    def update_list(
        self,
        list_id: int,
        *,
        name: str | None = None,
        description: str | None = None,
    ) -> ShoppingList:
        """Update shopping list metadata."""
        shopping_list = self._get_list_for_update(list_id)

        if name is not None:
            shopping_list.name = name
        if description is not None:
            shopping_list.description = description

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
        """Update list workflow status while enforcing allowed transitions."""
        shopping_list = self._get_list_for_update(list_id)

        if shopping_list.status == status:
            return self._attach_line_counts(shopping_list)

        if shopping_list.status == ShoppingListStatus.DONE:
            raise InvalidOperationException(
                "change shopping list status",
                "completed lists cannot be reopened",
            )

        if status == ShoppingListStatus.DONE and shopping_list.status == ShoppingListStatus.CONCEPT:
            raise InvalidOperationException(
                "complete shopping list",
                "lists must be marked ready before completion",
            )

        if status == ShoppingListStatus.READY and shopping_list.status == ShoppingListStatus.CONCEPT:
            counts = self.get_list_stats(list_id)
            if counts[ShoppingListLineStatus.NEW] + counts[ShoppingListLineStatus.ORDERED] + counts[ShoppingListLineStatus.DONE] == 0:
                raise InvalidOperationException(
                    "mark shopping list ready",
                    "at least one line item is required",
                )

        if status == ShoppingListStatus.CONCEPT and shopping_list.status == ShoppingListStatus.READY:
            counts = self.get_list_stats(list_id)
            if counts[ShoppingListLineStatus.ORDERED] > 0:
                raise InvalidOperationException(
                    "revert shopping list to concept",
                    "ordered lines must be cleared before reverting",
                )

        if status == ShoppingListStatus.READY and shopping_list.status not in {
            ShoppingListStatus.CONCEPT,
            ShoppingListStatus.READY,
        }:
            raise InvalidOperationException(
                "change shopping list status",
                f"transition from {shopping_list.status.value} to {status.value} is not allowed",
            )

        if status == ShoppingListStatus.CONCEPT and shopping_list.status != ShoppingListStatus.READY:
            raise InvalidOperationException(
                "revert shopping list to concept",
                f"transition from {shopping_list.status.value} to concept is not permitted",
            )

        shopping_list.status = status
        self.db.flush()
        refreshed = self._attach_ready_payload(
            self._load_list_with_lines(shopping_list.id)
        )
        return self._attach_line_counts(refreshed)

    def list_lists(self, include_done: bool = False) -> list[ShoppingList]:
        """Return all shopping lists with aggregated line counts."""
        stmt = select(ShoppingList).options(
            selectinload(ShoppingList.seller_notes).selectinload(
                ShoppingListSellerNote.seller
            )
        )
        if not include_done:
            stmt = stmt.where(ShoppingList.status != ShoppingListStatus.DONE)

        stmt = stmt.order_by(ShoppingList.created_at.desc())
        shopping_lists = list(self.db.execute(stmt).scalars().all())
        counts_map = self._counts_for_lists([shopping_list.id for shopping_list in shopping_lists])
        return [
            self._attach_line_counts(self._sort_seller_notes(shopping_list), counts_map)
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

    def get_seller_order_notes(self, list_id: int) -> list[ShoppingListSellerNote]:
        """Return seller notes for the specified list sorted by seller name."""
        self._ensure_list_exists(list_id)
        stmt = (
            select(ShoppingListSellerNote)
            .options(selectinload(ShoppingListSellerNote.seller))
            .where(ShoppingListSellerNote.shopping_list_id == list_id)
        )
        notes = list(self.db.execute(stmt).scalars().all())
        notes.sort(
            key=lambda note: (
                (note.seller.name.lower() if note.seller else ""),
                note.seller_id,
            )
        )
        return notes

    def group_lines_by_seller(self, list_id: int) -> list[dict[str, Any]]:
        """Return grouping structures used by the Ready view UI."""
        shopping_list = self._attach_ready_payload(self._load_list_with_lines(list_id))
        return shopping_list.seller_groups

    def list_part_memberships(self, part_id: int) -> list[ShoppingListLine]:
        """Return active shopping list lines that reference the provided part."""
        stmt = (
            select(ShoppingListLine)
            .join(ShoppingList, ShoppingListLine.shopping_list_id == ShoppingList.id)
            .options(
                selectinload(ShoppingListLine.shopping_list),
                selectinload(ShoppingListLine.part).selectinload(Part.seller),
                selectinload(ShoppingListLine.seller),
            )
            .where(
                ShoppingListLine.part_id == part_id,
                ShoppingListLine.status != ShoppingListLineStatus.DONE,
                ShoppingList.status != ShoppingListStatus.DONE,
            )
            .order_by(
                ShoppingListLine.updated_at.desc(),
                ShoppingList.updated_at.desc(),
                ShoppingListLine.created_at.asc(),
            )
        )
        return list(self.db.execute(stmt).scalars().all())

    def upsert_seller_note(
        self,
        list_id: int,
        seller_id: int,
        note: str,
    ) -> ShoppingListSellerNote | None:
        """Create, update, or delete a seller note for the given list."""
        shopping_list = self._get_list_for_update(list_id)

        seller = self.db.get(Seller, seller_id)
        if seller is None:
            raise RecordNotFoundException("Seller", seller_id)

        # Ensure the seller is relevant to the list via override or default part seller.
        association_exists = self.db.execute(
            select(ShoppingListLine.id)
            .join(Part, Part.id == ShoppingListLine.part_id)
            .where(
                ShoppingListLine.shopping_list_id == list_id,
                or_(
                    ShoppingListLine.seller_id == seller_id,
                    and_(
                        ShoppingListLine.seller_id.is_(None),
                        Part.seller_id == seller_id,
                    ),
                ),
            )
            .limit(1)
        ).scalar_one_or_none()
        if association_exists is None:
            raise InvalidOperationException(
                "update seller note",
                "seller must be associated with at least one line on the list",
            )

        note_text = note if note is not None else ""

        stmt = (
            select(ShoppingListSellerNote)
            .where(
                ShoppingListSellerNote.shopping_list_id == list_id,
                ShoppingListSellerNote.seller_id == seller_id,
            )
        )
        existing = self.db.execute(stmt).scalar_one_or_none()

        if note_text.strip() == "":
            if existing is not None:
                self.db.delete(existing)
                self._touch_list(shopping_list)
                self.db.flush()
            return None

        if existing is None:
            existing = ShoppingListSellerNote(
                shopping_list_id=list_id,
                seller_id=seller_id,
                note=note_text,
            )
            self.db.add(existing)
        else:
            existing.note = note_text
            existing.updated_at = datetime.utcnow()

        self._touch_list(shopping_list)
        self.db.flush()
        self.db.refresh(existing, attribute_names=["seller"])
        return existing

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
        """Attach computed line counts to the shopping list instance."""
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
        """Load a shopping list with line and seller note relationships."""
        stmt = (
            select(ShoppingList)
            .options(
                selectinload(ShoppingList.lines).options(
                    selectinload(ShoppingListLine.part).options(
                        selectinload(Part.seller),
                        selectinload(Part.part_locations).selectinload(
                            PartLocation.location
                        ),
                    ),
                    selectinload(ShoppingListLine.seller),
                ),
                selectinload(ShoppingList.seller_notes).selectinload(
                    ShoppingListSellerNote.seller
                ),
            )
            .where(ShoppingList.id == list_id)
            .execution_options(populate_existing=True)
        )
        shopping_list = self.db.execute(stmt).scalar_one_or_none()
        if shopping_list is None:
            raise RecordNotFoundException("Shopping list", list_id)
        return shopping_list

    def _attach_ready_payload(self, shopping_list: ShoppingList) -> ShoppingList:
        """Populate grouping metadata for ready view responses."""
        if shopping_list.lines:
            shopping_list.lines.sort(key=lambda line: line.created_at)
        self._sort_seller_notes(shopping_list)
        shopping_list.seller_groups = self._build_seller_groups(shopping_list)
        return shopping_list

    def _sort_seller_notes(self, shopping_list: ShoppingList) -> ShoppingList:
        """Sort seller notes in-place for stable API responses."""
        if shopping_list.seller_notes:
            shopping_list.seller_notes.sort(
                key=lambda note: (
                    (note.seller.name.lower() if note.seller else ""),
                    note.seller_id,
                )
            )
        return shopping_list

    def _build_seller_groups(
        self, shopping_list: ShoppingList
    ) -> list[dict[str, Any]]:
        """Build seller grouping payloads for Ready view."""
        if not shopping_list.lines:
            return []

        notes_by_seller = {
            note.seller_id: note for note in shopping_list.seller_notes or []
        }

        groups: dict[str, dict[str, Any]] = {}
        for line in shopping_list.lines:
            seller_id = line.effective_seller_id
            group_key = str(seller_id) if seller_id is not None else "ungrouped"
            group = groups.get(group_key)
            if group is None:
                group = {
                    "group_key": group_key,
                    "seller_id": seller_id,
                    "seller": line.effective_seller if seller_id is not None else None,
                    "lines": [],
                    "totals": {"needed": 0, "ordered": 0, "received": 0},
                    "order_note": notes_by_seller.get(seller_id)
                    if seller_id is not None
                    else None,
                }
                groups[group_key] = group

            group["lines"].append(line)
            group["totals"]["needed"] += line.needed
            group["totals"]["ordered"] += line.ordered
            group["totals"]["received"] += line.received

        for group in groups.values():
            group["lines"].sort(key=lambda line: line.created_at)

        def _group_sort_key(group: dict[str, Any]) -> tuple[int, str, str]:
            seller = group["seller"]
            is_ungrouped = group["seller_id"] is None
            seller_name = seller.name.lower() if seller else ""
            return (1 if is_ungrouped else 0, seller_name, group["group_key"])

        return sorted(groups.values(), key=_group_sort_key)

    def _touch_list(self, shopping_list: ShoppingList) -> None:
        """Update list timestamp to reflect related mutations."""
        shopping_list.updated_at = datetime.utcnow()
