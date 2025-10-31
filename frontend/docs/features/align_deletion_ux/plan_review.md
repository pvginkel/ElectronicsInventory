# Plan Review: Align Kit Content Deletion with Shopping List Deletion UX

## 1) Summary & Decision

**Readiness**

The plan is well-researched, tightly scoped, and correctly identifies a specification deviation between kit content deletion (which shows "Removing..." loading state) and shopping list line deletion (which provides pure optimistic deletion). The evidence trail is comprehensive with specific line references to both implementations and the original specification. The plan's approach—removing local React state variables that track deletion in-flight status—is technically sound and minimally invasive. Implementation slices are clear, test coverage expectations are realistic, and the risk assessment acknowledges the UX trade-offs. However, the plan contains a critical technical assumption about "optimistic updates" that is unsupported by the actual codebase, and it underspecifies the actual user experience during the deletion transition.

**Decision**

`GO-WITH-CONDITIONS` — The plan correctly addresses the specification mismatch and provides a viable implementation path, but it must clarify the actual deletion behavior (mutation-driven removal with refetch, not TanStack Query optimistic updates) and acknowledge that the UX change is more significant than presented. The conditions for approval are: (1) correct the technical description in sections 5, 7, and 8 to reflect mutation-then-refetch behavior rather than optimistic updates; (2) add explicit UX guidance about the potential delay between delete click and row disappearance during slow network conditions; and (3) verify that removing `isDeleteSubmitting` from the `isMutationPending` calculation doesn't inadvertently re-enable the "add content" button during active deletions (or justify why that's acceptable).

---

## 2) Conformance & Fit (with evidence)

**Conformance to refs**

- `docs/commands/plan_feature.md` — **Pass** — The plan follows the required template structure with all 16 sections populated, uses the prescribed XML template outputs (properly stripped of markup), and provides file:line evidence throughout. The research log (section 0) demonstrates thorough investigation.

- `docs/features/toast_system_improvements/plan.md` — **Pass** — `plan.md:59` quotes "pure optimistic deletion (row removed instantly when delete is clicked, no intermediate loading state)" and `plan.md:334, 409` confirm this applies to both shopping list lines and kit contents. The plan's scope (removing "Removing..." badge) directly addresses conformance to this specification.

- `docs/contribute/testing/playwright_developer_guide.md` — **Pass** — `plan.md:263-282` documents deterministic test scenarios using instrumentation events (`KitContent:delete`, `KitContent:restore`) and `data-testid` attributes. The plan correctly notes that existing tests do not assert on the "Removing..." badge and should remain green after changes.

- `docs/contribute/architecture/application_overview.md` — **Pass** — The plan respects the architecture: uses generated API hooks (`useDeleteKitsByKitIdContentsByContentId`), relies on TanStack Query cache invalidation via `query.refetch()`, and maintains instrumentation through `trackForm*` helpers.

**Fit with codebase**

- `src/hooks/use-kit-contents.ts` — `plan.md:64-75` — **Confirmed alignment**: The plan accurately identifies `pendingDeleteId` (line 170) and `isDeleteSubmitting` (line 171) as the state variables to remove, and correctly lists all setter call sites (lines 839-840, 854-855, 873-874). The hook's return structure at lines 935-942 does export these values in the `remove` and `overlays` objects, confirming they need removal.

- `src/components/kits/kit-bom-table.tsx` — `plan.md:76-92` — **Confirmed alignment**: The plan correctly traces the prop flow: `overlays.pendingDeleteId` is extracted at line 37, `isDeleting` is computed at line 139, passed as a prop at line 151, destructured at line 193, used in `disableRowActions` calculation at line 207, and renders the badge at lines 279-284. All referenced lines are accurate.

- `src/routes/shopping-lists/$listId.tsx` — `plan.md:146` — **Confirmed pattern**: Shopping list line deletion (lines 288-339) shows no `pendingDeleteId` or `isDeleteSubmitting` state, no loading badges, and no button disabling during deletion—exactly the target pattern the plan seeks to replicate.

- `tests/e2e/kits/kit-contents-undo.spec.ts` — `plan.md:94-99, 278-282` — **Confirmed test safety**: The test file contains no assertions on "Removing..." badge visibility (verified via grep). All five test scenarios focus on undo mechanics, form events, toast events, and backend state verification. The tests should remain green after removing loading state.

---

## 3) Open Questions & Ambiguities

