"""Prometheus metrics service for collecting and exposing application metrics."""

import threading
import time
from typing import TYPE_CHECKING

from prometheus_client import Counter, Gauge, Histogram, generate_latest

from app.services.base import BaseService
from app.services.dashboard_service import DashboardService

if TYPE_CHECKING:
    pass


class MetricsService(BaseService):
    """Service class for Prometheus metrics collection and exposure."""

    def __init__(self, db):
        """Initialize service with database session and metric objects.

        Args:
            db: SQLAlchemy database session
        """
        super().__init__(db)

        # Initialize dashboard service for data collection
        self.dashboard_service = DashboardService(db)

        # Initialize metric objects
        self.initialize_metrics()

        # Background update control
        self._stop_updater = False
        self._updater_thread = None

    def initialize_metrics(self):
        """Define all Prometheus metric objects."""

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

        self.ai_analysis_function_calls_total = Counter(
            'ai_analysis_function_calls_total',
            'Total function calls made during analysis',
            ['function_name', 'model']
        )

        self.ai_analysis_web_searches_total = Counter(
            'ai_analysis_web_searches_total',
            'Total web searches performed during analysis',
            ['model']
        )

    def update_inventory_metrics(self):
        """Update inventory-related gauges with current database values."""
        try:
            stats = self.dashboard_service.get_dashboard_stats()

            self.inventory_total_parts.set(stats['total_parts'])
            self.inventory_total_quantity.set(stats['total_quantity'])
            self.inventory_low_stock_parts.set(stats['low_stock_count'])
            self.inventory_recent_changes_7d.set(stats['changes_7d'])
            self.inventory_recent_changes_30d.set(stats['changes_30d'])

            # Get parts without documents count
            undocumented = self.dashboard_service.get_parts_without_documents()
            self.inventory_parts_without_docs.set(undocumented['count'])

        except Exception as e:
            # Log error but don't crash the service
            print(f"Error updating inventory metrics: {e}")

    def update_storage_metrics(self):
        """Update box utilization metrics with current database values."""
        try:
            storage_summary = self.dashboard_service.get_storage_summary()

            # Clear previous box metrics
            self.inventory_box_utilization_percent.clear()

            # Update per-box utilization
            for box_data in storage_summary:
                box_no = str(box_data['box_no'])
                utilization = box_data['usage_percentage']
                self.inventory_box_utilization_percent.labels(box_no=box_no).set(utilization)

            # Update total boxes count
            self.inventory_total_boxes.set(len(storage_summary))

        except Exception as e:
            print(f"Error updating storage metrics: {e}")

    def update_activity_metrics(self):
        """Update activity-related metrics."""
        # Activity metrics are primarily updated by event-driven methods
        # This method is reserved for any periodic activity metric updates
        pass

    def update_category_metrics(self):
        """Update category distribution metrics."""
        try:
            category_distribution = self.dashboard_service.get_category_distribution()

            # Clear previous category metrics
            self.inventory_parts_by_type.clear()

            # Update per-category part counts
            for category_data in category_distribution:
                type_name = category_data['type_name']
                part_count = category_data['part_count']
                self.inventory_parts_by_type.labels(type_name=type_name).set(part_count)

        except Exception as e:
            print(f"Error updating category metrics: {e}")

    def record_quantity_change(self, operation: str, delta: int):
        """Record quantity change events.

        Args:
            operation: Type of operation ('add' or 'remove')
            delta: Absolute change amount
        """
        try:
            self.inventory_quantity_changes_total.labels(operation=operation).inc(delta)
        except Exception as e:
            print(f"Error recording quantity change: {e}")

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
        cost_dollars: float = 0.0,
        function_calls: list[str] | None = None,
        web_searches: int = 0
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
            function_calls: List of function names called
            web_searches: Number of web searches performed
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

            # Record function calls
            if function_calls:
                for func_name in function_calls:
                    self.ai_analysis_function_calls_total.labels(
                        function_name=func_name,
                        model=model
                    ).inc()

            # Record web searches
            if web_searches > 0:
                self.ai_analysis_web_searches_total.labels(model=model).inc(web_searches)

        except Exception as e:
            print(f"Error recording AI analysis metrics: {e}")

    def start_background_updater(self, interval_seconds: int = 60):
        """Start background thread for periodic metric updates.

        Args:
            interval_seconds: Update interval in seconds
        """
        if self._updater_thread is not None and self._updater_thread.is_alive():
            return  # Already running

        self._stop_updater = False
        self._updater_thread = threading.Thread(
            target=self._background_update_loop,
            args=(interval_seconds,),
            daemon=True
        )
        self._updater_thread.start()

    def stop_background_updater(self):
        """Stop the background metric updater thread."""
        self._stop_updater = True
        if self._updater_thread:
            self._updater_thread.join(timeout=5)

    def _background_update_loop(self, interval_seconds: int):
        """Background loop for periodic metric updates.

        Args:
            interval_seconds: Update interval in seconds
        """
        while not self._stop_updater:
            try:
                self.update_inventory_metrics()
                self.update_storage_metrics()
                self.update_activity_metrics()
                self.update_category_metrics()
            except Exception as e:
                print(f"Error in background metrics update: {e}")

            # Sleep with early exit check
            for _ in range(interval_seconds):
                if self._stop_updater:
                    break
                time.sleep(1)

    def get_metrics_text(self) -> str:
        """Generate metrics in Prometheus text format.

        Returns:
            Metrics data in Prometheus exposition format
        """
        return generate_latest().decode('utf-8')
