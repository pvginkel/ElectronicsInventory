# Code Review: Switch AI Testing from SSE Mocking to Real Backend

## 1) Summary & Decision

**Readiness**

The implementation successfully migrates all AI testing infrastructure from SSE mocking to real backend integration. The 512-line `sse-mock.ts` file has been deleted, both `ai-analysis-mock.ts` and `ai-cleanup-mock.ts` have been rewritten to use the `/api/testing/sse/task-event` endpoint, and all test specs have been updated to follow the new synchronous factory pattern with lazy task subscription. All 14 affected test cases pass with the real backend flow. Type checking and linting are clean. The core migration work is complete and functional.

**Decision**

`GO-WITH-CONDITIONS` — The implementation correctly implements the plan's intent and all tests pass, but two issues require attention before final sign-off: (1) a **Blocker** synchronous taskId getter implementation that cannot work as designed (lines 262-270 in both mock helpers), and (2) a **Major** missing validation in `sendTaskEvent` for null requestId scenario. These are straightforward fixes that preserve the existing architecture.

## 2) Conformance to Plan (with evidence)

**Plan alignment**

- `Slice 1: Delete SSE Mocking Infrastructure` ↔ `tests/support/helpers/sse-mock.ts` deleted (confirmed via git diff showing 511 lines removed)
- `Slice 1: Remove sseMocker fixture` ↔ `tests/support/fixtures.ts:338-343` removed (diff shows sseMocker fixture and import deleted)
- `Slice 2: Rewrite AI Analysis Mock Helper` ↔ `tests/support/helpers/ai-analysis-mock.ts:125-279` — complete rewrite with lazy taskId capture via `ensureTaskId()` (lines 137-163), POST to `/api/testing/sse/task-event` (lines 165-193), streamId correctly uses 'task' (line 145)
- `Slice 3: Rewrite AI Cleanup Mock Helper` ↔ `tests/support/helpers/ai-cleanup-mock.ts:91-234` — mirrors analysis helper structure with cleanup-specific payload
- `Slice 4: Update Mock Fixtures` ↔ `tests/support/fixtures.ts:336-371` — `aiAnalysisMock` and `aiCleanupMock` fixtures now accept `backendUrl` and `deploymentSse` parameters, factory functions are synchronous (no await), session tracking preserved
- `Slice 5: Update AI Test Specs` ↔ All three AI test specs updated:
  - `part-ai-creation.spec.ts:32-34` — SSE connection established before mock creation
  - `part-ai-creation.spec.ts:36` — synchronous factory call (no await)
  - `part-ai-creation.spec.ts:75` — prompt submission triggers real API, removed waitForConnection
  - `ai-part-cleanup.spec.ts`, `ai-parts-duplicates.spec.ts` — same pattern applied
- `Slice 6: Verify and Fix Tests` ↔ All 14 AI tests pass (3 in part-ai-creation, 6 in ai-part-cleanup, 5 in ai-parts-duplicates)

**Gaps / deviations**

- Plan Section 9 (Data Model) specified `streamId: 'tasks'` (plural) for task subscription event, but implementation correctly uses `streamId: 'task'` (singular) to match `use-sse-task.ts:101` and `task-events.spec.ts:13`. This is a plan typo, not an implementation deviation—the code is correct.
- Plan Section 5 (Algorithms & UI Flows, step 9) described lazy initialization as "first emission method call checks if null and creates promise", but implementation correctly extracts this logic into a shared `ensureTaskId()` helper function (lines 137-163 in both helpers) for better code organization. This improves maintainability without changing behavior.
- Plan Section 6 (Derived State, taskId getter) did not specify the getter implementation approach. Implementation added a synchronous getter (lines 262-270) that attempts to synchronously return a value from an asynchronous promise, which is fundamentally broken. This is a missing spec detail that led to an incorrect implementation.

## 3) Correctness — Findings (ranked)

