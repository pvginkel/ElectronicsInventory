# Playwright Test Types Feature Phase 4 - Technical Plan (Phased Approach)

## Brief Description

Implement data-testid attributes and end-to-end test coverage for the Types feature to serve as the pilot implementation for the Playwright test suite. This phase leverages the completed component refactoring from Pre-Phase 4, which enables all components to accept data-testid attributes and forward refs.

## Critical Testing Rules - No-Sleep Policy

**HARD RULE: No fixed waits are allowed. Tests must be event-driven, fast, and deterministic.**

📚 **See full patterns guide**: [`no-sleep-patterns.md`](./no-sleep-patterns.md)

### Testing Philosophy
- **UI-First**: Prefer asserting visible UI changes over custom events
- **User-Focused**: Test what users see, not internal implementation
- **Fast & Deterministic**: Kill animations, assert observable signals

### Banned Patterns
- ❌ `page.waitForTimeout(...)` - NEVER use
- ❌ `setTimeout`/`sleep` helpers - NEVER use
- ❌ `page.waitForLoadState('networkidle')` - Too coarse for SPAs
- ❌ `test.slow()` or timeout increases to "make it pass"
- ❌ `:has-text(...)` - Use `filter({ hasText })` or roles instead

### Required Patterns
- ✅ After every async UI action, assert a UI signal
- ✅ Use locator assertions: `toBeVisible()`, `toBeHidden()`, `toBeEnabled()`, `toHaveCount()`
- ✅ Assert dependent UI changes, not time
- ✅ Kill animations in test setup (beforeEach)
- ✅ Prefer UI assertions over custom events (TEST_EVT)

### Allowed Waits (Prioritized)
1. **Prefer UI signals**:
   - `expect(locator).toBeVisible()/toBeHidden()`
   - `expect(page).toHaveURL(...)`
   - `expect(locator).toHaveText(...)`
   - `expect(locator).toHaveCount(n)`

2. **Use network waits only when UI insufficient**:
   - `page.waitForResponse(r => r.url().endsWith('/api/...') && r.ok())`

3. **Custom events as last resort**:
   - `awaitEvent()` only when no UI signal exists

**Bottom line:** Assert what the user sees, not what the system does internally.

## Phase Overview

This is Phase 4 of the Playwright test suite implementation, building on:
- **Phase 1-3**: Basic infrastructure, service orchestration, and frontend instrumentation (✅ Complete)
- **Pre-Phase 4**: Component refactoring to accept data-* attributes and forward refs (✅ Complete)

**Phase 4 is now divided into sub-phases:**
- **Phase 4a**: Single test implementation - Create a type
- **Phase 4b**: Complete CRUD tests and edge cases
- **Phase 4c**: Documentation and patterns establishment

## Phase 4a: Single Test Implementation (Create Type)

### Goal
Implement and successfully run a single end-to-end test that creates a type and validates its creation. This establishes the foundation for all subsequent testing.

### Files to Create or Modify

#### 1. Add Minimal Data-testid Attributes

**Modify: `src/routes/types/index.tsx`**
- Add `data-testid="types.page"` to main page container
- Add `data-testid="types.create.button"` to create button

**Modify: `src/components/types/type-create-dialog.tsx`**
- Add `data-testid="types.create.modal"` to Dialog contentProps

**Verify: `src/components/types/TypeForm.tsx`**
- Verify `data-testid="types.form.name"` on Input component
- Verify `data-testid="types.form.submit"` on submit Button
- Note: These should already exist from Pre-Phase 4

**Modify: `src/components/types/TypeList.tsx`**
- Add `data-testid="types.list.table"` to table element
- Add `data-testid="types.list.row"` to each table row
- Add `data-testid="types.list.row.name"` to name cells

#### 2. Create Minimal Test Infrastructure

**Modify: `tests/support/fixtures.ts`**
Add animation killing to test setup:
```typescript
export const test = base.extend({
  page: async ({ page }, use) => {
    // Kill all animations for deterministic tests
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.addStyleTag({
      content: `
        *, *::before, *::after {
          transition-duration: 0s !important;
          animation-duration: 0s !important;
          animation-delay: 0s !important;
        }
      `
    });
    await use(page);
  },
});
```

