# Toast System Improvements – Technical Plan

## 0) Research Log & Findings

**Areas Searched**

- Toast system implementation: `src/contexts/toast-context-provider.tsx`, `src/components/ui/toast.tsx`, `src/contexts/toast-context-base.ts`
- Existing undo pattern reference: `src/components/kits/kit-archive-controls.tsx` (kit archive undo flow)
- Target mutation locations: `src/routes/shopping-lists/$listId.tsx`, `src/hooks/use-kit-contents.ts`
- Confirmation dialog pattern: `src/hooks/use-confirm.ts`
- Test infrastructure: `tests/e2e/kits/kits-overview.spec.ts` (undo testing pattern), `tests/support/helpers/toast-helpers.ts`
- Instrumentation hooks: `src/lib/test/toast-instrumentation.ts`, form instrumentation patterns

**Key Findings**

1. **Toast overflow issue**: Toast container (`src/components/ui/toast.tsx:84`) uses `max-w-sm` with `overflow-hidden`, but the message area (`:98-100`) lacks `overflow-hidden`, `text-ellipsis`, or `break-words`, allowing long messages to push the close button (`:115-120`) outside the container bounds.

2. **Auto-close behavior**: Default duration is `DEFAULT_TOAST_DURATION_MS = 15000` (`:36`). The toast root receives `duration={toast.duration ?? DEFAULT_TOAST_DURATION_MS}` (`:74`), but toasts with `action` buttons do not receive special handling. Radix UI may keep toasts open indefinitely if user interacts with action buttons. Need to verify if this is the root cause or if there's a missing `onOpenChange` propagation issue.

3. **Kit archive undo pattern** (`src/components/kits/kit-archive-controls.tsx:131-143`): Reference implementation shows:
   - Optimistic updates with TanStack Query cache snapshots
   - Undo button passed via `showSuccess` options: `action: { id: 'undo', label: 'Undo', testId: '...', onClick: handleUndo }`
   - `undoInFlightRef` prevents duplicate undo clicks
   - Undo triggers reverse mutation (unarchive)
   - Form instrumentation includes `undo: true` metadata flag

4. **Confirmation dialog removals**: Both shopping list line deletion (`:214-232`) and kit part removal (`use-kit-contents.ts:777-814`) currently use `useConfirm` hook. These must be removed and replaced with undo buttons per research findings.

5. **Shopping list group ordering** (`:362-392`): No confirmation dialog; adds undo button to existing success toast flow. Requires storing previous `orderedQuantity` state for all affected lines before mutation.

6. **Test instrumentation**: Existing `ToastTestEvent` schema includes `action?: string` field. Undo tests wait for toast events with `event.action === 'undo'` filter (e.g., `kits-overview.spec.ts:174-176`). Form instrumentation helpers already support `undo: true` metadata.

**Conflicts Resolved**

- Research document (`undo_candidates.md`) proposes removing confirmation dialogs for line/part deletions. This aligns with UX principle: "Use undo for frequent operations during active workflows."
- Auto-close issue: Research mentions "sometimes stay open indefinitely." Hypothesis: Toasts with action buttons may not auto-close due to Radix UI focus management. Will investigate `duration` override or `onOpenChange` propagation in implementation.

---

## 1) Intent & Scope

**User intent**

Fix toast display bugs (overflow, inconsistent auto-close) and expand undo functionality to enable frictionless editing workflows for shopping list curation and kit BOM management.

**Prompt quotes**

"Fix large toast text overflow that pushes close button out of bounds"
"Fix inconsistent auto-close behavior where toasts sometimes stay open indefinitely"
"Research and identify candidates for undo button functionality in success toasts"

**In scope**

- Fix toast message text overflow to keep close button visible and clickable
- Fix auto-close timer behavior so all toasts (including those with actions) dismiss after 15 seconds
- Remove confirmation dialog for shopping list line deletion; add undo button to success toast
- Remove confirmation dialog for kit part removal; add undo button to success toast
- Add undo button to shopping list group ordering success toast (no confirmation dialog to remove)
- Implement undo handlers following kit archive reference pattern: optimistic updates, snapshot restoration, reverse mutations
- Add Playwright specs for each undo flow covering happy path, timeout behavior, concurrent operations, and error handling
- Ensure test instrumentation emits toast events with `action: 'undo'` and form events with `undo: true` metadata

**Out of scope**

- Additional undo candidates beyond the three specified in research document
- Status transition undo (shopping list Done → Ready) — research recommends dedicated "Reopen" UI instead
- Undo for rare operations (type/seller/box/list deletion) — these keep confirmation dialogs
- Undo for create operations — manual deletion available
- Undo for update operations — users can re-edit

**Assumptions / constraints**

- Backend APIs for "add line," "add content," and "order line" support recreating deleted records with same attributes
- Radix UI Toast duration timer starts on mount and pauses when toast receives focus or hover
- TanStack Query cache snapshots remain valid across optimistic updates for rollback scenarios
- Test mode instrumentation (`isTestMode()`) guards all new test events
- Playwright specs rely on real backend; no route interception permitted

---

## 2) Affected Areas & File Map

### Toast UI Component

- **Area**: `src/components/ui/toast.tsx` (`ToastComponent`)
- **Why**: Fix overflow by adding `overflow-hidden`, `text-ellipsis`, and layout adjustments to message area; investigate auto-close duration handling for toasts with actions
- **Evidence**: `src/components/ui/toast.tsx:84` — container has `overflow-hidden` but message title at `:98-100` lacks text truncation; close button at `:115-120` can be pushed out of bounds by long messages. Action button at `:102-112` may interfere with auto-close timer.

### Toast Context Provider

- **Area**: `src/contexts/toast-context-provider.tsx` (`showToast`, `ToastProvider`)
- **Why**: Verify `duration` option propagates correctly and isn't overridden for toasts with actions; may need to force duration for action toasts
- **Evidence**: `src/contexts/toast-context-provider.tsx:21-44` — `showToast` accepts `options?.duration` and passes it to toast object. No special handling for action toasts observed.

### Shopping List Detail Route

- **Area**: `src/routes/shopping-lists/$listId.tsx` (`handleDeleteLine`, `handleConfirmGroupOrder`)
- **Why**: Remove confirmation dialog from line deletion (`:214-232`), add undo handler with snapshot + reverse mutation; add undo handler to group ordering (`:362-392`) with batch rollback
- **Evidence**:
  - Line deletion: `:214-232` — calls `confirm()` before `deleteLineMutation.mutateAsync()`, then `showSuccess('Removed part from Concept list')` without action
  - Group ordering: `:362-392` — directly calls `orderGroupMutation.mutateAsync()`, then `showSuccess(\`Marked ${orderedLines.length} lines Ordered...\`)` without action

### Shopping List Mutations Hook

- **Area**: `src/hooks/use-shopping-lists.ts` (mutation hooks)
- **Why**: May need to export or enhance `useDeleteShoppingListLineMutation`, `useOrderShoppingListGroupMutation` to support undo workflows; verify optimistic update patterns
- **Evidence**: Imported at `src/routes/shopping-lists/$listId.tsx:18-20` — `useDeleteShoppingListLineMutation`, `useOrderShoppingListGroupMutation` already exist; need to review if additional hooks required for "add line" reverse mutation

### Kit Contents Hook

- **Area**: `src/hooks/use-kit-contents.ts` (`confirmDeleteHandler`)
- **Why**: Remove confirmation dialog (`:777-814`), replace with immediate deletion + undo toast; implement undo handler using existing "add content" mutation
- **Evidence**: `:777-814` — `confirmDeleteHandler` currently guarded by `if (!confirmRow)` check tied to `useConfirm` state; calls `deleteMutation.mutateAsync()`, then `showSuccess('Removed part from kit')` without action

### Kit Contents Component

