# Metrics Decentralization -- Technical Plan

## 0) Research Log & Findings

### Areas researched

**MetricsService (`app/services/metrics_service.py`)** -- The central file containing ~54 Prometheus metric definitions, ~29 wrapper methods, background polling infrastructure, shutdown integration, and `get_metrics_text()`. The class inherits from `MetricsServiceProtocol`, an ABC with abstract methods for every wrapper. The metrics are defined inside `initialize_metrics()` as instance attributes (lines 268-583).

**MetricsServiceProtocol** -- A large abstract base class (lines 20-241) that every consuming service references for type hints. This forces a no-op stub (`StubMetricsService` in `tests/testing_utils.py`, lines 88-222) to implement every method, creating a maintenance burden whenever a new metric is added.

**Container wiring (`app/services/container.py`)** -- MetricsService is a `Singleton` provider (line 157-161) injected into 13 other services: `AuthService`, `OidcClientService`, `ConnectionManager`, `InventoryService`, `ShoppingListLineService`, `KitPickListService`, `PickListReportService`, `KitShoppingListService`, `KitService`, `TaskService`, `AIService`, `DuplicateSearchService`, `MouserService`. It is also injected into the `_create_ai_runner` factory and the `ai_runner` provider.

**Consuming services -- call patterns identified:**
- `InventoryService` (lines 104, 152): calls `record_quantity_change()`
- `KitService` (lines 577-674): calls 7 wrapper methods via private helpers that guard on `metrics_service is None`
- `KitPickListService` (lines 230, 344, 367, 471, 484-540, 575): calls 5 wrapper methods directly
- `KitShoppingListService` (lines 91-106, 198-206): calls `record_kit_shopping_list_push()`, `record_kit_shopping_list_unlink()`
- `ShoppingListLineService` (lines 446, 654): calls `record_shopping_list_line_receipt()`, `record_shopping_list_lines_ordered()`
- `PickListReportService` (lines 102-120): calls `record_pick_list_pdf_generated()`, `record_pick_list_pdf_generation_duration()`
- `ConnectionManager` (lines 117, 190, 328-368): calls 3 SSE gateway metric methods
- `TaskService` (lines 266, 301, 386): calls `record_task_execution()`, `record_active_tasks_at_shutdown()`
- `AuthService` (lines 79-219): calls `record_jwks_refresh()`, `record_auth_validation()`
- `OidcClientService` (lines 279-364): calls `record_oidc_token_exchange()`, `record_auth_token_refresh()`
- `OpenAIRunner` (lines 247-277): calls `record_ai_analysis()`
- `DuplicateSearchService` (lines 80-166): accesses metrics attributes directly (`ai_duplicate_search_requests_total.labels().inc()`, etc.)
- `MouserService` (lines 126-171): **monkey-patches** metrics onto MetricsService (`self.metrics_service.mouser_api_requests_total = Counter(...)`)
- `app/api/parts.py` (line 287): calls `record_part_kit_usage_request()` from API layer

**Metrics endpoint (`app/api/metrics.py`)** -- Currently injects MetricsService and calls `get_metrics_text()`, which just wraps `generate_latest().decode('utf-8')`.

**Background polling** -- `start_background_updater()` (line 1080) runs a thread that calls `update_inventory_metrics()`, `update_storage_metrics()`, `update_activity_metrics()`, `update_category_metrics()` every 60s. These methods query `DashboardService` via the container's `db_session`.

**Shutdown integration** -- MetricsService registers a `_on_lifetime_event` callback (line 266). On `PREPARE_SHUTDOWN` it sets `application_shutting_down` gauge. On `SHUTDOWN` it stops the background thread and records shutdown duration. The three shutdown metrics (`application_shutting_down`, `graceful_shutdown_duration_seconds`, `active_tasks_at_shutdown`) are logically part of the shutdown coordinator's domain.

**Test infrastructure** -- `StubMetricsService` in `tests/testing_utils.py` implements every protocol method as a no-op plus has Mock objects for `DuplicateSearchService` attributes. `test_metrics_service.py` creates a `TestMetricsService` subclass with a custom `CollectorRegistry`. The `conftest.py` has an autouse `clear_prometheus_registry` fixture that unregisters all collectors before/after each test.

### Key findings and conflicts

1. **DuplicateSearchService** already accesses prometheus_client objects directly (bypassing wrappers), but these objects are instance attributes on MetricsService rather than module-level globals. This is the pattern the refactoring generalizes.

2. **MouserService** monkey-patches metric objects onto MetricsService at runtime -- the change brief explicitly calls this out as an anti-pattern to fix.

3. **The `app/api/parts.py` endpoint** injects MetricsService to call `record_part_kit_usage_request()`. After refactoring, this will use module-level metrics in the API module or the relevant service.

4. **Periodic gauge updates** use `self.container.db_session()` with manual commit/rollback/reset. This pattern must be preserved in the callback-based approach.

5. **`clear_prometheus_registry` autouse fixture** already handles metric isolation between tests. Moving to module-level metrics will work with this fixture since it clears the global `REGISTRY`.

### Resolution decisions

