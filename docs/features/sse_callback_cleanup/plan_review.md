# SSE Callback Cleanup — Plan Review

## 1) Summary & Decision

**Readiness**

The plan is well-structured and comprehensive, covering all necessary areas for removing obsolete SSE callback response handling and the `connection_open` event. Research findings are thorough, affected areas are clearly mapped with evidence, and test coverage is explicitly planned. However, there are **three major issues**: (1) the plan proposes returning empty string responses but Flask's `jsonify({})` is already effectively empty and more idiomatic, (2) critical ambiguity about whether input validation schemas (`SSEGatewayConnectCallback`, `SSEGatewayDisconnectCallback`) should be retained, and (3) insufficient justification for the "no derived state" claim when connection lifecycle tracking exists.

**Decision**

`GO-WITH-CONDITIONS` — Plan is implementable but requires clarification on response format (empty string vs empty JSON), explicit confirmation that input schemas are retained, and stronger reasoning about connection state invariants.

## 2) Conformance & Fit (with evidence)

**Conformance to refs**

- `docs/commands/plan_feature.md` — Pass — `plan.md:0-384` — Plan follows all required sections (0-16) with proper templates, evidence quotes, and structured format. Research log is thorough.
- `docs/product_brief.md` — Pass — N/A — Feature is backend infrastructure cleanup, not user-facing inventory functionality. No product brief conflicts.
- `CLAUDE.md` (Development Guidelines) — Pass — `plan.md:297-340` — Test plan follows Definition of Done requirements: service tests, API tests, integration tests with fixtures.
- `docs/commands/review_plan.md` — Pass — Plan structure matches all expected headings and provides evidence with file:line citations throughout.

**Fit with codebase**

- `app/api/sse.py` (callback handler) — `plan.md:70-85` — Plan correctly identifies lines 159-167 (connect response building) and line 194 (disconnect response) as targets for change. Evidence matches current code structure.
- `app/schemas/sse_gateway_schema.py` — `plan.md:130-139` — **Minor ambiguity**: Plan states "Remove `SSEGatewayCallbackResponse` and `SSEGatewayEventData` schemas" but also says "Keep `SSEGatewayConnectCallback` and `SSEGatewayDisconnectCallback` schemas (needed for input validation)". This is correct but should be more explicit about *why* input schemas are retained (they parse and validate incoming callback payloads).
- Test files (unit and integration) — `plan.md:88-128` — Comprehensive mapping of all test files referencing `connection_open`. Evidence shows 8+ test files affected.
- `app/services/task_service.py` and `app/services/version_service.py` — `plan.md:23-24` — Plan correctly notes services only register connections and don't depend on callback response data.

## 3) Open Questions & Ambiguities

- Question: Should the callback response be an empty string (`""`) or empty JSON (`{}`)?
- Why it matters: The plan proposes returning empty string (plan.md:144-149, 166-177) but Flask's `jsonify({})` is idiomatic, sets proper Content-Type, and is already used in the disconnect handler (app/api/sse.py:194). The SSE Gateway accepts both, but consistency matters.
- Needed answer: Explicit decision on response format with justification. If empty string is chosen, explain why it's preferable to empty JSON. If empty JSON is chosen, update plan sections 3 and 4.

---

- Question: Are input validation schemas (`SSEGatewayConnectCallback`, `SSEGatewayDisconnectCallback`) definitely kept?
- Why it matters: Plan states they're retained (plan.md:46-48, 66) but section 2 File Map says "Remove imports of deleted schemas throughout the codebase" (plan.md:83-84) which could be misinterpreted as removing *all* schema imports including input schemas.
- Needed answer: Explicit confirmation in section 2 that input schemas are **not** removed, only response schemas. Update import removal guidance to clarify: "Remove imports of `SSEGatewayCallbackResponse` and `SSEGatewayEventData` only; retain `SSEGatewayConnectCallback` and `SSEGatewayDisconnectCallback`."

---

- Question: How do we validate that no frontend code depends on `connection_open`?
- Why it matters: Risk section (plan.md:365-367) acknowledges this risk but mitigation is "verify with frontend codebase search if available". If frontend is in a separate repo (likely given backend-only context), this verification might be skipped.
- Needed answer: Either (a) confirm frontend verification has been done, or (b) document this as a residual risk with rollback plan if frontend breaks.

