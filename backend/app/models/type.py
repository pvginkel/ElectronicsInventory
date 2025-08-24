"""Type model for Electronics Inventory."""

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.extensions import db

if TYPE_CHECKING:
    from app.models.part import Part


class Type(db.Model):  # type: ignore[name-defined]
    """Model representing a part type/category."""

    __tablename__ = "types"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(unique=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        nullable=False, server_default=func.now(), onupdate=func.now()
    )

    # Relationships
    parts: Mapped[list["Part"]] = relationship(  # type: ignore[assignment]
        "Part", back_populates="type", lazy="selectin"
    )

    def __repr__(self) -> str:
        return f"<Type {self.id}: {self.name}>"
