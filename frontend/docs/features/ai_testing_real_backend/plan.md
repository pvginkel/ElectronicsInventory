# Technical Plan: Switch AI Testing from SSE Mocking to Real Backend

## 0) Research Log & Findings

**Research Scope**

- Examined existing SSE mocking infrastructure (`tests/support/helpers/sse-mock.ts`)
- Reviewed AI analysis and cleanup mock helpers (`ai-analysis-mock.ts`, `ai-cleanup-mock.ts`)
- Analyzed existing real backend SSE pattern in `tests/e2e/sse/task-events.spec.ts` (lines 222-334)
- Reviewed deployment SSE helper pattern (`tests/support/helpers/deployment-sse.ts`)
- Examined fixture setup in `tests/support/fixtures.ts`
- Surveyed AI test specs: `part-ai-creation.spec.ts`, `ai-part-cleanup.spec.ts`, `ai-parts-duplicates.spec.ts`
- Reviewed backend testing mode documentation (`/work/backend/docs/features/ai_testing_mode/frontend_instructions.md`)

**Key Findings**

1. **SSEMocker infrastructure**: 512-line file that replaces global `EventSource` with mock implementation, restricted to AI stream patterns via whitelist
2. **Current AI mock flow**: Uses `page.route()` to intercept POST requests and return fake `task_id`/`stream_url`, then injects events via `page.evaluate()`
3. **Real backend pattern exists**: `task-events.spec.ts:222` demonstrates correct flow:
   - Establish SSE connection via `deploymentSse.ensureConnected()`
   - Capture `requestId` from connection status
   - Trigger UI action that calls real API
   - Wait for `task_subscription` SSE event to capture `taskId`
   - POST to `/api/testing/sse/task-event` with `request_id`, `task_id`, `event_type`, `data`
4. **Backend testing mode**: When `FLASK_ENV=testing`, AI endpoints skip validation and return random UUID as `task_id`
5. **Obsolete fields**: Response includes `stream_url` field that frontend no longer uses (SSE connection is global)
6. **Fixture dependencies**: `aiAnalysisMock` and `aiCleanupMock` fixtures depend on `sseMocker` fixture (lines 345, 361 in fixtures.ts)

**Conflicts Resolved**

- Backend instructions show older SSE connection approach; real pattern uses global SSE stream with `requestId` correlation
- Helper API will change from pre-creating session before UI action to capturing `taskId` after UI triggers real API call
- Tests currently expect synchronous mock setup; new flow requires async wait for subscription event

## 1) Intent & Scope

**User intent**

Replace Playwright's SSE mocking infrastructure for AI features with real backend integration, leveraging the backend's testing mode (`FLASK_ENV=testing`) and the `/api/testing/sse/task-event` endpoint to send controlled events without mocking routes or EventSource.

**Prompt quotes**

"Replace the current SSE mocking infrastructure for AI analysis and cleanup tests with real backend calls, using the new `/api/testing/sse/task-event` endpoint to send controlled SSE events."

"No real AI processing occurs"—backend returns random UUID and tests control event flow via testing endpoint.

"Remove `tests/support/helpers/sse-mock.ts` entirely"

"Wait for `task_subscription` SSE event to confirm frontend subscribed"

**In scope**

- Delete `tests/support/helpers/sse-mock.ts` (512 lines)
- Remove `sseMocker` fixture from `tests/support/fixtures.ts`
- Rewrite `tests/support/helpers/ai-analysis-mock.ts` to use real backend + `/api/testing/sse/task-event`
- Rewrite `tests/support/helpers/ai-cleanup-mock.ts` to use real backend + `/api/testing/sse/task-event`
- Update `aiAnalysisMock` and `aiCleanupMock` fixtures to remove `sseMocker` dependency
- Remove all `page.route()` calls for AI endpoints (suppress existing eslint-disable comments)
- Update all AI test specs to work with new helpers (`part-ai-creation.spec.ts`, `ai-part-cleanup.spec.ts`, `ai-parts-duplicates.spec.ts`)
- Remove obsolete `stream_url` references from test code
- Ensure all tests pass with real backend SSE flow

**Out of scope**

- Backend changes (testing mode already implemented)
- Frontend application code changes (SSE subscription logic unchanged)
- Changes to deployment SSE helper or non-AI tests
- Adding new AI test scenarios
- Performance optimization of test execution

**Assumptions / constraints**

- Backend testing mode (`FLASK_ENV=testing`) is available and functional
- `/api/testing/sse/task-event` endpoint accepts `request_id`, `task_id`, `event_type`, `data`
- Frontend already connects to global SSE stream and subscribes to tasks
- `deploymentSse` helper provides `ensureConnected()` and `getRequestId()`
- Frontend emits `task_subscription` SSE test event when `useSSETask` subscribes
- No changes to backend event payload schemas
- Tests run with managed services (per-worker backend instances)

## 1a) User Requirements Checklist

**User Requirements Checklist**

