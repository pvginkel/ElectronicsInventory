"""Quantity History model for Electronics Inventory."""

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.extensions import db

if TYPE_CHECKING:
    from app.models.part import Part


class QuantityHistory(db.Model):  # type: ignore[name-defined]
    """Model representing quantity changes for parts over time."""

    __tablename__ = "quantity_history"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    part_id: Mapped[int] = mapped_column(
        ForeignKey("parts.id"), nullable=False
    )
    delta_qty: Mapped[int] = mapped_column(nullable=False)
    location_reference: Mapped[str | None] = mapped_column(
        String(20), nullable=True
    )
    timestamp: Mapped[datetime] = mapped_column(
        nullable=False, server_default=func.now()
    )

    # Relationships
    part: Mapped["Part"] = relationship(  # type: ignore[assignment]
        "Part", back_populates="quantity_history", lazy="selectin"
    )

    def __repr__(self) -> str:
        return f"<QuantityHistory {self.part_id}: {self.delta_qty:+d} @ {self.timestamp}>"