- **Area**: Component that renders `remove.confirmRow` confirmation dialog (likely `src/components/kits/kit-detail.tsx` or inline dialog)
- **Why**: Remove dialog UI, update call site to invoke immediate deletion with undo
- **Evidence**: `use-kit-contents.ts:860-867` exports `remove.confirmRow`, `remove.open`, `remove.close` — these control confirmation dialog visibility; consuming component must be updated to remove dialog render

### Shopping List Line Confirm Dialog

- **Area**: Component rendering line deletion confirmation (likely inline or imported dialog in `$listId.tsx`)
- **Why**: Remove dialog element and `confirm()` call from `handleDeleteLine`
- **Evidence**: `src/routes/shopping-lists/$listId.tsx:215-220` — `confirm({ title: 'Delete line', description: '...', destructive: true })` — this UI must be removed

### Toast Test Events

- **Area**: `src/lib/test/toast-instrumentation.ts` (`createInstrumentedToastWrapper`)
- **Why**: Ensure `ToastTestEvent` emits `action: 'undo'` when action.id === 'undo'
- **Evidence**: Research shows `tests/e2e/kits/kits-overview.spec.ts:174-176` filters on `event.action === 'undo'`; need to verify instrumentation maps `options.action.id` to `action` field in event payload

### Playwright Helpers

- **Area**: `tests/support/helpers/toast-helpers.ts` (if exists) or new helper file
- **Why**: Add helper to wait for undo toast and click undo button deterministically
- **Evidence**: Existing test pattern at `kits-overview.spec.ts:199-200` directly locates undo button via `page.getByTestId(\`kits.overview.toast.undo.${kit.id}\`)` — may benefit from shared helper

### Playwright Specs (New)

- **Area**: `tests/e2e/shopping-lists/line-deletion-undo.spec.ts` (new)
- **Why**: Cover undo flow for shopping list line deletion (happy path, timeout, errors)
- **Evidence**: No existing spec found; must create following pattern in `kits-overview.spec.ts:161-212`

- **Area**: `tests/e2e/shopping-lists/group-ordering-undo.spec.ts` (new)
- **Why**: Cover undo flow for batch group ordering (happy path, batch rollback, errors)
- **Evidence**: No existing spec found; must create new file

- **Area**: `tests/e2e/kits/kit-contents-undo.spec.ts` (new)
- **Why**: Cover undo flow for kit part removal (happy path, timeout, errors)
- **Evidence**: No existing spec found; must create new file

### Playwright Specs (Updated)

- **Area**: `tests/e2e/shopping-lists/*.spec.ts` (existing specs that assert on line deletion)
- **Why**: Update expectations to remove confirmation dialog assertions, add undo toast checks
- **Evidence**: Research found no existing specs that test line deletion confirmation — no conflicts to resolve

- **Area**: `tests/e2e/kits/kit-detail.spec.ts` (existing spec that asserts on part removal confirmation)
- **Why**: Update spec "removes kit contents after confirmation" at lines 1150-1193 to remove confirmation dialog assertions (`kits.detailDeleteDialog`, `kits.detailDeleteConfirm`), add undo toast checks
- **Evidence**: Research confirmed this spec expects confirmation dialog; must be updated in Slice 3

---

## 3) Data Model / Contracts

### Toast Options Extension (No Change Required)

- **Entity**: `ToastOptions` interface
- **Shape**:
  ```typescript
  interface ToastOptions {
    duration?: number;
    action?: ToastAction;
  }
  interface ToastAction {
    id: string;
    label: string;
    onClick?: () => void;
    testId?: string;
  }
  ```
- **Mapping**: Already supports undo button via `action: { id: 'undo', label: 'Undo', onClick: handleUndo, testId: '...' }`
- **Evidence**: `src/components/ui/toast.tsx:8-18` — interface already defined; `src/components/kits/kit-archive-controls.tsx:136-142` demonstrates usage

### Shopping List Line Deletion Snapshot

- **Entity**: Deleted line snapshot (component state)
- **Shape**:
  ```typescript
  interface DeletedLineSnapshot {
    lineId: number;
    listId: number;
    partId: number;
    partKey: string;
    needed: number;
    sellerId: number | null;
    note: string | null;
  }
  ```
- **Mapping**: Captured before `deleteLineMutation.mutateAsync()`, stored in React ref or state; passed to undo handler to call "add line" mutation with `partId`, `needed`, `sellerId`, `note`
- **Evidence**: `src/routes/shopping-lists/$listId.tsx:226` — `deleteLineMutation.mutateAsync({ lineId, listId, partKey })`; need to capture `line.part.id`, `line.needed`, `line.seller?.id`, `line.note` before deletion to match backend schema (`ShoppingListLineCreateSchema`)

### Kit Content Deletion Snapshot

- **Entity**: Deleted content snapshot (hook state or ref)
- **Shape**:
  ```typescript
  interface DeletedContentSnapshot {
    contentId: number;
    kitId: number;
    partId: number;
    partKey: string;
    requiredPerUnit: number;
    note: string | null;
    version: number;
  }
  ```
- **Mapping**: Captured before `deleteMutation.mutateAsync()`, passed to undo handler to call existing "add content" mutation (`usePostKitsContentsByKitId`)
- **Evidence**: `use-kit-contents.ts:790-792` — `deleteMutation.mutateAsync({ path: { kit_id: kitId, content_id: confirmRow.id } })`; need to capture `confirmRow.part.id`, `confirmRow.requiredPerUnit`, `confirmRow.note`, `confirmRow.version` before deletion

### Shopping List Group Ordering Snapshot

- **Entity**: Previous line quantities (batch snapshot)
- **Shape**:
  ```typescript
  interface OrderGroupSnapshot {
    listId: number;
    groupKey: string;
    previousQuantities: Array<{
      lineId: number;
      orderedQuantity: number;
    }>;
  }
  ```
- **Mapping**: Before `orderGroupMutation.mutateAsync()`, capture current `orderedQuantity` for all lines in group; undo handler calls same mutation with previous quantities
- **Evidence**: `src/routes/shopping-lists/$listId.tsx:373-380` — `orderGroupMutation.mutateAsync({ listId, groupKey, lines: [...] })`; undo must restore previous `orderedQuantity` values (typically 0 for "New" status)

### Toast Test Event (Existing, Verify Mapping)

- **Entity**: `ToastTestEvent`
- **Shape**:
  ```typescript
  interface ToastTestEvent {
    kind: 'toast';
    level: 'success' | 'error' | 'warning' | 'info';
    message: string;
    action?: string; // 'undo' when action.id === 'undo'
    timestamp: string;
  }
  ```
- **Mapping**: Instrumented toast wrapper maps `options.action?.id` to event `action` field
- **Evidence**: `tests/e2e/kits/kits-overview.spec.ts:174-176` — `waitTestEvent<ToastTestEvent>(page, 'toast', (event) => event.action === 'undo')`; need to verify `src/lib/test/toast-instrumentation.ts` includes this mapping

---

## 4) API / Integration Surface

### Shopping List Line Addition (Undo Reverse Mutation)

- **Surface**: `POST /api/shopping-lists/{list_id}/lines` / `useAddShoppingListLineMutation`
- **Inputs**: `{ listId: number, partId: number, needed: number, sellerId: number | null, note: string | null }`
- **Outputs**: Created line response (id, part, needed, seller, note); invalidates `useShoppingListDetail` query
- **Errors**: 409 conflict if part already exists (should not happen during undo); 404 if list deleted; surface via toast
- **Evidence**: Backend endpoint confirmed at `/work/backend/app/api/shopping_list_lines.py:28-56`; schema at `/work/backend/app/schemas/shopping_list_line.py:12-35` accepts `part_id`, `seller_id`, `needed`, `note`; frontend hook must map to these fields

