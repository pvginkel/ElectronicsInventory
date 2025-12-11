# Delete Shopping List Line from Ready State — Technical Plan

## 0) Research Log & Findings

**Components investigated:**
- `/src/components/shopping-lists/ready/ready-line-row.tsx` (lines 1-210) — Renders line actions in Ready view, currently shows Pencil icon but no delete icon
- `/src/components/shopping-lists/concept-line-row.tsx` (lines 1-140) — Shows Trash2 icon for Concept view deletion (no confirmation)
- `/src/routes/shopping-lists/$listId.tsx` (lines 288-339) — Contains existing `handleDeleteLine` implementation for Concept state with undo toast
- `/src/hooks/use-shopping-lists.ts` (lines 1125-1169) — `useDeleteShoppingListLineMutation` hook wraps backend API
- `/src/components/shopping-lists/list-delete-confirm.tsx` (lines 1-144) — Reference implementation of confirmation dialogs using `useConfirm` hook
- `/src/hooks/use-confirm.ts` (lines 1-65) — Reusable confirmation dialog pattern

**Existing patterns identified:**
- Concept view deletion is immediate with undo toast (no confirmation dialog)
- Ready view shows Revert (Undo2 icon) and Edit (Pencil icon) for non-done lines
- List-level deletion uses `ConfirmDialog` component with `useConfirm` hook
- The `useDeleteShoppingListLineMutation` hook already handles cache invalidation
- Line actions in Ready view use ghost buttons with icon-only 8x8 sizing

**Testing infrastructure:**
- `tests/e2e/shopping-lists/line-deletion-undo.spec.ts` tests Concept deletion with undo
- Form instrumentation uses `ShoppingListLine:delete` formId and emits submit/success/error events
- Tests rely on `waitTestEvent` helpers and backend validation

**Key constraint resolved:**
The brief states "delete icon should replace the position where the Revert to New icon currently appears" which is shown only for non-Ready states. After examining `ready-line-row.tsx:176-188`, the Revert (Undo2) icon appears when `line.isRevertible` is true (ordered or done lines). The delete icon will appear in the same actions container but only when the list is in Ready state.

## 1) Intent & Scope

**User intent**

Enable users to delete a shopping list line when the list is in Ready state, using a confirmation dialog that matches the existing list deletion pattern. The feature adds a trash/bin icon to the left of the edit (pencil) icon in the Ready view actions area.

**Prompt quotes**

"Add the ability to delete a shopping list line from a shopping list that is in 'Ready' state."

"Add a bin (trash) icon to the left of the pencil (edit) icon in the shopping list line actions area."

"The delete icon should only appear when the shopping list is in 'Ready' state."

"When clicked, show a confirmation dialog before deleting. The dialog should match the style of the existing 'Delete List' confirmation dialog on the shopping list page."

"The backend already supports this operation - no API changes needed."

**In scope**

- Add delete (Trash2) icon button to Ready line row actions, positioned before the Edit button
- Show delete button only when shopping list status is 'ready' (not 'done')
- Implement confirmation dialog using existing `useConfirm` pattern
- Wire delete action to existing `useDeleteShoppingListLineMutation` hook
- Emit form instrumentation events (submit/success/error) for test assertions
- Handle delete errors via global toast system
- Update or create Playwright specs to cover Ready state deletion

**Out of scope**

- Backend API changes (endpoint already exists)
- Undo functionality for Ready state deletion (not mentioned in brief)
- Concept state deletion changes (already implemented)
- Deleting lines when list status is 'done'

**Assumptions / constraints**

- The backend `DELETE /api/shopping-list-lines/{line_id}` endpoint accepts deletion in Ready state
- The `useDeleteShoppingListLineMutation` hook already invalidates queries correctly
- The confirmation dialog will use the same `ConfirmDialog` component as list deletion
- Deletion will not have an undo toast (unlike Concept state deletion)
- The list must be in 'ready' status; isCompleted flag prevents deletion in 'done' state

