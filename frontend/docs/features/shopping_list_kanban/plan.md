# Shopping List Kanban Redesign -- Frontend Technical Plan

## 0) Research Log & Findings

### Searched Areas

- **Route module**: `src/routes/shopping-lists/$listId.tsx` -- orchestrates concept vs ready views, mounts dialogs (OrderLine, OrderGroup, UpdateStock), manages 15+ pieces of state. Consumes `useShoppingListDetail` and renders either `ConceptTable` or `SellerGroupList` depending on `status`. References `useMarkShoppingListReadyMutation`, `useOrderShoppingListLineMutation`, `useRevertShoppingListLineMutation`, `useOrderShoppingListGroupMutation` -- all of which wrap endpoints that have been removed.
- **Domain types**: `src/types/shopping-lists.ts` defines `ShoppingListStatus = 'concept' | 'ready' | 'done'`. The API now sends `'active' | 'done'`. `ShoppingListConceptLine` lacks `sellerLink`. `ShoppingListSellerSummary` lacks `logoUrl`. `ShoppingListSellerGroup` lacks `status` and `completed`.
- **Custom hooks**: `src/hooks/use-shopping-lists.ts` contains mutation hooks for removed endpoints (`useOrderShoppingListLineMutation`, `useRevertShoppingListLineMutation`, `useOrderShoppingListGroupMutation`, `useMarkShoppingListReadyMutation`, `useUpdateSellerOrderNoteMutation`). Also contains `mapSellerGroup` which references `order_note` (now replaced by `note` directly on the group schema) and `mapConceptLine` which omits `sellerLink`.
- **Generated API hooks**: `src/lib/api/generated/hooks.ts` now exports the four new seller group hooks: `usePostShoppingListsSellerGroupsByListId`, `useGetShoppingListsSellerGroupsByListIdAndSellerId`, `usePutShoppingListsSellerGroupsByListIdAndSellerId`, `useDeleteShoppingListsSellerGroupsByListIdAndSellerId`. The removed endpoint hooks (`usePostShoppingListLinesOrderByLineId`, `usePostShoppingListLinesRevertByLineId`, `usePostShoppingListsSellerGroupsOrderByListIdAndGroupRef`, `usePutShoppingListsSellerGroupsOrderNoteByListIdAndSellerId`) are no longer generated.
- **OpenAPI schema**: Confirms `ShoppingListLineUpdateSchema` now accepts `ordered` (integer|null, min 0). Seller group schema includes `status` (ShoppingListSellerStatus: "active"|"ordered", nullable for ungrouped), `completed` (boolean, default false), and `note` (string, default ""). `seller_notes` array is removed from `ShoppingListResponseSchema`. `SellerListSchema` includes `logo_url`. Line responses include `seller_link`.
- **Seller hook**: `src/hooks/use-sellers.ts` wraps `useGetSellers` for searchable lists.
- **Components**: `src/components/shopping-lists/ready/` has `SellerGroupCard`, `SellerGroupList`, `ReadyLineRow`, `UpdateStockDialog`, `OrderLineDialog`, `OrderGroupDialog`, `SellerGroupOrderNoteDialog`. `ConceptTable`, `ConceptLineRow`, `ConceptLineForm`, `ConceptToolbar`, `ReadyToolbar` under `src/components/shopping-lists/`.
- **Cover image**: `CoverImageDisplay` in `src/components/documents/cover-image-display.tsx`.
- **Layout**: `DetailScreenLayout` in `src/components/layout/detail-screen-layout.tsx` provides fixed header + scrollable main.
- **Instrumentation**: `useListLoadingInstrumentation` and `trackForm*` are used extensively. Scope `shoppingLists.list` covers the detail query.
- **Playwright**: Five spec files under `tests/e2e/shopping-lists/`. Factory: `ShoppingListTestFactory` uses removed endpoints (`POST /order`, `POST /revert`, `PUT /status` with `ready`).
- **DnD libraries**: No drag-and-drop library is currently installed.
- **Backend implementation doc**: `backend/docs/features/shopping_list_kanban/backend_implementation.md` -- confirms all endpoint changes, preconditions, and response shapes.

### Key Conflicts Resolved (vs. original plan)

- **Seller group status is `active | ordered`, not `completed: boolean`**: The original plan used `group.completed` as the column mode discriminator. The backend uses `group.status` (active/ordered) for column mode. `completed` is a computed boolean meaning "all lines are DONE" (not "order placed"). Plan now uses `group.status` throughout.
- **No bulk assign-remaining endpoint**: The original plan expected `POST /assign-remaining`. The backend does not implement this. Frontend must call `PUT /api/shopping-list-lines/{line_id}` sequentially for each unassigned line.
- **Line ordering via seller group, not individual lines**: The `POST /order`, `POST /revert`, and `POST /seller-groups/{group_ref}/order` endpoints are all removed. Instead: `PUT /api/shopping-lists/{list_id}/seller-groups/{seller_id}` with `status: "ordered"` or `status: "active"`. The `ordered` quantity is set inline via `PUT /api/shopping-list-lines/{line_id}` with `{ ordered }`.
- **No auto-clear of `ordered` on seller change**: The original plan assumed the backend would clear `ordered` when `seller_id` changes. It does not. Frontend must explicitly send `ordered: 0` alongside `seller_id` change when moving a card off a seller column.
- **Mutation responses return resource, not full list**: Seller group endpoints return `ShoppingListSellerGroupSchema`, line endpoints return `ShoppingListLineResponseSchema`. Frontend must invalidate the full shopping list query cache after mutations.
- **Reopen blocked when any line has `received > 0`**: Frontend must disable "Reopen" in this case.
- **Delete blocked when group is `ordered`**: Frontend must reopen first.
- **`seller_notes` removed from API**: The `sellerOrderNotes` array in `ShoppingListDetail` and related types/hooks/components must be removed. Order notes are now accessed via `group.note`.
- **Order note endpoint removed**: `usePutShoppingListsSellerGroupsOrderNoteByListIdAndSellerId` no longer exists. Order notes are updated via the seller group PUT endpoint.
- **Complete button precondition**: Disabled when any line has `ordered == 0`. Tooltip: "All lines must have an ordered quantity before placing the order."

---

## 1) Intent & Scope

**User intent**

Replace the shopping list detail view's table-based layout with a horizontal Kanban board. Items appear as cards organized into columns: "Unassigned" (leftmost), one column per seller, and a skeleton column (rightmost) for creating new seller columns. Cards are dragged between columns to assign parts to sellers. Seller columns transition between ordering mode (`status: "active"`) and receiving mode (`status: "ordered"`) via the seller group PUT endpoint. The concept/ready status distinction is removed; lists are `active` or `done`.

**Prompt quotes**

- "Kanban board layout replaces the current table-based shopping list detail view"
- "Seller cards (receiving mode, group status 'ordered') show read-only 'ordered' and 'received', a receive button"
- "Inline editing: hover shows border, click activates input with content selected, blur/Enter saves, Escape reverts"
- "Confirmation dialog when moving card with ordered > 0 off seller column; frontend clears ordered to 0 before changing seller"
- "Complete/order button disabled when any line has ordered == 0, with tooltip"
- "Seller group ordering via PUT with status: 'ordered' (atomic, all lines transition)"
- "Remove hooks for deleted endpoints (order line, revert line, order group, mark ready)"

**In scope**

- Kanban board component tree (board, columns, cards, skeleton column)
- Drag-and-drop with `@dnd-kit/core`
- Inline-editable fields (needed, ordered, note)
- Seller column lifecycle (create, order via PUT status, reopen via PUT status, delete, order note via PUT)
- Seller column actions (add part, assign remaining via sequential PUTs, delete column, order note, complete/order, reopen)
- Card rendering per column mode (unassigned, ordering, receiving)
- Status simplification (`active` / `done`) across all affected files
- Extending domain types to include `sellerLink` on lines, `logoUrl` on sellers, `status` and `completed` on seller groups
- Removing hooks and types for deleted endpoints
- Removing `sellerOrderNotes` infrastructure (types, mapping, hooks, components)
- Cache invalidation strategy (invalidate full list after mutations that return single resources)
- Instrumentation for new flows
- Playwright test plan

**Out of scope**

- Backend implementation (already delivered)
- Pick list / printout screen
- Overview (list of lists) screen changes beyond status badge relabeling
- Shopping list creation dialog changes (stays as-is)
- Part-level seller link CRUD UI (managed on part detail screen)

**Assumptions / constraints**

- The backend is fully delivered. All new endpoints are available and the OpenAPI spec is current.
- `seller_link` on line responses and `logo_url` on `SellerListSchema` are already present in the API.
- The generated API hooks for the new seller group CRUD endpoints are already available in `src/lib/api/generated/hooks.ts`.
- The existing `UpdateStockDialog` is reused as-is.
- The existing `ConceptLineForm` dialog is reused for "Add Part" actions.
- The `seller_notes` array and order note endpoints are removed from the API. All order note operations go through seller group PUT.

---

## 1a) User Requirements Checklist

**User Requirements Checklist**