After performing research on the actual mutation implementations, all questions can be answered:

### Question 1: Does TanStack Query perform optimistic updates for deletions?

- **Why it matters**: The plan repeatedly references "optimistic updates" and "TanStack Query's optimistic update behavior" (`plan.md:59, 126, 156, 191, 248`) as the mechanism that makes rows disappear instantly. If this is incorrect, the actual UX differs from the plan's description.

- **Research performed**: Searched `use-kit-contents.ts` and shopping list route for `onMutate` or `optimistic` configurations. Found zero matches. Inspected generated hook `useDeleteKitsContentsByKitIdAndContentId` in `generated/hooks.ts`—it only provides `onSuccess: () => queryClient.invalidateQueries()`. No `onMutate` callback exists.

- **Answer**: **Neither implementation uses TanStack Query optimistic updates.** The deletion flow is: (1) call `mutateAsync`, (2) await backend response, (3) on success, call `query.refetch()` which fetches fresh data and re-renders the list. The row disappears only **after** the backend confirms deletion and the refetch completes, not instantly on button click.

- **Impact**: The plan's description of "row disappears instantly" (sections 5, 7, 8, 12) is misleading. On slow networks, users will experience a delay between clicking delete and seeing the row disappear. The current "Removing..." badge provides feedback during this delay; removing it creates a silent period where the user has no indication their action registered.

- **Needed correction**: Sections 5, 7, 8, and 12 must be rewritten to reflect the actual behavior: "Row disappears after deletion mutation completes and refetch finishes (typically fast on good networks, but may have perceptible delay on slow connections)." The UX description should acknowledge this differs from true optimistic updates.

### Question 2: Does removing `isDeleteSubmitting` affect the global `isMutationPending` flag?

- **Why it matters**: `plan.md:207` shows `disableRowActions` depends on `disableActions`, which receives `disableMutations` from line 39, which is computed as `isArchived || isMutationPending`. The hook computes `isMutationPending` at line 902-903 as: `isCreateSubmitting || isEditSubmitting || isDeleteSubmitting || createMutation.isPending || updateMutation.isPending || deleteMutation.isPending`.

- **Research performed**: Read lines 902-903 and traced usage to line 39 (`disableMutations`), which is passed to `disableActions` prop and gates the "Add content" button and other table-level actions.

- **Answer**: Removing `isDeleteSubmitting` from the calculation leaves `deleteMutation.isPending` as the deletion indicator. This flag is controlled by TanStack Query and will remain `true` from mutation start until `onSuccess`/`onError` callbacks complete. This means the global `isMutationPending` flag will still be `true` during deletion, still disabling the "Add content" button and other table actions. The only difference is the per-row feedback (badge and button disabling) disappears.

- **Impact**: No functional regression. The table-level mutation lock remains active during deletions, preventing concurrent add/edit operations. Only the per-row visual feedback is removed.

- **No change needed**: The plan's implementation is safe; this just confirms the behavior.

### Question 3: Will slow network conditions cause user confusion?

- **Why it matters**: Without the "Removing..." badge, a user on a slow network clicks delete, sees no immediate feedback, and might click delete again (triggering the double-click risk at `plan.md:324-327`) or click edit (triggering the edit-during-deletion risk at `plan.md:329-332`).

- **Research performed**: Compared with shopping list implementation (which has the same issue) and reviewed the plan's risk section.

- **Answer**: This is a known trade-off. The plan's risk section (`plan.md:319-343`) acknowledges these scenarios and notes that shopping list "already works this way without reported issues." The mitigation strategy is to accept this as low-severity and address only if problems arise.

- **Impact**: Acceptable risk for alignment with specification and consistency with shopping list. However, the plan should be more explicit that this **is** a real UX change (not just "aligning behavior") and that the absence of loading feedback may be noticeable on slower networks.

- **Recommended addition**: Section 15 should add a fourth risk: "Risk: User perceives no feedback during slow deletion → Mitigation: Accept this trade-off for spec conformance; if problematic, consider global mutation indicator in future work."

---

## 4) Deterministic Playwright Coverage (new/changed behavior only)

**Behavior:** Kit content deletion on kit detail page

