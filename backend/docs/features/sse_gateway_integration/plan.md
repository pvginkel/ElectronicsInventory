# SSE Gateway Integration — Technical Plan

## 0) Research Log & Findings

### Research Areas

**Current SSE Implementation**
- Examined `app/api/tasks.py:16-71` - Task stream endpoint using Python generators with `format_sse_event()` and `create_sse_response()`
- Examined `app/api/utils.py:23-125` - Version stream endpoint with similar SSE generator pattern
- Examined `app/services/task_service.py` - TaskService maintains `_event_queues: dict[str, Queue[TaskEvent]]` for per-task event delivery
- Examined `app/services/version_service.py` - VersionService maintains `_subscribers: dict[str, Queue[VersionEvent]]` for per-request_id event delivery and `_pending_events` for events sent before connection
- Both services use in-memory queues and thread-safe locks for event coordination
- Current implementation: Flask generators hold threads during long-lived connections

**SSE Gateway Architecture** (from `/work/ssegateway/README.md`)
- Node.js sidecar that owns SSE connection lifecycle
- Callback-based pattern: `POST $CALLBACK_URL` with `{"action": "connect", "token": "...", "request": {"url": "...", "headers": {...}}}`
- Python responds with 200 (accept) or non-2xx (reject), optionally including `{"event": {...}, "close": true}` in response body
- Python sends events via `POST /internal/send` with `{"token": "...", "event": {...}, "close": true}`
- Disconnect callback: `{"action": "disconnect", "reason": "...", "token": "...", "request": {...}}`
- Heartbeats managed by SSE Gateway (configured via `HEARTBEAT_INTERVAL_SECONDS`)

**Dependency Injection & Container** (from `app/services/container.py`)
- ServiceContainer uses `dependency-injector` with Factory and Singleton providers
- TaskService is Singleton (line 164-171) injected with `metrics_service` and `shutdown_coordinator`
- VersionService is Singleton (line 209-213) injected with `settings` and `shutdown_coordinator`
- API endpoints use `@inject` decorator with `Provide[ServiceContainer.service_name]`

**Testing Infrastructure** (from `docs/features/sse_baseline_tests/plan.md`)
- Existing SSE baseline tests use real Flask server with waitress in background thread
- SSEClient helper in `tests/integration/sse_client_helper.py` for parsing SSE streams
- Integration marker already defined in `pyproject.toml:107-116`
- Tests in `tests/integration/test_task_stream_baseline.py` and `tests/integration/test_version_stream_baseline.py`

**Metrics Infrastructure** (from `app/services/metrics_service.py`)
- MetricsServiceProtocol defines abstract methods for recording metrics
- Prometheus metrics use Counter, Gauge, Histogram from `prometheus_client`
- Existing task metrics: `record_task_execution(task_type, duration, status)`

### Special Findings & Conflicts

**1. Three-Layer Delegation Architecture**
The change brief specifies a three-layer delegation pattern:
- Layer 1: Flask endpoint (`/api/sse/callback`) receives callbacks, routes to appropriate service via URL pattern matching
- Layer 2: Service layer (TaskService/VersionService) extracts service-specific identifier, handles business logic
- Layer 3: ConnectionManager maintains token mappings, handles lifecycle, provides event sending

This architecture separates concerns: routing (API), business logic (Services), connection state (ConnectionManager).

**URL Routing Table:**
- `/api/sse/tasks?task_id=*` → TaskService.on_connect() / on_disconnect()
- `/api/sse/utils/version?request_id=*` → VersionService.on_connect() / on_disconnect()
- All other paths → 400 Bad Request with error message

Routing implemented via simple string prefix matching on `request["url"]` from callback payload.

**2. Service Identifier Extraction**
- TaskService: Extract `task_id` from query parameter in callback request URL
- VersionService: Extract `request_id` from query parameter in callback request URL
- Services delegate to ConnectionManager with their own identifier; ConnectionManager maps identifier → gateway token

**3. Connection Replacement Strategy**
Change brief specifies: "On reconnect with same service_identifier: ConnectionManager closes old gateway connection first, then registers new one"
This ensures only one active connection per task_id/request_id, preventing duplicate event delivery.

**4. Connection Identifier Safety**
Task IDs and request IDs in this codebase are UUIDs (e.g., "abc123-def456..."). ConnectionManager prefixes these with service type ("task:" or "version:") to create unique identifiers. Since UUIDs never contain colons, collision between "task:uuid" and "version:uuid" is impossible. Additionally, on_connect() methods will validate that extracted IDs don't contain colons as a defensive check.

**4. Pending Events Queue**
VersionService already implements pending events (`_pending_events: dict[str, list[VersionEvent]]`) for events sent before stream connects.
This behavior must be preserved: when `queue_version_event()` is called before `on_connect()`, events are queued and delivered on connection.

**5. No Graceful Shutdown Integration**
Change brief explicitly states: "Don't implement graceful shutdown. Assume the service shuts down with the app (it's a sidecar in Kubernetes). All clients will be disconnected anyway."
Therefore, no shutdown coordinator integration for ConnectionManager; existing TaskService/VersionService shutdown logic remains unchanged.

**6. Authentication via Query Parameter Secret**
Change brief: "The callback endpoint needs to be authenticated. A secret will be passed in through a query string parameter called 'secret'. The value for this will be set in the SSE_CALLBACK_SECRET environment variable. It's only required in production mode."
This is simple string matching, not JWT or complex auth. Service is not exposed to public internet.

**7. No Retry on SSE Gateway Calls**
Change brief: "Don't retry calls to the SSE Gateway. The service is a sidecar. It should be available always. Log failed calls as errors."
This means HTTP calls to `/internal/send` fail fast; no exponential backoff or circuit breaker.

