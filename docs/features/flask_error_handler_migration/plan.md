# Plan: Flask Error Handler Migration

## 0) Research Log & Findings

**Areas researched:**

1. **`app/utils/error_handling.py`** (238 lines) -- Contains `handle_api_errors` decorator and `_build_error_response` helper. The decorator catches all exceptions in a `try/except` chain, marks the session for rollback via `db_session.info['needs_rollback'] = True`, logs every exception with `exc_info=True`, and returns a rich JSON envelope. It handles 13 exception types: `BadRequest`, `ValidationError`, `AuthenticationException`, `AuthorizationException`, `ValidationException`, `RecordNotFoundException`, `DependencyException`, `ResourceConflictException`, `InsufficientQuantityException`, `CapacityExceededException`, `InvalidOperationException`, `RouteNotAvailableException`, `BusinessLogicException`, `IntegrityError`, and generic `Exception`.

2. **`app/utils/flask_error_handlers.py`** (77 lines) -- Registers Flask-native `@app.errorhandler()` for `ValidationError`, `IntegrityError`, 404, 405, and 500. The response format here is simpler (no `correlationId`, no `code` field). The `IntegrityError` string-matching logic is duplicated verbatim from `error_handling.py`.

3. **API endpoint files** -- 22 files under `app/api/` import `handle_api_errors`. The decorator is applied to every endpoint function. Two files (`ai_parts.py`, `testing.py`) also import `_build_error_response` for use in `before_request` hooks and early-return short-circuits.

4. **`IncludeParameterError`** -- Defined in `app/api/parts.py:51-55` as a standalone exception class. Used only in `_parse_include_parameter()` and caught inline at `parts.py:194` to return a 400 response. The change brief explicitly calls for removing this inline handling.

5. **Session teardown** -- `app/__init__.py:211-229` defines `close_session(exc)` which checks both `exc` and `db_session.info['needs_rollback']`. The `needs_rollback` flag exists because the decorator swallows exceptions before Flask sees them, so `exc` is always `None` when the decorator is in use.

6. **`tests/test_transaction_rollback.py`** -- 310 lines of tests that directly test the `@handle_api_errors` decorator and the `needs_rollback` flag mechanism. These tests will need significant rewriting.

7. **`tests/test_error_handling.py`** -- 278 lines testing domain exception classes and service-level exception raising. These tests do NOT depend on the decorator and will continue to pass unchanged.

8. **`_build_error_response`** -- Used directly by `ai_parts.py` (lines 113, 250) and `testing.py` (line 51) outside of the decorator context. This helper function must be preserved and relocated.

9. **`docs/copier_template_analysis.md`** -- Contains the full design for this refactoring (R1), including modular registration, simplified session teardown, and centralized logging. The plan here follows that design closely.

10. **Documentation references** -- `AGENTS.md` (lines 45, 52, 220), `CLAUDE.md` (lines matching), `docs/task_system_usage.md` (line 129), and `docs/commands/code_review.md` (line 179) all reference `@handle_api_errors`. These must be updated.

**Key findings and resolutions:**

- **Flask `teardown_request` receives `exc` even when `errorhandler` returns a response.** Flask documentation confirms this: the exception is passed to `teardown_request` even when an error handler successfully produces a response. This is the core enabler for removing the `needs_rollback` flag.
- **`_build_error_response` is used outside the decorator.** Two API modules call it directly. The function must remain available as a public utility after the decorator is deleted. It should move to `flask_error_handlers.py` (or remain in a utility module) and be importable.
- **The `before_request` handler in `app/api/__init__.py`** catches `AuthenticationException` and `AuthorizationException` inline (lines 69-74) and returns error dicts without using `_build_error_response`. After the migration, these exceptions will be handled by Flask's error handler registry, but the `before_request` hook's inline return prevents them from propagating. This is fine -- the hook catches auth errors before they reach endpoints, which is the intended behavior. No change needed here.
- **22 API files need mechanical changes** (remove import, remove decorator annotation). This is straightforward search-and-replace.

---

