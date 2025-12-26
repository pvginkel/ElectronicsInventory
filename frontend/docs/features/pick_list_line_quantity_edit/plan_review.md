# Plan Review: Pick List Line Quantity Edit

## 1) Summary & Decision

**Readiness**

The plan demonstrates thorough research, accurate evidence citations, and strong alignment with the existing codebase patterns. It correctly identifies the part location edit pattern as the reference implementation and adapts it appropriately for the simpler pick list context. The instrumentation strategy follows established patterns from `use-pick-list-execution.ts`, and the test plan covers deterministic scenarios with real backend coordination. The plan includes proper consideration of optimistic updates, cache invalidation chains, and derived metric recomputation. A few moderate issues require attention before implementation: the helper function naming collision, the need for explicit mutation hook structure documentation, and clarification around the editing state guards when execution is in flight.

**Decision**

`GO-WITH-CONDITIONS` — The plan is implementation-ready pending resolution of the three Major findings detailed below. The conditions are straightforward to address and do not require fundamental redesign. Once the helper naming conflict is resolved, the mutation hook structure is clarified, and the edit-disable coordination is documented, implementation can proceed with high confidence.

---

## 2) Conformance & Fit (with evidence)

**Conformance to refs**

- `docs/commands/plan_feature.md` — Pass — plan:1-465 — All required sections present with complete templates, evidence citations include file:line references, no XML template markers remain
- `docs/product_brief.md` section 7 (Projects/kits) — Pass — plan:33-42, 149-161 — Correctly identifies pick lists as part of kit workflow, references kit membership and kit detail invalidation chains
- `docs/contribute/architecture/application_overview.md` — Pass — plan:86-91, 137-143 — Uses generated API hooks pattern (`usePatchPickListsLinesByPickListIdAndLineId`), follows custom hook wrapper pattern with snake_case→camelCase mapping
- `docs/contribute/testing/playwright_developer_guide.md` — Pass — plan:388-411 — Test plan explicitly requires real backend (API factory coordination), uses instrumentation events (`waitForUiState`), and prohibits request interception as mandated by `testing/no-route-mocks` policy
- `docs/contribute/testing/index.md` — Pass — plan:388-411 — Follows API-first data setup principle, dirty database policy (no cleanup mentioned), deterministic waits via `ui_state` events

**Fit with codebase**

- `src/components/parts/part-location-grid.tsx:387-459` — plan:6-12, 163-198 — Correct reference pattern; plan adapts inline edit UI (input, Save/Cancel buttons, keyboard shortcuts) appropriately for quantity-only editing
- `src/hooks/use-pick-list-execution.ts:290-391` — plan:86-91, 137-161, 246-263 — Instrumentation scope `pickLists.detail.quantityEdit` aligns with existing `pickLists.detail.execution` pattern; optimistic update, mutation lifecycle, and invalidation chain structure matches established hook
- `src/types/pick-lists.ts:304-347` — plan:214-220, 349-413 — References `computePickListDetailMetrics` correctly; proposes parallel helper `applyPickListLineQuantityPatch` following `applyPickListLineStatusPatch` pattern (lines 349-413 in types file)
- `src/components/pick-lists/pick-list-lines.tsx:180-263` — plan:82-84, 367-384 — Correctly identifies quantity as static text at line 200-202; proposes edit mode transformation within existing table structure; guards on `isLineExecuting` (line 182) and `disablePick` (line 183) are appropriately referenced for edit-disable coordination

---

## 3) Open Questions & Ambiguities

**Research performed and answers provided:**

All potential ambiguities were resolvable through codebase research:

- Question: Should zero quantity be allowed, and what is its semantic meaning?
- Answer: OpenAPI schema `PickListLineQuantityUpdateSchema.b247181` allows `quantity_to_pick >= 0` (plan:296); backend interprets 0 as "skip this line" without deletion (plan:292-296). No blocking ambiguity remains.

- Question: What invalidation chain is required after quantity mutation?
- Answer: Plan correctly identifies availability queries (lines:partKey scope, plan:149-154), kit membership queries (plan:155-160), kit detail, and kit overview (plan:358-361 mirrors `use-pick-list-execution.ts:358-361`). Fully specified.

