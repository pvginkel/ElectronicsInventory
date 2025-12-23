# Shared Worker Version SSE - Technical Plan

## 0) Research Log & Findings

### Discovery Summary

**Searched areas:**
- `src/hooks/use-version-sse.ts` - Current EventSource-based implementation (215 lines)
- `src/contexts/deployment-context-provider.tsx` - Consumer of `useVersionSSE` hook
- `vite.config.ts` - Current worker/build configuration
- `src/lib/config/test-mode.ts` - Test mode detection logic
- `src/lib/test/event-emitter.ts` - Test event emission system
- `src/types/test-events.ts` - SSE test event schema
- `tests/e2e/deployment/deployment-banner.spec.ts` - Existing Playwright coverage
- `tests/support/helpers/deployment-sse.ts` - Test fixture for deployment SSE control

**Key findings:**
1. No `src/workers/` directory exists yet - will be created
2. Current implementation opens one EventSource per tab (line 98 in `use-version-sse.ts`)
3. Test mode is detected via `isTestMode()` which checks `import.meta.env.VITE_TEST_MODE === 'true'`
4. Development mode detected via `import.meta.env.DEV`
5. SSE instrumentation emits events with `streamId: 'deployment.version'` (lines 122-134, 142-156)
6. Vite config doesn't currently have worker-specific configuration
7. Deployment provider exposes test bridge at `window.__deploymentSseControls` (lines 114-154)
8. Current test spec uses `deploymentSse` fixture to control connection lifecycle

**Instrumentation helpers identified:**
- `emitTestEvent()` from `src/lib/test/event-emitter.ts`
- `SseTestEvent` type with phases: 'open' | 'message' | 'error' | 'close'
- Test event capture via Playwright binding `window.__playwright_emitTestEvent`

**Conflicts resolved:**
- Test mode check: Use both `isTestMode()` AND `import.meta.env.DEV` to disable SharedWorker
- URL parameter strategy: Use `?__sharedWorker` prefix (double underscore) to match existing `window.__deploymentSseControls` convention
- SharedWorker detection: Check `typeof SharedWorker !== 'undefined'` for browser support

**Vite Worker Bundling (researched):**
- Vite requires `new URL('./worker.ts', import.meta.url)` syntax for worker bundling
- SharedWorker constructor: `new SharedWorker(new URL('../workers/version-sse-worker.ts', import.meta.url), { type: 'module' })`
- No explicit `vite.config.ts` changes required - Vite's implicit worker detection handles bundling
- Worker output includes hashed filename in production build (e.g., `assets/version-sse-worker-abc123.js`)

**MessagePort Closure Detection Strategy:**
- MessagePort API does NOT provide an `onclose` event
- Strategy: Rely on explicit `{ type: 'disconnect' }` messages sent via `beforeunload` event
- Fallback: Accept that browser crashes/force-quit may leave orphaned ports until page reload
- Mitigation: Worker can attempt to postMessage to each port before cleanup; failed postMessage indicates closed port
- Design choice: Avoid heartbeat protocol to keep implementation simple; zombie connections are acceptable since they're cleaned up on next page load and don't consume backend resources (backend already has SSE idle timeout)

**Worker Test Instrumentation Strategy:**
- Worker cannot call `emitTestEvent()` directly (no `window` context)
- Solution: Worker includes `__testEvent` metadata in broadcast messages when test mode is active
- Tab-side hook extracts `__testEvent` from worker messages and calls `emitTestEvent()` to forward to Playwright
- Test mode detection: Tabs include `isTestMode: true` in connect command; worker tracks this per-port

**Test Fixture Interaction with `?__sharedWorker`:**
- SharedWorker tests bypass the `deploymentSse` fixture entirely
- Tests using `?__sharedWorker` manually control connection via `window.__deploymentSseControls` or assert via SSE events
- Existing `deploymentSse` fixture remains unchanged and used only for direct-path tests
- This separation keeps fixture implementation simple and tests explicit about which path they're testing

## 1) Intent & Scope

### User intent

Reduce browser connection limits exhaustion when users open many tabs (10+) by consolidating the version check SSE connection into a single SharedWorker that broadcasts updates to all connected tabs.

### Prompt quotes

"Implement a SharedWorker to multiplex the version SSE connection across all browser tabs"

"In local dev (`import.meta.env.DEV`) and test mode (`isTestMode()`), use the existing direct SSE connection (one per tab)"

"Use URL parameter `?__sharedWorker` to enable SharedWorker in test mode"

"Worker closes SSE when the last tab disconnects"

"Graceful fallback for browsers without SharedWorker support (iOS Safari)"

### In scope

