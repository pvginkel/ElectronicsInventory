# Code Review — Pick List Line Quantity Edit

**Feature:** Inline editing of pick list line quantities
**Reviewer:** Claude Code
**Date:** 2025-12-26
**Scope:** Unstaged changes implementing plan at `docs/features/pick_list_line_quantity_edit/plan.md`

---

## 1) Summary & Decision

**Readiness**

The implementation successfully delivers inline quantity editing for pick list lines following the established part location editing pattern. The code demonstrates strong adherence to project standards: proper separation of concerns with a dedicated mutation hook, optimistic updates with rollback handling, comprehensive instrumentation for Playwright tests, and thorough test coverage exercising all planned scenarios against the real backend. The implementation is complete, well-structured, and verified to pass all local checks (pnpm check and Playwright tests 11/11 passed).

**Decision**

`GO` — Implementation is production-ready. All plan commitments are fulfilled, no blocking issues identified, code follows established patterns, and test coverage comprehensively validates behavior against the real backend. Minor suggestions in subsequent sections are purely optional refinements that do not block shipment.

---

## 2) Conformance to Plan (with evidence)

**Plan alignment**

- **Plan Section 1 (Intent & Scope)** ↔ `src/components/pick-lists/pick-list-lines.tsx:253-311` — Inline editing UI with clickable quantity, input field, Save/Cancel buttons, keyboard shortcuts (Enter/Escape), and edit button. All in-scope items delivered: clickable text, transform to edit mode, keyboard support, PATCH endpoint integration, validation (>= 0), zero quantity handling, optimistic updates, query invalidation, test instrumentation, prevent editing completed lines, disable during pick/undo operations.

- **Plan Section 2 (Affected Areas)** ↔ Implementation files:
  - Pick list lines component: `src/components/pick-lists/pick-list-lines.tsx:68-116` (local state management) and `:232-311` (edit mode UI)
  - Quantity update hook: `src/hooks/use-pick-list-line-quantity-update.ts:1-344` (new file, complete implementation)
  - Generated API hooks: `openapi-cache/openapi.json:7778-7794` (schema), generated hook usage at `src/hooks/use-pick-list-line-quantity-update.ts:5-8`
  - Pick list types: `src/types/pick-lists.ts:414-468` (`applyPickListLineQuantityPatch` helper)
  - Test instrumentation: `src/hooks/use-pick-list-line-quantity-update.ts:206-210` (`useUiStateInstrumentation`)
  - Playwright tests: `tests/e2e/pick-lists/pick-list-detail.spec.ts:628-996` (four new test scenarios)

- **Plan Section 3 (Data Model)** ↔ Implementation contracts:
  - Request shape: `src/hooks/use-pick-list-line-quantity-update.ts:47` (`body: { quantity_to_pick: number }`)
  - Response mapping: `:260-263` (uses `KitPickListDetailSchema_b247181`, passes through `mapPickListDetail`)
  - Query key: `:72-75` (`buildPickListDetailQueryKey`)
  - Optimistic patch: `src/types/pick-lists.ts:421-468` (`applyPickListLineQuantityPatch` signature and algorithm match plan spec exactly)

- **Plan Section 5 (Algorithms & UI Flows)** ↔ Flow implementations:
  - Initiate edit: `src/components/pick-lists/pick-list-lines.tsx:79-82` (`handleStartEdit`)
  - Save change: `:87-104` (`handleSaveEdit` — parse, validate, check unchanged, call mutation, handle response)
  - Cancel edit: `:84-87` (`handleCancelEdit`)
  - Keyboard handling: `:106-114` (`handleKeyDown` — Enter to save, Escape to cancel)
  - Error handling: `src/hooks/use-pick-list-line-quantity-update.ts:284-304` (rollback optimistic update, emit error event, show toast, edit mode retained per plan `:238`)

