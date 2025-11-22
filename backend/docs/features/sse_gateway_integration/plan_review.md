# SSE Gateway Integration — Plan Review (Re-review)

## 1) Summary & Decision

**Readiness**

The updated plan addresses all major conditions from the previous review. Connection identifier collision safety is now explicitly proven with UUID validation and colon checks (lines 66-67). URL routing uses explicit prefix matching with clear fallback behavior (lines 50-54, 429). ConnectionManager's bidirectional token mapping is formally specified with atomic updates under lock (lines 331-357). MetricsServiceProtocol abstract method signatures are defined with parameter types (lines 247-250). SSE Gateway subprocess management includes explicit timeouts: 10s startup with 500ms health check interval, 5s graceful shutdown (lines 193-195). ConnectionManager Singleton choice is justified (lines 157, 225). All critical implementation details are now deterministic and implementable without mid-implementation design decisions.

**Decision**

`GO` — All previous conditions resolved with evidence-backed specifications; plan is complete, testable, and ready for implementation.

---

## 2) Conformance & Fit (with evidence)

**Conformance to refs**

- `@docs/commands/plan_feature.md` — Pass — `plan.md:0-859` — All 16 required sections present with evidence; research log (lines 3-97) documents SSE Gateway spec, DI patterns, test infrastructure
- `@docs/features/sse_gateway_integration/change_brief.md` — Pass — `plan.md:100-148` — Intent section quotes brief verbatim: three-layer delegation, no retry, no backwards compatibility, mandatory tests
- `@CLAUDE.md` (Service layer) — Pass — `plan.md:203-208, 224-227` — TaskService/VersionService refactoring preserves Singleton pattern, injects ConnectionManager, maintains existing `_event_queues`
- `@CLAUDE.md` (Testing requirements) — Pass — `plan.md:679-777` — Deterministic test plan covers service tests (mocked HTTP), API tests (validation), integration tests (real gateway subprocess)
- `@CLAUDE.md` (Dependency injection) — Pass — `plan.md:224-227, 238-240` — Container wiring for ConnectionManager (Singleton) and app.api.sse module specified
- `@CLAUDE.md` (Metrics integration) — Pass — `plan.md:247-251` — MetricsServiceProtocol abstract methods defined with signatures matching protocol pattern (record_sse_gateway_connection, record_sse_gateway_event, record_sse_gateway_send_duration)

**Fit with codebase**

- `app/services/task_service.py` — `plan.md:202-205` — Current `get_task_events()` generator (line 212-249) replaced with HTTP POST via ConnectionManager; event queueing preserved
- `app/services/version_service.py` — `plan.md:206-209` — Pending events logic (`_pending_events` dict, lines 82-117) preserved; adds ConnectionManager integration for HTTP delivery
- `app/services/container.py` — `plan.md:224-227` — ConnectionManager added as Singleton (justified: shared in-memory state, thread-safe RLock); injected into TaskService and VersionService
- `app/services/metrics_service.py` — `plan.md:247-251` — New abstract methods added to MetricsServiceProtocol following existing pattern (lines 20-150); Counter/Histogram implementations in MetricsService
- `app/config.py` — `plan.md:230-233, 360-368` — SSE_CALLBACK_SECRET and SSE_GATEWAY_URL follow Settings pattern (lines 18-175)
- `tests/integration/` — `plan.md:183-195, 749-777` — SSE Gateway subprocess helper follows existing `sse_server` fixture pattern in conftest.py; health checks with explicit timeouts

---

## 3) Open Questions & Ambiguities

No open questions remain. All ambiguities from previous review have been resolved:

- **Callback routing logic:** Now explicit with URL prefix matching table (lines 50-54, 429) — `/api/sse/tasks?*` → TaskService, `/api/sse/utils/version?*` → VersionService, else 400 Bad Request
- **Malformed query parameter handling:** Services validate ID extraction and reject via non-2xx response (lines 568-573); colon check prevents identifier collision (lines 66-67)
- **ConnectionManager provider type:** Explicitly Singleton with justification (line 157 "Singleton required because in-memory connection state must be shared"; line 225 "Singleton because shared in-memory state required")
- **Reverse token lookup:** Bidirectional mapping specified (lines 331-357) with `_token_to_identifier` dict for O(1) disconnect lookups; atomic updates under lock
- **MetricsServiceProtocol methods:** Abstract method signatures defined (lines 247-250) with parameter types