**8. Internal Queueing Preserved**
Change brief: "The TaskService and VersionService internal queueing (per task_id and request_id respectively) must be preserved."
Existing `_event_queues` and `_subscribers` remain; ConnectionManager is additional layer for gateway token management only.

**9. Baseline Tests as Foundation**
The baseline tests in `tests/integration/test_task_stream_baseline.py` and `tests/integration/test_version_stream_baseline.py` capture current behavior.
Integration tests with real SSE Gateway will reuse the same test structure but point to SSE Gateway endpoints instead of Python SSE endpoints.

**10. Endpoint URL Changes**
- Old: `GET /api/tasks/{task_id}/stream` → New: `GET /api/sse/tasks?task_id=?` (routed via SSE Gateway)
- Old: `GET /api/utils/version/stream?request_id=?` → New: `GET /api/sse/utils/version?request_id=?` (routed via SSE Gateway)
- Old endpoints will be removed entirely; no backwards compatibility.

---

## 1) Intent & Scope

**User intent**

Migrate from Python-based SSE generators to SSE Gateway callback architecture to solve thread exhaustion and connection lingering issues. Implement three-layer delegation (Flask → Service → ConnectionManager) where services extract identifiers from callback URLs, delegate connection tracking to ConnectionManager, and send events via HTTP to SSE Gateway. Preserve existing event queueing and business logic while changing only the transport mechanism.

**Prompt quotes**

"Replace the existing Python-based Server-Sent Events (SSE) implementation with SSE Gateway"
"Three-layer delegation: Flask endpoint → Service layer → ConnectionManager"
"Services extract their own identifier (task_id from query param, request_id from query param)"
"ConnectionManager stores mapping: service_identifier → gateway_token"
"Services never see gateway tokens; they only work with their own identifiers"
"No backwards compatibility: A clean implementation of the new infrastructure is desired"
"Unit tests and Integration tests MUST be delivered together with the implementation"

**In scope**

- Create ConnectionManager service for gateway token mapping and lifecycle management
- Add `/api/sse/callback` endpoint for SSE Gateway connect/disconnect notifications
- Refactor TaskService to use ConnectionManager and send events via HTTP POST to SSE Gateway
- Refactor VersionService to use ConnectionManager and send events via HTTP POST to SSE Gateway
- Remove old SSE endpoints: `GET /api/tasks/{task_id}/stream`, `GET /api/utils/version/stream`
- Add SSE_CALLBACK_SECRET environment variable and authentication middleware
- Add SSE_GATEWAY_URL environment variable for internal send endpoint
- Create Pydantic schemas for SSE Gateway callback and send payloads
- Unit tests with mocked SSE Gateway for all services
- Integration tests with real SSE Gateway (building on baseline test infrastructure)
- Prometheus metrics for SSE Gateway interactions (connect, disconnect, send events, errors)

**Out of scope**

- Graceful shutdown integration for ConnectionManager (sidecar assumption)
- Retry logic for SSE Gateway HTTP calls (fail fast)
- Backwards compatibility with old SSE endpoints
- Production deployment configuration (Kubernetes, reverse proxy setup)
- Frontend changes (separate plan; URLs will change)
- E2E tests with Playwright (third tier; separate from this plan)

**Assumptions / constraints**

- SSE Gateway is deployed as sidecar, always available on localhost
- SSE_GATEWAY_URL points to SSE Gateway's internal send endpoint (e.g., `http://localhost:3000/internal/send`)
- SSE_CALLBACK_SECRET is simple shared secret, not cryptographically signed
- Callback authentication only required in production mode (`FLASK_ENV == "production"`)
- TaskService and VersionService remain Singletons with in-memory state
- Existing event queueing (`_event_queues`, `_subscribers`, `_pending_events`) preserved
- Integration tests run SSE Gateway in background thread or subprocess
- No schema changes; no database migrations

---

## 2) Affected Areas & File Map

### Files to CREATE

- Area: `app/services/connection_manager.py`
- Why: Singleton service managing gateway token mappings (bidirectional), connection lifecycle, and event sending for both TaskService and VersionService; Singleton required because in-memory connection state must be shared across all service instances; uses RLock for thread safety
- Evidence: Change brief specifies ConnectionManager as third layer handling token → identifier mapping and HTTP calls to SSE Gateway

---

- Area: `app/schemas/sse_gateway_schema.py`
- Why: Pydantic schemas for SSE Gateway callback and send payloads (request/response validation)
- Evidence: SSE Gateway README.md defines JSON payloads for `/callback` and `/internal/send`; need schemas for `@api.validate` decorator

---

- Area: `app/api/sse.py`
- Why: New API module for SSE Gateway callback endpoint (`POST /api/sse/callback`)
- Evidence: Change brief: "Add: POST /api/sse/callback (receives connect/disconnect notifications from SSE Gateway)"

---

- Area: `tests/test_connection_manager.py`
- Why: Unit tests for ConnectionManager with mocked HTTP requests
- Evidence: Testing requirements mandate unit tests for all new services; ConnectionManager HTTP calls must be mocked

---

- Area: `tests/integration/test_sse_gateway_tasks.py`
- Why: Integration tests for task streaming with real SSE Gateway
- Evidence: Change brief: "Integration tests with real SSE Gateway, HTTP-only validation (catches contract bugs)"; builds on baseline test infrastructure

---

- Area: `tests/integration/test_sse_gateway_version.py`
- Why: Integration tests for version streaming with real SSE Gateway
- Evidence: Same rationale as tasks; validates version stream endpoint with real gateway

---

