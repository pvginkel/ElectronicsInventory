# Graceful Task Shutdown for Kubernetes

## Brief Description

Implement graceful shutdown handling for the task execution system in the Electronics Inventory backend to ensure running tasks complete properly during Kubernetes pod terminations, rolling updates, and scaling operations. The implementation uses a callback-based registration pattern where services register shutdown handlers and notification callbacks with a central shutdown manager. This provides loose coupling while ensuring coordinated shutdown across task executions, SSE connections, and other services.

## Files and Functions to Create/Modify

### New Files to Create

1. **`app/utils/graceful_shutdown.py`**
   - `GracefulShutdownManager` class (singleton)
   - `register_shutdown_handler(name, handler)` - Register a handler that blocks until ready for shutdown
   - `register_shutdown_callback(callback)` - Register a callback to be notified when shutdown starts
   - `is_shutting_down()` - Check if shutdown has been initiated
   - `handle_sigterm(signum, frame)` - SIGTERM signal handler that sets shutdown state and notifies all callbacks
   - `wait_for_shutdown(timeout=None)` - Block until all handlers report ready (uses GRACEFUL_SHUTDOWN_TIMEOUT if timeout not provided)

2. **`app/api/health.py`**
   - `readyz()` - Readiness probe endpoint (returns 503 when shutting down)
   - `healthz()` - Liveness probe endpoint (always returns 200)

3. **`tests/test_graceful_shutdown.py`**
   - Test graceful shutdown manager functionality
   - Test health endpoints behavior
   - Test integration with task service

4. **`tests/test_health_api.py`**
   - Test health API endpoints
   - Test readiness probe behavior during draining

### Files to Modify

1. **`app/services/task_service.py`**
   - Modify `__init__()`:
     - Accept `graceful_shutdown_manager` parameter
     - Register shutdown callback via `register_shutdown_callback(self._on_shutdown_initiated)`
     - Register shutdown handler via `register_shutdown_handler("TaskService", self._wait_for_tasks_completion)`
   - Add `_on_shutdown_initiated()` callback:
     - Set internal `_shutting_down` flag to stop accepting new tasks
     - Log shutdown initiation
   - Add `_wait_for_tasks_completion(timeout)` handler:
     - Return immediately if no active tasks
     - Wait on internal event for all tasks to complete
     - Return True if completed within timeout, False otherwise
   - Modify `start_task()`:
     - Check if `_shutting_down` before starting new tasks
     - Raise `InvalidOperationException("Service is shutting down")` if true
   - Modify `_execute_task()`:
     - After task completion, check if shutting down and last task
     - Signal shutdown ready event if conditions met
   - Add `_get_active_task_count()` (internal):
     - Return count of PENDING + RUNNING tasks
   - Modify existing `shutdown()` method:
     - Force-cancel remaining tasks after grace period
     - Clean up executor and threads

2. **`run.py`**
   - Add signal handler registration in `main()`:
     - Register SIGTERM to call `graceful_shutdown_manager.handle_sigterm()`
   - Add graceful shutdown sequence:
     - Call `graceful_shutdown_manager.wait_for_shutdown()`
     - Perform final cleanup of services

3. **`app/api/__init__.py`**
   - Register new health blueprint
   - Update API initialization

4. **`app/config.py`**
   - Add `GRACEFUL_SHUTDOWN_TIMEOUT: int` - Maximum seconds to wait for tasks during shutdown (default: 600 seconds / 10 minutes)

5. **`app/services/container.py`**
   - Add `graceful_shutdown_manager` as singleton provider
   - Pass to TaskService constructor
   - Wire to health module

6. **`app/services/metrics_service.py`** (leverage existing Prometheus infrastructure)
   - Add shutdown metrics:
     - `application_shutting_down` (Gauge) - Whether application is shutting down (1=yes, 0=no)
     - `graceful_shutdown_duration_seconds` (Histogram) - Duration of graceful shutdowns
     - `active_tasks_at_shutdown` (Gauge) - Number of active tasks when shutdown initiated
   - Add methods:
     - `set_shutdown_state(is_shutting_down)`
     - `record_shutdown_duration(duration)`
     - `record_active_tasks_at_shutdown(count)`

