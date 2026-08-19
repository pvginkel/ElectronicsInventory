# SSE Message Format Simplification

## Problem

The SharedWorker's SSE EventSource uses **named events** (`event: version`, `event: task_event`). The EventSource API requires explicit `addEventListener(eventName, handler)` for each named event type. The current architecture has browser tabs send `subscribe` commands to the SharedWorker via `postMessage`, which then attaches EventSource listeners on demand.

This creates a **race condition**: when the backend responds very fast (e.g., cached results), SSE events can arrive at the EventSource before the tab's `subscribe` postMessage is processed by the worker. Since no listener is attached yet, the events are silently dropped by the EventSource.

## Solution

Switch the SSE Gateway from **named events** to **unnamed (default) events** with a type/payload envelope. This allows the worker to use a single `eventSource.onmessage` handler that captures all events without per-event-type subscriptions.

## Design

### SSE Gateway output format

**Before:**
```
event: version
data: {"version": "abc123"}

event: task_event
data: {"task_id": "t1", "event_type": "progress_update", "data": {...}}
```

**After:**
```
data: {"type": "version", "payload": {"version": "abc123"}}

data: {"type": "task_event", "payload": {"task_id": "t1", "event_type": "progress_update", "data": {...}}}
```

**Unchanged:**
- `connection_close` stays as a named event (internal plumbing)
- Heartbeat/keepalive SSE comments (`: heartbeat`) stay unchanged
- The internal API contract (`POST /internal/send` with `{token, event: {name, data}}`) stays the same — only the SSE stream output format changes

### SharedWorker (`sse-worker.ts`)

**Remove:**
- `subscribedEvents` set and all subscription tracking
- `subscribeToEvent()` function
- `handleSubscribe()` function
- `subscribe` from the `TabCommand` type

**Change:**
- Replace per-event `eventSource.addEventListener(...)` calls with a single `eventSource.onmessage` handler
- The `onmessage` handler unwraps `{type, payload}` and broadcasts `{type: 'event', event: <type>, data: <payload>}` to all tabs — keeping the existing tab-facing message format intact
- Cache the last `version` event payload and send it when a new tab connects (so late-joining tabs get the current version immediately)

**Keep:**
- `connect` and `disconnect` tab commands
- `connection_close` named event listener
- Reconnection logic with exponential backoff
- Port management and broadcast function

### Provider (`sse-context-provider.tsx`)

**Remove:**
- `ensureWorkerSubscription()` callback
- `workerSubscribedEventsRef` ref
- Subscribe logic from `addEventListener()` (no more sending subscribe commands to worker)
- `ensureDirectEventSourceListener()` callback
- `attachedEventsRef` ref

**Change:**
- `addEventListener()` becomes purely local: adds handler to `listenersRef`, returns unsubscribe function
- `createDirectConnection()` uses `eventSource.onmessage` to unwrap `{type, payload}` and dispatch via `dispatchEvent()` — same unwrapping logic as the SharedWorker
- `createSharedWorkerConnection()` no longer sends subscribe messages after connect

**Keep:**
- `listenersRef` for local handler dispatch (tabs still filter by event name)
- `handleWorkerMessage` for processing worker broadcasts
- `dispatchEvent` for calling registered handlers
- `disconnect`, `reconnect`, connection lifecycle

### Backend (`sse_utils.py` and SSE Gateway)

The SSE Gateway process is responsible for formatting the SSE stream. Currently it receives `{name: "version", data: "{...}"}` from `/internal/send` and outputs `event: version\ndata: {...}\n\n`.

**Change:** Output `data: {"type": "<name>", "payload": <data>}\n\n` instead (no `event:` line).

`sse_utils.py` `format_sse_event()` may need updating if it's used for direct SSE formatting (without the gateway).

## Scope

This is a **template-level change** affecting:
- Backend template: SSE Gateway output format, `sse_utils.py`
- Frontend template: `sse-worker.ts`, `sse-context-provider.tsx`

All downstream apps pick up the changes via `copier update` (template-owned files).

## Migration

Since both the gateway output format and the frontend consumer change simultaneously, this is a coordinated template version bump. No app-level code changes needed — the consumer hooks (`useVersionSSE`, `useSSETask`) and the provider's `addEventListener`/`dispatchEvent` interface remain unchanged.