## 1) Intent & Scope

**User intent**

Migrate all exception-to-HTTP-response handling from the `@handle_api_errors` decorator to Flask's native `@app.errorhandler()` registry. This eliminates a redundant abstraction layer, removes duplicated error handling code, and simplifies session teardown by leveraging Flask's native `exc` parameter. The change is foundational for future Copier template extraction.

**Prompt quotes**

"Remove `@handle_api_errors` entirely"
"All exception handling uses Flask's `@app.errorhandler()` registry"
"Error handler registration is modular: core handlers, business logic handlers, and app-specific handlers"
"Session teardown uses Flask's native `exc` parameter instead of the `needs_rollback` flag"
"The existing rich response envelope format (with `correlationId` and `code`) is preserved"
"All existing tests continue to pass"

**In scope**

- Move all 13 exception type handlers from the decorator into Flask `@app.errorhandler()` registrations
- Make error handler registration modular (core, business logic, app-specific)
- Simplify `close_session` teardown to use only `exc` parameter
- Centralize exception logging in a generic `Exception` handler
- Remove `@handle_api_errors` decorator and all annotations across 22 API files
- Remove `IncludeParameterError` inline handling -- make it inherit from `BusinessLogicException` or register a Flask handler
- Remove duplicated `IntegrityError` logic
- Preserve `_build_error_response` as a public utility
- Rewrite `tests/test_transaction_rollback.py` to test the new mechanism
- Update documentation references in `AGENTS.md`, `CLAUDE.md`, `docs/task_system_usage.md`

**Out of scope**

- Changing the error response JSON format (must remain identical)
- Modifying exception class definitions in `app/exceptions.py` (except potentially `IncludeParameterError`)
- Refactoring `app/__init__.py` beyond the session teardown and error handler registration call
- Changes to the `before_request` auth hook in `app/api/__init__.py`
- Template extraction (R2-R6 from the copier analysis)

**Assumptions / constraints**

- Flask's `teardown_request` receives the exception even when `@app.errorhandler` returns a valid response. This must be validated with a smoke test early in implementation.
- Flask dispatches error handlers by most-specific exception type in the MRO. No custom resolution needed.
- The `_build_error_response` helper must remain importable for `ai_parts.py` and `testing.py` short-circuit paths.

---

## 1a) User Requirements Checklist

**User Requirements Checklist**

- [ ] Remove `@handle_api_errors` decorator function entirely
- [ ] Move all exception handling to Flask's `@app.errorhandler()` registry
- [ ] Make error handler registration modular: core handlers (ValidationError, IntegrityError, 404/405/500), business logic handlers (BusinessLogicException hierarchy), and app-specific handlers registered separately
- [ ] Simplify session teardown to use Flask's native `exc` parameter (remove `needs_rollback` flag)
- [ ] Centralize exception logging in a generic Exception handler
- [ ] Remove `@handle_api_errors` annotations from all API endpoints (~25 files)
- [ ] Remove `IncludeParameterError` inline handling in `parts.py`
- [ ] Remove duplicated `IntegrityError` logic (exists only once after migration)
- [ ] Maintain the existing rich response envelope format (with `correlationId` and `code`)
- [ ] All existing tests must continue to pass

---

## 2) Affected Areas & File Map

- Area: `app/utils/error_handling.py`
- Why: The `handle_api_errors` decorator function (lines 50-237) is deleted entirely. The `_build_error_response` helper (lines 32-47) is relocated to `flask_error_handlers.py`.
- Evidence: `app/utils/error_handling.py:50-237` -- the decorator function that wraps every endpoint

- Area: `app/utils/flask_error_handlers.py`
- Why: Expanded from 77 lines to contain all exception-to-HTTP mapping. Restructured into three modular registration functions. Absorbs `_build_error_response` from `error_handling.py`.
- Evidence: `app/utils/flask_error_handlers.py:10-77` -- current `register_error_handlers` with 5 handlers