## 2) Affected Areas & File Map

- Area: `src/components/shopping-lists/ready/ready-line-row.tsx`
- Why: Add Trash2 icon button to actions area before Edit button, visible only for Ready state non-done lines
- Evidence: `ready-line-row.tsx:145-205` — Actions column shows Revert and Edit buttons conditionally; delete will follow same pattern

---

- Area: `src/components/shopping-lists/ready/seller-group-card.tsx`
- Why: Pass new `onDeleteLine` handler through to `ReadyLineRow` component
- Evidence: `seller-group-card.tsx:154-166` — Maps `readyLines` to `ReadyLineRow` with existing handlers for order/revert/edit/updateStock

---

- Area: `src/components/shopping-lists/ready/seller-group-list.tsx`
- Why: Thread `onDeleteLine` handler from route to card components
- Evidence: `seller-group-list.tsx:6-30` — Interface passes handlers to `SellerGroupCard`

---

- Area: `src/routes/shopping-lists/$listId.tsx`
- Why: Create confirmation dialog state and handler for Ready view line deletion
- Evidence: `$listId.tsx:288-339` — Existing `handleDeleteLine` for Concept state shows pattern; Ready state needs separate handler with confirmation
- Evidence: `$listId.tsx:790-806` — Ready content passes handlers to `SellerGroupList`

---

- Area: New hook: `src/components/shopping-lists/ready/use-ready-line-delete-confirm.tsx` (optional)
- Why: Encapsulate confirmation dialog logic following the pattern in `list-delete-confirm.tsx`
- Evidence: `list-delete-confirm.tsx:21-63` — `useListDeleteConfirm` shows the pattern for dialog + mutation coordination

---

- Area: `tests/e2e/shopping-lists/shopping-lists-detail.spec.ts` or new spec file
- Why: Add coverage for Ready state line deletion with confirmation
- Evidence: `line-deletion-undo.spec.ts:1-323` — Existing test structure for Concept deletion; Ready deletion will be simpler (no undo)

## 3) Data Model / Contracts

- Entity / contract: Delete line mutation input
- Shape: `{ lineId: number, listId: number, partKey?: string }` — same as Concept deletion
- Mapping: No transformation needed; passed directly to `useDeleteShoppingListLineMutation`
- Evidence: `$listId.tsx:308-312` — Existing delete call shows required parameters

---

- Entity / contract: Confirmation dialog state
- Shape: `{ open: boolean, line: ShoppingListConceptLine | null, trigger: HTMLElement | null }`
- Mapping: Mirrors other dialog states (OrderLineState, UpdateStockState) in the route component
- Evidence: `$listId.tsx:69-85` — Existing dialog state patterns

---

- Entity / contract: Form instrumentation payload
- Shape: `{ lineId: number, listId: number, partKey: string }`
- Mapping: Emitted via `trackFormSubmit`, `trackFormSuccess`, `trackFormError` with formId `'ShoppingListLine:delete'`
- Evidence: `$listId.tsx:301-318` — Existing instrumentation for Concept deletion uses same formId

## 4) API / Integration Surface

- Surface: `DELETE /api/shopping-list-lines/{line_id}` via `useDeleteShoppingListLineMutation`
- Inputs: `{ lineId: number, listId: number, partKey?: string }`
- Outputs: Query invalidation for shopping list detail and part memberships; toast confirmation
- Errors: ApiError handled by global toast system; form instrumentation emits error event
- Evidence: `use-shopping-lists.ts:1125-1169` — Mutation hook invalidates queries on success

## 5) Algorithms & UI Flows (step-by-step)

