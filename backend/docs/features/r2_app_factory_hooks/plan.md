# R2: Template-Owned App Factory with App Hooks — Technical Plan

## 0) Research Log & Findings

### Areas Researched

**Shutdown Coordinator and Lifecycle Events.** The current `ShutdownCoordinator` lives at `app/utils/shutdown_coordinator.py` and defines `LifetimeEvent` (3 values: PREPARE_SHUTDOWN, SHUTDOWN, AFTER_SHUTDOWN), `ShutdownCoordinatorProtocol` (ABC), and `ShutdownCoordinator` (concrete implementation). It is referenced across 16 source files and 13 test files. The `register_lifetime_notification` method is the primary registration API. Internal method `_raise_lifetime_event` dispatches events.

**App Factory (`app/__init__.py`).** The `create_app()` function is 273 lines. Key coupling points:
- Lines 133-141: Manual `wire_modules` list with 18 entries.
- Lines 143-148: Inline URL interceptor registration (app-specific).
- Lines 150-152: Inline VersionService eager initialization (app-specific).
- Lines 52-120: 68-line pool diagnostics block inline.
- Lines 182-209: Mixed blueprint registrations (template and app-specific together).
- Lines 237-271: Hardcoded background service startup.

**`app/api/__init__.py`.** Contains `api_bp` creation (line 21), auth hooks (lines 24-152), and 18 app-specific blueprint imports + registrations (lines 159-195). The auth hooks are template code; the blueprint registrations are app-specific.

**Service Container (`app/services/container.py`).** Uses `shutdown_coordinator` as a `Singleton` provider (line 126). Services receiving it: `temp_file_manager`, `metrics_service`, `task_service`, `version_service`. The container is entirely app-owned.

**Test Infrastructure.** `tests/testing_utils.py` defines `StubShutdownCoordinator` and `TestShutdownCoordinator`. Used in 8 test files. The test `conftest.py` has hardcoded shutdown cleanup (lines 225-236) calling individual service shutdown methods.

**Error Handler Structure.** `app/utils/flask_error_handlers.py` already provides `register_core_error_handlers`, `register_business_error_handlers`, and `register_app_error_handlers` (convenience wrapper). R1 is already complete. The current `create_app()` calls `register_app_error_handlers(app)` at line 180. The plan needs to split this: template calls core + business, then app hook calls app-specific. However, since all current exception handlers are already in `flask_error_handlers.py` and there are no truly app-specific handlers separate from the business handlers, the `register_error_handlers` hook in `app/startup.py` can initially be a no-op or empty function.

### Conflicts Identified and Resolved

**VersionService eager initialization.** Currently `container.version_service()` is called at line 152 of `create_app()` to eagerly register its SSE observer callback. Post-refactoring, this call moves into the `if not skip_background_services` block, just before `fire_startup()`. VersionService's constructor already registers `_on_connect_callback` with ConnectionManager and `_handle_lifetime_event` with the shutdown coordinator at `app/services/version_service.py:38,41` -- this behavior does not change. The eager construction simply moves from an unconditional call to a conditional one, which means VersionService will not be constructed during `skip_background_services=True` runs (template_connection fixture, CLI mode). This is acceptable because VersionService's observer callback is only needed when the app is actually serving requests with background services active.

**URL interceptor registration.** Currently at lines 143-148 of `create_app()`. This is app-specific. Resolution: Move to `app/startup.py:register_blueprints()` since it naturally happens alongside blueprint setup.

**`icons_bp` registration.** `icons_bp` has `url_prefix="/api/icons"` but is registered directly on the Flask app in `create_app()` (line 209) rather than on `api_bp`. It is not inside `app/api/__init__.py`'s blueprint list either. It is app-specific. Resolution: Move to `app/startup.py:register_blueprints()` where it registers on `app` to preserve existing routes. Note: this means `register_blueprints(api_bp, app)` registers most blueprints on `api_bp` but `icons_bp` on `app`. This is an intentional asymmetry to avoid changing route paths; it can be normalized in a future cleanup by moving `icons_bp` onto `api_bp` with an adjusted prefix.

**`locations_bp`.** This blueprint is registered on `api_bp` in `app/api/__init__.py` (line 186) but is NOT in the wire_modules list. This is fine because wiring only matters for modules using `@inject`. With the switch to `container.wire(packages=['app.api'])`, all modules in the `app.api` package get wired automatically.

---

## 1) Intent & Scope

**User intent**

Refactor the Electronics Inventory backend so that `create_app()` becomes stable, template-owned code, and all app-specific behavior is injected through three well-defined hook functions in `app/startup.py`. Simultaneously, rename `ShutdownCoordinator` to `LifecycleCoordinator`, add a `STARTUP` lifecycle event, extract pool diagnostics to a utility module, and replace the manually maintained wire_modules list with package-level wiring.

**Prompt quotes**

