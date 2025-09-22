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

## Test Data Strategy (API-First)

- Test data for any prerequisite entity must be created through the Playwright API factories described in `docs/features/playwright_api_test_data/plan.md`.
- `tests/support/fixtures.ts` exposes a `testData` fixture (for example `testData.types.create()`, `testData.types.randomTypeName()`, `testData.parts.create()`) that wraps the Node-friendly API client.
- Maintain the dirty database policy: rely on randomized helpers exposed by the factories and never delete data inside tests.
- Page objects stay UI-only; factories are only accessed via fixtures inside the tests themselves.

**Phase 4 is now divided into sub-phases:**
- **Phase 4a**: Single test implementation - Create a type
- **Phase 4b**: Complete CRUD tests and edge cases
- **Phase 4c**: Documentation and patterns establishment

## Phase 4a: Single Test Implementation (Create Type)

### Goal
Implement and successfully run a single end-to-end test that creates a type and validates its creation. This establishes the foundation for all subsequent testing.

### Files to Create or Modify

#### 1. Add Minimal Data-testid Attributes

**Note**: Following the selector patterns guidance, data-testid attributes should only be added when elements cannot be confidently found by ARIA roles or textual labels. Prefer semantic selectors first.

**Modify: `src/routes/types/index.tsx`**
- Add `data-testid="types.page"` to main page container (needed for scoping)

**Modify: `src/components/types/TypeForm.tsx`**
- Add `aria-label` to Dialog for accessibility (e.g., "Create Type" or "Edit Type")
- Add conditional `data-testid` to Dialog element only if ARIA labels don't work:
  - `data-testid="types.create.modal"` when creating
  - `data-testid="types.edit.modal"` when editing
- Keep minimal testids only where semantic selectors fail: `types.form.name`, `types.form.submit`, `types.form.cancel`

**Modify: `src/components/types/TypeList.tsx`**
- Add `data-testid="types.list.container"` to grid container (for container selection)
- Add `data-testid="types.list.card"` to cards (for repeated elements)
- Add `data-testid="types.create.button"` only if the button text isn't stable

#### 2. Configure Playwright

**Create: `playwright.config.ts`**
```typescript
import { defineConfig } from '@playwright/test';

export default defineConfig({
  use: {
    baseURL: process.env.FRONTEND_URL ?? 'http://localhost:3100',
  },
  webServer: {
    command: 'pnpm dev',
    url: process.env.FRONTEND_URL ?? 'http://localhost:3100',
    reuseExistingServer: !process.env.CI,
  },
});
```

#### 3. Create Minimal Test Infrastructure

**Modify: `tests/support/fixtures.ts`**
- Keep existing frontend/backend URL fixtures and animation killing.
- Extend the fixture to provide a Node-friendly API client plus `testData` factories (see detailed snippet below).
- Auto-fail on `console.error`/`pageerror`.

**Create: `tests/e2e/types/TypesPage.ts`**
```typescript
import { expect, type Locator, type Page } from '@playwright/test';

export class TypesPage {
  readonly page: Page;
  readonly root: Locator;
  readonly createButton: Locator;
  readonly listContainer: Locator;
  readonly cards: Locator;

  constructor(page: Page) {
    this.page = page;
    this.root = page.getByTestId('types.page');

    // Prefer exact text for stability, fallback to testid
    this.createButton = this.root.getByRole('button', { name: 'Add Type' })
      .or(this.root.getByTestId('types.create.button'));

    // TypeList uses cards, not table
    this.listContainer = this.root.getByTestId('types.list.container');
    this.cards = this.root.getByTestId('types.list.card');
  }

  async goto() {
    await this.page.goto('/types');  // baseURL configured in playwright.config.ts
    await expect(this.root).toBeVisible();
  }

  modal(): Locator {
    // Use accessible name once added to TypeForm Dialog
    return this.page.getByRole('dialog', { name: /type/i })
      .or(this.page.getByRole('dialog'))
      .or(this.page.getByTestId('types.create.modal'));
  }

  cardByName(name: string): Locator {
    return this.cards.filter({ hasText: name });
  }

  nameInput(): Locator {
    // Case-insensitive label match
    return this.page.getByLabel(/name/i)
      .or(this.page.getByTestId('types.form.name'));
  }

  submitButton(): Locator {
    // Use exact button text from TypeForm
    return this.modal().getByRole('button', { name: /add type|update type/i })
      .or(this.page.getByTestId('types.form.submit'));
  }

  toast(text?: string | RegExp): Locator {
    const toast = this.page.getByRole('status');
    return text ? toast.filter({ hasText: text }) : toast;
  }

  async createType(name: string) {
    await this.createButton.click();
    await expect(this.modal()).toBeVisible();
    await this.nameInput().fill(name);
    await this.submitButton().click();
    await expect(this.modal()).toBeHidden();
    await expect(this.cardByName(name)).toBeVisible();
  }
}
```

