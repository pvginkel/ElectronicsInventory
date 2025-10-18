"""Kit pick list model for tracking fulfillment progress."""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import TYPE_CHECKING

from sqlalchemy import CheckConstraint, ForeignKey, Integer, func
from sqlalchemy import Enum as SQLEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.extensions import db

if TYPE_CHECKING:
    from app.models.kit import Kit
    from app.models.kit_pick_list_line import KitPickListLine


class KitPickListStatus(str, Enum):
    """Lifecycle status for a kit pick list."""

    OPEN = "open"
    COMPLETED = "completed"


class KitPickList(db.Model):  # type: ignore[name-defined]
    """Model tracking picking activity for kits."""

    __tablename__ = "kit_pick_lists"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    kit_id: Mapped[int] = mapped_column(
        ForeignKey("kits.id", ondelete="CASCADE"),
        nullable=False,
    )
    requested_units: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[KitPickListStatus] = mapped_column(
        SQLEnum(
            KitPickListStatus,
            name="kit_pick_list_status",
            values_callable=lambda enum_cls: [item.value for item in enum_cls],
            native_enum=False,
        ),
        nullable=False,
        default=KitPickListStatus.OPEN,
        server_default=KitPickListStatus.OPEN.value,
        index=True,
    )
    completed_at: Mapped[datetime | None] = mapped_column(nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        nullable=False, server_default=func.now(), onupdate=func.now()
    )

    __table_args__ = (
        CheckConstraint(
            "requested_units >= 1",
            name="ck_kit_pick_lists_requested_units_positive",
        ),
    )

    kit: Mapped[Kit] = relationship(
        "Kit",
        back_populates="pick_lists",
        lazy="selectin",
    )
    lines: Mapped[list["KitPickListLine"]] = relationship(
        "KitPickListLine",
        back_populates="pick_list",
        cascade="all, delete-orphan",
        lazy="selectin",
        order_by="KitPickListLine.id",
    )

    @property
    def is_completed(self) -> bool:
        """Return True when the pick list has been completely fulfilled."""
        return self.status is KitPickListStatus.COMPLETED

    @property
    def kit_name(self) -> str:
        """Return the owning kit's display name for serialization."""
        return self.kit.name if hasattr(self, "kit") and self.kit else ""

    @property
    def completed_lines(self) -> tuple["KitPickListLine", ...]:
        """Return a tuple of lines that have been picked."""
        return tuple(line for line in self.lines if line.is_completed)

    @property
    def open_lines(self) -> tuple["KitPickListLine", ...]:
        """Return a tuple of lines that still need to be picked."""
        return tuple(line for line in self.lines if line.is_open)

    @property
    def line_count(self) -> int:
        """Return the total number of lines on the pick list."""
        return len(self.lines)

    @property
    def open_line_count(self) -> int:
        """Return the number of lines that remain unpicked."""
        return len(self.open_lines)

    @property
    def completed_line_count(self) -> int:
        """Return the number of lines that have been picked."""
        return len(self.completed_lines)

    @property
    def total_quantity_to_pick(self) -> int:
        """Return the total quantity across all lines."""
        return sum(line.quantity_to_pick for line in self.lines)

    @property
    def picked_quantity(self) -> int:
        """Return the quantity already deducted for this pick list."""
        return sum(
            line.quantity_to_pick for line in self.lines if line.is_completed
        )

    @property
    def remaining_quantity(self) -> int:
        """Return the quantity still to deduct for open lines."""
        return self.total_quantity_to_pick - self.picked_quantity

    def __repr__(self) -> str:
        return (
            f"<KitPickList id={self.id} kit_id={self.kit_id} "
            f"status={self.status.value} requested_units={self.requested_units}>"
        )