- **Plan Section 9 (Observability)** ↔ Instrumentation:
  - `ui_state` events: `src/hooks/use-pick-list-line-quantity-update.ts:206-210` (scope `pickLists.detail.quantityEdit`, phases loading/ready/error)
  - Metadata structure: `:18-38` (matches plan spec with `pickListId`, `lineId`, `action`, `oldQuantity`, `newQuantity`, plus ready/error extensions)
  - Test IDs: `src/components/pick-lists/pick-list-lines.tsx:266, 273, 283, 291, 304` (input, save, cancel, edit button, quantity cell — all match plan naming pattern `pick-lists.detail.line.{lineId}.quantity-*`)

- **Plan Section 13 (Deterministic Test Plan)** ↔ Test coverage:
  - Clickable quantity activates edit mode: `tests/e2e/pick-lists/pick-list-detail.spec.ts:690-697`
  - Save button updates quantity: `:698-707`
  - Enter key saves: `:783-794`
  - Escape key cancels: `:771-780`
  - Zero quantity accepted: `:912-940`
  - Completed lines not editable: `:856-877`
  - All scenarios use real backend (factories seed data, mutations via API, backend state verification at `:700-707, :791-796, :936-940`)

**Gaps / deviations**

None. Implementation is complete and faithful to the plan. All deliverables present, no out-of-scope work introduced, instrumentation matches specification, test coverage exercises all planned scenarios.

---

## 3) Correctness — Findings (ranked)

**No blocking or major issues identified.** The following are optional refinements:

- **Title:** `Minor — Input blur behavior not handled`
- **Evidence:** `src/components/pick-lists/pick-list-lines.tsx:258-274` — Input field has no `onBlur` handler
- **Impact:** If user clicks outside the input without pressing Enter or clicking Save/Cancel, edit mode persists indefinitely. This is a usability quirk rather than a bug (user can still cancel), but differs from typical inline edit patterns where blur commits or cancels.
- **Fix:** Add `onBlur={handleCancelEdit}` to the Input component at line 267 to auto-cancel when focus leaves the field (common pattern in inline editors). Alternatively, add `onBlur={() => void handleSaveEdit(lineId, line.quantityToPick)}` to auto-save valid changes on blur.
- **Confidence:** High — observed pattern in similar components, but not a requirement per plan.

---

## 4) Over-Engineering & Refactoring Opportunities

**None identified.** The implementation follows the established part location editing pattern closely and reuses existing abstractions (mutation hook structure mirrors `use-pick-list-execution.ts`, types helper follows `applyPickListLineStatusPatch`). Complexity is justified by requirements (optimistic updates, instrumentation, query invalidation).

---

## 5) Style & Consistency

**No substantive issues.** Code adheres to project patterns:

- **Pattern:** Mutation hook structure — `src/hooks/use-pick-list-line-quantity-update.ts` mirrors `use-pick-list-execution.ts` closely (metadata refs, `useUiStateInstrumentation`, optimistic update with rollback, invalidation chain)
- **Evidence:** Compare `:68-109` (metadata management) with `use-pick-list-execution.ts:64-98`; `:206-210` (instrumentation) with `:290-294`; `:212-311` (mutation lifecycle) with `:296-391, :393-490`
- **Impact:** Maintainability is excellent — developers familiar with pick/undo mutations will immediately understand quantity update flow
- **Recommendation:** None; consistency is a strength here

- **Pattern:** Test ID naming — All test IDs follow `{domain}.{feature}.{entity}.{id}.{field/action}` convention
- **Evidence:** `pick-lists.detail.line.${lineId}.quantity-input`, `.quantity-save`, `.quantity-cancel`, `.quantity-edit` at `src/components/pick-lists/pick-list-lines.tsx:266, 273, 283, 291, 294`
- **Impact:** Playwright selectors remain stable and readable
- **Recommendation:** None; naming is consistent with project standards

---

## 6) Tests & Deterministic Coverage (new/changed behavior only)

**Surface:** Pick list line quantity inline editing

**Scenarios:**

