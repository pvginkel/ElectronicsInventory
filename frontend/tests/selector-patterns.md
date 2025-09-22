# Playwright Selector Patterns - Page Object Model

## Core Principles

1. **Role/label first, testid second** - Use semantic selectors for better accessibility and stability
2. **Page objects, not selector maps** - Expose locators and actions, not strings
3. **Feature ownership** - Each feature owns its page object, lives next to tests
4. **Locators over strings** - Return Playwright `Locator` objects for auto-waiting and chaining

## The Anti-Pattern: Centralized Selector Maps

### ❌ What NOT to do

```typescript
// Don't create centralized selector registries
export const TYPES_SELECTORS = {
  page: 'types.page',
  create: {
    button: 'types.create.button',
    modal: 'types.create.modal',
  },
  // ... grows into a god file
};

// Don't use string constants with testId helpers everywhere
await page.locator(testId(TYPES_SELECTORS.create.button)).click();
```

**Problems:**
- No auto-waiting on strings
- Can't chain or filter
- Creates a god file that grows forever
- Separates selector knowledge from feature tests
- Encourages testid-only thinking

## The Pattern: Feature Page Objects

### ✅ What to do instead

Create small, focused page objects that:
- Live next to the tests that use them
- Expose real `Locator` objects
- Provide high-level actions
- Use semantic selectors first

```typescript
// tests/e2e/types/TypesPage.ts
import { expect, type Locator, type Page } from '@playwright/test';

export class TypesPage {
  readonly page: Page;
  readonly root: Locator;
  readonly createButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.root = page.getByTestId('types.page'); // scope root

    // Prefer roles where possible, fallback to testid
    this.createButton = this.root.getByRole('button', { name: /add type/i })
      .or(this.root.getByTestId('types.create.button'));
  }

  async goto() {
    await this.page.goto('/types');
    await expect(this.root).toBeVisible();
  }

  // Return locators for composability
  modal(): Locator {
    return this.page.getByRole('dialog');
  }

  cardByName(name: string): Locator {
    return this.cards.filter({ hasText: name });
  }

  // High-level actions encapsulate workflows
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

## Selector Priority Order

### 1. Semantic Selectors (Best)

Always try these first - they're stable and improve accessibility:

```typescript
// BEST: Role-based
page.getByRole('button', { name: 'Submit' })
page.getByRole('dialog')
page.getByRole('textbox', { name: 'Email' })
page.getByRole('heading', { name: 'Dashboard' })
page.getByRole('navigation')
page.getByRole('status')  // for toasts/alerts

// GOOD: Label-based
page.getByLabel('Type name')
page.getByLabel(/email address/i)

// GOOD: Placeholder
page.getByPlaceholder('Search...')

// GOOD: Text (for static content)
page.getByText('Welcome')
page.getByText(/no results found/i)
```

### 2. Data-testid (Fallback)

Use when semantic selectors aren't reliable:

```typescript
// Custom components without good roles
page.getByTestId('types.list.card')

// Dynamic content where text changes
page.getByTestId('user.balance')

// Disambiguating similar elements
page.getByTestId('header.search') // vs footer.search
```

### 3. CSS/XPath (Last Resort)

Avoid unless absolutely necessary:

```typescript
// Only for legacy or third-party components you can't control
page.locator('.third-party-widget')
```

## Page Object Patterns

### Basic Structure

```typescript
export class FeaturePage {
  readonly page: Page;
  readonly root: Locator;  // Always scope to a root container

  constructor(page: Page) {
    this.page = page;
    this.root = page.getByTestId('feature.page');
  }

  // Navigation
  async goto() {
    await this.page.goto('/feature');
    await expect(this.root).toBeVisible();
  }

  // Element getters return Locators
  submitButton(): Locator {
    return this.root.getByRole('button', { name: /submit/i });
  }

  // Parameterized locators for dynamic content
  rowByName(name: string): Locator {
    return this.rows.filter({ hasText: name });
  }

  // High-level actions for common workflows
  async submitForm(data: FormData) {
    // ... fill form ...
    await this.submitButton().click();
    await expect(this.modal()).toBeHidden();
  }
}
```

### Using .or() for Fallbacks

Combine semantic and testid selectors (requires Playwright ≥1.33):

```typescript
// Try exact text first, then fallback
this.createButton = this.root
  .getByRole('button', { name: 'Add Type' })  // Exact match preferred
  .or(this.root.getByTestId('types.create.button'));

// Case-insensitive label matching
this.nameInput = this.page
  .getByLabel(/name/i)  // Case-insensitive
  .or(this.page.getByTestId('types.form.name'));

// Dialog with accessible name
this.modal = () => this.page
  .getByRole('dialog', { name: /create type/i })  // Requires aria-label
  .or(this.page.getByRole('dialog'))
  .or(this.page.getByTestId('types.create.modal'));
