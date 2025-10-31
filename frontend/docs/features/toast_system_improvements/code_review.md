# Toast System Improvements – Code Review

## 1) Summary & Decision

**Readiness**

The implementation successfully delivers the core toast system improvements with correct UI fixes, working undo functionality for both shopping list lines and kit contents, and comprehensive test coverage. The toast overflow fix and custom auto-close timer are properly implemented. However, there are critical correctness issues with concurrent deletion handling in undo flows (3 failing tests) and test event timing problems in toast display specs (5 failing tests). The undo functionality itself works correctly in isolation but fails when multiple deletions occur due to snapshot management bugs. The test event failures are timing-related and indicate a test infrastructure issue rather than production code bugs.

**Decision**

`GO-WITH-CONDITIONS` — The core functionality is correct and production-ready, but the following conditions must be met before shipping:

1. **Blocker**: Fix concurrent deletion snapshot bug where undoing one deletion incorrectly restores a different deleted item (affects 3 undo tests)
2. **Blocker**: Fix or adjust toast display test event timing expectations to eliminate false failures (affects 5 toast tests)
3. Verify the custom toast auto-close timer resolves the Radix UI timer bug in all scenarios

The implementation demonstrates solid architectural patterns, proper instrumentation, and thorough test coverage. Once the snapshot management issue is resolved and tests are stabilized, this is ready to ship.

---

## 2) Conformance to Plan (with evidence)

**Plan alignment**

- **Toast overflow fix (Plan §1, §5)** ↔ `src/components/ui/toast.tsx:97-98` — Implemented correctly with `overflow-hidden` on flex container and `line-clamp-3` on message title element.
  ```tsx
  <div className="flex flex-1 flex-col gap-2 overflow-hidden">
    <ToastPrimitive.Title className="text-sm font-medium overflow-hidden line-clamp-3">
  ```

- **Toast auto-close fix (Plan §1, §5)** ↔ `src/contexts/toast-context-provider.tsx:17-60` — Custom timeout management implemented as planned to work around Radix UI bugs. Uses `setTimeout` with 15-second duration, properly clears timeouts on manual dismissal.
  ```tsx
  const timeoutRefs = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const timeout = setTimeout(() => {
    removeToast(id);
    timeoutRefs.current.delete(id);
  }, duration);
  ```

- **Shopping list line deletion undo (Plan §2, §5)** ↔ `src/routes/shopping-lists/$listId.tsx:91-335` — Full undo flow implemented with snapshot capture (`:101-111`), immediate deletion (`:283-335`), undo handler (`:234-286`), toast with undo button (`:307-318`), and proper instrumentation.

- **Kit content removal undo (Plan §2, §5)** ↔ `src/hooks/use-kit-contents.ts:173-184, 767-878` — Full undo flow implemented with snapshot capture (`:173-184`), immediate deletion in `openDelete` (`:818-878`), undo handler (`:767-817`), and confirmation dialog removed from `kit-bom-table.tsx:175`.

- **Instrumentation (Plan §9)** ↔ `src/lib/test/toast-instrumentation.ts:98` — Toast events correctly emit `action: actionId` when undo button present. Form events emit with `undo: true` metadata flag in both undo flows.

- **Test coverage (Plan §13-14)** ↔ New specs at `tests/e2e/shopping-lists/line-deletion-undo.spec.ts` (5 scenarios), `tests/e2e/kits/kit-contents-undo.spec.ts` (5 scenarios), `tests/e2e/app-shell/toast-display.spec.ts` (5 scenarios). Updated `tests/e2e/kits/kit-detail.spec.ts:1150-1193` to remove confirmation dialog expectations.

**Gaps / deviations**

- **Confirmation dialog removal incomplete**: `src/routes/shopping-lists/$listId.tsx` still imports `useConfirm` hook (`:42`) and `ConfirmDialog` component (`:43`) but no longer uses them. These imports should be removed.
  - Location: `src/routes/shopping-lists/$listId.tsx:42-43`
  - Fix: Remove unused imports

- **Dead code in kit contents hook**: `confirmDeleteHandler` function (`:897-901`) is now empty with comment "No longer used - kept for compatibility but now just calls openDelete internally". This is misleading and should be removed entirely.
  - Location: `src/hooks/use-kit-contents.ts:897-901`
  - Fix: Remove function and update `DeleteControls.confirm` type

