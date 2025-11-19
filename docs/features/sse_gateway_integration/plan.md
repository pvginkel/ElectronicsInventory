# SSE Gateway Integration — Technical Plan

## 0) Research Log & Findings

### Research Areas

**Current SSE Implementation (app/utils/sse_utils.py, app/api/tasks.py, app/api/utils.py)**
- Flask's WSGI interface handles SSE connections directly in Python via generator functions
- Two SSE endpoints exist: `/api/tasks/<task_id>/stream` for task progress, `/api/utils/version/stream` for version notifications
- `TaskService` uses in-memory queues to buffer events for SSE subscribers
- `VersionService` manages SSE subscriber lifecycle with in-memory queues and background cleanup
- Both services implement heartbeat mechanisms (5s dev, 30s prod) to keep connections alive
- SSE utilities (`format_sse_event`, `create_sse_response`) provide formatting and Response creation

**Key Problems Identified**
1. WSGI doesn't expose client disconnects → connections linger in Python until timeout
2. Each SSE connection holds a Python thread → thread pool exhaustion risk
3. Both TaskService and VersionService implement bespoke queue management and cleanup logic

**SSE Gateway Architecture (from /work/ssegateway/README.md)**
- Node.js sidecar that owns SSE connection lifecycle
- Callback-based coordination: Python backend receives `connect`/`disconnect` callbacks via HTTP POST to `CALLBACK_URL`
- **NEW: Immediate callback responses** - Python can send events or close connections directly in callback response body (optional)
- Python sends events via `POST /internal/send` with connection token (alternative to callback response)
- Universal path support: accepts SSE on any path, forwards full URL to backend for routing decisions
- In-memory only, single-process design with immediate flushing
- Backwards compatible: empty callback response body works as before

**Testing Infrastructure (scripts/testing-server.sh, tests/conftest.py)**
- `testing-server.sh` starts Flask dev server for Playwright UI test suite
- Script accepts `--port` flag to specify Flask port
- No existing multi-process or sidecar orchestration in script
- Pytest unit tests use in-memory SQLite with session-scoped template connection

**Dependency Injection (app/services/container.py, app/__init__.py)**
- ServiceContainer wires services to API modules via `dependency-injector`
- TaskService and VersionService are singletons (in-memory state)
- Container wired to 16 API modules including `app.api.tasks` and `app.api.utils`

### Special Findings & Conflicts

**1. No Backwards Compatibility Required**
User explicitly stated: "Gut existing SSE implementation - No backwards compatibility needed." This simplifies the refactor significantly—no migration path, no dual support.

