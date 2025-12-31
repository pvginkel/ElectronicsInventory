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
from app.utils.cas_url import build_cas_url

if TYPE_CHECKING:
    from app.models.attachment_set import AttachmentSet
    from app.models.kit_content import KitContent
    from app.models.part_location import PartLocation
    from app.models.quantity_history import QuantityHistory
    from app.models.seller import Seller
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
    seller_id: Mapped[int | None] = mapped_column(
        ForeignKey("sellers.id"), nullable=True
    )
    seller_link: Mapped[str | None] = mapped_column(String(500), nullable=True)
    attachment_set_id: Mapped[int] = mapped_column(
        ForeignKey("attachment_sets.id"), nullable=False
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
    # Note: lazy="select" (default) to avoid cascading eager loads.
    # Use explicit selectinload() in queries where relationships are needed.
    type: Mapped[Optional["Type"]] = relationship(
        "Type", back_populates="parts", lazy="select"
    )
    seller: Mapped[Optional["Seller"]] = relationship(
        "Seller", back_populates="parts", lazy="select"
    )
    part_locations: Mapped[list["PartLocation"]] = relationship(
        "PartLocation", back_populates="part", cascade="all, delete-orphan", lazy="select"
    )
    quantity_history: Mapped[list["QuantityHistory"]] = relationship(
        "QuantityHistory", back_populates="part", cascade="all, delete-orphan", lazy="select"
    )
    kit_contents: Mapped[list["KitContent"]] = relationship(
        "KitContent",
        back_populates="part",
        lazy="select",
    )
    attachment_set: Mapped["AttachmentSet"] = relationship(
        "AttachmentSet",
        lazy="select",
        foreign_keys=[attachment_set_id],
        cascade="all, delete-orphan",
        single_parent=True
    )

    @property
    def cover_url(self) -> str | None:
        """Build CAS URL for the cover image from AttachmentSet.

        Returns the base URL for the cover image, or None if no cover is set
        or the cover is not an image (e.g., a PDF).
        Client can append ?thumbnail=<size> to get a specific thumbnail size.
        """
        if self.attachment_set and self.attachment_set.cover_attachment:
            cover = self.attachment_set.cover_attachment
            if cover.has_preview:
                return build_cas_url(cover.s3_key)

        return None

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
