# Align Kit Content Deletion with Shopping List Deletion UX

## 0) Research Log & Findings

**Research areas searched:**
- `src/hooks/use-kit-contents.ts` - Kit content deletion handler with loading state
- `src/components/kits/kit-bom-table.tsx` - Kit BOM table UI with "Removing..." badge
- `src/routes/shopping-lists/$listId.tsx` - Shopping list line deletion handler (no loading state)
- `docs/features/toast_system_improvements/plan.md` - Original specification requiring "pure optimistic deletion"

**Key findings:**

1. **Specification mismatch identified**: The toast system improvements plan (line 59, 334, 409) explicitly requires "pure optimistic deletion (row removed instantly when delete is clicked, no intermediate loading state)" for both kit content and shopping list line deletions.

2. **Current implementations diverge**:
   - Shopping list line deletion: ✅ Conforms to spec (no loading state)
   - Kit content deletion: ❌ Shows "Removing..." badge with spinner during deletion

3. **Root cause**: Kit BOM table has pre-existing UI pattern that displays loading feedback (`isDeleting` prop drives badge at `kit-bom-table.tsx:279-283`). This pattern was preserved during the undo implementation despite the plan's explicit "no intermediate loading state" requirement.

4. **State variables to remove**:
   - `pendingDeleteId` - tracks which content is being deleted
   - `isDeleteSubmitting` - global deletion in-progress flag
   - These drive the `isDeleting` prop passed to row components

5. **Conflicts resolved**: No technical conflicts. The removal is straightforward - delete state declarations, remove state setter calls, remove prop passing, remove UI rendering.

## 1) Intent & Scope

**User intent**

Remove the "Removing..." loading state from kit content deletion to align with the shopping list line deletion implementation and conform to the original specification requiring pure optimistic deletion with no intermediate loading state.

**Prompt quotes**

"Can you write a new plan for me conform @docs/commands/plan_feature.md to fix the kit BOM line implementation so that it conforms to the spec and that the implementation for kit BOM lines and shopping list lines are the same?"

**In scope**

- Remove `pendingDeleteId` and `isDeleteSubmitting` state variables from `useKitContents` hook
- Remove state setter calls in the `openDelete` function
- Remove `isDeleting` prop from kit BOM table row component interface and rendering
- Remove "Removing..." badge UI from kit BOM display row
- Ensure delete button remains enabled during deletion (matching shopping list behavior)
- Update or verify that Playwright tests still pass without loading state assertions

**Out of scope**

- Adding loading state to shopping list line deletion (opposite direction)
- Creating shared custom hooks for deletion logic (mentioned as optional, not required)
- Changing the undo functionality itself (only removing loading state presentation)
- Modifying the shopping list implementation
- Adding new features or UX improvements beyond alignment

**Assumptions / constraints**

- The pure optimistic deletion pattern is the correct UX (as specified in original plan)
- Existing Playwright tests do not assert on the "Removing..." badge visibility
- TanStack Query's optimistic updates provide sufficient user feedback through instant row removal
- Backend deletion performance is fast enough that additional UI feedback is unnecessary

## 2) Affected Areas & File Map

**Hook State Management**

- Area: `src/hooks/use-kit-contents.ts`
- Why: Remove `pendingDeleteId` and `isDeleteSubmitting` state variables and their setter calls in `openDelete`
- Evidence: `src/hooks/use-kit-contents.ts:170-171` — state declarations; `:839-840, :854-855, :873-874` — setState calls in openDelete

**Hook Return Interface**

- Area: `src/hooks/use-kit-contents.ts`
- Why: Remove `pendingDeleteId` and `isDeleteSubmitting` from the returned overlays object (if exported)
- Evidence: Hook returns overlays object that may expose these values to consuming components

**Table Component Props**

- Area: `src/components/kits/kit-bom-table.tsx`
- Why: Remove extraction and passing of `pendingDeleteId` to row components
- Evidence: `src/components/kits/kit-bom-table.tsx:37` — `const pendingDeleteId = overlays.pendingDeleteId;`; `:139` — `const isDeleting = pendingDeleteId === row.id;`; `:151` — prop passed to display row

**Display Row Component Interface**

- Area: `src/components/kits/kit-bom-table.tsx` (KitBOMDisplayRowProps interface)
- Why: Remove `isDeleting: boolean` from props interface
- Evidence: `src/components/kits/kit-bom-table.tsx:183` — interface definition; `:193` — destructured in component

**Display Row Component Logic**

- Area: `src/components/kits/kit-bom-table.tsx` (KitBOMDisplayRow component)
- Why: Remove `isDeleting` from `disableRowActions` calculation and remove badge rendering
- Evidence: `src/components/kits/kit-bom-table.tsx:207` — `const disableRowActions = ... || isDeleting;`; `:279-284` — badge rendering conditional

