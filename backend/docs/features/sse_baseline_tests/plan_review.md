# SSE Baseline Testing Infrastructure — Plan Review (Second Iteration)

## 1) Summary & Decision

**Readiness**

The updated plan successfully addresses all major concerns from the first review. Event format specifications now match the actual implementation (task_event wrapper, correlation_id handling, "version" not "version_info"), the test execution model is explicit and practical (real Flask server with waitress in background thread), open questions have been resolved with concrete decisions (heartbeat timing: 2x interval window; strict mode: configurable), and the directory structure is clarified (tests/integration/ is pytest-discoverable per existing config). The plan demonstrates thorough research, provides implementation-ready guidance, and establishes a solid foundation for SSE Gateway migration validation.

**Decision**

`GO` — All critical conditions from the first review have been resolved; the plan is ready for implementation with high confidence in successful execution.

---

## 2) Conformance & Fit (with evidence)

**Conformance to refs**

- `@AGENTS.md` (Testing Requirements) — Pass — `plan.md:383-450` — Comprehensive deterministic test plan with Given/When/Then scenarios, fixtures, hooks, and explicit gaps analysis
- `@AGENTS.md` (Dependency Injection) — Pass — `plan.md:437-450` — ServiceContainer and inject decorator patterns used for fixture design
- `@AGENTS.md` (File Placement Rules) — Pass — `plan.md:109-130` — Tests placed in tests/integration/ which is valid (pyproject.toml:108 testpaths includes tests/ recursively; subdirectories are discovered)
- `@docs/product_brief.md` — Pass — `plan.md:64-82` — No product impact; backend testing infrastructure only
- SSE Specification — Pass — `plan.md:219-234` — Correct SSE format parsing (event:/data:/double newline)

**Fit with codebase**

- `app/api/tasks.py:30-66` — `plan.md:145-158` — Event format now correctly documented: task_event wrapper with event_type field, correlation_id injection handled
- `app/api/utils.py:48-73` — `plan.md:183-198` — Event name corrected to "version" (line 196), matches implementation at utils.py:67
- `app/utils/sse_utils.py:12-29` — `plan.md:159` — Correlation_id injection via format_sse_event() explicitly documented
- `pyproject.toml:107-116` — `plan.md:137` — Correctly references existing integration marker (no need to add new marker)
- `tests/conftest.py` — `plan.md:437-450` — Fixture design extends existing session-scoped pattern; sse_server fixture adds real Flask server startup which is new but necessary for SSE streaming validation
- Test execution model — `plan.md:50-60` — Real Flask server with waitress in background thread is well-justified: Flask test client buffers responses, defeating SSE validation; production-like streaming required

---

## 3) Open Questions & Ambiguities

No unresolved questions. The plan has resolved all critical ambiguities from the first review:

- **Test execution model** (RESOLVED): Real Flask server with waitress in background thread, dynamic port allocation, health check validation
- **Directory structure** (RESOLVED): tests/integration/ is valid and pytest-discoverable per existing testpaths configuration
- **Event format** (RESOLVED): task_event wrapper with nested event_type, "version" not "version_info", correlation_id injection handled
- **Heartbeat timing** (RESOLVED): Validate heartbeat within 2x SSE_HEARTBEAT_INTERVAL window (not exact timing to avoid flakiness)
- **Strict mode** (RESOLVED): SSEClient(strict=True) for baseline tests to catch format violations; lenient mode available for future migration tests

---

## 4) Deterministic Backend Coverage (new/changed behavior only)

- Behavior: SSE client helper with strict mode
- Scenarios:
  - Given valid SSE stream, When connect(), Then parse events and yield dicts (`tests/test_sse_client_helper.py::test_parse_valid_stream`)
  - Given malformed event with strict=True, When parsing, Then raise ValueError (`tests/test_sse_client_helper.py::test_strict_mode_malformed`)
  - Given malformed event with strict=False, When parsing, Then log warning and continue (`tests/test_sse_client_helper.py::test_lenient_mode_malformed`)
  - Given JSON error with strict=True, When parsing, Then raise ValueError (`tests/test_sse_client_helper.py::test_strict_json_error`)
  - Given correlation_id in event, When parsing, Then preserve field in data dict (`tests/test_sse_client_helper.py::test_correlation_id_preserved`)