"Rename ShutdownCoordinator to LifecycleCoordinator (class, protocol, file, all references)"
"Create app/startup.py with three hook functions: create_container(), register_blueprints(), register_error_handlers()"
"Replace wire_modules list with container.wire(packages=['app.api'])"
"Fire lifecycle.fire_startup() at end of create_app() when skip_background_services is False"

**In scope**

- Rename ShutdownCoordinator -> LifecycleCoordinator, LifetimeEvent -> LifecycleEvent, ShutdownCoordinatorProtocol -> LifecycleCoordinatorProtocol, register_lifetime_notification -> register_lifecycle_notification
- Rename file from `shutdown_coordinator.py` to `lifecycle_coordinator.py`
- Add LifecycleEvent.STARTUP and fire_startup() method
- Extract pool diagnostics to `app/utils/pool_diagnostics.py`
- Create `app/startup.py` with three hook functions
- Restructure `create_app()` to call hooks from `app/startup.py`
- Replace wire_modules list with `container.wire(packages=['app.api'])`
- Move app-specific blueprint registrations from `app/api/__init__.py` to `app/startup.py`
- Keep template blueprints (health, metrics, testing, SSE, CAS) in `create_app()`
- Keep auth hooks in `app/api/__init__.py`
- Fire `lifecycle.fire_startup()` at end of `create_app()`
- Update all callers, tests, documentation

**Out of scope**

- Splitting error handlers into template vs app-specific (all business exception handlers stay in `flask_error_handlers.py` for now; the app hook starts empty)
- Removing app-specific startup logic from `create_app()` background services block (template infra stays; STARTUP event coexists)
- Service container refactoring (remains app-owned)
- Copier template extraction itself
- Feature-flagged configuration (R3)
- Metric prefix rename (R4)

**Assumptions / constraints**

- R1 (Flask error handler migration) is already complete.
- All existing tests must pass without behavioral changes.
- The `dependency-injector` library supports `container.wire(packages=['app.api'])` for recursive package wiring.
- The `icons_bp` continues to register on the Flask `app` directly (not on `api_bp`) to preserve existing routes.

---

## 1a) User Requirements Checklist

**User Requirements Checklist**

- [ ] Rename ShutdownCoordinator to LifecycleCoordinator (class, protocol, file, all references)
- [ ] Rename LifetimeEvent to LifecycleEvent
- [ ] Rename register_lifetime_notification to register_lifecycle_notification
- [ ] Add LifecycleEvent.STARTUP event
- [ ] Add fire_startup() method on the coordinator
- [ ] Extract pool diagnostics from create_app() into app/utils/pool_diagnostics.py
- [ ] Create app/startup.py with three hook functions: create_container(), register_blueprints(), register_error_handlers()
- [ ] Restructure create_app() to call the three hooks from app/startup.py
- [ ] Replace wire_modules list with container.wire(packages=['app.api'])
- [ ] Move app-specific blueprint registrations from app/api/__init__.py to app/startup.py:register_blueprints()
- [ ] Keep template blueprints (health, metrics, testing, SSE, CAS) registered in create_app()
- [ ] Keep auth hooks (before_request, after_request) in app/api/__init__.py
- [ ] Fire lifecycle.fire_startup() at end of create_app() when skip_background_services is False
- [ ] All existing tests must continue to pass with no behavioral changes

---

## 2) Affected Areas & File Map

### Lifecycle Coordinator Rename

- Area: `app/utils/shutdown_coordinator.py` (rename to `app/utils/lifecycle_coordinator.py`)
- Why: Primary target of rename -- class, protocol, enum, method names all change.
- Evidence: `app/utils/shutdown_coordinator.py:27-186` -- LifetimeEvent, ShutdownCoordinatorProtocol, ShutdownCoordinator, register_lifetime_notification, _raise_lifetime_event

- Area: `app/services/container.py`
- Why: Import path changes, provider name changes from `shutdown_coordinator` to `lifecycle_coordinator`.
- Evidence: `app/services/container.py:49` -- `from app.utils.shutdown_coordinator import ShutdownCoordinator`; `app/services/container.py:126-129` -- `shutdown_coordinator = providers.Singleton(ShutdownCoordinator, ...)`

- Area: `app/services/metrics_service.py`
- Why: Imports and references to LifetimeEvent, ShutdownCoordinatorProtocol, register_lifetime_notification.
- Evidence: `app/services/metrics_service.py:8,11,33,46-47,118-122`

- Area: `app/services/task_service.py`
- Why: Imports and references to LifetimeEvent, ShutdownCoordinatorProtocol, register_lifetime_notification.
- Evidence: `app/services/task_service.py:23,86,115,377-385`

- Area: `app/services/version_service.py`
- Why: Imports and references to LifetimeEvent, ShutdownCoordinatorProtocol. Constructor parameter `shutdown_coordinator` renamed to `lifecycle_coordinator`. No changes to initialization logic (observer callback registration stays in constructor).
- Evidence: `app/services/version_service.py:14,25,30,41,138-148`

