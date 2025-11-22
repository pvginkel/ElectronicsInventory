# SSE Gateway Integration — Code Review

## 1) Summary & Decision

**Readiness**

The SSE Gateway integration implements a comprehensive refactor replacing Python-based SSE generators with callback-based gateway architecture. The implementation delivers ConnectionManager service, SSE callback API endpoint, TaskService and VersionService refactoring, complete removal of old SSE endpoints, Pydantic schemas, Prometheus metrics integration, and 18 unit tests for ConnectionManager with mocked HTTP. The code demonstrates strong adherence to layering principles (API → Service → ConnectionManager), proper thread safety with RLock, and comprehensive error handling. However, several blocking and major issues prevent immediate deployment: missing API endpoint tests, incomplete VersionService backward compatibility logic, lack of SSE blueprint registration, missing integration tests with real SSE Gateway (deferred per plan but critical gap), and potential race condition in TaskProgressHandle event sending.

**Decision**

`GO-WITH-CONDITIONS` — Implementation is 85% complete with solid foundation but requires fixes to 1 blocker (blueprint registration), 4 major issues (API tests, VersionService backward compat, race condition, integration test gap), and minor enhancements before production deployment.

---

## 2) Conformance to Plan (with evidence)

**Plan alignment**

- Plan Section 2 (File Map) → `app/services/connection_manager.py:1-328` — ConnectionManager Singleton with bidirectional token mappings, RLock for thread safety, HTTP POST to SSE Gateway
- Plan Section 2 (File Map) → `app/schemas/sse_gateway_schema.py:1-64` — Pydantic schemas for connect/disconnect callbacks and send requests
- Plan Section 2 (File Map) → `app/api/sse.py:1-195` — SSE callback endpoint with URL routing, secret authentication, service delegation
- Plan Section 2 (File Map) → `app/services/task_service.py:88-98,171-176,208-276` — on_connect/on_disconnect handlers, ConnectionManager injection, event sending via gateway
- Plan Section 2 (File Map) → `app/services/version_service.py:29-38,58-102,158-188` — on_connect/on_disconnect handlers, pending events flush, ConnectionManager integration
- Plan Section 2 (File Map) → `app/api/tasks.py:1-11` (deletion) — Old Python SSE endpoint removed entirely (61 lines deleted)
- Plan Section 2 (File Map) → `app/api/utils.py:1-5` (deletion) — Old version stream endpoint removed (122 lines deleted)
- Plan Section 2 (File Map) → `app/config.py:176-186` — SSE_GATEWAY_URL and SSE_CALLBACK_SECRET environment variables added
- Plan Section 2 (File Map) → `app/services/container.py:106-114,176,221` — ConnectionManager Singleton provider wired into TaskService and VersionService
- Plan Section 2 (File Map) → `app/services/metrics_service.py:149-179,468-491,878-928` — MetricsServiceProtocol abstract methods and MetricsService implementation for SSE Gateway metrics
- Plan Section 2 (File Map) → `tests/test_connection_manager.py:1-423` — 18 unit tests covering connect, disconnect, send_event, stale handling, concurrency, 404 cleanup
- Plan Section 2 (File Map) → `tests/test_task_service.py:28-33,60,182-407` — Updated tests with mock ConnectionManager, verifies send_event calls, progress handle refactored
- Plan Section 13 (Test Plan) → `tests/test_connection_manager.py` — All 18 scenarios from test plan implemented and passing

**Gaps / deviations**

