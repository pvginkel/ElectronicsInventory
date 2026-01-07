# Plan Review: Switch AI Testing from SSE Mocking to Real Backend

## 1) Summary & Decision

**Readiness**

The plan demonstrates strong research depth and comprehensive documentation of the migration from SSE mocking to real backend integration. It correctly identifies all affected files, provides detailed evidence citations, and follows established patterns from `task-events.spec.ts`. The test plan section outlines appropriate scenarios, and the implementation slices are logically ordered. However, the plan contains significant gaps in the task subscription event handling flow, unclear session lifecycle management, and missing critical details about how tests will coordinate the async taskId capture. The helper API design needs clarification before implementation can proceed safely.

**Decision**

`GO-WITH-CONDITIONS` — The plan's research is thorough and direction is correct, but implementation requires resolving the open questions around session creation timing, taskId capture coordination, and helper API surface before proceeding. Address the Major findings in sections 5 and 6 to ensure deterministic test execution.

## 2) Conformance & Fit (with evidence)

**Conformance to refs**

- `docs/commands/plan_feature.md` — Pass — `plan.md:3-676` — All required sections present with proper templates, evidence citations include file:line ranges, and research log documents discovery work
- `docs/contribute/testing/playwright_developer_guide.md` — Pass — `plan.md:19-24, 279-334` — Real backend pattern correctly references `task-events.spec.ts:222-334` as the proven approach; plan eliminates route mocking per line 162 guidance
- `docs/contribute/testing/index.md` — Pass — `plan.md:39-62` — Scope correctly excludes frontend application code changes and focuses on test infrastructure migration; aligns with principle that tests must exercise real backend
- `docs/product_brief.md` — N/A — This is testing infrastructure; no product brief conformance required

**Fit with codebase**

- `tests/support/helpers/deployment-sse.ts` — Pass — `plan.md:244-258` — Plan correctly identifies `deploymentSse.ensureConnected()` and `getRequestId()` as the connection management pattern; mirrors existing SSE helper approach
- `tests/support/helpers/test-events.ts` — Pass — `plan.md:355, 403-437` — Plan references `waitForSseEvent` helper correctly for subscription event capture; existing helper supports the required filtering by `streamId: 'tasks'` and `event: 'task_subscription'`
- `tests/support/fixtures.ts` — Pass — `plan.md:115-118, 289-299` — Fixture update approach matches existing factory pattern with session tracking array and teardown disposal
- `tests/e2e/parts/part-ai-creation.spec.ts` — Concern — `plan.md:122-125, 264-276` — Plan states "Test calls `await aiAnalysisMock({ analysisOverrides })` before UI interaction" (step 1) but then says "Helper waits internally for `task_subscription` event (or test waits explicitly)" (step 8), creating ambiguity about whether helper creation is sync or async — see Major finding in section 5

## 3) Open Questions & Ambiguities

The plan addresses several open questions in section 15 but leaves one critical ambiguity unresolved:

- Question: Should helper expose `waitForTaskId()` method for tests to explicitly await capture, or handle it implicitly before first event emission?
- Why it matters: Current test code (lines 29-66 in `part-ai-creation.spec.ts`) creates session with explicit `taskId` parameter and calls `waitForConnection()` synchronously; new flow requires async coordination but plan doesn't specify if `aiAnalysisMock()` returns immediately or awaits subscription
- Needed answer: Define whether helper factory returns a promise that resolves after taskId capture (making all session methods immediately usable) OR returns session synchronously with methods that internally await taskId capture on first use — this determines test code migration pattern

I performed research on the existing helper pattern:

Looking at `ai-analysis-mock.ts:154-287`, the current helper is synchronous: `createAiAnalysisMock` returns the session object immediately, then tests call `aiSession.waitForConnection()` to wait for SSE connection. The new pattern should maintain this contract for minimal test disruption.

**Recommended answer:** Helper factory should return session synchronously with `taskId: string | null` property initially null. Session methods (`emitStarted`, `emitProgress`, `emitCompleted`) should internally await taskId capture before posting to testing endpoint. Tests can optionally call `session.waitForTaskId()` if they need the ID for assertions. This matches existing `waitForConnection()` pattern and minimizes test code changes.

The remaining open questions in `plan.md:656-672` are appropriately scoped as implementation decisions that don't block the plan.

## 4) Deterministic Playwright Coverage (new/changed behavior only)

The migration changes test infrastructure but not user-visible behavior, so coverage focuses on validating the new helper mechanics:

- Behavior: AI analysis helper with real backend SSE
- Scenarios:
  - Given SSE connection established, When test creates AI mock session and triggers UI action, Then helper captures taskId from subscription event and subsequent emitStarted/emitProgress/emitCompleted calls deliver events to frontend (`tests/e2e/parts/part-ai-creation.spec.ts`)
  - Given subscription event not received within timeout, When helper awaits taskId capture, Then error thrown with clear message (`plan.md:383-389`)
  - Given session disposed, When test calls event emission method, Then error thrown (`plan.md:399-405`)
- Instrumentation: `task_subscription` SSE event with `data: { taskId }` (`plan.md:182-198`); `deploymentSse.getRequestId()` for request ID capture (`plan.md:244-249`)
- Backend hooks: `POST /api/testing/sse/task-event` with `request_id`, `task_id`, `event_type`, `data` (`plan.md:201-216`)
- Gaps: Plan states "May need to add explicit error case tests (currently only happy path coverage)" (`plan.md:556`) — this is acceptable as incremental enhancement; migration focuses on preserving existing coverage with real backend
- Evidence: `plan.md:519-567` — test plan section documents scenarios; `task-events.spec.ts:222-341` provides proven pattern

**Additional coverage concern:** Plan doesn't document how tests will verify the helper correctly correlates subscription events when multiple AI sessions could be created in sequence. The `task-events.spec.ts` pattern creates one task per test, but duplicate detection tests might trigger multiple analyses. See Major finding in section 5.

## 5) Adversarial Sweep (must find ≥3 credible issues or declare why none exist)

**Major — Subscription Event Correlation Gap**

**Evidence:** `plan.md:264-276` step 8: "Helper waits internally for `task_subscription` event (or test waits explicitly)"; `plan.md:415-421` error case: "Multiple Sessions in Single Test — Failure: Test creates multiple AI mock sessions... Sessions operate independently; each waits for its own subscription event"

**Why it matters:** The plan states helpers wait for subscription events but doesn't specify HOW to correlate events to the correct session. If a test creates two sessions in sequence (create session A, trigger UI action A, create session B, trigger UI action B), the second session could capture the first session's subscription event because `waitForSseEvent` in `test-events.ts:403-437` matches events by `streamId`, `phase`, and `event` criteria only — there's no session-specific correlation. The `task_subscription` event payload (`plan.md:186-198`) contains `{ taskId }` but no correlation to which helper session should consume it. This creates a race condition where helpers could capture each other's taskIds.

**Fix suggestion:** After reviewing the event flow, the correlation issue is resolved by timing: helpers should only start waiting for subscription events AFTER the UI action that triggers the API call. Rewrite `plan.md:264-276` step 2 to clarify: "Helper returns session object immediately (does NOT pre-wait for subscription)". Add new step between current steps 7 and 8: "Helper's internal state machine starts waiting for subscription event only when first event emission method (`emitStarted`, `emitProgress`, `emitCompleted`) is called." This ensures each helper waits for the subscription event that occurs AFTER its associated UI action. Update `plan.md:415-421` to document this sequencing requirement: "Sessions must be used sequentially: create session, trigger UI action, emit events, then create next session."

**Confidence:** High — This is a concurrency bug that would manifest in any test creating multiple sessions.

---

**Major — Helper Factory Async Contract Ambiguity**

**Evidence:** `plan.md:264` step 1: "Test calls `await aiAnalysisMock({ analysisOverrides })` before UI interaction"; `plan.md:272` step 8: "Helper waits internally for `task_subscription` event (or test waits explicitly)"; `plan.md:147-159` interface shows `createAiAnalysisMock` returns `Promise<AiAnalysisMockSession>` but then `plan.md:293` shows factory as `(options) => createAiAnalysisMock(...)` with no await

**Why it matters:** The plan doesn't specify whether the helper factory is async (returns Promise<Session>) or sync (returns Session). Current code (`ai-analysis-mock.ts:154`) is sync. If new helper is async and awaits taskId capture before returning, tests would await session creation but UI hasn't triggered the API call yet — deadlock. If sync and returns session with pending taskId, tests need clear guidance on when methods are safe to call. Step 1 shows `await aiAnalysisMock()` but this conflicts with "before UI interaction" since subscription event comes AFTER UI calls API.

**Fix suggestion:** Remove `await` from step 1 in `plan.md:264` — factory must be synchronous. Add to section 3 (Data Model) under AiAnalysisMockSession: "Factory function signature: `(options) => AiAnalysisMockSession` (synchronous, not Promise)". Clarify in `plan.md:272-273` that taskId capture happens lazily: "Session's `emitStarted()`, `emitProgress()`, `emitCompleted()` methods are async and internally await taskId capture before posting events; first call to any emission method triggers the wait." Add optional `waitForTaskId(): Promise<string>` method to session interface for tests that need to assert on taskId before emitting events. Update `plan.md:289-299` factory pattern to match: "Factory creates factory function: `(options) => createAiAnalysisMock(page, backendUrl, deploymentSse, options)` — note no async/await in factory signature."