### Kit Content Addition (Undo Reverse Mutation)

- **Surface**: `POST /api/kits/{kit_id}/contents` / `usePostKitsContentsByKitId`
- **Inputs**: `{ path: { kit_id: number }, body: { part_id: number, required_per_unit: number, note: string | null } }`
- **Outputs**: `KitContentDetailSchema_b98797e` (id, part, required_per_unit, note, version); appends to kit contents cache
- **Errors**: 409 conflict if part already in kit (should not happen during undo); surface via toast
- **Evidence**: `use-kit-contents.ts:532-538` — `createMutation.mutateAsync({ path: { kit_id: kitId }, body: { part_id, required_per_unit, note } })`; undo handler reuses this mutation

### Shopping List Line Ordering (Batch Undo)

- **Surface**: `POST /api/shopping-lists/{list_id}/order-group` or `PATCH /api/shopping-lists/{list_id}/lines/{line_id}/order` (batch or individual)
- **Inputs**: Same as forward mutation; undo passes previous `orderedQuantity` values for all affected lines
- **Outputs**: Updated line statuses; invalidates shopping list detail query
- **Errors**: 404 if list or lines deleted; 409 if concurrent edits; surface via toast
- **Evidence**: `$listId.tsx:373-380` — `orderGroupMutation.mutateAsync({ listId, groupKey, lines: [{ lineId, orderedQuantity }] })`; undo reuses same endpoint with previous quantities

### Shopping List Line Deletion (Forward Mutation)

- **Surface**: `DELETE /api/shopping-lists/{list_id}/lines/{line_id}` / `useDeleteShoppingListLineMutation`
- **Inputs**: `{ lineId: number, listId: number, partKey: string }`
- **Outputs**: No content (204); invalidates shopping list detail query
- **Errors**: 404 if already deleted; surface via toast
- **Evidence**: `$listId.tsx:226` — `deleteLineMutation.mutateAsync({ lineId, listId, partKey })`

### Kit Content Deletion (Forward Mutation)

- **Surface**: `DELETE /api/kits/{kit_id}/contents/{content_id}` / `useDeleteKitsContentsByKitIdAndContentId`
- **Inputs**: `{ path: { kit_id: number, content_id: number } }`
- **Outputs**: No content (204); removes content from kit query cache
- **Errors**: 404 if already deleted; surface via toast
- **Evidence**: `use-kit-contents.ts:790-792` — `deleteMutation.mutateAsync({ path: { kit_id, content_id } })`

### Query Invalidation Strategy

- **Shopping list line undo**: After undo mutation succeeds, invalidate `useShoppingListDetail` query (key: `['getShoppingListById', { path: { list_id: listId } }]`)
- **Kit content undo**: After undo mutation succeeds, invalidate kit detail query (key: `['getKitsByKitId', { path: { kit_id: kitId } }]`)
- **Group ordering undo**: After undo mutation succeeds, invalidate shopping list detail query

---

## 5) Algorithms & UI Flows

### Flow: Toast Message Overflow Fix

**Steps**:
1. User triggers mutation that shows success toast with long message (e.g., "Removed 'Very Long Part Description That Exceeds Container Width' from Concept list")
2. Toast component renders with `max-w-sm` container, message title in flex column, close button in flex row
3. **Bug**: Message text wraps without constraint, pushing close button outside visible bounds
4. **Fix**: Add `overflow-hidden` and `line-clamp-3` (or `text-ellipsis` with `whitespace-nowrap`) to message title div; ensure flex container uses `items-start` and close button stays aligned

**States / transitions**: Toast open → message renders → close button visible and clickable

**Hotspots**: Long part descriptions, seller names, or kit names in toast messages

**Evidence**: `src/components/ui/toast.tsx:92-121` — toast layout structure; `:98-100` lacks overflow handling

---

### Flow: Toast Auto-Close Fix

**Steps**:
1. User triggers mutation that shows success toast with action button
2. Toast renders with `duration={15000}` passed to `ToastPrimitive.Root`
3. **Bug**: User hovers or focuses action button; Radix UI pauses duration timer indefinitely; toast never auto-closes after user moves away
4. **Fix**: Investigate Radix UI duration behavior with actions; may need to force `duration` prop or adjust `onOpenChange` handling to ensure timer resumes after interaction ends

**States / transitions**: Toast open → user hovers action → timer pauses → user moves away → **timer should resume** → toast closes after 15s total

**Hotspots**: All toasts with action buttons (undo, etc.)

**Evidence**: `src/components/ui/toast.tsx:74` — duration prop passed; hypothesis that Radix UI pauses timer during focus

---

### Flow: Shopping List Line Deletion with Undo

**Steps**:
1. User clicks delete button on shopping list line in Concept view
2. **Old**: Confirmation dialog appears → user confirms → line deleted → success toast
3. **New**: No confirmation; line immediately deleted optimistically → success toast with undo button appears
4. Snapshot captured before deletion: `{ lineId, listId, partId, partKey, needed, sellerId, note }`
5. `deleteLineMutation.mutateAsync()` called; TanStack Query optimistically removes line from cache
6. If user clicks undo before toast dismisses:
   - `undoInFlightRef` checked to prevent duplicate clicks
   - "Add line" mutation called with snapshot data (`partId`, `needed`, `sellerId`, `note`)
   - Optimistically restore line to cache
   - Success toast: "Restored line to Concept list"
7. If undo mutation fails: Toast error; original deletion remains

**States / transitions**: Line visible → delete clicked → line removed (optimistic) → toast with undo → (undo clicked) → line restored

**Hotspots**: User rapidly deletes multiple lines; undo must not conflict with subsequent deletions

**Evidence**: `src/routes/shopping-lists/$listId.tsx:214-232` — current confirmation flow; must replace with optimistic deletion + undo. Backend endpoint confirmed to accept all required fields for restoration.

---

### Flow: Kit Part Removal with Undo

**Steps**:
1. User clicks remove button on kit content row
2. **Old**: Confirmation dialog appears → user confirms → content deleted → success toast
3. **New**: No confirmation; content immediately deleted optimistically → success toast with undo button appears
4. Snapshot captured before deletion: `{ contentId, kitId, partId, partKey, requiredPerUnit, note, version }`
5. `deleteMutation.mutateAsync()` called; TanStack Query optimistically removes content from cache
6. If user clicks undo before toast dismisses:
   - `undoInFlightRef` checked to prevent duplicate clicks
   - "Add content" mutation called with snapshot data (excluding contentId, version)
   - Optimistically append new content to cache
   - Success toast: "Restored part to kit"
7. If undo mutation fails: Toast error; original deletion remains

**States / transitions**: Content row visible → remove clicked → row removed (optimistic) → toast with undo → (undo clicked) → row restored with new ID

**Hotspots**: Part removal during kit editing workflow; undo must handle version conflicts gracefully

**Evidence**: `use-kit-contents.ts:777-814` — current confirmation flow; must replace with optimistic deletion + undo

---

### Flow: Shopping List Group Ordering with Undo

**Steps**:
1. User clicks "Mark Ordered" on seller group (e.g., Mouser group with 10 lines)
2. Snapshot captured before mutation: `{ listId, groupKey, previousQuantities: [{ lineId, orderedQuantity }, ...] }`
3. `orderGroupMutation.mutateAsync()` called; optimistic update marks all lines as ordered in cache
4. Success toast appears with undo button: "Marked 10 lines Ordered for Mouser"
5. If user clicks undo before toast dismisses:
   - `undoInFlightRef` checked to prevent duplicate clicks
   - Same `orderGroupMutation` called with previous quantities (typically 0 for all lines)
   - Optimistic rollback: restore previous ordered quantities in cache
   - Success toast: "Reverted 10 lines to previous state"
6. If undo mutation fails: Toast error; lines remain in new state