- Plan Section 2 (File Map) → `app/__init__.py:65` wiring added BUT blueprint registration missing (see Blocker finding below)
- Plan Section 2 (File Map) → Integration test files (`tests/integration/test_sse_gateway_tasks.py`, `tests/integration/test_sse_gateway_version.py`, `tests/integration/sse_gateway_helper.py`) intentionally deferred per user note but represent significant gap
- Plan Section 2 (File Map) → API endpoint tests (`tests/test_sse_api.py` or equivalent) completely missing (see Major finding below)
- Plan Section 2 (File Map) → `tests/test_version_service.py` updates mentioned but not included in diff (unknown if implemented)
- Plan Section 3 (Contracts) → SSE_CALLBACK_SECRET empty string default matches plan, but production enforcement logic in `app/api/sse.py:38-46` correct
- Plan Section 5 (Algorithms) → Connection replacement flow correctly implemented in `connection_manager.py:72-88` with old connection close before new registration
- Plan Section 5 (Algorithms) → Disconnect handling with token verification correctly prevents stale disconnect race (`connection_manager.py:119-158`)
- Plan Section 5 (Algorithms) → Pending version events flush on connect implemented (`version_service.py:69-83`)

---

## 3) Correctness — Findings (ranked)

### Blocker Findings

- Title: `Blocker — SSE blueprint not registered in Flask app`
- Evidence: `app/__init__.py:65` — Module wired: `'app.api.sse'` BUT no blueprint registration found in `create_app()` function; `app/api/sse.py:24` defines `sse_bp = Blueprint("sse", ...)` but never imported/registered
- Impact: SSE Gateway callback endpoint `/api/sse/callback` returns 404; all SSE connections fail because callback cannot reach Python backend
- Fix: Add blueprint registration in `app/__init__.py` after line 48 (where other blueprints registered): `from app.api.sse import sse_bp` and `flask_app.register_blueprint(sse_bp)`
- Confidence: High

**Test sketch:**
```python
def test_sse_callback_endpoint_registered(client):
    """Verify SSE callback endpoint is reachable."""
    # Send minimal connect callback
    response = client.post("/api/sse/callback", json={"action": "connect", "token": "test", "request": {"url": "/api/sse/tasks?task_id=abc"}})
    # Should NOT be 404 (may be 400 or 401, but endpoint must exist)
    assert response.status_code != 404
```

---

### Major Findings

- Title: `Major — No API endpoint tests for SSE callback handler`
- Evidence: `app/api/sse.py:95-195` defines `handle_callback()` with routing, authentication, validation BUT `tests/` contains no tests for this endpoint; plan section 13 specifies 8 required scenarios for callback API
- Impact: Critical API layer untested; routing bugs, authentication bypass, or validation failures could reach production
- Fix: Create `tests/test_sse_api.py` with Flask test client covering: (1) connect callback routing to task/version services, (2) secret authentication in production mode, (3) dev mode skips auth, (4) disconnect callback handling, (5) unknown URL pattern returns 400, (6) invalid JSON returns 400, (7) unknown action returns 400, (8) ValidationError handling
- Confidence: High

**Test sketch:**
```python
def test_connect_callback_task_routing(client, mock_task_service):
    """Test connect callback routes to TaskService."""
    payload = {
        "action": "connect",
        "token": "test-token",
        "request": {"url": "/api/sse/tasks?task_id=abc123", "headers": {}}
    }
    response = client.post("/api/sse/callback", json=payload)
    assert response.status_code == 200
    mock_task_service.on_connect.assert_called_once()

def test_authentication_production_mode(client, monkeypatch):
    """Test secret authentication enforced in production."""
    monkeypatch.setenv("FLASK_ENV", "production")
    monkeypatch.setenv("SSE_CALLBACK_SECRET", "my-secret")
    # Without secret in query param
    response = client.post("/api/sse/callback?secret=wrong", json={"action": "connect", ...})
    assert response.status_code == 401
```

---

- Title: `Major — VersionService backward compatibility logic incomplete`
- Evidence: `app/services/version_service.py:172-180` — Code checks `self._subscribers.get(request_id)` for "old Python SSE (for backward compatibility during migration)" but old `/api/utils/version/stream` endpoint completely removed in `app/api/utils.py:1-5`; no migration path exists
- Impact: Comment claims backward compatibility but implementation doesn't support it; dead code path creates maintenance confusion; if version events queued expecting old SSE, they'll never be consumed
- Fix: Remove backward compatibility logic (lines 172-180) and comment since old endpoint deleted; OR reinstate old endpoint temporarily with feature flag if gradual migration intended (not mentioned in plan)
- Confidence: High

