# Playwright API Test Data Setup - Technical Plan

## Purpose

Give Playwright tests a Node-friendly, API-first path to create prerequisite data so that UI flows never click through unrelated setup steps. Any entity not created as part of the scenario under test must come from an API factory. Tests keep the dirty-DB policy from the epic: they randomise names and never clean up.

## Outcomes

- A lightweight Node runtime API client that reuses our generated OpenAPI DTOs without depending on Vite-only globals.
- Minimal factories for Types and Parts that cover the scenarios Phase 4 needs.
- Fixtures that expose the factories to tests (`testData.types.create`, `testData.parts.create`), leaving page objects focused purely on UI.
- Updated helper utilities and documentation so subsequent phases default to API-based setup.

## Files to Create or Modify

### 1. Create `tests/api/client.ts`
- Instantiate `openapi-fetch` with `globalThis.fetch` (Node LTS) and `process.env.BACKEND_URL ?? 'http://localhost:5100'` (matching the test environment's API port).
- Import only the generated `paths` type from `src/lib/api/generated/types.ts` to ensure shared DTO definitions (this type contains all the API path definitions and their request/response schemas).
- Provide a tiny factory (`createApiClient()`) that returns the typed client. No auth configuration needed.
- Include a simple request wrapper that throws on non-2xx responses to keep factory code concise (part of MVP scope).

### 2. Create `tests/api/factories/type-factory.ts`
- Export a `TypeTestFactory` class with:
  - `create(overrides?: Partial<TypeCreateSchema>)` for API-backed creation using the generated TypeCreateSchema type from the OpenAPI spec.
  - `randomTypeName(prefix?: string)` to generate unique type names (uses shared random-id helper internally).
- Return the created entity so tests can assert on IDs or names later.

### 3. Create `tests/api/factories/part-factory.ts`
- Export `PartTestFactory` with `create(options?: { overrides?: Partial<PartCreateSchema>; typeId?: string; })` using the generated PartCreateSchema type from the OpenAPI spec.
- When `typeId` is omitted, call `TypeTestFactory.create()` to ensure the part is associated with a fresh type.
- Return both the part and its type reference for convenience.

### 4. Create `tests/api/index.ts`
- Export `createApiClient`, `TypeTestFactory`, `PartTestFactory`, and a helper to build the `testData` bundle used in fixtures.

### 5. Modify `tests/support/helpers.ts`
- Ensure there is a generic `generateRandomId(prefix?: string)` helper (or equivalent) that factories can consume.
- Keep domain-specific helpers (like `randomTypeName`) inside their respective factories to avoid polluting the shared module.

### 6. Modify `tests/support/fixtures.ts`
- Inject `apiClient` (using `createApiClient()`).
- Expose a `testData` fixture with grouped factories (`testData.types`, `testData.parts`).
- Keep existing console policies/animation shims intact. No teardown logic—factories never delete data.

## Implementation Notes

### Client Design
- Node ≥18 provides `fetch`, so no polyfills are needed.
- Create a separate client specifically for the test suite, avoiding `src/lib/api/generated/client.ts` which depends on Vite-specific `import.meta.env` and test instrumentation that does not exist in the Playwright/Node runtime.
- The test environment runs the API on port 5100 and UI on port 3100 (already configured in existing Playwright setup).
- Include a request wrapper that throws on non-2xx responses to keep factory code concise (required for MVP).

### Factory Usage
- Factories should remain stateless; tests decide when to create related entities.
- Expose convenience helpers such as `testData.types.randomTypeName()` so tests can fetch stable prefixes without importing shared modules.
- Tests call `const existingType = await testData.types.create();` before hitting the Types UI to edit/delete.
- Page objects stay UI-only and never receive factory instances.

### Dirty DB Strategy
- Follow the epic guidance: generated names include unique suffixes, and no cleanup occurs after tests.
- Document that factories never attempt to remove data or reset state; cross-suite coordination relies on randomized identifiers.

## Phases

### Phase 1 – MVP for Phase 4
1. Build the Node-friendly API client and export function(s) to construct it.
2. Implement Types and Parts factories with `create` helpers only.
3. Extend `tests/support/helpers.ts` with shared randomisation helpers.
4. Update Playwright fixtures to expose `testData` and ensure tests consume factories directly.
5. Add docs/examples illustrating how Phase 4 tests (e.g., edit/delete flows) create prerequisites via the API before touching the UI.

### Phase 2 – Post-Phase 4 Enhancements (Optional Future Work)
- Add additional entity factories (Boxes, Locations, etc.) as new features require them.
- Layer in update/delete helpers if future tests need mutation coverage beyond creation.
- Consider extracting a shared API client module if the frontend eventually needs the Node version too.

## Documentation Updates

- Cross-reference this plan from `docs/features/playwright_test_types_phase4/plan.md`, clarifying that all pre-existing data (edit/delete scenarios, reverse dependency setup) comes from API factories.
- Note in the phase plan that create-type remains UI-driven, but all other entities should be seeded via API calls exposed through the fixtures.
- Reinforce the dirty-DB, no-cleanup policy to avoid conflicting guidance between plans and epics.

## Dependencies

- Generated OpenAPI DTOs in `src/lib/api/generated/types.ts` (specifically the `paths` type which contains all API path definitions and their request/response schemas).
- `openapi-fetch` package (already installed in the project).
- Backend endpoints must remain accessible in test mode and require no authentication.
- Existing Playwright setup with API on port 5100 and UI on port 3100.
