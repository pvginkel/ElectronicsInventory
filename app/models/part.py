"""Part model for Electronics Inventory."""

from datetime import datetime
from typing import TYPE_CHECKING, Optional

from sqlalchemy import CHAR, JSON, ForeignKey, String, Text, func
from sqlalchemy.dialects import postgresql
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.extensions import db

if TYPE_CHECKING:
    from app.models.part_location import PartLocation
    from app.models.quantity_history import QuantityHistory
    from app.models.type import Type


class Part(db.Model):  # type: ignore[name-defined]
    """Model representing an electronics part with 4-character ID."""

    __tablename__ = "parts"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    id4: Mapped[str] = mapped_column(CHAR(4), unique=True, nullable=False)
    manufacturer_code: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    type_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("types.id"), nullable=True
    )
    description: Mapped[str] = mapped_column(Text, nullable=False)
    tags: Mapped[Optional[list[str]]] = mapped_column(
        postgresql.ARRAY(Text).with_variant(JSON, "sqlite"), nullable=True
    )
    seller: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    seller_link: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        nullable=False, server_default=func.now(), onupdate=func.now()
    )

    # Relationships
    type: Mapped[Optional["Type"]] = relationship(  # type: ignore[assignment]
        "Type", back_populates="parts", lazy="selectin"
    )
    part_locations: Mapped[list["PartLocation"]] = relationship(  # type: ignore[assignment]
        "PartLocation", back_populates="part", cascade="all, delete-orphan", lazy="selectin"
    )
    quantity_history: Mapped[list["QuantityHistory"]] = relationship(  # type: ignore[assignment]
        "QuantityHistory", back_populates="part", cascade="all, delete-orphan", lazy="selectin"
    )

    def __repr__(self) -> str:
        return f"<Part {self.id4}: {self.manufacturer_code or 'N/A'}>"
