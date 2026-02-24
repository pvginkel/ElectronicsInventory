# Shopping List Kanban Redesign -- Code Review

## 1) Summary & Decision

**Readiness**
The implementation delivers the core Kanban board redesign: status simplification (`active`/`done`), drag-and-drop with `@dnd-kit/core`, inline-editable card fields, seller group CRUD mutations, and comprehensive Playwright test coverage. The code is well-structured with a clear separation between the board component tree (layout/presentation), the DnD hook (drag logic), and the route (mutation orchestration). The status simplification is thorough across all 14+ affected files. Type safety is strong throughout the new Kanban components. However, several correctness issues prevent a clean GO: the seller group update mutation always sends `null` for omitted fields (risking note-clearing on status-only updates), the order note dialog is missing its text input, `effectiveSeller` mapping is broken, and the note field's hover-expand CSS lacks the required `group/card` parent class.

**Decision**
`GO-WITH-CONDITIONS` -- Three Major issues (seller group PUT sending null for omitted fields, missing note dialog input, broken effectiveSeller mapping) and one Minor CSS issue must be resolved before shipping.

---

## 2) Conformance to Plan (with evidence)

**Plan alignment**
- `Plan section 1: Status simplification` <-> `src/types/shopping-lists.ts:11-13` -- `ShoppingListStatus` is now `'active' | 'done'`; new `ShoppingListSellerStatus` type added. All 14+ files updated.
- `Plan section 2: New files` <-> `src/components/shopping-lists/kanban/` -- 8 new files (board, column, column-header, card, card-field, skeleton-column, use-kanban-dnd, kanban-utils) delivered; matches plan.
- `Plan section 2: use-seller-group-mutations.ts` <-> `src/hooks/use-seller-group-mutations.ts` -- Three CRUD hooks created wrapping the generated API hooks.
- `Plan section 2: Removed hooks` <-> `src/hooks/use-shopping-lists.ts` diff -- `useOrderShoppingListLineMutation`, `useRevertShoppingListLineMutation`, `useOrderShoppingListGroupMutation`, `useMarkShoppingListReadyMutation`, `useUpdateSellerOrderNoteMutation` all removed (~450 lines deleted).
- `Plan section 3: sellerLink, logoUrl, status, completed` <-> `src/types/shopping-lists.ts:62-67,117-120,194-195` -- All four new fields added to the correct interfaces.
- `Plan section 5: DnD flow` <-> `src/components/shopping-lists/kanban/use-kanban-dnd.ts:81-268` -- PointerSensor (8px), TouchSensor (600ms delay, 5px tolerance), confirmation dialog for ordered > 0 moves, instrumentation events emitted.
- `Plan section 5: Inline edit` <-> `src/components/shopping-lists/kanban/kanban-card-field.tsx` -- hover-border, click-to-edit, blur/Enter saves, Escape reverts, form instrumentation.
- `Plan section 9: Instrumentation` <-> Route and DnD hook emit `shoppingLists.kanban`, `kanban.card.move`, `kanban.column.complete`, `kanban.column.create`, `kanban.assignRemaining` events.
- `Plan section 9: data-testid` <-> All Kanban components carry the `shopping-lists.kanban.*` naming scheme matching the plan taxonomy.
- `Plan section 13: Test plan` <-> `tests/e2e/shopping-lists/kanban-board.spec.ts` and `kanban-drag-drop.spec.ts` -- Board rendering, inline editing, seller column lifecycle, skeleton column, column actions, card deletion, DnD tests all present.
- `Plan section 14: Slices 1-9` <-> Implementation covers all nine slices; factory and page object updates are thorough.

