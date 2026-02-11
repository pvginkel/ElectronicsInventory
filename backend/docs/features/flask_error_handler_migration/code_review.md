# Code Review: Flask Error Handler Migration (R1)

## 1) Summary & Decision

**Readiness**

The implementation cleanly migrates all exception-to-HTTP-response handling from the `@handle_api_errors` decorator to Flask's native `@app.errorhandler()` registry across 31 changed files. The core architecture is sound: modular registration functions (`register_core_error_handlers`, `register_business_error_handlers`, `register_app_error_handlers`) in `app/utils/flask_error_handlers.py`, a simplified session teardown using `g.needs_rollback`, and thorough removal of the decorator from all 22 API files. The `IncludeParameterError` reparenting to `ValidationException` is correctly implemented. The `_build_error_response` helper was successfully relocated and all callers updated. Documentation updates are comprehensive. The test rewrite in `tests/test_transaction_rollback.py` covers status codes, response envelopes, and the critical rollback-via-teardown behavior. There are two Minor findings and no Blockers or Majors.

**Decision**

`GO` -- The implementation is correct, well-tested, and aligned with the plan. The Flask 3.x `teardown_request` discovery was handled pragmatically with the `g.needs_rollback` flag, and the solution is well-documented. The two Minor findings are non-blocking.

## 2) Conformance to Plan (with evidence)

**Plan alignment**

- `plan.md: Section 2, app/utils/flask_error_handlers.py` -- Plan called for expanding from 77 lines to contain all exception-to-HTTP mappings with three modular registration functions. Implementation delivers exactly this at `app/utils/flask_error_handlers.py:79-325` with `register_core_error_handlers`, `register_business_error_handlers`, and `register_app_error_handlers`.

- `plan.md: Section 2, app/__init__.py (session teardown)` -- Plan called for simplifying `close_session` to rely solely on `exc` parameter. Implementation at `app/__init__.py:211-235` correctly uses `g.needs_rollback` flag instead, which is a justified deviation from the plan (see Gaps section). The docstring at lines 213-221 documents the rationale.

- `plan.md: Section 2, app/__init__.py (error handler registration)` -- Plan called for replacing single `register_error_handlers(app)` with three modular calls. Implementation at `app/__init__.py:177-180` calls `register_app_error_handlers(app)` which is the convenience wrapper that calls both core and business handlers. This is equivalent and cleaner.

- `plan.md: Section 2, app/api/parts.py` -- Plan called for removing `IncludeParameterError` inline handling and reparenting to `ValidationException`. Implementation at `app/api/parts.py:51-54` shows `IncludeParameterError(ValidationException)` with `super().__init__(message)`, and lines 188-190 remove the inline try/except. Tests updated at `tests/api/test_parts_api.py:305-327`.

- `plan.md: Section 2, 22 API files` -- All decorator removals confirmed. Grep for `handle_api_errors` in `app/` and `tests/` returns zero matches.

- `plan.md: Section 2, app/api/ai_parts.py and testing.py` -- `_build_error_response` import paths updated to `app.utils.flask_error_handlers` at `app/api/ai_parts.py:26` and `app/api/testing.py:29`.

- `plan.md: Section 2, app/utils/error_handling.py` -- Decorator fully deleted. File reduced to a docstring-only stub at `app/utils/error_handling.py:1-7`.

- `plan.md: Section 2, tests/test_transaction_rollback.py` -- Complete rewrite at `tests/test_transaction_rollback.py:1-466`. Four test classes covering status codes, response envelopes, session teardown rollback, and integration rollback.

- `plan.md: Section 2, documentation` -- `AGENTS.md:42-53`, `CLAUDE.md:45,219`, `docs/commands/code_review.md:179`, `docs/task_system_usage.md:124-129`, `.claude/agents/code-writer.md:50` all updated.

- `plan.md: Section 9, Observability` -- Plan called for differentiating log levels: WARNING for business exceptions, ERROR for unexpected. Implementation confirms this: business handlers use `logger.warning(...)` (e.g., `flask_error_handlers.py:188,199,210`) and the generic Exception handler uses `logger.error(..., exc_info=True)` at `flask_error_handlers.py:311`.

**Gaps / deviations**

