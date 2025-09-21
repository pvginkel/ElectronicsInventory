# Playwright Test Types Feature Phase 4 - Technical Plan (Revised)

## Brief Description

Implement data-testid attributes and end-to-end test coverage for the Types feature to serve as the pilot implementation for the Playwright test suite. This phase leverages the completed component refactoring from Pre-Phase 4, which enables all components to accept data-testid attributes and forward refs.

## Phase Overview

This is Phase 4 of the Playwright test suite implementation, building on:
- **Phase 1-3**: Basic infrastructure, service orchestration, and frontend instrumentation (✅ Complete)
- **Pre-Phase 4**: Component refactoring to accept data-* attributes and forward refs (✅ Complete)

This phase focuses on:
1. Adding data-testid attributes to Types feature components and routes
2. Creating specific (near-unit) and E2E tests for Types CRUD operations
3. Testing blocked delete scenarios with reverse dependencies
4. Updating documentation for Playwright testing workflow
5. Establishing selector naming and test patterns for future features

### Existing Infrastructure Context

The project has comprehensive infrastructure from completed phases:
- **Component refactoring**: All UI components now accept data-testid attributes and forward refs
- **Test infrastructure**: `tests/smoke.spec.ts`, `tests/support/` directory with fixtures, global-setup, helpers, and selectors
- **Service orchestration**: Playwright webServer configuration for frontend and backend
- **TEST_EVT events**: Console events emitted by the instrumented frontend for observability
  - Event kinds: api, form, toast, route, query_error (SSE events deferred)
  - Events include correlation IDs for backend log correlation

## Files to Create or Modify

### Data-testid Attributes Implementation

**Important Note**: Thanks to Pre-Phase 4 component refactoring, all UI components now accept data-testid attributes natively. We only need to add the attributes when using the components.

#### Modify: `src/routes/types/index.tsx`
- Add `data-testid="types.page"` to main page container
- Add `data-testid="types.list.container"` to list wrapper
- Add `data-testid="types.create.button"` to create button
- Components already forward these attributes to DOM elements

#### Modify: `src/components/types/TypeList.tsx`
- Add `data-testid="types.list.table"` to table element
- Add `data-testid="types.list.row"` to each table row
- Add `data-testid="types.list.row.name"` to name cells
- Add `data-testid="types.list.row.actions"` to action buttons container
- Add `data-testid="types.list.row.edit"` to edit buttons
- Add `data-testid="types.list.row.delete"` to delete buttons

#### Verify: `src/components/types/TypeForm.tsx`
- Verify `data-testid="types.form.name"` on Input component
- Verify `data-testid="types.form.submit"` on submit Button
- Verify `data-testid="types.form.cancel"` on cancel Button
- Add `data-testid="types.form.container"` to form wrapper if missing
- Add `data-testid="types.form.error"` to error display areas if missing
- Note: Per Pre-Phase 4 completion, TypeForm already has basic attributes added

#### Modify: `src/components/types/type-create-dialog.tsx`
- Add `data-testid="types.create.modal"` to Dialog contentProps
- Add `data-testid="types.create.modal.close"` to DialogClose component
- Add `data-testid="types.create.modal.overlay"` to Dialog overlayProps
- Dialog component already supports prop distribution from Pre-Phase 4

#### Toast Attributes (Already Supported)
- Toast component refactored in Pre-Phase 4 supports data-testid via getItemProps pattern
- Verify toast creation includes type-specific attributes:
  - `data-testid="toast.success"` for success toasts
  - `data-testid="toast.error"` for error toasts
  - `data-testid="toast.warning"` for warning toasts
  - `data-testid="toast.info"` for info toasts
  - `data-testid="toast.close"` to close buttons

### Playwright Test Implementation

#### Test Directory Structure (Feature Ownership Pattern)