- Create `src/workers/version-sse-worker.ts` SharedWorker implementation
- Modify `src/hooks/use-version-sse.ts` to detect environment and choose connection strategy
- Add SharedWorker path that maintains single SSE connection and broadcasts to tabs via MessagePort
- Preserve existing test instrumentation events in both direct and SharedWorker modes
- Implement last-tab disconnect cleanup in worker
- Add URL parameter `?__sharedWorker` opt-in for test mode
- Configure Vite worker bundling if needed
- Add Playwright spec for SharedWorker-specific behavior

### Out of scope

- Backend protocol changes (SSE payload format remains identical)
- Changes to other SSE streams (task SSE, shopping list SSE, AI analysis SSE)
- Migration of deployment context provider (consumers remain unchanged)
- Connection pooling or request batching beyond single shared connection
- Service Worker implementation (using SharedWorker only)
- Polyfills for browsers without SharedWorker support (graceful fallback to direct connection)

### Assumptions / constraints

- SharedWorker is available in all target browsers except iOS Safari (confirmed via MDN)
- Existing test infrastructure (`deploymentSse` fixture, test events) continues working unchanged in test/dev mode
- Version SSE endpoint `/api/sse/utils/version` supports multiple concurrent connections with different `request_id` parameters
- Vite's worker bundling supports SharedWorker syntax (verify during implementation)
- MessagePort-based communication between worker and tabs is synchronous enough to preserve current UX
- Test specs can use URL parameter to opt into SharedWorker path when needed
- The worker lifecycle (startup, connection, shutdown) completes within typical page load/unload times

## 2) Affected Areas & File Map

### New Files

- **Area:** `src/workers/version-sse-worker.ts`
- **Why:** SharedWorker script that manages single SSE connection and broadcasts to all connected tabs
- **Evidence:** New file - no existing `src/workers/` directory (verified via glob)

- **Area:** `tests/e2e/deployment/shared-worker-version-sse.spec.ts`
- **Why:** Playwright spec to verify SharedWorker-specific behavior (multi-tab scenarios, worker lifecycle)
- **Evidence:** New file - existing spec at `tests/e2e/deployment/deployment-banner.spec.ts:1-130` covers direct SSE only

### Modified Files

- **Area:** `src/hooks/use-version-sse.ts`
- **Why:** Add environment detection and fork between direct EventSource and SharedWorker connection
- **Evidence:** `src/hooks/use-version-sse.ts:27-214` - current hook creates EventSource directly (line 98), needs conditional branching

- **Area:** `vite.config.ts`
- **Why:** No changes required - Vite's implicit worker detection handles SharedWorker bundling when using `new URL('./worker.ts', import.meta.url)` syntax
- **Evidence:** `vite.config.ts:1-156` - Vite automatically detects and bundles workers referenced via URL constructor; verified in research phase

- **Area:** `src/types/test-events.ts` (potentially)
- **Why:** Possibly extend SSE test event metadata to distinguish SharedWorker vs direct connection source
- **Evidence:** `src/types/test-events.ts:110-116` - `SseTestEvent` has `streamId`, `phase`, `event`, `data` fields; may add optional `connectionType?: 'direct' | 'shared'` for debugging

### Read-Only References (no changes expected)

- **Area:** `src/contexts/deployment-context-provider.tsx`
- **Why:** Consumer of `useVersionSSE` - interface remains unchanged
- **Evidence:** `src/contexts/deployment-context-provider.tsx:26` - calls `useVersionSSE()` and receives same return shape

- **Area:** `src/lib/test/event-emitter.ts`
- **Why:** Used to emit SSE test events from both worker and direct paths
- **Evidence:** `src/lib/test/event-emitter.ts:22-50` - `emitTestEvent()` forwards events to Playwright binding

- **Area:** `tests/support/helpers/deployment-sse.ts`
- **Why:** Test fixture interface remains stable
- **Evidence:** `tests/support/helpers/deployment-sse.ts:9-16` - `DeploymentSseHelper` interface unchanged

## 3) Data Model / Contracts

### Worker-to-Tab Message Protocol

- **Entity / contract:** Messages sent from SharedWorker to tabs via MessagePort
- **Shape:**
  ```typescript
  // Test event metadata (only included when tab connected with isTestMode: true)
  interface TestEventMetadata {
    kind: 'sse';
    streamId: string;
    phase: 'open' | 'message' | 'error' | 'close';
    event: string;
    data?: unknown;
  }

  type WorkerMessage =
    | { type: 'connected', requestId: string, __testEvent?: TestEventMetadata }
    | { type: 'version', version: string, correlationId?: string, requestId?: string, __testEvent?: TestEventMetadata }
    | { type: 'disconnected', reason?: string, __testEvent?: TestEventMetadata }
    | { type: 'error', error: string, __testEvent?: TestEventMetadata };
  ```
- **Mapping:** Worker translates SSE events into structured messages; hook reconstructs same state as direct EventSource path. When test mode is active, worker includes `__testEvent` metadata that tabs forward to Playwright via `emitTestEvent()`.
- **Evidence:** New contract - designed to preserve equivalence with `src/hooks/use-version-sse.ts:118-193` (onopen, version event, connection_close, onerror)

