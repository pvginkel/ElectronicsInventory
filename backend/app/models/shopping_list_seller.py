"""Seller group model for shopping list kanban workflow."""

from __future__ import annotations

from datetime import datetime
from enum import StrEnum
from typing import TYPE_CHECKING

from sqlalchemy import Enum as SQLEnum
from sqlalchemy import ForeignKey, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.extensions import db

if TYPE_CHECKING:
    from app.models.seller import Seller
    from app.models.shopping_list import ShoppingList


class ShoppingListSellerStatus(StrEnum):
    """Possible states for a seller group within a shopping list."""

    ACTIVE = "active"
    ORDERED = "ordered"


class ShoppingListSeller(db.Model):  # type: ignore[name-defined]
    """Persisted seller group for a shopping list with ordering status."""

    __tablename__ = "shopping_list_sellers"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    shopping_list_id: Mapped[int] = mapped_column(
        ForeignKey("shopping_lists.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    seller_id: Mapped[int] = mapped_column(
        ForeignKey("sellers.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[ShoppingListSellerStatus] = mapped_column(
        SQLEnum(
            ShoppingListSellerStatus,
            name="shopping_list_seller_status",
            values_callable=lambda enum_cls: [item.value for item in enum_cls],
            native_enum=False,
        ),
        nullable=False,
        default=ShoppingListSellerStatus.ACTIVE,
        server_default=ShoppingListSellerStatus.ACTIVE.value,
    )
    created_at: Mapped[datetime] = mapped_column(
        nullable=False,
        server_default=func.now(),
    )
    updated_at: Mapped[datetime] = mapped_column(
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )

    shopping_list: Mapped[ShoppingList] = relationship(
        "ShoppingList", back_populates="seller_groups", lazy="selectin"
    )
    seller: Mapped[Seller] = relationship("Seller", lazy="selectin")

    __table_args__ = (
        UniqueConstraint(
            "shopping_list_id",
            "seller_id",
            name="uq_shopping_list_sellers_list_seller",
        ),
    )

    def __repr__(self) -> str:
        return (
            f"<ShoppingListSeller id={self.id} list_id={self.shopping_list_id} "
            f"seller_id={self.seller_id} status={self.status.value}>"
        )
