"""Box model for Electronics Inventory."""

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.extensions import db

if TYPE_CHECKING:
    from app.models.location import Location


class Box(db.Model):  # type: ignore[name-defined]
    """Model representing a storage box with numbered locations."""

    __tablename__ = "boxes"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    box_no: Mapped[int] = mapped_column(unique=True, nullable=False)
    description: Mapped[str] = mapped_column(nullable=False)
    capacity: Mapped[int] = mapped_column(nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        nullable=False, server_default=func.now(), onupdate=func.now()
    )

    # Relationships
    locations: Mapped[list["Location"]] = relationship(  # type: ignore[assignment]
        "Location", back_populates="box", cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:
        return f"<Box {self.box_no}: {self.description}>"
