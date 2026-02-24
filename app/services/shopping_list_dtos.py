"""Data transfer objects for shopping list service responses.

These DTOs wrap ORM models and hold computed fields, replacing the
previous pattern of mutating ORM instances with transient attributes.
The __getattr__ proxy on detail/summary DTOs ensures Pydantic's
from_attributes=True reads ORM columns directly while computed fields
come from the DTO's own dataclass fields.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from app.models.seller import Seller
    from app.models.shopping_list import ShoppingList
    from app.models.shopping_list_line import ShoppingListLine
    from app.models.shopping_list_seller import ShoppingListSellerStatus


@dataclass
class LineCounts:
    """Computed line counts by status."""

    new: int
    ordered: int
    done: int


@dataclass
class SellerGroupTotals:
    """Aggregated quantities for a seller group."""

    needed: int
    ordered: int
    received: int


@dataclass
class SellerGroupDetail:
    """Computed seller group payload for API responses."""

    group_key: str
    seller_id: int | None
    seller: Seller | None
    lines: list[ShoppingListLine]
    totals: SellerGroupTotals
    note: str | None
    status: ShoppingListSellerStatus | None
    completed: bool


@dataclass
class ShoppingListDetail:
    """Shopping list with full computed fields for detail responses.

    Proxies attribute access to the underlying ORM model so Pydantic's
    from_attributes=True reads ORM columns (id, name, status, etc.)
    directly while computed fields (line_counts, seller_groups) come
    from the DTO's own fields.
    """

    _shopping_list: ShoppingList
    line_counts: LineCounts
    seller_groups: list[SellerGroupDetail] = field(default_factory=list)

    @property
    def lines(self) -> list[ShoppingListLine]:
        return list(self._shopping_list.lines or [])

    def __getattr__(self, name: str) -> Any:
        return getattr(self._shopping_list, name)


@dataclass
class ShoppingListSummary:
    """Shopping list with line counts for lightweight list views.

    Proxies attribute access to the underlying ORM model.
    """

    _shopping_list: ShoppingList
    line_counts: LineCounts

    def __getattr__(self, name: str) -> Any:
        return getattr(self._shopping_list, name)