## 4) Deterministic Backend Coverage (new/changed behavior only)

- Behavior: POST `/api/sse/callback` (connect action) returns empty response
- Scenarios:
  - Given valid connect callback payload, When handler processes it, Then response body is empty (either `""` or `{}`) with HTTP 200 (`tests/test_sse_api.py::test_connect_callback_returns_empty_response`)
  - Given connect callback with task URL, When TaskService.on_connect is called, Then connection is registered and empty response returned (existing test to be updated: `tests/test_sse_api.py::test_connect_callback_routes_to_task_service`)
  - Given connect callback with version URL, When VersionService.on_connect is called, Then connection is registered and empty response returned (existing test to be updated: `tests/test_sse_api.py::test_connect_callback_routes_to_version_service`)
- Instrumentation: Existing connection logs in TaskService/VersionService `on_connect` handlers (app/services/task_service.py:189)
- Persistence hooks: No database persistence; connection state managed in-memory by ConnectionManager
- Gaps: None — explicit test assertions for empty response format are planned (plan.md:300-302)
- Evidence: `plan.md:298-307`

---

- Behavior: POST `/api/sse/callback` (disconnect action) returns empty response
- Scenarios:
  - Given valid disconnect callback payload, When handler processes it, Then response body is empty with HTTP 200 (new test: `tests/test_sse_api.py::test_disconnect_callback_returns_empty_response`)
  - Given disconnect callback validates schema, When handler processes it, Then SSEGatewayDisconnectCallback validation succeeds and on_disconnect is called (plan.md:314)
- Instrumentation: Existing disconnect logs in services
- Persistence hooks: ConnectionManager cleans up connection state
- Gaps: None — explicit empty response test planned
- Evidence: `plan.md:310-318`

---

- Behavior: SSE event streams no longer emit `connection_open` as first event
- Scenarios:
  - Given client connects to task stream, When receiving events, Then first event is `task_event` not `connection_open` (update to `tests/integration/test_sse_gateway_tasks.py::test_task_progress_events_received_via_gateway`)
  - Given task completes successfully, When stream closes, Then last event is `connection_close` (existing test validates this)
  - Given task not found, When stream sends error, Then events are error + connection_close without connection_open prefix (update to `tests/integration/test_sse_gateway_tasks.py::test_task_not_found_closes_connection`)
  - Given version stream connection, When receiving events, Then first event is version data not `connection_open` (update to `tests/integration/test_version_stream_baseline.py`)
- Instrumentation: SSE event logging in ConnectionManager.send_event
- Persistence hooks: N/A (event streaming only)
- Gaps: **Minor** — Plan should explicitly state that `connection_close` event must remain the last event in all scenarios (plan.md:324 mentions this but not as an explicit test scenario)
- Evidence: `plan.md:320-330`

---

- Behavior: SSEClient test helper parses streams without `connection_open`
- Scenarios:
  - Given mock SSE stream without `connection_open`, When client parses stream, Then events are correctly parsed (plan.md:334-337)
  - Given event stream starts with task event, When collecting events, Then no errors occur
- Instrumentation: N/A (test utility only)
- Persistence hooks: N/A
- Gaps: None
- Evidence: `plan.md:332-339`

## 5) Adversarial Sweep (must find ≥3 credible issues or declare why none exist)

**Major — Input Schema Imports Will Be Incorrectly Removed**

**Evidence:** `plan.md:82-84` — "Area: `app/api/sse.py` — Import statements. Why: Remove unused imports of `SSEGatewayCallbackResponse` and `SSEGatewayEventData` schemas (keep input validation schemas)"

**Why it matters:** The parenthetical "(keep input validation schemas)" is easy to miss. An implementer following the File Map entry "Remove unused imports of SSEGatewayCallbackResponse and SSEGatewayEventData schemas" might also remove `SSEGatewayConnectCallback` and `SSEGatewayDisconnectCallback` imports because they see "remove SSE Gateway schema imports" in the import block (app/api/sse.py:11-16). This would break payload validation (lines 140, 171).

