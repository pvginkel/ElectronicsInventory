# Playwright Test Suite Frontend Changes - Technical Plan

## Brief Description

Implement frontend instrumentation and testing infrastructure to enable reliable Playwright end-to-end tests against the real backend. The changes focus on structured event logging, data-test selectors, error normalization, and a test mode that provides machine-readable visibility without relying on screenshots or UI parsing.

## Files to Create or Modify

### Test Mode Configuration
- **`src/lib/utils/test-mode.ts`** (create)
  - Centralized test mode detection and configuration
  - Export `isTestMode()` function checking `import.meta.env.VITE_TEST_MODE`
  - Export types for test event kinds and payloads

### Test Event Emitter
- **`src/lib/utils/test-events.ts`** (create)
  - Core `emitTestEvt(kind, payload)` function
  - In test mode: logs to console as `TEST_EVT:` + JSON, mirrors to `window.__TEST_SIGNALS__`
  - In production: no-op function
  - Event types: `route`, `form`, `api`, `toast`, `error`, `query_error`, `sse`

### Global Error Instrumentation
- **`src/lib/query-client.ts`** (modify)
  - Add global `onError` and `onSettled` hooks to emit `TEST_EVT:query_error`
  - Include queryKey, HTTP status, normalized message, and correlationId in events

- **`src/contexts/toast-context.tsx`** (modify)
  - Emit `TEST_EVT:toast` on all toast calls with level, message, and optional error code
  - Add correlationId support to toast data structure

- **`src/lib/utils/error-parsing.ts`** (modify)
  - Extract correlationId from API error responses
  - Add domain-specific error codes (e.g., `TYPE_IN_USE` for blocked deletions)
  - Ensure consistent error structure normalization

### API Client Instrumentation
- **`src/lib/api/generated/client.ts`** (modify)
  - Add request/response interceptors to emit `TEST_EVT:api` events
  - Generate/propagate `X-Request-Id` header for correlation
  - Track operation name, method, status, correlationId, and duration

- **`src/lib/utils/correlation-id.ts`** (create)
  - Generate unique request IDs (e.g., using nanoid or crypto.randomUUID)
  - Store and retrieve correlation IDs from responses

### Router Instrumentation
- **`src/routes/__root.tsx`** (modify)
  - Add router event listener to emit `TEST_EVT:route` on navigation
  - Include from/to route paths in event payload

### Form & Mutation Instrumentation
- **`src/hooks/use-form-events.ts`** (create)
  - Custom hook to wrap form lifecycle events
  - Emit `TEST_EVT:form` at open, submit, success, error phases
  - Include stable formId and mutation state

- **Modify all form components** that use mutations:
  - `src/components/types/TypeForm.tsx`
  - `src/components/types/type-create-dialog.tsx`
  - `src/components/parts/part-form.tsx`
  - `src/components/boxes/box-form.tsx`
  - Additional form components as needed

### SSE Instrumentation
- **`src/hooks/use-version-sse.ts`** (modify)
  - Emit `TEST_EVT:sse` for open, event, heartbeat, close
  - Include streamId for correlation

- **`src/hooks/use-testing-logs-sse.ts`** (create)
  - Hook to connect to `/api/testing/logs/stream` endpoint
  - Parse structured JSON logs from backend
  - Only active in test mode

### Data-Test Selectors
- **Add selectors to Types components:**
  - `src/components/types/TypeList.tsx` - Add `data-test="types.list"`, `data-test="types.list.row"`
  - `src/components/types/TypeForm.tsx` - Add `data-test="types.form"`, `data-test="types.form.name"`, `data-test="types.form.submit"`
  - `src/components/types/TypeCard.tsx` - Add `data-test="types.card"`
  - `src/components/types/type-create-dialog.tsx` - Add `data-test="types.create.dialog"`

- **Add selectors to shared UI components:**
  - `src/components/ui/toast.tsx` - Add `data-test="toast.error"`, `data-test="toast.success"`, etc.
  - `src/components/ui/button.tsx` - Support `data-test` prop passthrough
  - `src/components/ui/input.tsx` - Support `data-test` prop passthrough
  - `src/components/ui/dialog.tsx` - Support `data-test` prop passthrough

### Console Error Detection
- **`src/lib/utils/console-monitoring.ts`** (create)
  - Override `console.error` in test mode to emit `TEST_EVT:error`
  - Include stack trace and correlation context
  - Maintain original console.error behavior

### Environment Variables
- **`.env.example`** (modify)
  - Add `VITE_TEST_MODE=true` example
  - Add `VITE_API_BASE_URL` for dual-port configuration

- **`vite.config.ts`** (modify if needed)
  - Ensure environment variables are properly loaded

## Implementation Steps

### Phase 1: Core Infrastructure
1. Create test mode detection utility
2. Implement test event emitter with console/window mirroring
3. Set up console.error monitoring
4. Add correlation ID generation and propagation

### Phase 2: Global Instrumentation
1. Wire toast context to emit events
2. Add TanStack Query global error hooks
3. Instrument API client with request/response interceptors
4. Add router navigation event emission

### Phase 3: Form & Mutation Events
1. Create form events hook
2. Apply to all Type management forms
3. Emit structured events at each form lifecycle phase

### Phase 4: Data-Test Selectors
1. Add selectors to Types components (list, form, card)
2. Add selectors to toast components
3. Ensure UI components support data-test prop passthrough
4. Document selector naming convention

### Phase 5: SSE & Backend Logs
1. Instrument version SSE with events
2. Create backend log streaming hook
3. Add heartbeat event emissions

### Phase 6: Error Normalization
1. Enhance error parsing for domain codes
2. Extract and propagate correlation IDs
3. Ensure blocked delete errors surface with `TYPE_IN_USE` code

## Algorithms

### Event Emission Logic
```
1. Check if test mode is enabled via import.meta.env.VITE_TEST_MODE
2. If test mode:
   a. Format event as JSON object with kind, timestamp, and payload
   b. Log to console as "TEST_EVT:" + JSON.stringify(event)
   c. Append to window.__TEST_SIGNALS__ array (create if not exists)
3. If production mode:
   a. Return immediately (no-op)
```

### Correlation ID Flow
```
1. On API request:
   a. Check for existing X-Request-Id header
   b. If not present, generate new ID (nanoid or UUID)
   c. Attach to request headers
2. On API response:
   a. Extract X-Request-Id from response headers
   b. Include in TEST_EVT:api event payload
3. On error:
   a. Parse correlationId from error response
   b. Include in toast and error events
```

### Form Event Lifecycle
```
1. On form mount: emit form event with phase "open" and unique formId
2. On submit: emit form event with phase "submit"
3. On success: emit form event with phase "success" plus result data
4. On error: emit form event with phase "error" plus error details
```

### SSE Heartbeat Detection
```
1. Track last event timestamp
2. If heartbeat/keepalive event received, emit TEST_EVT:sse with type "heartbeat"
3. On connection open: emit TEST_EVT:sse with type "open"
4. On connection close: emit TEST_EVT:sse with type "close"
```

## Testing Considerations

- All test events must be completely disabled in production builds
- Event payloads should be minimal to avoid performance impact
- Selectors must be stable across UI changes
- Form IDs should be deterministic for reliable test assertions
- Correlation IDs must propagate through entire request/response cycle