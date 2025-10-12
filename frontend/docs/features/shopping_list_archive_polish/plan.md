# Shopping List Archive & Polish Plan

## Brief Description
Implement the remaining UI scope from `docs/epics/shopping_list_phases.md` covering **Phase 5 — Lists Overview v2 (archive & counters)** and **Phase 7 — Polishing & quality gates**. The goal is to finish the archive workflow where “Done (hidden by default)” lists are surfaced separately, “Mark Done” closes out a list, and in-list views honor the “Hide Done (default on)” toggle while preserving the “Done lines are excluded by default in Active views” rule from `docs/epics/shopping_list_brief.md`. The work must align with the list/grid conventions in `docs/contribute/ui/data_display.md` and reuse existing instrumentation hooks so Playwright can keep asserting backend-driven state.

## Relevant Files & Functions
- `src/components/shopping-lists/overview-list.tsx` – partition overview data into Active/Done sections, expose the “Show Done” control, wire “Mark Done”, and emit updated instrumentation metadata (including manual `ui_state` events for the toggle).
- `src/components/shopping-lists/overview-card.tsx` – add CTA for Mark Done, render status/count chips with hover help, and ensure column widths stay stable.
- `src/components/shopping-lists/list-delete-confirm.tsx` & new helper for marking done – consolidate confirm copy so delete/mark-done follow the documented destructive-action pattern.
- `src/routes/shopping-lists/index.tsx` – pass search + `showDone` parameters through router search and maintain overview layout.
- `src/hooks/use-shopping-lists.ts` – expose computed metadata (active/done counts, updatedAt helpers), keep seller-group totals derived from visible lines, and expand instrumentation payloads.
- `src/lib/test/query-instrumentation.ts` – extend `useListLoadingInstrumentation` metadata with the active/done summary fields Playwright will assert.
- `src/types/shopping-lists.ts` – add helper types/derivations for overview counters or presentation metadata the overview cards need.
- `src/routes/shopping-lists/$listId.tsx` – surface the Ready-view mark-done CTA, keep done lines visible after transitions, and push updated instrumentation metadata.
- `src/components/shopping-lists/ready/seller-group-list.tsx`, `ready/seller-group-card.tsx`, `ready/ready-line-row.tsx`, `ready/ready-toolbar.tsx` – host mark-done controls, recalculate seller totals from rendered lines, and show explanatory copy when filters ever hide data.
- `src/components/shopping-lists/concept-header.tsx`, `concept-table.tsx`, `concept-line-row.tsx` – refresh badges/tooltips for polish and ensure done lines remain visible.
- `src/components/shopping-lists/mark-ready-footer.tsx` – ensure instrumentation IDs stay unique alongside the mark-done flow.
- `tests/support/page-objects/shopping-lists-page.ts` – add helpers for the show-done toggle, mark-done dialog interactions, and seller-total assertions.
- `tests/e2e/shopping-lists/shopping-lists.spec.ts` – extend coverage for archiving, ready-view mark-done, seller group totals, and the polished visual affordances using backend-driven assertions.
- `tests/api/factories/shopping-list-factory.ts` & `tests/api/index.ts` – expose helpers to mark a list Done and to create deterministic Ready/Done lines for Playwright setup.

## Implementation Plan

### Phase 5 — Lists Overview v2 (archive & counters)
1. **Partition overview data and controls**
   - Use `useMemo` in `overview-list.tsx` to split `lists` into `activeLists = status !== 'done'` and `doneLists = status === 'done'` *after* applying search filtering so the CTA reflects exactly what the user sees.
   - Default the UI to show only active lists; add a disclosure/toggle (`showDoneSection`) that reveals Done lists on demand (“Done (hidden by default)”) and persist the state via `routes/shopping-lists/index.tsx` search params (`showDone=true|false`) to satisfy `docs/contribute/ui/data_display.md` guidance on sharable filters.
   - Algorithm detail: reuse the existing `filteredLists` memo in `overview-list.tsx`, then derive `activeLists = filteredLists.filter(list => list.status !== 'done')` and `doneLists = filteredLists.filter(list => list.status === 'done')`. Capture summary metadata `{ activeCount: activeLists.length, doneCount: doneLists.length, showDoneState: showDoneSection ? 'expanded' : 'collapsed' }`.
   - Surface counts and status copy per `docs/contribute/ui/data_display.md` via summary bar (`data-testid="shopping-lists.overview.summary"`) and update instrumentation `getReadyMetadata` to merge existing keys with the new `{ activeCount, doneCount, showDoneState }`. Wrap the toggle handler in a tiny helper that calls `beginUiState('shoppingLists.overview.filters')` just before mutating `showDoneSection` and `endUiState('shoppingLists.overview.filters', { ...metadata })` immediately after so Playwright observes a deterministic `loading → ready` sequence even without a query round-trip.