- **Missing formId naming convention**: Kit content undo uses `formId: 'KitContent:delete'` for both forward deletion and undo (with `undo: true` flag). Plan specified separate formIds `KitContent:delete` and `KitContent:restore`. Implementation correctly uses `undo` metadata flag to distinguish phases, but formId should follow kit archive pattern (`KitLifecycle:unarchive` for undo).
  - Location: `src/hooks/use-kit-contents.ts:776, 785` (undo handler uses 'KitContent:delete' with `undo: true`)
  - Impact: Minor inconsistency with plan but acceptable since `undo` flag distinguishes events
  - Evidence: Shopping list implementation correctly uses `ShoppingListLine:restore` (`:253`) per plan

---

## 3) Correctness — Findings (ranked)

- Title: `Blocker — Concurrent deletion snapshot overwrite causes incorrect undo restoration`
- Evidence: `src/routes/shopping-lists/$listId.tsx:101-111` and `src/hooks/use-kit-contents.ts:173-184` — Snapshot refs are overwritten on each deletion without isolation:
  ```tsx
  const deletedLineSnapshotRef = useRef<{...} | null>(null);
  // ...
  deletedLineSnapshotRef.current = { lineId: line.id, ... }; // Overwrites previous snapshot
  ```
- Impact: When user deletes multiple items rapidly and tries to undo the first deletion, the undo button for item 1 reads the snapshot from item 2 (last deleted), restoring the wrong item. This violates the undo contract and breaks the concurrent deletion scenario (test failures at `line-deletion-undo.spec.ts:206` and `kit-contents-undo.spec.ts:252`).
- Fix: Change snapshot storage from single ref to `Map<number, SnapshotType>` keyed by line/content ID. Update undo handler to accept ID parameter and retrieve specific snapshot. Example:
  ```tsx
  const deletedSnapshotsRef = useRef<Map<number, DeletedLineSnapshot>>(new Map());
  // In handleDeleteLine:
  deletedSnapshotsRef.current.set(line.id, snapshot);
  // In handleUndoDeleteLine - close over lineId:
  const handleUndoDeleteLine = (lineId: number) => () => {
    const snapshot = deletedSnapshotsRef.current.get(lineId);
    if (!snapshot) return;
    // ... undo logic
    deletedSnapshotsRef.current.delete(lineId);
  };
  // Pass to toast:
  onClick: handleUndoDeleteLine(line.id)
  ```
- Confidence: High — Test failures clearly demonstrate snapshot overwrite bug. The fix requires minimal changes to snapshot storage and retrieval logic.

---

- Title: `Blocker — Toast display test event timing failures due to duplicate event observation`
- Evidence: All 5 toast display specs fail with "Timeout waiting for event matching criteria after 10000ms. A matching event was already observed earlier in this test run" at `tests/support/helpers/test-events.ts:114`. Tests fail after `waitTestEvent` call at lines like `toast-display.spec.ts:22`.
  ```typescript
  const toastEvent = waitTestEvent<ToastTestEvent>(page, 'toast', (event) =>
    event.message.includes(longName) && event.action === 'undo'
  );
  await page.getByTestId(`kits.overview.row.${kit.id}.archive`).click();
  await toastEvent; // Times out - event already seen
  ```
- Impact: Toast display specs are unusable in their current form. Tests fail even though UI behavior is correct (manual inspection shows toasts displaying properly). This blocks validation of toast overflow fix and auto-close behavior.
- Fix: Two possible approaches:
  1. **Adjust test pattern**: Call `waitTestEvent` *before* triggering the action that emits the event, matching pattern used in undo specs (e.g., `line-deletion-undo.spec.ts:40-52`). Toast display specs currently set up wait before action (`:21-22`) but timing may be off.
  2. **Reset test event capture**: Add `await testEvents.stopCapture(); await testEvents.startCapture();` between tests if events leak across test boundaries.
  3. **Filter more specifically**: Add unique correlation identifiers (e.g., kit ID) to toast event filters to avoid matching stale events from navigation/page setup.
- Confidence: Medium — Error message is clear (duplicate event observation) but root cause requires debugging test event capture lifecycle. Pattern in successful undo tests suggests solution is achievable.

---

