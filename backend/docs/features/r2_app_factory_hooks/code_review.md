# R2: Template-Owned App Factory with App Hooks -- Code Review

## 1) Summary & Decision

**Readiness**

The implementation is a clean, well-executed structural refactoring that faithfully follows the approved plan. All five slices (lifecycle coordinator rename, STARTUP event, pool diagnostics extraction, startup hooks, documentation) are delivered. The new `app/startup.py` module correctly separates app-specific hooks from template infrastructure. The `LifecycleCoordinator` with its `fire_startup()` method and idempotency guard is sound. Package-level wiring via `container.wire(packages=['app.api'])` replaces the brittle manual module list. The test suite is comprehensive with 688 lines of lifecycle coordinator tests and full rename coverage across 23 files. The only issues found are cosmetic: stale local variable/fixture names using the old `shutdown_coordinator` terminology in test files. These are fixture names and local variables, not import paths or class references, so the code is functionally correct but inconsistent with the rename intent.

**Decision**

`GO-WITH-CONDITIONS` -- Stale local variable names in test files should be renamed for consistency with the overall rename goal. No functional correctness issues found.

## 2) Conformance to Plan (with evidence)

**Plan alignment**

- `Plan Section 1: Rename ShutdownCoordinator -> LifecycleCoordinator` <-> `app/utils/lifecycle_coordinator.py:79` -- `class LifecycleCoordinator(LifecycleCoordinatorProtocol)` -- complete rename
- `Plan Section 1: Rename LifetimeEvent -> LifecycleEvent` <-> `app/utils/lifecycle_coordinator.py:27` -- `class LifecycleEvent(str, Enum)` -- complete rename
- `Plan Section 1: Rename register_lifetime_notification -> register_lifecycle_notification` <-> `app/utils/lifecycle_coordinator.py:102` -- `def register_lifecycle_notification(...)` -- complete rename
- `Plan Section 1: Add LifecycleEvent.STARTUP` <-> `app/utils/lifecycle_coordinator.py:28` -- `STARTUP = "startup"` -- present
- `Plan Section 1: Add fire_startup() with idempotency` <-> `app/utils/lifecycle_coordinator.py:119-127` -- `_started` flag prevents duplicate STARTUP dispatch
- `Plan Section 2: Extract pool diagnostics` <-> `app/utils/pool_diagnostics.py:18` -- `def setup_pool_logging(engine)` -- extracted with correct self-reference filter
- `Plan Section 2: Create app/startup.py` <-> `app/startup.py:1-105` -- three hooks: `create_container()`, `register_blueprints()`, `register_error_handlers()`
- `Plan Section 2: Restructure create_app()` <-> `app/__init__.py:66-121` -- hooks called at correct points in factory sequence
- `Plan Section 2: Replace wire_modules with package wiring` <-> `app/__init__.py:74` -- `container.wire(packages=['app.api'])`
- `Plan Section 2: Move app-specific blueprints from app/api/__init__.py` <-> `app/api/__init__.py:155-161` -- only `auth_bp` remains, with comment explaining app-specific registrations are in `app/startup.py`
- `Plan Section 2: Keep template blueprints in create_app()` <-> `app/__init__.py:127-143` -- health, metrics, testing, SSE, CAS registered by template
- `Plan Section 2: Keep auth hooks in app/api/__init__.py` <-> `app/api/__init__.py:24-152` -- before_request and after_request auth hooks untouched
- `Plan Section 2: fire_startup() at end of create_app() when not skip_background_services` <-> `app/__init__.py:212` -- `container.lifecycle_coordinator().fire_startup()` inside `if not skip_background_services` block
- `Plan Section 2: Update all tests` <-> `tests/test_lifecycle_coordinator.py`, `tests/testing_utils.py`, and 10+ test files updated
- `Plan Section 2: Update documentation` <-> `CLAUDE.md` and `AGENTS.md` both updated with new names, package wiring, startup.py

**Gaps / deviations**

- `Plan: Rename container.shutdown_coordinator to container.lifecycle_coordinator` -- completed in `app/services/container.py:125` and all DI call sites. However, fixture and local variable names in test files still use `shutdown_coordinator` (see Finding M-1 below). This is a cosmetic gap -- the code is functionally correct since these are local names, not import paths.
- `Plan: Rename constructor kwargs from shutdown_coordinator= to lifecycle_coordinator=` -- completed in all service constructors and container provider definitions. Some test call sites use positional arguments (e.g., `tests/test_task_service.py:32`) which works correctly but obscures the rename.
- `Plan: icons_bp registration on app` -- correctly moved to `app/startup.py:92` with guarded `api_bp` child registration at line 50.
- `Plan: URL interceptor registration` -- correctly moved to `app/startup.py:22-24` inside `create_container()`.

