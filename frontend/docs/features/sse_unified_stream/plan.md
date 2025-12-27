# SSE Unified Stream Implementation Plan

## 0) Research Log & Findings

**Discovery Summary**

Reviewed the existing SSE infrastructure to understand the current architecture and prepare for the unified stream migration:

- **Version SSE Worker** (`src/workers/version-sse-worker.ts:1-364`): SharedWorker managing version SSE with connection pooling, retry logic, test instrumentation, and broadcasts to all connected tabs. Currently connects to `/api/sse/utils/version`.

- **useVersionSSE Hook** (`src/hooks/use-version-sse.ts:1-363`): Routes between SharedWorker (production) and direct EventSource (dev/test/iOS). Contains comprehensive retry logic, test instrumentation via `SseTestEvent` with `streamId: 'deployment.version'`, and integration with `DeploymentProvider`.

- **useSSETask Hook** (`src/hooks/use-sse-task.ts:1-203`): Manages per-task SSE connections via EventSource. Current API: `connect(streamUrl)` / `disconnect()`. Listens for `task_event` SSE events and auto-disconnects on task completion/failure. No test instrumentation currently.

- **useAIPartAnalysis Hook** (`src/hooks/use-ai-part-analysis.ts:109-114`): Extracts `task_id` and `stream_url` from POST response, constructs absolute stream URL, and calls `useSSETask.connect(absoluteStreamUrl)`.

- **Test Infrastructure**:
  - `SseTestEvent` type defined in `src/types/test-events.ts:110-116` with `streamId`, `phase`, `event`, `data`.
  - `tests/support/helpers/deployment-sse.ts` provides Playwright helpers via `window.__deploymentSseControls` bridge.
  - `tests/support/helpers/sse-mock.ts` provides SSE mocking *only* for AI analysis streams (restricted by `testing/no-route-mocks` lint rule).
  - No existing task SSE test helpers—AI analysis tests use mocks, deployment tests use real backend.

- **Deployment Context** (`src/contexts/deployment-context-provider.tsx:1-170`): Wraps `useVersionSSE` and provides deployment version tracking. Exposes test controls via `window.__deploymentSseControls` bridge in test mode.

**Key Findings**

1. The worker already has comprehensive test instrumentation (`__testEvent` metadata in messages, `createTestEvent` helper) but no consumers currently use it in SharedWorker mode.
2. Task SSE has no instrumentation—will need to add `SseTestEvent` emissions with a distinct `streamId` (e.g., `task`).
3. The backend change is complete—new endpoint is `/api/sse/stream?request_id=X`, broadcasts both `version` and `task_event` events, and no longer returns `stream_url` in task responses.
4. iOS Safari fallback pattern is established in `useVersionSSE.ts:45-67`—same routing logic will apply to unified SSE provider.
5. Request ID generation lives in `src/lib/config/sse-request-id.ts:13-20` with per-tab caching and test bridge for resets.

**Resolved Conflicts**