- `plan.md: Section 7, "Session teardown uses Flask's native exc parameter"` -- The plan assumed Flask passes the original exception to `teardown_request` even when `@app.errorhandler` handles it. The implementation discovered that Flask 3.x does NOT do this. The deviation is justified and well-documented: `_mark_request_failed()` sets `g.needs_rollback = True` in every error handler (`flask_error_handlers.py:39-51`), and the teardown checks both `exc` and `g.needs_rollback` (`app/__init__.py:225`). This is actually more robust than relying solely on `exc`.

- `plan.md: Section 13, Test Plan` -- Plan called for testing `BadRequest`, Pydantic `ValidationError`, and `IntegrityError` handlers explicitly. The new `tests/test_transaction_rollback.py` does not include test routes for these three framework-level exception types. However, these handlers are tested indirectly through existing API tests that trigger validation errors and constraint violations. This is a Minor gap (see Finding M1).

## 3) Correctness -- Findings (ranked)

- Title: `Minor (M1) -- Missing explicit test routes for BadRequest, Pydantic ValidationError, and IntegrityError in test_transaction_rollback.py`
- Evidence: `tests/test_transaction_rollback.py:26-102` -- The `_register_error_trigger_routes` function creates test routes for all 11 `BusinessLogicException` subclasses and a generic `RuntimeError`, but does not create routes that trigger `BadRequest`, Pydantic `ValidationError`, or SQLAlchemy `IntegrityError`. The plan at `plan.md:388-404` explicitly listed these scenarios.
- Impact: Lower test specificity for the three framework-level exception handlers in `register_core_error_handlers`. These are still exercised by existing API tests (e.g., `tests/api/test_parts_api.py` triggers validation errors), so the gap is not a correctness risk, but it leaves the new error handler module without isolated coverage for these paths.
- Fix: Add three test routes in `_register_error_trigger_routes`: one that calls `request.get_json()` on a non-JSON body (triggers `BadRequest`), one that raises `ValidationError.from_exception_data(...)` (triggers Pydantic handler), and one that raises `IntegrityError(...)` (triggers integrity handler). Add corresponding tests in `TestFlaskErrorHandlerStatusCodes`.
- Confidence: High

- Title: `Minor (M2) -- _build_error_response is exported with underscore-prefix (private convention) but used as public API`
- Evidence: `app/utils/flask_error_handlers.py:54` -- The function is named `_build_error_response` with a leading underscore, conventionally indicating a private function. However, it is explicitly imported by `app/api/ai_parts.py:26` and `app/api/testing.py:29`, and the plan at `plan.md:60` says "Preserve `_build_error_response` as a public utility."
- Impact: Minor readability/convention issue. The leading underscore may confuse future developers about whether the function is part of the public API. No runtime impact.
- Fix: Rename to `build_error_response` (without underscore) to reflect its public nature, or add a comment clarifying the intentional export. This is a pre-existing naming issue carried over from `error_handling.py` and is non-blocking.
- Confidence: High

## 4) Over-Engineering & Refactoring Opportunities

- Hotspot: Dual registration functions (`register_core_error_handlers` + `register_business_error_handlers`) plus convenience wrapper `register_app_error_handlers`
- Evidence: `app/utils/flask_error_handlers.py:79,177,319` -- Three functions where only one (`register_app_error_handlers`) is ever called from the app factory.
- Suggested refactor: None needed at this time. The modular split is explicitly part of the plan to support future Copier template extraction (R2-R6 from `docs/copier_template_analysis.md`). The core handlers are template-portable while business handlers are app-specific. The split will pay off when template extraction begins.
- Payoff: Deferred to template extraction; current split is well-motivated.

## 5) Style & Consistency

- Pattern: `_mark_request_failed()` called at the top of every handler
- Evidence: `app/utils/flask_error_handlers.py:89,99,116,149,159,169,187,198,209,...` -- Every handler calls `_mark_request_failed()` as its first statement.
- Impact: The repetition is acceptable for explicitness and correctness (ensures rollback signal is set even if the handler logic fails). A decorator or context manager could DRY this up, but would obscure the simple mechanism.
- Recommendation: No change needed. The pattern is clear and maintainable.