- Area: `tests/integration/sse_gateway_helper.py`
- Why: Test helper for starting/stopping SSE Gateway subprocess; polls /readyz with 500ms interval and 10-second total timeout; raises exception if not ready; graceful shutdown (5s SIGTERM, then SIGKILL); captures stdout/stderr for debugging on failure
- Evidence: Integration tests need to run real SSE Gateway; helper manages lifecycle similar to `sse_server` fixture; explicit timeouts per plan review

---

### Files to MODIFY

- Area: `app/services/task_service.py`
- Why: Replace `get_task_events()` generator pattern with ConnectionManager delegation; add `on_connect()` and `on_disconnect()` methods for callback handling; modify `_execute_task()` to send events via HTTP
- Evidence: `app/services/task_service.py:212-249` — current `get_task_events()` returns list from queue; needs refactor to send via ConnectionManager

---

- Area: `app/services/version_service.py`
- Why: Add `on_connect()` and `on_disconnect()` methods for callback handling; modify `queue_version_event()` to send via ConnectionManager; preserve pending events logic
- Evidence: `app/services/version_service.py:50-117` — current `register_subscriber()` and `queue_version_event()` use in-memory queues; needs HTTP send integration

---

- Area: `app/api/tasks.py`
- Why: Remove `get_task_stream()` endpoint (lines 16-71); old Python SSE endpoint no longer needed
- Evidence: Change brief: "Remove: GET /api/tasks/{task_id}/stream (old Python SSE endpoint)"

---

- Area: `app/api/utils.py`
- Why: Remove `version_stream()` endpoint (lines 23-125); old Python SSE endpoint no longer needed
- Evidence: Change brief: "Remove: GET /api/utils/version/stream?request_id=? (old Python SSE endpoint)"

---

- Area: `app/services/container.py`
- Why: Add ConnectionManager as Singleton provider (Singleton because shared in-memory state required; same rationale as TaskService and VersionService); update TaskService and VersionService providers to inject ConnectionManager
- Evidence: `app/services/container.py:164-213` — existing TaskService and VersionService providers; need ConnectionManager injection

---

- Area: `app/config.py`
- Why: Add SSE_CALLBACK_SECRET and SSE_GATEWAY_URL environment variables
- Evidence: Change brief specifies these config values; `app/config.py:18-175` shows existing settings pattern

---

- Area: `app/__init__.py`
- Why: Wire `app.api.sse` module in container; ensure SSE blueprint is registered
- Evidence: `app/__init__.py:60-68` — existing wire_modules list; need to add 'app.api.sse'

---

- Area: `tests/conftest.py`
- Why: Add fixture for starting SSE Gateway in background for integration tests; reuse existing `sse_server` fixture pattern
- Evidence: `tests/conftest.py` contains session-scoped fixtures; need `sse_gateway_server` fixture for integration tests

---

- Area: `app/services/metrics_service.py`
- Why: Add abstract methods to MetricsServiceProtocol for SSE Gateway metrics: `record_sse_gateway_connection(service: str, action: str)`, `record_sse_gateway_event(service: str, status: str)`, `record_sse_gateway_send_duration(service: str, duration: float)`; implement in MetricsService
- Evidence: `app/services/metrics_service.py:20-150` — MetricsServiceProtocol defines abstract methods; need SSE Gateway-specific methods

---

- Area: `tests/test_task_service.py`
- Why: Update unit tests to mock ConnectionManager HTTP calls; validate new callback handling methods
- Evidence: Existing TaskService tests need updates for new ConnectionManager integration; validate `on_connect()` and `on_disconnect()`

---

- Area: `tests/test_version_service.py`
- Why: Update unit tests to mock ConnectionManager HTTP calls; validate callback handling and pending events
- Evidence: Existing VersionService tests need updates for new ConnectionManager integration

---

## 3) Data Model / Contracts

- Entity / contract: SSE Gateway Connect Callback Request
- Shape:
  ```json
  {
    "action": "connect",
    "token": "550e8400-e29b-41d4-a716-446655440000",
    "request": {
      "url": "/api/sse/tasks?task_id=abc123",
      "headers": {
        "user-agent": "curl/7.68.0",
        "accept": "text/event-stream"
      }
    }
  }
  ```
- Refactor strategy: New contract from SSE Gateway; no backwards compatibility needed
- Evidence: SSE Gateway README.md lines 103-119 — connect callback payload structure

---

- Entity / contract: SSE Gateway Disconnect Callback Request
- Shape:
  ```json
  {
    "action": "disconnect",
    "reason": "client_closed",
    "token": "550e8400-e29b-41d4-a716-446655440000",
    "request": {
      "url": "/api/sse/tasks?task_id=abc123",
      "headers": {...}
    }
  }
  ```
- Refactor strategy: New contract; disconnect reasons: "client_closed", "server_closed", "error"
- Evidence: SSE Gateway README.md lines 249-269 — disconnect callback payload

---

- Entity / contract: SSE Gateway Connect Callback Response
- Shape:
  ```json
  {
    "event": {
      "name": "connection_open",
      "data": "{\"status\": \"connected\"}"
    }
  }
  ```
  (Optional fields: `close: true` to immediately close connection)
- Refactor strategy: Response body is optional; empty response or `{}` means accept connection
- Evidence: SSE Gateway README.md lines 121-172 — callback response body format

---

- Entity / contract: SSE Gateway Send Request
- Shape:
  ```json
  {
    "token": "550e8400-e29b-41d4-a716-446655440000",
    "event": {
      "name": "task_event",
      "data": "{\"event_type\": \"progress_update\", \"task_id\": \"abc123\", ...}"
    },
    "close": false
  }
  ```
