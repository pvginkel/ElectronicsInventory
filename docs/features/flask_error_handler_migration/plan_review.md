# Plan Review: Flask Error Handler Migration

## 1) Summary & Decision

**Readiness**

The plan is well-researched, thorough, and closely aligned with both the codebase and the governing design document (`docs/copier_template_analysis.md`). The research log accurately reflects the current state of the code, the exception hierarchy is correctly enumerated, and the file map is exhaustive. The core technical assumption -- that Flask passes `exc` to `teardown_request` even when `@app.errorhandler` handles the exception -- is correctly identified as the critical enabler and is slated for early validation in Slice 1. An initial review identified three issues (one Major, two Minor); all three have been addressed with plan amendments. The plan is now implementation-ready.

**Decision**

`GO` -- All review findings have been resolved in the updated plan. The remaining risk (Flask `teardown_request(exc)` behavior) has a sound early-validation strategy in Slice 1.

## 2) Conformance & Fit (with evidence)

**Conformance to refs**

- `CLAUDE.md` (API layer pattern) -- Pass -- `plan.md:53-57` -- Plan correctly targets removing the decorator from all API endpoints and moving handling to Flask's native registry.
- `CLAUDE.md` (error handling philosophy) -- Pass -- `plan.md:316-326` -- Plan preserves fail-fast behavior; exceptions propagate to Flask error handlers rather than being swallowed by a decorator.
- `CLAUDE.md` (testing requirements) -- Pass -- `plan.md:384-433` -- Plan specifies scenarios for every exception type, teardown rollback behavior, and `IncludeParameterError` handling. Coverage is comprehensive.
- `CLAUDE.md` (session teardown pattern) -- Pass -- `plan.md:268-277` -- Simplified teardown using `exc` parameter aligns with Flask's intended lifecycle.
- `docs/product_brief.md` -- Pass -- This is an internal refactoring with no product-facing changes. Error response format is explicitly preserved (`plan.md:227-239`).
- `docs/commands/plan_feature.md` -- Pass -- All 16 required sections are present and filled with appropriate detail.

**Fit with codebase**

- `app/utils/error_handling.py` -- `plan.md:99-101` -- Plan correctly identifies the decorator (lines 50-237) and `_build_error_response` (lines 32-47). The decorator's exception ordering matches the plan's enumeration.
- `app/utils/flask_error_handlers.py` -- `plan.md:103-105` -- Current file has 5 handlers with a simpler response format (no `correlationId`, no `code`). Plan correctly identifies this divergence and plans to replace them with `_build_error_response`-based handlers.
- `app/__init__.py` (teardown) -- `plan.md:107-109` -- Plan correctly references lines 211-229 and the `needs_rollback` flag mechanism.
- `app/api/__init__.py` (before_request auth) -- `plan.md:31` -- Plan notes the auth hook catches exceptions inline and returns error dicts without `_build_error_response`. This is marked as "no change needed," which is acceptable since the hook returns before exceptions reach Flask's handler registry.
- `app/api/sse.py` -- `plan.md:199-201` -- Plan now acknowledges the extensive inline error handling (lines 70-135) and documents that the non-standard response format is acceptable because the SSE Gateway only checks HTTP status codes.
- `docs/commands/code_review.md` -- `plan.md:219-221` -- Now included in the Affected Areas file map and Slice 5.
- `app/api/parts.py` (`IncludeParameterError`) -- `plan.md:115-117` -- Plan now documents the constructor signature change required when re-parenting to `ValidationException`, including the resulting error response format change.

## 3) Open Questions & Ambiguities

- Question: Does Flask pass `exc` to `teardown_request` for ALL registered error handler types, including Werkzeug HTTP exceptions (404, 405) raised by Flask's routing layer?
- Why it matters: If Werkzeug HTTP exceptions (like 404 from unknown routes) do NOT pass `exc` to `teardown_request`, the teardown would commit instead of rolling back. For routing-level errors this is likely harmless (no DB writes occurred), but the behavior should be documented.
- Needed answer: Confirmation via the Slice 1 smoke test that covers both application-raised exceptions AND Werkzeug routing exceptions.

## 4) Deterministic Backend Coverage (new/changed behavior only)

