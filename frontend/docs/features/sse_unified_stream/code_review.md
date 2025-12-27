# Code Review: SSE Unified Stream Implementation

## 1) Summary & Decision

**Readiness**

The implementation successfully migrates from multiple SSE connections to a unified stream architecture. The code delivers the core functionality described in the plan: a renamed worker (`sse-worker.ts`) handling both version and task events, a new `SseContextProvider` managing connection lifecycle, refactored consumer hooks (`useVersionSSE`, `useSSETask`), and updated AI analysis integration. The SharedWorker test spec has been updated to verify unified endpoint behavior. However, the implementation reveals **two blockers** that prevent shipment: (1) missing worker file rename in git (file deleted but not added under new name), and (2) the provider auto-connects on mount without respecting the test-mode/production toggle that deployment context previously enforced, breaking existing deployment SSE test isolation. Additionally, there are **major** issues around race conditions in task subscription timing and incomplete test coverage.

**Decision**

`NO-GO` — The worker file rename must be completed in git staging, the auto-connection behavior must be guarded by the same production-only predicate that `DeploymentProvider` previously used, task subscription must handle late-join scenarios, and test coverage must be added for task SSE flows before merging. Once these four issues are resolved, the implementation can proceed.

---

## 2) Conformance to Plan (with evidence)

**Plan alignment**

- Plan Slice 1 (Worker Refactoring) ↔ `src/workers/sse-worker.ts:1-415` — Worker renamed from `version-sse-worker.ts`, connects to `/api/sse/stream` (line 164), handles both `version` (line 191-224) and `task_event` (line 226-254) listeners, generates worker-owned `request_id` (line 159), broadcasts to all tabs (line 68-82).
- Plan Slice 2 (SSE Context Provider) ↔ `src/contexts/sse-context-provider.tsx:1-370`, `sse-context-base.ts:1-49`, `sse-context.ts:1-18` — Provider manages SharedWorker/EventSource routing (line 344-355), exposes `registerVersionListener` and `registerTaskListener` callbacks (line 81-97), maintains `isConnected` and `requestId` state.
- Plan Slice 3 (Version SSE Refactor) ↔ `src/hooks/use-version-sse.ts:1-32` — Simplified to consume context via `registerVersionListener` (line 18-30), removed `connect()`/`disconnect()` methods, delegates connection lifecycle to provider.
- Plan Slice 4 (Task SSE Subscription) ↔ `src/hooks/use-sse-task.ts:1-244` — API changed from `connect(streamUrl)` to `subscribeToTask(taskId)` (line 85), filters events by `taskId` (line 111-115), emits test events with `streamId: 'task'` (line 133-148, 174-186, 216-228).
- Plan Slice 5 (AI Analysis Integration) ↔ `src/hooks/use-ai-part-analysis.ts:109-116` — Extracts `task_id` only (line 109), calls `subscribeToTask(taskId)` (line 116), removes `stream_url` logic.
- Plan Slice 6 (Test Infrastructure) — **PARTIAL**: Updated `shared-worker-version-sse.spec.ts` to test unified endpoint, but **missing** task SSE helpers and task event injection infrastructure documented in plan.
- Plan Slice 7 (Test Coverage) — **PARTIAL**: Deployment SSE tests updated, but AI analysis specs not yet updated to verify subscription API, and no specs for concurrent task subscriptions or iOS fallback task filtering.

**Gaps / deviations**

- **Worker file not staged in git** — `git diff --stat` shows `src/workers/version-sse-worker.ts` deleted (363 lines removed) but `src/workers/sse-worker.ts` is not in the unstaged changes, indicating the new file was created but never added to git. **Blocker**: without `git add src/workers/sse-worker.ts`, the worker disappears on commit.
- **Auto-connection in all modes** — Plan section 10 (Lifecycle) states "shouldAutoConnect = !isTestMode() && !import.meta.env.DEV" (from `deployment-context-provider.tsx:87`), but `SseContextProvider:344-355` unconditionally connects on mount regardless of mode. **Blocker**: this breaks test isolation where deployment SSE specs manually control connection via `__deploymentSseControls.connect(requestId)`. The provider must respect the same production-only predicate.
- **Missing task SSE test infrastructure** — Plan Slice 6 proposed `tests/support/helpers/sse-task.ts` with task event injection helpers and test bridge (`window.__sseTaskControls`). Not implemented. Tests cannot deterministically verify task subscription flows without backend test endpoint or mock harness.
- **Deployment context checkForUpdates() is now no-op** — `deployment-context-provider.tsx:65-68` replaces connection logic with a comment stating "connection lifecycle is managed by SseContextProvider". However, the existing `checkForUpdates()` contract (called on window focus, line 100 in old code) expects to trigger reconnection. Plan did not specify how to preserve this behavior—focus-based reconnection may no longer work.
- **Request ID generation strategy unclear** — Worker generates ID (line 159), provider generates separate ID for direct mode (line 211-212), but `DeploymentProvider` no longer controls request ID lifecycle. Plan Risks section questioned whether to persist ID across restarts; implementation chose fresh IDs but did not document the decision or update test bridge to expose worker-generated ID for deterministic test triggers.
- **iOS fallback performance monitoring absent** — Plan section 9 (Observability) proposed console logging when iOS fallback exceeds event thresholds (>5 tabs, >10 events/sec). Not implemented—acceptable omission for MVP but should be tracked.

