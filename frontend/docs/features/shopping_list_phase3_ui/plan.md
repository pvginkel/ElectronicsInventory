# Shopping List Phase 3 UI Plan

## Brief Description
- Implement the Phase 3 “Part-centric entry points & indicators” slice from `docs/epics/shopping_list_phases.md`, reusing the React 19 + TanStack Router/Query stack described in `docs/contribute/architecture/application_overview.md`.
- Add the Part detail button **“Add to shopping list”** so users can choose an existing **Concept** list or create a new one, set Needed, optional Note, and Seller override in a single flow.
- Surface badges on Part detail with the active Shopping Lists (status ≠ Done) that already include the Part and let users navigate to those lists.
- On every Part tile/card, show an icon when the Part appears on any not-Done lines; hovering exposes the list names as links.

## Relevant Files & Modules
- `src/types/shopping-lists.ts` – extend the domain models with shopping list membership types so UI surfaces stay camelCase.
- `src/hooks/use-shopping-lists.ts` + new `src/hooks/use-part-shopping-list-memberships.ts` – wrap the generated client for the bulk lookup (`usePostPartsShoppingListMembershipsQuery`) alongside the existing create-line mutation so membership reads/mutations stay centralised.
- `src/components/shopping-lists/part/add-to-shopping-list-dialog.tsx` (new) – encapsulate the Part detail modal, using existing form helpers (`useFormState`, `useFormInstrumentation`, `SellerSelector`).
- `src/components/parts/part-details.tsx` – insert the CTA, badge strip, and wire the dialog while keeping layout patterns from `docs/contribute/ui/patterns/part_management.md`.
- `src/components/parts/part-list.tsx` – render the shopping-list indicator icon/tooltip on each card without breaking the existing responsive grid.
- `tests/support/page-objects/parts-page.ts`, `tests/support/page-objects/shopping-lists-page.ts` – expose helpers for the new dialog, badges, and indicators.
- `tests/e2e/shopping-lists/phase3-entrypoints.spec.ts` (new) – end-to-end coverage for Part detail flows and list indicators, using real backend data per `docs/contribute/testing/playwright_developer_guide.md`.

## Implementation Steps

### 1. Membership data layer
1. Add `ShoppingListMembership` and `ShoppingListMembershipSummary` interfaces to `src/types/shopping-lists.ts`, covering `shopping_list_id`, `shopping_list_name`, `shopping_list_status`, `line_id`, `line_status`, `needed`, `ordered`, `received`, `note`, and optional seller fields from the new OpenAPI schema.
2. Create `src/hooks/use-part-shopping-list-memberships.ts` that centralises single and bulk lookups via the new POST endpoint:
   - Wrap `client.POST('/api/parts/shopping-list-memberships/query')` (generated `usePostPartsShoppingListMembershipsQuery`) with a `useQuery` helper so reads behave like queries; accept `partKeys` input and optional `includeDone` (default `false`).
   - Normalise input by trimming and deduplicating keys while preserving the requested order so we avoid the backend’s duplicate validator; re-expand the response to match the caller’s key order.
   - Map payloads into the new types, reuse backend filtering (Done excluded unless `includeDone`), and expose derived helpers (`hasActiveMembership`, `listNames`, `conceptListIds`) plus metadata needed by indicators.
   - Emit instrumentation via `useListLoadingInstrumentation` with scope `parts.detail.shoppingLists`, including metadata (`activeCount`, `conceptCount`) for deterministic Playwright waits.
   - Expose `invalidatePartMemberships(queryClient, partKeys: string | string[])` for reuse after mutations.

### 2. Add-to-list dialog for Part detail
1. Build `AddToShoppingListDialog` in `src/components/shopping-lists/part/add-to-shopping-list-dialog.tsx`:
   - Props: `open`, `onClose`, `part` (id/key/description/defaultSellerId), and `defaultNeeded` (fallback `1`).
   - Inside, fetch Concept lists by reusing `useShoppingListsOverview()` and filtering `status === 'concept'`; surface an inline empty state with a CTA to create a new list.
   - Form fields (all `data-testid` prefixed with `parts.shopping-list.add.*`): dropdown for Concept list, toggleable section to “Create new Concept list” (name + optional description), Needed (integer ≥1), Seller override (reuse `SellerSelector`), Note (≤500 chars).
   - Use `useFormState` and `useFormInstrumentation({ formId: 'ShoppingListMembership:addFromPart' })`, reporting validation errors (e.g., missing list selection) via `trackValidationError`.
   - Submission algorithm:
     1. If “create new Concept list” is active, call `useCreateShoppingListMutation().mutateAsync` with trimmed name/description; capture the returned `id`.
     2. Invoke `useCreateShoppingListLineMutation().mutateAsync` with `{ listId, partId, partKey, needed, sellerId, note }`.
     3. On success, fire `trackSuccess`, show toast “Added part to Concept list”, call `invalidatePartMemberships` for the current part, and close the dialog.
     4. Handle `409` responses (duplicate) by surfacing the conflict message and linking to the existing list badge.
   - Disable submit while mutations are pending, keep buttons consistent with `docs/contribute/ui/patterns/part_management.md`.