**Factory-provided helpers**
- Use `testData.types.randomTypeName()` (or similar factory methods) rather than adding Types-specific utilities to shared helper files.

**Modify: `tests/support/fixtures.ts`**
Extend fixtures to include the API client factories alongside page objects:
```typescript
import { test as base } from '@playwright/test';
import { TypesPage } from '../e2e/types/TypesPage';
import { createApiClient, createTestData } from '../api';

type TestFixtures = {
  backendUrl: string;
  apiClient: ReturnType<typeof createApiClient>;
  testData: ReturnType<typeof createTestData>;
  types: TypesPage;
};

export const test = base.extend<TestFixtures>({
  backendUrl: async ({}, use) => {
    await use(process.env.BACKEND_URL || 'http://localhost:5100');
  },

  apiClient: async ({ backendUrl }, use) => {
    await use(createApiClient({ baseUrl: backendUrl }));
  },

  testData: async ({ apiClient }, use) => {
    await use(createTestData(apiClient));
  },

  page: async ({ page }, use) => {
    page.on('console', msg => {
      if (msg.type() === 'error') {
        throw new Error(`Console error: ${msg.text()}`);
      }
    });
    page.on('pageerror', err => {
      throw err;
    });

    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.addStyleTag({
      content: `*, *::before, *::after {
        transition-duration: 0s !important;
        animation-duration: 0s !important;
        animation-delay: 0s !important;
      }`
    });
    await use(page);
  },

  types: async ({ page }, use) => {
    await use(new TypesPage(page));
  },
});
```

- Existing fixtures such as `frontendUrl` and `sseTimeout` remain unchanged from earlier phases.

**Create: `tests/e2e/types/create-type.spec.ts`**
```typescript
import { test, expect } from '../../support/fixtures';

test.describe('Types - Create', () => {
  test('creates a new type', async ({ testData, types }) => {
    await types.goto();

    const typeName = testData.types.randomTypeName();
    await types.createType(typeName);  // verifies modal and card visibility
  });

  test('validates required fields', async ({ types }) => {
    await types.goto();
    await types.createButton.click();
    await expect(types.modal()).toBeVisible();

    await types.submitButton().click();

    await expect(types.modal()).toBeVisible();
    await expect(types.page.getByText(/required/i)).toBeVisible();
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
   - New card appears in list (not row, since TypeList uses cards)
   - Toast message visible via role selector
4. ✅ The test works on both clean and dirty databases
5. ✅ The test completes within 10 seconds (should be <3 seconds)
6. ✅ No console.error messages appear during the test
7. ✅ **NO FIXED WAITS** - Test uses only event-driven assertions
8. ✅ Animations are killed in test setup
9. ✅ No `:has-text` selectors - using `filter({ hasText })` or roles

### Phase 4a Implementation Steps

1. **Configure Playwright** (15 minutes)
   - Create/update playwright.config.ts with baseURL
   - Configure webServer for automatic dev server startup
   - Set Playwright version requirement (≥1.33)

2. **Add data-testid and ARIA attributes** (30 minutes)
   - Add aria-label to Dialog components for accessibility
   - Add minimal data-testid attributes for create flow
   - Add data-testid to TypeCard components

3. **Create test infrastructure** (45 minutes)
  - Create TypesPage.ts with page object pattern
  - Add `randomTypeName()` helper to the Types factory
  - Update fixtures.ts with console error enforcement and testData exposure
   - Add types fixture for page object

4. **Write and debug the test** (1-2 hours)
   - Create create-type.spec.ts using page object
   - Use semantic selectors with testid fallbacks
   - Verify UI signals work without custom events
   - Ensure console errors fail tests

5. **Validate robustness** (30 minutes)
   - Run test 10 times consecutively
   - Test should complete in <3 seconds
   - Verify no console errors
   - Verify no flakiness

## Phase 4b: Complete Test Coverage (After 4a Success)

### Goal
Expand test coverage to include all CRUD operations, edge cases, and blocked delete scenarios.

### Additional Files to Modify

#### 1. Complete Data-testid Attributes

**Modify: `src/components/types/TypeCard.tsx`** (Component that renders each type)
- Add `data-testid="types.list.card"` to card container (needed for repeated elements)
- Only add button testids if role selectors with button text aren't stable:
  - `data-testid="types.list.card.edit"` to edit button (if "Edit" text changes)
  - `data-testid="types.list.card.delete"` to delete button (if "Delete" text changes)

**Modify: `src/components/types/TypeForm.tsx`**
- Only add testids where semantic selectors fail:
  - `data-testid="types.form.error"` to error display areas (if no role="alert")
  - Keep conditional modal testids only if ARIA labels don't work:
    - `data-testid="types.create.modal"` when creating
    - `data-testid="types.edit.modal"` when editing

#### 2. Expand Test Infrastructure

**Update: `tests/e2e/types/TypesPage.ts`**
Add complete page object implementation:
```typescript
import { expect, type Locator, type Page } from '@playwright/test';

