# Playwright API Test Data Setup - Technical Plan

## Brief Description

Implement API-based test data setup for Playwright tests to support the principle that tests should only interact with the UI for the functionality being tested. All test data preparation and cleanup will be done via direct API calls, allowing tests to focus on UI interactions while maintaining clean, isolated test environments.

## Files to Create or Modify

### Test Infrastructure Files

#### 1. Create: `tests/api/client.ts`
- API client wrapper for test data operations
- Uses the generated OpenAPI client from `src/lib/api/generated/client.ts`
- Provides type-safe methods for creating, updating, and deleting test data
- Handles authentication and error reporting in test context

#### 2. Create: `tests/api/factories/type-factory.ts`
- Factory functions for creating Type entities via API
- Methods:
  - `createType(name?: string)`: Creates a type with optional custom name or generates random one
  - `deleteType(typeId: string)`: Deletes a type by ID
  - `createTypeWithParts(name?: string, partsCount?: number)`: Creates type with associated parts

#### 3. Create: `tests/api/factories/part-factory.ts`
- Factory functions for creating Part entities via API
- Methods:
  - `createPart(data?: Partial<PartCreateSchema>)`: Creates a part with optional overrides
  - `deletePart(partKey: string)`: Deletes a part
  - `createPartWithLocations(partData?, locations?)`: Creates part with location assignments

#### 4. Create: `tests/api/factories/box-factory.ts`
- Factory functions for creating Box entities via API
- Methods:
  - `createBox(capacity?: number)`: Creates a box with specified capacity
  - `deleteBox(boxNo: number)`: Deletes a box
  - `createBoxWithParts(capacity?, parts?)`: Creates box with parts in locations

#### 5. Create: `tests/api/factories/index.ts`
- Central export for all factory functions
- Re-exports all factories for convenient import

#### 6. Create: `tests/api/helpers.ts`
- Utility functions for common test data operations
- Methods:
  - `generateTestId(prefix: string)`: Generates unique test IDs
  - `cleanupTestData(prefix: string)`: Removes all test data with given prefix
  - `waitForApiReady()`: Ensures API is ready to accept requests

#### 7. Modify: `tests/support/fixtures.ts`
- Add `apiClient` fixture that provides configured API client instance
- Add `testDataFactory` fixture that provides all factory functions
- Add automatic cleanup in teardown hooks

#### 8. Create: `tests/api/index.ts`
- Main entry point for API test utilities
- Exports client, factories, and helpers

## Algorithm and Implementation Details

### API Client Configuration

1. **Base Client Setup**
   - Import createClient from openapi-fetch
   - Use same type definitions as frontend (`src/lib/api/generated/types.ts`)
   - Configure base URL from BACKEND_URL environment variable
   - Add request/response interceptors for logging in debug mode

2. **Error Handling**
   - Wrap API calls in try-catch blocks
   - Convert API errors to test-friendly error messages
   - Include request details in error messages for debugging

### Factory Pattern Implementation

1. **Generic Factory Structure**
   ```typescript
   export class TypeFactory {
     constructor(private client: ApiClient) {}

     async create(overrides?: Partial<TypeCreateSchema>): Promise<Type> {
       const data = {
         name: generateTestId('type'),
         ...overrides
       };
       const response = await this.client.POST('/api/types', { body: data });
       if (!response.data) throw new Error(`Failed to create type: ${response.error}`);
       return response.data;
     }
   }
   ```

2. **Test Data Tracking**
   - Maintain a registry of created entities for cleanup
   - Use WeakMap to track entities per test context
   - Automatic cleanup in afterEach hooks

### Integration with Page Objects

1. **Page Object Enhancement**
   - Page objects remain UI-focused
   - Add `setupTestData()` methods that use factories
   - Example:
     ```typescript
     class TypesPage {
       async setupTypeForEdit(): Promise<Type> {
         return await this.testDataFactory.types.create();
       }
     }
     ```

### Test Usage Pattern

1. **Setup Phase**
   - Use factories to create required entities
   - Store references for assertions and cleanup

2. **Test Execution**
   - Interact only with UI elements
   - Use created data IDs/names for navigation

3. **Cleanup Phase**
   - Automatic via fixtures
   - Manual cleanup methods available if needed

## Phases

### Phase 1: Core API Infrastructure (Current - Pre-4b)

1. **Create API client wrapper** (`tests/api/client.ts`)
   - Configure openapi-fetch client
   - Add error handling and logging
   - Export typed client instance

2. **Create basic factories**
   - Type factory with create/delete methods
   - Part factory with basic CRUD operations
   - Box factory for location management

3. **Update fixtures** (`tests/support/fixtures.ts`)
   - Add apiClient fixture
   - Add testDataFactory fixture
   - Implement auto-cleanup

### Phase 2: Enhanced Factory Features

1. **Complex data creation methods**
   - Types with multiple parts
   - Parts with locations and quantities
   - Boxes with pre-filled locations

2. **Relationship management**
   - Link parts to types
   - Assign parts to box locations
   - Handle quantity updates

3. **Bulk operations**
   - Create multiple entities at once
   - Batch delete operations
   - Reset database state

### Phase 3: Update Phase 4 Plan

1. **Update `docs/features/playwright_test_types_phase4/plan.md`**
   - Add API setup instructions
   - Update test examples to use factories
   - Document new test patterns

2. **Create usage documentation**
   - Examples of factory usage
   - Best practices for test data
   - Debugging API calls in tests

## Dependencies

- Generated API types from `src/lib/api/generated/types.ts`
- openapi-fetch package (already installed)
- Backend API endpoints must be accessible from test environment
- BACKEND_URL environment variable must be configured

## Final Step: Update Phase 4 Plan

After implementation, update `docs/features/playwright_test_types_phase4/plan.md` to include:

1. **New test data setup pattern**
   - Replace UI-based data creation with API factories
   - Show example of creating a type for edit test:
     ```typescript
     test('edits an existing type', async ({ types, testDataFactory }) => {
       // Setup: Create type via API
       const existingType = await testDataFactory.types.create({
         name: createRandomTypeName()
       });

       // Test: Only UI interactions
       await types.goto();
       await types.editType(existingType.name, newName);

       // Assert: Verify UI changes
       await expect(types.cardByName(newName)).toBeVisible();
     });
     ```

2. **Factory usage in test files**
   - Import patterns
   - Common factory methods
   - Cleanup strategies

3. **Directory structure update**
   ```
   tests/
   ├── api/                    # NEW: API test utilities
   │   ├── client.ts          # API client wrapper
   │   ├── factories/         # Entity factories
   │   │   ├── type-factory.ts
   │   │   ├── part-factory.ts
   │   │   ├── box-factory.ts
   │   │   └── index.ts
   │   ├── helpers.ts         # Utility functions
   │   └── index.ts           # Main exports
   ├── e2e/                   # End-to-end tests
   │   └── types/
   │       ├── TypesPage.ts
   │       └── create-type.spec.ts
   └── support/               # Test support files
       ├── fixtures.ts        # Enhanced with API fixtures
       └── helpers.ts
   ```

4. **Best practices section**
   - Only test UI through UI
   - Use API for all test data setup
   - Keep test data isolated with unique prefixes
   - Clean up after each test