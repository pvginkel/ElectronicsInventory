# Graceful Task Shutdown for Kubernetes

## Brief Description

Implement graceful shutdown handling for the task execution system in the Electronics Inventory backend to ensure running tasks complete properly during Kubernetes pod terminations, rolling updates, and scaling operations. The implementation will track active task executions, active SSE connections for task progress streaming, provide Kubernetes-compatible health endpoints, and handle SIGTERM signals to drain traffic before shutdown.

## Files and Functions to Create/Modify

### New Files to Create

1. **`app/utils/graceful_shutdown.py`**
   - `GracefulShutdownManager` class (singleton)
   - `set_draining(bool)` - Set draining state
   - `is_draining()` - Check if app is draining
   - `handle_sigterm(signum, frame)` - SIGTERM signal handler
   - `wait_for_shutdown(timeout=None)` - Block until safe to shutdown (uses GRACEFUL_SHUTDOWN_TIMEOUT if timeout not provided)

2. **`app/api/health.py`**
   - `readyz()` - Readiness probe endpoint (returns 503 when draining)
   - `healthz()` - Liveness probe endpoint (always returns 200)
   - `drain()` - Manual drain trigger endpoint (for testing)

3. **`tests/test_graceful_shutdown.py`**
   - Test graceful shutdown manager functionality
   - Test health endpoints behavior
   - Test integration with task service

4. **`tests/test_health_api.py`**
   - Test health API endpoints
   - Test readiness probe behavior during draining

### Files to Modify

1. **`app/api/tasks.py`**
   - Modify `get_task_stream()`:
     - Add `X-Accel-Buffering: no` header for nginx compatibility

2. **`app/services/task_service.py`**
   - Add `shutdown()` method:
     - Stop accepting new tasks
     - Wait for running tasks to complete
     - Cancel tasks that exceed grace period
     - Clean up executor and threads
   - Modify `start_task()`:
     - Check if draining before starting new tasks
     - Return error if draining
   - Add `get_active_task_count()`:
     - Return number of running tasks
   - Modify `_cleanup_worker()`:
     - Check shutdown event to exit cleanly

3. **`run.py`**
   - Add signal handler registration in `main()`
   - Register shutdown manager with app context
   - Add graceful shutdown sequence on SIGTERM

4. **`app/api/__init__.py`**
   - Register new health blueprint
   - Update API initialization

5. **`app/config.py`**
   - Add `GRACEFUL_SHUTDOWN_TIMEOUT: int` - Maximum seconds to wait for tasks during shutdown (default: 600 seconds / 10 minutes)

6. **`app/services/container.py`**
   - Add `graceful_shutdown_manager` as singleton provider
   - Wire to health and tasks modules

7. **`app/services/metrics_service.py`** (leverage existing Prometheus infrastructure)
   - Add task shutdown metrics:
     - `task_active_executions` (Gauge) - Current running tasks
     - `task_draining_state` (Gauge) - Whether application is draining (1=draining, 0=normal)
     - `task_graceful_shutdown_duration_seconds` (Histogram) - Duration of graceful shutdowns
   - Add methods:
     - `update_task_metrics(active_tasks)`
     - `set_draining_state(is_draining)`
     - `record_shutdown_duration(duration)`

## Step-by-Step Algorithm

### 1. Graceful Shutdown Sequence
```
On SIGTERM signal:
  1. Set DRAINING flag to True in GracefulShutdownManager
  2. Update Prometheus task_draining_state gauge to 1
  3. Start Prometheus shutdown duration timer
  4. TaskService.shutdown() begins:
     - Stop accepting new tasks (start_task returns error)
     - Readiness probe starts returning 503
  5. Kubernetes removes pod from service endpoints
  6. Wait for active tasks to complete:
     - Check task count every 1 second
     - Maximum wait: GRACEFUL_SHUTDOWN_TIMEOUT seconds (default: 600 seconds / 10 minutes)
  7. Force-cancel any remaining tasks
  8. Shutdown executor and cleanup thread
  9. Record shutdown duration in Prometheus histogram
  10. Clean shutdown
```

### 2. Health Check Logic
```
Readiness endpoint (/readyz):
  If DRAINING == True:
    Return 503 "draining"
  If TaskService not healthy:
    Return 503 "task service unhealthy"
  Else:
    Return 200 "ok"

Liveness endpoint (/healthz):
  Always return 200 "alive"
  (Keeps pod alive during draining)
```

### 3. Task Service Draining
```
When starting new task:
  1. Check if draining
     - If draining: raise InvalidOperationException("Service is draining")
  2. Check executor capacity
  3. Submit task to executor
  4. Return task ID and stream URL

During shutdown:
  1. Set internal draining flag
  2. Wait for running tasks (with timeout)
  3. Force-cancel tasks exceeding timeout
  4. Shutdown executor
  5. Stop cleanup thread
```

## Implementation Phases

### Phase 1: Core Shutdown Infrastructure
- Create `GracefulShutdownManager` class
- Add signal handling to `run.py`
- Implement basic draining state management

### Phase 2: Health Endpoints
- Create health blueprint with readyz/healthz endpoints
- Wire health endpoints to shutdown manager
- Add drain endpoint for manual testing

### Phase 3: Task Service Integration
- Add shutdown method to TaskService
- Implement draining checks in start_task
- Add active task tracking
- Integrate with shutdown manager

### Phase 4: Prometheus Metrics
- Add task shutdown metrics to MetricsService
- Update metrics during shutdown sequence
- Track shutdown duration and reasons

### Phase 5: Testing and Kubernetes Deployment
- Write comprehensive tests for shutdown scenarios
- Test with actual task workloads
- Create Kubernetes deployment manifest with proper grace period
- Test rolling updates and pod terminations