- Area: `app/utils/temp_file_manager.py`
- Why: Imports and references to LifetimeEvent, ShutdownCoordinatorProtocol, register_lifetime_notification.
- Evidence: `app/utils/temp_file_manager.py:12,36,57,240-244`

- Area: `app/utils/log_capture.py`
- Why: Imports and references to LifetimeEvent, ShutdownCoordinatorProtocol. Also rename `set_shutdown_coordinator()` method to `set_lifecycle_coordinator()` and update the call site in `app/__init__.py:168`.
- Evidence: `app/utils/log_capture.py:12,26,37,40,42-45` -- imports and protocol references; `app/utils/log_capture.py:37` -- `set_shutdown_coordinator` method definition; `app/__init__.py:168` -- call site `log_handler.set_shutdown_coordinator(shutdown_coordinator)`

- Area: `app/api/health.py`
- Why: Imports ShutdownCoordinatorProtocol; type annotations in endpoint signatures.
- Evidence: `app/api/health.py:14,26,80`

- Area: `run.py`
- Why: Imports LifetimeEvent; references `shutdown_coordinator`.
- Evidence: `run.py:12,28,41-42,47,51,69-70,73`

- Area: `app/__init__.py`
- Why: References `container.shutdown_coordinator()` and `log_handler.set_shutdown_coordinator(shutdown_coordinator)`; also the primary target for restructuring with hooks.
- Evidence: `app/__init__.py:167` -- `shutdown_coordinator = container.shutdown_coordinator()`; `app/__init__.py:168` -- `log_handler.set_shutdown_coordinator(shutdown_coordinator)`

- Area: `tests/testing_utils.py`
- Why: Defines StubShutdownCoordinator and TestShutdownCoordinator; must rename to StubLifecycleCoordinator and TestLifecycleCoordinator. Both stubs must also implement the new `fire_startup()` abstract method: a no-op in StubLifecycleCoordinator, and a callback-dispatching version in TestLifecycleCoordinator (also add `simulate_startup()` convenience method).
- Evidence: `tests/testing_utils.py:6,9,26,43`

- Area: `tests/test_shutdown_coordinator.py` (rename to `tests/test_lifecycle_coordinator.py`)
- Why: All tests reference old names.
- Evidence: `tests/test_shutdown_coordinator.py:8-9,12-17` -- entire file

- Area: `tests/test_graceful_shutdown_integration.py`
- Why: References ShutdownCoordinator, TestShutdownCoordinator, LifetimeEvent. Also uses `container.shutdown_coordinator.override()` and `container.shutdown_coordinator()` which must change to `container.lifecycle_coordinator`.
- Evidence: `tests/test_graceful_shutdown_integration.py:14,17` -- imports; `tests/test_graceful_shutdown_integration.py:233,269,272,291` -- `container.shutdown_coordinator.override()` and `container.shutdown_coordinator()` calls

- Area: `tests/test_metrics_service.py`
- Why: References StubShutdownCoordinator.
- Evidence: `tests/test_metrics_service.py:13,20-21,24,98,111-112`

- Area: `tests/test_task_service.py`
- Why: References StubShutdownCoordinator.
- Evidence: `tests/test_task_service.py:11,18,20,29,32`

- Area: `tests/test_health_api.py`
- Why: References StubShutdownCoordinator; `isinstance` checks with StubShutdownCoordinator. Also uses `app.container.shutdown_coordinator()` extensively which must change to `app.container.lifecycle_coordinator()`.
- Evidence: `tests/test_health_api.py:8,29,32,55,58` -- imports and isinstance checks; `tests/test_health_api.py:29,55,119,139,156,193,252,273,291` -- `app.container.shutdown_coordinator()` calls

- Area: `tests/test_task_api.py`
- Why: References StubShutdownCoordinator.
- Evidence: `tests/test_task_api.py:12,132`

- Area: `tests/test_ai_service.py`
- Why: References StubShutdownCoordinator.
- Evidence: `tests/test_ai_service.py:26,50`

- Area: `tests/test_temp_file_manager.py`
- Why: References StubShutdownCoordinator.
- Evidence: `tests/test_temp_file_manager.py:12,23,145`

- Area: `tests/test_download_cache_service.py`
- Why: References StubShutdownCoordinator.
- Evidence: `tests/test_download_cache_service.py:13,26-27,30,35`

- Area: `tests/test_utils_api.py`
- Why: References LifetimeEvent.
- Evidence: `tests/test_utils_api.py:11`

### Pool Diagnostics Extraction

- Area: `app/utils/pool_diagnostics.py` (new file)
- Why: Extract 68-line pool logging block from create_app().
- Evidence: `app/__init__.py:52-120` -- inline pool event logging

### App Startup Hooks