**Fix suggestion:** Make import guidance explicit and unambiguous in section 2. Change plan.md:82-84 to:
```
- Area: `app/api/sse.py` — Import statements
- Why: Remove imports of `SSEGatewayCallbackResponse` and `SSEGatewayEventData` (response-only schemas). **Retain** imports of `SSEGatewayConnectCallback` and `SSEGatewayDisconnectCallback` (input validation schemas still needed).
- Evidence: `app/api/sse.py:11-16` — Schema imports to be partially removed
```

**Confidence:** High

---

**Major — Response Format Inconsistency Not Addressed**

**Evidence:** `plan.md:144-149` (contract change to empty string) vs `app/api/sse.py:194` (current disconnect returns `jsonify({})`)

**Why it matters:** The plan proposes returning empty string (`""`) for both connect and disconnect (plan.md:144-149, 166-167) but doesn't justify why this is better than Flask's idiomatic `jsonify({})` which sets proper Content-Type header and is already used in disconnect handler. If SSE Gateway truly doesn't read response bodies, then `jsonify({})` is safer and more conventional than `return "", 200`. Empty string responses are unusual in REST APIs and might break SSE Gateway assumptions about Content-Type.

**Fix suggestion:** Add explicit analysis to section 3 (Data Model / Contracts):
```
- Response format decision: Empty JSON (`jsonify({})`) vs empty string (`""`)
- Rationale: [Choose one]
  Option A: Use `jsonify({})` for both — idiomatic Flask, sets Content-Type: application/json, already used in disconnect handler, safe default
  Option B: Use `""` for both — truly empty response body, minimal bytes over wire, requires explicit Response object
- Evidence: SSE Gateway contract acceptance testing (integration tests will validate chosen format)
```

**Confidence:** High

---

**Major — Derived State Section Prematurely Dismisses Connection Lifecycle**

**Evidence:** `plan.md:220-231` — "Justification for no derived state entries: This change removes code rather than adding stateful behavior. The SSE callback handling is purely request/response with no persistent state..."

**Why it matters:** While the *callback response* is stateless, the callback *triggers* stateful behavior: `ConnectionManager.on_connect()` creates derived connection state (identifier → token → url mapping) that drives cleanup in `on_disconnect()`. The plan's justification focuses only on the callback handler itself, not the connection lifecycle it orchestrates. Section 6 explicitly requires "≥3 entries or justified 'none; proof'" with focus on derived values affecting storage/cleanup.

**Fix suggestion:** Replace section 6 with actual connection lifecycle invariants:
```
- Derived value: Active connection registry (ConnectionManager._connections)
  - Source dataset: Unfiltered callback payloads (SSEGatewayConnectCallback tokens)
  - Writes / cleanup triggered: on_connect adds entry, on_disconnect removes entry, send_event uses entry
  - Guards: Token-based lookup; disconnect callback may arrive for already-removed tokens (stale disconnect)
  - Invariant: Every on_connect must have exactly one matching on_disconnect; tokens must not be reused
  - Evidence: `app/services/task_service.py:192` (on_connect registration), disconnect cleanup

- Derived value: Task stream routing (identifier → task_id mapping)
  - Source dataset: Filtered from callback URL parsing (plan.md:143 _route_to_service)
  - Writes / cleanup triggered: ConnectionManager uses identifier for send_event routing
  - Guards: URL routing validation (plan.md:144-147); unknown URLs return 400 on connect but log-and-accept on disconnect
  - Invariant: identifier must be derivable from URL for entire connection lifetime
  - Evidence: `app/api/sse.py:143-157` (routing logic)

- Derived value: SSE Gateway token validity window
  - Source dataset: Gateway-issued tokens in connect callback
  - Writes / cleanup triggered: send_event posts to Gateway /internal/send; invalid tokens cause Gateway errors
  - Guards: No explicit timeout; token remains valid until Gateway calls disconnect callback
  - Invariant: Tokens from Gateway are valid for send_event between on_connect and on_disconnect
  - Evidence: ConnectionManager send_event implementation, Gateway contract
```

