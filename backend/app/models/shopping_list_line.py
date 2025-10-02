"""Shopping list line item model."""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import TYPE_CHECKING

from sqlalchemy import (
    CheckConstraint,
    Enum as SQLEnum,
    ForeignKey,
    Integer,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.extensions import db

if TYPE_CHECKING:
    from app.models.part import Part
    from app.models.seller import Seller
    from app.models.shopping_list import ShoppingList


class ShoppingListLineStatus(str, Enum):
    """Lifecycle states for an individual shopping list line."""

    NEW = "new"
    ORDERED = "ordered"
    DONE = "done"


class ShoppingListLine(db.Model):  # type: ignore[name-defined]
    """Represents a specific part request on a shopping list."""

    __tablename__ = "shopping_list_lines"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    shopping_list_id: Mapped[int] = mapped_column(
        ForeignKey("shopping_lists.id", ondelete="CASCADE"), nullable=False, index=True
    )
    part_id: Mapped[int] = mapped_column(
        ForeignKey("parts.id", ondelete="CASCADE"), nullable=False, index=True
    )
    seller_id: Mapped[int | None] = mapped_column(
        ForeignKey("sellers.id", ondelete="SET NULL"), nullable=True
    )
    needed: Mapped[int] = mapped_column(Integer, nullable=False)
    ordered: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    received: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[ShoppingListLineStatus] = mapped_column(
        SQLEnum(
            ShoppingListLineStatus,
            name="shopping_list_line_status",
            values_callable=lambda enum_cls: [item.value for item in enum_cls],
            native_enum=False,
        ),
        nullable=False,
        default=ShoppingListLineStatus.NEW,
        server_default=ShoppingListLineStatus.NEW.value,
    )
    created_at: Mapped[datetime] = mapped_column(
        nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        nullable=False, server_default=func.now(), onupdate=func.now()
    )

    shopping_list: Mapped["ShoppingList"] = relationship(
        "ShoppingList", back_populates="lines", lazy="selectin"
    )
    part: Mapped["Part"] = relationship("Part", lazy="selectin")
    seller: Mapped[Seller | None] = relationship("Seller", lazy="selectin")

    __table_args__ = (
        UniqueConstraint(
            "shopping_list_id",
            "part_id",
            name="uq_shopping_list_lines_list_part",
        ),
        CheckConstraint("needed >= 1", name="ck_shopping_list_lines_needed_positive"),
        CheckConstraint(
            "ordered >= 0 AND received >= 0",
            name="ck_shopping_list_lines_non_negative_progress",
        ),
    )

    def __repr__(self) -> str:
        return (
            "<ShoppingListLine id={id} list_id={list_id} part_id={part_id} "
            "status={status}>"
        ).format(
            id=self.id,
            list_id=self.shopping_list_id,
            part_id=self.part_id,
            status=self.status.value,
        )
