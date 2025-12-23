# Plan Review: Shared Worker Version SSE

## 1) Summary & Decision

**Readiness**

The plan is comprehensive, well-researched, and demonstrates strong understanding of both the SharedWorker API and the project's testing infrastructure. It correctly identifies the environment detection strategy, properly documents message protocols, and maintains backward compatibility with existing test infrastructure. The plan includes detailed lifecycle management, error handling, and instrumentation parity between direct and SharedWorker paths. The adversarial thinking is evident in edge case coverage (port closure, simultaneous connects, retry coordination). However, several critical gaps exist around worker test instrumentation visibility, Vite worker bundling configuration ambiguity, and MessagePort lifecycle detection that could block implementation or result in zombie connections.

**Decision**

`GO-WITH-CONDITIONS` — The plan is implementation-ready with strong fundamentals, but must address: (1) explicit Vite worker configuration strategy, (2) MessagePort closure detection mechanism specification, (3) worker-side test event emission strategy for deterministic test coverage, and (4) clarification of the test mode interaction between URL parameter override and the existing `deploymentSse` fixture. These are not blockers for starting implementation but must be resolved during Slice 1-2 to prevent rework.

## 2) Conformance & Fit (with evidence)

**Conformance to refs**

- `docs/commands/plan_feature.md` — Pass — `plan.md:0-733` — Plan follows the required template structure with all 16 sections populated, includes research log (lines 3-35), provides file:line evidence throughout, and uses the prescribed templates for derived values, flows, and test plans.

- `docs/contribute/architecture/application_overview.md` — Pass — `plan.md:99-109` — Plan correctly references the custom hooks pattern (line 100: "Add environment detection and fork between direct EventSource and SharedWorker connection"), aligns with domain-driven folder structure by creating `src/workers/` (line 89-91), and maintains separation between hook logic and worker implementation.

- `docs/contribute/testing/playwright_developer_guide.md` — Partial Fail — `plan.md:599-650` — Test plan correctly uses `waitForSseEvent()` helper (line 608) and references `deploymentSse` fixture (line 617), but does NOT address how worker-internal instrumentation will emit test events when the worker runs in a separate execution context from the main page. The plan assumes `emitTestEvent()` will work from the worker without justification (lines 675-677: "emit events in SharedWorker message handlers"). The Playwright developer guide requires deterministic waits (lines 129-154), but worker console logs (lines 512-522) are not accessible to Playwright's console monitoring fixture.

- `docs/contribute/testing/index.md` — Pass — `plan.md:78-83` — Plan explicitly preserves the "real backend always" principle (line 78: "Existing test infrastructure continues working unchanged in test/dev mode") and maintains dirty database compatibility by not adding cleanup requirements.

- `CLAUDE.md` (via AGENTS.md reference) — Pass — `plan.md:392-405` — Instrumentation section documents SSE test events with the prescribed `streamId: 'deployment.version'` (line 396), specifies phases matching existing taxonomy (line 396-401), and references the Playwright `waitForSseEvent()` consumer (line 402).

**Fit with codebase**

- `src/hooks/use-version-sse.ts` — Pass — `plan.md:222-250` — Flow 1 correctly mirrors the existing hook's retry logic (line 348: "same formula as `src/hooks/use-version-sse.ts:109`"), preserves the `UseVersionSSEReturn` interface (lines 20-25 in hook), and maintains identical state transitions for the direct path (lines 252-265).

- `src/lib/test/event-emitter.ts` — Concern — `plan.md:117-119` — Plan states this file will be "Used to emit SSE test events from both worker and direct paths" but does not explain HOW `emitTestEvent()` will function inside the SharedWorker context. The existing `emitTestEvent()` (lines 22-50 in `event-emitter.ts`) calls `window.__playwright_emitTestEvent`, which is not available in worker global scope. The plan must either: (a) document a postMessage-based bridge from worker to main thread for test events, or (b) acknowledge that worker instrumentation cannot use the existing helper and will require a new pattern.

