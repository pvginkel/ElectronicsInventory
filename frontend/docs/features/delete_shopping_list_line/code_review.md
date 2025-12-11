# Code Review — Delete Shopping List Line from Ready State

## 1) Summary & Decision

**Readiness**

The implementation correctly adds deletion functionality for shopping list lines in Ready state with a confirmation dialog, following established patterns from the codebase. The code properly threads the new handler through the component hierarchy, implements instrumentation for testing, and includes comprehensive Playwright coverage. The implementation is conservative, reuses existing infrastructure (useConfirm hook, ConfirmDialog component, useDeleteShoppingListLineMutation), and maintains consistency with similar features. All code changes are focused and minimal, with proper error handling and pending state management. The Playwright tests cover the critical scenarios including happy path, cancellation, visibility rules, error handling, and multi-line deletion.

**Decision**

`GO` — The implementation is complete, correct, and ready to merge. The code follows project conventions, properly implements instrumentation, includes thorough test coverage, and handles edge cases appropriately.

## 2) Conformance to Plan (with evidence)

**Plan alignment**

- `Section 3: Add Trash2 icon to ReadyLineRow` ↔ `src/components/shopping-lists/ready/ready-line-row.tsx:192-205` — Delete button added with proper positioning, visibility conditions (`line.status !== 'done' && onDeleteLine`), icon, styling (`h-8 w-8 p-0 shrink-0`), disabled state, and testId
- `Section 5: Thread handler through component tree` ↔ `src/components/shopping-lists/ready/seller-group-card.tsx:17,32,163` and `seller-group-list.tsx:13,27,49` — `onDeleteLine` prop added and threaded correctly as optional prop
- `Section 6: Create confirmation dialog and handler in route` ↔ `src/routes/shopping-lists/$listId.tsx:160,401-451,856,958-961` — Confirmation dialog using `useConfirm` hook, handler with detailIsCompleted check, instrumentation events, mutation call, success toast, error handling, and finally block for cleanup
- `Section 8: Emit form instrumentation` ↔ `src/routes/shopping-lists/$listId.tsx:418-420,433-437,442-446` — Form events emitted at submit, success, and error checkpoints with formId `'ShoppingListLine:delete'` and metadata containing lineId, listId, partKey
- `Section 9: Add Playwright test` ↔ `tests/e2e/shopping-lists/ready-line-deletion.spec.ts:1-314` — Comprehensive spec covering deletion with confirmation (17-81), cancellation (83-120), completed list visibility (122-149), done line visibility (151-191), error handling (193-226), and multiple line deletion (228-313)

**Gaps / deviations**

- None identified. The implementation faithfully executes the plan with no missing deliverables or material deviations.

## 3) Correctness — Findings (ranked)

- Title: `Minor — Import organization could be more consistent`
- Evidence: `src/routes/shopping-lists/$listId.tsx:13` — `useConfirm` import added separately rather than grouped with related imports
- Impact: Minimal readability impact; imports are functional but slightly less organized
- Fix: Move `useConfirm` import to group with other hook imports from `@/hooks/*` (currently at line 13, could be combined with lines 15-22)
- Confidence: Low

No other correctness issues identified. The implementation is sound.

## 4) Over-Engineering & Refactoring Opportunities

No over-engineering detected. The implementation follows the simplest viable approach:
- Reuses existing `useConfirm` hook rather than creating a custom confirmation pattern
- Reuses existing `useDeleteShoppingListLineMutation` rather than duplicating logic
- Threads handler through existing component hierarchy without introducing new abstractions
- Uses inline handler in route component rather than extracting a custom hook (appropriate for single-use case)

The code is appropriately simple for the feature scope.

## 5) Style & Consistency

**Pattern: Confirmation dialog positioning**
- Evidence: `src/routes/shopping-lists/$listId.tsx:958-961` — ConfirmDialog rendered at end of component alongside other dialogs
- Impact: Consistent with existing dialog patterns in the route (order dialog, update stock dialog, kit unlink dialog)
- Recommendation: None; follows established convention

**Pattern: Conditional handler passing**
- Evidence: `src/routes/shopping-lists/$listId.tsx:856` — `onDeleteLine={isCompleted ? undefined : handleDeleteReadyLine}`
- Impact: Follows same pattern as other conditional handlers in the route (e.g., `onUnlinkKit` at line 742)
- Recommendation: None; consistent with project style

