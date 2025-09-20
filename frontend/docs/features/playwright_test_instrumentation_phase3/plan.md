# Playwright Test Frontend Instrumentation Phase 3 - Technical Plan

## Brief Description

Implement comprehensive frontend instrumentation by emitting structured TEST_EVT events across key application layers (router, API client, forms, toasts, and errors). This phase makes the application fully observable for Playwright tests by providing machine-readable visibility into frontend operations through console events, enabling the LLM to assert on application behavior without relying on visual elements.

## Phase Overview

This is Phase 3 of the Playwright test suite implementation, building on the test mode infrastructure from Phase 2. This phase focuses on:
1. Full implementation of structured test event emission
2. Router and navigation instrumentation
3. API client instrumentation with correlation IDs
4. Toast and error boundary integration
5. Form lifecycle tracking
6. TanStack Query error instrumentation

## Files to Create or Modify

### Core Event System Enhancement

#### Modify: `src/lib/test/event-emitter.ts`
- Enhance stub implementation to handle full event payloads
- Update `emitTestEvent` to properly serialize payloads with correct event structure
- Add event validation to ensure proper event kinds
- Format console output as one-line JSON with `TEST_EVT:` prefix

#### Modify: `src/types/test-events.ts`
- Update event payload interfaces with correct field names from the brief:
  - `route`: Add `from` and `to` fields
  - `form`: Update phase to include `open|submit|success|error`
  - `api`: Add `correlationId` and `durationMs` fields
  - `toast`: Add `code` field
  - `error`: Add `scope`, `code`, and `correlationId` fields
  - `query_error`: Rename `queryKey` to match TanStack Query structure
  - `sse`: Add `streamId` and phase fields

### Router Instrumentation

#### Create: `src/lib/test/router-instrumentation.ts`
- Router event listener setup function
- Export: `setupRouterInstrumentation()` function
- Listen to TanStack Router navigation events
- Emit `TEST_EVT:route` with from/to paths
- Extract and include route params

#### Modify: `src/main.tsx` or `src/app.tsx`
- Import and call `setupRouterInstrumentation()` when in test mode
- Pass router instance to instrumentation setup
- Ensure initialization happens after router creation

### API Client Instrumentation

#### Create: `src/lib/test/api-instrumentation.ts`
- API request/response interceptor setup
- Export: `setupApiInstrumentation()` function
- Track request start time for duration calculation
- Generate or propagate correlation IDs (X-Request-Id header)
- Emit `TEST_EVT:api` with operation name, method, status, correlationId, durationMs

#### Modify: `src/lib/api/generated/client.ts` or API configuration
- Add request interceptor to attach correlation IDs
- Add response interceptor to emit test events
- Ensure correlation ID is passed through headers
- Calculate and include request duration

### Toast Integration

#### Create: `src/lib/test/toast-instrumentation.ts`
- Toast notification interceptor
- Export: `instrumentToast()` wrapper function
- Emit `TEST_EVT:toast` with level, code, and message

#### Modify: `src/contexts/toast-context.tsx`
- Import toast instrumentation wrapper
- Wrap `addToast` function to emit events
- Include error codes when available
- Pass through toast level (success, error, warning, info)

### Error Boundary Integration

#### Create: `src/lib/test/error-instrumentation.ts`
- Global error handler setup
- Export: `setupErrorInstrumentation()` function
- Listen to window error events
- Emit `TEST_EVT:error` with scope, code, message, correlationId

#### Modify: Error boundary components or global error handler
- Import error instrumentation
- Emit test events when errors are caught
- Include correlation IDs when available
- Differentiate error scopes (component, global, etc.)

### TanStack Query Integration

#### Create: `src/lib/test/query-instrumentation.ts`
- Query error handler setup
- Export: `setupQueryInstrumentation()` function
- Hook into TanStack Query's global error handler
- Emit `TEST_EVT:query_error` with queryKey, status, message

#### Modify: `src/lib/query-client.ts`
- Import query instrumentation
- Add global onError hook when in test mode
- Extract query keys and HTTP status
- Include normalized error messages

### Form Instrumentation

