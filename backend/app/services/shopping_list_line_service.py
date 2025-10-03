"""Business logic for shopping list line item management."""

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import selectinload

from app.exceptions import InvalidOperationException, RecordNotFoundException
from app.models.part import Part
from app.models.shopping_list import ShoppingList
from app.models.shopping_list_line import (
    ShoppingListLine,
    ShoppingListLineStatus,
)
from app.services.base import BaseService
from app.services.seller_service import SellerService


class ShoppingListLineService(BaseService):
    """Service encapsulating CRUD operations for shopping list lines."""

    def __init__(
        self,
        db,
        seller_service: SellerService,
    ) -> None:
        super().__init__(db)
        self.seller_service = seller_service

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

        try:
            self.db.flush()
        except IntegrityError as exc:
            self.db.rollback()
            raise InvalidOperationException(
                "add part to shopping list",
                "the part could not be added due to a uniqueness constraint",
            ) from exc

        return self._get_line(line.id)

    def update_line(
        self,
        line_id: int,
        *,
        seller_id: int | None = None,
        needed: int | None = None,
        note: str | None = None,
    ) -> ShoppingListLine:
        """Update a shopping list line while keeping progress fields read-only."""
        line = self._get_line_for_update(line_id)

        if line.status != ShoppingListLineStatus.NEW:
            raise InvalidOperationException(
                "update shopping list line",
                "only NEW lines can be edited in this phase",
            )

        if seller_id is not None:
            self.seller_service.get_seller(seller_id)
        if needed is not None and needed < 1:
            raise InvalidOperationException(
                "update shopping list line",
                "needed quantity must be at least 1",
            )

        if seller_id is not None:
            line.seller_id = seller_id
        if needed is not None:
            line.needed = needed
        if note is not None:
            line.note = note

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
        self.db.delete(line)
        self.db.flush()

    def list_lines(self, list_id: int, include_done: bool = True) -> list[ShoppingListLine]:
        """List all lines for a shopping list with optional filtering of completed items."""
        self._ensure_list_exists(list_id)

        stmt = (
            select(ShoppingListLine)
            .options(
                selectinload(ShoppingListLine.part),
                selectinload(ShoppingListLine.seller),
            )
            .where(ShoppingListLine.shopping_list_id == list_id)
            .order_by(ShoppingListLine.created_at.asc())
        )
        if not include_done:
            stmt = stmt.where(ShoppingListLine.status != ShoppingListLineStatus.DONE)

        return list(self.db.execute(stmt).scalars().all())

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

    def _get_line(self, line_id: int) -> ShoppingListLine:
        """Fetch a line with relationships for response payloads."""
        stmt = (
            select(ShoppingListLine)
            .options(
                selectinload(ShoppingListLine.part),
                selectinload(ShoppingListLine.seller),
            )
            .where(ShoppingListLine.id == line_id)
        )
        line = self.db.execute(stmt).scalar_one_or_none()
        if not line:
            raise RecordNotFoundException("Shopping list line", line_id)
        self.db.refresh(line, attribute_names=["seller", "part"])
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