- [ ] Kanban board layout replaces the current table-based shopping list detail view
- [ ] Leftmost "Unassigned" column holds items not assigned to a seller
- [ ] Seller columns appear to the right, one per seller
- [ ] Skeleton column on far right with searchable seller dropdown to create new seller columns
- [ ] Cards show part key (bold), part description (muted, truncated), and part cover image
- [ ] Unassigned cards show editable "needed" field and editable "note" field
- [ ] Note field: 3-line max with ellipsis, expands on hover
- [ ] Seller cards (ordering) additionally show editable "ordered" field (default: em dash "\u2014" when 0)
- [ ] Seller cards show external link icon only when part has a seller link for that column's seller
- [ ] Seller cards (receiving mode, group status "ordered") show read-only "ordered" and "received", a receive button, no needed/note/delete
- [ ] Receive button on receiving-mode cards opens the existing Update Stock dialog
- [ ] Receive button disappears when line reaches "done" status
- [ ] Inline editing: hover shows border, click activates input with content selected, blur/Enter saves, Escape reverts
- [ ] Cards are draggable between columns (entire card is the drag handle)
- [ ] No manual reordering within columns -- cards maintain sort order
- [ ] Drop on background cancels drag (returns card to original position)
- [ ] Cards in "ordered" status cannot be dragged (backend blocks seller change)
- [ ] Confirmation dialog when moving card with ordered > 0 off seller column; frontend clears ordered to 0 before changing seller
- [ ] Ordered amount text is orange (amber-600) when greater than 0 and less than needed, with tooltip explanation
- [ ] Em dash "\u2014" displayed when ordered amount is 0
- [ ] [+] Add Part button on both unassigned and seller column headers
- [ ] Seller column header shows: seller name, seller icon, item count, website link, order note icon, complete/order button
- [ ] Complete/order button disabled when any line has ordered == 0, with tooltip
- [ ] "Assign remaining" action behind \u22ef menu on seller columns (sequential individual PUT calls)
- [ ] "Delete list" action behind \u22ef menu on seller columns (moves non-DONE cards to unassigned, removes column)
- [ ] Ordered seller column: visual indicator in header, cards switch to receiving mode, "Reopen" behind \u22ef menu
- [ ] Reopen disabled when any line has received > 0, with explanatory message
- [ ] Trash icon for card deletion, hidden once line is ordered
- [ ] Horizontal board scroll when columns exceed viewport; scroll by dragging board background
- [ ] Mobile: long-press (600ms) to initiate card drag
- [ ] All columns same fixed width
- [ ] Columns scroll vertically independently
- [ ] Board fills remaining viewport height below header
- [ ] Shopping list status simplified to active | done
- [ ] Seller group ordering via PUT with status: "ordered" (atomic, all lines transition)
- [ ] Seller group reopening via PUT with status: "active" (atomic, all ORDERED lines revert)
- [ ] Remove hooks for deleted endpoints (order line, revert line, order group, mark ready)
- [ ] Cache invalidation after mutations (mutations return resource, not full list)

**Terminology note**: The user requirement "Delete list" (behind the overflow menu on seller columns) means "remove the seller column," not delete the entire shopping list. Throughout this plan, this action is referred to as "Remove seller" to avoid ambiguity.

---

## 2) Affected Areas & File Map

### New Files

- Area: `src/components/shopping-lists/kanban/kanban-board.tsx`
- Why: Top-level board component rendering DndContext, columns, and managing horizontal scroll.
- Evidence: Replaces the `ConceptTable` / `SellerGroupList` branch in `src/routes/shopping-lists/$listId.tsx:792-829`.

- Area: `src/components/shopping-lists/kanban/kanban-column.tsx`
- Why: Renders a single column (unassigned or seller) with header, card list, and vertical scroll.
- Evidence: New component; header content varies by column type as specified in change brief.

- Area: `src/components/shopping-lists/kanban/kanban-card.tsx`
- Why: Renders an individual line card with progressive disclosure depending on column mode (unassigned, ordering, receiving).
- Evidence: Replaces `ConceptLineRow` and `ReadyLineRow` representations.

- Area: `src/components/shopping-lists/kanban/kanban-card-field.tsx`
- Why: Shared inline-edit field component implementing the hover-border/click-edit/blur-save/escape-revert pattern.
- Evidence: Required by change brief: "hover shows border, click activates input with content selected, blur/Enter saves, Escape reverts".

- Area: `src/components/shopping-lists/kanban/kanban-skeleton-column.tsx`
- Why: Renders the "add seller column" skeleton with searchable dropdown.
- Evidence: Change brief: "skeleton column on far right with searchable seller dropdown".

- Area: `src/components/shopping-lists/kanban/kanban-column-header.tsx`
- Why: Column header component with seller name, icon, item count, website link, order note, complete button, and overflow menu.
- Evidence: Change brief specifies distinct header content for unassigned vs seller columns.

- Area: `src/components/shopping-lists/kanban/use-kanban-dnd.ts`
- Why: Custom hook encapsulating DndContext callbacks, drag state, and confirmation dialog logic.
- Evidence: Separating DnD logic from the board component keeps the board focused on layout.

- Area: `src/hooks/use-seller-group-mutations.ts`
- Why: Hook wrapping the four new seller group CRUD endpoints with cache invalidation. Replaces the removed order note mutation hook.
- Evidence: Generated hooks exist at `src/lib/api/generated/hooks.ts:2151-2230`. Project convention: `src/hooks/use-*.ts`.

- Area: `tests/e2e/shopping-lists/kanban-board.spec.ts`
- Why: Primary Playwright spec for the Kanban board flows.
- Evidence: Project convention: `tests/e2e/<feature>/<file>.spec.ts`.

- Area: `tests/e2e/shopping-lists/kanban-drag-drop.spec.ts`
- Why: Dedicated spec for drag-and-drop interactions (move between columns, confirmation dialog, cancel).
- Evidence: DnD tests are complex enough to warrant a separate file.

### Modified Files

- Area: `src/routes/shopping-lists/$listId.tsx`
- Why: Route component replaces the concept/ready content branch with a single `KanbanBoard`. Removes `ConceptToolbar`, `ReadyToolbar`, `OrderLineDialog`, `OrderGroupDialog` orchestration. Removes imports and state for `useMarkShoppingListReadyMutation`, `useOrderShoppingListLineMutation`, `useRevertShoppingListLineMutation`, `useOrderShoppingListGroupMutation`, `orderLineState`, `orderGroupState`. The `handleBackToConcept` handler (setting status to `'concept'`) is removed.
- Evidence: `src/routes/shopping-lists/$listId.tsx:4-26` (imports of removed hooks), `src/routes/shopping-lists/$listId.tsx:165-173` (mutation instantiation), `src/routes/shopping-lists/$listId.tsx:769-829` (content branching).

- Area: `src/types/shopping-lists.ts`
- Why: (1) Update `ShoppingListStatus` from `'concept' | 'ready' | 'done'` to `'active' | 'done'`. (2) Add `sellerLink: string | null` to `ShoppingListConceptLine`. (3) Add `logoUrl: string | null` to `ShoppingListSellerSummary`. (4) Add `status: 'active' | 'ordered' | null` and `completed: boolean` to `ShoppingListSellerGroup`. (5) Remove `ShoppingListSellerOrderNote` interface. (6) Remove `sellerOrderNotes` from `ShoppingListDetail`. (7) Remove `canReturnToConcept` from `ShoppingListDetail`. (8) Remove `ShoppingListMarkReadyInput`, `ShoppingListLineOrderInput`, `ShoppingListGroupOrderInput`, `ShoppingListGroupOrderLineInput`, `ShoppingListSellerOrderNoteInput` types. (9) Remove `conceptCount` and `readyCount` from `ShoppingListMembershipSummary`.
- Evidence: `src/types/shopping-lists.ts:12` (ShoppingListStatus), `src/types/shopping-lists.ts:50-56` (ShoppingListSellerOrderNote), `src/types/shopping-lists.ts:64-75` (ShoppingListSellerGroup), `src/types/shopping-lists.ts:89-96` (ShoppingListDetail), `src/types/shopping-lists.ts:120-124` (ShoppingListSellerSummary), `src/types/shopping-lists.ts:179-200` (ShoppingListConceptLine), `src/types/shopping-lists.ts:167-177` (ShoppingListMembershipSummary), `src/types/shopping-lists.ts:270-300` (removed input types).

- Area: `src/hooks/use-shopping-lists.ts`
- Why: (1) Update `mapConceptLine` to include `sellerLink`. (2) Update `mapSeller` to include `logoUrl`. (3) Update `mapSellerGroup` to include `status` and `completed`, read `note` from group directly (not `order_note`). (4) Remove `mapSellerOrderNote` function and related code. (5) Update `mapShoppingListDetail` to remove `sellerOrderNotes` and `canReturnToConcept`. (6) Remove `useOrderShoppingListLineMutation` (wraps deleted endpoint). (7) Remove `useRevertShoppingListLineMutation` (wraps deleted endpoint). (8) Remove `useOrderShoppingListGroupMutation` (wraps deleted endpoint). (9) Remove `useMarkShoppingListReadyMutation` (wraps concept->ready transition). (10) Remove `useUpdateSellerOrderNoteMutation` (wraps deleted endpoint). (11) Update `useUpdateShoppingListLineMutation`'s `toLineUpdatePayload` to include `ordered` field. (12) Update `DEFAULT_SELECTOR_STATUSES` from `['concept']` to `['active']`. (13) Update `mergeUpdatedLineIntoDetail` to remove `canReturnToConcept` computation.
- Evidence: `src/hooks/use-shopping-lists.ts:147-156` (mapSeller), `src/hooks/use-shopping-lists.ts:178-209` (mapConceptLine), `src/hooks/use-shopping-lists.ts:211-223` (mapSellerOrderNote), `src/hooks/use-shopping-lists.ts:235-259` (mapSellerGroup), `src/hooks/use-shopping-lists.ts:410-440` (mapShoppingListDetail), `src/hooks/use-shopping-lists.ts:623` (DEFAULT_SELECTOR_STATUSES), `src/hooks/use-shopping-lists.ts:833-839` (toLineUpdatePayload), `src/hooks/use-shopping-lists.ts:1315-1499` (useOrderShoppingListLineMutation), `src/hooks/use-shopping-lists.ts:1501-1589` (useRevertShoppingListLineMutation), `src/hooks/use-shopping-lists.ts:1591-1646` (useOrderShoppingListGroupMutation), `src/hooks/use-shopping-lists.ts:1648-1763` (useUpdateSellerOrderNoteMutation), `src/hooks/use-shopping-lists.ts:1833-1857` (useMarkShoppingListReadyMutation).