---

## 4) Deterministic Backend Coverage (new/changed behavior only)

- Behavior: ConnectionManager bidirectional token mapping with atomic updates
- Scenarios:
  - Given no existing connection, When `on_connect("task:abc", token, url)` called, Then store forward mapping AND reverse mapping atomically (`tests/test_connection_manager.py::test_on_connect_stores_bidirectional_mapping`)
  - Given existing connection, When `on_connect("task:abc", new_token, url)` called, Then close old connection, remove old reverse mapping, store new bidirectional mappings (`tests/test_connection_manager.py::test_on_connect_replaces_connection`)
  - Given disconnect with matching token, When `on_disconnect(token)` called, Then reverse lookup identifier, verify token match, remove both mappings (`tests/test_connection_manager.py::test_on_disconnect_bidirectional_cleanup`)
  - Given stale disconnect (token mismatch), When `on_disconnect(old_token)` called, Then log debug and ignore without removing current connection (`tests/test_connection_manager.py::test_on_disconnect_stale_token_ignored`)
- Instrumentation: `sse_gateway_active_connections{service}` gauge updated atomically with mapping changes
- Persistence hooks: Container wiring adds ConnectionManager Singleton provider
- Gaps: None — bidirectional mapping fully specified with atomic lock-protected updates (lines 331-357, 432-435, 469-474)
- Evidence: plan.md:331-357 (data structure), plan.md:432-435 (connect atomicity), plan.md:469-474 (disconnect reverse lookup)

---

- Behavior: POST /api/sse/callback URL routing with explicit prefix matching
- Scenarios:
  - Given callback URL "/api/sse/tasks?task_id=abc", When POST callback, Then route to TaskService.on_connect() (`tests/test_sse_api.py::test_callback_routes_to_task_service`)
  - Given callback URL "/api/sse/utils/version?request_id=xyz", When POST callback, Then route to VersionService.on_connect() (`tests/test_sse_api.py::test_callback_routes_to_version_service`)
  - Given callback URL "/api/unknown/path", When POST callback, Then return 400 Bad Request with error message (`tests/test_sse_api.py::test_callback_unknown_url_returns_400`)
- Instrumentation: `sse_gateway_connections_total{service, action}` counter incremented on route success
- Persistence hooks: app.api.sse wired in container (lines 238-240)
- Gaps: None — routing table explicit with fallback (lines 50-54, 429)
- Evidence: plan.md:50-54 (routing table), plan.md:424-436 (connect flow step 5 shows prefix matching)

---

- Behavior: TaskService/VersionService identifier validation (colon check prevents collision)
- Scenarios:
  - Given task_id "abc-def-123" (UUID, no colon), When on_connect() called, Then extract successfully and proceed (`tests/test_task_service.py::test_on_connect_valid_uuid`)
  - Given task_id "task:collision" (contains colon), When on_connect() called, Then log error and return non-2xx response (`tests/test_task_service.py::test_on_connect_rejects_colon_in_id`)
  - Given request_id with colon, When on_connect() called, Then reject with error response (`tests/test_version_service.py::test_on_connect_rejects_colon`)
- Instrumentation: Error logged at WARNING level with identifier value
- Persistence hooks: No DB changes; validation in service layer
- Gaps: None — explicit validation (lines 66-67 "validates it doesn't contain colon")
- Evidence: plan.md:66-67 (colon check), plan.md:431 (TaskService validation), plan.md:568-573 (error handling)

---

