# SSE Callback Cleanup — Technical Plan

## 0) Research Log & Findings

**Areas researched:**

1. **SSE callback handler** (`app/api/sse.py:95-204`): The `handle_callback` function processes connect and disconnect callbacks from the SSE Gateway. Currently returns `SSEGatewayCallbackResponse` with `connection_open` event on connect (lines 160-167).

2. **SSE Gateway schema** (`app/schemas/sse_gateway_schema.py:47-53`): The `SSEGatewayCallbackResponse` model includes optional `event` and `close` fields. These were designed to support callback-driven messages and connection control, but the SSE Gateway no longer uses these features.

3. **Test coverage** (`tests/test_sse_api.py:93-116`): Unit test `test_connect_callback_returns_connection_open_event` explicitly validates that the `connection_open` event is returned in the callback response.

4. **Integration tests** (`tests/integration/test_sse_gateway_tasks.py:20-52`, `tests/integration/test_task_stream_baseline.py:17-46`): Multiple integration tests expect to receive the `connection_open` event as the first event in the stream. These tests validate end-to-end behavior.

5. **SSE client helper** (`tests/test_sse_client_helper.py:42-84`): Helper tests include mock SSE streams that emit `connection_open` events.

**Key findings:**

- The SSE Gateway previously supported returning messages from callbacks but has been simplified to ignore callback response bodies (only HTTP status codes matter).
- The `connection_open` event is sent to clients but provides minimal value and is not used by the frontend.
- The `connection_close` event is still valuable and should be retained (it signals stream completion).
- The callback response handling (lines 160-167 in `app/api/sse.py`) builds a response object that is now unnecessary.
- Service layer (`TaskService.on_connect`, `VersionService.on_connect`) only registers connections; they don't depend on callback response data.

**Conflicts identified and resolved:**

- **Test expectations vs new behavior**: Many tests explicitly check for `connection_open` events. Resolution: Update all tests to not expect this event.
- **SSE Gateway contract**: The gateway ignores callback response bodies and only checks HTTP status codes. Resolution: Return `jsonify({})` from both connect and disconnect callbacks for consistency (disconnect already uses this; connect will be updated).
- **Schema usage split**: Some schemas are for input validation (needed), others for response building (obsolete). Resolution: Keep input validation schemas (`SSEGatewayConnectCallback`, `SSEGatewayDisconnectCallback`) and remove only response schemas (`SSEGatewayCallbackResponse`, `SSEGatewayEventData`).

## 1) Intent & Scope

**User intent**

Remove obsolete code related to SSE Gateway callback responses that returned messages and close requests. The SSE Gateway has been simplified and now ignores callback response bodies (only HTTP status codes matter). Additionally, remove the `connection_open` event which provides little value and is not used by the frontend.

**Prompt quotes**

"Remove callback response handling: The `handle_callback` function in `app/api/sse.py:98` currently handles responses from connect and disconnect callbacks that include messages and close requests. Since the SSE Gateway now ignores callback response bodies (only checks HTTP status codes), this handling code should be removed."

"Remove `connection_open` event: The `connection_open` SSE event should be removed completely as it is not used in the frontend and provides minimal value. The `connection_close` event should be retained as it has utility."

**In scope**

- Change `handle_callback` in `app/api/sse.py` to return empty JSON response (`jsonify({})`) for connect callback (disconnect already uses this)
- Remove `SSEGatewayCallbackResponse` and `SSEGatewayEventData` schemas from `app/schemas/sse_gateway_schema.py` (these are response-only schemas)
- Keep `SSEGatewayConnectCallback` and `SSEGatewayDisconnectCallback` schemas (needed for input validation)
- Remove imports of deleted schemas throughout the codebase
- Remove all references to `connection_open` event from tests
- Update integration tests to not expect `connection_open` as first event
- Add explicit test coverage for empty JSON response format

**Out of scope**

