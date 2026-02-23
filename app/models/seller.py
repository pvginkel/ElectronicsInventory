from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.extensions import db
from app.utils.cas_url import build_cas_url

if TYPE_CHECKING:
    from app.models.part_seller import PartSeller


class Seller(db.Model):  # type: ignore[name-defined]
    __tablename__ = "sellers"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    website: Mapped[str] = mapped_column(String(500), nullable=False)
    logo_s3_key: Mapped[str | None] = mapped_column(String(500), nullable=True)
    created_at: Mapped[datetime] = mapped_column(default=func.now())
    updated_at: Mapped[datetime] = mapped_column(default=func.now(), onupdate=func.now())

    part_sellers: Mapped[list["PartSeller"]] = relationship(
        "PartSeller", back_populates="seller", cascade="all, delete-orphan"
    )

    @property
    def logo_url(self) -> str | None:
        """Build CAS URL for the seller logo image.

        Returns the base URL for the logo, or None if no logo is set.
        Client can append ?thumbnail=<size> to get a specific thumbnail size.
        """
        return build_cas_url(self.logo_s3_key)

    def __repr__(self) -> str:
        return f"<Seller(id={self.id}, name='{self.name}', website='{self.website}')>"