Reorganize test structure to establish clear feature ownership:
```
tests/
├── e2e/
│   ├── types/                      # Types feature owns this directory (NEW)
│   │   ├── types.selectors.ts      # Types-specific selectors (NEW)
│   │   ├── types-workflow.spec.ts  # E2E workflow test (NEW)
│   │   └── types.helpers.ts        # Types-specific helpers (NEW)
│   └── specific/
│       └── types/
│           └── types-crud.spec.ts  # Specific Types tests (NEW)
├── support/
│   ├── common.selectors.ts         # Shared UI selectors (RENAME from selectors.ts)
│   ├── fixtures.ts                 # Test fixtures (EXISTING)
│   ├── helpers.ts                  # General helpers (EXISTING - refactor)
│   └── global-setup.ts            # Global setup (EXISTING)
├── smoke.spec.ts                   # Smoke test (EXISTING - keep for now)
```

#### Create: `tests/e2e/types/types.selectors.ts`
- Types feature owns its selectors
- Co-located with Types tests for clear ownership
- Import shared testId helper from support directory
- Export selector identifiers (not full CSS selectors):
  ```typescript
  // Import shared helper from support
  import { testId } from '../../support/helpers';

  // Export just the identifiers for flexibility
  export const TYPES_SELECTORS = {
    page: 'types.page',
    list: {
      table: 'types.list.table',
      row: 'types.list.row',
      rowName: 'types.list.row.name',
      rowEdit: 'types.list.row.edit',
      rowDelete: 'types.list.row.delete',
    },
    form: {
      container: 'types.form.container',
      name: 'types.form.name',
      submit: 'types.form.submit',
      cancel: 'types.form.cancel',
      error: 'types.form.error',
    },
    create: {
      button: 'types.create.button',
      modal: 'types.create.modal',
      modalClose: 'types.create.modal.close',
    },
  };
  ```

#### Rename: `tests/support/selectors.ts` → `tests/support/common.selectors.ts`
- Rename existing selectors file to clarify it contains only shared UI selectors
- Update imports in existing tests
- Only truly shared UI components, not owned by any specific feature:
  ```typescript
  export const COMMON_SELECTORS = {
    toast: {
      success: 'toast.success',
      error: 'toast.error',
      warning: 'toast.warning',
      info: 'toast.info',
      close: 'toast.close',
    },
    loading: 'loading',
    error: 'error',
    modal: {
      overlay: 'modal.overlay',
      container: 'modal.container',
      close: 'modal.close',
    },
  };
  ```

#### Create: `tests/e2e/types/types.helpers.ts`
- Types-specific test utilities
- Co-located with Types tests:
  ```typescript
  import { Page } from '@playwright/test';
  import { TYPES_SELECTORS } from './types.selectors';
  import { generateRandomId, testId } from '../../support/helpers';

  export function createRandomTypeName(): string {
    const prefix = 'type';
    const shortId = generateRandomId(); // from general helpers
    return `${prefix}-${shortId}`;
  }

  export async function waitForTypeCreation(page: Page, typeName: string) {
    // Wait for creation events and list update
  }

  export async function expectBlockedDelete(page: Page) {
    // Assert blocked delete scenario
  }
  ```

#### Create: `tests/e2e/specific/types/types-crud.spec.ts`
- Specific (near-unit) tests for Types CRUD operations
- Import selectors from feature directory: `import { TYPES_SELECTORS } from '../../types/types.selectors'`
- Import testId helper from support: `import { testId } from '../../../support/helpers'`
- Test individual UI behaviors with real backend
- Test validation edge cases:
  - Duplicate name handling
  - Whitespace normalization
  - Empty name validation
  - Too-long names
  - Invalid characters
- Test error handling and recovery scenarios
- Test blocked delete with reverse dependencies (HTTP 409 handling)

#### Create: `tests/e2e/types/types-workflow.spec.ts`
- End-to-end workflow test for Types feature
- Import selectors from same directory: `import { TYPES_SELECTORS } from './types.selectors'`
- Import helpers from same directory: `import { createRandomTypeName, waitForTypeCreation } from './types.helpers'`
- Import testId from support: `import { testId } from '../../support/helpers'`
- Complete user journey: navigate → create → list update → edit → delete attempt
- Test randomized naming using prefix-shortId pattern
- Test toast notifications and TEST_EVT events
- Test navigation and route events
- Test API call sequences and correlation IDs

#### Modify: `tests/support/helpers.ts`
- Keep only general, feature-agnostic helpers
- Add testId helper function that will be shared across all tests:
  ```typescript
  export function testId(id: string): string {
    return `[data-testid="${id}"]`;
  }
  ```
