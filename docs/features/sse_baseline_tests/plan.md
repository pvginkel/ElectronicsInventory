# SSE Baseline Testing Infrastructure — Technical Plan

## 0) Research Log & Findings

### Research Areas

**Current SSE Implementation (app/api/tasks.py, app/api/utils.py)**
- Two SSE endpoints: `/api/tasks/<task_id>/stream` (task progress), `/api/utils/version/stream` (version notifications)
- Flask WSGI serves SSE via generator functions with `text/event-stream` content type
- Events follow SSE format: `event: <name>\ndata: <json>\n\n`
- TaskService sends progress_update, task_completed, task_failed events
- VersionService sends version_info events and periodic heartbeats
- Both endpoints require active connections; no connection = no events received

**Testing Infrastructure (tests/conftest.py, pytest patterns)**
- Session-scoped fixtures for app/db setup
- No existing SSE stream testing infrastructure
- Unit tests mock SSE functionality, don't validate actual SSE format
- No validation of event ordering, connection lifecycle, or SSE specification compliance

**SSE Format Specification**
- Standard: `event: <name>\ndata: <payload>\n\n` (double newline terminates event)
- `data:` field contains JSON string (not JSON object)
- Multiple `data:` lines concatenated with newlines
- Optional `id:` and `retry:` fields (not used in current implementation)
- Clients parse line-by-line, buffer until double newline

### Special Findings & Conflicts

**1. No Existing SSE Stream Tests**
Current test suite has zero tests that actually connect as SSE clients and validate:
- SSE format compliance (event/data structure)
- Event ordering (connection_open → progress → completed)
- Connection lifecycle (connect, receive, disconnect)
- Heartbeat behavior (version stream)

This creates risk for upcoming SSE Gateway migration - no baseline to validate against.

**2. Migration Dependency**
User is planning SSE Gateway integration (see `docs/features/sse_gateway_integration/plan.md`). That plan assumes existence of baseline tests to:
- Validate current behavior before migration
- Ensure new implementation matches existing contracts
- Catch regressions during refactoring

This plan is a **prerequisite** for safe SSE Gateway migration.

**3. Test Infrastructure Reusability**
Components built here (SSE client helper, connection fixtures, event parsing) will be reused during SSE Gateway integration testing with minimal changes (just URL updates).

**4. Test Execution Model**
SSE streaming requires real HTTP connections with unbuffered responses. Flask's test client buffers responses by default, defeating SSE validation. Therefore, tests will use a real Flask server approach:
- Session-scoped fixture starts Flask app with waitress in background thread
- Uses dynamic port allocation (find free port, typically 5000-5100 range)
- Health check endpoint validates server ready before tests run
- SSE client connects via `requests.get(url, stream=True)` for real streaming
- Clean shutdown on session teardown (stop waitress, join thread)

This approach matches production behavior and enables realistic SSE format validation. Existing test patterns use mocked services; these baseline tests require real streaming for accuracy.

Evidence: `tests/test_ai_service_real_integration.py` — existing integration test pattern with external dependencies; similar fixture design needed for Flask server.

---

## 1) Intent & Scope

**User intent**

Create baseline SSE stream tests that validate current Flask SSE implementation behavior, providing regression protection and test infrastructure for upcoming SSE Gateway migration.

**Prompt quotes**

"If I'm not mistaken, in theory we could setup the test tiers now already so that we can limit regression, right?"
"If we create the test suites now with a real backend, we can better prevent regression."

**In scope**

- Create SSE client helper class for parsing SSE format in tests
- Add pytest markers for SSE stream tests (slower execution)
- Implement baseline tests for task stream endpoint (`/api/tasks/<task_id>/stream`)
- Implement baseline tests for version stream endpoint (`/api/utils/version/stream`)
- Validate SSE format compliance (event/data structure)
- Validate event ordering and lifecycle
- Document current behavior as test expectations
- Add fixtures for running Flask app in test mode with SSE support