- Area: `app/__init__.py` (session teardown)
- Why: Simplify `close_session` to rely solely on `exc` parameter, removing `needs_rollback` flag logic.
- Evidence: `app/__init__.py:211-229` -- current teardown with `needs_rollback` check

- Area: `app/__init__.py` (error handler registration)
- Why: Replace single `register_error_handlers(app)` call with three modular calls.
- Evidence: `app/__init__.py:177-180` -- current registration call site

- Area: `app/api/parts.py`
- Why: Remove `IncludeParameterError` class definition (lines 51-55) and inline handling (lines 192-198). Make `IncludeParameterError` a subclass of `ValidationException` so it's caught by the business logic error handler. **Note:** The current `IncludeParameterError.__init__` sets `self.message` manually and does not call `BusinessLogicException.__init__` with an `error_code`. When re-parenting to `ValidationException`, the constructor must be updated to call `super().__init__(message)` so that `ValidationException` provides the `error_code="VALIDATION_FAILED"`. This will also change the error response format: the current inline handler returns `{"error": "Invalid parameter", "details": {"message": ...}}` without `code`, while the `ValidationException` handler returns `{"error": e.message, "details": {"message": "The request contains invalid data"}, "code": "VALIDATION_FAILED"}`. This format change is acceptable per the BFF pattern (no backwards compatibility needed).
- Evidence: `app/api/parts.py:51-55,192-198` -- class definition and inline try/except; `app/exceptions.py:95-99` -- `ValidationException` constructor

- Area: `app/api/ai_parts.py`
- Why: Remove `handle_api_errors` import/annotations. Update `_build_error_response` import to point to new location.
- Evidence: `app/api/ai_parts.py:26` -- imports both `_build_error_response` and `handle_api_errors`

- Area: `app/api/testing.py`
- Why: Remove `handle_api_errors` import/annotations. Update `_build_error_response` import to new location.
- Evidence: `app/api/testing.py:30,43` -- imports from `error_handling`

- Area: `app/api/pick_lists.py`
- Why: Remove `handle_api_errors` import and all 9 decorator annotations.
- Evidence: `app/api/pick_lists.py:24,40,78,104,125,143,165,189,215,233`

- Area: `app/api/shopping_list_lines.py`
- Why: Remove `handle_api_errors` import and all 9 decorator annotations.
- Evidence: `app/api/shopping_list_lines.py:26,41,72,98,116,152,181,211,256,286`

- Area: `app/api/documents.py`
- Why: Remove `handle_api_errors` import and all 4 decorator annotations.
- Evidence: `app/api/documents.py:24,35,59,101,127`

- Area: `app/api/cas.py`
- Why: Remove `handle_api_errors` import and 1 decorator annotation.
- Evidence: `app/api/cas.py:14,25`

- Area: `app/api/inventory.py`
- Why: Remove `handle_api_errors` import and all 4 decorator annotations.
- Evidence: `app/api/inventory.py:20,28,51,68,90`

- Area: `app/api/sellers.py`
- Why: Remove `handle_api_errors` import and all 5 decorator annotations.
- Evidence: `app/api/sellers.py:18,26,36,50,60,75`

- Area: `app/api/kits.py`
- Why: Remove `handle_api_errors` import and all 14 decorator annotations.
- Evidence: `app/api/kits.py:42,77,106,129,151,181,216,253,274,323,370,395,430,450,469`

- Area: `app/api/types.py`
- Why: Remove `handle_api_errors` import and all 5 decorator annotations.
- Evidence: `app/api/types.py:18,26,37,65,75,86`

- Area: `app/api/attachment_sets.py`
- Why: Remove `handle_api_errors` import and all 9 decorator annotations.
- Evidence: `app/api/attachment_sets.py:23,34,44,93,103,113,124,135,156,178`

- Area: `app/api/shopping_lists.py`
- Why: Remove `handle_api_errors` import and all 8 decorator annotations.
- Evidence: `app/api/shopping_lists.py:28,45,69,108,129,150,174,195,224`

- Area: `app/api/auth.py`
- Why: Remove `handle_api_errors` import and all 3 decorator annotations.
- Evidence: `app/api/auth.py:25,44,95,156`

