# Plan Review: SSE Unified Stream Implementation

## 1) Summary & Decision

**Readiness**

The plan is comprehensive, well-researched, and demonstrates deep understanding of the existing SSE infrastructure. It correctly identifies all major touchpoints, follows established patterns from the version SSE worker, and provides detailed coverage of test infrastructure requirements. The migration strategy is sound, with clear implementation slices that can be tested independently. However, there are several critical gaps in the event stream architecture, cache invalidation strategy, and test coverage that must be addressed before implementation.

**Decision**

`GO-WITH-CONDITIONS` — The plan is implementation-ready after addressing the Major findings in Section 5. The core architecture is solid, but the event stream implementation pattern (callbacks vs observables), React Query cache invalidation after task completion, and the missing backend test coordination for deterministic task events need concrete design decisions and specification.

## 2) Conformance & Fit (with evidence)

**Conformance to refs**

- `docs/commands/plan_feature.md` — Pass — `plan.md:1-862` — Plan follows all required sections (0-16), uses prescribed templates, quotes evidence with file:line references, and provides deterministic test scenarios with instrumentation requirements.

- `docs/contribute/architecture/application_overview.md` — Pass — `plan.md:7-23` — Research log demonstrates understanding of generated API hooks, domain-driven structure, and test instrumentation patterns. Correctly identifies that custom hooks wrap generated clients and map snake_case to camelCase.

- `docs/contribute/testing/playwright_developer_guide.md` — Partial — `plan.md:645-728` — Test plan scenarios follow Given/When/Then format and reference instrumentation. However, "Gaps: Backend task event injection not yet implemented" (line 656, 692) violates the "Real backend always" principle without documenting backend coordination or justifying AI mock exception. See Major finding below.

- `docs/product_brief.md` — N/A — SSE infrastructure change; no user-facing workflow impact.

- `CLAUDE.md` — Pass — `plan.md:863-865` — Plan shows "High" confidence with justification and acknowledges existing patterns can be reused. Implementation slices (lines 733-808) align with incremental delivery guidance.

**Fit with codebase**

- `src/workers/version-sse-worker.ts` — `plan.md:96-100` — Correctly plans to extend existing worker by adding task_event listener alongside version events. Worker already has test instrumentation pattern (`__testEvent` metadata) that can be reused. Alignment is strong.

- `useVersionSSE` hook — `plan.md:117-120` — Refactor plan correctly identifies that hook will delegate connection management to new context provider while preserving backward-compatible API (`isConnected`, `version`). However, plan does not specify whether `connect(options)` method will remain or be removed. Minor ambiguity.

- `useSSETask` hook — `plan.md:121-124` — API change from `connect(streamUrl)` to `subscribeToTask(taskId)` is well-justified and aligns with unified stream architecture. However, plan does not address how existing `use-ai-part-analysis.ts` error handling will adapt to subscription errors vs connection errors. See Major finding.

- `SseContextProvider` (new) — `plan.md:103-106, 193-203` — Follows established pattern from `DeploymentProvider`. However, `SseContextValue` shape (lines 193-203) proposes "Observable<VersionEventData> or callback registration" without specifying which. This is a critical implementation detail affecting hook consumers. See Major finding.

- Test infrastructure — `plan.md:141-148` — Plan to create `tests/support/helpers/sse-task.ts` follows pattern from `deployment-sse.ts`. However, plan does not specify how helpers will coordinate with backend to inject deterministic task events (beyond "requires backend coordination"). Missing concrete backend API design.

## 3) Open Questions & Ambiguities

- Question: How will `SseContextProvider` expose event streams—callbacks or observables?
- Why it matters: Affects how `useVersionSSE` and `useSSETask` subscribe to events, impacts cleanup logic, and determines whether external libraries (e.g., RxJS) are needed or if native React patterns suffice.
- Needed answer: Specify concrete implementation pattern. Recommendation: Use callback-based registration (`registerVersionListener(callback)` returning cleanup function) to avoid introducing Observable library dependency and align with React cleanup patterns.