- Area: `app/startup.py` (new file)
- Why: New module containing three app-specific hook functions.
- Evidence: `docs/features/r2_app_factory_hooks/change_brief.md:38-44`

- Area: `app/__init__.py`
- Why: Restructure create_app() to call hooks.
- Evidence: `app/__init__.py:18-272` -- entire create_app function

- Area: `app/api/__init__.py`
- Why: Remove app-specific blueprint imports and registrations; keep `api_bp`, auth hooks (before_request, after_request), and `auth_bp` registration. The `auth_bp` stays in `app/api/__init__.py` because OIDC authentication is template infrastructure, not app-specific. All other blueprint imports and registrations (lines 159-176, 178-195 excluding auth_bp) move to `app/startup.py:register_blueprints()`.
- Evidence: `app/api/__init__.py:159-195` -- blueprint imports and registrations; `app/api/__init__.py:161,180` -- auth_bp import and registration (stays)

### Documentation

- Area: `CLAUDE.md`
- Why: References to ShutdownCoordinator, LifetimeEvent, register_lifetime_notification, StubShutdownCoordinator, TestShutdownCoordinator, wire_modules, shutdown_coordinator.
- Evidence: Multiple sections referencing old names

- Area: `AGENTS.md`
- Why: References to ShutdownCoordinator, LifetimeEvent, wire_modules.
- Evidence: `AGENTS.md:460-498`

---

## 3) Data Model / Contracts

- Entity / contract: `LifecycleEvent` enum (renamed from `LifetimeEvent`)
- Shape:
  ```
  class LifecycleEvent(str, Enum):
      STARTUP = "startup"                   # NEW
      PREPARE_SHUTDOWN = "prepare-shutdown"
      SHUTDOWN = "shutdown"
      AFTER_SHUTDOWN = "after-shutdown"
  ```
- Refactor strategy: Direct rename. No backwards compatibility. All callers updated in the same change.
- Evidence: `app/utils/shutdown_coordinator.py:27-30` -- current enum definition

- Entity / contract: `LifecycleCoordinatorProtocol` (renamed from `ShutdownCoordinatorProtocol`)
- Shape:
  ```
  class LifecycleCoordinatorProtocol(ABC):
      initialize() -> None
      register_lifecycle_notification(callback) -> None    # renamed
      register_shutdown_waiter(name, handler) -> None
      is_shutting_down() -> bool
      shutdown() -> None
      fire_startup() -> None                               # NEW
  ```
- Refactor strategy: Direct rename + add new abstract method. All implementors (ShutdownCoordinator, StubShutdownCoordinator, TestShutdownCoordinator) updated.
- Evidence: `app/utils/shutdown_coordinator.py:32-71` -- current protocol

- Entity / contract: `ServiceContainer.lifecycle_coordinator` provider (renamed from `shutdown_coordinator`)
- Shape: `lifecycle_coordinator = providers.Singleton(LifecycleCoordinator, ...)` -- same config, new name
- Refactor strategy: Rename provider. All `container.shutdown_coordinator()` calls become `container.lifecycle_coordinator()`. All services receiving `shutdown_coordinator=` kwarg switch to `lifecycle_coordinator=`.
- Evidence: `app/services/container.py:126-129` -- current provider definition

- Entity / contract: `app/startup.py` hook contract
- Shape:
  ```python
  def create_container() -> ServiceContainer
  def register_blueprints(api_bp: Blueprint, app: Flask) -> None
  def register_error_handlers(app: Flask) -> None
  ```
- Refactor strategy: New file. create_app() calls these functions at defined hook points.
- Evidence: `docs/features/r2_app_factory_hooks/change_brief.md:38-44`

---

## 4) API / Integration Surface

No public API endpoints change. All HTTP routes, request/response shapes, and status codes remain identical. The refactoring is purely structural.

- Surface: Internal -- `create_app()` function signature
- Inputs: `settings: Settings | None`, `skip_background_services: bool`
- Outputs: `App` instance (unchanged)
- Errors: Same startup errors as before
- Evidence: `app/__init__.py:18` -- function signature

- Surface: Internal -- `app/startup.py:create_container()`
- Inputs: None
- Outputs: `ServiceContainer` instance
- Errors: Import errors if container not properly configured
- Evidence: `docs/features/r2_app_factory_hooks/change_brief.md:41`

- Surface: Internal -- `app/startup.py:register_blueprints(api_bp, app)`
- Inputs: `api_bp: Blueprint`, `app: Flask`
- Outputs: Side effect -- blueprints registered
- Errors: Blueprint registration errors (duplicate names)
- Evidence: `docs/features/r2_app_factory_hooks/change_brief.md:42`

- Surface: Internal -- `app/startup.py:register_error_handlers(app)`
- Inputs: `app: Flask`
- Outputs: Side effect -- error handlers registered
- Errors: Handler registration errors
- Evidence: `docs/features/r2_app_factory_hooks/change_brief.md:43`