- Behavior: Integration tests with real SSE Gateway subprocess (explicit timeouts)
- Scenarios:
  - Given SSE Gateway not ready within 10s, When sse_gateway_helper starts subprocess, Then raise exception with stdout/stderr (`tests/integration/test_sse_gateway_tasks.py::test_gateway_startup_timeout_fails`)
  - Given SSE Gateway ready, When health check polls /readyz with 500ms interval, Then fixture returns within 10s (`tests/conftest.py::sse_gateway_server fixture`)
  - Given test teardown, When fixture cleanup, Then send SIGTERM and wait 5s before SIGKILL (`tests/integration/sse_gateway_helper.py::stop_sse_gateway`)
- Instrumentation: SSE Gateway stdout/stderr captured in logs; health check polling logged
- Persistence hooks: sse_gateway_server fixture in conftest.py; helper in sse_gateway_helper.py
- Gaps: None — explicit timeouts (10s startup, 500ms interval, 5s shutdown) specified (lines 193-195)
- Evidence: plan.md:193-195 (helper timeouts), plan.md:759 (test fixtures)

---

- Behavior: MetricsServiceProtocol abstract method additions
- Scenarios:
  - Given MetricsService instance, When `record_sse_gateway_connection("task", "connect")` called, Then increment counter `sse_gateway_connections_total{service=task, action=connect}` (`tests/test_metrics_service.py::test_record_sse_gateway_connection`)
  - Given StubMetricsService (test stub), When any SSE Gateway metric method called, Then no-op succeeds (stub implements protocol) (`tests/test_connection_manager.py` uses stub)
- Instrumentation: Three new abstract methods with defined signatures (lines 247-250)
- Persistence hooks: MetricsServiceProtocol updated (abstract methods); MetricsService implements; StubMetricsService updated
- Gaps: None — abstract method signatures specified with parameter types
- Evidence: plan.md:247-251 (protocol additions), plan.md:600-635 (metric definitions)

---

## 5) Adversarial Sweep (must find ≥3 credible issues or declare why none exist)

- Checks attempted: Connection identifier collision (task: vs version: prefix), disconnect callback token race on replacement, SSE Gateway subprocess health check timeout, MetricsServiceProtocol abstract method conformance, reverse token lookup complexity
- Evidence: plan.md:66-67 (UUID validation + colon check), plan.md:331-357 (bidirectional mapping), plan.md:193-195 (explicit timeouts), plan.md:247-251 (protocol methods), plan.md:469-474 (O(1) reverse lookup)
- Why the plan holds:
  1. **Identifier collision impossible:** Task IDs and request IDs are UUIDs (line 66 "Task IDs and request IDs in this codebase are UUIDs") which never contain colons; defensive validation rejects IDs with colons (line 67 "validate that extracted IDs don't contain colons"); prefixed identifiers ("task:uuid" vs "version:uuid") mathematically cannot collide
  2. **Disconnect token race handled:** Bidirectional mapping enables reverse lookup (line 469 "looks up identifier via reverse mapping"); token verification distinguishes stale vs current (line 471 "verifies token matches current forward mapping"); stale disconnects logged at debug level (line 472 "log debug (expected for stale disconnects)") without affecting current connection
  3. **Subprocess health checks deterministic:** Health check polls /readyz with 500ms interval, 10s total timeout (line 193-194); graceful shutdown 5s SIGTERM then SIGKILL (line 195); stdout/stderr captured for debugging on failure (line 195 "captures stdout/stderr for debugging on failure")
  4. **Metrics protocol conformance:** Abstract method signatures defined (lines 247-250: `record_sse_gateway_connection(service: str, action: str)`, `record_sse_gateway_event(service: str, status: str)`, `record_sse_gateway_send_duration(service: str, duration: float)`); follows existing protocol pattern
  5. **Reverse lookup efficiency:** `_token_to_identifier` dict provides O(1) lookup on disconnect (line 351-353); atomic updates under lock (line 355 "updated atomically within lock") prevent orphaned tokens

All major fault lines from previous review are now explicitly addressed with defensive checks, formal proofs, or specified error handling. No credible implementation-blocking issues remain.

---

## 6) Derived-Value & Persistence Invariants (stacked entries)

