# Shopping List Archive & Polish – Phase 7 Plan

## Brief Description
Complete the Phase 7 polish and quality gates from `docs/epics/shopping_list_phases.md`: stabilize sorting, refresh visual affordances (badges, tooltips, column widths), and broaden instrumentation so the Playwright suite can assert the refined UI contract without brittle waits.

## Core References
- `docs/product_brief.md`
- `docs/contribute/index.md`
- `docs/contribute/architecture/application_overview.md`
- `docs/contribute/testing/index.md`
- `docs/contribute/testing/playwright_developer_guide.md`
- `docs/contribute/testing/factories_and_fixtures.md`
- `docs/contribute/testing/ci_and_execution.md`

## Relevant Files & Functions
- `src/hooks/use-shopping-lists.ts` — swap to `Intl.Collator` for deterministic sorting; ensure seller-group ordering stays stable.
- `src/components/shopping-lists/concept-header.tsx`, `concept-table.tsx`, `concept-line-row.tsx` — refresh badges/tooltips and maintain stable column widths.
- `src/components/shopping-lists/ready/ready-line-row.tsx`, `ready/seller-group-card.tsx`, `ready/seller-group-list.tsx`, `ready/ready-toolbar.tsx` — polish chips, hover help, and memoization guard; keep instrumentation behind `isTestMode()`.
- `src/components/shopping-lists/mark-ready-footer.tsx` — maintain unique instrumentation IDs alongside the new mark-done flow.
- `src/lib/test/query-instrumentation.ts`, `src/lib/test/ui-state.ts` — verify metadata additions stay aligned with new UI states.
- `tests/support/page-objects/shopping-lists-page.ts` — expose helpers for polished affordances (status chips, tooltips, seller captions).
- `tests/e2e/shopping-lists/shopping-lists.spec.ts` — add regression coverage for polish scenarios and instrumentation expectations.

## Implementation Plan

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
1. **Overview & detail polish regressions**
   - Confirm status/seller chips expose deterministic `data-testid`s across concept and ready rows, and hover tooltips for overview counts remain accessible.
   - Validate the section headers display the new active/done totals and explanatory copy when Done lists are collapsed.

2. **Page object & factory support**
   - Update `ShoppingListsPage` helpers for the show-done toggle, mark-done confirm path, seller-total assertions, and helper to surface the filter caption.
   - Extend `testData.shoppingLists` with `markDone(listId)` plus a targeted helper that returns filtered seller-group payloads for the instrumentation scenario, keeping tests backend-driven (no request interception).

## Blocking Issues
None identified.
