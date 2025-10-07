# Shopping List Foundations Frontend Plan

## Brief Description
Implement the frontend responsibilities for **Phase 1 — Shopping List foundations (Concept lists)** now that the backend and OpenAPI hooks are generated. Deliver the “Lists Overview (initial): create new list; open list; delete list (confirm)” surface and the Concept view defined as an editable grid with columns **Part | Seller | Needed | Ordered (ro) | Received (ro) | Note | Actions**. Enforce the spec requirements to add rows via a Part picker (existing parts only) with duplicate prevention messaging, expose sorting for “Part description, Part/MPN, Date added,” and provide the footer action **Mark “Ready”** once the list has ≥1 line. All UI work must conform to `docs/contribute/ui/data_display.md` and `docs/contribute/ui/forms.md`, and Playwright coverage must follow the testing guides in `docs/contribute/testing/`.

## Relevant Files and Functions
- `src/routes/__root.tsx`, `src/routes/index.tsx`: ensure the new `/shopping-lists` route integrates with the existing layout and default index route logic.
- `src/routes/shopping-lists/index.tsx`: new route module (using `createFileRoute('/shopping-lists/')`) that renders the Lists Overview and wires search params, modals, and instrumentation.
- `src/routes/shopping-lists/$listId.tsx`: new route for the Concept view (via `createFileRoute('/shopping-lists/$listId')`) handling data fetching, grid rendering, and footer actions.
- `src/components/layout/sidebar.tsx`: extend `navigationItems` with the Shopping Lists entry so users can reach the feature from the shell.
- `src/components/shopping-lists/overview-list.tsx`, `overview-card.tsx`, `list-create-dialog.tsx`, `list-delete-confirm.tsx`: new domain components that implement the overview grid, creation form, and deletion confirmation while reusing shared UI primitives.
- `src/components/shopping-lists/concept-table.tsx`, `concept-line-form.tsx`, `concept-line-row.tsx`, `concept-header.tsx`, `mark-ready-footer.tsx`: new components that compose the Concept view grid, inline dialogs, and footer CTA following the table/editing practices in `docs/contribute/ui/data_display.md`.
- `src/components/shopping-lists/part-selector.tsx`: helper that wraps `SearchableSelect` with the existing parts query for the “Part picker (existing parts only)” requirement.
- `src/hooks/use-shopping-lists.ts`: new hook module that wraps generated shopping list queries/mutations (`useGetShoppingLists`, `useGetShoppingListsByListId`, `usePostShoppingLists`, `usePutShoppingListsByListId`, `useDeleteShoppingListsByListId`, `useGetShoppingListsLinesByListId`, `usePostShoppingListsLinesByListId`, `usePutShoppingListLinesByLineId`, `useDeleteShoppingListLinesByLineId`, `usePutShoppingListsStatusByListId`) and maps snake_case payloads into camelCase domain models.
- `src/types/shopping-lists.ts`: domain model definitions for overview cards, concept lines, and supporting enums used by the new hooks/components.
- `src/lib/api/generated/hooks.ts`: no direct edits, but the plan relies on the newly generated shopping list hooks already present.
- `src/lib/test/query-instrumentation.ts`, `src/hooks/use-form-instrumentation.ts`: reuse existing helpers to emit deterministic events for list loading, line creation/editing, and Mark Ready status changes.
- `tests/e2e/shopping-lists/*.spec.ts`: new Playwright specs ensuring backend-driven coverage for overview CRUD, concept line management, duplicate prevention, and the Ready transition.

## Implementation Plan

### Phase 1 – Data Models and Hooks
1. Create `src/types/shopping-lists.ts` with camelCase interfaces for overview lists, counts, concept lines, sellers, sort keys, and mutation payload helpers. Document invariants (e.g., `needed >= 1`, status defaults) with brief comments per the “Readability Comments” guidance.
2. Implement `src/hooks/use-shopping-lists.ts`:
   - Map responses from `useGetShoppingLists` and `useGetShoppingListsByListId` into the new types, normalizing snake_case keys (`line_counts` → `lineCounts`, etc.) and deriving helper fields (e.g., `hasLines`, `primarySellerName`).
   - Expose mutations that automatically invalidate the precise query keys (`['getShoppingLists']`, `['getShoppingListsByListId', listId]`, `['getShoppingListsLinesByListId', listId]`) instead of blanket invalidation.
   - Provide memoized selectors such as `useShoppingListSorter(listId)` or inline utilities to sort lines client-side without mutating the React Query cache.