- **Where to define periodic polling gauges**: Define them in a new `app/services/metrics/dashboard_metrics.py` module alongside their update callback. Register the callback with MetricsService's `register_for_polling`.
- **Shutdown metrics**: Move `application_shutting_down` and `graceful_shutdown_duration_seconds` to `ShutdownCoordinator` since that is where shutdown timing is tracked. Keep `active_tasks_at_shutdown` in `TaskService` since it is the publisher that knows the active task count.
- **API-layer metric calls**: Move the `part_kit_usage_requests_total` counter to `app/api/parts.py` as a module-level object; the API endpoint updates it directly.
- **Module organization**: Each service defines its metrics at module level in its own file. No need for a separate `app/services/metrics/` package per service -- the metrics are collocated with the service that publishes them.

---

## 1) Intent & Scope

**User intent**

Refactor the MetricsService from a monolithic metrics hub into a thin background-polling service. Move all Prometheus metric definitions and recording logic to the services that publish them, using standard `prometheus_client` module-level idioms. Remove the MetricsServiceProtocol and its no-op pattern entirely.

**Prompt quotes**

"all Prometheus metric definitions (Counter, Gauge, Histogram) and their recording logic are moved out of MetricsService and into the services/modules that actually publish them"

"MetricsService retains only the background polling infrastructure: register_for_polling(name, callback), background thread, shutdown integration"

"MetricsServiceProtocol and its no-op pattern removed entirely"

"Shutdown metrics moved into ShutdownCoordinator"

"MouserService defines its own module-level metrics instead of monkey-patching them onto MetricsService"

**In scope**

- Move all ~54 Prometheus metric definitions to module level in their publishing services
- Remove all ~29 wrapper methods from MetricsService
- Remove MetricsServiceProtocol ABC and StubMetricsService no-op stub
- Reduce MetricsService to background polling: `register_for_polling(name, callback)`, background thread, shutdown integration
- Move `generate_latest()` call directly into `/metrics` endpoint
- Move shutdown metrics into ShutdownCoordinator
- Fix MouserService monkey-patching anti-pattern
- Restructure periodic gauge updates as registered polling callbacks
- Update DI container to remove MetricsService from services that no longer need it
- Update tests to assert on Prometheus metric values directly
- Update CLAUDE.md with new metrics guidance

**Out of scope**

- Adding new metrics or dashboards
- Changing the Prometheus scraping endpoint path or format
- Modifying the background polling interval or DashboardService queries
- Altering the ShutdownCoordinator's core shutdown sequence
- Frontend changes (no frontend impact from this refactoring)

**Assumptions / constraints**

- The `prometheus_client` global `REGISTRY` is the single registry used in production (no custom registries except in tests).
- Module-level `Counter`/`Gauge`/`Histogram` definitions are safe for import-time construction. Note that `prometheus_client` does NOT handle idempotent registration -- it raises `ValueError` on duplicate metric names. However, module-level definitions execute only once per process (Python caches imported modules), so no duplicate registration occurs in production. In tests, the existing `clear_prometheus_registry` autouse fixture unregisters all collectors between tests, preventing collisions when multiple test-scoped Flask apps register the same metrics.
- The existing `clear_prometheus_registry` test fixture will continue to handle test isolation for module-level metrics.
- The refactoring is BFF-internal; no API contracts change.

---

## 1a) User Requirements Checklist

**User Requirements Checklist**

- [ ] All Prometheus metric definitions (Counter, Gauge, Histogram) moved out of MetricsService to module-level in the services that publish them
- [ ] All wrapper methods removed from MetricsService -- services call prometheus_client objects directly (e.g., `counter.labels(...).inc()`)
- [ ] MetricsServiceProtocol and its no-op pattern removed entirely
- [ ] MetricsService retains only background polling infrastructure: `register_for_polling(name, callback)`, background thread, shutdown integration
- [ ] `generate_latest()` called directly from /metrics endpoint, not through MetricsService
- [ ] Shutdown metrics split by publisher: application_shutting_down and graceful_shutdown_duration_seconds moved into ShutdownCoordinator; active_tasks_at_shutdown moved to TaskService (which owns the active task count)
- [ ] MouserService defines its own module-level metrics instead of monkey-patching them onto MetricsService
- [ ] Periodic gauge updates (inventory, storage, category) restructured as callbacks registered via `register_for_polling`
- [ ] Tests assert on Prometheus metric values directly rather than mocking MetricsService
- [ ] DI container updated: MetricsService removed from services that no longer need it
- [ ] Documentation updated (CLAUDE.md or contributor docs) with guidance on how metrics should be defined and used

---

## 2) Affected Areas & File Map (with repository evidence)

- Area: `app/services/metrics_service.py`
- Why: Gutted to retain only background polling (`register_for_polling`, background thread, shutdown integration). All metric definitions (~54), all wrapper methods (~29), `MetricsServiceProtocol`, `get_metrics_text()`, and `initialize_metrics()` removed.
- Evidence: `app/services/metrics_service.py:20-241` (protocol), `app/services/metrics_service.py:268-583` (metric definitions), `app/services/metrics_service.py:684-1079` (wrapper methods), `app/services/metrics_service.py:1080-1127` (background updater), `app/services/metrics_service.py:1121-1127` (get_metrics_text)