- Pattern: Consistent use of `logger.warning()` for business exceptions and `logger.error()` for unexpected errors
- Evidence: `app/utils/flask_error_handlers.py:100,188,199,210,221,232,243,254,265,276,287,299` use `logger.warning()` while `flask_error_handlers.py:311` uses `logger.error(..., exc_info=True)`.
- Impact: Good practice. Reduces log noise from expected exceptions while preserving full diagnostics for unexpected failures.
- Recommendation: None; this is well-executed per the plan's observability design at `plan.md:355-362`.

## 6) Tests & Deterministic Coverage (new/changed behavior only)

- Surface: Flask error handler status code mapping (all exception types)
- Scenarios:
  - Given an endpoint raises `RecordNotFoundException`, When the request completes, Then response is 404 (`tests/test_transaction_rollback.py::TestFlaskErrorHandlerStatusCodes::test_record_not_found_returns_404`)
  - Given an endpoint raises `ValidationException`, When the request completes, Then response is 400 (`tests/test_transaction_rollback.py::TestFlaskErrorHandlerStatusCodes::test_validation_exception_returns_400`)
  - Given an endpoint raises `AuthenticationException`, When the request completes, Then response is 401 (`tests/test_transaction_rollback.py::TestFlaskErrorHandlerStatusCodes::test_authentication_exception_returns_401`)
  - Given an endpoint raises `AuthorizationException`, When the request completes, Then response is 403 (`tests/test_transaction_rollback.py::TestFlaskErrorHandlerStatusCodes::test_authorization_exception_returns_403`)
  - Given an endpoint raises `DependencyException`, When the request completes, Then response is 409 (`tests/test_transaction_rollback.py::TestFlaskErrorHandlerStatusCodes::test_dependency_exception_returns_409`)
  - Given an endpoint raises `ResourceConflictException`, When the request completes, Then response is 409 (`tests/test_transaction_rollback.py::TestFlaskErrorHandlerStatusCodes::test_resource_conflict_returns_409`)
  - Given an endpoint raises `InsufficientQuantityException`, When the request completes, Then response is 409 (`tests/test_transaction_rollback.py::TestFlaskErrorHandlerStatusCodes::test_insufficient_quantity_returns_409`)
  - Given an endpoint raises `CapacityExceededException`, When the request completes, Then response is 409 (`tests/test_transaction_rollback.py::TestFlaskErrorHandlerStatusCodes::test_capacity_exceeded_returns_409`)
  - Given an endpoint raises `InvalidOperationException`, When the request completes, Then response is 409 (`tests/test_transaction_rollback.py::TestFlaskErrorHandlerStatusCodes::test_invalid_operation_returns_409`)
  - Given an endpoint raises `RouteNotAvailableException`, When the request completes, Then response is 400 (`tests/test_transaction_rollback.py::TestFlaskErrorHandlerStatusCodes::test_route_not_available_returns_400`)
  - Given an endpoint raises `BusinessLogicException`, When the request completes, Then response is 400 (`tests/test_transaction_rollback.py::TestFlaskErrorHandlerStatusCodes::test_business_logic_generic_returns_400`)
  - Given an endpoint raises `RuntimeError`, When the request completes, Then response is 500 (`tests/test_transaction_rollback.py::TestFlaskErrorHandlerStatusCodes::test_generic_exception_returns_500`)
  - Given an unknown route, When accessed, Then response is 404 (`tests/test_transaction_rollback.py::TestFlaskErrorHandlerStatusCodes::test_werkzeug_404_returns_404`)
  - Given a valid route with wrong method, When accessed, Then response is 405 (`tests/test_transaction_rollback.py::TestFlaskErrorHandlerStatusCodes::test_werkzeug_405_returns_405`)
  - Given a successful endpoint, When accessed, Then response is 200 (`tests/test_transaction_rollback.py::TestFlaskErrorHandlerStatusCodes::test_success_returns_200`)
- Hooks: `error_client` fixture at `tests/test_transaction_rollback.py:109-113` registers the trigger blueprint.
- Gaps: No test routes for `BadRequest`, Pydantic `ValidationError`, or `IntegrityError` (see Finding M1). These are exercised indirectly via existing API tests.
- Evidence: `tests/test_transaction_rollback.py:120-181`