2. **Mark Done workflow**
   - Add a new confirm hook (e.g., `useListArchiveConfirm`) that wraps `useUpdateShoppingListStatusMutation` with `status: 'done'`, reusing `useConfirm` to show a destructive dialog (“Mark list as Done? This hides it from Active lists.”).
   - In `overview-card.tsx`, render a secondary button (`Mark Done`) only for non-done statuses; disable while mutation pending; ensure `onOpen` still navigates.
   - Update card footer to show `Updated {relativeDate}` with tooltip text for the ISO timestamp to satisfy the “hover help on counts”.
   - Algorithm detail: optimistic UI is avoided; rely on invalidation already in the mutation. After success, reuse `useFormInstrumentation` with `formId = generateFormId('ShoppingListStatus', 'markDone')` so both overview and detail flows emit consistent submit/success events.

3. **Ready view Mark Done controls**
   - Refactor `ready-toolbar.tsx` into a persistent header that always renders an actions row. Keep the helper copy (“No lines are currently marked Ordered…”) gated behind `canReturnToConcept` so it never shows when the list cannot return to Concept. Layout the new `Mark Done` primary button alongside “Back to Concept” when both actions are available, and collapse to a single-row toolbar with only `Mark Done` when returning is disallowed. Reuse `useConfirm` with copy aligned to `docs/contribute/ui/forms.md` (“Mark list as Done? This hides it from Active lists.”).
   - Invoke `useUpdateShoppingListStatusMutation` with `{ status: 'done' }`, disable the CTA while pending, and ensure toasts/instrumentation mirror the overview workflow (`shoppingliststatus_markdone` success/error events).
   - After successful mutation, keep the user on the detail route, refresh data so the layout reflects the `done` status, and verify done lines remain visible in the table so duplicate detection and history continue to work without any hide/show toggle logic.

4. **Seller group totals & explanatory copy**
   - Derive `visibleTotals` inside `SellerGroupCard` by reducing `group.lines` (needed/ordered/received) rather than trusting the backend-provided aggregates so the header always reflects the numbers on screen.
   - Preserve the original backend totals to detect divergence; when `visibleTotals` differ (e.g., a future filter hides lines), render a short caption such as “Showing filtered totals; original: {rawDiff} more” (`data-testid="shopping-lists.ready.group.filter-note"`) immediately beneath the totals.
   - Expose `visibleTotals` and any `filteredDiff` values via `useShoppingListDetail().getReadyMetadata` so `shoppingLists.list` instrumentation reports `{ view: 'ready', groupTotals, filteredDiff }` for Playwright assertions.
   - Extend the page object with helpers to read the totals row and caption, and plan component-level tests to cover edge cases where totals diverge even if the main UI rarely filters data.

5. **Overview presentation polish for Phase 5 deliverables**
   - Update `overview-card.tsx` badges to match the statuses defined in the brief (“New”, “Ordered”, “Done”) with consistent Tailwind classes and tooltips summarising meaning.
   - Ensure the Active and Done section headers communicate totals (e.g., “Active lists (2) / Done lists (3)”) with a concise note that Done lists are hidden by default until expanded.
   - Honor existing delete dialog by keeping confirm copy in `list-delete-confirm.tsx` but ensure both actions share the same dialog infrastructure for consistent behaviour.

### Phase 7 — Polishing & Quality Gates
1. **Sorting refinements**
   - In `useSortedShoppingListLines`, replace direct `localeCompare` with an `Intl.Collator` to ensure stable, case-insensitive ordering. Document this via a guidepost comment since it affects determinism.
   - For ready groups, adjust `sortSellerGroupsForReadyView` to keep deterministic order when seller names match (fall back to `groupKey`) and ensure lines within groups stay sorted by `part.description`.

2. **Visual polish (status/seller chips, hover help, column stability)**
   - Update `concept-line-row.tsx` and `ready-line-row.tsx` to render seller/status using `<Badge>` variants (e.g., status chip per status colour) and include tooltips for mismatch icons, satisfying “clear status chips” and “seller chips”.
   - Normalize column widths using shared Tailwind utility constants (e.g., reuse `w-[28%]` definitions across tables) to meet the “stable column widths” requirement.
   - Inject hover tooltips on overview count badges and header counts using existing tooltip component (or `title` attribute if acceptable) while keeping copy terse.

