"""Prometheus metrics service for collecting and exposing application metrics."""

import logging
import threading
import time
from abc import ABC, abstractmethod
from typing import TYPE_CHECKING

from prometheus_client import Counter, Gauge, Histogram, generate_latest

from app.utils.shutdown_coordinator import LifetimeEvent

if TYPE_CHECKING:
    from app.services.container import ServiceContainer
    from app.utils.shutdown_coordinator import ShutdownCoordinatorProtocol

logger = logging.getLogger(__name__)


class MetricsServiceProtocol(ABC):
    """Protocol for metrics service implementations."""

    @abstractmethod
    def initialize_metrics(self):
        """Initialize metric objects."""
        pass

    @abstractmethod
    def update_inventory_metrics(self):
        """Update inventory-related metrics."""
        pass

    @abstractmethod
    def update_storage_metrics(self):
        """Update storage-related metrics."""
        pass

    @abstractmethod
    def update_activity_metrics(self):
        """Update activity-related metrics."""
        pass

    @abstractmethod
    def update_category_metrics(self):
        """Update category-related metrics."""
        pass

    @abstractmethod
    def record_quantity_change(self, operation: str, delta: int):
        """Record quantity change events."""
        pass

    @abstractmethod
    def record_task_execution(self, task_type: str, duration: float, status: str):
        """Record task execution metrics."""
        pass

    @abstractmethod
    def record_shopping_list_line_receipt(self, lines: int, total_qty: int) -> None:
        """Record shopping list line stock receipt events."""
        pass

    def record_kit_created(self) -> None:
        """Record kit creation lifecycle events."""
        return None

    def record_kit_archived(self) -> None:
        """Record kit archive lifecycle events."""
        return None

    def record_kit_unarchived(self) -> None:
        """Record kit unarchive lifecycle events."""
        return None

    def record_kit_overview_request(self, status: str, result_count: int, limit: int | None = None) -> None:
        """Record kit overview listing calls."""
        return None

    def record_kit_detail_view(self, kit_id: int) -> None:
        """Record a kit detail view."""
        return None

    def record_kit_content_created(self, kit_id: int, part_id: int, required_per_unit: int) -> None:
        """Record creation of a kit content entry."""
        return None

    def record_kit_content_updated(self, kit_id: int, part_id: int, duration_seconds: float) -> None:
        """Record update of a kit content entry."""
        return None

    def record_kit_content_deleted(self, kit_id: int, part_id: int) -> None:
        """Record deletion of a kit content entry."""
        return None

    def record_kit_shopping_list_push(
        self,
        outcome: str,
        honor_reserved: bool,
        duration_seconds: float,
    ) -> None:
        """Record metrics for kit-to-shopping-list pushes."""
        return None

    def record_kit_shopping_list_unlink(self, outcome: str) -> None:
        """Record metrics for kit-to-shopping-list unlink operations."""
        return None

    def record_pick_list_created(self, kit_id: int, requested_units: int, line_count: int) -> None:
        """Record creation of a pick list."""
        return None

    def record_pick_list_line_picked(self, line_id: int, quantity: int) -> None:
        """Record pick list line completion."""
        return None

    def record_pick_list_line_undo(self, outcome: str, duration_seconds: float) -> None:
        """Record pick list line undo attempt."""
        return None

    def record_pick_list_detail_request(self, pick_list_id: int) -> None:
        """Record pick list detail request metrics."""
        return None

    def record_pick_list_list_request(self, kit_id: int, result_count: int) -> None:
        """Record pick list listing request metrics."""
        return None

    @abstractmethod
    def record_ai_analysis(
        self,
        status: str,
        model: str,
        verbosity: str,
        reasoning_effort: str,
        duration: float,
        tokens_input: int = 0,
        tokens_output: int = 0,
        tokens_reasoning: int = 0,
        tokens_cached_input: int = 0,
        cost_dollars: float = 0.0
    ):
        """Record AI analysis metrics."""
        pass

    @abstractmethod
    def start_background_updater(self, interval_seconds: int = 60):
        """Start background metric updater."""
        pass

    @abstractmethod
    def get_metrics_text(self) -> str:
        """Get metrics in Prometheus text format."""
        pass

    @abstractmethod
    def set_shutdown_state(self, is_shutting_down: bool):
        """Set the shutdown state metric."""
        pass

    @abstractmethod
    def record_shutdown_duration(self, duration: float):
        """Record the duration of graceful shutdown."""
        pass

    @abstractmethod
    def record_active_tasks_at_shutdown(self, count: int):
        """Record the number of active tasks when shutdown initiated."""
        pass

    @abstractmethod
    def shutdown(self) -> None:
        """Implementation of the shutdown sequence, also for use by unit tests."""
        pass



