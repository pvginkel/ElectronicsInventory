# Error Handling & Validation Patterns - Technical Plan

## Overview

This plan implements core error handling and validation patterns for the Playwright test suite, focusing on form validation tracking, conflict error handling, and expected console error management.

## Files to Create or Modify

### Form Validation Integration

**Files to modify:**
- `src/types/test-events.ts` - Add validation_error phase to FormTestEvent
- `src/lib/test/form-instrumentation.ts` - Emit validation error events
- `src/components/types/TypeForm.tsx` - Track validation errors
- `src/components/parts/part-form.tsx` - Track validation errors
- `tests/support/helpers.ts` - Add validation test helpers

### Conflict Error Handling

**Files to modify:**
- `src/lib/test/query-instrumentation.ts` - Add 409 conflict tracking
- `src/lib/test/api-instrumentation.ts` - Ensure correlation ID propagation
- `tests/support/helpers.ts` - Add conflict error test helpers

### Console Error Management

**Files to modify:**
- `tests/support/fixtures.ts` - Add expected error tracking
- `tests/support/helpers.ts` - Add expectConsoleError helper

## Implementation Details

### 1. Form Validation Integration

#### Enhanced FormTestEvent Phase
Add a new phase to the existing FormTestEvent enum:
- Add `validation_error` to the phase type union
- Include validation details in the event metadata

When a form field fails validation:
1. Emit `TEST_EVT:form` with phase `validation_error`
2. Include field name and error message in metadata
3. Track whether submission was blocked

#### Validation Error Tracking
In form components (TypeForm, PartForm):
```typescript
// When field validation fails
emitTestEvent({
  kind: TestEventKind.FORM,
  phase: 'validation_error',
  formId: generateFormId('TypeForm', mode),
  metadata: {
    field: fieldName,
    error: errorMessage
  }
})
```

### 2. Conflict Error Handling

#### 409 Conflict Detection
In `query-instrumentation.ts`, enhance error tracking:
1. Check for HTTP 409 status in error responses
2. Emit specialized event for conflict errors
3. Include conflict details from server response

#### Correlation ID Propagation
Ensure correlation IDs flow through the system:
1. Extract correlation ID from response headers in api-instrumentation.ts
2. Include correlation ID in all query/mutation events
3. Use correlation ID to link frontend events with backend requests

### 3. Console Error Management

#### Expected Error Tracking
Add to test fixture:
```typescript
// Track expected errors per test
const expectedErrors: RegExp[] = []

// In console handler
if (expectedErrors.some(pattern => pattern.test(message))) {
  // This error was expected, don't fail the test
  return
}
```

#### expectConsoleError Helper
Add to `tests/support/helpers.ts`:
```typescript
export async function expectConsoleError(page: Page, pattern: RegExp) {
  // Register this pattern as expected for current test
  await page.evaluate((pat) => {
    window.__expectedConsoleErrors = window.__expectedConsoleErrors || []
    window.__expectedConsoleErrors.push(pat)
  }, pattern.source)
}
```

## Algorithms

### Form Validation Flow
1. User interacts with form field
2. Field validation runs on blur/change
3. If validation fails:
   - Emit `TEST_EVT:form` with phase `validation_error`
   - Include field name and error details
4. On form submit:
   - If validation blocks submission, emit validation_error event
   - If all validations pass, proceed with submission

### Conflict Error Detection
1. Mutation or query fails with error
2. Check error status/response for 409 conflict
3. If conflict detected:
   - Extract conflict details from response
   - Emit query error event with conflict flag
   - Include correlation ID for debugging

### Console Error Filtering
1. Intercept console.error calls in test fixture
2. Check message against expectedErrors array
3. If unexpected:
   - Add to errors array
   - Test will fail at end
4. If expected:
   - Skip adding to errors array
   - Continue test execution

## Test Helpers

### Form Validation Assertions
```typescript
// Wait for field validation error using existing waitTestEvent
await waitTestEvent(page, {
  kind: TestEventKind.FORM,
  phase: 'validation_error',
  formId: 'type_create'
});

// Helper wrapper for validation errors
async function waitForFormValidationError(page: Page, formId: string, field: string) {
  return waitTestEvent(page, {
    kind: TestEventKind.FORM,
    phase: 'validation_error',
    formId,
    metadata: { field }
  });
}
```

### Conflict Error Assertions
```typescript
// Wait for 409 conflict error
async function expectConflictError(page: Page, correlationId?: string) {
  return waitTestEvent(page, {
    kind: TestEventKind.QUERY_ERROR,
    metadata: { status: 409, correlationId }
  });
}
```

### Console Error Assertions
```typescript
// Explicitly expect a console error
await expectConsoleError(page, /Cannot delete type with dependencies/);
```

## Integration Points

### With Existing Event System
- All new events follow existing `TEST_EVT` format
- Use existing `emitTestEvent` function
- Maintain consistent event structure

### With React Query
- Hook into existing query/mutation error tracking
- Preserve existing error handling
- Add conflict detection without disrupting functionality

### With Test Framework
- Integrate with existing fixtures
- Use existing `waitTestEvent` helper
- Follow established test patterns

## Updating Existing Tests

### Types Tests Enhancement
The existing types tests should be enhanced to demonstrate the new patterns:

**tests/e2e/types/types-create.spec.ts:**
- Add test case for validation errors on empty required fields
- Use `waitForFormValidationError` to verify validation events
- Test that form submission is blocked when validation fails

**tests/e2e/types/types-edit.spec.ts:**
- Add test case for 409 conflict when saving stale data
- Use `expectConflictError` to verify conflict detection
- Test user resolution of conflicts

**tests/e2e/types/types-delete.spec.ts:**
- Add test case for deletion with dependencies
- Use `expectConsoleError` to expect the error message
- Verify error is shown to user via toast

### Test Migration Pattern
When updating existing tests:
1. Identify tests that trigger validation errors
2. Add `expectConsoleError` for known console errors
3. Add assertions for validation events where forms are tested
4. Keep existing assertions to ensure backward compatibility

Example migration:
```typescript
// Before
await page.fill('[name="name"]', '');
await page.click('button[type="submit"]');
// Test just checked that form didn't submit

// After
await page.fill('[name="name"]', '');
await page.click('button[type="submit"]');
await waitForFormValidationError(page, 'type_create', 'name');
// Now we verify the validation event was emitted
```