"""PartSeller link model for many-to-many part-seller relationships."""

from datetime import datetime

from sqlalchemy import ForeignKey, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.extensions import db


class PartSeller(db.Model):  # type: ignore[name-defined]
    """Link table between parts and sellers, storing a seller-specific product URL."""

    __tablename__ = "part_sellers"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    part_id: Mapped[int] = mapped_column(
        ForeignKey("parts.id", ondelete="CASCADE"), nullable=False, index=True
    )
    seller_id: Mapped[int] = mapped_column(
        ForeignKey("sellers.id", ondelete="CASCADE"), nullable=False, index=True
    )
    link: Mapped[str] = mapped_column(String(500), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        nullable=False, server_default=func.now()
    )

    __table_args__ = (
        UniqueConstraint("part_id", "seller_id", name="uq_part_sellers_part_seller"),
    )

    # Relationships
    part = relationship("Part", back_populates="seller_links", lazy="select")
    seller = relationship("Seller", back_populates="part_sellers", lazy="select")

    @property
    def seller_name(self) -> str:
        """Seller name for flat schema serialization via from_attributes."""
        return self.seller.name if self.seller else ""

    @property
    def seller_website(self) -> str:
        """Seller website for flat schema serialization via from_attributes."""
        return self.seller.website if self.seller else ""

    @property
    def logo_url(self) -> str | None:
        """Seller logo URL for flat schema serialization via from_attributes."""
        return self.seller.logo_url if self.seller else None

    def __repr__(self) -> str:
        return f"<PartSeller id={self.id} part_id={self.part_id} seller_id={self.seller_id}>"
