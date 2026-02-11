# R2: Template-Owned App Factory with App Hooks -- Plan Execution Report

**Status: DONE** -- The plan was implemented successfully with all requirements verified and all code review findings resolved.

## Summary

All 5 implementation slices from the R2 plan were implemented in order:

1. **S1 -- Lifecycle Coordinator Rename**: Renamed `ShutdownCoordinator` to `LifecycleCoordinator` across the entire codebase (22+ files), including the file rename from `shutdown_coordinator.py` to `lifecycle_coordinator.py`. All related types renamed: `LifetimeEvent` -> `LifecycleEvent`, `ShutdownCoordinatorProtocol` -> `LifecycleCoordinatorProtocol`, `register_lifetime_notification` -> `register_lifecycle_notification`.

2. **S2 -- STARTUP Event**: Added `LifecycleEvent.STARTUP` enum value and `fire_startup()` method with idempotency guard (`_started` flag). Added 6 new tests for STARTUP behavior. Updated test stubs (`StubLifecycleCoordinator`, `TestLifecycleCoordinator`) with `fire_startup()` and `simulate_startup()`.

3. **S3 -- Pool Diagnostics Extraction**: Extracted the 68-line SQLAlchemy pool event logging block from `create_app()` into `app/utils/pool_diagnostics.py` with `setup_pool_logging(engine)` function.

4. **S4 -- App Hooks and create_app() Restructure**: Created `app/startup.py` with three hooks (`create_container()`, `register_blueprints()`, `register_error_handlers()`). Moved 18 app-specific blueprint registrations from `app/api/__init__.py` to `app/startup.py`. Replaced `wire_modules` list with `container.wire(packages=['app.api'])`. Restructured `create_app()` to call the hooks at defined points.

5. **S5 -- Documentation Updates**: Updated `CLAUDE.md` references to reflect new file names and patterns.

### Files Created
- `app/utils/lifecycle_coordinator.py` (renamed from `shutdown_coordinator.py`)
- `app/utils/pool_diagnostics.py`
- `app/startup.py`
- `tests/test_lifecycle_coordinator.py` (renamed from `test_shutdown_coordinator.py`)

### Files Deleted
- `app/utils/shutdown_coordinator.py`
- `tests/test_shutdown_coordinator.py`

### Files Modified (21)
**Source (11):** `app/__init__.py`, `app/api/__init__.py`, `app/services/container.py`, `app/services/metrics_service.py`, `app/services/task_service.py`, `app/services/version_service.py`, `app/utils/temp_file_manager.py`, `app/utils/log_capture.py`, `app/api/health.py`, `run.py`, `CLAUDE.md`

**Tests (10):** `tests/testing_utils.py`, `tests/test_graceful_shutdown_integration.py`, `tests/test_metrics_service.py`, `tests/test_task_service.py`, `tests/test_health_api.py`, `tests/test_task_api.py`, `tests/test_ai_service.py`, `tests/test_temp_file_manager.py`, `tests/test_download_cache_service.py`, `tests/test_utils_api.py`

## Code Review Summary

**Decision:** GO-WITH-CONDITIONS (all conditions resolved)

| Severity | Count | Resolved |
|----------|-------|----------|
| Blocker  | 0     | N/A      |
| Major    | 0     | N/A      |
| Minor    | 2     | 2        |

**Findings resolved:**
- **M-1 (Minor):** Stale local variable and fixture names in 4 test files still used `shutdown_coordinator` terminology. Renamed to `lifecycle_coordinator` in `test_task_service.py`, `test_metrics_service.py`, `test_download_cache_service.py`, `test_graceful_shutdown_integration.py`.
- **M-2 (Minor):** Stale docstrings referencing old names. Updated alongside M-1.
- **Style:** Hook numbering comments in `app/__init__.py` were out of order (1, 3, 2). Fixed to sequential (1, 2, 3).

## Verification Results

### Ruff Check
```
3 pre-existing warnings (not from this change):
- app/services/kit_service.py:418:9: F841 Local variable `part_id` assigned but never used
- app/services/task_service.py:293:13: F841 Local variable `duration` assigned but never used
- tests/test_graceful_shutdown_integration.py:156:16: UP038 Use `X | Y` in isinstance
```

### Mypy
```
Success: no issues found in 276 source files
```

### Pytest
```
1350 passed, 4 skipped, 30 deselected, 3 warnings in 320.06s
```

### Stale Reference Grep
Zero matches for `ShutdownCoordinator`, `LifetimeEvent`, `register_lifetime_notification`, `wire_modules` in `.py` files.

## Requirements Verification

All 14 checklist items from plan section 1a verified as PASS. Full report at `docs/features/r2_app_factory_hooks/requirements_verification.md`.

## Outstanding Work & Suggested Improvements

No outstanding work required.

**Suggested follow-ups (not blocking):**
- The 3 pre-existing ruff warnings could be addressed in a separate cleanup pass.
- `icons_bp` registers directly on the Flask `app` (not on `api_bp`) to preserve its route prefix. A future normalization could move it under `api_bp` if desired.
- The `register_error_handlers` hook in `app/startup.py` is currently a no-op since R1 unified all handlers in `flask_error_handlers.py`. It becomes useful when app-specific exception types are added that need custom HTTP mapping.