**Playwright Tests (Verification)**

- Area: `tests/e2e/kits/kit-contents-undo.spec.ts`
- Why: Verify tests don't assert on loading state or "Removing..." badge visibility
- Evidence: All tests currently focus on undo functionality, toast visibility, and backend state verification

## 3) Data Model / Contracts

**No data model changes required.** This is purely a UI state removal. The backend API contracts, TanStack Query cache structures, and snapshot data models remain unchanged.

## 4) API / Integration Surface

**No API changes required.** The deletion mutation (`deleteMutation.mutateAsync`) continues to be called identically. The only change is removing local React state that tracked the mutation's in-flight status.

- Surface: `DELETE /api/kits/{kit_id}/contents/{content_id}` (via `useDeleteKitsByKitIdContentsByContentId` hook)
- Inputs: `{ path: { kit_id: number, content_id: number } }` (unchanged)
- Outputs: Success triggers toast with undo button, cache refetch (unchanged)
- Errors: Exception shown via `showException`, snapshot removed from Map (unchanged)
- Evidence: `src/hooks/use-kit-contents.ts:849-884` — existing deletion flow

## 5) Algorithms & UI Flows

**Flow: Kit content deletion (revised)**

**Steps:**
1. User clicks delete button on kit content row
2. `openDelete(row)` is called
3. Snapshot captured and stored in `deletedContentSnapshotsRef` Map (unchanged)
4. Form instrumentation tracks submit phase (unchanged)
5. **[REMOVED]** ~~`setIsDeleteSubmitting(true)` and `setPendingDeleteId(row.id)` called~~
6. **[REMOVED]** ~~Row displays "Removing..." badge, edit/delete buttons disabled~~
7. `deleteMutation.mutateAsync()` called
8. TanStack Query optimistically removes row from cache → **row disappears instantly**
9. On success:
   - **[REMOVED]** ~~Reset `pendingDeleteId` and `isDeleteSubmitting`~~
   - Track success instrumentation
   - Show success toast with undo button
   - Refetch query
10. On error:
    - **[REMOVED]** ~~Reset `pendingDeleteId` and `isDeleteSubmitting`~~
    - Remove snapshot from Map
    - Track error instrumentation
    - Show exception toast

**States / transitions**: Content row visible → delete clicked → **row removed instantly (no loading badge)** → toast with undo → (undo clicked) → row restored

**Hotspots**: None. Removing state simplifies the component and eliminates re-render pressure from loading state updates.

**UI guidance**: Row disappears instantly when delete is clicked (pure optimistic deletion, no intermediate loading state). This matches shopping list line deletion behavior exactly.

**Evidence**:
- Current implementation: `src/hooks/use-kit-contents.ts:821-896`
- Target pattern: `src/routes/shopping-lists/$listId.tsx:288-339`

## 6) Derived State & Invariants

**No derived state involved.** The loading state variables (`pendingDeleteId`, `isDeleteSubmitting`) were local presentational state, not derived from queries or props. Their removal eliminates these values entirely; no replacement derivation is needed.

## 7) State Consistency & Async Coordination

**Source of truth**: TanStack Query cache for kit detail (unchanged)

**Coordination**: Deletion mutation triggers cache refetch via `query.refetch()` after success. The instant row removal is handled by TanStack Query's optimistic update behavior (framework-provided, not manually implemented in current code).

**Async safeguards**: Existing undo in-flight protection via `undoInFlightRef` remains (unchanged). Deletion mutation error handling remains (unchanged).

**Instrumentation**: Form instrumentation events (`KitContent:delete` submit/success/error phases) continue to be emitted at the correct times (unchanged).

**Evidence**: `src/hooks/use-kit-contents.ts:841-846, :856-861, :877-882` — instrumentation calls unchanged

## 8) Errors & Edge Cases

**Failure: User double-clicks delete button**

- Surface: Kit BOM table row
- Handling: Currently prevented by `isDeleting` disabling the button. **After change**: First click triggers deletion, second click during mutation could trigger a second deletion attempt (will fail if content already deleted, showing error toast). This matches shopping list behavior.
- Guardrails: Error toast shown if deletion fails. Undo snapshot only captured on first successful deletion.
- Evidence: Shopping list implementation has same behavior (no button disabling during deletion)

**Failure: User clicks edit button during deletion**

- Surface: Kit BOM table row
- Handling: Currently prevented by `isDeleting` disabling the button. **After change**: Edit button remains enabled. If clicked during deletion, edit form opens but content may disappear mid-edit when deletion completes. This matches shopping list behavior.
- Guardrails: Edit form submission would fail with 404 if content deleted. Form error handling displays exception.
- Evidence: Shopping list allows editing during deletion with same behavior

**Failure: Deletion mutation fails**