- Question: How does edit mode coordinate with in-flight pick/undo operations?
- Answer: Plan references `executionPending` prop and `isLineExecuting` computation (plan:298-303). However, the exact mechanism for exposing `executionPending` state from the parent component to the PickListLines component requires clarification (see Major finding below).

No open questions remain that block implementation.

---

## 4) Deterministic Playwright Coverage (new/changed behavior only)

- **Behavior:** Pick list line quantity inline editing workflow
  - **Scenarios:**
    - Given an open pick list with lines, When user clicks a line's quantity, Then edit mode activates showing input and buttons (`tests/e2e/pick-lists/pick-list-detail.spec.ts`)
    - Given edit mode active, When user enters new valid quantity and clicks Save, Then mutation succeeds, UI updates, and `ui_state` ready event fires
    - Given edit mode active, When user presses Enter in input, Then same behavior as clicking Save
    - Given edit mode active, When user clicks Cancel or presses Escape, Then edit mode exits without mutation
    - Given pick list with quantity 5, When user changes to 10, Then availability shortfall recalculates if needed
    - Given pick list line, When user sets quantity to 0, Then line accepts 0 and backend marks as skipped
    - Given completed pick list line, When page loads, Then quantity is not editable (no Edit button or clickable text)
    - Given pick/undo in flight, When page renders, Then quantity edit is disabled
  - **Instrumentation:**
    - `data-testid="pick-lists.detail.line.{lineId}.quantity-edit"` for clickable trigger
    - `data-testid="pick-lists.detail.line.{lineId}.quantity-input"`
    - `data-testid="pick-lists.detail.line.{lineId}.quantity-save"`
    - `data-testid="pick-lists.detail.line.{lineId}.quantity-cancel"`
    - `waitForUiState(page, 'pickLists.detail.quantityEdit', 'ready')` for mutation success
    - `waitForUiState(page, 'pickLists.detail.quantityEdit', 'error')` for mutation failure
  - **Backend hooks:**
    - API factory creates pick list with open lines (likely extension to `testData.pickLists` or `testData.kits` factory)
    - Real PATCH endpoint `/api/pick-lists/{pick_list_id}/lines/{line_id}` exercised directly (no mocking per `testing/no-route-mocks` policy)
  - **Gaps:** None identified — all scenarios testable with real backend coordination
  - **Evidence:** plan:388-411 (section 13); plan:16-19 confirms backend PATCH endpoint exists in OpenAPI schema

---

## 5) Adversarial Sweep (must find ≥3 credible issues or declare why none exist)

**Major — Helper function naming collision with non-existent implementation**

**Evidence:** plan:94, 130 — Plan proposes creating `applyPickListLineQuantityPatch` but grep search shows this function does not exist in codebase yet (only mentioned in the plan document itself). Plan references it as if it exists at plan:130 "Similar to `applyPickListLineStatusPatch` pattern, create `applyPickListLineQuantityPatch`" but does not provide implementation guidance or structural details.

**Why it matters:** The optimistic update logic (plan:217, 313-320) depends on this helper to recompute metrics correctly. Without clear specification of the function signature and metric recalculation strategy, implementation may produce incorrect derived values (total quantity, remaining quantity) during the optimistic window, leading to UI flicker or stale data presentation.

**Fix suggestion:** Add a dedicated subsection under section 3 (Data Model / Contracts) or section 5 (Algorithms & UI Flows) specifying the helper function signature and algorithm:

```typescript
function applyPickListLineQuantityPatch(
  detail: KitPickListDetailSchema_b247181,
  lineId: number,
  newQuantity: number,
  options?: { updatedAt?: string }
): KitPickListDetailSchema_b247181
```

The function should:
1. Find the target line by `lineId`
2. Update its `quantity_to_pick` field
3. Recompute metrics by calling `computePickListDetailMetrics(detail.lines)` (referencing plan:214-220)
4. Return new detail object with updated line and metrics
5. Follow immutability pattern matching `applyPickListLineStatusPatch` at `src/types/pick-lists.ts:349-413`

**Confidence:** High — The pattern exists and is well-established, but the plan should spell out the function contract explicitly rather than assuming the implementer will infer it from the status patch example.

---

**Major — Mutation hook structure and instrumentation metadata not fully specified**