### Phase 2 – Lists Overview Screen
1. Under `src/components/shopping-lists/`, build `overview-list.tsx` that composes:
   - A header and search affordances aligned with the patterns in `docs/contribute/ui/data_display.md` (filtering updates the router search params via `useNavigate`).
   - Cards styled like the existing part cards (same spacing, shadow, badge placement) that display list name, optional description, status badge (fixed to Concept in Phase 1), and a “lines” summary using the counts from the hook.
   - Instrumentation: call `useListLoadingInstrumentation({ scope: 'shoppingLists.overview', ... })` with metadata describing total vs. filtered lists.
2. Implement `list-create-dialog.tsx`:
   - Use `Dialog`, `Form`, `FormField`, `Input`, and `Button` as specified in `docs/contribute/ui/forms.md`.
   - Track events with `generateFormId('ShoppingListCreate', 'concept')` and `useFormInstrumentation` for open/submit/success/error.
   - Validate by trimming `name`, enforcing presence, and length constraints before calling `usePostShoppingLists`. On success, close, trigger toast, and navigate to the Concept view using the returned ID.
3. Implement `list-delete-confirm.tsx` using `useConfirm` + `ConfirmDialog` to guard list deletion, showing the list name in the prompt. Hook to `useDeleteShoppingListsByListId` and display errors via `useToast`.
4. Wire `src/routes/shopping-lists/index.tsx` to render the overview, pass search term from router state, enable create/delete flows, and navigate to `/shopping-lists/$listId` on “open list”.
5. Update `src/components/layout/sidebar.tsx` to include `{ to: '/shopping-lists', label: 'Shopping Lists', icon: '🛒', testId: 'shopping-lists' }`, keeping emoji/icon style consistent.

### Phase 3 – Concept View Grid
1. Implement `concept-header.tsx` to show breadcrumb, list name, description (editable via inline field or modal using `usePutShoppingListsByListId`), and surface counts. Follow the “detail surface” practices in `docs/contribute/ui/data_display.md`.
2. Build `part-selector.tsx` reusing `SearchableSelect`. Query `useGetParts()` and present `description`, `key`, and `manufacturer_code` in the option template so users can find parts quickly, relying on the component’s built-in filtering for search-as-you-type.
3. Create `concept-line-form.tsx` to handle both “Add row” and “Edit line” flows:
   - Fields: part (searchable select), needed (numeric input ≥ 1), seller override (optional `SellerSelector`), note (textarea / multiline input).
   - Use `useFormState` for validation (positive integer for needed, prohibit empty part, allow note ≤ backend limit). Invoke `useFormInstrumentation` with IDs like `ShoppingListLineForm:add` and `ShoppingListLineForm:edit`.
   - Submit through the relevant mutation (`usePostShoppingListsLinesByListId` or `usePutShoppingListLinesByLineId`), catching `ApiError` 409 responses to display the duplicate warning (“if user tries to add same Part again, show error directing them to edit the existing line”).
4. Build `concept-table.tsx`:
   - Render the editable grid with the spec’d columns **Part | Seller | Needed | Ordered (ro) | Received (ro) | Note | Actions**.
   - For each row, show part description + key + manufacturer code, seller override name (fallback to part default if present in payload), `needed`, `ordered`, `received`, and note text.
   - Provide `Actions` menu with `Edit` (opens `concept-line-form` in edit mode) and `Delete` (requests confirmation then calls `useDeleteShoppingListLinesByLineId`).
   - Include inline error banner area for duplicate attempts referencing the existing line (link to scroll/focus).
   - Surface placeholders for empty state (“No lines yet—use Add row to populate this Concept list”) per the data display guidelines.
5. Implement `concept-table` sorting controls:
   - `SortMenu` toggles between “Part description,” “Part/MPN,” and “Date added” (created_at). State resides in the route (search param `sort=`) and is applied client-side via memoized sorting utilities.
   - Sorting uses stable locale-insensitive comparison for strings and timestamps for the date option.
6. Render `concept-line-form` entry points:
   - Keep the editable grid as rows; append a dedicated “Add row” control anchored at the bottom of the table body so the creation affordance aligns with the requested layout.
   - The control opens the dialog version of `concept-line-form` (no top-of-table shortcut) to keep creation consistently grounded at the bottom.