- Refactor strategy: New contract for sending events from Python to SSE Gateway
- Evidence: SSE Gateway README.md lines 177-201 — /internal/send request payload

---

- Entity / contract: ConnectionManager Token Mapping (in-memory, bidirectional)
- Shape:
  ```python
  # Forward mapping: identifier → connection info
  _connections: dict[str, dict] = {
    "task:abc123": {
      "token": "550e8400-e29b-41d4-a716-446655440000",
      "url": "/api/sse/tasks?task_id=abc123"
    }
  }

  # Reverse mapping: token → identifier (for disconnect callback)
  _token_to_identifier: dict[str, str] = {
    "550e8400-e29b-41d4-a716-446655440000": "task:abc123"
  }
  ```
- Refactor strategy: No persistence; bidirectional in-memory dicts with thread-safe RLock; both mappings updated atomically within lock; reverse mapping enables O(1) lookup on disconnect when only token is known
- Evidence: Change brief: "ConnectionManager stores mapping: service_identifier → gateway_token"; disconnect callback provides only token

---

- Entity / contract: Config Environment Variables
- Shape:
  ```python
  SSE_CALLBACK_SECRET: str = ""  # Required in production
  SSE_GATEWAY_URL: str = "http://localhost:3000"  # SSE Gateway base URL
  ```
- Refactor strategy: Add to Settings class; SSE_CALLBACK_SECRET empty string in dev/test, required in production
- Evidence: Change brief lines 83; app/config.py pattern for environment variables

---

## 4) API / Integration Surface

- Surface: `POST /api/sse/callback`
- Inputs: JSON body with `action` ("connect" or "disconnect"), `token`, `request` object; query param `secret` (if production mode)
- Outputs: 200 with optional `{"event": {...}, "close": true}` on connect; 200 empty on disconnect; 401 if secret mismatch; 400 if invalid payload
- Errors: 401 Unauthorized if secret doesn't match (production only); 400 Bad Request if action unknown or payload invalid; 500 on service errors
- Evidence: SSE Gateway README.md callback specification; change brief authentication requirement

---

- Surface: `POST http://localhost:3000/internal/send` (SSE Gateway internal endpoint, called by Python)
- Inputs: JSON body with `token`, optional `event` object, optional `close` boolean
- Outputs: 200 on success; 404 if token unknown (connection not found); 400 if invalid request
- Errors: 404 means connection already closed or never existed; 400 for malformed JSON or missing required fields
- Evidence: SSE Gateway README.md lines 175-238 — /internal/send specification

---

- Surface: `GET /api/sse/tasks?task_id=<id>` (served by SSE Gateway, not Python; mentioned for completeness)
- Inputs: Query parameter `task_id`
- Outputs: SSE stream with events; SSE Gateway calls Python callback on connect
- Errors: Non-2xx from Python callback results in immediate connection close
- Evidence: Change brief: "Add: GET /api/sse/tasks?task_id=? (new SSE endpoint via SSE Gateway)"

---

- Surface: `GET /api/sse/utils/version?request_id=<id>` (served by SSE Gateway, not Python; mentioned for completeness)
- Inputs: Query parameter `request_id`
- Outputs: SSE stream with version events; SSE Gateway calls Python callback on connect
- Errors: Non-2xx from Python callback results in immediate connection close
- Evidence: Change brief: "Add: GET /api/sse/utils/version?request_id=? (new SSE endpoint via SSE Gateway)"

---

- Surface: Remove `GET /api/tasks/{task_id}/stream`
- Inputs: N/A (endpoint removed)
- Outputs: N/A
- Errors: N/A
- Evidence: Change brief: "Remove: GET /api/tasks/{task_id}/stream (old Python SSE endpoint)"; app/api/tasks.py:16-71

---

- Surface: Remove `GET /api/utils/version/stream`
- Inputs: N/A (endpoint removed)
- Outputs: N/A
- Errors: N/A
- Evidence: Change brief: "Remove: GET /api/utils/version/stream?request_id=? (old Python SSE endpoint)"; app/api/utils.py:23-125

---

## 5) Algorithms & State Machines (step-by-step)

- Flow: SSE Gateway Connect Callback Handling (Tasks)
- Steps:
  1. SSE Gateway receives client connection at `GET /api/sse/tasks?task_id=abc123`
  2. SSE Gateway generates unique token (UUID)
  3. SSE Gateway POSTs to `http://localhost:8000/api/sse/callback?secret=<SECRET>` with `{"action": "connect", "token": "...", "request": {"url": "/api/sse/tasks?task_id=abc123", ...}}`
  4. Flask endpoint validates secret (if production), parses payload
  5. Flask endpoint extracts URL from callback payload: checks if `request["url"].startswith("/api/sse/tasks")` → route to TaskService; else if `startswith("/api/sse/utils/version")` → route to VersionService; else 400 Bad Request
  6. Flask endpoint calls `task_service.on_connect(callback_request)`
  7. TaskService extracts `task_id` from `request.url` query parameters; validates it doesn't contain colon (defensive check)
  8. TaskService calls `connection_manager.on_connect("task:abc123", token, url)` (prefixed identifier)
  9. ConnectionManager acquires lock, checks if identifier already exists; if yes, closes old connection via `POST /internal/send` with `close: true`, removes old reverse mapping
  10. ConnectionManager stores forward mapping `_connections["task:abc123"] = {"token": "...", "url": "..."}` AND reverse mapping `_token_to_identifier[token] = "task:abc123"` atomically within lock
  11. TaskService returns success; Flask returns 200 with `{"event": {"name": "connection_open", "data": "{\"status\": \"connected\"}"}}`
  12. SSE Gateway sends connection_open event to client
