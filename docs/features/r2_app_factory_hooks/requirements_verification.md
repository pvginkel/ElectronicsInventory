# R2: Template-Owned App Factory with App Hooks -- Requirements Verification

**Verification Date:** 2026-02-11
**Status:** ALL REQUIREMENTS VERIFIED

## Executive Summary

All 14 checklist items from the R2 plan have been successfully implemented and verified.

## Detailed Verification Results

### 1. Rename ShutdownCoordinator to LifecycleCoordinator | PASS
- Old file `app/utils/shutdown_coordinator.py` deleted
- New file `app/utils/lifecycle_coordinator.py` exists
- Class: `LifecycleCoordinator` at line 79, Protocol: `LifecycleCoordinatorProtocol` at line 33
- Container: `app/services/container.py:126` defines `lifecycle_coordinator` provider
- Zero occurrences of "ShutdownCoordinator" in Python codebase

### 2. Rename LifetimeEvent to LifecycleEvent | PASS
- Enum at `app/utils/lifecycle_coordinator.py:27-31` with STARTUP, PREPARE_SHUTDOWN, SHUTDOWN, AFTER_SHUTDOWN
- Updated in 8+ files across services, tests, and utils
- Zero occurrences of "LifetimeEvent" in codebase

### 3. Rename register_lifetime_notification to register_lifecycle_notification | PASS
- Protocol method: `app/utils/lifecycle_coordinator.py:42`
- Implementation: `app/utils/lifecycle_coordinator.py:102`
- All callers updated: metrics_service.py, task_service.py, version_service.py, temp_file_manager.py, testing_utils.py
- Zero occurrences of "register_lifetime_notification" in codebase

### 4. Add LifecycleEvent.STARTUP event | PASS
- Defined at `app/utils/lifecycle_coordinator.py:28` as `STARTUP = "startup"`
- Tested in test_lifecycle_coordinator.py (test_fire_startup_dispatches_event, test_fire_startup_multiple_callbacks)

### 5. Add fire_startup() method on the coordinator | PASS
- Abstract method: `app/utils/lifecycle_coordinator.py:75-77`
- Implementation with idempotency guard (_started flag): `app/utils/lifecycle_coordinator.py:119-127`
- Called in create_app: `app/__init__.py:212`
- Tested for idempotency: test_lifecycle_coordinator.py:334

### 6. Extract pool diagnostics from create_app() into app/utils/pool_diagnostics.py | PASS
- New file: `app/utils/pool_diagnostics.py` with `setup_pool_logging(engine)` function
- Called from `app/__init__.py:57-59`
- Contains checkout/checkin event handlers

### 7. Create app/startup.py with three hook functions | PASS
- `create_container()` at lines 13-26
- `register_blueprints(api_bp, app)` at lines 29-92
- `register_error_handlers(app)` at lines 95-105

### 8. Restructure create_app() to call the three hooks | PASS
- Hook 1: `app/__init__.py:69` calls `create_container()`
- Hook 2: `app/__init__.py:121` calls `register_blueprints(api_bp, app)`
- Hook 3: `app/__init__.py:113` calls `register_error_handlers(app)`

### 9. Replace wire_modules list with container.wire(packages=['app.api']) | PASS
- `app/__init__.py:74`: `container.wire(packages=['app.api'])`
- Zero occurrences of "wire_modules" in codebase

### 10. Move app-specific blueprint registrations to app/startup.py | PASS
- `app/api/__init__.py` now contains ONLY auth_bp registration (line 157-159)
- `app/startup.py:51-86` contains all 18 domain blueprint imports/registrations

### 11. Keep template blueprints registered in create_app() | PASS
- health_bp: `app/__init__.py:130`
- metrics_bp: `app/__init__.py:131`
- testing_bp: `app/__init__.py:135`
- sse_bp: `app/__init__.py:139`
- cas_bp: `app/__init__.py:143`

### 12. Keep auth hooks in app/api/__init__.py | PASS
- before_request: `app/api/__init__.py:24-74`
- after_request: `app/api/__init__.py:90-152`

### 13. Fire lifecycle.fire_startup() when skip_background_services is False | PASS
- Called at `app/__init__.py:212` inside `if not skip_background_services:` block (line 172)

### 14. All existing tests continue to pass | PASS
- 1350 passed, 4 skipped, 30 deselected
- 6 new STARTUP tests added
- Zero behavioral regressions