- Area: `src/components/shopping-lists/detail-header-slots.tsx`
- Why: Remove concept/ready status distinction from badge. Map `'active'` to "Active" label. Remove "Concept" and "Ready" badge states.
- Evidence: `src/components/shopping-lists/detail-header-slots.tsx:45-53` (status badge mapping).

- Area: `src/components/shopping-lists/overview-card.tsx`
- Why: Update status badge labels to reflect simplified statuses.
- Evidence: Consumed by overview list; must align with new status values.

- Area: `src/components/shopping-lists/concept-toolbar.tsx`
- Why: Removed -- the "Mark Ready" button is no longer needed.
- Evidence: `src/routes/shopping-lists/$listId.tsx:769-776`.

- Area: `src/components/shopping-lists/ready/ready-toolbar.tsx`
- Why: Removed or heavily simplified -- "Back to Concept" no longer applies. "Mark Done" moves to the board header area.
- Evidence: `src/routes/shopping-lists/$listId.tsx:778-788`.

- Area: `src/components/shopping-lists/ready/seller-group-order-note-dialog.tsx`
- Why: Removed -- order notes are now edited inline via seller group PUT, not via a dedicated dialog/endpoint.
- Evidence: Component wraps the removed `usePutShoppingListsSellerGroupsOrderNoteByListIdAndSellerId` hook.

- Area: `src/components/shopping-lists/ready/order-line-dialog.tsx`
- Why: Removed -- individual line ordering endpoint no longer exists. Ordered quantity is set inline.
- Evidence: Dialog wraps `useOrderShoppingListLineMutation` which calls deleted `POST /order` endpoint.

- Area: `src/components/shopping-lists/ready/order-group-dialog.tsx`
- Why: Removed -- group ordering endpoint is replaced by seller group PUT with `status: "ordered"`.
- Evidence: Dialog wraps `useOrderShoppingListGroupMutation` which calls deleted `POST /seller-groups/{group_ref}/order` endpoint.

- Area: `tests/api/factories/shopping-list-factory.ts`
- Why: (1) Remove `orderLine` method (calls deleted `POST /order`). (2) Remove `revertLine` method (calls deleted `POST /revert`). (3) Remove `markReady` method (calls deleted `'ready'` status). (4) Add `createSellerGroup` method (calls `POST /seller-groups`). (5) Add `orderSellerGroup` method (calls `PUT /seller-groups/{seller_id}` with `status: "ordered"`). (6) Add `reopenSellerGroup` method (calls `PUT /seller-groups/{seller_id}` with `status: "active"`). (7) Add `deleteSellerGroup` method. (8) Add `updateLine` method (calls `PUT /shopping-list-lines/{line_id}` with `ordered` support). (9) Update `expectConceptMembership` to check for `'active'` status.
- Evidence: `tests/api/factories/shopping-list-factory.ts:107-155` (removed methods).

### Additional Files Affected by Status Simplification (`concept`/`ready` -> `active`)

- Area: `src/hooks/use-kit-memberships.ts`
- Why: Filters memberships by `'concept'` and `'ready'` statuses at lines 116-117. Must use `'active'` after migration. Also: `conceptListIds` at line 120 and `conceptCount` at line 129 must be renamed to `activeListIds` and removed respectively. The `conceptMemberships` and `readyMemberships` local variables (lines 116-117) should be collapsed since both map to `'active'`.
- Evidence: `src/hooks/use-kit-memberships.ts:116-117,120,127,129-130`

- Area: `src/hooks/use-part-shopping-list-memberships.ts`
- Why: Filters memberships by `listStatus === 'concept'` and `listStatus === 'ready'` at lines 87-88. Must use `'active'`. Also: `conceptListIds` at line 91 and `conceptCount` at line 100 must be renamed to `activeListIds` and removed respectively. The `conceptMemberships`/`readyMemberships` filters should be collapsed. The `createEmptySummary` at line 106 also initializes `conceptListIds: []` which must be renamed.
- Evidence: `src/hooks/use-part-shopping-list-memberships.ts:87-88,91,98,100-101,112`

- Area: `src/types/shopping-lists.ts` (ShoppingListMembershipSummary)
- Why: Contains `conceptCount` and `readyCount` fields at lines 174-176. These should be replaced with a single `activeCount` (note: `activeCount` already exists at line 173, so `conceptCount` and `readyCount` should be removed). Also: `conceptListIds: number[]` at line 172 must be renamed to `activeListIds: number[]` since it filters by `listStatus === 'concept'` which no longer exists.
- Evidence: `src/types/shopping-lists.ts:167-177`

- Area: `src/types/kits.ts` (KitShoppingListMembershipSummary)
- Why: Contains `conceptListIds: number[]` at line 98 (mirrors `ShoppingListMembershipSummary`). Must be renamed to `activeListIds` along with removal of `conceptCount`/`readyCount` if present.
- Evidence: `src/types/kits.ts:98`

- Area: `src/components/parts/part-list.tsx`
- Why: Contains a full membership summary computation (lines 125-144) that duplicates `use-part-shopping-list-memberships.ts` logic. The `conceptMemberships`/`readyMemberships` filters at lines 129-130 must use `'active'`, and the local `conceptListIds` at line 132, `conceptCount` at line 141, and `readyCount` at line 142 must all be renamed/removed to match the updated `ShoppingListMembershipSummary` interface.
- Evidence: `src/components/parts/part-list.tsx:125-144`

- Area: `src/components/parts/part-card.tsx`
- Why: Displays status-specific badge colors for `'concept'` and `'ready'` at lines 187-196. Must map `'active'` to the appropriate badge variant.
- Evidence: `src/components/parts/part-card.tsx:187-196`

- Area: `src/components/kits/kit-card.tsx`
- Why: Displays membership status badges with `'concept'` and `'ready'` checks at lines 187-196.
- Evidence: `src/components/kits/kit-card.tsx:187-196`

- Area: `src/components/shopping-lists/shopping-list-link-chip.tsx`
- Why: Maps status values to colors at lines 12-21. Must handle `'active'` instead of `'concept'`/`'ready'`.
- Evidence: `src/components/shopping-lists/shopping-list-link-chip.tsx:12-21`

- Area: `src/components/shopping-lists/shopping-list-selector.tsx`
- Why: Hardcodes `'concept'` as the default status filter and for list creation. Must use `'active'`.
- Evidence: `src/components/shopping-lists/shopping-list-selector.tsx:145,181`

- Area: `src/components/shopping-lists/part/add-to-shopping-list-dialog.tsx`
- Why: Passes `statuses={['concept']}` to the selector. Must use `['active']`.
- Evidence: `src/components/shopping-lists/part/add-to-shopping-list-dialog.tsx:300`

- Area: `src/components/kits/kit-shopping-list-dialog.tsx`
- Why: Hardcodes `['concept']` as the status filter. Must use `['active']`.
- Evidence: `src/components/kits/kit-shopping-list-dialog.tsx:30`

---

## 3) Data Model / Contracts

### Frontend Type Changes

- Entity / contract: `ShoppingListStatus`
- Shape: `type ShoppingListStatus = 'active' | 'done'` (was `'concept' | 'ready' | 'done'`)
- Mapping: Backend now sends `'active'` or `'done'`. No migration layer needed -- the backend migration has already converted all existing lists.
- Evidence: `src/types/shopping-lists.ts:12`, OpenAPI `ShoppingListResponseSchema.46f0cf6.ShoppingListStatus` enum `["active", "done"]`.

- Entity / contract: `ShoppingListSellerStatus` (new type)
- Shape: `type ShoppingListSellerStatus = 'active' | 'ordered'`
- Mapping: Direct from `group.status`. Null for ungrouped bucket.
- Evidence: OpenAPI `ShoppingListResponseSchema.46f0cf6.ShoppingListSellerStatus` enum `["active", "ordered"]`.

- Entity / contract: `ShoppingListConceptLine` (add `sellerLink`)
- Shape: `{ ...existing, sellerLink: string | null }`
- Mapping: `line.seller_link` -> `sellerLink`
- Evidence: `src/types/shopping-lists.ts:179-200`, OpenAPI `seller_link` at line 8931.

- Entity / contract: `ShoppingListSellerSummary` (add `logoUrl`)
- Shape: `{ id, name, website, logoUrl: string | null }`
- Mapping: `seller.logo_url` -> `logoUrl`
- Evidence: `src/types/shopping-lists.ts:120-124`, OpenAPI `SellerListSchema.logo_url` at line 8737.

- Entity / contract: `ShoppingListSellerGroup` (add `status`, `completed`)
- Shape: `{ ...existing, status: ShoppingListSellerStatus | null, completed: boolean }`
- Mapping: `group.status` -> `status`, `group.completed` -> `completed`. `group.note` -> `orderNote` (was `group.order_note?.note`).
- Evidence: `src/types/shopping-lists.ts:64-75`, OpenAPI `ShoppingListSellerGroupSchema` at lines 8996-9074.

- Entity / contract: `ShoppingListDetail` (remove `sellerOrderNotes`, `canReturnToConcept`)
- Shape: Remove `sellerOrderNotes: ShoppingListSellerOrderNote[]` and `canReturnToConcept: boolean` fields.
- Mapping: `sellerOrderNotes` no longer exists in API response. `canReturnToConcept` logic is obsolete (no concept/ready distinction).
- Evidence: `src/types/shopping-lists.ts:89-96`, OpenAPI response schema lacks `seller_notes`.

- Entity / contract: `ShoppingListLineUpdateInput` (add `ordered`)
- Shape: `{ ...existing, ordered: number | null }`
- Mapping: `input.ordered` -> `ordered` in payload.
- Evidence: `src/types/shopping-lists.ts:260-268`, OpenAPI `ShoppingListLineUpdateSchema.d9ccce0.ordered` at line 8198.

