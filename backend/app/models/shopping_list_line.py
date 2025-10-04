"""Shopping list line item model."""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import TYPE_CHECKING

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    ForeignKey,
    Index,
    Integer,
    Text,
    UniqueConstraint,
    func,
    select,
)
from sqlalchemy import (
    Enum as SQLEnum,
)
from sqlalchemy.orm import Mapped, mapped_column, object_session, relationship
from sqlalchemy.orm.exc import DetachedInstanceError

from app.extensions import db
from app.models.part_location import PartLocation

if TYPE_CHECKING:
    from app.models.part import Part
    from app.models.seller import Seller
from app.models.shopping_list import ShoppingList, ShoppingListStatus


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
    completed_at: Mapped[datetime | None] = mapped_column(nullable=True)
    completion_mismatch: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=False,
        server_default="false",
    )
    completion_note: Mapped[str | None] = mapped_column(Text, nullable=True)

    shopping_list: Mapped[ShoppingList] = relationship(
        "ShoppingList", back_populates="lines", lazy="selectin"
    )
    part: Mapped[Part] = relationship("Part", lazy="selectin")
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
        Index("ix_shopping_list_lines_list_status", "shopping_list_id", "status"),
        Index("ix_shopping_list_lines_list_received", "shopping_list_id", "received"),
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

    @property
    def effective_seller_id(self) -> int | None:
        """Return explicit seller override or fall back to the part's seller."""

        if self.seller_id is not None:
            return self.seller_id
        if self.part is not None:
            return getattr(self.part, "seller_id", None)
        return None

    @property
    def effective_seller(self) -> Seller | None:
        """Return the seller entity used for grouping in Ready view."""

        return self.seller or (self.part.seller if self.part is not None else None)

    @property
    def is_orderable(self) -> bool:
        """Indicate whether ordering actions are allowed for this line."""

        if self.shopping_list is None:
            return False
        if self.shopping_list.status != ShoppingListStatus.READY:
            return False
        return self.status in {
            ShoppingListLineStatus.NEW,
            ShoppingListLineStatus.ORDERED,
        }

    @property
    def is_revertible(self) -> bool:
        """Indicate whether the line can revert from ORDERED back to NEW."""

        if self.shopping_list is None:
            return False
        if self.shopping_list.status != ShoppingListStatus.READY:
            return False
        return (
            self.status == ShoppingListLineStatus.ORDERED
            and self.received == 0
        )

    @property
    def can_receive(self) -> bool:
        """Return True when stock intake actions are allowed for this line."""

        return self.status == ShoppingListLineStatus.ORDERED

    @property
    def has_quantity_mismatch(self) -> bool:
        """Indicate whether ordered and received quantities differ."""

        return self.ordered != self.received

    @property
    def part_locations(self) -> list["PartLocation"]:
        """Expose part location rows for inline response payloads."""

        try:
            part = self.part
        except DetachedInstanceError:
            part = None

        if part is not None:
            try:
                locations = list(part.part_locations or [])
            except DetachedInstanceError:
                locations = None
            else:
                return sorted(
                    locations,
                    key=lambda loc: (loc.box_no, loc.loc_no),
                )

        session = object_session(self)
        if session is None:
            return []

        results = session.execute(
            select(PartLocation)
            .where(PartLocation.part_id == self.part_id)
            .order_by(PartLocation.box_no.asc(), PartLocation.loc_no.asc())
        ).scalars().all()
        return list(results)