3. **Consistent destructive confirmations & CTAs**
   - Ensure `Mark Done` and `Delete` dialogs set `destructive: true`, label buttons consistently (“Delete”, “Mark Done”), and emit toast copy that matches backend behaviour (e.g., “Marked shopping list "X" done”).
   - Plumb toast + instrumentation events through `useToast` so Playwright can assert the success path without DOM flakiness.

4. **Performance considerations**
   - Add a lightweight guard in `SellerGroupList` to reuse memoized seller-group arrays when totals/lines are unchanged; document that virtualization is deferred (“virtualize long tables if needed later; not mandatory now”) and capture a TODO with threshold guidance if lists exceed 200 lines.

5. **Instrumentation updates**
   - Ensure overview instrumentation merges `{ activeCount, doneCount, showDoneState }` into the existing metadata and fire manual `beginUiState/endUiState` pairs when the show-done toggle flips so Playwright can wait on `shoppingLists.overview.filters`.
   - Extend `shoppingLists.list` metadata with `{ status, view, groupTotals, filteredDiff }` (where `filteredDiff` is `0` when nothing is hidden) and keep `getAbortedMetadata` aligned so test waits remain deterministic.
   - Verify both overview and detail flows emit `shoppingliststatus_markdone` submit/success/error phases through `useFormInstrumentation`, and add regression assertions so Playwright can wait on these events instead of DOM polling.

## Playwright Coverage
1. **Archive list from overview**
   - Extend `tests/e2e/shopping-lists/shopping-lists.spec.ts` to create a concept list, click “Mark Done”, confirm, and expect the card to move into the Done section (hidden until “Show Done lists” toggled).
   - Wait for `waitForUiState(page, 'shoppingLists.overview.filters', 'ready')` and assert metadata includes `{ activeCount: 0, doneCount: 1, showDoneState: 'collapsed' }` before toggling, then `'expanded'` after revealing Done; confirm the router search reflects `showDone=true` once expanded so the setting persists and the section note renders.
   - Assert toast copy (“Marked shopping list…" ) and confirm the delete CTA stays available inside the Done section.

2. **Mark list done from Ready view**
   - Start from a Ready list with no Ordered lines, click the new “Mark Done” CTA in the toolbar, confirm, and ensure the detail view refreshes in-place with the list status now `done` while overview counters update after navigation back.
   - Wait on `shoppingliststatus_markdone` instrumentation submit/success events and assert `shoppingLists.list` metadata includes `{ status: 'done', view: 'ready', groupTotals: {...}, filteredDiff: 0 }` immediately after completion.
   - Repeat with a Ready list that still has Ordered lines to confirm the mutation remains allowed per `docs/epics/shopping_list_brief.md` and that instrumentation/toasts match the no-Ordered scenario while done lines remain visible.

3. **Seller group totals reflect visible lines**
   - Seed a Ready list with multiple seller groups spanning new/ordered/done lines. Verify the header totals equal the sum of visible row counts and that no filter caption renders (`filteredDiff: 0`).
   - Use a dedicated test-only factory helper to request a filtered dataset (e.g., exclude done lines when fetching seller groups) so the UI hides a subset; assert the caption (`data-testid="shopping-lists.ready.group.filter-note"`) appears, the numbers reflect the visible rows, and instrumentation reports `filteredDiff > 0`.

4. **Overview & detail polish regressions**
   - Confirm status/seller chips expose deterministic `data-testid`s across concept and ready rows, and hover tooltips for overview counts remain accessible.
   - Validate the section headers display the new active/done totals and explanatory copy when Done lists are collapsed.

5. **Page object & factory support**
   - Update `ShoppingListsPage` helpers for the show-done toggle, mark-done confirm path, seller-total assertions, and helper to surface the filter caption.
   - Extend `testData.shoppingLists` with `markDone(listId)` plus a targeted helper that returns filtered seller-group payloads for the instrumentation scenario, keeping tests backend-driven (no request interception).

## Phasing
1. **Phase 5 slice** – deliver overview partitioning, mark-done workflow across overview & ready views, seller-group totals recalculation, and baseline Playwright coverage.
2. **Phase 7 slice** – apply polish (chips, tooltips, stable sorting), extend instrumentation metadata, and add regression tests for the visual affordances.

## Blocking Issues
None identified; the existing backend already exposes `status`, `updated_at`, `line_counts`, and status mutation endpoints used by `useUpdateShoppingListStatusMutation`.