**Confidence:** Medium (connection state exists but removal of `connection_open` doesn't change these invariants)

---

**Minor — Test Slice Ordering Could Leave Broken Tests**

**Evidence:** `plan.md:351-361` — Implementation approach says "All changes are tightly coupled and should be done together" but lists steps 1-5 sequentially. Step 2 (update sse.py to return empty) and step 4 (remove/update tests) could be done in wrong order.

**Why it matters:** If implementer does steps 1-3 (remove schemas, change handler, remove imports) before step 4 (update tests), running `pytest` mid-implementation will show confusing failures. Better to update tests first or do schema removal last.

**Fix suggestion:** Reorder steps in section 14:
```
1. Update all tests to not expect `connection_open` events (makes tests fail initially)
2. Update `app/api/sse.py` handle_callback to return empty response for connect
3. Update disconnect handler for consistency
4. Remove `SSEGatewayCallbackResponse` and `SSEGatewayEventData` schemas
5. Remove imports of deleted schemas from `app/api/sse.py`
6. Add explicit empty response assertions to tests
7. Run full test suite to validate
```

**Confidence:** Low (this is implementation order preference, not a correctness issue)

## 6) Derived-Value & Persistence Invariants (stacked entries)

- Derived value: Active connection registry (ConnectionManager._connections)
  - Source dataset: Unfiltered callback tokens from SSE Gateway connect callbacks
  - Write / cleanup triggered: on_connect registers (identifier, token, url) tuple; on_disconnect removes by identifier; send_event uses identifier to find token for Gateway /internal/send calls
  - Guards: Disconnect callback for unknown URL logs and accepts (plan.md:175-181); prevents errors from stale disconnects
  - Invariant: Every registered connection (on_connect) must eventually be cleaned up (on_disconnect); tokens must remain valid for send_event between registration and cleanup
  - Evidence: `app/services/task_service.py:192` (on_connect call), `plan.md:233-239` (transaction scope notes ConnectionManager handles state)

---

- Derived value: Stream routing identifier (task:{task_id} or version:{request_id})
  - Source dataset: Filtered from callback URL parsing via `_route_to_service()` function
  - Write / cleanup triggered: Identifier determines which service (TaskService vs VersionService) handles on_connect/on_disconnect; ConnectionManager uses identifier as key for send_event routing
  - Guards: URL routing validation returns 400 for unknown patterns on connect (plan.md:144-147); disconnect accepts unknown URLs to handle race conditions
  - Invariant: Identifier must be derivable from callback URL for entire connection lifetime; services must agree on identifier format
  - Evidence: `app/api/sse.py:143` (_route_to_service call), `plan.md:185-186` (service routing)

---

- Derived value: SSE event sequence ordering (task events → connection_close)
  - Source dataset: Unfiltered task progress events generated by TaskService._tasks state machine
  - Write / cleanup triggered: ConnectionManager.send_event posts events to Gateway /internal/send; final event has close=True triggering stream termination
  - Guards: Integration tests validate event ordering (plan.md:320-329); connection_close must be last event
  - Invariant: After removing connection_open, first event must be a task/version event (not connection handshake); connection_close must remain final event
  - Evidence: `plan.md:155-163` (event stream contract change), integration test scenarios

## 7) Risks & Mitigations (top 3)

- Risk: Frontend code depends on `connection_open` event despite requirements stating otherwise
- Mitigation: Search frontend codebase for "connection_open" string; add rollback plan to restore event if frontend breaks; consider phased rollout (backend changes first, verify frontend, then complete)
- Evidence: `plan.md:365-367` (risk identified but mitigation incomplete)

---

- Risk: SSE Gateway rejects empty response format or expects specific Content-Type header
- Mitigation: Integration tests with real Gateway subprocess (`tests/integration/test_sse_gateway_tasks.py`) will immediately detect callback failures; validate chosen response format (empty JSON vs empty string) works with Gateway before committing to approach
- Evidence: `plan.md:370-374` (risk identified), `plan.md:327` (integration tests as validation)

---

- Risk: Incomplete test updates leave `connection_open` assertions in untouched test files
- Mitigation: Run codebase-wide grep for "connection_open" (plan.md:379); update File Map (section 2) if new test files are found; include explicit checklist of 8+ test files to update
- Evidence: `plan.md:375-379` (risk identified), `plan.md:88-128` (comprehensive file map but grep validation needed)

## 8) Confidence

Confidence: Medium — Plan is thorough and implementable, but three Major findings (input schema import ambiguity, response format inconsistency, derived state dismissal) require clarification before implementation. Once these are addressed, confidence would be High. The core change is straightforward (remove obsolete code) but execution details matter for clean implementation.