- [ ] Remove SSE mocking infrastructure completely (delete `tests/support/helpers/sse-mock.ts`)
- [ ] Remove `sseMocker` fixture from `tests/support/fixtures.ts`
- [ ] Rewrite `ai-analysis-mock.ts` to use real backend + `/api/testing/sse/task-event` endpoint
- [ ] Rewrite `ai-cleanup-mock.ts` to use real backend + `/api/testing/sse/task-event` endpoint
- [ ] Remove all route mocking (`page.route()`) for AI endpoints
- [ ] Update `aiAnalysisMock` fixture to use the new helper
- [ ] Update `aiCleanupMock` fixture to use the new helper
- [ ] Fix any failing tests after the migration
- [ ] All existing AI analysis tests pass with real backend
- [ ] All existing AI cleanup tests pass with real backend

## 2) Affected Areas & File Map

**Helpers to Delete**

- Area: `tests/support/helpers/sse-mock.ts`
- Why: Entire SSE mocking infrastructure no longer needed; real backend SSE replaces it
- Evidence: `sse-mock.ts:1-512` — 512 lines of EventSource mocking, registration, and stream control; restricted to AI patterns via whitelist (lines 43-94)

**Helpers to Rewrite**

- Area: `tests/support/helpers/ai-analysis-mock.ts`
- Why: Remove route interception and SSE mocking; use real backend + `/api/testing/sse/task-event`
- Evidence: `ai-analysis-mock.ts:154-179` — `createAiAnalysisMock` currently calls `page.route(analyzeMatcher)` and `sseMocker.mockSSE()` with eslint-disable comments; `ai-analysis-mock.ts:187-200` — `sendTaskEvent` uses `sseMocker.sendEvent(streamPattern)` to inject events

- Area: `tests/support/helpers/ai-cleanup-mock.ts`
- Why: Same changes as AI analysis mock—remove mocking, use real backend
- Evidence: `ai-cleanup-mock.ts:120-151` — mirrors analysis mock structure with route interception; `ai-cleanup-mock.ts:153-166` — uses `sseMocker.sendEvent` for event injection

**Fixtures to Update**

- Area: `tests/support/fixtures.ts`
- Why: Remove `sseMocker` fixture; update `aiAnalysisMock` and `aiCleanupMock` to remove dependency on it
- Evidence: `fixtures.ts:88-89` — `sseMocker: SSEMocker` fixture with auto-setup; `fixtures.ts:338-343` — sseMocker fixture setup calls `setupSSEMonitoring()` and `closeAllStreams()`; `fixtures.ts:345` — `aiAnalysisMock` depends on `{ page, sseMocker }`; `fixtures.ts:361` — `aiCleanupMock` depends on `{ page, sseMocker }`

**Test Specs to Update**

- Area: `tests/e2e/parts/part-ai-creation.spec.ts`
- Why: Adjust to new async flow where session captures `taskId` after UI triggers API call
- Evidence: `part-ai-creation.spec.ts:29-66` — creates `aiSession` with explicit `taskId` and `streamPath` before UI interaction; `part-ai-creation.spec.ts:77` — calls `aiSession.waitForConnection()` after prompt submission

- Area: `tests/e2e/parts/ai-part-cleanup.spec.ts`
- Why: Same flow adjustment as analysis tests
- Evidence: `ai-part-cleanup.spec.ts:33-56` — creates `cleanupSession` with explicit `taskId` before UI interaction

- Area: `tests/e2e/parts/ai-parts-duplicates.spec.ts`
- Why: Uses same AI analysis mock pattern
- Evidence: File likely mirrors `part-ai-creation.spec.ts` structure (requires reading to confirm)

**Type Definitions**

- Area: `tests/support/helpers/ai-analysis-mock.ts` (interfaces)
- Why: Remove `streamPath`, `streamPattern` options; add flow for capturing `taskId` from subscription event
- Evidence: `ai-analysis-mock.ts:65-72` — `AiAnalysisMockOptions` includes `taskId`, `streamPath`, `streamPattern`; `ai-analysis-mock.ts:74-85` — `AiAnalysisMockSession` returns `streamPath`, `waitForConnection()`

- Area: `tests/support/helpers/ai-cleanup-mock.ts` (interfaces)
- Why: Same interface changes as analysis mock
- Evidence: `ai-cleanup-mock.ts:43-50` — mirrors analysis mock options

## 3) Data Model / Contracts

**AI Analysis Mock Session (New)**

- Entity: `AiAnalysisMockSession`
- Shape:
  ```typescript
  {
    taskId: string | null;          // Initially null; captured from task_subscription event
    analysisTemplate: AiAnalysisResult;
    waitForTaskId(): Promise<string>; // Optional: explicitly await taskId capture
    emitStarted(): Promise<void>;
    emitProgress(text: string, value: number): Promise<void>;
    emitCompleted(overrides?: AiAnalysisCompletionOverrides): Promise<void>;
    emitFailure(message: string): Promise<void>;
    dispose(): Promise<void>;
  }
  ```
- Mapping: Remove `streamPath`, `streamUrl`, `waitForConnection()` (no longer needed); `taskId` initially null, captured lazily from SSE event on first emission method call instead of pre-assigned; factory function signature is synchronous: `(options?: AiAnalysisMockOptions) => AiAnalysisMockSession` (not Promise)
- Evidence: `ai-analysis-mock.ts:74-85` — current session interface; `task-events.spec.ts:278-283` — pattern for capturing `taskId` from `task_subscription` event

**AI Cleanup Mock Session (New)**