---

## 3) Correctness — Findings (ranked)

### Blocker — Worker file not added to git

- **Evidence**: `git diff --stat` shows `src/workers/version-sse-worker.ts | 363 -----` but no corresponding `+` line for `sse-worker.ts`. The new file exists in the filesystem (`ls src/workers/`) but is untracked.
- **Impact**: Committing unstaged changes will delete the worker without replacing it, breaking SSE entirely.
- **Fix**: `git add src/workers/sse-worker.ts` before commit.
- **Confidence**: High — verified by git status showing deleted file not paired with add.

### Blocker — Auto-connection breaks test isolation

- **Evidence**: `src/contexts/sse-context-provider.tsx:344-355` — `useEffect` unconditionally calls `createSharedWorkerConnection()` or `createDirectConnection()` on mount. Previous `deployment-context-provider.tsx:87` guarded auto-connect with `!isTestMode() && !import.meta.env.DEV`.
- **Impact**: Deployment SSE specs (e.g., `shared-worker-version-sse.spec.ts:140-148`) manually call `__deploymentSseControls.connect(requestId)` to control connection timing and request ID for deterministic backend triggers. Auto-connection races with manual connect, causes duplicate connections, and prevents tests from injecting specific request IDs.
- **Fix**: Wrap provider's connection effect with `const shouldAutoConnect = !isTestMode() && !import.meta.env.DEV; if (!shouldAutoConnect) return;` guard identical to deployment context's previous logic (lines 87-112 of old deployment-context-provider.tsx).
- **Confidence**: High — test specs explicitly rely on manual connection control; auto-connect bypasses this contract.

### Major — Task subscription race condition (late join)

- **Evidence**: `src/hooks/use-sse-task.ts:85-126` — `subscribeToTask(taskId)` registers listener on unified stream but has no mechanism to retrieve already-delivered events. Plan section 8 (Errors & Edge Cases) identified "Task Subscription After Task Completion" as unhandled.
- **Impact**: If backend broadcasts `task_started` before `subscribeToTask()` executes (e.g., POST response is slow, subscription setup is async), the hook misses the first event. For AI analysis, this means progress UI may never show "Analysis started" even though task is running. If task completes before subscription, hook remains in `idle` state forever (no result, no error, user sees spinner indefinitely).
- **Fix**: Minimal viable fix: backend caches recent task events per `task_id` (e.g., last 10 events, TTL 5 minutes) and replays them to new subscriptions. Frontend does not need changes—late-joining subscriber receives cached events via normal broadcast. Alternative: add client-side timeout in `subscribeToTask()` (e.g., 30s) and set error state if no events arrive, prompting user retry.
- **Confidence**: Medium — race window is narrow (typically < 100ms) but non-zero; high-latency networks or slow tab rendering increases likelihood. Backend event cache is cleanest solution but requires coordination.

### Major — Missing cache invalidation on task completion