- Area: `app/api/metrics.py`
- Why: Replace MetricsService injection with direct `generate_latest()` call from `prometheus_client`.
- Evidence: `app/api/metrics.py:18-29` -- injects MetricsService and calls `get_metrics_text()`

- Area: `app/utils/shutdown_coordinator.py`
- Why: Add two shutdown metric definitions (module-level `APPLICATION_SHUTTING_DOWN` Gauge and `GRACEFUL_SHUTDOWN_DURATION_SECONDS` Histogram) and recording logic into the shutdown flow. Note: `active_tasks_at_shutdown` stays in `task_service.py` since TaskService is the publisher that knows the active task count.
- Evidence: `app/services/metrics_service.py:514-523` (shutdown metric definitions for these two), `app/utils/shutdown_coordinator.py:105-167` (shutdown flow where metrics should be recorded)

- Area: `app/services/inventory_service.py`
- Why: Define `inventory_quantity_changes_total` Counter at module level; call `.labels().inc()` directly. Remove MetricsServiceProtocol import and constructor parameter.
- Evidence: `app/services/inventory_service.py:17` (imports MetricsServiceProtocol), `app/services/inventory_service.py:33` (constructor param), `app/services/inventory_service.py:104,152` (calls record_quantity_change)

- Area: `app/services/kit_service.py`
- Why: Define kit lifecycle counters/gauges at module level; replace 7 private `_record_*` helper methods with direct metric calls. Remove MetricsServiceProtocol import and constructor parameter.
- Evidence: `app/services/kit_service.py:28` (imports MetricsServiceProtocol), `app/services/kit_service.py:39` (constructor param), `app/services/kit_service.py:577-674` (private metric helpers)

- Area: `app/services/kit_pick_list_service.py`
- Why: Define pick list counters/histograms at module level; replace direct wrapper calls with direct prometheus_client calls. Remove MetricsServiceProtocol import and constructor parameter.
- Evidence: `app/services/kit_pick_list_service.py:22` (imports MetricsServiceProtocol), `app/services/kit_pick_list_service.py:35` (constructor param), `app/services/kit_pick_list_service.py:230,344,367,471,484-540,575` (metric calls)

- Area: `app/services/kit_shopping_list_service.py`
- Why: Define kit shopping list counters/histograms at module level; replace wrapper calls. Remove MetricsServiceProtocol import and constructor parameter.
- Evidence: `app/services/kit_shopping_list_service.py:19` (imports MetricsServiceProtocol), `app/services/kit_shopping_list_service.py:55` (constructor param), `app/services/kit_shopping_list_service.py:91-106,198-206` (metric calls)

- Area: `app/services/shopping_list_line_service.py`
- Why: Define shopping list counters at module level; replace wrapper calls. Remove MetricsService import and constructor parameter.
- Evidence: `app/services/shopping_list_line_service.py:22-23` (imports MetricsService), `app/services/shopping_list_line_service.py:33` (constructor param), `app/services/shopping_list_line_service.py:446,654` (metric calls)

- Area: `app/services/pick_list_report_service.py`
- Why: Define PDF generation counters/histograms at module level; replace wrapper calls. Remove MetricsServiceProtocol import and constructor dependency entirely (service becomes zero-dependency).
- Evidence: `app/services/pick_list_report_service.py:22` (imports MetricsServiceProtocol), `app/services/pick_list_report_service.py:31` (constructor param), `app/services/pick_list_report_service.py:102-120` (metric calls)

- Area: `app/services/connection_manager.py`
- Why: Define SSE gateway counters/histograms/gauges at module level; replace wrapper calls. Remove MetricsServiceProtocol import and constructor parameter.
- Evidence: `app/services/connection_manager.py:28` (imports MetricsServiceProtocol), `app/services/connection_manager.py:39` (constructor param), `app/services/connection_manager.py:117,190,328-368` (metric calls)

- Area: `app/services/task_service.py`
- Why: Define `ACTIVE_TASKS_AT_SHUTDOWN` Gauge at module level (TaskService owns this metric because it knows the active task count). The `record_task_execution` calls are currently no-op placeholders -- remove them and leave a TODO comment for future implementation. Remove MetricsServiceProtocol import and constructor parameter.
- Evidence: `app/services/task_service.py:21` (imports MetricsServiceProtocol), `app/services/task_service.py:266,301` (record_task_execution -- no-op placeholder), `app/services/task_service.py:386` (record_active_tasks_at_shutdown)

- Area: `app/services/auth_service.py`
- Why: Define auth validation counters/histograms at module level; replace wrapper calls. Remove MetricsServiceProtocol import and constructor parameter.
- Evidence: `app/services/auth_service.py:14` (imports MetricsServiceProtocol), `app/services/auth_service.py:39` (constructor param), `app/services/auth_service.py:79-219` (9 metric calls)

- Area: `app/services/oidc_client_service.py`
- Why: Define OIDC token exchange/refresh counters at module level; replace wrapper calls. Remove MetricsServiceProtocol import and constructor parameter.
- Evidence: `app/services/oidc_client_service.py:14` (imports MetricsServiceProtocol), `app/services/oidc_client_service.py:279-364` (4 metric calls)