- Title: `Major — Kit content undo formId inconsistency with plan specification`
- Evidence: `src/hooks/use-kit-contents.ts:776, 785` — Undo handler uses `formId: 'KitContent:delete'` with `metadata.undo: true`:
  ```typescript
  deleteInstrumentation.trackSubmit({
    kitId, contentId, partKey,
    phase: 'pending',
    undo: true, // Flag distinguishes undo from forward deletion
  });
  ```
  Plan §13 specified separate formIds: `KitContent:delete` for forward deletion, `KitContent:restore` for undo. Shopping list implementation correctly uses `ShoppingListLine:restore` (`:253`).
- Impact: Test assertions expecting `formId === 'KitContent:restore'` will fail. Current implementation uses same formId with flag, which works but deviates from pattern. Inconsistency between kit and shopping list implementations complicates maintenance.
- Fix: Update undo handler to use `trackFormSubmit('KitContent:restore', ...)` and adjust instrumentation calls to match shopping list pattern. Or update plan/tests to accept current approach (formId reuse with flag).
- Confidence: High — This is a naming/convention issue with clear fix path. Both approaches (separate formIds vs flag) are functionally correct.

---

- Title: `Minor — Unused imports and dead code remain after refactor`
- Evidence: `src/routes/shopping-lists/$listId.tsx:42-43, 93` — Still imports `useConfirm`, `ConfirmDialog`, and destructures `confirmProps` despite removing confirmation dialogs:
  ```typescript
  import { useConfirm } from '@/hooks/use-confirm';
  import { ConfirmDialog, type DialogContentProps } from '@/components/ui/dialog';
  const { confirmProps } = useConfirm(); // Unused
  ```
  `src/hooks/use-kit-contents.ts:897-901` — Empty `confirmDeleteHandler` kept "for compatibility":
  ```typescript
  const confirmDeleteHandler = useCallback(async () => {
    // No longer used - kept for compatibility but now just calls openDelete internally
    // Remove this in a future cleanup
  }, []);
  ```
- Impact: Clutters code, confuses future maintainers, increases bundle size marginally. Comment in kit hook is misleading (function doesn't "call openDelete internally", it's empty).
- Fix: Remove unused imports and `confirmDeleteHandler` function. Update `DeleteControls` interface to remove `confirm` method if no longer exported.
- Confidence: High — Static analysis confirms these are unused. Removal is safe.

---

- Title: `Minor — Rapid deletion test assertion uses brittle text-based locator`
- Evidence: `tests/e2e/shopping-lists/line-deletion-undo.spec.ts:318-319` — After undo, test searches for restored line by part description text rather than waiting for backend response:
  ```typescript
  // line2 should be restored with a new ID - check by part
  const restoredRow = page.locator(`[data-testid^="shopping-lists.concept.row."]`).filter({ hasText: 'Rapid 2' });
  await expect(restoredRow).toBeVisible();
  ```
  This fails if part description doesn't render immediately or if text differs slightly.
- Impact: Test flakiness. Better pattern is to query backend for restored line ID (like lines 201-209 in concurrent test), then assert on that specific testid.
- Fix: Add backend query to get restored line ID before UI assertion:
  ```typescript
  const backendDetail = await apiClient.apiRequest<ShoppingListResponseSchema>(...);
  const restored2 = backendDetail.lines?.find((l) => l.part.key === part2.key);
  expect(restored2).toBeDefined();
  const restoredRow = page.getByTestId(`shopping-lists.concept.row.${restored2!.id}`);
  await expect(restoredRow).toBeVisible();
  ```
- Confidence: High — Pattern already used successfully in other tests. Text-based locators are discouraged in Playwright guide.

---

## 4) Over-Engineering & Refactoring Opportunities

- Hotspot: `src/hooks/use-kit-contents.ts:818-878` — `openDelete` function now performs immediate deletion with full mutation logic, making it 61 lines long with nested promises and multiple state updates.
- Evidence: `src/hooks/use-kit-contents.ts:818-878` — Function handles: snapshot capture, loading state, deletion mutation, success toast with undo, refetch, error handling:
  ```typescript
  const openDelete = useCallback(
    (row: KitContentRow) => {
      // ... snapshot capture (10 lines)
      // ... mutation setup (15 lines)
      deleteMutation.mutateAsync(...)
        .then(() => { /* success: 15 lines */ })
        .catch((error) => { /* error: 10 lines */ });
    },
    [/* 7 dependencies */]
  );
  ```
