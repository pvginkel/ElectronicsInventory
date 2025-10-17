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


class KitPickListStatus(str, Enum):
    """Lifecycle status for a kit pick list."""

    DRAFT = "draft"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"


class KitPickList(db.Model):  # type: ignore[name-defined]
    """Model tracking picking activity for kits."""

    __tablename__ = "kit_pick_lists"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    kit_id: Mapped[int] = mapped_column(
        ForeignKey("kits.id", ondelete="CASCADE"),
        nullable=False,
    )
    requested_units: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
    )
    status: Mapped[KitPickListStatus] = mapped_column(
        SQLEnum(
            KitPickListStatus,
            name="kit_pick_list_status",
            values_callable=lambda enum_cls: [item.value for item in enum_cls],
            native_enum=False,
        ),
        nullable=False,
        default=KitPickListStatus.DRAFT,
        server_default=KitPickListStatus.DRAFT.value,
        index=True,
    )
    first_deduction_at: Mapped[datetime | None] = mapped_column(nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(nullable=True)
    decreased_build_target_by: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        server_default="0",
    )
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
        CheckConstraint(
            "decreased_build_target_by >= 0",
            name="ck_kit_pick_lists_decreased_build_target_nonnegative",
        ),
    )

    kit: Mapped[Kit] = relationship(
        "Kit",
        back_populates="pick_lists",
        lazy="selectin",
    )

    def __repr__(self) -> str:
        return (
            f"<KitPickList id={self.id} kit_id={self.kit_id} "
            f"status={self.status.value} requested_units={self.requested_units}>"
        )