## Step-by-Step Algorithm

### 1. Graceful Shutdown Sequence
```
On SIGTERM signal:
  1. GracefulShutdownManager.handle_sigterm() called:
     - Set internal _shutting_down flag to True
     - Record shutdown start time for metrics
     - Update Prometheus application_shutting_down gauge to 1
     - Call all registered shutdown callbacks (non-blocking)
  2. Services receive shutdown callbacks:
     - TaskService._on_shutdown_initiated() sets internal flag
     - New tasks rejected with "Service is shutting down"
     - Readiness probe starts returning 503
  3. Kubernetes removes pod from service endpoints
  4. run.py calls graceful_shutdown_manager.wait_for_shutdown():
     - Iterate through registered handlers with timeout
     - Each handler blocks until ready or timeout
  5. TaskService._wait_for_tasks_completion():
     - Return immediately if no active tasks
     - Otherwise wait on event signaled when last task completes
     - Maximum wait: remaining timeout from GRACEFUL_SHUTDOWN_TIMEOUT
  6. After all handlers complete or timeout:
     - TaskService.shutdown() force-cancels remaining tasks
     - Cleanup executor and threads
  7. Record shutdown duration in Prometheus
  8. Clean shutdown
```

### 2. Health Check Logic
```
Readiness endpoint (/readyz):
  If graceful_shutdown_manager.is_shutting_down():
    Return 503 "shutting down"
  If TaskService not healthy:
    Return 503 "task service unhealthy"
  Else:
    Return 200 "ready"

Liveness endpoint (/healthz):
  Always return 200 "alive"
  (Keeps pod alive during shutdown)
```

### 3. Task Service Shutdown Handling
```
During initialization:
  1. Register shutdown callback with manager
  2. Register shutdown handler with manager
  3. Initialize shutdown ready event

When shutdown callback received:
  1. Set internal _shutting_down flag
  2. Log shutdown initiation
  3. Continue processing existing tasks

When starting new task:
  1. Check if _shutting_down
     - If true: raise InvalidOperationException("Service is shutting down")
  2. Check executor capacity
  3. Submit task to executor
  4. Return task ID and stream URL

When task completes (_execute_task):
  1. Complete normal task processing
  2. If shutting down:
     - Check if this was the last active task
     - If yes, signal shutdown ready event

When shutdown handler called (_wait_for_tasks_completion):
  1. If no active tasks, return True immediately
  2. Wait on shutdown ready event with timeout
  3. Return True if event signaled, False if timeout

Final cleanup (shutdown method):
  1. Force-cancel any remaining tasks
  2. Shutdown executor
  3. Stop cleanup thread
```

## Implementation Phases

### Phase 1: Core Shutdown Infrastructure
- Create `GracefulShutdownManager` class with callback/handler registration
- Add signal handling to `run.py`
- Implement shutdown coordination logic

### Phase 2: Health Endpoints
- Create health blueprint with readyz/healthz endpoints
- Wire health endpoints to shutdown manager
- Remove any drain endpoint (shutdown is one-way)

### Phase 3: Task Service Integration
- Register shutdown callback and handler in TaskService.__init__
- Implement _on_shutdown_initiated callback
- Implement _wait_for_tasks_completion handler
- Modify start_task to check shutdown state
- Update _execute_task to signal when last task completes
- Enhance existing shutdown method for force cleanup

### Phase 4: Prometheus Metrics
- Add task shutdown metrics to MetricsService
- Update metrics during shutdown sequence
- Track shutdown duration and reasons

### Phase 5: Testing and Kubernetes Deployment
- Write comprehensive tests for shutdown scenarios
- Test with actual task workloads
- Create Kubernetes deployment manifest with proper grace period
- Test rolling updates and pod terminations