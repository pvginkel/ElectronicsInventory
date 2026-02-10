# Metrics Decentralization -- Code Review

## 1) Summary & Decision

**Readiness**

This is a well-executed mechanical refactoring that successfully moves all ~54 Prometheus metric definitions out of the monolithic MetricsService into module-level constants owned by the publishing services. The implementation follows the plan closely: MetricsService is reduced to a thin polling service, MetricsServiceProtocol and StubMetricsService are removed, the /metrics endpoint calls `generate_latest()` directly, shutdown metrics live in ShutdownCoordinator and TaskService, MouserService no longer monkey-patches metrics, and all tests assert on Prometheus metric values directly. The full test suite passes (1318 passed, 0 failed, 0 errors), mypy reports 0 errors, and ruff shows only pre-existing issues. CLAUDE.md and AGENTS.md are updated with comprehensive guidance for the new pattern. The refactoring is thorough and the code is cleaner, more maintainable, and follows idiomatic prometheus_client conventions.

**Decision**

`GO` -- All plan commitments are delivered, tests pass, type checking is clean, and no correctness issues were found.

---

## 2) Conformance to Plan (with evidence)

**Plan alignment**

- `Plan Section 2: MetricsService gutted to polling-only` <-> `app/services/metrics_service.py:1-123` -- Complete rewrite from ~1180 lines to 123 lines containing only `register_for_polling`, `start_background_updater`, `shutdown`, and lifetime event handling. All wrapper methods, protocol ABC, and metric definitions removed.
- `Plan Section 2: /metrics endpoint uses generate_latest() directly` <-> `app/api/metrics.py:6,21` -- `from prometheus_client import generate_latest` and `generate_latest().decode("utf-8")` called directly, no DI injection.
- `Plan Section 2: Shutdown metrics in ShutdownCoordinator` <-> `app/utils/shutdown_coordinator.py:11-24,129,166` -- `APPLICATION_SHUTTING_DOWN` and `GRACEFUL_SHUTDOWN_DURATION_SECONDS` defined at module level, recorded in `shutdown()` method.
- `Plan Section 2: active_tasks_at_shutdown in TaskService` <-> `app/services/task_service.py:27-30,387` -- `ACTIVE_TASKS_AT_SHUTDOWN` Gauge at module level, set in `_on_lifetime_event(PREPARE_SHUTDOWN)`.
- `Plan Section 2: Dashboard polling callback` <-> `app/services/metrics/dashboard_metrics.py:1-126` -- New module with 9 gauge definitions and `create_dashboard_polling_callback()` factory following singleton session pattern.
- `Plan Section 2: Container updated` <-> `app/services/container.py` -- `metrics_service` parameter removed from all 13 consuming services; MetricsService Singleton retained for polling only.
- `Plan Section 2: StubMetricsService removed` <-> `tests/testing_utils.py` -- Reduced from ~222 lines to 85 lines; only `StubShutdownCoordinator` and `TestShutdownCoordinator` remain.
- `Plan Section 2: All 14+ service files updated` <-> Module-level metrics confirmed in: `inventory_service.py`, `kit_service.py`, `kit_pick_list_service.py`, `kit_shopping_list_service.py`, `shopping_list_line_service.py`, `pick_list_report_service.py`, `connection_manager.py`, `task_service.py`, `auth_service.py`, `oidc_client_service.py`, `openai_runner.py`, `duplicate_search_service.py`, `mouser_service.py`, `api/parts.py`.
- `Plan Section 2: Tests assert on Prometheus values directly` <-> Tests use `counter.labels(...)._value.get()` before/after pattern (e.g., `tests/services/test_mouser_service.py:293-312`).
- `Plan Section 2: CLAUDE.md updated` <-> `AGENTS.md` (symlinked as `CLAUDE.md`) updated with new "Prometheus Metrics Infrastructure" section including architecture, adding metrics guidance, testing pattern, and key metric locations.