### 3. Part detail integrations
1. In `src/components/parts/part-details.tsx`, add a primary `Button` labelled “Add to shopping list” alongside existing actions, opening the new dialog.
2. Pull the current part into a lightweight `partSummary` object (id/key/description/default seller id) to pass down.
3. Consume `usePartShoppingListMemberships(part.key)`:
   - Display a skeleton/loading chip while the query is pending; show an inline alert on error with a retry button (`invalidate…` then refetch).
   - Render a badge strip beneath the summary header (`data-testid="parts.detail.shopping-list.badges"`). Each badge shows the `shopping_list_name` plus a status chip (`Concept` / `Ready`) and links to `/shopping-lists/$listId` via `<Link>`.
   - If there are no active memberships, display muted helper text indicating the Part is not on any Concept/Ready lists.
4. When the dialog completes, rely on the invalidation helper so the badge strip refreshes automatically.

### 4. Part list indicator
1. Add `useShoppingListMembershipIndicators(partKeys: string[])` inside `src/hooks/use-part-shopping-list-memberships.ts` that reuses the bulk helper: when keys are present, issue a single POST with the deduped key list, set `staleTime: 60_000` / `gcTime: 5 * 60_000` to avoid fan-out, and return a `Map` keyed by part key alongside loading/error metadata.
2. In `src/components/parts/part-list.tsx`:
   - Derive the visible `partKeys` from `filteredParts` and call the new hook; memoise the result into a `Map` keyed by part key.
   - Within `PartListItem`, check the indicator map. If `hasActiveMembership` is true, render a subtle icon button (e.g., `ShoppingCartIcon`) with `Tooltip`/`HoverCard` listing the Concept/Ready list names (links). Keep card layout aligned with `docs/contribute/ui/patterns/part_management.md`.
   - Attach `data-testid="parts.list.card.shopping-list-indicator"` so Playwright can target it.
   - Tie the indicator visibility to query loading state (e.g., show a spinner dot while the membership query for that part is fetching, then replace with icon).
3. Reuse `invalidatePartMemberships` after the dialog’s success to refresh indicators; optionally warm the indicator cache for the newly created list by calling the invalidation helper.

### 5. Cache + instrumentation consistency
1. Extend existing mutations in `src/hooks/use-shopping-lists.ts` (create/update/delete line, mark ready) to call `invalidatePartMemberships(queryClient, partKey)` whenever payloads include a `partKey`; the helper can accept either a single key or an array.
2. Ensure `usePartShoppingListMemberships` exports `getReadyMetadata`/`getErrorMetadata` so instrumentation events include list counts and error messages for the Playwright helper `waitForListLoading`.
3. Verify the generated hook typings already expose seller data; add type guards in the mapper so null sellers are handled gracefully.
4. Register instrumentation scopes `parts.detail.shoppingLists`, `parts.list.shoppingListIndicators`, and `form:ShoppingListMembership:addFromPart` so Playwright can wait on backend-driven events without route interception.

## Playwright Coverage
1. **Add from Part detail (new list path):** Open a part, click “Add to shopping list”, create a new Concept list, set Needed/Note/Seller override, submit, wait for `ShoppingListMembership:addFromPart` submit/success events, verify toast, confirm new badge and follow the badge link to see the line in Concept view.
2. **Add to existing Concept list & duplicate guard:** Seed a Concept list containing the part, add again via the dialog selecting the list, confirm the duplicate warning from the backend is surfaced, and ensure the badge count does not duplicate.
3. **Badge rendering for Ready memberships:** Seed Concept + Ready lists with the part (no Done lines), load the Part detail page, wait for `parts.detail.shoppingLists` instrumentation ready state, assert badges show correct status labels and navigate to the Ready view.
4. **Part list indicator hover:** Seed a Concept list, navigate to Parts list, wait for indicator icon on the relevant card, hover to read tooltip listing Concept/Ready names, and confirm no icon appears for a part whose only membership is Done.
All scenarios rely on real backend mutations plus deterministic instrumentation (`useListLoadingInstrumentation`, `useFormInstrumentation`) per `docs/contribute/testing/playwright_developer_guide.md`—no `page.route` or mocks.
