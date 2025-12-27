# SSE Unified Stream - Change Brief

## Problem Statement

The application currently opens multiple SSE connections which can exhaust Chrome's HTTP/1.1 connection limit of 6 connections per origin. The existing SharedWorker implementation only handles version SSE, while task SSE (used for AI analysis) still opens a separate connection per task.

## Backend Changes (Already Complete)

The backend has been redesigned to use a single unified SSE endpoint:
- **Old endpoints**: `/api/sse/utils/version` and `/api/sse/tasks`
- **New endpoint**: `/api/sse/stream?request_id=X`

Key changes:
1. All events (version updates and task events) are broadcast to all connections
2. Task events include `task_id` for client-side filtering
3. Connections remain open after task completion (no auto-close)
4. `stream_url` removed from `TaskStartResponse` - only `task_id` is returned

## Required Frontend Changes

### 1. Rename and Extend SharedWorker

Rename `src/workers/version-sse-worker.ts` to `src/workers/sse-worker.ts` and extend to:
- Connect to new unified endpoint `/api/sse/stream?request_id=X`
- Generate and own the `request_id` (persist for worker lifetime)
- Handle both `version` and `task_event` SSE events
- Broadcast all events to all connected tabs (no filtering in worker)

### 2. Create Unified SSE Provider

Create a new SSE context provider (`SseContextProvider`) that:
- Manages the SharedWorker connection lifecycle
- Provides access to the SSE event stream for consumers
- Handles iOS Safari fallback (direct EventSource connection)
- Separates SSE concerns from deployment-specific logic

### 3. Modify useVersionSSE Hook

Update to consume version events from the unified SSE provider instead of managing its own connection.

### 4. Rewrite useSSETask Hook

Change from connection-based to subscription-based:
- **Old API**: `connect(streamUrl)` / `disconnect()`
- **New API**: `subscribeToTask(taskId)` / `unsubscribe()`

The hook will:
- Receive task events from the unified SSE provider
- Filter events locally by `task_id`
- NOT close the shared connection on task completion
- Support multiple concurrent task subscriptions per tab

### 5. Update AI Analysis Hook

Modify `use-ai-part-analysis.ts` to:
- Remove `stream_url` handling (no longer returned by backend)
- Use `task_id` from response to subscribe via `useSSETask`

### 6. Update Test Infrastructure

- Add task event instrumentation (`SseTestEvent` with `streamId: 'task'`)
- Create test helpers to inject/trigger task events from Playwright
- Update existing deployment SSE tests for new endpoint

## Design Decisions

1. **Broadcast Model**: Worker broadcasts all events to all tabs; tabs filter locally. Simpler than maintaining subscription registrations in the worker.

2. **Worker-Owned Request ID**: SharedWorker generates its own `request_id` on first connection, ensuring consistency across tabs and reconnections.

3. **Separate SSE Provider**: New `SseContextProvider` isolates SSE connection management from deployment-specific concerns, enabling both version and task consumers.

4. **iOS Fallback**: Direct EventSource connection to unified endpoint with client-side filtering. Each tab receives all events but this is acceptable given iOS's tab suspension behavior.

## Out of Scope

- Backend changes (already complete)
- Changes to SSE event payload formats
- Connection pooling or request batching beyond single shared connection
