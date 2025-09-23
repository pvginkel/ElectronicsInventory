# Error Handling & Validation Patterns - Documentation

## Overview

This document provides comprehensive documentation for the error handling and validation patterns implementation, as well as the broader test instrumentation system that powers Playwright testing.

## Table of Contents

1. [Error Handling Patterns](#error-handling-patterns)
2. [Test Instrumentation System](#test-instrumentation-system)
3. [Developer Guide](#developer-guide)
4. [Playwright Test Helpers](#playwright-test-helpers)

---

## Error Handling Patterns

### Form Validation Error Tracking

The system tracks form validation errors as observable test events, allowing Playwright tests to assert on validation behavior.

#### When to Use

- When a form field fails validation (on blur, change, or submit)
- When form submission is blocked by validation
- When you need to test validation error behavior

#### How to Implement in Forms

```typescript
import { 
  generateFormId, 
  trackFormValidationError,
  trackFormValidationErrors 
} from '@/lib/test/form-instrumentation';

// Generate stable form ID
const formId = generateFormId('MyForm', mode); // mode: 'create' | 'edit'

// Track single field validation error
if (fieldError) {
  trackFormValidationError(formId, 'fieldName', fieldError);
}

// Track multiple validation errors at once
const errors = form.validate();
if (Object.keys(errors).length > 0) {
  trackFormValidationErrors(formId, errors);
}
```

#### Event Structure

```typescript
{
  kind: 'form',
  phase: 'validation_error',
  formId: 'MyForm_create',
  metadata: {
    field: 'name',
    error: 'Name is required'
  }
}
```

### Conflict Error Detection (409)

The system automatically detects and tracks HTTP 409 conflict errors, which occur when trying to update stale data.

#### Automatic Detection

This happens automatically via query instrumentation - no developer action required!

When a query or mutation fails with status 409:
1. Query instrumentation detects the 409 status
2. Emits a `query_error` event with `isConflict: true`
3. Includes correlation ID for debugging
4. Extracts conflict details from response

#### Event Structure

```typescript
{
  kind: 'query_error',
  error: 'Conflict: Data has been modified',
  metadata: {
    status: 409,
    isConflict: true,
    correlationId: '01J5XY...',
    conflictDetails: { ... }
  }
}
```

### Console Error Management

Allows tests to expect certain console errors, preventing test failure for known/expected errors.

#### In Test Files

```typescript
import { expectConsoleError } from '../support/helpers';

// Tell the test to expect this error pattern
await expectConsoleError(page, /Cannot delete type with dependencies/);

// Now when this error appears in console, the test won't fail
await page.click('[data-testid="delete-button"]');
```

---

## Test Instrumentation System

### Architecture Overview

The test instrumentation system makes application state observable by emitting structured events during test runs. Events are only emitted when `VITE_TEST_MODE=true`.

### Event System Core

All events follow this pattern:
- Logged to console as: `TEST_EVT: {"kind":"...", ...}`
- Stored in: `window.__TEST_SIGNALS__[]`
- Only active in test mode

### Instrumentation Types

#### 1. Form Instrumentation (Manual)

**Purpose:** Track form lifecycle and interactions

**Functions developers MUST use:**

```typescript
import {
  generateFormId,
  trackFormOpen,
  trackFormSubmit,
  trackFormSuccess,
  trackFormError,
  trackFormValidationError,
  trackFormValidationErrors
} from '@/lib/test/form-instrumentation';

// Generate stable form ID (do this once per component)
const formId = generateFormId('ComponentName', mode);

// Track when form opens/becomes visible
useEffect(() => {
  if (open) {
    trackFormOpen(formId, { field: value });
  }
}, [open]);

// Track form submission flow
trackFormSubmit(formId, formData);
try {
  await submitToAPI(formData);
  trackFormSuccess(formId, formData);
} catch (error) {
  trackFormError(formId, formData);
  throw error;
}

// Track validation errors
if (validationError) {
  trackFormValidationError(formId, 'fieldName', errorMessage);
}
```

**Real Examples:**
- TypeForm: `src/components/types/TypeForm.tsx`
- PartForm: `src/components/parts/part-form.tsx`

#### 2. Query Instrumentation (Automatic)

**Purpose:** Track React Query errors and conflicts

**Setup:** Already configured in `src/lib/query-client.ts`

**What it tracks automatically:**
- All query and mutation errors
- HTTP status codes
- 409 conflict detection
- Correlation IDs

**No developer action required!**

#### 3. Router Instrumentation (Automatic)

**Purpose:** Track navigation events

**Setup:** Already configured in `src/App.tsx`

**What it tracks automatically:**
- Route changes
- From/to paths
- Route parameters

**No developer action required!**

#### 4. Toast Instrumentation (Automatic)

**Purpose:** Track toast notifications

**Setup:** Already configured in `src/contexts/toast-context.tsx`

**What it tracks automatically:**
- All toast messages
- Toast levels (success/error/warning/info)
- Error codes from messages

**No developer action required!**

#### 5. Error Instrumentation (Automatic)

**Purpose:** Track unhandled errors

**Setup:** Already configured in `src/main.tsx`

**What it tracks automatically:**
- Global errors
- Unhandled promise rejections
- Component errors

**Manual usage (rare):**
```typescript
import { emitComponentError } from '@/lib/test/error-instrumentation';

// Only use in error boundaries or special error handling
emitComponentError(error, 'ComponentName');
```

#### 6. API Instrumentation (NOT INTEGRATED)

⚠️ **WARNING:** This instrumentation exists but is not currently connected to the API client.

**What it would track (if enabled):**
- All HTTP requests/responses
- Request duration
- Correlation IDs
- Operation names

**To enable (needs implementation):**
```typescript
// In src/lib/api/generated/client.ts
import { setupApiInstrumentation } from '@/lib/test/api-instrumentation';

if (isTestMode()) {
  setupApiInstrumentation(api);
}
```

---

## Developer Guide

### When Adding a New Form Component

1. **Import form instrumentation functions:**
   ```typescript
   import { 
     generateFormId, 
     trackFormOpen, 
     trackFormSubmit,
     trackFormSuccess,
     trackFormError,
     trackFormValidationError
   } from '@/lib/test/form-instrumentation';
   ```

2. **Generate a stable form ID:**
   ```typescript
   const formId = generateFormId('MyForm', mode);
   // mode should be: 'create' | 'edit' | 'duplicate' etc.
   ```

3. **Track form open:**
   ```typescript
   useEffect(() => {
     if (isOpen) {
       trackFormOpen(formId, initialValues);
     }
   }, [isOpen]);
   ```

4. **Track validation errors:**
   ```typescript
   const validateField = (fieldName: string, value: any) => {
     const error = getValidationError(value);
     if (error) {
       trackFormValidationError(formId, fieldName, error);
     }
     return error;
   };
   ```

5. **Track submission flow:**
   ```typescript
   const handleSubmit = async (values) => {
     trackFormSubmit(formId, values);
     try {
       await apiCall(values);
       trackFormSuccess(formId, values);
       onSuccess();
     } catch (error) {
       trackFormError(formId, values);
       // Error toast handled automatically by query client
     }
   };
   ```

### When Writing New Features

#### Automatic Instrumentation (Nothing to do!)

These are already handled:
- Navigation tracking (router)
- API errors (query client)
- Toast notifications
- Unhandled errors

#### Manual Instrumentation Required

Only forms need manual tracking:
- Form open/close
- Form submit/success/error
- Validation errors

### Debugging Test Failures

1. **Check browser console for TEST_EVT logs:**
   ```
   TEST_EVT: {"kind":"form","phase":"submit",...}
   ```

2. **Access event history in browser console:**
   ```javascript
   window.__TEST_SIGNALS__
   ```

3. **Look for correlation IDs to trace requests:**
   Events with the same correlationId are related

4. **Verify event order:**
   - Form: open → submit → success/error
   - API: request → response/error
   - Router: route change events

---

## Playwright Test Helpers

### Form Validation Helpers

#### waitForFormValidationError

Wait for a validation error on a specific form/field:

```typescript
import { waitForFormValidationError } from '../support/helpers';

// Wait for any validation error on the form
await waitForFormValidationError(page, 'TypeForm_create');

// Wait for specific field validation error
await waitForFormValidationError(page, 'TypeForm_create', 'name');
```

### Conflict Error Helpers

#### expectConflictError

Wait for a 409 conflict error:

```typescript
import { expectConflictError } from '../support/helpers';

// Wait for any 409 conflict
await expectConflictError(page);

// Wait for 409 with specific correlation ID
await expectConflictError(page, 'correlation-id-here');
```

### Console Error Helpers

#### expectConsoleError

Register an expected console error pattern:

```typescript
import { expectConsoleError } from '../support/helpers';

// Expect this error pattern (won't fail test)
await expectConsoleError(page, /Cannot delete.*dependencies/);

// Now trigger the action that causes the error
await page.click('[data-testid="delete-btn"]');
```

### Core Helper: waitTestEvent

The foundation for all test helpers:

```typescript
import { waitTestEvent } from '../support/helpers';

// Wait for any event matching criteria
await waitTestEvent(page, {
  kind: TestEventKind.FORM,
  phase: 'submit',
  formId: 'PartForm_create'
});

// With metadata matching
await waitTestEvent(page, {
  kind: TestEventKind.QUERY_ERROR,
  metadata: { status: 404 }
});
```

### Usage in Tests

```typescript
import { test, expect } from '@playwright/test';
import { 
  waitForFormValidationError,
  expectConflictError,
  expectConsoleError 
} from '../support/helpers';

test('should handle validation errors', async ({ page }) => {
  // Open form
  await page.click('[data-testid="create-button"]');
  
  // Submit with empty required field
  await page.click('[type="submit"]');
  
  // Assert validation error was tracked
  await waitForFormValidationError(page, 'TypeForm_create', 'name');
  
  // Visual assertion still works
  await expect(page.getByText('Name is required')).toBeVisible();
});

test('should handle conflict errors', async ({ page }) => {
  // Simulate stale data scenario
  // ... setup ...
  
  await page.click('[data-testid="save-button"]');
  
  // Wait for 409 conflict
  await expectConflictError(page);
  
  // User should see conflict dialog
  await expect(page.getByText('Data has been modified')).toBeVisible();
});

test('should handle deletion with dependencies', async ({ page }) => {
  // Expect the console error
  await expectConsoleError(page, /Cannot delete.*has dependencies/);
  
  // Try to delete
  await page.click('[data-testid="delete-button"]');
  
  // Error toast should appear (automatic via query client)
  await expect(page.getByText('Cannot delete')).toBeVisible();
});
```

---

## Summary

### What Developers Need to Know

1. **Most instrumentation is automatic** - Query errors, navigation, toasts, and global errors are tracked automatically

2. **Only forms need manual tracking** - Use the form instrumentation functions for form lifecycle events

3. **Test helpers are available** - Use `waitForFormValidationError`, `expectConflictError`, and `expectConsoleError` in tests

4. **Events only emit in test mode** - No performance impact in production

5. **Check console for TEST_EVT logs** - Best debugging tool for test failures

### Quick Reference

| What You're Doing | What to Import | What to Call |
|------------------|----------------|-------------|
| Creating a form | `@/lib/test/form-instrumentation` | `generateFormId`, `trackForm*` functions |
| Writing a test | `../support/helpers` | `waitForFormValidationError`, `expectConflictError`, `expectConsoleError` |
| Handling API errors | Nothing | Automatic via query client |
| Navigation | Nothing | Automatic via router |
| Showing toasts | Nothing | Automatic via toast context |
| Debugging tests | Browser console | Check `TEST_EVT` logs and `window.__TEST_SIGNALS__` |