- Area: `app/api/locations.py`
- Why: Remove `handle_api_errors` import and 1 decorator annotation.
- Evidence: `app/api/locations.py:15,23`

- Area: `app/api/icons.py`
- Why: Remove `handle_api_errors` import and 1 decorator annotation.
- Evidence: `app/api/icons.py:10,42`

- Area: `app/api/dashboard.py`
- Why: Remove `handle_api_errors` import and all 6 decorator annotations.
- Evidence: `app/api/dashboard.py:20,28,43,74,90,121,137`

- Area: `app/api/metrics.py`
- Why: Remove `handle_api_errors` import and 1 decorator annotation.
- Evidence: `app/api/metrics.py:8,14`

- Area: `app/api/kit_shopping_list_links.py`
- Why: Remove `handle_api_errors` import and 1 decorator annotation.
- Evidence: `app/api/kit_shopping_list_links.py:12,29`

- Area: `app/api/tasks.py`
- Why: Remove `handle_api_errors` import and all 3 decorator annotations.
- Evidence: `app/api/tasks.py:8,14,31,48`

- Area: `app/api/boxes.py`
- Why: Remove `handle_api_errors` import and all 7 decorator annotations.
- Evidence: `app/api/boxes.py:25,33,45,78,88,101,111,127`

- Area: `app/api/sse.py`
- Why: Remove `handle_api_errors` import and 1 decorator annotation. **Note:** This file has extensive inline try/except error handling (lines 70-135) that returns `jsonify({"error": ...})` without `correlationId` or `code`. After decorator removal, these inline handlers become the sole error path for the SSE callback endpoint. This is acceptable because the SSE Gateway only checks HTTP status codes (per the comment at line 114). Any exceptions that escape the inline handlers will reach the Flask error handler and return the rich envelope, which the SSE Gateway will also accept.
- Evidence: `app/api/sse.py:17,47,70-135`

- Area: `tests/test_transaction_rollback.py`
- Why: Rewrite to test the new Flask error handler + teardown mechanism instead of the decorator + `needs_rollback` flag.
- Evidence: `tests/test_transaction_rollback.py:1-310` -- entire file tests the decorator mechanism

- Area: `AGENTS.md`
- Why: Update API layer documentation pattern to remove `@handle_api_errors` references (lines 45, 52, 220).
- Evidence: `AGENTS.md:45,52,220` -- references to the decorator in code examples and guidelines

- Area: `CLAUDE.md`
- Why: Update API layer documentation pattern to remove `@handle_api_errors` references.
- Evidence: `CLAUDE.md` -- same content as AGENTS.md regarding API patterns and error handling

- Area: `docs/task_system_usage.md`
- Why: Update code example that shows `@handle_api_errors` usage.
- Evidence: `docs/task_system_usage.md:124,129` -- import and decorator usage in example

- Area: `docs/commands/code_review.md`
- Why: Update backend specifics section that references `handle_api_errors` in the observability checklist.
- Evidence: `docs/commands/code_review.md:179` -- "Observability: typed exceptions, `handle_api_errors`, ruff/mypy compliance, deterministic tests."

---

## 3) Data Model / Contracts

- Entity / contract: Error response JSON envelope
- Shape:
  ```json
  {
    "error": "Human-readable error title",
    "details": {"message": "Descriptive message", ...},
    "code": "MACHINE_ERROR_CODE",
    "correlationId": "uuid-request-id"
  }
  ```
  `code` is present for all `BusinessLogicException` subclasses. `correlationId` is present when a request ID context exists. Both are optional fields.
- Refactor strategy: No change to the response shape. The `_build_error_response` function produces this envelope today and will continue to do so from its new location.
- Evidence: `app/utils/error_handling.py:32-47` -- `_build_error_response` implementation

---

## 4) API / Integration Surface

No new endpoints are added or removed. All existing endpoints continue to function identically. The only change is the mechanism by which exceptions become HTTP responses (Flask error handler registry instead of per-endpoint decorator).