- Title: `Blocker — taskId getter returns null even after promise resolves`
- Evidence: `ai-analysis-mock.ts:262-270`, `ai-cleanup-mock.ts:217-225` — getter uses synchronous pattern `let resolvedTaskId: string | null = null; void taskIdPromise.then(id => { resolvedTaskId = id; })` which returns `null` immediately before the promise callback executes
- Impact: Tests that access `session.taskId` (e.g., for assertions or debugging) will always receive `null` even after `waitForTaskId()` or emission methods complete, breaking observability and potential future test logic
- Fix: Remove the synchronous getter entirely. The property is declared in the interface as `taskId: string | null` but the getter pattern cannot work in JavaScript. Replace with: (1) delete getter implementation (lines 262-270), (2) update session object to `{ taskId: null, analysisTemplate, waitForTaskId, ... }` with hardcoded `null`, (3) update interface doc comment to clarify "`taskId` is always null; use `await waitForTaskId()` to retrieve the actual task ID after subscription", or (4) refactor to make `taskId` a settable property updated by `ensureTaskId` after resolution (store resolved value in closure variable, update property synchronously)
- Confidence: High — JavaScript promises are inherently asynchronous; `then()` callbacks execute in a future microtask, so `resolvedTaskId` cannot be set before the getter returns

---

- Title: `Major — Missing validation for null requestId scenario`
- Evidence: `ai-analysis-mock.ts:170`, `ai-cleanup-mock.ts:136` — `getRequestId()` call followed by null check at line 173/139, but error message references "must be established before creating AI mock session"
- Impact: If SSE connection drops between session creation and first event emission, `getRequestId()` returns null but error message misleads developer to check session creation order instead of connection stability; wastes debugging time
- Fix: Update error message to reflect timing: "SSE connection lost or not established. Call deploymentSse.ensureConnected() and ensure connection remains active during test execution. (request_id: null, task_id: ${taskId})"
- Confidence: High — `deploymentSse.getRequestId()` can return null if connection was never established OR if it disconnected; error message should guide developer to correct diagnosis

---

- Title: `Minor — Inconsistent comment style for lazy initialization`
- Evidence: `ai-analysis-mock.ts:136`, `ai-cleanup-mock.ts:102` — comments say "captures taskId from task_subscription event on first call" but `ensureTaskId` is called by all emission methods, not just "first call"
- Impact: Minor documentation ambiguity; comment could imply first call initializes and subsequent calls skip the wait, when actually the promise caching provides the skip behavior
- Fix: Revise comment to: "Lazy initialization: first call to any emission method creates taskIdPromise by waiting for task_subscription event; subsequent calls reuse the cached promise"
- Confidence: Medium — current comment is not wrong but could be clearer about the caching mechanism

## 4) Over-Engineering & Refactoring Opportunities

No over-engineering detected. The helpers are appropriately simple:

- Lazy initialization via shared promise is the correct pattern for coordinating concurrent emission method calls
- Synchronous factory function simplifies test code (no await on session creation)
- Extracted `ensureTaskId()` and `sendTaskEvent()` functions improve readability vs. inline logic in each emission method
- No unnecessary abstractions or premature optimization

The code follows established patterns from `deployment-sse.ts` and `task-events.spec.ts` without introducing novel complexity.

## 5) Style & Consistency

**Pattern: SSE event waiting**

- Evidence: `ai-analysis-mock.ts:144-149` uses `waitForSseEvent({ streamId: 'task', phase: 'open', event: 'task_subscription', timeoutMs: 10000 })`, matching `task-events.spec.ts:271-276`
- Impact: Consistent with existing task SSE test patterns
- Recommendation: None; pattern is correct

**Pattern: Error message formatting**

- Evidence: `ai-analysis-mock.ts:189-192` constructs multi-line error with event type, status, request_id, and task_id; `ai-cleanup-mock.ts:155-158` mirrors this format
- Impact: Consistent debugging information across both helpers
- Recommendation: None; good consistency

