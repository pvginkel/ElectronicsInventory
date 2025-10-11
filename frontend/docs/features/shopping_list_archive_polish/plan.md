# Shopping List Archive & Polish Plan

## Brief Description
Implement the remaining UI scope from `docs/epics/shopping_list_phases.md` covering **Phase 5 — Lists Overview v2 (archive & counters)** and **Phase 7 — Polishing & quality gates**. The goal is to finish the archive workflow where “Done (hidden by default)” lists are surfaced separately, “Mark Done” closes out a list, and in-list views honor the “Hide Done (default on)” toggle while preserving the “Done lines are excluded by default in Active views” rule from `docs/epics/shopping_list_brief.md`. The work must align with the list/grid conventions in `docs/contribute/ui/data_display.md` and reuse existing instrumentation hooks so Playwright can keep asserting backend-driven state.

## Relevant Files & Functions
- `src/components/shopping-lists/overview-list.tsx` – partition overview data into Active/Done sections, expose “Show Done” control, wire “Mark Done”, and emit updated instrumentation metadata.
- `src/components/shopping-lists/overview-card.tsx` – add CTA for Mark Done, render status/count chips with hover help, and ensure column widths stay stable.
- `src/components/shopping-lists/list-delete-confirm.tsx` & new helper for marking done – consolidate confirm copy so delete/mark-done follow the documented destructive-action pattern.
- `src/routes/shopping-lists/index.tsx` – pass show/hide parameters through router search and maintain overview layout.
- `src/hooks/use-shopping-lists.ts` – expose any additional computed metadata needed (active/done counts, updatedAt helpers) and expand `getReadyMetadata` outputs for instrumentation.
- `src/lib/test/query-instrumentation.ts` – extend `useListLoadingInstrumentation` metadata with the hide-done fields that tests will assert.
- `src/types/shopping-lists.ts` – add helper types/derivations for active/done totals or presentation metadata the overview cards need.
- `src/routes/shopping-lists/$listId.tsx` – add “Hide Done” state synced to search params, filter lines/groups, surface mark-done CTA in the ready toolbar, and push filter state into instrumentation metadata.
- `src/components/shopping-lists/concept-header.tsx`, `concept-table.tsx`, `concept-line-row.tsx` – inject the hide-done toggle, reorganize columns with badges/tooltips, and filter the rendered rows.
- `src/components/shopping-lists/ready/seller-group-list.tsx`, `ready/seller-group-card.tsx`, `ready/ready-line-row.tsx`, `ready/ready-toolbar.tsx` – filter done lines, collapse empty groups, expose seller/status chips, and host mark-done controls in Ready view.
- `src/components/shopping-lists/mark-ready-footer.tsx` (if reused for status transitions) – ensure instrumentation IDs stay unique alongside the new mark-done flow.
- `tests/support/page-objects/shopping-lists-page.ts` – add helpers for the new toggles, sections, and mark-done dialog interactions.
- `tests/e2e/shopping-lists/shopping-lists.spec.ts` – extend coverage for archiving, hide-done behaviour, and the polished visual affordances using backend-driven assertions.
- `tests/api/factories/shopping-list-factory.ts` & `tests/api/index.ts` – expose helpers to mark a list Done and to create Done lines for deterministic Playwright setup.

## Implementation Plan

### Phase 5 — Lists Overview v2 (archive & counters)
1. **Partition overview data and controls**
   - Use `useMemo` in `overview-list.tsx` to split `lists` into `activeLists = status !== 'done'` and `doneLists = status === 'done'` *after* applying search filtering so the CTA reflects exactly what the user sees.
   - Default the UI to show only active lists; add a disclosure/toggle (`showDoneSection`) that reveals Done lists on demand (“Done (hidden by default)”) and persist the state via `routes/shopping-lists/index.tsx` search params (`showDone=true|false`) to satisfy `docs/contribute/ui/data_display.md` guidance on sharable filters.
   - Algorithm detail: reuse the existing `filteredLists` memo in `overview-list.tsx`, then derive `activeLists = filteredLists.filter(list => list.status !== 'done')` and `doneLists = filteredLists.filter(list => list.status === 'done')`. Capture summary metadata `{ activeCount: activeLists.length, doneCount: doneLists.length, showDoneState: showDoneSection ? 'expanded' : 'collapsed' }`.
   - Surface counts and status copy per `docs/contribute/ui/data_display.md` via summary bar (`data-testid="shopping-lists.overview.summary"`) and update instrumentation `getReadyMetadata` to merge existing keys with the new `{ activeCount, doneCount, showDoneState }`. When the toggle changes, drive `useUiStateInstrumentation('shoppingLists.overview.filters', { ... })` so Playwright can observe the standard `loading → ready` sequence without waiting on another query fetch.