### Removed Types

- `ShoppingListSellerOrderNote` -- seller notes are now inline on seller groups.
- `ShoppingListSellerOrderNoteInput` -- order note updates go through seller group PUT.
- `ShoppingListMarkReadyInput` -- concept->ready transition removed.
- `ShoppingListLineOrderInput` -- individual line order endpoint removed.
- `ShoppingListGroupOrderInput` -- group order endpoint removed.
- `ShoppingListGroupOrderLineInput` -- group order endpoint removed.

### New Input Types

- Entity / contract: `SellerGroupCreateInput`
- Shape: `{ listId: number; sellerId: number }`
- Mapping: `{ seller_id }` body to `POST /seller-groups`.
- Evidence: OpenAPI `ShoppingListSellerGroupCreateSchema.57ff967` at line 9124.

- Entity / contract: `SellerGroupUpdateInput`
- Shape: `{ listId: number; sellerId: number; note?: string; status?: 'active' | 'ordered' }`
- Mapping: `{ note?, status? }` body to `PUT /seller-groups/{seller_id}`.
- Evidence: OpenAPI `ShoppingListSellerGroupUpdateSchema.57ff967` at line 9588.

- Entity / contract: `SellerGroupDeleteInput`
- Shape: `{ listId: number; sellerId: number }`
- Mapping: Path params only to `DELETE /seller-groups/{seller_id}`.
- Evidence: OpenAPI at line 15312.

---

## 4) API / Integration Surface

### Existing Endpoints (Unchanged)

- Surface: `PUT /api/shopping-list-lines/{line_id}` (existing, expanded)
- Inputs: `{ needed?: number, ordered?: number | null, seller_id?: number | null, note?: string | null }` (all optional). `ordered` is new.
- Outputs: `ShoppingListLineResponseSchema`. Cache: invalidate detail + lines + overview keys.
- Errors: 404 (not found), 409 (seller change blocked when line is ORDERED; ordered change blocked when line is ORDERED). Toast via global handler.
- Evidence: `src/hooks/use-shopping-lists.ts:1069-1124` (`useUpdateShoppingListLineMutation`), OpenAPI `ShoppingListLineUpdateSchema.d9ccce0` at line 8166.

- Surface: `POST /api/shopping-list-lines/{line_id}/receive` (existing, unchanged)
- Inputs: `{ receive_qty: number, allocations: [...] }`
- Outputs: `ShoppingListLineResponseSchema`. Cache merge via `mergeUpdatedLineIntoDetail`.
- Errors: 400, 404. Toast.
- Evidence: `src/hooks/use-shopping-lists.ts:1177-1244`

- Surface: `POST /api/shopping-list-lines/{line_id}/complete` (existing, unchanged)
- Inputs: `{ mismatch_reason: string | null }`
- Outputs: `ShoppingListLineResponseSchema`. Cache merge.
- Errors: 400, 404. Toast.
- Evidence: `src/hooks/use-shopping-lists.ts:1246-1313`

- Surface: `DELETE /api/shopping-list-lines/{line_id}` (existing, unchanged)
- Inputs: None.
- Outputs: 204. Cache invalidation.
- Errors: 404. Toast.
- Evidence: `src/hooks/use-shopping-lists.ts:1126-1175`

- Surface: `PUT /api/shopping-lists/{list_id}/status` (existing, changed)
- Inputs: `{ status: 'active' | 'done' }` (was `'concept' | 'ready' | 'done'`).
- Outputs: `ShoppingListResponseSchema`.
- Errors: 404. Toast.
- Evidence: `src/hooks/use-shopping-lists.ts:1765-1827`

### New Endpoints

- Surface: `POST /api/shopping-lists/{list_id}/seller-groups` (new)
- Inputs: `{ seller_id: number }`
- Outputs: `ShoppingListSellerGroupSchema`. Cache: invalidate detail key.
- Errors: 404 (list not found), 409 (seller group already exists). Toast.
- Evidence: Generated hook `usePostShoppingListsSellerGroupsByListId` at `src/lib/api/generated/hooks.ts:2151`.

- Surface: `GET /api/shopping-lists/{list_id}/seller-groups/{seller_id}` (new)
- Inputs: Path params only.
- Outputs: `ShoppingListSellerGroupSchema`.
- Errors: 404. Not used for primary data fetch (detail endpoint returns groups), but available for targeted refresh.
- Evidence: Generated hook `useGetShoppingListsSellerGroupsByListIdAndSellerId` at `src/lib/api/generated/hooks.ts:2193`.

- Surface: `PUT /api/shopping-lists/{list_id}/seller-groups/{seller_id}` (new)
- Inputs: `{ note?: string, status?: 'active' | 'ordered' }` (both optional).
- Outputs: `ShoppingListSellerGroupSchema`. Cache: invalidate detail key.
- Errors: 404 (not found), 409 (order: any line has `ordered == 0`; reopen: any line has `received > 0`). Toast.
- Evidence: Generated hook `usePutShoppingListsSellerGroupsByListIdAndSellerId` at `src/lib/api/generated/hooks.ts:2209`.

- Surface: `DELETE /api/shopping-lists/{list_id}/seller-groups/{seller_id}` (new)
- Inputs: Path params only.
- Outputs: 204. Cache: invalidate detail key.
- Errors: 404, 409 (group is `ordered` -- must reopen first). Toast.
- Evidence: Generated hook `useDeleteShoppingListsSellerGroupsByListIdAndSellerId` at `src/lib/api/generated/hooks.ts:2172`.

### Removed Endpoints (hooks to delete)

- `POST /api/shopping-list-lines/{line_id}/order` -- `useOrderShoppingListLineMutation` removed.
- `POST /api/shopping-list-lines/{line_id}/revert` -- `useRevertShoppingListLineMutation` removed.
- `POST /api/shopping-lists/{list_id}/seller-groups/{group_ref}/order` -- `useOrderShoppingListGroupMutation` removed.
- `PUT /api/shopping-lists/{list_id}/seller-groups/{seller_id}/order-note` -- `useUpdateSellerOrderNoteMutation` removed.

---

## 5) Algorithms & UI Flows

### Flow: Drag Card Between Columns

- Flow: User drags a card from one column to another.
- Steps:
  1. User presses and holds on a card (desktop: immediate via PointerSensor; mobile: 600ms long-press via TouchSensor with `activationConstraint: { delay: 600, tolerance: 5 }`).
  2. DndContext `onDragStart`: set `activeCardId` in local state. Card renders a `DragOverlay` clone.
  3. As card moves, `onDragOver` fires. If over a valid column droppable, show a visual drop indicator. Columns register as droppable via `useDroppable`.
  4. `onDragEnd`: determine source and target columns from `active.data` and `over.id`.
     - If target is background (no `over`): cancel -- card returns to original position (no-op).
     - If target column === source column: cancel -- no reorder within columns.
     - If the card's line has `status === 'ordered'`: cancel -- backend blocks seller change on ordered lines.
     - If moving OFF a seller column and `line.ordered > 0`: open confirmation dialog ("The ordered amount will be cleared. Are you sure?").
       - On confirm: call `PUT /api/shopping-list-lines/{line_id}` with `{ seller_id: <target>, ordered: 0 }` (both fields in one request).
       - On cancel: no-op.
     - Otherwise: call `PUT /api/shopping-list-lines/{line_id}` with `{ seller_id: <target seller_id or null> }`.
  5. On mutation success: invalidate detail cache. Board re-renders with card in new column. The refreshed data includes the seller-specific `seller_link` for the new seller (if any). The card's external link icon updates automatically.
- States / transitions: `idle` -> `dragging` -> `confirming` (if ordered > 0 and moving off seller) -> `idle`.
- Hotspots: The confirmation dialog must be non-blocking to the DnD overlay teardown. Store pending move in state, resolve after dialog. The `seller_link` is seller-specific and changes when a card moves between columns -- do not cache it outside the query cache.
- Evidence: New flow; DnD library integration. Backend implementation doc section 5: "No auto-clear of `ordered` when `seller_id` changes."

### Flow: Inline Edit Field

- Flow: User edits a numeric or text field on a card.
- Steps:
  1. Mouse hover: card field shows a subtle border (CSS `group-hover` on the field wrapper).
  2. Click: field transforms from `<span>` to `<input>`. Content is selected via `inputRef.current.select()` in an `onFocus` handler.
  3. User types new value.
  4. Blur or Enter: validate locally, then call `PUT /api/shopping-list-lines/{line_id}` with the changed field:
     - "needed": `{ needed: <value> }`
     - "ordered": `{ ordered: <value> }` (only when line status is `new`)
     - "note": `{ note: <value> }`
  5. Escape: revert to original value, exit edit mode.
  6. On mutation success: invalidate detail cache.
  7. On mutation error: revert displayed value, show toast.
- States / transitions: `display` -> `editing` -> `saving` -> `display`.
- Hotspots: Multiple fields could be editing concurrently on different cards. Each `KanbanCardField` manages its own state independently. The `ordered` field uses the same `PUT /line` endpoint as `needed` and `note`, not a separate order endpoint.
- Evidence: Change brief inline editing specification. Backend implementation doc section 6: "PUT line now accepts ordered."

### Flow: Complete Seller Column (Order Seller Group)

- Flow: User clicks "Complete" / "Order" button on a seller column header.
- Steps:
  1. Frontend pre-check: if any line in the group has `ordered == 0`, the button is disabled with tooltip "All lines must have an ordered quantity before placing the order." No API call.
  2. Call `PUT /api/shopping-lists/{list_id}/seller-groups/{seller_id}` with `{ status: "ordered" }`.
  3. On success: invalidate detail cache. Column header shows visual completion indicator (green styling). Cards in the column switch to receiving mode. The overflow menu gains "Reopen".
  4. On 409 error: toast with backend error message. Column stays in ordering mode.