- **Given** open pick list with lines, **When** user clicks Edit button, **Then** edit mode activates with input/Save/Cancel buttons (`tests/e2e/pick-lists/pick-list-detail.spec.ts:690-697`)
- **Given** edit mode active with new quantity, **When** user clicks Save, **Then** mutation succeeds, UI updates, backend persists new quantity (`tests/e2e/pick-lists/pick-list-detail.spec.ts:698-707`)
- **Given** edit mode active, **When** user presses Enter, **Then** quantity saves and edit mode closes (`tests/e2e/pick-lists/pick-list-detail.spec.ts:783-794`)
- **Given** edit mode active, **When** user presses Escape, **Then** edit mode closes without mutation (`tests/e2e/pick-lists/pick-list-detail.spec.ts:771-780`)
- **Given** pick list line with quantity 5, **When** user sets to 0, **Then** backend accepts 0 and line remains open with zero quantity (`tests/e2e/pick-lists/pick-list-detail.spec.ts:912-940`)
- **Given** completed pick list line, **When** page loads, **Then** Edit button not visible and quantity not clickable (`tests/e2e/pick-lists/pick-list-detail.spec.ts:856-877`)

**Hooks:**

- `data-testid="pick-lists.detail.line.{lineId}.quantity-edit"` — Edit button locator
- `data-testid="pick-lists.detail.line.{lineId}.quantity-input"` — Input field
- `data-testid="pick-lists.detail.line.{lineId}.quantity-save"` — Save button
- `data-testid="pick-lists.detail.line.{lineId}.quantity-cancel"` — Cancel button
- `data-testid="pick-lists.detail.line.{lineId}.quantity"` — Quantity display cell
- `waitForUiState(page, 'pickLists.detail.quantityEdit', 'ready')` — Mutation success signal (`:687, :789, :922`)
- `waitForListLoading(page, 'pickLists.detail', 'ready')` — Initial page load (`:656, :761, :864, :918`)
- `apiClient.GET('/api/pick-lists/{pick_list_id}')` — Backend state verification (`:700-707, :791-796, :936-940`)

**Gaps:**

None. All plan scenarios covered. Tests exercise real backend (factories create pick lists via `testData.kits.createPickList`, mutations hit live endpoint, backend state verified via API client). No mocking or interception (adheres to `testing/no-route-mocks` policy). One potential enhancement (not a gap): test for "editing while pick/undo in flight" scenario mentioned in plan section 8, but this edge case may be difficult to reproduce deterministically without adding test-specific backend delays, so omission is acceptable.

**Evidence:**

- Test file: `tests/e2e/pick-lists/pick-list-detail.spec.ts:628-996` (369 lines of new test coverage)
- Real backend usage: `:636-649` (factory-created parts, kits, stock), `:700-707` (backend verification), `:791-796`, `:936-940`
- Instrumentation wait: `:687` (`waitForUiState`), `:656` (`waitForListLoading`)

---

## 7) Adversarial Sweep (must attempt ≥3 credible failures or justify none)

**Attempt 1: Concurrent quantity updates on the same line (race condition)**

- **Attack:** User rapidly clicks Edit → changes value → Save, then immediately clicks Edit again before first mutation completes. Second save could race with first, causing cache corruption or lost update.
- **Evidence:** `src/hooks/use-pick-list-line-quantity-update.ts:319-321` — Guard prevents duplicate mutations: `if (pendingLineId === lineId) { return; }`
- **Why code held up:** `pendingLineId` state tracks in-flight mutation per line. `updateQuantity` short-circuits if line already pending. UI also disables input/buttons when `isQuantityUpdatePending` is true (`src/components/pick-lists/pick-list-lines.tsx:235, 267, 269, 275, 279`), preventing user from initiating second edit.

**Attempt 2: Stale closure in keyboard handler capturing old quantity**

- **Attack:** User enters edit mode, changes quantity to 10, then changes to 15 without pressing Enter. If keyboard handler captures initial `line.quantityToPick` in closure, pressing Enter could compare against stale value.
- **Evidence:** `src/components/pick-lists/pick-list-lines.tsx:106-114` — `handleKeyDown` receives `lineId` and `originalQuantity` as parameters. Handler defined inline on each render, so closure captures current `line.quantityToPick` from props. `handleSaveEdit` reads live `editQuantity` state (`:92`), not captured value.
- **Why code held up:** No stale closure risk because keyboard handler is regenerated on each render with current props, and save logic reads from React state (`editQuantity`), not from closure-captured variables.