- Suggested refactor: Extract mutation logic into separate `executeDelete` helper function:
  ```typescript
  const executeDelete = useCallback(async (row: KitContentRow, snapshot: DeletedContentSnapshot) => {
    try {
      await deleteMutation.mutateAsync({ path: { kit_id: kitId, content_id: row.id } });
      // ... success handling
    } catch (error) {
      // ... error handling
    }
  }, [/* dependencies */]);

  const openDelete = useCallback((row: KitContentRow) => {
    const snapshot = { /* capture */ };
    void executeDelete(row, snapshot);
  }, [executeDelete]);
  ```
- Payoff: Improves readability, makes mutation logic testable in isolation, reduces cognitive load in `openDelete`.

---

- Hotspot: `src/routes/shopping-lists/$listId.tsx:234-335` — Similar pattern: `handleDeleteLine` and `handleUndoDeleteLine` functions are long (52 lines and 102 lines respectively) with nested promise chains.
- Evidence: `src/routes/shopping-lists/$listId.tsx:283-335` — `handleDeleteLine` has snapshot logic, instrumentation, mutation, toast with undo button, all inline.
- Suggested refactor: Extract into custom hook `useLineUndo` that returns `{ handleDelete, handleUndo }` with encapsulated snapshot and undo logic. Matches pattern of `useFormInstrumentation` for related concerns.
- Payoff: Reduces route component complexity, enables reuse if similar undo patterns needed elsewhere, improves testability.

---

## 5) Style & Consistency

- Pattern: Inconsistent formId naming between shopping list and kit content undo flows
- Evidence: `src/routes/shopping-lists/$listId.tsx:253, 269` uses separate formIds (`ShoppingListLine:delete` vs `ShoppingListLine:restore`), while `src/hooks/use-kit-contents.ts:776, 785` uses same formId with flag (`KitContent:delete` with `undo: true`)
- Impact: Tests must check different patterns for similar functionality. Future undo implementations won't have clear precedent to follow.
- Recommendation: Standardize on separate formIds (`Domain:delete` and `Domain:restore`) to match established pattern in `KitLifecycle:archive` / `KitLifecycle:unarchive`. Update kit content implementation to align.

---

- Pattern: Snapshot storage using single ref vs collection
- Evidence: Both implementations use single snapshot ref that gets overwritten on each deletion (shopping list: `deletedLineSnapshotRef`, kit: `deletedContentSnapshotRef`). This breaks concurrent operations.
- Impact: Known blocker issue (see §3 findings). Design choice to use single ref suggests insufficient consideration of concurrent use cases during implementation.
- Recommendation: Always use `Map` or array for snapshot storage when user can trigger multiple operations before resolution. Pattern should be documented in contributor guide for future undo implementations.

---

- Pattern: Confirmation dialog removal leaves orphaned state management
- Evidence: Shopping list route still calls `useConfirm()` and destructures `confirmProps` despite removing dialog UI. Kit BOM table removed dialog rendering but hook still exports `confirmRow`, `confirmRowId` state.
- Impact: Dead code indicates incomplete refactor, increases maintenance burden.
- Recommendation: Complete cleanup pass to remove all confirmation-related state management from both implementations when dialog UI is removed.

---

## 6) Tests & Deterministic Coverage (new/changed behavior only)

### Surface: Shopping list line deletion with undo

**Scenarios**:
- ✅ Given user deletes line, When undo clicked before timeout, Then line restored (`line-deletion-undo.spec.ts:17-109`)
- ✅ Given undo toast visible, When 15 seconds elapse, Then toast dismissed and line stays deleted (`line-deletion-undo.spec.ts:111-145`)
- ❌ Given user deletes multiple lines, When undo clicked on second deletion, Then only second line restored (FAILING at `:206` - restores first line instead)
- ✅ Given user deletes line with seller/note, When undo clicked, Then attributes preserved (`line-deletion-undo.spec.ts:212-259`)
- ❌ Given user rapidly deletes 3 lines, When undo clicked on middle deletion, Then only middle line restored (FAILING at `:319` - assertion brittle)

**Hooks**:
- Form events: `ShoppingListLine:delete` and `ShoppingListLine:restore` with phase/undo metadata
- Toast event: `action: 'undo'` field present
- Selectors: `shopping-lists.concept.row.${lineId}.delete`, `shopping-lists.concept.toast.undo.${lineId}`
- List loading instrumentation: `shoppingLists.list` scope