**States / transitions**: Lines in "New" status → group ordered → lines in "Ordered" status → toast with undo → (undo clicked) → lines back to "New"

**Hotspots**: Batch operation affects 5-15 lines; user may accidentally click wrong seller group; undo must roll back entire batch atomically

**Evidence**: `src/routes/shopping-lists/$listId.tsx:362-392` — current flow without undo; must add snapshot + undo handler

---

## 6) Derived State & Invariants

### Derived value: Shopping List Line Deletion Snapshot

- **Source**: Filtered line data from `lines` array (from `useShoppingListDetail`) at moment of deletion click
- **Writes / cleanup**: Stored in React ref before `deleteLineMutation.mutateAsync()`; passed to undo handler if user clicks undo; cleared after toast dismisses or undo completes
- **Guards**: Snapshot only valid until cache refresh; if line already deleted by another user (404 on undo), show error toast
- **Invariant**: Snapshot `partId` must match deleted line's `part.id`; snapshot `listId` must match current route `listId`; prevents undo from adding line to wrong list
- **Evidence**: `src/routes/shopping-lists/$listId.tsx:226` — deletion passes `{ lineId, listId, partKey }`; snapshot must capture `partId`, `needed`, `sellerId`, `note` to match backend schema requirements (confirmed via research)

### Derived value: Kit Content Deletion Snapshot

- **Source**: Filtered content row from `contents` array (from `useKitDetail`) at moment of removal click
- **Writes / cleanup**: Stored in React ref within `use-kit-contents.ts` before `deleteMutation.mutateAsync()`; passed to undo handler; cleared after toast dismisses or undo completes
- **Guards**: Snapshot only valid until cache refresh; undo creates new content record (different `contentId`, `version`); if part already in kit (409 on undo), show error toast (should not happen)
- **Invariant**: Snapshot `partId` must resolve to valid part; snapshot `kitId` must match current kit; prevents undo from adding content to wrong kit
- **Evidence**: `use-kit-contents.ts:790-792` — deletion passes `{ kit_id, content_id }`; snapshot must capture `partId`, `requiredPerUnit`, `note` before mutation

### Derived value: Shopping List Group Ordering Snapshot

- **Source**: Filtered lines from `sellerGroups` (from `useShoppingListDetail`) matching `groupKey` at moment of order click; current `orderedQuantity` for each line
- **Writes / cleanup**: Stored in React ref before `orderGroupMutation.mutateAsync()`; passed to undo handler; cleared after toast dismisses or undo completes
- **Guards**: Snapshot captures 5-15 line IDs and quantities; undo mutation must target same lines; if any line deleted (404 on undo), skip that line and proceed with rest; if entire group deleted, show error toast
- **Invariant**: Snapshot `lineId` list must match lines in group at mutation time; prevents undo from affecting wrong lines if group composition changes
- **Evidence**: `src/routes/shopping-lists/$listId.tsx:373-380` — mutation passes `{ listId, groupKey, lines: [{ lineId, orderedQuantity }] }`; snapshot must capture previous quantities before mutation

### Derived value: Undo In-Flight Flag

- **Source**: React ref initialized to `false`; set to `true` when undo clicked; reset to `false` after undo mutation settles
- **Writes / cleanup**: Updated in undo click handler; prevents duplicate undo invocations if user clicks undo button multiple times
- **Guards**: Check `undoInFlightRef.current` before starting undo mutation; early return if already in flight
- **Invariant**: Flag must be reset even if undo mutation fails; ensures user can retry undo after error
- **Evidence**: `src/components/kits/kit-archive-controls.tsx:104-107` — `if (undoInFlightRef.current) { return; }` prevents duplicate undo

### Derived value: Toast Undo Button Visibility

- **Source**: Toast is visible (not dismissed); user has not navigated away; undo button rendered if toast includes `action` prop
- **Writes / cleanup**: Undo button click triggers `onClick` handler, then removes toast via `removeToast(id)` (`:27-29` in `toast-context-provider.tsx`)
- **Guards**: Toast auto-dismisses after 15 seconds; undo handler must complete within toast lifetime or user must manually trigger before navigation
- **Invariant**: Undo button only clickable while toast is open; click removes toast immediately to prevent double-click
- **Evidence**: `src/contexts/toast-context-provider.tsx:24-30` — action `onClick` wraps user handler and calls `removeToast(id)`

---

## 7) State Consistency & Async Coordination

**Source of truth**: TanStack Query caches for `useShoppingListDetail`, `useKitDetail`

**Coordination**:
- Optimistic updates modify cache before mutation completes
- Snapshots captured before optimistic update allow rollback on error
- Undo mutations apply reverse changes to cache, then invalidate queries to refetch authoritative state
- All mutations coordinate through `useQueryClient.setQueryData()` for optimistic updates and `invalidateQueries()` for post-mutation refresh

**Async safeguards**:
- `undoInFlightRef` prevents concurrent undo clicks
- Snapshots include version numbers (kit contents) or line IDs to detect stale state
- If undo mutation returns 404 (record already deleted by another user), show error toast and skip cache rollback
- If undo mutation returns 409 (conflict), show error toast and refetch latest state
- If user navigates away before undo completes, mutation continues in background but toast is lost (acceptable)

**Instrumentation**:
- Form events emitted for deletion mutations: `trackFormSubmit`, `trackFormSuccess`, `trackFormError` (already in place)
- Form events emitted for undo mutations: same helpers with `metadata.undo = true` flag (kit archive pattern)
- Toast events emitted for success toasts with undo button: `ToastTestEvent` with `action: 'undo'` field
- Playwright waits for form success event before asserting on toast; waits for undo success event before asserting on restored state

**Evidence**: `src/components/kits/kit-archive-controls.tsx:116-152` — kit archive undo pattern demonstrates full coordination: optimistic update on delete, snapshot restoration on error, reverse mutation on undo, query invalidation after success

---

## 8) Errors & Edge Cases

### Failure: Shopping list line deletion succeeds but undo mutation fails (404 - line already deleted by another user)

- **Surface**: `$listId.tsx` undo handler
- **Handling**: Catch 404 error from "add line" mutation; show error toast: "Could not restore line (shopping list may have been modified)"; do not roll back cache (line is truly deleted)
- **Guardrails**: Undo handler checks error status; if 404, skips cache rollback; user sees error toast and manually re-adds line if needed
- **Evidence**: Kit archive pattern at `kit-archive-controls.tsx:124-129` shows error handling in `onError` callback

### Failure: Kit content deletion succeeds but undo mutation fails (409 - part already in kit)

- **Surface**: `use-kit-contents.ts` undo handler
- **Handling**: Catch 409 conflict from "add content" mutation; show error toast: "Could not restore part (already exists in kit)"; refetch kit detail to show current state
- **Guardrails**: Should not occur (part was just deleted), but if it does, user sees error and current kit state is accurate
- **Evidence**: Kit archive pattern handles errors via `onError`; `use-kit-contents.ts:704-726` shows 409 conflict handling for edit mutations

### Failure: Shopping list group ordering succeeds but undo mutation fails (partial failure - some lines deleted)

- **Surface**: `$listId.tsx` undo handler for group ordering
- **Handling**: Batch undo mutation may return mixed results (some lines reverted, some 404); show warning toast: "Reverted X of Y lines (Z lines no longer exist)"; refetch list detail
- **Guardrails**: Undo handler must handle partial success; if backend supports batch endpoint, parse response to count successes/failures; if individual mutations, use `Promise.allSettled()` to collect results
- **Evidence**: Group ordering mutation at `$listId.tsx:373-380` calls batch endpoint; undo must handle same endpoint with previous quantities

### Failure: Toast auto-closes before user clicks undo

