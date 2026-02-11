# Plan Execution Report: Flask Error Handler Migration (R1)

## Status

Status: DONE — The plan was implemented successfully. All requirements pass, all review findings resolved, all tests green.

## Summary

Migrated all exception-to-HTTP-response handling from the `@handle_api_errors` decorator to Flask's native `@app.errorhandler()` registry. This is a foundational refactoring (R1 from `docs/copier_template_analysis.md`) required before extracting a Copier template from the Electronics Inventory backend.

### What Was Accomplished

1. **Modular error handler registration** — `app/utils/flask_error_handlers.py` expanded from 77 lines to 326 lines with three registration functions:
   - `register_core_error_handlers()`: Pydantic ValidationError, IntegrityError, BadRequest, HTTP 404/405/500
   - `register_business_error_handlers()`: All 11 BusinessLogicException subclasses + generic Exception catch-all
   - `register_app_error_handlers()`: Convenience wrapper calling both

2. **Session teardown simplification** — `app/__init__.py` close_session() updated to use `g.needs_rollback` flag + `exc` parameter. Important discovery: Flask 3.x does NOT pass exceptions to `teardown_request` when `@app.errorhandler` handles them, so the `g.needs_rollback` flag (set by `_mark_request_failed()` in each handler) is the reliable rollback signal.

3. **Decorator removal** — `@handle_api_errors` removed from all 22 API files under `app/api/`. The decorator function itself deleted from `app/utils/error_handling.py`.

4. **IncludeParameterError reparented** — Now inherits from `ValidationException` (was standalone class). Inline try/except in `parts.py` removed. Constructor calls `super().__init__(message)`.

5. **`build_error_response` renamed** — Removed underscore prefix to reflect public API status. Updated all callers (`ai_parts.py`, `testing.py`).

6. **Comprehensive test rewrite** — `tests/test_transaction_rollback.py` rewritten with 38 tests across 4 test classes covering status codes (18 tests including framework exceptions), response envelopes (9 tests), session teardown rollback (3 tests), and integration rollback (3 tests plus 5 framework-level tests).

7. **Documentation updates** — AGENTS.md, CLAUDE.md (via AGENTS.md), `docs/commands/code_review.md`, `docs/task_system_usage.md` all updated to reference Flask error handlers instead of the decorator.

### Files Changed (31 total)

- `app/utils/flask_error_handlers.py` — Expanded with all error handlers
- `app/utils/error_handling.py` — Reduced to docstring-only stub
- `app/__init__.py` — Simplified teardown, wired new handlers
- 22 files under `app/api/` — Removed `@handle_api_errors` decorator
- `tests/test_transaction_rollback.py` — Complete rewrite (38 tests)
- `tests/api/test_parts_api.py` — Updated IncludeParameterError assertions
- 4 documentation files — Updated references

## Code Review Summary

**Decision: GO**

- **Blockers**: 0
- **Major**: 0
- **Minor**: 2 (both resolved)
  - M1: Missing test routes for BadRequest, Pydantic ValidationError, and IntegrityError → Added 8 new tests
  - M2: `_build_error_response` retained private naming convention despite public use → Renamed to `build_error_response`

## Verification Results

### Ruff
```
app/services/kit_service.py:418:9: F841 Local variable `part_id` is assigned to but never used
app/services/task_service.py:293:13: F841 Local variable `duration` is assigned to but never used
tests/test_graceful_shutdown_integration.py:156:16: UP038 Use `X | Y` in `isinstance` call instead of `(X, Y)`
Found 3 errors.
```
All 3 errors are pre-existing (none in modified files).

### Mypy
```
Success: no issues found in 275 source files
```

### Pytest
```
1344 passed, 4 skipped, 30 deselected, 3 warnings in 291.66s
```
Test count increased from 1336 to 1344 (+8 new tests for framework-level exception handlers).

## Outstanding Work & Suggested Improvements

No outstanding work required. All plan requirements implemented, all review findings resolved.

**Suggested follow-up improvements (non-blocking, not part of this migration):**

1. **Auth hook error format consistency** — The `before_request` auth hook at `app/api/__init__.py:69-74` returns a simpler error format (`{"error": str(e)}`) without `code`, `details`, or `correlationId`. This could be unified with the rich envelope by having the auth hook raise exceptions instead of catching them inline. This was explicitly scoped out of this migration per the plan.

2. **Error handler testing DRY** — The `_register_error_trigger_routes()` helper in `tests/test_transaction_rollback.py` could be extracted to a shared test utility if other test files need similar error-triggering patterns.