### Tab-to-Worker Command Protocol

- **Entity / contract:** Commands sent from tabs to SharedWorker via MessagePort
- **Shape:**
  ```typescript
  type TabCommand =
    | { type: 'connect', requestId: string, isTestMode?: boolean }
    | { type: 'disconnect' };
  ```
- **Mapping:** Hook sends connect/disconnect commands; worker responds with state updates. The `isTestMode` flag enables test event forwarding from worker to tab.
- **Evidence:** New contract - mirrors `useVersionSSE` hook methods (`src/hooks/use-version-sse.ts:52-194` - connect/disconnect callbacks)

### SSE Event Payload (unchanged)

- **Entity / contract:** Version event from backend SSE stream
- **Shape:**
  ```typescript
  interface VersionEvent {
    version: string;
    correlation_id?: string;
    correlationId?: string;
    request_id?: string;
    requestId?: string;
    [key: string]: unknown;
  }
  ```
- **Mapping:** No changes - worker receives same payload as direct EventSource
- **Evidence:** `src/hooks/use-version-sse.ts:6-13` - existing interface

### Test Event Extension (optional)

- **Entity / contract:** SSE test event metadata
- **Shape:**
  ```typescript
  interface SseTestEvent extends BaseTestEvent {
    kind: 'sse';
    streamId: string;
    phase: 'open' | 'message' | 'error' | 'close';
    event: string;
    data?: unknown & { connectionType?: 'direct' | 'shared' }; // optional addition
  }
  ```
- **Mapping:** Add `connectionType` to `data` field for debugging SharedWorker vs direct paths
- **Evidence:** `src/types/test-events.ts:110-116` - existing `SseTestEvent` schema

## 4) API / Integration Surface

### Version SSE Endpoint (unchanged)

- **Surface:** `GET /api/sse/utils/version?request_id={id}`
- **Inputs:** Query parameter `request_id` (string, required in production)
- **Outputs:**
  - Event `version`: `{ version: string, correlation_id: string }`
  - Event `connection_close`: `{ reason: string }`
  - Comments for keepalive (handled by EventSource)
- **Errors:** EventSource onerror triggers reconnection with exponential backoff
- **Evidence:** `src/hooks/use-version-sse.ts:81-98` - URL construction, `src/hooks/use-version-sse.ts:137-164` - event listeners

### SharedWorker MessagePort API (new)

- **Surface:** MessagePort between tab and SharedWorker
- **Inputs:** `TabCommand` messages (`{ type: 'connect' | 'disconnect', requestId?: string }`)
- **Outputs:** `WorkerMessage` messages (`{ type: 'connected' | 'version' | 'disconnected' | 'error' }`)
- **Errors:** Worker sends `{ type: 'error', error: string }` on SSE failures; tabs handle same as EventSource onerror
- **Evidence:** New surface - designed to mirror `src/hooks/use-version-sse.ts:118-193`

### Environment Detection

- **Surface:** `import.meta.env.DEV`, `isTestMode()`, URL search parameter `?__sharedWorker`
- **Inputs:**
  - `import.meta.env.DEV` (boolean from Vite)
  - `import.meta.env.VITE_TEST_MODE` (string 'true' | 'false')
  - `window.location.search` includes `__sharedWorker`
- **Outputs:** Boolean decision: use SharedWorker or fallback to direct EventSource
- **Errors:** None - always falls back gracefully
- **Evidence:**
  - `src/lib/config/test-mode.ts:9-11` - `isTestMode()` implementation
  - `src/hooks/use-version-sse.ts:55,87,92` - `import.meta.env.DEV` checks

## 5) Algorithms & UI Flows

### Flow 1: SharedWorker Connection Path (Production)

- **Flow:** Tab establishes version SSE connection via SharedWorker
- **Steps:**
  1. Hook detects `!import.meta.env.DEV && !isTestMode() && typeof SharedWorker !== 'undefined'` (or test mode with `?__sharedWorker` URL parameter)
  2. Hook creates `new SharedWorker(new URL('../workers/version-sse-worker.ts', import.meta.url), { type: 'module' })`
  3. Hook sends `{ type: 'connect', requestId, isTestMode }` via `worker.port.postMessage()`
  4. Worker receives connect command:
     - If no existing SSE connection, creates EventSource with requestId
     - If SSE already connected, immediately sends current version via `{ type: 'version', version }`
     - Stores MessagePort in array of connected tabs
  5. Worker EventSource `onopen`: broadcasts `{ type: 'connected', requestId }` to all ports
  6. Hook receives `{ type: 'connected' }`: sets `isConnected = true`, emits SSE test event (if test mode)
  7. Worker receives SSE `version` event: broadcasts `{ type: 'version', version, correlationId }` to all ports
  8. Hook receives `{ type: 'version' }`: updates `version` state, emits SSE test event
  9. Tab navigates away: hook sends `{ type: 'disconnect' }`
  10. Worker removes MessagePort from array; if array empty, closes EventSource