- Surface: All existing HTTP endpoints (~120 routes across 22 API modules)
- Inputs: No change
- Outputs: Identical JSON error responses (same status codes, same envelope format)
- Errors: Same error mapping: `RecordNotFoundException` -> 404, `AuthenticationException` -> 401, `AuthorizationException` -> 403, `ValidationException` -> 400, `DependencyException` -> 409, `ResourceConflictException` -> 409, `InsufficientQuantityException` -> 409, `CapacityExceededException` -> 409, `InvalidOperationException` -> 409, `RouteNotAvailableException` -> 400, `BusinessLogicException` -> 400, `BadRequest` -> 400, `ValidationError` (Pydantic) -> 400, `IntegrityError` -> 400/409, generic `Exception` -> 500.
- Evidence: `app/utils/error_handling.py:74-235` -- current exception-to-status mapping

---

## 5) Algorithms & State Machines

- Flow: Exception-to-HTTP-response dispatch (after migration)
- Steps:
  1. Endpoint function raises an exception (or an exception propagates from a service call).
  2. Flask catches the exception and walks the MRO to find the most specific registered `@app.errorhandler`.
  3. The matched handler calls `_build_error_response()` with the appropriate message, details, error code, and HTTP status code.
  4. Flask returns the response to the client.
  5. Flask calls `teardown_request(exc)` with the original exception. The teardown handler rolls back the database session because `exc` is not `None`.
- States / transitions: None (stateless dispatch).
- Hotspots: None. Exception handling is not a performance-critical path. Flask's MRO-based dispatch is O(n) in the exception class hierarchy depth, which is shallow (max 3 levels).
- Evidence: `app/utils/error_handling.py:50-237` -- current dispatch; Flask documentation on `@app.errorhandler` MRO behavior

- Flow: Session teardown (after migration)
- Steps:
  1. `teardown_request(exc)` is called by Flask after every request.
  2. If `exc` is not `None`, the session is rolled back.
  3. If `exc` is `None`, the session is committed.
  4. The session is closed.
  5. The scoped session is reset via `container.db_session.reset()`.
- States / transitions: None.
- Hotspots: None.
- Evidence: `app/__init__.py:211-229` -- current teardown logic

---

## 6) Derived State & Invariants

- Derived value: `needs_rollback` flag (BEING REMOVED)
  - Source: Set by `@handle_api_errors` decorator when any exception is caught (`app/utils/error_handling.py:65`)
  - Writes / cleanup: Read by `close_session` to decide rollback vs commit (`app/__init__.py:216-219`)
  - Guards: The flag was necessary because the decorator swallowed exceptions before Flask saw them
  - Invariant: After migration, this flag no longer exists. Flask passes the exception directly to `teardown_request(exc)`, making the flag redundant.
  - Evidence: `app/utils/error_handling.py:62-68`, `app/__init__.py:216-224`

- Derived value: HTTP status code from exception type
  - Source: Exception class hierarchy in `app/exceptions.py`
  - Writes / cleanup: Determines HTTP response status code in error handlers
  - Guards: Flask MRO dispatch ensures the most specific handler matches
  - Invariant: Each `BusinessLogicException` subclass must map to exactly one HTTP status code. The mapping must be identical before and after migration.
  - Evidence: `app/utils/error_handling.py:100-197` -- current mapping

- Derived value: `correlationId` in error responses
  - Source: `get_current_correlation_id()` from `app/utils/__init__.py:28-34`
  - Writes / cleanup: Included in every error response JSON envelope
  - Guards: Returns `None` outside request context (safe fallback)
  - Invariant: Every error response must include `correlationId` when a request ID context exists. This must hold after migration.
  - Evidence: `app/utils/error_handling.py:43-46`

---

## 7) Consistency, Transactions & Concurrency

- Transaction scope: Each HTTP request gets a scoped session from the DI container. The session is committed or rolled back in `teardown_request`.
- Atomic requirements: When an exception occurs during request processing, the entire session must be rolled back. No partial commits.
- Retry / idempotency: No change. The app does not use idempotency keys.
- Ordering / concurrency controls: No change. Each request has its own session.
- Evidence: `app/__init__.py:211-229` -- current teardown; `app/__init__.py:42-50` -- SessionLocal creation with `expire_on_commit=False`

