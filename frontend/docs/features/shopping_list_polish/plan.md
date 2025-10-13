# Shopping List Archive & Polish – Phase 7 Plan

## Brief Description
Complete the Phase 7 polish and quality gates from `docs/epics/shopping_list_phases.md`: stabilize sorting, refresh visual affordances (badges, tooltips, column widths), and confirm instrumentation remains robust so the Playwright suite can assert the refined UI contract without brittle waits.

## Core References
- `docs/product_brief.md`
- `docs/contribute/index.md`
- `docs/contribute/ui/data_display.md`
- `docs/contribute/architecture/application_overview.md`
- `docs/contribute/testing/index.md`
- `docs/contribute/testing/playwright_developer_guide.md`
- `docs/contribute/testing/factories_and_fixtures.md`
- `docs/contribute/testing/ci_and_execution.md`

## Relevant Files & Functions
- `src/hooks/use-shopping-lists.ts` — swap to `Intl.Collator` for deterministic sorting; ensure seller-group ordering stays stable.
- `src/components/shopping-lists/concept-header.tsx`, `concept-table.tsx`, `concept-line-row.tsx` — refresh badges/tooltips and maintain stable column widths.
- `src/components/shopping-lists/ready/ready-line-row.tsx`, `ready/seller-group-card.tsx`, `ready/seller-group-list.tsx`, `ready/ready-toolbar.tsx` — polish chips and hover help while keeping instrumentation behind `isTestMode()`.
- `src/components/shopping-lists/mark-ready-footer.tsx` — maintain unique instrumentation IDs alongside the new mark-done flow.
- `src/lib/test/query-instrumentation.ts` — confirm list instrumentation metadata stays aligned after UI tweaks (no schema changes needed).
- `tests/support/page-objects/shopping-lists-page.ts` — expose helpers for polished affordances (status chips, tooltips, seller captions).
- `tests/e2e/shopping-lists/shopping-lists.spec.ts` — add regression coverage for polish scenarios and instrumentation expectations.

## Implementation Plan

1. **Sorting refinements**
   - In `useSortedShoppingListLines`, replace direct `localeCompare` with an `Intl.Collator` to ensure stable, case-insensitive ordering. Document this via a guidepost comment since it affects determinism.
   - For ready groups, adjust `sortSellerGroupsForReadyView` to keep deterministic order when seller names match (fall back to `groupKey`) and ensure lines within groups stay sorted by `part.description`.

2. **Visual polish (status/seller chips, hover help, column stability)**
   - Update `concept-line-row.tsx` and `ready-line-row.tsx` to render seller/status using `<Badge>` variants (e.g., status chip per status colour) and include tooltips for mismatch icons, satisfying “clear status chips” and “seller chips” while following `docs/contribute/ui/data_display.md` badge/tooltip guidance.
   - Normalize column widths using shared Tailwind utility constants (e.g., reuse `w-[28%]` definitions across tables) to meet the “stable column widths” requirement.
   - Inject hover tooltips on overview count badges and header counts using existing tooltip component (or `title` attribute if acceptable) while keeping copy terse.

3. **Consistent destructive confirmations & CTAs**
   - Ensure `Mark Done` and `Delete` dialogs set `destructive: true`, label buttons consistently (“Delete”, “Mark Done”), and emit toast copy that matches backend behaviour (e.g., “Marked shopping list "X" done”).
   - Reuse existing `useFormInstrumentation` and toast events to keep Playwright waits deterministic; only adjust copy/test IDs as needed for the polished affordances.

4. **Instrumentation verification**
   - Audit `useListLoadingInstrumentation` usage in both overview and detail views to confirm metadata already includes `{ status, view, groupTotals, filteredDiff, activeCount, doneCount, showDoneState }`; update local consumers only if UI changes alter payload shapes.
   - Ensure mark-done flows continue to emit `shoppingliststatus_markdone` submit/success/error phases via existing `useFormInstrumentation` wiring, adding guidepost comments where new UI interactions rely on those signals.

## Playwright Coverage
1. **Deterministic sorting**
   - Given a concept list seeded with lines whose descriptions differ only by case and a ready view with duplicate seller names, When the list renders, Then the concept lines and ready seller groups remain stably ordered (await `shoppingLists.list` ready events where `metadata.sortKey` and `metadata.groupTotals` match expectations). Seed data via `testData.shoppingLists.createWithLines` and existing `markReady` helpers.

2. **Status/seller chip polish**
   - Given concept and ready lists with mixed statuses, When the rows render, Then each badge/tool tip is reachable via new deterministic `data-testid`s and matches the colour/label guidance. Wait on `shoppingLists.list` ready events and assert UI text plus tooltip presence using the updated page object helpers.

3. **Overview counters & toggle**
   - Given active and done lists exist, When the user toggles “Show Done lists”, Then `shoppingLists.overview` emits ready metadata containing `{ activeCount, doneCount, showDoneState }` and the UI updates the collapsed caption. Use `waitForUiState(page, 'shoppingLists.overview.filters', 'ready')` to synchronize.

4. **Mark Done & Delete confirmations**
   - Given a ready list, When the user marks it done or deletes it, Then dialogs show destructive styling, toasts emit success copy, and the mark-done flow still emits `shoppingliststatus_markdone` submit/success events. Leverage `waitTestEvent` helpers for the form instrumentation and assert toast visibility alongside backend state.

Page object updates should expose helpers for the new badge/test IDs and dialog copy without introducing manual network waits. All scenarios continue to rely on backend factories (no route interception).

## Blocking Issues
None identified.