- States / transitions: Connection: NONE → REGISTERED; Old connection: REGISTERED → CLOSING → NONE (if replacement)
- Hotspots: ConnectionManager lock contention on concurrent connects; HTTP POST to SSE Gateway on old connection close
- Evidence: SSE Gateway README.md connect flow; change brief three-layer delegation pattern

---

- Flow: Task Event Sending (via SSE Gateway)
- Steps:
  1. Background task executes and generates progress event
  2. TaskService receives event via `_event_queues[task_id].put_nowait(event)`
  3. TaskService sends event to all connected clients: calls `connection_manager.send_event("task:abc123", event_data)`
  4. ConnectionManager looks up token for "task:abc123"
  5. If no token (no connection), log warning and return (event dropped)
  6. ConnectionManager formats event as `{"token": "...", "event": {"name": "task_event", "data": json.dumps(event_data)}}`
  7. ConnectionManager POSTs to `SSE_GATEWAY_URL/internal/send`
  8. If POST fails, log error; do not retry
  9. If POST returns 404, connection is gone; remove mapping
  10. If POST returns 200, event sent successfully
  11. If final event (task_completed/task_failed), send with `close: true`
- States / transitions: Task: RUNNING → COMPLETED; Connection: OPEN → (event sent) → OPEN or CLOSED (if final event)
- Hotspots: HTTP POST latency to SSE Gateway; no retries means events can be lost on transient failures
- Evidence: app/services/task_service.py:251-343 — task execution and event generation; change brief no-retry policy

---

- Flow: SSE Gateway Disconnect Callback Handling
- Steps:
  1. Client disconnects or SSE Gateway closes connection
  2. SSE Gateway POSTs to callback with `{"action": "disconnect", "reason": "client_closed", "token": "...", "request": {...}}`
  3. Flask endpoint parses payload, extracts URL from callback, routes via prefix matching (same logic as connect)
  4. Flask endpoint calls `task_service.on_disconnect(callback_request)` or `version_service.on_disconnect(callback_request)`
  5. Service calls `connection_manager.on_disconnect(token)` (no identifier extraction needed; disconnect provides token only)
  6. ConnectionManager acquires lock, looks up identifier via reverse mapping `_token_to_identifier.get(token)`
  7. If token not found, log debug (expected for stale disconnects after replacement) and return
  8. ConnectionManager verifies token matches current forward mapping `_connections[identifier]["token"]`; if mismatch, log debug (stale disconnect) and return
  9. ConnectionManager removes both forward mapping `_connections[identifier]` and reverse mapping `_token_to_identifier[token]`
  10. Service performs any cleanup (e.g., log disconnect reason); Flask returns 200 (empty body)
- States / transitions: Connection: REGISTERED → NONE
- Hotspots: Race condition if disconnect callback arrives during connection replacement; lock ensures sequential processing; stale disconnect callbacks ignored via token verification
- Evidence: SSE Gateway README.md disconnect callback; change brief disconnect handling; review finding on disconnect race

---

- Flow: Version Event Queueing with Pending Events
- Steps:
  1. Testing endpoint calls `version_service.queue_version_event("request_id_123", version, changelog)`
  2. VersionService checks if connection exists: `connection_manager.has_connection("version:request_id_123")`
  3. If connection exists, VersionService calls `connection_manager.send_event("version:request_id_123", event_data)`
  4. ConnectionManager sends event via HTTP POST to SSE Gateway
  5. If no connection, VersionService stores event in `_pending_events["request_id_123"].append(("version", payload))`
  6. When `on_connect()` is called later, VersionService retrieves pending events and sends all via ConnectionManager
  7. Pending events sent in order; `_pending_events` cleared after delivery
- States / transitions: Event: PENDING → SENT; Connection: NONE → CONNECTED (pending events flushed on connect)
- Hotspots: Race between `queue_version_event()` and `on_connect()`; lock ensures pending events are properly queued or sent
- Evidence: app/services/version_service.py:82-117 — existing pending events logic; must preserve behavior

---

## 6) Derived State & Invariants (stacked bullets)

- Derived value: Active connection count per service
  - Source: Unfiltered mappings in ConnectionManager; count of entries with matching prefix ("task:" or "version:")
  - Writes / cleanup: No persistent writes; Prometheus gauge updated on connect/disconnect
  - Guards: Lock-protected reads; metric updates in callback handlers
  - Invariant: Active connection count >= 0; only one connection per service identifier
  - Evidence: Metrics for observability; change brief one connection per identifier

---

- Derived value: Gateway token to service identifier reverse mapping
  - Source: ConnectionManager mappings; needed for disconnect callback when only token is known
  - Writes / cleanup: In-memory dict; no persistence; cleared on disconnect
  - Guards: Lock-protected; updated atomically with forward mapping
  - Invariant: Reverse mapping always mirrors forward mapping; no orphaned tokens
  - Evidence: Disconnect callback provides token but not identifier; need reverse lookup

---

- Derived value: Pending version events queue
  - Source: Filtered events for request_id where no connection exists yet (VersionService)
  - Writes / cleanup: Stored in `_pending_events` dict; flushed on `on_connect()`; no persistent cleanup needed
  - Guards: Lock-protected; events sent in order; cleared after successful delivery
  - Invariant: Pending events delivered on first connection; no duplicates; order preserved
  - Evidence: app/services/version_service.py:82-117 — existing pending events logic; must preserve

---

## 7) Consistency, Transactions & Concurrency

