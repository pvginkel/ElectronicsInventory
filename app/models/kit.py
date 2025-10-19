"""Kit model for grouping inventory into build-ready bundles."""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import TYPE_CHECKING

from sqlalchemy import CheckConstraint, Integer, String, Text, UniqueConstraint, func
from sqlalchemy import Enum as SQLEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.extensions import db

if TYPE_CHECKING:
    from app.models.kit_content import KitContent
    from app.models.kit_pick_list import KitPickList
    from app.models.kit_shopping_list_link import KitShoppingListLink


class KitStatus(str, Enum):
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
    archived_at: Mapped[datetime | None] = mapped_column(nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        nullable=False, server_default=func.now(), onupdate=func.now()
    )

    __table_args__ = (
        UniqueConstraint("name", name="uq_kits_name"),
        CheckConstraint("build_target >= 1", name="ck_kits_build_target_positive"),
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

    def __repr__(self) -> str:
        return (
            f"<Kit id={self.id} name={self.name!r} "
            f"status={self.status.value} build_target={self.build_target}>"
        )