- Surface: Rich JSON response envelope
- Scenarios:
  - Given `RecordNotFoundException`, Then response includes `error`, `details`, and `code` fields (`tests/test_transaction_rollback.py::TestFlaskErrorHandlerResponseEnvelope::test_business_exception_has_code_field`)
  - Given generic exception, Then response has `error` and `details` but no `code` (`tests/test_transaction_rollback.py::TestFlaskErrorHandlerResponseEnvelope::test_generic_exception_has_no_code`)
  - Given Werkzeug 404, Then response has rich envelope format (`tests/test_transaction_rollback.py::TestFlaskErrorHandlerResponseEnvelope::test_werkzeug_404_has_envelope`)
  - Given Werkzeug 405, Then response has rich envelope format (`tests/test_transaction_rollback.py::TestFlaskErrorHandlerResponseEnvelope::test_werkzeug_405_has_envelope`)
  - Given `ValidationException`, Then `code` is `VALIDATION_FAILED` (`tests/test_transaction_rollback.py::TestFlaskErrorHandlerResponseEnvelope::test_validation_exception_envelope`)
  - Given `InvalidOperationException`, Then `code` is `INVALID_OPERATION` (`tests/test_transaction_rollback.py::TestFlaskErrorHandlerResponseEnvelope::test_invalid_operation_envelope`)
  - Given `AuthenticationException`, Then `code` is `AUTHENTICATION_REQUIRED` (`tests/test_transaction_rollback.py::TestFlaskErrorHandlerResponseEnvelope::test_authentication_exception_envelope`)
  - Given `AuthorizationException`, Then `code` is `AUTHORIZATION_FAILED` (`tests/test_transaction_rollback.py::TestFlaskErrorHandlerResponseEnvelope::test_authorization_exception_envelope`)
- Hooks: Same `error_client` fixture.
- Gaps: None.
- Evidence: `tests/test_transaction_rollback.py:188-241`

- Surface: Session teardown rollback mechanism
- Scenarios:
  - Given an endpoint writes to the database then raises `InvalidOperationException`, When the request completes, Then the write is rolled back (`tests/test_transaction_rollback.py::TestSessionTeardownRollback::test_exception_triggers_rollback_via_teardown`)
  - Given a successful endpoint that writes, When the request completes, Then the write is committed (`tests/test_transaction_rollback.py::TestSessionTeardownRollback::test_successful_request_commits`)
  - Given an endpoint writes then raises `RecordNotFoundException`, When the request completes, Then the write is rolled back (`tests/test_transaction_rollback.py::TestSessionTeardownRollback::test_record_not_found_rolls_back_prior_writes`)
- Hooks: Each test creates its own blueprint and test client, which is appropriate since these are integration tests that need real request/response cycles.
- Gaps: None. The critical rollback behavior is well-tested.
- Evidence: `tests/test_transaction_rollback.py:249-370`

- Surface: `IncludeParameterError` handling via Flask error handler
- Scenarios:
  - Given `GET /api/parts?include=invalid`, Then 400 with error message (`tests/api/test_parts_api.py::TestPartsListIncludeParameter::test_list_parts_invalid_include_value`)
  - Given `GET /api/parts?include=<201 chars>`, Then 400 with "exceeds maximum length" (`tests/api/test_parts_api.py::TestPartsListIncludeParameter::test_list_parts_include_parameter_too_long`)
  - Given `GET /api/parts?include=<11 tokens>`, Then 400 with "exceeds maximum" (`tests/api/test_parts_api.py::TestPartsListIncludeParameter::test_list_parts_include_parameter_too_many_tokens`)
- Hooks: Standard `client` fixture from conftest.
- Gaps: None.
- Evidence: `tests/api/test_parts_api.py:305-327`

## 7) Adversarial Sweep

- Checks attempted: Transaction/session integrity, `g.needs_rollback` reliability, MRO dispatch correctness, `before_request` auth handler interaction, `_build_error_response` import chain, stale references
- Evidence: See checks below.
- Why code held up: All five probed fault lines are closed.

