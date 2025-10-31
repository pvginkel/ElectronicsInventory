"""Association model between kits and shopping lists."""

from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    ForeignKey,
    Integer,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.extensions import db

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
    requested_units: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
    )
    honor_reserved: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        server_default="false",
    )
    snapshot_kit_updated_at: Mapped[datetime] = mapped_column(
        nullable=False,
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
        CheckConstraint(
            "requested_units >= 1",
            name="ck_kit_shopping_list_links_requested_units_positive",
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

    @property
    def is_stale(self) -> bool:
        """Return whether the linked kit has changed since the snapshot."""
        if self.snapshot_kit_updated_at is None:
            return False
        kit = self.kit
        if kit is None or kit.updated_at is None:
            return False
        return kit.updated_at > self.snapshot_kit_updated_at

    def __repr__(self) -> str:
        return (
            f"<KitShoppingListLink kit_id={self.kit_id} "
            f"shopping_list_id={self.shopping_list_id} "
            f"requested_units={self.requested_units} "
            f"honor_reserved={self.honor_reserved}>"
        )
