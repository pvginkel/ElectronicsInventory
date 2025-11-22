# SSE Gateway Integration — Change Brief

## Functional Description

Replace the existing Python-based Server-Sent Events (SSE) implementation with SSE Gateway, a Node.js sidecar service that manages SSE connection lifecycle. The current implementation suffers from two critical issues:

1. **Thread exhaustion**: Each SSE connection holds a Python thread, risking thread pool exhaustion under load
2. **Connection lingering**: WSGI doesn't expose client disconnects, causing connections to linger until timeout

## What Changes

**Architecture shift**: Move from Python generators serving SSE directly to a callback-based pattern where:
- SSE Gateway (Node.js sidecar) owns all SSE connections and lifecycle
- Python backend receives HTTP callbacks when clients connect/disconnect
- Python backend sends events via HTTP POST to SSE Gateway's `/internal/send` endpoint
- SSE Gateway handles all SSE formatting, heartbeats, and connection management

**Endpoints affected**:
- Remove: `GET /api/tasks/{task_id}/stream` (old Python SSE endpoint)
- Remove: `GET /api/utils/version/stream?request_id=?` (old Python SSE endpoint)
- Add: `GET /api/sse/tasks?task_id=?` (new SSE endpoint via SSE Gateway)
- Add: `GET /api/sse/utils/version?request_id=?` (new SSE endpoint via SSE Gateway)
- Add: `POST /api/sse/callback` (receives connect/disconnect notifications from SSE Gateway)

**Services refactored**:
- **TaskService**: Replace event queues with HTTP calls to SSE Gateway
- **VersionService**: Preserve the core functionality and testing support

**No backwards compatibility**: A clean implementation of the new infrastructure is desired. Breaking changes for the frontend and infrastructure are allowed and will be synchronized.

## Architecture Pattern

**Three-layer delegation:**

1. **Flask endpoint** (`/api/sse/callback`) - Receives callbacks, routes to appropriate service based on URL pattern
2. **Service layer** (TaskService/VersionService) - Extracts service-specific identifier (task_id/request_id), handles business logic, delegates connection tracking to ConnectionManager
3. **ConnectionManager** - Maintains token mappings, handles connection lifecycle and replacement, provides event sending interface

**Protocol interface** (for TaskService/VersionService):
```python
def on_connect(callback_request: DTO) -> CallbackResponseDTO
def on_disconnect(callback_request: DTO) -> None
```

**Connection lifecycle:**
- Services extract their own identifier (task_id from query param, request_id from query param)
- Services call `connection_manager.on_connect(callback_request, service_identifier)`
- ConnectionManager stores mapping: `service_identifier → gateway_token`
- On reconnect with same service_identifier: ConnectionManager closes old gateway connection first, then registers new one
- Services never see gateway tokens; they only work with their own identifiers

**Event sending:**
- Services call `connection_manager.send_event(service_identifier, event_data)`
- ConnectionManager translates service_identifier → gateway_token and forwards to SSE Gateway
- Multiple clients can connect to same resource (task_id/request_id); only latest connection is tracked (previous is closed)

**Service responsibilities:**
- TaskService: Track connections per task_id, maintain event queues, send task completion/progress events
- VersionService: Track connections per request_id (from query param), maintain pending events queue for events sent before connection established, support testing endpoint that triggers version notifications

## Why This Matters

- **Scalability**: Frees Python threads from blocking on long-lived SSE connections
- **Reliability**: Proper disconnect detection prevents resource leaks
- **Testing**: Clear HTTP contracts make testing more deterministic

## Testing Approach

Three-tier strategy:
1. **Unit tests** with mocked SSE Gateway (fast, isolated)
2. **Integration tests** with real SSE Gateway, HTTP-only validation (catches contract bugs)
3. **E2E tests** with full SSE streaming in Playwright (validates complete flows)

## Deployment Requirements

- SSE Gateway deployed as sidecar alongside Python backend. Production deployment is out of scope of this plan.
- Configuration via environment variables (SSE_CALLBACK_SECRET).
- Frontend reverse proxy updated to route SSE requests to SSE Gateway.
- Testing infrastructure updated to manage SSE Gateway lifecycle.

## Notes for implementation

- The callback endpoint needs to be authenticated. A secret will be passed in through a query string parameter called "secret". The value for this will be set in the SSE_CALLBACK_SECRET environment variable. It's only required in production mode. This is just a plain string and can be implemented using a simple string match. This service will not be exposed to the public internet.
- Specs for the SSE Gateway are available in ../ssegateway/README.md.
- The SSE Gateway can be run using ../ssegateway/scripts/run-gateway.sh.
- The first and second testing tier, Unit tests and Integration tests, **MUST** be delivered together with the implementation. It cannot be delayed to a second phase. Preparation work for the integration tests with the real SSE Gateway was done in a predecessor. See docs/features/sse_baseline_tests/plan.md for the plan. This new suite needs to be adjusted to work with the SSE Gateway.
- Don't retry calls to the SSE Gateway. The service is a sidecar. It should be available always. Log failed calls as errors. The TaskService and VersionService internal queueing (per task_id and request_id respectively) must be preserved.
- Concerning Prometheus metrics defer to the plan designer for a steer on what metrics should be introduced.
- Don't implement graceful shutdown. Assume the service shuts down with the app (it's a sidecar in Kubernetes). All clients will be disconnected anyway.
