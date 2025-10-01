# Playwright Developer Guide

The Playwright suite drives the production frontend against the real backend in testing mode. This guide explains how the suite is structured, how to seed data safely, and how to extend coverage without breaking stability.

## Before You Start

1. Complete the [Getting Started](../getting_started.md) setup and ensure `pnpm playwright` passes locally.
2. Understand the [Environment Reference](../environment.md) to configure URLs and test mode.
3. Review the [Test Instrumentation](../architecture/test_instrumentation.md) taxonomy—tests frequently assert on emitted test-event payloads.

## Core Principles

1. **API-first data setup** – Always create prerequisite data with factories; UI interactions are only for the scenario under test.
2. **Real backend always** – Specs must hit the live backend endpoints. Do not intercept, stub, or shortcut HTTP calls. Missing behavior belongs in the backend, not in Playwright helpers.
3. **Dirty database policy** – Tests never reset or clean up. Use randomized identifiers so reruns tolerate existing data, never rely on data seeded by another test, and ignore any concerns about residual records—databases are rebuilt between runs. If volume ever reveals performance issues, treat that as a backend optimization problem.
4. **Feature-owned page objects** – Each feature folder exposes actions/locators tailored to that UI.
5. **Deterministic waits** – Assertions rely on UI visibility, network promises, or test-event signals—never fixed sleeps.
6. **Console is the contract** – Unexpected `console.error` fails the test unless explicitly marked as expected via helpers.

## Suite Architecture

### API Client (`tests/api/client.ts`)

A Node-compatible OpenAPI client backed by `openapi-fetch`. It reads `BACKEND_URL` (default `http://localhost:5100`) and exposes `apiRequest` helpers that throw on non-2xx responses.

```typescript
import { createApiClient, apiRequest } from '../api/client';

const client = createApiClient();
const { data } = await apiRequest(() => client.GET('/api/types'));
```

### Factories (`tests/api/factories/*`)

Factories wrap the API client with domain-specific helpers and randomized data generators. They power the `testData` fixture.

```typescript
const factory = testData.types;
const type = await factory.create();               // defaults with random name
const other = await factory.create({ name: factory.randomTypeName('Capacitor') });
```

See [Factories & Fixtures](./factories_and_fixtures.md) for a catalog of available methods.

### Fixtures (`tests/support/fixtures.ts`)

Custom fixtures extend Playwright's base test:

- `frontendUrl` / `backendUrl` – Read from environment variables (`FRONTEND_URL`, `BACKEND_URL`).
- `testData` – Bundled factories for `types`, `parts`, etc.
- `types` – Page object for the Types feature (`tests/e2e/types/TypesPage.ts`).
- `page` override – Registers the Playwright test-event bridge, enforces console error policy (unexpected errors fail the test), and disables animations for determinism.
- `testEvents` – Provides access to the circular buffer of test-event payloads (`TestEventCapture`) for sequence assertions and debugging dumps.
- `sseTimeout` – Shared SSE-aware timeout (35s) for long polling scenarios.

Import fixtures via:

```typescript
import { test, expect } from '../support/fixtures';
```

### Helpers (`tests/support/helpers.ts`)

Utility functions that complement fixtures:

- `generateRandomId(prefix)` – Standard prefix-shortId generator.
- `waitTestEvent(page, kind, filter?, timeout?)` – Await specific test-event payloads from the Playwright-managed buffer.
- `waitForFormValidationError(page, formId, field?)`
- `expectConflictError(page, correlationId?)`
- `expectConsoleError(page, pattern)` – Allow known console errors for a test.

## Authoring Patterns

### Create Data First

```typescript
test('edits an existing type', async ({ testData, types }) => {
  const existing = await testData.types.create();

  await types.goto();
  await types.cardByName(existing.name).click();
  await types.rename(existing.name, testData.types.randomTypeName());
});
```

- Never drive prerequisite flows through the UI (no create-via-form followed by edit assertions).
- Use factory overrides to craft edge cases (duplicate names, dependency chains, etc.).
- Seed data uniquely for each spec. If multiple tests need similar state, each must create its own records.

### Randomize Identifiers

All factories support random helpers; use them to avoid collisions on dirty databases.

```typescript
const name = testData.types.randomTypeName('Resistor');
await testData.types.create({ name });
```

### Console Error Policy

Fixtures treat any `console.error` as a failure. If a test intentionally triggers an error (e.g., blocked delete), mark it as expected.

```typescript
await expectConsoleError(page, /cannot delete type/i);
await types.attemptDelete(blockedType.name);
```

### Test-Event Assertions

Prefer UI assertions first, but when behavior is exposed via instrumentation (forms, toasts, SSE), use helpers for precision.

```typescript
await waitTestEvent(page, 'form', evt =>
  evt.formId === 'TypeForm_edit' && evt.phase === 'success'
);
```

For multi-step flows, capture sequences explicitly:

```typescript
const [submit, success] = await Promise.all([
  waitTestEvent(page, 'form', evt => evt.phase === 'submit' && evt.formId === formId),
  waitTestEvent(page, 'form', evt => evt.phase === 'success' && evt.formId === formId),
  page.getByRole('button', { name: /save/i }).click(),
]);

expect(success.timestamp > submit.timestamp).toBeTruthy();
```

Avoid over-asserting—validate the critical transitions (submit → success, toast levels, API status) required by the scenario and lean on UI checks for the rest.

The event schema is documented in [Test Instrumentation](../architecture/test_instrumentation.md).

### No Fixed Waits

Follow the [No-Sleep Patterns](./no_sleep_patterns.md) reference. Use `Promise.all` with `waitForResponse` or scoped `expect` checks instead of `waitForTimeout`.

### Backend Extensions for Complex Flows

- When a scenario needs deterministic backend behavior (for example, AI analysis over SSE), add test-specific hooks to the service. The pattern is: seed a prebaked response through an API exposed for tests, then drive the UI using a sentinel input such as `test-response-12345` that instructs the backend to emit the prepared payload. Do not emulate the SSE stream in Playwright.
- If the backend cannot yet support the scenario, pause the Playwright work and extend the backend first. Route interception is not an acceptable fallback.

## Suite Conventions

- **Specs**: Name files `*.spec.ts` and colocate with feature folders under `tests/e2e/<feature>/`.
- **Page Objects**: Export a class with a `goto()` method plus actions/locators; keep assertions inside tests unless they are part of the action contract.
- **Test IDs**: Add `data-testid` attributes when semantic roles are insufficient. When adding new IDs, follow the `feature.section.element` naming scheme (e.g., `types.form.submit`).
- **Instrumentation Hooks**: Emit `trackFormSubmit`, `trackFormSuccess`, etc., in frontend code when adding new forms. Always guard them with `isTestMode()`.

## Expanding Coverage

1. Update or add factories if new backend endpoints are required.
2. Introduce or extend a page object in `tests/e2e/<feature>/`.
3. Write scenarios that create preconditions through factories, exercise the UI flow, and assert via UI + test-event signals.
4. Run `pnpm playwright tests/e2e/<feature>/<file>.spec.ts` locally before committing.

For a checklist-style walkthrough, see [How to Add an E2E Test](../howto/add_e2e_test.md).

## Additional References

- [Selector Patterns](./selector_patterns.md)
- [Factories & Fixtures](./factories_and_fixtures.md)
- [CI & Execution](./ci_and_execution.md)
- [Troubleshooting](./troubleshooting.md)