- Question: What happens to in-flight task subscriptions when `SseContextProvider` unmounts?
- Why it matters: If parent route unmounts provider while task is active, subscription listeners are lost but backend may still emit events to the unified stream. Worker continues broadcasting to other tabs but this tab loses progress.
- Needed answer: Document cleanup behavior—either auto-unsubscribe all tasks on provider unmount, or preserve worker connection and queue events for resubscription on remount. Current plan section 10 (lines 576-583) only mentions disconnect command but not task subscription cleanup.

- Question: Should task subscriptions invalidate React Query cache on completion?
- Why it matters: AI analysis results likely need to trigger cache invalidation for parts list or related queries. Current plan does not mention TanStack Query integration for task completion.
- Needed answer: Specify cache invalidation strategy in section 7 (State Consistency). If task completion mutates backend state, document which query keys to invalidate and where invalidation logic lives (hook vs context).

- Question: How will Playwright tests inject deterministic task events without backend support?
- Why it matters: Plan section 13 (lines 692-693) states "Backend task event injection endpoint needed; may use AI analysis mock as interim" but does not specify fallback strategy or timeline for backend coordination.
- Needed answer: Either document concrete backend test endpoint design (`POST /api/testing/tasks/trigger`) with payload contract, or justify AI mock exception per `testing/no-route-mocks` rule with inline suppression and backend issue tracker reference.

## 4) Deterministic Playwright Coverage (new/changed behavior only)

- Behavior: Unified worker broadcasts both version and task events
- Scenarios:
  - Given worker not running, When first tab connects, Then worker generates request_id and opens EventSource to `/api/sse/stream?request_id=X` (`plan.md:648-654`)
  - Given worker connected, When version event received, Then all tabs receive version message (`plan.md:652`)
  - Given worker connected, When task_event received, Then all tabs receive task_event message (`plan.md:653`)
- Instrumentation: Worker emits `__testEvent` metadata in messages; `streamId` differentiates version vs task events (`plan.md:656`)
- Backend hooks: Plan states "Backend task event injection not yet implemented; requires test endpoint or real backend task completion" (`plan.md:656`)
- Gaps: **Major** — No concrete backend coordination strategy. Either backend must implement test trigger endpoint or plan must document which real backend task flows will be tested.
- Evidence: `plan.md:645-657`

- Behavior: Task SSE subscription filters by task_id
- Scenarios:
  - Given hook mounted, When `subscribeToTask(taskId)` called, Then `isSubscribed` becomes true (`plan.md:686`)
  - Given subscribed to task, When task_event with matching task_id arrives, Then state updates (`plan.md:687`)
  - Given subscribed to task, When task_event with different task_id arrives, Then no state change (filtered out) (`plan.md:688`)
  - Given task completed, When `task_completed` event arrives, Then auto-unsubscribe (`plan.md:689`)
- Instrumentation: Hook emits `SseTestEvent` with `streamId: 'task'` for each processed event (`plan.md:691`)
- Backend hooks: "Backend task event injection endpoint needed; may use AI analysis mock as interim (sanctioned per testing/no-route-mocks)" (`plan.md:692-693`)
- Gaps: **Major** — AI analysis mock is sanctioned exception but only for AI analysis flows. Generic task SSE testing requires backend support or justified exception. Plan does not document whether new exception will be added or backend will be extended first.
- Evidence: `plan.md:683-694`

- Behavior: Version SSE refactored to consume events from context
- Scenarios:
  - Given hook mounted, When version event arrives via context, Then `version` state updates and `SseTestEvent` emitted (`plan.md:675`)
  - Given deployment context using hook, When new version received, Then `isNewVersionAvailable` triggers (`plan.md:677`)
- Instrumentation: Hook emits `SseTestEvent` with `streamId: 'deployment.version'` (`plan.md:678`)
- Backend hooks: Existing deployment SSE specs use real backend (`tests/e2e/deployment/shared-worker-version-sse.spec.ts`)
- Gaps: None—backward-compatible with existing specs (`plan.md:679`)
- Evidence: `plan.md:671-680`