2. **Mark Done workflow**
   - Add a new confirm hook (e.g., `useListArchiveConfirm`) that wraps `useUpdateShoppingListStatusMutation` with `status: 'done'`, reusing `useConfirm` to show a destructive dialog (“Mark list as Done? This hides it from Active lists.”).
   - In `overview-card.tsx`, render a secondary button (`Mark Done`) only for non-done statuses; disable while mutation pending; ensure `onOpen` still navigates.
   - Update card footer to show `Updated {relativeDate}` with tooltip text for the ISO timestamp to satisfy the “hover help on counts”.
   - Algorithm detail: optimistic UI is avoided; rely on invalidation already in the mutation. After success, reuse `useFormInstrumentation` with `formId = generateFormId('ShoppingListStatus', 'markDone')` so both overview and detail flows emit consistent submit/success events.

3. **Hide Done toggle in list detail**
   - Extend `routes/shopping-lists/$listId.tsx` to accept a new `hideDone` search param (default `true` while the list is `concept`/`ready` to honor the “Hide Done (default on)” requirement for active views, but default `false` once the list status is `done` so archived lists render in full; after a `status: 'done'` mutation rewrite the search params to `hideDone=false` so the archived view never stays hidden behind stale state). Document this assumption from `docs/epics/shopping_list_brief.md` so future work understands why the archive deviates.
   - Host a toggle UI (switch or segmented control) within `ConceptHeader`/`ReadyToolbar` labelled “Hide Done” referencing the phase requirement. Default on, but auto-disable if there are no done lines (per doc guard).
   - Algorithm detail: filter arrays before render: `const visibleLines = hideDone ? lines.filter(line => line.status !== 'done') : lines;` and `const visibleGroups = groups.map({...line: filter...}).filter(group => !hideDone || group.lines.length > 0); const visibleGroupCount = visibleGroups.length;`. When the highlighted/duplicate line is Done, temporarily force `hideDone` to `false` so “View existing line” still works, then restore once dismissed.
   - Update `useListLoadingInstrumentation` metadata to include `{ hideDoneState: hideDone ? 'true' : 'false', visibleLineCount, visibleGroupCount }`, where `visibleGroupCount` mirrors the filtered seller groups when the Ready view is active (else `0`). Mirror the overview pattern by binding `useUiStateInstrumentation('shoppingLists.detail.hideDone', { ... })` to the toggle so Playwright can deterministically capture the post-toggle metadata.

4. **Ready view Mark Done controls**
   - Refactor `ready-toolbar.tsx` into a persistent header that always renders an actions row. Keep the helper copy (“No lines are currently marked Ordered…”) gated behind `canReturnToConcept` so it never shows when the list cannot return to Concept. Layout the new `Mark Done` primary button alongside “Back to Concept” when both actions are available, and collapse to a single-row toolbar with only `Mark Done` when returning is disallowed. Reuse `useConfirm` with copy aligned to `docs/contribute/ui/forms.md` (“Mark list as Done? This hides it from Active lists.”).
   - Invoke `useUpdateShoppingListStatusMutation` with `{ status: 'done' }`, disable the CTA while pending, and ensure toasts/instrumentation mirror the overview workflow (`shoppingliststatus_markdone` success/error events).
   - After successful mutation, keep the user on the detail route, refresh data so the layout reflects the `done` status, and document the behaviour so developers preserve the CTA when new Ready view features arrive.

5. **Overview presentation polish for Phase 5 deliverables**
   - Update `overview-card.tsx` badges to match the statuses defined in the brief (“New”, “Ordered”, “Done”) with consistent Tailwind classes and tooltips summarising meaning.
   - Ensure the Done section header communicates totals (e.g., “Done lists (3)”) and adds a concise description referencing the archive behaviour.
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
   - Add a lightweight guard in `SellerGroupList` to early-return memoized filtered groups; document that virtualization is deferred (“virtualize long tables if needed later; not mandatory now”) and capture a TODO with threshold guidance if lists exceed 200 lines.