- `vite.config.ts` — Ambiguous — `plan.md:103-106` — Plan states "Configure worker bundling to ensure SharedWorker compiles correctly" and notes "may need `build.rollupOptions` for worker entry" but does NOT specify whether Vite's implicit worker detection via `new SharedWorker('/src/workers/...')` syntax is sufficient or if explicit configuration is required. The existing `vite.config.ts` (lines 1-156) has no worker-specific options. The plan should either (a) confirm implicit bundling is tested and working, or (b) provide the explicit Rollup config needed.

- `tests/support/helpers/deployment-sse.ts` — Pass — `plan.md:121-123` — Plan correctly treats this as read-only (line 122: "Test fixture interface remains stable") and preserves the existing `DeploymentSseHelper` interface, ensuring backward compatibility.

- `tests/e2e/deployment/deployment-banner.spec.ts` — Pass — `plan.md:631-633` — Plan explicitly states "Verify existing test `deployment-banner.spec.ts` continues passing without changes" (line 633), ensuring regression coverage.

## 3) Open Questions & Ambiguities

**Question 1: How will worker-side test events reach Playwright?**

- **Question:** The plan assumes `emitTestEvent()` can be called from the SharedWorker (lines 675-677), but SharedWorkers run in a separate global context without access to `window.__playwright_emitTestEvent`. How will test events emitted inside the worker reach the Playwright test-event buffer?
- **Why it matters:** Without deterministic worker-side events, tests cannot verify worker lifecycle (SSE open/close, retry backoff, last-tab disconnect cleanup) independently of tab-side observations. This undermines the "deterministic test plan" requirement (Section 13) and violates the Playwright developer guide's "no fixed waits" principle.
- **Needed answer:** The plan must specify one of: (a) worker posts test events to tabs via MessagePort, tabs re-emit via main-thread `emitTestEvent()`; (b) worker-side events are intentionally omitted and tests infer state from tab-side events only; (c) a new test bridge mechanism is introduced. Option (a) is recommended for full coverage.

**Question 2: What is the exact MessagePort closure detection mechanism?**

- **Question:** The plan mentions "MessagePort close event (`port.onmessageerror` or browser GC)" (line 447) and later "port close event (not explicit disconnect)" (line 294), but MessagePort does NOT have an `onclose` event in the web standard. How will the worker detect when a tab closes without sending an explicit disconnect message?
- **Why it matters:** If the worker cannot detect orphaned ports, `activePortsCount` will never reach zero after ungraceful tab closures, causing the SSE connection to remain open indefinitely (zombie connection). This directly violates the requirement "Worker closes SSE when the last tab disconnects" (change_brief.md:16).
- **Needed answer:** Research reveals MessagePort only fires `messageerror` for deserialization failures, not closure. The plan must either (a) document reliance on explicit disconnect messages only (accepting potential zombie connections), (b) implement a heartbeat protocol (tabs ping periodically, worker times out silent ports), or (c) accept that browser GC will eventually remove the port but provide no deterministic cleanup timeline.

**Question 3: How does `?__sharedWorker` interact with the `deploymentSse` fixture in test mode?**

- **Question:** The plan introduces `?__sharedWorker` to opt into SharedWorker path during tests (line 48), but the existing `deploymentSse` fixture (lines 121-123) provides explicit connect/disconnect control via `window.__deploymentSseControls`. If a test uses `?__sharedWorker`, does calling `deploymentSse.connect()` still work, or does the fixture need updates?
- **Why it matters:** If the fixture assumes direct EventSource path and the test uses SharedWorker, fixture methods may not function correctly (e.g., `getRequestId()` might return worker's requestId instead of tab's). This creates a hidden integration gap.
- **Needed answer:** The plan should clarify whether (a) `deploymentSse` fixture remains unchanged and tests using `?__sharedWorker` must use alternative assertions, (b) the fixture is extended to detect connection mode and adapt behavior, or (c) SharedWorker tests bypass the fixture entirely.

**Question 4: Should worker console logs be visible in Playwright's `backendLogs` or test output?**

- **Question:** The plan includes worker console logging (lines 512-522: "Console logs (worker debug)") for developer debugging, but SharedWorker console output is isolated from the page context. Will these logs be accessible during Playwright runs?
- **Why it matters:** If worker logs are invisible to Playwright, debugging test failures involving worker lifecycle (retry loops, port management) will be significantly harder. The `backendLogs` fixture (playwright_developer_guide.md:54-74) captures backend stdout, but there's no equivalent for worker logs.
- **Needed answer:** Document whether (a) worker logs are intentionally dev-only and tests must infer state from other signals, (b) worker should postMessage log entries to tabs for Playwright capture, or (c) Playwright should attach to SharedWorker console via a dedicated mechanism (research needed).