- Entity: `AiCleanupMockSession`
- Shape: Mirrors `AiAnalysisMockSession` with cleanup-specific payload
  ```typescript
  {
    taskId: string | null;         // Initially null; captured lazily
    cleanupTemplate: AiCleanupResult;
    waitForTaskId(): Promise<string>;
    emitStarted(): Promise<void>;
    emitProgress(text: string, value: number): Promise<void>;
    emitCompleted(overrides?: AiCleanupCompletionOverrides): Promise<void>;
    emitFailure(message: string): Promise<void>;
    dispose(): Promise<void>;
  }
  ```
- Mapping: Same changes as analysis session; factory is synchronous
- Evidence: `ai-cleanup-mock.ts:52-63` — current session interface

**Task Subscription Event**

- Entity: SSE test event payload for task subscription
- Shape:
  ```typescript
  {
    kind: 'sse',
    streamId: 'tasks',
    phase: 'open',
    event: 'task_subscription',
    data: {
      taskId: string;
    }
  }
  ```
- Mapping: Frontend emits this when `useSSETask` subscribes to a task ID
- Evidence: `task-events.spec.ts:271-283` — waits for `task_subscription` event and extracts `taskId` from data

**Task Event Testing Payload**

- Entity: POST body for `/api/testing/sse/task-event`
- Shape:
  ```json
  {
    "request_id": "string (from deploymentSse.getRequestId())",
    "task_id": "string (from task_subscription event)",
    "event_type": "progress_update | task_started | task_completed",
    "data": {
      // Event-specific payload
    }
  }
  ```
- Mapping: Backend uses `request_id` to route event to correct SSE connection; `task_id` for task correlation
- Evidence: `task-events.spec.ts:286-296` — POST request structure for sending progress event

## 4) API / Integration Surface

**Backend Testing Endpoint**

- Surface: `POST /api/testing/sse/task-event`
- Inputs: `{ request_id: string, task_id: string, event_type: string, data: object }`
- Outputs: Event delivered to SSE connection matching `request_id`; no response data needed beyond 2xx status
- Errors: 400 if no active connection found for `request_id`
- Evidence: `task-events.spec.ts:286-296` — usage pattern; backend docs confirm endpoint contract

**AI Analysis Endpoint (Real, Testing Mode)**

- Surface: `POST /api/ai-parts/analyze`
- Inputs: Any payload (validation skipped in testing mode)
- Outputs: `{ task_id: string, status: string }` (201 response); `stream_url` deprecated
- Errors: None in testing mode (always returns 201)
- Evidence: Backend frontend instructions lines 20-28; `ai-analysis-mock.ts:164-168` — current mock response shape

**AI Cleanup Endpoint (Real, Testing Mode)**

- Surface: `POST /api/ai-parts/cleanup`
- Inputs: Any payload (validation skipped in testing mode)
- Outputs: `{ task_id: string, status: string }` (201 response); `stream_url` deprecated
- Errors: None in testing mode
- Evidence: Backend supports same pattern as analyze endpoint

**SSE Connection via deploymentSse Helper**

- Surface: `deploymentSse.ensureConnected()`, `deploymentSse.getRequestId()`
- Inputs: Optional timeout
- Outputs: `{ isConnected: boolean, requestId: string | null }`
- Errors: Timeout if SSE connection fails to open
- Evidence: `deployment-sse.ts:66-79` — `ensureConnected` implementation; `deployment-sse.ts:81-90` — `getRequestId` implementation

**Task Subscription SSE Event**

- Surface: Frontend emits test event when `useSSETask` subscribes
- Inputs: Task subscription triggered by UI calling AI endpoint
- Outputs: `{ kind: 'sse', streamId: 'tasks', event: 'task_subscription', data: { taskId } }`
- Errors: None (event emission is fire-and-forget)
- Evidence: `task-events.spec.ts:271-283` — wait for subscription event pattern

## 5) Algorithms & UI Flows

**New AI Analysis Mock Flow**

- Flow: AI analysis test setup and event emission
- Steps:
  1. Test calls `aiAnalysisMock({ analysisOverrides })` (synchronous, no await) before UI interaction
  2. Helper returns session object immediately with `taskId: null` (does NOT set up route interception or pre-wait for subscription)
  3. Test establishes SSE connection: `await deploymentSse.ensureConnected()`
  4. Test captures `requestId` from connection status
  5. Test triggers UI action (e.g., submit AI prompt)
  6. UI calls real `POST /api/ai-parts/analyze`, receives `task_id` from backend
  7. UI subscribes to task via SSE, frontend emits `task_subscription` test event
  8. Test calls first emission method (e.g., `await session.emitStarted()`)
  9. Emission method's internal logic: if `taskIdPromise` is null, create it by calling `waitForSseEvent({ streamId: 'tasks', event: 'task_subscription' })` and extract `taskId` from event data; if `taskIdPromise` already exists, reuse it (ensures only one subscription wait per session even if multiple methods called concurrently)
  10. Emission method awaits `taskIdPromise`, then uses `page.request.post('/api/testing/sse/task-event')` with `request_id` and captured `task_id`
  11. Test observes UI updates via selectors
  12. Cleanup: helper's `dispose()` is no-op (no routes to unregister, no streams to close)