## 3) Correctness -- Findings (ranked)

- Title: `Minor (M-1) -- Stale local variable and fixture names referencing "shutdown_coordinator" in test files`
- Evidence: `tests/test_task_service.py:18` -- `def mock_shutdown_coordinator(self):`, `tests/test_metrics_service.py:20` -- `def shutdown_coordinator(self):`, `tests/test_metrics_service.py:98` -- `def test_shutdown_via_lifetime_event`, `tests/test_download_cache_service.py:26` -- `def test_shutdown_coordinator(self):`, `tests/test_graceful_shutdown_integration.py:24,181` -- `def shutdown_coordinator(self):`, and many fixture parameter references throughout these files
- Impact: No functional impact -- these are fixture names and local variable names, not class references or imports. However, they create confusion for developers who grep for `shutdown_coordinator` expecting to find remaining old references.
- Fix: Rename local fixture names from `shutdown_coordinator` / `mock_shutdown_coordinator` / `test_shutdown_coordinator` to `lifecycle_coordinator` / `mock_lifecycle_coordinator` / `test_lifecycle_coordinator` across: `tests/test_task_service.py`, `tests/test_metrics_service.py`, `tests/test_download_cache_service.py`, `tests/test_graceful_shutdown_integration.py`.
- Confidence: High

- Title: `Minor (M-2) -- Stale docstring/comment references to "shutdown coordinator" in test fixtures`
- Evidence: `tests/test_graceful_shutdown_integration.py:21` -- `"""Test TaskService integration with shutdown coordinator."""`, `tests/test_graceful_shutdown_integration.py:25` -- `"""Create shutdown coordinator for testing."""`, `tests/test_graceful_shutdown_integration.py:35` -- `"""Create TaskService with shutdown coordinator."""`
- Impact: No functional impact. Documentation inconsistency only.
- Fix: Update docstrings to reference "lifecycle coordinator" consistently.
- Confidence: High

## 4) Over-Engineering & Refactoring Opportunities

No over-engineering detected. The implementation is appropriately minimal:

- The `register_error_handlers` hook is a documented no-op (`pass`), which is correct since no app-specific error handlers exist yet. The hook exists as a stable extension point per the plan.
- The `_got_registered_once` guard in `app/startup.py:50` is a practical solution to Flask's constraint against registering child blueprints on an already-registered parent. The comment explains the reasoning clearly.
- Pool diagnostics extraction is a clean lift-and-shift with only the self-reference filter path updated (`/app/utils/pool_diagnostics.py` instead of `/app/__init__.py`).

## 5) Style & Consistency

- Pattern: Hook numbering comments in `app/__init__.py` are out of order
- Evidence: `app/__init__.py:66` -- `# --- Hook 1: Create service container ---`, `app/__init__.py:110` -- `# --- Hook 3: App-specific error handlers ---`, `app/__init__.py:118` -- `# --- Hook 2: App-specific blueprint registrations ---`
- Impact: Minor readability issue -- Hook 2 (blueprints) runs after Hook 3 (error handlers), which contradicts the numbering.
- Recommendation: Either renumber so the execution order matches (1=container, 2=error handlers, 3=blueprints) or drop the numbering and just use descriptive comments. The hook functions in `app/startup.py` are documented by name; numbering in the call site adds little value and can become stale.

## 6) Tests & Deterministic Coverage (new/changed behavior only)

- Surface: `LifecycleCoordinator.fire_startup()`
- Scenarios:
  - Given a coordinator with registered callbacks, When `fire_startup()` is called, Then all callbacks receive `LifecycleEvent.STARTUP` (`tests/test_lifecycle_coordinator.py::TestProductionLifecycleCoordinator::test_fire_startup_dispatches_event`)
  - Given `fire_startup()` was already called, When called again, Then it is a no-op (`tests/test_lifecycle_coordinator.py::TestProductionLifecycleCoordinator::test_fire_startup_idempotent`)
  - Given multiple registered callbacks, When `fire_startup()` is called, Then all callbacks are invoked (`tests/test_lifecycle_coordinator.py::TestProductionLifecycleCoordinator::test_fire_startup_multiple_callbacks`)
  - Given a callback that raises an exception, When `fire_startup()` is called, Then other callbacks still execute (`tests/test_lifecycle_coordinator.py::TestProductionLifecycleCoordinator::test_fire_startup_exception_handling`)
  - Given full lifecycle, When startup and shutdown both fire, Then events arrive in order STARTUP -> PREPARE_SHUTDOWN -> SHUTDOWN -> AFTER_SHUTDOWN (`tests/test_lifecycle_coordinator.py::TestProductionLifecycleCoordinator::test_full_lifecycle_with_startup`)