## 4) Deterministic Playwright Coverage (new/changed behavior only)

**Behavior 1: SharedWorker multi-tab connection sharing**

- **Scenarios:**
  - Given production mode with `?__sharedWorker`, When two tabs open and connect, Then both tabs receive version updates and backend logs show single SSE connection (`tests/e2e/deployment/shared-worker-version-sse.spec.ts`)
  - Given SharedWorker with 2 connected tabs, When one tab closes, Then remaining tab continues receiving updates without reconnection
  - Given SharedWorker with 1 connected tab, When that tab closes, Then worker closes SSE connection (verified via no further SSE events and backend connection closure)
- **Instrumentation:**
  - Tab-side SSE test events (`kind: 'sse', streamId: 'deployment.version', phase: 'open'|'message'`)
  - Optional `data.connectionType: 'shared'` metadata (line 609)
  - Playwright multi-context API for simultaneous tab simulation
- **Backend hooks:**
  - Existing `POST /api/testing/deployments/version` endpoint (no changes)
  - Backend SSE gateway logs showing single connection despite multiple tabs
- **Gaps:**
  - **Major:** No worker-side instrumentation events are specified. Tests can only observe tab-side effects (version delivery) but cannot verify worker internal state (activePortsCount, EventSource readyState). This makes scenarios like "worker closes SSE when last tab disconnects" non-deterministic—the test must infer closure from absence of events rather than explicit signal.
  - **Minor:** Backend coordination for confirming single SSE connection (e.g., `GET /api/testing/sse/connections/count` endpoint) is not mentioned. Tests rely on backend logs, which are not structured data.
- **Evidence:** `plan.md:599-618`

**Behavior 2: Direct EventSource fallback paths**

- **Scenarios:**
  - Given dev mode (`import.meta.env.DEV`), When tab connects, Then direct EventSource is used (no SharedWorker)
  - Given test mode without `?__sharedWorker`, When tab connects, Then direct EventSource is used
  - Given browser lacks SharedWorker support, When tab connects, Then direct EventSource is used
- **Instrumentation:**
  - Tab-side SSE test events with `data.connectionType: 'direct'` (if implemented)
  - Existing `waitForSseEvent()` helper
  - Existing `deployment-banner.spec.ts` must pass unchanged
- **Backend hooks:**
  - Existing `POST /api/testing/deployments/version` endpoint
- **Gaps:**
  - None—fallback reuses existing code paths and test coverage
- **Evidence:** `plan.md:620-633`

**Behavior 3: Worker lifecycle and cleanup**

- **Scenarios:**
  - Given worker has no connected tabs, When checked after last disconnect, Then EventSource is closed and no retry timers are active
  - Given worker is retrying connection, When last tab disconnects during retry delay, Then scheduled retry is canceled
- **Instrumentation:**
  - Tab-side SSE close events (`phase: 'close'`)
  - Network traffic observation (Playwright Network tab) to confirm SSE closure
- **Backend hooks:**
  - Backend SSE gateway logs showing connection closure
- **Gaps:**
  - **Major:** No way to observe worker internal timer state. Test must use absence of events + timeout to infer retry cancellation, which violates "no fixed waits" principle.
  - **Major:** MessagePort closure detection mechanism is unspecified (see Open Question 2), so scenarios involving ungraceful tab closure cannot be deterministically tested.
- **Evidence:** `plan.md:635-649`

**Behavior 4: Error handling and retry coordination**

- **Scenarios:**
  - Given SharedWorker SSE connection errors, When error occurs, Then all connected tabs receive error notification and worker retries with exponential backoff
- **Instrumentation:**
  - Tab-side SSE error events (`phase: 'error'`)
  - `waitForSseEvent()` with phase filter
- **Backend hooks:**
  - Backend testing endpoint to force SSE disconnection (not documented in plan)