**Out of scope**

- SSE Gateway integration (separate plan: `sse_gateway_integration`)
- Changes to existing SSE implementation
- Performance or load testing of SSE endpoints
- WebSocket or alternative streaming protocols
- Client reconnection logic (frontend responsibility)

**Assumptions / constraints**

- Flask dev server supports SSE (text/event-stream) in test mode
- Tests run against real Flask app (not mocked responses)
- SSE stream tests are marked separately (slower, can skip in fast CI)
- Current SSE implementation is considered correct baseline
- Event payloads are JSON-serializable dicts
- Tests use `requests` library with `stream=True` for SSE parsing

---

## 2) Affected Areas & File Map

### Files to CREATE

- Area: `tests/integration/sse_client_helper.py`
- Why: Reusable SSE client for parsing SSE format in tests; supports strict/lenient mode
- Evidence: No existing SSE parsing infrastructure in test suite; needed for validating event streams

---

- Area: `tests/test_sse_client_helper.py`
- Why: Unit tests for SSE client helper parsing logic (fast, mocked)
- Evidence: Helper needs unit tests for parsing edge cases (malformed events, JSON errors, strict vs lenient mode)

---

- Area: `tests/integration/test_task_stream_baseline.py`
- Why: Baseline integration tests for task stream endpoint with real Flask server
- Evidence: Zero existing tests connect as SSE client to `/api/tasks/<task_id>/stream`; need baseline before migration

---

- Area: `tests/integration/test_version_stream_baseline.py`
- Why: Baseline integration tests for version stream endpoint with real Flask server
- Evidence: Zero existing tests connect as SSE client to `/api/utils/version/stream`; need baseline before migration

---

### Files to MODIFY

- Area: `tests/conftest.py`
- Why: Add fixtures for Flask app with real HTTP server (using threading + waitress), helper for running background tasks, SSE client factory; reuse existing `integration` marker from pyproject.toml
- Evidence: `tests/conftest.py:80-100` — existing session-scoped fixtures; `pyproject.toml:107-116` — integration marker already defined; need similar pattern for real server startup with port management, health check, and clean shutdown

---

## 3) Data Model / Contracts

- Entity / contract: SSE event format (current implementation)
- Shape:
  ```
  event: connection_open
  data: {"status": "connected", "correlation_id": "..."}

  event: task_event
  data: {"event_type": "progress_update", "task_id": "abc123", "timestamp": "2024-01-01T12:00:00Z", "data": {"text": "Processing...", "progress": 0.5}, "correlation_id": "..."}

  event: task_event
  data: {"event_type": "task_completed", "task_id": "abc123", "timestamp": "2024-01-01T12:01:00Z", "data": {...}, "correlation_id": "..."}

  event: connection_close
  data: {"reason": "task_completed", "correlation_id": "..."}
  ```
- Refactor strategy: No refactoring; capturing current format as baseline for migration validation; correlation_id field injected by format_sse_event() must be handled in tests
- Evidence: `app/api/tasks.py:30-66` — actual event format with task_event wrapper and nested event_type; `app/utils/sse_utils.py:12-29` — correlation_id injection

---

- Entity / contract: Task stream event sequence (current behavior)
- Shape:
  ```
  1. connection_open (immediate on connect)
  2. heartbeat events (if no task events available within 5s timeout)
  3. task_event with event_type="progress_update" (0..N events during execution)
  4. task_event with event_type="task_completed" OR event_type="task_failed" (final event)
  5. connection_close (after task completion/failure)

  OR if task not found:
  1. connection_open
  2. error (with task not found message)
  3. connection_close (with reason="task_not_found")
  ```
- Refactor strategy: Document as baseline; SSE Gateway migration must preserve this sequence; all task execution events wrapped in task_event with event_type field
- Evidence: `app/api/tasks.py:30-66` — actual event sequence with task_event wrapper; heartbeat events on timeout; error handling for missing task

