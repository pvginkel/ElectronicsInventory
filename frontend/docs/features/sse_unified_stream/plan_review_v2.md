# SSE Unified Stream Plan Review (v2)

## 1) Summary & Decision

**Readiness**

The updated plan successfully addresses all issues identified in the previous review. The callback-based event registration pattern (section 3, lines 199-207) removes the Observable dependency concern. React Query cache invalidation is now explicitly documented with consumer-driven strategy (section 7, lines 453-460). Backend test coordination is comprehensively specified with both primary and interim strategies (section 15, lines 861-866). iOS fallback performance monitoring adds telemetry safeguards (section 9, lines 579-587). The useVersionSSE API breaking changes are clearly flagged with deployment provider migration steps (section 4, lines 267-273). The request ID persistence question is enhanced with backend verification guidance (section 15, lines 868-871). DeploymentProvider now appears in the file map (section 2, lines 129-132). The plan demonstrates strong technical rigor with comprehensive evidence trails, detailed edge case handling, and deterministic test scenarios grounded in real backend coordination.

**Decision**

`GO` — All blocking issues resolved. The plan is implementation-ready with clear slicing, comprehensive test coverage strategy, and well-documented risks. The callback-based registration pattern aligns with React conventions and avoids external dependencies. Backend coordination strategy provides both ideal path (test endpoint) and pragmatic fallback (documented mock exception). Cache invalidation properly delegates responsibility to consumer hooks while providing clear guidance. Minor refinements during implementation are expected but no design gaps remain.

---

## 2) Conformance & Fit (with evidence)

**Conformance to refs**

- `docs/commands/plan_feature.md` — Pass — `plan.md:40-93` provides comprehensive research log documenting discovered patterns, conflicts resolved, and iOS fallback strategy; `plan.md:165-222` follows data model template with shapes, mappings, and evidence citations
- `docs/contribute/testing/playwright_developer_guide.md` — Pass — `plan.md:669-751` defines deterministic scenarios with instrumentation hooks and backend coordination; `plan.md:861-866` proposes backend test endpoint (`POST /api/testing/sse/task-event`) following real-backend-first policy with sanctioned mock fallback
- `docs/contribute/architecture/application_overview.md` — Pass — `plan.md:115-131` places new SSE context in established contexts/ folder following pattern from deployment-context-provider.tsx; `plan.md:782-791` preserves camelCase domain model exposure in hook refactor
- `docs/features/sse_unified_stream/change_brief.md` — Pass — `plan.md:49-58` quotes backend contract verbatim (unified endpoint, task_id filtering, stream_url removal); `plan.md:97-99` confirms worker generates request_id matching backend's unified stream design

**Fit with codebase**

- `src/workers/version-sse-worker.ts` — `plan.md:97-99` — Extends existing worker pattern (connection pooling, retry logic, test instrumentation) to handle task_event in addition to version events; reuses proven broadcast and cleanup patterns
- `src/hooks/use-version-sse.ts` — `plan.md:117-120` — Refactor removes connection management while preserving public API surface (isConnected, version state); delegation to context provider follows separation of concerns
- `src/contexts/deployment-context-provider.tsx` — `plan.md:129-132` — Breaking change documented: removes connect()/disconnect() calls (lines 52, 97) and relies on SseContextProvider auto-connect; maintains version change detection logic
- `src/hooks/use-sse-task.ts` — `plan.md:121-124` — API transformation from connection-based to subscription-based aligns with unified stream model; maintains callback pattern for backward compatibility with AI analysis consumers
- `src/types/test-events.ts` — `plan.md:135-137` — No changes required; existing SseTestEvent.streamId field supports both 'deployment.version' and 'task' without schema modification

---

## 3) Open Questions & Ambiguities

**Question 1: Backend test endpoint availability timeline**
- Question: When will the backend implement `POST /api/testing/sse/task-event` for deterministic task event injection?
- Why it matters: Plan proposes primary strategy (real backend endpoint) with interim fallback (AI mock exception). Implementation timeline determines which approach to use in Slice 6 (Test Infrastructure). If endpoint is unavailable at implementation time, specs will temporarily rely on AI analysis mock with inline ESLint suppression, creating technical debt.
- Needed answer: Backend team commitment to deliver test endpoint before or concurrently with Slice 6, OR explicit approval to proceed with interim mock strategy documented via `// eslint-disable-next-line testing/no-route-mocks -- Backend lacks test trigger for task events; tracked in issue #XYZ`

