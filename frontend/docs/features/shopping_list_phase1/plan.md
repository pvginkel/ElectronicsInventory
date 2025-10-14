# Shopping List Phase 1 Plan

## Brief Description
- Deliver the Phase 1 “List experience and other polish” scope from `docs/epics/shopping_list_outstanding_work.md` on the React 19 + TanStack Router/Query stack described in `docs/contribute/architecture/application_overview.md`.
- Align overview, part detail, toast, and storage list surfaces with the collection patterns in `docs/contribute/ui/data_display.md` while keeping Playwright automation backend-driven per `docs/contribute/testing/playwright_developer_guide.md`.

## Relevant Files & Modules
- `src/components/ui/toast.tsx`, `src/contexts/toast-context-provider.tsx` – toast duration and lifecycle.
- `tests/support/helpers/toast-helpers.ts` – Playwright helper that observes toast behaviour.
- `src/components/shopping-lists/overview-list.tsx` – list view layout, search, instrumentation.
- `src/components/shopping-lists/overview-card.tsx` – card surface and actions for individual lists.
- `src/routes/shopping-lists/index.tsx`, `src/routes/shopping-lists/$listId.tsx`, `src/components/shopping-lists/concept-header.tsx`, `src/components/shopping-lists/list-delete-confirm.tsx` – routing, breadcrumbs, header actions, delete flows.
- `src/components/parts/part-details.tsx` – part detail header actions and shopping list badges.
- `src/components/boxes/box-list.tsx`, `src/components/boxes/box-card.tsx` – storage list cards and navigation.
- Playwright coverage: `tests/support/page-objects/shopping-lists-page.ts`, `tests/e2e/shopping-lists/shopping-lists.spec.ts` (plus new tab regression test), `tests/support/page-objects/boxes-page.ts`, `tests/e2e/boxes/boxes-list.spec.ts`.

## Implementation Steps

### 1. Toast lifecycle updates
1. Update `src/components/ui/toast.tsx` so `ToastPrimitive.Root` defaults to `15000` ms when `toast.duration` is undefined, keeping `onRemove` callbacks intact for instrumentation.
2. Verify `ToastProvider` in `src/contexts/toast-context-provider.tsx` still passes duration overrides through (no behavioural change required beyond optional constant extraction).
3. In `tests/support/helpers/toast-helpers.ts`, adjust helpers (`expectSuccessToast`, `waitForToastsToDisappear`) to dismiss or close toasts after assertions so the longer auto-close window does not slow the suite.

### 2. Shopping list overview polish
1. Replace the “Active lists (2) • Done lists (3)” banner in `src/components/shopping-lists/overview-list.tsx` with a tab row labelled `Active` / `Completed` (rename all “Done” copy to “Completed”), positioning the tabs between the search input and the summary per the responsive button patterns in `docs/contribute/ui/data_display.md`.
2. Swap `showDoneSection` for an `activeTab` state that persists to `window.localStorage` under a stable key (e.g., `shoppingLists.overview.tab`) with safe guards for server rendering; on mount, hydrate from storage and fall back to “active”.
3. Render a single card grid per tab instead of separate sections, and surface the “Completed lists” grid only when that tab is active.
4. Reintroduce a `shopping-lists.overview.summary` row directly beneath the tabs and style it identically to the storage boxes summary (`flex justify-between items-center text-sm text-muted-foreground mb-6` without borders); show `X shopping lists` when unfiltered and `Y of X shopping lists` when filtered, leaving per-tab counts to the summary copy.
5. Update instrumentation metadata to emit `{ activeTab, activeCount, completedCount }` (renaming prior `doneCount` keys) via both `useListLoadingInstrumentation` and `endUiState`, and adjust downstream consumers/tests to expect the new field names.
6. Change both loading and loaded search placeholders to `"Search..."`, drop the subtitle paragraph beneath the `Shopping Lists` heading, and align padding/margins with the storage list page (same spacing between heading, search, tabs, summary, and grid).
7. Adjust `ShoppingListOverviewCard` so the entire card surface is a clickable/focusable element that triggers `onOpen`; remove the “Open list”, “Delete”, and “Mark Done” buttons, and drop the “? line” badge by omitting the total-lines chip.
8. In `src/components/shopping-lists/overview-card.tsx`, rename the status label for `done` lists to `Completed` so cards follow the new terminology.