**Create: `tests/e2e/types/types.selectors.ts`**
```typescript
// Minimal selectors for create test
export const TYPES_SELECTORS = {
  page: 'types.page',
  create: {
    button: 'types.create.button',
    modal: 'types.create.modal',
  },
  form: {
    name: 'types.form.name',
    submit: 'types.form.submit',
  },
  list: {
    table: 'types.list.table',
    row: 'types.list.row',
    rowName: 'types.list.row.name',
  },
};
```

**Create: `tests/e2e/types/types.helpers.ts`**
```typescript
import { generateRandomId } from '../../support/helpers';

export function createRandomTypeName(): string {
  const prefix = 'type';
  const shortId = generateRandomId();
  return `${prefix}-${shortId}`;
}
```

**Modify: `tests/support/helpers.ts`**
Add only the essential helper:
```typescript
export function testId(id: string): string {
  return `[data-testid="${id}"]`;
}

// Keep generateRandomId for name generation
export function generateRandomId(): string {
  return Math.random().toString(36).substring(2, 8);
}

// Optional: awaitEvent only if truly needed (prefer UI assertions)
// Consider removing if not used in Phase 4a
```

**Create: `tests/e2e/types/create-type.spec.ts`**
```typescript
import { test, expect } from '../../support/fixtures';
import { TYPES_SELECTORS } from './types.selectors';
import { createRandomTypeName } from './types.helpers';
import { testId } from '../../support/helpers';

test.describe('Types - Create', () => {
  test('creates a new type', async ({ page }) => {
    // Navigate and verify page is ready
    await page.goto('/types');
    await expect(page.locator(testId(TYPES_SELECTORS.page))).toBeVisible();

    // Open create modal
    await page.locator(testId(TYPES_SELECTORS.create.button)).click();
    const modal = page.locator(testId(TYPES_SELECTORS.create.modal));
    await expect(modal).toBeVisible();

    // Fill in type name
    const typeName = createRandomTypeName();
    await page.locator(testId(TYPES_SELECTORS.form.name)).fill(typeName);

    // Submit form (optionally wait for API response)
    const submitButton = page.locator(testId(TYPES_SELECTORS.form.submit));
    await Promise.all([
      // Optional: only if UI assertions below aren't sufficient
      page.waitForResponse(r => r.url().endsWith('/api/types') && r.ok()),
      submitButton.click(),
    ]);

    // Assert modal closes
    await expect(modal).toBeHidden();

    // Assert the user-visible outcome: new row appears
    const row = page
      .locator(testId(TYPES_SELECTORS.list.row))
      .filter({ hasText: typeName });
    await expect(row).toBeVisible();

    // Optional: assert toast message via role or testid
    await expect(page.getByRole('status')).toHaveText(/created|saved/i);
    // OR if using data-testid:
    // await expect(page.locator('[data-testid="toast"]')).toHaveText(/created/i);
  });
});
```

### Phase 4a Verification Checklist

Before proceeding to Phase 4b, ensure:

1. ✅ All required data-testid attributes are in place
2. ✅ The create-type test runs successfully
3. ✅ **UI-First assertions work**:
   - Page visibility confirmed
   - Modal opens/closes properly
   - New row appears in list
   - Toast message visible (if applicable)
4. ✅ The test works on both clean and dirty databases
5. ✅ The test completes within 10 seconds (should be <3 seconds)
6. ✅ No console.error messages appear during the test
7. ✅ **NO FIXED WAITS** - Test uses only event-driven assertions
8. ✅ Animations are killed in test setup
9. ✅ No `:has-text` selectors - using `filter({ hasText })` or roles

### Phase 4a Implementation Steps

1. **Add data-testid attributes** (30 minutes)
   - Add minimal attributes needed for create flow
   - Verify components accept and forward attributes
   - Consider adding ARIA roles for better selector options

2. **Create test infrastructure** (45 minutes)
   - Create types.selectors.ts with minimal selectors
   - Create types.helpers.ts with name generation
   - Add testId helper to support/helpers.ts
   - Ensure animation killing is in fixtures

3. **Write and debug the test** (1-2 hours)
   - Create create-type.spec.ts following UI-first approach
   - Use roles and filter() instead of :has-text
   - Verify UI signals work without custom events
   - Ensure test passes consistently