- **Surface**: Toast component (15-second duration)
- **Handling**: User sees deletion success toast → distracted → toast dismisses after 15s → undo no longer available; user must manually re-add line/part
- **Guardrails**: 15-second window is acceptable per research; user can manually undo by re-adding; no persistent undo queue needed
- **Evidence**: `src/components/ui/toast.tsx:36` — `DEFAULT_TOAST_DURATION_MS = 15000`

### Failure: User navigates away while undo toast is visible

- **Surface**: Route navigation (e.g., click breadcrumb while toast is open)
- **Handling**: Toast context unmounts; undo button no longer clickable; mutation completes in background but user loses undo UI; acceptable (user navigated intentionally)
- **Guardrails**: No cross-route undo queue; undo is scoped to current view session
- **Evidence**: Toast context is global (`toast-context-provider.tsx:107-115`) but toasts tied to component lifecycle; navigation clears toast stack

### Failure: User clicks delete confirmation dialog cancel (old flow)

- **Surface**: N/A (confirmation dialogs removed)
- **Handling**: Not applicable; new flow has no confirmation step
- **Guardrails**: Undo button provides escape hatch for accidental deletions
- **Evidence**: Research document explicitly removes confirmation dialogs for line/part deletions

### Failure: Long toast message pushes close button out of bounds (bug being fixed)

- **Surface**: Toast component layout
- **Handling**: Apply `overflow-hidden` and `line-clamp-3` to message title; close button stays in top-right corner regardless of message length
- **Guardrails**: CSS constraints prevent layout overflow; message truncates with ellipsis after 3 lines
- **Evidence**: `src/components/ui/toast.tsx:84` — container has `overflow-hidden`; `:98-100` lacks text constraints (bug)

### Failure: Toast with action button never auto-closes (bug being fixed)

- **Surface**: Toast component duration handling
- **Handling**: Investigate Radix UI duration behavior; if timer pauses indefinitely on focus, force duration override or adjust `onOpenChange` logic
- **Guardrails**: Ensure all toasts (with or without actions) dismiss after 15 seconds
- **Evidence**: Hypothesis based on research "sometimes stay open indefinitely" — need to verify Radix UI behavior in implementation

---

## 9) Observability / Instrumentation

### Signal: Toast event with undo action

- **Type**: `ToastTestEvent` (test-event)
- **Trigger**: When `showSuccess()` called with `options.action.id === 'undo'`; emitted by instrumented toast wrapper
- **Labels / fields**: `{ kind: 'toast', level: 'success', message: string, action: 'undo', timestamp: string }`
- **Consumer**: Playwright specs filter on `event.action === 'undo'` to wait for undo toast before clicking button
- **Evidence**: `tests/e2e/kits/kits-overview.spec.ts:174-176` — `waitTestEvent<ToastTestEvent>(page, 'toast', (event) => event.action === 'undo')`

### Signal: Form event for deletion mutations

- **Type**: `FormTestEvent` (test-event)
- **Trigger**: On delete mutation submit, success, error; emitted via `trackFormSubmit`, `trackFormSuccess`, `trackFormError`
- **Labels / fields**: `{ kind: 'form', formId: 'ShoppingListLine:delete' | 'KitContent:delete' | 'ShoppingListGroup:order', phase: 'submit' | 'success' | 'error', metadata: { lineId?, contentId?, groupKey?, undo?: boolean } }`
- **Consumer**: Playwright waits for `phase: 'success'` before asserting on toast
- **Evidence**: Existing form instrumentation at `src/lib/test/form-instrumentation.ts`; kit archive uses `trackFormSubmit(ARCHIVE_FORM_ID, metadata)` at `:159`

### Signal: Form event for undo mutations

- **Type**: `FormTestEvent` (test-event)
- **Trigger**: On undo mutation submit, success, error; emitted with `metadata.undo = true`
- **Labels / fields**: `{ kind: 'form', formId: 'ShoppingListLine:restore' | 'KitContent:restore' | 'ShoppingListGroup:revert', phase: 'submit' | 'success' | 'error', metadata: { undo: true, lineId?, contentId?, groupKey? } }`
- **Consumer**: Playwright waits for `phase: 'success'` with `metadata.undo === true` before asserting on restored state
- **Evidence**: Kit archive pattern at `kit-archive-controls.tsx:73` — `buildFormMetadata(kit.id, 'active', undoTriggered)` includes `undo: true` when `undoTriggered`

### Signal: Toast close button click

- **Type**: UI action (no dedicated event; covered by toast dismiss)
- **Trigger**: User clicks close button (X icon) on toast
- **Labels / fields**: N/A (toast removed from DOM)
- **Consumer**: No explicit instrumentation; Playwright can assert on toast absence after close
- **Evidence**: `src/components/ui/toast.tsx:115-120` — `ToastPrimitive.Close` triggers `onOpenChange(false)` which calls `onRemove(toast.id)`

### Signal: Undo button click

- **Type**: Button click (covered by form event for undo mutation)
- **Trigger**: User clicks undo button in toast; triggers undo mutation
- **Labels / fields**: Covered by undo form event (see above)
- **Consumer**: Playwright locates undo button via `data-testid` (e.g., `shopping-lists.toast.undo.${lineId}`) and clicks; waits for undo form event
- **Evidence**: Kit archive undo button at `kit-archive-controls.tsx:140` — `testId: \`kits.overview.toast.undo.${kit.id}\``

### Signal: List loading event for shopping list detail

- **Type**: `ListLoadingTestEvent` (test-event)
- **Trigger**: On shopping list detail query loading, ready, error phases; emitted by `useListLoadingInstrumentation`
- **Labels / fields**: `{ kind: 'list_loading', scope: 'shoppingLists.list', phase: 'loading' | 'ready' | 'error', metadata: { listId, status, lineCount } }`
- **Consumer**: Playwright waits for `phase: 'ready'` after undo mutation to confirm cache refreshed
- **Evidence**: `src/routes/shopping-lists/$listId.tsx:174-188` — `useListLoadingInstrumentation({ scope: 'shoppingLists.list', ... })`

### Signal: List loading event for kit detail

- **Type**: `ListLoadingTestEvent` (test-event)
- **Trigger**: On kit detail query loading, ready, error phases; emitted by `useListLoadingInstrumentation`
- **Labels / fields**: `{ kind: 'list_loading', scope: 'kits.detail', phase: 'loading' | 'ready' | 'error', metadata: { kitId, status, contentCount } }`
- **Consumer**: Playwright waits for `phase: 'ready'` after undo mutation to confirm cache refreshed
- **Evidence**: Kit detail likely uses similar instrumentation pattern (need to verify in implementation)

---

## 10) Lifecycle & Background Work

### Hook / effect: Toast auto-dismiss timer

- **Trigger cadence**: On mount of each toast; timer starts immediately (or after user interaction ends, if Radix UI pauses on hover)
- **Responsibilities**: Wait `duration` milliseconds (15000 by default), then trigger `onOpenChange(false)` to remove toast
- **Cleanup**: Timer cleared if toast manually closed (via close button or action button click) or component unmounts
- **Evidence**: `src/components/ui/toast.tsx:74` — `duration={toast.duration ?? DEFAULT_TOAST_DURATION_MS}` passed to `ToastPrimitive.Root`; Radix UI manages timer internally

### Hook / effect: Undo in-flight flag reset

- **Trigger cadence**: Set on undo button click; reset after undo mutation settles (success or error)
- **Responsibilities**: Prevent duplicate undo invocations; reset even if mutation fails to allow retry
- **Cleanup**: Reset in mutation `finally` block or `onSettled` callback
- **Evidence**: Kit archive pattern at `kit-archive-controls.tsx:91` — `undoInFlightRef.current = false` in `onSuccess` callback

### Hook / effect: Query invalidation after undo