**Failure reasoning:**
1. Old endpoint `GET /api/utils/version/stream` deleted entirely (122 lines removed)
2. VersionService checks `self._subscribers.get(request_id)` expecting old queue-based consumers
3. No endpoint exists to call `register_subscriber()` anymore (only on_connect via SSE Gateway)
4. Result: `_subscribers` dict never populated, backward compat check always fails, dead code

---

- Title: `Major — Potential race condition in TaskProgressHandle._send_progress_event`
- Evidence: `app/services/task_service.py:62-79` — Progress handle checks `has_connection()` and then calls `send_event()` without lock; connection could disconnect between check and send
- Impact: TOCTOU (time-of-check-time-of-use) race: connection closes after `has_connection()` returns True but before `send_event()` executes, causing warning logs for expected condition
- Fix: Remove `has_connection()` check; call `send_event()` directly and let ConnectionManager handle missing connection (already logs warning at debug level and returns False); OR queue event if send fails instead of just logging
- Confidence: Medium

**Failure reasoning:**
1. Thread 1: `has_connection("task:abc")` returns True (line 68)
2. Thread 2: Client disconnects, `on_disconnect()` removes mapping
3. Thread 1: Calls `send_event("task:abc", ...)` but connection gone (line 69-75)
4. Result: ConnectionManager logs "Cannot send event: no connection" (line 193-197) even though code tried to check first
5. Better: Let ConnectionManager always handle this gracefully (it already does) without TOCTOU check

---

- Title: `Major — Integration tests with real SSE Gateway missing (acknowledged gap)`
- Evidence: Plan section 2 lists `tests/integration/test_sse_gateway_tasks.py`, `test_sse_gateway_version.py`, `sse_gateway_helper.py` as deliverables; Glob search shows no files created; user note: "Integration tests with real SSE Gateway are intentionally not included in this implementation (deferred to follow-up work per plan)"
- Impact: HTTP contract between Python and SSE Gateway untested; JSON payload mismatches, URL routing bugs, callback timing issues won't be caught until production; regression risk if SSE Gateway updated
- Fix: Per plan section 14 (Implementation Slices), integration tests are slice 6 (final slice); must be delivered before production deployment; recommendation: prioritize as immediate follow-up work
- Confidence: High

**Rationale:**
- Unit tests mock HTTP responses; cannot validate actual SSE Gateway behavior
- Plan explicitly includes integration tests as mandatory deliverable (section 13)
- Deferring to follow-up acceptable for development but blocks production GO decision
- No substitute for end-to-end validation with real subprocess

---

### Minor Findings

- Title: `Minor — ConnectionManager uses time.perf_counter() for duration but time import unused`
- Evidence: `app/services/connection_manager.py:18` imports `time` but only uses `time.perf_counter()` (lines 203, 274); CLAUDE.md states "Always use time.perf_counter() for duration measurements"
- Impact: Code correctly uses `perf_counter()` per guidelines; no functional issue; import statement could be more precise for clarity
- Fix: Optional: Change `import time` to `from time import perf_counter` for explicitness
- Confidence: Low (cosmetic)

---

- Title: `Minor — TaskService stream_url format inconsistent with old behavior`
- Evidence: `app/services/task_service.py:174` returns `stream_url=f"/api/sse/tasks?task_id={task_id}"` (query param) vs old `f"/api/tasks/{task_id}/stream"` (path param); plan section 10 (Research) notes URL changes but doesn't specify if frontend updated
- Impact: Frontend SSE client connections will break if not updated to new URL format; no backward compatibility (per plan "no backwards compatibility: clean implementation")
- Fix: Document URL format change in migration guide; verify frontend updated before deployment; consider adding deprecation warning if old endpoint needed temporarily
- Confidence: Medium (depends on frontend coordination)

