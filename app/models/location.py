"""Location model for Electronics Inventory."""

from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.extensions import db

if TYPE_CHECKING:
    from app.models.box import Box


class Location(db.Model):
    """Model representing a numbered location within a box."""

    __tablename__ = "locations"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    box_id: Mapped[int] = mapped_column(ForeignKey("boxes.id"), nullable=False)
    box_no: Mapped[int] = mapped_column(nullable=False)
    loc_no: Mapped[int] = mapped_column(nullable=False)

    # Relationships
    box: Mapped["Box"] = relationship(back_populates="locations")

    __table_args__ = (UniqueConstraint("box_no", "loc_no"),)

    def __repr__(self) -> str:
        return f"<Location {self.box_no}-{self.loc_no}>"