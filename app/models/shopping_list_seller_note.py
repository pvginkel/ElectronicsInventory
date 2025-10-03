"""Seller note model for shopping list ready view."""

from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.extensions import db

if TYPE_CHECKING:
    from app.models.seller import Seller
    from app.models.shopping_list import ShoppingList


class ShoppingListSellerNote(db.Model):  # type: ignore[name-defined]
    """Stores per-seller order notes for a shopping list."""

    __tablename__ = "shopping_list_seller_notes"

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
    note: Mapped[str] = mapped_column(
        Text,
        nullable=False,
        default="",
        server_default="",
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
        "ShoppingList", back_populates="seller_notes", lazy="selectin"
    )
    seller: Mapped[Seller] = relationship("Seller", lazy="selectin")

    __table_args__ = (
        UniqueConstraint(
            "shopping_list_id",
            "seller_id",
            name="uq_shopping_list_seller_notes_list_seller",
        ),
    )

    def __repr__(self) -> str:
        return (
            "<ShoppingListSellerNote id={id} list_id={list_id} seller_id={seller}>"
        ).format(id=self.id, list_id=self.shopping_list_id, seller=self.seller_id)