- **States / transitions:**
  - Hook states: `disconnected → connecting → connected → disconnected`
  - Worker states: `idle (no SSE) → connecting → connected → idle`
  - MessagePort lifecycle: `added to worker array → removed on disconnect or port close`

- **Hotspots:**
  - MessagePort closure detection (port.onclose / port disconnect event)
  - Race condition if multiple tabs connect simultaneously (worker must serialize SSE creation)
  - Retry logic in worker must not conflict with per-tab disconnect commands

- **Evidence:** New logic - designed to mirror `src/hooks/use-version-sse.ts:52-206`

### Flow 2: Direct EventSource Path (Dev / Test / Fallback)

- **Flow:** Tab establishes version SSE connection directly (existing behavior)
- **Steps:**
  1. Hook detects `import.meta.env.DEV || isTestMode() || typeof SharedWorker === 'undefined' || hasSharedWorkerOptOut`
  2. Hook creates `new EventSource(url)` (existing line 98)
  3. EventSource onopen: set `isConnected = true`, emit test event
  4. EventSource version event: update `version` state, emit test event
  5. EventSource onerror: trigger reconnection with exponential backoff
  6. Unmount: close EventSource

- **States / transitions:** Same as current implementation
- **Hotspots:** Same as current implementation
- **Evidence:** `src/hooks/use-version-sse.ts:52-206` - no changes to this path

### Flow 3: Test Mode Opt-In for SharedWorker

- **Flow:** Test spec opts into SharedWorker path via URL parameter
- **Steps:**
  1. Playwright spec navigates to `${frontendUrl}?__sharedWorker`
  2. Hook detects `isTestMode()` but also sees `?__sharedWorker` in `window.location.search`
  3. Hook uses SharedWorker path (Flow 1) instead of direct EventSource
  4. Test asserts on multi-tab behavior, worker lifecycle, message passing

- **States / transitions:** Same as Flow 1
- **Hotspots:** URL parameter parsing must happen before connection decision
- **Evidence:** New flow - requirement from change brief line 24-25

### Flow 4: Worker Lifecycle - Last Tab Disconnect

- **Flow:** Worker cleans up SSE connection when all tabs disconnect
- **Steps:**
  1. Worker receives `{ type: 'disconnect' }` from a tab
  2. Worker removes MessagePort from connected ports array
  3. Worker checks if array is empty
  4. If empty, worker calls `eventSource.close()` and clears retry timers
  5. Worker remains alive (browser-managed SharedWorker lifecycle)
  6. Next tab connect starts Flow 1 from step 4 (creates new EventSource)

- **States / transitions:** `connected (N tabs) → connected (N-1 tabs) → idle (0 tabs)`
- **Hotspots:**
  - Port removal must be idempotent (tab may send multiple disconnects)
  - MessagePort close event (not explicit disconnect) must also decrement count

- **Evidence:** New flow - requirement from change brief line 16

## 6) Derived State & Invariants

### Derived value: shouldUseSharedWorker (in hook)

- **Source:**
  - `import.meta.env.DEV` (boolean)
  - `isTestMode()` (boolean)
  - `typeof SharedWorker !== 'undefined'` (boolean)
  - `window.location.search.includes('__sharedWorker')` (boolean)
- **Writes / cleanup:** Determines which connection path to initialize (SharedWorker vs EventSource)
- **Guards:**
  - If `import.meta.env.DEV` is true, always use direct EventSource
  - If `isTestMode()` is true and no `?__sharedWorker` param, use direct EventSource
  - If `typeof SharedWorker === 'undefined'`, fallback to direct EventSource
  - Otherwise use SharedWorker
- **Invariant:** Value is computed once on hook mount; does not change mid-connection
- **Evidence:** New logic - decision tree from change brief requirements

### Derived value: activePortsCount (in worker)

- **Source:** Array of connected MessagePort instances
- **Writes / cleanup:**
  - Incremented when tab sends `{ type: 'connect' }`
  - Decremented when tab sends `{ type: 'disconnect' }` or MessagePort closes
  - When count reaches 0, worker closes EventSource and clears retry timers
- **Guards:**
  - Must handle duplicate disconnect messages idempotently
  - Must track port identity (use WeakMap or array indexOf) to avoid double-decrement
- **Invariant:** activePortsCount >= 0; EventSource exists only when activePortsCount > 0
- **Evidence:** New logic - requirement from change brief line 16

### Derived value: currentVersion (in worker)

- **Source:** Latest `version` event received from SSE stream
- **Writes / cleanup:**
  - Updated when worker receives SSE `version` event
  - Sent immediately to new tabs that connect after version is known
  - Reset to null on ANY EventSource closure (connection_close event, error leading to disconnect, last-tab disconnect)