- Surface: Internal -- `LifecycleCoordinator.fire_startup()`
- Inputs: None
- Outputs: Side effect -- LifecycleEvent.STARTUP dispatched to all registered notification callbacks
- Errors: Errors in callbacks are logged and swallowed (same pattern as existing lifecycle events)
- Evidence: `docs/copier_template_analysis.md:310-315` -- proposed method

---

## 5) Algorithms & State Machines

- Flow: Restructured `create_app()` sequence
- Steps:
  1. Create Flask App instance
  2. Load/validate Settings
  3. Init Flask extensions (db, models, empty_string_normalization)
  4. Create SessionLocal in app context
  5. Call `setup_pool_logging(engine, settings)` (extracted utility)
  6. Configure SpectTree
  7. Call `create_container()` hook -- get ServiceContainer
  8. Override container config and session_maker
  9. Wire container: `container.wire(packages=['app.api'])`
  10. Store container on app
  11. Configure CORS, RequestID
  12. Set up log capture handler (if testing): call `log_handler.set_lifecycle_coordinator(container.lifecycle_coordinator())`
  13. Register error handlers: `register_core_error_handlers(app)` + `register_business_error_handlers(app)` + `register_error_handlers(app)` hook
  14. Import and register `api_bp` on app
  15. Register template blueprints on app (health, metrics, testing, SSE, CAS)
  16. Call `register_blueprints(api_bp, app)` hook -- app registers domain blueprints
  17. Register session teardown handler
  18. If not skip_background_services: start template infra (temp files, S3 bucket, metrics, diagnostics)
  19. If not skip_background_services: call `lifecycle_coordinator.fire_startup()`
  20. Return app
- States / transitions: N/A (linear sequence, not a state machine)
- Hotspots: Step 9 (package wiring) imports all modules in `app.api` recursively. This is done once at startup, so the import cost is negligible. Step 19 dispatches STARTUP to all registered callbacks synchronously.
- Evidence: `app/__init__.py:18-272` -- current create_app; `docs/copier_template_analysis.md:161-236` -- proposed structure

- Flow: LifecycleEvent dispatch (extended with STARTUP)
- Steps:
  1. `fire_startup()` called at end of `create_app()`
  2. Acquires lock, calls `_raise_lifecycle_event(LifecycleEvent.STARTUP)`
  3. Iterates over `_lifecycle_notifications` list
  4. Calls each callback with `LifecycleEvent.STARTUP`
  5. Catches and logs exceptions in individual callbacks
- States / transitions: The coordinator's `_shutting_down` state is unaffected by STARTUP events. STARTUP fires before any shutdown can occur.
- Hotspots: Callbacks run synchronously in the main thread during app startup. Long-running startup callbacks will delay app readiness.
- Evidence: `app/utils/shutdown_coordinator.py:178-185` -- existing _raise_lifetime_event pattern

---

## 6) Derived State & Invariants

- Derived value: `container` provider name (`lifecycle_coordinator` vs `shutdown_coordinator`)
  - Source: ServiceContainer provider definition, propagated to all DI injection points
  - Writes / cleanup: Every `container.shutdown_coordinator()` call site must change to `container.lifecycle_coordinator()`
  - Guards: Python import system and DI container wiring will fail fast on wrong names
  - Invariant: Every provider reference to the coordinator must use the new name consistently
  - Evidence: `app/services/container.py:126-129`, `app/__init__.py:167`, `run.py:28`, `tests/conftest.py:226,231,233-236`

- Derived value: `_lifecycle_notifications` list on the coordinator (renamed from `_shutdown_notifications`)
  - Source: All services that call `register_lifecycle_notification()` during construction
  - Writes / cleanup: Callbacks fire on STARTUP, PREPARE_SHUTDOWN, SHUTDOWN, AFTER_SHUTDOWN events
  - Guards: Lock protects registration; exceptions in callbacks are caught and logged
  - Invariant: STARTUP fires exactly once before the app accepts requests; shutdown events fire at most once
  - Evidence: `app/utils/shutdown_coordinator.py:85,95-98,178-185`

- Derived value: Blueprint registration completeness (app-specific blueprints must all be registered)
  - Source: `app/startup.py:register_blueprints()` function, which replaces the registrations from `app/api/__init__.py`
  - Writes / cleanup: Flask route table populated during app creation
  - Guards: Test suite exercises all endpoints; missing registrations cause 404s
  - Invariant: Every endpoint that existed before the refactoring must still be routable after
  - Evidence: `app/api/__init__.py:159-195` -- current 18 blueprint registrations

---

## 7) Consistency, Transactions & Concurrency