**Gaps / deviations**

- `Plan Section 1a: Requirement "Tests assert on Prometheus metric values directly rather than mocking MetricsService"` -- Some tests use the `_value.get()` internal API rather than `REGISTRY.get_sample_value()` as originally described in the plan. This is actually a better approach given the `clear_prometheus_registry` fixture behavior, and the CLAUDE.md documentation was updated to recommend this pattern. This is a positive deviation.
- No gaps identified. All plan commitments are fulfilled.

---

## 3) Correctness -- Findings (ranked)

No Blocker or Major correctness issues found. The refactoring is mechanical and preserves all existing behavior.

- Title: `Minor -- Dashboard polling callback swallows exceptions broadly`
- Evidence: `app/services/metrics/dashboard_metrics.py:119-121` -- `except Exception as e: session.rollback(); logger.error(...)`
- Impact: Any error in the polling callback (including programming errors) is caught and logged rather than propagated. This is intentional per the plan (Section 8: "Polling callback DB session error") and matches the previous MetricsService behavior.
- Fix: None required. This is acceptable for a background polling callback where resilience is preferred over fail-fast. The error is logged, and the next poll retries.
- Confidence: High

- Title: `Minor -- Background update loop waits before first poll`
- Evidence: `app/services/metrics_service.py:104-108` -- `self._stop_event.wait(interval_seconds)` before first callback invocation
- Impact: The first dashboard metric update happens after a full interval delay (default 60s) rather than immediately on startup. This matches the comment at line 100-102 ("Waits one full interval before the first tick so that application startup (and test fixtures) are not disrupted by concurrent DB queries on SQLite"). This is a deliberate design choice to avoid racing with app initialization, not a bug.
- Fix: None required. The previous MetricsService had the same wait-first behavior.
- Confidence: High

---

## 4) Over-Engineering & Refactoring Opportunities

No over-engineering found. The refactoring achieved a significant simplification:

- MetricsService went from ~1180 lines to 123 lines.
- MetricsServiceProtocol ABC (20 abstract methods) eliminated.
- StubMetricsService (134 lines of no-op stubs) eliminated.
- No unnecessary abstraction layers were introduced.

- Hotspot: `app/services/shopping_list_line_service.py:593-594` -- added guard `if len(group_lines) > 0` before incrementing counter
- Evidence: `app/services/shopping_list_line_service.py:592-594` -- `if len(group_lines) > 0: SHOPPING_LIST_LINES_MARKED_ORDERED_TOTAL.labels(mode="group").inc(len(group_lines))`
- Suggested refactor: The guard is reasonable but could be simplified to `if group_lines:` for idiomatic Python. This is a nitpick.
- Payoff: Marginal readability improvement.

---

## 5) Style & Consistency

- Pattern: Consistent module-level metric naming convention
- Evidence: All services use UPPER_SNAKE_CASE for module-level metrics (e.g., `INVENTORY_QUANTITY_CHANGES_TOTAL`, `KITS_CREATED_TOTAL`, `SSE_GATEWAY_CONNECTIONS_TOTAL`). Metric name strings use lowercase_with_underscores matching Prometheus conventions.
- Impact: Good maintainability -- the pattern is consistent and easy to follow.
- Recommendation: None; the pattern is well-applied.

- Pattern: Consistent test assertion pattern
- Evidence: Tests use `before = COUNTER.labels(...)._value.get()` / exercise / `after = COUNTER.labels(...)._value.get()` / `assert after - before == 1.0` (e.g., `tests/services/test_mouser_service.py:293-312`).
- Impact: Deterministic assertions that work with the `clear_prometheus_registry` fixture.
- Recommendation: None; this is documented in CLAUDE.md as the recommended pattern.