- Area: `app/utils/ai/openai/openai_runner.py`
- Why: Define AI analysis counters/histograms/cost tracking at module level; replace wrapper calls. Remove MetricsServiceProtocol import and constructor parameter.
- Evidence: `app/utils/ai/openai/openai_runner.py:20` (imports MetricsServiceProtocol), `app/utils/ai/openai/openai_runner.py:38` (constructor param), `app/utils/ai/openai/openai_runner.py:247-277` (metric calls)

- Area: `app/services/ai_service.py`
- Why: Remove MetricsServiceProtocol import and constructor parameter (AIService does not call metrics directly; it delegates to OpenAIRunner). Remove metrics_service from DI wiring.
- Evidence: `app/services/ai_service.py:30` (imports MetricsServiceProtocol), `app/services/ai_service.py:57` (constructor param)

- Area: `app/services/duplicate_search_service.py`
- Why: Define AI duplicate search counters/histograms/gauge at module level (replacing the current pattern of accessing MetricsService instance attributes directly). Remove MetricsService import and constructor parameter.
- Evidence: `app/services/duplicate_search_service.py:18` (imports MetricsService), `app/services/duplicate_search_service.py:37` (constructor param), `app/services/duplicate_search_service.py:80-166` (direct attribute access)

- Area: `app/services/mouser_service.py`
- Why: Define Mouser API counters/histograms at module level; remove `_initialize_metrics()` monkey-patching method. Remove MetricsServiceProtocol import and constructor parameter.
- Evidence: `app/services/mouser_service.py:16` (imports MetricsServiceProtocol), `app/services/mouser_service.py:30` (constructor param), `app/services/mouser_service.py:126-171` (monkey-patching and recording)

- Area: `app/api/parts.py`
- Why: Define `part_kit_usage_requests_total` Counter at module level; call directly. Remove MetricsService injection.
- Evidence: `app/api/parts.py:34` (imports MetricsService), `app/api/parts.py:282-287` (injected param and call)

- Area: `app/services/container.py`
- Why: Remove `metrics_service` parameter from all services that no longer need it. Update MetricsService provider to simplified constructor. Remove `metrics_service` from `_create_ai_runner` factory.
- Evidence: `app/services/container.py:157-161` (MetricsService provider), `app/services/container.py:164-287` (13 services receiving metrics_service)

- Area: New file: `app/services/metrics/dashboard_metrics.py`
- Why: Define periodic gauge metrics (inventory, storage, category) at module level and provide a factory function `create_dashboard_polling_callback(container)` that returns a closure. The closure captures the container reference and follows the singleton session pattern (try/commit/except/rollback/finally/reset) when querying DashboardService. The returned closure is registered via `register_for_polling`. This replaces the `update_inventory_metrics()`, `update_storage_metrics()`, `update_category_metrics()` methods.
- Evidence: `app/services/metrics_service.py:584-682` (current periodic update methods)

- Area: `app/__init__.py`
- Why: Update app factory to import `create_dashboard_polling_callback` from `app/services/metrics/dashboard_metrics.py`, create the callback closure by passing the container, and register it with MetricsService via `register_for_polling("dashboard", callback)`.
- Evidence: `app/__init__.py:245-251` (current metrics_service startup)

- Area: `tests/testing_utils.py`
- Why: Remove `StubMetricsService` class entirely. Remove `MetricsServiceProtocol` import.
- Evidence: `tests/testing_utils.py:6` (import), `tests/testing_utils.py:88-222` (StubMetricsService)

- Area: `tests/test_metrics_service.py`
- Why: Rewrite to test the new polling-only MetricsService. Remove `TestMetricsService` subclass that duplicates all metric definitions.
- Evidence: `tests/test_metrics_service.py:1-80` (current TestMetricsService with duplicated definitions)

- Area: All test files referencing `StubMetricsService` or `metrics_service`
- Why: Update to remove MetricsService from service construction; assert on Prometheus metric values directly using `REGISTRY.get_sample_value()`.
- Evidence: `tests/services/test_kit_service.py`, `tests/services/test_kit_pick_list_service.py`, `tests/services/test_kit_shopping_list_service.py`, `tests/services/test_mouser_service.py`, `tests/services/test_pick_list_report_service.py`, `tests/services/test_auth_service.py`, `tests/services/test_oidc_client_service.py`, `tests/test_ai_service.py`, `tests/test_duplicate_search_service.py`, `tests/test_task_service.py`, `tests/test_connection_manager.py`, `tests/test_metrics_api.py`, `tests/test_graceful_shutdown_integration.py`, `tests/api/test_parts_api.py`

- Area: `CLAUDE.md`
- Why: Update the "Prometheus Metrics Infrastructure" section with new guidance on defining metrics at module level.
- Evidence: `CLAUDE.md` -- "Prometheus Metrics Infrastructure" section

---

## 3) Data Model / Contracts

- Entity / contract: MetricsService public interface (after refactor)
- Shape:
  ```
  class MetricsService:
      def __init__(self, container, shutdown_coordinator):
          ...
      def register_for_polling(self, name: str, callback: Callable[[], None]) -> None:
          ...
      def start_background_updater(self, interval_seconds: int = 60) -> None:
          ...
      def shutdown(self) -> None:
          ...
  ```
