# Playwright Test Suite Backend Changes - Technical Plan

## Overview
Implement backend infrastructure changes to support a Playwright test suite that drives the real frontend against the real backend, with machine-readable visibility through structured console events and stable API responses.

## Environment Configuration

### Files to Use:
- `app/config.py` - Use existing `is_testing` property
  - Existing `is_testing` property checks `FLASK_ENV == "testing"`
  - Testing endpoints will only be available when `is_testing` returns `True`

## Testing Endpoints

### New Files to Create:
- `app/api/testing.py` - Testing-specific endpoints
- `app/schemas/testing.py` - Testing endpoint schemas
- `app/services/testing_service.py` - Service for test operations
- `app/utils/log_capture.py` - Log capture handler for streaming

### Log Capture Implementation:

**`app/utils/log_capture.py`:**
- Custom logging handler that captures log records
- Method to register/unregister SSE clients for streaming
- Format log records as structured JSON with:
  - ISO timestamp
  - Log level
  - Logger name
  - Message
  - Correlation ID (extracted from context if available)
  - Extra fields from log record
- Stream logs only to connected clients (no buffering)
- Singleton pattern for application-wide log capture
- Integrate with `ShutdownCoordinator` to send `connection_close` events to all SSE clients during shutdown

### Implementation Details:

**`app/api/testing.py`:**
- Blueprint with `/api/testing` prefix
- Endpoints only registered when `settings.is_testing` is `True`
- No authentication required

1. **Reset endpoint** (`POST /api/testing/reset?seed=true|false`):
   - Accept query parameter `seed` (boolean, default false)
   - Implement concurrency control:
     - Use application-level lock during reset
     - Return 503 with `Retry-After: 5` header if reset in progress
   - Reset sequence:
     1. Drop all tables using `db.drop_all()`
     2. Run all migrations via `upgrade_database(recreate=True)`
     3. Sync types from setup file via `sync_master_data_from_setup()`
     4. If `seed=true`, load test data via `TestDataService.load_full_dataset()`
   - Return JSON: `{"status": "complete", "mode": "testing", "seeded": true/false}`
   - Operation must be idempotent

2. **Log streaming endpoint** (`GET /api/testing/logs/stream`):
   - SSE endpoint that streams backend application logs in real-time
   - Capture logs from all loggers at INFO level and above from connection time
   - Format each log entry as structured JSON:
     ```json
     {
       "timestamp": "2024-01-15T10:30:45.123Z",
       "level": "ERROR",
       "logger": "app.services.type_service",
       "message": "Failed to delete type",
       "correlation_id": "abc-123",
       "extra": {...}
     }
     ```
   - Send as SSE events with event type `"log"`
   - Include correlation ID when available (from Flask-Log-Request-ID)
   - Send `connection_open` event on connect
   - Send `heartbeat` events every 30s (using `time.perf_counter()` for timing)
   - Register with `ShutdownCoordinator` to send `connection_close` on shutdown
   - Critical for LLM observability during test debugging

### Files to Modify:
- `app/__init__.py`:
  - Conditionally register testing blueprint based on `settings.is_testing`
  - Wire testing module for dependency injection
  - If testing mode, attach log capture handler to root logger:
    ```python
    if settings.is_testing:
        from app.utils.log_capture import LogCaptureHandler
        handler = LogCaptureHandler.get_instance()
        logging.getLogger().addHandler(handler)
        logging.getLogger().setLevel(logging.INFO)
    ```
- `app/api/health.py`:
  - Update `readyz` endpoint to also check database connectivity and migration status:
    - Check database connectivity via `db.session.execute(text("SELECT 1"))`
    - Verify all migrations are applied using existing `get_pending_migrations()`
    - Return 503 if database not ready, migrations pending, or shutdown in progress
    - Return JSON includes database and migration status when not shutting down

## Correlation ID Support

### Implementation:
Use Flask-Log-Request-ID package for correlation ID tracking:

### Files to Modify:
- `pyproject.toml`:
  - Add `Flask-Log-Request-ID` dependency to `[tool.poetry.dependencies]` section
- `app/__init__.py`:
  - Initialize Flask-Log-Request-ID:
    ```python
    from flask_log_request_id import RequestID
    RequestID(app, request_id_header="X-Request-Id")
    ```
- `app/config.py`:
  - Configure logging to include request ID in log format

## Error Model Enhancement

### Files to Modify:

**`app/exceptions.py`:**
- Rename `InventoryException` to `BusinessLogicException` (or similar base name)
- Add `error_code` field to base exception class (optional, defaults to None)
- Add new exception: `DependencyException(resource_type, identifier, dependency_desc)`
  - Sets error code `TYPE_IN_USE` (only for type deletion blocking)
  - Message: "Cannot delete {resource_type} {identifier} because {dependency_desc}"