- Pattern: Metric recording placement -- metrics recorded after successful business logic, before returning
- Evidence: `app/services/kit_service.py:473-474` -- `KITS_CREATED_TOTAL.inc()` after `self.db.flush()` succeeds. `app/services/inventory_service.py:108` -- `INVENTORY_QUANTITY_CHANGES_TOTAL.labels(operation="add").inc(qty)` before `self.db.flush()`.
- Impact: In `inventory_service.py`, the counter is incremented before the flush. If the flush fails, the counter will have been incremented for a failed operation. This matches the previous behavior (the old wrapper was also called before flush) and is acceptable since metric precision is not critical -- eventual consistency is fine for monitoring.
- Recommendation: None; this matches pre-refactoring behavior and is acceptable for monitoring purposes.

---

## 6) Tests & Deterministic Coverage (new/changed behavior only)

- Surface: MetricsService polling infrastructure
- Scenarios:
  - Given a MetricsService, When a callback is registered, Then it appears in `_polling_callbacks` (`tests/test_metrics_service.py::TestMetricsServicePolling::test_register_for_polling`)
  - Given a running MetricsService, When background updater starts, Then thread is alive (`tests/test_metrics_service.py::TestMetricsServicePolling::test_background_updater_lifecycle`)
  - Given a running MetricsService, When started twice, Then only one thread exists (`tests/test_metrics_service.py::TestMetricsServicePolling::test_background_updater_double_start`)
  - Given a registered callback, When polling tick fires, Then callback is invoked (`tests/test_metrics_service.py::TestMetricsServicePolling::test_background_updater_invokes_callbacks`)
  - Given a failing callback, When polling tick fires, Then good callbacks still run (`tests/test_metrics_service.py::TestMetricsServicePolling::test_background_updater_handles_callback_errors`)
  - Given SHUTDOWN lifetime event, When fired, Then background thread stops (`tests/test_metrics_service.py::TestMetricsServicePolling::test_shutdown_via_lifetime_event`)
- Hooks: `StubShutdownCoordinator`, `MagicMock` container
- Gaps: None
- Evidence: `tests/test_metrics_service.py:16-117`

- Surface: Dashboard polling callback
- Scenarios:
  - Given mocked DashboardService, When callback executes, Then gauges are set to expected values (`tests/test_metrics_service.py::TestDashboardPollingCallback::test_dashboard_callback_updates_gauges`)
  - Given a failing DashboardService, When callback executes, Then error is handled without raising (`tests/test_metrics_service.py::TestDashboardPollingCallback::test_dashboard_callback_handles_errors`)
- Hooks: Full app/session/container fixtures; `patch.object(DashboardService, ...)`
- Gaps: None
- Evidence: `tests/test_metrics_service.py:119-179`

- Surface: Decentralized metric existence verification
- Scenarios:
  - For each service that now owns module-level metrics, verify the constants are importable and non-None (`tests/test_metrics_service.py::TestDecentralizedMetricsExist` -- 14 test methods covering all owning modules)
- Hooks: Module imports
- Gaps: None
- Evidence: `tests/test_metrics_service.py:182-312`

- Surface: /metrics endpoint
- Scenarios:
  - Given a running app, When GET /metrics, Then 200 with Prometheus text format (`tests/test_metrics_api.py::TestMetricsAPI` -- 10 test methods)
  - Given recorded metrics, When GET /metrics, Then response contains metric names (`tests/test_metrics_api.py::TestMetricsAPI::test_get_metrics_with_recorded_data`)
- Hooks: Flask test client
- Gaps: None
- Evidence: `tests/test_metrics_api.py:1-153`

- Surface: Service-level metric assertions (MouserService example)
- Scenarios:
  - Given a successful API call, When `search_by_part_number`, Then `MOUSER_API_REQUESTS_TOTAL.labels(endpoint="partnumber", status="success")` increments (`tests/services/test_mouser_service.py::TestMouserServiceMetrics::test_metrics_recorded_on_success`)
  - Given a failed API call, When `search_by_part_number`, Then error counter increments (`tests/services/test_mouser_service.py::TestMouserServiceMetrics::test_metrics_recorded_on_error`)
