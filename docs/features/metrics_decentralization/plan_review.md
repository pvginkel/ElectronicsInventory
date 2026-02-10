# Metrics Decentralization -- Plan Review

## 1) Summary & Decision

**Readiness**

The plan is thorough, well-researched, and demonstrates strong alignment with the codebase. The research log accurately maps all 13+ consuming services, their call patterns, and the anti-patterns to fix (MouserService monkey-patching, DuplicateSearchService direct attribute access). The file map is exhaustive and evidence-backed. The implementation slices are logically ordered and the test plan covers all major surfaces. An initial review identified three issues (contradictory idempotency assumption, missing error-handling strategy for direct metric calls, and ambiguous `active_tasks_at_shutdown` ownership) -- all three have been addressed in the updated plan.

**Decision**

`GO` -- All previously identified issues have been resolved. The plan is implementation-ready with clear before/after states for every file, a well-structured slice ordering, and comprehensive test coverage.

---

## 2) Conformance & Fit (with evidence)

**Conformance to refs**

- `CLAUDE.md` (Prometheus Metrics Infrastructure) -- Pass -- `plan.md:78-88` -- The plan correctly targets updating this section and the new module-level pattern aligns with standard `prometheus_client` idiom.
- `CLAUDE.md` (Service Layer requirements) -- Pass -- `plan.md:62` -- Services will no longer depend on MetricsService for recording, removing a cross-cutting concern from the service constructor.
- `CLAUDE.md` (Graceful Shutdown Integration) -- Pass -- `plan.md:266-283` -- Shutdown metrics split correctly: `application_shutting_down` and `graceful_shutdown_duration_seconds` move to ShutdownCoordinator, `active_tasks_at_shutdown` stays with TaskService.
- `CLAUDE.md` (Testing Requirements) -- Pass -- `plan.md:446-513` -- Test plan covers MetricsService, dashboard polling, individual services, ShutdownCoordinator, and the `/metrics` endpoint.
- `CLAUDE.md` (Error Handling Philosophy) -- Pass -- `plan.md:384-388` -- Plan explicitly states direct metric calls will NOT be wrapped in try/except, following the "fail fast" philosophy, with clear justification.
- `docs/product_brief.md` -- Pass -- No product-level impact; this is a pure internal refactoring.
- `docs/commands/plan_feature.md` -- Pass -- All 16 plan sections are present and filled with appropriate detail.

**Fit with codebase**

- `app/services/container.py` -- `plan.md:199-201` -- Plan correctly identifies all 13 services receiving `metrics_service` and the `_create_ai_runner` factory. Verified against `container.py:157-330`.
- `app/services/ai_service.py` -- `plan.md:183-185` -- Plan correctly identifies that AIService accepts `metrics_service` in its constructor but never references `self.metrics` anywhere in the file. Confirmed via grep -- no `self.metrics` references exist in the file.
- `app/utils/shutdown_coordinator.py` -- `plan.md:135-137` -- ShutdownCoordinator currently has no Prometheus imports. Adding module-level metrics and recording in `shutdown()` is feasible; the shutdown flow at lines 105-167 has clear insertion points.
- `tests/conftest.py:53-76` -- `plan.md:101-102` -- The `clear_prometheus_registry` autouse fixture unregisters all collectors before and after each test. This will work with module-level metrics since those metrics are registered against the global `REGISTRY`.
- `app/services/task_service.py:386` -- `plan.md:167-169` -- TaskService correctly retains ownership of `active_tasks_at_shutdown` since it is the only service that knows the active task count.

---

## 3) Open Questions & Ambiguities

No blocking open questions remain after the plan amendments. The three previously identified ambiguities have been resolved:

1. `prometheus_client` idempotency -- Clarified at `plan.md:101` with accurate explanation of module-level behavior and test fixture handling.
2. Error-handling strategy -- Documented at `plan.md:384-388` with explicit "no try/except" decision and justification.
3. `active_tasks_at_shutdown` ownership -- Resolved at `plan.md:276-283` with TaskService retaining the metric.

---

## 4) Deterministic Backend Coverage (new/changed behavior only)

