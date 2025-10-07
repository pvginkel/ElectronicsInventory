# Shopping List Foundations — Phase 1 Frontend Plan

Build the Phase 1 — Shopping List foundations (Concept lists) UI now that the backend work, OpenAPI JSON, and generated classes are already updated. This scope includes the “Lists Overview (initial): create new list; open list; delete list (confirm)” screen and the Concept view grid with columns Part | Seller | Needed | Ordered (ro) | Received (ro) | Note | Actions plus the Mark “Ready” footer.

## Relevant Files & Functions
- `src/routes/shopping-lists/index.tsx` — new TanStack Router file route for the Lists Overview (initial) screen.
- `src/routes/shopping-lists/$listId/index.tsx` — new route for the Concept view of a specific list.
- `src/components/layout/sidebar.tsx` — extend `navigationItems` with a Shopping Lists entry wired to `/shopping-lists`.
- `src/components/dashboard/quick-actions.tsx` — update the “Shopping List” quick action to navigate via the router instead of `console.log`.
- `src/components/shopping-lists/list-overview.tsx` — new overview component following `docs/contribute/ui/data_display.md`, with instrumentation and loading/empty/error states.
- `src/components/shopping-lists/list-card.tsx` — new card surface for individual lists with open/delete controls and status badges.
- `src/components/shopping-lists/list-form.tsx` — new modal form for create/rename/describe flows, built per `docs/contribute/ui/forms.md` using `useFormState` and `useFormInstrumentation`.
- `src/components/shopping-lists/concept-view.tsx` — new shell for the Concept list page (header, sorting toolbar, footer actions).
- `src/components/shopping-lists/concept-line-table.tsx` — new table wrapper that applies the sortable columns and read-only Ordered/Received presentation.
- `src/components/shopping-lists/concept-line-row.tsx` — new row component handling inline Needed/Seller override/Note editing, delete confirm, and instrumentation IDs.
- `src/components/shopping-lists/line-form.tsx` — new form/drawer triggered by “Add row,” leveraging `useFormState`.
- `src/components/shopping-lists/part-selector.tsx` — new `SearchableSelect`-based part picker limited to existing parts.
- `src/hooks/use-shopping-lists.ts` — new domain hook exporting `useShoppingLists`, `useShoppingList`, `useShoppingListLines`, and mutation helpers with camelCase mapping.
- `src/hooks/use-parts.ts` — add an exported helper that returns parts for selector options if one is missing today.
- `src/components/sellers/seller-selector.tsx` — add `allowClear` support so Concept rows can clear the Seller override.
- `src/types/shopping-lists.ts` — new domain model definitions plus API→UI mapping helpers.
- `src/lib/utils/sorting.ts` — add or extend comparators for Part description, manufacturerCode, and createdAt sorting.
- `tests/api/factories/shopping-list-factory.ts` — new real-backend factory for lists/lines.
- `tests/api/index.ts` — register the shopping list factory inside `createTestDataBundle`.
- `tests/support/page-objects/shopping-lists-page.ts` — new page object encapsulating overview and Concept interactions.
- `tests/support/fixtures.ts` — expose the new page object through the shared fixtures.
- `tests/e2e/shopping-lists/list-overview.spec.ts` — new backend-driven Playwright spec for overview create/open/delete flows.
- `tests/e2e/shopping-lists/concept-list.spec.ts` — new backend-driven spec covering add row, duplicate prevention, line edits, and Mark “Ready”.
- `tests/support/helpers/test-events.ts` — extend helpers if new instrumentation scopes require explicit waiters.

## Implementation Steps
1. **Navigation & routing** — create the `/shopping-lists` route folder with overview and `$listId` file routes, update the sidebar and dashboard quick action to navigate via TanStack Router, and regenerate `routeTree.gen.ts` after adding routes.
2. **Domain hooks & models** — introduce `src/types/shopping-lists.ts` for camelCase models (`ShoppingList`, `ShoppingListLine`) and implement `useShoppingLists`, `useShoppingList`, `useShoppingListLines`, and mutation helpers in `src/hooks/use-shopping-lists.ts` that wrap the generated TanStack hooks, emit `useListLoadingInstrumentation` scopes (`shoppingLists.list`, `shoppingLists.lines`), and centralize toast handling.
3. **Lists Overview** — build `list-overview.tsx` and `list-card.tsx` to render responsive cards per `docs/contribute/ui/data_display.md`, include create/open/delete affordances, open `list-form.tsx` for name/description capture, invoke the new mutations, and surface instrumentation metadata with deterministic `data-testid` values.
4. **Concept list shell** — implement `concept-view.tsx` to show list metadata, allow rename/describe via `list-form.tsx`, wire sorting controls for Part description / manufacturer_code / created_at (persisted in router search params), and render the line table plus the Mark “Ready” footer tied to `usePutShoppingListsStatusByListId`.
5. **Editable concept grid** — deliver `concept-line-table.tsx`, `concept-line-row.tsx`, `line-form.tsx`, and `part-selector.tsx` so users can add lines, inline-edit Needed/Seller override/Note, confirm deletes via `useConfirm`, prevent duplicates client-side before mutation, wrap add/edit flows with `useFormInstrumentation`, and reuse `SellerSelector` (now supporting `allowClear`) for overrides.
6. **Backend-driven tests** — add the shopping list factory, extend Playwright fixtures/page objects, and author `tests/e2e/shopping-lists/*.spec.ts` to cover overview CRUD, duplicate prevention (expecting backend 409 conflicts), inline edits, and the Mark “Ready” transition while relying on real backend calls (no `page.route`/`mockSSE`) consistent with `docs/contribute/testing/playwright_developer_guide.md`.

## Algorithms & Data Flow
- **Duplicate prevention** — render a `Map<number, ShoppingListLine>` keyed by `partId`; on “Add row” submit or inline part change, check the map to short-circuit duplicates, show a targeted error toast, and still rely on backend 409 responses as the final guard.
- **Sorting** — maintain `sortKey` (`description`, `manufacturerCode`, `createdAt`) and `sortOrder` state, update via toolbar controls, and compute the sorted array with `useMemo`, using locale-aware compares for text and timestamps for chronological ordering.
- **Mark “Ready” gating** — disable the footer CTA until `lines.length > 0`, call `usePutShoppingListsStatusByListId` with `{ status: 'ready' }`, optimistically update cached list status, and invalidate relevant queries so overview and detail stay aligned.
- **Inline edits** — validate Needed (int ≥ 1), allow clearing seller override (`undefined` body) via `allowClear`, debounce note updates before calling `usePutShoppingListLinesByLineId`, and keep Ordered/Received read-only fields in sync with server payload.

## Blocking Issues
- Ensure new Playwright specs await `shoppingLists.list` / `shoppingLists.lines` instrumentation events and adhere to the backend-only policy (no `page.route`, no `mockSSE`) as outlined in `docs/contribute/testing/playwright_developer_guide.md`.