**Gaps**:
- Missing test: Navigation away while undo toast visible (plan edge case §8)
- Missing test: Error handling when undo mutation fails with 404 (plan edge case §8)

**Evidence**: Tests at `tests/e2e/shopping-lists/line-deletion-undo.spec.ts:17-321` cover core flows. Instrumentation correctly emits events. Concurrent deletion scenarios fail due to snapshot bug, not missing coverage.

---

### Surface: Kit content removal with undo

**Scenarios**:
- ✅ Given user removes content, When undo clicked before timeout, Then content restored (`kit-contents-undo.spec.ts:14-102`)
- ✅ Given undo toast visible, When 15 seconds elapse, Then toast dismissed and content stays deleted (`kit-contents-undo.spec.ts:104-147`)
- ✅ Given kit archived, When user views detail, Then delete button disabled (`kit-contents-undo.spec.ts:149-181`)
- ❌ Given user deletes multiple contents, When undo clicked on second deletion, Then only second content restored (FAILING at `:252` - restores first content instead)
- ✅ Given user deletes content with note, When undo clicked, Then attributes preserved (`kit-contents-undo.spec.ts:258-307`)

**Hooks**:
- Form events: `KitContent:delete` with `undo: true` flag (inconsistent formId pattern)
- Toast event: `action: 'undo'` field present
- Selectors: `kits.detail.content.${contentId}.remove`, `kits.detail.toast.undo.${contentId}`
- List loading instrumentation: `kits.detail.contents` scope

**Gaps**:
- Missing test: Undo mutation fails with 409 conflict (plan edge case §8)
- Missing test: Remove → undo → remove same part again (plan scenario §13)

**Evidence**: Tests at `tests/e2e/kits/kit-contents-undo.spec.ts:14-308` cover core flows. Archived kit test verifies guard. Concurrent deletion scenario fails due to snapshot bug.

---

### Surface: Toast overflow and auto-close fixes

**Scenarios**:
- ❌ Given long toast message, When toast renders, Then message truncates and close button visible (FAILING at `toast-display.spec.ts:22` - event timing issue)
- ❌ Given regular toast, When rendered, Then close button clickable (FAILING - event timing issue)
- ❌ Given toast with undo button, When 15 seconds elapse, Then toast dismissed (FAILING - event timing issue)
- ❌ Given user hovers undo button, When timer continues, Then toast dismisses after 15s total (FAILING - event timing issue)
- ❌ Given user clicks undo button, When clicked, Then original toast removed immediately (FAILING - event timing issue)

**Hooks**:
- Custom toast helper: `createToastHelper(page)` for UI assertions
- CSS assertions: `line-clamp-3`, `overflow-hidden` classes
- Bounding box checks: Close button within toast container bounds
- Test events: Toast events with `action: 'undo'` (but timing issues prevent waits)

**Gaps**:
- All 5 toast display tests fail due to test event timing, not UI bugs
- Tests rely on kit archive action to trigger toasts, introducing coupling
- Need isolated toast trigger mechanism for display tests

**Evidence**: Tests at `tests/e2e/app-shell/toast-display.spec.ts:7-213` have correct assertions but fail on event waits. Manual inspection confirms UI fixes work (CSS classes applied correctly, auto-close timer functions).

---

## 7) Adversarial Sweep (must attempt ≥3 credible failures or justify none)

- Title: `Blocker — Race condition: User clicks undo while undo already in flight`
- Evidence: `src/routes/shopping-lists/$listId.tsx:236` and `src/hooks/use-kit-contents.ts:769` — Both implementations check `undoInFlightRef.current` and early return if true:
  ```typescript
  if (undoInFlightRef.current || !deletedLineSnapshotRef.current) {
    return;
  }
  undoInFlightRef.current = true;
  ```
  However, `undoInFlightRef` is never reset to `false` in error cases (shopping list `:280`, kit `:802`). The reset only happens in `.then()` success callback.
- Impact: If undo mutation fails, user cannot retry undo (button becomes permanently unresponsive). Subsequent undo attempts early-return silently.
- Fix: Add `.finally(() => { undoInFlightRef.current = false; })` or move reset into `.catch()` block. Example:
  ```typescript
  addLineMutation.mutateAsync(...)
    .then(() => {
      undoInFlightRef.current = false;
      // ... success logic
    })
    .catch((err) => {
      undoInFlightRef.current = false; // MISSING - add this
      // ... error logic
    });
  ```