- Add general event assertion helpers:
  - `expectEventSequence()` - waits for specific event order
  - `expectApiSuccess()` - waits for successful API calls
  - `expectToastMessage()` - waits for toast notifications
- Keep existing `generateRandomId()` function for use across features
- Feature-specific helpers move to feature directories (e.g., `tests/e2e/types/types.helpers.ts`)

### Documentation Updates

#### Modify: `/work/frontend/CLAUDE.md`
- Update "UI Testing (Playwright) — How Claude should work" section
- Document how to run tests locally (headless and headed modes)
- Document how to add data-testid selectors following naming patterns
- Document how to assert using TEST_EVT events
- Document console.error policy and debugging approach
- Document randomized naming convention (prefix-shortId)
- Document timeout strategies (10s default, no SSE exceptions for Types)
- Document test isolation and no-cleanup policy

## Step-by-Step Implementation

### 1. Data-testid Attributes (Priority 1)

1.1. Types page route:
   - Add page-level container selector
   - Add create button selector
   - Add list container selector

1.2. TypeList component:
   - Add table and row selectors
   - Add action button selectors
   - Follow naming pattern: feature.component.element

1.3. TypeForm component:
   - Verify existing data-testid attributes from Pre-Phase 4
   - Add any missing selectors for error displays
   - Ensure form container has proper selector

1.4. Modal components:
   - Use Dialog's contentProps for modal container selector
   - Use overlayProps for overlay selector
   - Add selector to DialogClose component

1.5. Toast components:
   - Use getItemProps pattern from refactored Toast component
   - Add type-specific selectors when creating toasts

### 2. Specific Tests Implementation

2.1. Create test file structure:
   - Follow feature ownership pattern
   - Use TypeScript with proper imports
   - Import fixtures and helpers

2.2. Test individual CRUD operations:
   - Create type with valid data
   - Create type with invalid data (validation testing)
   - Edit existing type
   - Delete type (success case)
   - Delete type with dependencies (blocked case)

2.3. Test edge cases:
   - Duplicate names
   - Whitespace handling
   - Length limits
   - Character validation

2.4. Event and API assertion:
   - Wait for TEST_EVT:api events
   - Wait for TEST_EVT:form events
   - Wait for TEST_EVT:toast events
   - Assert on HTTP status codes and error messages

### 3. E2E Workflow Test

3.1. Complete user journey:
   - Navigate to Types page (assert route event)
   - Create new type with randomized name
   - Verify creation in list (assert list update)
   - Edit the created type
   - Verify edit in list
   - Attempt delete (may be blocked if has dependencies)
   - Assert appropriate outcome (success or blocked)

3.2. Event sequence validation:
   - Track navigation events
   - Track form lifecycle events
   - Track API call events with correlation IDs
   - Track toast notification events

### 4. Helper Utilities Enhancement

4.1. Add Types-specific helpers:
   - Random name generation following prefix-shortId pattern
   - Event waiting utilities
   - Common assertion patterns

4.2. Establish reusable patterns:
   - Event sequence assertions
   - API success/error patterns
   - Toast message verification

### 5. Documentation

5.1. Update Playwright section in CLAUDE.md:
   - Local testing workflow
   - Selector strategy and naming conventions
   - Event assertion patterns
   - Debugging with console events
   - No-cleanup and randomization policies

5.2. Document for future features:
   - Selector naming patterns established by Types
   - Test structure patterns
   - Event assertion patterns

## Algorithm Details

### Randomized Naming Algorithm

1. Generate random type names:
   ```typescript
   function createRandomTypeName(): string {
     const prefix = 'type';
     const shortId = generateRandomId(); // from existing helpers
     return `${prefix}-${shortId}`;
   }
   ```

2. Collision avoidance:
   - Use existing generateRandomId() function
   - No need to check for duplicates (shortId is sufficiently random)
   - Tests tolerate preexisting data

### Event Sequence Assertion Algorithm

1. Define expected event sequences based on TEST_EVT console events:
   ```typescript
   // Events follow the pattern TEST_EVT:{kind} with JSON data
   const createTypeSequence = [
     { kind: 'form', data: { phase: 'submit' } },
     { kind: 'api', data: { status: 201 } },
     { kind: 'form', data: { phase: 'success' } },
     { kind: 'toast', data: { level: 'success' } }
   ];
   ```