- States / transitions: Column mode transitions from `ordering` (group.status === 'active') to `receiving` (group.status === 'ordered').
- Hotspots: No optimistic update -- wait for server confirmation since the backend validates all lines have ordered > 0.
- Evidence: Backend implementation doc section 3 (PUT update, status to "ordered" precondition).

### Flow: Reopen Seller Column

- Flow: User clicks "Reopen" in the overflow menu of an ordered seller column.
- Steps:
  1. Frontend pre-check: if any line in the group has `received > 0`, the "Reopen" action is disabled with tooltip "Cannot reopen: some items have already been received."
  2. Call `PUT /api/shopping-lists/{list_id}/seller-groups/{seller_id}` with `{ status: "active" }`.
  3. On success: invalidate detail cache. Column returns to ordering mode. All ORDERED lines revert to NEW.
  4. On 409 error: toast with backend error message.
- States / transitions: Column mode transitions from `receiving` to `ordering`.
- Hotspots: None.
- Evidence: Backend implementation doc section 3 (PUT update, status to "active" precondition).

### Flow: Assign Remaining

- Flow: User selects "Assign remaining" from a seller column's overflow menu.
- Steps:
  1. Identify all lines in the unassigned column (lines with `seller == null` or in the ungrouped bucket).
  2. For each unassigned line, sequentially call `PUT /api/shopping-list-lines/{line_id}` with `{ seller_id: <target seller id> }`.
  3. Track progress: show a loading state on the column header during the operation.
  4. On each success: the card moves to the seller column on next cache refresh.
  5. After all calls complete (or on first failure): invalidate detail cache once.
  6. On any failure: stop sequential processing, show toast with error, invalidate cache to show partial state.
- States / transitions: `idle` -> `assigning` -> `idle`.
- Hotspots: Sequential calls may be slow for many lines. Consider batching the invalidation (invalidate once after all calls, not per-call). Show a spinner/progress indicator during the operation.
- Evidence: Backend implementation doc section 4: "Not implementing bulk endpoint. Frontend uses individual PUT."

### Flow: Receive Line (from Kanban Card)

- Flow: User clicks the receive button on a receiving-mode card.
- Steps:
  1. Set `updateStockState` to `{ open: true, lineId: line.id }`.
  2. Existing `UpdateStockDialog` opens.
  3. User fills allocations, clicks "Save Item" or "Complete Item".
  4. Dialog calls `onSubmit` / `onMarkDone` callbacks (unchanged).
  5. On success: detail cache is invalidated. Card updates to show new received count. If line status becomes `done`, the receive button disappears.
- States / transitions: Reuses existing `UpdateStockDialog` state machine.
- Hotspots: None -- existing dialog is reused.
- Evidence: `src/components/shopping-lists/ready/update-stock-dialog.tsx`

### Flow: Add Seller Column

- Flow: User clicks the skeleton column, searches for a seller, selects one.
- Steps:
  1. Skeleton column renders a searchable dropdown using `useSellersSearch`.
  2. User selects a seller.
  3. Call `POST /api/shopping-lists/{list_id}/seller-groups` with `{ seller_id }`.
  4. On success: invalidate detail cache. New column appears with status `active`.
  5. Skeleton column resets for the next selection.
  6. On 409 (seller group already exists): show toast error.
- States / transitions: `idle` -> `searching` -> `creating` -> `idle`.
- Hotspots: Seller dropdown should exclude sellers that already have columns.
- Evidence: Backend implementation doc section 3 (POST create).

### Flow: Delete Seller Column (Remove Seller)

- Flow: User selects "Delete list" / "Remove seller" from the overflow menu.
- Steps:
  1. Frontend pre-check: if group status is `ordered`, the action is disabled with tooltip "Cannot remove an ordered seller group. Reopen it first."
  2. Show confirmation dialog: "Remove seller column? Non-completed items will be moved to Unassigned."
  3. On confirm: call `DELETE /api/shopping-lists/{list_id}/seller-groups/{seller_id}`.
  4. On success (204): invalidate detail cache. Column disappears. Non-DONE lines appear in Unassigned. DONE lines are preserved (not moved).
  5. On 409 error: toast with error message.
- States / transitions: `idle` -> `confirming` -> `deleting` -> `idle`.
- Hotspots: None.
- Evidence: Backend implementation doc section 3 (DELETE, precondition: not ordered, DONE lines preserved).

### Flow: Update Order Note

- Flow: User clicks the order note icon on a seller column header.
- Steps:
  1. Open an inline popover or small dialog for editing the note.
  2. On save: call `PUT /api/shopping-lists/{list_id}/seller-groups/{seller_id}` with `{ note: <text> }`.
  3. On success: invalidate detail cache. Note icon updates (dot indicator if note is non-empty).
- States / transitions: `idle` -> `editing` -> `idle`.
- Hotspots: None.
- Evidence: Backend implementation doc section 3 (PUT update with `note` field).

### Flow: Board Horizontal Scroll

- Flow: User scrolls the board horizontally when columns exceed viewport.
- Steps:
  1. Board container has `overflow-x: auto` with `display: flex`.
  2. User can scroll via mouse wheel (horizontal scroll or shift+wheel), trackpad, or by dragging the board background.
  3. During DnD: auto-scroll near edges implemented via `@dnd-kit/core`'s built-in `autoScroll` configuration.
- States / transitions: CSS-driven, no React state for scroll position. Background drag-to-scroll uses local pointer tracking state: track `pointerdown` on the board, compute delta on `pointermove`, apply `scrollLeft += deltaX`, clean up on `pointerup`.
- Hotspots: Background drag-to-scroll does not conflict with `@dnd-kit` because `useDraggable` only activates when a drag handle element (a card) receives the pointer event.
- Evidence: Change brief: "Horizontal board scroll when columns exceed viewport; scroll by dragging board background".

---

## 6) Derived State & Invariants

- Derived value: `columnMode` per seller group
  - Source: `group.status` field from backend (`'active' | 'ordered' | null`).
  - Writes / cleanup: Determines card rendering variant (unassigned/ordering/receiving). No writes.
  - Guards: If `group.sellerId == null` (ungrouped bucket), mode is always `unassigned`. If `group.status === 'ordered'`, mode is `receiving`. If `group.status === 'active'`, mode is `ordering`.
  - Invariant: A column's mode must be derived solely from backend state (specifically `group.status`), never from local UI state, to survive page refreshes. The `completed` boolean means "all lines are DONE" and is separate from `status`.
  - Evidence: OpenAPI `ShoppingListSellerStatus` enum at line 9107. Backend implementation doc section 1.

- Derived value: `unassignedLines`
  - Source: Lines in the seller group where `group.sellerId == null` (the ungrouped bucket).
  - Writes / cleanup: Drives the "Unassigned" column content.
  - Guards: Must re-derive when lines or seller groups change in the query cache.
  - Invariant: Every line must appear in exactly one column. A line with `seller_id` set to a seller that has a column appears in that seller's column; otherwise it appears in "Unassigned".
  - Evidence: `src/hooks/use-shopping-lists.ts:235-259` (mapSellerGroup already groups by seller).

- Derived value: `canCompleteColumn` per seller group
  - Source: `group.status === 'active'` AND every line in the group has `ordered > 0`.
  - Writes / cleanup: Controls "Complete" button enabled state.
  - Guards: If any line has `ordered == 0`, the button is disabled with tooltip "All lines must have an ordered quantity before placing the order."
  - Invariant: The backend enforces this as a 409 precondition, but the frontend should prevent the call entirely.
  - Evidence: Backend implementation doc section 3 (PUT status to "ordered" precondition).

- Derived value: `canReopenColumn` per seller group
  - Source: `group.status === 'ordered'` AND no line in the group has `received > 0`.
  - Writes / cleanup: Controls "Reopen" action enabled state.
  - Guards: If any line has `received > 0`, the action is disabled with tooltip "Cannot reopen: some items have already been received."
  - Invariant: The backend enforces this as a 409, but the frontend provides proactive UX.
  - Evidence: Backend implementation doc section 3 (PUT status to "active" precondition).

- Derived value: `orderedAmountWarning` per card
  - Source: `line.ordered > 0 && line.ordered < line.needed`.
  - Writes / cleanup: Drives amber-600 text color and tooltip on ordered amount.
  - Guards: Only shown when ordered > 0. When ordered == 0, display em dash "\u2014" instead.
  - Invariant: Warning must reflect current line data from query cache, not stale pre-edit values.
  - Evidence: Change brief: "Ordered amount text is orange (amber-600) when greater than 0 and less than needed."

- Derived value: `availableSellersForSkeleton`
  - Source: All sellers from `useSellersSearch` minus sellers already represented as columns.
  - Writes / cleanup: Drives the skeleton column dropdown options.
  - Guards: Must exclude sellers that already have a column in the current list.
  - Invariant: A seller cannot have two columns.
  - Evidence: New derivation.

- Derived value: `canDeleteCard` per card
  - Source: `line.status === 'new'` (line has not been ordered via seller group ordering and is not completed).
  - Writes / cleanup: Controls trash icon visibility.
  - Guards: Once a line reaches `ordered` status (via seller group ordering), trash disappears. In receiving mode columns, trash is never shown. Once status is `done`, also hidden.
  - Invariant: Deletion must not be possible for lines with status `ordered` or `done`.
  - Evidence: Change brief: "Trash icon for card deletion, hidden once line is ordered."

- Derived value: `canDragCard` per card
  - Source: `line.status !== 'ordered'`.
  - Writes / cleanup: Controls whether the card is draggable.
  - Guards: Cards in `ordered` status cannot be dragged because the backend blocks seller change on ORDERED lines (409).
  - Invariant: A card must not be draggable if its line status is `ordered`.
  - Evidence: Change brief: "Cards in 'ordered' status cannot be dragged." Backend implementation doc section 5.

