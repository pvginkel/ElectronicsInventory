"""Service for calculating reserved kit quantities for parts."""

from __future__ import annotations

from collections.abc import Sequence

from sqlalchemy import Select, func, select
from sqlalchemy.orm import Session

from app.models.kit import Kit, KitStatus
from app.models.kit_content import KitContent
from app.services.base import BaseService


class KitReservationService(BaseService):
    """Aggregate kit reservations to support availability calculations."""

    def __init__(self, db: Session):
        super().__init__(db)

    def get_reserved_totals_for_parts(
        self,
        part_ids: Sequence[int],
        *,
        exclude_kit_id: int | None = None,
    ) -> dict[int, int]:
        """Return reserved quantities for the given part ids.

        Excludes archived kits and optionally skips reservations from a specific kit.
        """
        if not part_ids:
            return {}

        stmt: Select[tuple[int, int]] = (
            select(
                KitContent.part_id,
                func.coalesce(
                    func.sum(KitContent.required_per_unit * Kit.build_target),
                    0,
                ),
            )
            .join(Kit, Kit.id == KitContent.kit_id)
            .where(
                KitContent.part_id.in_(part_ids),
                Kit.status == KitStatus.ACTIVE,
            )
            .group_by(KitContent.part_id)
        )

        if exclude_kit_id is not None:
            stmt = stmt.where(Kit.id != exclude_kit_id)

        totals = {part_id: 0 for part_id in part_ids}
        for part_id, reserved in self.db.execute(stmt).all():
            totals[int(part_id)] = int(reserved or 0)

        return totals

    def get_reserved_quantity(
        self,
        part_id: int,
        *,
        exclude_kit_id: int | None = None,
    ) -> int:
        """Return reserved quantity for a single part id."""
        totals = self.get_reserved_totals_for_parts(
            [part_id],
            exclude_kit_id=exclude_kit_id,
        )
        return totals.get(part_id, 0)