**Gaps / deviations**
- `Plan section 2: seller-group-order-note-dialog.tsx removal` -- The file is not deleted but contains a stub (`src/components/shopping-lists/ready/seller-group-order-note-dialog.tsx:8-15`). This is documented with a TODO comment; acceptable as a follow-up.
- `Plan section 5: Order note flow` -- Plan specifies "inline popover or small dialog for editing the note" with a text input. The implementation uses a bare `ConfirmDialog` with no text input (`src/routes/shopping-lists/$listId.tsx:900-908`). The `noteEditValue` state is set but never rendered in the dialog. This is a functional gap -- order note editing is broken. See finding M1.
- `Plan section 5: Add Part with seller pre-set` -- Plan specifies "ConceptLineForm dialog opens with seller pre-set to X" for seller column [+] Add Part. Implementation has `// TODO: pre-populate seller in ConceptLineForm when sellerId is provided` (`src/routes/shopping-lists/$listId.tsx:203`). Minor gap.
- `Plan section 3: effectiveSeller mapping` -- Plan does not explicitly call out changing effectiveSeller, but the implementation maps `effectiveSeller` to `line.seller` instead of `line.effective_seller` (`src/hooks/use-shopping-lists.ts:175`), losing the computed effective seller concept. See finding M2.
- `Plan section 13: DnD confirmation dialog tests` -- Two DnD confirmation tests are marked `test.fixme` (`tests/e2e/shopping-lists/kanban-drag-drop.spec.ts:111-117`) with a documented reason. Acceptable.
- `Plan section 2: primarySellerName on overview` -- `mapOverviewSummary` now hardcodes `primarySellerName: null` (`src/hooks/use-shopping-lists.ts:349`) because `seller_notes` was removed. The `derivePrimarySeller` function falls back to line effectiveSeller, but `effectiveSeller` is now the same as `seller` (see M2), so the overview may no longer show a primary seller even when lines have sellers.

---

## 3) Correctness -- Findings (ranked)

### M1 -- Major: Seller group PUT sends `null` for omitted fields, may clear notes on status-only updates

- **Title**: `Major -- useUpdateSellerGroupMutation sends null for omitted optional fields`
- **Evidence**: `src/hooks/use-seller-group-mutations.ts:105-108`
  ```typescript
  const body: ShoppingListSellerGroupUpdateSchema_57ff967 = {
    note: input.note ?? null,
    status: input.status ?? null,
  };
  ```
  When `handleCompleteGroup` calls `updateGroupMutation.mutateAsync({ listId, sellerId, status: 'ordered' })` (no `note` field), the hook sends `{ note: null, status: "ordered" }`. If the backend interprets `note: null` as "clear the note," then completing or reopening a seller group will silently erase its order note.
- **Impact**: User-visible data loss -- order notes disappear when completing or reopening a seller group.
- **Fix**: Only include fields that are explicitly provided in the input:
  ```typescript
  const body: ShoppingListSellerGroupUpdateSchema_57ff967 = {};
  if (input.note !== undefined) body.note = input.note ?? null;
  if (input.status !== undefined) body.status = input.status ?? null;
  ```
  Alternatively, confirm backend semantics: if `null` means "no change" rather than "clear," this is a non-issue.
- **Confidence**: High (code path is unambiguous; backend semantics need confirmation)

### M2 -- Major: `effectiveSeller` mapped to `seller` instead of `effective_seller`

- **Title**: `Major -- effectiveSeller now maps to line.seller, losing the computed effective seller`
- **Evidence**: `src/hooks/use-shopping-lists.ts:175`
  ```typescript
  effectiveSeller: mapSeller(line.seller),
  ```
  Was previously `mapSeller(line.effective_seller)`. The API response likely still includes `effective_seller` (the computed seller for the line, which may differ from the explicitly assigned seller).
- **Impact**: `derivePrimarySeller()` reads `line.effectiveSeller.name` to determine the primary seller shown on the overview card. If `effective_seller` differs from `seller`, the overview displays incorrect information. The overview card (`src/components/shopping-lists/overview-card.tsx:53-55`) still consumes `list.primarySellerName`.
- **Fix**: Restore `effectiveSeller: mapSeller(line.effective_seller)`. If the API no longer provides `effective_seller`, remove the field from the type and update `derivePrimarySeller` to use `seller` directly.
- **Confidence**: High

### M3 -- Major: Order note dialog has no text input

- **Title**: `Major -- Order note edit dialog renders as a bare confirm dialog without a text input`
- **Evidence**: `src/routes/shopping-lists/$listId.tsx:898-908`
  ```tsx
  <ConfirmDialog
    open={noteEditOpen}
    onOpenChange={(open) => { if (!open) setNoteEditOpen(false); }}
    title="Edit order note"
    description=""
    confirmText="Save note"
    onConfirm={() => void handleSaveNote()}
    contentProps={{ ... }}
  />
  ```
  The dialog has no children, no description, and no input element. `noteEditValue` (line 128-129) is initialized from the group's note but never rendered or editable. Clicking "Save note" saves the original value unchanged.
