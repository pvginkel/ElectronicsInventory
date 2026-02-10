# Change Brief: Metrics Decentralization

## Summary

Refactor MetricsService so that all Prometheus metric definitions (Counter, Gauge, Histogram) and their recording logic are moved out of MetricsService and into the services/modules that actually publish them. Metric objects should be defined at module level using standard prometheus_client idioms. Services call `.inc()`, `.observe()`, `.labels().observe()`, etc. directly on these objects instead of going through MetricsService wrapper methods.

## What MetricsService becomes after the refactor

MetricsService retains only the **background polling infrastructure**:
- A `register_for_polling(name, callback)` method that accepts simple callbacks (no args, no return).
- A background thread that periodically (every 60s) calls all registered callbacks.
- Shutdown coordinator integration to stop the background thread cleanly.

## What moves out of MetricsService

- **All ~54 Prometheus metric object definitions** move to the module that publishes them, defined at module level.
- **All ~29 wrapper methods** (e.g., `record_quantity_change`, `record_kit_created`) are removed. The publishing services call prometheus_client objects directly.
- **`get_metrics_text()` / `generate_latest()`** moves directly into the `/metrics` endpoint (no MetricsService involvement needed; prometheus_client global registry handles it).
- **Shutdown metrics** (`application_shutting_down`, `graceful_shutdown_duration_seconds`, `active_tasks_at_shutdown`) move into the ShutdownCoordinator.
- **MetricsServiceProtocol** with its no-op pattern is removed entirely. Services use prometheus_client objects directly (they're essentially free when no scraper reads them).

## Additional fixes

- **MouserService** currently monkey-patches metric objects onto MetricsService at runtime. This anti-pattern is fixed by having MouserService define its own module-level metrics.

## Periodic gauge updates

The current periodic gauge updates (inventory stats, storage utilization, category distribution) that query DashboardService every 60s are restructured:
- The gauges and the callback that updates them are defined in/near DashboardService (or wherever makes most sense).
- The callback is registered with MetricsService via `register_for_polling`.
- The callback manages its own DB session (using the container pattern for singletons).

## Testing

Tests should assert on Prometheus metric values directly (e.g., checking `._value.get()` or using `REGISTRY.get_sample_value()`) rather than mocking MetricsService.

## Documentation

Update CLAUDE.md (or contributor docs) with guidance on how metrics should be defined and used going forward.