**Critical detail:** With the current decorator, exceptions are caught and converted to responses *before* `teardown_request` runs. The decorator sets `needs_rollback = True` to signal the teardown. After migration, exceptions propagate through Flask's error handler machinery, and Flask passes the exception to `teardown_request(exc)`. The teardown can simply check `if exc:` to decide rollback. This is simpler and eliminates a subtle coupling between the decorator and the teardown.

---

## 8) Errors & Edge Cases

- Failure: Exception raised in `_build_error_response` itself (e.g., `get_current_correlation_id()` fails)
- Surface: Flask error handler
- Handling: `get_current_correlation_id()` already handles `RuntimeError` gracefully (returns `None`). If `jsonify` fails, Flask's default 500 handler will surface it.
- Guardrails: The function is defensive. No additional guardrails needed.
- Evidence: `app/utils/__init__.py:30-34` -- try/except in `get_current_correlation_id`

- Failure: Flask cannot find a matching error handler for an exception type
- Surface: Any endpoint
- Handling: Flask falls back through the MRO. If no match is found, it falls through to the generic `Exception` handler registered at the end. This is the catch-all.
- Guardrails: The generic `Exception` handler must always be registered. It returns 500.
- Evidence: Flask documentation -- error handler MRO resolution

- Failure: `IncludeParameterError` raised after removing inline catch
- Surface: `GET /api/parts` endpoint
- Handling: After making `IncludeParameterError` a subclass of `ValidationException`, Flask's `ValidationException` handler returns 400 with the appropriate message.
- Guardrails: Test validates the 400 response for invalid `include` parameter values.
- Evidence: `app/api/parts.py:51-55,192-198` -- current class and inline handling

- Failure: Direct `_build_error_response` calls in `ai_parts.py` and `testing.py` break after module relocation
- Surface: `POST /api/ai/analyze`, `POST /api/ai/cleanup`, `before_request` on testing blueprint
- Handling: Update import paths to point to the new location in `flask_error_handlers.py`.
- Guardrails: Import errors will fail at module load time, caught by any test that exercises these endpoints.
- Evidence: `app/api/ai_parts.py:26,113,250`, `app/api/testing.py:43,51`

---

## 9) Observability / Telemetry

- Signal: Exception logging in generic `Exception` handler
- Type: Structured log at ERROR level
- Trigger: When an unhandled exception (not a `BusinessLogicException` subclass) reaches the catch-all handler
- Labels / fields: Exception class name, message, full stack trace via `exc_info=True`
- Consumer: Application log aggregation
- Evidence: `app/utils/error_handling.py:71` -- current logging in decorator

**Design note on logging levels:** The current decorator logs ALL exceptions at ERROR with full stack trace. After migration, the plan is:
- `BusinessLogicException` subclasses: Log at WARNING level (these are expected application behavior, not errors).
- `ValidationError` (Pydantic), `BadRequest`: Log at WARNING level.
- `IntegrityError`: Log at WARNING level.
- Generic `Exception`: Log at ERROR level with `exc_info=True` (these are unexpected).
- HTTP 404/405: No additional logging (Flask handles these as expected routing misses).

This reduces log noise from expected business exceptions while preserving full diagnostics for unexpected failures.

---

## 10) Background Work & Shutdown

No background workers are affected by this change. The error handling migration is purely request-scoped.

---

## 11) Security & Permissions

Not applicable. Authentication and authorization exceptions continue to be handled with the same HTTP status codes (401, 403). The `before_request` auth hook in `app/api/__init__.py` catches auth exceptions inline before they reach endpoints, and this pattern is unchanged.

---

## 12) UX / UI Impact

Not applicable. The error response JSON format is preserved exactly, so frontend behavior is unchanged.

---

## 13) Deterministic Test Plan