- Changes to `connection_close` event (this remains valuable)
- Removing input validation schemas (`SSEGatewayConnectCallback`, `SSEGatewayDisconnectCallback`)
- Frontend changes (no frontend code exists in this backend repository)
- SSE Gateway changes (that's a separate codebase)

**Assumptions / constraints**

- The SSE Gateway ignores callback response bodies and only checks HTTP status codes for callback success
- No frontend code depends on the `connection_open` event
- Services (`TaskService`, `VersionService`) don't need to return data from `on_connect` or `on_disconnect` handlers
- Integration tests can tolerate the first real event being a task/progress event instead of `connection_open`
- Input validation schemas (`SSEGatewayConnectCallback`, `SSEGatewayDisconnectCallback`) remain necessary for parsing and routing callback payloads

## 2) Affected Areas & File Map (with repository evidence)

- Area: `app/api/sse.py` — `handle_callback` function (connect action)
- Why: Remove code that builds and returns `SSEGatewayCallbackResponse` with `connection_open` event; return empty JSON response (`jsonify({})`) instead
- Evidence: `app/api/sse.py:159-167` — Currently creates response with event: `response = SSEGatewayCallbackResponse(event=SSEGatewayEventData(name="connection_open", data='{"status": "connected"}'))`

---

- Area: `app/api/sse.py` — `handle_callback` function (disconnect action)
- Why: Verify disconnect response is consistent with connect behavior (both return `jsonify({})`)
- Evidence: `app/api/sse.py:194` — Currently returns `jsonify({})`, no change needed (already correct)

---

- Area: `app/api/sse.py` — Import statements
- Why: Remove imports of `SSEGatewayCallbackResponse` and `SSEGatewayEventData` (response-only schemas). **Retain** imports of `SSEGatewayConnectCallback` and `SSEGatewayDisconnectCallback` (input validation schemas still needed for parsing callback payloads at lines 140, 171).
- Evidence: `app/api/sse.py:11-16` — Schema imports to be partially removed

---

- Area: `tests/test_sse_api.py` — `TestSSECallbackAPI.test_connect_callback_returns_connection_open_event`
- Why: Remove or update test that validates `connection_open` event in callback response
- Evidence: `tests/test_sse_api.py:93-116` — Test asserts: `assert json_data["event"]["name"] == "connection_open"`

---

- Area: `tests/integration/test_sse_gateway_tasks.py` — `test_connection_open_event_received_on_connect`
- Why: Remove test that expects `connection_open` as first event
- Evidence: `tests/integration/test_sse_gateway_tasks.py:20-52` — Test validates: `assert events[0]["event"] == "connection_open"`

---

- Area: `tests/integration/test_sse_gateway_tasks.py` — Multiple task progress tests
- Why: Update tests to not expect `connection_open` in events list
- Evidence: `tests/integration/test_sse_gateway_tasks.py:156-249` — Multiple assertions checking `events[0]["event"] == "connection_open"`

---

- Area: `tests/integration/test_task_stream_baseline.py` — `test_connection_open_event_received_immediately`
- Why: Remove test that validates immediate `connection_open` event
- Evidence: `tests/integration/test_task_stream_baseline.py:17-46` — Test validates: `assert events[0]["event"] == "connection_open"`

---

- Area: `tests/integration/test_task_stream_baseline.py` — Multiple baseline tests
- Why: Update assertions to not expect `connection_open` in event sequences
- Evidence: `tests/integration/test_task_stream_baseline.py:217-303` — Multiple tests assert `events[0]["event"] == "connection_open"`

---

- Area: `tests/integration/test_version_stream_baseline.py`
- Why: Update version stream tests to not expect `connection_open`
- Evidence: Pattern search shows this file contains `connection_open` references

---

- Area: `tests/test_sse_client_helper.py` — SSE client helper tests
- Why: Remove mock `connection_open` events from test data
- Evidence: `tests/test_sse_client_helper.py:42-84` — Mock data includes: `("connection_open", {"status": "connected"})`

---

- Area: `app/schemas/sse_gateway_schema.py` — Schema definitions
- Why: Remove `SSEGatewayCallbackResponse` and `SSEGatewayEventData` schemas (response-only schemas that are no longer used)
- Evidence: `app/schemas/sse_gateway_schema.py:38-53` — Response schema definitions that are no longer needed. Keep input schemas `SSEGatewayConnectCallback` (lines 17-24) and `SSEGatewayDisconnectCallback` (lines 27-35) for payload validation.

## 3) Data Model / Contracts

- Entity / contract: `SSEGatewayCallbackResponse` and `SSEGatewayEventData` (Pydantic response schemas)
- Shape: These response-only schemas will be completely removed from `app/schemas/sse_gateway_schema.py`
- Refactor strategy: Direct removal. No backward compatibility needed since SSE Gateway does not use callback response bodies at all. Input validation schemas (`SSEGatewayConnectCallback`, `SSEGatewayDisconnectCallback`) will be retained as they are necessary for parsing and validating callback payloads.
- Evidence: `app/schemas/sse_gateway_schema.py:38-53` (response schemas) vs `app/schemas/sse_gateway_schema.py:17-35` (input schemas, kept)

---

- Entity / contract: SSE Gateway callback endpoint response
- Shape: Change from structured JSON response to empty JSON response:
  ```python
  # Before (connect): returns {"event": {"name": "connection_open", "data": "..."}}
  # Before (disconnect): returns {}
  # After (both): returns {} (empty JSON object via jsonify({}))
  ```
- Refactor strategy: Direct replacement using Flask's `jsonify({})` for both connect and disconnect callbacks. This approach is chosen over empty string (`""`) because:
  1. **Idiomatic Flask**: `jsonify({})` is the standard Flask pattern for empty JSON responses
  2. **Proper Content-Type**: Sets `Content-Type: application/json` header automatically
  3. **Already in use**: Disconnect handler already uses `jsonify({})` at line 194
  4. **SSE Gateway compatible**: Gateway ignores response body, only checks HTTP status code
- No backward compatibility needed since SSE Gateway does not read callback response bodies - only HTTP status codes matter
- Evidence: `app/api/sse.py:160-194`

---

- Entity / contract: SSE event stream to clients
- Shape: Remove `connection_open` event from event stream. First event will now be actual task/version events instead of connection handshake.
  ```python
  # Before: connection_open -> task_event -> task_event -> connection_close
  # After: task_event -> task_event -> connection_close
  ```
- Refactor strategy: Direct removal, no fallback needed since frontend doesn't use this event
- Evidence: `app/api/sse.py:160-167` and integration test patterns

## 4) API / Integration Surface

- Surface: POST `/api/sse/callback` (connect action)
- Inputs: `SSEGatewayConnectCallback` JSON payload with action="connect", token, request.url
- Outputs: Empty JSON response `{}` via `jsonify({})` with HTTP 200 (previously returned structured callback response with `connection_open` event)
- Errors: No change to error responses (400/401/500)
- Evidence: `app/api/sse.py:95-167`

---

- Surface: POST `/api/sse/callback` (disconnect action)
- Inputs: `SSEGatewayDisconnectCallback` JSON payload with action="disconnect", token, reason, request.url (schema validation remains)
- Outputs: Empty JSON response `{}` via `jsonify({})` with HTTP 200 (no change from current behavior)
- Errors: No change to error responses
- Evidence: `app/api/sse.py:169-194`

---

- Surface: SSE event streams (via SSE Gateway to clients)
- Inputs: Client connects to `/api/sse/tasks?task_id=X` or `/api/sse/utils/version/stream?request_id=Y`
- Outputs: Stream of SSE events without initial `connection_open` event. First event will be `task_event` or version event.
- Errors: No change to error handling or `connection_close` events
- Evidence: Integration test patterns showing event sequences

## 5) Algorithms & State Machines (step-by-step)

- Flow: SSE Gateway connect callback handling
- Steps:
  1. Receive POST to `/api/sse/callback` with action="connect"
  2. Authenticate request (production mode only)
  3. Validate payload as `SSEGatewayConnectCallback`
  4. Route URL to service type (task vs version)
  5. Call service `on_connect(callback, identifier)`
  6. ~~Build `SSEGatewayCallbackResponse` with `connection_open` event~~ (REMOVED)
  7. Return empty JSON response via `jsonify({})` with HTTP 200
- States / transitions: None (stateless request handling)
- Hotspots: No performance concerns; simplification reduces response serialization overhead
- Evidence: `app/api/sse.py:138-167`

---

- Flow: SSE event stream to client
- Steps:
  1. Client connects to SSE Gateway
  2. Gateway calls Python `/api/sse/callback` (connect)
  3. Python registers connection in ConnectionManager
  4. ~~Python returns `connection_open` event in callback response~~ (REMOVED)
  5. ~~Gateway forwards `connection_open` to client~~ (REMOVED)
  6. Task/service generates events and sends via Gateway `/internal/send`
  7. Gateway forwards events to client
  8. Task completes, sends final event with close=true
  9. Client receives `connection_close` event
- States / transitions: None
- Hotspots: No change to event delivery latency
- Evidence: Integration test flow patterns

## 6) Derived State & Invariants (stacked bullets)

- Derived value: Active connection registry (ConnectionManager._connections)
  - Source: Unfiltered callback tokens from SSE Gateway connect callbacks (`SSEGatewayConnectCallback`)
  - Writes / cleanup: `on_connect` registers (identifier, token, url) tuple in ConnectionManager; `on_disconnect` removes by identifier; `send_event` uses identifier to find token for Gateway `/internal/send` calls
  - Guards: Disconnect callback for unknown URL logs and accepts (app/api/sse.py:175-181) to prevent errors from stale disconnects or race conditions
  - Invariant: Every registered connection (`on_connect`) must eventually be cleaned up (`on_disconnect`); tokens must remain valid for `send_event` between registration and cleanup; tokens must not be reused
  - Evidence: `app/services/task_service.py:192` (on_connect registration), `app/api/sse.py:186-189` (on_disconnect cleanup)

---

- Derived value: Stream routing identifier (format: `task:{task_id}` or `version:{request_id}`)
  - Source: Filtered from callback URL parsing via `_route_to_service()` function at `app/api/sse.py:143`
  - Writes / cleanup: Identifier determines which service (TaskService vs VersionService) handles `on_connect`/`on_disconnect`; ConnectionManager uses identifier as key for `send_event` routing
  - Guards: URL routing validation returns 400 for unknown patterns on connect (lines 144-147); disconnect accepts unknown URLs (lines 175-181) to handle race conditions where connection was already cleaned up
  - Invariant: Identifier must be derivable from callback URL for entire connection lifetime; services must agree on identifier format (task: prefix for tasks, version: prefix for version streams)
  - Evidence: `app/api/sse.py:143-157` (routing logic for connect), `app/api/sse.py:173-189` (routing logic for disconnect)

---

- Derived value: SSE event sequence ordering (task/version events → connection_close)
  - Source: Unfiltered task progress events generated by TaskService._tasks state machine or version events from VersionService
  - Writes / cleanup: ConnectionManager.send_event posts events to Gateway `/internal/send` endpoint; final event has close=True triggering stream termination and cleanup
  - Guards: Integration tests validate event ordering; `connection_close` event must be last event; services ensure proper event sequencing
  - Invariant: After removing `connection_open`, first event received by client must be a task/version event (not connection handshake); `connection_close` must remain final event in all scenarios (success, error, not found)
  - Evidence: `app/api/sse.py:160-167` (event stream contract), integration test scenarios expecting `connection_close` as final event

**Note on this change:** The refactoring does not modify these invariants - it only removes the `connection_open` event from the sequence. All connection lifecycle state management remains unchanged.

## 7) Consistency, Transactions & Concurrency

- Transaction scope: N/A (no database operations in callback handler)
- Atomic requirements: N/A
- Retry / idempotency: Callbacks are already idempotent (connect/disconnect can be called multiple times safely)
- Ordering / concurrency controls: No change (ConnectionManager handles concurrent connections)
- Evidence: `app/api/sse.py:95-204` shows no database session usage

**Note:** This change only affects response formatting in the callback handler. No transaction or concurrency concerns.

## 8) Errors & Edge Cases

- Failure: Client connects but expects `connection_open` event
- Surface: SSE event stream via Gateway
- Handling: No handling needed; event is simply not sent. Clients don't use this event per requirements.
- Guardrails: Integration tests validate event streams still work without `connection_open`
- Evidence: Change brief states frontend doesn't use `connection_open`

---

- Failure: SSE Gateway still expects structured callback response
- Surface: `/api/sse/callback` endpoint
- Handling: SSE Gateway ignores response body (only checks status code), so empty JSON is safe
- Guardrails: Integration tests validate full callback flow with actual Gateway
- Evidence: `docs/features/sse_callback_cleanup/change_brief.md:15` — "SSE Gateway now only returns empty responses" (meaning it ignores response bodies)

---

- Failure: Test failures due to missing `connection_open` events
- Surface: Test suite (unit and integration)
- Handling: Update all tests to not expect `connection_open` in event sequences
- Guardrails: Run full test suite before considering change complete
- Evidence: Multiple test files reference `connection_open` (see file map section)

## 9) Observability / Telemetry

- Signal: Existing connection logs
- Type: Structured log
- Trigger: TaskService/VersionService `on_connect` handlers log connection registration
- Labels / fields: task_id, token, url
- Consumer: Application logs
- Evidence: `app/services/task_service.py:189` — `logger.info(f"Task stream connection: task_id={task_id}, token={token}")`

**Note:** No new observability needed. Existing connection logging remains unchanged. The removal of `connection_open` event doesn't affect our ability to monitor SSE connections.

## 10) Background Work & Shutdown

- Worker / job: N/A
- Trigger cadence: N/A
- Responsibilities: N/A
- Shutdown handling: N/A
- Evidence: N/A

**Justification:** This change only affects HTTP request/response handling in the callback endpoint. No background threads, workers, or shutdown coordination involved.

## 11) Security & Permissions (if applicable)

Not applicable. This change doesn't introduce new authentication/authorization touchpoints or security concerns. The existing secret-based authentication for production SSE Gateway callbacks remains unchanged.

## 12) UX / UI Impact (if applicable)

Not applicable. No UI changes. The frontend doesn't use the `connection_open` event per requirements, so its removal has no user-facing impact.

## 13) Deterministic Test Plan (new/changed behavior only)

- Surface: `/api/sse/callback` endpoint (connect action)
- Scenarios:
  - Given valid connect callback payload, When handler processes it, Then response is empty JSON `{}` with HTTP 200
  - **Explicit assertions:** response.get_json() == {}, response.status_code == 200, response does NOT contain "event" or "connection_open" keys
  - Given TaskService connect callback, When handler routes to service, Then service on_connect is called and empty JSON response returned
  - Given VersionService connect callback, When handler routes to service, Then service on_connect is called and empty JSON response returned
- Fixtures / hooks: Use existing mock services (TaskService, VersionService) from DI container overrides
- Gaps: None
- Evidence: `tests/test_sse_api.py:30-91` — Existing callback routing tests

---

- Surface: `/api/sse/callback` endpoint (disconnect action)
- Scenarios:
  - Given valid disconnect callback payload, When handler processes it, Then response is empty JSON `{}` with HTTP 200
  - **Explicit assertions:** response.get_json() == {}, response.status_code == 200, response does NOT contain any keys (already current behavior, no change needed)
  - Given disconnect callback with valid schema, When handler validates payload, Then SSEGatewayDisconnectCallback validation succeeds and on_disconnect is called
- Fixtures / hooks: Use existing mock services from DI container overrides
- Gaps: None
- Evidence: `tests/test_sse_api.py` — Existing disconnect tests validate this behavior

---

- Surface: SSE event streams (integration)
- Scenarios:
  - Given client connects to task stream, When receiving events, Then first event is `task_event` not `connection_open`
  - Given task completes successfully, When stream closes, Then last event is `connection_close`
  - Given task encounters error, When stream sends error event, Then `connection_close` follows error
  - Given version stream connection, When receiving events, Then first event is version data not `connection_open`
- Fixtures / hooks: Use existing `sse_gateway_server` and `sse_server` fixtures for end-to-end tests
- Gaps: None
- Evidence: `tests/integration/test_sse_gateway_tasks.py:54-93` — Existing event stream validation

---

- Surface: SSEClient helper (test utility)
- Scenarios:
  - Given mock SSE stream without `connection_open`, When client parses stream, Then events are correctly parsed
  - Given event stream starts with task event, When collecting events, Then no errors occur
- Fixtures / hooks: Update mock SSE response strings in test data
- Gaps: None
- Evidence: `tests/test_sse_client_helper.py:35-75` — SSEClient parsing tests

---

- Surface: Legacy test cleanup
- Scenarios:
  - Given test `test_connection_open_event_received_immediately`, When running test suite, Then this test is removed
  - Given test `test_connect_callback_returns_connection_open_event`, When running test suite, Then this test is removed or updated to validate empty JSON response
- Fixtures / hooks: None needed
- Gaps: None
- Evidence: Test file map (section 2) lists tests to remove/update

## 14) Implementation Slices (only if large)

Not applicable. This is a small, focused change that should be implemented atomically:

1. Update all tests to not expect `connection_open` events (tests will fail initially, which is expected)
2. Update `app/api/sse.py` connect callback handler (lines 159-167) to return `jsonify({})` instead of `SSEGatewayCallbackResponse`
3. Verify disconnect handler consistency (line 194 already returns `jsonify({})`, no change needed)
4. Remove `SSEGatewayCallbackResponse` and `SSEGatewayEventData` schemas from `app/schemas/sse_gateway_schema.py`
5. Remove imports of deleted schemas from `app/api/sse.py` (retain `SSEGatewayConnectCallback` and `SSEGatewayDisconnectCallback`)
6. Add explicit test assertions for empty JSON response format
7. Run full test suite (`pytest tests/`) to validate all changes

All changes are tightly coupled and should be done together. The order above ensures tests are updated first to clarify expected behavior, then implementation changes are made, then cleanup is performed.

## 15) Risks & Open Questions

- Risk: Unidentified frontend code depends on `connection_open` event
- Impact: Frontend SSE listeners could break if they filter for this event
- Mitigation: Change brief explicitly states frontend doesn't use this event; verify with frontend codebase search if available

---

- Risk: SSE Gateway rejects empty JSON response format
- Impact: If Gateway has undocumented requirements for callback responses, callbacks could fail
- Mitigation: Using `jsonify({})` (standard Flask pattern) sets proper Content-Type headers and is already used in disconnect handler; integration tests with real Gateway subprocess will catch any issues immediately; disconnect handler already demonstrates Gateway accepts empty JSON

---

- Risk: Test updates incomplete
- Impact: Forgotten tests fail after implementation
- Mitigation: Run full test suite (`pytest tests/`) and search codebase for all `connection_open` references before considering complete

## 16) Confidence

Confidence: High — This is a straightforward code removal with clear requirements. The SSE Gateway contract change is already implemented (per change brief), and we're just cleaning up unused backend code. Integration tests provide strong validation that the callback flow works correctly.