- Hooks: `TestLifecycleCoordinator.simulate_startup()` added in `tests/testing_utils.py:58-64`
- Gaps: None for the new functionality.
- Evidence: `tests/test_lifecycle_coordinator.py:319-414` (5 new tests for STARTUP); `tests/test_lifecycle_coordinator.py:485-499` (test for `simulate_startup`)

- Surface: `app/startup.py` hooks (create_container, register_blueprints, register_error_handlers)
- Scenarios:
  - Given the app fixture (default create_app), When all API endpoints are exercised, Then they respond correctly (full test suite regression -- 1350 tests)
  - Given `skip_background_services=True`, When template_connection fixture runs, Then `fire_startup()` is not called (guarded by `if not skip_background_services` at `app/__init__.py:172`)
- Hooks: Existing `app` fixture in `tests/conftest.py:206` exercises the full hook path
- Gaps: No dedicated unit tests for `app/startup.py` functions in isolation. Acceptable since they are thin wiring functions tested transitively through the full test suite.
- Evidence: `tests/conftest.py:219` calls `create_app(settings)` without `skip_background_services`, exercising the complete hook chain

- Surface: Renamed `LifecycleCoordinator` (formerly `ShutdownCoordinator`)
- Scenarios:
  - All 15 existing coordinator tests renamed and passing (`tests/test_lifecycle_coordinator.py:12-316`)
  - All 6 noop/test coordinator tests renamed and passing (`tests/test_lifecycle_coordinator.py:417-561`)
  - All 5 integration scenario tests renamed and passing (`tests/test_lifecycle_coordinator.py:564-687`)
- Hooks: `StubLifecycleCoordinator` and `TestLifecycleCoordinator` in `tests/testing_utils.py`
- Gaps: None.
- Evidence: `tests/test_lifecycle_coordinator.py` -- 688 lines, comprehensive coverage

- Surface: `app/utils/pool_diagnostics.py`
- Scenarios:
  - Implicitly tested through app startup when `db_pool_echo=True` (not exercised in default test settings where `db_pool_echo=False`)
- Hooks: N/A
- Gaps: No dedicated unit test for `setup_pool_logging()`. Acceptable per plan -- logic is unchanged from inline version and is a debug-only feature.
- Evidence: `app/__init__.py:56-59` calls `setup_pool_logging(db.engine)` conditionally

## 7) Adversarial Sweep

- Checks attempted: DI wiring with package scanning, blueprint registration completeness, lifecycle event dispatch safety, session/transaction boundary changes, migration/test data drift, observability metric registration
- Evidence: All fault lines probed below
- Why code held up:

  1. **DI wiring: `container.wire(packages=['app.api'])` covers all modules.** Previously 18 modules were listed explicitly. I verified that the `app.api` package includes all 18 sub-modules by checking that no module outside `app/api/` uses `@inject`. The `app.api.__init__` module itself also gets wired, which is needed for the `before_request` and `after_request` hooks that use `@inject`. Evidence: `app/api/__init__.py:25-26,91-92` use `@inject`; `app/__init__.py:74` wires `packages=['app.api']` which recursively includes all sub-modules.

  2. **Blueprint registration completeness.** I verified the 16 domain blueprints moved to `app/startup.py:70-86` against the 16 that were removed from `app/api/__init__.py` (diff lines 358-376). The `icons_bp` is separately registered at `app/startup.py:92`. The `auth_bp` stays in `app/api/__init__.py:159`. Template blueprints (health, metrics, testing, SSE, CAS) stay in `create_app()` at `app/__init__.py:127-143`. Total: 16 domain + 1 icons + 1 auth + 5 template = 23 blueprint registrations, matching the pre-refactoring count.

  3. **Lifecycle event dispatch safety.** `fire_startup()` uses `_started` flag with `_lifecycle_lock` (`app/utils/lifecycle_coordinator.py:121-125`), matching the idempotency pattern of `shutdown()` which uses `_shutting_down` flag. The `_raise_lifecycle_event` dispatches inside a try/except per callback (`app/utils/lifecycle_coordinator.py:198-202`), preventing one failing callback from blocking others.

  4. **Session/transaction boundaries.** No changes to session management. The `close_session` teardown at `app/__init__.py:145-169` is unchanged. No new database operations introduced.

  5. **No migration/test data changes needed.** This is a pure structural refactoring with no schema changes.

  6. **Observability metrics unaffected.** `APPLICATION_SHUTTING_DOWN` and `GRACEFUL_SHUTDOWN_DURATION_SECONDS` move with the file rename to `app/utils/lifecycle_coordinator.py:17-23` and are unchanged. The `clear_prometheus_registry` autouse fixture ensures test isolation. Tests in `tests/test_metrics_service.py:268-272` verify coordinator metrics exist under the new import path.