- Behavior: AI analysis integration uses subscription API
- Scenarios:
  - Given hook initialized, When `analyzePartFromData` called, Then POST to `/api/ai-parts/analyze` and `subscribeToTask(task_id)` (`plan.md:699`)
  - Given subscribed to analysis task, When progress events arrive, Then `onProgress` callback invoked (`plan.md:700`)
  - Given task response missing `task_id`, Then error thrown and analysis blocked (`plan.md:704`)
- Instrumentation: Hook emits component errors via `emitComponentError`; SSE events with `streamId: 'task'` (`plan.md:705`)
- Backend hooks: "Real backend task events preferable over mocks; coordinate backend test endpoint for deterministic task completion" (`plan.md:706`)
- Gaps: **Major** — Plan acknowledges real backend preferred but does not block on backend readiness. If AI mock remains the testing strategy, must justify why this is acceptable deviation from "Real backend always" policy.
- Evidence: `plan.md:695-707`

## 5) Adversarial Sweep

**Major — Event Stream Pattern Undefined**
**Evidence:** `plan.md:193-203` — Section 3 defines `SseContextValue` with "versionEvents: Observable<VersionEventData> // or callback registration" and "taskEvents: Observable<TaskEventData> // or callback registration"
**Why it matters:** This is a critical implementation detail that affects every consumer hook (`useVersionSSE`, `useSSETask`), cleanup logic, and potential library dependencies. The "or" indicates the pattern is undecided. If Observables are chosen, the plan must specify library (RxJS?) and justify introducing it. If callbacks, must specify registration/cleanup API (e.g., `registerTaskListener(taskId, callback) => unsubscribe`).
**Fix suggestion:** Specify concrete pattern in section 3. Recommended approach: Use callback-based registration without Observable library. Add to `SseContextValue`:
```typescript
interface SseContextValue {
  isConnected: boolean;
  requestId: string | null;
  registerVersionListener: (callback: (event: VersionEventData) => void) => () => void;
  registerTaskListener: (callback: (event: TaskEventData) => void) => () => void;
}
```
Consumers call `registerVersionListener(callback)` which returns cleanup function. This aligns with React patterns and avoids external dependencies.
**Confidence:** High

**Major — React Query Cache Invalidation Missing**
**Evidence:** `plan.md:413-446` — Section 7 "State Consistency & Async Coordination" documents worker-tab synchronization and task event filtering but does not mention React Query cache invalidation after task completion.
**Why it matters:** AI analysis tasks likely produce results that affect other queries (e.g., parts list if analysis creates/updates part). When `task_completed` event arrives, the app may need to invalidate specific query keys to refetch stale data. Current plan only documents local hook state (`progress`, `result`, `error`) but not side effects on global cache.
**Fix suggestion:** Add entry to section 7 documenting cache coordination:
```
### Task Completion Cache Invalidation

- Source of truth: `useSSETask` receives `task_completed` event with result data
- Coordination: Hook invokes `onResult` callback with transformed data; caller (e.g., `use-ai-part-analysis`) decides whether to invalidate React Query cache
- Async safeguards: Invalidation occurs after `onResult` callback succeeds; if callback throws, cache remains stale (acceptable—user will retry)
- Instrumentation: No additional events needed—task completion event already emitted
- Evidence: `use-ai-part-analysis.ts:131` shows `onSuccess` callback after analysis completes; extend to include `queryClient.invalidateQueries` if needed
```
Also add to section 4 (API surface) documenting which hooks may trigger invalidation.
**Confidence:** High