- Flow: Ready state line deletion
- Steps:
  1. User clicks Trash2 icon in Ready line row actions
  2. `handleDeleteReadyLine(line)` opens confirmation dialog with line context
  3. Dialog displays: "Delete shopping list line?" with description matching list deletion pattern
  4. If user cancels, close dialog and return
  5. If user confirms:
     a. Emit `trackFormSubmit('ShoppingListLine:delete', { lineId, listId, partKey })`
     b. Call `deleteLineMutation.mutateAsync({ lineId, listId, partKey })`
     c. On success: emit `trackFormSuccess`, show success toast, invalidate queries
     d. On error: emit `trackFormError`, show exception toast via global handler
  6. Close dialog and restore focus to trigger element
- States / transitions: Dialog open/closed; mutation pending/success/error
- Hotspots: Must disable delete button when mutation is pending; must track pending state per line
- Evidence: `$listId.tsx:408-436` — Similar flow for order line dialog

---

- Flow: Render delete button visibility
- Steps:
  1. `ReadyLineRow` receives `readOnly` and `line` props
  2. Check: `!readOnly && line.status !== 'done'`
  3. If true, render Trash2 button before Edit button in actions container
  4. Button disabled if `disabled` prop is true (pending mutation)
- States / transitions: Button visible/hidden based on list completion and line status
- Hotspots: Ensure delete button does not appear when list is 'done'
- Evidence: `ready-line-row.tsx:146-204` — Existing conditional rendering of action buttons

## 6) Derived State & Invariants

- Derived value: Delete button visibility
  - Source: `readOnly` flag (derived from list status === 'done') and `line.status`
  - Writes / cleanup: None; purely visual toggle
  - Guards: `!readOnly && line.status !== 'done'`
  - Invariant: Delete button must never appear for completed lists or done lines
  - Evidence: `$listId.tsx:733` — `isCompleted` flag derived from list status

---

- Derived value: Pending line ID set
  - Source: `pendingLineIds` state managed in route component
  - Writes / cleanup: `updatePendingLine(lineId, true)` before mutation, `updatePendingLine(lineId, false)` in finally block
  - Guards: Prevents concurrent mutations on the same line
  - Invariant: Line actions must be disabled while any mutation is pending for that line
  - Evidence: `$listId.tsx:385-395` — Existing pending line tracking

---

- Derived value: Confirmation dialog open state
  - Source: Dialog state object `{ open: boolean, line: ShoppingListConceptLine | null }`
  - Writes / cleanup: Set open=true on delete click, set open=false on cancel/confirm complete
  - Guards: Only one confirmation dialog can be open at a time
  - Invariant: Dialog must close after successful deletion or user cancellation
  - Evidence: `$listId.tsx:139-141` — Existing dialog state patterns

## 7) State Consistency & Async Coordination

- Source of truth: TanStack Query cache for shopping list detail
- Coordination: `useDeleteShoppingListLineMutation` invalidates `getShoppingListById` query, triggering re-fetch
- Async safeguards: Pending line tracking prevents concurrent deletions; finally block ensures cleanup
- Instrumentation: Emit form events (submit/success/error) at same checkpoints as Concept deletion for test determinism
- Evidence: `use-shopping-lists.ts:1129-1162` — Mutation invalidates queries in onSuccess callback

## 8) Errors & Edge Cases

- Failure: Backend DELETE request fails (network, authorization, or business rule)
- Surface: Route component's delete handler
- Handling: `trackFormError` emits test event; `showException` displays toast with error message
- Guardrails: Mutation wrapped in try/catch; finally block resets pending state
- Evidence: `$listId.tsx:328-338` — Existing error handling pattern

---

- Failure: User clicks delete while mutation is pending
- Surface: `ReadyLineRow` actions
- Handling: Button disabled when `pendingLineIds.has(line.id)` or `disabled` prop is true
- Guardrails: Disabled state prevents duplicate API calls
- Evidence: `ready-line-row.tsx:58` — `disableActions` flag combines disabled and readOnly

---

- Failure: User closes dialog via ESC or overlay click without confirming
- Surface: Confirmation dialog
- Handling: `useConfirm` hook resolves promise with `false`; no mutation triggered
- Guardrails: Dialog state resets to `{ open: false, line: null }`
- Evidence: `use-confirm.ts:45-50` — `handleOpenChange` calls `handleCancel` when open becomes false

