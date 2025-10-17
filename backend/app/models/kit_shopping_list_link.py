"""Association model between kits and shopping lists."""

from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, ForeignKey, UniqueConstraint, func
from sqlalchemy import Enum as SQLEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.extensions import db
from app.models.shopping_list import ShoppingListStatus

if TYPE_CHECKING:
    from app.models.kit import Kit
    from app.models.shopping_list import ShoppingList


class KitShoppingListLink(db.Model):  # type: ignore[name-defined]
    """Link table connecting kits to shopping lists for overview badges."""

    __tablename__ = "kit_shopping_list_links"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    kit_id: Mapped[int] = mapped_column(
        ForeignKey("kits.id", ondelete="CASCADE"),
        nullable=False,
    )
    shopping_list_id: Mapped[int] = mapped_column(
        ForeignKey("shopping_lists.id", ondelete="CASCADE"),
        nullable=False,
    )
    linked_status: Mapped[ShoppingListStatus] = mapped_column(
        SQLEnum(
            ShoppingListStatus,
            name="kit_linked_status",
            values_callable=lambda enum_cls: [item.value for item in enum_cls],
            native_enum=False,
        ),
        nullable=False,
    )
    snapshot_kit_updated_at: Mapped[datetime | None] = mapped_column(nullable=True)
    is_stale: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default="false"
    )
    created_at: Mapped[datetime] = mapped_column(
        nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        nullable=False, server_default=func.now(), onupdate=func.now()
    )

    __table_args__ = (
        UniqueConstraint(
            "kit_id",
            "shopping_list_id",
            name="uq_kit_shopping_list_link",
        ),
    )

    kit: Mapped[Kit] = relationship(
        "Kit",
        back_populates="shopping_list_links",
        lazy="selectin",
    )
    shopping_list: Mapped[ShoppingList] = relationship(
        "ShoppingList",
        back_populates="kit_links",
        lazy="selectin",
    )

    def __repr__(self) -> str:
        return (
            f"<KitShoppingListLink kit_id={self.kit_id} "
            f"shopping_list_id={self.shopping_list_id} status={self.linked_status.value}>"
        )