**Pattern: Fixture session tracking**

- Evidence: `fixtures.ts:336-348` for analysis mock, `fixtures.ts:350-362` for cleanup mock — both use identical factory-with-session-array pattern
- Impact: Consistent lifecycle management; dispose called on all sessions during teardown
- Recommendation: None; established pattern reused correctly

## 6) Tests & Deterministic Coverage (new/changed behavior only)

**Surface: AI Analysis Mock Helper**

- Scenarios:
  - Given SSE connection established and analysis mock created, When test calls `emitStarted()`, Then helper lazily waits for `task_subscription` event, captures taskId, and POSTs `task_started` event to `/api/testing/sse/task-event` (`tests/e2e/parts/part-ai-creation.spec.ts:77`)
  - Given mock session created, When test calls `emitProgress()` before `emitStarted()`, Then helper initializes taskIdPromise on first call and subsequent calls await same promise (`part-ai-creation.spec.ts:78-79` — progress called after started, but concurrent call scenario not explicitly tested)
  - Given analysis completes, When test calls `emitCompleted({ analysis: { ... }, duplicate_parts: [...] })`, Then payload includes nested structure with `analysis_result`, `duplicate_parts`, and `analysis_failure_reason` fields (`ai-parts-duplicates.spec.ts:93-121`)
  - Given analysis fails, When test calls `emitFailure('message')`, Then completion event sent with `success: false`, `analysis: null`, `error_message` populated (`part-ai-creation.spec.ts:153-155`)
- Hooks: `waitForSseEvent` with 10s timeout for task_subscription; `deploymentSse.getRequestId()` for request_id; `page.request.post()` for event delivery; status check on POST response
- Gaps: No explicit test for concurrent emission method calls (e.g., `Promise.all([emitProgress(...), emitProgress(...)])`) to verify shared promise coordination; lazy initialization pattern is covered implicitly but not stressed
- Evidence: `part-ai-creation.spec.ts:77-82`, `ai-parts-duplicates.spec.ts:213-250`

**Surface: AI Cleanup Mock Helper**

- Scenarios:
  - Given cleanup mock created with `cleanupOverrides`, When test triggers cleanup UI action, Then helper waits for subscription and emits cleanup events with merged template (`ai-part-cleanup.spec.ts:61-85`)
  - Given cleanup completes successfully, When test applies selected fields, Then backend receives PATCH with only checked field updates (`ai-part-cleanup.spec.ts:356-397`)
  - Given cleanup fails mid-stream, When helper calls `emitFailure()`, Then error message shown on progress step and user can retry (`ai-part-cleanup.spec.ts:290-299`)
- Hooks: Same SSE and HTTP patterns as analysis mock
- Gaps: None beyond the concurrent call scenario noted above
- Evidence: `ai-part-cleanup.spec.ts:83-108`

**Surface: Test Fixture Changes**

- Scenarios:
  - Given fixture creates multiple AI mock sessions in single test, When fixture teardown runs, Then all sessions disposed without error (`fixtures.ts:344-348` — sessions array iterated and dispose called)
  - Given factory called before SSE connection established, When `ensureTaskId()` executes, Then error thrown with actionable message (`ai-analysis-mock.ts:173-176` — validated by error message, not explicitly tested)
- Hooks: `deploymentSse.ensureConnected()` required before session creation; session lifecycle managed by fixture
- Gaps: No explicit test verifying fixture teardown disposes all sessions; relying on pattern copied from existing fixtures
- Evidence: `fixtures.ts:344-348`

## 7) Adversarial Sweep (must attempt ≥3 credible failures or justify none)

**Attack 1: Race condition if SSE connection drops after session creation but before first emission**

