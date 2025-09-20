# Playwright Test Instrumentation Phase 3 - Improvements Plan

## Brief Description

Implement critical improvements to the Phase 3 test instrumentation to fix inefficient router polling, add missing query error tracking, and implement proper correlation ID context for linking API requests with errors. These improvements will enhance test reliability, reduce resource usage, and provide better error correlation for debugging.

## Files to Create or Modify

### Router Instrumentation Fix

#### Modify: `src/lib/test/router-instrumentation.ts`
- Replace polling-based navigation detection with router.subscribe() API
- Subscribe to 'onResolved' event for navigation completion
- Remove setInterval and polling logic
- Extract route params correctly from resolved location
- Handle cleanup with unsubscribe function

### Query Error Instrumentation

#### Create: `src/lib/test/query-instrumentation.ts`
- Export `setupQueryInstrumentation(queryClient)` function
- Hook into query error handling via queryClient configuration
- Extract query keys from failed queries
- Parse HTTP status codes from query errors
- Emit TEST_EVT:query_error events for query failures

#### Modify: `src/lib/query-client.ts`
- Import setupQueryInstrumentation function
- Add queries.onError handler to defaultOptions (similar to existing mutations.onError)
- Call setupQueryInstrumentation after queryClient creation
- Keep existing mutation error handling intact
- Note: Performance is not a concern since this only runs in test mode

### Correlation ID Context

#### Create: `src/contexts/correlation-context.tsx`
- Create React context for correlation ID storage
- Export CorrelationProvider component
- Store correlation IDs in a Map/ref to avoid re-renders
- Provide setCorrelationId and getCorrelationId functions (non-reactive)
- Use a ref-based approach instead of state to prevent context re-renders
- Clear correlation ID on navigation
- Performance optimization: Use useRef to store IDs, avoiding any re-renders when correlation IDs change

#### Modify: `src/lib/test/api-instrumentation.ts`
- Import correlation context functions
- Store correlation ID in context when generating
- Add fallback to retrieve existing correlation ID from context

#### Modify: `src/lib/test/error-instrumentation.ts`  
- Import correlation context functions
- Update getCurrentCorrelationId to read from context
- Return actual correlation ID instead of undefined

#### Modify: `src/App.tsx`
- Import CorrelationProvider
- Wrap RouterProvider with CorrelationProvider

## Step-by-Step Implementation

### 1. Router Instrumentation Fix

1.1. Remove polling mechanism:
   - Delete setInterval logic
   - Remove checkNavigation function
   - Remove intervalId variable

1.2. Implement subscription:
   ```typescript
   const unsubscribe = router.subscribe('onResolved', (event) => {
     // TanStack Router provides onResolved event with location data
     // event contains fromLocation and toLocation
     // Emit TEST_EVT:route with proper from/to paths
   });
   ```

1.3. Extract params from resolved location:
   - Access params from event.toLocation.params
   - Include search params from event.toLocation.search

1.4. Return cleanup:
   - Return unsubscribe function directly
   - Remove window event listener cleanup

### 2. Query Error Instrumentation

2.1. Create dedicated instrumentation file:
   - Define setupQueryInstrumentation function
   - Accept QueryClient as parameter

2.2. Configure query error handler:
   - Access queryClient.getDefaultOptions()
   - Add queries.onError handler (following the pattern of mutations.onError)
   - Preserve existing retry logic
   - Only emit events in test mode using isTestMode()

2.3. Extract query information:
   - Get query key from query.queryKey
   - Convert to string representation
   - Parse HTTP status from error object

2.4. Emit query error events:
   - Create TEST_EVT:query_error event
   - Include queryKey, status, message
   - Only emit in test mode

### 3. Correlation ID Context

3.1. Create context provider:
   - Define CorrelationContext with get/set functions
   - Use useRef to store correlation ID (not useState)
   - Context value contains stable function references
   - No component re-renders when correlation ID changes
   - Functions access ref.current directly

3.2. Integrate with API instrumentation:
   - Check context for existing correlation ID
   - Store new correlation ID when generating
   - Use consistent correlation ID for request lifecycle

3.3. Connect to error handling:
   - Read correlation ID from context
   - Include in error events
   - Clear on navigation if needed

3.4. Wire up provider:
   - Add CorrelationProvider to App component tree
   - Ensure it wraps all components using API/errors

## Algorithm Details

### Router Event Subscription Algorithm

1. On router initialization:
   - Call router.subscribe('onResolved', callback)
   - Store unsubscribe function

2. On navigation resolved:
   - Extract fromLocation path (previous route)
   - Extract toLocation path (new route)  
   - Extract route params from toLocation
   - Emit TEST_EVT:route with all data

3. On cleanup:
   - Call stored unsubscribe function

### Query Error Detection Algorithm

1. On query failure:
   - Check if in test mode
   - Extract query key array
   - Convert to string (join with ':')
   - Check error for HTTP status
   - Emit TEST_EVT:query_error

2. Status extraction:
   - Check error.status property
   - Check error.response?.status
   - Default to undefined if not found

### Correlation ID Flow Algorithm

1. On API request start:
   - Check context for existing ID
   - If none, generate new ULID
   - Store in context
   - Add to request headers

2. On error occurrence:
   - Read current correlation ID from context
   - Include in error event
   - Maintain ID until navigation

3. On navigation:
   - Optionally clear correlation ID
   - Start fresh for new page

## Verification Steps

1. Router subscription replaces polling successfully
2. Navigation events captured without 100ms delay
3. Query errors emit TEST_EVT:query_error events
4. Correlation IDs flow from API requests to errors
5. No performance degradation from polling removal
6. Context provider doesn't cause re-renders
7. All events maintain proper typing
8. Test mode check prevents production impact

## Implementation Priority

1. **High Priority**: Router instrumentation fix (performance impact)
2. **High Priority**: Correlation ID context (debugging capability)
3. **Medium Priority**: Query error instrumentation (completeness)

## Notes

- Router subscription is more efficient than polling and captures all navigation events
- Correlation ID context uses ref-based storage to completely avoid re-renders
- The ref approach means correlation IDs can be used in production without performance impact
- Query error handler must not interfere with existing retry logic
- All improvements maintain backward compatibility with existing instrumentation
- ULID generation remains as implemented (not reverting to UUID)

## Performance Considerations

The correlation ID context is designed to be zero-cost for React rendering:
- Uses `useRef` instead of `useState` to store IDs
- Context value contains only stable function references (created once with `useCallback`)
- Reading/writing correlation IDs never triggers re-renders
- This approach makes it safe to enable in production if needed