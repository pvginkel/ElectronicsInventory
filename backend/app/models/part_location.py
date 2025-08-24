"""Part Location model for Electronics Inventory."""

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import CHAR, CheckConstraint, ForeignKey, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.extensions import db

if TYPE_CHECKING:
    from app.models.location import Location
    from app.models.part import Part


class PartLocation(db.Model):  # type: ignore[name-defined]
    """Model representing a part's quantity at a specific location."""

    __tablename__ = "part_locations"
    __table_args__ = (
        UniqueConstraint("part_id4", "box_no", "loc_no", name="uq_part_location"),
        CheckConstraint("qty > 0", name="ck_positive_qty"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    part_id4: Mapped[str] = mapped_column(
        CHAR(4), ForeignKey("parts.id4"), nullable=False
    )
    box_no: Mapped[int] = mapped_column(nullable=False)
    loc_no: Mapped[int] = mapped_column(nullable=False)
    location_id: Mapped[int] = mapped_column(
        ForeignKey("locations.id"), nullable=False
    )
    qty: Mapped[int] = mapped_column(nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        nullable=False, server_default=func.now(), onupdate=func.now()
    )

    # Relationships
    part: Mapped["Part"] = relationship(  # type: ignore[assignment]
        "Part", back_populates="part_locations", lazy="selectin"
    )
    location: Mapped["Location"] = relationship(  # type: ignore[assignment]
        "Location", lazy="selectin"
    )

    def __repr__(self) -> str:
        return f"<PartLocation {self.part_id4} @ {self.box_no}-{self.loc_no}: qty={self.qty}>"