- **Trigger cadence**: On undo mutation success; triggered once per undo operation
- **Responsibilities**: Invalidate `useShoppingListDetail` or `useKitDetail` query to refetch authoritative state after undo mutation completes
- **Cleanup**: No cleanup; query refetch is one-time operation
- **Evidence**: Kit archive pattern at `kit-archive-controls.tsx:145-151` — `onSettled` callback invalidates multiple queries (`['getKits']`, `['getKitById', kit.id]`, etc.)

### Hook / effect: Snapshot cleanup on toast dismiss

- **Trigger cadence**: When toast is removed (auto-dismiss or manual close)
- **Responsibilities**: Clear snapshot ref to prevent stale data from being used in future undo attempts
- **Cleanup**: Set snapshot ref to `null` when toast component unmounts or user clicks undo
- **Evidence**: Kit archive pattern stores snapshots in refs (`archiveSnapshotRef`, `unarchiveSnapshotRef`); cleared after undo completes (`:84`, `:90`)

---

## 11) Security & Permissions

**Concern**: Authorization for undo mutations (restore deleted line/content)

**Touchpoints**: Same as forward mutations; "add line" and "add content" endpoints already enforce user permissions

**Mitigation**: Undo mutations reuse existing backend endpoints (`POST /api/shopping-lists/{list_id}/lines`, `POST /api/kits/{kit_id}/contents`); no new authorization surface; backend validates user can modify list/kit

**Residual risk**: None; undo does not bypass existing permission checks

**Evidence**: Backend authorization assumed to be in place for all mutation endpoints; undo is semantically identical to manual "add" operation

---

## 12) UX / UI Impact

### Entry point: Shopping list detail view (Concept tab)

- **Change**: Remove "Delete line" confirmation dialog; show success toast with undo button immediately after line deletion
- **User interaction**: User clicks delete icon on line → line removed immediately (optimistic) → toast appears: "Removed part from Concept list [Undo]" → user can click Undo within 15 seconds to restore line
- **Dependencies**: `useDeleteShoppingListLineMutation` (delete), new "add line" mutation (undo)
- **Evidence**: `src/routes/shopping-lists/$listId.tsx:214-232` — current flow; new flow removes `:215-223` confirmation prompt

### Entry point: Kit detail view (contents table)

- **Change**: Remove "Delete content" confirmation dialog; show success toast with undo button immediately after content removal
- **User interaction**: User clicks remove icon on content row → content removed immediately (optimistic) → toast appears: "Removed part from kit [Undo]" → user can click Undo within 15 seconds to restore content (with new ID)
- **Dependencies**: `useDeleteKitsContentsByKitIdAndContentId` (delete), `usePostKitsContentsByKitId` (undo)
- **Evidence**: `src/hooks/use-kit-contents.ts:777-814` — current flow; consuming component must remove confirmation dialog UI

### Entry point: Shopping list detail view (Ready tab, seller group)

- **Change**: Add undo button to success toast after marking group ordered (no confirmation dialog to remove)
- **User interaction**: User clicks "Mark Ordered" on seller group → lines updated immediately (optimistic) → toast appears: "Marked 10 lines Ordered for Mouser [Undo]" → user can click Undo within 15 seconds to revert all lines to previous quantities
- **Dependencies**: `useOrderShoppingListGroupMutation` (order), same mutation (undo with previous quantities)
- **Evidence**: `src/routes/shopping-lists/$listId.tsx:362-392` — current flow; add undo button to success toast at `:381`

### Entry point: Toast container (all toasts)

- **Change**: Fix message overflow to keep close button visible; ensure toasts with action buttons auto-close after 15 seconds
- **User interaction**: User sees toast with long message → message truncates after 3 lines with ellipsis → close button remains in top-right corner and clickable
- **Dependencies**: CSS layout adjustments in `toast.tsx`
- **Evidence**: `src/components/ui/toast.tsx:84-121` — toast layout; `:98-100` needs overflow constraints

---

## 13) Deterministic Test Plan

### Surface: Shopping list line deletion with undo (Concept view)

**Scenarios**:
- **Given** user is on shopping list detail page (Concept status) with 3 lines, **When** user clicks delete on second line, **Then** line is removed immediately (optimistic), success toast appears with undo button, toast includes line's part description
- **Given** undo toast is visible after line deletion, **When** user clicks undo button, **Then** undo mutation submits, line is restored to list, success toast shows "Restored line", original undo toast is dismissed
- **Given** undo toast is visible after line deletion, **When** user waits 15 seconds without clicking undo, **Then** toast auto-dismisses, undo button is no longer available, line remains deleted
- **Given** user deleted line and undo toast is visible, **When** undo mutation fails with 404 (list modified by another user), **Then** error toast appears "Could not restore line", cache is not rolled back, list refetches
- **Given** user is on shopping list detail page, **When** user rapidly deletes 3 lines in sequence, **Then** each deletion shows its own undo toast, user can undo any deletion independently, no mutations conflict

**Instrumentation / hooks**:
- `data-testid="shopping-lists.concept.table.row.${lineId}.delete"` (delete button)
- `data-testid="shopping-lists.toast.undo.${lineId}"` (undo button in toast)
- Form event: `{ formId: 'ShoppingListLine:delete', phase: 'submit' | 'success' | 'error', metadata: { lineId, listId, partKey } }`
- Form event: `{ formId: 'ShoppingListLine:restore', phase: 'submit' | 'success' | 'error', metadata: { undo: true, lineId, listId, partKey } }`
- Toast event: `{ kind: 'toast', level: 'success', message: 'Removed part from Concept list', action: 'undo' }`
- List loading event: `{ scope: 'shoppingLists.list', phase: 'ready' }` (after undo refetch)
- Factory support: `ShoppingListFactory.createLine()` confirmed to support `partKey`, `needed`, `sellerId`, `note` (research verified)

**Gaps**: None; full coverage of happy path, timeout, error, and concurrency scenarios

**Evidence**: Pattern from `tests/e2e/kits/kits-overview.spec.ts:161-212` (kit archive undo spec); factory confirmed at `/work/frontend/tests/api/factories/shopping-list-factory.ts:62-93`

---

### Surface: Kit content removal with undo (kit detail view)

**Scenarios**:
- **Given** user is on kit detail page with 5 contents, **When** user clicks remove on third content, **Then** content is removed immediately (optimistic), success toast appears with undo button, toast includes part description
- **Given** undo toast is visible after content removal, **When** user clicks undo button, **Then** undo mutation submits, content is restored to kit (with new ID), success toast shows "Restored part to kit", original undo toast is dismissed
- **Given** undo toast is visible after content removal, **When** user waits 15 seconds without clicking undo, **Then** toast auto-dismisses, undo button is no longer available, content remains deleted
- **Given** user removed content and undo toast is visible, **When** undo mutation fails with 409 (part already in kit - should not happen), **Then** error toast appears "Could not restore part (already exists in kit)", kit detail refetches
- **Given** user is on kit detail page, **When** user removes content, clicks undo, then tries to remove same content again, **Then** second removal targets newly created content ID, no conflict with first operation

**Instrumentation / hooks**:
- `data-testid="kits.detail.content.${contentId}.remove"` (remove button)
- `data-testid="kits.detail.toast.undo.${contentId}"` (undo button in toast)
- Form event: `{ formId: 'KitContent:delete', phase: 'submit' | 'success' | 'error', metadata: { contentId, kitId, partKey } }`
- Form event: `{ formId: 'KitContent:restore', phase: 'submit' | 'success' | 'error', metadata: { undo: true, contentId, kitId, partKey } }`
- Toast event: `{ kind: 'toast', level: 'success', message: 'Removed part from kit', action: 'undo' }`
- List loading event: `{ scope: 'kits.detail', phase: 'ready' }` (after undo refetch)