- **Evidence**: Plan section 7 (State Consistency) documents "Task Completion Cache Invalidation" guidance: consumers should call `queryClient.invalidateQueries()` in `onResult` handler. `src/hooks/use-ai-part-analysis.ts:56-68` invokes `onSuccess(result)` callback but does not invalidate any query keys. If AI analysis mutates backend state (e.g., creates suggested parts), the parts list cache remains stale.
- **Impact**: User completes AI analysis, accepts suggested part, but parts list does not refresh—new part is invisible until manual page reload or unrelated query trigger.
- **Fix**: In `use-ai-part-analysis.ts`, import `useQueryClient()` and add `queryClient.invalidateQueries({ queryKey: ['parts'] })` (or appropriate key) inside the `onSuccess` callback before invoking `options.onSuccess(result)`. Alternatively, emit a domain event and let parts list hook subscribe to invalidation trigger.
- **Confidence**: Medium — depends on whether AI analysis result actually mutates backend state. If result is ephemeral (user reviews but doesn't save), invalidation is unnecessary. Code review cannot determine backend mutation semantics; defer to product requirements.

### Major — Incomplete test coverage for task subscription

- **Evidence**: Plan Slice 6 (Test Infrastructure) specified creating `tests/support/helpers/sse-task.ts` with task event injection and `window.__sseTaskControls` bridge. Not implemented. Plan Slice 7 required updating AI analysis specs to verify subscription API—`tests/e2e/parts/ai-analysis-*.spec.ts` not touched in diff.
- **Impact**: Task SSE flows (subscription, filtering, auto-unsubscribe, test event emission) are untested. Regressions in `useSSETask` or worker `task_event` handling will not be caught until production use. AI analysis may break silently if backend changes task event schema.
- **Fix**: Implement task SSE helpers and add specs verifying: (1) `subscribeToTask(taskId)` filters events by ID, (2) concurrent subscriptions to different tasks in same tab, (3) auto-unsubscribe on completion/failure, (4) test event emissions with `streamId: 'task'`. Update AI analysis specs to verify subscription-based flow instead of connection-based flow.
- **Confidence**: High — Definition of Done requires tests in same change; current implementation ships new API without coverage.

### Major — Deployment context checkForUpdates() contract broken

- **Evidence**: `src/contexts/deployment-context-provider.tsx:65-68` — `checkForUpdates()` now returns immediately with comment "No-op: connection lifecycle is managed by SseContextProvider". Old implementation (line 99 of diff) called `connectWithRequestId()` to trigger reconnection.
- **Impact**: Window focus handler (old line 100) called `checkForUpdates()` to reconnect SSE after browser tab became active (user-initiated refresh). This pattern ensured stale tabs reconnect to receive latest version. New no-op breaks this—tabs that lose connection while backgrounded never reconnect, users don't see deployment notifications until full page reload.
- **Fix**: Expose `reconnect()` method on `SseContextProvider` context value, call it from `DeploymentProvider` focus handler. Provider's `reconnect()` should disconnect and re-establish EventSource/SharedWorker to simulate fresh connection. Alternative: provider auto-reconnects on window focus internally (subscribe to focus events in provider effect).
- **Confidence**: Medium — depends on whether focus-based reconnection is a required feature. If deployment notifications are low-priority, acceptable to defer. If critical, blocker.

### Minor — requestId prop type mismatch in DeploymentProvider

- **Evidence**: `src/contexts/deployment-context-provider.tsx:109` — `deploymentRequestId: requestId ?? ''` casts `string | null` to `string` by defaulting to empty string. Old implementation used `getDeploymentRequestId()` which never returned null.
- **Impact**: `DeploymentContextValue.deploymentRequestId` type is `string`, so consumers expect non-null. Empty string is semantically different from null (indicates "no connection" vs "connection exists but ID unknown"). Test bridge `getStatus()` returns `requestId: deploymentRequestIdRef.current` (line 107) which is `string | null`, causing type mismatch in test assertions.
- **Fix**: Change `DeploymentContextValue.deploymentRequestId` type to `string | null` to match reality, update consumers to handle null case. Or ensure provider always has a valid request ID (fallback to tab-generated ID if worker hasn't connected yet).
- **Confidence**: Low — may not cause runtime errors if consumers don't distinguish empty string from meaningful ID, but violates type contract.

### Minor — Inconsistent test event streamId for task events

- **Evidence**: Worker emits test events with `streamId: 'task'` (line 242 of `sse-worker.ts`), direct mode emits with same ID (line 283 of `sse-context-provider.tsx`), `useSSETask` emits with `streamId: 'task'` (line 94 of `use-sse-task.ts`). However, version events use `streamId: 'deployment.version'` (line 182 of worker, line 232 of provider). Plan section 3 (Data Model) specified `'task'` for task events, which aligns with implementation.
- **Impact**: Test helpers must filter by different streamIds depending on event type. Not a bug, but inconsistency between dot-separated ID (`deployment.version`) and flat ID (`task`) could confuse test authors. Consider renaming to `'task.stream'` for consistency.
- **Fix**: No action required—current naming is functional. If desired, rename to `'sse.task'` or `'task.events'` to match version event pattern, update all references, and regenerate test events.
- **Confidence**: Low — cosmetic inconsistency, does not affect correctness.

---

## 4) Over-Engineering & Refactoring Opportunities

### Hotspot: Duplicate event listener registration in provider

- **Evidence**: `src/contexts/sse-context-provider.tsx:241-268` (version listener) and `270-297` (task_event listener) — Direct mode repeats identical parse-dispatch-emit pattern for both event types. SharedWorker mode delegates parsing to worker (lines 128-169), but direct mode duplicates 50+ lines.
- **Suggested refactor**: Extract helper `handleSseEvent(eventType: string, rawData: string, dispatcher: Function, streamId: string)` that parses JSON, dispatches to listeners, and emits test event. Call it from both `addEventListener('version', ...)` and `addEventListener('task_event', ...)` to eliminate duplication.
- **Payoff**: Reduces provider code by ~40 lines, centralizes error handling for parse failures, makes adding future event types (e.g., `notification_event`) trivial.

### Hotspot: DeploymentProvider still wraps useVersionSSE despite no-op methods

- **Evidence**: `src/contexts/deployment-context-provider.tsx:21-170` — Provider continues to call `useVersionSSE()` and derive `isNewVersionAvailable` state (line 74-85), but connection lifecycle methods are now stubs. The provider's primary responsibility (version change detection) is intact, but auto-connection logic moved to `SseContextProvider`.
- **Suggested refactor**: No change needed—separation of concerns is correct. `SseContextProvider` owns connection, `DeploymentProvider` owns version semantics and notification logic. Current structure is maintainable.
- **Payoff**: N/A—not over-engineered.

### Hotspot: Test event metadata conditionally included in every broadcast

- **Evidence**: `src/workers/sse-worker.ts:180-186, 208-215, 240-246` — Worker checks `hasTestModePorts` before every broadcast and conditionally attaches `__testEvent` metadata. Same pattern in provider (lines 229-238, 280-293).
- **Suggested refactor**: Extract `maybeAttachTestEvent(message: WorkerMessage, streamId, phase, event, data): WorkerMessage` helper that returns message as-is if no test ports, or returns message with `__testEvent` attached. Reduces 6 conditional blocks to 3 one-liners.
- **Payoff**: Cleaner broadcast sites, easier to ensure test event coverage when adding new event types.

---

## 5) Style & Consistency

### Pattern: Inconsistent ref usage in useSSETask

- **Evidence**: `src/hooks/use-sse-task.ts:65-66` — `currentTaskIdRef` and `unsubscribeListenerRef` use refs to store mutable values, but `subscribeToTask` callback (line 85) is wrapped in `useCallback` with `unsubscribe` in dependencies (line 127). The `unsubscribe` callback itself uses ref (line 77) to avoid stale closure, but `subscribeToTask` could have stale `currentTaskIdRef.current` if `useCallback` dependencies are incomplete.
- **Impact**: Current implementation is safe because `subscribeToTask` sets `currentTaskIdRef.current = taskId` at call time (line 92), so ref always has latest value. However, mixing ref pattern with `useCallback` dependencies creates maintenance risk—future edits may inadvertently close over stale values.
- **Recommendation**: Document why `registerTaskListener` is not in `subscribeToTask` dependencies (stable reference from context) or add exhaustive-deps suppression comment explaining ref usage pattern.

### Pattern: Console logging verbosity differs between worker and provider

- **Evidence**: Worker logs extensively (`console.debug` on lines 166, 171, 196, 230, 259, 299, 372, 376, 414), provider logs moderately (lines 176, 302, 312), hooks do not log at all except errors.
- **Impact**: Debugging SSE issues in production requires correlating worker logs (visible in SharedWorker scope) with provider logs (visible in tab console). No unified trace ID or request ID correlation across log statements.
- **Recommendation**: Prefix all SSE-related logs with `[SSE:${requestId}]` to enable log correlation. Worker should include request ID in every log statement (lines 166, 171, etc.). Provider should log connection mode (SharedWorker vs direct) on initialization.

### Pattern: Error handling in listener dispatchers swallows exceptions

- **Evidence**: `src/contexts/sse-context-provider.tsx:104-108` (version dispatcher) and `117-121` (task dispatcher) — `try/catch` wraps listener invocations and logs errors but does not re-throw or surface errors to consumers.
- **Impact**: If a task listener throws (e.g., bug in `useSSETask` event handler), error is silently logged, and subsequent listeners still execute. Consumer has no indication that listener failed—may result in inconsistent state (e.g., progress updated but UI not refreshed).
- **Recommendation**: Acceptable for production robustness (one listener's failure shouldn't crash all listeners). However, in test mode, consider re-throwing after logging to fail tests fast when listener logic is broken. Add `if (isTestMode()) throw error;` after console.error.

---

## 6) Tests & Deterministic Coverage (new/changed behavior only)

### Surface: Unified SSE worker (SharedWorker mode)

- **Scenarios**:
  - ✅ Given worker not running, When first tab connects, Then worker opens EventSource to `/api/sse/stream?request_id=X` (`shared-worker-version-sse.spec.ts:219-235`)
  - ✅ Given worker connected with multiple tabs, When version event received, Then all tabs receive version message (`shared-worker-version-sse.spec.ts:90-115` — skipped due to test bridge timing issue, but functionality verified by "maintains connection when one tab closes")
  - ✅ Given worker connected with one tab, When last tab disconnects, Then worker closes EventSource (`shared-worker-version-sse.spec.ts:211-309`)
  - ❌ Given worker connected, When task_event received, Then all tabs receive task_event message — **Missing spec**
- **Hooks**: Worker emits `__testEvent` metadata with `streamId: 'deployment.version'` for version events (line 182) and `streamId: 'task'` for task events (line 242); test spec uses `waitForSseEvent(page, { streamId: 'deployment.version', phase: 'open', event: 'connected' })`
- **Gaps**: No coverage for task events in SharedWorker mode. Add spec: connect worker, trigger backend task event (via test endpoint or AI analysis), verify multiple tabs receive it.
- **Evidence**: `tests/e2e/deployment/shared-worker-version-sse.spec.ts:1-458`; no task event assertions.

### Surface: SseContextProvider (direct EventSource mode)

- **Scenarios**:
  - ✅ Given provider mounted in dev mode (direct), When EventSource opens, Then `isConnected` updates (`sse-context-provider.tsx:225-239` emits test event, no dedicated spec but covered by non-SharedWorker runs)
  - ❌ Given provider mounted in direct mode, When version event received, Then version listeners invoked — **Inferred working** (deployment context consumes it) but no explicit spec
  - ❌ Given provider mounted in direct mode, When task_event received, Then task listeners invoked and filtered by taskId — **Missing spec**
- **Hooks**: Provider emits `SseTestEvent` with `streamId: 'deployment.version'` (line 232) and `streamId: 'task'` (line 283); no test helper for direct mode task events yet
- **Gaps**: Direct mode task SSE coverage absent. Add spec: mount provider in test mode (disable SharedWorker), trigger task event, verify `useSSETask` receives it and filters by ID.
- **Evidence**: Provider code at `src/contexts/sse-context-provider.tsx:209-317`; no test file for provider.

### Surface: useSSETask hook (subscription API)

- **Scenarios**:
  - ❌ Given hook mounted, When `subscribeToTask(taskId)` called, Then listener registered and `isSubscribed` true — **Missing spec**
  - ❌ Given subscribed to task, When task_event with matching task_id arrives, Then `progress`/`result` state updates — **Missing spec**
  - ❌ Given subscribed to task, When task_event with different task_id arrives, Then no state change (filtered out) — **Missing spec**
  - ❌ Given task completed, When `task_completed` event arrives, Then auto-unsubscribe and `onResult` callback invoked — **Missing spec**
  - ✅ Given AI analysis in progress, When progress events arrive, Then UI reflects progress (inferred from AI analysis working in production, but not explicitly tested)
- **Hooks**: Hook emits `SseTestEvent` with `streamId: 'task'`, `phase: 'open'` (line 94), `phase: 'message'` (line 148, 175, 217), `phase: 'error'` (line 207, 221); no test helper consumes these events yet
- **Gaps**: No dedicated specs for `useSSETask` subscription lifecycle. Add spec: subscribe to two tasks concurrently, trigger events for both, verify each hook instance only processes its own task_id.
- **Evidence**: Hook code at `src/hooks/use-sse-task.ts:46-244`; no test file.

### Surface: AI analysis integration

- **Scenarios**:
  - ✅ Given AI analysis submitted, When task_id returned, Then hook subscribes to task events (inferred from `use-ai-part-analysis.ts:116`)
  - ❌ Given analysis in progress, When task events arrive, Then progress UI updates — **Existing specs likely cover this** but not verified in diff (AI analysis specs use mocks, may not exercise real subscription path)
- **Hooks**: AI analysis hooks into `useSSETask`, which emits task test events; AI specs use SSE mocks (`tests/support/helpers/sse-mock.ts`) per `testing/no-route-mocks` exception
- **Gaps**: Verify existing AI specs still pass with subscription API; add spec for task_id extraction and subscription call.
- **Evidence**: Integration code at `src/hooks/use-ai-part-analysis.ts:109-116`; test files not included in diff.

### Surface: Deployment version notifications

- **Scenarios**:
  - ✅ Given deployment context mounted, When version event received, Then `isNewVersionAvailable` triggers and banner shows (`deployment-context-provider.tsx:74-85` derives state; existing deployment specs verify this)
- **Hooks**: Deployment context consumes `useVersionSSE`, which subscribes to version events from provider; `shared-worker-version-sse.spec.ts` verifies version delivery
- **Gaps**: None for version SSE—existing coverage sufficient.
- **Evidence**: Deployment specs at `tests/e2e/deployment/shared-worker-version-sse.spec.ts`.

---

## 7) Adversarial Sweep

### Attack: Race between provider mount and manual connect in tests

- **Scenario**: Test navigates to page with `?__sharedWorker`, provider auto-connects immediately on mount (line 344-355), test then calls `__deploymentSseControls.connect(requestId)` to inject specific ID. Two connections race—worker may connect with auto-generated ID before test ID is received.
- **Evidence**: `shared-worker-version-sse.spec.ts:140-147` expects to control request ID via manual connect, but provider's unconditional auto-connect breaks this.
- **Impact**: Test assertions on `requestId` fail intermittently depending on timing. Backend triggers keyed by test request ID may miss the actual connection.
- **Severity**: **Blocker** — breaks test determinism.
- **Fix**: Guard provider auto-connect with `!isTestMode()` (see Finding: "Auto-connection breaks test isolation").

### Attack: Task subscription after task completes

- **Scenario**: Backend processes task in <50ms (fast path), broadcasts `task_started` and `task_completed` before frontend `subscribeToTask(taskId)` executes (slow tab, GC pause, async race).
- **Evidence**: `use-sse-task.ts:85-126` registers listener but does not request replay of past events.
- **Impact**: Hook never receives any events, remains `isSubscribed: true` indefinitely, UI shows spinner forever, user force-reloads page.
- **Severity**: **Major** — low probability in practice but catastrophic UX when it happens.
- **Fix**: See Finding: "Task subscription race condition (late join)".

### Attack: Concurrent subscriptions to same taskId in different hook instances

- **Scenario**: Two components mount simultaneously and both call `useSSETask.subscribeToTask(sameTaskId)`. Each hook registers independent listener on context's `taskEvents` stream, both filter by same ID, both update state.
- **Evidence**: `sse-context-provider.tsx:93-96` supports multiple task listeners (Set-based registry), `use-sse-task.ts:111-115` filters by `currentTaskIdRef.current`.
- **Impact**: No conflict—both hooks receive same events and update independently. If both invoke `onResult` callback, caller must handle duplicate invocation (e.g., AI analysis completes, two components both try to navigate to result page → only one navigation wins due to router).
- **Severity**: **Minor** — acceptable behavior (designed to allow multiple consumers), but could surprise developers. Document in hook API comments.
- **Proof**: Code allows multiple listeners (line 93), filtering is per-hook (line 111), no shared state between hook instances → safe.

### Attack: Memory leak from unsubscribe not cleaning up listener

- **Scenario**: Component mounts, calls `subscribeToTask(taskId)`, then unmounts before task completes. If `unsubscribe()` fails to remove listener from context's `taskListenersRef`, listener persists forever (Set never shrinks).
- **Evidence**: `use-sse-task.ts:77-81` — `unsubscribe()` calls `unsubscribeListenerRef.current()`, which is the cleanup function returned by `registerTaskListener` (line 82-85 of `sse-context-provider.tsx`). Cleanup deletes listener from Set (line 95).
- **Impact**: No leak—cleanup properly removes listener. However, if `unsubscribeListenerRef.current` is somehow null (bug), delete never happens.
- **Severity**: **Low** — current code is safe, but lacks defensive guard.
- **Proof**: Cleanup path verified at `sse-context-provider.tsx:82-85` and `use-sse-task.ts:234-236` (unmount effect calls `unsubscribe()`). Add assertion `if (!unsubscribeListenerRef.current) console.warn('unsubscribe called without active listener')` for debugging.

### Attack: EventSource never closes in direct mode if provider unmounts during error retry

- **Scenario**: Provider in direct mode (dev/test/iOS), EventSource errors (line 309-316), provider schedules reconnect... but parent component unmounts provider before reconnect fires. Cleanup effect (line 352-354) calls `disconnect()` (line 322-341), which closes `eventSourceRef.current`, but if retry was pending, EventSource may linger.
- **Evidence**: Provider's `disconnect()` does not cancel pending reconnection timers (no retry timeout in provider—worker handles retries, provider just sets `isConnected: false` on error).
- **Impact**: Direct mode doesn't schedule retries—worker handles that in SharedWorker mode. In direct mode, `onerror` only sets `isConnected: false` (line 315), no automatic retry. User must manually trigger reconnection or reload page. Therefore, no lingering retry timeout to leak.
- **Severity**: **None** — false alarm, direct mode does not auto-retry.
- **Proof**: Provider code at `sse-context-provider.tsx:309-316` shows no retry logic; worker code at `sse-worker.ts:122-144` schedules retries only in worker context.

---

## 8) Invariants Checklist

### Invariant: Worker request ID remains stable across reconnections for worker lifetime

- **Where enforced**: `src/workers/sse-worker.ts:158-160` — `if (!currentRequestId) { currentRequestId = makeUniqueToken(32); }` generates ID once, reused for all reconnections (line 163).
- **Failure mode**: If `currentRequestId` is reset on error or last-tab disconnect, backend loses correlation between reconnections.
- **Protection**: `closeConnection()` (line 105-117) sets `currentRequestId = null` only when all tabs disconnect (called from `handleDisconnect` line 375), ensuring ID persists during retry windows. `scheduleReconnect()` checks `ports.size === 0` before resetting (line 124-127).
- **Evidence**: ID stability verified by `scheduleReconnect` guard at line 124 and `handleDisconnect` logic at line 375.

### Invariant: Only one EventSource connection per worker instance

- **Where enforced**: `src/workers/sse-worker.ts:151-155` — `createEventSource()` calls `if (eventSource) { eventSource.close(); eventSource = null; }` before creating new instance.
- **Failure mode**: If cleanup fails, two EventSources may coexist, causing duplicate event delivery and wasted connections.
- **Protection**: `eventSource` is global to worker scope (line 58), serialized access via single-threaded worker context ensures no race. `createEventSource()` called only from `handleConnect` (line 312) or `scheduleReconnect` (line 142), both of which check preconditions.
- **Evidence**: Singleton pattern at line 58, cleanup at line 152-154.

### Invariant: Task events filtered by taskId do not leak to other subscriptions

- **Where enforced**: `src/hooks/use-sse-task.ts:111-115` — `if (event.taskId !== currentTaskIdRef.current) { return; }` guards all event processing.
- **Failure mode**: If filter fails, hook A subscribed to task1 receives events for task2, causing incorrect progress updates or result displays.
- **Protection**: Filter is first statement in listener callback (line 111), early return prevents any state mutations. `currentTaskIdRef.current` set before listener registration (line 92), ensuring filter matches subscription intent.
- **Evidence**: Filter guard at line 111-115; test scenario "task_event with different task_id arrives → no state change" should verify this (currently missing).

### Invariant: Provider's isConnected reflects worker's actual connection state

- **Where enforced**: `src/contexts/sse-context-provider.tsx:136-138` (SharedWorker) — `connected` message sets `isConnected: true`, `error`/`disconnected` messages set `false` (lines 157-163). Direct mode (line 225-227) syncs on `eventSource.onopen`.
- **Failure mode**: If worker sends `connected` message before EventSource is fully open (race in worker's `onopen` handler), provider shows connected but events don't flow.
- **Protection**: Worker broadcasts `connected` only in `eventSource.onopen` handler (line 170), which fires after HTTP handshake succeeds. Provider trusts worker's state broadcast.
- **Evidence**: Worker `onopen` at line 170-189, provider message handler at line 134-138.

### Invariant: Deployment version never resets to null after first reception (unless permanent disconnect)

- **Where enforced**: `src/contexts/deployment-context-provider.tsx:74-85` — `useEffect` only updates `currentVersion` if `version !== currentVersion`, never sets it to null.
- **Failure mode**: Transient connection errors reset version to null, causing notification banner flicker or false "new version" alerts.
- **Protection**: `useVersionSSE` maintains `version` state across reconnections (does not reset on disconnect). `DeploymentProvider` only derives `isNewVersionAvailable` from version mismatches, not connection state.
- **Evidence**: Version state persisted in `use-version-sse.ts:18` (useState initialized to null but never reset by hook). **However**, note that old `disconnect()` callback in version hook (line 91-105 of old code) did not reset version state, but new hook has no disconnect method—version persists by default unless hook unmounts.

---

## 9) Questions / Needs-Info

### Question: Is focus-based reconnection still required?

- **Why it matters**: Old `DeploymentProvider` called `checkForUpdates()` on window focus (line 100 of old code) to reconnect SSE after tab backgrounding. New provider auto-connects on mount but does not re-establish on focus. If browser kills SSE while tab is inactive, user never reconnects unless they reload page.
- **Desired answer**: Product team clarification: (A) Focus reconnection is mandatory—re-implement in provider or deployment context. (B) Auto-reconnection on error (worker retry logic) is sufficient—remove focus handler entirely. (C) Defer to future enhancement.

### Question: Should worker persist request ID to sessionStorage/localStorage?

- **Why it matters**: Plan Risks (line 869-871) raised whether request ID should survive worker termination. Current implementation generates fresh ID on worker init (line 159). If browser kills SharedWorker due to memory pressure, new worker instance gets new ID, breaking backend correlation for analytics or session tracking.
- **Desired answer**: Backend team input: Does request_id correlation matter across worker restarts? If yes, persist to sessionStorage keyed by tab group. If no, document decision and close risk.

### Question: Does AI analysis result mutate backend state requiring cache invalidation?

- **Why it matters**: Finding "Missing cache invalidation on task completion" assumes AI result creates persistent data (e.g., parts). If result is ephemeral (user reviews but doesn't save), invalidation is unnecessary overhead.
- **Desired answer**: Product/backend clarification: Does `task_completed` event for AI analysis indicate backend mutation? If yes, which React Query keys should be invalidated? If no, close finding as false positive.

### Question: What is the backend test strategy for task events?

- **Why it matters**: Plan Open Questions (line 862-866) proposed backend test endpoint `POST /api/testing/sse/task-event` to inject task events deterministically. Without it, frontend tests must rely on real task flows (slow, complex) or mocks (violates `testing/no-route-mocks`).
- **Desired answer**: Backend team confirmation: (A) Test endpoint is implemented, spec it. (B) Use AI analysis mock exception with inline ESLint suppression. (C) Real task flows only (accept slower test runtime).

---

## 10) Risks & Mitigations (top 3)

### Risk: Worker file commit failure causes production outage

- **Mitigation**: Immediately run `git add src/workers/sse-worker.ts` and verify `git status` shows both delete and add before committing. Run `pnpm build` locally to ensure worker bundling succeeds.
- **Evidence**: Blocker finding at Section 3: "Worker file not added to git".

### Risk: Test suite fails due to auto-connection race

- **Mitigation**: Add production-only guard to provider auto-connect (`if (!isTestMode() && !import.meta.env.DEV)`), verify `shared-worker-version-sse.spec.ts` passes locally before merge.
- **Evidence**: Blocker finding at Section 3: "Auto-connection breaks test isolation".

### Risk: Production AI analysis hangs indefinitely due to late-join race

- **Mitigation**: Coordinate with backend team to implement task event caching (last 10 events per task_id, 5 min TTL), or add 30s client-side timeout in `subscribeToTask()` with error state fallback. Test with artificial POST delay (network throttling) to verify recovery.
- **Evidence**: Major finding at Section 3: "Task subscription race condition (late join)".

---

## 11) Confidence

**Confidence**: **Medium** — The implementation correctly realizes the planned architecture (unified worker, context provider, subscription-based hooks) and successfully consolidates SSE connections. However, the two blockers (git staging and test auto-connect) are trivial to fix but critical to ship, and the major issues (task subscription timing, incomplete test coverage, focus reconnection) require coordination with backend and product to resolve. Once blockers are fixed and major risks are mitigated, confidence upgrades to High—the code is well-structured, follows established patterns, and aligns with project conventions.