**Check 1: Session rollback when `g.needs_rollback` is set but `exc` is None.**
The scenario: An error handler catches a `BusinessLogicException`, calls `_mark_request_failed()` which sets `g.needs_rollback = True`, and returns a well-formed response. Flask passes `exc=None` to `teardown_request`. The teardown at `app/__init__.py:225` evaluates `needs_rollback = exc or getattr(g, "needs_rollback", False)`. Since `g.needs_rollback` is `True`, `needs_rollback` evaluates to `True`, and `db_session.rollback()` is called. This is verified by `tests/test_transaction_rollback.py::TestSessionTeardownRollback::test_exception_triggers_rollback_via_teardown`.

**Check 2: Flask MRO dispatch selects the correct handler for `IncludeParameterError(ValidationException(BusinessLogicException(Exception)))`.**
Flask's `@app.errorhandler` dispatch walks the MRO from most-specific to least-specific. `IncludeParameterError` inherits from `ValidationException`. Flask will match the `ValidationException` handler at `flask_error_handlers.py:207-216`, which returns 400 with `code="VALIDATION_FAILED"`. The `BusinessLogicException` catch-all at line 296 is a fallback but will not match because `ValidationException` is more specific. This is correct and matches the expected behavior verified by the updated tests at `tests/api/test_parts_api.py:305-327`.

**Check 3: `before_request` auth handler does not interfere with Flask error handlers.**
The auth `before_request` hook at `app/api/__init__.py:66-74` catches `AuthenticationException` and `AuthorizationException` inline and returns `{"error": str(e)}, 401/403`. These exceptions are caught before they can propagate to Flask's error handler registry. After the migration, if these exceptions were somehow NOT caught by the `before_request` hook (e.g., in a non-`api_bp` blueprint), they would be caught by the `AuthenticationException` / `AuthorizationException` handlers in `flask_error_handlers.py:185-205`, producing the rich envelope. This is strictly better than before the migration (where uncaught auth exceptions on non-api_bp blueprints would have been caught by the generic `Exception` handler).

**Check 4: `_build_error_response` import chain integrity.**
`app/api/ai_parts.py:26` imports `from app.utils.flask_error_handlers import _build_error_response`. `app/api/testing.py:29` does the same. The function is defined at `app/utils/flask_error_handlers.py:54`. Any import failure would surface at module load time and be caught by any test that touches these modules. The old `app/utils/error_handling.py` module exists as a docstring-only stub, so no stale re-export could cause confusion.

**Check 5: No stale `handle_api_errors` references in source code or active tests.**
Grep for `handle_api_errors` in `app/` returns zero matches. Grep in `tests/` returns zero matches. Remaining references are only in documentation under `docs/features/` (plan, review, etc.) and `docs/copier_template_analysis.md`, which are historical design documents, not active code or instructions.

## 8) Invariants Checklist

- Invariant: Every exception raised during request processing must trigger a session rollback.
  - Where enforced: `_mark_request_failed()` at `app/utils/flask_error_handlers.py:39-51` sets `g.needs_rollback = True` in every error handler. Session teardown at `app/__init__.py:225-227` checks `exc or getattr(g, "needs_rollback", False)` and calls `db_session.rollback()`.
  - Failure mode: If an error handler fails to call `_mark_request_failed()`, the session would commit dirty data. If a new exception type is added without a handler, the generic `Exception` catch-all at `flask_error_handlers.py:308-316` still calls `_mark_request_failed()`.
  - Protection: Every handler calls `_mark_request_failed()` as its first statement. Generic `Exception` handler acts as a safety net. Tests at `tests/test_transaction_rollback.py::TestSessionTeardownRollback` verify rollback behavior.
  - Evidence: `app/utils/flask_error_handlers.py:89,99,116,149,159,169,187,198,209,220,231,242,253,264,275,286,298,310`

- Invariant: Every error response must use the rich JSON envelope format (`error`, `details`, optional `code`, optional `correlationId`).
  - Where enforced: All error handlers call `_build_error_response()` at `app/utils/flask_error_handlers.py:54-76`, which produces the envelope with `correlationId` from `get_current_correlation_id()`.
  - Failure mode: If a handler returned a raw dict instead of calling `_build_error_response`, it would break the envelope contract. The `before_request` auth hook at `app/api/__init__.py:71-73` returns `{"error": str(e)}, 401` without the rich envelope -- this is a pre-existing pattern explicitly left unchanged per the plan.
  - Protection: All Flask error handlers uniformly delegate to `_build_error_response`. Tests at `tests/test_transaction_rollback.py::TestFlaskErrorHandlerResponseEnvelope` verify the envelope shape.
  - Evidence: `app/utils/flask_error_handlers.py:90,107,122,128,134,140,150,160,170,189,200,211,222,233,244,255,266,277,288,300,312`