**Attempt 3: Optimistic update metrics recomputation incorrect for zero quantity**

- **Attack:** Pick list with single line, quantity 10. User sets to 0. Optimistic update might fail to recompute `total_quantity_to_pick` and `remaining_quantity` to 0, showing stale metrics until backend response.
- **Evidence:** `src/types/pick-lists.ts:441-465` — `applyPickListLineQuantityPatch` calls `computePickListDetailMetrics(nextLines)` after updating line. This helper (`:304-347`) sums all line quantities including zero. Test coverage at `tests/e2e/pick-lists/pick-list-detail.spec.ts:912-940` verifies zero quantity case, asserting backend state (`:936-940`).
- **Why code held up:** Metrics recomputation uses existing battle-tested helper (`computePickListDetailMetrics`) that correctly handles zero quantities. Optimistic update applies same logic as backend, and test verifies end-to-end behavior.

**Attempt 4: Edit mode state leak when component unmounts mid-edit**

- **Attack:** User enters edit mode, then navigates away (or component unmounts for other reason) before saving/canceling. On next mount, could `editingLineId` persist in stale state.
- **Evidence:** `src/components/pick-lists/pick-list-lines.tsx:76` — `editingLineId` and `editQuantity` are local component state (`useState`). On unmount, React disposes state automatically. On remount, state reinitializes to `null` and empty string.
- **Why code held up:** Local state is scoped to component instance lifecycle. No global state or context used for edit mode. Unmount cleanup is automatic via React's state disposal.

---

## 8) Invariants Checklist (table)

**Invariant 1: Pick list total quantity equals sum of line quantities**

- **Where enforced:** `src/types/pick-lists.ts:441-465` — `applyPickListLineQuantityPatch` calls `computePickListDetailMetrics` which sums `lines.map(l => l.quantity_to_pick)` (`:325-329`). Backend also enforces on mutation success (`src/hooks/use-pick-list-line-quantity-update.ts:260-263` sets server response as source of truth).
- **Failure mode:** If optimistic update skipped recomputation, UI would show stale totals until query invalidation refetches. If backend response didn't overwrite optimistic state, cache could diverge.
- **Protection:** `onSuccess` at `:260-261` explicitly calls `queryClient.setQueryData(queryKey, detailResponse)` to replace optimistic state with backend response. `onSettled` at `:306-310` invalidates query to force refetch as fallback.
- **Evidence:** Test at `tests/e2e/pick-lists/pick-list-detail.spec.ts:700-707` verifies `updatedPickList.total_quantity_to_pick === newQuantity` after mutation.

**Invariant 2: Completed lines cannot enter edit mode**

- **Where enforced:** `src/components/pick-lists/pick-list-lines.tsx:237` — `canEditQuantity = !isCompleted && !isLineExecuting && !quantityUpdatePending`. Edit button only renders when `canEditQuantity` is true (`:298-310`). Clickable quantity click handler guards `canEditQuantity` (`:292`).
- **Failure mode:** If guard were missing, user could click Edit on completed line, mutation would fail with backend error, optimistic update would show completed line changing quantity (incorrect UI state).
- **Protection:** UI prevents interaction. Backend also rejects edits on completed lines (business rule per plan section 8). Test at `tests/e2e/pick-lists/pick-list-detail.spec.ts:856-877` verifies Edit button not visible for completed line and quantity not clickable.
- **Evidence:** `:237` computes `canEditQuantity`, `:292, :298` use it to conditionally enable interactions.

**Invariant 3: Only one line editable at a time within component**