- States / transitions: Session moves from "taskIdPromise: null" (initial) → "taskIdPromise: Promise<string>" (first emission method called, waiting for subscription) → "taskIdPromise: resolved Promise" (taskId captured, methods can emit) → "disposed" (methods throw if called)
- State coordination: `taskIdPromise` is shared across all emission method calls; lazy initialization on first call prevents multiple subscription waits; subsequent concurrent calls await same promise
- Hotspots: Timing between UI action and `task_subscription` event emission (mitigated by test event buffer that captures events from page load); concurrent emission method calls must coordinate via shared promise
- Evidence: `task-events.spec.ts:222-334` — complete real backend pattern

**New AI Cleanup Mock Flow**

- Flow: Mirrors analysis flow with cleanup-specific endpoint and payload
- Steps: Same 12 steps as analysis, substituting `/api/ai-parts/cleanup` for analyze endpoint
- States / transitions: Identical to analysis session
- Hotspots: Same timing concerns
- Evidence: Cleanup tests mirror analysis test structure

**Helper Factory Pattern (Fixtures)**

- Flow: Fixture provides factory function that creates mock sessions on demand
- Steps:
  1. Fixture creates factory function: `(options) => createAiAnalysisMock(page, backendUrl, deploymentSse, options)`
  2. Factory tracks created sessions in array
  3. On fixture teardown, iterate sessions and call `dispose()` on each
  4. New helper no longer needs `sseMocker` parameter
- States / transitions: Factory accumulates sessions during test execution; teardown disposes all
- Hotspots: Ensure dispose is idempotent and safe to call multiple times
- Evidence: `fixtures.ts:345-359` — current `aiAnalysisMock` fixture pattern with session tracking

## 6) Derived State & Invariants

**Captured Task ID**

- Derived value: `taskId` extracted from `task_subscription` SSE event
- Source: Lazy initialization — first emission method call creates `taskIdPromise` by calling `waitForSseEvent({ streamId: 'tasks', event: 'task_subscription', timeoutMs: 10000 })`, then extracting `event.data.taskId`; subsequent emission method calls await same promise (coordination via shared Promise instance stored in session closure)
- Writes / cleanup: Helper stores `taskIdPromise` in session-local variable; resolved value used to construct all event emission payloads (`POST /api/testing/sse/task-event` with `task_id` field); no cleanup needed (value persists until session disposed)
- Guards: Wait with timeout (10s) for subscription event; throw if timeout expires; validate `taskId` is non-empty string; lazy initialization ensures only one `waitForSseEvent` call per session even if multiple emission methods called concurrently before taskId captured
- Invariant: Once `taskIdPromise` created, it must not be replaced; all event emissions must await same promise and use identical resolved `taskId` value; concurrent emission method calls coordinate via shared promise
- Evidence: `task-events.spec.ts:271-283` — subscription event wait pattern with timeout; `ai-analysis-mock.ts:160` — current helper uses pre-assigned `taskId`

**SSE Request ID**

- Derived value: `requestId` from `deploymentSse.getRequestId()` or `ensureConnected()` response
- Source: Global SSE connection managed by `deploymentSse` helper; request ID correlates client to backend connection
- Writes / cleanup: Helper captures at session creation time; no writes; connection persists across multiple sessions
- Guards: Ensure SSE connection established before creating mock session; validate `requestId` is non-null
- Invariant: Request ID must remain stable for duration of test; if connection drops and reconnects, new `requestId` invalidates existing sessions
- Evidence: `deployment-sse.ts:33-42` — `getStatus()` returns `{ isConnected, requestId }`; `task-events.spec.ts:244-248` — captures and validates `requestId`

**Analysis Template**

- Derived value: Merged default analysis result + user-provided overrides
- Source: Helper merges `defaultAnalysis` object with `options.analysisOverrides`
- Writes / cleanup: Immutable after session creation; passed to `emitCompleted()` where further merged with completion overrides
- Guards: Ensure template contains required fields (description, type, etc.); allow null/undefined for optional fields
- Invariant: Template shape must match backend `AIPartAnalysisTaskResultSchema` structure
- Evidence: `ai-analysis-mock.ts:140-152` — `mergeAnalysis` function; `ai-analysis-mock.ts:87-122` — default analysis template

**Cleanup Template**

- Derived value: Merged default cleanup result + user-provided overrides
- Source: Helper merges `defaultCleanup` with `options.cleanupOverrides`
- Writes / cleanup: Same as analysis template
- Guards: Same validation as analysis template
- Invariant: Shape must match backend cleanup result schema
- Evidence: `ai-cleanup-mock.ts:106-118` — `mergeCleanup` function; `ai-cleanup-mock.ts:65-88` — default cleanup template

## 7) State Consistency & Async Coordination

**SSE Connection Lifecycle**

- Source of truth: `deploymentSse` helper manages global SSE connection; `requestId` identifies active connection
- Coordination: Mock session captures `requestId` at creation; all event emissions use this `requestId` to route to correct backend connection
- Async safeguards: `ensureConnected()` waits for SSE open event before returning; helper validates connection status before creating session
- Instrumentation: Frontend emits `sse` test events for connection lifecycle (`phase: 'open'`, `event: 'connected'`)
- Evidence: `deployment-sse.ts:66-79` — `ensureConnected` waits for connection; `task-events.spec.ts:237-242` — waits for SSE connected event

