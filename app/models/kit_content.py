"""Kit content model representing bill-of-material entries for kits."""

from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    ForeignKey,
    Integer,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.extensions import db

if TYPE_CHECKING:  # pragma: no cover - only used for type checking
    from app.models.kit import Kit
    from app.models.kit_pick_list_line import KitPickListLine
    from app.models.part import Part


class KitContent(db.Model):  # type: ignore[name-defined]
    """Bill-of-material entry linking a kit to the parts it requires."""

    __tablename__ = "kit_contents"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    kit_id: Mapped[int] = mapped_column(
        ForeignKey("kits.id", ondelete="CASCADE"), nullable=False
    )
    part_id: Mapped[int] = mapped_column(
        ForeignKey("parts.id", ondelete="CASCADE"), nullable=False
    )
    required_per_unit: Mapped[int] = mapped_column(Integer, nullable=False)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    version: Mapped[int] = mapped_column(
        BigInteger,
        nullable=False,
        default=1,
        server_default="1",
    )
    created_at: Mapped[datetime] = mapped_column(
        nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        nullable=False, server_default=func.now(), onupdate=func.now()
    )

    __table_args__ = (
        CheckConstraint(
            "required_per_unit >= 1",
            name="ck_kit_contents_required_positive",
        ),
        UniqueConstraint(
            "kit_id",
            "part_id",
            name="uq_kit_contents_kit_part",
        ),
    )

    __mapper_args__ = {"version_id_col": version}

    kit: Mapped[Kit] = relationship(
        "Kit",
        back_populates="contents",
        lazy="selectin",
    )
    part: Mapped[Part] = relationship(
        "Part",
        back_populates="kit_contents",
        lazy="selectin",
    )
    pick_list_lines: Mapped[list["KitPickListLine"]] = relationship(
        "KitPickListLine",
        back_populates="kit_content",
        cascade="all, delete-orphan",
        lazy="selectin",
    )

    def __repr__(self) -> str:
        return (
            "<KitContent "
            f"id={self.id} kit_id={self.kit_id} part_id={self.part_id} "
            f"required_per_unit={self.required_per_unit}>"
        )

    @property
    def part_key(self) -> str:
        """Expose the associated part key for schema compatibility."""
        return self.part.key if self.part else ""

    @property
    def part_description(self) -> str | None:
        """Expose the associated part description for schema compatibility."""
        return self.part.description if self.part else None