export class TypesPage {
  readonly page: Page;
  readonly root: Locator;
  readonly createButton: Locator;
  readonly listContainer: Locator;
  readonly cards: Locator;
  readonly searchInput: Locator;

  constructor(page: Page) {
    this.page = page;
    this.root = page.getByTestId('types.page');

    // Main page elements
    this.createButton = this.root.getByRole('button', { name: /add type/i })
      .or(this.root.getByTestId('types.create.button'));
    this.searchInput = this.root.getByPlaceholder('Search...');

    // List elements (cards, not table)
    this.listContainer = this.root.getByTestId('types.list.container');
    this.cards = this.root.getByTestId('types.list.card');
  }

  async goto() {
    await this.page.goto('/types');
    await expect(this.root).toBeVisible();
  }

  // Modal locators (dynamic since they're not always present)
  createModal(): Locator {
    return this.page.getByTestId('types.create.modal');
  }

  editModal(): Locator {
    return this.page.getByTestId('types.edit.modal');
  }

  modal(): Locator {
    return this.page.getByRole('dialog');
  }

  // Form elements (work in both create and edit modals)
  nameInput(): Locator {
    return this.page.getByLabel('Name')
      .or(this.page.getByTestId('types.form.name'));
  }

  submitButton(): Locator {
    return this.modal().getByRole('button', { name: /add type|update type/i })
      .or(this.page.getByTestId('types.form.submit'));
  }

  cancelButton(): Locator {
    return this.modal().getByRole('button', { name: /cancel/i })
      .or(this.page.getByTestId('types.form.cancel'));
  }

  // Card-specific methods
  cardByName(name: string): Locator {
    return this.cards.filter({ hasText: name });
  }

  editButtonForCard(name: string): Locator {
    return this.cardByName(name)
      .getByRole('button', { name: /edit/i })
      .or(this.cardByName(name).getByTestId('types.list.card.edit'));
  }

  deleteButtonForCard(name: string): Locator {
    return this.cardByName(name)
      .getByRole('button', { name: /delete/i })
      .or(this.cardByName(name).getByTestId('types.list.card.delete'));
  }

  // High-level actions
  async createType(name: string) {
    await this.createButton.click();
    await expect(this.createModal()).toBeVisible();
    await this.nameInput().fill(name);
    await this.submitButton().click();
    await expect(this.createModal()).toBeHidden();
    await expect(this.cardByName(name)).toBeVisible();
  }

  async editType(oldName: string, newName: string) {
    await this.editButtonForCard(oldName).click();
    await expect(this.editModal()).toBeVisible();
    await this.nameInput().clear();
    await this.nameInput().fill(newName);
    await this.submitButton().click();
    await expect(this.editModal()).toBeHidden();
    await expect(this.cardByName(newName)).toBeVisible();
  }