```

**Important**: Ensure Radix Dialog components have proper `aria-label` or `aria-labelledby` for robust selectors.

### Scoping with Root Container

Always scope to avoid selecting elements from other parts of the page:

```typescript
constructor(page: Page) {
  this.page = page;
  this.root = page.getByTestId('types.page');

  // Scoped to this feature's section
  this.title = this.root.getByRole('heading');
  this.cards = this.root.getByTestId('types.list.card');

  // Not scoped - for modals/toasts that render at document root
  this.modal = () => this.page.getByRole('dialog');
  this.toast = () => this.page.getByRole('status');
}
```

## Playwright Configuration

### Base URL Setup

Always configure `baseURL` in playwright.config.ts to enable relative navigation:

```typescript
// playwright.config.ts
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

This allows clean navigation in page objects:
```typescript
await this.page.goto('/types');  // Uses baseURL automatically
```

## Fixture Integration

### Complete Fixture Setup with Error Enforcement

```typescript
// tests/support/fixtures.ts
import { test as base } from '@playwright/test';
import { TypesPage } from '../e2e/types/TypesPage';
import { PartsPage } from '../e2e/parts/PartsPage';

export const test = base.extend<{
  types: TypesPage;
  parts: PartsPage;
}>({
  page: async ({ page }, use) => {
    // Fail on console errors - enforces clean code
    page.on('console', msg => {
      if (msg.type() === 'error') {
        throw new Error(`Console error: ${msg.text()}`);
      }
    });
    page.on('pageerror', err => {
      throw err;
    });

    // Kill animations for deterministic tests
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

  parts: async ({ page }, use) => {
    await use(new PartsPage(page));
  },
});
```

## Test Patterns

### Clean, Readable Tests

```typescript
import { test, expect } from '../../support/fixtures';

test('creates a type', async ({ types }) => {
  await types.goto();
  const name = `type-${Date.now()}`;
  await types.createType(name);
  await expect(types.page.getByRole('status')).toHaveText(/created/i);
});

test('edits a type', async ({ types }) => {
  await types.goto();
  await types.editType('Resistor', 'Resistor SMD');
  await expect(types.cardByName('Resistor SMD')).toBeVisible();
});

test('searches types', async ({ types }) => {
  await types.goto();
  await types.search('capacitor');
  await expect(types.cards).toHaveCount(3);
  await expect(types.cardByName('Capacitor')).toBeVisible();
  await expect(types.cardByName('Resistor')).toBeHidden();
});
```

### Avoid This Pattern

```typescript
// ❌ Don't scatter selectors throughout tests
test('bad pattern', async ({ page }) => {
  await page.goto('/types');
  await page.locator('[data-testid="types.create.button"]').click();
  await page.locator('[data-testid="types.form.name"]').fill('test');
  await page.locator('[data-testid="types.form.submit"]').click();
  // ... selectors everywhere, no reusability
});
```

## Data-testid Naming Conventions

When you do need data-testid attributes, keep them semantic and stable:

### Structure: `feature.component.element`

```typescript
// Page roots
data-testid="types.page"
data-testid="parts.page"
data-testid="dashboard.page"

// Lists and collections
data-testid="types.list.container"
data-testid="types.list.card"       // repeated for each card
data-testid="types.list.card.name"  // element within card

// Forms
data-testid="types.form.name"
data-testid="types.form.submit"
data-testid="types.form.cancel"
data-testid="types.form.error"

// Actions
data-testid="types.create.button"
data-testid="types.search.input"
data-testid="types.filter.dropdown"

// Modals (differentiate by context)
data-testid="types.create.modal"
data-testid="types.edit.modal"
data-testid="types.delete.confirm"
```

### What to Avoid

```typescript
// ❌ Layout-specific (brittle)
data-testid="left-sidebar"
data-testid="top-nav"
data-testid="third-card"

// ❌ Style-specific (changes with design)
data-testid="blue-button"
data-testid="large-modal"

// ❌ Too generic (collisions)
data-testid="button"
data-testid="modal"
data-testid="input"

// ❌ Implementation details
data-testid="useState-value"
data-testid="redux-state"
```

## Migration Guide

### From Selector Maps to Page Objects

#### Before (Selector Map)
```typescript
// selectors.ts
export const SELECTORS = {
  types: {
    page: 'types.page',
    createButton: 'types.create.button',
    // ...
  }
};

// test.spec.ts
import { SELECTORS } from './selectors';
import { testId } from '../helpers';

test('old way', async ({ page }) => {
  await page.goto('/types');
  await page.locator(testId(SELECTORS.types.page)).waitFor();
  await page.locator(testId(SELECTORS.types.createButton)).click();
  // ...
});
```