- **Impact**: Users cannot edit order notes. The "order note" icon on the seller column header opens a dialog that does nothing useful.
- **Fix**: Either (a) replace `ConfirmDialog` with a custom dialog containing a `<textarea>` bound to `noteEditValue`/`setNoteEditValue`, or (b) reuse the existing `SellerGroupOrderNoteDialog` component (which already has the full form) with the new `useUpdateSellerGroupMutation` instead of the stubbed hook.
- **Confidence**: High (the dialog source code is clear)

### N1 -- Minor: Card note hover-expand CSS missing `group/card` parent class

- **Title**: `Minor -- group-hover/card:line-clamp-none has no matching group/card ancestor`
- **Evidence**: `src/components/shopping-lists/kanban/kanban-card.tsx:222`
  ```typescript
  'line-clamp-3 group-hover/card:line-clamp-none',
  ```
  The card root `<div>` at line 87-94 does not include `group/card` in its class names. Tailwind's `group-hover/card:` modifier requires an ancestor with class `group/card` to work.
- **Impact**: Note text never expands on hover -- remains permanently clamped at 3 lines.
- **Fix**: Add `group/card` to the card root div's className: `'group/card rounded-lg border bg-card p-3 shadow-sm'`.
- **Confidence**: High

### N2 -- Minor: Note field hidden when `line.note` is `null`

- **Title**: `Minor -- Note field not shown for new cards that have never had a note`
- **Evidence**: `src/components/shopping-lists/kanban/kanban-card.tsx:207`
  ```typescript
  {(mode === 'unassigned' || mode === 'ordering') && line.note != null && (
  ```
  Cards with `note: null` (never set) won't render the note field at all. The plan says the note field should be editable on unassigned and ordering cards.
- **Impact**: Users cannot add a note to a card that doesn't already have one without opening the edit form dialog.
- **Fix**: Change the condition to always show the note field in editable modes, passing an empty string as default: `line.note != null` -> `true` (or remove the `line.note != null` guard), and use `value={line.note ?? ''}`.
- **Confidence**: Medium (depends on whether the plan requires always-visible note fields or only when a note exists)

### N3 -- Minor: Add Part TODO not implemented

- **Title**: `Minor -- Add Part from seller column does not pre-populate seller`
- **Evidence**: `src/routes/shopping-lists/$listId.tsx:202-203`
  ```typescript
  // TODO: pre-populate seller in ConceptLineForm when sellerId is provided
  void sellerId;
  ```
- **Impact**: When clicking [+] Add Part on a seller column, the line form opens without the seller pre-selected. User must manually choose the seller.
- **Fix**: Pass `sellerId` to `ConceptLineForm` as a `defaultSellerId` prop and wire it into the form's initial values.
- **Confidence**: High

---

## 4) Over-Engineering & Refactoring Opportunities

- **Hotspot**: The `useCallback` wrapping of `createWrapCard` in KanbanBoard creates a new closure on every `groups` change because the inner function captures `group`.
- **Evidence**: `src/components/shopping-lists/kanban/kanban-board.tsx:244-266`
  ```typescript
  const createWrapCard = useCallback(
    (group: ShoppingListSellerGroup) => {
      return (cardElement, line) => { ... };
    },
    [isCompleted, pendingLineIds],
  );
  ```
  Called as `wrapCard={createWrapCard(group)}` inside `.map()`, which creates a new function reference per render cycle per column regardless of the `useCallback`.
- **Suggested refactor**: This is acceptable -- React Compiler can handle this pattern. No action needed unless profiling reveals performance issues. The comment at line 222 ("React Compiler handles memoization automatically") signals the developer is aware.
- **Payoff**: None; current pattern is fine.

- **Hotspot**: Dead code in `src/components/shopping-lists/ready/seller-group-order-note-dialog.tsx` with a stubbed mutation hook.
- **Evidence**: `src/components/shopping-lists/ready/seller-group-order-note-dialog.tsx:8-15`
- **Suggested refactor**: Delete the file (and other unused `ready/` components like `OrderLineDialog`, `OrderGroupDialog`, `SellerGroupCard`, `ReadyLineRow`, `ReadyToolbar`) in a follow-up cleanup. The TODO comment documents the intent.
- **Payoff**: Reduced dead code surface, smaller bundle.

---

## 5) Style & Consistency

