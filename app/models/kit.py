"""Kit model for grouping inventory into build-ready bundles."""

from __future__ import annotations

from datetime import datetime
from enum import StrEnum
from typing import TYPE_CHECKING

from sqlalchemy import (
    CheckConstraint,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy import Enum as SQLEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.extensions import db
from app.utils.cas_url import build_cas_url

if TYPE_CHECKING:
    from app.models.attachment_set import AttachmentSet
    from app.models.kit_content import KitContent
    from app.models.kit_pick_list import KitPickList
    from app.models.kit_shopping_list_link import KitShoppingListLink


class KitStatus(StrEnum):
    """Lifecycle status for a kit."""

    ACTIVE = "active"
    ARCHIVED = "archived"


class Kit(db.Model):  # type: ignore[name-defined]
    """Model representing a kit definition for build planning."""

    __tablename__ = "kits"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    build_target: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        server_default="1",
    )
    status: Mapped[KitStatus] = mapped_column(
        SQLEnum(
            KitStatus,
            name="kit_status",
            values_callable=lambda enum_cls: [item.value for item in enum_cls],
            native_enum=False,
        ),
        nullable=False,
        default=KitStatus.ACTIVE,
        server_default=KitStatus.ACTIVE.value,
        index=True,
    )
    attachment_set_id: Mapped[int] = mapped_column(
        ForeignKey("attachment_sets.id"), nullable=False
    )
    archived_at: Mapped[datetime | None] = mapped_column(nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        nullable=False, server_default=func.now(), onupdate=func.now()
    )

    __table_args__ = (
        UniqueConstraint("name", name="uq_kits_name"),
        CheckConstraint("build_target >= 0", name="ck_kits_build_target_non_negative"),
        CheckConstraint(
            "(status != 'archived') OR (archived_at IS NOT NULL)",
            name="ck_kits_archived_requires_timestamp",
        ),
    )

    shopping_list_links: Mapped[list[KitShoppingListLink]] = relationship(
        "KitShoppingListLink",
        back_populates="kit",
        cascade="all, delete-orphan",
        lazy="selectin",
        order_by="KitShoppingListLink.created_at",
    )
    pick_lists: Mapped[list[KitPickList]] = relationship(
        "KitPickList",
        back_populates="kit",
        cascade="all, delete-orphan",
        lazy="selectin",
    )
    contents: Mapped[list[KitContent]] = relationship(
        "KitContent",
        back_populates="kit",
        cascade="all, delete-orphan",
        lazy="selectin",
    )
    attachment_set: Mapped[AttachmentSet] = relationship(
        "AttachmentSet",
        lazy="selectin",
        foreign_keys=[attachment_set_id],
        cascade="all, delete-orphan",
        single_parent=True
    )

    @property
    def is_archived(self) -> bool:
        """Return whether the kit is archived based on current status."""
        return self.status is KitStatus.ARCHIVED

    @property
    def has_contents(self) -> bool:
        """Return True if the kit has at least one BOM entry attached."""
        return bool(self.contents)

    @property
    def shopping_list_badge_count(self) -> int:
        """Return cached badge count or derive from current links."""
        return getattr(self, "_shopping_list_badge_count", len(self.shopping_list_links))

    @shopping_list_badge_count.setter
    def shopping_list_badge_count(self, value: int) -> None:
        """Store computed badge count for API serialization."""
        self._shopping_list_badge_count = value

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
        return (
            f"<Kit id={self.id} name={self.name!r} "
            f"status={self.status.value} build_target={self.build_target}>"
        )
