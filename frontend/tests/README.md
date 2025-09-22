# Playwright Test Suite - Developer Guide

## Overview

This test suite uses Playwright for end-to-end testing with an **API-first approach** for test data setup. Tests create prerequisite data through API factories rather than clicking through UI flows, making tests faster and more maintainable.

## Core Principles

1. **API-First Data Setup**: All prerequisite data must be created via API factories
2. **Dirty Database Policy**: Tests use randomized names and never clean up data
3. **Page Objects for UI**: UI interactions are encapsulated in page objects
4. **No Fixed Waits**: Tests must be event-driven, fast, and deterministic

## Test Data Architecture

### API Client (`tests/api/client.ts`)

The foundation is a Node-friendly API client that:
- Uses `openapi-fetch` with Node's native `fetch` (Node 18+)
- Connects to the backend at `http://localhost:5100` by default
- Imports generated types from `src/lib/api/generated/types.ts`
- Provides `apiRequest` wrapper that throws on non-2xx responses

```typescript
import { createApiClient, apiRequest } from '../api/client';

const client = createApiClient();
const data = await apiRequest(() =>
  client.GET('/api/types')
);
```

### Test Factories

Factories provide domain-specific methods for creating test data:

#### TypeTestFactory (`tests/api/factories/type-factory.ts`)

```typescript
const factory = new TypeTestFactory();

// Create with defaults
const type = await factory.create();

// Create with overrides
const type = await factory.create({
  name: 'Custom Type Name'
});

// Generate random names
const name = factory.randomTypeName('Capacitor');  // e.g., "Capacitor-xyz123"
```

#### PartTestFactory (`tests/api/factories/part-factory.ts`)

```typescript
const factory = new PartTestFactory();

// Create part with auto-generated type
const { part, type } = await factory.create();

// Create part with existing type
const { part, type } = await factory.create({
  typeId: existingType.id,
  overrides: {
    description: 'Custom description',
    manufacturer_code: 'ABC-123'
  }
});

// Random generators
const desc = factory.randomPartDescription('Resistor');
const code = factory.randomManufacturerCode();  // e.g., "TEST-1234"
```

### Test Fixtures (`tests/support/fixtures.ts`)

Fixtures provide pre-configured instances to all tests:

```typescript
import { test, expect } from '../support/fixtures';

test('example test', async ({ testData, page, frontendUrl }) => {
  // testData provides all factories
  const type = await testData.types.create();
  const typeName = testData.types.randomTypeName();

  const { part } = await testData.parts.create({
    typeId: type.id
  });

  // Navigate to UI after data setup
  await page.goto(`${frontendUrl}/types`);
});
```

Available fixtures:
- `testData`: Bundle of all test factories
- `apiClient`: Raw API client instance
- `frontendUrl`: Frontend base URL (default: `http://localhost:3100`)
- `backendUrl`: Backend base URL (default: `http://localhost:5100`)
- `page`: Playwright page with console error detection
- `sseTimeout`: Timeout for SSE operations (35 seconds)

## Usage Patterns

### Creating Test Prerequisites

**✅ CORRECT: Create data via API, then test UI**
```typescript
test('edit existing type', async ({ testData, page }) => {
  // Create type via API
  const existing = await testData.types.create({
    name: testData.types.randomTypeName()
  });

  // Now test editing it in the UI
  await page.goto('/types');
  await page.getByText(existing.name).click();
  // ... continue with edit flow
});
```

**❌ WRONG: Click through UI to create test data**
```typescript
test('edit existing type', async ({ page }) => {
  // DON'T do this - inefficient and couples tests
  await page.goto('/types');
  await page.getByRole('button', { name: 'Add Type' }).click();
  await page.getByLabel('Name').fill('Test Type');
  await page.getByRole('button', { name: 'Save' }).click();
  // ... now finally testing the edit
});
```

### Testing Delete with Dependencies

