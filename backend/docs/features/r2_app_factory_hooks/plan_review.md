# R2: Template-Owned App Factory with App Hooks -- Plan Review

## 1) Summary & Decision

**Readiness**

The plan is thorough and well-researched. It covers a complex structural refactoring across 25+ source files and 10+ test files with clear implementation slices, a detailed file map with line-level evidence, and a comprehensive test plan. The lifecycle coordinator rename is mechanical and well-bounded. The app factory hook extraction is clearly scoped with three hook functions. The research log at section 0 demonstrates genuine discovery work and surfaces real conflicts (VersionService eager init, icons_bp registration, locations_bp wiring). The initial review surfaced several issues (LogCaptureHandler setter rename gap, incomplete test file map entries, `fire_startup()` stub implementations, auth_bp classification ambiguity, VersionService STARTUP migration complexity). All of these have been addressed in the updated plan: file map entries now include complete evidence for container.shutdown_coordinator references, the algorithm includes the LogCaptureHandler setup step, stubs explicitly note `fire_startup()` requirements, auth_bp classification is explicit, the VersionService approach is simplified, and a final verification grep step is included.

**Decision**

`GO` -- All previously identified conditions have been resolved. The plan is implementation-ready.

---

## 2) Conformance & Fit (with evidence)

**Conformance to refs**

- `CLAUDE.md` (Graceful Shutdown Integration) -- Pass -- `plan.md:52-63` -- The plan correctly identifies all four rename targets and the new STARTUP event, matching the established pattern documented in CLAUDE.md.
- `CLAUDE.md` (Dependency Injection) -- Pass -- `plan.md:253-254` -- Provider rename from `shutdown_coordinator` to `lifecycle_coordinator` is correctly scoped, and the plan accounts for all DI injection points.
- `CLAUDE.md` (No Backwards Compatibility) -- Pass -- `plan.md:235` -- "Direct rename. No backwards compatibility. All callers updated in the same change." Matches the project's policy of making breaking changes freely.
- `CLAUDE.md` (No Tombstones) -- Pass -- `plan.md:108-110` -- File rename from `shutdown_coordinator.py` to `lifecycle_coordinator.py` with full caller update; no re-exports or aliases at old paths.
- `docs/commands/plan_feature.md` (template compliance) -- Pass -- All 16 required sections are present and populated with evidence.
- `docs/product_brief.md` -- Pass -- This is a structural refactoring with no product behavior changes; no brief alignment issues.

**Fit with codebase**

- `app/__init__.py` -- `plan.md:307-328` -- The 20-step restructured create_app() sequence is faithful to the current 273-line function. Step 12 now correctly includes `log_handler.set_lifecycle_coordinator(container.lifecycle_coordinator())`. The file map at `plan.md:144-146` accounts for both `container.shutdown_coordinator()` and `log_handler.set_shutdown_coordinator()` call sites.
- `app/api/__init__.py` -- `plan.md:208-210` -- The plan now explicitly classifies `auth_bp` as template infrastructure and states it stays in `app/api/__init__.py` alongside the auth hooks. All other blueprint registrations move to `app/startup.py`.
- `app/utils/log_capture.py` -- `plan.md:132-134` -- The file map entry now includes the `set_shutdown_coordinator()` method rename and the call site at `app/__init__.py:168`.
- `tests/testing_utils.py` -- `plan.md:148-150` -- The file map entry now explicitly notes that both stubs must implement `fire_startup()` (no-op in StubLifecycleCoordinator, callback-dispatching in TestLifecycleCoordinator).
- `tests/test_health_api.py` -- `plan.md:168-170` -- The file map entry now includes all 9 `app.container.shutdown_coordinator()` calls.
- `tests/test_graceful_shutdown_integration.py` -- `plan.md:156-158` -- The file map entry now includes `container.shutdown_coordinator.override()` and `container.shutdown_coordinator()` calls at lines 233, 269, 272, 291.
- `run.py` -- `plan.md:140-142` -- Correctly identified. All references accounted for.
- `app/services/container.py` -- `plan.md:112-114` -- Correctly identified. Provider rename and downstream kwargs covered.

---

## 3) Open Questions & Ambiguities

No remaining open questions. The updated plan addresses:

- `auth_bp` classification: Explicitly classified as template infrastructure, stays in `app/api/__init__.py` (`plan.md:209`).
- `icons_bp` registration asymmetry: Acknowledged as intentional with a note for future normalization (`plan.md:31`).
- VersionService STARTUP approach: Simplified to move the eager construction call into `if not skip_background_services` without changing the constructor (`plan.md:27,528`).

---

## 4) Deterministic Backend Coverage (new/changed behavior only)

- Behavior: `LifecycleCoordinator.fire_startup()` -- new method
- Scenarios:
  - Given a LifecycleCoordinator with registered callbacks, When STARTUP event fires, Then all callbacks receive LifecycleEvent.STARTUP (`tests/test_lifecycle_coordinator.py::test_startup_fires_to_all_callbacks`)
  - Given a LifecycleCoordinator, When fire_startup() is called twice, Then the second call is a no-op (`tests/test_lifecycle_coordinator.py::test_startup_idempotency`)
  - Given a callback that raises on STARTUP, When fire_startup() is called, Then other callbacks still execute (`tests/test_lifecycle_coordinator.py::test_startup_exception_isolation`)
  - Given the full lifecycle, When STARTUP then shutdown fires, Then events arrive in order (`tests/test_lifecycle_coordinator.py::test_full_lifecycle_order`)
- Instrumentation: No new metrics planned (per plan line 424). Acceptable for a synchronous startup event.
- Persistence hooks: No migrations needed. Test data unchanged. DI wiring updates for provider rename. `tests/testing_utils.py` stubs updated with `fire_startup()` and `simulate_startup()`.
- Gaps: None.
- Evidence: `plan.md:456-465`

- Behavior: `app/startup.py` hook functions -- new module
- Scenarios:
  - Given the app fixture, When created, Then all existing endpoints respond correctly (regression via full suite)
  - Given `skip_background_services=True`, When app is created, Then `fire_startup()` is NOT called
  - Given `skip_background_services=False`, When app is created, Then `fire_startup()` IS called
- Instrumentation: None needed (structural refactoring).
- Persistence hooks: No migrations. DI wiring change (packages instead of modules).
- Gaps: None significant. The plan relies on regression via the full test suite, which is appropriate for a structural refactoring.
- Evidence: `plan.md:468-496`

- Behavior: `container.wire(packages=['app.api'])` -- wiring change
- Scenarios:
  - Given the app, When any `@inject` endpoint is called, Then DI injection works correctly (regression)
- Instrumentation: None needed.
- Persistence hooks: None.
- Gaps: None. Failure manifests as 500 errors on injected endpoints, caught by existing tests.
- Evidence: `plan.md:480-485`

- Behavior: Pool diagnostics extraction to `app/utils/pool_diagnostics.py`
- Scenarios:
  - Given `db_pool_echo=True`, When app starts, Then pool events are logged
  - Given `db_pool_echo=False`, When app starts, Then no pool logging occurs
- Instrumentation: None needed.
- Persistence hooks: None.
- Gaps: No dedicated unit test. Acceptable -- pure code movement, tested via integration.
- Evidence: `plan.md:509-516`

---

## 5) Adversarial Sweep

The initial review found four issues (2 Major, 2 Minor). All have been addressed in the updated plan. Below is the record of checks performed and their resolution.

- Checks attempted: LogCaptureHandler setter rename coverage, test file container.shutdown_coordinator references, stub ABC compliance, VersionService STARTUP migration timing, auth_bp classification, icons_bp registration asymmetry
- Evidence: `plan.md:132-134` (log_capture.py entry updated), `plan.md:156-158` (test_graceful_shutdown entry updated), `plan.md:168-170` (test_health_api entry updated), `plan.md:148-150` (testing_utils entry updated), `plan.md:209` (auth_bp classification explicit), `plan.md:31` (icons_bp asymmetry acknowledged), `plan.md:27` (VersionService approach simplified), `plan.md:320` (algorithm step 12 updated), `plan.md:543` (verification grep step added)
- Why the plan holds: All originally identified gaps have been filled with explicit evidence and resolution. The file map is now comprehensive. The algorithm is complete. Stubs are properly specified. The VersionService approach avoids constructor changes entirely. A final verification grep step guards against residual references.

---

## 6) Derived-Value & Persistence Invariants