**Confidence:** High — This is a contract issue that would break all test code migration.

---

**Major — Session Lifecycle State Machine Undefined**

**Evidence:** `plan.md:277` states "States / transitions: Session moves from 'awaiting taskId' → 'taskId captured' → 'events sent' → 'disposed'" but no code in section 5 (Algorithms & UI Flows) documents the state machine logic; `plan.md:158` shows `taskId: string` but doesn't indicate it can be null during "awaiting taskId" state; `plan.md:309` invariant says "Once captured, `taskId` must not change" but doesn't specify what happens if emission method called before capture completes

**Why it matters:** The helper has complex async state (connection established, taskId pending, taskId captured, disposed) but the plan doesn't document how methods coordinate around this state. If test calls `emitProgress()` before `emitStarted()`, and both methods independently await taskId capture, they could race — two simultaneous `waitForSseEvent` calls might both receive the same subscription event. The current helper (`ai-analysis-mock.ts:206-258`) has no async coordination because it uses pre-assigned taskId. Without explicit state machine logic, implementation will likely introduce subtle bugs.

**Fix suggestion:** Add detailed state machine documentation to section 5 under "New AI Analysis Mock Flow". Specify: "Session maintains internal state: `taskIdPromise: Promise<string> | null` initialized to null. On first call to any emission method, if `taskIdPromise` is null, create it: `taskIdPromise = waitForSseEvent(...).then(evt => evt.data.taskId)`. All subsequent emission method calls reuse the same promise. This ensures only one subscription wait occurs per session." Add to section 6 (Derived State) under "Captured Task ID": "Source: Lazy initialization — first emission method call creates taskId promise; subsequent calls await same promise (coordination via shared Promise instance)". Add guard to section 8 (Errors): "If multiple emission methods called concurrently before taskId captured, all await the same promise — only one `waitForSseEvent` call occurs."

**Confidence:** High — Concurrent method calls are common in async test code; uncoordinated waits would cause flaky failures.

---

**Minor — Obsolete stream_url Field Removal Not Tested**

**Evidence:** `plan.md:60` in-scope item: "Remove obsolete `stream_url` references from test code"; `plan.md:231` notes "stream_url deprecated" but `plan.md:519-567` test plan has no scenario validating that helpers no longer use or reference this field

**Why it matters:** While removing dead references is mechanical, without explicit coverage the migration could accidentally leave `streamPath` or `streamUrl` properties in helper interfaces or test assertions, causing maintenance confusion later

**Fix suggestion:** Add to `plan.md:519-528` AI analysis flow scenarios: "Given analysis completes, When test inspects session object, Then session has no `streamPath` or `streamUrl` properties (validates deprecated fields fully removed)". This forces implementation to verify interface cleanup.

**Confidence:** Medium — Missing coverage could leave dead code, but won't cause functional failures.

---

**Minor — Backend Testing Endpoint 400 Error Handling Incomplete**

**Evidence:** `plan.md:391-397` documents "Backend Event Delivery Failure — POST to `/api/testing/sse/task-event` returns 400... Handling: Propagate HTTP error as test failure; no retry logic" but `plan.md:286-296` event emission code in task-events.spec.ts shows no explicit status checking — relies on Playwright's default error propagation

**Why it matters:** If backend returns 400 (no active connection for request_id), the error message might be opaque Playwright HTTP error rather than actionable "SSE connection not found for request_id X". Tests will fail but debugging will be harder.

**Fix suggestion:** Add to section 8 error case for "Backend Event Delivery Failure": "Handling: Emission methods wrap `page.request.post()` with status check: if response.status() >= 400, throw new Error with formatted message including request_id, task_id, and status code for debugging." Update `plan.md:391-397` to show explicit error handling instead of relying on default propagation. This improves test failure ergonomics.

**Confidence:** Medium — Current approach works but produces poor error messages; not blocking but worth improving during implementation.

## 6) Derived-Value & State Invariants (table)