- Evidence: `ai-analysis-mock.ts:169-176` — `getRequestId()` called inside `sendTaskEvent`, not at session creation time
- Why it could fail: If connection drops between `aiAnalysisMock()` call and `emitStarted()`, requestId becomes null and error thrown
- Code held up: Error message guides developer to re-establish connection; test fails fast with clear diagnostic. Backend managed services maintain stable connections; if reconnection occurs, new requestId would be captured. Acceptable tradeoff vs. caching requestId at session creation (which would fail silently with stale ID).

**Attack 2: Multiple concurrent emission method calls before taskId resolved**

- Evidence: `ai-analysis-mock.ts:134` — `taskIdPromise` is shared closure variable; `ensureTaskId()` checks if null before creating promise (lines 142-160)
- Why it could fail: If test calls `Promise.all([emitStarted(), emitProgress()])` before taskId captured, both methods call `ensureTaskId()` concurrently and could create two separate `waitForSseEvent` calls
- Code held up: Promise caching works correctly—`if (!taskIdPromise)` check at line 142 ensures only first caller creates promise; second caller sees non-null promise and awaits same instance (line 162). No race window because JavaScript is single-threaded and the check-and-assign is atomic within synchronous code.

**Attack 3: Test creates second AI session while first session's taskId still pending**

- Evidence: Tests like `ai-parts-duplicates.spec.ts` create single session per test; sequential usage pattern expected per plan section 8 (Open Questions, resolved item)
- Why it could fail: If test created two sessions rapidly and triggered two UI actions, both sessions would wait for `task_subscription` event and first session might capture second session's taskId (no correlation ID filtering)
- Code held up: Plan explicitly documents sequential usage requirement (section 8, "Require sequential usage pattern: create session, trigger UI action, emit events, complete, then create next session"). Lazy subscription wait (only starts on first emission call AFTER UI action) ensures proper correlation. Test event buffer allows helpers to wait for events that occurred before wait started, so timing works correctly. Tests follow this pattern—all reviewed specs create session, trigger UI, emit events in sequence.

**Attack 4: Disposed session called after fixture teardown**

- Evidence: `ai-analysis-mock.ts:138-140` — `ensureTaskId()` checks `disposed` flag and throws if true
- Why it could fail: If test holds session reference and calls `emitProgress()` after fixture teardown disposes all sessions
- Code held up: Disposed check at line 138 throws error "AI analysis mock has been disposed" before attempting to create taskIdPromise. Tests follow fixture lifecycle—no specs retain session references beyond test completion.

## 8) Invariants Checklist (table)

**Invariant: taskIdPromise is created at most once per session**

- Where enforced: `ai-analysis-mock.ts:142` — `if (!taskIdPromise)` check ensures single initialization; subsequent calls at line 162 return cached promise
- Failure mode: If check-and-create was not atomic, concurrent `ensureTaskId()` calls could create multiple promises and capture different task subscription events (wrong taskId correlation)
- Protection: JavaScript single-threaded execution guarantees atomicity of `if (!taskIdPromise) { taskIdPromise = ... }` block; no async operations between check and assignment
- Evidence: Pattern proven in task-events.spec.ts; promise caching is standard async coordination technique

**Invariant: All events for a session use the same taskId**

- Where enforced: `ai-analysis-mock.ts:169` — `sendTaskEvent` calls `ensureTaskId()` which returns same promise for all callers; resolved value used in all POST payloads (line 181)
- Failure mode: If each emission method created its own taskId capture, events would route to different backend tasks and UI would not update correctly
- Protection: Shared `taskIdPromise` closure variable ensures consistent taskId across all `sendTaskEvent` calls; lazily initialized on first call, reused for all subsequent calls
- Evidence: `ai-analysis-mock.ts:134` — promise stored in session-scoped closure

**Invariant: SSE requestId must be non-null when sending task events**