- Surface: Flask error handler registration (new `flask_error_handlers.py`)
- Scenarios:
  - Given a Flask app with error handlers registered, When a `RecordNotFoundException` is raised in an endpoint, Then the response is 404 with the rich envelope format (`correlationId`, `code`).
  - Given a Flask app, When a `ValidationError` (Pydantic) is raised, Then the response is 400 with field-level error details in the `details.errors` array.
  - Given a Flask app, When an `IntegrityError` with "duplicate key" is raised, Then the response is 409 with "Resource already exists".
  - Given a Flask app, When an `IntegrityError` with "foreign key" is raised, Then the response is 400 with "Invalid reference".
  - Given a Flask app, When an `AuthenticationException` is raised, Then the response is 401.
  - Given a Flask app, When an `AuthorizationException` is raised, Then the response is 403.
  - Given a Flask app, When a `DependencyException` is raised, Then the response is 409.
  - Given a Flask app, When a `ResourceConflictException` is raised, Then the response is 409.
  - Given a Flask app, When an `InsufficientQuantityException` is raised, Then the response is 409.
  - Given a Flask app, When a `CapacityExceededException` is raised, Then the response is 409.
  - Given a Flask app, When an `InvalidOperationException` is raised, Then the response is 409.
  - Given a Flask app, When a `RouteNotAvailableException` is raised, Then the response is 400.
  - Given a Flask app, When a `BusinessLogicException` (generic) is raised, Then the response is 400 with the `code` field.
  - Given a Flask app, When a `BadRequest` is raised, Then the response is 400 with "Invalid JSON".
  - Given a Flask app, When an unhandled `Exception` is raised, Then the response is 500 and the exception is logged at ERROR level with stack trace.
  - Given a Flask app, When a Werkzeug 404 occurs (unknown route), Then the response is 404 with the standard envelope.
  - Given a Flask app, When a Werkzeug 405 occurs (wrong method), Then the response is 405.
- Fixtures / hooks: Use the existing Flask test client fixture. Create a test blueprint with endpoints that deliberately raise each exception type.
- Gaps: None. All exception types must be covered.
- Evidence: `tests/test_transaction_rollback.py` -- current test approach (will be rewritten); `tests/test_error_handling.py` -- domain exception tests (unchanged)

- Surface: Session teardown rollback mechanism
- Scenarios:
  - Given a Flask app with the simplified teardown, When an endpoint raises an exception caught by an error handler, Then `teardown_request` receives `exc != None` and rolls back the session.
  - Given a Flask app, When an endpoint completes successfully, Then `teardown_request` receives `exc == None` and commits the session.
  - Given a Flask app, When an endpoint raises `RecordNotFoundException`, Then any prior database writes in the same request are rolled back.
  - Given a Flask app, When an endpoint raises `IntegrityError`, Then the session is rolled back (not left in a broken state).
- Fixtures / hooks: Use the existing Flask test client and database session fixtures. Create endpoints that write data then raise exceptions; verify the writes are rolled back.
- Gaps: None. This is the critical behavioral change that must be validated.
- Evidence: `tests/test_transaction_rollback.py:18-145` -- current rollback tests (will be rewritten to use test client instead of direct decorator calls)

- Surface: `IncludeParameterError` handling via Flask error handler
- Scenarios:
  - Given a `GET /api/parts?include=invalid_value` request, When `_parse_include_parameter` raises `IncludeParameterError`, Then the response is 400 with the validation error message.
  - Given a `GET /api/parts?include=locations,kits` request, When the include parameter is valid, Then the response is 200 with the requested data.
- Fixtures / hooks: Standard Flask test client and test data.
- Gaps: None.
- Evidence: `app/api/parts.py:192-198` -- current inline handling

- Surface: `_build_error_response` direct callers (ai_parts.py, testing.py)
- Scenarios:
  - Given AI analysis is disabled, When `POST /api/ai/analyze` is called, Then the response is 400 using `_build_error_response` from the new location.
  - Given the server is not in testing mode, When any `/api/testing/*` endpoint is called, Then the `before_request` handler returns 400 using `_build_error_response` from the new location.