**Evidence:** plan:86-91 proposes new hook `src/hooks/use-pick-list-line-quantity-update.ts` but does not provide the detailed function signature, parameters, or return type. Plan:317 references `{ scope: 'pickLists.detail.quantityEdit', phase: ..., metadata: { pickListId, lineId, action: 'updateQuantity', oldQuantity?, newQuantity?, ... } }` but the exact metadata fields and when they are populated are ambiguous.

**Why it matters:** The mutation hook is the integration point between UI component, React Query cache, instrumentation, and backend. Without explicit specification of the hook's API surface (input parameters, return shape, metadata structure), implementation may diverge from the pattern established in `use-pick-list-execution.ts`, leading to inconsistent instrumentation, missing error metadata, or broken test assertions that rely on specific metadata fields.

**Fix suggestion:** Add a code block or structured template under section 4 (API / Integration Surface) or section 14 (Implementation Slices, slice 2) defining the hook signature:

```typescript
export function usePickListLineQuantityUpdate(
  pickListId: number | undefined,
  kitId: number | undefined
): {
  updateQuantity: (lineId: number, newQuantity: number) => Promise<void>;
  isPending: boolean;
  pendingLineId: number | null;
}
```

Clarify instrumentation metadata structure:
- `loading` phase: `{ pickListId, lineId, action: 'updateQuantity', oldQuantity, newQuantity }`
- `ready` phase: add `{ status, openLineCount, completedLineCount, totalQuantityToPick, remainingQuantity }` (mirroring execution hook pattern at plan:345-352 / `use-pick-list-execution.ts:345-352`)
- `error` phase: add `{ message: string }` from error object

Reference the established instrumentation pattern explicitly to avoid implementer confusion.

**Confidence:** High — This is a structural gap in the plan that could lead to implementation churn. The pattern is clear from `use-pick-list-execution.ts`, but the plan should make it explicit rather than rely on inference.

---

**Major — Edit mode disable coordination with in-flight execution not fully specified**

**Evidence:** plan:298-303 states "Disable clickable quantity and Edit button when `executionPending` is true" and references "Component receives `executionPending` prop from parent" but `src/components/pick-lists/pick-list-lines.tsx` does not currently accept an `executionPending` prop. The component computes `isLineExecuting` locally (line 182: `const isLineExecuting = executionPending && isPending;`) using a local `executionPending` variable defined earlier in the same component.

Inspecting the component signature and parent invocation would clarify whether `executionPending` is already threaded through or needs to be added. The plan assumes it exists but does not verify or propose the necessary prop-threading change.

**Why it matters:** If the parent component does not expose execution state to PickListLines, the edit UI cannot properly disable during pick/undo operations, creating a race condition where users could edit quantity while a mutation is in flight, leading to optimistic update conflicts or backend 409 errors.

**Fix suggestion:** Verify the current component signature for `PickListLines` and document the prop-threading change explicitly. Add to section 2 (Affected Areas & File Map):

- Area: Pick list detail page component (parent of PickListLines)
  - Why: Must pass `isPending` state from `usePickListExecution` hook down to PickListLines as `executionPending` prop
  - Evidence: `src/hooks/use-pick-list-execution.ts` exposes `isPending` state; PickListLines must receive it to compute `isLineExecuting` guard

If `executionPending` is already available, cite the evidence. If not, the plan must call out the prop change explicitly to avoid implementation confusion.

**Confidence:** Medium — The issue is real but may already be addressed in the codebase. The plan should verify and document the current state explicitly rather than assume.

---

**Minor — Keyboard shortcut scope and event handler placement ambiguous**

**Evidence:** plan:196-198 states "User clicks Cancel or presses Escape → Component clears `editingLineId` and `editQuantity`" and plan:453-454 mentions "Scope event handlers to input field, test with keyboard navigation" but does not specify whether the Escape handler should be on the input element, the row container, or globally on the document.

The part location grid pattern (referenced at plan:6-12) uses `onKeyDown` on the input elements themselves (`src/components/parts/part-location-grid.tsx:409, 419`), but the plan does not make this explicit.

**Why it matters:** If the handler is attached globally or to a container div, keyboard events may trigger unexpectedly when focus is elsewhere (e.g., when tabbing through other UI elements). If scoped to the input only, Escape works as expected but the pattern should be documented clearly.