- Transaction scope: No database transactions involved. All changes are at app-startup time (single-threaded).
- Atomic requirements: `fire_startup()` must complete before the app starts accepting requests. This is guaranteed because it is called synchronously in `create_app()` before the function returns.
- Retry / idempotency: `fire_startup()` should only be called once. The coordinator should guard against double calls (similar to how `shutdown()` guards with `_shutting_down` flag). Add a `_started` flag to prevent duplicate STARTUP events.
- Ordering / concurrency controls: Lifecycle events have a strict order: STARTUP (once at creation) -> PREPARE_SHUTDOWN -> [waiters] -> SHUTDOWN -> AFTER_SHUTDOWN. The STARTUP event fires before any shutdown can occur. No lock contention possible since startup is single-threaded.
- Evidence: `app/utils/shutdown_coordinator.py:118-126` -- shutdown guard pattern; `app/__init__.py:238` -- skip_background_services guard

---

## 8) Errors & Edge Cases

- Failure: Exception in a STARTUP lifecycle callback
- Surface: `create_app()` during `fire_startup()` call
- Handling: Log the error and continue to the next callback (same pattern as existing lifecycle events). Do NOT let one service's startup failure prevent the app from starting.
- Guardrails: Each callback wrapped in try/except in `_raise_lifecycle_event()`
- Evidence: `app/utils/shutdown_coordinator.py:181-185` -- existing exception handling in _raise_lifetime_event

- Failure: `container.wire(packages=['app.api'])` fails because a module has an import error
- Surface: `create_app()` during wiring step
- Handling: Let the exception propagate (fail fast). This is a developer error.
- Guardrails: Test suite will catch missing imports
- Evidence: `app/__init__.py:141` -- current wiring call

- Failure: Missing blueprint registration in `app/startup.py` (forgot to move one from `app/api/__init__.py`)
- Surface: HTTP 404 for affected endpoints at runtime
- Handling: Test suite exercises all endpoints; missing registrations are caught
- Guardrails: Full test suite must pass as part of the refactoring
- Evidence: `app/api/__init__.py:178-195` -- current 18 registrations

- Failure: Service receives lifecycle event with new STARTUP case but its match statement lacks that case
- Surface: Silent no-op (match/case falls through without matching)
- Handling: No action needed. Services only react to events they care about. Missing `case LifecycleEvent.STARTUP` is harmless.
- Guardrails: Python's match/case does not raise on unmatched values
- Evidence: `app/services/task_service.py:377-385` -- example match statement

- Failure: `fire_startup()` called when `skip_background_services=True` (test/CLI mode)
- Surface: Would fire STARTUP to services that may not be fully initialized
- Handling: Guard: only call `fire_startup()` when `skip_background_services` is False
- Guardrails: Conditional check in `create_app()`
- Evidence: `app/__init__.py:238` -- existing `if not skip_background_services` guard

---

## 9) Observability / Telemetry

- Signal: Existing `APPLICATION_SHUTTING_DOWN` gauge and `GRACEFUL_SHUTDOWN_DURATION_SECONDS` histogram
- Type: Gauge, Histogram
- Trigger: Remain unchanged; defined in the coordinator module (renamed file)
- Labels / fields: None
- Consumer: Existing Prometheus/Grafana dashboards
- Evidence: `app/utils/shutdown_coordinator.py:17-24` -- metric definitions

No new metrics are added by this refactoring. The STARTUP event is a synchronous call during app creation and does not warrant timing metrics at this stage.

---

## 10) Background Work & Shutdown

- Worker / job: `fire_startup()` lifecycle event dispatch
- Trigger cadence: Once, at the end of `create_app()`, when `skip_background_services` is False
- Responsibilities: Dispatch LifecycleEvent.STARTUP to all registered notification callbacks. Currently no services use STARTUP yet, but the event is available for future services that need eager initialization at a well-defined lifecycle point. VersionService's eager `container.version_service()` call moves into the `if not skip_background_services` block alongside `fire_startup()` but does not itself use the STARTUP event.
- Shutdown handling: STARTUP fires before shutdown is possible. No shutdown interaction.
- Evidence: `docs/copier_template_analysis.md:310-315` -- fire_startup() design

No new background workers are introduced. Existing background services (TempFileManager cleanup thread, MetricsService updater thread, TaskService executor) are unaffected. Their startup code in `create_app()` remains in the template infrastructure block.

---

## 11) Security & Permissions

No security changes. Auth hooks remain in `app/api/__init__.py`. OIDC configuration, token validation, and cookie handling are untouched. The `@public` and `@allow_roles` decorators continue to work as before.

---

## 12) UX / UI Impact

No UI impact. This is a backend structural refactoring with no behavioral changes.

---

## 13) Deterministic Test Plan

### Lifecycle Coordinator Rename Tests