**Scenarios:**
- **Unchanged coverage**: Given user is on kit detail page with 5 contents, When user clicks remove on third content, Then content is removed (via `KitContent:delete` success event), success toast appears with undo button (`tests/e2e/kits/kit-contents-undo.spec.ts:14-62`)
- **Unchanged coverage**: Given undo toast is visible, When user clicks undo, Then content is restored with new ID (via `KitContent:restore` success event and backend verification, `tests/e2e/kits/kit-contents-undo.spec.ts:80-100`)
- **Unchanged coverage**: Given undo toast is visible, When 15 seconds elapse, Then toast is dismissed and content stays deleted (`tests/e2e/kits/kit-contents-undo.spec.ts:105-136`)
- **Unchanged coverage**: Given user removes two contents, When user clicks undo on second deletion, Then only second content is restored, first stays deleted (`tests/e2e/kits/kit-contents-undo.spec.ts:141-208`)
- **Unchanged coverage**: Given user removes content with note, When user clicks undo, Then note is preserved in restored content (`tests/e2e/kits/kit-contents-undo.spec.ts:213-256`)

**Instrumentation:**
- `data-testid="kits.detail.content.{contentId}.remove"` — delete button selector (unchanged)
- `data-testid="kits.detail.toast.undo.{contentId}"` — undo button selector (unchanged)
- Form events: `KitContent:delete` with `phase: 'submit' | 'success' | 'error'` (unchanged)
- Form events: `KitContent:restore` with `phase: 'submit' | 'success' | 'error'` and `metadata.undo: true` (unchanged)
- List loading event: `kits.detail.contents` scope with `phase: 'ready'` after refetch (unchanged)

**Backend hooks:**
- `testData.kits.create()` — factory for creating test kit
- `testData.kits.addContent()` — factory for adding content to kit
- `testData.kits.getDetail()` — helper for verifying backend state post-deletion and post-undo
- `apiClient.GET('/api/parts/{part_key}/kit-reservations')` — metadata lookup for part ID

**Gaps:** None. The plan correctly identifies that existing tests do not assert on the "Removing..." badge (verified via `grep -r "Removing" tests/e2e/kits` returning no matches). All five undo tests focus on form events, toast behavior, and backend state—none of which change. The tests will continue to pass because they wait on instrumentation events (`KitContent:delete` success phase) rather than visual loading indicators.

**Evidence:** `plan.md:263-282` documents the scenarios; `tests/e2e/kits/kit-contents-undo.spec.ts:1-100` confirms the actual test implementation matches the plan's description.

---

## 5) Adversarial Sweep (must find ≥3 credible issues or declare why none exist)

**Major — Plan Misrepresents Technical Mechanism (Optimistic Updates)**

**Evidence:** `plan.md:59, 126, 156, 191, 248` — Multiple references to "TanStack Query's optimistic updates," "TanStack Query optimistically removes row from cache," "optimistic update behavior," and "powered by TanStack Query's optimistic update behavior or instant DOM update."

