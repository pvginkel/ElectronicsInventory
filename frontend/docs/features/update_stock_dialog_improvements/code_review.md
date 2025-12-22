# Code Review: Update Stock Dialog Improvements

## 1) Summary & Decision

**Readiness**

The implementation correctly delivers the planned UI improvements to the Update Stock Dialog with proper sequential save+complete operations, updated button layout, and cover image integration. The code demonstrates solid understanding of React 19 patterns, TanStack Query integration, and test instrumentation requirements. However, there is a critical bug in the retry logic that accesses a stale closure variable, and the test updates are incomplete with one test scenario failing to match the new behavior.

**Decision**

`GO-WITH-CONDITIONS` — The implementation is functionally sound but requires two fixes before merging:
1. Fix the stale closure bug in `handleMarkDone` retry path (line 510 in update-stock-dialog.tsx)
2. Update the test to match the new Complete Item behavior and verify all test scenarios pass

## 2) Conformance to Plan (with evidence)

**Plan alignment**

- Plan Section 1 (Intent & Scope) ↔ `src/components/shopping-lists/ready/update-stock-dialog.tsx:453-608`
  - "Complete Item" button now saves allocations before completing (lines 458-515)
  - "Save Stock" renamed to "Save Item" (line 856)
  - "Save & Next" button removed entirely (no longer in footer lines 837-870)
  - Button layout updated with Cancel on left, action buttons grouped on right (lines 837-870)

- Plan Section 2 (Affected Areas) ↔ Implementation files
  - `SubmitMode` type updated from `'save' | 'saveAndNext'` to `'save' | 'complete' | 'complete-retry'` (line 58)
  - Cover image added to part card using `CoverImageDisplay` component (lines 636-639)
  - `hasNextLine` prop removed from `UpdateStockDialogProps` (line 61, removed)
  - Route handler updated to accept new submit modes (src/routes/shopping-lists/$listId.tsx:560)

- Plan Section 5 (Algorithms & UI Flows) ↔ `update-stock-dialog.tsx:453-608`
  - Sequential save + complete flow implemented with `receiveSucceededRef` for partial failure tracking (lines 256, 458-515)
  - Retry logic skips receive call when `receiveSucceededRef.current === true` (lines 503-515)
  - Form instrumentation tracks both operations with proper mode values (lines 475-514, 532-595)

- Plan Section 9 (Observability) ↔ Test instrumentation
  - Form events include updated mode field: `'save' | 'complete' | 'complete-retry'` (lines 381, 480, 509)
  - Data test IDs updated: kept `submit` for Save Item, removed `submit-next`, kept `mark-done` for Complete Item (lines 854, 865)
  - Page object helper `submitReceiveForm` updated to remove mode parameter (tests/support/page-objects/shopping-lists-page.ts:524-526)

**Gaps / deviations**

- Plan Section 13 (Deterministic Test Plan) — Partial completion
  - Plan specified comprehensive test scenarios including retry scenarios with mode tracking
  - Implementation updated one test (`shopping-lists.spec.ts:1042-1085`) but the test logic doesn't fully match the new Complete Item behavior (still checks for receive events separately rather than as part of Complete Item flow)
  - Missing test coverage for: successful complete with received === ordered (no mismatch dialog), retry after partial failure with mode 'complete-retry', allocation modification after partial failure resetting retry flag
  - Evidence: `tests/e2e/shopping-lists/shopping-lists.spec.ts:1042-1085` — test updated but needs alignment with new flow