- Surface: `LifecycleCoordinator` (renamed `tests/test_lifecycle_coordinator.py`)
- Scenarios:
  - Given a LifecycleCoordinator with registered callbacks, When STARTUP event fires, Then all callbacks receive LifecycleEvent.STARTUP
  - Given a LifecycleCoordinator, When fire_startup() is called twice, Then the second call is a no-op (idempotency guard)
  - Given a callback that raises an exception on STARTUP, When fire_startup() is called, Then other callbacks still execute
  - Given the full lifecycle sequence, When STARTUP fires then later shutdown fires, Then events arrive in order: STARTUP, PREPARE_SHUTDOWN, SHUTDOWN, AFTER_SHUTDOWN
  - Given existing shutdown tests, When run with renamed types, Then all existing tests pass unchanged (just with new names)
- Fixtures / hooks: Rename `StubShutdownCoordinator` -> `StubLifecycleCoordinator` and `TestShutdownCoordinator` -> `TestLifecycleCoordinator` in `tests/testing_utils.py`. Add `simulate_startup()` to `TestLifecycleCoordinator`.
- Gaps: None.
- Evidence: `tests/test_shutdown_coordinator.py:1-572` -- existing tests to rename; `tests/testing_utils.py:1-85` -- existing stubs to rename

### App Factory Hook Tests

- Surface: `create_app()` with startup hooks
- Scenarios:
  - Given the app fixture, When created, Then all existing API endpoints respond correctly (full test suite regression)
  - Given `skip_background_services=True`, When app is created, Then `fire_startup()` is NOT called
  - Given `skip_background_services=False`, When app is created, Then `fire_startup()` IS called and registered STARTUP callbacks execute
- Fixtures / hooks: Existing `app` fixture in `tests/conftest.py` exercises `create_app()`. No new fixtures needed.
- Gaps: The STARTUP event integration is implicitly tested through the full test suite (VersionService behavior). An explicit unit test for `fire_startup()` is covered in the lifecycle coordinator test above.
- Evidence: `tests/conftest.py:206-243` -- app fixture

### Package Wiring Tests

- Surface: `container.wire(packages=['app.api'])`
- Scenarios:
  - Given the app, When any API endpoint using `@inject` is called, Then DI injection works correctly (regression via full test suite)
- Fixtures / hooks: No new fixtures. All existing API tests exercise wiring.
- Gaps: None. If wiring fails, all `@inject` endpoints will return 500 errors, which existing tests catch.
- Evidence: `app/__init__.py:133-141` -- current wiring; every test_*_api.py file exercises endpoints

### Blueprint Registration Tests

- Surface: `app/startup.py:register_blueprints()`
- Scenarios:
  - Given the app, When all domain endpoints are exercised, Then they respond with expected status codes (regression via full test suite)
  - Given `auth_bp` in `app/api/__init__.py`, When auth endpoints are called, Then they work correctly (auth stays in template)
  - Given `icons_bp` moved to `app/startup.py`, When `/api/icons/*` is requested, Then it responds correctly
- Fixtures / hooks: Existing test suite.
- Gaps: None.
- Evidence: `app/api/__init__.py:159-195` -- current registrations

### Integration Tests (renamed)

- Surface: `tests/test_graceful_shutdown_integration.py`
- Scenarios:
  - Given renamed types, When all existing shutdown integration tests run, Then they pass unchanged
  - Given TestLifecycleCoordinator, When simulate_startup() is called, Then STARTUP callbacks execute
- Fixtures / hooks: Rename TestShutdownCoordinator -> TestLifecycleCoordinator in fixtures.
- Gaps: None.
- Evidence: `tests/test_graceful_shutdown_integration.py:1-551` -- existing integration tests

### Pool Diagnostics Tests

- Surface: `app/utils/pool_diagnostics.py`
- Scenarios:
  - Given pool diagnostics extraction, When the app starts with `db_pool_echo=True`, Then pool events are logged (verified by existing behavior; no change)
  - Given `db_pool_echo=False`, When the app starts, Then no pool logging occurs
- Fixtures / hooks: No new test file needed. The functionality is tested implicitly through app startup. If explicit unit tests are desired, they can be added but are low priority since this is a pure extraction.
- Gaps: No dedicated unit test for `setup_pool_logging()`. Acceptable because the logic is unchanged and tested via integration.
- Evidence: `app/__init__.py:52-120` -- current inline code

---

## 14) Implementation Slices

- Slice: S1 -- Lifecycle Coordinator Rename
- Goal: Rename all ShutdownCoordinator references without adding new functionality. All tests pass with new names.
- Touches: `app/utils/shutdown_coordinator.py` (rename to `lifecycle_coordinator.py`), `app/services/container.py`, `app/services/metrics_service.py`, `app/services/task_service.py`, `app/services/version_service.py`, `app/utils/temp_file_manager.py`, `app/utils/log_capture.py`, `app/api/health.py`, `app/__init__.py`, `run.py`, `tests/testing_utils.py`, `tests/test_shutdown_coordinator.py` (rename to `test_lifecycle_coordinator.py`), `tests/test_graceful_shutdown_integration.py`, `tests/test_metrics_service.py`, `tests/test_task_service.py`, `tests/test_health_api.py`, `tests/test_task_api.py`, `tests/test_ai_service.py`, `tests/test_temp_file_manager.py`, `tests/test_download_cache_service.py`, `tests/test_utils_api.py`, `tests/conftest.py`, `CLAUDE.md`, `AGENTS.md`
- Dependencies: None. This is a pure rename.