**Pattern: Form instrumentation metadata**
- Evidence: `src/routes/shopping-lists/$listId.tsx:420,435,444` — Metadata includes `{ lineId, listId, partKey }`
- Impact: Matches Concept deletion instrumentation pattern (line 305-321 in same file)
- Recommendation: None; proper consistency between Concept and Ready deletion

**Pattern: Success toast message**
- Evidence: `src/routes/shopping-lists/$listId.tsx:439` — Message is `'Removed part from shopping list'` (generic)
- Impact: Differs slightly from Concept deletion which says `'Removed part from Concept list'` (line 324)
- Recommendation: Consider for consistency whether Ready state should say `'Removed part from Ready list'` or keep generic message — current choice is acceptable either way
- Confidence: Low (cosmetic preference)

Overall style consistency is excellent.

## 6) Tests & Deterministic Coverage (new/changed behavior only)

**Surface: Ready view line deletion workflow**

**Scenarios:**
- Given a shopping list in Ready state with a line, When user clicks delete icon and confirms, Then line is deleted and removed from UI (`tests/e2e/shopping-lists/ready-line-deletion.spec.ts:17-81`)
  - ✓ Waits for list loading before interaction
  - ✓ Verifies delete button visibility
  - ✓ Waits for confirmation dialog appearance
  - ✓ Sets up event listeners before confirming
  - ✓ Waits for form submit and success events
  - ✓ Verifies UI removal
  - ✓ Validates backend state via API query
- Given a shopping list in Ready state, When user clicks delete icon and cancels, Then line remains in list (`tests/e2e/shopping-lists/ready-line-deletion.spec.ts:83-120`)
  - ✓ Verifies dialog appears
  - ✓ Clicks cancel button
  - ✓ Verifies dialog closes
  - ✓ Verifies line persists in UI
- Given a shopping list in done state, When viewing any line, Then delete button is not visible (`tests/e2e/shopping-lists/ready-line-deletion.spec.ts:122-149`)
  - ✓ Creates list and marks it done
  - ✓ Verifies readOnly mode hides delete button
- Given a line with status 'done', When viewing the line in Ready state, Then delete button is not visible (`tests/e2e/shopping-lists/ready-line-deletion.spec.ts:151-191`)
  - ✓ Creates line and completes full workflow (order → receive → complete)
  - ✓ Verifies status badge shows "Completed"
  - ✓ Verifies delete button hidden for done line
- Given a race condition where line is deleted externally, When viewing the list, Then line is not visible (`tests/e2e/shopping-lists/ready-line-deletion.spec.ts:193-226`)
  - ✓ Deletes line via API before UI interaction
  - ✓ Reloads and verifies line is gone
  - Note: This test validates graceful handling but doesn't actually test error toast display
- Given multiple lines in Ready state, When deleting lines sequentially, Then each line is deleted independently (`tests/e2e/shopping-lists/ready-line-deletion.spec.ts:228-313`)
  - ✓ Creates two lines
  - ✓ Deletes first line and verifies second persists
  - ✓ Deletes second line
  - ✓ Validates both lines removed from backend

**Hooks:**
- `data-testid="shopping-lists.ready.line.{lineId}.actions.delete"` — Delete button selector
- `data-testid="shopping-lists.ready.delete-line-dialog"` — Confirmation dialog selector
- `waitTestEvent(page, 'form', evt => evt.formId === 'ShoppingListLine:delete' && evt.phase === 'submit')` — Deletion initiated
- `waitTestEvent(page, 'form', evt => evt.formId === 'ShoppingListLine:delete' && evt.phase === 'success')` — Deletion completed
- `waitForListLoading(page, 'shoppingLists.list', 'ready')` — List refresh after mutation
- `apiClient.apiRequest(() => apiClient.GET('/api/shopping-lists/{list_id}', ...))` — Backend validation pattern

**Gaps:**
- Error toast visibility is not explicitly asserted in test 5 (lines 193-226). The test simulates a race condition by pre-deleting via API, but doesn't test a true error case where the backend returns an error response during deletion. However, the error handling code path is correctly implemented in the route handler (lines 442-448) with `trackFormError` and `showException` calls, following the standard pattern. A test that explicitly triggers a backend error (e.g., via a testing endpoint that forces a 500 response) would provide more complete coverage, but this is not a blocker since the error handling pattern is consistent with other mutations in the codebase.