---

## 7) State Consistency & Async Coordination

- Source of truth: TanStack Query cache keyed by `['getShoppingListsByListId', { path: { list_id } }]`.
- Coordination: All mutations invalidate the detail key. The `mapShoppingListDetail` function derives `sellerGroups`, `lines`, and `lineCounts` from the raw API response. The Kanban board reads from `useShoppingListDetail` and groups lines into columns via the already-computed `sellerGroups` array. Seller group mutations (create, update, delete) return `ShoppingListSellerGroupSchema` -- the frontend does NOT try to merge this partial response into the cache; it simply invalidates the detail key and lets the full refetch provide the consistent board state.
- Async safeguards: DnD operations that trigger mutations add the line ID to `pendingLineIds` and disable the card until the mutation resolves. The confirmation dialog for "move off seller with ordered > 0" stores the pending move in component state and only fires the mutation on confirm. If the mutation fails, the card stays in its original position (no optimistic update for DnD moves). For "assign remaining", all sequential mutations run before a single cache invalidation, with early termination on first failure.
- Instrumentation: Emit `form` events for inline edits (`KanbanCard:needed`, `KanbanCard:ordered`, `KanbanCard:note`), `ui_state` events for DnD moves (`kanban.card.move`), seller group lifecycle events (`kanban.column.complete`, `kanban.column.reopen`), and list-loading events for the board data (`shoppingLists.kanban`).
- Evidence: `src/hooks/use-shopping-lists.ts:92-104` (cache keys), `src/routes/shopping-lists/$listId.tsx:195-209` (list loading instrumentation).

---

## 8) Errors & Edge Cases

- Failure: DnD move mutation fails (network error or 409 conflict).
- Surface: `KanbanBoard` (via toast).
- Handling: Card remains in its original column (no optimistic update was applied). Toast shows error message. `pendingLineIds` clears the line so it becomes interactive again.
- Guardrails: No optimistic update for moves; server-authoritative position.
- Evidence: Pattern from existing mutation hooks.

- Failure: DnD move of card with `ordered > 0` -- user confirms but `PUT` returns 409 (line became ORDERED during drag).
- Surface: `KanbanBoard` confirmation dialog flow.
- Handling: Toast with backend error. Card stays in original column.
- Guardrails: Card draggability is derived from `line.status !== 'ordered'`, but race conditions are possible if seller group is ordered between drag start and drop.
- Evidence: Backend implementation doc section 5.

- Failure: Inline edit save fails (network error, 409 ordered field locked).
- Surface: `KanbanCardField` component.
- Handling: Revert displayed value to the pre-edit value stored in component state. Show toast with error message.
- Guardrails: Input validation (needed >= 1, ordered >= 0, note <= 500 chars) prevents most client-side issues. The `ordered` field is only editable when `line.status === 'new'`; if the line becomes ORDERED mid-edit, the backend 409 is caught and reverted.
- Evidence: Pattern from `ConceptLineForm` validation rules (`src/components/shopping-lists/concept-line-form.tsx:88-116`).

- Failure: Complete seller column rejected (any line has `ordered == 0`).
- Surface: Seller column header.
- Handling: Frontend pre-check disables the button with tooltip. If somehow called, toast with 409 error.
- Guardrails: Derived `canCompleteColumn` check. Backend validates as 409.
- Evidence: Backend implementation doc section 3.

- Failure: Reopen seller column rejected (any line has `received > 0`).
- Surface: Seller column overflow menu.
- Handling: Frontend pre-check disables the action with tooltip "Cannot reopen: some items have already been received." If somehow called, toast with 409 error.
- Guardrails: Derived `canReopenColumn` check. Backend validates as 409.
- Evidence: Backend implementation doc section 3.

- Failure: Delete seller column rejected (group is `ordered`).
- Surface: Seller column overflow menu.
- Handling: Frontend disables "Remove seller" when `group.status === 'ordered'` with tooltip "Cannot remove an ordered seller group. Reopen it first."
- Guardrails: Frontend check + backend 409.
- Evidence: Backend implementation doc section 3.

- Failure: Seller already has a column (409 from create seller group).
- Surface: Skeleton column dropdown.
- Handling: Toast with "This seller already has a column." Dropdown resets.
- Guardrails: Dropdown filters out sellers that already have columns (derived state).
- Evidence: Backend implementation doc section 3.

- Failure: Assign remaining -- one of the sequential PUTs fails.
- Surface: Seller column overflow menu.
- Handling: Stop processing remaining lines. Show toast with error. Invalidate cache to show partial progress.
- Guardrails: Progress indicator during operation.
- Evidence: Backend implementation doc section 4.

- Failure: Empty shopping list (no lines).
- Surface: `KanbanBoard`.
- Handling: Show empty state inside the Unassigned column: "No items yet -- use [+] Add Part to get started." Seller columns and skeleton column are still shown.
- Guardrails: N/A.
- Evidence: Current empty state in `ConceptTable` (`src/components/shopping-lists/concept-table.tsx:147-152`).

- Failure: List is in "done" status.
- Surface: All columns and cards.
- Handling: Board is read-only. No DnD, no inline editing, no column actions. Cards show data but no interactive elements. Header shows "Completed" badge.
- Guardrails: `isCompleted` flag disables all mutation paths.
- Evidence: Current pattern in `$listId.tsx:753-754`.

---

## 9) Observability / Instrumentation

- Signal: `shoppingLists.kanban` (list loading)
- Type: `list_loading` instrumentation event
- Trigger: `useListLoadingInstrumentation` in the route component, tracking detail query loading/fetching/error.
- Labels / fields: `{ status, lineCount, groupCount, columnCount, hasOrderedGroups, sortKey }`
- Consumer: Playwright `waitForListLoading(page, 'shoppingLists.kanban', 'ready')`
- Evidence: `src/routes/shopping-lists/$listId.tsx:195-209` (existing `shoppingLists.list` scope; rename to `shoppingLists.kanban`).

- Signal: `KanbanCard:needed` / `KanbanCard:ordered` / `KanbanCard:note` (form instrumentation)
- Type: `form` test event (submit/success/error phases)
- Trigger: `trackFormSubmit` / `trackFormSuccess` / `trackFormError` on inline edit save.
- Labels / fields: `{ lineId, listId, field, value }`
- Consumer: Playwright `waitTestEvent(page, 'form', evt => evt.formId.startsWith('KanbanCard:'))`
- Evidence: Pattern from `src/routes/shopping-lists/$listId.tsx:247-253`.

- Signal: `kanban.card.move` (ui_state event)
- Type: `ui_state` test event
- Trigger: `emitTestEvent` on DnD move initiation and completion.
- Labels / fields: `{ scope: 'kanban.card.move', phase: 'submit' | 'success' | 'error' | 'cancelled', lineId, fromColumn, toColumn }`
- Consumer: Playwright `waitForUiState(page, 'kanban.card.move', 'success')`
- Evidence: Pattern from `src/routes/shopping-lists/$listId.tsx:51-53` (kit unlink flow).

- Signal: `kanban.column.complete` (ui_state event)
- Type: `ui_state` test event
- Trigger: On seller group PUT with `status: "ordered"` or `status: "active"`.
- Labels / fields: `{ scope: 'kanban.column.complete', phase: 'submit' | 'success' | 'error', sellerId, action: 'order' | 'reopen' }`
- Consumer: Playwright `waitForUiState(page, 'kanban.column.complete', 'success')`
- Evidence: New signal.

- Signal: `kanban.column.create` (ui_state event)
- Type: `ui_state` test event
- Trigger: On seller group POST.
- Labels / fields: `{ scope: 'kanban.column.create', phase: 'submit' | 'success' | 'error', sellerId }`
- Consumer: Playwright `waitForUiState(page, 'kanban.column.create', 'success')`
- Evidence: New signal.

- Signal: `kanban.assignRemaining` (ui_state event)
- Type: `ui_state` test event
- Trigger: On assign remaining flow start/completion.
- Labels / fields: `{ scope: 'kanban.assignRemaining', phase: 'submit' | 'success' | 'error', sellerId, lineCount }`
- Consumer: Playwright `waitForUiState(page, 'kanban.assignRemaining', 'success')`
- Evidence: New signal.

- Signal: `data-testid` attributes
- Type: DOM attributes for Playwright selectors
- Trigger: Render-time.
- Labels / fields:
  - Board: `shopping-lists.kanban.board`
  - Column: `shopping-lists.kanban.column.{groupKey}`
  - Column header: `shopping-lists.kanban.column.{groupKey}.header`
  - Card: `shopping-lists.kanban.card.{lineId}`
  - Card field: `shopping-lists.kanban.card.{lineId}.field.{fieldName}`
  - Card trash: `shopping-lists.kanban.card.{lineId}.delete`
  - Card seller link: `shopping-lists.kanban.card.{lineId}.seller-link`
  - Card receive button: `shopping-lists.kanban.card.{lineId}.receive`
  - Skeleton column: `shopping-lists.kanban.skeleton-column`
  - Add Part button: `shopping-lists.kanban.column.{groupKey}.add-part`
  - Complete button: `shopping-lists.kanban.column.{groupKey}.complete`
  - Overflow menu: `shopping-lists.kanban.column.{groupKey}.menu`
  - Order note icon: `shopping-lists.kanban.column.{groupKey}.order-note`
- Consumer: All Playwright specs.
- Evidence: Project naming convention (`feature.section.element`).

---

## 10) Lifecycle & Background Work

- Hook / effect: `useListLoadingInstrumentation` for board data
- Trigger cadence: On mount, on query refetch, on background revalidation.
- Responsibilities: Emits `list_loading` events with board metadata.
- Cleanup: Instrumentation hook manages its own lifecycle via React Query state changes.
- Evidence: `src/routes/shopping-lists/$listId.tsx:195-209`.