4. **Validate robustness** (30 minutes)
   - Run test 10 times consecutively
   - Test should complete in <3 seconds
   - Verify no flakiness
   - Remove any unnecessary waits

## Phase 4b: Complete Test Coverage (After 4a Success)

### Goal
Expand test coverage to include all CRUD operations, edge cases, and blocked delete scenarios.

### Additional Files to Modify

#### 1. Complete Data-testid Attributes

**Modify: `src/components/types/TypeList.tsx`**
- Add `data-testid="types.list.row.edit"` to edit buttons
- Add `data-testid="types.list.row.delete"` to delete buttons
- Add `data-testid="types.list.row.actions"` to actions container

**Modify: `src/components/types/TypeForm.tsx`**
- Add `data-testid="types.form.container"` to form wrapper
- Add `data-testid="types.form.cancel"` to cancel button
- Add `data-testid="types.form.error"` to error display areas

**Modify: `src/components/types/type-create-dialog.tsx`**
- Add `data-testid="types.create.modal.close"` to close button
- Add `data-testid="types.create.modal.overlay"` to overlay

#### 2. Expand Test Infrastructure

**Update: `tests/e2e/types/types.selectors.ts`**
Add complete selector set:
```typescript
export const TYPES_SELECTORS = {
  page: 'types.page',
  list: {
    container: 'types.list.container',
    table: 'types.list.table',
    row: 'types.list.row',
    rowName: 'types.list.row.name',
    rowEdit: 'types.list.row.edit',
    rowDelete: 'types.list.row.delete',
    rowActions: 'types.list.row.actions',
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
    modalOverlay: 'types.create.modal.overlay',
  },
};
```

**Update: `tests/e2e/types/types.helpers.ts`**
Add additional helpers:
```typescript
export async function waitForTypeCreation(page: Page, typeName: string) {
  // Implementation
}

export async function expectBlockedDelete(page: Page) {
  // Implementation
}

export async function deleteType(page: Page, typeName: string) {
  // Implementation
}
```

#### 3. Create Additional Tests

**Create: `tests/e2e/specific/types/types-crud.spec.ts`**
- Test edit functionality (assert UI changes, no waits)
- Test delete functionality (assert row removal)
- Test validation (assert error messages appear)
- Test blocked delete with dependencies (assert error toast)

**Testing Pattern Examples:**
```typescript
// Edit test - UI-first approach
await page.getByRole('button', { name: 'Edit' }).click();
await expect(page.getByRole('dialog')).toBeVisible();

// Delete test - Assert UI change
await page.getByRole('button', { name: 'Delete' }).click();
await expect(page.getByRole('dialog', { name: /confirm/i })).toBeVisible();
await page.getByRole('button', { name: 'Confirm' }).click();
// Use filter instead of :has-text
const row = page.locator('[data-testid="type-row"]').filter({ hasText: typeName });
await expect(row).toBeHidden();

// Validation test - Assert error appears
await page.getByLabel('Type name').fill('');
await page.getByRole('button', { name: 'Submit' }).click();
await expect(page.getByRole('alert')).toHaveText(/required/i);
// OR with data-testid:
await expect(page.locator('[data-testid="form.error"]')).toBeVisible();
```

**Create: `tests/e2e/types/types-workflow.spec.ts`**
- Complete E2E workflow test
- Navigate → Create → Edit → Delete attempt
- Test with multiple types

**Rename: `tests/support/selectors.ts` → `tests/support/common.selectors.ts`**
- Update for shared selectors

### Phase 4b Test Coverage

1. **CRUD Operations**
   - ✅ Create (from Phase 4a)
   - Edit existing type
   - Delete type successfully
   - List and search types

2. **Validation Tests**
   - Empty name validation
   - Duplicate name handling
   - Whitespace normalization
   - Maximum length validation
   - Special characters handling

3. **Error Scenarios**
   - Network failure simulation
   - Blocked delete (409 response)
   - Server error handling

4. **Event Sequences**
   - Complete form lifecycle
   - API correlation IDs
   - Toast notifications for all operations

## Phase 4c: Documentation and Patterns (After 4b Success)

### Goal
Document patterns, update CLAUDE.md, and establish guidelines for future features.

### Documentation Tasks