**Gaps**: None; full coverage of happy path, timeout, error, and edge case scenarios

**Evidence**: Pattern from `tests/e2e/kits/kits-overview.spec.ts:161-212` (kit archive undo spec)

---

### Surface: Shopping list group ordering with undo (Ready view)

**Scenarios**:
- **Given** user is on shopping list detail page (Ready status) with seller group "Mouser" containing 8 lines in "New" status, **When** user clicks "Mark Ordered" on Mouser group, **Then** all 8 lines are marked ordered immediately (optimistic), success toast appears with undo button: "Marked 8 lines Ordered for Mouser [Undo]"
- **Given** undo toast is visible after group ordering, **When** user clicks undo button, **Then** undo mutation submits with previous quantities (all 0), all 8 lines revert to "New" status, success toast shows "Reverted 8 lines to previous state"
- **Given** undo toast is visible after group ordering, **When** user waits 15 seconds without clicking undo, **Then** toast auto-dismisses, undo button is no longer available, lines remain ordered
- **Given** user marked group ordered and undo toast is visible, **When** undo mutation fails partially (some lines deleted by another user), **Then** warning toast appears "Reverted X of 8 lines (Y lines no longer exist)", list detail refetches
- **Given** user is on Ready view with two seller groups (Mouser, Digikey), **When** user marks Mouser group ordered, then immediately marks Digikey group ordered (before first toast dismisses), **Then** two undo toasts stack, user can undo either group independently

**Instrumentation / hooks**:
- `data-testid="shopping-lists.ready.group.${groupKey}.markOrdered"` (mark ordered button)
- `data-testid="shopping-lists.toast.undo.group.${groupKey}"` (undo button in toast)
- Form event: `{ formId: 'ShoppingListGroup:order', phase: 'submit' | 'success' | 'error', metadata: { groupKey, listId, lineCount } }`
- Form event: `{ formId: 'ShoppingListGroup:revert', phase: 'submit' | 'success' | 'error', metadata: { undo: true, groupKey, listId, lineCount } }`
- Toast event: `{ kind: 'toast', level: 'success', message: 'Marked 8 lines Ordered for Mouser', action: 'undo' }`
- List loading event: `{ scope: 'shoppingLists.list', phase: 'ready' }` (after undo refetch)

**Gaps**: Partial failure handling (some lines 404) requires backend to return structured error or success count; if not supported, undo handler uses `Promise.allSettled()` for individual mutations and counts results

**Evidence**: Pattern from `tests/e2e/kits/kits-overview.spec.ts:161-212` (kit archive undo spec); batch ordering at `$listId.tsx:362-392`

---

### Surface: Toast message overflow fix (all toasts)

**Scenarios**:
- **Given** user triggers mutation with very long part description (e.g., "Super Long Part Description That Definitely Exceeds The Maximum Width Of The Toast Container And Should Wrap Or Truncate"), **When** success toast appears, **Then** message text truncates after 3 lines with ellipsis, close button remains visible in top-right corner, close button is clickable
- **Given** user sees toast with undo button and long message, **When** user hovers close button, **Then** close button is visually interactive (hover state), click closes toast immediately
- **Given** user sees toast with 2-line message (not overflowing), **When** toast renders, **Then** message displays fully without truncation, close button remains in top-right corner

**Instrumentation / hooks**:
- `data-testid="app-shell.toast.item"` (toast container)
- `data-testid="app-shell.toast.viewport"` (toast viewport)
- Visual regression test: capture screenshot of toast with long message, verify close button position

**Gaps**: None; CSS fixes are deterministic; Playwright can assert on element positions and clickability

**Evidence**: `src/components/ui/toast.tsx:84-121` — toast layout structure

---

### Surface: Toast auto-close with action buttons (all toasts)

**Scenarios**:
- **Given** user triggers mutation that shows success toast with undo button, **When** toast appears, **Then** toast auto-dismisses after 15 seconds (even if user hovers undo button during that time)
- **Given** user sees toast with undo button, **When** user hovers undo button at 5 seconds, keeps mouse over button for 3 seconds, then moves mouse away, **Then** toast remains visible until 15-second timer completes from initial mount time (total)
- **Given** user sees toast with undo button, **When** user clicks undo button at 3 seconds, **Then** undo mutation submits, undo toast appears, original toast is removed immediately (not waiting for 15-second timer)

**Instrumentation / hooks**:
- `data-testid="app-shell.toast.item"` (toast container)
- Playwright can wait for toast to disappear: `await expect(page.getByTestId('app-shell.toast.item')).toBeHidden({ timeout: 16000 })`

**Gaps**: May need to investigate Radix UI duration behavior in detail; if timer pauses indefinitely on hover, may require custom timeout implementation or Radix UI prop override

**Evidence**: `src/components/ui/toast.tsx:74` — `duration={toast.duration ?? DEFAULT_TOAST_DURATION_MS}`; hypothesis that Radix UI may pause timer on focus

---

## 14) Implementation Slices

### Slice: Fix toast overflow and auto-close bugs

**Goal**: Resolve toast display issues before adding undo functionality; ensure toasts are usable and consistent

**Touches**:
- `src/components/ui/toast.tsx` — add `overflow-hidden`, `line-clamp-3` to message title; investigate/fix duration behavior for action toasts
- Playwright spec (new): `tests/e2e/app-shell/toast-display.spec.ts` — verify overflow fix and auto-close behavior

**Dependencies**: None; standalone UI fix

---

### Slice: Shopping list line deletion undo

**Goal**: Remove confirmation dialog, add undo button, implement reverse mutation

**Touches**:
- `src/routes/shopping-lists/$listId.tsx` — remove `confirm()` call in `handleDeleteLine`, add undo handler, capture snapshot, pass undo action to `showSuccess`
- `src/hooks/use-shopping-lists.ts` — verify/export "add line" mutation hook for undo
- Playwright spec (new): `tests/e2e/shopping-lists/line-deletion-undo.spec.ts`
- Update existing specs that assert on line deletion confirmation dialog

**Dependencies**: Toast overflow fix (Slice 1); ensures undo button is clickable

---

### Slice: Kit part removal undo

**Goal**: Remove confirmation dialog, add undo button, implement reverse mutation

**Touches**:
- `src/hooks/use-kit-contents.ts` — remove confirmation flow, add undo handler to `remove` controls, capture snapshot, pass undo action to `showSuccess`
- Component rendering `remove.confirmRow` dialog — remove dialog UI
- Playwright spec (new): `tests/e2e/kits/kit-contents-undo.spec.ts`
- Update existing specs that assert on part removal confirmation dialog

**Dependencies**: Toast overflow fix (Slice 1); shopping list line undo (Slice 2) provides reference pattern

---

### Slice: Shopping list group ordering undo

**Goal**: Add undo button to existing success toast, implement batch rollback

**Touches**:
- `src/routes/shopping-lists/$listId.tsx` — add undo handler to `handleConfirmGroupOrder`, capture snapshot of previous quantities, pass undo action to `showSuccess`
- Playwright spec (new): `tests/e2e/shopping-lists/group-ordering-undo.spec.ts`

**Dependencies**: Shopping list line undo (Slice 2) establishes undo pattern for shopping list mutations

---

### Slice: Instrumentation and test coverage polish

**Goal**: Ensure all undo flows emit correct test events; verify Playwright specs cover all scenarios

**Touches**:
- `src/lib/test/toast-instrumentation.ts` — verify `ToastTestEvent` includes `action: 'undo'` field when `options.action.id === 'undo'`
- Review all new Playwright specs for missing scenarios (concurrent operations, navigation during undo, etc.)
- Run full Playwright suite to verify no regressions in existing specs

**Dependencies**: All previous slices; final validation before delivery

---

## 15) Risks & Open Questions