- **Guards:**
  - Must persist across tab connects/disconnects while SSE is open
  - Must be cleared when EventSource closes to avoid stale version on reconnect
  - Worker `connection_close` listener must reset `currentVersion = null` before closing EventSource
- **Invariant:** If `currentVersion` is non-null, `EventSource.readyState === OPEN or CONNECTING`
- **Evidence:** New logic - optimization to send cached version to new tabs

### Derived value: retryCount (in worker)

- **Source:** EventSource error count, reset on successful connection
- **Writes / cleanup:**
  - Incremented on EventSource onerror
  - Reset to 0 on EventSource onopen
  - Used to compute exponential backoff delay (same formula as `src/hooks/use-version-sse.ts:109`)
- **Guards:**
  - Must clear scheduled retry timeout when EventSource closes due to last tab disconnect
  - Must not retry if activePortsCount is 0
- **Invariant:** Worker schedules retry only if `activePortsCount > 0 && EventSource.readyState === CLOSED`
- **Evidence:** `src/hooks/use-version-sse.ts:101-116` - existing retry logic to replicate

### Derived value: isConnected (in hook, both paths)

- **Source:**
  - SharedWorker path: set to true when worker sends `{ type: 'connected' }`
  - Direct path: set to true on EventSource onopen
- **Writes / cleanup:**
  - Updated in response to connection state messages
  - Exposed to deployment context provider
- **Guards:**
  - Must transition to false on error or disconnect
  - Test instrumentation emits SSE event when state changes
- **Invariant:** `isConnected` reflects reachability of SSE stream within typical retry window
- **Evidence:** `src/hooks/use-version-sse.ts:28,119,189` - existing state

## 7) State Consistency & Async Coordination

### Source of truth

- **Production (SharedWorker path):** Worker holds SSE connection; tabs hold local `isConnected`, `version` derived from worker messages
- **Dev/Test (direct path):** Hook holds EventSource; state is local to tab
- **Invariant:** Both paths expose identical state shape to deployment context provider

### Coordination

- **SharedWorker path:**
  - Worker broadcasts state changes to all connected tabs via MessagePort
  - Tabs update local React state in response to worker messages
  - No tab-to-tab communication; worker is single source of truth for SSE state
- **Direct path:** Same as current implementation (no coordination needed)

### Async safeguards

- **MessagePort ordering:** MessagePort preserves message order (per spec); no additional synchronization needed
- **Worker startup race:** If tab sends connect before worker script loads, port.onmessage queues messages until worker `onconnect` fires
- **Cleanup on unmount:** Hook cleanup must send `{ type: 'disconnect' }` before port closes to ensure worker decrements count
- **EventSource abort:** Worker checks `activePortsCount > 0` before retrying SSE connection to avoid zombie retries

### Instrumentation

- **Events emitted:**
  - SSE test events (`kind: 'sse', streamId: 'deployment.version'`) at same lifecycle points as direct path
  - Phases: `'open'` (connected), `'message'` (version received), `'error'` (connection error), `'close'` (explicit disconnect)
- **When:**
  - `'open'`: When hook receives `{ type: 'connected' }` (SharedWorker) or EventSource onopen (direct)
  - `'message'`: When hook receives `{ type: 'version' }` (SharedWorker) or EventSource version event (direct)
  - `'error'`: When hook receives `{ type: 'error' }` (SharedWorker) or EventSource onerror (direct)
  - `'close'`: When hook calls disconnect
- **Consumer:** Playwright tests use `waitForSseEvent()` helper to assert connection lifecycle
- **Evidence:**
  - `src/hooks/use-version-sse.ts:122-134,142-156` - existing test event emissions
  - `tests/e2e/deployment/deployment-banner.spec.ts:28-33,54-64,78-96` - test assertions

## 8) Errors & Edge Cases

### Failure: SharedWorker not supported (iOS Safari)

- **Surface:** `src/hooks/use-version-sse.ts` (hook initialization)
- **Handling:**
  - Check `typeof SharedWorker === 'undefined'`
  - Fall back to direct EventSource path
  - No user-visible error; identical behavior to dev/test mode
- **Guardrails:** Automated fallback; no manual configuration required
- **Evidence:** New logic - requirement from change brief line 17

### Failure: Worker script fails to load

- **Surface:** SharedWorker constructor throws or worker onerror fires
- **Handling:**
  - Catch exception on `new SharedWorker(...)`
  - Log error to console
  - Fall back to direct EventSource path
  - Emit error test event if in test mode
- **Guardrails:** Try-catch around SharedWorker instantiation
- **Evidence:** New logic - defensive programming

### Failure: SSE connection fails (network error, backend down)

