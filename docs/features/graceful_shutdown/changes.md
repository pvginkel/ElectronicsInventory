# Graceful Shutdown - Refactoring Changes

## Overview

This document describes the refactoring of the graceful shutdown implementation to handle all shutdown logic within the signal handler itself, eliminating race conditions and ensuring proper server shutdown in both development and production environments.

## Problem Statement

The original implementation had a critical flaw: it relied on code execution after the signal handler returned. This approach failed because:
1. Flask's development server wouldn't exit properly when signal handlers were registered
2. The `wait_for_shutdown()` method was called after the server's main loop, creating a race condition
3. There was no proper mechanism to actually shutdown the server process gracefully

## Solution

Complete refactoring to handle everything within the signal handler, with proper server shutdown mechanisms for both development and production environments.

## Changes Made

### 1. ShutdownCoordinator Refactoring (`app/utils/shutdown_coordinator.py`)

#### Removed:
- `wait_for_shutdown()` method - This was being called after the signal, creating race conditions
- `_shutdown_start_time` instance variable - Now local to the handler

#### Added:
- `register_server_shutdown()` method - Registers a callback to shutdown the server
- `_server_shutdown_callback` instance variable - Stores the server shutdown callback

#### Modified:
- `handle_sigterm()` now performs the complete shutdown sequence:
  - **Phase 1**: Notify all services to stop accepting new work (immediate, non-blocking)
  - **Phase 2**: Wait for all services to complete active tasks (blocking, with timeout)
  - **Phase 3**: Shutdown the server via the registered callback or exit directly

The signal handler now orchestrates the entire shutdown, ensuring proper sequencing and eliminating race conditions.

### 2. Development Mode Support (`run.py` and `app/api/health.py`)

#### Added Internal Shutdown Endpoint (`app/api/health.py`):
```python
@health_bp.route("/_internal/shutdown", methods=["POST"])
def shutdown():
    """Internal endpoint to trigger werkzeug server shutdown in development."""
```
- Only available in development mode (returns 403 in production)
- Uses `werkzeug.server.shutdown` from the request context to gracefully stop Flask
- Called via HTTP from the signal handler

#### Development Server Integration (`run.py`):
- Registers signal handlers (SIGTERM, SIGINT) even in development mode
- Creates a shutdown callback that makes an HTTP POST to the internal endpoint
- Uses a separate thread to avoid blocking the signal handler
- Disabled Flask's auto-reloader (`use_reloader=False`) to prevent signal handler conflicts

### 3. Production Mode Support (`run.py`)

#### Waitress Server Integration:
- Changed from `serve()` to `create_server()` to capture the server instance
- Registers a shutdown callback that calls `server.close()` on the Waitress instance
- Signal handlers trigger graceful shutdown through the coordinator
- Removed all post-signal cleanup code (no more `wait_for_shutdown()` calls)

### 4. Test Updates (`tests/test_shutdown_coordinator.py`)

#### Test Refactoring:
- All tests now mock `sys.exit()` to prevent test termination
- Removed tests for `wait_for_shutdown()` method
- Added tests for `register_server_shutdown()` method
- Updated integration tests to work with the new signal-handler-based approach
- Tests now verify that server shutdown callbacks are properly invoked

## Rationale for Changes

### Why Move Everything to the Signal Handler?

1. **Eliminates Race Conditions**: No dependency on code execution after signals
2. **Proper Server Shutdown**: Servers are designed to be shutdown from within, not after their main loop
3. **Consistent Behavior**: Same shutdown mechanism works in both dev and production

### Why the Internal Shutdown Endpoint?

Flask's development server (Werkzeug) requires accessing `request.environ["werkzeug.server.shutdown"]` to shutdown gracefully. This is only available within a request context, hence the need for an internal endpoint.

### Why Disable Auto-Reloader?

Flask's auto-reloader spawns a child process and interferes with signal handling. Disabling it ensures our signal handlers work correctly in development.

## Benefits

1. **Reliable Shutdown**: Server properly shuts down after tasks complete
2. **No Race Conditions**: All shutdown logic happens synchronously in the signal handler
3. **Development Parity**: Graceful shutdown works identically in dev and production
4. **Testability**: Clear separation of concerns with mockable exit points
5. **Kubernetes Compatible**: Proper SIGTERM handling for pod terminations

## Migration Notes

No changes required to service implementations. The shutdown coordinator interface for services remains unchanged:
- Services still register notifications via `register_shutdown_notification()`
- Services still register waiters via `register_shutdown_waiter()`
- The `is_shutting_down()` method still works as before

The only breaking change is the removal of `wait_for_shutdown()`, which was only called from `run.py` and has been completely refactored.