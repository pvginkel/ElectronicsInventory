# Plan: Test Infrastructure Separation (R5)

## 0) Research Log & Findings

### Areas Researched

**`tests/conftest.py` (732 lines)** -- The single conftest for the entire test suite. Contains a mix of infrastructure fixtures (app creation, session management, Prometheus cleanup, OIDC mocking, SSE server) and domain-specific fixtures (attachment sets, sample parts). The file ends with a re-export block importing fixtures from `tests/test_document_fixtures.py`.

**Lifecycle coordinator (`app/utils/lifecycle_coordinator.py`)** -- Fully implemented with `STARTUP`, `PREPARE_SHUTDOWN`, `SHUTDOWN`, and `AFTER_SHUTDOWN` events. The `shutdown()` method fires `PREPARE_SHUTDOWN`, waits for registered shutdown waiters, then fires `SHUTDOWN` and `AFTER_SHUTDOWN`. All three services currently hardcoded in test teardown (MetricsService, TempFileManager, TaskService) already register for lifecycle notifications and handle `LifecycleEvent.SHUTDOWN` in their `_on_lifecycle_event` methods:

- `MetricsService` (`app/services/metrics_service.py:118-122`): Responds to `SHUTDOWN` by calling `self.shutdown()` which stops the background updater thread.
- `TempFileManager` (`app/utils/temp_file_manager.py:240-244`): Responds to `SHUTDOWN` by calling `self.shutdown()` which stops the cleanup thread.
- `TaskService` (`app/services/task_service.py:377-390`): Responds to `PREPARE_SHUTDOWN` by setting `_shutting_down = True`, and to `SHUTDOWN` by calling `self.shutdown()` which stops the cleanup thread and executor.

This confirms that replacing the three hardcoded shutdown calls with `lifecycle_coordinator.shutdown()` will clean up all services correctly via the event system. Additional services (VersionService, LogCaptureHandler) also register for lifecycle notifications and will be properly cleaned up as a bonus.

**Pre-existing bug in TempFileManager teardown** -- The current `app` and `oidc_app` fixture teardowns call `app.container.temp_file_manager().stop_cleanup_thread()` (`tests/conftest.py:227`), but `TempFileManager` has no public `stop_cleanup_thread()` method. The private method is `_stop_cleanup_thread()` (`temp_file_manager.py:68`) and the public shutdown API is `shutdown()` (`temp_file_manager.py:246`). The call raises `AttributeError`, which is silently swallowed by `except Exception: pass`. This means the TempFileManager cleanup thread has never been explicitly stopped during test fixture teardown -- only MetricsService and TaskService are actually shut down. The lifecycle coordinator change inherently fixes this bug because `lifecycle_coordinator.shutdown()` fires `SHUTDOWN`, which triggers `TempFileManager._on_lifecycle_event()`, which calls `self.shutdown()`, which calls `self._stop_cleanup_thread()`.

**`sse_server` fixture (`tests/conftest.py:537-622`)** -- Session-scoped fixture that starts a real Flask dev server in a daemon thread. It calls `create_app(settings)` without `skip_background_services=True`, meaning all background services (MetricsService, TempFileManager, TaskService) start. However, its teardown only removes the DB session and closes the connection -- it does NOT shut down background services. Since the server thread is a daemon thread, the background services are terminated abruptly when the process exits. Adding a `lifecycle_coordinator.shutdown()` call would provide clean shutdown matching the `app` and `oidc_app` fixtures.

**`tests/test_document_fixtures.py` (148 lines)** -- Contains domain-specific fixtures: `sample_part`, `sample_image_file`, `sample_pdf_bytes`, `sample_pdf_file`, `large_image_file`, `mock_url_metadata`, `mock_html_content`, `temp_thumbnail_dir`. These are imported into conftest.py via a re-export block at line 513. This file depends on domain models (`Part`, `Type`, `AttachmentSet`).

