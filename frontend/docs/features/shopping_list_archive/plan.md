# Shopping List Archive & Counters – Phase 5 Plan

## Brief Description
Deliver the remaining Phase 5 scope from `docs/epics/shopping_list_phases.md`: split the shopping list overview into Active/Done sections, finish the mark-done workflow from both overview and ready views, and keep ready seller totals aligned with the data visible on screen. The UI must follow the patterns in `docs/contribute/ui/data_display.md` and reuse existing instrumentation hooks so Playwright can assert backend state deterministically.

## Core References
- `docs/product_brief.md`
- `docs/contribute/index.md`
- `docs/contribute/architecture/application_overview.md`
- `docs/contribute/testing/index.md`
- `docs/contribute/testing/playwright_developer_guide.md`
- `docs/contribute/testing/factories_and_fixtures.md`
- `docs/contribute/testing/ci_and_execution.md`

## Relevant Files & Functions
- `src/components/shopping-lists/overview-list.tsx` — partition overview data, host the show-done toggle, and emit instrumentation metadata.
- `src/components/shopping-lists/overview-card.tsx` — surface Mark Done CTA, render counters/tooltips, and keep column widths stable.
- `src/components/shopping-lists/list-delete-confirm.tsx` — extend confirm flow with Mark Done helper and shared destructive patterns.
- `src/routes/shopping-lists/index.tsx` — keep search params synced while leaving `showDone` as local screen state.
- `src/hooks/use-shopping-lists.ts` — expose overview/ready metadata (active/done counts, group totals) and mark-done mutations.
- `src/lib/test/query-instrumentation.ts` & `src/lib/test/ui-state.ts` — broaden metadata for `shoppingLists.overview` and add UI-state emission when toggles fire.
- `src/types/shopping-lists.ts` — define overview counters and seller-group visible totals used by components/tests.
- `src/routes/shopping-lists/$listId.tsx` — expose ready-view Mark Done CTA and ensure done lists stay readable after transitions.
- `src/components/shopping-lists/ready/seller-group-list.tsx`, `ready/seller-group-card.tsx`, `ready/ready-toolbar.tsx`, `ready/ready-line-row.tsx` — host mark-done actions, recompute visible totals, and display filter copy.
- `tests/support/page-objects/shopping-lists-page.ts` — add helpers for show-done toggle, mark-done dialogs, and seller totals assertions.
- `tests/api/factories/shopping-list-factory.ts`, `tests/api/index.ts` — expose helpers to mark a list done for deterministic setups.
- `tests/e2e/shopping-lists/shopping-lists.spec.ts` — extend coverage for overview archiving, ready mark-done, and seller totals.

## Implementation Plan

1. **Partition overview data and controls**
   - Use `useMemo` in `overview-list.tsx` to split `lists` into `activeLists = status !== 'done'` and `doneLists = status === 'done'` *after* applying search filtering so the CTA reflects exactly what the user sees.
   - Default the UI to show only active lists; add a disclosure/toggle (`showDoneSection`) that reveals Done lists on demand (“Done (hidden by default)”). Treat `showDoneSection` as screen-only state per stakeholder guidance—no router persistence—so toggling never pollutes shareable URLs.
   - Algorithm detail: reuse the existing `filteredLists` memo in `overview-list.tsx`, then derive `activeLists = filteredLists.filter(list => list.status !== 'done')` and `doneLists = filteredLists.filter(list => list.status === 'done')`. Capture summary metadata `{ activeCount: activeLists.length, doneCount: doneLists.length, showDoneState: showDoneSection ? 'expanded' : 'collapsed' }`.
   - Surface counts and status copy per `docs/contribute/ui/data_display.md` via summary bar (`data-testid="shopping-lists.overview.summary"`) and update instrumentation `getReadyMetadata` to merge existing keys with the new `{ activeCount, doneCount, showDoneState }`.
   - Instrument the toggle flow by calling `beginUiState('shoppingLists.overview.filters')` immediately before mutating the state, then finishing inside a `useEffect` that observes `showDoneSection` and the derived counts so `endUiState('shoppingLists.overview.filters', metadata)` fires once React has rendered. Once the overview query reaches ready, run the same effect for the initial collapsed state so Playwright can await a ready event before the first toggle.

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
   - Extend the page object with helpers to read the totals row and caption, and capture regression tests that prove recomputed totals match the visible rows using seeded line data (no hidden backdoor filters).

5. **Overview presentation polish for Phase 5 deliverables**
   - Update `overview-card.tsx` badges to match the statuses defined in the brief (“New”, “Ordered”, “Done”) with consistent Tailwind classes and tooltips summarising meaning.
   - Ensure the Active and Done section headers communicate totals (e.g., “Active lists (2) / Done lists (3)”) with a concise note that Done lists are hidden by default until expanded.
   - Honor existing delete dialog by keeping confirm copy in `list-delete-confirm.tsx` but ensure both actions share the same dialog infrastructure for consistent behaviour.

## Playwright Coverage
1. **Archive list from overview**
   - Extend `tests/e2e/shopping-lists/shopping-lists.spec.ts` to create a concept list, click “Mark Done”, confirm, and expect the card to move into the Done section (hidden until “Show Done lists” toggled).
   - Wait for `waitForUiState(page, 'shoppingLists.overview.filters', 'ready')` and assert metadata includes `{ activeCount: 0, doneCount: 1, showDoneState: 'collapsed' }` before toggling, then `'expanded'` after revealing Done; confirm the collapsed/expanded copy updates without touching the browser URL.
   - Assert toast copy (“Marked shopping list…" ) and confirm the delete CTA stays available inside the Done section.

2. **Mark list done from Ready view**
   - Start from a Ready list with no Ordered lines, click the new “Mark Done” CTA in the toolbar, confirm, and ensure the detail view refreshes in-place with the list status now `done` while overview counters update after navigation back.
   - Wait on `shoppingliststatus_markdone` instrumentation submit/success events and assert `shoppingLists.list` metadata includes `{ status: 'done', view: 'ready', groupTotals: {...}, filteredDiff: 0 }` immediately after completion.
   - Repeat with a Ready list that still has Ordered lines to confirm the mutation remains allowed per `docs/epics/shopping_list_brief.md` and that instrumentation/toasts match the no-Ordered scenario while done lines remain visible.

3. **Seller group totals reflect visible lines**
   - Seed a Ready list with multiple seller groups spanning new/ordered/done lines. Verify the header totals equal the sum of visible row counts and that no filter caption renders (`filteredDiff: 0`).
   - Seed data entirely through existing factories (create list, add lines, flip some to `done`) so the spec controls every visible row. There is no backend-side filter; instead, assert the caption (`data-testid="shopping-lists.ready.group.filter-note"`) stays hidden and instrumentation reports `filteredDiff = 0` after recomputing totals from the rendered rows.

## Blocking Issues
None identified.