- Derived value: Container provider name `lifecycle_coordinator`
  - Source dataset: `ServiceContainer` class definition, propagated to all DI injection points and `container.lifecycle_coordinator()` call sites
  - Write / cleanup triggered: Every `container.shutdown_coordinator()` call site and every `container.shutdown_coordinator.override()` test call must change
  - Guards: Python import system and DI container will raise `AttributeError` on wrong names, failing fast. Final grep step at S5 catches stragglers.
  - Invariant: Every provider reference must use `lifecycle_coordinator` consistently -- no mixed old/new names
  - Evidence: `plan.md:348-353`, `app/services/container.py:126-129`, `app/__init__.py:167`, `run.py:28`, `tests/test_health_api.py:29,55,119,139,156,193,252,273,291`, `tests/test_graceful_shutdown_integration.py:233,269,272,291`

- Derived value: `_lifecycle_notifications` callback list (renamed from `_shutdown_notifications`)
  - Source dataset: All services calling `register_lifecycle_notification()` during construction
  - Write / cleanup triggered: Callbacks fire on STARTUP, PREPARE_SHUTDOWN, SHUTDOWN, AFTER_SHUTDOWN events
  - Guards: Lock protects registration; exceptions in callbacks are caught and logged
  - Invariant: STARTUP fires exactly once before the app accepts requests; shutdown events fire at most once. The `_started` flag proposed at `plan.md:375` enforces this.
  - Evidence: `plan.md:355-360`, `app/utils/shutdown_coordinator.py:85,95-98,178-185`

- Derived value: Blueprint registration completeness
  - Source dataset: `app/startup.py:register_blueprints()` replaces registrations from `app/api/__init__.py:178-195` (excluding auth_bp which stays)
  - Write / cleanup triggered: Flask route table populated during app creation
  - Guards: Test suite exercises all endpoints; missing registrations cause 404s detected by existing tests
  - Invariant: Every endpoint that existed before refactoring must still be routable. Auth endpoints continue to work via `app/api/__init__.py`.
  - Evidence: `plan.md:362-367`, `app/api/__init__.py:178-195`

- Derived value: Wire coverage (all `@inject` endpoints must be wired)
  - Source dataset: `container.wire(packages=['app.api'])` replaces explicit module list
  - Write / cleanup triggered: `@inject` decorators in `app.api` submodules are patched with container providers
  - Guards: Unwired `@inject` endpoints fail with a clear error; existing tests catch this
  - Invariant: Every module under `app.api` that uses `@inject` must be covered by package-level wiring
  - Evidence: `plan.md:480-485`, `app/__init__.py:133-141`

---

## 7) Risks & Mitigations (top 3)

- Risk: Incomplete rename -- a reference to `shutdown_coordinator` survives in a file not in the file map, causing `AttributeError` at runtime.
- Mitigation: Slice S5 now includes a project-wide grep for all old names (`shutdown_coordinator`, `ShutdownCoordinator`, `LifetimeEvent`, `register_lifetime_notification`, `_raise_lifetime_event`, `set_shutdown_coordinator`) to confirm zero remaining references. File map has been expanded to include all known call sites.
- Evidence: `plan.md:543` (verification step), `plan.md:148-190` (expanded file map)

- Risk: VersionService not constructed during `skip_background_services=True` runs, breaking tests that rely on its observer callback.
- Mitigation: Plan now explicitly scopes the change: VersionService constructor is unchanged, only the call site moves into the `if not skip_background_services` block. Tests using `skip_background_services=True` (template_connection fixture) are schema-only and do not exercise SSE. The `app` fixture uses the default `skip_background_services=False`.
- Evidence: `plan.md:27`, `plan.md:563-565`

- Risk: `container.wire(packages=['app.api'])` changes wiring scope, potentially causing import errors or unexpected behavior.
- Mitigation: Plan notes this is low-impact: wiring extra modules is harmless, and the existing test suite covers all endpoints. The `locations.py` module (noted as not in the explicit wire list) uses `@inject` and is already imported transitively through `app.api.__init__`, so it was already wired.
- Evidence: `plan.md:551-553`

---

## 8) Confidence

Confidence: High -- The plan is well-researched, the core design is sound, and all previously identified conditions have been resolved. The file map is comprehensive with line-level evidence, the algorithm is complete, and the implementation slices are well-ordered. A competent developer following this plan will succeed.