**Task Subscription Coordination**

- Source of truth: Frontend `useSSETask` hook emits `task_subscription` test event when subscribing to task ID
- Coordination: Helper waits for this event to capture `taskId` before allowing event emissions
- Async safeguards: Wait with timeout (10s default); throw error if subscription event not received; validate `taskId` in event data
- Instrumentation: `task_subscription` event includes `streamId: 'tasks'`, `phase: 'open'`, `data: { taskId }`
- Evidence: `task-events.spec.ts:271-283` — subscription event wait pattern; `test-events.ts:403-437` — `waitForSseEvent` helper

**Session Disposal**

- Source of truth: Session tracks disposal state in boolean flag
- Coordination: `dispose()` sets flag and becomes no-op on subsequent calls; event emission methods check flag and throw if disposed
- Async safeguards: Disposal is synchronous (no routes/streams to clean up); idempotent
- Instrumentation: No events emitted on disposal
- Evidence: `ai-analysis-mock.ts:260-273` — current disposal pattern (will simplify without route unregistering)

**Event Emission Order**

- Source of truth: Test controls emission order via explicit `await` calls to `emitStarted()`, `emitProgress()`, `emitCompleted()`
- Coordination: Each emission awaits HTTP POST to `/api/testing/sse/task-event`; backend delivers events to frontend in order received
- Async safeguards: Each emission is async; test must await to ensure ordering; backend guarantees SSE event delivery order
- Instrumentation: No additional events beyond the task events themselves
- Evidence: `task-events.spec.ts:286-334` — sequential event emissions with await

## 8) Errors & Edge Cases

**SSE Connection Not Established**

- Failure: Test attempts to create mock session before SSE connection established
- Surface: Helper validates connection status at session creation
- Handling: Throw error with message "SSE connection must be established before creating AI mock session. Call deploymentSse.ensureConnected() first."
- Guardrails: Documentation and examples show correct ordering; helper validates `requestId` is non-null
- Evidence: `deployment-sse.ts:33-42` — `getStatus()` returns connection state

**Task Subscription Timeout**

- Failure: Frontend does not emit `task_subscription` event within timeout (network issue, API error, etc.)
- Surface: Helper waits for subscription event with 10s timeout
- Handling: Throw error with message "Timed out waiting for task subscription event. Ensure UI successfully called AI endpoint and subscribed to task."
- Guardrails: Default 10s timeout; test can override via options; timeout propagates as test failure
- Evidence: `test-events.ts:408-434` — `waitForSseEvent` timeout parameter

**Backend Event Delivery Failure**

- Failure: POST to `/api/testing/sse/task-event` returns 400 (no active connection) or 500
- Surface: Helper's `emitStarted()`, `emitProgress()`, `emitCompleted()` methods
- Handling: Emission methods wrap `page.request.post()` with status check: if `response.status() >= 400`, throw new Error with formatted message including `request_id`, `task_id`, event type, and status code for debugging; no retry logic (tests should fail fast)
- Guardrails: Explicit status validation provides actionable error messages instead of opaque Playwright HTTP errors; backend logs connection state for debugging
- Evidence: Backend testing endpoint returns 400 if no connection found for `request_id`

**Disposed Session Usage**

- Failure: Test calls `emitProgress()` or other method after `dispose()`
- Surface: Session methods check `disposed` flag
- Handling: Throw error "AI mock session has been disposed"
- Guardrails: Fixture teardown calls `dispose()` on all sessions; test should not hold session references after completion
- Evidence: `ai-analysis-mock.ts:188-191` — current disposal check pattern

**Invalid Task ID in Subscription Event**

- Failure: `task_subscription` event has missing or empty `taskId` field
- Surface: Helper validates extracted `taskId` after capturing event
- Handling: Throw error "Invalid task subscription event: taskId is missing or empty"
- Guardrails: Validate `taskId` is truthy string; log event data for debugging
- Evidence: `task-events.spec.ts:278-283` — validates `taskId` is truthy

**Multiple Sessions in Single Test**

- Failure: Test creates multiple AI mock sessions in sequence (e.g., duplicate detection test with multiple analyses)
- Surface: Each session captures its own `taskId` from subscription events
- Handling: Sessions must be used sequentially to avoid correlation issues: create session, trigger UI action, emit events (which triggers subscription wait), complete events, then create next session; sessions do NOT pre-wait for subscription events — waiting only starts on first emission method call AFTER UI action occurs
- Guardrails: Document sequential usage requirement: "Create session → trigger UI → emit events → dispose/complete → create next session"; lazy subscription wait (triggered by first emission call) ensures each session captures the taskId from the subscription event that occurs AFTER its associated UI action; test event buffer allows helpers to wait for events that occurred before the wait started
- Evidence: Sequential pattern prevents sessions from capturing each other's subscription events; lazy wait coordination ensures proper correlation

## 9) Observability / Instrumentation

**SSE Connection Events**

- Signal: `sse` test events with `streamId: 'deployment'`, `phase: 'open'`, `event: 'connected'`
- Type: Instrumentation event
- Trigger: When `deploymentSse.ensureConnected()` establishes SSE connection
- Labels / fields: `streamId`, `phase`, `event`, `data` (contains connection metadata)
- Consumer: Tests wait for connected event to confirm SSE ready; `waitForSseEvent` helper
- Evidence: `task-events.spec.ts:237-242` — waits for connected event; `test-events.ts:403-437` — SSE event wait helper