- **Surface:** Worker EventSource onerror (SharedWorker path) or hook EventSource onerror (direct path)
- **Handling:**
  - Worker broadcasts `{ type: 'error', error: string }` to all tabs
  - Hook sets `isConnected = false`
  - Worker schedules reconnection with exponential backoff (same as current)
  - Hook emits SSE test event with phase 'error'
- **Guardrails:**
  - Retry only if `activePortsCount > 0` (worker path)
  - Clear retry timeout on disconnect (both paths)
- **Evidence:** `src/hooks/use-version-sse.ts:183-193` - existing error handling

### Edge case: Tab closes without sending disconnect

- **Surface:** Worker MessagePort
- **Handling:**
  - Worker listens for MessagePort close event (`port.onmessageerror` or browser GC)
  - Decrement activePortsCount when port closes
  - If activePortsCount reaches 0, close EventSource
- **Guardrails:** Must not rely solely on explicit disconnect messages
- **Evidence:** New logic - browser port lifecycle handling

### Edge case: Multiple tabs connect simultaneously

- **Surface:** Worker receives multiple `{ type: 'connect' }` messages before EventSource opens
- **Handling:**
  - Worker creates EventSource on first connect
  - Subsequent connect messages add ports to array but do not create new EventSource
  - All ports receive `{ type: 'connected' }` when EventSource onopen fires
- **Guardrails:** Check `if (!eventSource || eventSource.readyState === CLOSED)` before creating
- **Evidence:** New logic - race condition handling

### Edge case: Version update arrives before tab finishes connecting

- **Surface:** Worker receives SSE `version` event while new tab is still connecting
- **Handling:**
  - Worker stores `currentVersion`
  - When new tab sends `{ type: 'connect' }`, worker immediately sends `{ type: 'version', version: currentVersion }`
  - Tab receives version before or concurrent with `{ type: 'connected' }`
- **Guardrails:** Hook handles out-of-order messages (version before connected)
- **Evidence:** New logic - optimization to reduce time-to-version for new tabs

### Edge case: Test mode with multiple Playwright workers

- **Surface:** Each Playwright worker runs isolated frontend+backend
- **Handling:**
  - Test mode uses direct EventSource path (no SharedWorker)
  - No cross-worker state sharing
  - Identical behavior to current implementation
- **Guardrails:** `isTestMode()` disables SharedWorker by default
- **Evidence:** `src/hooks/use-version-sse.ts:87,92` - test mode checks

### Validation: URL parameter parsing

- **Surface:** `window.location.search` parsing for `?__sharedWorker`
- **Handling:**
  - Use `new URLSearchParams(window.location.search).has('__sharedWorker')`
  - Ignore parameter value; presence enables SharedWorker
- **Guardrails:** URLSearchParams handles encoding edge cases
- **Evidence:** New logic - standard DOM API

## 9) Observability / Instrumentation

### Signal: SSE test events (kind: 'sse')

- **Type:** Instrumentation event
- **Trigger:**
  - `phase: 'open'` when connection opens (EventSource onopen or worker `{ type: 'connected' }`)
  - `phase: 'message'` when version event received
  - `phase: 'error'` on connection error
  - `phase: 'close'` on explicit disconnect
- **Labels / fields:**
  - `streamId: 'deployment.version'`
  - `event: 'connected' | 'version'`
  - `data: { requestId, correlationId, version?, connectionType? }`
- **Consumer:** Playwright `waitForSseEvent()` helper
- **Evidence:**
  - `src/hooks/use-version-sse.ts:122-134,142-156` - existing emissions
  - `tests/support/helpers/test-events.ts` - extraction helpers
  - `tests/e2e/deployment/deployment-banner.spec.ts:28-64` - test assertions

### Signal: Console logs (worker debug)

- **Type:** Console log (development only)
- **Trigger:**
  - Worker startup: "Version SSE worker: started"
  - Tab connect: "Version SSE worker: tab connected (N active ports)"
  - Tab disconnect: "Version SSE worker: tab disconnected (N active ports)"
  - EventSource state changes: "Version SSE worker: SSE opened", "Version SSE worker: SSE error"
- **Labels / fields:** Active port count, EventSource readyState
- **Consumer:** Developer console during local debugging
- **Evidence:** New logging - standard SharedWorker debugging pattern

### Signal: SharedWorker connection type metadata (optional)

- **Type:** Instrumentation event metadata
- **Trigger:** All SSE test events when using SharedWorker path
- **Labels / fields:** `data.connectionType: 'shared'` (vs `'direct'` for fallback path)
- **Consumer:** Test debugging, analytics (future)
- **Evidence:** `src/types/test-events.ts:115` - optional `data` field extension

### Signal: Test bridge availability

- **Type:** Window property (`window.__deploymentSseControls`)
- **Trigger:** Registered by deployment context provider in test mode
- **Labels / fields:** Same as current implementation (unchanged)
- **Consumer:** Playwright `deploymentSse` fixture
- **Evidence:** `src/contexts/deployment-context-provider.tsx:114-154` - existing bridge

