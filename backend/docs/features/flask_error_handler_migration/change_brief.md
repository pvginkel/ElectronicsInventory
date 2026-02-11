# Change Brief: Flask Error Handler Migration (R1)

## Summary

Migrate all exception-to-HTTP-response handling from the `@handle_api_errors` decorator to Flask's native `@app.errorhandler()` registry. This is a foundational refactoring required before extracting a Copier template from the Electronics Inventory backend.

## Current State

Two parallel systems handle exceptions:

1. **`app/utils/error_handling.py`** - A `@handle_api_errors` decorator applied to every endpoint. Contains a monolithic ~160-line `try/except` chain that catches all exception types, marks the session for rollback, logs with stack trace, and returns a rich response envelope (with `correlationId` and `code`).

2. **`app/utils/flask_error_handlers.py`** - Flask-native `@app.errorhandler()` registrations for `ValidationError`, `IntegrityError`, 404, 405, 500.

These substantially duplicate each other. The `IntegrityError` string-matching logic is copy-pasted between them.

## Desired State

- The `@handle_api_errors` decorator is completely removed.
- All exception handling uses Flask's `@app.errorhandler()` registry.
- Error handler registration is modular: core handlers (ValidationError, IntegrityError, 404/405/500), business logic handlers (BusinessLogicException hierarchy), and app-specific handlers.
- Session teardown uses Flask's native `exc` parameter instead of the `needs_rollback` flag.
- The existing rich response envelope format (with `correlationId` and `code`) is preserved.
- All existing tests continue to pass.

## Why This Matters

This refactoring separates error handling into template-owned (core + business) and app-owned (domain-specific) components, which is required for clean Copier template extraction. It also simplifies the codebase by removing a redundant abstraction layer.