- Hooks: Module-level Counter import, `_value.get()` assertion pattern
- Gaps: None
- Evidence: `tests/services/test_mouser_service.py:281-312`

---

## 7) Adversarial Sweep (must attempt >=3 credible failures or justify none)

- Checks attempted: Duplicate metric name registration at import time, DI wiring correctness after removal, session management in polling callback, `time.time()` vs `time.perf_counter()` compliance, shutdown coordination integrity, test isolation with cleared registry
- Evidence: `app/services/metrics_service.py`, `app/services/container.py`, `app/services/metrics/dashboard_metrics.py`, `tests/conftest.py:53-76`, all service files
- Why code held up:

  **Attack 1: Duplicate metric names across modules.** Searched all module-level metric definitions for name collisions. Each metric name is globally unique (e.g., `inventory_quantity_changes_total`, `kits_created_total`, `mouser_api_requests_total`). No two modules define the same metric name string. Python module caching ensures each definition executes once per process. The `clear_prometheus_registry` autouse fixture (`tests/conftest.py:53-76`) prevents cross-test collisions.

  **Attack 2: DI container wiring after metrics_service removal.** Verified that all 13 services that previously received `metrics_service` in `container.py` had the parameter removed from both the container wiring AND the service constructor. Cross-checked: `InventoryService` (`container.py:183-189`, `inventory_service.py:36-54`), `KitService` (`container.py:213-219`, `kit_service.py:64-70`), `AuthService` (`container.py:163-166`, `auth_service.py:52-55`), `MouserService` (`container.py:269-273`, `mouser_service.py:38-42`), `AIService` (`container.py:301-315`, `ai_service.py:47-61`), `OpenAIRunner` (`container.py:249-252`, `openai_runner.py:60`), `DuplicateSearchService` (`container.py:255-260`, `duplicate_search_service.py:52-57`). All match. The `_create_ai_runner` factory also had `metrics` parameter removed (`container.py:53`). mypy passing with 0 errors confirms type-level correctness.

  **Attack 3: Session management in dashboard polling callback.** The callback in `app/services/metrics/dashboard_metrics.py:78-126` follows the singleton session pattern from CLAUDE.md: `session = container.db_session()` -> try/commit -> except/rollback -> finally/`container.db_session.reset()`. This is identical to the pattern in the original MetricsService, preserving the session lifecycle invariant. The `_poll` closure captures the container reference, which remains valid for the lifetime of the application.

  **Attack 4: `time.time()` usage.** Verified all metric duration measurements use `time.perf_counter()` (e.g., `kit_service.py:387`, `kit_pick_list_service.py:496`, `auth_service.py:146`, `mouser_service.py:163`, `pick_list_report_service.py:60`, `openai_runner.py:104`). No `time.time()` used for durations. The only `time.time()` call in `task_service.py:3` is imported but used only for `perf_counter` via `time.perf_counter()` at line 236.

  **Attack 5: Shutdown coordination integrity.** MetricsService still registers for `LifetimeEvent.SHUTDOWN` (`metrics_service.py:118-122`) via the `_on_lifetime_event` callback. ShutdownCoordinator records `APPLICATION_SHUTTING_DOWN` on entering shutdown (`shutdown_coordinator.py:129`) and `GRACEFUL_SHUTDOWN_DURATION_SECONDS` at end (`shutdown_coordinator.py:166`). TaskService records `ACTIVE_TASKS_AT_SHUTDOWN` on `PREPARE_SHUTDOWN` (`task_service.py:387`). The callback registration happens in constructors, same as before. No shutdown integration was lost.

---

## 8) Invariants Checklist (stacked entries)

