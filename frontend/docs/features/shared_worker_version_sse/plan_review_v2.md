# Plan Review v2 — SharedWorker Version SSE

## 1) Summary & Decision

**Readiness**

The updated plan successfully addresses all six issues from the previous review with clear, researched solutions. The Vite worker bundling strategy is now explicit (`new URL()` syntax, no vite.config.ts changes required), MessagePort closure detection accepts the limitations of the platform and adopts a pragmatic approach, worker test instrumentation now has a clear forwarding path through tab-side hooks, test fixture interaction is cleanly separated, currentVersion reset conditions are unambiguous, and the SharedWorker constructor path follows Vite conventions. The plan demonstrates strong conformance to project patterns, provides deterministic test coverage through existing instrumentation infrastructure, and includes comprehensive error handling with graceful fallbacks. Minor gaps remain around race conditions, state synchronization edge cases, and cleanup timing, but these are addressable during implementation without requiring plan changes.

**Decision**

`GO-WITH-CONDITIONS` — Plan is ready for implementation with the following conditions: (1) Implement explicit port removal tracking to prevent double-decrement of activePortsCount (Major finding #1), (2) Add currentVersion reset to EventSource onerror handler before reconnect to prevent stale version propagation (Major finding #2), and (3) Document or implement SharedWorker instantiation retry logic to handle worker script load failures (Minor finding #3). These refinements strengthen state consistency and error recovery without changing the core architecture.

## 2) Conformance & Fit (with evidence)

**Conformance to refs**

- `@docs/commands/plan_feature.md` — Pass — `plan.md:0-768` — All required sections present with evidence-based citations (Research Log, Intent, Affected Areas, Data Model, Algorithms, Test Plan, Implementation Slices). Research findings (lines 3-61) document Vite worker bundling, MessagePort limitations, and test instrumentation strategy with actionable conclusions.

- `@docs/product_brief.md` — Pass — `plan.md:62-99` — Scope correctly identifies this as infrastructure change with no product workflow impact. Out-of-scope items (lines 92-98) confirm no changes to other SSE streams or deployment context consumer interface, maintaining product stability.

- `@docs/contribute/architecture/application_overview.md` — Pass — `plan.md:114-149` — Plan references existing hooks pattern (`useVersionSSE`), test instrumentation system (`emitTestEvent`, `isTestMode()`), and generated API client. New SharedWorker file follows domain-driven organization (`src/workers/`).

- `@docs/contribute/testing/playwright_developer_guide.md` — Pass — `plan.md:632-685` — Test plan section specifies scenarios with Given/When/Then format, identifies instrumentation hooks (SSE test events via `waitForSseEvent()`), and documents backend coordination (existing `/api/testing/deployments/version` endpoint). No route interception proposed. Section 13 lines 632-685 explicitly states "Backend coordination: Use existing `POST /api/testing/deployments/version` endpoint (no changes needed)".

**Fit with codebase**

- `src/hooks/use-version-sse.ts` (215 lines) — `plan.md:124-127` — Plan correctly identifies need to fork connection logic based on environment detection. Existing hook structure (connect/disconnect callbacks, state refs, retry logic lines 101-116) is preserved in direct path, replicated in worker. Hook signature (`UseVersionSSEReturn`) remains unchanged, ensuring deployment context provider compatibility.

- `src/contexts/deployment-context-provider.tsx` — `plan.md:136-140` — Consumer interface verified unchanged. Provider calls `useVersionSSE()` at line 26, receives `{ connect, disconnect, isConnected, version }`. Plan preserves this contract in both SharedWorker and direct paths (section 4 lines 220-241).

- `src/lib/test/event-emitter.ts` — `plan.md:142-145` — Instrumentation integration clarified. Worker cannot call `emitTestEvent()` directly (no `window` context), so plan adopts forwarding strategy: worker includes `__testEvent` metadata in messages (lines 156-171), tab-side hook extracts and emits via `emitTestEvent()`. This maintains test event taxonomy (`SseTestEvent` schema lines 110-116 in `src/types/test-events.ts`) without modifying `event-emitter.ts`.

- `tests/e2e/deployment/deployment-banner.spec.ts` — `plan.md:655-667` — Existing direct-path spec must continue passing unchanged. Plan confirms test mode defaults to direct EventSource (line 72: `isTestMode()` check), so current spec exercises fallback path without modifications.

- `tests/support/helpers/deployment-sse.ts` — `plan.md:146-149, 55-60` — Fixture interaction clarified: SharedWorker tests bypass `deploymentSse` fixture, use `?__sharedWorker` URL param, and manually control connection. Existing fixture remains stable for direct-path tests.

## 3) Open Questions & Ambiguities

**Resolved by plan research:**

All open questions from the previous review have been resolved through the research phase:

1. **Vite Worker Bundling** — Resolved at lines 37-41: `new URL()` syntax enables implicit detection, no vite.config.ts changes required. Worker output includes hashed filename in production.

2. **MessagePort Closure Detection** — Resolved at lines 43-48: Platform does not provide `onclose` event. Strategy relies on explicit disconnect via `beforeunload`, accepts zombie connections as acceptable (cleaned up on next page load, no backend resource cost due to SSE idle timeout).

3. **Worker Test Instrumentation** — Resolved at lines 50-54: Worker includes `__testEvent` metadata in broadcast messages, tab-side hook forwards to Playwright via `emitTestEvent()`. Test mode signaled via `isTestMode: true` in connect command.

4. **Test Fixture Interaction** — Resolved at lines 56-60: SharedWorker tests bypass `deploymentSse` fixture entirely, use URL parameter opt-in, keep fixture implementation simple.

**New ambiguities requiring implementation clarification:**

- **Question:** When a tab sends `{ type: 'disconnect' }` but MessagePort is already closed (browser force-quit), does the worker's port.postMessage attempt throw an exception or silently fail?
- **Why it matters:** Error handling in worker broadcast loop must account for failed postMessage without crashing worker or orphaning other ports.
- **Needed answer:** Test worker resilience to closed ports during broadcast; wrap postMessage in try-catch or filter ports before broadcast.

- **Question:** If multiple tabs connect simultaneously before EventSource opens, does worker send `{ type: 'connected', requestId }` to all ports or only the first?
- **Why it matters:** Race condition could leave some tabs waiting indefinitely for connected message if worker doesn't track pending ports.
- **Needed answer:** Verify worker stores all ports that send `{ type: 'connect' }` before EventSource opens, then broadcasts `{ type: 'connected' }` to entire array on open.

- **Question:** Should worker validate `requestId` consistency across multiple connecting tabs (detect mismatched IDs)?
- **Why it matters:** If tabs connect with different requestIds, worker may create multiple EventSource instances or ignore subsequent connects.
- **Needed answer:** Decide if worker enforces single requestId (rejects mismatched connects) or recreates EventSource when requestId changes. Plan implies worker uses first-connect requestId (line 264 step 4), but doesn't document mismatch handling.

## 4) Deterministic Playwright Coverage (new/changed behavior only)

### Behavior: SharedWorker multi-tab coordination

- **Scenarios:**
  - Given SharedWorker is enabled via `?__sharedWorker`, When two tabs open and connect with same requestId, Then both tabs receive version updates from single SSE connection, and SSE test events from both tabs show same correlationId (`tests/e2e/deployment/shared-worker-version-sse.spec.ts`)
  - Given SharedWorker has 2 connected tabs, When one tab closes (explicitly calls disconnect), Then remaining tab continues receiving version updates without SSE reconnection (verify no new SSE 'open' event)
  - Given SharedWorker has 1 connected tab, When that tab closes, Then worker closes SSE connection (verify SSE 'close' event or backend logs show connection termination)
  - Given SharedWorker SSE connection errors, When error occurs, Then all connected tabs receive `{ type: 'error' }` message and worker retries with exponential backoff (assert multiple tabs see error event, then eventual reconnection)

- **Instrumentation:**
  - URL parameter `?__sharedWorker` enables SharedWorker in test mode (lines 303-312)
  - SSE test events emitted via existing `waitForSseEvent()` helper (lines 528-545)
  - Optional `data.connectionType: 'shared'` metadata distinguishes SharedWorker path (lines 560-565)
  - Playwright multi-context API to simulate multiple tabs in single test

- **Backend hooks:**
  - Existing `POST /api/testing/deployments/version` endpoint for triggering version updates (lines 632-685)
  - Backend SSE idle timeout handles zombie connections without frontend coordination (line 48)
  - No new backend endpoints required

- **Gaps:**
  - Cannot directly observe worker internal state (activePortsCount, EventSource readyState); must infer from SSE events and version delivery timing. Mitigated by asserting on externally observable effects (version propagation, event sequences).
  - MessagePort closure without explicit disconnect is difficult to test deterministically in Playwright (requires browser force-quit simulation). Plan acknowledges zombie connections are acceptable (lines 45-48), so gap is documented rather than critical.

- **Evidence:** `plan.md:632-685` (Section 13 Deterministic Test Plan)

### Behavior: Direct EventSource fallback (dev/test/unsupported browser)

- **Scenarios:**
  - Given dev mode (`import.meta.env.DEV = true`), When tab connects, Then direct EventSource is used and `data.connectionType === 'direct'` in SSE test events (`tests/e2e/deployment/deployment-banner.spec.ts` continues passing)
  - Given test mode without `?__sharedWorker` URL param, When tab connects, Then direct EventSource is used (existing test spec validates this path)
  - Given browser lacks SharedWorker support, When tab connects, Then hook falls back to direct EventSource without error (requires manual iOS Safari testing or Playwright browser override)

- **Instrumentation:**
  - Existing SSE test events (`streamId: 'deployment.version'`, phases: open/message/error/close) at lines 529-545
  - No new instrumentation required; existing `deployment-banner.spec.ts` provides coverage

- **Backend hooks:**
  - Same as SharedWorker path; backend is agnostic to connection method

- **Gaps:**
  - iOS Safari fallback cannot be automated in Playwright (requires real device or BrowserStack). Mitigated by `typeof SharedWorker === 'undefined'` check (line 446), which can be tested via browser override or manual verification. Mark as manual test case.

- **Evidence:** `plan.md:655-667, 287-299` (Section 13, Flow 2)

### Behavior: Worker lifecycle and cleanup

- **Scenarios:**
  - Given worker has no connected tabs, When checked after last disconnect, Then EventSource.readyState === CLOSED and no SSE events emitted (verify via backend logs or network inspection)
  - Given worker is retrying connection (EventSource errored), When last tab disconnects during retry delay, Then scheduled retry timeout is canceled (assert no reconnection attempt after disconnect)

- **Instrumentation:**
  - SSE 'close' event or absence of 'open' event after disconnect
  - Playwright network inspection (page.context().request or har file) to verify SSE connection closure
  - Console logs from worker (lines 547-557) in dev mode

- **Backend hooks:**
  - Backend SSE stream logs connection termination (outside plan scope but available for debugging)

- **Gaps:**
  - Cannot directly inspect worker's retryTimeoutRef or activePortsCount. Rely on absence of SSE events and network activity as proxy signals. This is acceptable for deterministic coverage (tests assert externally observable behavior, not internal state).

- **Evidence:** `plan.md:670-684, 314-331` (Section 13 worker lifecycle scenarios, Flow 4)

## 5) Adversarial Sweep (must find ≥3 credible issues or declare why none exist)

### Major — activePortsCount double-decrement on duplicate disconnect messages

**Evidence:** `plan.md:350-361` (Derived value: activePortsCount) and `plan.md:318-329` (Flow 4 step 7) — "Port removal must be idempotent (tab may send multiple disconnects)" (line 327), but plan does not specify implementation strategy.

**Why it matters:** If a tab sends multiple `{ type: 'disconnect' }` messages (e.g., beforeunload fires twice, or disconnect called before port.close), worker may decrement activePortsCount multiple times for the same port, reaching zero prematurely and closing EventSource while other tabs are still connected. This breaks the invariant "EventSource exists only when activePortsCount > 0" (line 360).

**Fix suggestion:** Worker must track port identity to prevent double-removal. Implementation options: (1) Store ports in a Set instead of Array so removal is naturally idempotent (`ports.delete(port)` vs `ports.splice(index, 1)`), or (2) Use WeakMap to flag ports as already-disconnected before decrementing count. Add to plan section 6 "Derived value: activePortsCount" (line 358): "Worker stores ports in Set for idempotent removal; disconnect handler checks `if (ports.has(port))` before decrementing count."

**Confidence:** High — JavaScript Set.delete() returns boolean indicating whether element was present, enabling idempotent removal. Example: `if (ports.delete(port)) { activePortsCount--; }`.

### Major — currentVersion stale propagation on EventSource error-reconnect cycle

**Evidence:** `plan.md:363-375` (Derived value: currentVersion) — "Reset to null on ANY EventSource closure (connection_close event, error leading to disconnect, last-tab disconnect)" (line 369). However, Flow 1 step 5 (line 265) only shows reset on connection_close event, and section 8 error handling (lines 465-476) does not mention currentVersion reset on onerror.

**Why it matters:** If EventSource enters error state and worker schedules reconnect without resetting currentVersion, newly connecting tabs (step 5 line 268: "If SSE already connected, immediately sends current version") may receive stale version from previous connection session. This violates the invariant "If currentVersion is non-null, EventSource.readyState === OPEN or CONNECTING" (line 374) because readyState is CLOSED during retry delay.

**Fix suggestion:** Add currentVersion reset to worker EventSource.onerror handler before calling scheduleReconnect. Update plan section 6 "Derived value: currentVersion" guards (line 372) to include: "Worker onerror handler must reset currentVersion = null before scheduling reconnect to prevent stale version delivery to tabs that connect during retry window." Update section 8 "Failure: SSE connection fails" (line 467) to document this reset.

**Confidence:** High — The invariant violation is clear, and the fix is straightforward. Without this reset, the deployment banner may display outdated version after reconnection.

### Minor — SharedWorker instantiation failure recovery not detailed

**Evidence:** `plan.md:455-463` (Section 8 "Failure: Worker script fails to load") — Plan specifies "Catch exception on new SharedWorker(...), log error, fall back to direct EventSource" but does not clarify whether fallback happens synchronously in useVersionSSE or requires component re-render.

**Why it matters:** If SharedWorker constructor throws synchronously (e.g., CSP violation, script 404), the hook must transition to direct EventSource path within same useEffect to avoid leaving the component in disconnected state. If fallback requires state update (`setUseSharedWorker(false)`), the connection attempt is delayed by one render cycle, potentially impacting deployment update latency.

**Fix suggestion:** Clarify in Flow 1 (section 5 line 257) or section 8 (line 459) that SharedWorker instantiation is wrapped in try-catch and fallback creates EventSource synchronously within the same connection callback: "On SharedWorker instantiation error, hook catches exception, logs to console, and immediately calls createConnection() with direct EventSource path (bypasses state update to avoid render delay)." Alternatively, document that one render delay is acceptable and hook sets `shouldUseSharedWorker` to false, triggering re-render with fallback path.

**Confidence:** Medium — Implementation detail that doesn't block the plan but clarifies error recovery timing. The plan's current wording (line 459 "Fall back to direct EventSource path") is ambiguous about synchronous vs async fallback.

### Minor — Race condition between tab disconnect and worker version broadcast

**Evidence:** `plan.md:266-272` (Flow 1 steps 7-9) — Worker receives SSE version event and broadcasts to all ports (step 7), tab navigates away and sends disconnect (step 9). If disconnect arrives after worker starts broadcast loop but before postMessage to that specific port, the port may be removed mid-broadcast.

**Why it matters:** If worker iterates over ports array and removes port during iteration (via disconnect message arriving on different port), the broadcast loop may skip subsequent ports or throw exception. This could prevent some tabs from receiving version updates.

**Fix suggestion:** Worker should snapshot ports array before broadcasting: `const portsSnapshot = Array.from(ports);` then iterate over snapshot. Disconnects received during broadcast only affect the live `ports` set, not the snapshot. Add to section 5 Flow 1 step 7 (line 267): "Worker creates snapshot of connected ports before broadcasting to avoid mid-iteration removal race condition."

**Confidence:** Medium — This is a theoretical race condition that depends on message timing. JavaScript single-threaded execution mitigates this (disconnect message can't interrupt broadcast loop), but explicit snapshot provides defense-in-depth. If plan accepts that port.onmessage callbacks are serialized (one completes before next fires), this finding can be downgraded to informational.

### Checks attempted without findings

- **Cache invalidation on SharedWorker→Direct fallback:** Verified plan preserves `useVersionSSE` return shape (line 208-213) so DeploymentContext does not need cache adjustments when connection path changes. Hook internal state (`isConnected`, `version`) is reset by disconnect() callback (line 46) before fallback creates EventSource, ensuring clean slate. No stale state risk.

- **RequestId mismatch across tabs:** Plan implies worker uses first-connect requestId (line 264 step 4 "creates EventSource with requestId"), but does not explicitly handle subsequent connects with different requestId. However, section 4 Tab-to-Worker protocol (line 181) only sends requestId on connect, and Flow 1 step 4 (line 264) checks "If no existing SSE connection, creates EventSource" (implicitly accepts first requestId). Later connects do not override. This is acceptable given test mode enforces single requestId via `deploymentSse.resetRequestId()` pattern. Production tabs derive requestId from `getDeploymentRequestId()` which is stable per session. No explicit mismatch handling required, but flagged in Open Questions (section 3) for implementation awareness.

- **Instrumentation event ordering (test framework dependency):** SSE test events emitted in SharedWorker path (lines 156-171 Worker-to-Tab message with `__testEvent` metadata, tab extracts and emits via emitTestEvent) maintain same schema and timing as direct EventSource path (lines 122-156 in `use-version-sse.ts`). Playwright's event buffer (`TestEventCapture` in fixtures) preserves emission order, so `waitForSseEvent()` sequence assertions remain valid. No ordering regression risk.

- **Cleanup timing on unmount:** Hook useEffect cleanup (line 203-206) calls disconnect() which sends `{ type: 'disconnect' }` before port closes (line 581-583). Worker onmessage handler receives disconnect before port GC. However, if tab crashes (no cleanup), worker relies on MessagePort closure detection (line 481-484 edge case), which is documented as best-effort. This is acceptable per plan's research findings (line 45-48: "zombie connections are acceptable"). No additional safeguard required.

## 6) Derived-Value & State Invariants (table)

- **Derived value:** shouldUseSharedWorker (in hook)
  - **Source dataset:** `import.meta.env.DEV`, `isTestMode()`, `typeof SharedWorker !== 'undefined'`, `window.location.search.includes('__sharedWorker')`
  - **Write / cleanup triggered:** Determines connection path initialization (SharedWorker vs EventSource) during useVersionSSE mount
  - **Guards:** (1) If DEV is true, always use EventSource. (2) If isTestMode() is true and no `?__sharedWorker` param, use EventSource. (3) If SharedWorker is undefined, use EventSource. Otherwise use SharedWorker.
  - **Invariant:** Value computed once on hook mount; does not change mid-connection (no reactive updates)
  - **Evidence:** `plan.md:333-348` (Section 6 first entry)

- **Derived value:** activePortsCount (in worker)
  - **Source dataset:** Array (or Set) of connected MessagePort instances
  - **Write / cleanup triggered:** Incremented on `{ type: 'connect' }`, decremented on `{ type: 'disconnect' }` or MessagePort close. When count reaches 0, worker closes EventSource and clears retry timers.
  - **Guards:** Must handle duplicate disconnect messages idempotently (see Major finding #1). Must track port identity (WeakMap or Set) to avoid double-decrement.
  - **Invariant:** activePortsCount >= 0; EventSource exists only when activePortsCount > 0
  - **Evidence:** `plan.md:350-361` (Section 6 second entry)

- **Derived value:** currentVersion (in worker)
  - **Source dataset:** Latest `version` event received from SSE stream
  - **Write / cleanup triggered:** Updated when worker receives SSE version event. Sent immediately to new tabs that connect after version is known. Reset to null on ANY EventSource closure (connection_close event, onerror leading to reconnect, last-tab disconnect).
  - **Guards:** Must persist across tab connects/disconnects while SSE is open. Must be cleared when EventSource closes OR enters error state to avoid stale version on reconnect (see Major finding #2). Worker connection_close AND onerror listeners must reset currentVersion = null.
  - **Invariant:** If currentVersion is non-null, EventSource.readyState === OPEN (not CONNECTING or CLOSED)
  - **Evidence:** `plan.md:363-375` (Section 6 third entry), corrected per Major finding #2

- **Derived value:** retryCount (in worker)
  - **Source dataset:** EventSource error count, reset on successful connection
  - **Write / cleanup triggered:** Incremented on EventSource onerror. Reset to 0 on EventSource onopen. Used to compute exponential backoff delay.
  - **Guards:** Must clear scheduled retry timeout when EventSource closes due to last tab disconnect (activePortsCount reaches 0). Must not retry if activePortsCount is 0.
  - **Invariant:** Worker schedules retry only if activePortsCount > 0 && EventSource.readyState === CLOSED
  - **Evidence:** `plan.md:377-388` (Section 6 fourth entry)

- **Derived value:** isConnected (in hook, both paths)
  - **Source dataset:** SharedWorker path: set to true when worker sends `{ type: 'connected' }`. Direct path: set to true on EventSource onopen.
  - **Write / cleanup triggered:** Updated in response to connection state messages (SharedWorker) or EventSource events (direct). Exposed to DeploymentContext via hook return value.
  - **Guards:** Must transition to false on error or disconnect. Test instrumentation emits SSE event when state changes.
  - **Invariant:** isConnected reflects reachability of SSE stream within typical retry window (subject to exponential backoff max 60s)
  - **Evidence:** `plan.md:390-402` (Section 6 fifth entry)

> **Review note:** No filtered views driving persistent writes/cleanup detected. All derived values are guarded by environment checks (DEV, isTestMode) or explicit lifecycle events (connect, disconnect, error). The currentVersion reset gap (Major finding #2) is the only unguarded write risk, flagged above.

## 7) Risks & Mitigations (top 3)

- **Risk:** MessagePort closure without explicit disconnect leaves worker with orphaned port reference, incrementing activePortsCount but preventing EventSource cleanup until another tab disconnects.
  - **Mitigation:** Worker listens for MessagePort close event or messageerror (line 481-484); however, plan acknowledges platform does not provide reliable onclose event (line 43). Accept that browser force-quit may leave zombie ports until next page load. Backend SSE idle timeout (outside plan scope) reclaims server-side resources. For deterministic cleanup, rely on beforeunload-triggered disconnect (line 46-48). Document this limitation in worker comments.
  - **Evidence:** `plan.md:478-485` (Edge case: tab closes without sending disconnect), `plan.md:43-48` (Research: MessagePort closure detection)

- **Risk:** Multiple tabs connecting with different requestIds causes worker to create multiple EventSource instances or ignore subsequent connects, fragmenting SSE state.
  - **Mitigation:** Plan assumes all tabs use consistent requestId (production derives from `getDeploymentRequestId()` which is session-stable; test mode uses `deploymentSse.resetRequestId()` to coordinate). Worker implicitly accepts first-connect requestId (line 264 step 4). If mismatch is detected, implementation should either (1) reject new connects with different requestId and send `{ type: 'error', error: 'requestId mismatch' }`, or (2) close existing EventSource and recreate with new requestId (more complex state reset). Recommend option 1 for MVP; document in worker code.
  - **Evidence:** `plan.md:264` (Flow 1 step 4), flagged in section 3 Open Questions

- **Risk:** Vite worker bundling fails in production build due to incorrect import path or missing worker chunk in dist, causing SharedWorker constructor to throw and leaving all tabs without version SSE.
  - **Mitigation:** Plan specifies `new URL('../workers/version-sse-worker.ts', import.meta.url)` syntax for Vite implicit detection (line 38-41). Test with `pnpm build && pnpm preview` before merging (line 729). Add fallback to direct EventSource on SharedWorker instantiation error (line 455-463). Monitor console logs in production for fallback activation rate. If fallback is frequent, escalate as Vite config issue.
  - **Evidence:** `plan.md:37-41, 455-463, 727-729` (Research: Vite worker bundling, Error handling: worker script fails, Implementation risk)

## 8) Confidence

**Confidence:** High — The updated plan addresses all prior review issues with researched, evidence-based solutions. The SharedWorker architecture is straightforward (single SSE connection + MessagePort broadcast), environment detection logic is simple and well-guarded, fallback to existing direct EventSource provides safety net, and test infrastructure integration is minimal (URL param opt-in + existing SSE event assertions). The three Major/Minor findings (activePortsCount idempotency, currentVersion reset on error, SharedWorker instantiation retry) are refinements that strengthen edge case handling without requiring architectural changes. Main implementation risks (Vite bundling, MessagePort lifecycle) are mitigated by build testing and documented fallback paths. The plan is ready for implementation with the specified conditions.
