# Code Review: Test Infrastructure Separation (R5)

## 1) Summary & Decision

**Readiness**

This is a clean, well-executed refactoring that achieves its two objectives: (1) replacing three hardcoded per-service shutdown calls with a single lifecycle coordinator `shutdown()` in all three fixture teardowns (`app`, `oidc_app`, `sse_server`), and (2) separating domain-specific fixtures into `tests/domain_fixtures.py` while keeping infrastructure fixtures in `tests/conftest.py`. The changes are mechanical and safe. The lifecycle coordinator is already a tested singleton that orchestrates shutdown for all registered services. The domain fixture file is a superset of the deleted `tests/test_document_fixtures.py` with the two attachment-set fixtures moved from conftest.py. No production code is modified. The user reports all 1350 tests pass, mypy is clean, and ruff shows only pre-existing errors.

**Decision**

`GO` -- The implementation faithfully follows the plan, fixes a latent bug (TempFileManager's `stop_cleanup_thread()` was silently failing), adds missing shutdown to the `sse_server` fixture, and leaves no stale references. No Blocker or Major issues found.

---

## 2) Conformance to Plan (with evidence)

**Plan alignment**

- `plan.md: Section 2, Area 1` (app fixture teardown) -- `tests/conftest.py:220-228` -- Three hardcoded shutdown calls replaced with `app.container.lifecycle_coordinator().shutdown()` wrapped in try/except. Matches plan exactly.
- `plan.md: Section 2, Area 2` (oidc_app fixture teardown) -- `tests/conftest.py:438-442` -- Same pattern applied. Matches plan.
- `plan.md: Section 2, Area 3` (sse_server fixture teardown) -- `tests/conftest.py:556-563` -- Lifecycle shutdown added BEFORE `version_mock.stop()` as specified in the plan. Comment explains ordering rationale.
- `plan.md: Section 2, Area 4-5` (make_attachment_set, make_attachment_set_flask moved) -- `tests/domain_fixtures.py:41-79` -- Both fixtures moved verbatim from conftest.py.
- `plan.md: Section 2, Area 6` (re-export import block updated) -- `tests/conftest.py:456-468` -- Import source changed from `.test_document_fixtures` to `.domain_fixtures`; `make_attachment_set` and `make_attachment_set_flask` added to the import list.
- `plan.md: Section 2, Area 7` (test_document_fixtures.py renamed) -- `tests/test_document_fixtures.py` deleted; `tests/domain_fixtures.py` created with the combined content.

**Gaps / deviations**

- None. All plan commitments are implemented.

---

## 3) Correctness -- Findings (ranked)

No Blocker or Major issues found.

- Title: `Minor -- Comment about VersionService mock ordering is over-cautious`
- Evidence: `tests/conftest.py:557-560` -- "Must happen BEFORE version_mock.stop() because VersionService registers for lifecycle notifications and its callback needs the mock still active."
- Impact: None. The VersionService's `_handle_lifecycle_event` (`app/services/version_service.py:138-147`) only sets `_is_shutting_down = True` and calls `_pending_version.clear()` during PREPARE_SHUTDOWN/SHUTDOWN. It never calls `fetch_frontend_version`. The mock being active during shutdown is therefore not required. However, the ordering is correct for defensive reasons (it is the expected lifecycle order), and the comment is not misleading -- it is simply more cautious than necessary.
- Fix: Optionally simplify the comment to: "Shut down background services before stopping mocks and cleaning up DB." No functional change needed.
- Confidence: High

- Title: `Minor -- AttachmentSet import hoisted from local to module level in domain_fixtures.py`
- Evidence: `tests/domain_fixtures.py:11` -- `from app.models.attachment_set import AttachmentSet` at module level, whereas the original `test_document_fixtures.py:17-18` had it as a local import inside `sample_part`.
- Impact: None. The import is used by three fixtures (`sample_part`, `make_attachment_set`, `make_attachment_set_flask`), so hoisting it to module level is appropriate and avoids duplication. This is an improvement over the original.
- Fix: No change needed.
- Confidence: High

---

## 4) Over-Engineering & Refactoring Opportunities

No over-engineering detected. The change is minimal and well-scoped:

- The lifecycle coordinator pattern already existed and is well-tested. Using it here is the straightforward replacement.
- The domain fixture file is a simple concatenation of related fixtures with no new abstractions.
- The re-export pattern in conftest.py follows the existing convention.

---

## 5) Style & Consistency

- Pattern: Consistent teardown structure across all three fixtures
- Evidence: `tests/conftest.py:220-228` (app), `tests/conftest.py:438-442` (oidc_app), `tests/conftest.py:556-563` (sse_server) -- All three use the same `try: lifecycle_coordinator().shutdown() / except Exception: pass` pattern followed by DB cleanup.
- Impact: Positive. Previously, `app` and `oidc_app` had the three-service pattern while `sse_server` had no service shutdown at all. Now all three are uniform.
- Recommendation: None needed.

- Pattern: Comment style in teardown blocks
- Evidence: `tests/conftest.py:221-224` -- Multi-line comment explaining the lifecycle shutdown mechanism, including which services respond.
- Impact: The detailed comment in the `app` fixture is helpful context for template extraction later. The `oidc_app` fixture has a shorter single-line comment (`# Shut down all background services via the lifecycle coordinator`), which is appropriately brief since the pattern is already established above.
- Recommendation: None needed.

---

## 6) Tests & Deterministic Coverage (new/changed behavior only)

- Surface: Fixture teardown behavior (lifecycle coordinator shutdown replacing per-service calls)
- Scenarios:
  - Given any test using the `app` fixture, When the test completes, Then the lifecycle coordinator fires PREPARE_SHUTDOWN and SHUTDOWN events, causing MetricsService, TempFileManager, and TaskService to stop their background threads (verified by all 1350 tests passing without thread leaks or segfaults)
  - Given any test using the `oidc_app` fixture, When the test completes, Then the same lifecycle shutdown occurs within the OIDC mock context (verified by OIDC test suite passing)
  - Given the SSE integration test session, When the `sse_server` fixture tears down, Then the lifecycle coordinator shuts down services before mocks and DB cleanup (new behavior -- previously no service shutdown occurred)
  - Given any test requesting `make_attachment_set` or `sample_part`, When pytest discovers fixtures, Then the fixtures resolve correctly through the conftest.py re-export from `domain_fixtures.py` (verified by all tests passing)
- Hooks: Existing test infrastructure. The `lifecycle_coordinator` is a Singleton in the DI container (`app/services/container.py:126-129`), already tested in `tests/test_lifecycle_coordinator.py`.
- Gaps: None. This is a test infrastructure refactoring; the full test suite is the verification artifact.
- Evidence: `tests/conftest.py:220-228`, `tests/conftest.py:438-442`, `tests/conftest.py:556-563`, `tests/conftest.py:456-468`

---

## 7) Adversarial Sweep

- Checks attempted:
  1. **Lifecycle coordinator wiring in DI container** -- Verified `lifecycle_coordinator` is a `providers.Singleton` in `app/services/container.py:126-129`. Calling `app.container.lifecycle_coordinator()` returns the same instance that all services registered with during `create_app()`. No risk of getting a different instance.
  2. **TempFileManager silent failure in old code** -- The original `app.container.temp_file_manager().stop_cleanup_thread()` called a non-existent public method (`stop_cleanup_thread()` does not exist; the private method is `_stop_cleanup_thread()` at `app/utils/temp_file_manager.py:68`). This raised `AttributeError`, caught by `except Exception: pass`. The new code routes through `lifecycle_coordinator.shutdown()` which fires `LifecycleEvent.SHUTDOWN`, triggering `TempFileManager._on_lifecycle_event()` at `app/utils/temp_file_manager.py:240-244`, which calls `self.shutdown()` at line 246, which calls `self._stop_cleanup_thread()` at line 248. This is a genuine bug fix.
  3. **SSE server fixture -- lifecycle shutdown with daemon thread** -- The SSE server runs Flask in a daemon thread (`tests/conftest.py:529`). The lifecycle coordinator's `shutdown()` fires events synchronously on the calling thread (the test teardown thread). The services' `_on_lifecycle_event` handlers only stop internal threads and executors -- none make HTTP requests to the Flask server. No deadlock or hang risk.
  4. **Double shutdown risk** -- If a test somehow triggers `lifecycle_coordinator.shutdown()` before the fixture teardown, the second call is a no-op due to the idempotency guard at `app/utils/lifecycle_coordinator.py:137-142` (`if self._shutting_down: return`). Safe.
  5. **Fixture discovery after rename** -- Grep confirms no test file imports directly from `test_document_fixtures`. All fixture resolution goes through conftest.py's re-export block. The old file is fully deleted (no tombstone). The new `domain_fixtures.py` is imported at `tests/conftest.py:457`. pytest discovers these fixtures correctly.
- Evidence: `app/services/container.py:126-129`, `app/utils/temp_file_manager.py:68,240-248`, `app/utils/lifecycle_coordinator.py:137-142`, `tests/conftest.py:529,456-468`
- Why code held up: The lifecycle coordinator is a well-tested abstraction with idempotency guards, per-callback error handling, and proper lock usage. The fixture changes are mechanical substitutions. The domain fixture file is a clean merge of existing code with no behavioral changes.

---

## 8) Invariants Checklist

- Invariant: All background services must be shut down before the test database connection is closed.
  - Where enforced: `tests/conftest.py:220-235` -- `lifecycle_coordinator().shutdown()` runs before `flask_db.session.remove()` and `clone_conn.close()`. Same ordering in `oidc_app` at lines 438-447 and `sse_server` at lines 556-575.
  - Failure mode: If shutdown runs after DB close, service callbacks that access the database would fail. If shutdown is skipped, background threads may access freed memory (segfault risk noted in the original comment).
  - Protection: The sequential code in the finally block enforces ordering. The try/except around shutdown prevents teardown-time exceptions from preventing DB cleanup.
  - Evidence: `tests/conftest.py:220-235`, `tests/conftest.py:438-447`, `tests/conftest.py:556-575`

- Invariant: Every domain fixture used by test files must be discoverable through conftest.py's re-export block.
  - Where enforced: `tests/conftest.py:456-468` -- All 10 fixtures from `domain_fixtures.py` are explicitly imported with `# noqa` to prevent linter removal.
  - Failure mode: If a fixture is defined in `domain_fixtures.py` but not re-exported, tests requesting it would fail with `fixture not found`.
  - Protection: The explicit import list at `tests/conftest.py:457-468` covers all fixtures. The full test suite run verifies completeness.
  - Evidence: `tests/domain_fixtures.py` defines 10 fixtures; `tests/conftest.py:457-468` imports all 10.

- Invariant: The lifecycle coordinator must be a Singleton to ensure the same instance that services registered with is the one receiving the shutdown call.
  - Where enforced: `app/services/container.py:126` -- `lifecycle_coordinator = providers.Singleton(LifecycleCoordinator, ...)`. `app.container.lifecycle_coordinator()` always returns the same instance.
  - Failure mode: If it were a Factory, each call would create a new instance with no registered listeners, and `shutdown()` would be a no-op.
  - Protection: The `providers.Singleton` declaration guarantees identity. All services receive the same instance via DI.
  - Evidence: `app/services/container.py:126-129`

---

## 9) Questions / Needs-Info

None. The change is well-scoped and all design decisions are clearly motivated by the plan and supported by the codebase evidence.

---

## 10) Risks & Mitigations (top 3)

- Risk: The `sse_server` fixture's new lifecycle shutdown adds time to session teardown if a shutdown waiter blocks.
- Mitigation: The only registered waiter is TaskService's `_wait_for_tasks_completion` (`app/services/task_service.py:392-410`), which returns immediately when no active tasks exist. SSE tests do not leave tasks running at session end. Total shutdown overhead is negligible.
- Evidence: `tests/conftest.py:560-563`, `app/services/task_service.py:392-410`

- Risk: Future services that register lifecycle notifications with expensive shutdown handlers could slow test teardown.
- Mitigation: This is inherent in the lifecycle coordinator pattern and applies to production shutdowns as well. The 600s timeout (`graceful_shutdown_timeout` in test settings) provides a ceiling. Individual services should keep their shutdown handlers lightweight -- this is already the established pattern.
- Evidence: `tests/conftest.py:123` -- `graceful_shutdown_timeout=600`

- Risk: If `domain_fixtures.py` is accidentally named with a `test_` prefix in the future, pytest would try to collect it as a test module, potentially causing confusing errors.
- Mitigation: The file is intentionally named `domain_fixtures.py` (not `test_domain_fixtures.py`). The docstring clearly identifies it as a fixtures file, not a test module.
- Evidence: `tests/domain_fixtures.py:1` -- `"""Domain-specific test fixtures for parts, attachment sets, documents, and sample data."""`

---

## 11) Confidence

Confidence: High -- The changes are mechanical, well-aligned with the plan, fix a latent bug (TempFileManager silent failure), and are verified by the full 1350-test suite passing. No production code is modified.