- Refactor strategy: Complete replacement of the old interface. No backwards compatibility needed (BFF pattern). All consuming services updated simultaneously.
- Evidence: `app/services/metrics_service.py:1080-1127` (existing background updater methods retained)

- Entity / contract: Module-level metric definitions pattern
- Shape:
  ```python
  # At module level in each service file
  from prometheus_client import Counter, Histogram

  SOME_REQUESTS_TOTAL = Counter(
      "some_requests_total",
      "Description",
      ["label1", "label2"],
  )
  SOME_DURATION_SECONDS = Histogram(
      "some_duration_seconds",
      "Description",
  )
  ```
- Refactor strategy: Direct replacement -- wherever MetricsService previously defined a metric and exposed a wrapper, the metric is now a module-level constant in the publishing service.
- Evidence: Pattern already used by `prometheus_client` library conventions

- Entity / contract: Shutdown metrics on ShutdownCoordinator
- Shape:
  ```python
  # At module level in shutdown_coordinator.py
  APPLICATION_SHUTTING_DOWN = Gauge(...)
  GRACEFUL_SHUTDOWN_DURATION_SECONDS = Histogram(...)
  ```
- Refactor strategy: `application_shutting_down` and `graceful_shutdown_duration_seconds` move from MetricsService to module-level in `shutdown_coordinator.py`. ShutdownCoordinator records them directly in its `shutdown()` method. Note: `active_tasks_at_shutdown` stays with TaskService (see below) since TaskService is the publisher that knows the active task count.
- Evidence: `app/utils/shutdown_coordinator.py:105-167` (shutdown flow)

- Entity / contract: Task shutdown metric on TaskService
- Shape:
  ```python
  # At module level in task_service.py
  ACTIVE_TASKS_AT_SHUTDOWN = Gauge(...)
  ```
- Refactor strategy: `active_tasks_at_shutdown` remains owned by TaskService since it is the only service that knows the active task count. TaskService updates it directly in `_on_lifetime_event()` during `PREPARE_SHUTDOWN`, using the module-level Gauge instead of calling through MetricsService.
- Evidence: `app/services/task_service.py:386` (current call site)

---

## 4) API / Integration Surface

- Surface: `GET /metrics`
- Inputs: None (Prometheus scrape endpoint)
- Outputs: Prometheus text format (unchanged)
- Errors: 500 on failure (unchanged)
- Evidence: `app/api/metrics.py:15-29` -- currently delegates to `metrics_service.get_metrics_text()`. After refactor, calls `generate_latest()` directly from `prometheus_client`.

No other API surfaces change. This is a purely internal refactoring that does not alter any request/response contracts.

---

## 5) Algorithms & State Machines

- Flow: Background polling loop (retained, restructured)
- Steps:
  1. On `start_background_updater(interval)`, MetricsService spawns a daemon thread.
  2. The thread loops while `_stop_event` is not set.
  3. Each iteration calls every callback registered via `register_for_polling(name, callback)`.
  4. Each callback is wrapped in try/except so one failure does not stop others.
  5. Thread sleeps for `interval_seconds` or until `_stop_event` is set.
  6. On `SHUTDOWN` lifetime event, `_stop_event` is set and thread joins with 5s timeout.
- States / transitions: Running -> Stopping (via `_stop_event.set()`) -> Stopped (thread joined)
- Hotspots: Each polling callback manages its own DB session via the container singleton pattern; callbacks must not leak sessions.
- Evidence: `app/services/metrics_service.py:1103-1119` (current loop implementation)

- Flow: Dashboard metrics polling callback
- Steps:
  1. `create_dashboard_polling_callback(container)` returns a closure that captures the container.
  2. When invoked by the polling loop, the closure acquires a session via `container.db_session()`.
  3. Creates `DashboardService` via `container.dashboard_service()`.
  4. Calls `get_dashboard_stats()`, `get_parts_without_documents()`, `get_storage_summary()`, `get_category_distribution()`.
  5. Updates module-level Gauge metrics defined in `dashboard_metrics.py`.
  6. Commits session.
  7. On exception: rolls back session, logs error.
  8. Always: resets session via `container.db_session.reset()`.
- States / transitions: None
- Hotspots: Must follow singleton session pattern from CLAUDE.md (commit/rollback/reset). The closure captures the container reference at app startup; the container must remain valid for the lifetime of the background thread.
- Evidence: `app/services/metrics_service.py:584-682` (current update methods)

---

## 6) Derived State & Invariants

- Derived value: `inventory_total_parts` gauge (and related inventory gauges)
  - Source: Unfiltered query via `DashboardService.get_dashboard_stats()` in polling callback
  - Writes / cleanup: Gauge `.set()` on each poll cycle; no persistent writes
  - Guards: Polling callback wrapped in try/except; session reset in finally block
  - Invariant: Gauge values reflect the most recent successful poll; stale values are acceptable (eventual consistency)
  - Evidence: `app/services/metrics_service.py:584-614`