- **Pattern**: Instrumentation in the route uses `emitUiState` wrapper consistently for all new Kanban flows.
- **Evidence**: `src/routes/shopping-lists/$listId.tsx:44-46` defines `emitUiState`, used 15 times for column lifecycle events and assign-remaining.
- **Impact**: Positive -- consistent instrumentation pattern aligned with project conventions.
- **Recommendation**: None; well done.

- **Pattern**: The DnD hook (`use-kanban-dnd.ts`) also calls `emitTestEvent` directly rather than using the route's `emitUiState` wrapper.
- **Evidence**: `src/components/shopping-lists/kanban/use-kanban-dnd.ts:135-213` uses `emitTestEvent` directly.
- **Impact**: Negligible -- `emitUiState` is just a wrapper. Both paths work identically.
- **Recommendation**: For consistency, could import and use the same wrapper, but not required.

- **Pattern**: `isOrderable: false` and `isRevertible: false` hardcoded in `mapConceptLine`.
- **Evidence**: `src/hooks/use-shopping-lists.ts:161-162`
- **Impact**: These fields are now dead. Any code still reading `isOrderable` or `isRevertible` will always get `false`.
- **Recommendation**: Remove these fields from the `ShoppingListConceptLine` type in a follow-up to prevent confusion.

---

## 6) Tests & Deterministic Coverage (new/changed behavior only)

- **Surface**: Kanban board rendering (unassigned, multi-seller, completed)
- **Scenarios**:
  - Given 3 unassigned lines, When board loads, Then unassigned column shows 3 cards and skeleton visible (`tests/e2e/shopping-lists/kanban-board.spec.ts:14-39`)
  - Given lines assigned to 2 sellers, When board loads, Then 3 columns + seller column cards (`tests/e2e/shopping-lists/kanban-board.spec.ts:41-81`)
  - Given completed list, When board loads, Then skeleton hidden, no add-part buttons (`tests/e2e/shopping-lists/kanban-board.spec.ts:83-104`)
- **Hooks**: `waitForListLoading(page, 'shoppingLists.kanban', 'ready')`, `data-testid` selectors.
- **Gaps**: None for rendering tests.
- **Evidence**: `tests/e2e/shopping-lists/kanban-board.spec.ts`

- **Surface**: Inline editing (needed, ordered, escape revert)
- **Scenarios**:
  - Given unassigned card, When click needed field and type 7 + Enter, Then backend updated (`kanban-board.spec.ts:108-150`)
  - Given seller card, When click ordered field and type 3 + Enter, Then backend updated (`kanban-board.spec.ts:152-189`)
  - Given editing field, When press Escape, Then reverts without save (`kanban-board.spec.ts:191-217`)
- **Hooks**: `waitTestEvent<FormTestEvent>(page, 'form', ...)` for `KanbanCard:needed`/`KanbanCard:ordered` success.
- **Gaps**: No test for note field inline editing. No test for validation (min value, max length).
- **Evidence**: `tests/e2e/shopping-lists/kanban-board.spec.ts`

- **Surface**: Seller column lifecycle (complete, reopen)
- **Scenarios**:
  - Given all lines ordered > 0, When click Complete, Then column becomes ordered + backend confirms (`kanban-board.spec.ts:221-265`)
  - Given ordered group with no received, When click Reopen, Then column returns to active (`kanban-board.spec.ts:267-305`)
- **Hooks**: `waitForUiState(page, 'kanban.column.complete', 'success')`.
- **Gaps**: No test for disabled Complete button when some ordered == 0. No test for disabled Reopen when received > 0.
- **Evidence**: `tests/e2e/shopping-lists/kanban-board.spec.ts`

- **Surface**: Drag and drop
- **Scenarios**:
  - Given unassigned card, When dragged to seller column, Then backend shows seller assignment (`kanban-drag-drop.spec.ts:16-55`)
  - Given seller A card, When dragged to seller B column, Then seller changes (`kanban-drag-drop.spec.ts:57-97`)
  - Confirmation dialog tests: `test.fixme` with documented reason (`kanban-drag-drop.spec.ts:111-117`)
- **Hooks**: `waitForUiState(page, 'kanban.card.move', 'success')`.
- **Gaps**: Confirmation dialog path not covered (documented as unreachable). No test for drop-on-background cancel.
- **Evidence**: `tests/e2e/shopping-lists/kanban-drag-drop.spec.ts`