- Invariant: Every Prometheus metric name is globally unique across the codebase
  - Where enforced: Module-level definitions in each service file; `prometheus_client` raises `ValueError` on duplicate registration
  - Failure mode: Two modules defining the same metric name string would cause an import-time crash
  - Protection: Unique naming convention per service domain; `clear_prometheus_registry` fixture in tests; all 1318 tests passing proves no import-time collisions
  - Evidence: All module-level metric definitions use service-specific prefixes (e.g., `kits_`, `inventory_`, `mouser_api_`, `ai_analysis_`, `sse_gateway_`)

- Invariant: MetricsService background polling thread is stopped on shutdown
  - Where enforced: `app/services/metrics_service.py:118-122` -- `_on_lifetime_event(SHUTDOWN)` calls `self.shutdown()` which sets `_stop_event` and joins thread
  - Failure mode: Thread continues polling after application shutdown, potentially accessing closed database connections
  - Protection: Daemon thread flag (`metrics_service.py:79`), `_stop_event.set()` + `join(timeout=5)` in shutdown
  - Evidence: `tests/test_metrics_service.py:98-116` tests shutdown via lifetime event

- Invariant: Dashboard polling callback always resets the database session
  - Where enforced: `app/services/metrics/dashboard_metrics.py:123-124` -- `finally: container.db_session.reset()`
  - Failure mode: Session leak causing connection pool exhaustion
  - Protection: `finally` block guarantees reset even on exception; `except` block rolls back before reset
  - Evidence: `app/services/metrics/dashboard_metrics.py:78-126` -- full try/commit/except/rollback/finally/reset pattern

- Invariant: Shutdown metrics are recorded during the shutdown sequence
  - Where enforced: `app/utils/shutdown_coordinator.py:129` (APPLICATION_SHUTTING_DOWN.set(1)), `app/utils/shutdown_coordinator.py:166` (GRACEFUL_SHUTDOWN_DURATION_SECONDS.observe), `app/services/task_service.py:387` (ACTIVE_TASKS_AT_SHUTDOWN.set)
  - Failure mode: Shutdown completes without recording metrics, losing observability into shutdown behavior
  - Protection: Metrics are recorded inline in the shutdown flow before raising further lifecycle events
  - Evidence: `tests/test_graceful_shutdown_integration.py` tests shutdown integration

---

## 9) Questions / Needs-Info

None. The implementation is clear and complete. All plan commitments are fulfilled, tests pass, and the code is well-documented.

---

## 10) Risks & Mitigations (top 3)

- Risk: Module import order could theoretically cause issues if a service is imported before `prometheus_client` is available, but this is not a real concern since `prometheus_client` is a standard pip dependency.
- Mitigation: All 1318 tests pass, including import-time metric registration. The `clear_prometheus_registry` fixture ensures test isolation.
- Evidence: `tests/test_metrics_service.py::TestDecentralizedMetricsExist` verifies all module-level metrics are importable.

- Risk: The `_value.get()` test assertion pattern relies on prometheus_client internal API which could change in a future library upgrade.
- Mitigation: This is an accepted trade-off documented in CLAUDE.md. The alternative `REGISTRY.get_sample_value()` does not work reliably with the `clear_prometheus_registry` fixture. The pattern is simple to migrate if the API changes.
- Evidence: `AGENTS.md` "Testing Metrics" section documents this pattern.

- Risk: Large diff size (~7000 lines across 45 files) increases the chance of a subtle regression being missed in review.
- Mitigation: The refactoring is mechanical (same metric names, same recording points, same label cardinalities). Full test suite passes with 1318 tests, mypy reports 0 errors, and the test coverage includes explicit metric value assertions for key services.
- Evidence: Verification results: `pytest: 1318 passed, 0 failed, 0 errors; mypy: 0 errors`.

---

## 11) Confidence

Confidence: High -- This is a clean mechanical refactoring with comprehensive test coverage (1318 passing), zero type errors, faithful plan conformance, and no correctness issues found. The resulting code is simpler, more maintainable, and follows idiomatic prometheus_client patterns.
