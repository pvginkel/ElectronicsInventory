# Error Handling System - Technical Plan

## Overview

This plan addresses the current ad hoc error handling throughout the frontend by implementing a comprehensive, generic error handling system. The goal is to eliminate local try/catch blocks around HTTP calls and provide consistent user feedback using the structured error responses from the backend.

## Current State Analysis

### Backend Error Structure
The backend provides structured error responses with:
- `error`: Human-readable message suitable for display
- `details`: Either a single `ErrorDetailsSchema` or array of `ErrorDetailsSchema` objects
  - `message`: Additional error context/technical details
  - `field`: Field name for validation errors (optional, null if not field-specific)

### Current Frontend Issues
1. **Ad hoc error handling**: Manual try/catch blocks in components like `part-form.tsx:113-116`
2. **Inconsistent user feedback**: Generic "Failed to save" messages instead of using backend's human-readable errors
3. **Missing error states**: Many mutation calls have no error handling at all
4. **No centralized error reporting**: No global mechanism for error display
5. **Error swallowing**: TanStack Query errors are often ignored or poorly handled

## Proposed Architecture

### 1. Global Error Display System

**File**: `src/components/ui/toast.tsx`
- React component for displaying toast notifications
- Support for different types: success, error, warning, info
- Auto-dismiss with configurable duration
- Queue multiple toasts

**File**: `src/contexts/toast-context.tsx`
- Global context for managing toast state
- Methods: `showToast()`, `showError()`, `showSuccess()`

**File**: `src/hooks/use-toast.ts`
- Hook for consuming toast context
- Convenient methods for different toast types

### 2. Enhanced Query Client Configuration

**File**: `src/lib/query-client.ts`
- Extract QueryClient configuration from `__root.tsx`
- Configure global error handling for queries and mutations
- Implement `onError` handlers that parse backend error structure
- Automatic toast display for mutation errors

### 3. Error Parsing Utilities

**File**: `src/lib/utils/error-parsing.ts`
- `parseApiError()`: Extract human-readable message from backend error
- `formatValidationErrors()`: Handle validation error arrays
- `shouldDisplayError()`: Determine if error should be shown to user
- Type guards for different error response formats

### 4. Enhanced Generated Hooks

**Modifications to**: `src/lib/api/generated/hooks.ts`
- Add error parsing to all mutation hooks
- Include `onError` callbacks that automatically show toasts
- Preserve ability to override error handling when needed
- Add consistent error typing

### 5. Component Error Boundaries

**File**: `src/components/error-boundary.tsx`
- React Error Boundary for catching JavaScript errors
- Fallback UI with error reporting option
- Integration with error reporting service

## Implementation Details

### Error Parsing Logic

```typescript
// src/lib/utils/error-parsing.ts
export function parseApiError(error: unknown): string {
  // Parse ErrorResponseSchema.c2a0d71 format
  if (isApiError(error)) {
    return error.error; // Use human-readable message from backend
  }
  
  // Handle validation errors (details as array)
  if (isValidationErrorArray(error)) {
    return formatValidationErrors(error.details);
  }
  
  // Fallback for unknown errors
  return 'An unexpected error occurred';
}

// Type guards for the actual API error structure
function isApiError(error: unknown): error is { error: string; details: any } {
  return typeof error === 'object' && error !== null && 'error' in error;
}

### Query Client Error Handling

```typescript
// src/lib/query-client.ts
const queryClient = new QueryClient({
  defaultOptions: {
    mutations: {
      onError: (error) => {
        const message = parseApiError(error);
        toast.showError(message);
      }
    },
    queries: {
      onError: (error) => {
        // Only show toast for non-404 query errors
        if (!is404Error(error)) {
          const message = parseApiError(error);
          toast.showError(message);
        }
      }
    }
  }
});
```

### Component Simplification

Components will be simplified to remove try/catch blocks:

```typescript
// Before (current):
const handleSubmit = async () => {
  try {
    await mutation.mutateAsync(data);
    onSuccess();
  } catch (error) {
    console.error('Failed:', error);
    setErrors({ submit: 'Failed to save. Please try again.' });
  }
};

// After (with global error handling):
const handleSubmit = async () => {
  await mutation.mutateAsync(data);
  onSuccess();
};
```

## Files to Create

### New Files
- `src/components/ui/toast.tsx` - Toast notification component
- `src/contexts/toast-context.tsx` - Global toast state management
- `src/hooks/use-toast.ts` - Toast consumption hook
- `src/lib/query-client.ts` - Enhanced QueryClient configuration
- `src/lib/utils/error-parsing.ts` - Error parsing utilities
- `src/components/error-boundary.tsx` - React Error Boundary

### Files to Modify

**Core Infrastructure**:
- `src/routes/__root.tsx` - Use new QueryClient configuration, add ToastProvider
- `src/lib/api/generated/hooks.ts` - Enhance with error parsing (post-generation)

**Components with Current Error Handling**:
- `src/components/parts/part-form.tsx` - Remove try/catch, simplify error state
- `src/components/boxes/box-details.tsx` - Remove manual error display
- `src/components/parts/part-details.tsx` - Remove ad hoc error handling
- `src/components/boxes/box-list.tsx` - Remove manual error states
- `src/components/parts/part-list.tsx` - Simplify error handling
- `src/components/types/type-selector.tsx` - Remove try/catch blocks

## Implementation Phases

### Phase 1: Core Infrastructure
1. Implement toast system (toast.tsx, toast-context.tsx, use-toast.ts)
2. Create error parsing utilities (error-parsing.ts)
3. Setup enhanced QueryClient (query-client.ts)
4. Add ToastProvider to root layout

### Phase 2: Generated Hook Enhancement
1. Create post-generation script or wrapper to enhance generated hooks
2. Add consistent error handling to all mutations
3. Test error parsing with backend error responses

### Phase 3: Component Migration
1. Remove try/catch blocks from components
2. Simplify error state management
3. Remove manual error display logic
4. Update components to rely on global error handling

### Phase 4: Advanced Features
1. Add Error Boundary for JavaScript errors
2. Implement error categorization (user errors vs system errors)
3. Add retry mechanisms for transient errors
4. Implement error reporting/logging

## Error Display Strategy

### Automatic Display
- All mutation errors (create, update, delete operations)
- Network/server errors during queries
- Business logic violations (insufficient inventory, etc.)

### Silent Handling
- 404 errors on optional queries
- Validation errors handled by form components
- Errors with custom handling (e.g., confirmation dialogs)

### Override Mechanism
Components can opt out of global error handling when needed:

```typescript
const mutation = usePostBoxes({
  onError: (error) => {
    // Custom error handling
    setCustomError(parseApiError(error));
  }
});
```

## Success Criteria

1. **Zero try/catch blocks** around API calls in components
2. **Consistent error messages** using backend's human-readable text
3. **Automatic error display** for all failed operations
4. **Simplified component code** with removed error state management
5. **Type-safe error handling** throughout the application
6. **Graceful degradation** for unknown error formats

## Migration Strategy

1. Implement infrastructure without breaking existing functionality
2. Gradually migrate components one-by-one
3. Test each migration to ensure error messages display correctly
4. Remove old error handling code after confirming new system works
5. Add comprehensive error scenario testing