- Instrumentation: Test execution logs per plan.md:336-351
- Persistence hooks: None (helper is read-only parser)
- Gaps: None; strict mode design resolves parsing strategy
- Evidence: `plan.md:386-400`

---

- Behavior: Task stream endpoint baseline validation
- Scenarios:
  - Given task exists, When connecting, Then receive connection_open immediately (`tests/integration/test_task_stream_baseline.py::test_connection_open`)
  - Given task running, When streaming, Then receive task_event with event_type="progress_update" (`tests/integration/test_task_stream_baseline.py::test_progress_events`)
  - Given task completes, When stream ends, Then receive task_event with event_type="task_completed" and connection_close (`tests/integration/test_task_stream_baseline.py::test_task_completed`)
  - Given task fails, When streaming, Then receive task_event with event_type="task_failed" (`tests/integration/test_task_stream_baseline.py::test_task_failed`)
  - Given task not found, When connecting, Then receive connection_open, error event, connection_close with reason="task_not_found" (`tests/integration/test_task_stream_baseline.py::test_task_not_found`)
  - Given task idle, When waiting, Then receive heartbeat events within 2x SSE_HEARTBEAT_INTERVAL (`tests/integration/test_task_stream_baseline.py::test_heartbeat_events`)
  - Given correlation_id in events, When parsed, Then validate or strip field (`tests/integration/test_task_stream_baseline.py::test_correlation_id_handling`)
- Instrumentation: Test logs with event sequence, timing, and counts
- Persistence hooks: Task creation via existing fixtures; no schema changes
- Gaps: None; event format matches implementation
- Evidence: `plan.md:404-419`

---

- Behavior: Version stream endpoint baseline validation
- Scenarios:
  - Given version stream, When connecting, Then receive connection_open then "version" event (`tests/integration/test_version_stream_baseline.py::test_version_event_name`)
  - Given version event, When parsed, Then contains version/environment/git_commit and correlation_id (`tests/integration/test_version_stream_baseline.py::test_version_fields`)
  - Given connection open, When waiting, Then receive periodic heartbeat events (`tests/integration/test_version_stream_baseline.py::test_periodic_heartbeats`)
  - Given heartbeat timing, When measuring intervals, Then validate within 2x SSE_HEARTBEAT_INTERVAL window (`tests/integration/test_version_stream_baseline.py::test_heartbeat_timing_window`)
  - Given version data, When serialized, Then all fields JSON-serializable (ISO strings for datetimes) (`tests/integration/test_version_stream_baseline.py::test_json_serialization`)
- Instrumentation: Test logs with event sequence and timing
- Persistence hooks: None (version service reads from git/config)
- Gaps: None; event name corrected to "version"
- Evidence: `plan.md:422-433`

---

- Behavior: Real Flask server fixture (sse_server)
- Scenarios:
  - Given session start, When fixture requested, Then start Flask with waitress in background thread (`tests/conftest.py::sse_server`)
  - Given server startup, When initializing, Then find free port dynamically and poll /health until ready (`tests/conftest.py::sse_server`)
  - Given session end, When teardown, Then stop waitress gracefully and join thread with timeout (`tests/conftest.py::sse_server`)
  - Given SSEClient factory, When test requests client, Then provide configured instance with strict=True and timeout=10s (`tests/conftest.py::sse_client_factory`)
- Instrumentation: Fixture startup/shutdown logs
- Persistence hooks: None (test infrastructure only)
- Gaps: None; fixture design is explicit and complete
- Evidence: `plan.md:437-450`

---

## 5) Adversarial Sweep

**Attempted Checks (no credible issues found):**