**Fix suggestion:** Add clarification to section 5 (Algorithms & UI Flows) under "Cancel quantity edit" flow:

- Event handlers: Attach `onKeyDown` to quantity input element, listening for `key === 'Escape'` to trigger cancel, `key === 'Enter'` to trigger save (if valid)
- Evidence: `src/components/parts/part-location-grid.tsx:409, 419` shows input-scoped keyboard handling

**Confidence:** Medium — This is a minor implementation detail but worth clarifying to avoid confusion during coding.

---

**Minor — Zero quantity edge case UI presentation unclear**

**Evidence:** plan:292-296 states "Allow save, backend updates line as skipped (status remains open, quantity 0)" and "No special UI treatment; shortfall computation handles 0 correctly" but does not clarify how the UI presents a line with quantity 0 after save. Does the line remain visible with "0" displayed? Does it visually change (e.g., grayed out, strikethrough)? Should a tooltip or hint explain that 0 means "skipped"?

**Why it matters:** Users may be confused if they set quantity to 0 expecting the line to disappear, but it remains visible with 0 displayed. The plan should clarify the intended UX to guide implementation and set user expectations appropriately.

**Fix suggestion:** Add a UX clarification to section 12 (UX / UI Impact):

- Entry point: Pick list line with quantity 0
  - Change: Line remains visible, displays "0" in quantity column, status badge remains "Open"
  - User interaction: No visual distinction from other open lines; users understand 0 means "skipped" based on context (consider adding tooltip to quantity field explaining "0 = skip this line" if user confusion is expected)
  - Dependencies: Standard line rendering logic; no special styling required (or propose styling if visual distinction is desired)
  - Evidence: plan:292-296 business rule; UX decision should be explicit

If user confusion is a real risk (per plan:456-458), consider adding a tooltip or help icon next to the quantity input when value is 0.

**Confidence:** Low — This is a UX polish detail that may not block implementation, but calling it out ensures the implementer makes a conscious decision rather than leaving it undefined.

---

**Minor — Optimistic update rollback edge case: what if user is still in edit mode?**

**Evidence:** plan:199-208 describes mutation error handling: "Rollback optimistic update, show conflict toast with retry suggestion, Component remains in edit mode (user can retry or cancel)" but does not specify what happens to the input field value. If the user edited from 5 to 10, mutation fails, and optimistic update rolls back to 5, does the input field reset to 5 or stay at 10?

**Why it matters:** If the input remains at 10, the user sees a mismatch between their input and the rolled-back display (if visible elsewhere). If it resets to 5, the user may be surprised that their value was discarded. The plan should clarify the intended behavior.

**Fix suggestion:** Add a note to section 8 (Errors & Edge Cases) under "Backend validation error (400)":

- Handling: Rollback optimistic update, emit error event, show toast, retain edit mode **with user's input value preserved in the input field** (the optimistic rollback affects the query cache and derived metrics, but the component's local `editQuantity` state remains unchanged so the user can review their input and retry)
- Alternative: If input should reset to the rolled-back value, state "reset `editQuantity` to `line.quantityToPick.toString()` on error to reflect rolled-back cache state"

Choose one approach and document it explicitly to avoid implementation confusion.

**Confidence:** Low — This is an edge case polish detail, but documenting the intent improves implementation quality and avoids ad hoc decisions during coding.

---

## 6) Derived-Value & State Invariants (table)

- **Derived value:** Pick list total quantity to pick
  - **Source dataset:** Filtered to all lines (open + completed), summing `quantity_to_pick` field
  - **Write / cleanup triggered:** Backend recomputes `total_quantity_to_pick` after PATCH; optimistic update must mirror via `applyPickListLineQuantityPatch` helper
  - **Guards:** Mutation hook calls `cancelQueries` before optimistic update to prevent race with in-flight query; backend validates `quantity_to_pick >= 0`
  - **Invariant:** `total_quantity_to_pick === sum(lines.map(l => l.quantity_to_pick))` must hold in both optimistic and server-confirmed states
  - **Evidence:** plan:214-220; `src/types/pick-lists.ts:304-347` (`computePickListDetailMetrics` function)