## 10) Lifecycle & Background Work

### Hook / effect: useEffect cleanup (tab disconnect)

- **Trigger cadence:** On component unmount (tab close, navigation away from app)
- **Responsibilities:**
  - SharedWorker path: Send `{ type: 'disconnect' }` to worker, close MessagePort
  - Direct path: Close EventSource, clear retry timeout
- **Cleanup:** Effect return function calls disconnect callback
- **Evidence:** `src/hooks/use-version-sse.ts:203-206` - existing cleanup, extend for SharedWorker

### Hook / effect: Worker message listener (SharedWorker path)

- **Trigger cadence:** On worker port.onmessage (async, event-driven)
- **Responsibilities:**
  - Listen for `{ type: 'connected' | 'version' | 'error' | 'disconnected' }` messages
  - Update hook state (`isConnected`, `version`)
  - Emit SSE test events
- **Cleanup:** Remove port.onmessage listener on unmount
- **Evidence:** New logic - MessagePort lifecycle

### Hook / effect: EventSource listeners (direct path, unchanged)

- **Trigger cadence:** On EventSource events (onopen, onmessage, onerror)
- **Responsibilities:** Same as current implementation
- **Cleanup:** EventSource.close() on unmount
- **Evidence:** `src/hooks/use-version-sse.ts:118-193` - existing listeners

### Worker: SharedWorker onconnect handler

- **Trigger cadence:** When new tab creates SharedWorker instance
- **Responsibilities:**
  - Extract MessagePort from event.ports[0]
  - Set up port.onmessage listener for tab commands
  - Add port to connected ports array
- **Cleanup:** Remove port from array on disconnect or port close
- **Evidence:** New logic - SharedWorker entrypoint

### Worker: EventSource retry loop

- **Trigger cadence:** On EventSource onerror, with exponential backoff
- **Responsibilities:**
  - Calculate delay: `Math.min(1000 * 2^(retryCount - 1), 60000)`
  - Schedule reconnection with setTimeout
  - Check `activePortsCount > 0` before retrying
- **Cleanup:** Clear timeout when activePortsCount reaches 0
- **Evidence:** `src/hooks/use-version-sse.ts:101-116` - existing retry logic to replicate

## 11) Security & Permissions

Not applicable - no authentication, authorization, or data exposure changes. SharedWorker runs in same origin and security context as direct EventSource path.

## 12) UX / UI Impact

No user-visible changes to UI. Version banner behavior remains identical. Performance improvement (reduced connection churn) is transparent to users.

## 13) Deterministic Test Plan

### Surface: SharedWorker multi-tab behavior

- **Scenarios:**
  - **Given** SharedWorker is enabled (`?__sharedWorker` in production mode), **When** two tabs open and connect, **Then** both tabs receive version updates from single SSE connection
  - **Given** SharedWorker has 2 connected tabs, **When** one tab closes, **Then** remaining tab continues receiving version updates without reconnection
  - **Given** SharedWorker has 1 connected tab, **When** that tab closes, **Then** worker closes SSE connection and stops emitting events
  - **Given** SharedWorker SSE connection errors, **When** error occurs, **Then** all connected tabs receive error notification and worker retries with exponential backoff

- **Instrumentation / hooks:**
  - Use `?__sharedWorker` URL parameter to enable in test mode
  - Assert SSE test events (`kind: 'sse', streamId: 'deployment.version'`) via `waitForSseEvent()`
  - Assert `data.connectionType === 'shared'` in events (if implemented)
  - Use Playwright multi-context API to simulate multiple tabs

- **Gaps:**
  - Backend coordination: Use existing `POST /api/testing/deployments/version` endpoint (no changes needed)
  - MessagePort visibility: Cannot directly observe worker internal state; rely on SSE events and version delivery

- **Evidence:**
  - New spec: `tests/e2e/deployment/shared-worker-version-sse.spec.ts`
  - Existing pattern: `tests/e2e/deployment/deployment-banner.spec.ts:1-130`

### Surface: Direct EventSource fallback (dev/test mode)

- **Scenarios:**
  - **Given** dev mode (`import.meta.env.DEV = true`), **When** tab connects, **Then** direct EventSource is used (not SharedWorker)
  - **Given** test mode without `?__sharedWorker`, **When** tab connects, **Then** direct EventSource is used
  - **Given** browser lacks SharedWorker support, **When** tab connects, **Then** direct EventSource is used

- **Instrumentation / hooks:**
  - Assert `data.connectionType === 'direct'` in SSE test events (if implemented)
  - Verify existing test `deployment-banner.spec.ts` continues passing without changes

- **Gaps:** None - fallback reuses existing code paths

- **Evidence:** `tests/e2e/deployment/deployment-banner.spec.ts:1-130` - must continue passing

### Surface: Worker lifecycle and cleanup