- Fixtures / hooks: Existing test infrastructure.
- Gaps: None.
- Evidence: `app/api/ai_parts.py:113,250`, `app/api/testing.py:51`

---

## 14) Implementation Slices

- Slice: 1 -- Validate teardown receives `exc` and build modular error handlers
- Goal: Prove that Flask passes exceptions to `teardown_request` when `@app.errorhandler` handles them. Build the three modular registration functions with all exception handlers. Write a smoke test.
- Touches: `app/utils/flask_error_handlers.py`
- Dependencies: None. Can be done first.

- Slice: 2 -- Simplify session teardown and wire new error handlers
- Goal: Update `close_session` to use only `exc` parameter. Update `create_app()` to call the three modular registration functions.
- Touches: `app/__init__.py`
- Dependencies: Slice 1 must be complete.

- Slice: 3 -- Remove decorator from all API files
- Goal: Remove `@handle_api_errors` import and decorator annotations from all 22 API files. Update `_build_error_response` import paths in `ai_parts.py` and `testing.py`. Make `IncludeParameterError` a `ValidationException` subclass and remove inline handling in `parts.py`.
- Touches: All 22 files under `app/api/`, `app/api/parts.py` (IncludeParameterError class)
- Dependencies: Slices 1 and 2 must be complete (error handlers must be active before removing the decorator).

- Slice: 4 -- Delete decorator and rewrite tests
- Goal: Delete `handle_api_errors` function from `error_handling.py` (keep `_build_error_response` or confirm it's been moved). Rewrite `tests/test_transaction_rollback.py` to test Flask error handler + teardown mechanism.
- Touches: `app/utils/error_handling.py`, `tests/test_transaction_rollback.py`
- Dependencies: Slice 3 must be complete (no more callers of the decorator).

- Slice: 5 -- Update documentation
- Goal: Update `AGENTS.md`, `CLAUDE.md`, `docs/task_system_usage.md`, and `docs/commands/code_review.md` to reflect the new error handling pattern (Flask error handlers instead of decorator). Run a project-wide search for `handle_api_errors` to confirm zero remaining references.
- Touches: `AGENTS.md`, `CLAUDE.md`, `docs/task_system_usage.md`, `docs/commands/code_review.md`
- Dependencies: Slice 4 must be complete.

---

## 15) Risks & Open Questions

- Risk: Flask `teardown_request` might not receive `exc` when `@app.errorhandler` handles the exception in certain Flask/Werkzeug versions.
- Impact: Session would commit instead of rolling back after errors, corrupting data.
- Mitigation: Validate with a dedicated test in Slice 1 before proceeding. Flask documentation and source code confirm this behavior, but it must be tested with the project's specific Flask version.

- Risk: Subtle difference in exception handling order between decorator and Flask error handlers causes unexpected behavior.
- Impact: Some exception types might match a different handler than before (e.g., `BadRequest` vs `ValidationError`).
- Mitigation: The Flask MRO dispatch matches the most specific type. The decorator uses explicit ordering. Write tests for each exception type to confirm identical behavior.

- Risk: Existing integration/API tests depend on the decorator's error response format which is slightly different from the current Flask error handlers' format.
- Impact: Test failures due to missing `correlationId` or `code` fields in error responses.
- Mitigation: The new Flask error handlers all use `_build_error_response`, which produces the rich envelope. The old Flask error handlers (which used a simpler format) are being replaced.

- Risk: Some tests in the broader test suite may directly import or mock `handle_api_errors`.
- Impact: Import errors or test failures.
- Mitigation: Search for all references (done in research -- only `test_transaction_rollback.py` imports it directly, and that file is being rewritten).

---

## 16) Confidence

Confidence: High -- The design is well-documented in `docs/copier_template_analysis.md`, the exception hierarchy is clean and well-typed, Flask's error handler MRO behavior is standard, and the mechanical changes (removing decorator annotations) are straightforward. The only risk worth validating is the `teardown_request(exc)` behavior, which is addressed in Slice 1.