- Behavior: Flask error handler dispatch for all 13 exception types
- Scenarios:
  - Given a Flask app with modular error handlers, When `RecordNotFoundException` is raised, Then 404 with rich envelope (`correlationId`, `code`) -- `plan.md:388`
  - Given a Flask app, When `ValidationError` (Pydantic) is raised, Then 400 with field-level `details.errors` array -- `plan.md:389`
  - Given a Flask app, When each `BusinessLogicException` subclass is raised, Then the correct HTTP status code and `code` field are returned -- `plan.md:390-401`
  - Given a Flask app, When `IntegrityError` with "duplicate key" is raised, Then 409 -- `plan.md:390`
  - Given a Flask app, When unhandled `Exception` is raised, Then 500 and ERROR-level log with stack trace -- `plan.md:402`
  - Given a Flask app, When Werkzeug 404/405 occurs, Then standard envelope response -- `plan.md:403-404`
- Instrumentation: Exception logging at WARNING (business) / ERROR (unexpected) levels -- `plan.md:355-362`
- Persistence hooks: No migrations needed. No test data changes.
- Gaps: None identified. All exception types have explicit scenarios.
- Evidence: `plan.md:384-407`

- Behavior: Simplified session teardown (rollback on `exc`)
- Scenarios:
  - Given simplified teardown, When an exception is caught by Flask error handler, Then `teardown_request(exc)` receives the exception and rolls back -- `plan.md:411`
  - Given simplified teardown, When endpoint succeeds, Then `teardown_request(exc=None)` commits -- `plan.md:412`
  - Given simplified teardown, When `RecordNotFoundException` is raised after DB writes, Then all writes are rolled back -- `plan.md:413`
  - Given simplified teardown, When `IntegrityError` occurs, Then session is rolled back cleanly -- `plan.md:414`
- Instrumentation: No new metrics for teardown (appropriate -- this is existing behavior with a simpler mechanism).
- Persistence hooks: Session reset via `container.db_session.reset()` in `finally` block (already exists).
- Gaps: None.
- Evidence: `plan.md:409-417`

- Behavior: `IncludeParameterError` as `ValidationException` subclass
- Scenarios:
  - Given `GET /api/parts?include=invalid_value`, When `IncludeParameterError` is raised, Then 400 with validation error message -- `plan.md:421`
  - Given `GET /api/parts?include=locations,kits`, When include is valid, Then 200 -- `plan.md:422`
- Instrumentation: None needed (validation error).
- Persistence hooks: None.
- Gaps: None. The plan now documents the constructor change and resulting error response format change at `plan.md:116-117`, noting it is acceptable per the BFF pattern.
- Evidence: `plan.md:419-425`

- Behavior: `_build_error_response` import path change for `ai_parts.py` and `testing.py`
- Scenarios:
  - Given AI analysis is disabled, When `POST /api/ai/analyze` is called, Then 400 via `_build_error_response` from new location -- `plan.md:429`
  - Given non-testing mode, When any `/api/testing/*` endpoint is called, Then 400 via `_build_error_response` from new location -- `plan.md:430`
- Instrumentation: None.
- Persistence hooks: None.
- Gaps: None.
- Evidence: `plan.md:427-433`

## 5) Adversarial Sweep (must find >=3 credible issues or declare why none exist)

Three credible issues were identified in the initial review. All three have been resolved with plan amendments.

**Resolved Major -- `docs/commands/code_review.md` was missing from Affected Areas file map**

**Evidence:** `plan.md:219-221` (added entry) and `plan.md:459-461` (Slice 5 updated to include the file).

**Why it mattered:** The research log at line 25 identified `docs/commands/code_review.md:179` as referencing `@handle_api_errors`, but neither the Affected Areas section nor Slice 5 included it. This would have left stale documentation after implementation.

**Resolution:** The file has been added to both the Affected Areas file map (`plan.md:219-221`) and Slice 5 (`plan.md:459-461`). Slice 5 now also includes a project-wide grep verification step.

**Confidence:** High

---

**Resolved Minor -- `IncludeParameterError` constructor signature mismatch with `ValidationException`**

**Evidence:** `plan.md:116-117` (updated entry with constructor note).

**Why it mattered:** `IncludeParameterError` sets `self.message` manually and does not call `super().__init__()` with an `error_code`. Simply changing the base class to `ValidationException` without updating the constructor would produce a `TypeError` at runtime.

**Resolution:** The plan now explicitly documents that the constructor must be updated to call `super().__init__(message)` and notes the resulting error response format change. See `plan.md:116`.

**Confidence:** High

---

**Resolved Minor -- `sse.py` inline error handling after decorator removal**

**Evidence:** `plan.md:199-201` (updated entry with inline handling acknowledgment).