- **Gaps:**
  - **Minor:** No backend coordination for triggering SSE errors on demand. Plan assumes natural network errors, but deterministic testing requires explicit error injection.
- **Evidence:** `plan.md:604` (scenario line)

## 5) Adversarial Sweep (must find ≥3 credible issues or declare why none exist)

**Major — MessagePort Closure Detection Mechanism Undefined**

**Evidence:** `plan.md:443-451` (Edge case: Tab closes without sending disconnect), `plan.md:294` (Derived value: activePortsCount)

> "Worker listens for MessagePort close event (`port.onmessageerror` or browser GC)" (line 447)
> "Must not rely solely on explicit disconnect messages" (line 450)

**Why it matters:** The MessagePort API does not provide an `onclose` or equivalent event. The `messageerror` event only fires for deserialization failures, not port closure. Browser GC is non-deterministic and may take seconds to minutes. If the worker cannot detect orphaned ports, `activePortsCount` will never decrement after ungraceful tab closures, causing permanent zombie SSE connections that violate the core requirement "Worker closes SSE when the last tab disconnects."

**Fix suggestion:** Research reveals three options:
1. **Heartbeat protocol (recommended):** Worker sends periodic `{ type: 'ping' }` messages to all ports. If a port's `postMessage` throws an error (port closed), remove it from the array. Alternatively, tabs send periodic `{ type: 'heartbeat' }` to worker; worker tracks last heartbeat timestamp per port and removes stale ports after timeout (e.g., 30s).
2. **Accept explicit disconnect only:** Document that zombie connections are possible if tabs crash/force-close, and implement a backend-side connection timeout (e.g., SSE gateway closes connections idle for >5 minutes) as mitigation.
3. **Navigation-based cleanup:** Tabs send disconnect on `beforeunload` event, but this is unreliable (event can be canceled or ignored by browser).

Update `plan.md` Section 8 (Errors & Edge Cases, lines 443-451) and Section 4 (Tab-to-Worker Protocol, lines 141-151) to document the chosen approach. Add invariant to Section 6 (Derived State, line 326): "activePortsCount may lag actual port count by up to [timeout] if heartbeat-based."

**Confidence:** High

---

**Major — Worker Test Instrumentation Strategy Missing**

**Evidence:** `plan.md:392-405` (Observability / Instrumentation), `plan.md:675-677` (Slice 3), `plan.md:117-119` (Read-Only References)

> "SSE test events (`kind: 'sse', streamId: 'deployment.version'`) at same lifecycle points as direct path" (line 395-396)
> "Ensure SSE test events emit identically in both SharedWorker and direct paths" (line 672)
> "Used to emit SSE test events from both worker and direct paths" (line 118)

**Why it matters:** The existing `emitTestEvent()` helper in `src/lib/test/event-emitter.ts` calls `window.__playwright_emitTestEvent`, which is not accessible in SharedWorker global scope (workers have `self`, not `window`). Without a defined strategy for worker → Playwright event emission, tests cannot verify worker lifecycle deterministically. Scenarios like "worker closes SSE when last tab disconnects" (line 637) will require fixed waits or inference from absence of events, violating the "deterministic waits" requirement (playwright_developer_guide.md:129-154).