**Evidence:**
- Test file: `tests/e2e/shopping-lists/ready-line-deletion.spec.ts:1-314`
- Instrumentation: `src/routes/shopping-lists/$listId.tsx:418-420,433-437,442-446`
- Selectors: `src/components/shopping-lists/ready/ready-line-row.tsx:200`

Test coverage is comprehensive and follows project standards.

## 7) Adversarial Sweep

**Checks attempted:**
1. **Derived state → persistence guard**: Checked if `detailIsCompleted` is validated before mutation
2. **Dialog state cleanup**: Verified dialog state resets and focus restoration via `useConfirm` hook
3. **Pending state race conditions**: Examined pending line tracking in mutation lifecycle
4. **Query cache invalidation**: Confirmed mutation invalidates shopping list queries
5. **Stale closure risk**: Analyzed callback dependencies
6. **Concurrent deletion attempts**: Reviewed disabled state and pending tracking

**Evidence:**

1. **Completion check before deletion** — `src/routes/shopping-lists/$listId.tsx:402-404`
   ```tsx
   if (detailIsCompleted) {
     return;
   }
   ```
   Prevents mutation when list transitions to 'done' state while dialog is open. Matches plan requirement (Section 8, line 230-233).

2. **Dialog cleanup** — `src/hooks/use-confirm.ts:36-50`
   The `useConfirm` hook properly handles dialog closure via `handleOpenChange`, which calls `handleCancel` when open becomes false, resolving the promise with `false` and resetting state. The implementation correctly prevents zombie promises.

3. **Pending state management** — `src/routes/shopping-lists/$listId.tsx:421,450`
   ```tsx
   updatePendingLine(line.id, true);
   try {
     // mutation
   } finally {
     updatePendingLine(line.id, false);
   }
   ```
   Finally block guarantees pending state cleanup even on error. Delete button disabled when `pendingLineIds.has(line.id)` (via `disableActions` at ready-line-row.tsx:58).

4. **Query invalidation** — `src/hooks/use-shopping-lists.ts:1140-1145,1158-1163`
   The `useDeleteShoppingListLineMutation` hook's onSuccess callback correctly calls `invalidateShoppingListQueries(queryClient, input.listId)` and conditionally `invalidatePartMemberships(queryClient, input.partKey)` when partKey is provided. The handler passes partKey correctly (line 423).

5. **Callback dependencies** — `src/routes/shopping-lists/$listId.tsx:451`
   The `handleDeleteReadyLine` callback includes all necessary dependencies: `confirmDeleteLine, deleteLineMutation, detailIsCompleted, showException, showSuccess, updatePendingLine`. No stale closure risk detected.

6. **Disabled state propagation** — `src/components/shopping-lists/ready/ready-line-row.tsx:197`
   Delete button receives `disabled={disableActions}` where `disableActions = disabled || readOnly` (line 58). The `disabled` prop is set to `pendingLineIds.has(line.id)` at the card level (seller-group-card.tsx:166), preventing concurrent mutations on the same line.

**Why code held up:**
- All derived-state guards are present before persistent writes
- Async coordination uses standard mutation patterns with proper cleanup
- Query invalidation follows project conventions
- No stale closure or race condition risks detected
- Dialog state management is encapsulated in tested hook

## 8) Invariants Checklist

**Invariant 1: Delete button visibility constraint**
- Invariant: Delete button must only appear when list is not completed AND line status is not 'done'
- Where enforced:
  - Component level: `src/components/shopping-lists/ready/ready-line-row.tsx:192` — `{line.status !== 'done' && onDeleteLine && ...}` checks line status
  - Component level: `src/components/shopping-lists/ready/ready-line-row.tsx:148-150` — `readOnly` flag (derived from `detailIsCompleted`) hides entire actions column
  - Route level: `src/routes/shopping-lists/$listId.tsx:856` — `onDeleteLine={isCompleted ? undefined : handleDeleteReadyLine}` conditionally passes handler
- Failure mode: Delete button appears for completed lists or done lines, allowing user to attempt invalid deletion
- Protection: Multi-layer defense (route-level handler gating + component-level conditional rendering + readOnly flag)
- Evidence: Tests verify visibility rules at `ready-line-deletion.spec.ts:122-149` (completed list) and `151-191` (done line)