---

- Entity / contract: Version stream event format (current behavior)
- Shape:
  ```
  event: connection_open
  data: {"status": "connected", "correlation_id": "..."}

  event: version
  data: {"version": "1.2.3", "environment": "development", "git_commit": "abc123", "correlation_id": "...", ...}

  event: heartbeat
  data: {"timestamp": "2024-01-01T12:00:00Z", "correlation_id": "..."}

  (periodic heartbeat events every 5s dev / 30s prod)
  ```
- Refactor strategy: Document as baseline; version event (not version_info) must remain JSON-serializable (no datetime objects, use ISO strings); correlation_id injected in all events
- Evidence: `app/api/utils.py:48-73` — `version_stream()` sends "version" event name (line 67); periodic heartbeats; correlation_id injection

---

## 4) API / Integration Surface

- Surface: `GET /api/tasks/<task_id>/stream` (baseline validation)
- Inputs: task_id path parameter
- Outputs: SSE stream with connection_open, task_event (wrapping progress/completion), heartbeat, connection_close events; 200 with text/event-stream content-type; error + connection_close if task not found
- Errors: Task not found returns error event then connection_close (not HTTP 404); connection drops on server error
- Evidence: `app/api/tasks.py:30-66` — current task stream endpoint with task_event wrapper and error handling

---

- Surface: `GET /api/utils/version/stream` (baseline validation)
- Inputs: None
- Outputs: SSE stream with connection_open, immediate version event (not version_info), then periodic heartbeat events; 200 with text/event-stream
- Errors: error event + connection_close on version fetch error; connection drops on server error
- Evidence: `app/api/utils.py:48-73` — current version stream endpoint with "version" event name

---

## 5) Algorithms & State Machines (step-by-step)

- Flow: SSE client helper parsing
- Steps:
  1. Open HTTP connection with `requests.get(url, stream=True)`
  2. Iterate lines via `resp.iter_lines(decode_unicode=True)`
  3. Buffer lines until double newline (event boundary)
  4. Parse `event:` line for event name
  5. Parse `data:` line(s) for payload (concatenate multiple data lines)
  6. JSON-decode data payload
  7. Yield parsed event dict: `{"event": name, "data": payload}`
  8. Repeat until connection closes or timeout
- States / transitions: READING_EVENT → HAVE_NAME (after event:) → HAVE_DATA (after data:) → COMPLETE (after blank line) → yield → READING_EVENT
- Hotspots: Timeout handling (tests should not hang); graceful handling of malformed events; connection close detection
- Evidence: SSE specification; similar pattern to frontend SSE client parsing

---

- Flow: Task stream baseline test
- Steps:
  1. Create test task in database
  2. Start task execution in background thread
  3. Open SSE client connection to `/api/tasks/<task_id>/stream`
  4. Receive connection_open event (validate immediate delivery)
  5. Receive progress_update events (validate ordering, progress values)
  6. Receive task_completed event (validate final result)
  7. Connection closes automatically
  8. Validate all events received in correct order
- States / transitions: Task state: PENDING → RUNNING → COMPLETED; SSE connection: CONNECTING → OPEN → RECEIVING → CLOSED
- Hotspots: Background task must run concurrently with SSE client; timing-sensitive (progress events may arrive quickly)
- Evidence: `tests/test_task_service.py` — existing task execution tests; need to extend with SSE client validation

---

## 6) Derived State & Invariants

- Derived value: SSE event ordering
  - Source: Unfiltered task execution events from TaskService
  - Writes / cleanup: No persistence; in-memory event stream only
  - Guards: Test validates correct ordering (connection_open first, completion last)
  - Invariant: Events arrive in causal order; no events after task completion; connection_open always first
  - Evidence: `app/services/task_service.py:212-249` — event generation order determines stream order

---