- Behavior: MetricsService `register_for_polling` / background loop
- Scenarios:
  - Given a MetricsService with no callbacks, When background loop runs, Then no errors (`tests/test_metrics_service.py`)
  - Given a registered callback, When loop runs, Then callback is invoked (`tests/test_metrics_service.py`)
  - Given a failing callback, When loop runs, Then error is logged and loop continues (`tests/test_metrics_service.py`)
  - Given a running service, When shutdown() called, Then thread stops within 5s (`tests/test_metrics_service.py`)
- Instrumentation: Structured ERROR log on callback failure
- Persistence hooks: No migrations. DI container wiring updated to simplified MetricsService constructor.
- Gaps: None
- Evidence: `plan.md:448-457`

- Behavior: Dashboard metrics polling callback
- Scenarios:
  - Given test data, When callback executes, Then gauges are set to expected values via `REGISTRY.get_sample_value()`
  - Given DB error, When callback executes, Then session is properly reset
- Instrumentation: ERROR log on failure
- Persistence hooks: New file `app/services/metrics/dashboard_metrics.py` created with `create_dashboard_polling_callback(container)` factory function.
- Gaps: None -- container access pattern now specified (closure capturing container reference at `plan.md:203-205`, `plan.md:314-325`).
- Evidence: `plan.md:459-466`

- Behavior: ShutdownCoordinator recording shutdown metrics
- Scenarios:
  - Given a ShutdownCoordinator, When `shutdown()` called, Then `application_shutting_down` gauge = 1.0
  - Given shutdown completes, Then `graceful_shutdown_duration_seconds` histogram has observation
- Instrumentation: Module-level Gauge/Histogram in `shutdown_coordinator.py`
- Persistence hooks: No migrations. Module-level metric definitions added at import time.
- Gaps: None -- `active_tasks_at_shutdown` ownership clarified (stays in TaskService at `plan.md:276-283`).
- Evidence: `plan.md:484-490`

- Behavior: TaskService recording `active_tasks_at_shutdown` directly
- Scenarios:
  - Given a TaskService with active tasks, When `PREPARE_SHUTDOWN` event fires, Then `REGISTRY.get_sample_value("active_tasks_at_shutdown")` equals the active count
- Instrumentation: Module-level Gauge in `task_service.py`
- Persistence hooks: No migrations. Module-level metric definition at import time.
- Gaps: None
- Evidence: `plan.md:276-283`

- Behavior: `/metrics` endpoint using `generate_latest()` directly
- Scenarios:
  - Given running app, When GET /metrics, Then 200 with Prometheus text format
  - Given metric activity, When GET /metrics, Then response contains expected metric names
- Instrumentation: N/A (this IS the instrumentation endpoint)
- Persistence hooks: DI wiring for `app/api/metrics.py` simplified (MetricsService injection removed)
- Gaps: None
- Evidence: `plan.md:492-498`

---

## 5) Adversarial Sweep

All three previously identified Major issues have been resolved in the updated plan. Here is the status:

**Resolved -- Contradictory assumption about prometheus_client idempotent registration**

- Checks attempted: Verified `plan.md:101` now accurately states prometheus_client does NOT handle idempotent registration and explains why module-level definitions are safe (Python module caching + test fixture clearing).
- Evidence: `plan.md:101` -- "Note that prometheus_client does NOT handle idempotent registration -- it raises ValueError on duplicate metric names. However, module-level definitions execute only once per process..."
- Why the plan holds: The explanation is technically accurate. Module-level code executes once per import, and the `clear_prometheus_registry` fixture handles test isolation.

**Resolved -- Loss of error guards around metric calls**

- Checks attempted: Verified `plan.md:384-388` now explicitly documents the error-handling strategy.
- Evidence: `plan.md:384-388` -- "Direct metric calls will NOT be wrapped in try/except. Per CLAUDE.md's 'fail fast and fail often' philosophy..."
- Why the plan holds: The justification is sound: metric definitions are compile-time constants, label values come from controlled code paths, and any misconfiguration surfaces immediately in tests.

**Resolved -- `active_tasks_at_shutdown` metric ownership gap**

