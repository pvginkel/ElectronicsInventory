# Playwright List Views Cleanup

## Brief Description
Refine the type and part list Playwright specs so they run exclusively against the real backend. We will drop mock-only scenarios, add front-end test-mode instrumentation that exposes deterministic loading signals without backend toggles (covering all dependent queries), and seed list/search data through existing factories while tolerating shared test data in the environment.

## Files / Modules In Scope
- `src/components/types/TypeList.tsx`
- `src/components/parts/part-list.tsx`
- `src/lib/test/event-emitter.ts`
- `src/lib/test/ui-state.ts` (new)
- `src/types/test-events.ts`
- `docs/contribute/architecture/test_instrumentation.md`
- `tests/support/helpers.ts`
- `tests/e2e/types/TypesPage.ts`
- `tests/support/page-objects/parts-page.ts`
- `tests/e2e/types/type-list.spec.ts`
- `tests/e2e/parts/part-list.spec.ts`

## Technical Plan
1. **Retire mock-only list state scenarios**
   - Delete the type list error-state and empty-state specs and the parts list forced-500 spec (`tests/e2e/types/type-list.spec.ts`, `tests/e2e/parts/part-list.spec.ts`).
   - Add a short note inside each spec (or an accompanying doc changelog entry) explaining that backend alignment work is pending and failure states are now covered manually; this captures the intentional coverage gap for future follow-up.
   - Confirm the remaining cases align with real workflows in the product brief (search, list summary, navigation, AI entry point).

2. **Add test-mode UI state instrumentation for list loading**
   - Extend `src/types/test-events.ts` with a `ui_state` kind that carries `{ scope: string; phase: 'loading' | 'ready'; metadata?: Record<string, unknown> }` and document it in `docs/contribute/architecture/test_instrumentation.md` under the event taxonomy.
   - Introduce `src/lib/test/ui-state.ts` exposing helpers `beginUiState(scope)` / `endUiState(scope, metadata?)` that internally guard on `isTestMode()` and rely on `emitTestEvent`.
   - In `TypeList` and `PartList`, import the helpers and wrap the query loading lifecycle:
     - Start instrumentation when the relevant queries report an initial `isLoading`/`isFetching` transition; set local `showLoading` state and call `beginUiState('types.list')` / `beginUiState('parts.list')`.
     - Track completion for each list dependency (for parts this includes `useGetPartsWithLocations` and the associated `useGetTypes` call) so `endUiState('parts.list', ...)` only fires once every dependency is settled (success or error). Record per-query status to remain resilient if the type lookup fails—emit `ready` with metadata indicating any degraded fields.
     - Avoid fixed delays: if test-only skeleton visibility smoothing is required, base it on tracked timers that reset/cancel whenever a new loading cycle begins so a stale timeout cannot fire after new data arrives.
     - Ensure every instrumentation branch (including timer registration, cleanup, and dependency tracking) is guarded by `isTestMode()` so production renders remain unaffected.
     - Emit the same `endUiState` when React Query surfaces an error so tests can await readiness even on failure.

3. **Expose Playwright helpers for the new instrumentation**
   - Update `tests/support/helpers.ts` with `waitForUiState(page, scope, phase)` that reuses `waitTestEvent` with the `ui_state` kind, plus convenience wrappers in the list page objects (e.g. `types.waitForUiState('ready')` that prefixes the scope internally).
   - Adjust `tests/e2e/types/TypesPage.ts` and `tests/support/page-objects/parts-page.ts` to call the helper before waiting on rendered cards, replacing any direct reliance on `page.route`.

4. **Seed list data exclusively through factories**
   - In `tests/e2e/types/type-list.spec.ts`, replace mocked payloads with `testData.types.create` and additional parts as needed to validate summaries and badge counts. Persist the `[search]` query string assertions using the real navigation flow and relax summary expectations so they tolerate pre-existing records (e.g. capture the baseline count up front and assert relative deltas or match `/\d+ types/`).
   - In `tests/e2e/parts/part-list.spec.ts`, seed multiple parts and related entities (types, sellers, inventory locations) with factories. Ensure search and metadata expectations target the seeded records and remove any hard-coded payload arrays.
   - Update list specs to call the new UI-state helpers when asserting skeleton visibility (`await types.waitForUiState('loading')`, expect skeletons, then `await types.waitForUiState('ready')` — mirror the same pattern with `parts.waitForUiState(...)` before verifying loaded content).

5. **Validation and follow-up**
   - Verify no `page.route` usages remain in the touched specs or page objects (`rg 'page.route' tests/e2e/types/type-list.spec.ts tests/e2e/parts/part-list.spec.ts tests/support/page-objects`).
   - Run `pnpm playwright test tests/e2e/types/type-list.spec.ts tests/e2e/parts/part-list.spec.ts --workers=1` and then `pnpm playwright test`.
   - Update any additional documentation or developer notes if new helpers require usage guidance (e.g. link the UI-state helper from the Playwright developer guide).
