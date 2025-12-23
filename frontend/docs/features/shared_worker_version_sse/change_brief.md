# Change Brief: SharedWorker Version SSE

## Problem

The version check SSE (Server-Sent Events) connection currently opens one persistent connection per browser tab. When users open many tabs (10+), they hit browser connection limits (6 for HTTP/1.1), causing connection churn and cascading reconnection loops that degrade application performance.

## Solution

Implement a SharedWorker to multiplex the version SSE connection across all browser tabs. A single SSE connection in the SharedWorker broadcasts version updates to all connected tabs via MessagePort.

## Requirements

### Production Behavior
- Use a SharedWorker to maintain a single SSE connection shared across all tabs
- New tabs receive the current version immediately on connect
- Worker closes SSE when the last tab disconnects
- Graceful fallback for browsers without SharedWorker support (iOS Safari)

### Development/Test Behavior
- In local dev (`import.meta.env.DEV`) and test mode (`isTestMode()`), use the existing direct SSE connection (one per tab)
- This ensures the existing test infrastructure continues to work unchanged
- Provide an opt-in mechanism for tests that specifically want to verify SharedWorker functionality

### Opt-in for Tests
- Use URL parameter `?__sharedWorker` to enable SharedWorker in test mode
- This allows dedicated test cases to verify the SharedWorker code path

## Technical Approach

1. Create `src/workers/version-sse-worker.ts` - SharedWorker that manages SSE connection
2. Modify `src/hooks/use-version-sse.ts` - Add SharedWorker path with fallback
3. Configure Vite for worker bundling if needed
4. Add focused Playwright tests for SharedWorker behavior

## Out of Scope

- Backend changes (none required - protocol is identical)
- Changes to other SSE streams (task SSE, shopping list SSE, etc.)