**Task Subscription Events**

- Signal: `sse` test events with `streamId: 'tasks'`, `event: 'task_subscription'`, `data: { taskId }`
- Type: Instrumentation event
- Trigger: When frontend `useSSETask` hook subscribes to task (after UI calls AI endpoint)
- Labels / fields: `taskId` in event data
- Consumer: Mock helper waits for this event to capture `taskId`; tests can assert subscription occurred
- Evidence: `task-events.spec.ts:271-283` — subscription event pattern

**Backend Event Delivery**

- Signal: Backend logs event delivery via `/api/testing/sse/task-event` endpoint
- Type: Backend log (not frontend instrumentation)
- Trigger: When helper POSTs to testing endpoint
- Labels / fields: `request_id`, `task_id`, `event_type`
- Consumer: Backend log collector; test attachments include backend logs for debugging
- Evidence: Backend testing endpoint logs delivery success/failure

**Mock Session Lifecycle**

- Signal: No explicit test events (session is test infrastructure)
- Type: Test helper state
- Trigger: Session creation, `taskId` capture, disposal
- Labels / fields: N/A (internal helper state)
- Consumer: Test assertions can check `session.taskId` after capture
- Evidence: Helper exposes `taskId` as public property for test assertions

## 10) Lifecycle & Background Work

**SSE Connection Management**

- Hook / effect: `deploymentSse` fixture establishes connection per test and disconnects on teardown
- Trigger cadence: Once per test (connection persists across multiple AI mock sessions)
- Responsibilities: Open SSE stream, capture `requestId`, wait for connected event, disconnect on cleanup
- Cleanup: `deploymentSse` fixture calls `disconnect()` in finally block (lines 382-393 in fixtures.ts)
- Evidence: `fixtures.ts:382-393` — deployment SSE fixture lifecycle; `deployment-sse.ts:55-64` — disconnect implementation

**Mock Session Factory**

- Hook / effect: `aiAnalysisMock` and `aiCleanupMock` fixtures provide factory functions
- Trigger cadence: On-demand (test calls factory when needed)
- Responsibilities: Create session, track in array, return to test
- Cleanup: Fixture teardown iterates sessions array and calls `dispose()` on each
- Evidence: `fixtures.ts:345-359` — analysis mock fixture with session tracking

**Task Subscription Waiting**

- Hook / effect: Helper internal state machine waits for subscription event
- Trigger cadence: Once per session, after UI triggers AI endpoint call
- Responsibilities: Wait for `task_subscription` event, extract `taskId`, store in session state, unblock event emission methods
- Cleanup: No cleanup needed (wait completes when event received or timeout expires)
- Evidence: Helper will implement this as internal async method called before first event emission

**HTTP Request Lifecycle (Event Emission)**

- Hook / effect: Each `emitStarted()`, `emitProgress()`, `emitCompleted()` call makes HTTP POST to backend
- Trigger cadence: Explicit test control (test awaits each emission)
- Responsibilities: Construct payload with `request_id`, `task_id`, `event_type`, `data`; await HTTP response
- Cleanup: No cleanup (requests are fire-and-forget after awaiting response)
- Evidence: `task-events.spec.ts:286-296` — POST request pattern

## 11) Security & Permissions

**Testing Endpoint Availability**

- Concern: `/api/testing/sse/task-event` must only be available in testing mode
- Touchpoints: Backend validates `FLASK_ENV=testing` before serving testing endpoints
- Mitigation: Backend returns 404 for testing endpoints in production/development; Playwright runs against managed backend with `FLASK_ENV=testing`
- Residual risk: None (backend enforces environment check; frontend has no production code using testing endpoints)
- Evidence: Backend frontend instructions lines 191-193; managed services fixture sets `FLASK_ENV=testing` for worker backends

**AI Endpoint Validation Bypass**

- Concern: AI endpoints skip validation in testing mode (potential for unexpected behavior)
- Touchpoints: Tests send arbitrary payloads to `/api/ai-parts/analyze`, `/api/ai-parts/cleanup`
- Mitigation: Backend only bypasses validation when `FLASK_ENV=testing`; production mode enforces full validation
- Residual risk: None (testing mode isolation is backend responsibility; tests confirm bypass works as expected)
- Evidence: Backend frontend instructions lines 9-16

## 12) UX / UI Impact

No UX or UI changes. This is a testing infrastructure migration; frontend application code remains unchanged.

## 13) Deterministic Test Plan

**AI Analysis Flow with Real Backend**

- Surface: `tests/e2e/parts/part-ai-creation.spec.ts`
- Scenarios:
  - Given SSE connection established and AI mock session created, When user submits AI prompt, Then test calls `session.emitStarted()` (which triggers lazy taskId capture from subscription event), emits progress event, and completion event, and verifies UI displays analysis results
  - Given analysis result includes documents, When completion event sent, Then review step shows document previews with correct URLs
  - Given analysis result includes existing type, When completion event sent, Then type dropdown shows pre-selected type
  - Given analysis completes, When test inspects session object, Then session has no `streamPath` or `streamUrl` properties (validates deprecated fields fully removed)