- **Where enforced:** `src/components/pick-lists/pick-list-lines.tsx:76` — `editingLineId` is scalar state (not array). `handleStartEdit` at `:79-82` sets `editingLineId` to single line ID. Clicking Edit on different line replaces previous value.
- **Failure mode:** If multiple lines could be in edit mode simultaneously, component would need array state and complex UI layout. Current implementation assumes single edit session.
- **Protection:** React `useState` enforces single value. Clicking Edit on line B while line A is editing automatically closes A (state replaced). Edit mode UI only renders for `isEditingThisLine = editingLineId === lineId` (`:235`).
- **Evidence:** `:235` checks `editingLineId === lineId`, `:254-311` conditionally renders edit mode only for matching line.

**Invariant 4: Mutation rollback restores previous cache state on error**

- **Where enforced:** `src/hooks/use-pick-list-line-quantity-update.ts:214-252` — `onMutate` stores `previousDetail` in mutation context (`:224, :249`). `onError` at `:284-304` checks `mutationContext.previousDetail` and calls `queryClient.setQueryData(queryKey, mutationContext.previousDetail)` (`:292-293`).
- **Failure mode:** If rollback failed, cache would retain optimistic (incorrect) state after error, showing wrong quantity until manual refresh or query invalidation.
- **Protection:** Mutation context carries previous state. Error handler explicitly restores it. `onSettled` at `:305-310` also invalidates query to refetch fresh data as additional safeguard.
- **Evidence:** `:292-293` (rollback code), `:309` (invalidation fallback).

---

## 9) Questions / Needs-Info

**None.** Implementation is clear, complete, and verified. No ambiguities or unresolved decisions blocking confidence.

---

## 10) Risks & Mitigations (top 3)

**Risk 1: User confusion about zero quantity behavior (UX, not technical)**

- **Risk:** Users might expect setting quantity to 0 to delete the line, but backend marks it as "skipped" (status remains `open`, quantity 0). Users could be confused why line still appears in list.
- **Mitigation:** Plan section 15 acknowledges this: "consider adding tooltip or help text if confusion arises in usage." Monitor user feedback post-launch. If confusion occurs, add tooltip to quantity input explaining "0 = skip this line without removing it" or similar. No code change needed now.
- **Evidence:** `tests/e2e/pick-lists/pick-list-detail.spec.ts:939` verifies `status === 'open'` with zero quantity.

**Risk 2: Availability shortfall display lag after quantity change**

- **Risk:** After saving new quantity, availability queries are invalidated (`src/hooks/use-pick-list-line-quantity-update.ts:280`), but refetch is asynchronous. User might see stale stock counts / shortfall indicators briefly.
- **Mitigation:** Plan section 15 acknowledges this: "shortfall is advisory only (doesn't block save)." Invalidation triggers background refetch; UI will update when fresh data arrives. Instrumentation already emits availability loading events (`pickLists.detail.availability` per existing code). If lag is noticeable, consider optimistic availability update (complex, not required now).
- **Evidence:** `:280` invalidates availability, existing instrumentation handles loading state.

**Risk 3: Keyboard navigation accessibility with clickable quantity**

- **Risk:** Clickable quantity text (`:291-295`) uses `onClick` without corresponding keyboard handler. Screen reader users or keyboard-only users might not be able to activate edit mode via quantity cell (Edit button is keyboard-accessible, so workaround exists).
- **Mitigation:** Current implementation provides Edit button (`:298-310`) which is keyboard-accessible. Clickable quantity is convenience shortcut. To improve accessibility, add `tabIndex={0}`, `role="button"`, `onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleStartEdit(...) }}` to quantity span. Not blocking (Edit button provides accessible path), but good enhancement.
- **Evidence:** `:291-295` (clickable span), `:298-310` (accessible button alternative).

---

## 11) Confidence

**Confidence: High** — Implementation faithfully executes the plan, reuses proven patterns (mutation hook structure mirrors existing execution hook, types helper follows established patch pattern), passes all local verification (pnpm check, Playwright tests 11/11), exercises real backend in tests, and demonstrates defensive coding (guards for concurrent mutations, completed line protection, rollback on error). No correctness issues identified, code is readable and well-instrumented, test coverage is comprehensive and deterministic.