---

- Title: `Minor — VersionService.on_connect flushes pending events without error handling`
- Evidence: `app/services/version_service.py:69-83` — Loops through pending events and calls `send_event()` but doesn't check return value; if send fails, pending event silently lost
- Impact: Pending version events dropped on connection if SSE Gateway unavailable; no retry or re-queue
- Fix: Check `send_event()` return value; if False, re-queue event in `_pending_events` or log error with event details for debugging
- Confidence: Medium

---

## 4) Over-Engineering & Refactoring Opportunities

- Hotspot: None identified; implementation appropriately scoped
- Evidence: ConnectionManager focused on token mapping and HTTP send (single responsibility); API routing logic simple prefix matching (no over-abstraction); services delegate cleanly without extra layers
- Suggested refactor: N/A
- Payoff: Code maintainability is good; no unnecessary complexity

---

## 5) Style & Consistency

- Pattern: Consistent use of `time.perf_counter()` for duration measurement
- Evidence: `app/services/connection_manager.py:203,274` uses `perf_counter()` correctly per CLAUDE.md guidelines ("NEVER use time.time() for measuring durations")
- Impact: Proper monotonic timing; no system clock adjustment issues
- Recommendation: Continue pattern throughout codebase

---

- Pattern: Proper Pydantic schema validation with `model_validate()`
- Evidence: `app/api/sse.py:131,161` uses `SSEGatewayConnectCallback.model_validate(payload)` and `SSEGatewayDisconnectCallback.model_validate(payload)` correctly
- Impact: Type-safe validation with automatic error handling
- Recommendation: Pattern correctly applied

---

- Pattern: Dependency injection with `@inject` decorator and `Provide[]`
- Evidence: `app/api/sse.py:97-102` injects TaskService, VersionService, Settings via DI container; `app/services/container.py:106-114` defines ConnectionManager Singleton provider
- Impact: Testable services with proper lifecycle management
- Recommendation: DI pattern correctly implemented per CLAUDE.md

---

## 6) Tests & Deterministic Coverage (new/changed behavior only)

- Surface: ConnectionManager service
- Scenarios:
  - Given no existing connection, When `on_connect("task:abc", token, url)` called, Then store mapping and return success (`tests/test_connection_manager.py::TestConnectionManagerConnect::test_on_connect_new_connection`)
  - Given existing connection for same identifier, When `on_connect("task:abc", new_token, url)` called, Then POST close to old token, store new mapping (`tests/test_connection_manager.py::TestConnectionManagerConnect::test_on_connect_replaces_existing_connection`)
  - Given active connection, When `send_event("task:abc", event)` called, Then POST to /internal/send with token and event data; return success (`tests/test_connection_manager.py::TestConnectionManagerSendEvent::test_send_event_success`)
  - Given no connection for identifier, When `send_event("task:xyz", event)` called, Then log warning and return failure (no POST) (`tests/test_connection_manager.py::TestConnectionManagerSendEvent::test_send_event_no_connection`)
  - Given POST to /internal/send returns 404, When `send_event()` called, Then remove stale mapping and log warning (`tests/test_connection_manager.py::TestConnectionManagerSendEvent::test_send_event_404_removes_stale_mapping`)
  - Given POST to /internal/send raises exception, When `send_event()` called, Then log error and return failure (no retry) (`tests/test_connection_manager.py::TestConnectionManagerSendEvent::test_send_event_request_exception`)
  - Given active connection, When `on_disconnect(token)` called with matching token, Then remove mapping (`tests/test_connection_manager.py::TestConnectionManagerDisconnect::test_on_disconnect_removes_mapping`)
  - Given disconnect with mismatched token, When `on_disconnect(old_token)` called, Then log warning and ignore (keep existing mapping) (`tests/test_connection_manager.py::TestConnectionManagerDisconnect::test_on_disconnect_stale_token_after_replacement`)
  - Given concurrent connects for same identifier, When multiple threads call `on_connect()`, Then lock ensures sequential processing (no race) (`tests/test_connection_manager.py::TestConnectionManagerConcurrency::test_concurrent_connects_same_identifier`)
  - Given connection exists, When `has_connection("task:abc")` called, Then return True; else return False (`tests/test_connection_manager.py::TestConnectionManagerHasConnection::test_has_connection_exists`, `test_has_connection_not_exists`)
