# No-Sleep Playwright Testing Patterns Reference

## Core Principle
**Every wait must be for a specific, observable signal. No arbitrary delays.**

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

✅ **CORRECT - Assert UI feedback:**
```typescript
// Option 1: Wait for specific API response
await Promise.all([
  page.waitForResponse(r => r.url().includes('/api/types') && r.ok()),
  page.click('[data-testid="submit"]'),
]);

// Option 2: Assert toast/success message
await page.click('[data-testid="submit"]');
await expect(page.locator('[data-testid="toast"]')).toHaveText(/saved/i);

// Option 3: Assert button state change
await page.click('[data-testid="submit"]');
await expect(page.locator('[data-testid="submit"]')).toBeEnabled();
```

### List Updates After CRUD Operations

❌ **WRONG - Fixed wait for list refresh:**
```typescript
await createType('Resistor');
await page.waitForTimeout(1000); // BAD! Waiting for list update
const rows = await page.locator('[data-testid="type-row"]').count();
```

✅ **CORRECT - Assert new item appears:**
```typescript
await createType('Resistor');
await expect(page.locator('[data-testid="type-row"]:has-text("Resistor")')).toBeVisible();
// OR assert count change
await expect(page.locator('[data-testid="type-row"]')).toHaveCount(previousCount + 1);
```

### Navigation/Route Changes

❌ **WRONG - Fixed wait after navigation:**
```typescript
await page.click('[data-testid="nav-types"]');
await page.waitForTimeout(500); // BAD! Waiting for route
```

✅ **CORRECT - Assert URL and content:**
```typescript
await page.click('[data-testid="nav-types"]');
await expect(page).toHaveURL(/\/types$/);
await expect(page.locator('[data-testid="types.page"]')).toBeVisible();
```

### Toast Notifications

❌ **WRONG - Fixed wait for toast:**
```typescript
await saveForm();
await page.waitForTimeout(300); // BAD! Waiting for toast
const toast = page.locator('.toast');
```

✅ **CORRECT - Assert toast content:**
```typescript
await saveForm();
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

## TEST_EVT Event Patterns

### Waiting for Console Events

✅ **CORRECT - Event-driven approach:**
```typescript
// awaitEvent helper waits for specific console events
await Promise.all([
  awaitEvent(page, 'api', { status: 201 }),
  page.click('[data-testid="submit"]'),
]);

// Sequential events
await awaitEvent(page, 'form', { phase: 'submit' });
await awaitEvent(page, 'api', { status: 200 });
await awaitEvent(page, 'form', { phase: 'success' });
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

## Quick Reference Cheat Sheet

| Scenario | ❌ Don't Use | ✅ Use Instead |
|----------|--------------|----------------|
| Modal opens | `waitForTimeout(500)` | `expect(modal).toBeVisible()` |
| Modal closes | `waitForTimeout(500)` | `expect(modal).toBeHidden()` |
| Form saves | `waitForTimeout(2000)` | `expect(toast).toHaveText(/saved/)` |
| List updates | `waitForTimeout(1000)` | `expect(row).toBeVisible()` |
| Navigation | `waitForTimeout(500)` | `expect(page).toHaveURL()` |
| API call | `waitForLoadState()` | `waitForResponse(predicate)` |
| Loading done | `waitForTimeout(3000)` | `expect(loader).toBeHidden()` |

## Remember

**If you're reaching for a sleep/timeout, ask yourself:**
1. What UI signal indicates the operation is complete?
2. Can I assert that signal instead?
3. If there's no signal, should the app provide one?

The answer is never "just wait a bit" - it's always "wait for THIS specific thing to happen."