class MetricsService(MetricsServiceProtocol):
    """Service class for Prometheus metrics collection and exposure."""

    def __init__(self, container: "ServiceContainer", shutdown_coordinator: "ShutdownCoordinatorProtocol"):
        """Initialize service with container reference and metric objects.

        Args:
            container: Service container for accessing other services
            shutdown_coordinator: Coordinator for graceful shutdown
        """
        self.container = container
        self.shutdown_coordinator = shutdown_coordinator
        self._shutdown_start_time: float | None = None

        # Initialize metric objects
        self.initialize_metrics()

        # Background update control
        self._stop_event = threading.Event()
        self._updater_thread: threading.Thread | None = None

        # Register shutdown notification
        self.shutdown_coordinator.register_lifetime_notification(self._on_lifetime_event)

    def initialize_metrics(self):
        """Define all Prometheus metric objects."""
        # Check if already initialized (for container singleton reuse)
        if hasattr(self, 'inventory_total_parts'):
            return

        # Inventory Metrics
        self.inventory_total_parts = Gauge(
            'inventory_total_parts',
            'Total parts in system'
        )

        self.inventory_total_quantity = Gauge(
            'inventory_total_quantity',
            'Sum of all quantities'
        )

        self.inventory_low_stock_parts = Gauge(
            'inventory_low_stock_parts',
            'Parts with qty <= 5'
        )

        self.inventory_parts_without_docs = Gauge(
            'inventory_parts_without_docs',
            'Undocumented parts'
        )

        # Storage Metrics
        self.inventory_box_utilization_percent = Gauge(
            'inventory_box_utilization_percent',
            'Box usage percentage',
            ['box_no']
        )

        self.inventory_total_boxes = Gauge(
            'inventory_total_boxes',
            'Active storage boxes'
        )

        # Activity Metrics
        self.inventory_quantity_changes_total = Counter(
            'inventory_quantity_changes_total',
            'Total changes by type',
            ['operation']
        )

        self.inventory_recent_changes_7d = Gauge(
            'inventory_recent_changes_7d',
            'Changes in last 7 days'
        )

        self.inventory_recent_changes_30d = Gauge(
            'inventory_recent_changes_30d',
            'Changes in last 30 days'
        )

        # Category Metrics
        self.inventory_parts_by_type = Gauge(
            'inventory_parts_by_type',
            'Parts per category',
            ['type_name']
        )

        # Pick List Metrics
        self.pick_list_created_total = Counter(
            'pick_list_created_total',
            'Total pick lists created'
        )
        self.pick_list_lines_per_creation = Histogram(
            'pick_list_lines_per_creation',
            'Distribution of pick list line counts per creation event'
        )
        self.pick_list_line_picked_total = Counter(
            'pick_list_line_picked_total',
            'Pick list lines marked as picked'
        )
        self.pick_list_line_undo_total = Counter(
            'pick_list_line_undo_total',
            'Pick list line undo outcomes',
            ['outcome']
        )
        self.pick_list_line_undo_duration_seconds = Histogram(
            'pick_list_line_undo_duration_seconds',
            'Duration of pick list line undo operations in seconds'
        )
        self.pick_list_detail_requests_total = Counter(
            'pick_list_detail_requests_total',
            'Pick list detail requests processed'
        )
        self.pick_list_list_requests_total = Counter(
            'pick_list_list_requests_total',
            'Pick list list requests processed'
        )

        # Kit Metrics
        self.kits_created_total = Counter(
            'kits_created_total',
            'Total kits created'
        )
        self.kits_archived_total = Counter(
            'kits_archived_total',
            'Total kits archived'
        )
        self.kits_unarchived_total = Counter(
            'kits_unarchived_total',
            'Total kits restored from archive'
        )
        self.kits_overview_requests_total = Counter(
            'kits_overview_requests_total',
            'Total kit overview requests',
            ['status']
        )
        self.kits_active_count = Gauge(
            'kits_active_count',
            'Current count of active kits'
        )
        self.kits_archived_count = Gauge(
            'kits_archived_count',
            'Current count of archived kits'
        )
        self.kit_detail_views_total = Counter(
            'kit_detail_views_total',
            'Total kit detail view requests'
        )
        self.kit_shopping_list_push_total = Counter(
            'kit_shopping_list_push_total',
            'Total kit shopping list push operations by outcome',
            ['outcome', 'honor_reserved'],
        )
        self.kit_shopping_list_push_seconds = Histogram(
            'kit_shopping_list_push_seconds',
            'Duration of kit shopping list push operations',
            ['honor_reserved'],
        )
        self.kit_shopping_list_unlink_total = Counter(
            'kit_shopping_list_unlink_total',
            'Total kit shopping list unlink operations by outcome',
            ['outcome'],
        )
        self.kit_content_mutations_total = Counter(
            'kit_content_mutations_total',
            'Total kit content mutations grouped by action',
            ['action'],
        )
        self.kit_content_update_duration_seconds = Histogram(
            'kit_content_update_duration_seconds',
            'Duration of kit content update operations in seconds'
        )

        # Shopping list metrics
        self.shopping_list_lines_marked_ordered_total = Counter(
            'shopping_list_lines_marked_ordered_total',
            'Total shopping list lines marked as ordered',
            ['mode'],
        )
        self.shopping_list_lines_received_total = Counter(
            'shopping_list_lines_received_total',
            'Total shopping list lines that have received stock'
        )
        self.shopping_list_receive_quantity_total = Counter(
            'shopping_list_receive_quantity_total',
            'Total quantity received via shopping list stock updates'
        )

        # AI Analysis Metrics
        self.ai_analysis_requests_total = Counter(
            'ai_analysis_requests_total',
            'Total AI analysis requests',
            ['status', 'model', 'verbosity', 'reasoning_effort']
        )

        self.ai_analysis_duration_seconds = Histogram(
            'ai_analysis_duration_seconds',
            'AI analysis request duration',
            ['model', 'verbosity', 'reasoning_effort']
        )

        self.ai_analysis_tokens_total = Counter(
            'ai_analysis_tokens_total',
            'Total tokens used',
            ['type', 'model', 'verbosity', 'reasoning_effort']
        )

        self.ai_analysis_cost_dollars_total = Counter(
            'ai_analysis_cost_dollars_total',
            'Total cost of AI analysis in dollars',
            ['model', 'verbosity', 'reasoning_effort']
        )

        # Shutdown Metrics
        self.application_shutting_down = Gauge(
            'application_shutting_down',
            'Whether application is shutting down (1=yes, 0=no)'
        )

        self.graceful_shutdown_duration_seconds = Histogram(
            'graceful_shutdown_duration_seconds',
            'Duration of graceful shutdowns'
        )

        self.active_tasks_at_shutdown = Gauge(
            'active_tasks_at_shutdown',
            'Number of active tasks when shutdown initiated'
        )

    def update_inventory_metrics(self):
        """Update inventory-related gauges with current database values."""
        if not self.container:
            return

        session = self.container.db_session()

        try:
            dashboard_service = self.container.dashboard_service()

            stats = dashboard_service.get_dashboard_stats()

            self.inventory_total_parts.set(stats['total_parts'])
            self.inventory_total_quantity.set(stats['total_quantity'])
            self.inventory_low_stock_parts.set(stats['low_stock_count'])
            self.inventory_recent_changes_7d.set(stats['changes_7d'])
            self.inventory_recent_changes_30d.set(stats['changes_30d'])

            # Get parts without documents count
            undocumented = dashboard_service.get_parts_without_documents()
            self.inventory_parts_without_docs.set(undocumented['count'])

            session.commit()

        except Exception as e:
            session.rollback()
            logger.error(f"Error updating inventory metrics: {e}")

        finally:
            self.container.db_session.reset()

    def update_storage_metrics(self):
        """Update box utilization metrics with current database values."""
        if not self.container:
            return

        session = self.container.db_session()

        try:
            dashboard_service = self.container.dashboard_service()

            storage_summary = dashboard_service.get_storage_summary()

            # Clear previous box metrics
            self.inventory_box_utilization_percent.clear()

            # Update per-box utilization
            for box_data in storage_summary:
                box_no = str(box_data['box_no'])
                utilization = box_data['usage_percentage']
                self.inventory_box_utilization_percent.labels(box_no=box_no).set(utilization)

            # Update total boxes count
            self.inventory_total_boxes.set(len(storage_summary))

            session.commit()

        except Exception as e:
            session.rollback()
            logger.error(f"Error updating storage metrics: {e}")

        finally:
            self.container.db_session.reset()

    def update_activity_metrics(self):
        """Update activity-related metrics."""
        # Activity metrics are primarily updated by event-driven methods
        # This method is reserved for any periodic activity metric updates
        pass

    def update_category_metrics(self):
        """Update category distribution metrics."""
        if not self.container:
            return

        session = self.container.db_session()

        try:
            dashboard_service = self.container.dashboard_service()

            category_distribution = dashboard_service.get_category_distribution()

            # Clear previous category metrics
            self.inventory_parts_by_type.clear()

            # Update per-category part counts
            for category_data in category_distribution:
                type_name = category_data['type_name']
                part_count = category_data['part_count']
                self.inventory_parts_by_type.labels(type_name=type_name).set(part_count)

            session.commit()

        except Exception as e:
            session.rollback()
            logger.error(f"Error updating category metrics: {e}")

        finally:
            self.container.db_session.reset()

    def record_quantity_change(self, operation: str, delta: int):
        """Record quantity change events.

        Args:
            operation: Type of operation ('add' or 'remove')
            delta: Absolute change amount
        """
        try:
            self.inventory_quantity_changes_total.labels(operation=operation).inc(delta)
        except Exception as e:
            logger.error(f"Error recording quantity change: {e}")

    def record_task_execution(self, task_type: str, duration: float, status: str):
        """Record task execution metrics.

        Args:
            task_type: Type/name of task executed
            duration: Task execution time in seconds
            status: Task completion status ('success', 'error', etc.)
        """
        # Note: Task metrics would need additional metric definitions
        # This is a placeholder for task service integration
        pass

    def record_shopping_list_lines_ordered(self, count: int, mode: str) -> None:
        """Record how many shopping list lines were marked as ordered."""
        if count <= 0:
            return
        try:
            self.shopping_list_lines_marked_ordered_total.labels(mode=mode).inc(count)
        except Exception as exc:
            logger.error("Error recording shopping list ordered lines metric: %s", exc)

    def record_kit_created(self) -> None:
        """Record kit creation lifecycle event."""
        try:
            self.kits_created_total.inc()
            self.kits_active_count.inc()
        except Exception as exc:
            logger.error("Error recording kit creation metric: %s", exc)

    def record_kit_archived(self) -> None:
        """Record kit archive lifecycle event."""
        try:
            self.kits_archived_total.inc()
            self.kits_active_count.dec()
            self.kits_archived_count.inc()
        except Exception as exc:
            logger.error("Error recording kit archive metric: %s", exc)

    def record_kit_unarchived(self) -> None:
        """Record kit unarchive lifecycle event."""
        try:
            self.kits_unarchived_total.inc()
            self.kits_archived_count.dec()
            self.kits_active_count.inc()
        except Exception as exc:
            logger.error("Error recording kit unarchive metric: %s", exc)

    def record_kit_overview_request(self, status: str, result_count: int, limit: int | None = None) -> None:
        """Record list endpoint usage and optionally refresh gauges."""
        try:
            self.kits_overview_requests_total.labels(status=status).inc()
            if limit is None:
                if status == "active":
                    self.kits_active_count.set(result_count)
                elif status == "archived":
                    self.kits_archived_count.set(result_count)
        except Exception as exc:
            logger.error("Error recording kit overview metrics: %s", exc)

    def record_kit_detail_view(self, kit_id: int) -> None:
        """Record kit detail view usage."""
        try:
            self.kit_detail_views_total.inc()
        except Exception as exc:
            logger.error("Error recording kit detail view metric: %s", exc)

    def record_kit_content_created(self, kit_id: int, part_id: int, required_per_unit: int) -> None:
        """Record creation of a kit content entry."""
        try:
            self.kit_content_mutations_total.labels(action="create").inc()
        except Exception as exc:
            logger.error("Error recording kit content creation metric: %s", exc)

    def record_kit_content_updated(self, kit_id: int, part_id: int, duration_seconds: float) -> None:
        """Record update of a kit content entry including duration."""
        try:
            self.kit_content_mutations_total.labels(action="update").inc()
            self.kit_content_update_duration_seconds.observe(
                max(duration_seconds, 0.0)
            )
        except Exception as exc:
            logger.error("Error recording kit content update metric: %s", exc)

    def record_kit_content_deleted(self, kit_id: int, part_id: int) -> None:
        """Record deletion of a kit content entry."""
        try:
            self.kit_content_mutations_total.labels(action="delete").inc()
        except Exception as exc:
            logger.error("Error recording kit content deletion metric: %s", exc)

    def record_kit_shopping_list_push(
        self,
        outcome: str,
        honor_reserved: bool,
        duration_seconds: float,
    ) -> None:
        """Record metrics for kit push flows."""
        try:
            reserved_label = "true" if honor_reserved else "false"
            self.kit_shopping_list_push_total.labels(
                outcome=outcome,
                honor_reserved=reserved_label,
            ).inc()
            self.kit_shopping_list_push_seconds.labels(
                honor_reserved=reserved_label,
            ).observe(max(duration_seconds, 0.0))
        except Exception as exc:
            logger.error(
                "Error recording kit shopping list push metrics: %s",
                exc,
            )

    def record_kit_shopping_list_unlink(self, outcome: str) -> None:
        """Record metrics for unlink operations."""
        try:
            self.kit_shopping_list_unlink_total.labels(outcome=outcome).inc()
        except Exception as exc:
            logger.error(
                "Error recording kit shopping list unlink metrics: %s",
                exc,
            )

    def record_pick_list_created(self, kit_id: int, requested_units: int, line_count: int) -> None:
        """Record metrics when a new pick list is created."""
        if line_count < 0:
            line_count = 0
        try:
            self.pick_list_created_total.inc()
            self.pick_list_lines_per_creation.observe(line_count)
        except Exception as exc:
            logger.error("Error recording pick list creation metrics: %s", exc)

    def record_pick_list_line_picked(self, line_id: int, quantity: int) -> None:
        """Record metrics for pick line completion."""
        if quantity <= 0:
            return
        try:
            self.pick_list_line_picked_total.inc()
        except Exception as exc:
            logger.error("Error recording pick list line pick metric: %s", exc)

    def record_pick_list_line_undo(self, outcome: str, duration_seconds: float) -> None:
        """Record metrics for undo attempts."""
        try:
            self.pick_list_line_undo_total.labels(outcome=outcome).inc()
            self.pick_list_line_undo_duration_seconds.observe(
                max(duration_seconds, 0.0)
            )
        except Exception as exc:
            logger.error("Error recording pick list undo metrics: %s", exc)

    def record_pick_list_detail_request(self, pick_list_id: int) -> None:
        """Record detail request metrics."""
        try:
            self.pick_list_detail_requests_total.inc()
        except Exception as exc:
            logger.error("Error recording pick list detail metrics: %s", exc)

    def record_pick_list_list_request(self, kit_id: int, result_count: int) -> None:
        """Record list request metrics."""
        try:
            self.pick_list_list_requests_total.inc()
        except Exception as exc:
            logger.error("Error recording pick list list metrics: %s", exc)

    def record_shopping_list_line_receipt(self, lines: int, total_qty: int) -> None:
        """Record metrics for shopping list line stock receipts."""
        if lines <= 0 or total_qty <= 0:
            return
        try:
            self.shopping_list_lines_received_total.inc(lines)
            self.shopping_list_receive_quantity_total.inc(total_qty)
        except Exception as exc:
            logger.error(
                "Error recording shopping list line receipt metrics: %s",
                exc,
            )

    def record_ai_analysis(
        self,
        status: str,
        model: str,
        verbosity: str,
        reasoning_effort: str,
        duration: float,
        tokens_input: int = 0,
        tokens_output: int = 0,
        tokens_reasoning: int = 0,
        tokens_cached_input: int = 0,
        cost_dollars: float = 0.0
    ):
        """Record comprehensive AI analysis metrics with labels.

        Args:
            status: Request status ('success', 'error', etc.)
            model: AI model used
            verbosity: Analysis verbosity level
            reasoning_effort: Reasoning effort level
            duration: Analysis duration in seconds
            tokens_input: Input tokens used
            tokens_output: Output tokens used
            tokens_reasoning: Reasoning tokens used
            tokens_cached_input: Cached input tokens used
            cost_dollars: Cost in dollars
        """
        try:
            # Record request count
            self.ai_analysis_requests_total.labels(
                status=status,
                model=model,
                verbosity=verbosity,
                reasoning_effort=reasoning_effort
            ).inc()

            # Record duration
            self.ai_analysis_duration_seconds.labels(
                model=model,
                verbosity=verbosity,
                reasoning_effort=reasoning_effort
            ).observe(duration)

            # Record token usage
            if tokens_input > 0:
                self.ai_analysis_tokens_total.labels(
                    type='input',
                    model=model,
                    verbosity=verbosity,
                    reasoning_effort=reasoning_effort
                ).inc(tokens_input)

            if tokens_output > 0:
                self.ai_analysis_tokens_total.labels(
                    type='output',
                    model=model,
                    verbosity=verbosity,
                    reasoning_effort=reasoning_effort
                ).inc(tokens_output)

            if tokens_reasoning > 0:
                self.ai_analysis_tokens_total.labels(
                    type='reasoning',
                    model=model,
                    verbosity=verbosity,
                    reasoning_effort=reasoning_effort
                ).inc(tokens_reasoning)

            if tokens_cached_input > 0:
                self.ai_analysis_tokens_total.labels(
                    type='cached_input',
                    model=model,
                    verbosity=verbosity,
                    reasoning_effort=reasoning_effort
                ).inc(tokens_cached_input)

            # Record cost
            if cost_dollars > 0:
                self.ai_analysis_cost_dollars_total.labels(
                    model=model,
                    verbosity=verbosity,
                    reasoning_effort=reasoning_effort
                ).inc(cost_dollars)

        except Exception as e:
            logger.error(f"Error recording AI analysis metrics: {e}")

    def start_background_updater(self, interval_seconds: int = 60):
        """Start background thread for periodic metric updates.

        Args:
            interval_seconds: Update interval in seconds
        """
        if self._updater_thread is not None and self._updater_thread.is_alive():
            return  # Already running

        self._stop_event.clear()
        self._updater_thread = threading.Thread(
            target=self._background_update_loop,
            args=(interval_seconds,),
            daemon=True
        )
        self._updater_thread.start()

    def _stop_background_updater(self):
        """Stop the background metric updater thread."""
        self._stop_event.set()
        if self._updater_thread:
            self._updater_thread.join(timeout=5)

    def _background_update_loop(self, interval_seconds: int):
        """Background loop for periodic metric updates.

        Args:
            interval_seconds: Update interval in seconds
        """
        while not self._stop_event.is_set():
            try:
                self.update_inventory_metrics()
                self.update_storage_metrics()
                self.update_activity_metrics()
                self.update_category_metrics()
            except Exception as e:
                logger.error(f"Error in background metrics update: {e}")

            # Wait for the interval or until stop event is set
            self._stop_event.wait(interval_seconds)

    def get_metrics_text(self) -> str:
        """Generate metrics in Prometheus text format.

        Returns:
            Metrics data in Prometheus exposition format
        """
        return generate_latest().decode('utf-8')

    def set_shutdown_state(self, is_shutting_down: bool):
        """Set the shutdown state metric.

        Args:
            is_shutting_down: Whether shutdown is in progress
        """
        try:
            self.application_shutting_down.set(1 if is_shutting_down else 0)
            if is_shutting_down:
                self._shutdown_start_time = time.perf_counter()
        except Exception as e:
            logger.error(f"Error setting shutdown state: {e}")

    def record_shutdown_duration(self, duration: float):
        """Record the duration of graceful shutdown.

        Args:
            duration: Shutdown duration in seconds
        """
        try:
            self.graceful_shutdown_duration_seconds.observe(duration)
        except Exception as e:
            logger.error(f"Error recording shutdown duration: {e}")

    def record_active_tasks_at_shutdown(self, count: int):
        """Record the number of active tasks when shutdown initiated.

        Args:
            count: Number of active tasks
        """
        try:
            self.active_tasks_at_shutdown.set(count)
        except Exception as e:
            logger.error(f"Error recording active tasks at shutdown: {e}")

    def _on_lifetime_event(self, event: LifetimeEvent) -> None:
        """Callback when shutdown lifetime events are raised."""
        match event:
            case LifetimeEvent.PREPARE_SHUTDOWN:
                self.set_shutdown_state(True)

            case LifetimeEvent.SHUTDOWN:
                self.shutdown()

    def shutdown(self) -> None:
        """Implementation of the shutdown sequence, also for use by unit tests."""
        self._stop_background_updater()

        # Record shutdown duration when shutdown completes
        if self._shutdown_start_time:
            duration = time.perf_counter() - self._shutdown_start_time
            self.record_shutdown_duration(duration)