#### After (Page Object)
```typescript
// TypesPage.ts
export class TypesPage {
  constructor(page: Page) {
    this.page = page;
    this.root = page.getByTestId('types.page');
    this.createButton = this.root.getByRole('button', { name: /add type/i });
  }

  async goto() {
    await this.page.goto('/types');
    await expect(this.root).toBeVisible();
  }
}

// test.spec.ts
test('new way', async ({ types }) => {
  await types.goto();
  await types.createButton.click();
  // ...
});
```

### Migration Steps

1. **Create page object class** next to tests
2. **Move selectors** into page object as Locator properties
3. **Add semantic alternatives** using .or()
4. **Extract common workflows** into page object methods
5. **Add to fixtures** for easy test access
6. **Update tests** to use page object
7. **Delete selector map file**

## Common Patterns

### Toast Assertions

Handle multiple toasts by filtering:

```typescript
toast(text?: string | RegExp): Locator {
  const toast = this.page.getByRole('status');
  return text ? toast.filter({ hasText: text }) : toast;
}

// Usage
await expect(types.toast(/created/i)).toBeVisible();
await expect(types.toast(/error/i)).toBeHidden();
```

### Deletion Verification

Combine count and visibility checks:

```typescript
async deleteType(name: string) {
  const countBefore = await this.cards.count();

  // ... perform deletion ...

  // Verify with both count and specific element
  await expect(this.cards).toHaveCount(countBefore - 1);
  await expect(this.cardByName(name)).toHaveCount(0);  // More precise than toBeHidden()
}
```

### Dynamic Content

```typescript
// For content that loads after navigation
async waitForContent() {
  await expect(this.loadingSpinner).toBeHidden();
  await expect(this.cards.first()).toBeVisible();
}

// For real-time updates
async waitForUpdate(expectedCount: number) {
  await expect(this.cards).toHaveCount(expectedCount);
}
```

### Conditional Elements

```typescript
// Elements that may or may not exist
errorMessage(): Locator {
  return this.root.getByRole('alert');
}

async hasError(): Promise<boolean> {
  return await this.errorMessage().isVisible();
}

async clearErrorIfPresent() {
  if (await this.hasError()) {
    await this.clearButton.click();
  }
}
```

### Complex Interactions

```typescript
// Multi-step workflows
async importFile(filePath: string) {
  await this.importButton.click();
  await expect(this.fileModal()).toBeVisible();
  await this.fileInput.setInputFiles(filePath);
  await this.confirmImport.click();
  await expect(this.fileModal()).toBeHidden();
  await expect(this.successToast()).toBeVisible();
}
```

## Testing Philosophy

### Why Page Objects Win

1. **Maintainability**: Change DOM once, all tests still work
2. **Readability**: Tests read like user stories
3. **Reusability**: Common workflows in one place
4. **Type Safety**: TypeScript knows about your page structure
5. **Auto-waiting**: Locator objects handle timing automatically
6. **Debugging**: Set breakpoints in page object methods

### The Right Abstraction Level

Page objects should represent **user-facing concepts**, not implementation details:

```typescript
// ✅ Good: User actions
await types.createType('Resistor');
await types.searchFor('capacitor');
await types.deleteType('LED');

// ❌ Bad: Implementation details
await types.clickElementAtIndex(3);
await types.setStateValue('isOpen', true);
await types.triggerRerender();
```

## Key Requirements

### Playwright Version
- **Minimum**: Playwright ≥1.33 (for `.or()` and `.clear()` support)
- Pin version in `package.json` to avoid CI surprises

### Accessibility Requirements
- Add `aria-label` or `aria-labelledby` to Radix Dialog components
- Ensure toasts have proper `role="status"` for reliable selection
- Use semantic HTML where possible

### Folder Structure
- Keep tests organized: `tests/e2e/{feature}/`
- Page objects live next to tests: `tests/e2e/{feature}/{Feature}Page.ts`
- Avoid nested structures like `tests/e2e/specific/types/`

## toBeHidden vs not.toBeVisible

Understand the difference:
- `toBeHidden()` - Element is hidden OR detached from DOM
- `not.toBeVisible()` - Element exists but is not visible

Usually `toBeHidden()` is what you want for "element gone" assertions.

## Summary

- **Don't** create centralized selector maps
- **Do** create feature-specific page objects with baseURL configured
- **Don't** use raw strings for selectors
- **Do** return Locator objects with semantic selectors first
- **Don't** ignore console errors
- **Do** enforce clean console with error handlers
- **Don't** use arbitrary folder structures
- **Do** keep consistent `tests/e2e/{feature}/` organization
- **Don't** rely only on data-testid
- **Do** add ARIA labels and use role selectors

This approach scales with your application, keeps tests maintainable, catches errors early, and naturally improves accessibility by encouraging semantic HTML and ARIA patterns.