- **Event format alignment**: Checked plan.md:145-198 against app/api/tasks.py:54-66 and app/api/utils.py:67 — event names and structure now match exactly (task_event wrapper, "version" not "version_info")
- **Correlation_id handling**: Checked plan.md:159,397,415 against app/utils/sse_utils.py:24-27 — injection documented, SSEClient preserves field, tests validate or strip
- **Test execution model**: Checked plan.md:50-60,442-445 against Flask streaming behavior — real server with waitress is necessary and well-designed (port management, health check, clean shutdown)
- **Directory structure**: Checked plan.md:109-130 against pyproject.toml:108 — tests/integration/ is valid; testpaths=["tests"] includes subdirectories; integration marker already defined
- **Heartbeat timing**: Checked plan.md:431,505 against risk of flakiness — 2x interval window is generous and practical; exact timing would flake in CI
- **Transaction safety**: No database writes in baseline tests (plan.md:284-289) — read-only validation; no transaction concerns
- **Session management**: sse_server fixture is session-scoped (plan.md:442) — ensures single server startup/shutdown; efficient and safe
- **Timeout handling**: Checked plan.md:312-315,394,447 — timeout=10s prevents hanging tests; SSEClient and sse_client_factory both specify timeout
- **Background task concurrency**: Checked plan.md:238-249,356-362 against plan design — background_task_runner fixture provides thread management with join on cleanup
- **SSE format compliance**: Checked plan.md:219-234,262-270 against SSE specification — parser correctly handles event:/data:/double newline format
- **Error cases**: Checked plan.md:293-333 against app/api/tasks.py:36-39 — task_not_found returns error event + connection_close (not HTTP 404); plan documents correctly

**Why the plan holds:**

All critical fault lines from the first review have been addressed with concrete fixes. Event format specifications are verified against actual implementation code (line numbers cited). Test execution model uses production-like streaming (waitress) rather than potentially-buffered test client. Open questions are resolved with explicit decisions and rationale. Coverage is comprehensive with no missing persistence hooks or instrumentation. The plan is implementation-ready.

---

## 6) Derived-Value & Persistence Invariants

- Derived value: SSE event ordering
  - Source dataset: Unfiltered event stream from TaskService.get_task_events() (app/services/task_service.py:212-249)
  - Write / cleanup triggered: No persistence; in-memory validation only
  - Guards: Test assertions validate connection_open first, completion/failure last, connection_close after final event
  - Invariant: Events arrive in causal order; connection_open precedes all task events; task_completed/task_failed precedes connection_close; no events after connection_close
  - Evidence: `plan.md:255-261`, `app/api/tasks.py:30-66`

---

- Derived value: SSE format compliance
  - Source dataset: Raw SSE output from format_sse_event() (app/utils/sse_utils.py:12-29)
  - Write / cleanup triggered: No writes; SSEClient helper validates format
  - Guards: SSEClient strict mode raises ValueError on malformed events; lenient mode logs warning
  - Invariant: All events must follow SSE spec (event: <name>\ndata: <json>\n\n); data must be valid JSON; event names non-empty
  - Evidence: `plan.md:262-270`, `plan.md:389-396`

---

- Derived value: Background task execution state
  - Source dataset: TaskService in-memory event queues
  - Write / cleanup triggered: No persistence; event queue cleanup on task completion (existing behavior)
  - Guards: background_task_runner fixture manages thread lifecycle; test timeout prevents deadlock
  - Invariant: Task executes concurrently with SSE stream consumption; events arrive before connection close; thread terminates on task completion
  - Evidence: `plan.md:271-279`, `plan.md:356-362`

---

## 7) Risks & Mitigations (top 3)

- Risk: Timing-sensitive tests may be flaky in CI (background task execution, heartbeat intervals)
- Mitigation: Use generous timeouts (10s for connections, 2x interval for heartbeats); proper thread synchronization in fixtures; mark as integration tests to run separately from fast unit tests
- Evidence: `plan.md:485-488`, `plan.md:431`, `pyproject.toml:112` (addopts excludes integration by default)

---

- Risk: Real Flask server fixture may not clean up properly on test failure or interruption
- Mitigation: Use try/finally in fixture teardown; daemon thread ensures process doesn't hang; 5s join timeout with logging if shutdown fails
- Evidence: `plan.md:445` (clean shutdown on session end), standard pytest fixture cleanup patterns

---

- Risk: SSE Gateway migration may reveal baseline tests missed edge cases
- Mitigation: Plan explicitly documents this is baseline capture of current behavior (plan.md:64-82); supplement with manual testing during migration; SSE Gateway plan references these tests for validation
- Evidence: `plan.md:40-45` (dependency on SSE Gateway integration), `plan.md:495-500`

---

## 8) Confidence

Confidence: High — All major conditions from first review resolved; event format verified against implementation; test execution model is explicit and practical; open questions answered with rationale; coverage is comprehensive; no credible implementation blockers remain.