- Derived value: `inventory_box_utilization_percent` gauge (labeled by box_no)
  - Source: Unfiltered query via `DashboardService.get_storage_summary()` in polling callback
  - Writes / cleanup: Gauge `.clear()` then `.labels().set()` on each poll; no persistent writes
  - Guards: Gauge clear + set must be within the same try block to avoid partial state
  - Invariant: The clear-then-set sequence means brief windows of zero values during updates; this is acceptable for monitoring
  - Evidence: `app/services/metrics_service.py:615-646`

- Derived value: `inventory_parts_by_type` gauge (labeled by type_name)
  - Source: Unfiltered query via `DashboardService.get_category_distribution()` in polling callback
  - Writes / cleanup: Gauge `.clear()` then `.labels().set()` on each poll; no persistent writes
  - Guards: Same try/except + session reset pattern as other polling gauges
  - Invariant: Labels reflect current type names; deleted types will disappear from metrics after next poll
  - Evidence: `app/services/metrics_service.py:654-682`

---

## 7) Consistency, Transactions & Concurrency

- Transaction scope: Polling callbacks each open their own session via `container.db_session()`, commit on success, rollback on failure, reset in finally. No request-scoped transactions involved.
- Atomic requirements: None -- gauge updates are fire-and-forget. A failed poll simply leaves stale values.
- Retry / idempotency: Polling callbacks are retried on the next interval automatically. No explicit retry logic needed.
- Ordering / concurrency controls: The background thread is single-threaded; callbacks execute sequentially. Module-level `prometheus_client` objects are thread-safe (internal locking). No contention between the background poller and request-handling threads writing to the same counters.
- Evidence: `app/services/metrics_service.py:1103-1119` (single-threaded loop), `prometheus_client` library guarantees thread-safe metric operations

---

## 8) Errors & Edge Cases

- Failure: Module-level metric definition fails (e.g., duplicate metric name across modules)
- Surface: Application startup (import time)
- Handling: `prometheus_client` raises `ValueError` on duplicate metric names. This would crash the application on startup, making it immediately visible.
- Guardrails: The plan specifies exactly which metrics go where, with no duplication. Metric names are globally unique by convention (e.g., `inventory_quantity_changes_total`). The `clear_prometheus_registry` fixture in tests prevents cross-test contamination.
- Evidence: `tests/conftest.py:53-76` (registry clearing fixture)

- Failure: Polling callback DB session error
- Surface: Background polling thread (logged, not user-facing)
- Handling: Try/except around each callback; session rollback + reset in finally. Error logged. Next poll retries.
- Guardrails: Each callback isolated; one failure does not prevent others from running.
- Evidence: `app/services/metrics_service.py:1113-1116` (existing error handling in loop)

- Failure: ShutdownCoordinator records shutdown metrics but Prometheus scraper has already disconnected
- Surface: Shutdown sequence
- Handling: Best-effort; metrics are recorded regardless of scraper availability. Values are available if scraper polls before process exits.
- Guardrails: None needed; this is inherent to any shutdown metrics pattern.
- Evidence: `app/utils/shutdown_coordinator.py:147-157`

- Failure: Direct metric call fails in service code (e.g., wrong label cardinality, None label value)
- Surface: Any service making a direct `counter.labels(...).inc()` call
- Handling: Direct metric calls will NOT be wrapped in try/except. Per CLAUDE.md's "fail fast and fail often" philosophy, metric misconfiguration should crash immediately rather than be silently swallowed. This is a deliberate departure from the current wrapper pattern (which uses try/except around every metric call).
- Guardrails: This is safe because (a) metric definitions are compile-time constants with fixed label names, (b) label values come from controlled code paths (enum-like strings), not user input, and (c) any misconfiguration will be caught immediately in testing. The current try/except wrappers were defensive against a scenario that never occurs in practice and obscured potential bugs.
- Evidence: `CLAUDE.md` -- "Fail fast and fail often - Don't swallow exceptions or hide errors from users"

- Failure: Test creates module-level metrics that collide with global registry
- Surface: Test suite
- Handling: The existing `clear_prometheus_registry` autouse fixture unregisters all collectors before and after each test.
- Guardrails: Fixture already exists and handles this case.
- Evidence: `tests/conftest.py:53-76`

---

## 9) Observability / Telemetry

This section describes the reorganization of existing metrics. No new metrics are being added.

- Signal: All existing ~54 Prometheus metrics
- Type: Counter, Gauge, Histogram (various)
- Trigger: Same events as before (quantity changes, kit operations, AI calls, etc.)
- Labels / fields: Unchanged
- Consumer: Prometheus scraper at `/metrics`
- Evidence: `app/services/metrics_service.py:268-583` (current definitions, all preserved)

- Signal: Structured log from polling callbacks on error
- Type: Structured log (ERROR level)
- Trigger: When a polling callback fails
- Labels / fields: Exception message, callback name
- Consumer: Log aggregator
- Evidence: `app/services/metrics_service.py:608-610` (current error logging pattern)

---

## 10) Background Work & Shutdown