- Transaction scope: No database transactions; all state is in-memory
- Atomic requirements: ConnectionManager mapping updates (forward + reverse) must be atomic; lock ensures consistency
- Retry / idempotency: No retries on SSE Gateway HTTP calls; events may be lost on transient failures; idempotency not guaranteed
- Ordering / concurrency controls: ConnectionManager uses `threading.RLock()` for all mapping updates; TaskService and VersionService existing locks preserved
- Evidence: Change brief no-retry policy; in-memory state means no transaction boundaries

---

## 8) Errors & Edge Cases

- Failure: SSE Gateway callback secret mismatch
- Surface: `POST /api/sse/callback`
- Handling: Return 401 Unauthorized; log warning; reject connection
- Guardrails: Secret validation only in production mode; dev/test skip check
- Evidence: Change brief authentication requirement; app/config.py:177-183 — environment-based behavior

---

- Failure: SSE Gateway callback with unknown action
- Surface: `POST /api/sse/callback`
- Handling: Return 400 Bad Request with error message; log error
- Guardrails: Schema validation with Pydantic; only "connect" and "disconnect" allowed
- Evidence: SSE Gateway callback specification; defensive programming

---

- Failure: POST to `/internal/send` returns 404 (connection gone)
- Surface: ConnectionManager `send_event()` method
- Handling: Log warning; remove stale mapping; event dropped
- Guardrails: No retry; clean up stale state
- Evidence: SSE Gateway README.md /internal/send responses; change brief no-retry policy

---

- Failure: POST to `/internal/send` fails (timeout, connection refused)
- Surface: ConnectionManager `send_event()` method
- Handling: Log error with exception details; event dropped; no retry
- Guardrails: Requests library timeout (e.g., 5s); catch all exceptions
- Evidence: Change brief: "Don't retry calls to the SSE Gateway. Log failed calls as errors."

---

- Failure: Task ID or request ID extraction fails from callback URL, or contains invalid characters
- Surface: TaskService/VersionService `on_connect()` method
- Handling: If missing or contains colon, log error and return non-2xx response (SSE Gateway closes connection immediately)
- Guardrails: URL query parameter parsing with error handling; validate ID doesn't contain colon (ensures identifier prefix safety)
- Evidence: Defensive programming; UUIDs don't contain colons but validate explicitly per plan review

---

- Failure: Connection replacement race condition
- Surface: ConnectionManager `on_connect()` with same identifier
- Handling: Lock ensures sequential processing; old connection closed before new one registered
- Guardrails: `threading.RLock()` serializes updates; no partial state
- Evidence: Change brief: "On reconnect with same service_identifier: ConnectionManager closes old gateway connection first"

---

