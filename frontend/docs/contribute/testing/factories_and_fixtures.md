# Factories & Fixtures

Factories and fixtures power the API-first testing strategy. They create deterministic data, expose shared helpers, and keep specs concise.

## API Client & Data Bundle

`tests/api/index.ts` exports both the raw API client and a factory bundle.

```typescript
import { createApiClient, createTestDataBundle } from '../api';

const apiClient = createApiClient();
const testData = createTestDataBundle(apiClient);
```

### Factories

- **`TypeTestFactory` (`tests/api/factories/type-factory.ts`)**
  - `create(overrides?)` – POST `/api/types`
  - `randomTypeName(prefix?)` – deterministic prefix-shortId generator
- **`PartTestFactory` (`tests/api/factories/part-factory.ts`)**
  - `create({ typeId?, overrides? })` – creates dependent Type automatically when omitted
  - Random helpers for descriptions, manufacturer codes, etc.
- Pending factories live under `tests/api/factories/`; extend the bundle when new domains gain coverage.

All factories follow the same shape: accept overrides, return structured DTOs, and expose random helpers for collision-free runs.

## Test Fixtures (`tests/support/fixtures.ts`)

Custom fixtures extend Playwright’s base test:

| Fixture | Type | Description |
| --- | --- | --- |
| `frontendUrl` | `string` | Derived from `FRONTEND_URL` (defaults to `http://localhost:3100`). |
| `backendUrl` | `string` | Derived from `BACKEND_URL` (defaults to `http://localhost:5100`). |
| `sseTimeout` | `number` | 35s timeout for SSE heavy flows. |
| `apiClient` | Return of `createApiClient()` | Raw OpenAPI client for advanced usage. |
| `testData` | Return of `createTestDataBundle()` | Aggregated factories. |
| `types` | `TypesPage` instance | Feature page object for the Types flow. |
| `page` override | `Page` | Enforces console error policy and disables animations. |

Extend `TestFixtures` when adding new domains (e.g., `parts: PartsPage`). Keep fixture code minimal and reusable; complexity belongs in page objects or factories.

## Global Setup (`tests/support/global-setup.ts`)

- Loads `.env.test` via `dotenv`.
- Ensures `FRONTEND_URL` and `BACKEND_URL` defaults are set for tests.
- Can be extended to prime databases or seed feature flags.

## Helpers (`tests/support/helpers.ts`)

Provides convenience utilities used across specs:

- `generateRandomId(prefix)`
- `waitTestEvent(page, kind, filter?, timeout?)`
- `waitForFormValidationError(page, formId, field?)`
- `expectConflictError(page, correlationId?)`
- `expectConsoleError(page, pattern)`
- `emitTestEvt(page, kind, payload)` for ad-hoc instrumentation

Avoid duplicating helper logic in specs—centralize shared behaviors here.

## Random Data Strategy

- Use factory helpers (e.g., `testData.types.randomTypeName('Resistor')`).
- Prefix identifiers with domain-specific tokens to aid debugging.
- Keep randomization deterministic length-wise to avoid UI layout drift.

## Extending the Bundle

When a new feature needs coverage:

1. Add API helper functions under `tests/api/` if the backend endpoint is missing convenience wrappers.
2. Create a new factory in `tests/api/factories/` that mirrors the domain API.
3. Export it from `tests/api/index.ts` and include it in `createTestDataBundle`.
4. Update `tests/support/fixtures.ts` to expose the new factory via `testData` (already automatic).
5. If the feature warrants a page object, add a fixture (e.g., `parts: PartsPage`).

Document significant additions in this file to keep contributors aligned.

## References

- [Playwright Developer Guide](./playwright_developer_guide.md)
- [Page Objects](./page_objects.md)
- [How to Add an E2E Test](../howto/add_e2e_test.md)
