# Shopping List Ready View Frontend Plan

## Brief Description
Implement the frontend scope for **Phase 2 — “Ready” view (seller-centric planning)** now that Phase 1 and the backend endpoints are in place. Deliver the Ready Ordering view that groups lines by seller, surfaces per-seller **Order Note** editing, and enables the **Mark as Ordered** (line) and **Mark group as Ordered** flows that prompt for the **Ordered** quantity (prefill = Needed). Honor the guard that **Update Stock** stays hidden until a line is Ordered and only expose the toolbar **Back to Concept** action when no lines are Ordered. The work must follow `docs/contribute/ui/data_display.md` for list layout, `docs/contribute/ui/forms.md` for dialog ergonomics, and the Playwright practices described in `docs/contribute/testing/`.

## Relevant Files and Functions
- `src/types/shopping-lists.ts`: extend domain models with seller-centric structures (`ShoppingListSellerGroup`, totals, per-seller notes) and helpers that flag when a list can return to Concept.
- `src/hooks/use-shopping-lists.ts`: map `seller_groups`/`seller_notes` from `ShoppingListResponseSchema.46f0cf6`, expose selectors for Ready group data, and wrap generated mutations (`usePostShoppingListLinesOrderByLineId`, `usePostShoppingListsSellerGroupsOrderByListIdAndGroupRef`, `usePutShoppingListsSellerGroupsOrderNoteByListIdAndSellerId`, `usePutShoppingListsStatusByListId`) with scoped cache invalidation and camelCase inputs.
- `src/routes/shopping-lists/$listId.tsx`: refactor the detail route to branch between Concept and Ready layouts, manage dialog state for line/group ordering and seller note editing, trigger the **Back to Concept** status update, and feed augmented metadata into `useListLoadingInstrumentation({ scope: 'shoppingLists.list' })`.
- `src/components/shopping-lists/concept-header.tsx`: generalize the header so status badges, counts, and descriptions render for Ready lists and expose shared summary figures.
- New Ready view components under `src/components/shopping-lists/ready/`:
  - `seller-group-list.tsx` and `seller-group-card.tsx`: render seller groups with aggregated totals, inline editable **Order Note**, and `data-testid="shopping-lists.ready.group.*"` hooks.
  - `ready-line-row.tsx`: table row that shows **Part | Needed | Ordered (editable in Ready) | Received | Note | Status chip | Update Stock**, houses “Mark as Ordered”, “Adjust ordered quantity”, “Revert to New”, and “Edit line” actions, and hides **Update Stock** until `line.status === 'ordered'`.
  - `order-line-dialog.tsx` / `order-group-dialog.tsx`: numeric-input dialogs that collect ordered quantities (prefill = Needed) and drive the respective mutations with `useFormInstrumentation`.
  - `ready-toolbar.tsx`: sticky toolbar exposing **Back to Concept** (disabled while any line is Ordered) and any Ready-only filters.
- `src/components/shopping-lists/concept-line-form.tsx`: allow reuse from Ready view so updating the seller override re-groups the line immediately once the mutation completes.
- `src/components/shopping-lists/mark-ready-footer.tsx`: hide once the list is Ready and refresh toast copy now that Phase 2 ships the actual view.
- Tests
  - `tests/support/page-objects/shopping-lists-page.ts`: add Ready view locators/helpers (`readyRoot`, `readyGroupBySeller`, `markLineOrdered`, `markGroupOrdered`, `backToConcept`) and order-dialog interactions.
  - `tests/e2e/shopping-lists/shopping-lists.spec.ts`: extend scenarios covering Ready grouping, per-line/per-group ordering, seller override regrouping, order-note editing, and the **Back to Concept** guard.
  - `tests/support/helpers/*.ts`: add helpers for waiting on Ready-specific `LIST_LOADING` metadata and the new form instrumentation identifiers.
  - `tests/api/factories/shopping-list-factory.ts`: surface utilities to seed Ordered lines via the real API if UI setup would otherwise be slow (e.g., `markLineOrdered` calling the POST `/order` endpoint).

## Implementation Plan