- Hook / effect: DnD auto-scroll cleanup
- Trigger cadence: Active during drag operations.
- Responsibilities: `@dnd-kit/core`'s `DndContext` manages scroll timers internally.
- Cleanup: DndContext unmount cleans up all timers and listeners.
- Evidence: `@dnd-kit/core` documentation.

- Hook / effect: Inline edit focus management
- Trigger cadence: On click (enter edit mode), on blur/keydown (exit edit mode).
- Responsibilities: `KanbanCardField` manages a ref to the input element and calls `.select()` on focus.
- Cleanup: No timers. Blur handler saves or reverts.
- Evidence: New component.

- Hook / effect: Highlight timer
- Trigger cadence: After successful mutation, `setHighlightedLineId(lineId)` triggers a 4-second timer to clear the highlight.
- Responsibilities: Provides visual feedback on which card was just modified.
- Cleanup: `clearTimeout` on unmount or when highlight changes.
- Evidence: `src/routes/shopping-lists/$listId.tsx:176-182` (existing pattern).

- Hook / effect: Board background drag-to-scroll
- Trigger cadence: On `pointerdown` on the board container (not on a card).
- Responsibilities: Track pointer movement, apply `scrollLeft += deltaX` on `pointermove`, clean up on `pointerup`.
- Cleanup: Remove `pointermove` and `pointerup` listeners on cleanup.
- Evidence: Change brief: "scroll by dragging board background".

---

## 11) Security & Permissions

- Concern: Read-only enforcement for completed ("done") lists.
- Touchpoints: `KanbanBoard` (disables DnD), `KanbanCard` (hides edit/delete controls), `KanbanColumnHeader` (hides action buttons).
- Mitigation: `isCompleted` prop derived from `shoppingList.status === 'done'` is threaded through all interactive components. Backend enforces status constraints on mutations as an additional safeguard.
- Residual risk: None -- same pattern as current implementation.
- Evidence: `src/routes/shopping-lists/$listId.tsx:753-754`.

---

## 12) UX / UI Impact

- Entry point: `/shopping-lists/$listId` route.
- Change: Entire detail view body switches from table layout to horizontal Kanban board.
- User interaction: Users see columns instead of tables. They drag cards between columns to assign parts to sellers. Inline editing replaces form dialogs for simple fields (needed, ordered, note). The "Add Part" button appears on column headers. Seller columns can be ordered (entering receiving mode) and reopened.
- Dependencies: `@dnd-kit/core` for DnD context and drag overlay, `@dnd-kit/utilities` for CSS transform helpers. The existing `UpdateStockDialog`, `ConceptLineForm`, `ConfirmDialog` are reused. `@dnd-kit/sortable` is not needed since there is no within-column reordering.
- Evidence: Change brief specification.

- Entry point: Column layout.
- Change: All columns are fixed-width (`w-80` / 320px), scroll vertically independently (`overflow-y: auto`), and the board scrolls horizontally (`overflow-x: auto`). Board fills remaining viewport height below the detail header (`flex-1 min-h-0`).
- User interaction: Horizontal scrolling via mouse wheel, trackpad, or dragging board background. Each column scrolls its cards independently.
- Dependencies: CSS flexbox layout; no additional library.
- Evidence: Change brief: "All columns same fixed width", "Columns scroll vertically independently", "Board fills remaining viewport height below header".

- Entry point: Card design (progressive disclosure).
- Change: Unassigned cards: cover image, part key (bold), description (muted, truncated), editable needed, editable note (3-line clamp with expand on hover via CSS `group-hover` removing `line-clamp-3`), trash icon. Seller ordering cards: same plus editable ordered field (em dash "\u2014" when 0, amber-600 when 0 < ordered < needed), external link icon (when seller link exists). Seller receiving cards: cover image, part key, description, read-only ordered, read-only received, receive button (disappears when line is done).
- User interaction: Hover reveals edit borders. Click to edit. External link icon opens seller page in new tab. Receive button opens UpdateStockDialog. Trash icon deletes line (with confirmation on ready-state lines).
- Dependencies: `CoverImageDisplay` (existing), lucide-react icons.
- Evidence: Change brief card design specification.

---

## 13) Deterministic Test Plan

### Spec: Board Rendering

- Surface: Kanban board initial render.
- Scenarios:
  - Given a shopping list with 3 unassigned lines, When the detail page loads, Then the board shows an "Unassigned" column with 3 cards and a skeleton column.
  - Given a shopping list with lines assigned to 2 sellers (via `createSellerGroup` + line assignment), When the page loads, Then 3 columns appear (Unassigned + 2 sellers) plus skeleton column.
  - Given a completed ("done") shopping list, When the page loads, Then all columns are read-only (no drag handles, no edit icons, no action buttons).
- Instrumentation / hooks: Wait on `waitForListLoading(page, 'shoppingLists.kanban', 'ready')`. Assert card count via `data-testid` selectors.
- Gaps: None.
- Evidence: New spec.

### Spec: Card Visual Elements

- Surface: Card rendering details (cover image, seller link icon, note truncation, trash icon, ordered amount styling).
- Scenarios:
  - Given a line whose part has a cover image, When the board loads, Then the card displays a cover image thumbnail.
  - Given a seller-column card where the part has a seller link for that seller, When the board loads, Then an external link icon is visible on the card.
  - Given a seller-column card where the part has no seller link for that seller, When the board loads, Then no external link icon is shown.
  - Given a card with a note longer than 3 lines, When the board loads, Then the note is truncated with ellipsis. On hover, the full note is visible inline.
  - Given an unassigned card with status "new", When the board loads, Then a trash icon is visible.
  - Given a seller ordering card with ordered > 0 and ordered < needed, When the board loads, Then ordered text is amber-600 colored and has a tooltip.
  - Given a seller ordering card with ordered == 0, When the board loads, Then em dash "\u2014" is displayed instead of "0".
  - Given a receiving-mode card, When the board loads, Then no trash icon is visible, receive button is shown, no edit affordances.
  - Given a receiving-mode card with status "done", When the board loads, Then no receive button is shown.
- Instrumentation / hooks: Wait on `waitForListLoading(page, 'shoppingLists.kanban', 'ready')`. Use `data-testid` selectors.
- Gaps: None.
- Evidence: New spec.

### Spec: Drag and Drop

- Surface: Card movement between columns.
- Scenarios:
  - Given an unassigned card, When dragged to a seller column, Then the card appears in the seller column after data reloads, and `kanban.card.move` ui_state event fires with phase `success`.
  - Given a seller card with ordered > 0 (status still `new`), When dragged to "Unassigned", Then a confirmation dialog appears. On confirm, card moves and ordered resets to 0. On cancel, card stays.
  - Given a card being dragged, When dropped on the board background (not a column), Then card returns to original position (no mutation fired).
  - Given a card with line status `ordered`, Then the card is not draggable (no drag interaction starts).
- Instrumentation / hooks: `waitForUiState(page, 'kanban.card.move', 'success')`, confirmation dialog `data-testid`. Use Playwright DnD helpers.
- Gaps: Mobile long-press DnD testing deferred to manual QA (Playwright does not reliably simulate touch long-press with DnD libraries).
- Evidence: New spec.

### Spec: Inline Editing

- Surface: Editable fields on cards.
- Scenarios:
  - Given an unassigned card, When the user clicks the "needed" value, Then an input appears with value selected. On typing "5" and pressing Enter, the field saves and form instrumentation fires.
  - Given a seller ordering card, When the user clicks the ordered field (showing "\u2014"), Then input appears. On typing "3" and pressing Enter, the ordered value updates and shows "3".
  - Given a seller ordering card where needed=5 and ordered=3, When the board renders, Then ordered text is amber-600.
  - Given an editing field, When the user presses Escape, Then the field reverts to its original value without saving.
  - Given a receiving-mode card, When the user views it, Then ordered and received are read-only text (no edit affordance on hover).
- Instrumentation / hooks: `waitTestEvent(page, 'form', evt => evt.formId === 'KanbanCard:needed' && evt.phase === 'success')`.
- Gaps: None.
- Evidence: New spec.

### Spec: Seller Column Lifecycle

- Surface: Complete (order) / Reopen seller column.
- Scenarios:
  - Given a seller column where all lines have ordered > 0, When the user clicks "Complete", Then the column header shows completion indicator and cards switch to receiving mode.
  - Given a seller column where one line has ordered == 0, When the user views it, Then the "Complete" button is disabled with tooltip.
  - Given an ordered seller column with no received items, When the user opens the overflow menu and clicks "Reopen", Then the column returns to ordering mode.
  - Given an ordered seller column where one line has received > 0, When the user opens the overflow menu, Then "Reopen" is disabled with explanatory message.
  - Given a receiving-mode card with status "ordered", When the user clicks the receive button, Then the UpdateStockDialog opens. After completing, the receive button disappears if line status is "done".
- Instrumentation / hooks: `waitForUiState(page, 'kanban.column.complete', 'success')`. Wait for list loading ready after reopen.
- Gaps: None.
- Evidence: New spec.

### Spec: Skeleton Column (Add Seller Column)

- Surface: Creating new seller columns.
- Scenarios:
  - Given a list with no seller columns, When the user clicks the skeleton column and selects a seller, Then a new seller column appears.
  - Given sellers A and B already have columns, When the user opens the skeleton dropdown, Then A and B are not listed.
- Instrumentation / hooks: `waitForUiState(page, 'kanban.column.create', 'success')`. Wait for list loading ready after column creation.
- Gaps: None.
- Evidence: New spec.

### Spec: Column Actions

- Surface: Overflow menu actions on seller columns.
- Scenarios:
  - Given 3 unassigned cards and a seller column, When the user selects "Assign remaining" from the overflow menu, Then all 3 cards move to the seller column.
  - Given a seller column (status `active`) with 2 cards, When the user selects "Remove seller" from the overflow menu and confirms, Then both non-DONE cards return to Unassigned and the column disappears.
  - Given an ordered seller column, When the user opens the overflow menu, Then "Remove seller" is disabled with tooltip.