**Question 2: Request ID persistence scope**
- Question: Does backend use request_id for long-lived analytics or session correlation that requires persistence across worker restarts?
- Why it matters: Plan generates fresh request_id per worker lifetime (section 6, lines 391-396). If backend correlates multi-session user behavior via request_id, worker restarts (browser memory pressure, manual worker termination) will break analytics continuity. Section 15 (lines 868-871) raises this but lacks definitive answer.
- Needed answer: Backend team clarification on request_id usage: (1) per-connection identifier only → current design sufficient, or (2) long-lived session key → persist to sessionStorage with worker-scoped key

**Question 3: Task event late-subscription handling**
- Question: What happens when `subscribeToTask(taskId)` is called after backend has already emitted initial task events (e.g., `task_started`)?
- Why it matters: Plan acknowledges risk (section 15, lines 844-847) but mitigation relies on immediate subscription after POST response. Network latency or slow JS execution could still cause first event to arrive before subscription listener is registered. Backend may need to cache recent events per task_id for late joiners, or frontend needs timeout/retry logic.
- Needed answer: Backend confirmation whether recent events are cached per task_id (and for how long), OR frontend requirement to implement subscription timeout with user-facing error (e.g., "Task started but missed progress updates")

All three questions can be answered through backend team coordination before implementation begins (ideally during Slice 1 planning). If answers are unavailable, proceed with interim strategies documented in plan (mock fallback, fresh request_id, immediate subscription) and treat gaps as known technical debt for future refinement.

---

## 4) Deterministic Playwright Coverage (new/changed behavior only)

**Behavior: Unified Worker Connection Management**
- Scenarios:
  - Given worker not running, When first tab connects, Then worker generates request_id and opens EventSource to `/api/sse/stream?request_id=X` (`tests/e2e/deployment/unified-worker-connection.spec.ts`)
  - Given worker connected with version event received, When task_event arrives, Then both events broadcast to all tabs without filtering (`tests/e2e/sse/unified-stream-broadcast.spec.ts`)
  - Given worker connected with one tab, When last tab disconnects, Then worker closes EventSource and cleans up retry state (`tests/e2e/sse/worker-cleanup.spec.ts`)
- Instrumentation: Worker emits `__testEvent` metadata in messages (section 3, lines 222-223); Playwright checks `window.__sseConnections` via test bridge or backend logs for endpoint verification
- Backend hooks: Backend test endpoint `POST /api/testing/sse/task-event` to inject task events deterministically; interim fallback to AI analysis mock with `// eslint-disable-next-line testing/no-route-mocks` suppression
- Gaps: Backend test endpoint availability (see Open Question 1); if unavailable, specs temporarily rely on AI mock with inline justification
- Evidence: `plan.md:669-681` defines scenarios; `plan.md:861-866` specifies backend coordination strategy

**Behavior: SSE Context Provider Event Streams**
- Scenarios:
  - Given provider mounted in SharedWorker mode, When worker broadcasts version event, Then `registerVersionListener` callback fires and `isConnected` updates (`tests/e2e/sse/context-provider-version.spec.ts`)
  - Given provider mounted in direct mode (iOS), When EventSource opens, Then `isConnected` becomes true and task events route through `registerTaskListener` callbacks (`tests/e2e/sse/ios-fallback.spec.ts`)
  - Given provider mounted with connection error, Then `isConnected` becomes false and worker retries with exponential backoff (`tests/e2e/sse/context-error-retry.spec.ts`)
- Instrumentation: Provider forwards `__testEvent` from worker messages; test bridge `window.__sseControls` for status checks (pattern from `window.__deploymentSseControls`)
- Backend hooks: Real backend SSE stream for version events (existing); task event injection via test endpoint or AI mock
- Gaps: Test bridge design TBD (may reuse deployment bridge or introduce separate `__sseControls`)
- Evidence: `plan.md:683-693` defines scenarios; `plan.md:103-106` specifies context provider creation