- Hooks: Mock `requests.post()` with configurable responses; mock metrics_service; threading tests for concurrency
- Gaps: All planned ConnectionManager scenarios covered (18 tests total)
- Evidence: `tests/test_connection_manager.py:1-423` comprehensive unit coverage

---

- Surface: TaskService refactoring with ConnectionManager
- Scenarios:
  - Given task running, When task sends progress events, Then events sent via ConnectionManager (`tests/test_task_service.py::TestTaskService::test_get_task_events`)
  - Given task completes, When final event sent, Then close flag set to True (verified in implementation `task_service.py:363`)
  - Given ConnectionManager.send_event() fails, When sending progress event, Then log error but continue task execution (verified in `task_service.py:79` catch block)
  - Given TaskProgressHandle, When sending progress updates, Then events routed via ConnectionManager (`tests/test_task_service.py::TestTaskProgressHandle::test_progress_handle_creation`)
- Hooks: Mock ConnectionManager; existing task fixtures; validate send_event calls
- Gaps: No tests for `on_connect()` and `on_disconnect()` callback handlers (TaskService methods added but not tested)
- Evidence: `tests/test_task_service.py:28-33,182-407` updated for ConnectionManager integration

---

- Surface: SSE callback API endpoint (`POST /api/sse/callback`)
- Scenarios: **ALL MISSING** (see Major finding above)
- Hooks: Flask test client; mock task_service and version_service; environment variable injection for secret
- Gaps: **Complete absence of API endpoint tests** — routing, authentication, validation, error handling all untested
- Evidence: No test file for `app/api/sse.py` found in repository

---

- Surface: VersionService refactoring with ConnectionManager
- Scenarios: Unknown (test file updates not in diff)
- Hooks: Mock ConnectionManager; validate pending events logic preserved
- Gaps: Cannot assess coverage without seeing `tests/test_version_service.py` changes
- Evidence: Plan section 2 mentions `tests/test_version_service.py` updates but file not in unstaged diff

---

- Surface: Integration tests with real SSE Gateway
- Scenarios: Deferred per user note (acknowledged gap)
- Hooks: `sse_gateway_server` fixture (not implemented); SSEClient helper; real HTTP calls
- Gaps: **Complete absence of integration tests** — end-to-end flows untested
- Evidence: Plan section 2 specifies integration test files; none created

---

## 7) Adversarial Sweep

### Attack 1: Dependency Injection Wiring

**Check attempted:** Verify ConnectionManager provider wired into TaskService and VersionService; verify SSE API module wired for `@inject` decorator

**Evidence:**
- `app/services/container.py:106-114` — ConnectionManager Singleton provider defined with `gateway_url=config.provided.SSE_GATEWAY_URL` and `metrics_service=metrics_service`
- `app/services/container.py:176` — TaskService provider includes `connection_manager=connection_manager`
- `app/services/container.py:221` — VersionService provider includes `connection_manager=connection_manager`
- `app/__init__.py:65` — Module `'app.api.sse'` added to wire_modules list for DI container

**Why code held up:** DI wiring correctly configured; services receive ConnectionManager via constructor injection; SSE API endpoint can use `@inject` decorator (BUT blueprint registration missing, see Blocker finding)

---

### Attack 2: Transaction/Session Handling

**Check attempted:** Verify no database sessions leaked or transactions improperly managed

**Evidence:**
- `app/services/connection_manager.py` — No database imports; no SQLAlchemy session usage; purely in-memory state
- `app/services/task_service.py` — No new database operations added; existing task execution logic unchanged
- `app/services/version_service.py` — No database operations; HTTP fetch only