- Instrumentation / hooks: `waitForUiState(page, 'kanban.assignRemaining', 'success')`. Wait for list loading ready after each action.
- Gaps: None.
- Evidence: New spec.

### Spec: Add Part

- Surface: [+] Add Part button on column headers.
- Scenarios:
  - Given the Unassigned column, When the user clicks [+] Add Part, Then the ConceptLineForm dialog opens. On submit, a new card appears in the Unassigned column.
  - Given a seller column for seller X, When the user clicks [+] Add Part, Then the ConceptLineForm dialog opens with seller pre-set to X. On submit, the card appears in seller X's column.
- Instrumentation / hooks: Wait for form success event.
- Gaps: None.
- Evidence: Reuses existing `ConceptLineForm` dialog.

### Spec: Order Note

- Surface: Order note editing on seller column header.
- Scenarios:
  - Given a seller column with no note, When the user clicks the order note icon and types a note and saves, Then the note is persisted and the note icon shows a dot indicator.
  - Given a seller column with an existing note, When the user clears the note and saves, Then the dot indicator disappears.
- Instrumentation / hooks: Wait for form success event.
- Gaps: None.
- Evidence: New spec.

---

## 14) Implementation Slices

- Slice: 1 -- Status Simplification & Type Cleanup
- Goal: Update `ShoppingListStatus` to `'active' | 'done'`, remove `concept`/`ready` references across all affected files. Remove obsolete types (`ShoppingListSellerOrderNote`, `ShoppingListMarkReadyInput`, etc.). This is a prerequisite for all other slices.
- Touches: `src/types/shopping-lists.ts`, `src/types/kits.ts`, `src/hooks/use-shopping-lists.ts`, `src/hooks/use-kit-memberships.ts`, `src/hooks/use-part-shopping-list-memberships.ts`, `src/components/shopping-lists/detail-header-slots.tsx`, `src/components/shopping-lists/overview-card.tsx`, `src/components/shopping-lists/shopping-list-link-chip.tsx`, `src/components/shopping-lists/shopping-list-selector.tsx`, `src/components/shopping-lists/part/add-to-shopping-list-dialog.tsx`, `src/components/kits/kit-shopping-list-dialog.tsx`, `src/components/kits/kit-card.tsx`, `src/components/parts/part-card.tsx`, `src/components/parts/part-list.tsx`.
- Dependencies: Backend migration is already complete (all lists are `active` or `done`).

- Slice: 2 -- Domain Type Extensions & Hook Updates
- Goal: Extend types with `sellerLink`, `logoUrl`, seller group `status`/`completed`. Update mapper functions. Remove obsolete hooks (`useOrderShoppingListLineMutation`, `useRevertShoppingListLineMutation`, `useOrderShoppingListGroupMutation`, `useMarkShoppingListReadyMutation`, `useUpdateSellerOrderNoteMutation`). Add `ordered` to `toLineUpdatePayload`. Create `use-seller-group-mutations.ts` wrapping the four new CRUD endpoints.
- Touches: `src/types/shopping-lists.ts`, `src/hooks/use-shopping-lists.ts`, `src/hooks/use-seller-group-mutations.ts` (new).
- Dependencies: Slice 1 (status simplification must be done first).

- Slice: 3 -- KanbanCardField (Inline Edit Primitive)
- Goal: Ship the reusable inline-edit component with Enter/Escape key handling and instrumentation.
- Touches: `src/components/shopping-lists/kanban/kanban-card-field.tsx`.
- Dependencies: None.

- Slice: 4 -- KanbanCard Component
- Goal: Ship the card component with all three rendering modes (unassigned, ordering, receiving).
- Touches: `src/components/shopping-lists/kanban/kanban-card.tsx`.
- Dependencies: Slice 2 (types), Slice 3 (KanbanCardField).

- Slice: 5 -- KanbanColumn & KanbanColumnHeader
- Goal: Ship the column component with header, card list, vertical scroll, and actions (complete, overflow menu, order note).
- Touches: `src/components/shopping-lists/kanban/kanban-column.tsx`, `src/components/shopping-lists/kanban/kanban-column-header.tsx`.
- Dependencies: Slice 4 (KanbanCard).

- Slice: 6 -- KanbanSkeletonColumn
- Goal: Ship the add-seller-column skeleton with searchable dropdown.
- Touches: `src/components/shopping-lists/kanban/kanban-skeleton-column.tsx`.
- Dependencies: `useSellersSearch` (existing).

- Slice: 7 -- KanbanBoard & DnD Integration
- Goal: Ship the board layout with horizontal scroll, DndContext, drag overlay, and column arrangement. Include background drag-to-scroll.
- Touches: `src/components/shopping-lists/kanban/kanban-board.tsx`, `src/components/shopping-lists/kanban/use-kanban-dnd.ts`. Install `@dnd-kit/core` and `@dnd-kit/utilities`.
- Dependencies: Slices 5-6.

- Slice: 8 -- Route Integration & Cleanup
- Goal: Replace concept/ready content branch with KanbanBoard. Remove `ConceptTable`, `ConceptToolbar`, `ReadyToolbar`, `SellerGroupList`, `SellerGroupCard`, `ReadyLineRow`, `OrderLineDialog`, `OrderGroupDialog`, `SellerGroupOrderNoteDialog` from active rendering. Update header slots. Wire up all Kanban-specific state and callbacks in the route. Remove obsolete dialog states (`orderLineState`, `orderGroupState`) and handlers (`handleMarkReady`, `handleBackToConcept`, `handleRevertLine`, `handleConfirmLineOrder`, `handleConfirmGroupOrder`).
- Touches: `src/routes/shopping-lists/$listId.tsx`, `src/components/shopping-lists/detail-header-slots.tsx`.
- Dependencies: Slice 7.

- Slice: 9 -- Test Factory Updates & Playwright Coverage
- Goal: Update `ShoppingListTestFactory` to remove obsolete methods and add seller group helpers. Ship all Kanban-specific E2E tests. Update existing shopping list specs that reference concept/ready flows.
- Touches: `tests/api/factories/shopping-list-factory.ts`, `tests/e2e/shopping-lists/kanban-board.spec.ts` (new), `tests/e2e/shopping-lists/kanban-drag-drop.spec.ts` (new), existing specs under `tests/e2e/shopping-lists/`.
- Dependencies: Slice 8 (full integration).

---

## 15) Risks & Open Questions

### Risks

- Risk: `@dnd-kit/core` may have compatibility issues with React 19 concurrent features.
- Impact: Drag overlay or drop detection may behave unexpectedly.
- Mitigation: Pin `@dnd-kit/core` to the latest stable version and run a DnD smoke test early in Slice 7 before building out the full board. Fall back to `pragmatic-drag-and-drop` if critical issues arise.

- Risk: Sequential "assign remaining" calls may be slow for lists with many unassigned lines.
- Impact: Poor UX with many lines (e.g., 50+ unassigned lines taking 10+ seconds of sequential PUTs).
- Mitigation: Show a progress indicator during the operation. If performance becomes an issue, request a bulk endpoint from the backend team.

- Risk: Status simplification (`concept`/`ready` -> `active`) touches 10+ files and may break other consumers.
- Impact: TypeScript errors and UI mismatches across parts, kits, and shopping list views.
- Mitigation: All affected files are enumerated in section 2. Implement as a single focused slice (Slice 1) with full TypeScript checking (`pnpm check`) before proceeding.

- Risk: Mobile long-press DnD (600ms delay) may conflict with native scroll behavior on touch devices.
- Impact: Users may accidentally trigger drags when scrolling.
- Mitigation: Use `@dnd-kit`'s `TouchSensor` with `activationConstraint: { delay: 600, tolerance: 5 }` to require a deliberate long-press with minimal movement.

- Risk: Inline editing on cards while a DnD operation is in progress could cause conflicting mutations.
- Impact: Race conditions between move and edit mutations.
- Mitigation: Disable inline editing when `activeCardId` is set (a drag is in progress). Re-enable after drag ends.

### Open Questions

- Question: None remaining. The backend implementation is fully specified and delivered. All open questions from the original plan have been resolved by the backend implementation document.
- Why it matters: N/A.
- Owner / follow-up: N/A.

### DnD Library Choice: `@dnd-kit/core`

**Recommendation**: Install `@dnd-kit/core` and `@dnd-kit/utilities`. Do **not** install `@dnd-kit/sortable` -- there is no within-column reordering, so the sortable package is unnecessary.

**Rationale**:
1. **React-native integration**: Unlike `pragmatic-drag-and-drop` (framework-agnostic, more boilerplate for React), `@dnd-kit` is purpose-built for React with hooks-first API (`useDraggable`, `useDroppable`, `DndContext`).
2. **Maturity**: Well-documented with Kanban examples. Large community.
3. **Auto-scroll**: Built-in auto-scroll support during drag near container edges, critical for horizontal board scrolling.
4. **Touch support**: `TouchSensor` with configurable activation constraints (delay, tolerance) maps directly to the 600ms long-press requirement.
5. **Bundle size**: ~10KB gzipped for core + utilities.
6. **Maintenance**: `react-beautiful-dnd` is deprecated; `@dnd-kit` is actively maintained.

**Note on keyboard navigation**: The user has not specified keyboard DnD navigation. Do **not** register `KeyboardSensor`. Only `PointerSensor` and `TouchSensor` should be used. Inline edit fields handle Enter/Escape independently.

---

## 16) Confidence

Confidence: High -- the backend is fully delivered with clear contracts, all API changes are confirmed in the OpenAPI spec, the generated hooks are available, and the original plan's open questions have been resolved. The main implementation risk is the DnD library compatibility with React 19, which can be validated early in the process.