**Behavior: Task Subscription Filtering**
- Scenarios:
  - Given hook subscribed to task A, When task_event with matching task_id arrives, Then progress/result/error state updates and callbacks fire (`tests/e2e/parts/task-subscription-match.spec.ts`)
  - Given hook subscribed to task A, When task_event with different task_id arrives, Then no state change (event filtered out) (`tests/e2e/parts/task-subscription-filter.spec.ts`)
  - Given task completed, When `task_completed` event arrives, Then result set, `onResult` callback invoked, `isSubscribed` becomes false (auto-unsubscribe) (`tests/e2e/parts/task-completion-cleanup.spec.ts`)
- Instrumentation: `useSSETask` emits `SseTestEvent` with `streamId: 'task'` for each processed event (section 9, lines 542-549); Playwright waits via `waitTestEvent(page, 'sse', { streamId: 'task' })`
- Backend hooks: Backend injects task events for specific task_id via `POST /api/testing/sse/task-event` with body `{ task_id, event_type, data }`
- Gaps: Backend endpoint required; interim uses AI mock (section 15, lines 863-866)
- Evidence: `plan.md:706-718` defines scenarios; `plan.md:121-124` specifies subscription API

**Behavior: AI Analysis Integration**
- Scenarios:
  - Given hook initialized, When `analyzePartFromData` called, Then POST to `/api/ai-parts/analyze` and `subscribeToTask(task_id)` (`tests/e2e/parts/ai-analysis-subscription.spec.ts`)
  - Given task response missing `task_id`, Then error thrown and analysis blocked (`tests/e2e/parts/ai-analysis-missing-task-id.spec.ts`)
  - Given subscribed to analysis task, When task_completed arrives, Then result transformed and `onSuccess` callback invoked (`tests/e2e/parts/ai-analysis-success.spec.ts`)
- Instrumentation: Hook emits component errors via `emitComponentError`; SSE events with `streamId: 'task'`
- Backend hooks: Real AI analysis endpoint returns `{ task_id }` (without `stream_url`); task events via test endpoint or AI mock
- Gaps: Existing AI specs use SSE mocks; update to verify new subscription flow with real backend preferred
- Evidence: `plan.md:720-730` defines scenarios; `plan.md:125-127` specifies hook changes

**Behavior: Version SSE Backward Compatibility**
- Scenarios:
  - Given existing spec waiting for `SseTestEvent` with `streamId: 'deployment.version'`, When version event emitted via unified worker, Then test passes (no regression) (`tests/e2e/deployment/version-sse-backward-compat.spec.ts`)
  - Given deployment context consuming `useVersionSSE`, When new version received via unified stream, Then `isNewVersionAvailable` triggers (`tests/e2e/deployment/version-update-detection.spec.ts`)
- Instrumentation: No changes to `SseTestEvent` type or `waitTestEvent` helper; streamId filtering unchanged
- Backend hooks: Existing backend version event delivery via unified `/api/sse/stream` endpoint
- Gaps: None—instrumentation backward-compatible by design
- Evidence: `plan.md:743-751` defines scenarios; `plan.md:135-137` confirms no type changes

---

## 5) Adversarial Sweep (must find ≥3 credible issues or declare why none exist)

**Minor — Task Event Race: Subscription Registration After First Event Delivery**

**Evidence:** `plan.md:336-349` (Task Subscription Lifecycle) and `plan.md:844-847` (Risk: Task events may arrive before subscription setup)

**Why it matters:** The subscription flow is: (1) POST `/api/ai-parts/analyze` → (2) Extract `task_id` from response → (3) Call `subscribeToTask(taskId)` → (4) Register listener on `taskEvents` stream. If backend broadcasts `task_started` event immediately upon task creation, the event may arrive at the tab before step (4) completes. The listener misses the first event, causing incomplete progress tracking. User sees no initial progress indication, potentially assuming UI is frozen.