---

- Failure: List transitions to 'done' while confirmation dialog is open
- Surface: Delete handler
- Handling: Check `detailIsCompleted` flag before calling mutation; abort if true
- Guardrails: Add early return in handler: `if (detailIsCompleted) return;`
- Evidence: `$listId.tsx:398-400` — Existing handlers check `detailIsCompleted` before proceeding

## 9) Observability / Instrumentation

- Signal: Form lifecycle events for Ready line deletion
- Type: Test instrumentation via `trackFormSubmit`, `trackFormSuccess`, `trackFormError`
- Trigger: Delete confirmation → submit; mutation success → success; mutation catch → error
- Labels / fields: `{ formId: 'ShoppingListLine:delete', lineId, listId, partKey }`
- Consumer: Playwright tests use `waitTestEvent(page, 'form', evt => evt.formId === 'ShoppingListLine:delete' && evt.phase === 'success')`
- Evidence: `line-deletion-undo.spec.ts:40-48` — Existing test waits for delete events

---

- Signal: Toast with success message after deletion
- Type: Toast test event
- Trigger: Successful deletion
- Labels / fields: `{ message: 'Removed part from shopping list' }` (or similar Ready-specific message)
- Consumer: Tests can assert toast visibility; no undo action for Ready deletions
- Evidence: `$listId.tsx:320-327` — Concept deletion shows toast with undo; Ready will show toast without undo

---

- Signal: Delete button `data-testid`
- Type: Selector attribute
- Trigger: Render when delete button is visible
- Labels / fields: `shopping-lists.ready.line.{line.id}.actions.delete`
- Consumer: Playwright locator: `page.getByTestId(\`shopping-lists.ready.line.\${lineId}.actions.delete\`)`
- Evidence: `ready-line-row.tsx:157-161` — Existing action button testIds follow this pattern

## 10) Lifecycle & Background Work

- Hook / effect: Confirmation dialog state management
- Trigger cadence: On delete button click (user-initiated)
- Responsibilities: Open dialog, await user confirmation, execute mutation, close dialog
- Cleanup: Reset dialog state on close; restore focus to trigger element
- Evidence: `$listId.tsx:404-406` — Existing dialog close handlers reset state

---

- Hook / effect: Pending line tracking in mutation lifecycle
- Trigger cadence: Before and after mutation execution
- Responsibilities: Add lineId to pending set before mutation; remove in finally block
- Cleanup: Ensure pending flag is cleared even if mutation fails
- Evidence: `$listId.tsx:416-435` — Existing pattern for tracking pending lines

## 11) Security & Permissions (if applicable)

- Concern: Authorization to delete lines in Ready state
- Touchpoints: Backend endpoint validates user permissions; frontend assumes backend enforces rules
- Mitigation: Global error handler surfaces 403/401 responses via toast
- Residual risk: None; backend is authoritative for business rules
- Evidence: `api-error.ts` — ApiError integrates with toast system

---

- Concern: Preventing deletion when list is completed
- Touchpoints: `readOnly` flag derived from `isCompleted` state
- Mitigation: Delete button hidden when `readOnly=true`; handler checks `detailIsCompleted` before mutation
- Residual risk: None; UI and handler both enforce this rule
- Evidence: `$listId.tsx:733` — `isCompleted` derived from list status

## 12) UX / UI Impact

- Entry point: Ready view seller group card, line actions column
- Change: Add Trash2 icon button to the left of the Edit (Pencil) button
- User interaction: Click trash icon → confirmation dialog → confirm → line deleted and UI refreshes
- Dependencies: `ConfirmDialog` component, `useConfirm` hook, existing mutation infrastructure
- Evidence: `ready-line-row.tsx:190-203` — Current actions area shows Edit button; delete will precede it

---

