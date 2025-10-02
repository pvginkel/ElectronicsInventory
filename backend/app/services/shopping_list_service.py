"""Business logic for shopping list lifecycle management."""

from __future__ import annotations

from collections.abc import Iterable

from sqlalchemy import case, delete, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import selectinload

from app.exceptions import (
    InvalidOperationException,
    RecordNotFoundException,
    ResourceConflictException,
)
from app.models.shopping_list import ShoppingList, ShoppingListStatus
from app.models.shopping_list_line import ShoppingListLine, ShoppingListLineStatus
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
        stmt = (
            select(ShoppingList)
            .options(
                selectinload(ShoppingList.lines)
                .selectinload(ShoppingListLine.part),
                selectinload(ShoppingList.lines)
                .selectinload(ShoppingListLine.seller),
            )
            .where(ShoppingList.id == list_id)
        )
        shopping_list = self.db.execute(stmt).scalar_one_or_none()
        if not shopping_list:
            raise RecordNotFoundException("Shopping list", list_id)
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
        return self._attach_line_counts(shopping_list)

    def list_lists(self, include_done: bool = False) -> list[ShoppingList]:
        """Return all shopping lists with aggregated line counts."""
        stmt = select(ShoppingList)
        if not include_done:
            stmt = stmt.where(ShoppingList.status != ShoppingListStatus.DONE)

        stmt = stmt.order_by(ShoppingList.created_at.desc())
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

        shopping_list.line_counts = {"new": counts[ShoppingListLineStatus.NEW], "ordered": counts[ShoppingListLineStatus.ORDERED], "done": counts[ShoppingListLineStatus.DONE]}
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