**Fix suggestion:** Add buffering to `SseContextProvider`: maintain small circular buffer (last 5-10 events per task_id, 5-second TTL) for task events. When `useSSETask.subscribeToTask(taskId)` is called, immediately replay buffered events matching taskId before registering live listener. This ensures late subscriptions receive missed events without backend changes. Alternatively, backend could cache recent events per task_id, but frontend buffering is simpler and doesn't require backend coordination. If neither buffering is implemented, document known limitation: "First task event may be missed if subscription setup is slow; user sees progress from second event onward."

**Confidence:** High — Race condition is real and reproducible under slow network or heavy JS load. Buffering solution is proven pattern (see RxJS ReplaySubject) and avoids backend dependency.

---

**Minor — Cache Invalidation Guidance Lacks Specificity**

**Evidence:** `plan.md:453-460` (Task Completion Cache Invalidation) states "caller (e.g., use-ai-part-analysis) decides whether to invalidate React Query cache" but provides no concrete queryKey examples or decision criteria.

**Why it matters:** Developers implementing consumer hooks may forget to invalidate or invalidate wrong keys, causing stale data bugs. For example, AI analysis creates part suggestions—should it invalidate `['parts', 'list']`, `['parts', partId]`, or both? Plan leaves this ambiguous. Without clear guidance, different features will implement inconsistent invalidation strategies, creating unpredictable cache behavior.

**Fix suggestion:** Add table to section 7 mapping task completion scenarios to cache invalidation actions:
```
| Task Type       | Mutates Backend State? | QueryKeys to Invalidate                          |
|-----------------|------------------------|--------------------------------------------------|
| AI Part Analysis| Yes (creates suggestions) | `['parts', partId, 'suggestions']`, `['parts', 'list']` if suggestion affects list view |
| Future Task X   | No                     | None (read-only task)                            |
```
Reference this table in `use-ai-part-analysis.ts` implementation notes (section 2). Update existing `use-ai-part-analysis.ts:56-60` evidence citation to show explicit `queryClient.invalidateQueries()` call in `onSuccess` handler. If table is complex, defer to separate "Cache Invalidation Patterns" doc in `docs/contribute/state/`.

**Confidence:** Medium — Impact depends on developer discipline. High-risk features (AI analysis, bulk updates) could ship with stale cache bugs. Low-risk if code review catches missing invalidations, but plan should prevent issue proactively.

---

**Minor — iOS Fallback Overhead Monitoring Lacks Actionable Threshold**

**Evidence:** `plan.md:579-587` (iOS Fallback Performance Monitoring) proposes console logs if ">10 events/sec sustained" but doesn't define "sustained" duration or actionable response.

**Why it matters:** Without clear threshold definition, monitoring is unactionable noise. "10 events/sec for 1 second" is acceptable burst (task progress updates). "10 events/sec for 60 seconds" suggests runaway event loop or backend issue requiring throttling. Plan says "consider iOS-specific throttling or connection pooling as future optimization" but lacks trigger criteria for escalation (log warning? alert? automatic throttle?). Developers won't know when to act on monitoring data.

**Fix suggestion:** Refine monitoring spec (section 9, lines 579-587):
- Define "sustained": ≥10 events/sec averaged over 10-second rolling window
- Actionable thresholds:
  - Warn (console.warn): 5-10 events/sec sustained for >30 seconds (unusual but tolerable)
  - Error (console.error + test event): >10 events/sec sustained for >60 seconds (investigate backend or implement throttling)
- Automated response: After 60-second threshold, client-side throttle to max 5 events/sec per tab (drop intermediate progress updates, preserve completion events)
- Add Playwright spec: `tests/e2e/sse/ios-fallback-throttle.spec.ts` verifies throttle engages under simulated high-frequency backend events

If threshold tuning requires production data, ship initial monitoring without throttle, collect telemetry for 2 weeks, then refine thresholds in follow-up PR.

**Confidence:** Medium — iOS tab suspension typically prevents sustained high event rates, so issue may be theoretical. However, monitoring without actionable thresholds adds dead code. Low cost to refine now vs debugging production issues later.

---

**Proof of Rigor (Additional Checks Attempted)**