**Domain fixtures in conftest.py** -- Two additional domain fixtures live directly in conftest.py:
- `make_attachment_set` (line 300): Creates AttachmentSet instances using a service-layer session. Used by 19 test files.
- `make_attachment_set_flask` (line 320): Creates AttachmentSet instances using Flask's db.session. Used by `test_database_constraints.py` only.

### Decisions

1. **Domain fixtures destination**: Move `make_attachment_set`, `make_attachment_set_flask` into `tests/test_document_fixtures.py` (renamed to `tests/domain_fixtures.py` for clarity). This file already contains `sample_part` which also creates an AttachmentSet and shares the same domain model imports. Alternatively, keep the name `test_document_fixtures.py` but this is misleading since these fixtures are broader than "documents." Decision: rename to `tests/domain_fixtures.py` since the fixtures cover parts, attachment sets, images, PDFs, and mock data -- not just documents.

2. **SSE server shutdown**: Add `lifecycle_coordinator.shutdown()` to the `sse_server` fixture teardown. The SSE server creates an app with full background services, so it should clean up the same way `app` and `oidc_app` do.

3. **`sample_image_file` and `sample_pdf_bytes` classification**: These are listed in the copier analysis as template fixtures (behind `use_s3` flag). However, in the current EI codebase they are defined alongside domain fixtures in `test_document_fixtures.py` and are deeply intertwined with domain test files. For this refactoring, keep them in the domain fixtures file. Extracting them to the template conftest is a concern for the Copier template project, not for this EI-side separation.

---

## 1) Intent & Scope

**User intent**

Refactor the test infrastructure to cleanly separate generic/infrastructure fixtures from domain-specific fixtures in `tests/conftest.py`, and replace hardcoded service shutdown calls with lifecycle coordinator calls. This prepares the test infrastructure for extraction into a Copier template where only infrastructure fixtures would ship with the template.

**Prompt quotes**

"Replace hardcoded service shutdown calls (metrics_service, temp_file_manager, task_service) in the `app` fixture teardown with a single lifecycle coordinator `shutdown()` call"

"Separate domain-specific fixtures (make_attachment_set, make_attachment_set_flask, sample_part, document fixtures) from infrastructure fixtures in conftest.py"

"Infrastructure fixtures remain in tests/conftest.py ready for template extraction"

**In scope**

- Replace hardcoded service shutdown calls in `app`, `oidc_app`, and `sse_server` fixture teardowns with lifecycle coordinator `shutdown()` calls
- Move domain fixtures (`make_attachment_set`, `make_attachment_set_flask`, `sample_part`, and all fixtures from `test_document_fixtures.py`) to a dedicated domain fixtures file
- Update the conftest.py import block to reference the new file
- Verify all existing tests pass

**Out of scope**

- Restructuring the `_build_test_settings()` function (app-specific settings will be addressed during Copier template extraction)
- Moving OIDC fixtures out of conftest.py (these are template fixtures behind `use_oidc`)
- Moving SSE fixtures out of conftest.py (these are template fixtures behind `use_sse`)
- Wrapping S3 availability check in Jinja conditionals (that is template-side work)
- Changes to any service code (all services already handle lifecycle events correctly)

**Assumptions / constraints**

- All three services (MetricsService, TempFileManager, TaskService) already register for `LifecycleEvent.SHUTDOWN` in their constructors and handle it correctly. No service-side changes needed.
- pytest discovers fixtures from conftest.py and any file it imports; re-exporting from a renamed file works identically to the current `test_document_fixtures.py` pattern.
- The `sse_server` fixture's daemon thread means its background services are never explicitly shut down currently; adding lifecycle shutdown is an improvement, not a regression risk.

---

## 1a) User Requirements Checklist

**User Requirements Checklist**

- [ ] Replace hardcoded service shutdown calls (metrics_service, temp_file_manager, task_service) in the `app` fixture teardown with a single lifecycle coordinator `shutdown()` call
- [ ] Replace hardcoded service shutdown calls in the `oidc_app` fixture teardown with a single lifecycle coordinator `shutdown()` call
- [ ] Separate domain-specific fixtures (make_attachment_set, make_attachment_set_flask, sample_part, document fixtures) from infrastructure fixtures in conftest.py
- [ ] Infrastructure fixtures remain in tests/conftest.py ready for template extraction
- [ ] Domain fixtures are moved to a separate file and imported properly
- [ ] The sse_server fixture cleanup is reviewed and updated if it should use lifecycle coordinator
- [ ] All existing tests continue to pass after the refactoring

