# Graceful SSE Shutdown for Kubernetes

## Brief Description

Implement graceful shutdown handling for Server-Sent Events (SSE) streams in the Electronics Inventory backend to ensure active connections complete properly during Kubernetes pod terminations, rolling updates, and scaling operations. The implementation will track active SSE connections, provide Kubernetes-compatible health endpoints, and handle SIGTERM signals to drain traffic before shutdown.

## Files and Functions to Create/Modify

### New Files to Create

1. **`app/utils/graceful_shutdown.py`**
   - `GracefulShutdownManager` class (singleton)
   - `increment_active_streams()` - Track new SSE connection
   - `decrement_active_streams()` - Track closed SSE connection
   - `set_draining(bool)` - Set draining state
   - `is_draining()` - Check if app is draining
   - `wait_for_streams(timeout)` - Block until streams complete
   - `handle_sigterm(signum, frame)` - SIGTERM signal handler

2. **`app/api/health.py`**
   - `readyz()` - Readiness probe endpoint (returns 503 when draining)
   - `healthz()` - Liveness probe endpoint (always returns 200)
   - `drain()` - Manual drain trigger endpoint
   - `metrics()` - Active connections and draining status

3. **`tests/test_graceful_shutdown.py`**
   - Test graceful shutdown manager functionality
   - Test health endpoints behavior
   - Test SSE connection tracking

4. **`tests/test_health_api.py`**
   - Test health API endpoints
   - Test readiness probe behavior during draining

### Files to Modify

1. **`app/api/tasks.py`**
   - Modify `stream_task_progress()`:
     - Add connection tracking with try/finally
     - Add `X-Accel-Buffering: no` header

2. **`app/services/task_service.py`**
   - Modify `start_task()`:
     - Check if draining before starting new tasks
     - Return error if draining
   - Modify `cleanup_completed_tasks()`:
     - Skip cleanup during draining
   - Add `shutdown()`:
     - Stop executor gracefully
     - Wait for running tasks

3. **`run.py`**
   - Add signal handler registration in `main()`
   - Register shutdown manager with app context
   - Add cleanup hooks for Waitress server

4. **`app/api/__init__.py`**
   - Register new health blueprint
   - Update API initialization

5. **`app/services/container.py`**
   - Add `graceful_shutdown_manager` as singleton provider
   - Wire to health and tasks modules

## Step-by-Step Algorithm

### 1. Connection Tracking Algorithm
```
When SSE connection starts:
  1. Increment active connection counter (thread-safe)
  2. Start streaming events
  4. On connection close (finally block):
     - Decrement active connection counter
     - Signal waiting threads if counter reaches 0
```

### 2. Graceful Shutdown Sequence
```
On SIGTERM signal:
  1. Set DRAINING flag to True
  2. Readiness probe starts returning 503
  3. Kubernetes removes pod from service endpoints
  4. Wait for active_connections to reach 0
     - Check every 1 second
     - Maximum wait: terminationGracePeriodSeconds
  5. Stop task executor
  6. Wait for running tasks to complete
  7. Clean shutdown
```

### 3. Health Check Logic
```
Readiness endpoint (/readyz):
  If DRAINING == True:
    Return 503 "draining"
  Else:
    Return 200 "ok"

Liveness endpoint (/healthz):
  Always return 200 "alive"
  (Keeps pod alive during draining)
```

### 4. Task Service Draining
```
When starting new task:
  1. Check if draining
     - If draining: raise InvalidOperationException
  2. Check executor capacity
  3. Submit task to executor
  4. Return task ID and stream URL
```

## Implementation Phases

### Phase 1: Core Shutdown Infrastructure
- Create `GracefulShutdownManager` class
- Add signal handling to `run.py`
- Implement basic draining state management

### Phase 2: Health Endpoints
- Create health blueprint with readyz/healthz endpoints
- Add drain endpoint for manual triggering
- Wire health endpoints to shutdown manager

### Phase 3: SSE Connection Tracking
- Modify `stream_task_progress()` to track connections
- Add connection counting to shutdown manager
- Implement wait logic for active streams

### Phase 4: Task Service Integration
- Add draining checks to task service
- Implement graceful executor shutdown
- Handle in-flight tasks during shutdown

### Phase 5: Kubernetes Deployment
- Create deployment manifest with proper grace period