### Step 1 – Domain modeling & API adapters
1. Extend `ShoppingListDetail` with `sellerGroups: ShoppingListSellerGroup[]`, `sellerOrderNotes`, and helper booleans such as `hasOrderedLines`/`canReturnToConcept`. Map `detail.seller_groups` into objects holding `groupKey`, `sellerId`, `sellerName`, `orderNote`, aggregated `totals`, and the underlying lines (reusing the existing camelCase line model).
2. Update `use-shopping-lists.ts` to expose Ready-specific selectors (`useShoppingListSellerGroups`, memoized `sellerGroupsByKey`) and to enrich `getReadyMetadata` with `{ status, view: status, groupCount: sellerGroups.length, ordered: lineCounts.ordered }` so instrumentation distinguishes Concept vs Ready.
3. Wrap generated mutations in friendly hooks:
   - `useOrderShoppingListLineMutation({ lineId, orderedQuantity })` → POST `/api/shopping-list-lines/{line_id}/order`.
   - `useOrderShoppingListGroupMutation({ listId, groupKey, lines })` → POST `/api/shopping-lists/{list_id}/seller-groups/{groupRef}/order`.
   - `useUpdateSellerOrderNoteMutation({ listId, sellerId, note })` → PUT `/api/shopping-lists/{list_id}/seller-groups/{seller_id}/order-note`.
   - Generalize `useMarkShoppingListReadyMutation` into `useUpdateShoppingListStatusMutation({ status: 'concept' | 'ready' })`.
   Scope cache invalidation to `detailKey(listId)`, `linesKey(listId)`, and `SHOPPING_LISTS_KEY` rather than blanket `invalidateQueries()`, and convert snake_case payloads to camelCase inputs.

### Step 2 – Route refactor & instrumentation
1. Rename the route component to `ShoppingListDetailRoute`, derive `viewMode` from `shoppingList?.status`, and branch between the existing Concept composition and the new Ready composition without changing URL shape.
2. Manage shared dialog state (`lineOrder`, `groupOrder`, `noteEditor`, `lineFormMode`) in the route component. Reuse `ConceptLineForm` for editing lines from Ready view so changing the seller override re-fetches and re-groups the line immediately.
3. Update `useListLoadingInstrumentation` wiring to include Ready metadata and preserve the duplicate-line signal: `metadata => ({ status: viewMode, view: viewMode, groupCount, duplicate: duplicateNotice ? 'present' : 'none' })`. Supply `getAbortedMetadata` so unmounting due to navigation emits an `aborted` event.
4. Implement the toolbar affordance: render **Back to Concept** only when `viewMode === 'ready'` **and** `shoppingList.hasOrderedLines === false`; when rendered, wire the click handler to `updateStatusMutation({ status: 'concept' })` with toast + instrumentation tracking.

### Step 3 – Ready view components & algorithms
1. Create `SellerGroupList` to iterate over seller groups sorted by seller name (with “Ungrouped” last) and render `SellerGroupCard` components. Each card follows the list patterns in `docs/contribute/ui/data_display.md` (header, summary, responsive spacing).
2. Inside `SellerGroupCard`, show seller identity, aggregated totals (`Needed`, `Ordered`, `Received`), and inline **Order Note** editing:
   - Use a `Textarea` controlled by `useFormState`, instrumented via `useFormInstrumentation(formId = ShoppingListSellerOrderNote:<sellerId>)`.
   - Provide explicit Save/Cancel buttons, disable Save when note unchanged, and call `useUpdateSellerOrderNoteMutation`.
   - Skip any automatic note injection; hobbyists will add context manually when they need it.
3. Build `ReadyLineRow` to render the specified columns. Status chip uses `Badge` styling; `Ordered` column pairs the number with an edit icon that opens `OrderLineDialog`. Primary actions:
   - `Mark as Ordered` (visible when `line.status === 'new'`) opens the dialog with ordered quantity defaulting to `line.needed`.
   - `Revert to New` (when `line.isRevertible`) calls the line order mutation with `orderedQuantity = null` to transition back, preserving cases where one seller’s order is firm while another needs rework.
   - `Edit line` reopens `ConceptLineForm` so seller overrides and notes can change, satisfying “Changing Seller override re-groups the line immediately.”
   - Respect the existing guard so **Update Stock** stays hidden for `new` lines but render the real button once `line.status === 'ordered'`, reusing the concept flow without placeholder states.
4. `OrderLineDialog` algorithm:
   - Preload `orderedQty = line.needed`, allow the user to adjust (integer ≥ 0), and on submit call `orderLineMutation` with instrumentation (`ShoppingListLineOrder:line:<id>`). Show success toast (“Marked <part> Ordered”).
   - On success, close dialog, let the mutation refetch detail, and keep track of the line id for highlight animation.