- **Scenarios:**
  - **Given** worker has no connected tabs, **When** checked after last disconnect, **Then** EventSource is closed and no retry timers are active
  - **Given** worker is retrying connection, **When** last tab disconnects during retry delay, **Then** scheduled retry is canceled

- **Instrumentation / hooks:**
  - Use Playwright to open/close tabs with `?__sharedWorker`
  - Assert no SSE events emitted after all tabs disconnect
  - Check network traffic (Playwright Network tab) confirms SSE connection closes

- **Gaps:**
  - Cannot directly inspect SharedWorker internal timers; rely on SSE closure observable via network

- **Evidence:** New test scenarios

## 14) Implementation Slices

### Slice 1: Worker infrastructure

- **Goal:** Ship SharedWorker script with SSE connection and MessagePort broadcasting
- **Touches:**
  - Create `src/workers/version-sse-worker.ts`
  - No vite.config.ts changes required (Vite handles worker bundling implicitly via `new URL()` syntax)
  - Add console logging for debugging (guarded by `import.meta.env.DEV` check passed from tabs)
  - Include test event metadata in messages when test mode is active
- **Dependencies:** None

### Slice 2: Hook integration

- **Goal:** Modify `useVersionSSE` to detect environment and use SharedWorker or fallback
- **Touches:**
  - `src/hooks/use-version-sse.ts` - add SharedWorker path alongside existing EventSource path
  - Environment detection logic (`shouldUseSharedWorker`)
  - URL parameter parsing (`?__sharedWorker`)
- **Dependencies:** Slice 1 (worker must exist)

### Slice 3: Test instrumentation parity

- **Goal:** Ensure SSE test events emit identically in both SharedWorker and direct paths
- **Touches:**
  - `src/hooks/use-version-sse.ts` - emit events in SharedWorker message handlers
  - `src/types/test-events.ts` - optional `connectionType` metadata
- **Dependencies:** Slice 2 (SharedWorker path must be functional)

### Slice 4: Playwright coverage

- **Goal:** Ship automated tests for SharedWorker-specific scenarios
- **Touches:**
  - Create `tests/e2e/deployment/shared-worker-version-sse.spec.ts`
  - Multi-tab scenarios, worker lifecycle, error handling
  - Verify existing `deployment-banner.spec.ts` still passes (direct path)
- **Dependencies:** Slice 3 (instrumentation must be complete)

## 15) Risks & Open Questions

### Risk: Vite worker bundling issues

- **Impact:** SharedWorker script may fail to load if Vite config is incorrect
- **Mitigation:** Test worker bundling locally with `pnpm build && pnpm preview`; add explicit `worker.format: 'es'` to Vite config if needed

### Risk: MessagePort closure detection inconsistency

- **Impact:** Worker may not decrement activePortsCount if tab closes without sending disconnect, leading to zombie SSE connection
- **Mitigation:** Implement both explicit disconnect handler AND port close event listener; test tab force-close scenarios

### Risk: SharedWorker state persistence across page reloads

- **Impact:** Worker may persist version state from previous session if not properly reset
- **Mitigation:** Worker resets `currentVersion` to null when activePortsCount reaches 0; new connection starts fresh

### Risk: Test mode URL parameter collision

- **Impact:** If URL already has query params, `?__sharedWorker` may conflict or be ignored
- **Mitigation:** Use `URLSearchParams.has()` which handles `?foo&__sharedWorker` and `?__sharedWorker&bar` correctly

### Risk: iOS Safari fallback not tested

- **Impact:** Fallback to direct EventSource on iOS may fail if detection logic is incorrect
- **Mitigation:** Add `typeof SharedWorker === 'undefined'` check before attempting SharedWorker creation; log fallback reason to console

### Open Question: Should worker emit its own console logs in production?

- **Why it matters:** Console logs help debugging but add noise; need decision on production logging level
- **Owner / follow-up:** Use `import.meta.env.DEV` guard around worker console logs; production only logs errors

### Open Question: Should `connectionType` metadata be added to test events?

- **Why it matters:** Helps debug which path (shared vs direct) was used, but adds payload size
- **Owner / follow-up:** Implement as optional metadata in `data` field; omit if not needed for debugging

### Open Question: Should Vite config explicitly define worker entry point?

- **Why it matters:** Implicit worker detection may fail; explicit config is more reliable
- **Owner / follow-up:** Test implicit bundling first (`new SharedWorker('/src/workers/...')`); add explicit config only if build fails

## 16) Confidence

Confidence: High — The SharedWorker API is well-specified, the worker pattern is straightforward (single SSE connection + MessagePort broadcast), environment detection logic is simple (boolean checks), fallback to existing direct EventSource path provides safety net, and existing test infrastructure (SSE events, deployment fixture) provides deterministic verification. Main risk is Vite worker bundling configuration, mitigated by local build testing.