- Plan Section 12 (UX/UI Impact) — Cover image implementation matches plan
  - Cover image correctly integrated at `update-stock-dialog.tsx:636-639`
  - Uses `line.part.key` as `partId` prop (matches plan's correction about using key, not id)
  - No `hasCoverAttachment` hint provided (acceptable per plan; component queries on-demand)

## 3) Correctness — Findings (ranked)

- Title: `Major — Stale closure in retry path accessing wrong variable`
- Evidence: `src/components/shopping-lists/ready/update-stock-dialog.tsx:510` — In the retry branch (when `receiveSucceededRef.current === true`), the code accesses `allocationValidation` which is defined outside the `handleMarkDone` async function scope at line 327-330. This variable is derived from `form.values.allocations` via `useMemo`, but inside the retry branch it's being used at line 510 without being redefined, while the first-attempt branch redefines it at line 460.
- Impact: When retrying a failed completion, the instrumentation event will report incorrect `receiveQuantity` and `allocationCount` values from the stale closure, causing test assertions to fail or report misleading data. The values used at lines 536-540 and 591-595 also reference this stale `allocationValidation`.
- Fix: Move the `allocationValidation` calculation to the top of `handleMarkDone` before the conditional branches:
  ```typescript
  const handleMarkDone = async () => {
    if (!line) {
      return;
    }

    // Calculate validation once at the start for use in all paths
    const allocationValidation = validateAllocations(form.values.allocations);
    const receiveQuantity = allocationValidation.totalReceive;

    if (!receiveSucceededRef.current) {
      // First attempt path - validate and save allocations
      if (!allocationValidation.isValid || receiveQuantity < 1) {
        // ... validation error handling
      }
      // ... rest of first attempt logic
    } else {
      // Retry path - use the validation calculated above
      submitModeRef.current = 'complete-retry';
      formInstrumentation.trackSubmit({
        listId: line.shoppingListId,
        lineId: line.id,
        mode: 'complete-retry',
        receiveQuantity,  // Now using fresh calculation
        allocationCount: form.values.allocations.reduce<number>((count, allocation) => {
          return allocationToPayload(allocation) ? count + 1 : count;
        }, 0),
      });
    }
    // ... rest of completion logic uses fresh allocationValidation
  };
  ```
- Confidence: High — This is a clear closure bug. The retry path references a variable from outer scope that won't reflect current form state.

---

- Title: `Major — Test scenario doesn't match new Complete Item behavior`
- Evidence: `tests/e2e/shopping-lists/shopping-lists.spec.ts:1042-1085` — The test "marks ordered line done with mismatch confirmation" waits for receive events at lines 1051-1061 but then attempts to call `markUpdateStockDone()` at line 1073 without first having data in the form. The test fills allocation data at line 1045 but the new implementation expects Complete Item to save allocations AND complete in one operation.
- Impact: This test may be asserting on the wrong event sequence. The test expects separate receive submit/success events followed by complete events, but the new flow should have Complete Item trigger receive, then completion. The test's structure suggests it's checking for old save-then-complete workflow rather than integrated Complete Item workflow.
- Fix: Update the test scenario to match the plan's Section 13 requirements:
  ```typescript
  // Fill allocation data - received quantity (1) is less than ordered quantity (3), so mismatch dialog should appear
  await shoppingLists.setNewAllocationRow(0, { box: box.box_no, location: 6, receive: 1 });

  // Clear events before clicking Complete Item
  await testEvents.clearEvents();

  // Set up event listeners for the Complete Item flow (receive + complete)
  const receiveSubmit = testEvents.waitForEvent(event =>
    event.kind === 'form' &&
    (event as FormTestEvent).formId === `ShoppingListLineReceive:line:${lineId}` &&
    (event as FormTestEvent).phase === 'submit' &&
    (event as FormTestEvent).metadata?.mode === 'complete'  // Verify mode is 'complete'
  );
  const receiveSuccess = testEvents.waitForEvent(event =>
    event.kind === 'form' &&
    (event as FormTestEvent).formId === `ShoppingListLineReceive:line:${lineId}` &&
    (event as FormTestEvent).phase === 'success' &&
    (event as FormTestEvent).metadata?.mode === 'complete'
  );
  const completeSubmit = testEvents.waitForEvent(/* ... */);
  const completeSuccess = testEvents.waitForEvent(/* ... */);

  // Click Complete Item which should save stock AND show mismatch dialog
  await shoppingLists.markUpdateStockDone();

  // Wait for receive to complete (happens before mismatch dialog)
  const receiveSubmitEvent = await receiveSubmit as FormTestEvent;
  expect(receiveSubmitEvent.metadata).toMatchObject({
    mode: 'complete',  // Verify correct mode
    receiveQuantity: 1,
    allocationCount: 1
  });

  // Now confirm the mismatch (dialog should be visible)
  await shoppingLists.confirmMismatch('Supplier short shipped remaining quantity');

  // Wait for all success events
  const [receiveSuccessEvent, completeSubmitEvent, completeSuccessEvent] = await Promise.all([
    receiveSuccess, completeSubmit, completeSuccess
  ]);

  expect(receiveSuccessEvent.metadata).toMatchObject({ mode: 'complete', receiveQuantity: 1, allocationCount: 1 });
  ```
- Confidence: High — The test structure and comments indicate it was updated but not fully aligned with the new integrated Complete Item flow.

---

- Title: `Minor — Removed Save & Next test coverage without documenting removal`
- Evidence: `tests/e2e/shopping-lists/shopping-lists.spec.ts:1008` — Entire "processes Save & next flow across ordered lines" test (142 lines) deleted without adding a comment or migration note explaining why the coverage was removed.
- Impact: Future developers may wonder why sequential line processing isn't tested. While the feature was intentionally removed per plan, the test deletion lacks documentation.
- Fix: Add a comment above the remaining tests indicating the removed coverage:
  ```typescript
  // Note: "Save & Next" button was removed in Update Stock Dialog improvements (2024-12).
  // Sequential line processing tests were removed as the feature is no longer supported.
  // Users now complete items individually and manually navigate to the next line.
  ```
- Confidence: Medium — This is a documentation/maintainability concern rather than a functional bug.

---

- Title: `Minor — Incomplete handling of dialog close on save-only mode`
- Evidence: `src/routes/shopping-lists/$listId.tsx:588-590` — Comment states "if mode is 'save' (save-only without completion)" the dialog closes, but the condition checking this is inside the try block after `onSubmit` succeeds. If the mutation throws, the dialog state update won't execute, which is correct, but the comment could be clearer about the success precondition.
- Impact: Minor clarity issue; behavior is correct but comment could mislead readers.
- Fix: Clarify the comment:
  ```typescript
  // Note: If mode is 'complete' or 'complete-retry', the dialog will handle
  // calling onMarkDone after this succeeds, then close on completion success.
  // For mode 'save', close the dialog immediately after successful receive.
  if (payload.mode === 'save') {
    setUpdateStockState(prev => ({ open: false, line: null, trigger: prev.trigger }));
  }
  ```
- Confidence: Medium — Behavior is correct; this is a clarity improvement.

## 4) Over-Engineering & Refactoring Opportunities

- Hotspot: `update-stock-dialog.tsx:handleMarkDone` function (lines 453-608)
- Evidence: The function mixes allocation validation, receive API calling, form instrumentation, completion logic, and mismatch dialog handling in 155 lines
- Suggested refactor: Extract a helper function `saveAllocationsForCompletion` that handles lines 458-515 (validation, tracking, API call, error handling). This would:
  ```typescript
  const saveAllocationsForCompletion = async (
    line: ShoppingListConceptLine,
    allocations: AllocationDraft[],
    onSubmit: (payload: ...) => Promise<void>,
    formInstrumentation: FormInstrumentation
  ): Promise<{ receiveQuantity: number; allocationCount: number }> => {
    const allocationValidation = validateAllocations(allocations);
    const receiveQuantity = allocationValidation.totalReceive;

    if (!allocationValidation.isValid || receiveQuantity < 1) {
      setShowAllocationErrors(true);
      formInstrumentation.trackValidationErrors({
        allocations: allocationValidation.summary ?? 'Allocation validation failed',
      });
      throw new Error('Validation failed');
    }

    const allocationsPayload = allocations
      .map(allocationToPayload)
      .filter((allocation): allocation is ShoppingListLineReceiveAllocationInput => allocation != null);

    submitModeRef.current = 'complete';
    formInstrumentation.trackSubmit({
      listId: line.shoppingListId,
      lineId: line.id,
      mode: 'complete',
      receiveQuantity,
      allocationCount: allocationsPayload.length,
    });

    try {
      await onSubmit({ mode: 'complete', receiveQuantity, allocations: allocationsPayload });
      return { receiveQuantity, allocationCount: allocationsPayload.length };
    } catch (error) {
      formInstrumentation.trackError({
        listId: line.shoppingListId,
        lineId: line.id,
        mode: 'complete',
        receiveQuantity,
        allocationCount: allocationsPayload.length,
      });
      throw error;
    }
  };
  ```
  Then `handleMarkDone` becomes:
  ```typescript
  const handleMarkDone = async () => {
    if (!line) return;

    let metrics: { receiveQuantity: number; allocationCount: number };

    if (!receiveSucceededRef.current) {
      metrics = await saveAllocationsForCompletion(line, form.values.allocations, onSubmit, formInstrumentation);
      receiveSucceededRef.current = true;
    } else {
      // Retry path - calculate current metrics without re-submitting
      metrics = calculateCurrentMetrics(form.values.allocations);
      trackRetrySubmit(line, metrics, formInstrumentation);
    }

    // Proceed to completion logic with metrics
    await handleCompletionFlow(line, metrics);
  };
  ```
- Payoff: Improved testability (can unit test allocation saving independently), clearer separation of concerns, easier to debug partial failures
- Note: This refactor is optional for this change but would improve maintainability for future enhancements

## 5) Style & Consistency

- Pattern: Inconsistent calculation of `allocationCount` across the file
- Evidence:
  - Lines 374-376 (form instrumentation snapshot): `form.values.allocations.reduce<number>((count, allocation) => { return allocationToPayload(allocation) ? count + 1 : count; }, 0)`
  - Lines 404-407 (list loading instrumentation): Same pattern
  - Lines 511-513 (retry path): Same pattern
  - Lines 537-539, 592-594 (success tracking): Same pattern
- Impact: Code duplication makes maintenance harder; if the counting logic needs to change, 5+ locations must be updated
- Recommendation: Extract to a helper function at the top of the component:
  ```typescript
  const countValidAllocations = (allocations: AllocationDraft[]): number => {
    return allocations.reduce<number>((count, allocation) => {
      return allocationToPayload(allocation) ? count + 1 : count;
    }, 0);
  };
  ```
  Then replace all instances with `countValidAllocations(form.values.allocations)` or `countValidAllocations(allocations)` as appropriate.

---

- Pattern: Form success tracking duplicated in two branches of `handleMarkDone`
- Evidence:
  - Lines 532-540 (no mismatch completion success)
  - Lines 587-595 (mismatch completion success)
  - Identical logic calling `formInstrumentation.trackSuccess` with same metadata structure
- Impact: Violates DRY principle; increases risk of inconsistency if one branch is updated
- Recommendation: Extract success tracking to a helper called after both completion paths succeed:
  ```typescript
  const trackCompleteSuccess = (mode: SubmitMode, allocationValidation: AllocationValidationResult) => {
    formInstrumentation.trackSuccess({
      listId: line!.shoppingListId,
      lineId: line!.id,
      mode,
      receiveQuantity: allocationValidation.totalReceive,
      allocationCount: countValidAllocations(form.values.allocations),
    });
  };
  ```

## 6) Tests & Deterministic Coverage (new/changed behavior only)

- Surface: Update Stock Dialog "Complete Item" button with sequential save + complete
- Scenarios:
  - Given allocations entered with received === ordered, When user clicks "Complete Item", Then receive API called with mode 'complete', Then complete API called without mismatch dialog, Then dialog closes, Then line status is "done" — **MISSING**
  - Given allocations entered with received !== ordered, When user clicks "Complete Item", Then receive API called with mode 'complete', Then mismatch dialog opens, When user confirms mismatch, Then complete API called, Then line marked done — `tests/e2e/shopping-lists/shopping-lists.spec.ts:1042-1085` (PARTIAL; needs alignment as noted in Finding #2)
  - Given receive succeeds but complete fails, When user clicks "Complete Item" again without modifying allocations, Then receive API NOT called, Then instrumentation shows mode 'complete-retry', Then only complete API called — **MISSING**
  - Given partial failure occurred and user modifies allocations, When allocations change, Then receiveSucceededRef reset, When "Complete Item" clicked, Then receive API called again with fresh data, Then mode is 'complete' (not 'complete-retry') — **MISSING**
- Hooks: Form instrumentation events with `formId: 'ShoppingListLineReceive:line:{lineId}'`, metadata includes `mode` field for differentiating flows
- Gaps:
  - No test coverage for successful complete without mismatch dialog (received === ordered)
  - No test coverage for retry scenarios with mode 'complete-retry'
  - No test coverage for allocation modification resetting retry flag
  - Existing mismatch test needs update to properly assert on integrated Complete Item flow
- Evidence: Plan Section 13 specified these scenarios; only one partially implemented

---

- Surface: Update Stock Dialog "Save Item" button (renamed from "Save Stock")
- Scenarios:
  - Given allocations entered, When user clicks "Save Item", Then receive API called with mode 'save', Then dialog closes, Then line status remains "ordered" — `tests/e2e/shopping-lists/shopping-lists.spec.ts:980-1006` (test references `submitReceiveForm()` which was updated to remove mode parameter, test should still pass)
- Hooks: Form events with mode 'save', button test ID `shopping-lists.ready.update-stock.submit`
- Gaps: None for save-only flow; existing test coverage adequate
- Evidence: Test at line 980 updated to call `submitReceiveForm()` without mode parameter

---

- Surface: Cover Image Display in part card
- Scenarios:
  - Given a part with cover attachment, When dialog opens, Then cover image displayed — **MISSING**
  - Given a part without cover attachment, When dialog opens, Then no cover image shown (no placeholder) — **MISSING**
- Hooks: `CoverImageDisplay` component, part card section with test ID scope `shopping-lists.ready.update-stock.line.metric.*` (though cover doesn't have specific test ID)
- Gaps: No test scenarios verify cover image presence or absence; plan Section 13 indicated this was in scope
- Evidence: Plan specified cover image testing scenarios; none implemented

---

- Surface: Button layout changes (Cancel on left, action buttons grouped on right)
- Scenarios:
  - Given dialog open, When inspecting footer, Then "Save & Next" button not present — Can be verified in any existing test that opens the dialog
  - Given dialog open, When inspecting footer, Then button order is Cancel, Save Item, Complete Item — **MISSING** (no explicit layout test)
- Hooks: Button test IDs `shopping-lists.ready.update-stock.submit`, `shopping-lists.ready.update-stock.mark-done`
- Gaps: No explicit layout verification; existing tests will implicitly verify buttons exist and work
- Evidence: Plan suggested layout verification; none implemented (acceptable as optional)

## 7) Adversarial Sweep

- Title: `Major — Race condition if user rapidly clicks Complete Item during retry`
- Evidence: `update-stock-dialog.tsx:453-608` — The `handleMarkDone` function is async and sets `receiveSucceededRef.current = true` at line 492 after the receive API call succeeds. However, there's no guard preventing concurrent invocations of `handleMarkDone`.
- Attack vector:
  1. User clicks "Complete Item"
  2. Receive succeeds, `receiveSucceededRef.current = true` at line 492
  3. Completion fails (e.g., network error)
  4. User rapidly clicks "Complete Item" twice before `isCompleting` flag is set
  5. First retry enters retry path (line 503), second retry also enters retry path
  6. Both attempt completion simultaneously
- Impact: Two concurrent completion API calls could be issued, potentially causing backend race conditions or duplicate completion attempts
- Mitigation: The `isCompleting` flag (from props) should prevent this, but verify that the flag is set BEFORE the async work begins and that the button's `disabled` prop reacts immediately. Current implementation at line 863 shows `disabled={!line || isCompleting}`, which should work IF `isCompleting` is set synchronously by the parent route handler. Verify parent sets `isCompleting` at the start of `handleMarkLineDone` (route file line ~627).
- Confidence: Medium — The guard exists via `isCompleting` prop but requires parent cooperation; worth verifying in integration test

---

- Title: `Minor — Stale line prop during completion could show wrong metrics`
- Evidence: `update-stock-dialog.tsx:518, 552` — The code checks `line.received === line.ordered` to determine if mismatch dialog is needed. However, `line` prop comes from parent and may not reflect the just-completed receive operation.
- Attack vector:
  1. Line initially has `received: 0, ordered: 3`
  2. User allocates 3 items and clicks "Complete Item"
  3. Receive API succeeds, backend updates line to `received: 3`
  4. Component's `line` prop still shows `received: 0` (parent hasn't re-fetched yet)
  5. Code checks `line.received === line.ordered` → `0 === 3` → false
  6. Mismatch dialog incorrectly opens despite quantities matching
- Impact: User is forced to enter a mismatch reason even when quantities match after the save operation
- Mitigation: After successful receive in the "complete" flow, compare the SUBMITTED `receiveQuantity` against `line.ordered` rather than trusting the stale `line.received` value:
  ```typescript
  const totalReceivedAfterSave = (line.received + receiveQuantity);
  if (totalReceivedAfterSave === line.ordered) {
    // No mismatch dialog needed
  } else {
    // Show mismatch dialog
  }
  ```
  Or better: Have the parent invalidate the shopping list query after successful receive so `line` prop updates before completion logic runs.
- Confidence: High — This is a real edge case that would surface in the scenario: "user receives exact remaining quantity to complete the order"

---

- Title: `Low — Cover image query not aborted on dialog close`
- Evidence: `update-stock-dialog.tsx:636-639` — `CoverImageDisplay` component is rendered and begins fetching cover metadata when dialog opens. No abort signal or cleanup is specified.
- Attack vector:
  1. User opens Update Stock dialog (cover query starts)
  2. User immediately closes dialog before query completes
  3. Query completes after unmount, attempting state update on unmounted component
- Impact: Potential React warning about state updates on unmounted component; minor performance waste
- Mitigation: Verify that `CoverImageDisplay` and its internal `useCoverAttachment` hook properly clean up subscriptions. TanStack Query should handle this automatically via its internal cleanup, but worth verifying no warnings appear in tests.
- Confidence: Low — TanStack Query typically handles this; likely a non-issue but worth monitoring for console warnings

## 8) Invariants Checklist

- Invariant: Form success instrumentation event must only fire after BOTH receive and complete operations succeed when mode is 'complete' or 'complete-retry'
  - Where enforced: `update-stock-dialog.tsx:532-540` (no-mismatch path), `lines 587-595` (mismatch path) — Both call `formInstrumentation.trackSuccess` only after `onMarkDone` resolves successfully
  - Failure mode: If `trackSuccess` were called after receive but before complete, tests would see success event while line is still in received (not completed) state
  - Protection: Success tracking is only invoked inside try blocks after both async operations complete; catch blocks at lines 541-549 and 600-607 skip success tracking on completion failure
  - Evidence: Lines 532, 587 show success tracking is the last step in both completion paths

---

- Invariant: `receiveSucceededRef.current` must be reset to false when dialog opens or when user modifies allocations
  - Where enforced:
    - Dialog open effect at `update-stock-dialog.tsx:342` resets to false when dialog opens
    - Allocation change handler at `update-stock-dialog.tsx:436` resets to false when user edits allocations
  - Failure mode: If not reset on allocation change, user could modify allocation data, retry completion, and the retry would skip re-submitting the changed data, resulting in backend state mismatch
  - Protection: Two explicit reset points cover both scenarios; ref is only set to true at line 492 after successful receive
  - Evidence: Lines 342, 436 show defensive resets; line 492 shows single set-true location

---

- Invariant: Allocation validation must use current form state, not stale closures, in all code paths
  - Where enforced: Currently VIOLATED (see Finding #1) — retry path at line 510 references stale `allocationValidation` from outer scope
  - Failure mode: Retry path reports incorrect metrics in instrumentation events and completion logic may use wrong receive quantity
  - Protection: **MISSING** — needs fix as described in Finding #1
  - Evidence: Line 510 accesses stale closure; lines 327-330 define outer `allocationValidation` that won't update when `handleMarkDone` executes

---

- Invariant: Dialog must close only after successful completion of all operations (receive + complete for Complete Item, receive only for Save Item)
  - Where enforced:
    - Route handler at `src/routes/shopping-lists/$listId.tsx:588-590` closes dialog only in save-only mode after successful receive
    - For complete mode, dialog remains open until completion succeeds (dialog doesn't close itself; parent closes via `onClose` callback which is triggered by successful `onMarkDone` at parent level)
  - Failure mode: If dialog closed prematurely (e.g., after receive but before complete), user would lose context and line would be in inconsistent state
  - Protection: Route handler explicitly checks mode before closing; complete mode doesn't close dialog in route handler, relies on parent lifecycle
  - Evidence: Route handler lines 588-590 show conditional close; dialog only calls `onClose` via `handleClose` function which is wired to user Cancel action, not automatic on partial success

## 9) Questions / Needs-Info

- Question: Does the parent route handler in `src/routes/shopping-lists/$listId.tsx` properly invalidate the shopping list query after successful receive AND before calling completion logic?
- Why it matters: Finding #7.2 (Adversarial Sweep) identified that completion logic checks `line.received === line.ordered`, but `line` prop may be stale after the receive API call succeeds. If the query isn't invalidated, the mismatch dialog logic will use outdated received quantity.
- Desired answer: Trace the query invalidation in the route's `handleReceiveSubmit` function. Confirm that either (a) the mutation automatically invalidates and the component re-renders with fresh `line` prop before `handleMarkDone` checks the quantities, or (b) the completion logic needs to be updated to use submitted quantities rather than `line.received`.

---

- Question: Are there existing integration tests that verify the `isCompleting` flag prevents concurrent completion attempts?
- Why it matters: Finding #7.1 (Adversarial Sweep) identified potential race condition if user rapidly clicks Complete Item during retry. The `isCompleting` flag should prevent this, but it relies on parent state management.
- Desired answer: Identify if any test scenario exercises rapid clicking or concurrent mutations. If not, consider adding a test that attempts to click Complete Item while `isCompleting` is true and verifies the button is disabled.

---

- Question: Does the `CoverImageDisplay` component handle cleanup properly when unmounted before query completes?
- Why it matters: Finding #7.3 noted potential state updates on unmounted component if dialog closes quickly after opening
- Desired answer: Review `CoverImageDisplay` implementation and confirm TanStack Query's automatic cleanup prevents warnings. If console warnings appear in tests, add abort signal or effect cleanup.

## 10) Risks & Mitigations (top 3)

- Risk: Stale closure bug in retry path will cause incorrect instrumentation data and potential completion logic errors (Finding #1)
- Mitigation: Implement the fix described in Finding #1 to recalculate `allocationValidation` at the start of `handleMarkDone` before conditional branches. Run full Playwright suite to verify instrumentation events contain correct metadata in all scenarios.
- Evidence: `update-stock-dialog.tsx:510`, Finding #1 provides detailed fix

---

- Risk: Incomplete test coverage leaves retry logic and no-mismatch completion paths unverified (Findings #2, Section 6)
- Mitigation: Before merging, add at least two test scenarios: (1) Complete Item with received === ordered (no mismatch dialog), (2) Retry after partial failure showing mode 'complete-retry' and skipped receive call. Update the existing mismatch test to properly assert on the integrated Complete Item flow.
- Evidence: `tests/e2e/shopping-lists/shopping-lists.spec.ts:1042-1085`, Section 6 gaps analysis

---

- Risk: Stale `line.received` prop during completion may incorrectly trigger mismatch dialog (Finding #7.2)
- Mitigation: Review parent route's query invalidation timing. If invalidation happens asynchronously, update the mismatch check logic to calculate `totalReceivedAfterSave = line.received + receiveQuantity` and compare against `line.ordered`. Add a test scenario that verifies completing an item by receiving the exact remaining quantity (e.g., line has received: 1, ordered: 3, user allocates 2, clicks Complete Item, no mismatch dialog should appear).
- Evidence: `update-stock-dialog.tsx:518`, Finding #7.2 attack vector

## 11) Confidence

Confidence: Medium — The implementation correctly delivers the planned features and follows project patterns well, but the stale closure bug (Finding #1) is a clear defect that will cause incorrect behavior, and the incomplete test coverage (Findings #2, Section 6) means the new flows aren't fully verified. Once these two issues are addressed and all tests pass, confidence will be High. The code quality is generally strong with proper TypeScript typing, React patterns, and instrumentation integration.