- Worker / job: MetricsService background polling thread
- Trigger cadence: Every `interval_seconds` (default 60), started from `app/__init__.py`
- Responsibilities: Iterates over registered polling callbacks; each callback updates its own gauge metrics. After refactoring, the only registered callback is the dashboard metrics callback.
- Shutdown handling: Registers `_on_lifetime_event` with ShutdownCoordinator. On `SHUTDOWN` event, sets `_stop_event` and joins thread with 5s timeout.
- Evidence: `app/services/metrics_service.py:1080-1101` (start), `app/services/metrics_service.py:1164-1181` (shutdown)

- Worker / job: ShutdownCoordinator shutdown metrics recording (new responsibility)
- Trigger cadence: Once, during shutdown sequence
- Responsibilities: Sets `APPLICATION_SHUTTING_DOWN` gauge on `PREPARE_SHUTDOWN`, records `GRACEFUL_SHUTDOWN_DURATION_SECONDS` at end of shutdown. Note: `active_tasks_at_shutdown` is recorded by TaskService in its own `_on_lifetime_event` callback during `PREPARE_SHUTDOWN`.
- Shutdown handling: This IS the shutdown handler. The metrics are recorded before process exit.
- Evidence: `app/utils/shutdown_coordinator.py:105-167` (shutdown sequence where metrics will be recorded)

---

## 11) Security & Permissions

Not applicable. This is an internal refactoring that does not change authentication, authorization, or data exposure. The `/metrics` endpoint remains accessible without authentication (it is outside `api_bp`).

---

## 12) UX / UI Impact

Not applicable. This is a backend-only refactoring. No API contracts change; no frontend impact.

---

## 13) Deterministic Test Plan

- Surface: MetricsService (refactored -- polling only)
- Scenarios:
  - Given a MetricsService with no callbacks registered, When `start_background_updater()` is called and runs one cycle, Then no errors occur and the thread is running
  - Given a MetricsService with one callback registered via `register_for_polling`, When the background loop runs, Then the callback is invoked
  - Given a MetricsService with a failing callback registered, When the background loop runs, Then the error is logged and the loop continues
  - Given a running MetricsService, When `shutdown()` is called, Then the background thread stops within 5s
  - Given a MetricsService with multiple callbacks, When the background loop runs, Then all callbacks are invoked sequentially
- Fixtures / hooks: `StubShutdownCoordinator` for DI; no database needed for MetricsService unit tests
- Gaps: None
- Evidence: `tests/test_metrics_service.py` (to be rewritten)

- Surface: Dashboard metrics polling callback
- Scenarios:
  - Given a running app with test data, When the polling callback executes, Then `inventory_total_parts` gauge is set to the expected count (verified via `REGISTRY.get_sample_value()`)
  - Given a running app with boxes, When the polling callback executes, Then `inventory_box_utilization_percent` labeled gauges are set correctly
  - Given a DB error during polling, When the callback executes, Then the error is logged and the session is properly reset
- Fixtures / hooks: Full app fixture with test data; `REGISTRY.get_sample_value()` for assertions
- Gaps: None
- Evidence: `tests/test_metrics_service.py` (to be rewritten for callback testing)

- Surface: InventoryService (direct metric calls)
- Scenarios:
  - Given test data with a part and location, When `add_stock()` is called, Then `REGISTRY.get_sample_value("inventory_quantity_changes_total", {"operation": "add"})` reflects the delta
  - Given test data, When `remove_stock()` is called, Then the "remove" counter is incremented
- Fixtures / hooks: Standard app/session/container fixtures; `REGISTRY.get_sample_value()` for assertions
- Gaps: None
- Evidence: `tests/conftest.py:53-76` (registry clearing fixture ensures isolation)

- Surface: KitService (direct metric calls)
- Scenarios:
  - Given an active kit, When `create_kit()` succeeds, Then `REGISTRY.get_sample_value("kits_created_total")` increments
  - Given an active kit, When `archive_kit()` succeeds, Then `kits_archived_total` increments
- Fixtures / hooks: Standard fixtures; `REGISTRY.get_sample_value()`
- Gaps: None
- Evidence: `tests/services/test_kit_service.py` (existing tests to be updated)

- Surface: ShutdownCoordinator (shutdown metrics)
- Scenarios:
  - Given a ShutdownCoordinator, When `shutdown()` is called, Then `REGISTRY.get_sample_value("application_shutting_down")` equals 1.0
  - Given a ShutdownCoordinator, When shutdown completes, Then `graceful_shutdown_duration_seconds` histogram has an observation
- Fixtures / hooks: Direct ShutdownCoordinator construction (no DI needed)
- Gaps: None
- Evidence: `tests/test_graceful_shutdown_integration.py` (to be updated)

- Surface: `/metrics` endpoint
- Scenarios:
  - Given a running app, When `GET /metrics` is called, Then the response has status 200 and content type `text/plain; version=0.0.4; charset=utf-8`
  - Given a running app with some metric activity, When `GET /metrics` is called, Then the response body contains expected metric names
- Fixtures / hooks: Flask test client
- Gaps: None
- Evidence: `tests/test_metrics_api.py` (to be updated)

