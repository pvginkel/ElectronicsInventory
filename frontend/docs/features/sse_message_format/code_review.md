# Code Review -- SSE Message Format Simplification

## 1) Summary & Decision

**Readiness**

The change cleanly implements the plan: the SSE Gateway now wraps named events in an unnamed `{type, payload}` envelope, the SharedWorker and direct-EventSource paths both consume the envelope via a single `onmessage` handler, and subscription tracking is removed entirely. All consumer hooks (`useVersionSSE`, `useSSETask`) are unaffected because the `addEventListener`/`dispatchEvent` interface they rely on is unchanged. The Playwright tests have been updated to match the new envelope semantics, existing bug fixes around `correlation_id` matching and stream ID constants are reasonable, and two new SharedWorker-specific specs have been added. The code is well-commented, the duplication between worker and provider is minimal and justified, and the SSE Gateway unit tests have been rewritten to cover the new envelope behavior including edge cases like JSON-escaping event names.

**Decision**

`GO-WITH-CONDITIONS` -- One minor issue around stale version caching in the SharedWorker needs attention before shipping, and the `ssegateway` dependency must be restored to a publishable reference before merge.

## 2) Conformance to Plan (with evidence)

**Plan alignment**

- Plan: "SSE Gateway output format" -- switch from `event: name\ndata: ...\n\n` to `data: {"type":"<name>","payload":<data>}\n\n`
  - `/work/SSEGateway/src/sse.ts:45-53` -- `formatSseEvent` wraps named events in envelope JSON; `connection_close` retained as named via `NAMED_EVENT_PASSTHROUGH` set.
- Plan: "connection_close stays as a named event"
  - `/work/SSEGateway/src/sse.ts:14` -- `const NAMED_EVENT_PASSTHROUGH = new Set(['connection_close']);`
  - `/work/ElectronicsInventory/frontend/src/workers/sse-worker.ts:211` -- `eventSource.addEventListener('connection_close', ...)`
  - `/work/ElectronicsInventory/frontend/src/contexts/sse-context-provider.tsx:249` -- same listener retained in direct mode.
- Plan: "SharedWorker -- Remove subscribedEvents set and subscription tracking"
  - `/work/ElectronicsInventory/frontend/src/workers/sse-worker.ts` -- `subscribedEvents`, `subscribeToEvent()`, `handleSubscribe()`, and `subscribe` TabCommand all removed. `onmessage` handler at line 175.
- Plan: "SharedWorker -- Cache the last version event payload"
  - `/work/ElectronicsInventory/frontend/src/workers/sse-worker.ts:52` -- `let lastVersionPayload: unknown = null;` with caching at line 193 and replay at lines 273-285.
- Plan: "Provider -- Remove ensureWorkerSubscription, workerSubscribedEventsRef, ensureDirectEventSourceListener, attachedEventsRef"
  - `/work/ElectronicsInventory/frontend/src/contexts/sse-context-provider.tsx` -- all four removed. `addEventListener` at line 102 is now purely local (empty dependency array at line 120).
- Plan: "Provider -- createDirectConnection uses eventSource.onmessage to unwrap {type, payload}"
  - `/work/ElectronicsInventory/frontend/src/contexts/sse-context-provider.tsx:219-246` -- `onmessage` handler parses envelope, dispatches via `dispatchEvent`.
- Plan: "Tab-facing message format unchanged"
  - `WorkerMessage` type retains `{ type: 'event'; event: string; data: unknown; }` -- confirmed at `/work/ElectronicsInventory/frontend/src/workers/sse-worker.ts:24`.

**Gaps / deviations**

- Plan: "ssegateway dependency" -- The plan describes this as a template-level change; the `package.json` change at line 63 switches to `file:/work/SSEGateway` which is a local development dependency. This must be reverted to a publishable reference (git URL or npm registry) before merge. This is acknowledged as a development-only change but should be tracked.
- Plan: "sse_utils.py format_sse_event() may need updating" -- No Python backend changes are included in this diff. This is expected if the gateway handles all formatting, but the plan flagged it as a possible change. No evidence of impact on the running system since all tests pass.

## 3) Correctness -- Findings (ranked)

- Title: **Minor -- `lastVersionPayload` is not cleared when the SSE connection is closed**
  - Evidence: `/work/ElectronicsInventory/frontend/src/workers/sse-worker.ts:96-107` -- `closeConnection()` resets `currentRequestId` and `retryCount` but does not set `lastVersionPayload = null`.
  - Impact: After the SSE connection drops and the last tab disconnects, the SharedWorker retains a stale version payload. If a new tab connects before the worker context is garbage-collected, it will receive the stale version from the previous session as a cached event. In the deployment context this could cause the `DeploymentProvider` to set `currentVersion` to a stale value. This is low-severity because: (a) a fresh version event will arrive shortly after reconnection and overwrite it, and (b) the `DeploymentProvider` only shows the update banner when the version *changes*, not on first reception. However, it is a correctness gap that violates the principle of least surprise.
  - Fix: Add `lastVersionPayload = null;` inside `closeConnection()` at line 106.
  - Confidence: High