  async deleteType(name: string) {
    const countBefore = await this.cards.count();
    await this.deleteButtonForCard(name).click();

    // Confirm dialog appears
    const confirmDialog = this.page.getByRole('dialog', { name: /delete type/i });
    await expect(confirmDialog).toBeVisible();

    // Click the Delete button in the confirm dialog
    await confirmDialog.getByRole('button', { name: 'Delete' }).click();
    await expect(confirmDialog).toBeHidden();

    // Verify deletion with count and specific card
    await expect(this.cards).toHaveCount(countBefore - 1);
    await expect(this.cardByName(name)).toHaveCount(0);
  }

  async search(term: string) {
    await this.searchInput.fill(term);
    // Wait for filtered results (cards update immediately)
  }
}
```

**Factory-provided helpers**
- Leverage `testData.types.randomTypeName()` (and similar methods) instead of adding feature-specific utilities to shared helper files.

#### 3. Create Additional Tests

**Create: `tests/e2e/types/types-crud.spec.ts`**
- Seed prerequisite data with the `testData` fixture before navigating to the UI.
- Cover edit (rename), delete success, validation errors, and blocked delete scenarios.

**Testing Pattern Examples:**
```typescript
import { test, expect } from '../../support/fixtures';

test('edits an existing type', async ({ testData, types }) => {
  const existingName = testData.types.randomTypeName();
  const existing = await testData.types.create({ name: existingName });

  await types.goto();
  const newName = testData.types.randomTypeName();
  await types.editType(existing.name, newName);

  await expect(types.cardByName(existing.name)).toHaveCount(0);
  await expect(types.cardByName(newName)).toBeVisible();
});

test('deletes a type', async ({ testData, types }) => {
  const existingName = testData.types.randomTypeName();
  const existing = await testData.types.create({ name: existingName });

  await types.goto();
  await types.deleteType(existing.name);

  await expect(types.cardByName(existing.name)).toHaveCount(0);
});

test('handles validation errors', async ({ types }) => {
  await types.goto();
  await types.createButton.click();

  await types.submitButton().click();

  await expect(types.modal()).toBeVisible();
  await expect(types.page.getByText(/required/i)).toBeVisible();
});

test('blocked delete shows toast when reverse deps exist', async ({ testData, types }) => {
  const typeName = testData.types.randomTypeName();
  const type = await testData.types.create({ name: typeName });
  await testData.parts.create({ typeId: type.id });

  await types.goto();
  await types.deleteType(type.name);

  await expect(types.toast(/cannot delete/i)).toBeVisible();
  await expect(types.cardByName(type.name)).toBeVisible();
});
```

**Create: `tests/e2e/types/types-workflow.spec.ts`**
- Complete E2E workflow test
- Navigate → Create → Edit → Delete attempt
- Test with multiple types

**Delete: `tests/support/selectors.ts`**
- Remove in favor of page objects
- Each feature owns its page object

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
- Document page object pattern
- Add TEST_EVT assertion patterns
- Include debugging guidelines
- **Add No-Sleep Testing Rules section**
- Document allowed wait patterns
- Include common replacement patterns
- Reference new selector patterns document

#### 2. Create Testing Guidelines
- Document folder structure patterns
- Page object organization strategy
- Helper function patterns
- Event assertion patterns
- **Create selector-patterns.md** documenting the page object approach

#### 3. Create Examples
- Example test for future features
- Template for feature page objects
- Template for feature helpers
- Migration guide from selector maps to page objects

## Dependencies

### Required
- **Playwright ≥1.33** - For `.or()` and `.clear()` support
- **Phase 1-3 infrastructure** ✅ - Basic Playwright setup, service orchestration, frontend instrumentation
- **Component architecture** ✅ - TypeForm handles both create and edit modes with Dialog integration
- **TEST_EVT console events** ✅ - Frontend emits structured events for observability
- **Backend testing endpoints** ✅ - Types CRUD API endpoints are functional
- **Types feature components** ✅ - TypeList, TypeForm, and TypeCard components are implemented and working

### To Be Added
- **ARIA labels on Dialogs** - For robust role-based selectors
- **Console error enforcement** - Auto-fail tests on console errors
- **BaseURL configuration** - For proper navigation

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