- Derived value: SSE format compliance
  - Source: Unfiltered output from Flask SSE endpoints
  - Writes / cleanup: No writes; validation only
  - Guards: Test validates SSE specification compliance (event/data format, double newline termination)
  - Invariant: All events follow SSE spec; data payloads are valid JSON; event names are non-empty
  - Evidence: SSE specification; `app/utils/sse_utils.py:10-30` — format_sse_event() implementation

---

- Derived value: Connection lifecycle
  - Source: Flask WSGI connection state
  - Writes / cleanup: Test validates connection opens, receives events, closes
  - Guards: Timeout prevents hanging tests; connection close detection
  - Invariant: Connection opens successfully; events received before close; connection closes after final event
  - Evidence: HTTP streaming behavior; Flask SSE implementation pattern

---

## 7) Consistency, Transactions & Concurrency

- Transaction scope: No database transactions in SSE tests; read-only validation of existing implementation
- Atomic requirements: None; tests observe behavior without modifying state
- Retry / idempotency: Tests do not retry; failures indicate baseline behavior change
- Ordering / concurrency controls: Background task execution concurrent with SSE client; no locks needed (read-only)
- Evidence: Tests validate existing behavior; no state modification

---

## 8) Errors & Edge Cases

- Failure: Task does not exist
- Surface: Task stream endpoint
- Handling: Test validates 404 response; no SSE connection established
- Guardrails: Test creates valid task IDs; also tests invalid task_id returns 404
- Evidence: `app/api/tasks.py:32-37` — task existence check before streaming

---

- Failure: Task fails during execution
- Surface: Task stream endpoint
- Handling: Test validates task_failed event received with error details; connection closes
- Guardrails: Test uses task that raises exception; validates final event is task_failed not task_completed
- Evidence: `app/services/task_service.py` — exception handling sends task_failed event

---

- Failure: SSE connection timeout
- Surface: All SSE stream tests
- Handling: Test timeout (10s) prevents hanging; test fails with timeout error
- Guardrails: `requests.get(timeout=10)` parameter; test framework timeout
- Evidence: Standard pytest timeout patterns; prevents CI hangs

---

- Failure: Malformed SSE event
- Surface: SSE client helper parsing
- Handling: Log warning, skip malformed event, continue parsing; or fail test if critical
- Guardrails: Validate event structure; graceful degradation for non-critical events
- Evidence: SSE client best practices; resilient parsing

---

- Failure: Connection drops mid-stream
- Surface: All SSE stream tests
- Handling: Test detects connection close; validates events received up to that point
- Guardrails: Iterate until StopIteration; detect connection close vs timeout
- Evidence: `requests.iter_lines()` behavior on connection close

---

## 9) Observability / Telemetry

- Signal: Test execution logs
- Type: Structured log
- Trigger: Each SSE test logs connection URL, events received, timing
- Labels / fields: test_name, endpoint, event_count, duration_ms
- Consumer: Test output; CI logs for debugging failures
- Evidence: Standard pytest logging pattern

---

- Signal: SSE event sequence log
- Type: Test artifact
- Trigger: Each test logs full event sequence received
- Labels / fields: event_name, data_summary, timestamp_offset
- Consumer: Test failure diagnostics; baseline documentation
- Evidence: Useful for debugging event ordering issues

---

## 10) Background Work & Shutdown

- Worker / job: Background task execution (test helper)
- Trigger cadence: On-demand during test execution
- Responsibilities: Execute test task while SSE client receives events; simulate real task execution
- Shutdown handling: Thread terminates when task completes; test cleanup ensures thread joined
- Evidence: Need concurrent task execution for realistic SSE stream testing

---

## 11) Security & Permissions

- Concern: No security changes
- Touchpoints: Tests use existing endpoints without authentication (test mode)
- Mitigation: Tests run in isolated test environment; no production access
- Residual risk: None; read-only baseline testing
- Evidence: Test-only infrastructure; no security impact

---

## 12) UX / UI Impact

