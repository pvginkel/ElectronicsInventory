# Part Selector String IDs

Brief description: SearchableSelect is hard coded to only accept number IDs. Parts have string IDs. We're planning a new story that creates a part selector, which is blocked by this limitation. This plan outlines the UI refactor and supporting Playwright coverage to unblock the part selector.

**Blocking Issues**
- Update `SearchableSelect` instrumentation and value handling so list-loading events remain accurate when IDs are strings; no backend or factory gaps identified.

## Relevant Files
- `src/components/ui/searchable-select.tsx`
- `src/components/types/type-selector.tsx`
- `src/components/sellers/seller-selector.tsx`
- `src/components/parts/part-selector.tsx` (new)
- `src/hooks/use-parts-selector.ts` (new helper for filtering + instrumentation)
- `src/hooks/use-types.ts` (reuse `useGetTypesWithStats` to resolve type names during filtering)
- `src/routes/parts/selector-harness.tsx` + route registration (new test-only surface gated by `isTestMode()`)
- `src/lib/test/query-instrumentation.ts` (reuse existing helpers; confirm no API changes)
- `tests/support/page-objects/part-selector-harness.ts` (new)
- `tests/support/selectors.ts`
- `tests/e2e/parts/part-selector.spec.ts`

## Implementation Steps

### Phase 1 – Generalize SearchableSelect ID handling
1. Update `SearchableSelectOption` to accept an `IdType extends string | number` and propagate this generic through `SearchableSelectProps`, `value`, and `onChange`. Ensure `value` checks use `value !== undefined && value !== null` so `'0'` or `0` remain valid selections.
2. Normalize internal comparisons and DOM attributes:
   - Use strict equality on `option.id` typed as `IdType`.
   - Send `String(option.id)` into `data-value` attributes when needed.
   - Keep the search term logic aligned with the selected option’s display name when IDs are non-numeric.
3. Verify focus/keyboard behavior still matches `docs/contribute/ui/forms.md` guidance—retain combobox roles and avoid adding new props.
4. Adjust existing consumers (`TypeSelector`, `SellerSelector`) to rely on the widened types. Update their props so TypeScript infers numeric IDs without casts.
5. Add regression guidepost comments only where logic changes (e.g., explaining the `value !== undefined` guard) per “Readability Comments” guidance.

### Phase 2 – Part selector component
1. Implement `PartSelector` in `src/components/parts/part-selector.tsx` mirroring `SellerSelector` structure and the Part Management pattern (`docs/contribute/ui/patterns/part_management.md`). Key behaviors:
   - Fetch parts via a dedicated hook (`usePartsSelector`) that wraps `useGetParts` and memoizes filtered options using `formatPartForDisplay`.
   - Expose options shaped as `{ id: part.key, name: formatted display }` so the SearchableSelect receives string IDs.
   - Emit `useListLoadingInstrumentation({ scope: 'parts.selector', ... })` and respect the instrumentation taxonomy (`docs/contribute/testing/playwright_developer_guide.md`). Ensure metadata reports counts for deterministic waits.
   - Provide `data-testid` hooks (`parts.selector`, `parts.selector.input`, `parts.selector.selected`) aligned with `tests/support/selectors.ts` conventions.
   - Surface selected part summary (e.g., ID + description) beneath the control for visibility while testing.
   - Reuse `SearchableSelect` inline-create plumbing but keep `enableInlineCreate` disabled until the story demands it; document future extension point.
2. Introduce `usePartsSelector` under `src/hooks/use-parts-selector.ts` handling:
   - Search-term state updates.
   - Local filtering against `displayId`, description, manufacturer code, and a resolved type name. Pull `useGetTypesWithStats` (or the existing selector-friendly hook) to map `part.type_id` to a human-readable `type.name` before filtering so the behavior remains deterministic.
   - Memoized mapping to `PartSelectorOption` with string IDs.
   - Exported helpers to derive `selectedPart` for summary rendering.

### Phase 3 – Test surface and routing
1. Add a test-only harness route (`src/routes/parts/selector-harness.tsx`) registered under `/parts/selector-harness` when `isTestMode()` is true. The page should render inside the standard layout, mount `PartSelector`, capture the currently selected ID in state, and expose a submit button wired with `generateFormId` + `useFormInstrumentation` (emitting `trackFormOpen`/`trackFormSubmit`/`trackFormSuccess`) per `docs/contribute/ui/forms.md`.
2. Register the route in the TanStack router tree (update the relevant route module and regenerate if needed) without exposing it in the sidebar to keep production UI untouched.
3. Instrument the harness with `useListLoadingInstrumentation` (already on the selector) and ensure the form instrumentation emits events so Playwright can await them.

### Phase 4 – Playwright ecosystem updates
1. Extend `tests/support/selectors.ts` with a `parts.selector` block mirroring the sellers entry, plus form IDs for the harness submit button.
2. Create `tests/support/page-objects/part-selector-harness.ts` exposing helpers to:
   - Wait for `waitForListLoading(page, 'parts.selector', 'ready')`.
   - Fill the search field, choose an option by part ID/description, and submit the harness form while awaiting instrumentation events.
3. Author `tests/e2e/parts/part-selector.spec.ts` covering:
   - Selection of an existing part seeded via `testData.parts.create` (no cleanup per `docs/contribute/testing/index.md`).
   - Confirmation that the string `part.key` flows through selection, persists after submission, and renders in the summary section.
   - Verification that instrumentation events (`ListLoading`, `FormSubmitSuccess`) fire without using `page.route` or stubs.
4. Update any shared fixtures/page objects if they need to navigate to the harness (e.g., add a helper on `PartsPage` to `gotoSelectorHarness()` behind test mode checks).

## Algorithm / Flow Details
- **Option resolution:** `usePartsSelector` loads the full list once, then filters client-side using `searchTerm`; results map to `{ id: part.key, name: formattedLabel, metadata }`. Selection uses strict equality on `id: string`.
- **Search synchronization:** On `onChange`, update the parent `value` to `part.key`, mirror the display name in `searchTerm`, and keep the popover open/closed behavior consistent with existing selectors.
- **Instrumentation:** `useListLoadingInstrumentation` receives `isLoading`, `isFetching`, and error from `useGetParts`. Metadata includes `{ status, counts: { parts } }` so `waitForListLoading` can assert readiness. Form instrumentation wraps the harness submit handler to emit deterministic `form` events before updating UI state.
- **Harness form submission:** Clicking submit loads selected part details from the memoized map and displays them. Even without backend writes, the submission still emits instrumentation to satisfy testing requirements.

## Playwright Coverage
1. `parts.selector accepts string IDs`: seed a part via `testData.parts.create`, navigate to `/parts/selector-harness`, wait for `waitForListLoading(page, 'parts.selector', 'ready')`, search by the seeded `part.key`, select the option, submit the harness form, and assert:
   - The input reflects the part label.
   - The summary renders the exact string key returned from the API.
   - `waitTestEvent(page, 'form', ...)` observes `FormSubmitSuccess` with the harness `formId`.
   - No data cleanup—subsequent runs rely on random prefixes as documented in `docs/contribute/testing/index.md`.
2. `parts.selector search narrows by description`: seed two parts with unique descriptions, type the second description, validate only that option appears via ARIA listbox querying, select it, and assert the summary updates accordingly.

Tests remain backend-driven using factories, avoid `page.route`, and rely solely on instrumentation + UI assertions as required in `docs/contribute/testing/playwright_developer_guide.md`.
