# Playwright API Test Data Setup

## Overview

This feature provides API-based test data creation for Playwright tests, enabling tests to create prerequisite data without clicking through UI setup steps. It implements the plan detailed in [plan.md](./plan.md).

## Key Components

### API Client (`tests/api/client.ts`)
- Node-friendly API client using `openapi-fetch` with `globalThis.fetch` (Node 18+)
- Connects to backend on port 5100 (test environment)
- Request wrapper that throws on non-2xx responses for concise factory code
- Shares DTOs from `src/lib/api/generated/types.ts` for type safety

### Factories

#### Type Factory (`tests/api/factories/type-factory.ts`)
- `create(overrides?)` - Creates types via API with optional field overrides
- `randomTypeName(prefix?)` - Generates unique type names with prefixes

#### Part Factory (`tests/api/factories/part-factory.ts`)
- `create(options?)` - Creates parts with automatic type creation if needed
- `randomPartDescription(prefix?)` - Generates unique part descriptions
- `randomManufacturerCode()` - Generates realistic manufacturer codes

### Test Fixtures (`tests/support/fixtures.ts`)
- `apiClient` - Provides typed API client instance
- `testData` - Exposes grouped factories:
  - `testData.types.create()`
  - `testData.types.randomTypeName()`
  - `testData.parts.create()`
  - `testData.parts.randomPartDescription()`
  - `testData.parts.randomManufacturerCode()`

## Usage in Tests

### Basic Usage
```typescript
test('should edit an existing type', async ({ page, testData }) => {
  // Create prerequisite data via API
  const existingType = await testData.types.create();

  // Navigate to UI and test the edit flow
  await page.goto('/types');
  await page.getByText(existingType.name).click();
  // ... continue with edit operations
});
```

### Creating Related Data
```typescript
test('should create part with type', async ({ testData }) => {
  // Type is created automatically if not provided
  const { part, type } = await testData.parts.create();

  // Or provide your own type
  const customType = await testData.types.create({ name: 'Resistor' });
  const { part: customPart } = await testData.parts.create({
    typeId: customType.id,
    overrides: {
      description: '10K Ohm resistor',
    }
  });
});
```

## Phase 4 Integration

This API test data setup is specifically designed to support Phase 4 of the Types feature testing (see `docs/features/playwright_test_types_phase4/plan.md`). Key integration points:

1. **Edit/Delete Scenarios**: All entities being edited or deleted are created via API factories, not through UI flows
2. **Reverse Dependencies**: Parts that depend on Types are created via `testData.parts.create()` with proper associations
3. **No Cleanup**: Following the dirty-DB policy, factories never delete data. Unique suffixes prevent conflicts
4. **UI-Only for Create**: The create-type flow remains UI-driven for testing, while all prerequisites use API

## Dirty Database Strategy

- All generated names include unique suffixes via `generateRandomId()`
- No cleanup/teardown logic - data persists after tests
- Tests remain isolated through randomized identifiers
- Cross-suite coordination relies on unique naming, not clean state

## Example Test

See `tests/examples/api-factories.example.spec.ts` for comprehensive usage examples demonstrating:
- Creating types for edit flows
- Creating parts with associations
- Bulk data creation for delete testing
- Using random helpers for consistent naming

## Future Enhancements (Post-Phase 4)

- Additional factories for Boxes, Locations, and other entities
- Update/delete helpers if mutation coverage is needed beyond creation
- Potential extraction of shared API client module for frontend use