5. **Instrumentation updates**
   - Ensure overview instrumentation merges `{ activeCount, doneCount, showDoneState }` into the existing metadata and detail instrumentation includes `{ hideDoneState, visibleLineCount, visibleGroupCount }`. Publish complementary `ui_state` snapshots for the overview (`shoppingLists.overview.filters`) and detail (`shoppingLists.detail.hideDone`) toggles by layering `useUiStateInstrumentation` on each control; trigger `beginUiState` just before updating the toggle state and `endUiState` immediately after with the new metadata so Playwright observes a deterministic loading → ready lifecycle without needing an API refetch.
   - Verify both overview and detail flows emit `shoppingliststatus_markdone` submit/success/error phases through `useFormInstrumentation`, and add regression assertions so Playwright can wait on these events instead of DOM polling.

## Playwright Coverage
1. **Archive list from overview**
   - Extend `tests/e2e/shopping-lists/shopping-lists.spec.ts` to create a concept list, click “Mark Done”, confirm, and expect the card to move into the Done section (hidden until “Show Done lists” toggled).
   - Wait for `waitForUiState(page, 'shoppingLists.overview.filters', 'ready')` and assert metadata includes `{ activeCount: 0, doneCount: 1, showDoneState: 'collapsed' }` before toggling, then `'expanded'` after revealing Done; confirm the router search reflects `showDone=true` once expanded so the setting persists.
   - Assert toast copy (“Marked shopping list…" ) and confirm the delete CTA stays available inside the Done section.

2. **Hide Done toggle in Concept view**
   - Seed a list via factory with one `done` line (`completeLine`) and one active line. Navigate to detail, verify the Done line is hidden while instrumentation metadata reports `{ hideDoneState: 'true', visibleLineCount: 1, visibleGroupCount: 0 }`.
   - Toggle “Hide Done” off, assert both lines render, and check metadata updates to `{ hideDoneState: 'false', visibleLineCount: 2, visibleGroupCount: 0 }` via `waitForUiState(page, 'shoppingLists.detail.hideDone', 'ready')`. Re-enable toggle and ensure the UI auto-unhides when duplicate detection highlights a done line.

3. **Hide Done toggle in Ready view**
   - Create a list with multiple seller groups, mark ready, mark one line done through API, and ensure the Ready view hides Done rows/groups until the toggle is off. Confirm `SellerGroupCard` collapses empty groups to the “No lines remain” row.
   - Validate `shoppingLists.list` instrumentation includes `{ view: 'ready', hideDoneState: 'true', visibleGroupCount: <count> }`.

4. **Mark list done from Ready view**
   - Start from a Ready list with no Ordered lines, click the new “Mark Done” CTA in the toolbar, confirm, and ensure the detail view refreshes in-place with the list status now `done` while overview counters update after navigation back.
   - Wait on `shoppingliststatus_markdone` instrumentation submit/success events and assert the detail instrumentation emits `{ hideDoneState: 'false', visibleLineCount: <count> }` immediately after completion, with overview metadata reflecting `{ activeCount: 0, doneCount: 1, showDoneState: 'collapsed' }` on return (`waitForUiState` against both scopes).
   - Repeat with a Ready list that still has Ordered lines to confirm the mutation remains allowed per `docs/epics/shopping_list_brief.md` and that instrumentation/toasts match the no-Ordered scenario.

5. **Visual chip regression**
   - Add assertions that concept and ready rows emit `data-testid` values for the status badge (`*.status-chip`) and seller chip text, ensuring the polish work remains testable without snapshotting CSS.

6. **Page object & factory support**
   - Update `ShoppingListsPage` helpers for `showDone` toggle, hide-done switch, and mark-done confirm. Add `testData.shoppingLists.markDone(listId)` and `createDoneLine` helpers so tests stay backend-driven (no request interception).

## Phasing
1. **Phase 5 slice** – deliver overview partitioning, mark-done workflow, hide-done toggle with filtering, and baseline Playwright coverage.
2. **Phase 7 slice** – apply polish (chips, tooltips, stable sorting), extend instrumentation metadata, and add regression tests for the visual affordances.

## Blocking Issues
None identified; the existing backend already exposes `status`, `updated_at`, `line_counts`, and status mutation endpoints used by `useUpdateShoppingListStatusMutation`.