**2. Test Infrastructure Strategy**
Testing approach clarified by user:
- **Pytest unit tests**: No SSE Gateway; use mocks only for fast, isolated testing
- **Playwright UI tests**: Real SSE Gateway managed by `testing-server.sh`
- `testing-server.sh` encapsulates SSE Gateway lifecycle (frontend doesn't manage it)
- Script needs new `--sse-gateway-port` flag for predictable port (Vite reverse proxy)
- Script needs `--port` renamed to `--app-port` for clarity
- Script needs new `--sse-gateway-path` argument and/or `SSE_GATEWAY_PATH` env var to specify location of SSE Gateway source (supports both)
- Script runs `npm install && npm run build` in SSE Gateway path, then start/stop process
- Script sets `CALLBACK_URL` env var pointing to Flask backend (for dev/test, secret parameter is optional: `/api/sse/callback` or `/api/sse/callback?secret=test-secret`)

Frontend will configure Vite reverse proxy routes to SSE Gateway, but lifecycle management stays in `testing-server.sh`.

**3. SSE Gateway Path Routing**
SSE Gateway accepts connections on any path and forwards the raw URL to Python's callback endpoint. This means Python must parse the path (`/api/tasks/{id}/stream`, `/api/utils/version/stream`) from the callback payload and route to the correct handler (TaskService vs VersionService).

**4. Connection Lifecycle Coordination**
Current services register/unregister subscribers synchronously. With SSE Gateway, lifecycle becomes:
1. Client connects → SSE Gateway calls `POST /sse/callback` (action: connect)
2. Python validates, returns 200/non-2xx
3. Python sends events via `POST /internal/send` using the token
4. Client disconnects → SSE Gateway calls `POST /sse/callback` (action: disconnect)
5. App shutdown → SSE Gateway dies as sidecar (no explicit close events needed)

This requires a new "SSE coordinator" to map incoming callback requests to TaskService/VersionService based on path.

**5. Metrics Service Integration**
Both TaskService and VersionService already integrate with MetricsService. New SSE metrics should track:
- Active SSE connections (task streams only; version streams not tracked)
- Callback success/failure rates
- Event send success/failure rates

**6. VersionService Massive Simplification (SSE Gateway Feature Implemented)**
SSE Gateway now supports **immediate callback responses** (git diff HEAD^ README.md shows the implementation). Python can include optional JSON body in callback response: `{"event": {...}, "close": true}`. This enables a radically simplified VersionService design:

Key SSE Gateway implementation details:
- Optional response body in connect callback: `{"event": {"name": "...", "data": "..."}, "close": true}`
- Empty body or no body: connection proceeds normally (backwards compatible)
- Invalid JSON: logged and ignored, connection proceeds (graceful degradation)
- Both event + close: event sent first, then connection closes
- Disconnect callback response bodies: logged at WARN level, cannot apply actions (connection already closing)

VersionService design enabled by this feature:
- On connect callback: return `{"event": {"name": "version_info", "data": "{...}"}}` in response body, don't track connection
- No subscriber management, no idle timeout, no background cleanup thread
- Stateless service: just retrieve version info on demand
- Connections stay open (SSE Gateway handles heartbeats), but Python ignores them
- On redeploy: pod dies, SSE Gateway dies, connections close, clients reconnect and get new version automatically

This eliminates ~90% of VersionService complexity.

---

## 1) Intent & Scope

**User intent**

Replace the synchronous Python SSE implementation (which suffers from thread exhaustion and connection lingering) with SSE Gateway, a Node.js sidecar that owns connection lifecycle while Python handles business logic via HTTP callbacks. This refactor eliminates WSGI's disconnect-blindness and frees Python threads from blocking on long-lived connections.

**Prompt quotes**

"Gut existing SSE implementation - No backwards compatibility needed"
"WSGI interface doesn't expose disconnects, so connections linger"
"Sync Python connections clog up the thread pool"
"Python backend receives callbacks for connect/disconnect events"
"Python sends events via POST /internal/send endpoint"
"Easiest is maybe to tell the testing-server.sh script where the source code of the SSE Gateway is and have it start and stop it"

**In scope**

- Remove all existing SSE implementation code (app/utils/sse_utils.py, SSE endpoints in app/api/tasks.py and app/api/utils.py, SSE-related logic in TaskService and VersionService)
- Create new SSE callback endpoint (`POST /api/sse/callback?secret={secret}`) that receives connect/disconnect notifications from SSE Gateway
- Implement callback authentication via SSE_CALLBACK_SECRET env var (mandatory in production, optional in dev/test)
- Implement SSE coordinator service to route callbacks to TaskService or VersionService based on URL path
- Add HTTP client integration to send events to SSE Gateway's `/internal/send` endpoint
- Refactor TaskService to send events via HTTP instead of generator queues
- Refactor VersionService to send events via HTTP instead of generator queues
- Update testing infrastructure (testing-server.sh) to start/stop SSE Gateway for Playwright UI tests
- Add SSE Gateway configuration (CALLBACK_URL, SSE_GATEWAY_INTERNAL_URL, SSE_CALLBACK_SECRET) to Settings
- Wire new SSE callback API to dependency injection container
- Add comprehensive three-tier testing strategy:
  - Tier 1: Pure unit tests with mocked SSEGatewayClient (fast, isolated)
  - Tier 2: Simplified integration tests using `responses` library (validates contracts without complex test doubles)
  - Tier 3: E2E tests with real SSE Gateway in Playwright (full stack validation; primary SSE flow validation)

**Out of scope**

- Backwards compatibility with old SSE endpoints (explicitly excluded)
- Clustering or multi-instance SSE Gateway (single-process design per README)
- SSE Gateway code changes (treat as external dependency)
- Migration path for existing SSE clients (breaking change)
- Persistent event storage (SSE Gateway is in-memory only)

**Assumptions / constraints**

- SSE Gateway runs as a sidecar accessible via HTTP (localhost in dev/test, network service in production)
- SSE Gateway version is compatible with callback/send API described in README
- Python backend has network access to SSE Gateway on port 3000 (configurable)
- Test suite can spawn Node.js processes (npm/node available in Playwright environment)
- SSE Gateway source path is configurable via `--sse-gateway-path` argument or `SSE_GATEWAY_PATH` env var (testing-server.sh supports both)
- Connection tokens from SSE Gateway are unique and opaque (no schema assumptions)
- Event ordering is preserved per-connection (SSE Gateway design principle)
- SSE Gateway dies with Python app (sidecar pattern; no graceful close events needed on shutdown)
- SSE_CALLBACK_SECRET env var is set in production (mandatory); optional in dev/test for ease of development
- SSE Gateway CALLBACK_URL includes secret query parameter in production: `/api/sse/callback?secret={SSE_CALLBACK_SECRET}`
- Helm chart configuration manages both SSE_CALLBACK_SECRET env var (for Python backend) and CALLBACK_URL env var (for SSE Gateway sidecar)

---

## 2) Affected Areas & File Map

### Files to DELETE

- Area: `app/utils/sse_utils.py`
- Why: SSE formatting and response creation no longer needed (SSE Gateway handles formatting)
- Evidence: `app/utils/sse_utils.py:10-47` — `format_sse_event()` and `create_sse_response()` only used by old SSE endpoints

- Area: `app/api/tasks.py:14-69`
- Why: Remove SSE streaming endpoint (`GET /tasks/<task_id>/stream`)
- Evidence: `app/api/tasks.py:14-69` — `get_task_stream()` function generates SSE events via Python generator

- Area: `app/api/utils.py:20-122`
- Why: Remove SSE streaming endpoint (`GET /utils/version/stream`)
- Evidence: `app/api/utils.py:20-122` — `version_stream()` function generates SSE events with heartbeats

### Files to MODIFY

- Area: `app/services/task_service.py`
- Why: Replace event queue mechanism with HTTP calls to SSE Gateway
- Evidence: `app/services/task_service.py:94` — `_event_queues: dict[str, Queue]` stores per-task queues; `app/services/task_service.py:212-249` — `get_task_events()` blocks on queue reads

- Area: `app/services/version_service.py`
- Why: Massively simplify to stateless design; remove all subscriber tracking, idle timeout, background cleanup; only return current version in connect callback response; ensure version data is JSON-serializable
- Evidence: `app/services/version_service.py:30` — `_subscribers: dict[str, Queue[VersionEvent]]` stores queues (remove); user requirement: "respond with the version content and ignore the connection"; plan review: must return JSON-serializable dict (no datetime objects, use ISO strings)

- Area: `app/config.py`
- Why: Add SSE Gateway configuration (CALLBACK_URL for Gateway to call, SSE_GATEWAY_INTERNAL_URL for Python to send events, SSE_CALLBACK_SECRET for authentication)
- Evidence: `app/config.py:171-174` — SSE_HEARTBEAT_INTERVAL already exists; need to add SSE Gateway URLs and callback secret (mandatory in production, optional in dev/test)

- Area: `app/services/container.py`
- Why: Wire new SSE callback API and SSE client service to container
- Evidence: `app/services/container.py:68` — `container.wire(modules=wire_modules)` must include new `app.api.sse_callback` module

- Area: `app/__init__.py`
- Why: Add `app.api.sse_callback` to wire_modules list
- Evidence: `app/__init__.py:60-66` — `wire_modules` list includes all API modules

- Area: `scripts/testing-server.sh`
- Why: Start/stop SSE Gateway alongside Flask server for Playwright UI tests; add `--sse-gateway-port` flag; rename `--port` to `--app-port`; add `--sse-gateway-path` argument and `SSE_GATEWAY_PATH` env var support
- Evidence: `scripts/testing-server.sh:1-88` — Currently only starts Flask; needs to spawn SSE Gateway process with configurable path and port

- Area: `tests/conftest.py`
- Why: Add mock fixtures for SSEGatewayClient (unit tests don't run real SSE Gateway)
- Evidence: `tests/conftest.py:80-100` — Session-scoped fixtures create app/db; similar pattern for mock SSEGatewayClient

### Files to CREATE

- Area: `app/api/sse_callback.py`
- Why: New API endpoint to receive connect/disconnect callbacks from SSE Gateway
- Evidence: User requirement "Backend needs to implement callback endpoint that SSE Gateway calls"

- Area: `app/services/sse_coordinator_service.py`
- Why: Route callback requests to appropriate service (TaskService vs VersionService) based on URL path; track task stream connections; periodic cleanup of stale tokens
- Evidence: SSE Gateway README shows path forwarding; need routing logic for `/api/tasks/{id}/stream` vs `/api/utils/version/stream`; background thread to sweep stale tokens every 10 minutes (prevent memory leak from lost disconnect callbacks)

- Area: `app/services/sse_gateway_client.py`
- Why: HTTP client wrapper for calling SSE Gateway's `/internal/send` endpoint
- Evidence: User requirement "Backend needs HTTP client to call SSE Gateway's /internal/send endpoint"

- Area: `app/schemas/sse_schema.py`
- Why: Pydantic schemas for SSE Gateway callback payloads and callback responses
- Evidence: SSE Gateway README shows callback/send JSON structures
- Schemas to create:
  - `SSECallbackRequestSchema` - incoming callback from SSE Gateway (action, token, request with url/headers, optional reason)
  - `SSECallbackEventSchema` - event structure for callback response (name, data)
  - `SSECallbackResponseSchema` - outgoing callback response (optional event, optional close flag)
  - These schemas validate both incoming requests from SSE Gateway and outgoing responses from Python

- Area: `tests/api/test_sse_callback.py`
- Why: Test callback endpoint with connect/disconnect scenarios
- Evidence: Definition of done requires API tests for all endpoints

- Area: `tests/test_sse_coordinator_service.py`
- Why: Test routing logic from URL paths to services
- Evidence: Definition of done requires service tests

- Area: `tests/test_sse_gateway_client.py`
- Why: Test HTTP client integration with SSE Gateway
- Evidence: Definition of done requires service tests

- Area: Frontend Playwright tests (out of scope for this plan)
- Why: End-to-end SSE Gateway testing happens in Playwright UI tests, not pytest
- Evidence: User clarification: "testing-server.sh is for the UI Playwright test suite"

---

## 3) Data Model / Contracts

- Entity / contract: SSE callback request (connect action)
- Shape:
  ```json
  {
    "action": "connect",
    "token": "550e8400-e29b-41d4-a716-446655440000",
    "request": {
      "url": "/api/tasks/abc123/stream",
      "headers": {
        "user-agent": "curl/7.68.0",
        "authorization": "Bearer ...",
        ...
      }
    }
  }
  ```
  Callback URL includes secret in query string: `POST /api/sse/callback?secret={SSE_CALLBACK_SECRET}`
- Refactor strategy: No back-compat; authentication required in production via SSE_CALLBACK_SECRET env var (optional in dev/test); secret passed as query parameter
- Evidence: `/work/ssegateway/README.md:101-113` — connect callback payload structure; user requirement: "expect it in the callback query string"

---

- Entity / contract: SSE callback request (disconnect action)
- Shape:
  ```json
  {
    "action": "disconnect",
    "reason": "client_closed" | "server_closed" | "error",
    "token": "550e8400-e29b-41d4-a716-446655440000",
    "request": {
      "url": "/api/tasks/abc123/stream",
      "headers": { ... }
    }
  }
  ```
- Refactor strategy: No back-compat needed
- Evidence: `/work/ssegateway/README.md:196-207` — disconnect callback with reason field

---

- Entity / contract: SSE send request (Python → SSE Gateway)
- Shape:
  ```json
  {
    "token": "550e8400-e29b-41d4-a716-446655440000",
    "event": {
      "name": "task_event",
      "data": "{\"event_type\": \"progress_update\", ...}"
    },
    "close": false
  }
  ```
- Refactor strategy: Event data must be JSON string (SSE Gateway expects string, not dict)
- Evidence: `/work/ssegateway/README.md:121-138` — send endpoint payload with event.data as string

---

- Entity / contract: SSE callback response (Python → SSE Gateway)
- Shape:
  ```
  HTTP 200: connection accepted, SSE stream stays open
  HTTP 40x/50x: connection rejected, SSE Gateway closes with same status

  Optional JSON body (for immediate events/close):
  {
    "event": {
      "name": "version_info",          // optional: SSE event name
      "data": "{\"version\": \"1.2.3\"}"  // required if event present: event data as string
    },
    "close": true                      // optional: close connection after sending event
  }

  Empty body {} or no body: connection proceeds normally
  Invalid JSON: logged and ignored, connection proceeds normally
  Both event + close: event sent first, then connection closes
  ```
- Refactor strategy: Task streams return empty body (will send events later via `/internal/send`); version streams return `{"event": {...}}` in callback response body and ignore connection afterward; backwards compatible design
- Evidence: `/work/ssegateway/README.md` git diff HEAD^ — new "Immediate Callback Responses" feature; "Optional response body" section lines 121-167; "Backwards compatible: Existing Python backends work unchanged"

---

- Entity / contract: Connection tracking state (in-memory, task streams only)
- Shape:
  ```python
  {
    "token": str,
    "url": str,
    "service_type": "task",  # Only task streams tracked; version streams ignored
    "resource_id": str,  # task_id
    "headers": dict[str, str]
  }
  ```
- Refactor strategy: New state structure in SSECoordinatorService for task streams only; version streams respond with initial message and don't track connection; replaces queue-based tracking
- Evidence: `app/services/task_service.py:94` — current `_event_queues` dict; user requirement: "When the connect callback is called [for version], respond with the version content and ignore the connection. Don't track it, don't close it, just ignore it."

---

## 4) API / Integration Surface

- Surface: `POST /api/sse/callback?secret={secret}`
- Inputs: Query parameter `secret` (required in production, optional in dev/test); JSON body with `action` ("connect"/"disconnect"), `token`, `request` (url, headers), optional `reason`
- Outputs:
  - HTTP 200 (accept connection); optional JSON body: `{"event": {"name": "...", "data": "..."}, "close": true}`
    - Empty body or no body: connection proceeds normally (task streams)
    - Body with `event`: immediate event sent to client (version streams)
    - Body with `close: true`: connection closes after event (optional)
    - Invalid JSON: logged by SSE Gateway, ignored, connection proceeds
  - HTTP 401 (unauthorized - secret mismatch or missing in production)
  - HTTP 404 (resource not found)
  - HTTP 400 (invalid payload)
- Errors: 401 if secret missing/incorrect in production; 400 if action unknown or payload malformed; 404 if URL doesn't match known SSE pattern; 500 on internal routing failure
- Evidence: `/work/ssegateway/README.md` git diff HEAD^ — "Optional response body" section; "Backwards compatible"; invalid JSON logged and ignored

---

- Surface: `POST {SSE_GATEWAY_INTERNAL_URL}/internal/send` (called by Python)
- Inputs: JSON with `token`, optional `event` (name, data), optional `close` flag
- Outputs: HTTP 200 (success), HTTP 404 (unknown token), HTTP 400 (invalid request)
- Errors: 404 if connection already closed; 400 if payload malformed; network errors if SSE Gateway unreachable
- Evidence: `/work/ssegateway/README.md:119-144` — send endpoint on SSE Gateway; Python must call this

---

- Surface: `DELETE /api/tasks/<task_id>/stream` (REMOVED)
- Inputs: N/A
- Outputs: N/A
- Errors: Endpoint no longer exists; clients must connect to SSE Gateway directly on same path
- Evidence: `app/api/tasks.py:14` — old SSE endpoint route; will be deleted

---

- Surface: `DELETE /api/utils/version/stream` (REMOVED)
- Inputs: N/A
- Outputs: N/A
- Errors: Endpoint no longer exists; clients must connect to SSE Gateway directly on same path
- Evidence: `app/api/utils.py:20` — old SSE endpoint route; will be deleted

---

- Surface: HTTP client calls from TaskService/VersionService to SSE Gateway
- Inputs: Connection token, event name/data, close flag
- Outputs: Success/failure of event send
- Errors: Network timeouts, SSE Gateway down, token expired/unknown
- Evidence: User requirement "Python sends events via POST /internal/send endpoint"

---

## 5) Algorithms & State Machines (step-by-step)

- Flow: SSE connection establishment (client connects via SSE Gateway)
- Steps:
  1. Client sends `GET /api/tasks/{task_id}/stream` to SSE Gateway
  2. SSE Gateway generates unique token (UUID)
  3. SSE Gateway calls `POST /api/sse/callback?secret={SSE_CALLBACK_SECRET}` with action="connect", token, url="/api/tasks/{task_id}/stream"
  4. Python callback endpoint validates secret (return 401 if missing/incorrect in production; optional in dev/test)
  5. Python callback endpoint parses URL, extracts task_id
  6. SSECoordinatorService routes to TaskService based on path pattern
  7. TaskService validates task_id exists (call `get_task_status`)
  8. If task not found, return HTTP 404 → SSE Gateway closes connection with 404
  9. If task exists, TaskService stores (token → task_id) mapping, return HTTP 200
  10. SSE Gateway keeps connection open, sends initial SSE headers to client
  11. TaskService sends "connection_open" event via SSEGatewayClient
- States / transitions: Connection state: PENDING (before callback) → AUTHENTICATED (secret valid) → ACCEPTED (200 response) | REJECTED (401/404/non-200 response)
- Hotspots: Callback latency must be <100ms to avoid SSE Gateway timeout; task_id validation requires DB query; constant-time secret comparison to prevent timing attacks
- Evidence: `/work/ssegateway/README.md:88-115` — connection flow; `app/api/tasks.py:32` — current task validation logic; user requirement for authentication

---

- Flow: Sending task progress events
- Steps:
  1. Background task executes, calls `progress_handle.send_progress(text, value)`
  2. TaskProgressHandle constructs event payload (dict)
  3. TaskProgressHandle looks up connection token from task_id
  4. TaskProgressHandle calls `SSEGatewayClient.send_event(token, event_name, event_data)`
  5. SSEGatewayClient JSON-encodes event_data (converts dict to string)
  6. SSEGatewayClient POSTs to `/internal/send` with token, event name, data
  7. SSE Gateway formats as SSE event and writes to client connection
  8. On network error or 404, TaskProgressHandle logs warning and continues (best-effort)
- States / transitions: No state machine; fire-and-forget event delivery
- Hotspots: Event send must not block task execution; use short timeout (1-2s) and fire-and-forget on failure
- Evidence: `app/services/task_service.py:52-64` — current `_send_progress_event()` queues events; new version HTTP POSTs

---

- Flow: Version stream connection (simplified, stateless)
- Steps:
  1. Client sends `GET /api/utils/version/stream` to SSE Gateway
  2. SSE Gateway generates unique token (UUID)
  3. SSE Gateway calls `POST /api/sse/callback?secret={SSE_CALLBACK_SECRET}` with action="connect", token, url="/api/utils/version/stream"
  4. Python callback endpoint validates secret, routes to VersionService
  5. VersionService retrieves current version info (no connection tracking)
  6. Callback handler returns HTTP 200 with JSON body: `{"event": {"name": "version_info", "data": "{...}"}}`
  7. SSE Gateway receives callback response, immediately sends event to client
  8. Connection stays open indefinitely (SSE Gateway handles heartbeats)
  9. No further events sent; Python backend ignores this connection completely
  10. When app redeploys, pod dies, SSE Gateway dies, connections close
  11. Client reconnects, callback handler returns current version, client sees new version
- States / transitions: No state tracking; stateless request-response for version info
- Hotspots: Version retrieval must be fast (<10ms); callback response body must be valid JSON (invalid JSON logged by SSE Gateway, connection proceeds but no event sent)
- Evidence: User requirement: "respond with the version content and ignore the connection"; SSE Gateway README git diff HEAD^ — "Optional response body" with event field; "If both event and close are present: Event is sent first, then connection closes"

---

- Flow: SSE connection disconnect
- Steps:
  1. Client closes connection OR Python sends close=true (via `/internal/send` or callback response) OR SSE Gateway detects write error
  2. SSE Gateway calls `POST /api/sse/callback` with action="disconnect", token, reason ("client_closed", "server_closed", or "error")
  3. Python callback endpoint routes to SSECoordinatorService
  4. SSECoordinatorService looks up token (only task streams tracked; version streams ignored)
  5. If task stream: remove (token → task_id) mapping, perform cleanup
  6. If version stream or unknown token: no-op (idempotent)
  7. Return HTTP 200 to acknowledge disconnect (response body ignored; any event/close in response logged at WARN level by SSE Gateway)
- States / transitions: Task stream: ACTIVE → DISCONNECTED; Version stream: no state (connections ignored)
- Hotspots: Disconnect callbacks fire asynchronously; cleanup must be idempotent (may receive duplicate disconnect or disconnect for untracked version stream); disconnect callback response bodies cannot apply actions (connection already closing)
- Evidence: SSE Gateway README git diff HEAD^ — "Disconnect Reasons" includes server_closed via callback response; "Disconnect callbacks can also include a response body...but these are informational only and cannot be applied...logged at WARN level"

---

- Flow: Graceful shutdown with active SSE connections
- Steps:
  1. ShutdownCoordinator triggers PREPARE_SHUTDOWN event
  2. SSECoordinatorService sets shutdown flag, stops accepting new connection callbacks
  3. SSECoordinatorService clears all connection mappings
  4. (SSE Gateway dies as sidecar; no need to send close events)
- States / transitions: Service state: RUNNING → STOPPED (no draining phase needed)
- Hotspots: No complexity; SSE Gateway shutdown is handled externally (sidecar dies with app)
- Evidence: User clarification: "SSE Gateway will die also"; sidecar pattern means coordinated shutdown

---

## 6) Derived State & Invariants

- Derived value: Active SSE connection count by type (task only; version not tracked)
  - Source: Unfiltered set of (token → task_id) mappings in SSECoordinatorService; version streams not tracked
  - Writes / cleanup: Incremented on task connect, decremented on task disconnect; version streams not counted (ignored after initial response)
  - Guards: Thread-safe access via RLock; cleanup on disconnect callback for task streams
  - Invariant: Task count never negative; count drops to zero on shutdown; version count always zero (not tracked)
  - Evidence: `app/services/metrics_service.py` — existing metrics infrastructure; new metric: `sse_connections_active{type="task"}` (no version type since not tracked)

---

- Derived value: Connection token → task_id mapping (task streams only)
  - Source: Unfiltered callback connect events for task streams (token from SSE Gateway, task_id from URL parsing); version streams not tracked
  - Writes / cleanup: Write on task connect callback; delete on task disconnect callback; flush all on shutdown; version stream connects/disconnects ignored
  - Guards: Lock-protected dict; disconnect must be idempotent (handle duplicate disconnect or version stream disconnect)
  - Invariant: Token uniqueness enforced by SSE Gateway; no token reuse; mapping cleared on SHUTDOWN event; version tokens never stored
  - Evidence: `app/services/task_service.py:94` — current `_event_queues` dict pattern; new pattern stores (token → task_id); user requirement: version streams ignored

---

- Derived value: Event send success/failure rate
  - Source: Unfiltered HTTP responses from SSE Gateway `/internal/send` endpoint
  - Writes / cleanup: Metrics counter incremented on each send attempt; labels: status (success/failure), type (task/version)
  - Guards: Best-effort event send with timeout; failures logged but don't block task execution
  - Invariant: Failure rate <5% under normal operation; >50% failure indicates SSE Gateway down
  - Evidence: `app/services/metrics_service.py` — counter pattern; new metric: `sse_events_sent_total{status, type}`

---

## 7) Consistency, Transactions & Concurrency

- Transaction scope: No database transactions for SSE operations (in-memory state only)
- Atomic requirements: Connect callback validation (task exists) must read from DB session but not write; disconnect cleanup is in-memory only
- Retry / idempotency: Disconnect callbacks are idempotent (removing missing token is no-op); event sends are fire-and-forget (no retries)
- Ordering / concurrency controls: RLock protects connection mapping dict; event sends from multiple threads are serialized per-connection by SSE Gateway
- Evidence: `app/services/version_service.py:29` — `_lock = threading.RLock()` pattern; new SSECoordinatorService follows same

---

## 8) Errors & Edge Cases

- Failure: SSE Gateway unreachable during event send
- Surface: TaskService or VersionService (when sending events)
- Handling: Log warning, continue task execution; no retry; connection will timeout naturally
- Guardrails: HTTP client timeout (2s); metrics counter for send failures; alert if failure rate >10%
- Evidence: `app/services/task_service.py:59-64` — current queue.put handles failures gracefully; new HTTP client must do same

---

- Failure: Connect callback receives URL for nonexistent task
- Surface: Callback endpoint (`POST /api/sse/callback`)
- Handling: Return HTTP 404; SSE Gateway closes connection with same status
- Guardrails: TaskService.get_task_status() check before accepting connection
- Evidence: `app/api/tasks.py:32-37` — current task existence check; must move to callback handler

---

- Failure: Disconnect callback arrives before connect callback completes
- Surface: SSECoordinatorService
- Handling: Disconnect for unknown token is logged and ignored (idempotent no-op)
- Guardrails: Token lookup returns None gracefully; metrics counter for orphaned disconnects
- Evidence: Race condition possible if network delays vary; coordinator must handle

---

- Failure: Callback endpoint receives malformed JSON (request body)
- Surface: Callback endpoint (`POST /api/sse/callback`)
- Handling: Return HTTP 400; log error with request body for debugging
- Guardrails: Pydantic schema validation; @handle_api_errors decorator converts ValidationError to 400
- Evidence: `app/utils/error_handling.py` — standard error handling pattern

---

- Failure: Callback response body contains invalid JSON or malformed structure
- Surface: Callback endpoint (`POST /api/sse/callback`) response body
- Handling: SSE Gateway logs error and ignores response body; connection proceeds normally (backwards compatible behavior)
- Guardrails: SSE Gateway validates response JSON; Python should still send valid JSON but failures are graceful
- Evidence: SSE Gateway README git diff HEAD^ — "Invalid JSON or malformed structures: Logged and ignored, connection proceeds normally"

---

- Failure: Callback authentication failure (secret missing or incorrect)
- Surface: Callback endpoint (`POST /api/sse/callback?secret={secret}`)
- Handling: Return HTTP 401 in production (mandatory); log warning with IP address; in dev/test, accept missing secret
- Guardrails: SSE_CALLBACK_SECRET env var validated on startup (must be set in production); use `secrets.compare_digest()` for constant-time secret comparison (prevents timing attacks)
- Evidence: User requirement: "mandatory in production and optional in dev/test"; plan review: must use `secrets.compare_digest()` to prevent character-by-character brute-force attacks

---

- Failure: SSE Gateway dies mid-connection
- Surface: TaskService/VersionService (event sends start failing)
- Handling: Log send failures; task execution continues; client connections drop; reconnect on client side
- Guardrails: No recovery action in Python; SSE Gateway restart handled by orchestration (k8s, systemd)
- Evidence: SSE Gateway README states in-memory only; no persistence to recover from

---

- Failure: Python backend shutdown while SSE connections active
- Surface: ShutdownCoordinator, SSECoordinatorService
- Handling: Set shutdown flag to reject new connections; clear mappings; SSE Gateway dies as sidecar (no close events needed)
- Guardrails: Simple shutdown notification handler; metrics track active connections at shutdown
- Evidence: User clarification: "SSE Gateway will die also"; sidecar pattern simplifies shutdown

---

## 9) Observability / Telemetry

- Signal: `sse_connections_active`
- Type: Gauge
- Trigger: Updated on connect/disconnect callbacks from SSECoordinatorService
- Labels / fields: `type` (task, version)
- Consumer: Grafana dashboard; alert if task connections >100 (thread exhaustion risk indicator)
- Evidence: `app/services/metrics_service.py` — gauge pattern for active metrics

---

- Signal: `sse_events_sent_total`
- Type: Counter
- Trigger: Incremented on each HTTP POST to SSE Gateway `/internal/send`
- Labels / fields: `status` (success, failure), `type` (task, version)
- Consumer: Grafana dashboard; alert if failure rate >10%
- Evidence: `app/services/metrics_service.py` — counter pattern for operation totals

---

- Signal: `sse_callback_requests_total`
- Type: Counter
- Trigger: Incremented on each callback request received at `/api/sse/callback`
- Labels / fields: `action` (connect, disconnect), `status` (accepted, rejected), `type` (task, version)
- Consumer: Grafana dashboard; track connection churn rate
- Evidence: `app/services/metrics_service.py` — HTTP request metrics pattern

---

- Signal: `sse_gateway_client_errors_total`
- Type: Counter
- Trigger: Incremented on HTTP client errors (timeout, connection refused, 404 from SSE Gateway)
- Labels / fields: `error_type` (timeout, connection_error, not_found, bad_request)
- Consumer: Grafana dashboard; alert if error rate spikes (SSE Gateway health indicator)
- Evidence: `app/services/metrics_service.py` — error counter pattern

---

- Signal: Structured log on connect/disconnect
- Type: Structured log (JSON)
- Trigger: Each callback request processed
- Labels / fields: `action`, `token`, `url`, `status_code`, `duration_ms`, `auth_failed` (true if 401)
- Consumer: Log aggregation (ELK, Loki); debug connection lifecycle issues
- Evidence: `app/services/version_service.py:68-80` — existing debug logs for subscriber lifecycle

---

- Signal: `sse_callback_auth_failures_total`
- Type: Counter
- Trigger: Incremented on authentication failure (401 response from callback endpoint)
- Labels / fields: `reason` (missing_secret, invalid_secret)
- Consumer: Security monitoring; alert on auth failure spikes (potential spoofing attempts)
- Evidence: User requirement for callback authentication; security telemetry pattern

---

- Signal: `sse_callback_immediate_events_total`
- Type: Counter
- Trigger: Incremented when callback response includes event in response body (immediate events)
- Labels / fields: `type` (task, version), `status` (success, invalid_json)
- Consumer: Monitor version stream usage; track invalid JSON responses that SSE Gateway ignores
- Evidence: SSE Gateway immediate callback response feature; useful to track usage and errors

---

## 10) Background Work & Shutdown

- Worker / job: SSECoordinatorService background cleanup thread
- Trigger cadence: Every 10 minutes (sweeps stale task stream tokens)
- Responsibilities: Remove task stream tokens that haven't received disconnect callback due to network failures or lost messages; uses last-seen timestamp to identify stale connections (e.g., >30 minutes old)
- Shutdown handling: PREPARE_SHUTDOWN stops cleanup thread, sets flag to reject new connections; SHUTDOWN clears all mappings; no need to send close events (SSE Gateway dies as sidecar)
- Evidence: Risk identified in plan review — lost disconnect callbacks cause unbounded memory growth; background cleanup prevents leak; similar pattern to `app/services/version_service.py:141-175`

---

- Worker / job: SSE Gateway sidecar process (managed by testing-server.sh for Playwright tests)
- Trigger cadence: Startup-only (start with Flask, stop when Flask stops)
- Responsibilities: Manage SSE connections, forward callbacks, accept event sends; pytest unit tests don't run SSE Gateway (mocks only)
- Shutdown handling: SIGTERM to SSE Gateway process; 5s timeout before SIGKILL
- Evidence: User clarification: "testing-server.sh is for the UI Playwright test suite"; needs --sse-gateway-port flag and --port renamed to --app-port; `/work/ssegateway/README.md:84-87` — health endpoints

---

## 11) Security & Permissions

- Concern: Callback endpoint authentication (prevent unauthorized SSE Gateway spoofing)
- Touchpoints: `POST /api/sse/callback?secret={secret}` endpoint
- Mitigation: Shared secret via SSE_CALLBACK_SECRET env var; secret passed in callback URL query string; mandatory in production, optional in dev/test; use `secrets.compare_digest()` for constant-time comparison (prevents timing attacks that could brute-force secret character-by-character)
- Residual risk: Secret could leak via logs or network capture; acceptable for hobby project (use HTTPS in production); localhost binding in dev/test provides additional protection
- Evidence: User requirement: "create an environment variable...expect it in the callback query string...mandatory in production and optional in dev/test"; plan review: timing attacks without constant-time comparison

---

- Concern: DoS via connection flood
- Touchpoints: SSE Gateway connection handling, callback endpoint
- Mitigation: Not addressed (out of scope); app is not designed to be DoS-resistant; this change doesn't exacerbate existing vulnerabilities
- Residual risk: Connection floods can exhaust resources; acceptable for hobby project
- Evidence: User clarification: "I'm not worried about this. The app is very much not resilient against DoS attacks. This change doesn't exacerbate the issue."

---

## 12) UX / UI Impact

- Entry point: Frontend clients connecting to SSE streams
- Change: SSE connections routed through reverse proxies (Vite in dev, NGINX in production) to SSE Gateway; backend no longer serves SSE directly
- User interaction: No change from user perspective; same SSE event stream; same event names/data; URLs stay the same (e.g., `/api/tasks/{id}/stream`)
- Dependencies: Vite dev config and NGINX production config must add reverse proxy routes to SSE Gateway; testing-server.sh manages SSE Gateway lifecycle with predictable port
- Evidence: User clarification: "This will all be managed through reverse proxies, both in Vite and in NGINX in production"; SSE Gateway README architecture diagram

---

## 13) Deterministic Test Plan

**Three-Tier Testing Strategy**

To validate SSE Gateway integration without requiring Node.js in all test scenarios, we use a three-tier approach:

1. **Tier 1: Pure unit tests (mocked)** - Fast, isolated tests with fully mocked SSEGatewayClient; no HTTP calls
2. **Tier 2: Simplified integration tests** - Lightweight tests using standard pytest fixtures and `responses` library; validates basic contract shapes without complex test doubles
3. **Tier 3: End-to-end with real SSE Gateway (Playwright only)** - Full-stack UI tests with actual SSE Gateway sidecar; provides comprehensive validation of SSE flows

**Tier 2: Simplified Integration Testing Approach**

User clarification: "I fully believe that this functionality is sufficiently tested using the Playwright test suite. A simpler approach for unit testing I believe is acceptable."

Instead of building a complex FakeSSEGateway test double, use simpler pytest patterns:

**For callback endpoint testing:**
- Direct function calls to callback endpoint (not HTTP)
- Mock SSECoordinatorService and underlying services
- Validate Pydantic schema serialization/deserialization

**For SSEGatewayClient testing:**
- Use `responses` library to mock HTTP responses from `/internal/send` endpoint
- Test request format, error handling, timeouts
- No need for full HTTP server

**Benefits:**
- Simpler implementation (~50 lines vs ~400 lines)
- Faster test execution (no HTTP server threads)
- Adequate coverage for unit-level contract validation
- Full SSE flow validation happens in Playwright (Tier 3)

Example pattern:
```python
import responses

def test_sse_gateway_client_send_event():
    """Test SSEGatewayClient sends correct JSON to /internal/send"""

    @responses.activate
    def run_test():
        responses.add(
            responses.POST,
            "http://localhost:3000/internal/send",
            json={},
            status=200
        )

        client = SSEGatewayClient("http://localhost:3000")
        result = client.send_event("token123", "progress", {"value": 50})

        assert result is True
        assert len(responses.calls) == 1
        assert responses.calls[0].request.json() == {
            "token": "token123",
            "event": {"name": "progress", "data": '{"value": 50}'}
        }

    run_test()
```

**Test Coverage by Tier:**

---

### Tier 1: Pure Unit Tests (Mocked SSEGatewayClient)

- Surface: `POST /api/sse/callback?secret={secret}` (callback endpoint with mocked services)
- Tier: **Unit test** (mocked TaskService, VersionService)
- Scenarios:
  - Given SSE Gateway connects with valid task_id and correct secret, When callback action=connect, Then return 200 and store token mapping (no response body)
  - Given SSE Gateway connects with nonexistent task_id, When callback action=connect, Then return 404
  - Given valid task connection token, When callback action=disconnect, Then return 200 and remove token mapping
  - Given unknown token, When callback action=disconnect, Then return 200 (idempotent)
  - Given malformed JSON payload, When callback received, Then return 400
  - Given SSE Gateway connects to version stream, When callback action=connect, Then return 200 with JSON body containing initial version event (no tracking)
  - Given version stream disconnect, When callback action=disconnect, Then return 200 (no-op; not tracked)
  - Given shutdown initiated, When callback action=connect, Then return 503 (service unavailable)
  - Given production mode with missing secret, When callback received, Then return 401
  - Given production mode with incorrect secret, When callback received, Then return 401
  - Given dev/test mode with missing secret, When callback received, Then return 200 (authentication optional)
- Fixtures / hooks: Mock TaskService.get_task_status, Mock VersionService.get_version_info, SSECoordinatorService in container, Pydantic schema validation, SSE_CALLBACK_SECRET env var fixture
- Gaps: Real SSE Gateway integration deferred to Playwright tests
- Evidence: `tests/api/test_tasks.py` — API test pattern; new tests in `tests/api/test_sse_callback.py`

---

- Surface: SSECoordinatorService (routing and connection management)
- Tier: **Unit test** (pure service logic, mocked dependencies)
- Scenarios:
  - Given URL "/api/tasks/abc/stream", When route_callback called, Then return (TaskService, "abc") and store token mapping
  - Given URL "/api/utils/version/stream", When route_callback called, Then return (VersionService, None) with initial message response body (no token tracking)
  - Given URL "/unknown", When route_callback called, Then raise InvalidOperationException
  - Given task stream token stored, When lookup_connection called, Then return ("task", task_id)
  - Given version stream token or unknown token, When lookup_connection called, Then return None (version not tracked)
  - Given task disconnect, When handle_disconnect called, Then remove token mapping
  - Given version disconnect, When handle_disconnect called, Then no-op (not tracked)
  - Given shutdown initiated, When connect callback received, Then reject connection (return HTTP 503)
- Fixtures / hooks: SSECoordinatorService instance, mock TaskService/VersionService
- Gaps: None
- Evidence: `tests/test_task_service.py` — service test pattern; user requirement for version stream simplification

---

- Surface: SSEGatewayClient (HTTP client for /internal/send)
- Tier: **Unit test** (mocked HTTP requests library)
- Scenarios:
  - Given valid token, When send_event called, Then POST to /internal/send with correct JSON
  - Given SSE Gateway returns 200, When send_event called, Then return True
  - Given SSE Gateway returns 404, When send_event called, Then return False and log warning
  - Given SSE Gateway unreachable, When send_event called, Then return False after timeout
  - Given close=True, When send_event called, Then include close field in payload
  - Given event_data is dict, When send_event called, Then JSON-encode to string
- Fixtures / hooks: Mock requests library, SSEGatewayClient with test config
- Gaps: None
- Evidence: HTTP client test pattern (requests library usage)

---

- Surface: TaskService (refactored event sending)
- Tier: **Unit test** (mocked SSEGatewayClient)
- Scenarios:
  - Given task running, When progress_handle.send_progress called, Then send event via SSEGatewayClient
  - Given task completed, When task finishes, Then send task_completed event and close connection
  - Given task failed, When exception raised, Then send task_failed event
  - Given SSE Gateway unreachable, When send_event fails, Then log warning and continue task
  - Given shutdown initiated, When new task start requested, Then raise InvalidOperationException
  - Given shutdown initiated, When send_event called, Then reject (no need to send close events; SSE Gateway dies as sidecar)
- Fixtures / hooks: Mock SSEGatewayClient, TaskService with test config, DemoTask
- Gaps: None
- Evidence: `tests/test_task_service.py:17-315` — existing TaskService tests; refactor for HTTP client

---

- Surface: VersionService (massively simplified, stateless)
- Tier: **Unit test** (pure function, no mocks needed)
- Scenarios:
  - Given version service initialized, When get_version_info called, Then return current version dict
  - Given callback coordinator routes to VersionService, When handle_connect called, Then return version event data (no tracking)
  - Given disconnect callback for version stream, When handle_disconnect called, Then return success (no-op; connections not tracked)
  - Given shutdown initiated, When get_version_info called, Then still return version (stateless service)
- Fixtures / hooks: VersionService instance (no mocks needed; fully stateless)
- Gaps: No idle timeout, no subscriber tracking, no cleanup thread, no event queueing (all removed per user requirement)
- Evidence: User requirement: "respond with the version content and ignore the connection. Don't track it, don't close it, just ignore it."

---

### Tier 2: Simplified Integration Tests

- Surface: SSEGatewayClient HTTP request format
- Tier: **Integration test** (mocked HTTP with `responses` library)
- Scenarios:
  - Given valid token and event, When send_event called, Then POST to /internal/send with correct JSON structure
  - Given SSE Gateway returns 404, When send_event called, Then return False and log warning
  - Given SSE Gateway timeout, When send_event called, Then return False after timeout
  - Given event data as dict, When send_event called, Then JSON-encode data field to string
  - Given close=True, When send_event called, Then include close field in request body
- Fixtures / hooks: `responses` library to mock HTTP endpoint (add as dev dependency: `poetry add --group dev responses`), SSEGatewayClient with test config
- Gaps: None; validates request format without real HTTP server
- Evidence: Simpler approach per user: "I fully believe that this functionality is sufficiently tested using the Playwright test suite"

---

- Surface: Callback endpoint request/response schemas
- Tier: **Integration test** (direct function calls, no HTTP)
- Scenarios:
  - Given connect callback payload, When validated with Pydantic schema, Then parse action, token, request.url, request.headers
  - Given disconnect callback payload, When validated with Pydantic schema, Then parse action, token, reason
  - Given callback response with event, When serialized to JSON, Then includes event.name and event.data fields
  - Given callback response with invalid structure, When serialized, Then raise validation error
- Fixtures / hooks: Pydantic schema instances, test payloads from SSE Gateway README
- Gaps: None; validates schema contracts without HTTP overhead
- Evidence: Contract validation adequate at Pydantic level; full flow tested in Playwright

---

- Surface: Callback authentication logic
- Tier: **Integration test** (direct function calls)
- Scenarios:
  - Given production mode with correct secret, When validate_secret called, Then return True
  - Given production mode with incorrect secret, When validate_secret called, Then return False (uses secrets.compare_digest)
  - Given production mode with missing secret, When validate_secret called, Then return False
  - Given dev mode with missing secret, When validate_secret called, Then return True (authentication optional)
- Fixtures / hooks: Mock config with SSE_CALLBACK_SECRET, authentication helper function
- Gaps: None; validates authentication without HTTP
- Evidence: Security logic tested in isolation; full auth flow in Playwright

---

### Tier 3: End-to-End with Real SSE Gateway (Playwright Only)

- Surface: End-to-end SSE integration (Playwright UI tests, not pytest)
- Tier: **E2E test** (real SSE Gateway sidecar, frontend, backend)
- Scenarios:
  - Given SSE Gateway running, When client connects to task stream, Then receive connection_open event
  - Given task running, When task sends progress, Then client receives progress_update event
  - Given task completes, When task finishes, Then client receives task_completed and connection closes
  - Given client disconnects, When connection drops, Then Python receives disconnect callback
- Fixtures / hooks: SSE Gateway spawned by testing-server.sh; frontend Playwright tests exercise full stack
- Gaps: Backend pytest tests use mocks only; full SSE validation deferred to Playwright
- Evidence: User clarification: "testing-server.sh is for the UI Playwright test suite"; unit tests don't run SSE Gateway

---

## 14) Implementation Slices

- Slice: SSE callback infrastructure
- Goal: Implement callback endpoint and coordinator service without touching existing SSE
- Touches: `app/api/sse_callback.py`, `app/services/sse_coordinator_service.py`, `app/schemas/sse_schema.py`, `app/config.py` (add SSE_GATEWAY_INTERNAL_URL)
- Dependencies: None; can be developed and tested independently

---

- Slice: SSE Gateway client
- Goal: HTTP client for sending events to SSE Gateway
- Touches: `app/services/sse_gateway_client.py`, tests
- Dependencies: Slice 1 (config for SSE Gateway URL)

---

- Slice: Refactor TaskService
- Goal: Replace event queues with SSEGatewayClient calls
- Touches: `app/services/task_service.py`, remove `_event_queues`, update `TaskProgressHandle`, wire SSEGatewayClient
- Dependencies: Slice 2 (SSEGatewayClient implemented)

---

- Slice: Refactor VersionService (massive simplification)
- Goal: Convert to stateless service; remove all subscriber tracking, idle timeout, background cleanup thread; only return current version on connect callback
- Touches: `app/services/version_service.py` — remove `_subscribers`, `_pending_events`, `_lock`, `_cleanup_thread`, idle timeout logic; add simple `get_version_info()` method
- Dependencies: Slice 1 (callback infrastructure for returning initial message in response)

---

- Slice: Remove old SSE endpoints
- Goal: Delete old SSE implementation after new logic tested
- Touches: Delete `app/utils/sse_utils.py`, remove `get_task_stream` and `version_stream` endpoints, remove imports
- Dependencies: Slice 3, 4 (TaskService and VersionService refactored and tested)

---

- Slice: Testing infrastructure
- Goal: Create three-tier testing approach (unit/simplified integration/E2E)
- Touches:
  - `tests/conftest.py` — add mock SSEGatewayClient fixtures for Tier 1 unit tests
  - Update existing tests to use `responses` library for Tier 2 (simple HTTP mocking, no complex test doubles)
  - `scripts/testing-server.sh` — add --sse-gateway-port flag, rename --port to --app-port, add --sse-gateway-path argument and SSE_GATEWAY_PATH env var support, spawn SSE Gateway for Tier 3 Playwright tests
- Dependencies: Slice 5 (old SSE removed, new logic in place)
- Note: Simplified from original plan per user feedback; no FakeSSEGateway test double needed (~50 lines vs ~400 lines)

---

## 15) Risks & Open Questions

- Risk: SSE Gateway not available in Playwright test environment (Node.js missing)
- Impact: Playwright UI tests fail; frontend SSE testing blocked
- Mitigation: User will handle this externally
- Evidence: User clarification: "I'll take care of that"

---

- Risk: Event send latency if SSE Gateway under load
- Impact: Task progress updates delayed; perceived slowness
- Mitigation: Use short timeout (2s) for HTTP client; log slow sends; monitor p95 latency via metrics

---

- Risk: Connection token cleanup race (disconnect callback lost due to network)
- Impact: Token mappings leak in SSECoordinatorService memory for task streams (version streams don't track connections)
- Mitigation: Background cleanup thread sweeps stale tokens every 10 minutes for task streams only; version streams have no tracking

---

- Question: Should VersionService idle timeout logic be removed?
- Why it matters: SSE Gateway handles heartbeats; Python may not need idle cleanup
- Owner / follow-up: **RESOLVED** — YES, remove completely. VersionService design simplified: respond with current version in connect callback response, then ignore connection. No tracking, no cleanup, no idle timeout. When app redeploys, pod dies, SSE Gateway dies, clients reconnect automatically and get new version. SSE Gateway now supports initial message in connect callback response.

---

- Question: Where should SSE Gateway configuration live (env vars vs config file)?
- Why it matters: Testing infrastructure needs to set CALLBACK_URL dynamically
- Owner / follow-up: **RESOLVED** — SSE Gateway is designed to be configured via environment variables per its architecture (`CALLBACK_URL`, `PORT`, `HEARTBEAT_INTERVAL_SECONDS`). This is not a choice but how the service works. Testing-server.sh will set these env vars when spawning SSE Gateway.

---

- Question: Should callback endpoint require authentication token?
- Why it matters: Security posture in shared environments
- Owner / follow-up: **RESOLVED** — SSE_CALLBACK_SECRET env var with query string parameter; mandatory in production, optional in dev/test; constant-time comparison for security

---

## 16) Confidence

Confidence: High — SSE Gateway contract is well-documented; existing SSE services provide clear refactoring path; testing strategy addresses integration complexity; no ambiguous requirements after research.