- Title: **Minor -- `package.json` ssegateway dependency points to local filesystem path**
  - Evidence: `/work/ElectronicsInventory/frontend/package.json:63` -- `"ssegateway": "file:/work/SSEGateway"`
  - Impact: This will break `pnpm install` in any environment that does not have `/work/SSEGateway` mounted (CI, other developers' machines, production builds). The lockfile also reflects this local path.
  - Fix: Restore the git URL specifier (pointing to the updated SSE Gateway commit) or publish to an npm registry before merging. This is expected to be a conscious pre-merge step, but should be explicitly called out.
  - Confidence: High

- Title: **Minor -- `addEventListener` dependency array is empty, which is safe but triggers React lint warnings in some configurations**
  - Evidence: `/work/ElectronicsInventory/frontend/src/contexts/sse-context-provider.tsx:120` -- `[]`
  - Impact: None functionally -- `addEventListener` only captures `listenersRef` which is stable. The empty array is correct. Noting this solely for future maintainers: the callback is deliberately closure-free.
  - Confidence: High -- no actual issue.

## 4) Over-Engineering & Refactoring Opportunities

- Hotspot: Duplicated envelope-unwrapping logic between SharedWorker and Provider
  - Evidence: `/work/ElectronicsInventory/frontend/src/workers/sse-worker.ts:175-207` and `/work/ElectronicsInventory/frontend/src/contexts/sse-context-provider.tsx:219-246` -- identical JSON.parse/envelope.type guard/dispatch pattern.
  - Suggested refactor: None needed now. The SharedWorker runs in a separate global scope and cannot import from the React module graph, so the duplication is architecturally forced. Both call sites are well-commented to document the symmetry ("mirrors the SharedWorker logic" at provider line 218).
  - Payoff: Acknowledging this is intentional prevents future maintainers from trying to DRY it up inappropriately.

## 5) Style & Consistency

- Pattern: Test event `streamId` naming convention
  - Evidence: In `tests/e2e/sse/task-events.spec.ts:14-15`, `CONNECTION_STREAM_ID = 'connection'` and `TASK_STREAM_ID = 'task_event'`. Meanwhile `useSSETask` emits its own instrumentation events with `streamId: 'task'` (e.g., `/work/ElectronicsInventory/frontend/src/hooks/use-sse-task.ts:128`). The test at line 299 correctly uses `streamId: 'task'` for the subscription event. This dual naming (`task_event` for raw SSE envelope, `task` for hook-level instrumentation) is documented in test comments (lines 295-297) but could be confusing.
  - Impact: Future test authors may confuse `task` (hook-level) vs `task_event` (SSE envelope level).
  - Recommendation: The comments in the test file adequately explain the distinction. No code change needed, but consider adding a brief note in the Playwright developer guide or test instrumentation docs to codify the two-tier stream ID convention.

- Pattern: Consistent use of em-dash vs hyphen in comments
  - Evidence: `/work/ElectronicsInventory/frontend/src/workers/sse-worker.ts:257` uses em-dash; other comments use hyphens.
  - Impact: Cosmetic only. Out of scope per review instructions.

## 6) Tests & Deterministic Coverage (new/changed behavior only)

- Surface: SSE envelope format delivery (direct EventSource path)
  - Scenarios:
    - Given a running SSE gateway, When a version event is sent, Then the frontend receives it through `onmessage` with the envelope unwrapped (`tests/infrastructure/sse/sse-connectivity.spec.ts` -- "delivers version events from the SSE stream")
    - Given a running SSE gateway, When a task_event is sent, Then the browser-side EventSource receives the envelope and extracts the payload (`tests/infrastructure/sse/sse-connectivity.spec.ts` -- "routes task events through the Vite proxy")
    - Given a running SSE gateway, When a task failure event is sent, Then the payload is correctly delivered (`tests/infrastructure/sse/sse-connectivity.spec.ts` -- "routes task failure events through the Vite proxy")
  - Hooks: `waitForSseEvent` with `streamId`, `phase`, `event` parameters; `extractSseData` for payload inspection
  - Gaps: None identified for the direct path.
  - Evidence: `/work/ElectronicsInventory/frontend/tests/infrastructure/sse/sse-connectivity.spec.ts:50-273`

- Surface: SSE envelope format delivery (SharedWorker path)
  - Scenarios:
    - Given `?__sharedWorker` URL parameter, When a version event is sent, Then the SharedWorker unwraps the envelope and delivers it to the tab (`tests/infrastructure/sse/sse-connectivity.spec.ts` -- "delivers version events via SharedWorker")
    - Given `?__sharedWorker` URL parameter, When the SSE connection opens, Then URLs go through the Vite proxy not directly to the gateway (`tests/infrastructure/sse/sse-connectivity.spec.ts` -- "connects and receives events via SharedWorker")
  - Hooks: `deploymentSse.ensureConnected()`, `waitForSseEvent` with `streamId: 'connection'`
  - Gaps: No test for the `lastVersionPayload` cache behavior (late-joining tab receiving cached version). This is a new feature introduced in this change at `/work/ElectronicsInventory/frontend/src/workers/sse-worker.ts:272-285` without dedicated test coverage. However, testing SharedWorker cross-tab caching in Playwright is non-trivial and may not be practical in the current test infrastructure.
  - Evidence: `/work/ElectronicsInventory/frontend/tests/infrastructure/sse/sse-connectivity.spec.ts:275-357`

- Surface: Task event routing through React SSE hooks
  - Scenarios:
    - Given SSE connected, When task events are sent, Then `useSSETask` receives them with correct payload structure (`tests/e2e/sse/task-events.spec.ts` -- all 5 tests updated for envelope format)
  - Hooks: `waitForSseEvent` with `streamId: 'task_event'` for raw events, `streamId: 'task'` for hook-level events; `extractSseData` for payload fields
  - Gaps: None. The tests now correctly discriminate events by matching both `task_id` and `event_type` within the payload matcher.
  - Evidence: `/work/ElectronicsInventory/frontend/tests/e2e/sse/task-events.spec.ts:17-377`

- Surface: Deployment banner version streaming
  - Scenarios:
    - Given SSE connected, When two version events arrive (baseline then update), Then the deployment banner appears (`tests/infrastructure/deployment/deployment-banner.spec.ts`)
  - Hooks: `waitForSseEvent` with `streamId: 'version'`; `extractSseData<{ version?: string }>`
  - Gaps: None. The bug fix removing `correlation_id` matching is correct since the backend does not include it in version event payloads.
  - Evidence: `/work/ElectronicsInventory/frontend/tests/infrastructure/deployment/deployment-banner.spec.ts:48-87`

- Surface: SSE Gateway `formatSseEvent` unit tests
  - Scenarios:
    - Named events are wrapped in envelope JSON (`__tests__/unit/sse.test.ts`)
    - `connection_close` is preserved as a named event
    - Unnamed events use classic format
    - Event name is JSON-escaped in envelope
  - Hooks: Direct unit assertions
  - Gaps: None. Coverage is thorough.
  - Evidence: `/work/SSEGateway/__tests__/unit/sse.test.ts`

## 7) Adversarial Sweep

- Title: **Minor -- Race between onmessage registration and EventSource.onopen**
  - Evidence: `/work/ElectronicsInventory/frontend/src/contexts/sse-context-provider.tsx:219-246` -- `onmessage` is assigned after `onopen` (line 201). `/work/ElectronicsInventory/frontend/src/workers/sse-worker.ts:175` -- `onmessage` is assigned after `onopen` (line 155).
  - Impact: Could an event arrive between `onopen` firing and `onmessage` being assigned? No. The EventSource specification dispatches events asynchronously via the event loop. The `new EventSource(url)` call initiates the connection, but event handlers are called during subsequent microtask/task processing. Since `onopen` and `onmessage` are both set synchronously in the same function call (before yielding to the event loop), they will both be in place before any events are dispatched. This is confirmed by the SSE spec's requirement that events are queued, not delivered inline.
  - Confidence: High -- no issue.

- Title: **Investigated -- Stale closure risk in `addEventListener` callback**
  - Evidence: `/work/ElectronicsInventory/frontend/src/contexts/sse-context-provider.tsx:102-121` -- `addEventListener` is wrapped in `useCallback([], [])`. It captures `listenersRef.current` which is a stable `useRef`.
  - Impact: None. The ref is stable across renders, so the empty dependency array is correct. Handlers registered by consumer hooks (e.g., `useVersionSSE`, `useSSETask`) call `addEventListener` with their own handler functions, which are managed through the ref-based registry. No stale closure risk.
  - Confidence: High

- Title: **Investigated -- Malformed JSON in envelope causing silent event drops**
  - Evidence: `/work/ElectronicsInventory/frontend/src/workers/sse-worker.ts:178-183` and `/work/ElectronicsInventory/frontend/src/contexts/sse-context-provider.tsx:222-226` -- both catch JSON.parse errors and silently return.
  - Impact: If the SSE Gateway sends malformed JSON, the event is silently dropped. This is the correct behavior: the only non-JSON data on the unnamed channel would be heartbeat comments (which the EventSource API strips) or corrupted frames (which should not propagate). The worker additionally logs a debug message. No risk.
  - Confidence: High

- Checks attempted: Race conditions in event handler registration, stale closures in useCallback, malformed input handling, concurrent tab connect/disconnect, EventSource reconnection behavior.
- Evidence: Code paths in `/work/ElectronicsInventory/frontend/src/workers/sse-worker.ts` and `/work/ElectronicsInventory/frontend/src/contexts/sse-context-provider.tsx`.
- Why code held up: The architecture separates concerns cleanly -- the envelope unwrapping is synchronous and deterministic, the listener registry uses refs for stability, and the tab-facing message format is preserved so all downstream hooks are unaffected.

## 8) Invariants Checklist

- Invariant: All named SSE events (except `connection_close`) arrive as unnamed envelope messages with `{type, payload}` structure.
  - Where enforced: `/work/SSEGateway/src/sse.ts:49-53` -- `formatSseEvent` wraps non-passthrough named events. Unit tests at `/work/SSEGateway/__tests__/unit/sse.test.ts`.
  - Failure mode: A new event type added to the backend that bypasses `formatSseEvent` would not be wrapped, causing `onmessage` to receive raw data without a `type` field. The guard at worker line 185 (`if (!envelope.type) return`) would silently drop it.
  - Protection: All backend events are sent through `/internal/send` which calls `formatSseEvent`. The passthrough set is explicit and small.

- Invariant: The tab-facing `WorkerMessage` format (`{ type: 'event', event: string, data: unknown }`) is unchanged.
  - Where enforced: `/work/ElectronicsInventory/frontend/src/workers/sse-worker.ts:22-26` -- `WorkerMessage` type definition. Consumer hooks at `src/hooks/use-version-sse.ts:31` and `src/hooks/use-sse-task.ts:253` subscribe by event name.
  - Failure mode: Changing the `event` field in `WorkerMessage` would break all consumer hooks.
  - Protection: TypeScript strict mode enforces the interface. The `handleWorkerMessage` function in the provider at line 126 switches on `message.type` and dispatches `message.event` + `message.data`.

- Invariant: `connection_close` remains a named event, not wrapped in the envelope.
  - Where enforced: `/work/SSEGateway/src/sse.ts:14` -- `NAMED_EVENT_PASSTHROUGH`. Both worker (line 211) and provider (line 249) use `addEventListener('connection_close', ...)`.
  - Failure mode: If `connection_close` were accidentally removed from the passthrough set, the worker and provider would never receive it because they listen for it as a named event, but it would arrive via `onmessage`. The connection close signal would be lost.
  - Protection: Explicit constant + unit test (`__tests__/unit/sse.test.ts` -- "should keep connection_close as a named event").

## 9) Questions / Needs-Info

- Question: Is the `ssegateway` dependency expected to be restored to a git URL or registry reference before merge?
  - Why it matters: The `file:/work/SSEGateway` path in `package.json` will fail in any environment without the local mount.
  - Desired answer: Confirmation that the gateway changes will be published (or the git ref updated) and `package.json` restored before the PR is merged.

## 10) Risks & Mitigations (top 3)

- Risk: The `lastVersionPayload` cache in the SharedWorker persists across connection drops, potentially delivering a stale version to late-joining tabs.
  - Mitigation: Add `lastVersionPayload = null` to `closeConnection()`. The impact is low even without the fix, since the `DeploymentProvider` only triggers the banner on version *changes*, and a fresh version event will arrive on reconnection.
  - Evidence: `/work/ElectronicsInventory/frontend/src/workers/sse-worker.ts:96-107`

- Risk: The local `file:` dependency for `ssegateway` will break CI and non-sandbox builds.
  - Mitigation: Restore the publishable reference before merge. This is a known development-only state.
  - Evidence: `/work/ElectronicsInventory/frontend/package.json:63`

- Risk: Future event types added to the passthrough set or sent outside `formatSseEvent` would silently fail to deliver.
  - Mitigation: The architecture funnels all events through `/internal/send` -> `formatSseEvent`. The passthrough set is a single-item constant with unit test coverage. Adding a "must use envelope" integration test for new event types would be a reasonable CI enhancement.
  - Evidence: `/work/SSEGateway/src/sse.ts:14`, `/work/SSEGateway/src/routes/internal.ts:70`

## 11) Confidence

Confidence: High -- The implementation faithfully follows the plan, eliminates the subscription race condition that motivated the change, preserves the consumer-facing API, and is backed by comprehensive Playwright and unit test coverage. The two conditions (stale version cache, local dependency path) are straightforward to address before merge.