The following invariants were verified and hold:
- **Derived state guards:** Section 6 (lines 369-414) documents 5 derived values with explicit invariants, guards, and cleanup strategies. Version persistence (lines 373-378) guards against reset during reconnection flicker. Worker request_id stability (lines 391-396) enforces single-generation-per-lifetime. Test event metadata (lines 407-414) isolates test-mode impact via dead-code elimination. No filtered-view-drives-persistent-write violations found.
- **Async coordination safeguards:** Section 7 (lines 419-460) specifies worker-tab synchronization (port validation, broadcast try/catch), task event filtering (currentTaskId ref guards stale events), and reconnection stability (exponential backoff caps, retry cancellation). Each coordination layer cites evidence from existing worker or hook patterns.
- **Error edge cases:** Section 8 (lines 463-527) enumerates 9 edge cases with handling, guardrails, and evidence. Missing `task_id` in response (lines 513-519) blocks analysis with clear error. iOS Safari fallback (lines 497-504) degrades gracefully with acceptable overhead. Worker termination (lines 473-479) auto-recovers via tab fallback.
- **Instrumentation completeness:** Section 9 (lines 531-587) defines 6 instrumentation signals including version SSE events (streamId: 'deployment.version'), task SSE events (streamId: 'task'), connection state telemetry (data-state attributes), worker lifecycle logs, and test bridge registration. Each signal maps to Playwright consumer with evidence from existing patterns.

The plan demonstrates comprehensive coverage of state invariants, async coordination, error handling, and instrumentation. The three issues identified above (task event race, cache invalidation specificity, iOS threshold ambiguity) are refinements rather than fundamental gaps. All are addressable during implementation without blocking approval.

---

## 6) Derived-Value & State Invariants (table)

**Derived value: currentVersion (DeploymentProvider)**
- Source dataset: `version` from `useVersionSSE`, which subscribes to `versionEvents` stream from `SseContextProvider` (unfiltered—all version events)
- Write / cleanup triggered: On first version received, set `currentVersion` (lines 76-79); on subsequent mismatch, set `isNewVersionAvailable = true` (lines 80-83); no cleanup (persists until app unmount)
- Guards: Version change only triggers update notification if `currentVersion !== null` (lines 80-83), preventing false positives during initial connection
- Invariant: Once `currentVersion` is set, it must not reset to `null` unless connection is permanently lost (not transient errors). Reconnection preserves `currentVersion` state.
- Evidence: `plan.md:373-378` and `src/contexts/deployment-context-provider.tsx:74-85`

**Derived value: isSubscribed (useSSETask)**
- Source dataset: Boolean flag derived from subscription lifecycle (set by `subscribeToTask(taskId)`, cleared by `unsubscribe()` or auto-unsubscribe on task completion/failure)
- Write / cleanup triggered: Subscription registers listener on `taskEvents` stream from context (lines 610-614); unsubscribe removes listener and clears state
- Guards: `subscribeToTask()` must be idempotent—ignore if already subscribed to same task (lines 433, 385-387); concurrent subscriptions to different tasks allowed; auto-unsubscribe on `task_completed` or `task_failed` (lines 345-346)
- Invariant: `isSubscribed` must clear when task completes/fails (auto-cleanup). Listener must be removed before state cleanup to prevent race between new subscription and stale events.
- Evidence: `plan.md:381-387` and `plan.md:429-434`

**Derived value: currentRequestId (Worker Global State)**
- Source dataset: Generated via `makeUniqueToken(32)` on first connection attempt (lines 309-310); persisted for worker lifetime
- Write / cleanup triggered: Set once during worker initialization; never reset unless worker terminates (lines 392-393); all reconnections reuse same ID (lines 394-395)
- Guards: Backend must tolerate reconnections with same request_id (section 15, lines 842-843); worker validates ports before broadcast (section 7, lines 423-425)
- Invariant: `request_id` remains stable across all tabs and all EventSource reconnections for worker's lifetime. Changing request_id mid-lifecycle would orphan backend correlation data.
- Evidence: `plan.md:391-396` and `plan.md:309-310`