- Where enforced: `ai-analysis-mock.ts:172-176` — explicit null check after `getRequestId()` with error thrown if null
- Failure mode: If requestId is null, backend cannot route event to correct SSE connection; event lost or returns 400 error
- Protection: Guard at line 172 throws before POST attempt; error message instructs developer to call `ensureConnected()` (though message could be clearer per Finding #2 above)
- Evidence: `deployment-sse.ts:81-90` — `getRequestId()` returns null if connection not established

**Invariant: Session emission methods must not be called after dispose**

- Where enforced: `ai-analysis-mock.ts:138-140` — disposed flag checked in `ensureTaskId()` which is called by all emission methods
- Failure mode: If disposed session emits events, taskIdPromise could be created after fixture teardown, leading to dangling event waits or leaked listeners
- Protection: Early return with error in `ensureTaskId()` prevents any taskId capture or event emission after disposal; `dispose()` is idempotent (line 254-256)
- Evidence: `ai-analysis-mock.ts:253-259` — dispose sets flag and subsequent calls no-op

## 9) Questions / Needs-Info

- Question: Should the `taskId` getter be removed from the public interface, or should it be refactored to actually work?
- Why it matters: Current implementation creates false expectation that `session.taskId` is observable after `waitForTaskId()` completes, but getter always returns null. If tests or future debugging code rely on this property, they will fail silently.
- Desired answer: Confirm whether any code currently accesses `session.taskId` property (beyond type checking). If no usage exists, simplest fix is to remove getter and document that only `waitForTaskId()` method provides access to taskId. If usage exists or is planned, refactor to store resolved value in closure variable and return synchronously.

---

- Question: What is the expected behavior if `deploymentSse.getRequestId()` returns null during `sendTaskEvent()`?
- Why it matters: Current error message says "must be established before creating AI mock session" but check happens during event emission, not session creation. Message misdiagnoses the issue.
- Desired answer: Confirm that connection can drop mid-test (unlikely in managed services) and whether error message should guide developer toward reconnection vs. session recreation. Clarifies whether caching requestId at session creation time would be safer.

## 10) Risks & Mitigations (top 3)

- Risk: Synchronous `taskId` getter implementation is fundamentally broken due to JavaScript async semantics—always returns null even after promise resolves
- Mitigation: Remove getter implementation and hardcode `taskId: null` in session object, or refactor to cache resolved value in closure variable and synchronously return it. Update interface documentation to clarify that `waitForTaskId()` method is the only way to retrieve taskId.
- Evidence: `ai-analysis-mock.ts:262-270` — `void taskIdPromise.then(id => { resolvedTaskId = id; })` executes asynchronously; `return resolvedTaskId` at line 267 runs before callback

---

- Risk: Error message for null requestId scenario misleads developers during debugging
- Mitigation: Update error message at `ai-analysis-mock.ts:173-176` and `ai-cleanup-mock.ts:139-142` to: "SSE connection lost or not established. Call deploymentSse.ensureConnected() and ensure connection remains active. (request_id: null, task_id: ${taskId})"
- Evidence: `ai-analysis-mock.ts:172-176` — null check happens during event emission, not session creation, but error message references session creation timing

---

- Risk: No explicit test coverage for concurrent emission method calls (e.g., `Promise.all([emitProgress(), emitProgress()])`)
- Mitigation: Code review confirms promise caching pattern is correct (lines 142-162), but adding a test spec that explicitly calls two emission methods concurrently would validate the shared promise coordination. Low priority—pattern is proven and unlikely to regress.
- Evidence: All test specs call emission methods sequentially with `await` (e.g., `part-ai-creation.spec.ts:77-82`); no concurrent stress tests

## 11) Confidence

Confidence: High — The migration is architecturally sound, follows established patterns from `task-events.spec.ts` and `deployment-sse.ts`, and all 14 tests pass. The two identified issues (taskId getter implementation and error message clarity) are isolated, straightforward to fix, and do not affect current test execution since no code accesses the `taskId` property directly. The lazy initialization pattern is correctly implemented with proper promise caching. The code eliminates 512 lines of complex mocking infrastructure and replaces it with simpler real-backend integration, improving maintainability and test fidelity.