- How to handle request ID lifecycle: Worker will generate and own the request ID on first connection, persist it for the worker lifetime, and reuse it across reconnections (aligns with version worker's `currentRequestId` pattern).
- iOS fallback strategy: New SSE provider will replicate the `shouldUseSharedWorker()` logic—direct EventSource connection with client-side filtering when SharedWorker is unavailable.
- Test coverage approach: Extend existing deployment SSE helpers to support task event injection and subscriptions; add instrumentation to unified worker and hook.

---

## 1) Intent & Scope

**User intent**

Migrate from multiple SSE connections (version + per-task) to a single unified SSE stream managed by a SharedWorker. This resolves Chrome's HTTP/1.1 connection limit (6 per origin) and simplifies connection management by broadcasting all events (version updates and task events) to all tabs, with client-side filtering by `task_id`.

**Prompt quotes**

From `docs/features/sse_unified_stream/change_brief.md`:

- "The application currently opens multiple SSE connections which can exhaust Chrome's HTTP/1.1 connection limit"
- "The backend has been redesigned to use a single unified SSE endpoint: `/api/sse/stream?request_id=X`"
- "All events (version updates and task events) are broadcast to all connections"
- "Task events include `task_id` for client-side filtering"
- "`stream_url` removed from `TaskStartResponse` - only `task_id` is returned"
- "Rename `src/workers/version-sse-worker.ts` to `src/workers/sse-worker.ts`"
- "Create a new SSE context provider (`SseContextProvider`) that manages the SharedWorker connection lifecycle"
- "Change from connection-based to subscription-based: `subscribeToTask(taskId)` / `unsubscribe()`"

**In scope**

- Rename and extend `version-sse-worker.ts` → `sse-worker.ts` to handle both `version` and `task_event` events
- Worker generates and owns persistent `request_id` for its lifetime
- Create `SseContextProvider` to manage unified SSE connection and provide event stream to consumers
- Update `useVersionSSE` to consume version events from the unified provider
- Rewrite `useSSETask` from connection-based (`connect(streamUrl)`) to subscription-based (`subscribeToTask(taskId)`)
- Update `use-ai-part-analysis.ts` to extract `task_id` (not `stream_url`) and subscribe via new API
- Add task event instrumentation (`SseTestEvent` with `streamId: 'task'`)
- Extend test infrastructure to support task event injection and subscription testing
- Update existing deployment SSE specs for new endpoint

**Out of scope**

- Backend changes (already complete per change brief)
- Changes to SSE event payload formats (backend contract is fixed)
- Connection pooling beyond single shared connection
- Modifications to AI analysis mocking strategy (remains sanctioned exception per `testing/no-route-mocks`)
- Performance optimizations unrelated to connection consolidation

**Assumptions / constraints**

- Backend `/api/sse/stream?request_id=X` endpoint is live and stable
- Backend broadcasts all events to all connections; no server-side subscription filtering
- Task events always include `task_id` field for client-side filtering
- `TaskStartResponse` no longer includes `stream_url` (only `task_id`)
- iOS Safari lacks SharedWorker support—fallback to direct EventSource with client-side filtering
- SharedWorker disabled in dev mode and test mode (unless `?__sharedWorker` parameter present) per existing `shouldUseSharedWorker()` logic
- Test mode must support both real backend task events and AI analysis mocks without interception
- Instrumentation must be backward-compatible with existing deployment SSE test helpers

---

## 2) Affected Areas & File Map

### Worker Layer

- **Area**: `src/workers/version-sse-worker.ts` → `src/workers/sse-worker.ts`
  - **Why**: Rename to reflect unified responsibilities; extend to handle `task_event` events in addition to `version` events; generate and own `request_id` instead of receiving it from tabs; broadcast all events to all tabs without filtering.
  - **Evidence**: Current worker at `src/workers/version-sse-worker.ts:1-364` connects to `/api/sse/utils/version?request_id=X` (line 143), listens for `version` event (line 170), and broadcasts via `ports.forEach` (line 51-64). New worker will connect to `/api/sse/stream?request_id=X` and listen for both `version` and `task_event`.

### Context Layer

- **Area**: `src/contexts/sse-context-provider.tsx` (new file)
  - **Why**: Create unified SSE provider to manage SharedWorker connection lifecycle, expose event stream to consumers, handle iOS Safari fallback, and separate SSE concerns from deployment-specific logic.
  - **Evidence**: Pattern established in `src/contexts/deployment-context-provider.tsx:1-170` which wraps `useVersionSSE`. New provider will offer similar lifecycle management but expose raw event streams instead of version-specific state.

- **Area**: `src/contexts/sse-context-base.ts` (new file)
  - **Why**: Define context shape, types, and default values for unified SSE context (follows pattern from `deployment-context-base.ts`).
  - **Evidence**: Existing base files like `src/contexts/deployment-context-base.ts` separate type definitions from provider implementation.

- **Area**: `src/contexts/sse-context.ts` (new file)
  - **Why**: Export hook to consume SSE context (e.g., `useSseContext()`).
  - **Evidence**: Pattern from `src/contexts/deployment-context.ts` which exports `useDeployment()` hook.

### Hook Layer

- **Area**: `src/hooks/use-version-sse.ts`
  - **Why**: Refactor to consume version events from `SseContextProvider` instead of managing its own connection; remove SharedWorker and direct EventSource logic (delegated to provider).
  - **Evidence**: Lines 69-362 implement connection management, SharedWorker routing, and retry logic. After refactor, hook will subscribe to version events from context and maintain only the version-specific state (`isConnected`, `version`).

- **Area**: `src/hooks/use-sse-task.ts`
  - **Why**: Rewrite from connection-based to subscription-based; API changes from `connect(streamUrl)` / `disconnect()` to `subscribeToTask(taskId)` / `unsubscribe()`; consume task events from `SseContextProvider` and filter by `task_id`; emit `SseTestEvent` instrumentation for task lifecycle.
  - **Evidence**: Lines 46-181 manage EventSource connection per task. New implementation will subscribe to shared event stream from context, filter `task_event` events by `task_id`, and maintain progress/result/error state.

- **Area**: `src/hooks/use-ai-part-analysis.ts`
  - **Why**: Remove `stream_url` extraction and absolute URL construction; use `task_id` from response to subscribe via `useSSETask.subscribeToTask(taskId)`.
  - **Evidence**: Lines 109-114 extract `stream_url` from response and construct absolute URL. Lines 131 call `connectSSE(absoluteStreamUrl)`. New code will extract `task_id` and call `subscribeToTask(taskId)`.

- **Area**: `src/contexts/deployment-context-provider.tsx`
  - **Why**: Remove `connect()` and `disconnect()` calls now that connection lifecycle is managed by `SseContextProvider`. The hook API changes from exposing connection methods to being auto-connected via context.
  - **Evidence**: Lines 52 and 97 call `connect()` / `disconnect()` on `useVersionSSE`. These calls become unnecessary when `SseContextProvider` manages the connection lifecycle automatically on mount/unmount.

### Type Definitions

- **Area**: `src/types/test-events.ts`
  - **Why**: No changes required—`SseTestEvent` type already supports task events via `streamId` field. Will use `streamId: 'task'` for task events vs `streamId: 'deployment.version'` for version events.
  - **Evidence**: Lines 110-116 define `SseTestEvent` with `streamId: string` allowing arbitrary stream identifiers.

- **Area**: `src/workers/sse-worker.ts` (type definitions)
  - **Why**: Extend `WorkerMessage` union to include task event messages; add task event payload types.
  - **Evidence**: Lines 19-23 define `WorkerMessage` union for version-only messages. Will add `{ type: 'task_event'; taskId: string; eventType: string; data: unknown; __testEvent?: TestEventMetadata }`.

### Test Infrastructure

- **Area**: `tests/support/helpers/sse-task.ts` (new file)
  - **Why**: Create Playwright helpers for task SSE testing: inject task events via backend, wait for task subscriptions, assert task event sequences.
  - **Evidence**: Pattern from `tests/support/helpers/deployment-sse.ts:1-105` which provides deployment SSE helpers. New helpers will support task-specific operations.

- **Area**: `tests/support/helpers/deployment-sse.ts`
  - **Why**: Update helpers to work with new `/api/sse/stream` endpoint instead of `/api/sse/utils/version`.
  - **Evidence**: Lines 33-41 call `window.__deploymentSseControls.getStatus()`. Bridge contract remains the same, but underlying implementation will route through unified worker.

- **Area**: `tests/e2e/deployment/shared-worker-version-sse.spec.ts`
  - **Why**: Update specs to expect new endpoint and verify both version and task events can coexist.
  - **Evidence**: Existing spec tests SharedWorker version SSE. Will extend to verify unified stream broadcasts both event types.

### Configuration

- **Area**: `src/lib/config/sse-request-id.ts`
  - **Why**: May need adjustments if request ID generation moves to worker, but likely no changes needed since worker can import this module.
  - **Evidence**: Lines 13-20 implement `getDeploymentRequestId()` with per-tab caching. Worker will generate its own ID instead of reusing tab IDs, so this module remains for backward compatibility with deployment context.

---

## 3) Data Model / Contracts

### Worker Message Protocol

- **Entity / contract**: `WorkerMessage` union (tab ← worker messages)
  - **Shape**:
    ```typescript
    type WorkerMessage =
      | { type: 'connected'; requestId: string; __testEvent?: TestEventMetadata }
      | { type: 'version'; version: string; correlationId?: string; requestId?: string; __testEvent?: TestEventMetadata }
      | { type: 'task_event'; taskId: string; eventType: string; data: unknown; __testEvent?: TestEventMetadata }
      | { type: 'disconnected'; reason?: string; __testEvent?: TestEventMetadata }
      | { type: 'error'; error: string; __testEvent?: TestEventMetadata };
    ```
  - **Mapping**: Worker broadcasts `task_event` messages to all ports. Tabs filter by `taskId` in subscription logic.
  - **Evidence**: Current definition at `src/workers/version-sse-worker.ts:19-23` for version-only messages.

### SSE Event Payloads (Backend → Worker)

- **Entity / contract**: Version SSE event
  - **Shape**: `{ event: "version", data: { version: string, correlation_id?: string, request_id?: string } }`
  - **Mapping**: Worker extracts `version` and forwards to tabs via `WorkerMessage` type `version`.
  - **Evidence**: Parsed at `src/workers/version-sse-worker.ts:170-203` and `src/hooks/use-version-sse.ts:196-223`.

- **Entity / contract**: Task SSE event
  - **Shape**: `{ event: "task_event", data: { task_id: string, event_type: string, data: {...} } }`
  - **Mapping**: Worker extracts `task_id`, `event_type`, `data` and forwards to tabs via `WorkerMessage` type `task_event`.
  - **Evidence**: Current task event structure from `src/hooks/use-sse-task.ts:3-35` defines `SSEProgressEvent`, `SSEResultEvent`, `SSEErrorEvent`, `SSEStartedEvent` with `event_type` field. Backend wraps these in `task_event` envelope with `task_id`.

### SSE Context Value

- **Entity / contract**: `SseContextValue` (React context)
  - **Shape**:
    ```typescript
    interface SseContextValue {
      isConnected: boolean;
      requestId: string | null;
      registerVersionListener: (callback: (event: VersionEventData) => void) => () => void;
      registerTaskListener: (callback: (event: TaskEventData) => void) => () => void;
    }
    ```
  - **Mapping**: Provider manages connection state and exposes callback-based event registration. Consumers (useVersionSSE, useSSETask) call `registerVersionListener` or `registerTaskListener` to subscribe, receiving a cleanup function that removes the listener when called. This pattern avoids external Observable library dependencies and aligns with React's cleanup patterns (returning unsubscribe from useEffect).
  - **Evidence**: Pattern from `src/contexts/deployment-context-base.ts` which defines typed context values; callback registration follows React conventions.

### Test Event Payloads

- **Entity / contract**: `SseTestEvent` for task events
  - **Shape**:
    ```typescript
    {
      kind: 'sse',
      streamId: 'task',
      phase: 'open' | 'message' | 'error' | 'close',
      event: string, // e.g., 'task_started', 'progress_update', 'task_completed'
      data?: { taskId: string, eventType: string, ... }
    }
    ```
  - **Mapping**: Worker includes `__testEvent` metadata in `task_event` messages when any connected port is in test mode.
  - **Evidence**: Existing pattern at `src/workers/version-sse-worker.ts:69-82` for version events with `streamId: 'deployment.version'`.

---

## 4) API / Integration Surface

### Unified SSE Endpoint

- **Surface**: `GET /api/sse/stream?request_id={uuid}`
  - **Inputs**: Query parameter `request_id` (unique per connection, worker-generated)
  - **Outputs**: SSE stream emitting `version` and `task_event` events; connection remains open until client disconnect or server timeout
  - **Errors**: Connection errors trigger worker retry with exponential backoff; backend may send `connection_close` event for graceful shutdown
  - **Evidence**: Documented in change brief; existing `/api/sse/utils/version` endpoint at `src/workers/version-sse-worker.ts:143` follows same pattern with different path

### Task Start Endpoint

- **Surface**: `POST /api/ai-parts/analyze`
  - **Inputs**: `FormData` with `text` and/or `image` fields
  - **Outputs**: `{ task_id: string }` (no `stream_url` field)
  - **Errors**: 400/500 errors handled by `use-ai-part-analysis.ts:103-106`; toast notifications via error instrumentation
  - **Evidence**: Current implementation at `src/hooks/use-ai-part-analysis.ts:98-114` expects both `task_id` and `stream_url`; will change to expect only `task_id`

### SharedWorker Port Protocol

- **Surface**: `MessagePort` communication (tab → worker commands)
  - **Inputs**:
    ```typescript
    type TabCommand =
      | { type: 'connect'; isTestMode?: boolean } // requestId removed
      | { type: 'disconnect' };
    ```
  - **Outputs**: `WorkerMessage` broadcasts to all connected ports
  - **Errors**: Port errors trigger cleanup and removal from `ports` set
  - **Evidence**: Current protocol at `src/workers/version-sse-worker.ts:25-27` includes `requestId` in connect command; new protocol removes it since worker generates its own ID

### SSE Context API (React)

- **Surface**: `useSseContext()` hook
  - **Inputs**: None (context provider must be ancestor)
  - **Outputs**: `{ isConnected, requestId, registerVersionListener, registerTaskListener }`
  - **Errors**: Throws if called outside `SseContextProvider`
  - **Evidence**: Pattern from `src/contexts/deployment-context.ts` which exports `useDeployment()` hook

### useVersionSSE Hook (Updated API)

- **Surface**: `useVersionSSE()` hook
  - **Inputs**: None (no longer accepts `connect(options)` parameters—provider handles connection)
  - **Outputs**: `{ isConnected: boolean, version: string | null }`
  - **Errors**: Connection errors reflected in `isConnected` state; no user-facing errors (silent retry via provider)
  - **Breaking change**: `connect()` and `disconnect()` methods are removed—connection lifecycle is managed by `SseContextProvider`. `DeploymentProvider` will be updated to remove these calls (`src/contexts/deployment-context-provider.tsx:52, 97`) and rely on provider auto-connect behavior triggered by component mount.
  - **Evidence**: Current API at `src/hooks/use-version-sse.ts:20-25` exposes `connect`/`disconnect`; these are removed in favor of context-managed connection

### useSSETask Hook (New API)

- **Surface**: `useSSETask<T>(options)` hook
  - **Inputs**:
    ```typescript
    interface UseSSETaskOptions {
      onProgress?: (message: string, percentage?: number) => void;
      onResult?: <T>(data: T) => void;
      onError?: (message: string, code?: string) => void;
    }
    ```
  - **Outputs**:
    ```typescript
    {
      subscribeToTask: (taskId: string) => void;
      unsubscribe: () => void;
      isSubscribed: boolean;
      error: string | null;
      result: T | null;
      progress: { message: string; percentage?: number } | null;
    }
    ```
  - **Errors**: Task failures emit via `onError` callback and set `error` state; test mode emits `SseTestEvent` with phase `error`
  - **Evidence**: Current API at `src/hooks/use-sse-task.ts:45-55`; renamed methods and removed `isConnected` (replaced with `isSubscribed`)

---

## 5) Algorithms & UI Flows

### Worker Connection Lifecycle

- **Flow**: Worker initialization and SSE connection
- **Steps**:
  1. Worker script loads when first tab calls `new SharedWorker(...)` (iOS fallback: skip to direct connection in provider)
  2. Worker generates persistent `request_id` via `makeUniqueToken(32)` on first connection attempt
  3. Worker opens EventSource to `/api/sse/stream?request_id={id}`
  4. On `onopen`, worker broadcasts `{ type: 'connected', requestId }` to all ports
  5. On `version` event, worker broadcasts `{ type: 'version', version, ... }` to all ports
  6. On `task_event` event, worker parses `task_id` and broadcasts `{ type: 'task_event', taskId, eventType, data }` to all ports
  7. On error, worker closes connection, schedules retry with exponential backoff (capped at 60s)
  8. When last tab disconnects, worker closes EventSource and resets state
- **States / transitions**: `CONNECTING` → `OPEN` → `CLOSED` (on error/disconnect) → retry → `CONNECTING`
- **Hotspots**: Retry backoff under heavy error conditions; port cleanup on tab crashes
- **Evidence**: Existing flow at `src/workers/version-sse-worker.ts:129-241` for version events; extended to handle task events

### Tab Connection to Worker

- **Flow**: Tab subscribes to unified SSE stream
- **Steps**:
  1. `SseContextProvider` mounts and checks `shouldUseSharedWorker()`
  2. If true: create `SharedWorker`, call `port.postMessage({ type: 'connect', isTestMode: isTestMode() })`
  3. If false (dev/test/iOS): create direct `EventSource` to `/api/sse/stream?request_id={tabId}`
  4. On `port.onmessage` (or `EventSource` listener), parse `WorkerMessage` and dispatch to event streams
  5. `versionEvents` stream emits when `message.type === 'version'`
  6. `taskEvents` stream emits when `message.type === 'task_event'`
  7. Provider exposes connection state (`isConnected`) to consumers
  8. On unmount, send `{ type: 'disconnect' }` (or close EventSource)
- **States / transitions**: `disconnected` → `connecting` → `connected` → `disconnected` (on unmount)
- **Hotspots**: Concurrent tab opens may race to create worker; SharedWorker constructor handles deduplication
- **Evidence**: Pattern from `src/hooks/use-version-sse.ts:260-323` for SharedWorker connection; migrated to provider layer

### Task Subscription Lifecycle

- **Flow**: Subscribe to task events by `task_id`
- **Steps**:
  1. `useSSETask` calls `subscribeToTask(taskId)` when task starts
  2. Hook registers listener on `taskEvents` stream from `useSseContext()`
  3. On each `taskEvent`, filter by `event.taskId === taskId`
  4. Parse `event.eventType` to determine progress/result/error
  5. Update local state (`progress`, `result`, `error`) and invoke callbacks (`onProgress`, `onResult`, `onError`)
  6. On `task_completed` or `task_failed`, call `unsubscribe()` to remove listener (connection stays open)
  7. Emit `SseTestEvent` with `streamId: 'task'` and `phase: 'message'` for each task event in test mode
- **States / transitions**: `idle` → `subscribed` (listening for taskId) → `completed` (unsubscribed) | `failed` (unsubscribed)
- **Hotspots**: Multiple concurrent task subscriptions in same tab—must handle overlapping `task_id` filters
- **Evidence**: Current event parsing at `src/hooks/use-sse-task.ts:108-156`; subscription pattern new

### AI Analysis Flow (Updated)

- **Flow**: Trigger AI analysis and subscribe to task progress
- **Steps**:
  1. User submits part data via `analyzePartFromData({ text, image })`
  2. Hook POSTs to `/api/ai-parts/analyze` with FormData
  3. Extract `task_id` from response (ignore missing `stream_url`)
  4. Call `subscribeToTask(taskId)` to register listener
  5. Hook receives task events via `taskEvents` stream, filtered by `task_id`
  6. Progress updates invoke `onProgress` callback, update UI
  7. On success (`task_completed`), transform result and invoke `onSuccess`
  8. On failure, emit error and invoke `onError`
- **States / transitions**: `idle` → `analyzing` → `completed` | `failed`
- **Hotspots**: Large image uploads may delay task start; SSE stream may deliver events before tab fully renders
- **Evidence**: Current flow at `src/hooks/use-ai-part-analysis.ts:70-144`; updated to use subscription API

---

## 6) Derived State & Invariants

### Current Deployment Version

- **Derived value**: `currentVersion` in `DeploymentProvider`
  - **Source**: `version` from `useVersionSSE`, which subscribes to `versionEvents` stream from `SseContextProvider`
  - **Writes / cleanup**: On first version received, set `currentVersion`; on subsequent mismatches, set `isNewVersionAvailable = true`
  - **Guards**: Version changes only trigger update notification if connection is stable (not during reconnection flicker)
  - **Invariant**: Once `currentVersion` is set, it must not reset to `null` unless connection is permanently lost (not just transient errors)
  - **Evidence**: `src/contexts/deployment-context-provider.tsx:74-85`

### Task Subscription Active State

- **Derived value**: `isSubscribed` in `useSSETask`
  - **Source**: Boolean flag set by `subscribeToTask()` and cleared by `unsubscribe()`
  - **Writes / cleanup**: Subscription registers listener on `taskEvents` stream; unsubscribe removes listener
  - **Guards**: `subscribeToTask()` must be idempotent (ignore if already subscribed to same task); concurrent subscriptions to different tasks allowed
  - **Invariant**: `isSubscribed` must clear when task completes/fails (auto-unsubscribe)
  - **Evidence**: New state derived from refactored hook API

### Worker Request ID

- **Derived value**: `currentRequestId` in worker global state
  - **Source**: Generated via `makeUniqueToken(32)` on first connection attempt, persisted for worker lifetime
  - **Writes / cleanup**: Set once during worker initialization; never reset unless worker terminates
  - **Guards**: All reconnections reuse the same `request_id`; backend must tolerate reconnections with same ID
  - **Invariant**: `request_id` remains stable across all tabs and all EventSource reconnections for the worker's lifetime
  - **Evidence**: Pattern from `src/workers/version-sse-worker.ts:139` which accepts request ID from tab; new worker generates its own

### SSE Connection State

- **Derived value**: `isConnected` in `SseContextProvider`
  - **Source**: `eventSource.readyState === EventSource.OPEN` (direct mode) or `message.type === 'connected'` (SharedWorker mode)
  - **Writes / cleanup**: Set `true` on connection open, `false` on error/close; cleanup on provider unmount disconnects EventSource or worker port
  - **Guards**: Rapid reconnections must debounce state updates to prevent flicker in UI
  - **Invariant**: If SharedWorker is `OPEN` but tab hasn't received `connected` message, `isConnected` remains `false` (conservative)
  - **Evidence**: `src/hooks/use-version-sse.ts:177-179` and `src/workers/version-sse-worker.ts:149-168`

### Test Event Metadata

- **Derived value**: `__testEvent` field in `WorkerMessage`
  - **Source**: Worker checks if any connected port has `isTestMode === true` via `portTestModeMap.get(port)`
  - **Writes / cleanup**: Metadata included in all broadcasts if any port is in test mode; removed when all test-mode ports disconnect
  - **Guards**: Non-test-mode tabs receive messages with `__testEvent` but ignore them; test-mode tabs forward to Playwright bridge
  - **Invariant**: Test events must not affect production behavior (dead-code elimination via `isTestMode()` guards)
  - **Evidence**: `src/workers/version-sse-worker.ts:159-165` and `src/hooks/use-version-sse.ts:281-283`

---

## 7) State Consistency & Async Coordination

### Worker-Tab Synchronization

- **Source of truth**: Worker owns SSE connection and broadcasts to all tabs; tabs maintain local subscriptions and filters
- **Coordination**: Worker uses `ports.forEach()` to broadcast; tabs register event listeners on their port and dispatch to local streams
- **Async safeguards**: Worker validates port before `postMessage` (try/catch wraps port.postMessage at `src/workers/version-sse-worker.ts:58-63`); tabs handle `messageerror` to detect broken ports
- **Instrumentation**: Worker emits `__testEvent` metadata in broadcasts when any port is in test mode; tabs forward to Playwright bridge via `emitTestEvent(message.__testEvent)`
- **Evidence**: `src/workers/version-sse-worker.ts:51-65` for broadcast logic; `src/hooks/use-version-sse.ts:277-307` for port message handling

### Task Event Filtering

- **Source of truth**: Worker broadcasts all `task_event` messages to all tabs; each tab filters by `taskId` in hook
- **Coordination**: `useSSETask` maintains `currentTaskId` ref; listener only processes events where `event.taskId === currentTaskId`
- **Async safeguards**: Unsubscribe removes listener before state cleanup to prevent race between new subscription and stale events; `subscribeToTask()` validates not already subscribed
- **Instrumentation**: Emit `SseTestEvent` with `streamId: 'task'` for each task event processed (after filter succeeds)
- **Evidence**: Pattern from `src/hooks/use-sse-task.ts:108-151` where events are filtered by type; extended to filter by `task_id`

### Provider Event Streams

- **Source of truth**: `SseContextProvider` receives messages from worker/EventSource and dispatches to `versionEvents` / `taskEvents` streams
- **Coordination**: Consumers subscribe to streams via callbacks or observables; provider cleans up listeners on unmount
- **Async safeguards**: Provider deduplicates rapid `connected` messages; retries do not reset derived state (version cache preserved)
- **Instrumentation**: Provider forwards `__testEvent` metadata from worker messages to consumers; consumers emit via `emitTestEvent()`
- **Evidence**: New coordination layer; pattern inspired by `src/contexts/deployment-context-provider.tsx:26-34` managing hook state

### Reconnection Stability

- **Source of truth**: Worker maintains reconnection state (`retryCount`, `retryTimeout`) independent of tab state
- **Coordination**: Tabs observe `isConnected` from provider; provider reflects worker's `connected` / `error` messages
- **Async safeguards**: Exponential backoff caps at 60s; retry cancels if worker terminates (all ports disconnect)
- **Instrumentation**: Emit `SseTestEvent` with `phase: 'error'` on connection failures, `phase: 'open'` on reconnection success
- **Evidence**: `src/workers/version-sse-worker.ts:104-127` for retry scheduling

### Task Completion Cache Invalidation

- **Source of truth**: `useSSETask` receives `task_completed` event with result data
- **Coordination**: Hook invokes `onResult` callback with transformed data; caller (e.g., `use-ai-part-analysis`) decides whether to invalidate React Query cache. Cache invalidation is the responsibility of the consumer hook, not `useSSETask` itself.
- **Async safeguards**: Invalidation occurs after `onResult` callback succeeds; if callback throws, cache remains stale (acceptable—user will retry or see stale data until next query)
- **Instrumentation**: No additional events needed—task completion event already emitted with `streamId: 'task'`
- **Cache invalidation guidance**: If task completion mutates backend state (e.g., AI analysis creates part suggestions), the consumer hook should call `queryClient.invalidateQueries({ queryKey: [...] })` in its `onResult` handler. Current `use-ai-part-analysis.ts:59` invokes `onSuccess` callback which could trigger invalidation at the component level.
- **Evidence**: `use-ai-part-analysis.ts:56-60` shows `onSuccess` callback after analysis completes; extend to include cache invalidation if needed by caller

---

## 8) Errors & Edge Cases

### SSE Connection Failure

- **Failure**: Backend unreachable or returns 5xx
- **Surface**: Worker `eventSource.onerror` handler
- **Handling**: Broadcast `{ type: 'error', error: 'SSE connection error' }` to tabs; schedule reconnection with exponential backoff (1s → 2s → 4s → ... → 60s)
- **Guardrails**: If all tabs disconnect during retry window, cancel retry and close connection; max backoff prevents runaway delays
- **Evidence**: `src/workers/version-sse-worker.ts:218-241`

### Worker Termination

- **Failure**: Browser terminates SharedWorker (e.g., memory pressure)
- **Surface**: Tabs lose connection; next tab action recreates worker
- **Handling**: Provider detects port closure (`messageerror` event), falls back to direct EventSource connection, emits `SseTestEvent` with `phase: 'close'`
- **Guardrails**: iOS Safari already uses direct connection (no SharedWorker); dev/test modes default to direct connection
- **Evidence**: Fallback logic at `src/hooks/use-version-sse.ts:316-322`

### Task Subscription After Task Completion

- **Failure**: `subscribeToTask(taskId)` called for already-completed task
- **Surface**: `useSSETask` hook
- **Handling**: Backend may have already broadcast final event; subscription sees no future events; hook remains in `idle` state with `error: null` and `result: null`
- **Guardrails**: Caller (e.g., `use-ai-part-analysis`) must handle timeout if no events arrive within reasonable window; consider backend cache of recent task events
- **Evidence**: Not currently handled; requires backend coordination or client-side timeout in `subscribeToTask()`

### Multiple Subscriptions to Same Task

- **Failure**: Two components in same tab both call `subscribeToTask(taskId)` for same task
- **Surface**: `useSSETask` hook instances
- **Handling**: Each hook maintains independent listener on `taskEvents` stream; both receive same events and update independently
- **Guardrails**: No conflict—designed to allow multiple consumers; each hook manages its own `progress` / `result` / `error` state
- **Evidence**: Event stream broadcast pattern supports multiple listeners by design

### iOS Safari Fallback

- **Failure**: SharedWorker unsupported (iOS Safari, older browsers)
- **Surface**: `SseContextProvider` when `shouldUseSharedWorker()` returns `false`
- **Handling**: Provider creates direct EventSource connection per tab to `/api/sse/stream?request_id={tabId}`; client-side filtering for both version and task events works identically
- **Guardrails**: Each tab receives all events (version + task), but filtering is local so no cross-contamination; acceptable overhead given iOS tab suspension behavior
- **Evidence**: `src/hooks/use-version-sse.ts:45-67` for detection logic; `src/hooks/use-version-sse.ts:111-253` for direct EventSource path

### Backend Idle Timeout

- **Failure**: Backend closes connection after inactivity (e.g., 5min idle)
- **Surface**: Worker receives `connection_close` event
- **Handling**: Worker closes EventSource cleanly (no retry); tabs reconnect on next user action (e.g., focus event in `DeploymentProvider`)
- **Guardrails**: Deployment context already handles focus-based reconnection at `src/contexts/deployment-context-provider.tsx:100-112`; pattern extends to task subscriptions
- **Evidence**: `src/workers/version-sse-worker.ts:205-216`

### Missing `task_id` in Task Response

- **Failure**: POST `/api/ai-parts/analyze` returns `{ stream_url }` without `task_id` (old backend)
- **Surface**: `use-ai-part-analysis.ts` response parsing
- **Handling**: Throw error `"Invalid response: missing task_id"`; emit to error instrumentation; invoke `onError` callback
- **Guardrails**: Block analysis from starting; user sees toast error; Playwright specs fail fast
- **Evidence**: Current validation at `src/hooks/use-ai-part-analysis.ts:112-114` checks both fields; updated to require only `task_id`

### Test Mode Instrumentation Overhead

- **Failure**: Worker broadcasts `__testEvent` metadata to all tabs even when only one is in test mode
- **Surface**: Worker message broadcasts
- **Handling**: Non-test-mode tabs receive metadata but ignore it (no `emitTestEvent` call); production builds dead-code eliminate the instrumentation
- **Guardrails**: Message size increase is small (few hundred bytes per event); negligible impact on production (metadata absent)
- **Evidence**: `src/workers/version-sse-worker.ts:159-165` conditionally includes metadata based on `hasTestModePorts`

---

## 9) Observability / Instrumentation

### Version SSE Events

- **Signal**: `SseTestEvent` with `streamId: 'deployment.version'`
- **Type**: Test event emitted via Playwright bridge
- **Trigger**: Worker emits when version event received (phase: `message`), connection opens (phase: `open`), or connection errors (phase: `error`)
- **Labels / fields**: `phase`, `event` (e.g., `version`, `connected`), `data: { version, requestId, correlationId }`
- **Consumer**: Playwright helpers `waitTestEvent(page, 'sse', { streamId: 'deployment.version', phase: 'message' })`; existing deployment SSE tests
- **Evidence**: `src/workers/version-sse-worker.ts:161-164` and `src/hooks/use-version-sse.ts:182-193`

### Task SSE Events

- **Signal**: `SseTestEvent` with `streamId: 'task'`
- **Type**: Test event emitted via Playwright bridge
- **Trigger**: `useSSETask` emits when task subscription receives event (phase: `message`), subscription starts (phase: `open`), or task fails (phase: `error`)
- **Labels / fields**: `phase`, `event` (e.g., `task_started`, `progress_update`, `task_completed`), `data: { taskId, eventType, ... }`
- **Consumer**: New Playwright helper `waitForTaskEvent(page, taskId, eventType)` or generic `waitTestEvent(page, 'sse', { streamId: 'task' })`
- **Evidence**: New instrumentation; follows pattern from version events

### Connection State Telemetry

- **Signal**: `data-state` attribute on UI components consuming `useSseContext().isConnected`
- **Type**: DOM attribute for visual debugging
- **Trigger**: Provider updates `isConnected` state; consumers reflect in UI (e.g., `data-state="connected"` vs `data-state="disconnected"`)
- **Labels / fields**: `connected` | `disconnected` | `error`
- **Consumer**: Playwright selectors `page.locator('[data-state="connected"]')`; visual inspection during development
- **Evidence**: Pattern from dashboard widgets using `data-state` attributes for list loading states

### Worker Lifecycle Logs

- **Signal**: `console.debug` messages from worker
- **Type**: Browser console logging (dev-only)
- **Trigger**: Worker logs on connection open, tab connect/disconnect, retry scheduling, error handling
- **Labels / fields**: Contextual info (e.g., `"Version SSE worker: Creating EventSource for requestId=..."`)
- **Consumer**: Developer console for debugging connection issues; not captured by Playwright
- **Evidence**: `src/workers/version-sse-worker.ts:145, 150, 219, 248, 321`

### Test Bridge Registration

- **Signal**: `window.__sseTaskControls` (proposed for task testing)
- **Type**: Test-mode bridge for injecting task events
- **Trigger**: `SseContextProvider` registers bridge in test mode; Playwright calls methods to inject events
- **Labels / fields**: Methods like `emitTaskEvent(taskId, eventType, data)`, `getTaskSubscriptions()`, `clearTaskEvents()`
- **Consumer**: Playwright test helpers to simulate task events from backend
- **Evidence**: Pattern from `window.__deploymentSseControls` at `src/contexts/deployment-context-provider.tsx:123-146`

### iOS Fallback Performance Monitoring

- **Signal**: Event broadcast count per tab in test mode
- **Type**: Console debug logging and test event metadata
- **Trigger**: Each event received by tab in direct EventSource mode (iOS fallback)
- **Labels / fields**: `connectionMode: 'direct'` in test event metadata; console logs event count per second if exceeds threshold
- **Consumer**: Development debugging; performance regression testing
- **Monitoring threshold**: If iOS fallback shows >5 tabs with sustained >10 events/sec, consider iOS-specific throttling or connection pooling as future optimization
- **Evidence**: New monitoring; addresses review concern about iOS fallback overhead

---

## 10) Lifecycle & Background Work

### Worker EventSource Lifecycle

- **Hook / effect**: Worker global `eventSource` connection
- **Trigger cadence**: On first tab connect; persists until last tab disconnects
- **Responsibilities**: Open EventSource to `/api/sse/stream?request_id=X`, listen for `version` / `task_event` events, broadcast to all tabs, handle errors and retry
- **Cleanup**: Close EventSource when `ports.size === 0`; cancel retry timeout on cleanup
- **Evidence**: `src/workers/version-sse-worker.ts:86-99` for cleanup; `src/workers/version-sse-worker.ts:129-241` for connection lifecycle

### Provider Connection Effect

- **Hook / effect**: `useEffect` in `SseContextProvider` to establish SharedWorker or EventSource connection
- **Trigger cadence**: On provider mount; reconnect on requestId change (if applicable)
- **Responsibilities**: Create SharedWorker (or EventSource), send `connect` command, register port listener, update `isConnected` state
- **Cleanup**: Send `disconnect` command (or close EventSource) on unmount; remove port listener
- **Evidence**: New effect; pattern from `src/hooks/use-version-sse.ts:89-98` (deployment context auto-connect) and `src/hooks/use-version-sse.ts:349-354` (cleanup)

### Task Subscription Listener

- **Hook / effect**: `useEffect` in `useSSETask` to register/cleanup task event listener
- **Trigger cadence**: On `subscribeToTask(taskId)` call; cleanup on `unsubscribe()` or unmount
- **Responsibilities**: Register listener on `taskEvents` stream from context, filter by `taskId`, parse events, update state (`progress`, `result`, `error`)
- **Cleanup**: Remove listener on unsubscribe or hook unmount to prevent memory leaks
- **Evidence**: New effect; replaces EventSource connection from `src/hooks/use-sse-task.ts:75-86`

### Version State Synchronization

- **Hook / effect**: `useEffect` in `useVersionSSE` to subscribe to `versionEvents` stream
- **Trigger cadence**: On mount; persists until unmount
- **Responsibilities**: Listen for version events from context, update local `version` state, emit test events if in test mode
- **Cleanup**: Unsubscribe from `versionEvents` stream on unmount
- **Evidence**: New effect; replaces direct EventSource listener from `src/hooks/use-version-sse.ts:196-223`

### Deployment Context SSE Lifecycle

- **Hook / effect**: `useEffect` in `DeploymentProvider` to auto-connect SSE and handle focus events
- **Trigger cadence**: On mount (production mode); on window focus (reconnection)
- **Responsibilities**: Call `checkForUpdates()` to trigger version SSE connection via `useVersionSSE.connect()`; no longer manages connection directly (delegated to `SseContextProvider`)
- **Cleanup**: Disconnect on unmount (production mode)
- **Evidence**: `src/contexts/deployment-context-provider.tsx:89-112`; behavior unchanged but `useVersionSSE` now delegates to context

---

## 11) Security & Permissions

Not applicable—no authentication, authorization, or data exposure changes. SSE endpoints already require authentication via session cookies; unified stream does not alter security posture.

---

## 12) UX / UI Impact

### Deployment Version Notification

- **Entry point**: `DeploymentProvider` context consumed by layout components
- **Change**: No user-facing change; version notifications continue to work identically via `isNewVersionAvailable` state
- **User interaction**: User sees banner prompting reload when new version detected; behavior unchanged
- **Dependencies**: `useVersionSSE` refactored internally but exposes same API to `DeploymentProvider`
- **Evidence**: `src/contexts/deployment-context-provider.tsx:74-85` derives `isNewVersionAvailable` from `useVersionSSE.version`

### AI Analysis Progress

- **Entry point**: AI part analysis dialog (`src/components/parts/ai-part-dialog.tsx`)
- **Change**: No user-facing change; progress updates continue via `onProgress` callback from `useAIPartAnalysis`
- **User interaction**: User submits part data, sees real-time progress messages and percentage, then review form or error message
- **Dependencies**: `use-ai-part-analysis.ts` updated to use subscription API instead of connection API; `useSSETask` interface change hidden behind wrapper
- **Evidence**: `src/hooks/use-ai-part-analysis.ts:25-68` shows callback wiring to `useSSETask`

### Connection Resilience

- **Entry point**: All pages consuming deployment context
- **Change**: Improved resilience—single shared connection reduces risk of hitting connection limits; faster reconnection for subsequent tabs (worker already connected)
- **User interaction**: Transparent to user; fewer connection errors under heavy tab usage
- **Dependencies**: SharedWorker multiplexing; iOS Safari fallback ensures no regression on unsupported browsers
- **Evidence**: Connection limit motivation from change brief; resilience improvement is side effect

---

## 13) Deterministic Test Plan

### Unified Worker Connection

- **Surface**: `src/workers/sse-worker.ts`
- **Scenarios**:
  - Given worker not running, When first tab connects, Then worker generates request_id and opens EventSource to `/api/sse/stream?request_id=X`
  - Given worker connected, When second tab connects, Then second tab receives cached connection state and current version (no new EventSource)
  - Given worker connected, When version event received, Then all tabs receive version message
  - Given worker connected, When task_event received, Then all tabs receive task_event message
  - Given worker connected with one tab, When last tab disconnects, Then worker closes EventSource
- **Instrumentation / hooks**: Worker emits `__testEvent` metadata in messages; Playwright checks `window.__sseConnections` via SSE mock harness
- **Gaps**: Backend task event injection not yet implemented; requires test endpoint or real backend task completion
- **Evidence**: Pattern from existing SharedWorker spec at `tests/e2e/deployment/shared-worker-version-sse.spec.ts`

### SSE Context Provider

- **Surface**: `SseContextProvider` and `useSseContext()` hook
- **Scenarios**:
  - Given provider mounted in SharedWorker mode, When worker broadcasts version event, Then `versionEvents` stream emits and `isConnected` updates
  - Given provider mounted in direct mode (iOS), When EventSource opens, Then `isConnected` updates and events dispatch to streams
  - Given provider mounted, When connection errors, Then `isConnected` becomes false and retries
  - Given provider unmounted, When cleanup runs, Then worker disconnect sent and port closed
- **Instrumentation / hooks**: Provider forwards `__testEvent` from worker messages; test bridge `window.__sseControls` for status checks
- **Gaps**: Test bridge design TBD; may reuse `__deploymentSseControls` or introduce separate bridge
- **Evidence**: New provider; test pattern from `tests/support/helpers/deployment-sse.ts`

### Version SSE (Refactored)

- **Surface**: `useVersionSSE` hook
- **Scenarios**:
  - Given hook mounted, When version event arrives via context, Then `version` state updates and `SseTestEvent` emitted
  - Given hook mounted, When connection state changes, Then `isConnected` reflects context state
  - Given deployment context using hook, When new version received, Then `isNewVersionAvailable` triggers
- **Instrumentation / hooks**: Hook emits `SseTestEvent` with `streamId: 'deployment.version'`; Playwright waits via `waitTestEvent(page, 'sse', ...)`
- **Gaps**: None—existing deployment SSE specs cover this flow
- **Evidence**: Existing spec at `tests/e2e/deployment/shared-worker-version-sse.spec.ts`

### Task SSE Subscription

- **Surface**: `useSSETask` hook
- **Scenarios**:
  - Given hook mounted, When `subscribeToTask(taskId)` called, Then `isSubscribed` becomes true and listener registered
  - Given subscribed to task, When task_event with matching task_id arrives, Then `progress` / `result` / `error` updates
  - Given subscribed to task, When task_event with different task_id arrives, Then no state change (filtered out)
  - Given task completed, When `task_completed` event arrives, Then `result` set, `onResult` callback invoked, `isSubscribed` becomes false (auto-unsubscribe)
  - Given task failed, When `task_failed` event arrives, Then `error` set, `onError` callback invoked, `isSubscribed` becomes false
- **Instrumentation / hooks**: Hook emits `SseTestEvent` with `streamId: 'task'` for each task event processed; Playwright injects task events via test bridge
- **Gaps**: Backend task event injection endpoint needed; may use AI analysis mock as interim (sanctioned per `testing/no-route-mocks`)
- **Evidence**: AI analysis flow tests in `tests/e2e/parts/ai-analysis-*.spec.ts` use SSE mocks; extend to verify subscription API

### AI Analysis Integration

- **Surface**: `use-ai-part-analysis.ts` hook
- **Scenarios**:
  - Given hook initialized, When `analyzePartFromData` called, Then POST to `/api/ai-parts/analyze` and `subscribeToTask(task_id)`
  - Given subscribed to analysis task, When progress events arrive, Then `onProgress` callback invoked with message/percentage
  - Given subscribed to analysis task, When task_completed arrives, Then result transformed and `onSuccess` callback invoked
  - Given subscribed to analysis task, When task_failed arrives, Then error emitted and `onError` callback invoked
  - Given task response missing `task_id`, Then error thrown and analysis blocked
- **Instrumentation / hooks**: Hook emits component errors via `emitComponentError`; Playwright waits for SSE events with `streamId: 'task'`
- **Gaps**: Real backend task events preferable over mocks; coordinate backend test endpoint for deterministic task completion
- **Evidence**: Existing AI analysis specs at `tests/e2e/parts/ai-analysis-*.spec.ts`; update to verify new subscription flow

### Endpoint Migration

- **Surface**: Backend endpoint change from `/api/sse/utils/version` and `/api/sse/tasks` to `/api/sse/stream`
- **Scenarios**:
  - Given deployment SSE test, When connection opens, Then endpoint is `/api/sse/stream?request_id=X`
  - Given unified endpoint active, When version event sent, Then all subscribed tabs receive it
  - Given unified endpoint active, When task_event sent, Then tabs subscribed to matching task_id receive it
- **Instrumentation / hooks**: Backend logs request_id correlation; Playwright asserts endpoint URL via `window.__sseConnections`
- **Gaps**: Backend unified endpoint must be deployed and stable before frontend migration
- **Evidence**: Change brief confirms backend migration complete

### Test Event Backward Compatibility

- **Surface**: Existing Playwright specs using version SSE
- **Scenarios**:
  - Given existing spec waiting for `SseTestEvent` with `streamId: 'deployment.version'`, When version event emitted, Then test passes (no regression)
  - Given spec using `waitTestEvent(page, 'sse', { streamId: 'deployment.version', phase: 'open' })`, Then helper still works with unified worker
- **Instrumentation / hooks**: No changes to `SseTestEvent` type or `waitTestEvent` helper; streamId filtering unchanged
- **Gaps**: None—instrumentation backward-compatible by design
- **Evidence**: `src/types/test-events.ts:110-116` defines `streamId` as string (supports both `deployment.version` and `task`)

---

## 14) Implementation Slices

### Slice 1: Worker Refactoring

- **Goal**: Rename and extend worker to handle unified stream with both event types
- **Touches**:
  - Rename `src/workers/version-sse-worker.ts` → `src/workers/sse-worker.ts`
  - Update endpoint to `/api/sse/stream?request_id=X`
  - Generate worker-owned `request_id` (remove from `connect` command)
  - Add `task_event` listener and broadcast logic
  - Extend `WorkerMessage` union with `task_event` type
  - Update test event metadata to support task events
- **Dependencies**: Backend unified endpoint must be live and stable

### Slice 2: SSE Context Provider

- **Goal**: Centralize SSE connection management and expose event streams to consumers
- **Touches**:
  - Create `src/contexts/sse-context-provider.tsx` with SharedWorker and EventSource routing
  - Create `src/contexts/sse-context-base.ts` with type definitions
  - Create `src/contexts/sse-context.ts` with `useSseContext()` hook
  - Implement `versionEvents` and `taskEvents` streams (callbacks or observables)
  - Add `isConnected` and `requestId` state management
  - Register test bridge (`window.__sseControls`) for Playwright
- **Dependencies**: Slice 1 (worker refactoring) must be complete

### Slice 3: Version SSE Refactor

- **Goal**: Simplify `useVersionSSE` to consume events from context instead of managing connection
- **Touches**:
  - Update `src/hooks/use-version-sse.ts` to subscribe to version events via `registerVersionListener` from context
  - Remove SharedWorker and EventSource connection logic (delegated to provider)
  - Remove `connect()` and `disconnect()` methods from hook API
  - Preserve `isConnected` and `version` state for backward compatibility
  - Keep test instrumentation (`SseTestEvent` emissions)
  - Update `src/contexts/deployment-context-provider.tsx` to remove `connect()`/`disconnect()` calls (lines 52, 97)
- **Dependencies**: Slice 2 (context provider) must be complete

### Slice 4: Task SSE Subscription

- **Goal**: Rewrite `useSSETask` to subscription-based API and integrate with context
- **Touches**:
  - Update `src/hooks/use-sse-task.ts` with new API: `subscribeToTask(taskId)` / `unsubscribe()`
  - Subscribe to `taskEvents` from context and filter by `task_id`
  - Rename `isConnected` → `isSubscribed`, remove EventSource logic
  - Add test instrumentation (`SseTestEvent` with `streamId: 'task'`)
  - Maintain backward-compatible callbacks (`onProgress`, `onResult`, `onError`)
- **Dependencies**: Slice 2 (context provider) must be complete

### Slice 5: AI Analysis Integration

- **Goal**: Update AI analysis hook to use new subscription API and handle backend response changes
- **Touches**:
  - Update `src/hooks/use-ai-part-analysis.ts` to extract `task_id` only (ignore `stream_url`)
  - Replace `connectSSE(streamUrl)` with `subscribeToTask(taskId)`
  - Remove absolute URL construction logic
  - Update error handling for missing `task_id`
- **Dependencies**: Slice 4 (task subscription) must be complete

### Slice 6: Test Infrastructure

- **Goal**: Add Playwright helpers and instrumentation for task SSE testing
- **Touches**:
  - Create `tests/support/helpers/sse-task.ts` with task event injection helpers
  - Extend `tests/support/helpers/deployment-sse.ts` for unified endpoint
  - Add test bridge methods (`window.__sseTaskControls`) for task event simulation
  - Document task SSE testing patterns in Playwright guide
- **Dependencies**: Slices 4 and 5 (task subscription and AI integration) must be complete

### Slice 7: Test Coverage

- **Goal**: Update existing specs and add new coverage for unified stream behavior
- **Touches**:
  - Update `tests/e2e/deployment/shared-worker-version-sse.spec.ts` to verify unified endpoint and both event types
  - Extend AI analysis specs (`tests/e2e/parts/ai-analysis-*.spec.ts`) to verify subscription API
  - Add spec for concurrent task subscriptions (multiple tasks in same tab)
  - Add spec for iOS Safari fallback (direct EventSource with task filtering)
- **Dependencies**: Slice 6 (test infrastructure) must be complete

---

## 15) Risks & Open Questions

### Risks

- **Risk**: Worker request ID generation may conflict with backend expectations
  - **Impact**: Backend may reject connections or fail to correlate events if request ID format or lifecycle differs from current implementation
  - **Mitigation**: Reuse existing `makeUniqueToken(32)` from `src/lib/utils/random.ts` to ensure format consistency; coordinate with backend team to verify unified endpoint tolerates worker-generated IDs

- **Risk**: Task events may arrive before tab finishes subscription setup
  - **Impact**: First task event (e.g., `task_started`) could be missed if subscription listener not yet registered
  - **Mitigation**: Subscribe to task events immediately after POST response (before awaiting other async work); backend may cache recent events per `task_id` for late joiners

- **Risk**: iOS Safari fallback creates N EventSource connections (one per tab)
  - **Impact**: iOS devices with many tabs may still hit connection limits, negating benefit of unified stream
  - **Mitigation**: Acceptable trade-off given iOS tab suspension behavior (background tabs typically suspended); document limitation; consider iOS-specific connection pooling in future if issue arises

- **Risk**: Playwright test infrastructure gaps block deterministic task event testing
  - **Impact**: Specs may rely on AI analysis mocks (sanctioned but limited) instead of real backend task events
  - **Mitigation**: Coordinate backend test endpoint (`POST /api/testing/tasks/trigger?task_id=X&event_type=Y`) to inject task events deterministically; interim use AI mock with documentation

- **Risk**: Concurrent task subscriptions may cause event processing overhead
  - **Impact**: Tab subscribing to many tasks receives all task events and filters locally, increasing CPU/memory usage
  - **Mitigation**: Benchmark task event throughput; if overhead unacceptable, consider worker-side subscription registry to filter before broadcasting (future optimization)

### Open Questions

- **Question**: What is the backend test strategy for task events?
  - **Why it matters**: Deterministic Playwright specs need to trigger task events on demand. Real task flows (e.g., AI analysis) may be too slow/complex for every test scenario.
  - **Proposed solution**: Backend implements test endpoint `POST /api/testing/sse/task-event` with body `{ task_id, event_type, data }` to trigger arbitrary task event delivery via unified SSE stream.
  - **Interim strategy**: If backend endpoint unavailable at implementation time, extend AI analysis mock exception with inline suppression: `// eslint-disable-next-line testing/no-route-mocks -- Backend lacks test trigger for task events; tracked in issue #XYZ`
  - **Owner / follow-up**: Coordinate with backend team before implementing Slice 6 (Test Infrastructure)

- **Question**: Should worker persist request ID across browser restarts (e.g., localStorage)?
  - **Why it matters**: Current design generates fresh ID on worker initialization; persisting ID would enable backend to correlate long-lived sessions but adds complexity
  - **Owner / follow-up**: Verify with backend team whether request_id correlation is used for long-lived analytics. If yes, consider persisting ID to sessionStorage (worker-scoped) to survive worker restarts. If no, current design (fresh ID per worker lifetime) is sufficient. Note: Worker generates ID (not tab), so existing `getDeploymentRequestId()` tab-level caching in `src/lib/config/sse-request-id.ts` becomes unused for SharedWorker mode—consider deprecating or renaming for clarity.

- **Question**: Should task events include backend timestamp for latency measurement?
  - **Why it matters**: Frontend could compute event delivery latency (backend timestamp vs client receipt) for debugging slow SSE streams
  - **Owner / follow-up**: Backend team; out of scope for frontend migration (can add later via instrumentation enhancement)

- **Question**: How should unsubscribe behave if called before any events received?
  - **Why it matters**: User may cancel analysis immediately; subscription may still be pending first event
  - **Owner / follow-up**: Design decision—treat as no-op (listener cleanup) or emit cancellation event; implement as no-op for simplicity

- **Question**: Should `subscribeToTask` return Promise that resolves when task completes?
  - **Why it matters**: Async/await pattern may be more ergonomic than callbacks for some consumers
  - **Owner / follow-up**: API design—current callback pattern matches existing `useSSETask` API; defer Promise variant to future enhancement if requested

- **Question**: Should test bridge support injecting version events in addition to task events?
  - **Why it matters**: Existing deployment SSE tests use real backend version events; injecting synthetic events could enable more deterministic version update testing
  - **Owner / follow-up**: Test infrastructure decision—defer to existing real backend approach unless flakiness emerges (current approach working)

---

## 16) Confidence

Confidence: **High** — The migration is well-scoped with a clear backend contract (unified endpoint already live). Existing SharedWorker and SSE infrastructure provides proven patterns for connection management, retry logic, and test instrumentation. The subscription-based API for tasks is a straightforward extension of the version SSE model. iOS fallback and test mode routing are already handled by `useVersionSSE`. Main risk is task event timing (late subscription), mitigated by immediate subscription after task start. Test infrastructure can leverage existing deployment SSE helpers and AI mock patterns. Implementation slices are sequential and testable independently.
