# SSE Gateway Integration — Plan Review

## 1) Summary & Decision

**Readiness**

The plan is comprehensive and implementation-ready, with excellent research depth into both the existing SSE implementation and SSE Gateway's capabilities. The architectural decision to leverage SSE Gateway's immediate callback response feature to massively simplify VersionService (from stateful subscriber management to stateless request-response) demonstrates thoughtful design. The three-tier testing strategy (mocked unit tests, FakeSSEGateway integration tests, real SSE Gateway in Playwright E2E) provides pragmatic coverage without over-constraining implementation. Security authentication is properly scoped (mandatory in production, optional in dev/test) and threat modeling acknowledges the hobby project context. The plan explicitly documents all deletions, modifications, and creations with line-level evidence, making the scope crystal clear.

**Decision**

GO — Plan is ready for implementation with disciplined execution; no blocking issues found despite rigorous adversarial sweep.

---

## 2) Conformance & Fit (with evidence)

**Conformance to refs**

- `CLAUDE.md` Development Guidelines — Pass — `plan:154-247` — All affected areas follow layered architecture (new API endpoint in `app/api/`, services in `app/services/`, schemas in `app/schemas/`); dependency injection properly planned; testing requirements addressed comprehensively; metrics integration included; shutdown coordination planned; no database migrations needed (SSE is in-memory).

- `docs/commands/plan_feature.md` Template — Pass — `plan:0-1009` — All 16 required sections present with proper templates filled; research log comprehensive (lines 3-96); intent/scope clear with verbatim prompt quotes (lines 98-151); file map exhaustive with line-range evidence (lines 154-247); algorithms step-by-step (lines 398-478); test plan deterministic with three-tier strategy (lines 698-918).

