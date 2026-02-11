# Plan Review: Test Infrastructure Separation (R5)

## 1) Summary & Decision

**Readiness**

The plan is well-researched and addresses a clearly-scoped refactoring: replacing hardcoded service shutdown calls with lifecycle coordinator invocations, and separating domain fixtures from infrastructure fixtures. The research log demonstrates genuine code archaeology -- confirming lifecycle registration in each service, verifying the `sse_server` gap, tracing fixture dependencies, and identifying a pre-existing bug where `TempFileManager.stop_cleanup_thread()` silently fails due to `AttributeError`. The two implementation slices are logically ordered and independent. The updated plan explicitly documents `sse_server` teardown ordering (lifecycle shutdown before version mock stop) and notes that `fire_startup()` has already been called during `create_app()`.

**Decision**

`GO` -- The plan is implementation-ready. All previous review conditions have been addressed: the TempFileManager bug is documented, the `sse_server` teardown ordering is explicit, and the lifecycle flow is well-characterized. No blockers or major issues remain.

## 2) Conformance & Fit (with evidence)

**Conformance to refs**

- `CLAUDE.md` (No tombstones) -- Pass -- `plan.md:310` -- "Delete the old file completely (no tombstone per CLAUDE.md)" correctly respects the no-tombstone rule for the `test_document_fixtures.py` rename.
- `CLAUDE.md` (Lifecycle coordinator integration) -- Pass -- `plan.md:134-146` -- The plan's shutdown sequence matches the documented pattern: `PREPARE_SHUTDOWN` -> waiters -> `SHUTDOWN` -> `AFTER_SHUTDOWN`.
- `CLAUDE.md` (Error handling philosophy) -- Pass -- `plan.md:198-202` -- Plan notes that the lifecycle coordinator wraps callbacks in try/except per `lifecycle_coordinator.py:198-202`, and recommends keeping outer try/except for defense-in-depth.
- `docs/product_brief.md` -- Pass -- No product-level changes; pure test infrastructure refactoring.
- `docs/commands/plan_feature.md` -- Pass -- All 16 sections present and populated. Research log is thorough with the TempFileManager bug finding.

**Fit with codebase**

- `app/utils/lifecycle_coordinator.py` -- `plan.md:134-146` -- Plan correctly identifies that `LifecycleCoordinator.shutdown()` is idempotent and fires events in the documented order. Confirmed at `lifecycle_coordinator.py:135-193`.
- `app/services/container.py` -- `plan.md:177-182` -- Plan correctly identifies MetricsService, TempFileManager, and TaskService as the three background-thread services receiving `lifecycle_coordinator` via DI. VersionService and LogCaptureHandler also register but their lifecycle callbacks only set flags or clear state, not stop threads.
- `tests/conftest.py` -- `plan.md:90-92` -- Evidence now correctly notes that `stop_cleanup_thread()` is not a public method on TempFileManager and silently fails, cross-referencing the Research Log.
- `tests/conftest.py:607-622` (`sse_server`) -- `plan.md:98-100` -- Plan now specifies that lifecycle shutdown must be placed BEFORE `version_mock.stop()`, with explicit step-by-step ordering in Section 5 (`plan.md:148-157`).

## 3) Open Questions & Ambiguities

- Question: Does the plan intend for conftest.py to continue using the import re-export pattern (vs `pytest_plugins` variable) for the renamed domain fixtures file?
- Why it matters: Both approaches work for fixture sharing, but the re-export pattern is the established convention in this codebase. The plan references "the conftest.py re-export block" at `plan.md:110-112` which implies continuing the existing pattern.
- Needed answer: No action needed -- the plan implicitly confirms re-export by describing the import block update. This is consistent with the existing approach.

## 4) Deterministic Backend Coverage (new/changed behavior only)

- Behavior: `app` fixture teardown using lifecycle coordinator
- Scenarios:
  - Given a test using the `app` fixture, When the test completes and the fixture tears down, Then `lifecycle_coordinator.shutdown()` is invoked and all three background services stop cleanly (verified by full test suite passing without thread-leak warnings)
  - Given a test that triggers a lifecycle callback error, When the `app` fixture tears down, Then the error is caught by the lifecycle coordinator's per-callback handler and other services still shut down
- Instrumentation: The lifecycle coordinator already logs at INFO level for each event phase (`lifecycle_coordinator.py:196`). No new instrumentation needed.
- Persistence hooks: No migrations or test data changes. DI wiring unchanged.
- Gaps: None -- the lifecycle coordinator itself has extensive tests in `tests/test_lifecycle_coordinator.py`.
- Evidence: `plan.md:257-263`

- Behavior: `sse_server` fixture teardown with lifecycle coordinator (new)
- Scenarios:
  - Given the SSE test session, When the `sse_server` fixture tears down, Then `lifecycle_coordinator.shutdown()` fires before `version_mock.stop()` and before DB cleanup, cleaning up all background services
  - Given no active tasks in the SSE server, When shutdown is called, Then the TaskService waiter returns immediately and total shutdown completes in under a second
- Instrumentation: Existing lifecycle coordinator logging.
- Persistence hooks: None.
- Gaps: None -- the explicit teardown ordering in Section 5 (`plan.md:148-157`) eliminates the previous ambiguity.
- Evidence: `plan.md:272-277`

- Behavior: Domain fixture availability after file rename
- Scenarios:
  - Given the rename from `test_document_fixtures.py` to `domain_fixtures.py`, When any test file requests `sample_part`, `make_attachment_set`, `sample_image_file`, etc., Then the fixtures resolve correctly through conftest.py re-exports
- Instrumentation: N/A
- Persistence hooks: N/A
- Gaps: None -- full test suite execution validates fixture discovery comprehensively.
- Evidence: `plan.md:279-284`