- Derived value: Captured Task ID
  - Source dataset: Unfiltered — First `task_subscription` SSE event with `streamId: 'tasks'` after UI action; event.data.taskId extracted
  - Write / cleanup triggered: Stored in session-local variable; used to construct all event emission payloads (`POST /api/testing/sse/task-event` with `task_id` field); no cleanup (session disposal doesn't notify backend)
  - Guards: `waitForSseEvent` with 10s timeout (`plan.md:308`); validate taskId is non-empty string (`plan.md:407-413`); lazy initialization ensures only one subscription wait per session (see Major finding above)
  - Invariant: Once captured, taskId must remain stable for session lifetime; all event emissions must use identical taskId value; taskId promise must be shared across concurrent emission method calls to prevent multiple subscription waits
  - Evidence: `plan.md:303-310`, `plan.md:271-283` (subscription event flow), `plan.md:286-296` (usage in event emission)

- Derived value: SSE Request ID
  - Source dataset: Unfiltered — Global SSE connection managed by `deploymentSse` fixture; `deploymentSse.getRequestId()` returns current connection's request ID
  - Write / cleanup triggered: Captured once at session creation time (or cached from earlier capture); used in all event emission POST requests to route events to correct backend connection; no writes to connection state
  - Guards: `deploymentSse.ensureConnected()` must be called before session creation (`plan.md:375-381`); validate requestId is non-null before allowing session creation
  - Invariant: Request ID must remain stable for test duration; if SSE connection drops and reconnects with new request_id, existing sessions become invalid (events will 400); tests must not create sessions before connection established
  - Evidence: `plan.md:312-319`, `plan.md:244-249` (connection pattern), `plan.md:286-296` (usage in POST body)

- Derived value: Analysis Template (merged result)
  - Source dataset: Filtered — User-provided `analysisOverrides` merged onto `defaultAnalysis` object
  - Write / cleanup triggered: Immutable after session creation; passed to `emitCompleted()` where further merged with `completionOverrides`; final merged result posted to backend testing endpoint
  - Guards: Merging is shallow spread (`plan.md:140-152` shows `{ ...base, ...overrides }`); no validation of required fields (backend testing mode accepts arbitrary payloads `plan.md:74, 231`)
  - Invariant: Template shape should match `AIPartAnalysisTaskResultSchema` structure to avoid frontend parse errors, but backend testing mode doesn't enforce this; test-visible failures occur at frontend deserialization time
  - Evidence: `plan.md:321-329`, `ai-analysis-mock.ts:140-152` (merge function)

- Derived value: Cleanup Template (merged result)
  - Source dataset: Filtered — User-provided `cleanupOverrides` merged onto `defaultCleanup` object
  - Write / cleanup triggered: Same pattern as analysis template
  - Guards: Same as analysis template
  - Invariant: Same as analysis template but for cleanup result schema
  - Evidence: `plan.md:330-337`, `ai-cleanup-mock.ts:106-118`

**Filtered view write risk assessment:** None of these derived values use filtered datasets to drive persistent writes. The taskId and requestId are derived from unfiltered event streams (first matching event). The templates are test-local data that only affect test execution, not application state. No guards against filtered-write bugs are needed here.

## 7) Risks & Mitigations (top 3)

- Risk: Task subscription event timing — frontend may emit subscription event before helper starts waiting if implementation doesn't coordinate event buffer correctly
- Mitigation: Rely on test event buffer in `test-events.ts` which captures all events from page load; `waitForSseEvent` searches buffered events first before waiting for new events (verify this behavior in implementation); document in plan that helpers can safely wait for subscription events that occurred before the wait started
- Evidence: `plan.md:636-639` identifies timing risk; `test-events.ts:403-437` shows `waitForSseEvent` implementation (requires verification that it supports buffered event matching)

- Risk: Unclear helper API contract causes test migration errors — tests don't know whether `aiAnalysisMock()` is sync or async, leading to incorrect await patterns
- Mitigation: Resolve the async contract ambiguity documented in Major finding #2; update plan section 3 to explicitly show factory returns `AiAnalysisMockSession` (not Promise); add migration example to implementation slices showing before/after test code
- Evidence: `plan.md:264` step 1 shows `await aiAnalysisMock()` conflicting with synchronous factory pattern in `ai-analysis-mock.ts:154`; see Major finding in section 5

- Risk: Missing state machine coordination causes race conditions when test calls multiple emission methods in sequence
- Mitigation: Implement shared taskId promise pattern documented in Major finding #3; add unit-style test for helper that verifies concurrent `emitProgress()` calls both use same taskId without triggering multiple subscription waits
- Evidence: `plan.md:277` mentions state machine but provides no coordination details; see Major finding in section 5

## 8) Confidence

Confidence: Medium — The plan's research is thorough, the real backend pattern is proven, and the scope is well-defined. However, the helper API contract ambiguities (sync vs async factory, session lifecycle state machine, subscription event correlation) introduce implementation risk that could derail the migration. Once the Major findings are addressed by clarifying the helper interface and state coordination, confidence would increase to High. The migration itself is straightforward mechanical work following the established `task-events.spec.ts` pattern.
