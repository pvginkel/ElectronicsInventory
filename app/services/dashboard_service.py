"""Dashboard service for aggregating dashboard statistics and data."""

from datetime import UTC, datetime, timedelta
from typing import TYPE_CHECKING, cast

from sqlalchemy import func, select

from app.models.box import Box
from app.models.part import Part
from app.models.part_attachment import PartAttachment
from app.models.part_location import PartLocation
from app.models.quantity_history import QuantityHistory
from app.models.type import Type
from app.services.base import BaseService
from app.services.type_service import TypeService

if TYPE_CHECKING:
    pass


class DashboardService(BaseService):
    """Service class for dashboard data aggregation operations."""

    def get_dashboard_stats(self) -> dict:
        """Returns aggregated dashboard statistics.

        Returns:
            Dictionary containing total parts count, total quantity,
            active boxes count, types count, recent activity counts,
            and low stock count.
        """
        # Query total parts count
        parts_count_stmt = select(func.count(Part.id))
        total_parts = self.db.execute(parts_count_stmt).scalar() or 0

        # Calculate total quantity sum from part_locations table
        quantity_sum_stmt = select(func.sum(PartLocation.qty))
        total_quantity = self.db.execute(quantity_sum_stmt).scalar() or 0

        # Count active boxes
        boxes_count_stmt = select(func.count(Box.id))
        total_boxes = self.db.execute(boxes_count_stmt).scalar() or 0

        # Count types
        types_count_stmt = select(func.count(Type.id))
        total_types = self.db.execute(types_count_stmt).scalar() or 0

        # Count quantity changes in last 7 and 30 days
        now = datetime.now(UTC)
        seven_days_ago = now - timedelta(days=7)
        thirty_days_ago = now - timedelta(days=30)

        changes_7d_stmt = select(func.count(QuantityHistory.id)).where(
            QuantityHistory.timestamp >= seven_days_ago
        )
        changes_7d = self.db.execute(changes_7d_stmt).scalar() or 0

        changes_30d_stmt = select(func.count(QuantityHistory.id)).where(
            QuantityHistory.timestamp >= thirty_days_ago
        )
        changes_30d = self.db.execute(changes_30d_stmt).scalar() or 0

        # Count parts with total quantity <= 5
        low_stock_subquery = select(
            PartLocation.part_id,
            func.sum(PartLocation.qty).label('total_qty')
        ).group_by(PartLocation.part_id).subquery()

        low_stock_stmt = select(func.count()).select_from(
            low_stock_subquery
        ).where(low_stock_subquery.c.total_qty <= 5)

        low_stock_count = self.db.execute(low_stock_stmt).scalar() or 0

        return {
            'total_parts': total_parts,
            'total_quantity': total_quantity,
            'total_boxes': total_boxes,
            'total_types': total_types,
            'changes_7d': changes_7d,
            'changes_30d': changes_30d,
            'low_stock_count': low_stock_count
        }

    def get_recent_activity(self, limit: int = 20) -> list[dict]:
        """Returns recent stock changes.

        Args:
            limit: Maximum number of activity records to return

        Returns:
            List of dictionaries containing part key, description,
            delta quantity, location reference, and timestamp.
        """
        stmt = select(QuantityHistory, Part.key, Part.description).join(
            Part, QuantityHistory.part_id == Part.id
        ).order_by(QuantityHistory.timestamp.desc()).limit(limit)

        results = self.db.execute(stmt).all()

        activities = []
        for history, part_key, part_description in results:
            activities.append({
                'part_key': part_key,
                'part_description': part_description,
                'delta_qty': history.delta_qty,
                'location_reference': history.location_reference,
                'timestamp': history.timestamp
            })

        return activities

    def get_storage_summary(self) -> list[dict]:
        """Returns box utilization summary.

        Returns:
            List of dictionaries containing box_no, description,
            total_locations (capacity), occupied_locations, and usage_percentage.
        """
        # Query all boxes with their capacities and count occupied locations
        stmt = select(
            Box.box_no,
            Box.description,
            Box.capacity,
            func.count(func.distinct(
                func.concat(PartLocation.box_no, '-', PartLocation.loc_no)
            )).label('occupied_locations')
        ).outerjoin(
            PartLocation, Box.box_no == PartLocation.box_no
        ).group_by(Box.id, Box.box_no, Box.description, Box.capacity).order_by(Box.box_no)

        results = self.db.execute(stmt).all()

        storage_data = []
        for box_no, description, capacity, occupied_locations in results:
            occupied = occupied_locations or 0
            usage_percentage = (occupied / capacity * 100) if capacity > 0 else 0

            storage_data.append({
                'box_no': box_no,
                'description': description,
                'total_locations': capacity,
                'occupied_locations': occupied,
                'usage_percentage': round(usage_percentage, 1)
            })

        return storage_data

    def get_low_stock_items(self, threshold: int = 5) -> list[dict]:
        """Returns parts below threshold quantity.

        Args:
            threshold: Quantity threshold below which parts are considered low stock

        Returns:
            List of dictionaries containing part key, description,
            type name, and current quantity, ordered by quantity ascending.
        """
        # Aggregate quantities per part
        part_qty_subquery = select(
            PartLocation.part_id,
            func.sum(PartLocation.qty).label('total_qty')
        ).group_by(PartLocation.part_id).subquery()

        # Join with parts and types to get complete information
        stmt = select(
            Part.key,
            Part.description,
            Type.name.label('type_name'),
            part_qty_subquery.c.total_qty
        ).join(
            part_qty_subquery, Part.id == part_qty_subquery.c.part_id
        ).outerjoin(
            Type, Part.type_id == Type.id
        ).where(
            part_qty_subquery.c.total_qty <= threshold
        ).order_by(part_qty_subquery.c.total_qty.asc())

        results = self.db.execute(stmt).all()

        low_stock_items = []
        for part_key, description, type_name, total_qty in results:
            low_stock_items.append({
                'part_key': part_key,
                'description': description,
                'type_name': type_name,
                'current_quantity': total_qty or 0
            })

        return low_stock_items

    def get_category_distribution(self) -> list[dict]:
        """Returns part counts by type/category.

        Returns:
            List of dictionaries containing type name and part count,
            ordered by part count descending.
        """
        # Use existing method from type_service
        type_service = TypeService(self.db)
        types_with_counts = type_service.get_all_types_with_part_counts()

        distribution: list[dict[str, int | str]] = []
        for type_with_count in types_with_counts:
            distribution.append({
                'type_name': type_with_count.type.name,
                'part_count': type_with_count.part_count
            })

        # Sort by part count descending
        distribution.sort(key=lambda x: cast(int, x['part_count']), reverse=True)
        return distribution

    def get_parts_without_documents(self) -> dict:
        """Returns count and sample of parts without documents.

        Returns:
            Dictionary containing count of undocumented parts
            and list of first 10 part details.
        """
        # Simplified approach: find parts without entries in part_attachments table
        # Use a simpler LEFT JOIN approach
        parts_without_docs_stmt = select(Part).outerjoin(
            PartAttachment, Part.id == PartAttachment.part_id
        ).where(PartAttachment.id.is_(None))

        # Get all undocumented parts (for counting)
        all_undocumented_parts = self.db.execute(parts_without_docs_stmt).scalars().all()
        total_count = len(all_undocumented_parts)

        # Take first 10 for sample
        sample_parts = all_undocumented_parts[:10]

        sample_data = []
        for part in sample_parts:
            sample_data.append({
                'part_key': part.key,
                'description': part.description,
                'type_name': part.type.name if part.type else None
            })

        return {
            'count': total_count,
            'sample_parts': sample_data
        }
