# R2: Template-Owned App Factory with App Hooks — Change Brief

## Summary

Refactor `create_app()` and the application startup sequence so that the app factory becomes stable, template-owned code that does not change between apps. App-specific behavior is injected via three well-defined hook functions in a new `app/startup.py` module.

This is part of the Copier template extraction preparation (see `docs/copier_template_analysis.md` R2).

## What Needs to Change

### R2d: Lifecycle Coordinator (Rename + STARTUP Event)

Rename `ShutdownCoordinator` to `LifecycleCoordinator` and add a `STARTUP` lifecycle event:

- Rename `LifetimeEvent` to `LifecycleEvent`
- Rename `ShutdownCoordinatorProtocol` to `LifecycleCoordinatorProtocol`
- Rename `ShutdownCoordinator` to `LifecycleCoordinator`
- Rename `register_lifetime_notification` to `register_lifecycle_notification`
- Rename the file from `shutdown_coordinator.py` to `lifecycle_coordinator.py`
- Add `LifecycleEvent.STARTUP` event that fires at the end of `create_app()` before Flask accepts requests
- Add `fire_startup()` method on the coordinator
- Update all callers, tests, and references throughout the codebase

### R2e: Extract Pool Diagnostics

Move the ~68-line SQLAlchemy pool event logging block from `create_app()` into a new utility module `app/utils/pool_diagnostics.py` with a `setup_pool_logging(engine, settings)` function. Call it from `create_app()` as a one-liner.

### R2a: Template-Owned `create_app()` with App Hooks

Restructure `create_app()` so it calls into the app at three well-defined hook points via `app/startup.py`:

1. **Hook 1 — `create_container()`**: App provides the DI container class/instance
2. **Hook 2 — `register_error_handlers(app)`**: App registers app-specific exception handlers (after template registers core + business handlers)
3. **Hook 3 — `register_blueprints(api_bp, app)`**: App registers its domain blueprints

Template-owned blueprints (health, metrics, testing, SSE, CAS) stay in `create_app()`. Auth hooks stay in `app/api/__init__.py`.

### R2b: App Hook Contract (`app/startup.py`)

Create `app/startup.py` with three functions that the template's `create_app()` calls:

- `create_container()` — returns the app's ServiceContainer instance
- `register_blueprints(api_bp, app)` — registers all app-specific blueprints
- `register_error_handlers(app)` — registers app-specific exception-to-HTTP handlers

### R2c: Wire Modules via Package Scanning

Replace the manually maintained `wire_modules` list (18 entries) with `container.wire(packages=['app.api'])`, which wires all modules in the `app.api` package recursively.

### R2 Supporting Changes

- Move app-specific blueprint imports and registrations from `app/api/__init__.py` to `app/startup.py`
- Keep `api_bp` creation and auth hooks in `app/api/__init__.py`
- Fire `lifecycle.fire_startup()` at the end of `create_app()` (when `skip_background_services` is False)
- Services that need eager initialization register for STARTUP via the existing lifecycle notification pattern

## Constraints

- R1 (Flask error handler migration) is already implemented — error handlers use Flask's `@app.errorhandler` registry
- All existing tests must continue to pass
- No behavioral changes to the running application — this is a structural refactoring
