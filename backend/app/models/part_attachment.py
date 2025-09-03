"""Part attachment model for Electronics Inventory."""

from datetime import datetime
from enum import Enum
from typing import TYPE_CHECKING

from sqlalchemy import Enum as SQLEnum
from sqlalchemy import ForeignKey, Integer, String, func
from sqlalchemy.dialects import postgresql
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.extensions import db

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
    attachment_metadata: Mapped[dict | None] = mapped_column(
        postgresql.JSONB().with_variant(postgresql.JSON, "sqlite"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        nullable=False, server_default=func.now(), onupdate=func.now()
    )

    # Relationships
    part: Mapped["Part"] = relationship(  # type: ignore[assignment]
        "Part", back_populates="attachments", lazy="selectin",
        foreign_keys=[part_id]
    )

    def __repr__(self) -> str:
        return f"<PartAttachment {self.id}: {self.attachment_type.value} - {self.title}>"

    @property
    def is_image(self) -> bool:
        """Check if this attachment is an image."""
        return self.attachment_type == AttachmentType.IMAGE

    @property
    def is_pdf(self) -> bool:
        """Check if this attachment is a PDF."""
        return self.attachment_type == AttachmentType.PDF

    @property
    def is_url(self) -> bool:
        """Check if this attachment is a URL."""
        return self.attachment_type == AttachmentType.URL

    @property
    def has_image(self) -> bool:
        """Check if this attachment has an associated image for display."""
        if self.attachment_type == AttachmentType.IMAGE:
            return True
        elif self.attachment_type == AttachmentType.PDF:
            return False
        else:  # URL attachment
            # Check if we have a stored thumbnail or if URL points directly to an image
            if self.s3_key:
                return True
            return False