- Derived value: Bidirectional token mapping consistency
  - Source dataset: Unfiltered ConnectionManager mappings; forward `_connections[identifier] = {"token": ..., "url": ...}` and reverse `_token_to_identifier[token] = identifier`
  - Write / cleanup triggered: Both dicts updated atomically on connect (lines 432-435); both removed on disconnect (line 472)
  - Guards: RLock protects all mapping operations (line 355 "updated atomically within lock"); verification on disconnect prevents removing wrong connection (line 471)
  - Invariant: For any identifier in _connections, _token_to_identifier[_connections[identifier]["token"]] == identifier; no orphaned tokens or identifiers
  - Evidence: plan.md:331-357 (bidirectional mapping spec), plan.md:432-435 (atomic connect updates), plan.md:469-474 (disconnect cleanup)

---

- Derived value: Active connection count per service (Prometheus gauge)
  - Source dataset: Unfiltered forward mapping `_connections`; count keys with prefix "task:" or "version:"
  - Write / cleanup triggered: `sse_gateway_active_connections{service}` gauge incremented on connect, decremented on disconnect or 404 cleanup
  - Guards: Lock-protected reads; metric updates inside callback handlers after mapping changes committed
  - Invariant: For service="task", gauge value == len([k for k in _connections.keys() if k.startswith("task:")]); gauge >= 0 always
  - Evidence: plan.md:496-503 (active connection count derived value), plan.md:628-634 (gauge metric)

---

- Derived value: Pending version events queue (events before connection exists)
  - Source dataset: Filtered events for request_id where `connection_manager.has_connection("version:request_id")` returns False (VersionService._pending_events dict)
  - Write / cleanup triggered: Events appended on `queue_version_event()` when no connection; flushed via HTTP POST on `on_connect()`; cleared after delivery
  - Guards: VersionService lock protects queue operations (existing lock); events sent in order (FIFO); no max queue size (existing behavior preserved per line 146)
  - Invariant: Pending events delivered exactly once on first connection; order preserved; unbounded growth if connection never established (documented limitation, lines 591-596, 843-846)
  - Evidence: plan.md:514-521 (pending events invariant), plan.md:479-491 (flow), plan.md:591-596 (edge case: unbounded growth)

---

## 7) Risks & Mitigations (top 3)

- Risk: Pending version events unbounded queue growth if connection never established
- Mitigation: Document limitation (existing behavior preserved per change brief); monitor memory usage in production; consider max queue size in future iteration (lines 591-596, 843-846)
- Evidence: plan.md:591-596 (edge case documented), plan.md:843-846 (risk acknowledged)

---

- Risk: SSE Gateway subprocess management in tests may be flaky on slow CI systems
- Mitigation: Explicit 10s startup timeout with 500ms health check polling (line 193-195); SSE Gateway stdout/stderr captured for debugging on failure (line 195); graceful 5s shutdown prevents orphaned processes
- Evidence: plan.md:193-195 (explicit timeouts), plan.md:825-828 (risk mitigated)

---

- Risk: No retry on SSE Gateway HTTP calls means event loss during transient failures
- Mitigation: Accept limitation per change brief (line 82 "Don't retry calls to the SSE Gateway"); SSE Gateway is localhost sidecar (sub-millisecond latency, high availability); log errors for investigation; monitor `sse_gateway_events_sent_total{status=error}` counter
- Evidence: plan.md:560-565 (no retry policy), plan.md:850-853 (accepted risk)

---

## 8) Confidence

Confidence: High — All conditions from previous GO-WITH-CONDITIONS review are resolved with explicit specifications: UUID validation prevents identifier collision, bidirectional token mapping enables reverse lookup with atomic updates, URL routing table uses explicit prefix matching, MetricsServiceProtocol abstract methods defined with signatures, subprocess health checks include explicit timeouts (10s startup, 500ms interval, 5s shutdown), ConnectionManager Singleton choice justified. Plan is complete, deterministic, and implementable without mid-implementation design decisions.