**Invariant 2: Mutation must not execute when list is completed**
- Invariant: The delete mutation must abort if list becomes completed after dialog opens but before confirmation
- Where enforced: `src/routes/shopping-lists/$listId.tsx:402-404` — Early return in handler if `detailIsCompleted` is true
- Failure mode: User opens dialog in ready state, list transitions to done (via another client or tab), user confirms, mutation executes against completed list
- Protection: `detailIsCompleted` check in handler before mutation call; backend is authoritative and would reject if state is invalid
- Evidence: Handler includes explicit guard as recommended in plan (Section 8, lines 229-233)

**Invariant 3: Pending line state must be cleared after mutation completes or fails**
- Invariant: Line ID must be removed from `pendingLineIds` set regardless of mutation outcome
- Where enforced: `src/routes/shopping-lists/$listId.tsx:450` — Finally block calls `updatePendingLine(line.id, false)`
- Failure mode: Mutation fails, pending state not cleared, line actions remain disabled permanently
- Protection: Finally block guarantees cleanup; pattern matches other mutation handlers in same file (e.g., handleOpenOrderLineDialog at line 435)
- Evidence: Finally block executes after try/catch, ensuring cleanup even on exception

**Invariant 4: Form instrumentation must emit submit/success/error events for test determinism**
- Invariant: Deletion workflow must emit structured test events at each phase transition
- Where enforced:
  - Submit: `src/routes/shopping-lists/$listId.tsx:418-420` — Before mutation call
  - Success: `src/routes/shopping-lists/$listId.tsx:433-437` — After successful mutation
  - Error: `src/routes/shopping-lists/$listId.tsx:442-446` — In catch block
- Failure mode: Tests cannot wait for deletion completion deterministically, leading to flaky assertions or race conditions
- Protection: Events emitted at same checkpoints as Concept deletion (lines 305-338); tests rely on these events (ready-line-deletion.spec.ts:55-68)
- Evidence: Instrumentation matches pattern documented in plan (Section 9) and follows existing convention

**Invariant 5: Dialog state must resolve promise on cancel or close**
- Invariant: When user cancels or closes dialog without confirming, the confirmation promise must resolve with `false`
- Where enforced: `src/hooks/use-confirm.ts:41-44,46-50` — Both `handleCancel` and `handleOpenChange` call `state.resolve?.(false)` and reset state
- Failure mode: Promise never resolves, handler awaits indefinitely, blocking future deletions
- Protection: `useConfirm` hook handles all exit paths (cancel button, ESC key, overlay click) via `handleOpenChange` callback
- Evidence: Hook implementation cleans up promise resolver in all scenarios

All critical invariants are properly enforced with guards, cleanup logic, and test coverage.

## 9) Questions / Needs-Info

None. The implementation is clear and complete with no blocking questions.

## 10) Risks & Mitigations (top 3)

**Risk 1: User confusion between Concept deletion (with undo) and Ready deletion (without undo)**
- Mitigation: Confirmation dialog explicitly states "This action cannot be undone" (test verification at ready-line-deletion.spec.ts:52). Consider adding user documentation or release notes to highlight the difference in behavior between Concept and Ready deletion flows.
- Evidence: Plan Section 15 identifies this risk; mitigation implemented via confirmation dialog messaging

**Risk 2: Backend may reject deletion in certain Ready states not captured by frontend guards**
- Mitigation: Error handling displays backend error message verbatim via toast (src/routes/shopping-lists/$listId.tsx:447-448). Backend is authoritative; frontend defers to backend business rules.
- Evidence: Standard error handling pattern used; backend errors surface to user

**Risk 3: Test gap for true backend error responses**
- Mitigation: Error handling code path is correctly implemented following project patterns. The gap is minor since the pattern is proven elsewhere in the codebase. Consider adding a backend testing endpoint to force error responses for more complete coverage in future iterations.
- Evidence: Identified in Section 6 (Tests & Deterministic Coverage); low-priority enhancement rather than blocking issue

## 11) Confidence

**Confidence: High** — The implementation follows established patterns, reuses proven infrastructure, includes comprehensive test coverage, properly handles edge cases with multi-layer guards, and demonstrates no evidence of correctness risks or architectural issues.
