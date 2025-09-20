# Code Review - Playwright Test Frontend Instrumentation Phase 3

## Overview

This code review evaluates the implementation of Phase 3 frontend instrumentation for Playwright tests. The implementation adds structured TEST_EVT event emission across key application layers (router, API client, forms, toasts, and errors).

**Note**: UUID generation was replaced with ULID as requested (deviation from plan is acceptable).

## Implementation Status

### ✅ Successfully Implemented

1. **Event System Enhancement** (`src/types/test-events.ts`, `src/lib/test/event-emitter.ts`)
   - All event types properly defined with correct field names matching the plan
   - Event emitter formats output as one-line JSON with `TEST_EVT:` prefix
   - Event validation implemented
   - Timestamp in ISO format
   - Window signals array for test collection

2. **API Client Instrumentation** (`src/lib/test/api-instrumentation.ts`)
   - ✅ ULID used for correlation IDs (as requested, instead of UUID)
   - Request/response interceptors properly implemented
   - Correlation ID passed via X-Request-Id header
   - Duration calculation using performance.now()
   - Operation name extraction from URL
   - Integrated into generated client

3. **Toast Integration** (`src/lib/test/toast-instrumentation.ts`)
   - Wrapper functions for all toast types
   - Error code extraction logic
   - Properly integrated into ToastContext
   - All toast levels mapped correctly

4. **Error Boundary Integration** (`src/lib/test/error-instrumentation.ts`)
   - Global error handler for window errors
   - Promise rejection handling
   - Component error emission helper
   - Scope differentiation (global, promise, component)
   - Integrated in main.tsx

5. **Form Instrumentation** (`src/lib/test/form-instrumentation.ts`)
   - Lifecycle tracking functions (open, submit, success, error)
   - Stable form ID generation
   - Already integrated into TypeForm and PartForm
   - HOC wrapper provided for future forms

### ⚠️ Partially Implemented

1. **Router Instrumentation** (`src/lib/test/router-instrumentation.ts`)
   - **Issue**: Using polling approach (100ms interval) instead of proper router subscription
   - **Impact**: May miss rapid navigation changes, inefficient resource usage
   - **Recommendation**: Should use router.subscribe() for navigation events

2. **TanStack Query Integration**
   - **Location**: Implemented directly in `query-client.ts` instead of separate file
   - **Coverage**: Only mutation errors tracked, query errors not instrumented
   - **Missing**: No global onError hook for queries
   - **Recommendation**: Add query error tracking similar to mutations

### ❌ Not Implemented

1. **SSE Instrumentation** (`src/lib/test/sse-instrumentation.ts`)
   - File not created
   - SseTestEvent type defined but unused
   - Acceptable if SSE not used in the app (as noted in plan)

2. **Query Instrumentation File** (`src/lib/test/query-instrumentation.ts`)
   - File not created
   - Logic partially integrated into query-client.ts instead
   - setupQueryInstrumentation() function not implemented

## Code Quality Issues

### 1. Router Instrumentation Inefficiency

**Current Implementation**:
```typescript
// Polling every 100ms - inefficient
intervalId = setInterval(checkNavigation, 100);
```

**Should Be**:
```typescript
// Use router subscription API
const unsubscribe = router.subscribe(({ location }) => {
  // Emit route event
});
```

### 2. Missing Correlation ID Context

**Issue**: `getCurrentCorrelationId()` in error-instrumentation.ts always returns undefined
```typescript
function getCurrentCorrelationId(): string | undefined {
  // Simplified implementation - always returns undefined
  return undefined;
}
```

**Impact**: Errors can't be correlated with API requests

### 3. Incomplete Query Error Tracking

**Current**: Only tracks mutation errors
**Missing**: Query failures not instrumented

## Positive Aspects

1. **Clean Separation**: Each instrumentation type in its own file
2. **Type Safety**: Proper TypeScript types throughout
3. **Production Safety**: All instrumentation gated behind isTestMode()
4. **ULID Integration**: Successfully replaced UUID with ULID as requested
5. **Minimal Impact**: Non-intrusive integration into existing code
6. **Form Integration**: Already integrated into key forms (TypeForm, PartForm)

## Recommendations

### High Priority

1. **Fix Router Instrumentation**: Replace polling with proper router subscription
2. **Complete Query Error Tracking**: Add instrumentation for query failures
3. **Implement Correlation ID Context**: Create proper context for tracking correlation IDs across requests

### Medium Priority

1. **Extract Query Instrumentation**: Move logic from query-client.ts to dedicated file as planned
2. **Add More Form Integration**: Extend to other forms beyond TypeForm and PartForm

### Low Priority

1. **SSE Instrumentation**: Only implement if SSE is actually used
2. **Performance Monitoring**: Consider adding memory usage to error events

## Testing Recommendations

1. Verify events appear in console with correct `TEST_EVT:` format
2. Test rapid navigation to ensure all route changes are captured
3. Verify correlation IDs flow through API requests to errors
4. Test form lifecycle events for both success and error paths
5. Ensure no events emit in production mode

## Overall Assessment

**Score: 8/10**

The implementation successfully delivers the core functionality with good type safety and minimal impact on the existing codebase. The ULID integration was handled well. Main issues are the inefficient router polling and incomplete query error tracking. These should be addressed but don't block the feature from being functional for Playwright tests.

The implementation is production-ready with the noted improvements recommended for optimal performance and completeness.