"""Individual pick list line allocations."""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import TYPE_CHECKING

from sqlalchemy import CheckConstraint, ForeignKey, Integer, UniqueConstraint, func, Index
from sqlalchemy import Enum as SQLEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.extensions import db

if TYPE_CHECKING:
    from app.models.kit_content import KitContent
    from app.models.kit_pick_list import KitPickList
    from app.models.location import Location
    from app.models.quantity_history import QuantityHistory


class PickListLineStatus(str, Enum):
    """Lifecycle status for an individual pick list line."""

    OPEN = "open"
    COMPLETED = "completed"


class KitPickListLine(db.Model):  # type: ignore[name-defined]
    """Model representing a single pick instruction within a pick list."""

    __tablename__ = "kit_pick_list_lines"
    __table_args__ = (
        UniqueConstraint(
            "pick_list_id",
            "kit_content_id",
            "location_id",
            name="uq_pick_list_line_allocation",
        ),
        CheckConstraint(
            "quantity_to_pick >= 1",
            name="ck_pick_list_lines_quantity_positive",
        ),
        Index(
            "ix_kit_pick_list_lines_pick_list_id_status",
            "pick_list_id",
            "status",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    pick_list_id: Mapped[int] = mapped_column(
        ForeignKey("kit_pick_lists.id", ondelete="CASCADE"),
        nullable=False,
    )
    kit_content_id: Mapped[int] = mapped_column(
        ForeignKey("kit_contents.id"),
        nullable=False,
    )
    location_id: Mapped[int] = mapped_column(
        ForeignKey("locations.id"),
        nullable=False,
    )
    quantity_to_pick: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[PickListLineStatus] = mapped_column(
        SQLEnum(
            PickListLineStatus,
            name="kit_pick_list_line_status",
            values_callable=lambda enum_cls: [item.value for item in enum_cls],
            native_enum=False,
        ),
        nullable=False,
        default=PickListLineStatus.OPEN,
        server_default=PickListLineStatus.OPEN.value,
    )
    inventory_change_id: Mapped[int | None] = mapped_column(
        ForeignKey("quantity_history.id", ondelete="SET NULL"),
        nullable=True,
    )
    picked_at: Mapped[datetime | None] = mapped_column(nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        nullable=False, server_default=func.now(), onupdate=func.now()
    )

    pick_list: Mapped["KitPickList"] = relationship(
        "KitPickList",
        back_populates="lines",
        lazy="selectin",
    )
    kit_content: Mapped["KitContent"] = relationship(
        "KitContent",
        back_populates="pick_list_lines",
        lazy="selectin",
    )
    location: Mapped["Location"] = relationship(
        "Location",
        lazy="selectin",
    )
    inventory_change: Mapped["QuantityHistory | None"] = relationship(
        "QuantityHistory",
        lazy="selectin",
    )

    @property
    def is_completed(self) -> bool:
        """Return True when the line has been picked."""
        return self.status is PickListLineStatus.COMPLETED

    @property
    def is_open(self) -> bool:
        """Return True when the line still requires picking."""
        return self.status is PickListLineStatus.OPEN

    def __repr__(self) -> str:
        location_ref = getattr(self.location, "id", None)
        return (
            "<KitPickListLine "
            f"id={self.id} pick_list_id={self.pick_list_id} "
            f"kit_content_id={self.kit_content_id} location_id={location_ref} "
            f"quantity_to_pick={self.quantity_to_pick} status={self.status.value}>"
        )
