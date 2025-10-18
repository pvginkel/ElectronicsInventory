"""Service encapsulating pick list allocation and deduction workflows."""

from __future__ import annotations

from collections import defaultdict
from collections.abc import Sequence
from datetime import UTC, datetime
from time import perf_counter

from sqlalchemy import Select, select
from sqlalchemy.orm import Session, selectinload

from app.exceptions import InvalidOperationException, RecordNotFoundException
from app.models.kit import Kit, KitStatus
from app.models.kit_content import KitContent
from app.models.kit_pick_list import KitPickList, KitPickListStatus
from app.models.kit_pick_list_line import KitPickListLine, PickListLineStatus
from app.models.part_location import PartLocation
from app.services.base import BaseService
from app.services.inventory_service import InventoryService
from app.services.metrics_service import MetricsServiceProtocol


class KitPickListService(BaseService):
    """Business logic for pick list creation, picking, and undo flows."""

    def __init__(
        self,
        db: Session,
        inventory_service: InventoryService,
        metrics_service: MetricsServiceProtocol,
    ) -> None:
        super().__init__(db)
        self.inventory_service = inventory_service
        self.metrics_service = metrics_service

    def create_pick_list(self, kit_id: int, requested_units: int) -> KitPickList:
        """Create a new pick list with greedy allocation across locations."""
        if requested_units < 1:
            raise InvalidOperationException(
                "create pick list",
                "requested units must be at least 1",
            )

        kit = self._get_active_kit_with_contents(kit_id)
        if not kit.contents:
            raise InvalidOperationException(
                "create pick list",
                "kit has no contents to allocate",
            )

        contents = list(kit.contents)
        part_ids = [
            content.part_id for content in contents if content.part_id is not None
        ]
        if not part_ids:
            raise InvalidOperationException(
                "create pick list",
                "kit contents are missing part relationships",
            )

        locations_by_part = self._load_part_locations(part_ids)
        planned_lines: list[tuple[KitContent, int, PartLocation]] = []

        for content in contents:
            required_total = content.required_per_unit * requested_units
            remaining = required_total
            part_locations = list(locations_by_part.get(content.part_id, []))

            for candidate in part_locations:
                if remaining <= 0:
                    break
                allocation = min(remaining, candidate.qty)
                if allocation <= 0:
                    continue
                planned_lines.append((content, allocation, candidate))
                remaining -= allocation

            if remaining > 0:
                part_key = content.part.key if content.part else "unknown"
                raise InvalidOperationException(
                    "create pick list",
                    f"insufficient stock to allocate {required_total} units of {part_key}",
                )

        pick_list = KitPickList(
            kit_id=kit.id,
            requested_units=requested_units,
            status=KitPickListStatus.OPEN,
        )
        self.db.add(pick_list)
        self.db.flush()

        for content, quantity_to_pick, location in planned_lines:
            line = KitPickListLine(
                pick_list=pick_list,
                kit_content_id=content.id,
                location_id=location.location_id,
                quantity_to_pick=quantity_to_pick,
                status=PickListLineStatus.OPEN,
            )
            self.db.add(line)

        self.db.flush()
        self.metrics_service.record_pick_list_created(
            kit_id=kit.id,
            requested_units=requested_units,
            line_count=len(planned_lines),
        )
        return pick_list

    def get_pick_list_detail(self, pick_list_id: int) -> KitPickList:
        """Return a pick list with eager loaded lines for detailed views."""
        stmt = (
            select(KitPickList)
            .options(
                selectinload(KitPickList.kit),
                selectinload(KitPickList.lines)
                .selectinload(KitPickListLine.kit_content)
                .selectinload(KitContent.part),
                selectinload(KitPickList.lines).selectinload(
                    KitPickListLine.location
                ),
            )
            .where(KitPickList.id == pick_list_id)
        )
        pick_list = self.db.execute(stmt).unique().scalar_one_or_none()
        if pick_list is None:
            raise RecordNotFoundException("Pick list", pick_list_id)

        pick_list.lines[:] = sorted(
            pick_list.lines,
            key=lambda line: (
                line.kit_content.part.key if line.kit_content and line.kit_content.part else "",
                line.location.box_no if line.location else 0,
                line.location.loc_no if line.location else 0,
                line.id or 0,
            ),
        )
        self.metrics_service.record_pick_list_detail_request(pick_list_id)
        return pick_list

    def list_pick_lists_for_kit(self, kit_id: int) -> list[KitPickList]:
        """List pick lists for the given kit ordered by creation time."""
        if self.db.get(Kit, kit_id) is None:
            raise RecordNotFoundException("Kit", kit_id)

        stmt: Select[KitPickList] = (
            select(KitPickList)
            .options(
                selectinload(KitPickList.lines)
                .selectinload(KitPickListLine.kit_content)
                .selectinload(KitContent.part),
                selectinload(KitPickList.lines).selectinload(
                    KitPickListLine.location
                ),
            )
            .where(KitPickList.kit_id == kit_id)
            .order_by(KitPickList.created_at.desc(), KitPickList.id.desc())
        )

        pick_lists = list(self.db.execute(stmt).scalars().unique().all())
        self.metrics_service.record_pick_list_list_request(
            kit_id,
            len(pick_lists),
        )
        return pick_lists

    def pick_line(self, pick_list_id: int, line_id: int) -> KitPickListLine:
        """Remove inventory and mark the line as picked."""
        line = self._get_line_for_update(pick_list_id, line_id)
        if line.status is PickListLineStatus.COMPLETED:
            raise InvalidOperationException(
                "pick pick list line",
                "line already completed",
            )

        if not line.kit_content or not line.kit_content.part:
            raise InvalidOperationException(
                "pick pick list line",
                "line is missing part linkage",
            )
        if not line.location:
            raise InvalidOperationException(
                "pick pick list line",
                "line is missing location linkage",
            )

        history = self.inventory_service.remove_stock(
            line.kit_content.part.key,
            line.location.box_no,
            line.location.loc_no,
            line.quantity_to_pick,
        )

        line.inventory_change_id = history.id
        line.picked_at = datetime.now(UTC)
        line.status = PickListLineStatus.COMPLETED

        pick_list = line.pick_list
        if all(
            sibling.status is PickListLineStatus.COMPLETED
            for sibling in pick_list.lines
        ):
            pick_list.status = KitPickListStatus.COMPLETED
            pick_list.completed_at = datetime.now(UTC)

        self.db.flush()
        self.metrics_service.record_pick_list_line_picked(
            line_id=line.id or 0,
            quantity=line.quantity_to_pick,
        )
        return line

    def undo_line(self, pick_list_id: int, line_id: int) -> KitPickListLine:
        """Undo a previously picked line by returning stock to inventory."""
        start = perf_counter()
        line = self._get_line_for_update(pick_list_id, line_id)

        if line.status is PickListLineStatus.OPEN:
            duration = perf_counter() - start
            self.metrics_service.record_pick_list_line_undo("noop", duration)
            return line

        if line.inventory_change_id is None:
            duration = perf_counter() - start
            self.metrics_service.record_pick_list_line_undo("error", duration)
            raise InvalidOperationException(
                "undo pick list line",
                "line is missing inventory change reference",
            )

        if not line.kit_content or not line.kit_content.part or not line.location:
            duration = perf_counter() - start
            self.metrics_service.record_pick_list_line_undo("error", duration)
            raise InvalidOperationException(
                "undo pick list line",
                "line is missing inventory metadata",
            )

        self.inventory_service.add_stock(
            line.kit_content.part.key,
            line.location.box_no,
            line.location.loc_no,
            line.quantity_to_pick,
        )

        line.inventory_change_id = None
        line.picked_at = None
        line.status = PickListLineStatus.OPEN

        pick_list = line.pick_list
        if pick_list.status is KitPickListStatus.COMPLETED:
            pick_list.status = KitPickListStatus.OPEN
            pick_list.completed_at = None

        self.db.flush()
        duration = perf_counter() - start
        self.metrics_service.record_pick_list_line_undo("success", duration)
        return line

    def _get_active_kit_with_contents(self, kit_id: int) -> Kit:
        """Fetch kit with contents ensuring it is active."""
        stmt = (
            select(Kit)
            .options(
                selectinload(Kit.contents).selectinload(KitContent.part),
            )
            .where(Kit.id == kit_id)
        )
        kit = self.db.execute(stmt).unique().scalar_one_or_none()
        if kit is None:
            raise RecordNotFoundException("Kit", kit_id)
        if kit.status is not KitStatus.ACTIVE:
            raise InvalidOperationException(
                "create pick list",
                "cannot create pick lists for archived kits",
            )
        return kit

    def _load_part_locations(
        self,
        part_ids: Sequence[int],
    ) -> dict[int, list[PartLocation]]:
        """Return available part locations grouped by part id."""
        if not part_ids:
            return {}

        unique_ids = tuple(dict.fromkeys(part_ids))
        stmt: Select[PartLocation] = (
            select(PartLocation)
            .where(PartLocation.part_id.in_(unique_ids))
            .order_by(
                PartLocation.part_id,
                PartLocation.qty,
                PartLocation.box_no,
                PartLocation.loc_no,
                PartLocation.id,
            )
        )
        grouped: dict[int, list[PartLocation]] = defaultdict(list)
        for location in self.db.execute(stmt).scalars().all():
            grouped[location.part_id].append(location)
        return grouped

    def _get_line_for_update(
        self,
        pick_list_id: int,
        line_id: int,
    ) -> KitPickListLine:
        """Load a pick list line with metadata under row-level lock."""
        stmt = (
            select(KitPickListLine)
            .options(
                selectinload(KitPickListLine.pick_list),
                selectinload(KitPickListLine.kit_content).selectinload(
                    KitContent.part
                ),
                selectinload(KitPickListLine.location),
            )
            .where(
                KitPickListLine.id == line_id,
                KitPickListLine.pick_list_id == pick_list_id,
            )
            .with_for_update()
        )
        line = self.db.execute(stmt).unique().scalar_one_or_none()
        if line is None:
            raise RecordNotFoundException("Pick list line", line_id)
        return line