## 5) Adversarial Sweep

**Minor -- Evidence accuracy: TempFileManager teardown method (RESOLVED)**

Previous review flagged that the plan did not document the pre-existing `stop_cleanup_thread()` bug. The updated plan now documents this thoroughly in the Research Log (`plan.md:17`) and cross-references it in the evidence for Section 2 (`plan.md:92`). This finding is closed.

---

**Minor -- SSE server teardown ordering (RESOLVED)**

Previous review flagged that the `sse_server` teardown ordering relative to `version_mock.stop()` was unspecified. The updated plan now includes an explicit step-by-step ordering in Section 5 (`plan.md:148-157`) that places `lifecycle_coordinator.shutdown()` before `version_mock.stop()`. This finding is closed.

---

- Checks attempted: Transaction safety during lifecycle shutdown, fixture discovery after rename, concurrent access between daemon server thread and shutdown callbacks, lifecycle coordinator idempotency under duplicate shutdown calls
- Evidence: `plan.md:144` (idempotency), `plan.md:155` (daemon thread safety), `plan.md:206-208` (fixture discovery), `app/utils/lifecycle_coordinator.py:137-142` (idempotency guard)
- Why the plan holds: The lifecycle coordinator's per-callback error handling, idempotent shutdown, and RLock-protected state transitions handle all identified fault lines. The SSE server's daemon thread cannot interfere with shutdown because service shutdown methods only join background threads -- they do not make HTTP calls or access the Flask request context. Fixture discovery is validated by the full test suite.

## 6) Derived-Value & Persistence Invariants

- Derived value: Lifecycle coordinator singleton shutdown state
  - Source dataset: `LifecycleCoordinator._shutting_down` boolean flag, toggled by `shutdown()` method
  - Write / cleanup triggered: When True, fires `PREPARE_SHUTDOWN`, waits for registered waiters, then fires `SHUTDOWN` and `AFTER_SHUTDOWN`. Each registered service stops its background threads.
  - Guards: `shutdown()` is idempotent -- if `_shutting_down` is already True, the method returns immediately (`lifecycle_coordinator.py:138-139`). Protected by `_lifecycle_lock` (RLock).
  - Invariant: Each app instance's lifecycle coordinator must be shut down exactly once during fixture teardown, and shutdown must complete before the DB connection is closed.
  - Evidence: `plan.md:163-168`, `app/utils/lifecycle_coordinator.py:135-142`

- Derived value: Fixture re-export completeness
  - Source dataset: The import block in `tests/conftest.py` that re-exports all domain fixtures from `domain_fixtures.py`
  - Write / cleanup triggered: pytest fixture discovery depends on these imports; missing imports cause `fixture not found` errors in downstream test files
  - Guards: `# noqa` comment prevents linters from flagging "unused" imports. Full test suite run validates completeness.
  - Invariant: Every domain fixture used by any test file must be either (a) directly discovered via pytest conftest chain or (b) re-exported from conftest.py via explicit import.
  - Evidence: `plan.md:170-175`, `tests/conftest.py:513-522`

- Derived value: Background service registration count
  - Source dataset: Services that call `register_lifecycle_notification()` in their constructors: MetricsService (`metrics_service.py:46-48`), TempFileManager (`temp_file_manager.py:57`), TaskService (`task_service.py:115`), VersionService (`version_service.py:41`), LogCaptureHandler (`log_capture.py:40`)
  - Write / cleanup triggered: The lifecycle coordinator stores callbacks and invokes all of them during `shutdown()`. Missing registrations would leave services' background threads running.
  - Guards: Registration is append-only; no mechanism to unregister. Constructor-time registration ensures services cannot start without registering.
  - Invariant: All services that start background work (MetricsService, TempFileManager, TaskService) must register for lifecycle shutdown events. The lifecycle coordinator's callback list must cover all background-thread services.
  - Evidence: `plan.md:177-182`, `app/services/container.py:126-246`

## 7) Risks & Mitigations (top 3)

- Risk: The `sse_server` daemon thread continues running while `lifecycle_coordinator.shutdown()` fires events, potentially causing concurrent access to shared state during teardown.
- Mitigation: The plan explicitly documents that service shutdown methods only stop background threads and executors, they do not make HTTP calls (`plan.md:155`). The lifecycle coordinator fires events synchronously on the teardown thread, and each service's shutdown uses its own lock for thread safety.
- Evidence: `plan.md:148-157`, `app/utils/lifecycle_coordinator.py:195-202`

- Risk: Renaming `test_document_fixtures.py` to `domain_fixtures.py` breaks imports if any test file imports directly from `test_document_fixtures`.
- Mitigation: Grep confirms no test files import directly from `test_document_fixtures` -- they all receive fixtures via conftest.py injection. The only direct reference is the import in `conftest.py:513`. Plan correctly recommends deleting the old file completely and searching for references (`plan.md:308-310`).
- Evidence: `plan.md:308-310`

- Risk: Pre-existing `stop_cleanup_thread()` bug means TempFileManager cleanup thread was never stopped during test teardown. Switching to lifecycle coordinator will now actually stop this thread.
- Mitigation: The cleanup thread is a daemon thread running once per hour (`temp_file_manager.py:137`). Stopping it during teardown is strictly an improvement. No test depends on the cleanup thread being active. The plan documents this finding thoroughly (`plan.md:17`).
- Evidence: `plan.md:17`, `tests/conftest.py:227`, `app/utils/temp_file_manager.py:68-73,246-248`

## 8) Confidence

Confidence: High -- The plan is thorough, addresses all previously identified conditions, correctly maps the codebase behavior, and the scope is narrow and mechanical. All services already handle lifecycle events, the TempFileManager bug is documented, and the SSE server teardown ordering is explicit. The full test suite provides comprehensive verification.