- **Surface**: Existing spec updates
- **Scenarios**: Line deletion undo (4 tests), ready-line-deletion (3 tests), shopping-lists detail (refactored), shopping-lists overview, parts entrypoints, kits -- all updated from concept/ready patterns to Kanban patterns.
- **Hooks**: All tests use `shoppingLists.kanban` scope for list loading, use page object Kanban helpers.
- **Gaps**: None significant.
- **Evidence**: 7 updated spec files.

---

## 7) Adversarial Sweep (must attempt >=3 credible failures or justify none)

### A1 -- Seller group PUT clears note on status-only update

- **Title**: `Major -- Status-only PUT to seller group sends note: null, clearing existing notes`
- **Evidence**: `src/hooks/use-seller-group-mutations.ts:105-108` -- `note: input.note ?? null` coerces `undefined` to `null`. Called from `handleCompleteGroup` (`src/routes/shopping-lists/$listId.tsx:521`) and `handleReopenGroup` (line 553) with no `note` field, so `null` is sent.
- **Impact**: Completing or reopening a seller group silently erases any order note the user had previously saved. This is a data corruption scenario.
- **Fix**: See M1 fix -- only include provided fields in the body.
- **Confidence**: High

### A2 -- Stale closure in `handleAssignRemaining` capturing `sellerGroups`

- **Title**: `Minor -- handleAssignRemaining reads sellerGroups from closure, could be stale during sequential mutations`
- **Evidence**: `src/routes/shopping-lists/$listId.tsx:598-603`
  ```typescript
  const handleAssignRemaining = useCallback(async (sellerId: number) => {
    const unassignedGroup = sellerGroups.find((g) => g.sellerId === null);
    const unassignedLines = unassignedGroup?.lines ?? [];
  ```
  The `sellerGroups` array is captured from the render-cycle closure. During the sequential `for` loop (lines 612-636), the TanStack Query cache is invalidated after each line update mutation. However, the loop uses the stale `unassignedLines` array captured before the first mutation, so it processes all originally-unassigned lines even if some fail mid-way.
- **Impact**: This is actually safe behavior -- if a line assignment fails, the loop breaks (line 637). The stale closure means the loop assigns all lines that were unassigned at the start, which is the intended behavior. The risk would arise if a line was moved by another user during the operation, but the backend will correctly reject or accept each PUT independently.
- **Fix**: None needed -- the early-exit-on-failure pattern is correct, and invalidation happens after the loop completes.
- **Confidence**: Low (not a real issue)

### A3 -- DragOverlay renders stale line data after drag ends

- **Title**: `Minor -- DragOverlay may flash with stale data after drag end`
- **Evidence**: `src/components/shopping-lists/kanban/use-kanban-dnd.ts:122` sets `setActiveLine(null)` in `handleDragEnd`, and `src/components/shopping-lists/kanban/kanban-board.tsx:327` renders the overlay conditionally on `activeLine`. Since `setActiveLine(null)` fires synchronously at drag-end, the overlay should tear down immediately.
- **Impact**: None -- React's batching ensures the overlay unmounts in the same render cycle.
- **Fix**: None needed.
- **Confidence**: High (no real issue)

### A4 -- Background drag-to-scroll effect does not depend on DnD state

- **Title**: `Minor -- Board background scroll drag could conflict with DnD drag`
- **Evidence**: `src/components/shopping-lists/kanban/kanban-board.tsx:186-188`
  ```typescript
  const onPointerDown = (event: PointerEvent) => {
    if (event.target !== board) return;
    // ...
  ```
  The guard `event.target !== board` ensures scroll-drag only activates when clicking directly on the board background (not on any child element like a card or column). Since cards are children of the board, clicking on a card goes to `@dnd-kit`'s sensor, not the scroll handler. This is safe.
- **Impact**: None -- the guard is correct.
- **Fix**: None needed.
- **Confidence**: High (no real issue)

---

## 8) Invariants Checklist (table)