5. `OrderGroupDialog` algorithm:
   - Collect all lines in the group that are not in `status === 'done'`, store editable ordered quantities defaulting to `line.needed`.
   - Validate all inputs (integers ≥ 0). Build payload `{ lines: lines.map(({ id }) => ({ lineId: id, orderedQuantity: quantities[id] })) }` and call `orderGroupMutation`.
   - Instrument with `formId = ShoppingListGroupOrder:group:<groupKey>` and emit toasts summarizing how many lines transitioned.

### Step 4 – Tests & page objects
1. Enhance `ShoppingListsPage` page object:
   - Add `readyRoot = page.getByTestId('shopping-lists.ready.page')`, `readyGroupBySeller(name)`, `readyLineRow(part)`, `markLineOrdered(part, quantity)`, `markGroupOrdered(seller, overrides)`, and `backToConcept()` helpers.
   - Provide `waitForReadyView()` delegating to `waitForListLoading(page, 'shoppingLists.list', 'ready')` and asserting `event.metadata.view === 'ready'`.
   - Wire helpers to interact with new dialogs, filling inputs and waiting for `FormTestEvent` success.
2. Extend `tests/e2e/shopping-lists/shopping-lists.spec.ts` with Ready scenarios using the real backend:
   - Transition coverage: mark a Concept list Ready, wait for Ready instrumentation, and assert seller groups + Back to Concept state.
   - Per-line ordering: run “Mark as Ordered”, verify status chip, ordered quantity, and that Back to Concept disables while any Ordered lines remain.
   - Seller override regrouping + note: edit a line’s seller in Ready view, confirm it moves groups, set an order note, and ensure the note persists after reload.
   - Group ordering: trigger the group dialog, override quantities, submit, and confirm all lines in that group switch to Ordered with updated totals.
   - Return to Concept: revert all lines to New, use Back to Concept, and ensure Concept components render again with Mark Ready available.
   Each test waits on `waitTestEvent<FormTestEvent>` for the new form IDs and never intercepts network requests, adhering to `docs/contribute/testing/playwright_developer_guide.md`.
3. Update shared helpers (`tests/support/helpers/index.ts`, etc.) to expose `waitForReadyList` convenience wrappers and any assertions required for the new instrumentation metadata.

### Step 5 – Copy, toasts, and accessibility polish
1. Update toast messages in the route handlers so success/failure for ordering actions are clear (e.g., “Marked 3 lines Ordered for Synth Supplies”).
2. Restore focus to the triggering button when order/note dialogs close, matching the modal behavior guidelines in `docs/contribute/ui/forms.md`.
3. Add succinct guidepost comments in complex state handlers (highlight timers, form instrumentation wiring) to satisfy the repository’s “Readability Comments” guidance.

## Playwright Coverage
- Concept → Ready transition: create a list with two sellers, mark Ready, wait for `LIST_LOADING(scope='shoppingLists.list', phase='ready')` where `metadata.view === 'ready'`, and assert both seller groups render with the expected Needed/Ordered totals and the toolbar button shows **Back to Concept** enabled.
- Per-line ordering flow: from Ready view run **Mark as Ordered (line)**, wait for `FormTestEvent` submit/success on `ShoppingListLineOrder:line:<id>`, verify the status chip reads Ordered, the **Ordered (editable)** column updates, and the toolbar disables **Back to Concept** while ordered lines exist.
- Mixed seller progression: keep one seller group Ordered while reverting another seller’s line to New, confirm the Ordered group remains locked in, the reverted line is editable again, and the toolbar still blocks **Back to Concept** until all lines return to New.
- Seller override regrouping & note editing: edit a line’s seller override via the shared line form, confirm the row moves to the new seller group, set an **Order Note (editable)**, and validate the note persists via backend data after a reload.
- Group ordering flow: trigger **Mark group as Ordered**, adjust ordered quantities (prefill = Needed), submit, wait for `FormTestEvent` success on `ShoppingListGroupOrder:group:<key>`, and confirm every line in the seller group is now status Ordered with totals refreshed.
- Return to Concept guard: revert ordered lines back to New, ensure the toolbar enables **Back to Concept**, activate it, wait for `LIST_LOADING` metadata `view === 'concept'`, and assert the Concept grid and **Mark “Ready”** footer return.
All scenarios stay backend-driven, rely on documented instrumentation (`useListLoadingInstrumentation`, `useFormInstrumentation`), and avoid `page.route` or mock transport in line with `docs/contribute/testing/playwright_developer_guide.md`.