- Surface: Kit BOM table
- Handling: **Unchanged** - Exception toast shown, snapshot removed from Map, instrumentation tracks error
- Guardrails: Row remains visible (optimistic update didn't occur on error), user can retry
- Evidence: `src/hooks/use-kit-contents.ts:872-884` — error handling

**Edge case: Slow network**

- Surface: Kit BOM table
- Handling: **After change**: No visual indication that deletion is in progress. Row remains visible until mutation completes (if optimistic update isn't immediate) or disappears instantly (if optimistic update is immediate).
- Guardrails: Toast appears after mutation succeeds, providing confirmation
- Evidence: Shopping list has same behavior

## 9) Observability / Instrumentation

**All instrumentation unchanged.** The removal of loading state does not affect:

**Signal: Form event for kit content deletion**

- Type: Test instrumentation event
- Trigger: On delete submit/success/error phases; emitted by `deleteInstrumentation` helper
- Labels / fields: `{ kind: 'form', formId: 'KitContent:delete', phase: 'pending' | 'success' | 'error', metadata: { kitId, contentId, partKey } }`
- Consumer: Playwright tests (`waitTestEvent` in undo specs)
- Evidence: `src/hooks/use-kit-contents.ts:841-846, :856-861, :877-882` — unchanged

**Signal: Form event for kit content restoration (undo)**

- Type: Test instrumentation event
- Trigger: On undo submit/success/error phases
- Labels / fields: `{ kind: 'form', formId: 'KitContent:restore', phase: 'pending' | 'success' | 'error', metadata: { kitId, contentId, partKey, undo: true } }`
- Consumer: Playwright tests
- Evidence: `src/hooks/use-kit-contents.ts:780-785, :799-804, :810-815` — unchanged

**Signal: Toast event for undo action**

- Type: Test instrumentation event
- Trigger: When success toast with undo button is shown
- Labels / fields: `{ kind: 'toast', message: '...', action: 'undo', ... }`
- Consumer: Playwright tests (optional, if asserting on toast events)
- Evidence: `src/lib/test/toast-instrumentation.ts:89-98` — unchanged

**Signal: List loading event for kit detail**

- Type: Test instrumentation event
- Trigger: After query refetch completes (post-deletion or post-undo)
- Labels / fields: `{ kind: 'list_loading', scope: 'kits.detail.contents', phase: 'ready', metadata: { kitId, contentCount } }`
- Consumer: Playwright tests (`waitForListLoading` in undo specs)
- Evidence: Query refetch triggers existing instrumentation — unchanged

## 10) Lifecycle & Background Work

**No lifecycle changes.** The removal of loading state does not introduce or remove any effects, timers, or subscriptions.

## 11) Security & Permissions

**Not applicable.** No security or permission changes involved.

## 12) UX / UI Impact

**Entry point**: Kit detail page (BOM table section)

**Change**: Remove "Removing..." badge with spinner that currently appears on a row during content deletion

**User interaction**:
- **Before**: User clicks delete → row shows "Removing..." badge with spinner → row disappears after mutation completes → toast appears with undo
- **After**: User clicks delete → row disappears instantly → toast appears with undo

**Visual difference**: No intermediate loading state. Row removal feels instantaneous (powered by TanStack Query's optimistic update behavior or instant DOM update on mutation completion).

**Consistency**: This aligns kit content deletion with shopping list line deletion, which already works this way. Both features now provide identical deletion UX.

**Dependencies**: None. This is a pure UI state removal.

**Evidence**:
- Current UI: `src/components/kits/kit-bom-table.tsx:279-284` — badge rendering
- Target UX: `src/routes/shopping-lists/$listId.tsx:288-339` — no loading state

## 13) Deterministic Test Plan

**Surface**: Kit content deletion with undo (existing test suite)

**Scenarios**:
- ✅ **Unchanged**: Given user is on kit detail page with 5 contents, When user clicks remove on third content, Then content is removed immediately (no visual change to this behavior), success toast appears with undo button
- ✅ **Unchanged**: Given undo toast is visible, When user clicks undo, Then content is restored with new ID
- ✅ **Unchanged**: Given undo toast is visible, When 15 seconds elapse, Then toast is dismissed and content stays deleted
- ✅ **Unchanged**: Given user removes two contents, When user clicks undo on second deletion, Then only second content is restored, first stays deleted
- ✅ **Unchanged**: Given user removes content with note, When user clicks undo, Then note is preserved in restored content
- ✅ **Unchanged**: Given kit is archived, When user views detail page, Then delete buttons are disabled
- ✅ **Removed assertion**: ~~Given user clicks delete, When mutation is in flight, Then "Removing..." badge is visible~~ (this assertion should not exist in current tests)

**Instrumentation / hooks**:
- `data-testid="kits.detail.content.{contentId}.remove"` — delete button (unchanged)
- `data-testid="kits.detail.toast.undo.{contentId}"` — undo button (unchanged)
- Form events: `KitContent:delete` and `KitContent:restore` with phases (unchanged)
- Toast event with `action: 'undo'` (unchanged)
- List loading event: `kits.detail.contents` scope (unchanged)

**Gaps**: None. Existing test coverage is comprehensive and should remain green after this change.

**Evidence**: `tests/e2e/kits/kit-contents-undo.spec.ts` — 5 test scenarios already cover undo functionality without asserting on loading state

**Verification**: Run `pnpm playwright test tests/e2e/kits/kit-contents-undo.spec.ts` to confirm all tests pass after changes.

## 14) Implementation Slices

**Slice 1: Remove loading state from hook**

- Goal: Eliminate state variables and setter calls that track deletion in-progress status
- Touches:
  - `src/hooks/use-kit-contents.ts:170-171` — Delete state declarations
  - `src/hooks/use-kit-contents.ts:839-840, :854-855, :873-874` — Delete setState calls in `openDelete` function
  - `src/hooks/use-kit-contents.ts` (overlays return object) — Remove `pendingDeleteId` and `isDeleteSubmitting` from export (if present)
- Dependencies: None. This slice is independent.

**Slice 2: Remove loading state from UI components**

- Goal: Remove `isDeleting` prop and "Removing..." badge rendering from kit BOM table
- Touches:
  - `src/components/kits/kit-bom-table.tsx:37` — Delete `const pendingDeleteId = overlays.pendingDeleteId;` line
  - `src/components/kits/kit-bom-table.tsx:139` — Delete `const isDeleting = pendingDeleteId === row.id;` line
  - `src/components/kits/kit-bom-table.tsx:151` — Remove `isDeleting={isDeleting}` prop from KitBOMDisplayRow
  - `src/components/kits/kit-bom-table.tsx:183` — Remove `isDeleting: boolean;` from KitBOMDisplayRowProps interface
  - `src/components/kits/kit-bom-table.tsx:193` — Remove `isDeleting` from destructured props
  - `src/components/kits/kit-bom-table.tsx:207` — Change `const disableRowActions = disableActions || Boolean(pendingUpdate) || isDeleting;` to `const disableRowActions = disableActions || Boolean(pendingUpdate);`
  - `src/components/kits/kit-bom-table.tsx:279-284` — Delete entire conditional rendering block for "Removing..." badge
- Dependencies: Slice 1 must be completed first (removes state from hook that UI consumes)

**Slice 3: Verify tests and alignment**

- Goal: Confirm Playwright tests pass and behavior matches shopping list deletion
- Touches:
  - Run `pnpm playwright test tests/e2e/kits/kit-contents-undo.spec.ts` to verify all 5 tests pass
  - Run `pnpm check` to verify TypeScript and ESLint pass
  - Manual verification: Delete kit content in browser, observe instant row removal with no loading badge
- Dependencies: Slices 1-2 completed

## 15) Risks & Open Questions

**Risk: User confusion from lack of feedback**

- Impact: On slow networks, user might not realize deletion is processing and click delete multiple times
- Mitigation: Shopping list already works this way without reported issues. TanStack Query's optimistic updates typically make deletion feel instant even on slow networks. If issues arise, we can add a global loading indicator or temporarily disable all actions during any mutation.

**Risk: Double-click creates unexpected error toast**

- Impact: User accidentally double-clicks delete, second deletion attempt fails with error toast (content already deleted)
- Mitigation: This is low-severity (just an error toast that can be dismissed). If problematic, add debouncing to delete button click handler (500ms window).

**Risk: Edit-during-deletion causes confusion**

- Impact: User clicks edit button immediately after delete, edit form opens but content disappears mid-edit
- Mitigation: Shopping list has same behavior. If problematic, keep button disabling for edit button only during active mutations (using `disableActions` or checking mutation state).

**Open Question: Should we disable edit button during deletion?**

- Why it matters: Allows trade-off between "pure optimistic deletion" (no UI changes except row removal) and "prevent confusing interactions" (disable edit button briefly)
- Owner / follow-up: Product decision. Current plan removes all loading state for consistency with shopping list. If edit-during-deletion becomes a real issue, can be addressed in follow-up.

**Open Question: Should we add global mutation indicator?**

- Why it matters: Could provide subtle feedback (e.g., spinner in page header) during any mutation without per-row loading state
- Owner / follow-up: Product/UX decision. Out of scope for this alignment work but could be a future enhancement across all mutation operations.

## 16) Confidence

Confidence: High — This is a straightforward state removal with clear precedent (shopping list implementation). The changes are well-scoped, localized to 2 files, and supported by existing comprehensive test coverage. The risk of regression is low because we're removing optional UI state rather than changing core mutation logic.