2. Wait for events in order:
   - Use existing awaitEvent helper from tests/support/helpers.ts
   - Parse console messages for TEST_EVT: prefix
   - Assert each event matches expected pattern
   - Include correlation ID tracking where applicable

### Blocked Delete Testing Algorithm

1. Test blocked delete scenario:
   - Create type with known dependencies (if possible)
   - Attempt delete operation
   - Assert HTTP 409 response
   - Assert domain error code (TYPE_IN_USE)
   - Assert error toast appears
   - Assert type remains in list

2. Event verification:
   - TEST_EVT:api with status 409
   - TEST_EVT:toast with error level
   - TEST_EVT:query_error if TanStack Query involved

## Verification Steps

1. All Types components have data-testid attributes following naming patterns
2. Specific tests cover CRUD operations and edge cases
3. E2E test covers complete user workflow
4. Tests pass using only console events and selectors (no visual assertions)
5. Blocked delete scenario properly tested and verified
6. Random naming prevents collisions in dirty database runs
7. Documentation provides clear guidance for future test development
8. Event sequences are properly captured and asserted
9. All tests complete within 10s timeout limits
10. Tests run successfully in both clean and dirty database states

## Dependencies (All Completed)

- **Phase 1-3 infrastructure** ✅ - Basic Playwright setup, service orchestration, frontend instrumentation
- **Pre-Phase 4 component refactoring** ✅ - All UI components accept data-testid and forward refs
- **TEST_EVT console events** ✅ - Frontend emits structured events for observability
- **Backend testing endpoints** ✅ - Types CRUD API endpoints are functional
- **Types feature components** ✅ - All Types UI components are implemented and working

## Next Phase Preview

- **Phase 5**: Backend integration with log streaming and correlation ID debugging
  - Connect to `/api/testing/logs/stream` SSE endpoint
  - Parse structured JSON logs with correlation IDs
  - Correlate frontend TEST_EVT with backend operations
- **Additional Features**: Apply patterns established by Types to other features (Parts, Boxes, etc.)

## Implementation Priority

1. **High Priority** (Required for pilot):
   - Data-testid attributes on Types components
   - Basic CRUD test coverage
   - E2E workflow test
   - Blocked delete testing

2. **Medium Priority** (Essential patterns):
   - Comprehensive edge case testing
   - Helper utilities and patterns
   - Documentation updates

3. **Lower Priority** (Can be refined later):
   - Advanced error scenarios
   - Performance optimizations
   - Extended debugging utilities

## Notes

- This phase establishes the foundation for testing all other features
- Component refactoring from Pre-Phase 4 ensures all components accept data-testid attributes
- Selector organization follows feature ownership pattern - each feature owns its test assets
- Selectors are co-located with tests to establish clear ownership and maintainability
- Common selectors only contain truly shared UI components not owned by any feature
- Selector files export identifiers, not full CSS selectors, for flexibility
- Event assertion patterns should be reusable across features
- Tests must work reliably on dirty databases using randomization
- No visual assertions - rely entirely on structured events and selectors
- Backend log streaming (Phase 5) will provide additional debugging capability
- Focus on the Types feature as specified in the brief as the pilot implementation
- This pattern scales naturally: future features (Parts, Boxes, etc.) will follow the same structure

## Key Changes from Original Plan

1. **Component Refactoring Complete**: Pre-Phase 4 has been implemented, so all UI components now accept data-testid attributes natively
2. **TypeForm Already Updated**: According to Pre-Phase 4 completion, TypeForm already has data-testid attributes added
3. **Toast Pattern Changed**: Toast uses getItemProps pattern from refactoring, not direct attribute addition
4. **Dialog Pattern Changed**: Dialog uses contentProps/overlayProps from refactoring for attribute distribution
5. **Backend Log Streaming**: Deferred to Phase 5 but will provide correlation ID debugging capability
6. **Selector Strategy**: Uses data-testid instead of data-test to align with industry standards
7. **Component Capabilities**: All components forward refs and accept native props, simplifying test interactions