- Failure: Disconnect callback arrives after new connection established (stale token)
- Surface: ConnectionManager `on_disconnect()` method
- Handling: Look up identifier via reverse mapping; verify token matches current forward mapping; if mismatch, log debug (expected behavior) and ignore (don't remove current connection)
- Guardrails: Token verification prevents closing wrong connection; debug-level logging (not warning) for expected stale disconnects
- Evidence: Race condition handling; token acts as generation marker; connection replacement closes old connection explicitly but disconnect callback may still arrive

---

- Failure: Pending version events accumulate without connection
- Surface: VersionService `queue_version_event()` method
- Handling: Events stored indefinitely until connection; no max queue size (current behavior)
- Guardrails: None (existing behavior preserved); potential memory leak if connection never established
- Evidence: app/services/version_service.py:114-116 — pending events appended without limit

---

## 9) Observability / Telemetry

- Signal: `sse_gateway_connections_total`
- Type: Counter with labels `{service, action}` (service=task|version, action=connect|disconnect)
- Trigger: Incremented on each connect/disconnect callback received
- Labels / fields: service (task/version), action (connect/disconnect)
- Consumer: Prometheus dashboard; alert on high disconnect rate
- Evidence: Metrics for connection lifecycle tracking

---

- Signal: `sse_gateway_events_sent_total`
- Type: Counter with labels `{service, status}` (status=success|error)
- Trigger: Incremented after each `/internal/send` POST attempt
- Labels / fields: service (task/version), status (success=2xx, error=non-2xx or exception)
- Consumer: Prometheus; alert on high error rate
- Evidence: Metrics for event delivery success/failure tracking

---

- Signal: `sse_gateway_send_duration_seconds`
- Type: Histogram with label `{service}`
- Trigger: Recorded on each `/internal/send` POST call (success or failure)
- Labels / fields: service (task/version)
- Consumer: Prometheus; latency monitoring
- Evidence: Performance monitoring for HTTP calls to SSE Gateway

---

- Signal: `sse_gateway_active_connections`
- Type: Gauge with label `{service}`
- Trigger: Updated on connect (increment) and disconnect (decrement)
- Labels / fields: service (task/version)
- Consumer: Prometheus dashboard; current connection count
- Evidence: Operational visibility into active SSE connections

---

- Signal: Connection lifecycle logs
- Type: Structured log (INFO level)
- Trigger: Each connect/disconnect callback, event send, error
- Labels / fields: service_identifier, gateway_token, action, status, error_message
- Consumer: Log aggregation (CloudWatch, Splunk); debugging
- Evidence: Debugging and audit trail for connection lifecycle

---

## 10) Background Work & Shutdown

- Worker / job: No new background workers
- Trigger cadence: N/A
- Responsibilities: N/A
- Shutdown handling: Change brief explicitly excludes graceful shutdown; ConnectionManager has no shutdown integration
- Evidence: Change brief: "Don't implement graceful shutdown. Assume the service shuts down with the app (it's a sidecar in Kubernetes)."

---

## 11) Security & Permissions

- Concern: Callback endpoint authentication (prevent unauthorized SSE Gateway callbacks)
- Touchpoints: `POST /api/sse/callback` endpoint
- Mitigation: Query parameter `secret` validated against `SSE_CALLBACK_SECRET`; 401 if mismatch; only enforced in production mode
- Residual risk: Query parameter visible in logs; acceptable because service not exposed to public internet (internal sidecar communication)
- Evidence: Change brief lines 83; simple shared secret for internal service communication

---

## 12) UX / UI Impact

- Entry point: No direct UX impact; backend-only change
- Change: Frontend SSE endpoint URLs will change from `/api/tasks/{task_id}/stream` to `/api/sse/tasks?task_id=<id>` (routed via reverse proxy to SSE Gateway)
- User interaction: No change; SSE streams work identically from user perspective
- Dependencies: Frontend must update SSE connection URLs; reverse proxy must route `/api/sse/*` to SSE Gateway instead of Python backend
- Evidence: Change brief endpoint changes; deployment requirements

---

## 13) Deterministic Test Plan (new/changed behavior only)

### ConnectionManager Service (tests/test_connection_manager.py)

- Surface: ConnectionManager class with mocked HTTP requests
- Scenarios:
  - Given no existing connection, When `on_connect("task:abc", token, url)` called, Then store mapping and return success
  - Given existing connection for same identifier, When `on_connect("task:abc", new_token, url)` called, Then POST close to old token, store new mapping
  - Given active connection, When `send_event("task:abc", event)` called, Then POST to /internal/send with token and event data; return success
  - Given no connection for identifier, When `send_event("task:xyz", event)` called, Then log warning and return failure (no POST)
  - Given POST to /internal/send returns 404, When `send_event()` called, Then remove stale mapping and log warning
  - Given POST to /internal/send raises exception, When `send_event()` called, Then log error and return failure (no retry)
  - Given active connection, When `on_disconnect("task:abc", token)` called with matching token, Then remove mapping
  - Given disconnect with mismatched token, When `on_disconnect("task:abc", wrong_token)` called, Then log warning and ignore (keep existing mapping)
  - Given concurrent connects for same identifier, When multiple threads call `on_connect()`, Then lock ensures sequential processing (no race)
  - Given connection exists, When `has_connection("task:abc")` called, Then return True; else return False
- Fixtures / hooks: Mock `requests.post()` with configurable responses; mock metrics_service; threading tests for concurrency
- Gaps: None; comprehensive unit coverage
- Evidence: Core service for gateway integration; must validate all error paths and concurrency

---

### SSE Callback API (tests/test_sse_api.py or integrated in service tests)

- Surface: `POST /api/sse/callback` endpoint
- Scenarios:
  - Given valid connect callback for task, When POST with correct secret, Then call task_service.on_connect() and return 200 with connection_open event
  - Given valid connect callback for version, When POST with correct secret, Then call version_service.on_connect() and return 200 with connection_open event
  - Given production mode, When POST with missing or wrong secret, Then return 401 Unauthorized
  - Given dev/test mode, When POST without secret, Then accept and process normally
  - Given disconnect callback, When POST with valid payload, Then call service.on_disconnect() and return 200
  - Given unknown URL pattern, When connect callback with unrecognized path, Then return 400 Bad Request
  - Given invalid JSON payload, When POST with malformed body, Then return 400 Bad Request
  - Given unknown action, When POST with action="foo", Then return 400 Bad Request
- Fixtures / hooks: Flask test client; mock task_service and version_service; environment variable injection for secret
- Gaps: None; validates endpoint routing and authentication
- Evidence: Primary entry point for SSE Gateway callbacks; must validate all routing and error cases

---

### TaskService Refactoring (tests/test_task_service.py updates)

- Surface: TaskService `on_connect()`, `on_disconnect()`, and refactored event sending
- Scenarios:
  - Given task stream callback URL, When `on_connect(callback_request)` called, Then extract task_id from query param, call connection_manager.on_connect(), return success
  - Given invalid callback URL (no task_id), When `on_connect()` called, Then log error and return error response
  - Given task completes, When task_completed event generated, Then send event via connection_manager with close=True
  - Given connection_manager.send_event() fails, When sending progress event, Then log error but continue task execution (don't fail task)
  - Given disconnect callback, When `on_disconnect(callback_request)` called, Then extract task_id, call connection_manager.on_disconnect(), log disconnect
  - Given no connection for task, When sending event, Then connection_manager logs warning (event dropped)
- Fixtures / hooks: Mock ConnectionManager; existing task fixtures; validate existing tests still pass with new architecture
- Gaps: None; ensures TaskService correctly integrates ConnectionManager
- Evidence: TaskService core refactor; must validate callback handling and event sending

---

### VersionService Refactoring (tests/test_version_service.py updates)

- Surface: VersionService `on_connect()`, `on_disconnect()`, and refactored event queueing
- Scenarios:
  - Given version stream callback URL, When `on_connect(callback_request)` called, Then extract request_id, call connection_manager.on_connect(), flush pending events, return success
  - Given pending events exist, When `on_connect()` called, Then send all pending events via connection_manager in order, clear pending queue
  - Given no connection, When `queue_version_event()` called, Then add event to pending queue (existing behavior)
  - Given active connection, When `queue_version_event()` called, Then send event via connection_manager immediately
  - Given disconnect callback, When `on_disconnect()` called, Then extract request_id, call connection_manager.on_disconnect()
  - Given connection_manager.send_event() fails, When sending version event, Then log error but preserve pending events
- Fixtures / hooks: Mock ConnectionManager; validate pending events logic preserved; test race between queue_version_event and on_connect
- Gaps: None; ensures VersionService pending events logic still works
- Evidence: VersionService pending events are critical feature; must validate preservation

---

### Integration Tests with Real SSE Gateway (tests/integration/test_sse_gateway_tasks.py)

- Surface: Task streaming end-to-end with real SSE Gateway subprocess
- Scenarios:
  - Given SSE Gateway running, When client connects to `/api/sse/tasks?task_id=<id>`, Then receive connection_open event from SSE Gateway
  - Given task running, When task sends progress events, Then client receives task_event SSE events via gateway
  - Given task completes, When final event sent with close=True, Then connection closes automatically
  - Given task does not exist, When client connects, Then receive error event and connection closes
  - Given client disconnects, When connection drops, Then Python receives disconnect callback
  - Given multiple clients connect to same task, When new client connects, Then old client disconnected (only latest connection active)
- Fixtures / hooks: `sse_gateway_server` fixture (manages subprocess with 10s startup timeout, 500ms health check interval, 5s shutdown grace period); SSEClient helper; background task execution; real HTTP calls
- Gaps: None; validates complete integration with real SSE Gateway
- Evidence: Integration tests mandatory per change brief; builds on baseline test infrastructure; explicit timeouts per plan review

---

### Integration Tests with Real SSE Gateway (tests/integration/test_sse_gateway_version.py)

- Surface: Version streaming end-to-end with real SSE Gateway subprocess
- Scenarios:
  - Given SSE Gateway running, When client connects to `/api/sse/utils/version?request_id=<id>`, Then receive connection_open and version event immediately
  - Given pending version event queued, When client connects later, Then receive pending event via gateway
  - Given testing endpoint triggers version event, When connection active, Then receive version event via SSE Gateway
  - Given connection idle, When waiting, Then receive heartbeat comments from SSE Gateway (not Python)
  - Given client disconnects, When connection drops, Then Python receives disconnect callback
- Fixtures / hooks: `sse_gateway_server` fixture; SSEClient helper; testing endpoint to trigger events
- Gaps: None; validates version stream with pending events
- Evidence: Integration tests mandatory; validates critical pending events feature

---

## 14) Implementation Slices

- Slice: ConnectionManager and Schemas
- Goal: Core service for gateway integration with HTTP communication
- Touches: `app/services/connection_manager.py`, `app/schemas/sse_gateway_schema.py`, `tests/test_connection_manager.py`
- Dependencies: None; standalone service and schemas

---

- Slice: SSE Callback API Endpoint
- Goal: Receive and route SSE Gateway callbacks to services
- Touches: `app/api/sse.py`, `app/__init__.py` (wiring), `app/config.py` (environment variables)
- Dependencies: Slice 1 (schemas); TaskService and VersionService refactoring (Slice 3)

---

- Slice: TaskService and VersionService Refactoring
- Goal: Integrate ConnectionManager and add callback handling methods
- Touches: `app/services/task_service.py`, `app/services/version_service.py`, `app/services/container.py` (inject ConnectionManager), `tests/test_task_service.py`, `tests/test_version_service.py`
- Dependencies: Slice 1 (ConnectionManager); mocked ConnectionManager in unit tests

---

- Slice: Remove Old SSE Endpoints
- Goal: Clean up legacy Python SSE implementation
- Touches: `app/api/tasks.py` (remove stream endpoint), `app/api/utils.py` (remove stream endpoint), `app/utils/sse_utils.py` (keep for compatibility or remove if unused)
- Dependencies: Slice 2 and 3 complete (new implementation working)

---

- Slice: Prometheus Metrics Integration
- Goal: Add observability for SSE Gateway interactions
- Touches: `app/services/metrics_service.py` (add methods), ConnectionManager (call metrics methods)
- Dependencies: Slice 1 (ConnectionManager exists)

---

- Slice: Integration Tests with Real SSE Gateway
- Goal: Validate end-to-end behavior with real gateway subprocess
- Touches: `tests/integration/sse_gateway_helper.py`, `tests/integration/test_sse_gateway_tasks.py`, `tests/integration/test_sse_gateway_version.py`, `tests/conftest.py` (sse_gateway_server fixture)
- Dependencies: Slice 1-4 complete (full implementation); SSE Gateway executable available

---

## 15) Risks & Open Questions

- Risk: SSE Gateway subprocess management in tests may be flaky
- Impact: Intermittent test failures; difficult to debug
- Mitigation: Robust subprocess lifecycle (health check polling, timeout on startup, clean shutdown); log SSE Gateway stdout/stderr

---

- Risk: Token mismatch on disconnect due to connection replacement race
- Impact: Stale disconnect callbacks arrive after replacement
- Mitigation: Bidirectional token mapping enables reverse lookup; token verification distinguishes stale vs current; debug-level logging for expected stale disconnects; no memory leak (old connection explicitly closed on replacement)

---

- Risk: HTTP call latency to SSE Gateway degrades task performance
- Impact: Task execution slower; events delayed
- Mitigation: SSE Gateway is localhost sidecar (sub-millisecond latency); monitor `sse_gateway_send_duration_seconds` metric

---

- Risk: Pending version events unbounded queue growth
- Impact: Memory leak if connection never established
- Mitigation: Document limitation (existing behavior); consider max queue size in future iteration

---

- Risk: No retry on transient SSE Gateway failures means event loss
- Impact: Clients miss events during brief gateway unavailability
- Mitigation: Sidecar should be highly available; log errors for investigation; accept limitation per change brief

---

## 16) Confidence

Confidence: High — Change brief is well-defined with clear architecture, SSE Gateway specification is comprehensive, existing baseline tests provide regression protection, and three-layer delegation pattern separates concerns cleanly. Risk of event loss due to no-retry policy is accepted per brief.
