"""Service for calculating reserved kit quantities for parts."""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from datetime import datetime
from typing import Any

from sqlalchemy import Select, select
from sqlalchemy.orm import Session

from app.exceptions import RecordNotFoundException
from app.models.kit import Kit, KitStatus
from app.models.kit_content import KitContent
from app.models.part import Part
from app.services.base import BaseService


@dataclass(frozen=True, slots=True)
class KitReservationUsage:
    """Reservation entry describing how an active kit consumes a part."""

    part_id: int
    kit_id: int
    kit_name: str
    status: KitStatus
    build_target: int
    required_per_unit: int
    reserved_quantity: int
    updated_at: datetime


class KitReservationService(BaseService):
    """Aggregate kit reservations to support availability calculations."""

    def __init__(self, db: Session):
        super().__init__(db)
        self._usage_cache: dict[int, list[KitReservationUsage]] = {}

    def get_reservations_by_part_ids(
        self,
        part_ids: Sequence[int],
    ) -> dict[int, list[KitReservationUsage]]:
        """Return active kit reservations grouped by part id."""
        if not part_ids:
            return {}

        sanitized_part_ids = [
            int(part_id) for part_id in part_ids if part_id is not None
        ]
        if not sanitized_part_ids:
            return {}

        self._ensure_usage_cache(sanitized_part_ids)
        reservations: dict[int, list[KitReservationUsage]] = {}
        for part_id in sanitized_part_ids:
            reservations[part_id] = list(self._usage_cache.get(part_id, []))
        return reservations

    def list_active_reservations_for_part(
        self,
        part_id: int,
    ) -> list[KitReservationUsage]:
        """Return active kit usage entries for a single part."""
        return self.get_reservations_by_part_ids([part_id]).get(part_id, [])

    def list_kits_for_part(self, part_key: str) -> list[KitReservationUsage]:
        """Return active kit usage for the part identified by key."""
        stmt = select(Part.id).where(Part.key == part_key)
        part_id = self.db.execute(stmt).scalar_one_or_none()
        if part_id is None:
            raise RecordNotFoundException("Part", part_key)

        return self.list_active_reservations_for_part(part_id)

    def get_reserved_totals_for_parts(
        self,
        part_ids: Sequence[int],
        *,
        exclude_kit_id: int | None = None,
    ) -> dict[int, int]:
        """Return reserved quantities for the given part ids.

        Excludes archived kits and optionally skips reservations from a specific kit.
        """
        reservations = self.get_reservations_by_part_ids(part_ids)
        totals: dict[int, int] = {}

        for part_id in reservations:
            totals[part_id] = self._sum_reservations(
                reservations[part_id],
                exclude_kit_id=exclude_kit_id,
            )

        # Ensure all part ids requested appear in the response.
        for requested_id in part_ids:
            if requested_id is None:
                continue
            totals.setdefault(int(requested_id), 0)

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

    # Internal helpers -----------------------------------------------------

    def _ensure_usage_cache(self, part_ids: Sequence[int]) -> None:
        """Populate cache entries for the requested part ids."""
        unique_ids = {int(part_id) for part_id in part_ids}
        missing = [part_id for part_id in unique_ids if part_id not in self._usage_cache]
        if not missing:
            return

        usage_by_part: dict[int, list[KitReservationUsage]] = {
            part_id: [] for part_id in missing
        }

        stmt: Select[tuple[Any, ...]] = (
            select(
                KitContent.part_id,
                Kit.id,
                Kit.name,
                Kit.status,
                Kit.build_target,
                KitContent.required_per_unit,
                (KitContent.required_per_unit * Kit.build_target).label(
                    "reserved_quantity"
                ),
                Kit.updated_at,
            )
            .join(Kit, Kit.id == KitContent.kit_id)
            .where(
                KitContent.part_id.in_(missing),
                Kit.status == KitStatus.ACTIVE,
            )
            .order_by(
                KitContent.part_id,
                Kit.name,
                Kit.id,
            )
        )

        for row in self.db.execute(stmt).all():
            (
                part_id,
                kit_id,
                kit_name,
                kit_status,
                build_target,
                required_per_unit,
                reserved_quantity,
                kit_updated_at,
            ) = row
            entry = KitReservationUsage(
                part_id=int(part_id),
                kit_id=int(kit_id),
                kit_name=str(kit_name),
                status=KitStatus(kit_status),
                build_target=int(build_target),
                required_per_unit=int(required_per_unit),
                reserved_quantity=int(reserved_quantity),
                updated_at=kit_updated_at,
            )
            usage_by_part[int(part_id)].append(entry)

        for part_id in missing:
            self._usage_cache[part_id] = usage_by_part.get(part_id, [])

    @staticmethod
    def _sum_reservations(
        entries: Sequence[KitReservationUsage],
        *,
        exclude_kit_id: int | None,
    ) -> int:
        """Return the aggregated reserved quantity for the entries."""
        total = 0
        for entry in entries:
            if exclude_kit_id is not None and entry.kit_id == exclude_kit_id:
                continue
            total += entry.reserved_quantity
        return total