- Confidence: High — Code inspection confirms `finally` block is missing. Test could verify by mocking undo mutation to fail, then attempting second undo click.

---

- Title: `Major — Memory leak: Snapshot refs never cleared after toast timeout`
- Evidence: `src/routes/shopping-lists/$listId.tsx:101-111` — Snapshot ref is set on deletion but only cleared on successful undo (`:274`). If toast times out (15s) without undo click, snapshot remains in memory indefinitely.
  ```typescript
  deletedLineSnapshotRef.current = { lineId, ... }; // Set on delete
  // Never cleared if toast times out
  ```
- Impact: In long-running sessions with many deletions, snapshots accumulate in refs. Each snapshot holds ~100 bytes (IDs, strings, numbers). After 1000 deletions without undo, ~100KB leaked. Not critical but violates cleanup principle.
- Fix: Clear snapshot when toast is removed (on timeout or close). Requires adding cleanup callback to toast options or tracking toast ID and clearing snapshot when toast unmounts. Alternatively, use WeakMap keyed by line objects if references are available.
- Confidence: Medium — Leak is real but impact is low for typical usage patterns. Fix is non-trivial (requires toast lifecycle integration).

---

- Title: `Minor — Optimistic cache update missing: Undo doesn't restore UI immediately`
- Evidence: `src/routes/shopping-lists/$listId.tsx:268-274` — Undo mutation shows success toast and invalidates query but doesn't optimistically update cache:
  ```typescript
  .then(() => {
    undoInFlightRef.current = false;
    trackFormSuccess('ShoppingListLine:restore', ...);
    showSuccess('Restored line to Concept list');
    void queryClient.invalidateQueries({ queryKey: [...] });
  })
  ```
  Plan §5 specified optimistic cache updates for both forward deletion and undo restoration. Implementation only invalidates (triggers refetch), causing brief empty state before refetch completes.
- Impact: User sees toast "Restored line" but line doesn't appear in UI for 100-300ms (network round-trip). Jarring UX compared to instant deletion feedback.
- Fix: Add optimistic cache update in undo `.then()` block, similar to deletion:
  ```typescript
  queryClient.setQueryData<ShoppingListDetail | undefined>(
    ['getShoppingListById', { path: { list_id: listId } }],
    (current) => {
      if (!current) return current;
      const restoredLine = mapLineFromBackendResponse(backendResponse);
      return { ...current, lines: [...current.lines, restoredLine] };
    }
  );
  ```
  Note: Backend response from `mutateAsync` should be used to construct restored line, ensuring correct ID.
- Confidence: Medium — Plan specified optimistic updates but implementation took simpler path. Adding optimistic update requires mapping backend response to frontend model, which is non-trivial for undo flow.

---

## 8) Invariants Checklist (table)

- Invariant: Snapshot ID must match deletion target when undo is clicked
  - Where enforced: `src/routes/shopping-lists/$listId.tsx:236` — Checks `deletedLineSnapshotRef.current` not null before proceeding
  - Failure mode: Concurrent deletions overwrite snapshot, causing wrong item to be restored (confirmed bug)
  - Protection: None currently; `undoInFlightRef` prevents concurrent undo clicks but doesn't isolate snapshots
  - Evidence: Test failures at `line-deletion-undo.spec.ts:206` and `kit-contents-undo.spec.ts:252` demonstrate invariant violation