**Why it matters:** The plan's description creates a false expectation of instant row removal on delete button click. In reality, neither kit content deletion nor shopping list line deletion uses TanStack Query's `onMutate` callback for optimistic updates. Both implementations follow a mutation-then-refetch pattern: (1) call `mutateAsync`, (2) await backend response, (3) call `query.refetch()` on success. The row disappears only **after** the backend confirms deletion and the UI re-renders with fresh data. On slow networks (200ms+ latency), this creates a noticeable delay where the delete button has been clicked but the row remains visible with no loading feedback. The current "Removing..." badge fills this gap; removing it without acknowledging the delay risks user confusion (users may think their click didn't register and click again).

**Fix suggestion:**
1. Remove all references to "optimistic updates" from sections 5, 7, 8, and 12. Replace with accurate description: "Row disappears after deletion mutation completes and refetch finishes (typically sub-second on good networks, but may have perceptible delay on slow connections)."
2. In section 12 (UX / UI Impact), add explicit note: "On slow networks, there will be a delay between clicking delete and row removal (no visual feedback during this period). This matches shopping list behavior but differs from the current kit content deletion which shows 'Removing...' badge during the mutation."
3. In section 8 (Errors & Edge Cases), update the "Slow network" edge case (lines 188-192) to acknowledge this is not just an edge case but the normal behavior—the question is whether the delay is perceptible (typically 50-200ms on good networks, 500ms+ on poor networks).

**Confidence:** High

---

**Major — Missing Analysis of `isMutationPending` Impact**

**Evidence:** `plan.md:288-293` (Slice 1) proposes removing `isDeleteSubmitting` state variable, but the plan does not analyze the downstream impact on `isMutationPending` calculation at `use-kit-contents.ts:902-903`.

**Why it matters:** The `isMutationPending` flag is computed as: `isCreateSubmitting || isEditSubmitting || isDeleteSubmitting || createMutation.isPending || updateMutation.isPending || deleteMutation.isPending`. Removing `isDeleteSubmitting` changes this calculation. While `deleteMutation.isPending` remains and will still reflect deletion in-progress status (solving the functional concern), the plan should explicitly document this to demonstrate awareness of the global mutation lock mechanism. Without this analysis, implementers might assume `isMutationPending` becomes unreliable during deletions, potentially introducing bugs when extending the code.

**Fix suggestion:** Add a new entry to section 6 (Derived State & Invariants):
```
- Derived value: isMutationPending
  - Source: Combination of local submitting flags (isCreateSubmitting, isEditSubmitting) and TanStack Query mutation states (createMutation.isPending, updateMutation.isPending, deleteMutation.isPending)
  - Writes / cleanup: Controls global mutation lock (disables "Add content" button, blocks concurrent mutations)
  - Guards: After removing isDeleteSubmitting, deletion in-progress status is still reflected via deleteMutation.isPending
  - Invariant: The flag must remain true during any mutation to prevent race conditions. Removing isDeleteSubmitting does not break this because deleteMutation.isPending provides equivalent coverage during deletion mutations.
  - Evidence: use-kit-contents.ts:902-903 (calculation), kit-bom-table.tsx:39 (consumption via disableMutations)
```

**Confidence:** High

---

**Major — Underdocumented Double-Click Risk**

**Evidence:** `plan.md:324-327` acknowledges double-click risk but dismisses it as "low-severity (just an error toast that can be dismissed)" with mitigation deferred to "if problematic, add debouncing."

**Why it matters:** The current implementation prevents double-clicks via `isDeleting` disabling the delete button (line 207: `const disableRowActions = disableActions || Boolean(pendingUpdate) || isDeleting;`). After removing this, rapid double-clicks become possible. The plan assumes the second deletion attempt will "fail if content already deleted, showing error toast." However, this depends on race timing:
- **Scenario A**: User double-clicks within 50ms. Both clicks enqueue mutations. First mutation deletes content and triggers refetch. Second mutation starts before refetch completes, hits the (now-deleted) content, returns 404, shows error toast. ✅ Handled gracefully.
- **Scenario B**: User accidentally clicks delete on one row, immediately clicks delete on another row (within mutation window). Both mutations run concurrently. This is actually **safe** because `deletedContentSnapshotsRef` is a Map (line 173, `plan.md:19` notes this supports concurrent deletions). ✅ Handled correctly.

The plan's risk assessment is accurate—this is low-severity and matches shopping list behavior. However, the plan should document **why** concurrent deletions are safe (Map-based snapshot storage) to give implementers confidence.

**Fix suggestion:** In section 15, expand the double-click risk entry to read:
```
**Risk: Double-click creates unexpected error toast**

- Impact: User accidentally double-clicks delete, second deletion attempt fails with error toast (content already deleted). Alternatively, user rapidly deletes multiple rows, triggering concurrent mutations.
- Mitigation: This is low-severity for two reasons: (1) Error toast is dismissible and doesn't corrupt data; (2) Concurrent deletions are safe because deletedContentSnapshotsRef uses a Map (supports multiple simultaneous deletions without conflicts). This matches shopping list behavior. If accidental double-clicks become a reported issue, add 500ms debouncing to delete button click handler.
- Evidence: plan.md:19 (Map for concurrent deletion support), use-kit-contents.ts:173 (Map declaration), shopping-lists/$listId.tsx:299 (Map for shopping list deletions)
```

**Confidence:** Medium

---

**Minor — Incomplete Verification Checklist**

**Evidence:** `plan.md:310-315` (Slice 3) specifies running Playwright tests and `pnpm check`, plus manual verification in browser. However, the plan does not mention verifying that the hook's TypeScript exports are updated.

**Why it matters:** The plan proposes removing `pendingDeleteId` and `isDeleteSubmitting` from the hook's return object (`plan.md:71-74, 292`). If the implementer forgets to update the `overlays` or `remove` objects in the return statement (lines 935-947), TypeScript will still compile (the fields just won't be removed) but the component will still try to consume them (lines 37, 139, 151), leading to stale behavior where the badge continues to appear. This is a low-probability error (easy to catch in manual testing) but should be in the verification checklist.