- **Invariant**: Every line appears in exactly one column
  - Where enforced: `src/hooks/use-shopping-lists.ts:196-217` (`mapSellerGroup` groups lines by the seller group's line set from the API). The backend ensures each line belongs to at most one seller group.
  - Failure mode: If the cache is partially updated with a stale group structure, a line could appear in multiple columns temporarily.
  - Protection: The implementation uses full cache invalidation (not optimistic merge) for seller group mutations. `mergeUpdatedLineIntoDetail` handles line-level updates by finding the correct group via `updateSellerGroupsWithLine`.
  - Evidence: `src/hooks/use-shopping-lists.ts:282-310`

- **Invariant**: A column's mode is derived solely from backend state (`group.status`), not local UI state
  - Where enforced: `src/components/shopping-lists/kanban/kanban-utils.ts:19-23` -- `deriveCardMode(groupStatus)` is a pure function of `group.status`.
  - Failure mode: If local state were used instead, mode would not survive page refresh.
  - Protection: All column components call `deriveCardMode(group.status)` from the query cache. No local state tracks column mode.
  - Evidence: `src/components/shopping-lists/kanban/kanban-column.tsx:91`

- **Invariant**: Cards with line status `ordered` cannot be dragged
  - Where enforced: `src/components/shopping-lists/kanban/kanban-board.tsx:248-251` sets `disabled: true` when `line.status === 'ordered'`, and `src/components/shopping-lists/kanban/use-kanban-dnd.ts:133-147` guards against ordered lines in `handleDragEnd`.
  - Failure mode: If drag were allowed, the backend would return 409 on the seller-change PUT.
  - Protection: Two layers -- the draggable is disabled (preventing drag start) and the DnD end handler rejects ordered lines (preventing mutation even if drag somehow started).
  - Evidence: `src/components/shopping-lists/kanban/kanban-board.tsx:248-251`, `use-kanban-dnd.ts:133-147`

- **Invariant**: Cache invalidation occurs after every mutation
  - Where enforced: `src/hooks/use-seller-group-mutations.ts:35-39` invalidates three query keys per mutation. `src/hooks/use-shopping-lists.ts` line mutations also invalidate.
  - Failure mode: If invalidation were missed, the board would show stale data.
  - Protection: Every seller group hook calls `invalidateShoppingListQueries` in `onSuccess`.
  - Evidence: `src/hooks/use-seller-group-mutations.ts:50-55`, `93-99`

---

## 9) Questions / Needs-Info

- **Question**: Does the backend `PUT /seller-groups/{seller_id}` treat `note: null` as "clear the note" or "no change"?
- **Why it matters**: Determines whether M1 (seller group PUT sending null for omitted fields) is a data-corruption bug or a non-issue. If `null` means "clear," then completing/reopening groups silently erases order notes.
- **Desired answer**: Confirmation from the backend team on null-handling semantics for optional fields in `ShoppingListSellerGroupUpdateSchema`.

- **Question**: Does the API still return `effective_seller` on line responses, and is it distinct from `seller`?
- **Why it matters**: The `effectiveSeller` mapping was changed from `line.effective_seller` to `line.seller` (M2). If the field still exists and differs, the overview card's primary seller display is broken.
- **Desired answer**: Confirmation whether `effective_seller` is still in the API response schema, and whether it can differ from `seller`.

---

## 10) Risks & Mitigations (top 3)

- **Risk**: Seller group status-only updates clear order notes via null coercion in the mutation hook.
- **Mitigation**: Fix the `useUpdateSellerGroupMutation` to only include explicitly provided fields in the request body, or confirm backend null-semantics.
- **Evidence**: `src/hooks/use-seller-group-mutations.ts:105-108`, `src/routes/shopping-lists/$listId.tsx:521-530`

- **Risk**: Order note editing is non-functional (dialog has no text input), leaving a visible but broken UI control on every seller column.
- **Mitigation**: Replace the bare `ConfirmDialog` with a proper form dialog containing a textarea bound to `noteEditValue`, or reuse the existing `SellerGroupOrderNoteDialog` component.
- **Evidence**: `src/routes/shopping-lists/$listId.tsx:898-908`

- **Risk**: Dead code accumulation from the `ready/` directory components that are no longer rendered but still compiled and shipped.
- **Mitigation**: File a follow-up to delete `OrderLineDialog`, `OrderGroupDialog`, `SellerGroupOrderNoteDialog`, `SellerGroupCard`, `ReadyLineRow`, `ReadyToolbar`, `ConceptToolbar`, `ConceptTable`, and related unused components. The stub in `seller-group-order-note-dialog.tsx` documents the intent.
- **Evidence**: `src/components/shopping-lists/ready/seller-group-order-note-dialog.tsx:8-15`

---

## 11) Confidence

Confidence: High -- The review is based on reading all 30 modified files, all 13 new/untracked files, and the full plan. The three Major findings are clear-cut code issues with straightforward fixes. The overall architecture is sound and well-aligned with project patterns.