## 8) Invariants Checklist

- Invariant: Every endpoint that existed before the refactoring must remain routable after
  - Where enforced: `app/startup.py:50-86` registers all 16 domain blueprints on `api_bp`; `app/startup.py:92` registers `icons_bp` on `app`; full test suite (1350 tests) exercises all endpoints
  - Failure mode: Missing blueprint registration would produce 404 errors
  - Protection: `_got_registered_once` guard at `app/startup.py:50` prevents double-registration errors in tests; test suite catches missing routes
  - Evidence: `app/startup.py:50-92`, `tests/conftest.py:219`

- Invariant: `fire_startup()` fires exactly once, before the app begins serving requests
  - Where enforced: `app/utils/lifecycle_coordinator.py:121-125` -- `_started` flag with lock prevents duplicate dispatch; `app/__init__.py:212` -- called at end of `create_app()` inside `if not skip_background_services` block
  - Failure mode: Double STARTUP could confuse services expecting exactly-once semantics
  - Protection: `_started` flag + `_lifecycle_lock`; tested at `tests/test_lifecycle_coordinator.py:334-350`
  - Evidence: `app/utils/lifecycle_coordinator.py:119-127`

- Invariant: All services using lifecycle notifications must reference `LifecycleEvent` (not `LifetimeEvent`) for event matching
  - Where enforced: Old file `app/utils/shutdown_coordinator.py` is deleted; `LifetimeEvent` no longer exists. Any stale reference would be an `ImportError`.
  - Failure mode: Import error at startup if any file still imports `LifetimeEvent`
  - Protection: Python import system fails fast; mypy and ruff verify imports; test suite exercises all imports
  - Evidence: `app/utils/shutdown_coordinator.py` deleted; grep for `LifetimeEvent` in `*.py` returns zero matches

- Invariant: Container provider name `lifecycle_coordinator` must be used consistently by all DI consumers
  - Where enforced: `app/services/container.py:125` defines `lifecycle_coordinator = providers.Singleton(...)`. All services receive it via keyword args: `lifecycle_coordinator=lifecycle_coordinator` at container lines 134, 160, 242, 321.
  - Failure mode: Wrong provider name would raise `AttributeError` at construction time
  - Protection: `dependency-injector` fails fast on missing providers; test suite creates all services
  - Evidence: `app/services/container.py:125-321`

## 9) Questions / Needs-Info

No blocking questions. The implementation is clear and well-documented.

## 10) Risks & Mitigations (top 3)

- Risk: Stale `shutdown_coordinator` fixture/variable names in test files may confuse future developers who grep for remaining old references
- Mitigation: Rename all local fixture/variable names in the affected test files (M-1). This is a mechanical find-and-replace with no behavioral impact.
- Evidence: `tests/test_task_service.py:18`, `tests/test_metrics_service.py:20`, `tests/test_download_cache_service.py:26`, `tests/test_graceful_shutdown_integration.py:24,181`

- Risk: `_got_registered_once` is a private Flask attribute that could change between Flask versions
- Mitigation: The attribute has been stable since Flask 2.0. A defensive alternative would be a module-level flag in `app/startup.py`, but the current approach is pragmatic and tested.
- Evidence: `app/startup.py:50`

- Risk: `container.wire(packages=['app.api'])` wires all modules in the package, which could slow down startup if the package grows very large
- Mitigation: Currently 20 modules in `app.api`; the import overhead is negligible. If the package grows significantly, profiling can identify whether module-level wiring is a concern.
- Evidence: `app/__init__.py:74`

## 11) Confidence

Confidence: High -- The implementation is a faithful execution of a well-defined structural refactoring. All plan commitments are met, the new lifecycle coordinator is sound with proper idempotency guards, and the 1350-test suite provides strong regression coverage. The only findings are cosmetic naming inconsistencies in test fixtures.