**Major — Backend Test Coordination Unspecified**
**Evidence:** `plan.md:656, 692-693, 706` — Multiple test plan sections state "Backend task event injection endpoint needed" or "coordinate backend test endpoint" without concrete design.
**Why it matters:** Playwright suite policy requires real backend (no route mocks except justified AI exception). If backend cannot inject deterministic task events, specs must either (a) rely on real task flows (slower, complex setup), (b) extend AI mock exception (requires justification and inline suppression), or (c) block implementation until backend adds test trigger endpoint. Plan does not choose a path.
**Fix suggestion:** Add to section 15 (Risks & Open Questions):
```
- Question: What is the backend test strategy for task events?
- Why it matters: Deterministic Playwright specs need to trigger task events on demand. Real task flows (e.g., AI analysis) may be too slow/complex for every test scenario.
- Owner / follow-up: Backend team. Proposed endpoint: `POST /api/testing/tasks/events` with body `{ task_id, event_type, data }` to trigger arbitrary task event delivery via unified SSE stream. If unavailable at implementation time, extend AI analysis mock exception with inline suppression: `// eslint-disable-next-line testing/no-route-mocks -- Backend lacks test trigger for task events; tracked in issue #XYZ`
```
Also update section 13 test plan to reference this decision.
**Confidence:** High

**Minor — iOS Fallback Duplicate Event Risk**
**Evidence:** `plan.md:485-489` — Section 8 documents iOS Safari fallback creates direct EventSource per tab, states "client-side filtering for both version and task events works identically" and "acceptable overhead given iOS tab suspension behavior"
**Why it matters:** While filtering prevents cross-contamination, iOS users with multiple active tabs receive N copies of every event (version + all task events for all tabs). For high-frequency task events (progress updates every 100ms), this multiplies network/CPU load. Plan acknowledges overhead but does not quantify acceptable threshold.
**Fix suggestion:** Add monitoring requirement to section 9 (Observability): "Track event broadcast count per tab in test mode; if iOS fallback shows >5 tabs with sustained >10 events/sec, consider iOS-specific throttling or connection pooling." Also add to section 15 risks: "Mitigation: Monitor iOS performance in production; defer optimization unless metrics show degradation."
**Confidence:** Medium

**Minor — useVersionSSE API Ambiguity**
**Evidence:** `plan.md:262-268` — Section 4 states `useVersionSSE` outputs `{ isConnected: boolean, version: string | null }` but does not list `connect` or `disconnect` methods. However, section 2 (lines 117-120) says "refactor to consume version events from context instead of managing its own connection; remove SharedWorker and direct EventSource logic."
**Why it matters:** Current `useVersionSSE` API includes `connect(options)` and `disconnect()` methods (see `use-version-sse.ts:20-25`). Plan implies these are removed since connection is delegated to provider, but `DeploymentProvider` currently calls `connect({ requestId })` and `disconnect()` (see `deployment-context-provider.tsx:26, 52, 97`). If methods are removed, `DeploymentProvider` needs updates beyond what plan documents in section 2.
**Fix suggestion:** Clarify in section 4: "useVersionSSE no longer exposes `connect` or `disconnect` methods—connection lifecycle is managed by `SseContextProvider`. `DeploymentProvider` will remove these calls and rely on provider auto-connect behavior." Also add `DeploymentProvider` to section 2 file map with justification for removing `connect`/`disconnect` calls.
**Confidence:** High

**Minor — Request ID Persistence Question Deferred**
**Evidence:** `plan.md:837-840` — Open question about persisting request ID across browser restarts is marked "defer to current design (fresh ID per worker lifetime) unless backend requires persistence"
**Why it matters:** If backend correlates events by request_id for analytics/debugging, fresh ID per worker means correlation breaks on worker restart (memory pressure, browser update). Plan acknowledges trade-off but does not document backend requirements.
**Fix suggestion:** Add to section 15: "Verify with backend team whether request_id correlation is used for long-lived analytics. If yes, consider persisting ID to sessionStorage or localStorage (worker-scoped) to survive worker restarts. If no, current design is sufficient." Also note that worker generates ID (not tab), so current `getDeploymentRequestId()` tab-level caching is unused—consider removing or renaming to `getTabRequestId()` for clarity.
**Confidence:** Low—backend requirements may not exist, but worth confirming.

## 6) Derived-Value & State Invariants (table)

- Derived value: `currentVersion` in `DeploymentProvider`
  - Source dataset: `version` from `useVersionSSE`, which subscribes to `versionEvents` stream (filtered by context)
  - Write / cleanup triggered: On first version received, set `currentVersion`; on subsequent mismatches, set `isNewVersionAvailable = true`
  - Guards: Version changes only trigger update notification if connection is stable (not during reconnection flicker)
  - Invariant: Once `currentVersion` is set, it must not reset to `null` unless connection is permanently lost (not just transient errors)
  - Evidence: `plan.md:367-373`

- Derived value: `isSubscribed` in `useSSETask`
  - Source dataset: Boolean flag derived from subscription state (set by `subscribeToTask()`, cleared by `unsubscribe()`)
  - Write / cleanup triggered: Subscription registers listener on `taskEvents` stream; unsubscribe removes listener
  - Guards: `subscribeToTask()` must be idempotent (ignore if already subscribed to same task); auto-unsubscribe on task completion/failure
  - Invariant: `isSubscribed` must clear when task completes/fails to prevent stale listener
  - Evidence: `plan.md:375-382`

- Derived value: `currentRequestId` in worker global state
  - Source dataset: Generated via `makeUniqueToken(32)` on first connection attempt
  - Write / cleanup triggered: Set once during worker initialization; never reset unless worker terminates
  - Guards: All reconnections reuse the same `request_id`; backend must tolerate reconnections with same ID
  - Invariant: `request_id` remains stable across all tabs and all EventSource reconnections for the worker's lifetime
  - Evidence: `plan.md:384-392`

- Derived value: `isConnected` in `SseContextProvider`
  - Source dataset: `eventSource.readyState === EventSource.OPEN` (direct mode) or `message.type === 'connected'` (SharedWorker mode)
  - Write / cleanup triggered: Set `true` on connection open, `false` on error/close; cleanup on provider unmount disconnects EventSource or worker port
  - Guards: Rapid reconnections must debounce state updates to prevent flicker in UI
  - Invariant: If SharedWorker is `OPEN` but tab hasn't received `connected` message, `isConnected` remains `false` (conservative)
  - Evidence: `plan.md:394-401`

- Derived value: `__testEvent` metadata in `WorkerMessage`
  - Source dataset: Worker checks if any connected port has `isTestMode === true` via `portTestModeMap.get(port)`
  - Write / cleanup triggered: Metadata included in all broadcasts if any port is in test mode; removed when all test-mode ports disconnect
  - Guards: Non-test-mode tabs receive messages with `__testEvent` but ignore them; test-mode tabs forward to Playwright bridge
  - Invariant: Test events must not affect production behavior (dead-code elimination via `isTestMode()` guards)
  - Evidence: `plan.md:403-409`

> No filtered-view → persistent-write patterns detected. Task event filtering (by `task_id`) affects only local hook state, not cache writes. If cache invalidation is added (per Major finding above), must ensure invalidation keys are not derived from filtered task events for other tasks.

## 7) Risks & Mitigations (top 3)

- Risk: Task events may arrive before subscription listener is registered, causing missed events (e.g., `task_started`)
  - Mitigation: Subscribe to task events immediately after POST response (before awaiting other async work); document in section 5 that `subscribeToTask` must be synchronous call in same tick as response handling. Consider backend caching recent events per `task_id` for late joiners if latency is high.
  - Evidence: `plan.md:819-822`

- Risk: Playwright test infrastructure gaps block deterministic task event testing
  - Mitigation: Coordinate backend test endpoint (`POST /api/testing/tasks/trigger?task_id=X&event_type=Y`) before implementing slices 6-7 (test infrastructure + coverage). If backend unavailable, extend AI mock exception with inline suppression and issue tracker reference per `testing/no-route-mocks` rule.
  - Evidence: `plan.md:827-830` and findings in section 4 above

- Risk: Event stream pattern (Observable vs callback) undecided, affecting all consumer hooks
  - Mitigation: Specify concrete pattern in section 3 before implementing slice 2 (SSE context provider). Recommend callback-based registration returning cleanup function to avoid library dependencies and align with React patterns.
  - Evidence: `plan.md:193-203` and Major finding in section 5 above

## 8) Confidence

Confidence: High — The plan demonstrates deep understanding of existing SSE infrastructure, follows established patterns, and provides comprehensive coverage of implementation requirements. The migration strategy is sound with clear slices, test infrastructure is well-documented, and risks are identified. However, confidence is conditional on resolving the Major findings: (1) specify event stream pattern (Observable vs callback), (2) document React Query cache invalidation strategy, and (3) define backend test coordination approach. Once these are addressed, implementation can proceed with high confidence in success.