**Derived value: isConnected (SseContextProvider)**
- Source dataset: `eventSource.readyState === EventSource.OPEN` (direct mode) or `message.type === 'connected'` (SharedWorker mode) (lines 400-402)
- Write / cleanup triggered: Set `true` on connection open, `false` on error/close (lines 402); cleanup on provider unmount disconnects EventSource or worker port (lines 402)
- Guards: Rapid reconnections must debounce state updates to prevent UI flicker (lines 403); if SharedWorker is `OPEN` but tab hasn't received `connected` message, `isConnected` remains `false` (conservative approach, line 404)
- Invariant: If worker connection is `OPEN` but no `connected` broadcast received, conservatively report `isConnected = false` to prevent consumers from acting on stale state. Only transition to `true` after explicit `connected` message.
- Evidence: `plan.md:399-405` and `src/hooks/use-version-sse.ts:177-179` (pattern), `src/workers/version-sse-worker.ts:149-168` (worker broadcast)

**Derived value: __testEvent Metadata (WorkerMessage)**
- Source dataset: Worker checks if any connected port has `isTestMode === true` via `portTestModeMap.get(port)` (lines 410-411)
- Write / cleanup triggered: Metadata included in all broadcasts if any port is in test mode (lines 411-412); removed when all test-mode ports disconnect (lines 412)
- Guards: Non-test-mode tabs receive messages with `__testEvent` but ignore them (lines 413); test-mode tabs forward to Playwright bridge (lines 413); production builds dead-code eliminate instrumentation (lines 414)
- Invariant: Test events must not affect production behavior. Metadata transmission to non-test tabs is acceptable overhead (few hundred bytes per event) but must not trigger side effects. Production bundle removes instrumentation via tree-shaking.
- Evidence: `plan.md:407-414` and `src/workers/version-sse-worker.ts:159-165` (test mode check), `src/hooks/use-version-sse.ts:281-283` (consumer forwarding)

**Additional Derived Value: taskEvents Stream Filter State (useSSETask)**
- Source dataset: `taskEvents` stream from `SseContextProvider` (all task events broadcast to all tabs); filtered by `event.taskId === currentTaskId` in hook listener (lines 342-343)
- Write / cleanup triggered: Each matching event updates `progress`, `result`, or `error` state and invokes callbacks (`onProgress`, `onResult`, `onError`) (lines 343-345); unsubscribe removes listener before state cleanup (line 433)
- Guards: `currentTaskId` ref ensures filter stability across re-renders (line 431); listener validates `event.taskId` before processing (line 342); events for other tasks are silently ignored (no error, no state change)
- Invariant: Filtering is client-side and must not affect other tabs or subscriptions. Multiple concurrent subscriptions in same tab each maintain independent filters and state. Unsubscribe must occur before new subscription to prevent cross-contamination of events.
- Evidence: `plan.md:429-434` (Task Event Filtering coordination) and `plan.md:336-349` (Task Subscription Lifecycle flow)

**Review Note on Filtering Risk:** All derived values use unfiltered or self-filtered sources (version stream, task stream with client-side taskId filter). No filtered view drives persistent writes without guards. The taskEvents filter (client-side `taskId` check) drives local state updates (`progress`, `result`, `error`) but these are ephemeral hook state, not cache mutations or persistent storage. Cache invalidation (section 7, lines 453-460) is delegated to consumer hook (`use-ai-part-analysis`) after `onResult` callback, keeping filter logic isolated from writes. No Major findings warranted.

---

## 7) Risks & Mitigations (top 3)

**Risk: Task event timing—late subscription misses early events**
- Description: `subscribeToTask(taskId)` registers listener after POST response returns `task_id`. Backend may broadcast `task_started` event immediately upon task creation. Network latency or slow JS execution could cause first event to arrive at tab before listener is registered. User sees incomplete progress (missing initial status message).
- Mitigation: (1) Subscribe immediately after extracting `task_id` from POST response, before any other async work. (2) Request backend to cache recent events per `task_id` (e.g., last 5 events, 10-second TTL) and replay to new connections. (3) If backend caching unavailable, implement client-side event buffer in `SseContextProvider` (circular buffer of last 10 events per task_id, 5-second TTL) and replay on subscription. (4) Document known limitation if no buffering: "First task event may be missed under slow network; user sees progress from second event onward."
- Evidence: `plan.md:844-847` (Risk section) and `plan.md:336-349` (Task Subscription Lifecycle); also identified in Adversarial Sweep as Minor issue