- Instrumentation / hooks: `task_subscription` SSE event for `taskId` capture (lazy, triggered by first emission method call); `deploymentSse.getRequestId()` for `request_id`; `page.request.post('/api/testing/sse/task-event')` for event delivery; explicit status check on POST response for actionable error messages
- Gaps: None (existing test coverage migrates directly to real backend)
- Evidence: `part-ai-creation.spec.ts:1-100` — existing test structure

**AI Cleanup Flow with Real Backend**

- Surface: `tests/e2e/parts/ai-part-cleanup.spec.ts`
- Scenarios:
  - Given part exists and cleanup mock session created, When user triggers cleanup action, Then test waits for task subscription, emits cleanup events, and verifies merge table displays proposed changes
  - Given cleanup completes successfully, When user accepts changes, Then part data updates and detail page refreshes
- Instrumentation / hooks: Same as analysis flow
- Gaps: None
- Evidence: `ai-part-cleanup.spec.ts:1-100` — existing test structure

**AI Duplicate Detection with Real Backend**

- Surface: `tests/e2e/parts/ai-parts-duplicates.spec.ts`
- Scenarios:
  - Given analysis result includes duplicate_parts array, When completion event sent, Then UI displays duplicate warnings with confidence levels
- Instrumentation / hooks: Same as analysis flow; completion event payload includes `duplicate_parts` field
- Gaps: None (requires reading full spec to confirm coverage)
- Evidence: `ai-parts-duplicates.spec.ts` — file exists, likely mirrors analysis test pattern

**Error Handling in AI Flow**

- Surface: All AI test specs
- Scenarios:
  - Given AI endpoint call fails, When task subscription timeout expires, Then test fails with clear error message
  - Given backend returns error event, When helper calls `emitFailure()`, Then UI displays error message
- Instrumentation / hooks: Timeout handling in `waitForSseEvent`; `emitFailure()` sends `event_type: 'task_completed', data: { success: false, error_message }`
- Gaps: May need to add explicit error case tests (currently only happy path coverage)
- Evidence: `ai-analysis-mock.ts:252-258` — `emitFailure` implementation

**SSE Connection Management**

- Surface: All AI tests
- Scenarios:
  - Given test starts, When `deploymentSse.ensureConnected()` called, Then SSE connection establishes and `requestId` captured
  - Given test completes, When fixture teardown runs, Then SSE connection disconnects cleanly
- Instrumentation / hooks: `deploymentSse.ensureConnected()`, `deploymentSse.getRequestId()`, `waitForSseEvent` for connected event
- Gaps: None (existing deployment SSE tests validate connection lifecycle)
- Evidence: `task-events.spec.ts:237-248` — SSE connection pattern

## 14) Implementation Slices

**Slice 1: Delete SSE Mocking Infrastructure**

- Goal: Remove unused mocking code and fixture
- Touches:
  - Delete `tests/support/helpers/sse-mock.ts`
  - Remove `sseMocker` fixture from `tests/support/fixtures.ts` (lines 88-89, 338-343)
  - Remove `SSEMocker` import from `fixtures.ts` (line 28)
- Dependencies: Must complete before rewriting helpers (helpers currently import SSEMocker)

**Slice 2: Rewrite AI Analysis Mock Helper**

- Goal: Replace route interception with real backend flow
- Touches:
  - `tests/support/helpers/ai-analysis-mock.ts` — rewrite `createAiAnalysisMock` function
  - Remove imports: `Route` from Playwright, `SSEMocker` from sse-mock
  - Add imports: `Page.request` usage, `waitForSseEvent` and `extractSseData` from test-events
  - Update interfaces: Remove `streamPath`, `streamPattern`, `taskId` from options; remove `streamPath`, `waitForConnection()` from session; add `taskId: string | null` and `waitForTaskId(): Promise<string>` to session; factory signature is synchronous (not Promise)
  - Implement lazy taskId capture: session closure maintains `taskIdPromise: Promise<string> | null` initialized to null; first call to any emission method checks if null and creates promise via `waitForSseEvent({ streamId: 'tasks', event: 'task_subscription', timeoutMs: 10000 })`, then extracts `taskId` from event data; subsequent calls reuse same promise
  - Rewrite `emitStarted()`, `emitProgress()`, `emitCompleted()` to: await `taskIdPromise`, POST to `/api/testing/sse/task-event` with `request_id`, `task_id`, event payload, then check response.status() and throw formatted error if >= 400
  - Add `waitForTaskId()` method: creates `taskIdPromise` if null (same lazy init logic), returns awaited promise for tests that need explicit taskId
  - Simplify `dispose()` (no-op, just sets disposed flag)
- Dependencies: Requires Slice 1 complete; helper must compile without SSEMocker

**Slice 3: Rewrite AI Cleanup Mock Helper**

- Goal: Apply same changes as analysis helper to cleanup helper
- Touches:
  - `tests/support/helpers/ai-cleanup-mock.ts` — mirror all changes from Slice 2
- Dependencies: Can run parallel with Slice 2 (independent helpers)

**Slice 4: Update Mock Fixtures**

