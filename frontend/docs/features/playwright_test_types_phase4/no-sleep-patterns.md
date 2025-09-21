# No-Sleep Playwright Testing Patterns Reference

## Core Principles
1. **Every wait must be for a specific, observable signal. No arbitrary delays.**
2. **UI-First**: Prefer asserting visible UI changes over custom events
3. **User-Focused**: Test what users see, not internal implementation

## Testing Priority Order

### 1. Prefer UI Signals (Best)
Assert what the user sees:
- Element visibility/hidden states
- Text content changes
- URL changes
- Element counts
- Form field values

### 2. Use Network Waits When UI Insufficient (OK)
Only when UI doesn't provide enough signal:
```typescript
await Promise.all([
  page.waitForResponse(r => r.url().endsWith('/api/types') && r.ok()),
  submitButton.click(),
]);
```

### 3. Custom Events as Last Resort (Avoid)
Only use `awaitEvent()` when absolutely no UI signal exists.

## Common UI Patterns and Their No-Sleep Solutions

### Modal/Dialog Interactions

❌ **WRONG - Fixed wait for animation:**
```typescript
await page.click('[data-testid="open-modal"]');
await page.waitForTimeout(500); // BAD! Animation delay
await page.fill('[data-testid="input"]', 'value');
```

✅ **CORRECT - Assert visibility:**
```typescript
await page.click('[data-testid="open-modal"]');
await expect(page.locator('[data-testid="modal"]')).toBeVisible();
await page.fill('[data-testid="input"]', 'value');
```

### Form Submissions

❌ **WRONG - Fixed wait for processing:**
```typescript
await page.click('[data-testid="submit"]');
await page.waitForTimeout(2000); // BAD! Waiting for save
```

✅ **CORRECT - Assert UI feedback (prioritized):**
```typescript
// BEST: Assert visible UI changes
await page.getByRole('button', { name: 'Submit' }).click();
await expect(modal).toBeHidden(); // Modal closes
await expect(page.getByRole('row', { name: typeName })).toBeVisible(); // New item appears

// OK: Include network wait if UI alone isn't enough
await Promise.all([
  page.waitForResponse(r => r.url().endsWith('/api/types') && r.ok()),
  page.getByRole('button', { name: 'Submit' }).click(),
]);
await expect(modal).toBeHidden();

// AVOID: Custom events unless no UI signal
// await awaitEvent(page, 'form', { phase: 'success' });
```

### List Updates After CRUD Operations

❌ **WRONG - Fixed wait for list refresh:**
```typescript
await createType('Resistor');
await page.waitForTimeout(1000); // BAD! Waiting for list update
const rows = await page.locator('[data-testid="type-row"]').count();
```

❌ **AVOID - :has-text selector (substring matching):**
```typescript
await expect(page.locator('[data-testid="type-row"]:has-text("Resistor")')).toBeVisible();
```

✅ **CORRECT - Use filter or role:**
```typescript
await createType('Resistor');

// BEST: Use filter for exact matching
const row = page.locator('[data-testid="type-row"]').filter({ hasText: 'Resistor' });
await expect(row).toBeVisible();

// ALSO GOOD: Use role with name
await expect(page.getByRole('row', { name: 'Resistor' })).toBeVisible();

// Count assertion
await expect(page.locator('[data-testid="type-row"]')).toHaveCount(previousCount + 1);
```

### Navigation/Route Changes

❌ **WRONG - Fixed wait after navigation:**
```typescript
await page.click('[data-testid="nav-types"]');
await page.waitForTimeout(500); // BAD! Waiting for route
```

❌ **AVOID - Custom route events:**
```typescript
await awaitEvent(page, 'route', { to: '/types' }); // Unnecessary
```

✅ **CORRECT - Assert visible UI (simpler is better):**
```typescript
await page.click('[data-testid="nav-types"]');
// Just assert the page content is visible - simplest and most reliable
await expect(page.locator('[data-testid="types.page"]')).toBeVisible();

// Optional: Also check URL if testing routing specifically
await expect(page).toHaveURL(/\/types$/);
```

### Toast Notifications

❌ **WRONG - Fixed wait for toast:**
```typescript
await saveForm();
await page.waitForTimeout(300); // BAD! Waiting for toast
const toast = page.locator('.toast');
```

❌ **AVOID - Custom toast events:**
```typescript
await awaitEvent(page, 'toast', { level: 'success' }); // Unnecessary
```

✅ **CORRECT - Use role or testid:**
```typescript
await saveForm();

// BEST: Use ARIA role
await expect(page.getByRole('status')).toHaveText(/saved|created/i);

// ALSO GOOD: Use data-testid
await expect(page.locator('[data-testid="toast"]')).toBeVisible();
await expect(page.locator('[data-testid="toast"]')).toHaveText(/success/i);
```

### Closing Modals/Dialogs

❌ **WRONG - Fixed wait for close animation:**
```typescript
await page.click('[data-testid="modal-close"]');
await page.waitForTimeout(500); // BAD! Animation delay
await page.click('[data-testid="create-button"]');
```