### 3. Detail view destructive actions
1. Extend `useListDeleteConfirm` ( `src/components/shopping-lists/list-delete-confirm.tsx` ) with an optional `dialogTestId` so detail and overview confirmations do not share the same identifier; rely on existing list re-fetch + toast instrumentation for Playwright waits, adding explicit form instrumentation only if deterministic waits remain impossible.
2. In `src/routes/shopping-lists/$listId.tsx` (and `src/components/shopping-lists/concept-header.tsx` if needed for layout), add a “Delete list” action that is available in Concept, Ready, and Completed states so delete remains the sole mutation after a list is archived. Reuse the confirm hook, ensure the toast copy remains “Deleted shopping list \"…\"”, and navigate back to the overview after a successful deletion so cached queries refresh.
3. Ensure breadcrumb navigation back to `/shopping-lists` does not clear the stored tab (local storage handles defaulting) and that `ReadyToolbar` remains the sole “Mark Done” affordance while Completed stays otherwise read-only.

### 4. Part detail adjustments
1. In `src/components/parts/part-details.tsx`, move the “Add to shopping list” CTA into the existing actions menu (reuse the `DropdownMenu` so the primary button row only shows `Edit Part`, `Delete Part`, etc.).
2. Update the shopping list chips under the part title to prepend the `ShoppingCart` icon from `lucide-react`, keeping badges and links intact.
3. Confirm instrumentation (`usePartShoppingListMemberships`) and badge loading/error states still render correctly after layout tweaks.

### 5. Storage list interaction changes
1. Refactor `src/components/boxes/box-card.tsx` so the card behaves as a single clickable surface (add keyboard handling) that calls an `onOpen` prop; remove the inline “View”, “Edit”, and “Delete” buttons.
2. Simplify `src/components/boxes/box-list.tsx` by dropping `handleEditBox` / `handleDeleteBox` and related dialog state, wiring each `<BoxCard>`’s `onOpen` to `handleViewBox` so users reach the detail page for edit/delete operations already available there.
3. Confirm list instrumentation (`useListLoadingInstrumentation` scope `boxes.list`) remains unchanged after removing the extra mutations.

### 6. Test and helper updates
1. Update `tests/support/page-objects/shopping-lists-page.ts` to expose helpers for selecting the Active/Completed tabs, to open a list by clicking the card container, and to delete a list from the detail header instead of the overview card.
2. Revise `tests/e2e/shopping-lists/shopping-lists.spec.ts` to use the new helpers, expect “Completed” terminology, assert the updated summary styling/count text (`n shopping lists` / `y of n shopping lists`), and rely on detail-level actions for delete/mark-complete flows. Add a regression that covers the required breadcrumb return: switch to Completed, open a list, navigate back via the breadcrumb, and assert the Completed tab remains active (using `waitForUiState` metadata).
3. Adjust toast expectations in the shopping list specs to call `toastHelper.dismissToast({ all: true })` after assertions so longer auto-close durations do not slow teardown.
4. Update `tests/support/page-objects/boxes-page.ts` and `tests/e2e/boxes/boxes-list.spec.ts` to click the card body for navigation, perform edits/deletes from the detail view (`boxes.detail.edit.*` form IDs), and continue asserting instrumentation events.
5. Ensure any selectors, fixture factories, or test-event assertions (`doneCount`) now reference the renamed `completedCount` metadata field.

## Playwright Coverage
1. **Overview tab persistence:** Seed both Active and Completed lists, switch to the Completed tab, open a list, return via the breadcrumb, and wait for `shoppingLists.overview.filters` to report `{ activeTab: 'completed' }` so the tab state persistence is proven.
2. **Clickable cards & navigation:** From the Active tab, click a card to reach detail, verify `shoppingLists.list` instrumentation, then navigate back and confirm focus and counts remain correct without the old “Open list” button.
3. **Delete from detail:** Delete a list via the new detail action, wait for `shoppingLists.list` to settle and `shoppingLists.overview` ready state showing the decremented `activeCount`/`completedCount`, and assert the success toast closes (no new dialog instrumentation required unless stability issues surface).
4. **Part detail chip styling:** With seeded shopping list memberships, open part detail, invoke the menu entry to add to list (ensuring it still opens the dialog), and assert each badge renders the shopping cart icon alongside the status chip.
5. **Storage card navigation:** On the boxes list, click a card to open detail, perform edit and delete operations from the detail page, and ensure `boxes.list` instrumentation reports ready once the list refreshes.

## Blocking Issues
- None identified; all flows rely on existing API endpoints and instrumentation described in the contributor docs.