**Fix suggestion:** Add a new section to the plan (or expand Section 7, lines 369-406) documenting a **test event bridge from worker to tabs**:
1. Worker detects test mode via a flag passed in the initial `{ type: 'connect' }` message (tabs check `isTestMode()` and include `{ type: 'connect', isTestMode: true }`).
2. When test mode is active, worker includes test event metadata in all broadcast messages: `{ type: 'connected', requestId, __testEvent: { kind: 'sse', phase: 'open', ... } }`.
3. Hook receives message, extracts `__testEvent` if present, and calls `emitTestEvent(__testEvent)` to forward to Playwright.
4. This preserves the deterministic event stream while keeping worker logic clean (worker doesn't need to know about Playwright infrastructure).

Update `plan.md` Section 9 (lines 392-406) to document this bridge. Update Section 4 (Worker-to-Tab Protocol, lines 129-139) to add optional `__testEvent` field. Update Slice 3 (line 675) to include bridge implementation.

**Confidence:** High

---

**Major — Vite Worker Bundling Configuration Ambiguous**

**Evidence:** `plan.md:103-106` (Modified Files: vite.config.ts), `plan.md:691-693` (Risk: Vite worker bundling issues)

> "Configure worker bundling to ensure SharedWorker compiles correctly" (line 104)
> "may need `build.rollupOptions` for worker entry" (line 105)
> "Test worker bundling locally with `pnpm build && pnpm preview`; add explicit `worker.format: 'es'` to Vite config if needed" (line 693)

**Why it matters:** The plan does not specify whether Vite's implicit worker detection (via `new SharedWorker('/src/workers/...')` constructor call) is sufficient or if explicit Rollup configuration is required. The existing `vite.config.ts` (lines 1-156) has no `worker` or `build.rollupOptions.input` for workers. If implicit detection fails, the worker script will not bundle correctly, causing runtime errors in production builds. The plan defers this decision to implementation ("Test... if needed"), which risks discovering the gap late in Slice 2.

**Fix suggestion:** **Research Vite worker bundling now** to resolve ambiguity:
1. Vite 4+ supports `new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })` syntax for automatic bundling. Verify if `new SharedWorker('/src/workers/version-sse-worker.ts', { type: 'module' })` triggers similar behavior, or if the path must be `new URL()` wrapped.
2. If implicit detection works, document in plan: "Vite's implicit worker detection via `new SharedWorker()` constructor is sufficient; no explicit config needed."
3. If explicit config is required, add to `vite.config.ts`:
   ```typescript
   worker: {
     format: 'es',
     rollupOptions: {
       output: {
         entryFileNames: 'assets/[name]-[hash].js'
       }
     }
   }
   ```
   And update `plan.md` Section 2 (line 104) to specify the exact configuration.

Perform this research **before starting implementation** and update the plan accordingly. Move from "may need" to "requires X" or "confirmed not needed."

**Confidence:** High

---

**Medium — Test Mode URL Parameter Interaction with `deploymentSse` Fixture Undefined**

**Evidence:** `plan.md:267-278` (Flow 3: Test Mode Opt-In), `plan.md:121-123` (Read-Only References: deployment-sse.ts)

> "Test spec opts into SharedWorker path via URL parameter" (line 269)
> "Test mode uses direct EventSource path (no SharedWorker)" (line 477)
> "Test fixture interface remains stable" (line 122)

**Why it matters:** The existing `deploymentSse` fixture (tests/support/helpers/deployment-sse.ts) controls the SSE connection via `window.__deploymentSseControls.connect()` and assumes direct EventSource path. If a test navigates with `?__sharedWorker`, the fixture may:
1. Call `connect(requestId)` but SharedWorker ignores the requestId parameter (worker manages its own requestId).
2. Call `getRequestId()` and receive the worker's requestId instead of the tab's expected value.
3. Call `disconnect()` and close the MessagePort but not the worker's SSE connection.

This creates subtle test behavior differences that violate the fixture's documented contract.

**Fix suggestion:** Update `plan.md` Section 2 (lines 121-123) to change classification from "Read-Only" to "Modified (conditional)". Document one of:
1. **Fixture detects connection mode:** `window.__deploymentSseControls` includes a `getConnectionType()` method that returns `'direct' | 'shared'`. Fixture adapts behavior: when `'shared'`, `getRequestId()` reads from worker state, `disconnect()` only closes port (not SSE).
2. **SharedWorker tests bypass fixture:** Tests using `?__sharedWorker` do not use `deploymentSse` fixture; instead, they manually call `window.__deploymentSseControls` or assert purely via SSE events. Document this in Section 13 (Test Plan, line 611).
3. **Fixture is extended for SharedWorker:** New methods `deploymentSse.connectShared()`, `deploymentSse.getWorkerRequestId()` added specifically for SharedWorker tests.

Recommendation: Option 2 (bypass fixture) is simplest and maintains fixture purity. Update lines 611-618 to clarify: "SharedWorker tests use direct `window.__deploymentSseControls` API; `deploymentSse` fixture remains unchanged and used only for direct-path tests."

**Confidence:** Medium

---

**Minor — Backend SSE Connection Count Verification Mechanism Missing**

**Evidence:** `plan.md:599-618` (Deterministic Test Plan: SharedWorker multi-tab behavior)

> "both tabs receive version updates from single SSE connection" (line 601)
> "Cannot directly observe worker internal state; rely on SSE events and version delivery" (line 614)

**Why it matters:** The test scenario "both tabs receive version updates from single SSE connection" cannot verify "single SSE connection" without backend coordination. The plan relies on "backend logs" (line 614), but logs are unstructured and not part of the deterministic test contract. A test could pass even if two SSE connections exist (defeating the feature's purpose).

**Fix suggestion:** Add a backend testing endpoint (e.g., `GET /api/testing/sse/connections?stream=deployment.version`) that returns `{ activeConnections: number }`. Update test scenario (line 601):
```typescript
// After both tabs connect
const connectionsResponse = await page.request.get(`${backendUrl}/api/testing/sse/connections?stream=deployment.version`);
const { activeConnections } = await connectionsResponse.json();
expect(activeConnections).toBe(1); // Verify single SSE despite 2 tabs
```

Update `plan.md` Section 13 (line 612) to add: "Backend coordination: `GET /api/testing/sse/connections` endpoint returns active connection count for verification."

**Confidence:** Medium

---

**Minor — Retry Cancellation Verification Relies on Absence of Events**

**Evidence:** `plan.md:637-639` (Deterministic Test Plan: Worker lifecycle)

> "Given worker is retrying connection, When last tab disconnects during retry delay, Then scheduled retry is canceled"
> "Cannot directly inspect SharedWorker internal timers; rely on SSE closure observable via network" (line 647)

**Why it matters:** The scenario "retry is canceled" can only be verified by asserting NO retry occurs within a timeout window, which requires a fixed wait (e.g., `await page.waitForTimeout(max retry delay)`). This violates the "no fixed waits" principle (playwright_developer_guide.md:156-158).

**Fix suggestion:** Accept this limitation and document it explicitly. Update `plan.md` line 647:
```markdown
- Gaps:
  - **Accepted limitation:** Retry cancellation cannot be verified without a fixed wait window (expect no SSE open event within 65s = max retry delay + buffer). This is acceptable because (a) the alternative (worker test bridge) adds complexity for marginal benefit, and (b) the scenario is already covered indirectly by "no SSE events after disconnect."
```

Alternatively, implement the worker test event bridge (see Major issue #2) to emit `{ type: 'retry_scheduled' }` and `{ type: 'retry_canceled' }` events, enabling deterministic verification.

**Confidence:** Medium

---

**Minor — SharedWorker Constructor Path May Not Bundle Correctly**

**Evidence:** `plan.md:227` (Flow 1: SharedWorker Connection Path)

> "Hook creates `new SharedWorker('/src/workers/version-sse-worker.ts', { type: 'module' })`" (line 227)

**Why it matters:** The path `/src/workers/version-sse-worker.ts` is a development-time path that may not resolve correctly in production builds. Vite bundles workers with hashed names (e.g., `/assets/version-sse-worker-abc123.js`). The plan should use Vite's `new URL()` syntax for bundler compatibility:
```typescript
new SharedWorker(new URL('../workers/version-sse-worker.ts', import.meta.url), { type: 'module' })
```

**Fix suggestion:** Update `plan.md` line 227 to specify the correct Vite-compatible syntax:
```markdown
2. Hook creates `new SharedWorker(new URL('../workers/version-sse-worker.ts', import.meta.url), { type: 'module' })`
```

This ensures Vite's bundler recognizes the worker dependency and includes it in the build manifest.

**Confidence:** High (this is a known Vite pattern)

## 6) Derived-Value & State Invariants (table)

**Derived value 1: shouldUseSharedWorker (in hook)**

- **Source dataset:** Unfiltered inputs: `import.meta.env.DEV`, `isTestMode()`, `typeof SharedWorker !== 'undefined'`, `window.location.search.includes('__sharedWorker')`
- **Write / cleanup triggered:** Connection path initialization (SharedWorker vs EventSource); computed once on hook mount
- **Guards:** Multiple boolean checks with short-circuit evaluation (lines 309-312); immutable after mount
- **Invariant:** Value must remain stable for hook lifetime; changing mid-connection would cause orphaned EventSource or MessagePort. Verified by computing once and not re-evaluating.
- **Evidence:** `plan.md:299-314`

**Assessment:** No concerns. Derived value is computed from unfiltered static sources (environment flags, browser capabilities) and immutable post-mount. No persistent writes or cleanup dependencies.

---

**Derived value 2: activePortsCount (in worker)**

- **Source dataset:** Filtered (array of connected MessagePort instances)
- **Write / cleanup triggered:** When count reaches 0, worker closes EventSource and clears retry timers (lines 321-322)
- **Guards:** Idempotency check for duplicate disconnect messages (line 324); port identity tracking (line 325)
- **Invariant:** `activePortsCount >= 0`; EventSource exists only when `activePortsCount > 0` (line 326)
- **Evidence:** `plan.md:316-327`

**Assessment:** **Major concern** — The invariant assumes reliable port removal, but the plan does not specify a deterministic MessagePort closure detection mechanism (see Adversarial Sweep issue #1). If orphaned ports remain in the array after tab crashes, `activePortsCount` will never reach 0, causing permanent zombie SSE connections. The guard mentions "WeakMap or array indexOf" (line 325) but neither solves the detection problem—they only prevent double-decrement for **explicitly** disconnected ports. Flagged as Major in Adversarial Sweep; mitigation: implement heartbeat protocol or accept backend-side timeout.

---

**Derived value 3: currentVersion (in worker)**

- **Source dataset:** Unfiltered (latest SSE `version` event payload)
- **Write / cleanup triggered:** Updated on SSE `version` event (line 333); sent to new tabs immediately (line 334); reset to null when EventSource closes (line 335)
- **Guards:** Reset on EventSource closure to avoid stale version on reconnect (line 338)
- **Invariant:** If `currentVersion` is non-null, `EventSource.readyState === OPEN or CONNECTING` (line 339)
- **Evidence:** `plan.md:329-340`

**Assessment:** Potential violation. The invariant "If `currentVersion` is non-null, EventSource is OPEN or CONNECTING" can break if:
1. Worker receives version event, sets `currentVersion = "v1"`, EventSource readyState = OPEN.
2. Backend closes connection (`connection_close` event), worker calls `EventSource.close()`, readyState = CLOSED.
3. Worker forgets to reset `currentVersion = null` in the `connection_close` handler (plan only documents reset "when EventSource closes due to last tab disconnect" line 335, not all closures).
4. Next tab connects, receives stale version immediately.

**Fix needed:** Update `plan.md` lines 329-340 to clarify: "Reset to null on ANY EventSource closure (connection_close, error leading to disconnect, last-tab disconnect)." Add to Section 5 Flow 1 (line 238): "Worker `connection_close` listener: reset `currentVersion = null` before closing EventSource."

---

**Derived value 4: retryCount (in worker)**

- **Source dataset:** Filtered (incremented on EventSource error only when `activePortsCount > 0`)
- **Write / cleanup triggered:** Drives exponential backoff delay (line 348); cleared when EventSource opens (line 347); retry timeout cleared when `activePortsCount` reaches 0 (line 350)
- **Guards:** "Must not retry if activePortsCount is 0" (line 351)
- **Invariant:** Worker schedules retry only if `activePortsCount > 0 && EventSource.readyState === CLOSED` (line 352)
- **Evidence:** `plan.md:342-353`

**Assessment:** No concerns if the guard is correctly implemented. The invariant correctly ties retry eligibility to active tab count, preventing zombie retry loops. However, the cleanup "clear scheduled retry timeout when EventSource closes due to last tab disconnect" (line 350) must execute **before** the last port is removed from the array to avoid a race condition where the timeout fires between port removal and timeout clearing. Recommendation: Add note to `plan.md` line 350: "Clear timeout in the same critical section that decrements activePortsCount to 0 to prevent race."

---

**Derived value 5: isConnected (in hook, both paths)**

- **Source dataset:** Unfiltered (connection state messages from worker or EventSource events)
- **Write / cleanup triggered:** Updated on state change (line 361); exposed to deployment context provider (line 362)
- **Guards:** Transitions to false on error or disconnect (line 364); test instrumentation emits SSE event (line 365)
- **Invariant:** `isConnected` reflects reachability of SSE stream within typical retry window (line 366)
- **Evidence:** `plan.md:355-367`

**Assessment:** No concerns. This is a read-only derived state for UI display, not used to drive writes or cleanup. The invariant is appropriately scoped ("within typical retry window") acknowledging transient false negatives during reconnection.

---

**Summary:** Two entries flagged:
1. **activePortsCount** — Major concern due to MessagePort closure detection gap (see Adversarial Sweep #1).
2. **currentVersion** — Minor issue with incomplete reset logic; requires clarification in Flow 1 and invariant statement.

## 7) Risks & Mitigations (top 3)

**Risk 1: Worker lifecycle races and zombie connections**

- **Risk:** If MessagePort closure is not reliably detected (see Adversarial Sweep #1), ungraceful tab closures (crashes, force-quit) leave orphaned ports in the worker's `activePortsCount`, preventing SSE cleanup. Multiple such events accumulate zombie connections, defeating the feature's purpose (reduce connection churn).
- **Mitigation:** Implement heartbeat protocol (worker pings tabs every 15s; remove ports that fail to postMessage, or tabs send heartbeat; worker removes ports silent >30s). Alternatively, accept explicit disconnect only and add backend-side SSE idle timeout (5min) to eventually close zombie connections. Update `plan.md` Section 8 (lines 443-451) and Section 4 (Tab-to-Worker Protocol) with chosen approach before starting Slice 1.
- **Evidence:** `plan.md:695-698`, `plan.md:443-451`, Section 6 analysis above

---

**Risk 2: Test instrumentation gap blocks deterministic coverage**

- **Risk:** Worker-side events (SSE open, retry scheduled, last-tab disconnect) cannot reach Playwright buffer because `emitTestEvent()` requires `window` context. Tests must infer worker state from absence of tab-side events or backend logs, requiring fixed waits that violate project testing standards.
- **Mitigation:** Implement test event bridge (worker → tab → Playwright) as documented in Adversarial Sweep #2. Worker includes `__testEvent` metadata in MessagePort messages when test mode is active; tabs forward to `emitTestEvent()`. This preserves deterministic event-driven assertions. Update `plan.md` Section 9 (lines 392-406) and Section 4 (Worker-to-Tab Protocol) to document bridge. Alternatively, accept reduced test coverage for worker internals and document limitation in Section 13.
- **Evidence:** `plan.md:392-405`, `plan.md:675-677`, Section 4 analysis above

---

**Risk 3: Vite worker bundling failure discovered late in implementation**

- **Risk:** Plan defers worker bundling configuration decision to implementation ("Test... if needed" line 693), risking discovery that implicit bundling doesn't work during Slice 2 integration. This could require Rollup config changes, worker path adjustments, or URL syntax changes, causing rework in both `vite.config.ts` and `use-version-sse.ts`.
- **Mitigation:** Research Vite SharedWorker bundling behavior **now** (before implementation starts) by creating minimal test: `new SharedWorker(new URL('./test-worker.ts', import.meta.url))` in a scratch branch, run `pnpm build`, verify output includes bundled worker. Document findings in plan update: either "Vite implicit bundling confirmed working" or "Requires explicit config: [specific Rollup options]". Update `plan.md` Section 2 (lines 103-106) with concrete configuration.
- **Evidence:** `plan.md:103-106`, `plan.md:691-693`, Section 2 analysis above

## 8) Confidence

**Confidence: Medium** — The plan demonstrates strong technical understanding (SharedWorker API, message protocols, environment detection, state invariants) and thorough edge case analysis. However, three unresolved ambiguities reduce confidence: (1) MessagePort closure detection mechanism is undefined and may not be solvable as documented, risking zombie connections; (2) worker test instrumentation strategy is missing, potentially requiring significant rework to achieve deterministic coverage; (3) Vite bundling configuration is deferred to implementation despite being a prerequisite for Slice 1-2. If these gaps are resolved during early implementation with minimal rework, confidence rises to High. If they require significant design changes (e.g., abandoning test coverage for worker internals, or adding complex heartbeat protocol), implementation risk increases.