- Entry point: Confirmation dialog modal
- Change: New dialog with title "Delete shopping list line?" and description "Are you sure you want to delete this line from the shopping list? This action cannot be undone."
- User interaction: User can cancel (ESC, overlay click, Cancel button) or confirm (Delete button)
- Dependencies: Matches list deletion dialog styling via `ConfirmDialog` component
- Evidence: `list-delete-confirm.tsx:28-33` — List deletion dialog structure

## 13) Deterministic Test Plan (new/changed behavior only)

- Surface: Ready view line deletion workflow
- Scenarios:
  - Given a shopping list in Ready state with lines, When user clicks delete icon and confirms, Then line is deleted and removed from UI
  - Given a shopping list in Ready state, When user clicks delete icon and cancels, Then line remains in the list
  - Given a shopping list in 'done' state, When viewing Ready view, Then delete icon is not visible
  - Given a line in Ready state, When deletion fails (backend error), Then error toast is shown and line remains in UI
  - Given multiple lines in Ready state, When deleting one line, Then only that line is removed
- Instrumentation / hooks:
  - `data-testid="shopping-lists.ready.line.{lineId}.actions.delete"`
  - `waitTestEvent(page, 'form', evt => evt.formId === 'ShoppingListLine:delete' && evt.phase === 'submit')`
  - `waitTestEvent(page, 'form', evt => evt.formId === 'ShoppingListLine:delete' && evt.phase === 'success')`
  - `page.getByRole('button', { name: /delete/i })` for confirmation dialog
- Gaps: None
- Evidence: `line-deletion-undo.spec.ts:17-109` — Concept deletion tests show pattern; Ready tests will be similar minus undo

---

- Surface: Ready view delete button visibility
- Scenarios:
  - Given a shopping list in Ready state with a line status 'new', When viewing the line row, Then delete button is visible
  - Given a shopping list in Ready state with a line status 'done', When viewing the line row, Then delete button is not visible
  - Given a shopping list in 'done' state, When viewing any line row, Then delete button is not visible
- Instrumentation / hooks: Standard Playwright visibility assertions on `data-testid`
- Gaps: None
- Evidence: `ready-line-row.tsx:146-148` — Actions area conditionally renders based on `readOnly`

## 14) Implementation Slices (only if large)

Not applicable — this is a small, self-contained feature.

## 15) Risks & Open Questions

- Risk: User confusion between Concept deletion (with undo) and Ready deletion (no undo)
- Impact: User may expect undo button for Ready deletion and be unable to restore mistakenly deleted line
- Mitigation: Confirmation dialog warns "This action cannot be undone"; consider adding more explicit messaging

---

- Risk: Backend may reject deletion in certain Ready states (e.g., line has received stock)
- Impact: User clicks delete, confirms, and receives error toast without understanding why
- Mitigation: Backend error messages should be clear; frontend displays them verbatim via toast

---

- Risk: Concurrent deletion attempts if user rapidly clicks delete on multiple lines
- Impact: Pending state tracking should prevent this, but race conditions could occur
- Mitigation: Existing `pendingLineIds` set already handles this; ensure delete handler uses it

---

- Question: Should delete button appear for lines in 'ordered' or 'done' status?
- Why it matters: Brief says "delete icon should only appear when the shopping list is in 'Ready' state" but doesn't specify line status restrictions
- Owner / follow-up: Resolved — delete button should appear for lines with status !== 'done' based on existing patterns in Ready view (edit button follows this rule)

---

- Question: Should deletion emit an undo toast like Concept state?
- Why it matters: Affects UX consistency and implementation complexity
- Owner / follow-up: Resolved — brief does not mention undo; confirmation dialog is the protection mechanism

## 16) Confidence

Confidence: High — The feature follows established patterns (confirmation dialogs, mutation hooks, instrumentation), reuses existing infrastructure, and has clear acceptance criteria. The main implementation is adding a button and wiring it to an existing mutation with a confirmation step.