- Slice: S2 -- Add STARTUP event and fire_startup()
- Goal: Add LifecycleEvent.STARTUP, fire_startup() method, idempotency guard. Add tests for STARTUP event. Move VersionService eager init (`container.version_service()`) into the `if not skip_background_services` block alongside `fire_startup()`. VersionService constructor is unchanged -- it continues to register its observer callback in `__init__`.
- Touches: `app/utils/lifecycle_coordinator.py`, `tests/testing_utils.py` (add `fire_startup()` to both stubs; add `simulate_startup()` to TestLifecycleCoordinator), `tests/test_lifecycle_coordinator.py` (add STARTUP tests), `app/__init__.py` (move version_service() call into skip_background_services block, add fire_startup() call)
- Dependencies: S1 must be complete.

- Slice: S3 -- Extract Pool Diagnostics
- Goal: Move pool logging to utility module; create_app() calls one-liner.
- Touches: `app/utils/pool_diagnostics.py` (new), `app/__init__.py`
- Dependencies: None (can parallel with S1/S2).

- Slice: S4 -- Create app/startup.py and Restructure create_app()
- Goal: Create the three hook functions, move app-specific blueprint registrations from `app/api/__init__.py`, move URL interceptor and other app-specific init to startup hooks, replace wire_modules with package wiring, restructure create_app() to call hooks.
- Touches: `app/startup.py` (new), `app/__init__.py`, `app/api/__init__.py`
- Dependencies: S1, S2, S3 must be complete.

- Slice: S5 -- Documentation and Final Verification
- Goal: Update CLAUDE.md and AGENTS.md references. Run full test suite. Run project-wide grep for `shutdown_coordinator`, `ShutdownCoordinator`, `LifetimeEvent`, `register_lifetime_notification`, `_raise_lifetime_event`, and `set_shutdown_coordinator` to confirm zero remaining references outside documentation/plan files.
- Touches: `CLAUDE.md`, `AGENTS.md`
- Dependencies: S4 must be complete.

---

## 15) Risks & Open Questions

- Risk: `container.wire(packages=['app.api'])` may wire modules that were previously not wired (e.g., `locations.py` is not in the current wire_modules list but is an `app.api` submodule).
- Impact: Low. Wiring a module that does not use `@inject` is harmless. Wiring a module that does use `@inject` but was previously unwired would fix a latent bug.
- Mitigation: Verify that all API modules in `app/api/` are currently listed in wire_modules OR do not use `@inject`. Cross-reference `locations.py` -- it uses `@inject` and IS imported via `app/api/__init__.py` which is in the wire list as `'app.api'`, so it was already covered.

- Risk: Renaming `shutdown_coordinator` provider in the container breaks test fixtures that reference `container.shutdown_coordinator.override(...)`.
- Impact: Medium. Multiple test files use this pattern.
- Mitigation: Search all test files for `container.shutdown_coordinator` and update to `container.lifecycle_coordinator`. This is a mechanical rename.

- Risk: The `_raise_lifetime_event` rename to `_raise_lifecycle_event` may be missed in some internal reference.
- Impact: Low. Private method, only called from within the coordinator class.
- Mitigation: The rename is within a single file. `ruff check` and `mypy` will catch references to undefined names.

- Risk: VersionService eager init moved to `if not skip_background_services` block -- VersionService singleton will not be constructed during `skip_background_services=True` runs (template_connection fixture, CLI mode).
- Impact: Low. VersionService's observer callback is only needed when the app is actually serving requests with background services active. Tests using `skip_background_services=True` are for schema setup only and do not exercise SSE functionality.
- Mitigation: VersionService constructor is unchanged; only the call site moves. The `app` fixture (which exercises the full test suite) uses `skip_background_services=False` (default), so VersionService will be constructed and its observer registered for all functional tests.

- Risk: `fire_startup()` running during tests when `skip_background_services=False` (default in `app` fixture via `conftest.py`).
- Impact: Low. The `app` fixture at `conftest.py:219` calls `create_app(settings)` without `skip_background_services`, so `fire_startup()` will execute. This is the desired behavior -- tests should exercise the full startup path.
- Mitigation: Verify that STARTUP callbacks do not have side effects that interfere with tests.

---

## 16) Confidence

Confidence: High -- This is a well-defined structural refactoring with clear rename boundaries, an established lifecycle event pattern to extend, and comprehensive existing tests that serve as regression guards. The change brief, analysis document, and codebase all align on the approach. No ambiguous requirements remain.