**Why code held up:** No database transactions involved in SSE Gateway integration; all state in-memory with proper locking

---

### Attack 3: Derived State → Persistence Invariants

**Check attempted:** Verify filtered queries don't drive persistent writes without guards; check for stale mapping cleanup

**Evidence:**
- `app/services/connection_manager.py:226-235` — 404 response triggers stale mapping cleanup (filtered state: connection gone → cleanup: remove mappings)
- Guard: 404 is authoritative signal from SSE Gateway; safe to clean up
- `app/services/connection_manager.py:72-88` — Connection replacement closes old connection before registering new (derived state: identifier exists → cleanup: close old, register new)
- Guard: RLock ensures atomic update of both forward and reverse mappings

**Why code held up:** Derived state (token mappings) drives cleanup actions but guards in place: authoritative 404 signal, RLock for atomicity, bidirectional consistency maintained

---

### Attack 4: Observability — Metrics and Logging

**Check attempted:** Verify Prometheus metrics wired and incremented; check for time.time() misuse

**Evidence:**
- `app/services/metrics_service.py:468-491` — SSE Gateway metrics defined: connections_total, events_sent_total, send_duration_seconds, active_connections
- `app/services/metrics_service.py:878-928` — Metric recording methods implemented with proper labels
- `app/services/connection_manager.py:99,150,258,235,247,270` — Metrics called on connect, disconnect, event success, event error
- `app/services/connection_manager.py:203,274` — Uses `time.perf_counter()` correctly for duration measurement (not `time.time()`)

**Why code held up:** Observability properly integrated; metrics recorded at all key points; duration timing uses monotonic perf_counter per guidelines

---

### Attack 5: Shutdown Coordination

**Check attempted:** Verify ConnectionManager integrates with ShutdownCoordinator if needed

**Evidence:**
- Plan section 10 (Background Work & Shutdown): "Change brief explicitly excludes graceful shutdown; ConnectionManager has no shutdown integration"
- `app/services/connection_manager.py` — No shutdown_coordinator injection; no lifecycle notifications; no background threads
- Plan rationale: "Assume the service shuts down with the app (it's a sidecar in Kubernetes). All clients will be disconnected anyway."

**Why code held up:** No shutdown integration needed per design; sidecar assumption means abrupt shutdown acceptable; no long-running background work in ConnectionManager

---

### Attack 6: Schema Drift and Migrations

**Check attempted:** Verify no database schema changes require migrations

**Evidence:**
- Plan section 1 (Assumptions): "No schema changes; no database migrations"
- File review confirms no SQLAlchemy model changes; no Alembic migrations in diff
- All state in-memory (ConnectionManager mappings, TaskService/VersionService queues)

**Why code held up:** No database involvement; purely in-memory refactor; no migration risk

---

## 8) Invariants Checklist

- Invariant: Only one active SSE Gateway connection per service identifier
  - Where enforced: `app/services/connection_manager.py:72-88` — on_connect checks for existing connection, closes old before registering new
  - Failure mode: Two connections for same identifier would receive duplicate events
  - Protection: RLock-protected replacement; old token explicitly closed via HTTP POST; reverse mapping cleaned up
  - Evidence: Test `tests/test_connection_manager.py::test_on_connect_replaces_existing_connection` validates behavior

---

- Invariant: Forward and reverse token mappings always mirror each other
  - Where enforced: `app/services/connection_manager.py:90-95` — Atomic update of both `_connections[identifier]` and `_token_to_identifier[token]` within RLock
  - Failure mode: Stale reverse mapping could cause wrong connection to be closed on disconnect
  - Protection: RLock ensures both mappings updated together; disconnect handler verifies token matches before removing (lines 129-142)
  - Evidence: Test `tests/test_connection_manager.py::test_on_disconnect_stale_token_after_replacement` validates stale disconnect handling