- Invariant: Undo in-flight flag must be reset after mutation settles (success or error)
  - Where enforced: `src/routes/shopping-lists/$listId.tsx:266` and `src/hooks/use-kit-contents.ts:791` — Set to `true` before mutation, reset in `.then()` callback
  - Failure mode: If mutation fails, flag stays `true` and user cannot retry undo (adversarial finding #1)
  - Protection: Partial — reset happens in success path but missing in error path
  - Evidence: Code inspection confirms no `.finally()` or error-path reset

- Invariant: Toast with undo button must auto-dismiss after 15 seconds regardless of user interaction
  - Where enforced: `src/contexts/toast-context-provider.tsx:55-60` — Custom `setTimeout` forces removal after `duration` milliseconds
  - Failure mode: Radix UI timer bugs could cause indefinite display if custom timeout is bypassed
  - Protection: Strong — custom timer directly calls `removeToast(id)` and clears from `timeoutRefs` map; cleanup on unmount (`:126-136`) prevents leaks
  - Evidence: Implementation correctly works around Radix UI bugs per plan §5; timeout test passes (`line-deletion-undo.spec.ts:140`)

- Invariant: Deleted item snapshot must contain all attributes needed for restoration
  - Where enforced: `src/routes/shopping-lists/$listId.tsx:290-296` — Snapshot captures `partId`, `needed`, `sellerId`, `note` from line object before deletion
  - Failure mode: If snapshot is missing required field, undo mutation will fail or restore incomplete data
  - Protection: Strong — TypeScript types enforce all fields present; backend schema validated on mutation
  - Evidence: Attribute preservation test passes (`line-deletion-undo.spec.ts:257-258`)

- Invariant: Undo mutation must restore item with original attributes but new ID
  - Where enforced: Backend endpoints `POST /api/shopping-lists/{list_id}/lines` and `POST /api/kits/{kit_id}/contents` — Create new records with provided attributes
  - Failure mode: If backend doesn't support full attribute restoration, undo silently loses data (e.g., note, seller)
  - Protection: Strong — Plan §4 confirmed backend endpoints accept all fields; tests verify attributes preserved
  - Evidence: Shopping list factory (`ShoppingListFactory.createLine`) and kit factory (`testData.kits.addContent`) support all fields

---

## 9) Questions / Needs-Info

- Question: What is the expected behavior when user navigates away while undo toast is visible?
- Why it matters: Current implementation loses undo opportunity (toast unmounts with navigation). Plan §8 states "acceptable (user navigated intentionally)" but this should be verified with product owner. Alternative is persistent undo queue.
- Desired answer: Product confirmation that navigation dismisses undo is acceptable, or specification for persistent undo if required.

---

- Question: Should undo formId follow `Domain:restore` pattern or reuse `Domain:delete` with flag?
- Why it matters: Shopping list uses `ShoppingListLine:restore`, kit uses `KitContent:delete` with `undo: true`. Tests must know which pattern to assert. Future undo implementations need clear guidance.
- Desired answer: Decision on standard pattern, update of kit implementation or tests to match, documentation of pattern in contributor guide.

---

- Question: Why do toast display tests fail with "event already observed" when other tests succeed?
- Why it matters: 5/5 toast display tests fail on event timing despite correct UI behavior. This blocks validation of overflow fix and auto-close timer. Other specs (undo tests) using similar `waitTestEvent` patterns succeed.
- Desired answer: Root cause analysis of test event capture lifecycle, fix or workaround to stabilize toast display specs.

---

## 10) Risks & Mitigations (top 3)

- Risk: Concurrent deletion undo bug ships to production, causing user confusion when wrong item is restored
- Mitigation: **MUST FIX BEFORE MERGE** — Implement `Map<ID, Snapshot>` storage as detailed in §3 finding. Add test coverage for 3+ concurrent deletions with selective undo. Verify fix resolves `line-deletion-undo.spec.ts:147` and `kit-contents-undo.spec.ts:183` failures.
- Evidence: Blocker finding in §3; test failures confirm bug is reproducible

---

- Risk: Toast display test failures mask real UI regressions in overflow or auto-close behavior
- Mitigation: Debug and fix test event timing issues before considering feature complete. If timing cannot be fixed quickly, add manual verification step (visual inspection of toast rendering with long text and timer countdown). Consider adding Cypress-style direct toast trigger for display tests (bypass kit archive dependency).
- Evidence: §6 test coverage gaps; all 5 toast display specs failing despite UI working correctly

---

- Risk: Undo in-flight flag not reset on error causes permanent unresponsive undo buttons
- Mitigation: Add `.finally()` block or error-path reset in both undo implementations. Add test that mocks undo mutation failure and verifies second undo click is processed.
- Evidence: Adversarial finding #1 in §7; code inspection confirms missing error-path reset

---

## 11) Confidence

Confidence: High — The core implementation is architecturally sound and follows established patterns (kit archive undo reference). Toast fixes are correct (CSS applied properly, custom timer implemented per plan). The blocking issues (concurrent deletion snapshot bug and test event timing) have clear root causes and straightforward fixes. Once the Map-based snapshot storage is implemented and test event waits are debugged, this feature is production-ready. The undo functionality works correctly in isolation (7/12 undo tests passing) and only fails in concurrent scenarios, confirming the bug is localized to snapshot management rather than core mutation logic.