**Why it mattered:** After removing `@handle_api_errors`, the inline try/except blocks (lines 70-135 of `sse.py`) become the sole error handling path, returning a simpler format without `correlationId` or `code`.

**Resolution:** The plan now acknowledges the inline error handling, documents that the non-standard format is acceptable because the SSE Gateway only checks HTTP status codes, and notes that exceptions escaping the inline handlers will reach the Flask error handler and return the rich envelope. See `plan.md:200`.

**Confidence:** Medium

## 6) Derived-Value & Persistence Invariants (stacked entries)

- Derived value: `needs_rollback` flag (being removed)
  - Source dataset: Set by `@handle_api_errors` decorator on any caught exception (`app/utils/error_handling.py:62-68`)
  - Write / cleanup triggered: Read by `close_session` to decide rollback vs commit (`app/__init__.py:216-219`)
  - Guards: After migration, replaced by Flask's native `exc` parameter in `teardown_request`. No flag needed.
  - Invariant: Every request that raises an exception must result in a session rollback, never a commit. This invariant is maintained by the new mechanism: Flask passes `exc` to `teardown_request`, and `if exc:` triggers rollback.
  - Evidence: `plan.md:283-288`, `app/__init__.py:211-229`

- Derived value: HTTP status code from exception type
  - Source dataset: Exception class hierarchy in `app/exceptions.py` (unfiltered -- every exception subclass maps to exactly one status code)
  - Write / cleanup triggered: Determines HTTP response status code
  - Guards: Flask MRO dispatch ensures most-specific handler matches. Catch-all `Exception` handler at 500 prevents unhandled exceptions.
  - Invariant: Each `BusinessLogicException` subclass maps to the same HTTP status code before and after migration. The mapping is: `RecordNotFoundException` -> 404, `AuthenticationException` -> 401, `AuthorizationException` -> 403, `ValidationException` -> 400, `DependencyException` -> 409, `ResourceConflictException` -> 409, `InsufficientQuantityException` -> 409, `CapacityExceededException` -> 409, `InvalidOperationException` -> 409, `RouteNotAvailableException` -> 400, `BusinessLogicException` (base) -> 400.
  - Evidence: `plan.md:290-295`, `app/utils/error_handling.py:100-197`

- Derived value: `correlationId` in error responses
  - Source dataset: `get_current_correlation_id()` from request context (`app/utils/__init__.py:28-34`)
  - Write / cleanup triggered: Included in every error response JSON envelope via `_build_error_response`
  - Guards: `get_current_correlation_id()` returns `None` outside request context (safe fallback). The function catches `RuntimeError` and `ImportError`.
  - Invariant: Every error response produced by Flask error handlers must include `correlationId` when a request ID context exists. This was NOT the case for the old `flask_error_handlers.py` handlers (which used plain `jsonify`), but the plan correctly replaces them with `_build_error_response`.
  - Evidence: `plan.md:297-302`, `app/utils/__init__.py:28-34`, `app/utils/flask_error_handlers.py:22-25` (old format without correlationId)

## 7) Risks & Mitigations (top 3)

- Risk: Flask `teardown_request` does not receive `exc` when `@app.errorhandler` handles the exception, causing sessions to commit instead of rolling back after errors.
- Mitigation: Validate with a dedicated test in Slice 1 before proceeding. Flask documentation confirms this behavior, but the project's specific Flask version (Flask 3.0) must be tested.
- Evidence: `plan.md:468-470`

- Risk: Exception handler ordering differences between decorator (explicit `try/raise/except` chain) and Flask MRO dispatch cause a different handler to match for edge cases (e.g., an exception that is a subclass of both `ValidationError` and another type).
- Mitigation: Write per-exception-type tests in Slice 1 that assert identical status codes and response shapes. The exception hierarchy in `app/exceptions.py` is clean with no multiple inheritance, so this risk is low.
- Evidence: `plan.md:472-474`, `app/exceptions.py:1-100`

- Risk: Stale documentation references to `@handle_api_errors` survive the migration, causing confusion for future developers or automated agents following the code review template.
- Mitigation: Slice 5 now includes `docs/commands/code_review.md` and a project-wide grep for `handle_api_errors` to confirm zero remaining references.
- Evidence: `plan.md:459-461`

## 8) Confidence

Confidence: High -- The plan is thorough, well-evidenced, and technically sound. All three initial review findings have been resolved with targeted plan amendments. The core technical risk (teardown `exc` behavior) is correctly identified and has an early validation strategy in Slice 1. The plan is ready for implementation.
