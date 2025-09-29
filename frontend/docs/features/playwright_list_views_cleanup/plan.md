# Playwright List Views Cleanup

## Brief Description
Refactor type and part list Playwright specs so they rely purely on real backend behaviour: remove mocked 500 failures and empty-state cases, add deterministic loading instrumentation, and seed search data through factories.

## Files / Modules In Scope
- `tests/e2e/types/type-list.spec.ts`
- `tests/e2e/parts/part-list.spec.ts`
- `tests/support/page-objects/types-page.ts` (if additional helpers are required)
- `tests/support/page-objects/parts-page.ts` (if additional helpers are required)
- Any new helper or fixture changes under `tests/support/`

## Technical Steps
1. **Drop unreachable scenarios**
   - Remove the type-list error-state test that intercepts `/api/types` and the empty-state test that relies on an empty catalogue.
   - Remove the part-list error-state test that forces `/api/parts/with-locations` to fail.

2. **Introduce deterministic loading signals**
   - Either add a backend-controlled delay trigger (preferred) or emit a frontend test event (e.g. `types.list.load` / `parts.list.load`) so skeleton assertions can wait on observable state without `page.route`.
   - Update the loading tests to wait on the new signal and confirm skeleton visibility using the real response.

3. **Seed search data via factories**
   - Use `testData.types.create` and `testData.parts.create` to generate the records currently hard-coded in mocked payloads.
   - Adjust assertions to target the seeded data (descriptions, counts, query params).

4. **Fixture / helper updates**
   - If new test events are introduced, expose helpers in `tests/support/helpers.ts` to await them cleanly.
   - Extend page objects only if additional locators or assertions are required for the new instrumentation.

5. **Validation**
   - Confirm no `page.route` usages remain in the affected specs.
   - Run `npx playwright test tests/e2e/types/type-list.spec.ts tests/e2e/parts/part-list.spec.ts --project=chromium --workers=1` and then the full suite.