```typescript
test('blocked delete shows error', async ({ testData, page }) => {
  // Create type and dependent part via API
  const type = await testData.types.create();
  await testData.parts.create({ typeId: type.id });

  // Test that delete is blocked in UI
  await page.goto('/types');
  await page.getByText(type.name).click();
  await page.getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByText(/cannot delete/i)).toBeVisible();
});
```

### Using Random Helpers

All factories provide random generators for unique test data:

```typescript
test('search functionality', async ({ testData, page }) => {
  // Create multiple items with unique prefixes
  const types = await Promise.all([
    testData.types.create({ name: testData.types.randomTypeName('Resistor') }),
    testData.types.create({ name: testData.types.randomTypeName('Capacitor') }),
    testData.types.create({ name: testData.types.randomTypeName('Inductor') })
  ]);

  await page.goto('/types');
  await page.getByPlaceholder('Search').fill('Capacitor');
  // Should only see the Capacitor type
  await expect(page.getByText(/Capacitor-/)).toBeVisible();
  await expect(page.getByText(/Resistor-/)).not.toBeVisible();
});
```

## Adding New Factories

When adding support for new entities:

1. **Create the factory** in `tests/api/factories/`:
```typescript
// tests/api/factories/box-factory.ts
export class BoxTestFactory {
  async create(overrides?: Partial<BoxCreateSchema>) {
    return apiRequest(() =>
      this.client.POST('/api/boxes', {
        body: { ...defaults, ...overrides }
      })
    );
  }

  randomBoxNumber(): string {
    return `BOX-${Math.floor(Math.random() * 1000)}`;
  }
}
```

2. **Add to the test bundle** in `tests/api/index.ts`:
```typescript
export function createTestDataBundle(client?) {
  const boxFactory = new BoxTestFactory(apiClient);

  return {
    // ... existing factories
    boxes: {
      create: boxFactory.create.bind(boxFactory),
      randomBoxNumber: boxFactory.randomBoxNumber.bind(boxFactory),
    },
  };
}
```

3. **Use in tests**:
```typescript
test('box management', async ({ testData }) => {
  const box = await testData.boxes.create({
    number: testData.boxes.randomBoxNumber()
  });
});
```

## Best Practices

### Do's ✅
- Create all test data via API factories before navigating to UI
- Use randomized names to avoid conflicts in dirty database
- Group related API calls with `Promise.all()` for performance
- Let factories handle default values and relationships
- Use factory random helpers for consistent naming patterns

### Don'ts ❌
- Never click through UI flows to set up test prerequisites
- Don't hardcode entity names (use random helpers)
- Don't clean up data after tests (dirty DB policy)
- Don't add test-specific utilities to shared helpers
- Don't make factories dependent on page objects

## Environment Variables

- `BACKEND_URL`: API server URL (default: `http://localhost:5100`)
- `FRONTEND_URL`: Frontend URL (default: `http://localhost:3100`)
- `CI`: Set to true in CI environments

## Running Tests

```bash
# Run all tests
pnpm playwright test

# Run specific test file
pnpm playwright test tests/e2e/types/create-type.spec.ts

# Debug mode
pnpm playwright test --debug

# With custom backend URL
BACKEND_URL=http://localhost:5200 pnpm playwright test
```

## Troubleshooting

### "API request failed" errors
- Ensure backend is running on port 5100
- Check `BACKEND_URL` environment variable
- Verify API endpoints match OpenAPI spec

### Type errors in factories
- Run `pnpm generate:api` to update generated types
- Ensure you're using the correct schema types from `components['schemas']`

### Random name collisions
- Helpers use timestamp + random suffix for uniqueness
- If seeing collisions, check if database was cleared unexpectedly

## Examples

See `tests/examples/api-factories.example.spec.ts` for comprehensive examples of:
- Creating types and parts via API
- Using random helpers for unique names
- Setting up complex test scenarios with dependencies
- Testing UI flows with API-created prerequisites