---

- Invariant: Pending version events delivered in order on first connection
  - Where enforced: `app/services/version_service.py:69-83` — on_connect pops pending events list and sends in order
  - Failure mode: Events sent out of order or lost during connection setup
  - Protection: Lock-protected access to `_pending_events`; events sent sequentially; list cleared after delivery
  - Evidence: Plan section 5 (Algorithms) specifies "Pending events sent in order; _pending_events cleared after delivery"

---

- Invariant: ConnectionManager never retries failed HTTP calls to SSE Gateway
  - Where enforced: `app/services/connection_manager.py:261-271` — RequestException caught, error logged, False returned (no retry)
  - Failure mode: Retrying could cause duplicate events or cascading failures
  - Protection: Plan section 7 (Consistency) states "No retries on SSE Gateway HTTP calls; events may be lost on transient failures"
  - Evidence: Test `tests/test_connection_manager.py::test_send_event_request_exception` validates no-retry behavior

---

- Invariant: Task events include close=True flag only for terminal events (completed/failed)
  - Where enforced: `app/services/task_service.py:363` — Checks `event.event_type in [TaskEventType.TASK_COMPLETED, TaskEventType.TASK_FAILED]`
  - Failure mode: Closing connection prematurely loses subsequent events; not closing after terminal event leaks connection
  - Protection: Explicit terminal event check; close flag set only when appropriate
  - Evidence: Implementation in `_send_event_to_gateway()` method validates terminal event detection

---

## 9) Questions / Needs-Info

- Question: Is frontend updated to use new SSE endpoint URLs (`/api/sse/tasks?task_id=X` instead of `/api/tasks/{id}/stream`)?
- Why it matters: Backend removes old endpoints with no backward compatibility; frontend connections break if not updated
- Desired answer: Confirmation that frontend PR merged with updated EventSource URLs, or migration plan for gradual rollout

---

- Question: What is expected behavior if SSE Gateway becomes unavailable during event send?
- Why it matters: No retry logic means events silently dropped on transient failures; unclear if this is acceptable for production
- Desired answer: Product decision on event loss tolerance; consider adding event buffer or dead letter queue if delivery guarantees needed

---

- Question: Why does VersionService retain `_subscribers` dict if old endpoint removed?
- Why it matters: Dead code path with backward compatibility comment (lines 172-180) creates maintenance confusion
- Desired answer: Clarification if gradual migration intended (old endpoint temporarily needed) or if dead code should be removed

---

## 10) Risks & Mitigations (top 3)

- Risk: SSE callback endpoint unreachable due to missing blueprint registration (Blocker finding)
- Mitigation: Add `flask_app.register_blueprint(sse_bp)` in `app/__init__.py` after line 48; verify with curl or test client before deployment
- Evidence: `app/__init__.py:65` wiring added but blueprint registration missing; `app/api/sse.py:24` defines blueprint

---

- Risk: API layer completely untested; routing or authentication bugs could reach production (Major finding)
- Mitigation: Create `tests/test_sse_api.py` with Flask test client covering all 8 scenarios from plan section 13 (connect routing, auth, validation, errors); block merge until tests pass
- Evidence: `app/api/sse.py:95-195` implements critical routing and auth logic with zero test coverage

---

- Risk: Integration with real SSE Gateway untested; JSON contract mismatches won't surface until production (Major finding)
- Mitigation: Prioritize integration test implementation as immediate follow-up work before production deployment; use plan section 13 scenarios as checklist; run against SSE Gateway subprocess
- Evidence: Plan deliverables include integration tests; user note confirms intentional deferral; no substitute for end-to-end validation

---

## 11) Confidence

Confidence: Medium — Core implementation (ConnectionManager, schemas, service refactoring, unit tests) is solid with excellent thread safety and observability, but missing API tests, blueprint registration blocker, integration test gap, and minor correctness issues prevent high confidence until addressed; with fixes applied and integration tests delivered, confidence would rise to High.