- **Derived value:** Remaining quantity
  - **Source dataset:** Filtered to open lines only, computed as `total_quantity_to_pick - picked_quantity`
  - **Write / cleanup triggered:** Optimistic update recalculates `remaining_quantity` when line quantity changes; backend response confirms final value
  - **Guards:** Cannot edit completed lines (backend business rule, UI enforces by hiding edit trigger when `line.status === 'completed'`), plan:304-309
  - **Invariant:** `remaining_quantity = total_quantity_to_pick - picked_quantity` where `picked_quantity = sum(completed lines.quantity_to_pick)`
  - **Evidence:** plan:221-227; `src/types/pick-lists.ts:337` computation

- **Derived value:** Line group metrics (quantity per part)
  - **Source dataset:** Filtered/grouped by `kitContentId`, aggregated into `totalQuantityToPick` and `openQuantityToPick` per group
  - **Write / cleanup triggered:** UI component re-groups lines after query cache update via `useMemo` (plan:231)
  - **Guards:** Cache update triggers React re-render, `useMemo` dependencies include the lines array so grouping recalculates when any line quantity changes
  - **Invariant:** Group quantities must match sum of individual line quantities within that group; no lines orphaned or double-counted
  - **Evidence:** plan:228-234; `src/types/pick-lists.ts:170-216` (`groupPickListLines` function)

- **Derived value:** Availability shortfall per line
  - **Source dataset:** Filtered to open lines, computed as `max(0, line.quantityToPick - inStockQuantity)`
  - **Write / cleanup triggered:** Changing quantity updates shortfall display; availability query invalidation (plan:149-154, 361) triggers refetch of stock counts
  - **Guards:** Shortfall only shown for open lines where `availabilityEnabled && inStockQuantity !== null` (plan:239-241)
  - **Invariant:** Shortfall visibility depends on availability query success state; if availability query is stale or failed, shortfall may be based on outdated stock counts (advisory only, does not block save per plan:449-450)
  - **Evidence:** plan:235-241; `src/components/pick-lists/pick-list-lines.tsx:319-333` (shortfall computation logic referenced in plan)

All derived values are guarded appropriately. No filtered views drive persistent writes without safeguards. The optimistic update pattern ensures invariants hold during the mutation window by mirroring backend metric recomputation logic.

---

## 7) Risks & Mitigations (top 3)

- **Risk:** Optimistic update metrics recomputation incorrect
  - **Mitigation:** Reuse existing `computePickListDetailMetrics` helper (plan:214-220); add unit tests for edge cases (0 quantity, all lines completed); validate optimistic patch matches backend response shape during Playwright test assertions
  - **Evidence:** plan:440-443

- **Risk:** Concurrent edits by multiple users cause conflicts
  - **Mitigation:** Backend should detect version conflicts (409); UI shows conflict toast and refreshes query to fetch latest state; document expected behavior as last-write-wins (no locking); instrumentation metadata includes `isConflict` flag for test assertions (plan:287-291)
  - **Evidence:** plan:444-447

- **Risk:** User edits quantity while availability is stale
  - **Mitigation:** Invalidate availability queries after mutation to refresh stock counts (plan:149-154, 361); shortfall is advisory only and does not block save; UI may briefly show outdated shortfall during availability refetch but this is acceptable given async nature of multi-query coordination
  - **Evidence:** plan:448-451

Additional risks (plan:452-459) around keyboard shortcuts and zero quantity UX are lower priority and mitigated through testing and potential tooltip enhancements.

---

## 8) Confidence

**Confidence:** High — The plan replicates an existing well-tested pattern (part location editing documented at `src/components/parts/part-location-grid.tsx:387-459`), the backend PATCH endpoint is already implemented (OpenAPI schema confirmed), and the codebase provides strong scaffolding for optimistic updates (`applyPickListLineStatusPatch` at `src/types/pick-lists.ts:349-413`), instrumentation (`useUiStateInstrumentation` at `src/lib/test/ui-state.ts`), and query invalidation chains (`use-pick-list-execution.ts:358-361`). The primary complexity is ensuring metric recomputation correctness in the optimistic update, which is mitigated by reusing the existing `computePickListDetailMetrics` helper. The Major findings identified above are addressable through clarification and documentation without requiring fundamental redesign. Once the helper function signature, mutation hook API surface, and edit-disable coordination are made explicit, implementation can proceed with minimal risk of scope creep or architectural mismatch.
