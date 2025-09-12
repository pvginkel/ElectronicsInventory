# SSE Version Updates - Technical Plan

## Brief Description
Rework the current polling-based deployment notification system to use Server-Sent Events (SSE) for real-time version updates. The backend now provides an SSE endpoint at `/api/utils/version/stream` that sends the version information and maintains a persistent connection with heartbeats. When the backend is redeployed, the SSE connection drops and automatically reconnects, receiving the new version. The `/version.json` polling endpoint is completely removed in favor of SSE-only version detection.

## Files to Create or Modify

### New Files to Create
- `src/hooks/use-version-sse.ts` - Custom hook for managing SSE connection to version endpoint, adapted from existing use-sse-task.ts pattern

### Files to Modify
- `src/contexts/deployment-context.tsx` - Replace polling logic with SSE-based version monitoring
- `src/components/ui/deployment-notification-bar.tsx` - No changes needed (display logic remains the same)

## Algorithms and Implementation Steps

### SSE Connection Management Algorithm
1. **Initial Connection**: On app startup, establish SSE connection to `/api/utils/version/stream`
2. **Version Event Handling**: Listen for `version` events containing `{"version": "9ef99dc0941a14e0eff905ed5b2515574eb3a88d"}` format (git commit hash)
3. **Heartbeat Handling**: Process `keepalive` events to maintain connection health (no action needed)
4. **Invalid Event Handling**: Disconnect and reconnect if any unexpected event type is received
5. **Connection Drop Recovery**: Handle connection drops with automatic reconnection using exponential backoff
6. **Version Comparison**: First version received is treated as current version, subsequent versions compared for changes
7. **Update Detection**: Set `isNewVersionAvailable` flag when version hash differs from initial version

### Hook Implementation Pattern (`use-version-sse.ts`)
Based on existing `use-sse-task.ts` pattern but simplified for version monitoring:
- Remove task-specific events (task_started, progress_update, task_completed)
- Handle only two valid event types: `version` and `keepalive`
- Disconnect and reconnect on any other event type (simplified error handling)
- Maintain connection state and automatic reconnection logic
- Use exponential backoff with indefinite retries (cap delay at 60s)
- Return version data and connection status

TypeScript interface:
```typescript
interface UseVersionSSEReturn {
  connect: () => void;
  disconnect: () => void;
  isConnected: boolean;
  version: string | null;  // Git commit hash string
  error: string | null;
}

interface VersionEvent {
  version: string;  // e.g., "9ef99dc0941a14e0eff905ed5b2515574eb3a88d"
}
```

### Context Integration Algorithm
1. **Remove Polling Infrastructure**: 
   - Delete `fetchVersion` function (no more `/version.json` endpoint)
   - Remove `setInterval` polling logic
   - Remove development mode checks (`if (isDevelopment) return`)
2. **Initialize SSE**: Use `useVersionSSE` hook on context mount
3. **Handle Version Events**: 
   - First version received becomes `currentVersion` (initial state)
   - Subsequent versions trigger comparison logic
4. **Compare Versions**: Set `isNewVersionAvailable` when received version differs from `currentVersion`
5. **Maintain Focus Handler**: Keep window focus event to trigger immediate reconnection attempt
6. **Update checkForUpdates**: Change to force SSE reconnection instead of polling
7. **Cleanup**: Disconnect SSE on context unmount

### Event Handling Implementation
Valid SSE events from backend:
- `version`: Contains `{"version": "git-commit-hash"}` - update current/new version state
- `keepalive`: Connection health maintenance - ignore (no action needed)
- Any other event type: Treat as invalid - disconnect and reconnect immediately

### Reconnection Strategy
1. **Automatic Reconnection**: On connection drop, attempt to reconnect indefinitely with exponential backoff
2. **Backoff Strategy**: Start at 1s, double each attempt, cap at 60s maximum delay
3. **Focus Trigger**: Window focus event forces immediate reconnection attempt
4. **Error Handling**: Silent failures with console logging (matches current behavior)
5. **Guarantee**: Connection will eventually succeed since frontend and backend run in same pod

### Development Mode Handling
- Enable SSE connection in both development and production modes
- Remove all `isDevelopment` / `import.meta.env.DEV` conditional logic from deployment-context.tsx
- SSE will connect and monitor versions in development mode (helps test deployment behavior locally)
- HMR (Hot Module Replacement) continues to work for code changes
- Version updates in dev mode won't typically occur unless backend is redeployed during development

### State Management
Context state remains unchanged:
- `isNewVersionAvailable`: boolean flag for notification bar
- `currentVersion`: string containing git commit hash (initially null, set on first version event)
- `checkForUpdates`: manual trigger (changed to force SSE disconnect/reconnect instead of polling)
- `reloadApp`: full page reload function (unchanged)

### API Endpoint Usage
- URL: `/api/utils/version/stream` (already available in generated API)
- Method: GET with EventSource API
- No authentication required (utility endpoint)
- CORS headers handled by backend

## Implementation Details

### Event Processing Pattern
- Parse SSE events and check event type
- On `version` event: parse JSON payload and extract version string
- On `keepalive` event: ignore (connection maintenance only)
- On any other event: disconnect and trigger reconnection
- Use EventSource API with custom reconnection logic (not native retry)

### Error Handling Strategy
- Silent errors (no toast notifications for version checks)
- Console logging for debugging in development
- Automatic reconnection on all connection failures
- No user-facing error messages (matches current behavior)

### Cleanup and Memory Management
- Properly close EventSource on unmount
- Clear retry timeouts on disconnect
- Reset state on new connections
- Prevent memory leaks with proper cleanup

### Version Detection Flow
1. **Initial Load**: SSE connects, first `version` event sets `currentVersion` (no version.json fetch)
2. **Ongoing Monitoring**: Each subsequent `version` event compared against `currentVersion`
3. **Update Detection**: When version differs, set `isNewVersionAvailable` to true
4. **User Action**: Notification bar appears, user clicks to reload
5. **Race Condition Note**: Acceptable that initial version might be newer if deployed during page load