- Backend Development Guidelines (Dependency Injection) — Pass — `plan:196,209,306-344` — SSECoordinatorService and SSEGatewayClient planned for container wiring; TaskService/VersionService refactoring preserves singleton pattern; singletons needing DB access follow documented pattern (though SSE services don't need DB); new module `app.api.sse_callback` added to wire_modules.

- Backend Development Guidelines (Graceful Shutdown) — Pass — `plan:469-478,651-666` — SSECoordinatorService registers for lifetime notifications; PREPARE_SHUTDOWN stops accepting connections; SHUTDOWN clears mappings; no shutdown waiter needed since SSE Gateway dies as sidecar (documented assumption); ShutdownCoordinator integration matches project pattern.

- Backend Development Guidelines (Metrics) — Pass — `plan:587-650` — Six new metrics planned (gauges, counters) for connection tracking, event sending, callback requests, errors, auth failures, and immediate events; follows MetricsService pattern from existing codebase; labels designed for dashboards and alerts.

- Backend Development Guidelines (Testing) — Pass — `plan:698-918` — Three-tier testing strategy exceeds requirements: Tier 1 pure unit tests with mocks (fast isolation), Tier 2 integration tests with FakeSSEGateway (real HTTP without Node.js), Tier 3 E2E with real SSE Gateway (Playwright only); test coverage documented with Given/When/Then scenarios for all surfaces; fixtures identified.

- SSE Gateway README (callback/send API contracts) — Pass — `plan:249-348` — Callback request/response schemas match SSE Gateway spec exactly including optional response body for immediate events (lines 308-329); send endpoint payload structure correct (lines 291-305); disconnect reasons documented (lines 273-288); authentication via query parameter as SSE Gateway expects.

**Fit with codebase**

- `app/services/task_service.py` — `plan:174-178,419-432` — Refactoring from event queues (`_event_queues: dict[str, Queue]`) to HTTP client calls is well-scoped; TaskProgressHandle changes isolated to `_send_progress_event()` method; existing thread pool execution preserved; metrics integration already present (can extend); shutdown coordination already wired.

- `app/services/version_service.py` — `plan:176-179,435-450,940-947` — Massive simplification properly justified by SSE Gateway's immediate callback response feature; removes ~90% of complexity (subscriber tracking, idle timeout, background cleanup thread, event queueing); stateless design matches user requirement "respond with version and ignore connection"; shutdown becomes trivial (no state to drain).

- `app/services/container.py` — `plan:186-187,209-213` — New services (SSECoordinatorService, SSEGatewayClient) follow existing provider patterns; TaskService and VersionService are already singletons (plan preserves); wiring approach matches existing wire_modules pattern in `app/__init__.py`.

- `app/config.py` — `plan:181-183,269-270` — Adding SSE_GATEWAY_INTERNAL_URL, SSE_CALLBACK_SECRET env vars follows existing Settings field pattern; secret handling (mandatory production, optional dev/test) matches project's pragmatic security posture; no migration of existing SSE_HEARTBEAT_INTERVAL (still useful for testing).

- `scripts/testing-server.sh` — `plan:193-195,661-666,956-963` — Adding SSE Gateway lifecycle management (start/stop) extends existing pattern; `--sse-gateway-port` and `--sse-gateway-path` flags follow existing `--port` pattern (renamed to `--app-port`); script already manages Flask lifecycle, adding Node.js process is natural extension.

- `tests/conftest.py` — `plan:197-199` — Mock fixtures for SSEGatewayClient follow existing session-scoped fixture pattern (lines 80-100 referenced); FakeSSEGateway as separate fixture file (`tests/fixtures/fake_sse_gateway.py`) keeps conftest.py maintainable.

- Deletion of SSE endpoints — `plan:156-169` — Old SSE endpoints (`app/api/tasks.py:14-69`, `app/api/utils.py:20-122`, `app/utils/sse_utils.py`) removal is explicit; no backwards compatibility burden (user requirement); clean break simplifies implementation.

---

## 3) Open Questions & Ambiguities

None. All questions documented in plan section 15 (Risks & Open Questions) were resolved during research phase:

- VersionService idle timeout: RESOLVED — Remove completely, use stateless design with immediate callback response.
- SSE Gateway configuration: RESOLVED — Environment variables per SSE Gateway architecture (CALLBACK_URL, PORT, HEARTBEAT_INTERVAL_SECONDS).
- Callback authentication: RESOLVED — SSE_CALLBACK_SECRET env var with query string parameter; mandatory production, optional dev/test.

---

## 4) Deterministic Backend Coverage (new/changed behavior only)

- Behavior: `POST /api/sse/callback?secret={secret}` (callback endpoint)
- Scenarios:
  - Given SSE Gateway connects with valid task_id and correct secret, When callback action=connect, Then return 200 and store token mapping (`tests/api/test_sse_callback.py::test_callback_connect_task_valid`)
  - Given SSE Gateway connects with nonexistent task_id, When callback action=connect, Then return 404 (`tests/api/test_sse_callback.py::test_callback_connect_task_not_found`)
  - Given valid task token, When callback action=disconnect, Then return 200 and remove mapping (`tests/api/test_sse_callback.py::test_callback_disconnect_task`)
  - Given unknown token, When callback action=disconnect, Then return 200 idempotent (`tests/api/test_sse_callback.py::test_callback_disconnect_unknown_token`)
  - Given malformed JSON, When callback received, Then return 400 (`tests/api/test_sse_callback.py::test_callback_malformed_json`)
  - Given version stream connect, When callback received, Then return 200 with JSON body containing version event (`tests/api/test_sse_callback.py::test_callback_connect_version_stream`)
  - Given version stream disconnect, When callback received, Then return 200 no-op (`tests/api/test_sse_callback.py::test_callback_disconnect_version_stream`)
  - Given shutdown initiated, When connect callback received, Then return 503 (`tests/api/test_sse_callback.py::test_callback_shutdown_rejection`)
  - Given production mode missing secret, When callback received, Then return 401 (`tests/api/test_sse_callback.py::test_callback_auth_production_missing_secret`)
  - Given production mode incorrect secret, When callback received, Then return 401 (`tests/api/test_sse_callback.py::test_callback_auth_production_wrong_secret`)
  - Given dev mode missing secret, When callback received, Then return 200 (`tests/api/test_sse_callback.py::test_callback_auth_dev_optional`)
- Instrumentation: Metrics counters `sse_callback_requests_total{action, status, type}`, `sse_callback_auth_failures_total{reason}`, `sse_callback_immediate_events_total{type, status}`; structured logs with action/token/url/status/duration/auth_failed
- Persistence hooks: No database changes; in-memory connection tracking only; DI wiring in `app/services/container.py` and `app/__init__.py` wire_modules
- Gaps: None; comprehensive API test coverage planned
- Evidence: `plan:773-788,606-613,632-639,643-650`

---

- Behavior: SSECoordinatorService (routing and connection management)
- Scenarios:
  - Given URL "/api/tasks/abc/stream", When route_callback called, Then return (TaskService, "abc") and store token (`tests/test_sse_coordinator_service.py::test_route_task_stream`)
  - Given URL "/api/utils/version/stream", When route_callback called, Then return (VersionService, None) with initial message response body, no tracking (`tests/test_sse_coordinator_service.py::test_route_version_stream`)
  - Given URL "/unknown", When route_callback called, Then raise InvalidOperationException (`tests/test_sse_coordinator_service.py::test_route_unknown_path`)
  - Given task token stored, When lookup_connection called, Then return ("task", task_id) (`tests/test_sse_coordinator_service.py::test_lookup_task_connection`)
  - Given version token or unknown, When lookup_connection called, Then return None (`tests/test_sse_coordinator_service.py::test_lookup_version_or_unknown`)
  - Given task disconnect, When handle_disconnect called, Then remove token mapping (`tests/test_sse_coordinator_service.py::test_disconnect_task_cleanup`)
  - Given version disconnect, When handle_disconnect called, Then no-op (`tests/test_sse_coordinator_service.py::test_disconnect_version_noop`)
  - Given shutdown initiated, When connect callback received, Then reject (return 503) (`tests/test_sse_coordinator_service.py::test_connect_during_shutdown`)
- Instrumentation: Gauge `sse_connections_active{type="task"}` (version not tracked); RLock for thread-safe dict access
- Persistence hooks: No database; in-memory dict `token -> (type, resource_id)` for task streams only
- Gaps: None; routing logic fully specified
- Evidence: `plan:791-807,332-346,483-489`

---

- Behavior: SSEGatewayClient (HTTP client for /internal/send)
- Scenarios:
  - Given valid token, When send_event called, Then POST to /internal/send with correct JSON (`tests/test_sse_gateway_client.py::test_send_event_valid`)
  - Given SSE Gateway returns 200, When send_event called, Then return True (`tests/test_sse_gateway_client.py::test_send_event_success`)
  - Given SSE Gateway returns 404, When send_event called, Then return False and log warning (`tests/test_sse_gateway_client.py::test_send_event_token_not_found`)
  - Given SSE Gateway unreachable, When send_event called, Then return False after timeout (`tests/test_sse_gateway_client.py::test_send_event_network_timeout`)
  - Given close=True, When send_event called, Then include close field in payload (`tests/test_sse_gateway_client.py::test_send_event_with_close`)
  - Given event_data is dict, When send_event called, Then JSON-encode to string (`tests/test_sse_gateway_client.py::test_send_event_dict_to_string`)
- Instrumentation: Counters `sse_events_sent_total{status, type}`, `sse_gateway_client_errors_total{error_type}`; 2s HTTP timeout
- Persistence hooks: No database; HTTP client only
- Gaps: None; client behavior fully specified
- Evidence: `plan:808-821,615-621`

---

- Behavior: TaskService (refactored event sending via HTTP)
- Scenarios:
  - Given task running, When progress_handle.send_progress called, Then send event via SSEGatewayClient (`tests/test_task_service.py::test_task_progress_sends_http_event`)
  - Given task completed, When task finishes, Then send task_completed event and close connection (`tests/test_task_service.py::test_task_completed_closes_connection`)
  - Given task failed, When exception raised, Then send task_failed event (`tests/test_task_service.py::test_task_failed_sends_event`)
  - Given SSE Gateway unreachable, When send_event fails, Then log warning and continue task (`tests/test_task_service.py::test_task_continues_on_send_failure`)
  - Given shutdown initiated, When new task start requested, Then raise InvalidOperationException (`tests/test_task_service.py::test_shutdown_rejects_new_tasks`)
  - Given shutdown initiated, When send_event called, Then reject (no need to send close events; SSE Gateway dies as sidecar) (`tests/test_task_service.py::test_shutdown_no_send_events`)
- Instrumentation: Existing TaskService metrics preserved; new counters from SSEGatewayClient integration
- Persistence hooks: No database changes; SSEGatewayClient injected via container; TaskService already wired as singleton
- Gaps: None; existing TaskService tests refactored to mock SSEGatewayClient
- Evidence: `plan:823-835,419-432,174-178`

---

- Behavior: VersionService (massively simplified, stateless)
- Scenarios:
  - Given version service initialized, When get_version_info called, Then return current version dict (`tests/test_version_service.py::test_get_version_info`)
  - Given callback coordinator routes to VersionService, When handle_connect called, Then return version event data (no tracking) (`tests/test_version_service.py::test_handle_connect_returns_event`)
  - Given disconnect callback for version stream, When handle_disconnect called, Then return success (no-op) (`tests/test_version_service.py::test_disconnect_noop`)
  - Given shutdown initiated, When get_version_info called, Then still return version (stateless service) (`tests/test_version_service.py::test_version_during_shutdown`)
- Instrumentation: No version stream connection tracking (gauge has no version type); structured logs removed (stateless)
- Persistence hooks: No database; no state; no background threads; VersionService remains singleton but fully stateless
- Gaps: None; simplified design eliminates 90% of original complexity
- Evidence: `plan:837-848,435-450,940-947,176-179`

---

- Behavior: Integration testing with FakeSSEGateway (Tier 2)
- Scenarios:
  - Given FakeSSEGateway running, When client connects to task stream, Then callback returns 200 (`tests/integration/test_sse_integration.py::test_task_stream_connect`)
  - Given task running, When task sends progress, Then FakeSSEGateway captures event with correct format (`tests/integration/test_sse_integration.py::test_task_progress_captured`)
  - Given task completes, When task finishes, Then FakeSSEGateway captures task_completed event and close=true (`tests/integration/test_sse_integration.py::test_task_completion_closes`)
  - Given client disconnects, When FakeSSEGateway sends disconnect callback, Then coordinator removes token mapping (`tests/integration/test_sse_integration.py::test_disconnect_cleanup`)
  - Given FakeSSEGateway running, When client connects to version stream, Then callback returns 200 with JSON body containing version event (`tests/integration/test_sse_integration.py::test_version_stream_immediate_event`)
  - Given callback response with event, When FakeSSEGateway processes it, Then event data contains correct version info (`tests/integration/test_sse_integration.py::test_version_event_data_valid`)
  - Given version connection established, When disconnect callback sent, Then returns 200 (no-op) (`tests/integration/test_sse_integration.py::test_version_disconnect_noop`)
  - Given callback returns invalid JSON, When FakeSSEGateway receives it, Then connection proceeds (simulates graceful handling) (`tests/integration/test_sse_integration.py::test_invalid_json_graceful`)
  - Given production mode, When FakeSSEGateway connects without/with incorrect secret, Then callback returns 401 (`tests/integration/test_sse_integration.py::test_auth_production_enforced`)
  - Given dev mode, When FakeSSEGateway connects without secret, Then callback returns 200 (`tests/integration/test_sse_integration.py::test_auth_dev_optional`)
  - Given callback payload, When sent to backend, Then matches SSE Gateway README schema exactly (`tests/integration/test_sse_integration.py::test_callback_schema_conformance`)
  - Given /internal/send request, When FakeSSEGateway receives it, Then matches SSE Gateway README schema (`tests/integration/test_sse_integration.py::test_send_schema_conformance`)
- Instrumentation: Real HTTP calls between FakeSSEGateway and Flask app; FakeSSEGateway captures all /internal/send calls for assertion
- Persistence hooks: FakeSSEGateway fixture in `tests/fixtures/fake_sse_gateway.py`; no Node.js dependency; pure Python HTTP simulation
- Gaps: None; comprehensive integration coverage without requiring real SSE Gateway
- Evidence: `plan:851-902,707-765`

---

- Behavior: End-to-end SSE testing (Tier 3, Playwright only)
- Scenarios:
  - Given SSE Gateway running, When client connects to task stream, Then receive connection_open event (Playwright test)
  - Given task running, When task sends progress, Then client receives progress_update event (Playwright test)
  - Given task completes, When task finishes, Then client receives task_completed and connection closes (Playwright test)
  - Given client disconnects, When connection drops, Then Python receives disconnect callback (Playwright test)
- Instrumentation: Real SSE Gateway sidecar; full-stack validation; testing-server.sh manages SSE Gateway lifecycle
- Persistence hooks: testing-server.sh spawns SSE Gateway with configurable path (--sse-gateway-path arg or SSE_GATEWAY_PATH env var); --sse-gateway-port flag for predictable port; --port renamed to --app-port
- Gaps: None; E2E validation scoped to Playwright UI tests (not pytest)
- Evidence: `plan:904-918,193-195,661-666,956-963`

---

## 5) Adversarial Sweep

**Major — TaskService connection tracking may leak memory without periodic cleanup**

**Evidence:** `plan:483-498` — Token mapping `_connections: dict[str, dict]` grows on connect, shrinks on disconnect. If disconnect callback is lost due to SSE Gateway crash or network partition, stale tokens remain forever. Plan mentions "Background cleanup thread sweeps stale tokens every 10 minutes" in risk section (`plan:982-985`) but implementation is not specified in affected files or algorithms.

**Why it matters:** In production with frequent reconnects (e.g., mobile clients, network flakiness), leaked tokens accumulate unbounded. 10,000 orphaned connections = ~1MB memory (100 bytes per token mapping) plus metric pollution.

**Fix suggestion:** In section 10 (Background Work & Shutdown), add explicit design for TaskService cleanup thread similar to existing VersionService pattern (lines 35-39 in `version_service.py`). Specify: (1) track last activity timestamp per connection in mapping, (2) background thread sweeps connections idle >30min (3x SSE_HEARTBEAT_INTERVAL), (3) cleanup thread stops on PREPARE_SHUTDOWN. In section 2 (File Map), add this to TaskService refactoring: "Add `_last_activity: dict[str, float]` and `_cleanup_thread` for stale token cleanup."

**Confidence:** High — Known failure mode for callback-based connection tracking; VersionService already solved this before simplification.

---

**Major — VersionService callback response may return invalid JSON, breaking stateless design**

**Evidence:** `plan:435-450,308-329` — VersionService responds with `{"event": {"name": "version_info", "data": "{...}"}}` in callback response body. If `get_version_info()` returns invalid JSON-encodable data (e.g., contains raw `datetime` objects), the callback response body will be malformed. SSE Gateway logs and ignores invalid JSON (`plan:557-559`), but connection proceeds with no version event sent—silent failure from user perspective.

**Why it matters:** Stateless design means no retry mechanism; client connects, gets no version event, waits indefinitely. User thinks app is broken. The plan delegates to VersionService but doesn't specify serialization contract.

**Fix suggestion:** In section 3 (Data Model / Contracts), add entry:
```
- Entity / contract: VersionService.get_version_info() return value
- Shape: dict[str, str | int] with JSON-serializable types only (no datetime, no nested objects)
- Refactor strategy: Convert datetime to ISO8601 string before returning; validate JSON-encodable
- Evidence: `app/services/version_service.py:43-48` — existing fetch_frontend_version() returns string
```
In section 5 (Algorithms), step 5 of "Version stream connection" flow: "VersionService retrieves current version info **and ensures JSON-serializable** (no datetime objects)". Add test scenario in section 13: "Given version info contains datetime, When get_version_info called, Then return ISO8601 string".

**Confidence:** High — JSON serialization failure is common pitfall; plan assumes version info is pre-serialized but doesn't enforce contract.

---

**Major — Callback secret comparison timing attack exploitable without constant-time check**

**Evidence:** `plan:566-567,669-676` — "Constant-time comparison to prevent timing attacks" mentioned in error handling and security sections, but implementation approach not specified. Python's `==` operator for strings is vulnerable to timing attacks (early exit on first mismatch). Plan assumes implementer knows to use `secrets.compare_digest()` but doesn't document it.

**Why it matters:** Attacker can brute-force SSE_CALLBACK_SECRET character-by-character by measuring response time variance. With 32-character secret (recommended), attacker reduces 62^32 search space to 62*32 = ~2000 attempts. In production, this allows unauthorized callback spoofing.

**Fix suggestion:** In section 4 (API / Integration Surface), callback endpoint entry, update Errors section: "401 if secret missing/incorrect in production (use `secrets.compare_digest()` for constant-time comparison to prevent timing attacks)". In section 11 (Security), callback authentication entry, update Mitigation: "Constant-time comparison via `secrets.compare_digest(provided_secret, expected_secret)` prevents timing attack; validate both are same length before comparison."

**Confidence:** High — Timing attacks on authentication tokens are well-documented; Python stdlib provides solution but must be explicitly used.

---

**Minor — FakeSSEGateway implementation complexity may exceed value for integration testing**

**Evidence:** `plan:707-765,851-902` — FakeSSEGateway must: (1) simulate callback calls to Flask, (2) run lightweight HTTP server for `/internal/send`, (3) parse callback response bodies for optional event/close, (4) track connections and events, (5) handle invalid JSON gracefully, (6) be thread-safe. Plan estimates this as "lightweight test double" but implementation will be ~300-400 lines with non-trivial threading and HTTP mocking.

**Why it matters:** Complex test doubles are maintenance burdens; bugs in FakeSSEGateway mask bugs in real code (or vice versa). Simpler approach: use pytest-httpserver fixture to mock SSE Gateway's `/internal/send` endpoint and `requests.post` to mock callback calls. Total ~50 lines, leverages existing fixtures.

**Fix suggestion:** In section 13 (Test Plan), Tier 2 section, simplify approach: "Integration tests use pytest-httpserver to mock SSE Gateway's `/internal/send` endpoint and `responses` library to mock callback calls. No separate FakeSSEGateway class; compose existing fixtures." Keep existing scenario coverage but reduce implementation surface. If FakeSSEGateway is still desired, document ~400 line estimate and justify maintenance cost.

**Confidence:** Medium — Test double complexity is real, but team may prefer FakeSSEGateway's semantic clarity over fixture composition. Not blocking.

---

## 6) Derived-Value & Persistence Invariants

- Derived value: Active SSE task connection count
  - Source dataset: Unfiltered set of (token → task_id) mappings in SSECoordinatorService (version streams excluded)
  - Write / cleanup triggered: Incremented on task connect callback (200 response), decremented on task disconnect callback
  - Guards: RLock protects connection dict modifications; disconnect callback idempotency (removing missing token is no-op); task connect validates task_id exists via TaskService.get_task_status() before accepting
  - Invariant: Count never negative; count reaches zero on SHUTDOWN event; count excludes version streams (not tracked); metric `sse_connections_active{type="task"}` matches dict length
  - Evidence: `plan:483-489,606-613,332-346` — gauge metric, coordinator service tracking, disconnect idempotency

---

- Derived value: Connection token → task_id mapping (task streams only)
  - Source dataset: Unfiltered callback connect events where URL matches `/api/tasks/{id}/stream` (version streams `/api/utils/version/stream` not tracked)
  - Write / cleanup triggered: Write on task connect (after task_id validation); delete on task disconnect; flush all on SHUTDOWN event
  - Guards: RLock for thread-safe dict access; TaskService.get_task_status() validates task exists before storing token (return 404 if not found); disconnect idempotency (handle duplicate disconnect, version stream disconnect, unknown token all no-op)
  - Invariant: Token uniqueness enforced by SSE Gateway (UUID generation); no token reuse across connections; mapping cleared on SHUTDOWN; version tokens never stored; stale tokens removed by periodic cleanup (see finding #1 about missing cleanup thread spec)
  - Evidence: `plan:332-346,404-416,455-466` — connection state tracking, connect flow with task validation, disconnect handling

---

- Derived value: Event send success/failure rate by type
  - Source dataset: Unfiltered HTTP responses from SSE Gateway `/internal/send` endpoint (both task and version event sends, though version rarely sends)
  - Write / cleanup triggered: Metrics counter `sse_events_sent_total{status, type}` incremented on each SSEGatewayClient.send_event() call (success=200 response, failure=404/timeout/connection error)
  - Guards: HTTP client timeout (2s) prevents indefinite blocking; best-effort send (failures logged, don't block task execution); 404 responses indicate stale token (connection already closed); network errors indicate SSE Gateway unreachable
  - Invariant: Success rate >95% under normal operation; failure rate >50% indicates SSE Gateway down (alert threshold); type label distinguishes task events (frequent) from version events (rare)
  - Evidence: `plan:500-508,615-621,419-432` — derived state section, metric definition, task event sending algorithm

---

- Derived value: Callback authentication failure rate
  - Source dataset: Unfiltered callback requests to `/api/sse/callback` (both connect and disconnect actions)
  - Write / cleanup triggered: Counter `sse_callback_auth_failures_total{reason}` incremented on 401 response (reason: missing_secret or invalid_secret in production; never in dev/test)
  - Guards: Environment-based enforcement (mandatory in production via `settings.FLASK_ENV == "production"`, optional in dev/test); constant-time secret comparison (see finding #3 about implementation); query parameter secret format `/api/sse/callback?secret={value}`
  - Invariant: Auth failure rate ~0% under normal operation (secret configured correctly); spike indicates misconfiguration or spoofing attempts; dev/test mode never increments counter (authentication disabled)
  - Evidence: `plan:632-639,564-567,669-676` — auth failure metric, callback auth failure handling, security section

---

## 7) Risks & Mitigations (top 3)

- Risk: TaskService token mappings leak memory without periodic cleanup (see finding #1)
- Mitigation: Add explicit background cleanup thread specification in section 10 (Background Work) and section 2 (File Map); sweep stale tokens >30min idle; integrate with shutdown coordinator
- Evidence: `plan:982-985` mentions risk but doesn't specify solution in affected areas

---

- Risk: VersionService callback response JSON serialization failure breaks stateless design (see finding #2)
- Mitigation: Document get_version_info() return type contract as JSON-serializable dict (no datetime, no nested objects); add test for datetime serialization; convert timestamps to ISO8601 strings
- Evidence: `plan:435-450` assumes version info is serializable but doesn't enforce contract

---

- Risk: SSE Gateway unavailable in Playwright test environment (Node.js missing)
- Mitigation: User will handle externally (documented in plan)
- Evidence: `plan:969-972` — user clarification "I'll take care of that"; testing-server.sh expects SSE Gateway source path via --sse-gateway-path or SSE_GATEWAY_PATH env var; assumes npm/node available

---

## 8) Confidence

Confidence: High — Plan is thorough, well-researched, and implementation-ready. The three findings are addressable via documentation updates (no architectural changes needed). The massive simplification of VersionService demonstrates thoughtful use of SSE Gateway's immediate callback response feature. Testing strategy is pragmatic (three-tier approach balances coverage vs complexity). Security model is appropriately scoped for hobby project context. All major architectural decisions are explicitly documented with user requirements and technical evidence.