- Goal: Remove sseMocker dependency and pass new parameters to helpers
- Touches:
  - `tests/support/fixtures.ts` — update `aiAnalysisMock` fixture (lines 345-359)
  - `tests/support/fixtures.ts` — update `aiCleanupMock` fixture (lines 361-375)
  - Add `backendUrl` and `deploymentSse` to factory closure
  - Update `createAiAnalysisMock` call signature
  - Update `createAiCleanupMock` call signature
- Dependencies: Requires Slices 2 and 3 complete (helpers must export new signatures)

**Slice 5: Update AI Test Specs**

- Goal: Adjust test flow to work with new synchronous session creation and lazy taskId capture
- Touches:
  - `tests/e2e/parts/part-ai-creation.spec.ts` — remove explicit `taskId` and `streamPath` options from `aiAnalysisMock()` call; remove `await` from session creation (synchronous); remove `await aiSession.waitForConnection()` call (no longer exists); session methods already async, no test code change needed for emission calls; ensure `deploymentSse.ensureConnected()` called before creating mock session
  - `tests/e2e/parts/ai-part-cleanup.spec.ts` — same adjustments
  - `tests/e2e/parts/ai-parts-duplicates.spec.ts` — same adjustments; if test creates multiple sessions, ensure sequential usage (complete first session's events before creating second)
  - Migration pattern: BEFORE: `const aiSession = await aiAnalysisMock({ taskId: 'task-123', streamPath, ... }); await aiSession.waitForConnection();` AFTER: `const aiSession = aiAnalysisMock({ analysisOverrides: { ... } });` (no await, no taskId/streamPath options, no waitForConnection)
- Dependencies: Requires Slice 4 complete (fixtures must provide new helper API)

**Slice 6: Verify and Fix Tests**

- Goal: Run all AI tests and fix any failures
- Touches:
  - Run `pnpm playwright test tests/e2e/parts/part-ai-creation.spec.ts`
  - Run `pnpm playwright test tests/e2e/parts/ai-part-cleanup.spec.ts`
  - Run `pnpm playwright test tests/e2e/parts/ai-parts-duplicates.spec.ts`
  - Address any timing issues, assertion failures, or missing events
  - Verify backend logs show event delivery
- Dependencies: Requires Slice 5 complete (all code changes done)

## 15) Risks & Open Questions

**Risks**

- Risk: Task subscription event timing—frontend may emit subscription before test starts waiting
- Impact: Helper waits indefinitely or times out; test fails intermittently
- Mitigation: Use test event buffer (events captured from page load); wait for subscription event with 10s timeout; document that UI must emit event reliably

- Risk: SSE connection drops mid-test after `requestId` captured
- Impact: Event delivery fails; backend returns 400 for testing endpoint
- Mitigation: SSE connection is stable in managed services; if connection drops, test fails fast with clear error; acceptable tradeoff vs. complexity of reconnection handling

- Risk: Tests create multiple AI sessions in parallel (race conditions on subscription events)
- Impact: Helper captures wrong `taskId` from interleaved subscription events
- Mitigation: Document that sessions should be created sequentially; tests must sequence UI actions; helper waits for first subscription event after creation (no filtering by correlation ID)

- Risk: Backend testing endpoint behavior differs from documented contract
- Impact: Event delivery fails; tests fail with unclear errors
- Mitigation: Backend team owns testing mode implementation; frontend tests validate contract; backend logs show delivery attempts

- Risk: Migration introduces test failures due to timing sensitivity
- Impact: Slows down migration; requires debugging real backend interactions
- Mitigation: Slice implementation incrementally; run tests after each slice; compare timing with existing mocked flow; adjust timeouts if needed

**Open Questions**

- Question: Should helper expose `waitForTaskId()` method for tests to explicitly await capture, or handle it implicitly before first event emission?
- Why it matters: Explicit wait gives tests control over timing; implicit wait is simpler but hides state transition
- Owner / follow-up: RESOLVED — Helper exposes optional `waitForTaskId()` method for tests that need explicit taskId (e.g., assertions); emission methods handle implicit lazy wait (simpler default); both approaches share same `taskIdPromise` for coordination

- Question: How should helper handle multiple AI sessions in single test (e.g., retry flows, multiple parts)?
- Why it matters: Subscription events lack correlation to specific session; first session may capture second session's taskId
- Owner / follow-up: RESOLVED — Require sequential usage pattern: create session, trigger UI action, emit events (lazy wait captures correct taskId), complete, then create next session; lazy subscription wait (only starts on first emission call AFTER UI action) ensures proper correlation; document this requirement in helper comments and error handling section

- Question: Should obsolete `stream_url` field be removed from backend response or left for backward compatibility?
- Why it matters: Frontend ignores field; removing it is cleaner but requires backend change
- Owner / follow-up: Backend team decision; frontend tolerates field presence (no breaking change)

- Question: Should helper validate event payloads match expected schema before POSTing to testing endpoint?
- Why it matters: Validation catches test bugs earlier; adds complexity to helper
- Owner / follow-up: Prefer no validation (keep helper simple); backend will reject malformed payloads; test failures reveal schema mismatches

## 16) Confidence

Confidence: High — The real backend SSE pattern is proven in `task-events.spec.ts`, the helpers are isolated modules with clear interfaces, and the test suite provides fast feedback on regressions. The main risk is task subscription event timing, which can be mitigated with reliable instrumentation and adequate timeouts.
