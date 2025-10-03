"""Shopping list model for concept purchase planning."""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import TYPE_CHECKING

from sqlalchemy import Enum as SQLEnum
from sqlalchemy import String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.extensions import db

if TYPE_CHECKING:
    from app.models.shopping_list_line import ShoppingListLine
    from app.models.shopping_list_seller_note import ShoppingListSellerNote


class ShoppingListStatus(str, Enum):
    """Possible lifecycle states for a shopping list."""

    CONCEPT = "concept"
    READY = "ready"
    DONE = "done"


class ShoppingList(db.Model):  # type: ignore[name-defined]
    """Persistent representation of a concept shopping list."""

    __tablename__ = "shopping_lists"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[ShoppingListStatus] = mapped_column(
        SQLEnum(
            ShoppingListStatus,
            name="shopping_list_status",
            values_callable=lambda enum_cls: [item.value for item in enum_cls],
            native_enum=False,
        ),
        nullable=False,
        default=ShoppingListStatus.CONCEPT,
        server_default=ShoppingListStatus.CONCEPT.value,
    )
    created_at: Mapped[datetime] = mapped_column(
        nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        nullable=False, server_default=func.now(), onupdate=func.now()
    )

    lines: Mapped[list[ShoppingListLine]] = relationship(
        "ShoppingListLine",
        back_populates="shopping_list",
        cascade="all, delete-orphan",
        lazy="selectin",
    )
    seller_notes: Mapped[list[ShoppingListSellerNote]] = relationship(
        "ShoppingListSellerNote",
        back_populates="shopping_list",
        cascade="all, delete-orphan",
        lazy="selectin",
    )

    def __repr__(self) -> str:
        return f"<ShoppingList id={self.id} name={self.name!r} status={self.status.value}>"