#### 1. Update CLAUDE.md
- Complete Playwright testing section
- Document selector naming conventions
- Add TEST_EVT assertion patterns
- Include debugging guidelines
- **Add No-Sleep Testing Rules section**
- Document allowed wait patterns
- Include common replacement patterns

#### 2. Create Testing Guidelines
- Document folder structure patterns
- Selector organization strategy
- Helper function patterns
- Event assertion patterns

#### 3. Create Examples
- Example test for future features
- Template for feature selectors
- Template for feature helpers

## Dependencies (All Completed)

- **Phase 1-3 infrastructure** ✅ - Basic Playwright setup, service orchestration, frontend instrumentation
- **Pre-Phase 4 component refactoring** ✅ - All UI components accept data-testid and forward refs
- **TEST_EVT console events** ✅ - Frontend emits structured events for observability
- **Backend testing endpoints** ✅ - Types CRUD API endpoints are functional
- **Types feature components** ✅ - All Types UI components are implemented and working

## Success Criteria

### Phase 4a Success Criteria
- Single test (create-type.spec.ts) runs successfully
- Test completes in under 10 seconds
- No console errors during execution
- Works on dirty database
- Events properly captured and asserted
- **ZERO fixed waits** (`waitForTimeout` = automatic failure)
- All assertions are for observable UI signals

### Phase 4b Success Criteria
- All CRUD operations tested
- Edge cases covered
- Blocked delete scenario tested
- All tests pass consistently
- Test suite completes in under 2 minutes

### Phase 4c Success Criteria
- Documentation complete and clear
- Patterns established for future features
- Examples provided for other developers

## Risk Mitigation

### Phase 4a Risks
- **Selector issues**: Components might not forward data-testid properly
  - Mitigation: Verify in browser DevTools before writing tests

- **Event timing**: Events might not fire as expected
  - Mitigation: Add console logging during initial development
  - **NO FIXED WAITS**: Use UI assertions instead

- **Modal animations**: Dialog animations might cause timing issues
  - Mitigation: Kill animations in test setup
  - Assert visibility states, not arbitrary delays

- **Race conditions**: UI might update before events fire
  - Mitigation: Use Promise.all() for concurrent actions/waits
  - Assert dependent UI changes

### Phase 4b Risks
- **Test interdependencies**: Tests might affect each other
  - Mitigation: Use randomized names, don't rely on specific state

- **Performance**: Full suite might exceed timeout
  - Mitigation: Optimize selectors, reduce unnecessary waits

## Implementation Order

### Phase 4a (Immediate)
1. Add minimal data-testid attributes (30 min)
2. Create test infrastructure (45 min)
3. Write create-type test (1-2 hours)
4. Debug and verify (30 min)
5. **STOP AND VALIDATE** before proceeding

### Phase 4b (After 4a validation)
1. Add remaining data-testid attributes
2. Expand test helpers
3. Write CRUD tests
4. Write validation tests
5. Test blocked delete scenario

### Phase 4c (After 4b completion)
1. Update CLAUDE.md
2. Document patterns
3. Create templates and examples

## Notes

- **Phase 4a is the foundation** - Do not proceed until it works perfectly
- Component refactoring from Pre-Phase 4 ensures components accept data-testid
- Focus on the single test until it's robust and reliable
- Backend log streaming (Phase 5) will add debugging capability later
- This phased approach reduces risk and ensures a solid foundation
- **No-Sleep Policy is non-negotiable** - See [`no-sleep-patterns.md`](./no-sleep-patterns.md) for patterns
- If a test seems to need a sleep, the problem is either:
  - Missing UI signal (add data-testid or observable state)
  - Wrong assertion (find the right signal to wait for)
  - Animation not killed (check test setup)

## Key Principles

1. **Start small**: One test that works is better than ten that don't
2. **Validate early**: Ensure Phase 4a works before expanding
3. **Build incrementally**: Each phase builds on the previous success
4. **Document as you go**: Capture learnings from each phase
5. **Test the tests**: Ensure tests are reliable before adding more
6. **NO FIXED WAITS**: Event-driven tests only - if you need a delay, find the UI signal
7. **Fast and deterministic**: Tests should run quickly and consistently
8. **UI-First**: Prefer visible UI assertions over custom events
9. **User-Focused**: Test what users see, not internal implementation