### Phase 4 – Footer Actions and Status Transition
1. Create `mark-ready-footer.tsx` showing summary counts and the **Mark “Ready”** button.
   - Disable the button when `lines.length === 0` or when a mark-ready mutation is in flight.
   - On click, call `usePutShoppingListsStatusByListId({ path: { list_id }, body: { status: 'ready' } })`.
   - Instrument via `useFormInstrumentation` (e.g., `generateFormId('ShoppingListStatus', 'markReady')`) so Playwright can await submit/success events.
   - After success, display a toast and navigate to the Ready route placeholder (`/shopping-lists/$listId` will continue to show Concept view until Phase 2 is built; include inline notice if needed).
2. Ensure the Concept route invalidates overview queries after mutations so the overview reflects counts immediately.
3. Use `useListLoadingInstrumentation({ scope: 'shoppingLists.list', ... })` on the Concept view to report load, success metadata (line counts, sort key), and error metadata for query failures.
4. Respect guardrails: hide controls that would violate “cannot change Line Status to Ordered/Done here” or “cannot receive stock here” by omitting those actions entirely.

## Algorithms & State Flow
1. **Duplicate prevention flow**
   - Maintain a `Map<number, ConceptLine>` keyed by `partId` derived from the current query data.
   - On “Add row” submit, check the map; if the part already exists, block submission, emit `trackValidationError('partId', 'Part already on this list')`, surface inline guidance referencing the existing row, and skip the mutation.
   - Still handle backend 409 conflicts (if a concurrent insert occurs) by catching `ApiError` and presenting the same guidance.
2. **Line sorting**
   - Keep `sortKey` in router search (`description`, `mpn`, `createdAt`).
   - Build a memoized comparator:
     - `description`: localeCompare on lowercase part description.
     - `mpn`: localeCompare on `(part.manufacturerCode ?? '') || part.key`.
     - `createdAt`: descending comparison on `new Date(line.createdAt).getTime()`.
   - Apply the comparator to a copied array before rendering to avoid mutating React Query caches.
3. **Form validation**
   - Required `name` trimmed non-empty for list create/update forms; enforce length <= 120.
   - `needed` parsed as integer ≥ 1; reject non-numeric or <1 input with `trackValidationError`.
   - Notes trimmed to backend max (confirm from schema—default to 500 chars if unspecified).
4. **Mark Ready gating**
   - Compute `hasLines = lines.length > 0` and `isConcept = list.status === 'concept'`.
   - Only render the `Mark “Ready”` CTA when `isConcept` and disable when `!hasLines`.
   - After mutation success, optimistically update local list status to `ready` in the hook so UI reflects the change before navigation.
5. **Instrumentation metadata**
   - Overview `getReadyMetadata`: `{ total: allLists.length, filtered: visibleLists.length }`.
   - Concept `getReadyMetadata`: include `{ lineCount: lines.length, sortKey, status: list.status }`.
   - Form instrumentation snapshots should include `{ listId, partId, needed }` to aid deterministic Playwright waits.

## Playwright Coverage
1. **Overview CRUD**: Start from seeded backend data, navigate via sidebar, wait for `shoppingLists.overview` ready event, create a Concept list, assert toast and navigation, and verify list deletion confirmation uses real backend state. No `page.route`; rely on instrumentation events plus `tests` factories to seed lists.
2. **Concept line management**: Add a line with the Part picker, confirm it appears with correct seller fallback and ordered/received defaults, edit the line to change `needed`/note, and delete it. Tests await `shoppingLists.list` instrumentation plus form submit/success events.
3. **Duplicate prevention**: Attempt to add the same Part twice; expect client-side validation event and backend 409 handling when forced via concurrent request. Assert the inline guidance references editing the existing line.
4. **Sorting and read-only columns**: Manipulate the sort menu through each of the three options and verify row order with backend values. Confirm `Ordered (ro)` and `Received (ro)` remain read-only by inspecting the rendered cells while ensuring backend totals stay 0.
5. **Mark Ready transition**: Populate at least one line, trigger **Mark “Ready”**, await instrumentation (`ShoppingListStatus` submit/success), verify overview reflects status `ready`, and ensure the CTA disappears afterward.

All scenarios use the real backend per `docs/contribute/testing/index.md`. Tests wait on instrumentation events (`useListLoadingInstrumentation`, `useFormInstrumentation`) and backend assertions (via factory helpers) instead of intercepting requests.

## Blocking Issues
- None identified. The plan adds the necessary instrumentation hooks (`shoppingLists.overview`, `shoppingLists.list`, `ShoppingListLineForm`, `ShoppingListStatus`) so Playwright remains backend-driven without `page.route` or mock SSE.