**Fix suggestion:** In section 14, Slice 3, update the verification steps to include:
```
- Run `pnpm check` to verify TypeScript and ESLint pass
- Verify hook exports: Confirm `overlays.pendingDeleteId` and `remove.isSubmitting` are removed from the return object (use-kit-contents.ts:943-947)
- Run `pnpm playwright test tests/e2e/kits/kit-contents-undo.spec.ts` to verify all 5 tests pass
- Manual verification: Delete kit content in browser, observe instant row removal with no loading badge (may have brief delay on slow network)
```

**Confidence:** Low (nice-to-have, not critical)

---

**Checks attempted but no issues found:**

- **State consistency during refetch**: Verified that removing `pendingDeleteId` doesn't break cache invalidation flow. The `query.refetch()` call at line 870 is independent of `pendingDeleteId` state—it will continue to work correctly. ✅ Safe.

- **Instrumentation event timing**: Verified that form instrumentation events (`trackSubmit`, `trackSuccess`, `trackError`) are emitted independently of `isDeleteSubmitting` state. The instrumentation calls (lines 841-846, 856-861, 877-882) will continue to fire at the correct times. ✅ Safe.

- **Undo functionality integrity**: Verified that snapshot capture (line 837: `deletedContentSnapshotsRef.current.set(row.id, snapshot)`) happens before `setIsDeleteSubmitting(true)` and is independent of loading state. Removing loading state does not affect undo mechanics. ✅ Safe.

- **Archived kit behavior**: Verified that `disableRowActions` calculation (line 207) still receives `disableActions` (from `disableMutations` at line 39), which checks `isArchived`. Removing `isDeleting` from the calculation does not break the archived kit guard. ✅ Safe.

---

## 6) Derived-Value & State Invariants (table)

- **Derived value:** `isDeleting` (row-level deletion indicator)
  - **Source dataset:** `pendingDeleteId` state compared to `row.id` (`kit-bom-table.tsx:139`)
  - **Write / cleanup triggered:** Passed as prop to `KitBOMDisplayRow`, controls `disableRowActions` calculation (line 207), renders "Removing..." badge (lines 279-284)
  - **Guards:** None—this is pure presentational state derived on each render
  - **Invariant:** [REMOVED BY THIS PLAN] After change, no `isDeleting` derivation occurs; row actions remain enabled during deletion unless `disableActions` or `pendingUpdate` conditions apply
  - **Evidence:** `plan.md:76-92`, `kit-bom-table.tsx:139, 151, 193, 207, 279-284`

- **Derived value:** `isMutationPending` (global mutation lock)
  - **Source dataset:** Combination of local submitting flags (`isCreateSubmitting`, `isEditSubmitting`, `isDeleteSubmitting`) and TanStack Query mutation states (`createMutation.isPending`, `updateMutation.isPending`, `deleteMutation.isPending`)
  - **Write / cleanup triggered:** Returned from `useKitContents` hook, consumed by table component as `disableMutations` (line 39), gates "Add content" button and other table-level actions
  - **Guards:** [CHANGED BY THIS PLAN] After removing `isDeleteSubmitting`, deletion in-progress status is still reflected via `deleteMutation.isPending`; the global lock continues to function correctly
  - **Invariant:** Must remain `true` during any mutation (create, edit, delete) to prevent concurrent mutations that could race and corrupt data
  - **Evidence:** `use-kit-contents.ts:902-903` (calculation), `kit-bom-table.tsx:39` (consumption)

- **Derived value:** `disableRowActions` (per-row action disabling)
  - **Source dataset:** `disableActions` prop (from table-level `disableMutations`), `pendingUpdate` for current row, `isDeleting` for current row
  - **Write / cleanup triggered:** Controls `disabled` state of edit button (line 291) and delete button (line 301), provides visual cursor feedback
  - **Guards:** [CHANGED BY THIS PLAN] After removing `isDeleting` from calculation, row actions disable only when `disableActions` (global lock) or `pendingUpdate` (row is being edited) apply; delete button remains enabled during deletion
  - **Invariant:** Must disable actions when global mutation lock is active (prevents concurrent mutations) or when row has pending edit (prevents conflicting updates)
  - **Evidence:** `kit-bom-table.tsx:207` (calculation), `:291, 301` (consumption)