- Checks attempted: Verified `plan.md:276-283` now assigns the metric to TaskService with clear rationale.
- Evidence: `plan.md:276-283` -- "active_tasks_at_shutdown remains owned by TaskService since it is the only service that knows the active task count."
- Why the plan holds: This follows the plan's own principle of "metrics owned by the publishing service."

**Additional check -- Module-level metrics in singleton services**

- Checks attempted: ConnectionManager, AuthService, and OidcClientService are all `Singleton` providers in the container (`container.py:164-181`). Moving their metrics to module level is safe because module-level Prometheus metrics are process-global singletons anyway -- there is no risk of double-registration from singleton services being instantiated once.
- Evidence: `container.py:164-181` (singleton providers), `plan.md:163-177` (file map entries for these services)
- Why the plan holds: Module-level metrics are orthogonal to service lifecycle. The metrics exist at import time, regardless of whether services are singletons or factories.

---

## 6) Derived-Value & Persistence Invariants

- Derived value: `inventory_total_parts` gauge (and related inventory gauges)
  - Source dataset: Unfiltered query via `DashboardService.get_dashboard_stats()` in polling callback
  - Write / cleanup triggered: Gauge `.set()` on each poll cycle; no persistent writes
  - Guards: Polling callback wrapped in try/except; session reset in finally block
  - Invariant: Gauge values reflect the most recent successful poll; stale values are acceptable (eventual consistency with 60s polling interval)
  - Evidence: `plan.md:331-336`

- Derived value: `inventory_box_utilization_percent` gauge (per-box)
  - Source dataset: Unfiltered query via `DashboardService.get_storage_summary()` in polling callback
  - Write / cleanup triggered: Gauge `.clear()` then `.labels().set()` on each poll; no persistent writes
  - Guards: Clear + set must be within the same try block. A failure between clear and set leaves the gauge temporarily empty. This is acceptable for monitoring.
  - Invariant: Labels reflect current box numbers; removed boxes disappear from metrics after next poll
  - Evidence: `plan.md:338-343`

- Derived value: `kits_active_count` / `kits_archived_count` gauges
  - Source dataset: Incremented/decremented by KitService on create/archive/unarchive; periodically corrected by `record_kit_overview_request()` when a full list is fetched without limit
  - Write / cleanup triggered: Gauge `.inc()` / `.dec()` / `.set()` on each kit lifecycle event; no persistent writes
  - Guards: The correction path (setting absolute count on overview request) prevents drift. After refactoring, these gauges become module-level in `kit_service.py` and the correction logic must be preserved.
  - Invariant: Active + archived counts must sum to total kits (approximately; counters may drift between correction points)
  - Evidence: `plan.md:143-145`, `app/services/metrics_service.py:717-753`

---

## 7) Risks & Mitigations (top 3)

- Risk: Module-level metric definitions interact unexpectedly with the test fixture `clear_prometheus_registry`, causing test isolation failures or import-order-dependent test results.
- Mitigation: Validate early in Slice 4 by running the full test suite after migrating a single service (e.g., InventoryService). The fixture at `tests/conftest.py:53-76` unregisters all collectors, which should handle module-level metrics.
- Evidence: `plan.md:568-570`, `tests/conftest.py:53-76`

- Risk: Large cross-cutting refactoring (20+ files, 13+ services) creates merge conflicts with concurrent feature work and increases review burden.
- Mitigation: Implement in ordered slices as planned. Each slice should be independently testable and committable. Consider splitting into multiple PRs if the total diff exceeds ~1500 lines.
- Evidence: `plan.md:576-578`

- Risk: Polling callback session management regression (leaked sessions or uncommitted transactions) could exhaust the connection pool.
- Mitigation: Follow the exact singleton session pattern from CLAUDE.md (try/commit/except/rollback/finally/reset). The plan now specifies the `create_dashboard_polling_callback(container)` factory pattern at `plan.md:203-205` and the step-by-step flow at `plan.md:314-325`.
- Evidence: `plan.md:572-574`

---

## 8) Confidence

Confidence: High -- The plan is well-researched with accurate codebase evidence. All three issues identified in the initial review have been addressed with specific plan amendments. The remaining risks are execution-level concerns (test fixture compatibility, merge conflicts) that are mitigated by the slice-based implementation approach.
