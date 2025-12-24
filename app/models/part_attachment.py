"""Part attachment model for Electronics Inventory."""

from datetime import datetime
from enum import Enum
from typing import TYPE_CHECKING

from sqlalchemy import Enum as SQLEnum
from sqlalchemy import ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.extensions import db
from app.utils.cas_url import build_cas_url

if TYPE_CHECKING:
    from app.models.part import Part


class AttachmentType(str, Enum):
    """Enum for attachment types."""

    URL = "url"
    IMAGE = "image"
    PDF = "pdf"


class PartAttachment(db.Model):  # type: ignore[name-defined]
    """Model representing attachments (images, PDFs, URLs) for electronics parts."""

    __tablename__ = "part_attachments"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    part_id: Mapped[int] = mapped_column(
        ForeignKey("parts.id", ondelete="CASCADE"), nullable=False
    )
    attachment_type: Mapped[AttachmentType] = mapped_column(
        SQLEnum(AttachmentType, name="attachment_type", values_callable=lambda obj: [e.value for e in obj]),
        nullable=False
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    s3_key: Mapped[str | None] = mapped_column(String(500), nullable=True)
    url: Mapped[str | None] = mapped_column(String(2000), nullable=True)
    filename: Mapped[str | None] = mapped_column(String(255), nullable=True)
    content_type: Mapped[str | None] = mapped_column(String(100), nullable=True)
    file_size: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        nullable=False, server_default=func.now(), onupdate=func.now()
    )

    # Relationships
    part: Mapped["Part"] = relationship(
        "Part", back_populates="attachments", lazy="selectin",
        foreign_keys=[part_id]
    )

    def __repr__(self) -> str:
        return f"<PartAttachment {self.id}: {self.attachment_type.value} - {self.title}>"

    @property
    def has_preview(self) -> bool:
        """Check if this attachment has a preview image (computed property)."""
        # Only image content types have previews
        return self.content_type is not None and self.content_type.startswith('image/')

    @property
    def attachment_url(self) -> str | None:
        """Build CAS URL from s3_key and metadata.

        Returns the base URL with content_type and filename pre-baked.
        Client can append &disposition=attachment or &thumbnail=<size> as needed.
        """
        return build_cas_url(self.s3_key, self.content_type, self.filename)