- Entry point: No UI changes
- Change: Backend testing infrastructure only
- User interaction: No user-facing changes
- Dependencies: None
- Evidence: Internal testing infrastructure; no user impact

---

## 13) Deterministic Test Plan

### SSE Client Helper (tests/integration/sse_client_helper.py, unit tests in tests/test_sse_client_helper.py)

- Surface: SSEClient class with strict mode configuration
- Scenarios:
  - Given valid SSE stream, When connect() called, Then parse events correctly and yield dicts with event/data
  - Given multi-line data field, When parsing, Then concatenate data lines with newlines (though current implementation uses single-line JSON)
  - Given connection closes, When iterating, Then yield all events up to close and terminate gracefully
  - Given timeout exceeded, When no events received, Then raise timeout exception
  - Given malformed event (missing data), When strict=True, Then raise ValueError; When strict=False (lenient), Then log warning and skip event
  - Given JSON parse error in data field, When strict=True, Then raise ValueError; When strict=False, Then yield raw string and log warning
  - Given event with correlation_id, When parsing, Then preserve correlation_id in data dict (don't strip; baseline tests validate presence)
  - Given SSEClient(strict=True), When baseline tests run, Then use strict mode to catch format violations
- Fixtures / hooks: Mock SSE streams (hand-crafted SSE format strings), requests library mocking
- Gaps: None; validates SSE parsing logic independently with configurable strictness
- Evidence: SSE client must correctly parse specification format; `app/utils/sse_utils.py:24-27` — correlation_id injection; strict mode resolves open question about parsing strategy

---

### Task Stream Baseline Tests (tests/integration/test_task_stream_baseline.py)

- Surface: `/api/tasks/<task_id>/stream` endpoint (marked with `@pytest.mark.integration`)
- Scenarios:
  - Given task exists and running, When SSE client connects, Then receive connection_open event immediately
  - Given task sends progress, When receiving stream, Then receive task_event with event_type="progress_update" (wrapped format with nested data)
  - Given task completes successfully, When stream ends, Then receive task_event with event_type="task_completed", then connection_close event
  - Given task fails with exception, When stream ends, Then receive task_event with event_type="task_failed" with error details
  - Given task does not exist, When SSE client connects, Then receive connection_open, error event, connection_close (not HTTP 404)
  - Given task idle (no events), When waiting, Then receive heartbeat events every ~5s
  - Given multiple clients connect to same task, When task sends events, Then all clients receive same events (existing behavior)
  - Given event data contains correlation_id, When parsed, Then validate or strip correlation_id field (injected by format_sse_event)
- Fixtures / hooks: sse_server fixture (real Flask + waitress), task factory, background task execution helper, SSEClient helper
- Gaps: None; validates complete task stream lifecycle with correct event format
- Evidence: Baseline tests capture current behavior for migration validation; `app/api/tasks.py:30-66` — actual event format

---

### Version Stream Baseline Tests (tests/integration/test_version_stream_baseline.py)

- Surface: `/api/utils/version/stream` endpoint (marked with `@pytest.mark.integration`)
- Scenarios:
  - Given version stream endpoint, When SSE client connects, Then receive connection_open then version event (not version_info) immediately
  - Given version event, When parsed, Then data contains version, environment, git_commit fields and correlation_id
  - Given connection stays open, When waiting, Then receive periodic heartbeat events (not comments) with timestamp
  - Given version data contains datetimes, When serialized, Then converted to ISO strings (JSON-serializable, already handled by implementation)
  - Given connection idle, When timeout not reached, Then connection remains open (no premature close)
  - Given heartbeat timing, When measuring intervals, Then validate heartbeat occurs within 2x configured SSE_HEARTBEAT_INTERVAL (generous window, not exact timing)
- Fixtures / hooks: sse_server fixture (real Flask + waitress), SSEClient helper, timing assertions with generous windows (±3s)
- Gaps: None; validates version stream behavior with correct event names
- Evidence: Baseline tests document version stream contract; `app/api/utils.py:48-73` — actual implementation with "version" event name

---

### Pytest Fixtures (tests/conftest.py)

- Surface: Test fixtures for SSE testing
- Scenarios:
  - Given sse_server fixture (session-scoped), When tests request it, Then start Flask app with waitress in background thread, return base URL (e.g., http://localhost:5001), clean shutdown on session end
  - Given sse_server startup, When starting, Then find free port dynamically, start waitress.serve in daemon thread, poll /health endpoint until ready (max 10s), store port and thread for cleanup
  - Given sse_server shutdown, When session ends, Then stop waitress gracefully, join thread with timeout (5s), log any shutdown errors
  - Given background_task_runner fixture, When test needs concurrent task execution, Then provide helper to run task in thread and join on cleanup
  - Given sse_client_factory fixture, When test needs SSE client, Then provide configured SSEClient instance with strict=True (baseline tests), timeout=10s
- Fixtures / hooks: Session-scoped sse_server (real Flask + waitress), function-scoped task runner, SSEClient factory
- Gaps: None; provides reusable test infrastructure with real server
- Evidence: `pyproject.toml:107-116` — integration marker already defined; `tests/test_ai_service_real_integration.py` — pattern for external dependencies

---

## 14) Implementation Slices

- Slice: SSE client helper
- Goal: Create reusable SSE parsing utility for tests
- Touches: `tests/integration/sse_client_helper.py`
- Dependencies: None; standalone utility

---

- Slice: Test infrastructure fixtures
- Goal: Add pytest fixtures for SSE testing (app, task runner, client factory)
- Touches: `tests/conftest.py`, `pytest.ini` (add sse_stream marker)
- Dependencies: Slice 1 (SSE client helper for factory fixture)

---

- Slice: Task stream baseline tests
- Goal: Validate current task stream behavior
- Touches: `tests/integration/test_task_stream_baseline.py`
- Dependencies: Slice 2 (fixtures available)

---

- Slice: Version stream baseline tests
- Goal: Validate current version stream behavior
- Touches: `tests/integration/test_version_stream_baseline.py`
- Dependencies: Slice 2 (fixtures available)

---

## 15) Risks & Open Questions

- Risk: Tests may be flaky due to timing (background task execution vs SSE client)
- Impact: Intermittent test failures; reduced confidence in baseline
- Mitigation: Use proper synchronization (wait for connection_open before starting task); generous timeouts; retry logic in CI

---

- Risk: Flask test server may not support SSE properly (buffering issues)
- Impact: Tests cannot validate SSE format; false failures
- Mitigation: Use Flask development server for tests (unbuffered); validate with manual testing; document any limitations

---

- Risk: Current SSE implementation has undocumented behavior that tests miss
- Impact: Migration may break edge cases not covered by baseline tests
- Mitigation: Review existing SSE code thoroughly; add tests for observed behavior; supplement with manual testing

---

- Question: Should tests validate heartbeat timing exactly?
- Why it matters: Heartbeat intervals may vary (5s dev, 30s prod); strict timing assertions may be flaky
- Owner / follow-up: **RESOLVED** — Tests validate heartbeat exists within 2x configured SSE_HEARTBEAT_INTERVAL (generous window for CI flakiness); accept any heartbeat within that window; document rationale: CI timing can be unpredictable, overly strict assertions (exactly 5s) will flake

---

- Question: Should SSE client helper be strict (fail on malformed events) or lenient (skip and continue)?
- Why it matters: Affects test failure modes and robustness
- Owner / follow-up: **RESOLVED** — SSEClient constructor takes `strict: bool = True` parameter; strict mode raises ValueError on malformed events, lenient mode logs warning and continues; baseline tests use strict=True to catch format violations; future migration tests may use strict=False for resilience

---

## 16) Confidence

Confidence: High — SSE stream testing is straightforward; no complex dependencies; captures existing behavior for regression protection; reusable infrastructure for SSE Gateway migration.