---

## 2) Affected Areas & File Map

- Area: `tests/conftest.py` -- `app` fixture teardown (lines 218-233)
- Why: Replace three hardcoded service shutdown calls with a single `lifecycle_coordinator.shutdown()` call
- Evidence: `tests/conftest.py:222-233` -- `app.container.metrics_service().shutdown()`, `app.container.temp_file_manager().stop_cleanup_thread()` (note: `stop_cleanup_thread()` is not a public method on TempFileManager -- this call silently fails, see Research Log), `app.container.task_service().shutdown()`

- Area: `tests/conftest.py` -- `oidc_app` fixture teardown (lines 486-498)
- Why: Same hardcoded shutdown pattern as `app` fixture; replace with lifecycle coordinator
- Evidence: `tests/conftest.py:487-498` -- identical three-service shutdown block

- Area: `tests/conftest.py` -- `sse_server` fixture teardown (lines 607-622)
- Why: Add lifecycle coordinator shutdown before version mock teardown and DB close; currently no service cleanup happens. The lifecycle shutdown must be placed BEFORE `version_mock.stop()` so that VersionService's lifecycle callback runs while the mock is still active.
- Evidence: `tests/conftest.py:609-621` -- teardown only calls `version_mock.stop()`, `flask_db.session.remove()` and `clone_conn.close()` with no service shutdown

- Area: `tests/conftest.py` -- `make_attachment_set` fixture (lines 300-317)
- Why: Domain fixture that must move out of the infrastructure conftest
- Evidence: `tests/conftest.py:300-317` -- imports `app.models.attachment_set.AttachmentSet`

- Area: `tests/conftest.py` -- `make_attachment_set_flask` fixture (lines 320-340)
- Why: Domain fixture that must move out of the infrastructure conftest
- Evidence: `tests/conftest.py:320-340` -- imports `app.extensions.db` and `app.models.attachment_set.AttachmentSet`

- Area: `tests/conftest.py` -- re-export import block (lines 513-522)
- Why: Must be updated to import from the renamed domain fixtures file, and to include `make_attachment_set` / `make_attachment_set_flask` re-exports
- Evidence: `tests/conftest.py:513-522` -- `from .test_document_fixtures import (...)`

- Area: `tests/test_document_fixtures.py` (entire file, 148 lines)
- Why: Renamed to `tests/domain_fixtures.py` and extended with the two attachment set fixtures moved from conftest.py
- Evidence: `tests/test_document_fixtures.py:1-148` -- contains `sample_part`, `sample_image_file`, `sample_pdf_bytes`, `sample_pdf_file`, `large_image_file`, `mock_url_metadata`, `mock_html_content`, `temp_thumbnail_dir`

---

## 3) Data Model / Contracts

No data model, schema, or API contract changes. This refactoring is entirely within the test infrastructure layer.

---

## 4) API / Integration Surface

No API endpoints, CLI commands, or integration surfaces change. This is a pure test infrastructure refactoring.

---

## 5) Algorithms & State Machines