- Surface: MouserService (module-level metrics)
- Scenarios:
  - Given a MouserService instance, When `search_by_part_number()` succeeds, Then `REGISTRY.get_sample_value("mouser_api_requests_total", {"endpoint": "partnumber", "status": "success"})` increments
- Fixtures / hooks: Standard fixtures; `REGISTRY.get_sample_value()`
- Gaps: None
- Evidence: `tests/services/test_mouser_service.py` (to be updated)

- Surface: All services with metrics (general pattern)
- Scenarios:
  - For each service that previously took `metrics_service` as a constructor parameter, verify that the constructor no longer requires it
  - For each module-level metric, verify it registers correctly and is updated by the expected code path
- Fixtures / hooks: `clear_prometheus_registry` autouse fixture provides isolation
- Gaps: None
- Evidence: All test files listed in section 2

---

## 14) Implementation Slices

- Slice: 1 -- Refactor MetricsService to polling-only
- Goal: Reduce MetricsService to its final shape (register_for_polling, background thread, shutdown) without breaking anything yet. Keep old methods as pass-through stubs temporarily.
- Touches: `app/services/metrics_service.py`
- Dependencies: None; this is the foundation slice

- Slice: 2 -- Move shutdown metrics to ShutdownCoordinator and TaskService
- Goal: `application_shutting_down` and `graceful_shutdown_duration_seconds` recorded directly by ShutdownCoordinator. `active_tasks_at_shutdown` recorded directly by TaskService (which owns the active task count). Remove shutdown metric methods from MetricsService.
- Touches: `app/utils/shutdown_coordinator.py`, `app/services/metrics_service.py`, `app/services/task_service.py`
- Dependencies: Slice 1

- Slice: 3 -- Extract dashboard polling callback
- Goal: Periodic gauge updates (inventory, storage, category) restructured as a registered callback.
- Touches: New `app/services/metrics/dashboard_metrics.py`, `app/services/metrics/__init__.py`, `app/__init__.py`, `app/services/metrics_service.py`
- Dependencies: Slice 1

- Slice: 4 -- Decentralize metrics in core services
- Goal: Move metric definitions to module level in InventoryService, KitService, KitPickListService, KitShoppingListService, ShoppingListLineService, PickListReportService. Remove MetricsServiceProtocol dependencies.
- Touches: All 6 service files listed, `app/services/container.py`
- Dependencies: Slice 1

- Slice: 5 -- Decentralize metrics in infrastructure services
- Goal: Move metrics to module level in ConnectionManager, TaskService, AuthService, OidcClientService, OpenAIRunner, AIService, DuplicateSearchService, MouserService.
- Touches: All 8 service/utility files listed, `app/services/container.py`
- Dependencies: Slice 1

- Slice: 6 -- Decentralize metrics in API layer
- Goal: Move `part_kit_usage_requests_total` to `app/api/parts.py`. Update `/metrics` endpoint to call `generate_latest()` directly.
- Touches: `app/api/parts.py`, `app/api/metrics.py`
- Dependencies: Slice 1

- Slice: 7 -- Remove MetricsServiceProtocol and StubMetricsService
- Goal: Delete the protocol ABC and the test stub. Clean up all remaining imports.
- Touches: `app/services/metrics_service.py`, `tests/testing_utils.py`, all files that import MetricsServiceProtocol
- Dependencies: Slices 4, 5, 6 (all consumers migrated)

- Slice: 8 -- Update tests
- Goal: All tests assert on Prometheus metric values directly. Remove MetricsService from service construction in tests.
- Touches: All test files listed in section 2
- Dependencies: Slices 4, 5, 6, 7

- Slice: 9 -- Update documentation
- Goal: Update CLAUDE.md metrics guidance section.
- Touches: `CLAUDE.md`
- Dependencies: All prior slices

---

## 15) Risks & Open Questions

- Risk: Module-level metric definitions cause import-order issues or duplicate registration errors in tests
- Impact: Test suite failures; blocked development
- Mitigation: The existing `clear_prometheus_registry` autouse fixture handles this. Verify early in Slice 4 that the pattern works with the existing test infrastructure.

- Risk: Polling callback session management regression (leaked sessions or uncommitted transactions)
- Impact: Connection pool exhaustion under background polling
- Mitigation: Follow the exact singleton session pattern from CLAUDE.md (try/commit/except/rollback/finally/reset). Copy the pattern verbatim from the existing `update_inventory_metrics()` implementation.

- Risk: Large diff size makes review difficult and introduces merge conflicts
- Impact: Slower review cycle; potential for missed regressions
- Mitigation: Implement in ordered slices. Each slice is independently testable. Keep the refactoring mechanical -- the business logic in each service does not change.

- Risk: Existing tests that mock MetricsService internals break silently (pass but no longer test meaningful behavior)
- Impact: False confidence in test coverage
- Mitigation: Slice 8 explicitly rewrites metric assertions to use `REGISTRY.get_sample_value()`, which tests actual Prometheus metric state rather than mock call counts.

---

## 16) Confidence

Confidence: High -- This is a well-scoped mechanical refactoring with clear before/after states for every file. The prometheus_client module-level pattern is idiomatic and battle-tested. The existing test infrastructure (registry clearing fixture) already supports the target pattern. No business logic changes.
