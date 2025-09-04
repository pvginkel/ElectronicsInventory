"""Part model for Electronics Inventory."""

from datetime import datetime
from typing import TYPE_CHECKING, Optional

from sqlalchemy import (
    CHAR,
    JSON,
    CheckConstraint,
    ForeignKey,
    Integer,
    String,
    Text,
    func,
)
from sqlalchemy.dialects import postgresql
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.extensions import db

if TYPE_CHECKING:
    from app.models.part_attachment import PartAttachment
    from app.models.part_location import PartLocation
    from app.models.quantity_history import QuantityHistory
    from app.models.type import Type


class Part(db.Model):  # type: ignore[name-defined]
    """Model representing an electronics part with 4-character ID."""

    __tablename__ = "parts"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    key: Mapped[str] = mapped_column(CHAR(4), unique=True, nullable=False)
    manufacturer_code: Mapped[str | None] = mapped_column(String(255), nullable=True)
    type_id: Mapped[int | None] = mapped_column(
        ForeignKey("types.id"), nullable=True
    )
    description: Mapped[str] = mapped_column(Text, nullable=False)
    tags: Mapped[list[str] | None] = mapped_column(
        postgresql.ARRAY(Text).with_variant(JSON, "sqlite"), nullable=True
    )
    manufacturer: Mapped[str | None] = mapped_column(String(255), nullable=True)
    product_page: Mapped[str | None] = mapped_column(String(500), nullable=True)
    seller: Mapped[str | None] = mapped_column(String(255), nullable=True)
    seller_link: Mapped[str | None] = mapped_column(String(500), nullable=True)
    cover_attachment_id: Mapped[int | None] = mapped_column(
        ForeignKey("part_attachments.id", use_alter=True, name="fk_parts_cover_attachment"), nullable=True
    )

    # Extended technical fields
    package: Mapped[str | None] = mapped_column(String(100), nullable=True, index=True)
    pin_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    pin_pitch: Mapped[str | None] = mapped_column(String(50), nullable=True)
    voltage_rating: Mapped[str | None] = mapped_column(String(100), nullable=True, index=True)
    input_voltage: Mapped[str | None] = mapped_column(String(100), nullable=True)
    output_voltage: Mapped[str | None] = mapped_column(String(100), nullable=True)
    mounting_type: Mapped[str | None] = mapped_column(String(50), nullable=True, index=True)
    series: Mapped[str | None] = mapped_column(String(100), nullable=True, index=True)
    dimensions: Mapped[str | None] = mapped_column(String(100), nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        nullable=False, server_default=func.now(), onupdate=func.now()
    )

    # Table-level constraints
    __table_args__ = (
        CheckConstraint("pin_count > 0 OR pin_count IS NULL", name="ck_parts_pin_count_positive"),
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
    attachments: Mapped[list["PartAttachment"]] = relationship(  # type: ignore[assignment]
        "PartAttachment",
        back_populates="part",
        cascade="all, delete-orphan",
        lazy="selectin",
        foreign_keys="PartAttachment.part_id"
    )
    cover_attachment: Mapped[Optional["PartAttachment"]] = relationship(  # type: ignore[assignment]
        "PartAttachment",
        lazy="selectin",
        post_update=True,
        foreign_keys=[cover_attachment_id]
    )

    def __repr__(self) -> str:
        specs = []
        if self.package:
            specs.append(self.package)
        if self.voltage_rating:
            specs.append(self.voltage_rating)
        if self.pin_count:
            specs.append(f"{self.pin_count}-pin")

        specs_str = f" ({', '.join(specs)})" if specs else ""
        return f"<Part {self.key}: {self.manufacturer_code or 'N/A'}{specs_str}>"