### Risk: Radix UI duration timer does not resume after action button interaction (CONFIRMED)

- **Impact**: Toasts with undo buttons may never auto-close after user clicks action or close buttons; subsequent toasts may also stick indefinitely due to timer state corruption
- **Details**: Research confirmed known bugs in Radix UI Toast v1.2.15:
  - Issue #2268: Timer doesn't resume after clicking action/close buttons
  - Issue #2461: New toasts never disappear after using Toast.Close
  - Issue #2233: Timer pause/resume issues with dynamic durations
- **Mitigation**: Implement custom timeout management using `setTimeout` to force toast dismissal after 15 seconds regardless of user interaction; or upgrade to newer Radix UI version if bugs are fixed; test thoroughly in first implementation slice

### Risk: Backend "add line" or "add content" endpoints may not support recreating deleted records with exact same attributes (RESOLVED)

- **Status**: RESOLVED via research — backend endpoints confirmed to support full payload
- **Shopping list line endpoint**: `POST /api/shopping-lists/{list_id}/lines` accepts `part_id`, `seller_id`, `needed`, `note` (all fields required for undo)
- **Kit content endpoint**: `POST /api/kits/{kit_id}/contents` accepts `part_id`, `required_per_unit`, `note` (all fields required for undo)
- **Conclusion**: Undo mutations can fully restore deleted records with original attributes; creates new record (different ID) rather than restoring original ID

### Risk: Undo mutation may conflict with concurrent edits by other users

- **Impact**: User deletes line, another user deletes entire list, user clicks undo → undo mutation fails with 404 → error toast appears
- **Mitigation**: Acceptable per research; undo is best-effort; error handling shows clear message "Could not restore line (shopping list may have been modified)"; user can manually re-add if needed

### Risk: Shopping list group ordering undo may fail partially (some lines deleted by another user) (ENDPOINT CONFIRMED)

- **Impact**: User marks group ordered (10 lines), another user deletes 2 lines, user clicks undo → undo mutation succeeds for 8 lines, fails for 2 lines → unclear feedback to user
- **Status**: Backend endpoint confirmed via research — uses atomic validation with batch updates
- **Endpoint**: `POST /api/shopping-lists/{list_id}/seller-groups/<group_ref>/order` at `/work/backend/app/api/shopping_list_lines.py:196-237`
- **Behavior**: Service method validates all lines first, then updates batch if validation passes; if any line fails validation, entire operation fails (prevents partial state)
- **Mitigation**: Undo reuses same endpoint with previous quantities; if validation detects deleted lines, entire undo fails with clear error message; show error toast: "Could not revert group (shopping list was modified by another user)"; acceptable per research — undo is best-effort

### Risk: Playwright specs may be flaky if toast auto-dismiss timing is inconsistent

- **Impact**: Test waits for undo toast, toast dismisses before test can click undo button → test fails intermittently
- **Mitigation**: Playwright specs must wait for toast event (`waitTestEvent`) before attempting to click undo button; ensure test clicks undo immediately after toast appears (well within 15-second window); if needed, extend toast duration in test mode

---

### Resolved Research Findings

**Backend Shopping List Line Addition Endpoint (CONFIRMED)**
- Endpoint: `POST /api/shopping-lists/{list_id}/lines` at `/work/backend/app/api/shopping_list_lines.py:28-56`
- Schema: `ShoppingListLineCreateSchema` at `/work/backend/app/schemas/shopping_list_line.py:12-35` includes:
  - `part_id: int` (required)
  - `seller_id: int | None` (optional)
  - `needed: int` (required, minimum 1)
  - `note: str | None` (optional)
- Service method: `add_line` at `/work/backend/app/services/shopping_list_line_service.py:41-89` accepts all required fields
- **Conclusion**: Undo mutations for line deletion can fully restore original line attributes (needed quantity, seller, notes)

**Backend Group Ordering Endpoint Behavior (CONFIRMED)**
- Endpoint: `POST /api/shopping-lists/{list_id}/seller-groups/<group_ref>/order` at `/work/backend/app/api/shopping_list_lines.py:196-237`
- Returns: `list[ShoppingListLineResponseSchema]` (batch of updated lines, not atomic rollback)
- Service method: `set_group_ordered` at `/work/backend/app/services/shopping_list_line_service.py:295-388`
  - Validates all lines first (lines 359-379)
  - Updates all lines in batch if validation passes (lines 381-383)
  - Atomic validation, batch update pattern (validation failure prevents all updates)
- **Conclusion**: Undo mutations can reuse same endpoint with previous quantities; validation ensures consistent batch operations

**Radix UI Version and Timer Bugs (CONFIRMED ISSUE)**
- Current version: `@radix-ui/react-toast: ^1.2.15` from `/work/frontend/package.json:28`
- Known bugs in v1.2.15:
  - Issue #2268: Timer doesn't resume after clicking action/close buttons
  - Issue #2461: New toasts never disappear after using Toast.Close
  - Issue #2233: Timer pause/resume issues with dynamic durations
- **Conclusion**: Custom timeout management required; implement `setTimeout` to force dismissal after 15 seconds regardless of user interaction

**Shopping List Test Factory Support (CONFIRMED)**
- Factory method: `createLine` at `/work/frontend/tests/api/factories/shopping-list-factory.ts:62-93`
- Endpoint used: `POST /api/parts/{part_key}/shopping-list-memberships` (lines 72-80)
- Supported fields: `partKey`, `needed` (defaults to 1), `sellerId`, `note`
- **Conclusion**: Playwright specs can use existing factory to recreate lines during undo tests with full attribute support

**FormId Naming Convention (CONFIRMED)**
- Pattern: `Domain:action` format
- Examples from codebase:
  - `KitContent:create`, `KitContent:update`, `KitContent:delete` (`use-kit-contents.ts`)
  - `KitLifecycle:archive`, `KitLifecycle:unarchive` (`kit-archive-controls.tsx`)
  - `KitPickList:create`
- **Conclusion**: Proposed formIds align with existing convention:
  - `ShoppingListLine:delete`, `ShoppingListLine:restore`
  - `KitContent:delete`, `KitContent:restore`
  - `ShoppingListGroup:order`, `ShoppingListGroup:revert`

**Toast Duration for Undo Actions (RESOLVED)**
- User confirmed default 15 seconds is acceptable for undo toasts
- No extended duration needed; aligns with common patterns (e.g., Gmail undo send)
- Duration remains consistent across all toast types

**Existing Playwright Specs with Confirmation Dialogs (FOUND)**
- **Kit content removal**: `tests/e2e/kits/kit-detail.spec.ts:1150-1193` spec "removes kit contents after confirmation" expects `kits.detailDeleteDialog` and `kits.detailDeleteConfirm` — must be updated in Slice 3 to remove confirmation assertions and add undo toast checks
- **Shopping list line deletion**: No existing specs found that test line deletion confirmation — no conflicts to resolve in Slice 2

---

## 16) Confidence

**Confidence: Very High** — All major unknowns have been resolved through research:
- Toast overflow and auto-close issues are straightforward CSS and duration fixes (Radix UI timer bugs confirmed, mitigation strategy clear)
- Undo pattern is well-established (kit archive reference provides complete implementation template)
- Backend APIs **confirmed** to support full undo workflows: shopping list line endpoint accepts all required fields (`partId`, `needed`, `sellerId`, `note`); kit content endpoint supports all required fields; group ordering endpoint uses atomic validation with batch updates
- Test infrastructure confirmed mature: `ShoppingListFactory.createLine()` supports all fields needed for undo test scenarios; formId naming convention confirmed (`Domain:action` pattern)
- Playwright specs can follow proven pattern from kit archive undo tests (`kits-overview.spec.ts:161-212`)
- Only implementation detail remaining is Radix UI duration fix (well-understood problem with documented mitigation strategy)