**Proof:** No filtered view drives a persistent write in this change. All three derived values are presentational state used only for UI rendering (button disabling, badge display). The removal of `isDeleting` and `isDeleteSubmitting` eliminates two derived values entirely; the third (`isMutationPending`) continues to derive from remaining sources and maintains its invariant.

---

## 7) Risks & Mitigations (top 3)

- **Risk:** User confusion from lack of visual feedback during deletion on slow networks
  - **Mitigation:** Accept this trade-off to achieve spec conformance ("pure optimistic deletion, no intermediate loading state"). The deletion mutation typically completes in 50-200ms on good networks, making the feedback gap imperceptible. On slower networks (500ms+), the row will remain visible briefly after clicking delete, but this matches shopping list behavior and is consistent with the specification. If user confusion is reported in real usage, consider adding a subtle global mutation indicator (e.g., progress bar in page header) that shows during any mutation without per-row loading state.
  - **Evidence:** `plan.md:319-323`, `docs/features/toast_system_improvements/plan.md:59` (specification requirement)

- **Risk:** Double-click on delete button triggers second mutation attempt, shows error toast
  - **Mitigation:** The current implementation prevents this via `isDeleting` disabling the button; removing this guard allows double-clicks. However, impact is low-severity: (1) Second deletion attempt will fail with 404 (content already deleted), showing dismissible error toast; (2) Concurrent deletions on different rows are safe due to Map-based snapshot storage (`deletedContentSnapshotsRef`). This matches shopping list behavior. If accidental double-clicks become a reported issue, add 500ms debouncing to the delete button click handler.
  - **Evidence:** `plan.md:324-327`, `use-kit-contents.ts:173` (Map for concurrent deletions)

- **Risk:** User clicks edit button during deletion, edit form opens but content disappears mid-edit
  - **Mitigation:** The current implementation prevents this via `isDeleting` disabling the edit button; removing this guard allows edit-during-deletion. If user opens edit form and deletion completes before they modify fields, the form will show stale data. If they submit, the mutation will fail with 404 (content deleted), showing error toast. This matches shopping list behavior (no edit-during-deletion protection). If this becomes a reported issue, consider keeping `isDeleting` in the calculation only for the edit button (compromise: edit button disabled during deletion, delete button remains enabled).
  - **Evidence:** `plan.md:329-332`, `shopping-lists/$listId.tsx:288-339` (no edit-during-deletion protection)

---

## 8) Confidence

**Confidence:** Medium — The plan correctly identifies the specification deviation and proposes a technically sound fix (removing local state variables that track deletion in-progress status). The implementation is well-scoped, backed by comprehensive file:line evidence, and preserves all instrumentation and undo functionality. However, the plan misrepresents the deletion mechanism ("optimistic updates" when actual behavior is mutation-then-refetch), underspecifies the UX impact on slow networks, and omits analysis of the `isMutationPending` calculation. These issues are fixable with clarifying edits to sections 5, 6, 7, 8, 12, and 15. Once corrected, the plan will be implementation-ready. The core technical approach is sound; the documentation quality needs improvement.

---

## Review Metadata

- **Plan reviewed:** `/work/frontend/docs/features/align_deletion_ux/plan.md`
- **Reviewed against:**
  - `docs/commands/plan_feature.md` (template conformance)
  - `docs/features/toast_system_improvements/plan.md` (specification source)
  - `docs/contribute/architecture/application_overview.md` (architecture fit)
  - `docs/contribute/testing/playwright_developer_guide.md` (test coverage)
- **Files inspected:**
  - `src/hooks/use-kit-contents.ts` (lines 165-180, 835-895, 900-949)
  - `src/components/kits/kit-bom-table.tsx` (lines 35-40, 135-155, 180-210, 275-290)
  - `src/routes/shopping-lists/$listId.tsx` (lines 285-340)
  - `tests/e2e/kits/kit-contents-undo.spec.ts` (lines 1-100)
  - `src/lib/api/generated/hooks.ts` (deletion mutation structure)
- **Research performed:**
  - Searched for `onMutate` and `optimistic` in kit contents hook and shopping list route (verified neither uses TanStack Query optimistic updates)
  - Grepped tests for "Removing" and "isDeleting" (verified no test assertions depend on loading state)
  - Traced `isMutationPending` calculation and consumption (verified removing `isDeleteSubmitting` doesn't break global mutation lock)
- **Reviewer:** Claude Code (Sonnet 4.5)
- **Review date:** 2025-10-31