- Flow: App fixture teardown -- lifecycle coordinator shutdown sequence
- Steps:
  1. Test completes (yield returns in the `app` fixture)
  2. Obtain lifecycle coordinator from `app.container.lifecycle_coordinator()`
  3. Call `lifecycle_coordinator.shutdown()`
  4. Lifecycle coordinator fires `PREPARE_SHUTDOWN` to all registered callbacks
  5. Lifecycle coordinator waits for shutdown waiters (TaskService's `_wait_for_tasks_completion`)
  6. Lifecycle coordinator fires `SHUTDOWN` -- MetricsService, TempFileManager, TaskService all stop their threads
  7. Lifecycle coordinator fires `AFTER_SHUTDOWN`
  8. Proceed with DB session removal and connection close
- States / transitions: The lifecycle coordinator transitions from running to shutting-down (idempotent; second call is a no-op)
- Hotspots: The `_wait_for_tasks_completion` waiter has a timeout parameter. In tests, tasks complete quickly, so this is not a concern. The lifecycle coordinator's `_graceful_shutdown_timeout` (set to 600s from test settings) bounds the total wait time.
- Evidence: `app/utils/lifecycle_coordinator.py:135-193` -- `shutdown()` method orchestrates the full sequence

- Flow: SSE server fixture teardown -- explicit shutdown ordering
- Steps:
  1. `sse_server` fixture yield completes (session ends)
  2. Obtain lifecycle coordinator from `app.container.lifecycle_coordinator()`
  3. Call `lifecycle_coordinator.shutdown()` (BEFORE `version_mock.stop()` so that VersionService's `_handle_lifecycle_event` callback runs while the version mock is still active)
  4. Call `version_mock.stop()` to clean up the mock
  5. Call `flask_db.session.remove()` and `clone_conn.close()` to clean up the DB
- States / transitions: Same as the `app` fixture flow. The SSE server's Flask dev server thread continues running as a daemon during shutdown -- this is safe because service shutdown methods only stop background threads and executors, they do not make HTTP calls.
- Hotspots: The app has already called `fire_startup()` during `create_app()` (`app/__init__.py:212`), so the lifecycle coordinator has transitioned through STARTUP before teardown invokes shutdown. This is the normal lifecycle sequence.
- Evidence: `tests/conftest.py:607-622` -- current `sse_server` teardown, `app/__init__.py:212` -- `fire_startup()` call

---

## 6) Derived State & Invariants

- Derived value: Lifecycle coordinator singleton shutdown state
  - Source: `LifecycleCoordinator._shutting_down` flag, set by `shutdown()` method
  - Writes / cleanup: When `_shutting_down` becomes True, all registered services stop background threads
  - Guards: `shutdown()` is idempotent -- if already shutting down, the second call returns immediately (`lifecycle_coordinator.py:138-139`)
  - Invariant: Each app instance's lifecycle coordinator must be shut down exactly once during fixture teardown
  - Evidence: `app/utils/lifecycle_coordinator.py:137-142`

- Derived value: Fixture re-export completeness
  - Source: The import block in `tests/conftest.py` that re-exports domain fixtures
  - Writes / cleanup: pytest fixture discovery depends on these imports being present
  - Guards: The `# noqa` comment prevents linters from removing "unused" imports
  - Invariant: Every domain fixture used by test files must be importable from either conftest.py (via re-export) or discovered by pytest via conftest plugin chain
  - Evidence: `tests/conftest.py:513-522`

- Derived value: Background service registration count
  - Source: Services that call `register_lifecycle_notification()` in their constructors
  - Writes / cleanup: The lifecycle coordinator stores callbacks and invokes them during shutdown
  - Guards: Registration is append-only; no mechanism to unregister
  - Invariant: All services that start background work must register for lifecycle shutdown events so that `lifecycle_coordinator.shutdown()` covers them all
  - Evidence: `app/services/metrics_service.py:46-48`, `app/utils/temp_file_manager.py:57`, `app/services/task_service.py:115-116`

---

## 7) Consistency, Transactions & Concurrency

- Transaction scope: No database transactions are affected. The fixture teardown sequence (shutdown services, then close DB) is preserved.
- Atomic requirements: The lifecycle coordinator's shutdown must complete before the DB connection is closed. This ordering is maintained by the sequential code in the fixture teardown (shutdown call before `flask_db.session.remove()` and `clone_conn.close()`).
- Retry / idempotency: `LifecycleCoordinator.shutdown()` is idempotent. If called twice, the second call logs a warning and returns immediately. This is safe if any test code happens to trigger shutdown before the fixture teardown.
- Ordering / concurrency controls: The lifecycle coordinator uses an `RLock` (`_lifecycle_lock`) to guard state transitions. Background threads respect the `_shutdown_event` signals.
- Evidence: `app/utils/lifecycle_coordinator.py:91,137-142` -- RLock usage and idempotency guard

---

## 8) Errors & Edge Cases

- Failure: Lifecycle coordinator `shutdown()` raises an unexpected exception during callback invocation
- Surface: `app` / `oidc_app` / `sse_server` fixture teardown
- Handling: The lifecycle coordinator already wraps each callback in try/except and logs errors without re-raising (`lifecycle_coordinator.py:200-202`). This means a failing service callback does not block other services from shutting down. Fixture teardown should still wrap the `shutdown()` call in try/except for safety (matching the current pattern).
- Guardrails: The lifecycle coordinator's per-callback error handling provides resilience
- Evidence: `app/utils/lifecycle_coordinator.py:198-202` -- error handling in `_raise_lifecycle_event`

- Failure: Domain fixture file rename breaks pytest fixture discovery
- Surface: Any test file that depends on `sample_part`, `make_attachment_set`, etc.
- Handling: The conftest.py re-export block makes fixtures available to all tests regardless of their source file. As long as the import block is updated to reference `domain_fixtures`, discovery continues to work.
- Guardrails: Running the full test suite after the refactoring verifies fixture discovery is intact
- Evidence: `tests/conftest.py:513-522` -- current re-export pattern

- Failure: `sse_server` lifecycle shutdown blocks for the full 600s graceful timeout
- Surface: Session-scoped `sse_server` fixture teardown during test suite completion
- Handling: In the test environment, no long-running tasks are active when the SSE server shuts down. The TaskService waiter returns immediately when no active tasks exist. MetricsService and TempFileManager thread joins have 5-second timeouts. Total shutdown should complete in under a second.
- Guardrails: The `_graceful_shutdown_timeout` from test settings (600s) is a ceiling, not an expected duration
- Evidence: `app/services/task_service.py:392-410` -- waiter returns True immediately when no active tasks

---

## 9) Observability / Telemetry

No new metrics, logs, or traces are added. The lifecycle coordinator already logs shutdown events at INFO level:

- Signal: `"Raising lifecycle event {event}"` log message
- Type: structured log
- Trigger: When `lifecycle_coordinator.shutdown()` fires each event phase
- Labels / fields: Event name (PREPARE_SHUTDOWN, SHUTDOWN, AFTER_SHUTDOWN)
- Consumer: Test output / CI logs (visible when running pytest with `-s` or `--log-cli-level=INFO`)
- Evidence: `app/utils/lifecycle_coordinator.py:196` -- log statement in `_raise_lifecycle_event`

---

## 10) Background Work & Shutdown

No new background workers are introduced. The change simplifies how existing background workers are shut down during test teardown:

- Worker / job: MetricsService background updater, TempFileManager cleanup thread, TaskService cleanup thread + executor
- Trigger cadence: Started during `create_app()` when `skip_background_services=False`
- Responsibilities: Periodic metric polling, temp file cleanup, task lifecycle management
- Shutdown handling: Currently hardcoded per-service calls in fixture teardown. After this change: a single `lifecycle_coordinator.shutdown()` call triggers `PREPARE_SHUTDOWN` and `SHUTDOWN` events, which each service handles in its registered `_on_lifecycle_event` callback.
- Evidence: `app/services/metrics_service.py:118-122`, `app/utils/temp_file_manager.py:240-248`, `app/services/task_service.py:377-390`

---

## 11) Security & Permissions

Not applicable. No authentication, authorization, or security changes.

---

## 12) UX / UI Impact

Not applicable. No user-facing changes.

---

## 13) Deterministic Test Plan

- Surface: `app` fixture lifecycle shutdown
- Scenarios:
  - Given a test using the `app` fixture, When the test completes and the fixture tears down, Then all background services (MetricsService, TempFileManager, TaskService) are shut down via lifecycle coordinator and no segfaults or thread leaks occur
  - Given a test that creates a task via TaskService, When the `app` fixture tears down, Then the TaskService waiter completes and the executor shuts down cleanly
- Fixtures / hooks: Existing `app` fixture with its `template_connection` dependency. No new fixtures needed.
- Gaps: No dedicated test for "fixture teardown calls lifecycle shutdown" -- this is verified implicitly by the full test suite passing without thread-leak warnings or segfaults. Adding explicit lifecycle shutdown verification is unnecessary because the lifecycle coordinator itself is tested in `tests/test_lifecycle_coordinator.py`.
- Evidence: `tests/test_lifecycle_coordinator.py` -- existing lifecycle coordinator tests

- Surface: `oidc_app` fixture lifecycle shutdown
- Scenarios:
  - Given a test using the `oidc_app` fixture, When the test completes, Then the lifecycle coordinator shuts down all services the same way as the `app` fixture
- Fixtures / hooks: Existing `oidc_app` fixture with OIDC mocks
- Gaps: None
- Evidence: `tests/conftest.py:443-503` -- current `oidc_app` fixture

- Surface: `sse_server` fixture lifecycle shutdown
- Scenarios:
  - Given the SSE test session, When the `sse_server` session-scoped fixture tears down, Then the lifecycle coordinator shuts down all background services before the DB connection is closed
- Fixtures / hooks: Existing `sse_server` fixture
- Gaps: None
- Evidence: `tests/conftest.py:537-622` -- current `sse_server` fixture

- Surface: Domain fixture availability after file rename
- Scenarios:
  - Given a test file that uses `sample_part` / `make_attachment_set` / `sample_image_file`, When the test suite runs after the refactoring, Then all fixtures are discoverable and function identically
- Fixtures / hooks: The conftest.py re-export block updated to import from `tests/domain_fixtures.py`
- Gaps: None -- full test suite run covers this comprehensively
- Evidence: `tests/conftest.py:513-522` -- re-export block

---

## 14) Implementation Slices

- Slice: Lifecycle shutdown in fixture teardowns
- Goal: Replace hardcoded service shutdown calls with lifecycle coordinator in `app`, `oidc_app`, and `sse_server` fixtures
- Touches: `tests/conftest.py` (three fixture teardown blocks)
- Dependencies: None; services already handle lifecycle events

- Slice: Domain fixture separation
- Goal: Move domain fixtures out of conftest.py into a dedicated file
- Touches: `tests/test_document_fixtures.py` (rename to `tests/domain_fixtures.py`, add `make_attachment_set` and `make_attachment_set_flask`), `tests/conftest.py` (remove domain fixture definitions, update import block)
- Dependencies: Must run full test suite after to verify fixture discovery

---

## 15) Risks & Open Questions

- Risk: A service's `_on_lifecycle_event` handler fails during test teardown, masking the original test failure
- Impact: Test failures could be obscured by teardown exceptions
- Mitigation: The lifecycle coordinator already catches and logs exceptions per-callback (`lifecycle_coordinator.py:200-202`). Keep the outer try/except in the fixture teardown for defense-in-depth.

- Risk: Renaming `test_document_fixtures.py` to `domain_fixtures.py` causes pytest to try to collect `test_document_fixtures.py` as a test module (if any references remain)
- Impact: Import errors or collection warnings in CI
- Mitigation: Delete the old file completely (no tombstone per CLAUDE.md). Search for any hardcoded references to `test_document_fixtures` in test files and update them.

- Risk: `sse_server` fixture's lifecycle shutdown interacts poorly with the daemon server thread
- Impact: Shutdown could hang if services try to make HTTP calls to the already-stopping server
- Mitigation: The lifecycle coordinator fires events synchronously on the teardown thread. The server's Flask request handling runs on separate daemon threads. The services' shutdown methods only stop background threads and executors -- they do not make HTTP calls during shutdown.

---

## 16) Confidence

Confidence: High -- All three services already register for lifecycle shutdown events and handle them correctly. The refactoring is a straightforward replacement of explicit calls with the coordinator pattern, plus a mechanical file move for domain fixtures. The full test suite provides comprehensive verification.