#### Create: `src/lib/test/form-instrumentation.ts`
- Form event tracking utilities
- Export: `trackFormSubmit()`, `trackFormOpen()`, `trackFormSuccess()`, `trackFormError()`
- Generate stable form IDs
- Emit `TEST_EVT:form` at lifecycle points

#### Modify: Form components (starting with key forms)
- `src/components/types/TypeForm.tsx`
- `src/components/parts/PartForm.tsx`
- Import form tracking utilities
- Call tracking functions at appropriate lifecycle points:
  - `open`: When form is rendered or modal opens
  - `submit`: When form submission starts
  - `success`: When mutation succeeds
  - `error`: When validation or mutation fails

## Step-by-Step Implementation

### 1. Event System Enhancement

1.1. Update event type definitions:
   - Add missing fields to match the brief specification
   - Ensure TypeScript types are properly constrained
   - Add helper types for event creation

1.2. Enhance event emitter:
   - Format output as one-line JSON for machine parsing
   - Validate event kinds against defined types
   - Ensure timestamp is ISO formatted

### 2. Router Instrumentation

2.1. Hook into TanStack Router:
   - Subscribe to router.subscribe() for navigation events
   - Extract previous and current routes
   - Include route parameters and query strings

2.2. Event emission:
   - Emit on successful navigation only
   - Include both pathname and search params
   - Handle initial page load

### 3. API Client Instrumentation

3.1. Request interceptor:
   - Generate UUID for correlation ID if not present
   - Add X-Request-Id header
   - Store request start time

3.2. Response interceptor:
   - Calculate duration from start time
   - Extract operation name from URL or OpenAPI metadata
   - Emit event with all required fields

### 4. Toast and Error Integration

4.1. Toast wrapper:
   - Intercept all toast notifications
   - Extract error codes from error objects
   - Map toast types to event levels

4.2. Global error handler:
   - Catch unhandled errors
   - Differentiate error sources
   - Include stack traces in development

### 5. TanStack Query Integration

5.1. Global error handler:
   - Hook into defaultOptions.queries.onError
   - Extract query key as string
   - Parse HTTP status from error response

5.2. Mutation tracking:
   - Also hook defaultOptions.mutations.onError
   - Differentiate between query and mutation errors

### 6. Form Lifecycle Tracking

6.1. Identify key forms:
   - Start with TypeForm and PartForm
   - Generate consistent form IDs
   - Track form state transitions

6.2. Integration points:
   - useEffect on mount for "open" event
   - Mutation onMutate for "submit" event
   - Mutation onSuccess for "success" event
   - Mutation onError for "error" event

## Verification Steps

1. TEST_EVT events appear in console with correct format
2. Router navigation triggers route events with from/to paths
3. API calls emit events with correlation IDs and durations
4. Toast notifications emit events with proper levels and codes
5. Form submissions track complete lifecycle (open→submit→success/error)
6. TanStack Query errors emit query_error events
7. Global errors are caught and emitted as error events
8. All events include timestamps in ISO format
9. Events are properly typed and validated
10. No events are emitted in production mode

## Dependencies

- Phase 2 test mode infrastructure (completed)
- Existing test event system foundation
- No UI changes required (visual elements unchanged)
- No backend changes required

## Next Phases Preview

- **Phase 4**: Data-test attributes and Types feature test implementation
- **Phase 5**: Backend integration with reset endpoint and log streaming

## Implementation Priority

1. **High Priority** (Core observability):
   - API client instrumentation (required for most assertions)
   - Router instrumentation (navigation tracking)
   - Toast integration (user feedback visibility)

2. **Medium Priority** (Error handling):
   - TanStack Query error instrumentation
   - Global error boundary integration

3. **Lower Priority** (Can be added incrementally):
   - Form lifecycle tracking (can start with key forms)
   - SSE instrumentation (if SSE is used in the app)

## Notes

- Correlation IDs should be generated client-side using crypto.randomUUID() or fallback
- All events must be emitted synchronously to ensure capture before navigation
- Event payloads should be kept minimal to avoid console spam
- Form IDs should be stable across re-renders (use component name + key prop)
- Duration measurements should use performance.now() for accuracy