**Risk: Worker request ID generation conflicts with backend expectations**
- Description: Plan shifts request_id generation from tabs to worker (section 6, lines 391-396). Backend unified endpoint (`/api/sse/stream?request_id=X`) may have format or lifecycle expectations based on old tab-generated IDs. If backend expects tab-scoped IDs (e.g., per-tab session tracking) or validates ID format (length, prefix), worker-generated IDs could be rejected or misinterpreted, breaking connection or analytics correlation.
- Mitigation: (1) Reuse existing `makeUniqueToken(32)` from `src/lib/utils/random.ts` to ensure format consistency with current implementation (section 15, lines 842-843). (2) Coordinate with backend team during Slice 1 to verify unified endpoint tolerates worker-generated IDs and persists request_id across reconnections (same ID reused for worker lifetime). (3) Test scenario: Open 3 tabs, verify all receive same `requestId` in `connected` messages, confirm backend logs show single request_id for all connections from same worker. (4) If backend requires tab-scoped IDs, pivot to hybrid model: worker generates base ID, tabs append unique suffix (e.g., `{workerId}-{tabIndex}`).
- Evidence: `plan.md:842-843` (Risk section), `plan.md:391-396` (Worker Request ID invariant), `plan.md:868-871` (Open Question about persistence)

**Risk: Playwright test infrastructure gaps block deterministic task event testing**
- Description: Plan relies on backend test endpoint (`POST /api/testing/sse/task-event`) to inject task events deterministically (section 13, lines 680, 716). If backend team cannot deliver endpoint concurrently with frontend Slice 6 (Test Infrastructure), Playwright specs will fall back to AI analysis mocks (sanctioned exception per `testing/no-route-mocks` policy). Mocks are limited—can't test arbitrary task_id filtering, multi-task scenarios, or error handling beyond AI-specific flows. Test coverage remains incomplete until real backend endpoint available, creating risk of undetected bugs in production.
- Mitigation: (1) Coordinate backend test endpoint delivery during Slice 1 planning; set as hard dependency for Slice 6. (2) If endpoint unavailable, proceed with interim strategy: extend AI analysis mock with inline ESLint suppression `// eslint-disable-next-line testing/no-route-mocks -- Backend lacks test trigger for task events; tracked in issue #XYZ` (section 15, lines 863-866). Document limitation in mock helper file and create backend tracking issue. (3) Implement subset of specs using AI mock (happy path, single task subscription) and defer multi-task, error-injection specs until backend endpoint available. (4) Add follow-up task to migrate mock-based specs to real endpoint once available, ensuring full coverage post-migration.
- Evidence: `plan.md:853-855` (Risk section), `plan.md:861-866` (Open Question and proposed solution), `plan.md:680, 716` (test scenarios requiring backend hooks)

---

## 8) Confidence

Confidence: High — The updated plan successfully addresses all blockers from the previous review and demonstrates implementation readiness. The callback-based event registration pattern (v2 update) aligns with React conventions and eliminates external dependencies. Backend test coordination strategy balances ideal (real endpoint) and pragmatic (documented mock fallback) paths. Cache invalidation guidance, while slightly underspecified (see Adversarial Sweep), delegates responsibility appropriately to consumer hooks and can be refined during code review. iOS fallback monitoring (v2 addition) provides telemetry foundation even if thresholds need tuning post-deployment. The plan's comprehensive evidence trails (100+ citations to existing code), detailed invariants (6 derived values with guards and cleanup), deterministic test scenarios (25+ Given/When/Then), and explicit risk mitigations reflect thorough domain understanding. Slicing strategy (7 sequential slices with clear dependencies) enables incremental validation. Main uncertainties (task event timing race, request_id backend compatibility, test endpoint availability) are acknowledged as Open Questions with concrete mitigation steps. No fundamental design gaps remain—minor refinements during implementation are expected and healthy.