✅ **CORRECT - Assert hidden state:**
```typescript
await page.click('[data-testid="modal-close"]');
await expect(page.locator('[data-testid="modal"]')).toBeHidden();
await page.click('[data-testid="create-button"]');
```

### Loading States

❌ **WRONG - Fixed wait for loading:**
```typescript
await page.goto('/types');
await page.waitForTimeout(2000); // BAD! Waiting for data
```

✅ **CORRECT - Assert content appears:**
```typescript
await page.goto('/types');
// Wait for specific content that indicates loading is done
await expect(page.locator('[data-testid="types-list"]')).toBeVisible();
// OR wait for loading indicator to disappear
await expect(page.locator('[data-testid="loading"]')).toBeHidden();
```

## TEST_EVT Event Patterns (Use Sparingly)

### When to Use Custom Events

⚠️ **Only use custom events when UI signals are insufficient:**
- Background processes with no UI feedback
- Debugging complex async flows
- Verifying internal state when required

### Prefer UI Over Events

❌ **AVOID - Unnecessary custom events:**
```typescript
await awaitEvent(page, 'route', { to: '/types' }); // Just check UI instead
await awaitEvent(page, 'form', { phase: 'success' }); // Check modal closed
await awaitEvent(page, 'toast', { level: 'success' }); // Check toast text
```

✅ **CORRECT - UI-first approach:**
```typescript
// Instead of route event, check visible content
await expect(page.locator('[data-testid="types.page"]')).toBeVisible();

// Instead of form event, check UI changes
await expect(modal).toBeHidden();
await expect(newRow).toBeVisible();

// Instead of toast event, check toast content
await expect(page.getByRole('status')).toHaveText(/saved/i);
```

## Animation Killing Setup

**Add to test fixtures to eliminate animation delays:**
```typescript
test.beforeEach(async ({ page }) => {
  // Disable all animations
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
});
```

## Debugging Tips When You Think You Need a Sleep

1. **Identify what you're actually waiting for:**
   - A UI element to appear/disappear?
   - A network request to complete?
   - A state change in the UI?

2. **Find the observable signal:**
   - Text content changes
   - Element visibility/hidden state
   - Button enabled/disabled state
   - URL changes
   - List count changes

3. **Use browser DevTools:**
   - Watch network tab to identify API calls
   - Inspect elements to find data-testid attributes
   - Check console for TEST_EVT events

4. **Common solutions:**
   - Element not found? → Check if it's in a different state (hidden vs detached)
   - Flaky visibility? → Animations might not be killed properly
   - Race conditions? → Use Promise.all() for concurrent actions

## Enforcement

### ESLint Rule
```javascript
// .eslintrc.js
module.exports = {
  rules: {
    'no-restricted-syntax': [
      'error',
      {
        selector: "CallExpression[callee.object.name='page'][callee.property.name='waitForTimeout']",
        message: 'waitForTimeout is banned. Use event-driven assertions instead.'
      },
      {
        selector: "CallExpression[callee.property.name='waitForLoadState']",
        message: 'waitForLoadState is too coarse. Assert specific UI changes instead.'
      }
    ]
  }
};
```

### CI Check
```bash
# Add to CI pipeline
if grep -r "waitForTimeout\|waitForLoadState" tests/; then
  echo "❌ Fixed waits detected in tests!"
  exit 1
fi
```

## Selector Best Practices

### Prefer Semantic Selectors

1. **BEST - ARIA Roles**:
   ```typescript
   page.getByRole('button', { name: 'Submit' })
   page.getByRole('dialog')
   page.getByRole('row', { name: 'Resistor' })
   page.getByRole('status') // for toasts
   ```

2. **GOOD - Labels and Test IDs**:
   ```typescript
   page.getByLabel('Type name')
   page.getByTestId('types.form.name')
   page.locator('[data-testid="modal"]')
   ```

3. **AVOID - Implementation Details**:
   ```typescript
   page.locator('.css-class-name') // Brittle
   page.locator('div:nth-child(3)') // Position-dependent
   page.locator(':has-text("substr")') // Use filter instead
   ```

## Quick Reference Cheat Sheet

| Scenario | ❌ Don't Use | ✅ Use Instead |
|----------|--------------|----------------|
| Modal opens | `waitForTimeout(500)` | `expect(modal).toBeVisible()` |
| Modal closes | `waitForTimeout(500)` | `expect(modal).toBeHidden()` |
| Form saves | `awaitEvent('form', ...)` | `expect(modal).toBeHidden()` + `expect(row).toBeVisible()` |
| List updates | `:has-text("name")` | `.filter({ hasText: 'name' })` |
| Navigation | `awaitEvent('route', ...)` | `expect(page.locator('[data-testid]')).toBeVisible()` |
| Toast appears | `awaitEvent('toast', ...)` | `expect(page.getByRole('status')).toHaveText(/saved/)` |
| API completes | `waitForLoadState()` | `waitForResponse()` or just assert UI |

## Remember

**If you're reaching for a sleep/timeout, ask yourself:**
1. What UI signal indicates the operation is complete?
2. Can I assert that signal instead?
3. If there's no signal, should the app provide one?

The answer is never "just wait a bit" - it's always "wait for THIS specific thing to happen."