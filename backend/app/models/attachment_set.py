"""AttachmentSet model for managing attachments across Parts and Kits."""

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.extensions import db

if TYPE_CHECKING:
    from app.models.attachment import Attachment


class AttachmentSet(db.Model):  # type: ignore[name-defined]
    """Model representing a set of attachments that can be shared by Parts or Kits.

    AttachmentSet is the aggregate root for attachment management, owning a collection
    of Attachment instances and tracking which attachment (if any) serves as the cover.
    """

    __tablename__ = "attachment_sets"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    # Circular FK to attachments - use use_alter to defer constraint check
    cover_attachment_id: Mapped[int | None] = mapped_column(
        ForeignKey("attachments.id", ondelete="SET NULL", use_alter=True, name="fk_attachment_sets_cover"),
        nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        nullable=False, server_default=func.now(), onupdate=func.now()
    )

    # Relationships
    attachments: Mapped[list["Attachment"]] = relationship(
        "Attachment",
        back_populates="attachment_set",
        cascade="all, delete-orphan",
        lazy="select",
        foreign_keys="Attachment.attachment_set_id"
    )
    cover_attachment: Mapped["Attachment | None"] = relationship(
        "Attachment",
        lazy="select",
        post_update=True,
        foreign_keys=[cover_attachment_id]
    )

    def __repr__(self) -> str:
        return f"<AttachmentSet {self.id}: {len(self.attachments)} attachments>"