- Invariant: Each `BusinessLogicException` subclass maps to exactly one HTTP status code, identical to the pre-migration mapping.
  - Where enforced: Dedicated `@app.errorhandler` for each subclass at `app/utils/flask_error_handlers.py:185-316`. The mapping is: `AuthenticationException->401`, `AuthorizationException->403`, `ValidationException->400`, `RecordNotFoundException->404`, `DependencyException->409`, `ResourceConflictException->409`, `InsufficientQuantityException->409`, `CapacityExceededException->409`, `InvalidOperationException->409`, `RouteNotAvailableException->400`, `BusinessLogicException(generic)->400`.
  - Failure mode: If Flask's MRO dispatch matched a less-specific handler (e.g., `BusinessLogicException` instead of `RecordNotFoundException`), the status code would be wrong (400 instead of 404). Flask's handler dispatch is MRO-based and picks the most specific match.
  - Protection: Tests at `tests/test_transaction_rollback.py::TestFlaskErrorHandlerStatusCodes` verify all 15 status code mappings (11 business exceptions + generic exception + werkzeug 404 + werkzeug 405 + success).
  - Evidence: `tests/test_transaction_rollback.py:120-181`

- Invariant: The `g.needs_rollback` flag is always set within a request context.
  - Where enforced: `_mark_request_failed()` at `app/utils/flask_error_handlers.py:39-51` wraps the `g.needs_rollback = True` assignment in a `try/except RuntimeError` to handle the edge case of being called outside a request context.
  - Failure mode: If called outside request context, the `RuntimeError` is caught and silently ignored. This is safe because outside a request context there is no session to roll back.
  - Protection: The `try/except` guard and the fact that error handlers only run within request context.
  - Evidence: `app/utils/flask_error_handlers.py:47-51`

## 9) Questions / Needs-Info

None. The implementation is complete and the Flask 3.x `teardown_request` behavior discovery was handled well with the `g.needs_rollback` workaround.

## 10) Risks & Mitigations (top 3)

- Risk: Future error handlers added to `flask_error_handlers.py` might forget to call `_mark_request_failed()`, causing session commits after errors.
- Mitigation: The pattern is highly visible (every handler starts with it), and the generic `Exception` catch-all provides a safety net. A comment at the top of each registration function could reinforce this requirement. The existing tests in `TestSessionTeardownRollback` would catch omissions if they triggered database writes.
- Evidence: `app/utils/flask_error_handlers.py:39-51,89,99,...`

- Risk: The `before_request` auth hook at `app/api/__init__.py:69-74` returns a simpler error format (`{"error": str(e)}`) without `code`, `details`, or `correlationId`, creating an inconsistency with the rich envelope used by all other error responses.
- Mitigation: This is a pre-existing issue explicitly scoped out of this migration (`plan.md:69`). It could be addressed in a follow-up by having the auth hook raise the exceptions instead of catching them, allowing Flask's error handler to produce the rich envelope. However, the current inline handling is intentional (it prevents the exception from reaching the endpoint).
- Evidence: `app/api/__init__.py:69-74`, `plan.md:69`

- Risk: The `g.needs_rollback` flag introduces a coupling between error handlers and the session teardown that could be missed during future Flask upgrades.
- Mitigation: The docstring at `app/__init__.py:213-221` clearly documents the Flask 3.x behavior and the rationale for the flag. The `test_exception_triggers_rollback_via_teardown` test directly validates this mechanism.
- Evidence: `app/__init__.py:213-221`, `tests/test_transaction_rollback.py:253-299`

## 11) Confidence

Confidence: High -- The implementation is thorough, well-documented, and correctly handles the Flask 3.x `teardown_request` limitation. All 22 API files were mechanically cleaned up, the error handler module is well-structured for future template extraction, and the test suite covers both status code mapping and the critical rollback behavior. The two Minor findings are non-blocking improvements.