**`app/utils/error_handling.py`:**
- Enhance error response structure minimally:
  ```python
  {
    "error": str,           # Human-readable message
    "code": str,           # Machine-readable code (only for specific cases like "TYPE_IN_USE")
    "details": {...},      # Existing details object
    "correlationId": str   # From Flask-Log-Request-ID if available
  }
  ```
- Add handling for `DependencyException` → 409 status with code "TYPE_IN_USE"
- Include correlation ID in all error responses (from request context)
- Keep machine-readable codes minimal - only for blocked delete operations

**`app/services/type_service.py`:**
- Modify `delete_type()`:
  - When parts exist, raise `DependencyException("Type", type_id, "it is being used by existing parts")`
  - This replaces current `InvalidOperationException`

## SSE Enhancement

### Files to Modify:

**`app/utils/sse_utils.py`:**
- Update `format_sse_event()`:
  - Accept optional `correlation_id` parameter
  - Include in event data if provided
- Add new event types:
  - `"heartbeat"` with correlation ID (keepalive mechanism via named event)
  - `"connection_open"` on stream start
  - `"connection_close"` on stream end

**`app/api/tasks.py`:**
- Send `connection_open` event immediately after connection
- Include correlation ID in all events (get from Flask-Log-Request-ID context)
- Send explicit `"heartbeat"` events instead of raw `:heartbeat\n\n`
- Send `connection_close` before stream ends

**`app/api/utils.py` (version_stream endpoint):**
- Send `connection_open` event immediately after connection
- Include correlation ID in all events
- Send `"heartbeat"` event for keepalive mechanism (replacing raw keepalive comments)
- Send `connection_close` instead of `"shutdown"` before stream ends

## CORS Configuration

No changes needed - dual-port development already works.

## Reset Concurrency Control

### New Files to Create:
- `app/utils/reset_lock.py` - Thread-safe reset operation lock

### Implementation:
**`app/utils/reset_lock.py`:**
```python
class ResetLock:
    def __init__(self):
        self._lock = threading.Lock()
        self._reset_in_progress = False

    def acquire_reset(self) -> bool:
        """Try to acquire reset lock, return False if already in progress"""

    def release_reset(self):
        """Release the reset lock"""

    def is_resetting(self) -> bool:
        """Check if reset is in progress"""
```

### Files to Modify:
- `app/services/container.py`:
  - Add `ResetLock` as singleton provider
- `app/services/testing_service.py`:
  - Use `ResetLock` for reset operations

## Seed Dataset Management

No version tracking needed - test data files already exist and load correctly.

## Testing

### New Test Files:
- `tests/api/test_testing.py` - Test the testing endpoints
- `tests/middleware/test_correlation_id.py` - Test correlation ID handling

### Test Coverage:
1. Testing endpoints only available in test mode
2. Health/readyz endpoint reports accurate database and migration state
3. Reset endpoint handles concurrency correctly
4. Log streaming endpoint captures and streams backend logs with correlation IDs
5. Correlation IDs are generated and propagated via Flask-Log-Request-ID
6. Error responses include proper codes and correlation IDs
7. SSE streams include correlation IDs and proper events
8. Type deletion with dependencies returns proper error structure with TYPE_IN_USE code

## Implementation Phases

### Phase 1: Core Infrastructure
1. Add Flask-Log-Request-ID for correlation ID tracking
2. Error model enhancement (rename base exception, add minimal error codes)
3. Update health/readyz endpoint

### Phase 2: Testing Endpoints
1. Reset endpoint with concurrency control
2. Conditional registration based on FLASK_ENV=testing

### Phase 3: SSE and Response Enhancement
1. SSE heartbeat and lifecycle events
2. Add correlation IDs to SSE events

## Algorithms

### Reset Operation Sequence:
1. Try to acquire reset lock (fail fast with 503 if locked)
2. Drop all database tables
3. Run all migrations from scratch
4. Sync types from setup file
5. If seed requested, load test dataset
6. Release reset lock
7. Return status without version info

### Correlation ID Flow (via Flask-Log-Request-ID):
1. Package automatically checks incoming `X-Request-Id` header
2. If absent, generates new UUID v4
3. Stores in request context
4. Automatically includes in logs
5. Automatically adds to response headers
6. Access via package API for error responses and SSE events

## Start/Stop Script Requirements

### Script File:
- **Location**: `scripts/testing-daemon-ctl.sh`
- **Usage**: `./testing-daemon-ctl.sh start|stop`

### Start Command:
- Daemonize the Flask dev server in testing mode
- Store PID in `/tmp/inventory-backend.pid`
- Set `FLASK_ENV=testing` environment variable
- Exit immediately after starting the daemon
- Clients use `/api/health/readyz` to check when ready

### Stop Command:
- Read PID from `/tmp/inventory-backend.pid`
- Send SIGTERM to the process
- Wait briefly for graceful shutdown
- Clean up PID file
- Exit immediately