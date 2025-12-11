# Plan Review: Delete Shopping List Line from Ready State

## 1) Summary & Decision

**Readiness**

The plan provides a comprehensive, implementation-ready design for adding delete functionality to shopping list lines in Ready state. It demonstrates strong research discipline with detailed evidence from existing components, follows established patterns (confirmation dialogs, mutation hooks, instrumentation), and includes explicit test coverage. The scope is appropriately constrained, avoiding feature creep while addressing the core requirement. All major implementation touchpoints are identified with line-specific evidence, and error handling paths are documented.

**Decision**

`GO` — The plan is complete, well-researched, and follows project conventions. All critical elements (UI changes, confirmation flow, instrumentation, test coverage) are explicitly addressed with evidence from the codebase. No blocking issues identified.

## 2) Conformance & Fit (with evidence)

**Conformance to refs**

- `docs/commands/plan_feature.md` — Pass — `plan.md:6-26` — Research log documents component investigation and pattern identification, conforming to Section 0 requirements
- `docs/commands/plan_feature.md` — Pass — `plan.md:28-70` — Intent & Scope section includes verbatim prompt quotes, in-scope/out-of-scope bullets, and assumptions as required
- `docs/commands/plan_feature.md` — Pass — `plan.md:72-107` — Affected Areas section provides file paths, reasons, and line-range evidence for all touched components
- `docs/commands/plan_feature.md` — Pass — `plan.md:309-336` — Deterministic Test Plan section documents scenarios with Given/When/Then format, instrumentation hooks, and backend coordination
- `docs/product_brief.md` — Pass — Plan aligns with shopping list workflows (Section 10, workflow 6); deletion is an expected inventory management operation
- `docs/contribute/architecture/application_overview.md` — Pass — `plan.md:131-136` — Plan correctly references generated API hooks, TanStack Query, and mutation patterns
- `docs/contribute/testing/playwright_developer_guide.md` — Pass — `plan.md:318-324` — Test plan specifies API-first data setup, deterministic waits via test events, and backend validation

**Fit with codebase**

- `src/components/shopping-lists/ready/ready-line-row.tsx` — `plan.md:73-76` — Plan correctly identifies the actions column as the insertion point and references existing conditional rendering patterns (lines 146-205)
- `src/routes/shopping-lists/$listId.tsx` — `plan.md:91-95` — Plan identifies the route component as the handler location and references existing `handleDeleteLine` implementation for Concept state (lines 288-339)
- `src/components/shopping-lists/list-delete-confirm.tsx` — `plan.md:98-101` — Plan correctly references `useListDeleteConfirm` pattern for confirmation dialogs (lines 21-63)
- `src/hooks/use-shopping-lists.ts` — `plan.md:131-136` — Plan reuses existing `useDeleteShoppingListLineMutation` hook, avoiding duplicate implementations

## 3) Open Questions & Ambiguities

All questions documented in Section 15 have been resolved by the plan author through codebase research:

- **Question (resolved)**: Should delete button appear for lines in 'ordered' or 'done' status?
  - **Resolution**: `plan.md:361-363` — Plan documents that delete button appears when `line.status !== 'done'` based on existing Ready view patterns where edit button follows this rule
  - **Evidence**: Confirmed by examining `ready-line-row.tsx:89-100` where edit button checks `!readOnly && line.status !== 'done'`

- **Question (resolved)**: Should deletion emit an undo toast like Concept state?
  - **Resolution**: `plan.md:367-369` — Plan explicitly excludes undo functionality; confirmation dialog serves as the protection mechanism
  - **Evidence**: Change brief makes no mention of undo; list deletion pattern uses confirmation without undo

No unresolved ambiguities remain.

## 4) Deterministic Playwright Coverage (new/changed behavior only)

- **Behavior**: Ready state line deletion with confirmation dialog
- **Scenarios**:
  - Given a shopping list in Ready state with lines, When user clicks delete icon and confirms, Then line is deleted and removed from UI (`tests/e2e/shopping-lists/shopping-lists-detail.spec.ts` or new spec file)
  - Given a shopping list in Ready state, When user clicks delete icon and cancels, Then line remains in the list
  - Given a shopping list in 'done' state, When viewing Ready view, Then delete icon is not visible
  - Given a line in Ready state, When deletion fails (backend error), Then error toast is shown and line remains in UI
  - Given multiple lines in Ready state, When deleting one line, Then only that line is removed
- **Instrumentation**:
  - `data-testid="shopping-lists.ready.line.{lineId}.actions.delete"` for button selector
  - `waitTestEvent(page, 'form', evt => evt.formId === 'ShoppingListLine:delete' && evt.phase === 'submit')`
  - `waitTestEvent(page, 'form', evt => evt.formId === 'ShoppingListLine:delete' && evt.phase === 'success')`
  - `page.getByRole('button', { name: /delete/i })` for confirmation dialog
- **Backend hooks**: Standard factory methods from `testData.shoppingLists` to create lists in Ready state with lines
- **Gaps**: None identified
- **Evidence**: `plan.md:311-325` documents complete scenario coverage following the pattern from `line-deletion-undo.spec.ts:17-109`

---

- **Behavior**: Delete button visibility based on list and line status
- **Scenarios**:
  - Given a shopping list in Ready state with a line status 'new', When viewing the line row, Then delete button is visible
  - Given a shopping list in Ready state with a line status 'done', When viewing the line row, Then delete button is not visible
  - Given a shopping list in 'done' state, When viewing any line row, Then delete button is not visible
- **Instrumentation**: Standard Playwright visibility assertions on `data-testid="shopping-lists.ready.line.{lineId}.actions.delete"`
- **Backend hooks**: Factory methods to create lists with different statuses and line states
- **Gaps**: None
- **Evidence**: `plan.md:328-336` documents visibility scenarios with evidence from `ready-line-row.tsx:146-148`

## 5) Adversarial Sweep (must find ≥3 credible issues or declare why none exist)

**Minor — Incomplete Handler Threading Evidence**

**Evidence:** `plan.md:79-88` references `seller-group-card.tsx:154-166` and `seller-group-list.tsx:6-30` as files requiring updates to pass `onDeleteLine` handler, but does not quote the exact prop interfaces or handler signatures that must be extended.

**Why it matters:** During implementation, the developer must verify the exact prop types and update TypeScript interfaces. Missing these details could lead to type errors or incorrect handler signatures.

**Fix suggestion:** Add explicit interface snippets showing the current prop signatures and the required additions. For example:
```
- Current: `interface SellerGroupListProps { onEditLine, onRevertLine, ... }`
- Required: Add `onDeleteLine: ReadyLineRowActionHandler`
```

**Confidence:** Medium — The plan correctly identifies all affected files, but lacks the granular interface details that would make implementation smoother.

---

**Minor — Test File Location Ambiguity**

**Evidence:** `plan.md:104-107` states "Area: `tests/e2e/shopping-lists/shopping-lists-detail.spec.ts` or new spec file" without providing clear guidance on which choice to make.

**Why it matters:** The decision impacts test organization and maintainability. Adding to an existing spec could bloat it; creating a new file could fragment coverage. Project conventions should guide this choice.

**Fix suggestion:** Research the existing `shopping-lists-detail.spec.ts` to determine its current scope and line count. If it already covers Ready state workflows, extend it there. If it's focused on Concept state or metadata, create a dedicated `ready-line-deletion.spec.ts` file following the pattern from `line-deletion-undo.spec.ts`. Document the decision explicitly in Section 13.

**Confidence:** Medium — Not a blocker, but implementation would benefit from explicit guidance on test file organization.

---

**Minor — Missing Toast Message Content Specification**

**Evidence:** `plan.md:247-250` mentions "Toast with success message after deletion" with a placeholder message `'Removed part from shopping list'` but notes "(or similar Ready-specific message)" without specifying the exact content.

**Why it matters:** Consistent, clear user feedback is part of the UX contract. The Concept deletion shows "Removed part from Concept list" (line 320 of `$listId.tsx`). Ready deletion should follow the same pattern with appropriate state-specific wording.

**Fix suggestion:** Specify the exact toast message: `'Removed part from Ready list'` to match the Concept pattern, or propose an alternative like `'Line removed from shopping list'` if a more generic message is preferred. Document the choice in Section 12 (UX / UI Impact).

**Confidence:** Low — This is polish-level detail, but explicit specification prevents inconsistency during implementation.

---

**Checks attempted but found sound:**
- **Cache invalidation**: `plan.md:197-201` correctly references `useDeleteShoppingListLineMutation` which invalidates queries on success (verified in `use-shopping-lists.ts:1129-1162`)
- **Pending state management**: `plan.md:178-184` documents the existing `pendingLineIds` set pattern used throughout the route component
- **Confirmation dialog cleanup**: `plan.md:186-192` references the existing dialog state pattern; `use-confirm.ts:45-50` ensures proper cleanup on cancel
- **Form instrumentation**: `plan.md:236-242` correctly uses the same `formId` as Concept deletion (`'ShoppingListLine:delete'`) for consistency
- **Race condition prevention**: `plan.md:228-232` documents the guard `if (detailIsCompleted) return;` to prevent deletion after list transitions to 'done'

## 6) Derived-Value & State Invariants (table)

- **Derived value**: Delete button visibility
  - **Source dataset**: `readOnly` flag (derived from `list.status === 'done'`) and `line.status` (unfiltered line state)
  - **Write / cleanup triggered**: None; purely visual toggle (no cache writes or persistent state changes)
  - **Guards**: `!readOnly && line.status !== 'done'` — ensures button never appears for completed lists or completed lines
  - **Invariant**: Delete button must remain hidden when list status is 'done' OR line status is 'done', regardless of other state
  - **Evidence**: `plan.md:169-175` with reference to `$listId.tsx:733` for `isCompleted` derivation and `ready-line-row.tsx:89` for conditional rendering pattern

---

- **Derived value**: Pending line ID set
  - **Source dataset**: Unfiltered set of line IDs with active mutations (`pendingLineIds: Set<number>`)
  - **Write / cleanup triggered**: `updatePendingLine(lineId, true)` before mutation; `updatePendingLine(lineId, false)` in finally block (cleanup guaranteed even on error)
  - **Guards**: Checked before enabling UI actions; `disabled={pendingLineIds.has(line.id)}` prevents concurrent mutations on the same line
  - **Invariant**: A line ID must remain in the pending set from mutation initiation until mutation completion (success or failure); no line can have multiple concurrent mutations
  - **Evidence**: `plan.md:178-184` with reference to `$listId.tsx:385-395` for existing pattern

---

- **Derived value**: Confirmation dialog open state
  - **Source dataset**: Dialog state object `{ open: boolean, line: ShoppingListConceptLine | null, trigger: HTMLElement | null }`
  - **Write / cleanup triggered**: Set `open=true` on delete click; set `open=false` on cancel/confirm complete; `trigger` element used for focus restoration after close
  - **Guards**: Only one confirmation dialog can be open at a time (single state object, not a stack)
  - **Invariant**: Dialog state must be reset to `{ open: false, line: null, trigger: null }` after every user interaction (confirm or cancel); `line` must never be null when `open` is true
  - **Evidence**: `plan.md:186-193` with reference to `$listId.tsx:139-141` for existing dialog state patterns and `use-confirm.ts:45-50` for cleanup on cancel

> None of these derived values trigger persistent writes from filtered views. All guards are explicit and justified.

## 7) Risks & Mitigations (top 3)

- **Risk**: User confusion between Concept deletion (with undo) and Ready deletion (no undo)
  - **Mitigation**: Confirmation dialog explicitly warns "This action cannot be undone" as documented in `plan.md:304`. Consider adding more explicit messaging such as "Are you sure you want to permanently remove this line?" to reinforce the irreversibility.
  - **Evidence**: `plan.md:343-346` identifies this risk; change brief (`change_brief.md:14-15`) requires confirmation dialog matching existing patterns

---

- **Risk**: Backend may reject deletion in certain Ready states (e.g., line has received stock updates)
  - **Mitigation**: Backend error messages surface via global toast system (`plan.md:204-208`). Ensure backend provides user-friendly error messages for business rule violations. Frontend displays errors verbatim without suppression.
  - **Evidence**: `plan.md:347-351` documents this risk; existing error handling in `$listId.tsx:328-338` shows pattern

---

- **Risk**: Concurrent deletion attempts if user rapidly clicks delete on multiple lines before queries refresh
  - **Mitigation**: Existing `pendingLineIds` set prevents this scenario (`plan.md:212-217`). Delete button is disabled when `pendingLineIds.has(line.id)`. Ensure the handler adds the line ID to pending set before opening the confirmation dialog to block rapid sequential clicks.
  - **Evidence**: `plan.md:352-357` identifies this risk; `$listId.tsx:385-395` shows the existing pending line tracking pattern; `ready-line-row.tsx:58` shows `disableActions` flag usage

## 8) Confidence

**Confidence**: High — The plan follows established patterns (confirmation dialogs via `useConfirm`, mutation hooks, instrumentation), reuses existing infrastructure (`useDeleteShoppingListLineMutation`, pending line tracking), has clear acceptance criteria from the change brief, and documents all touchpoints with line-specific evidence. The three minor issues identified in the adversarial sweep (interface details, test file choice, toast message) are low-severity polish items that do not block implementation.

---

## Additional Observations

**Strengths:**

1. **Thorough research**: The plan author examined 6+ components and documented existing patterns (Concept deletion, list deletion, confirmation dialogs) before designing the Ready deletion flow.

2. **Evidence discipline**: Nearly every claim includes file:line references, making the plan easily verifiable and implementation-ready.

3. **Instrumentation completeness**: Section 9 explicitly documents all test events, selectors, and toast signals required for deterministic Playwright coverage.

4. **Error path coverage**: Section 8 enumerates 4 distinct failure modes with specific handling strategies, demonstrating defensive design thinking.

5. **Scope discipline**: The plan correctly excludes undo functionality (not mentioned in brief) and backend changes (explicitly out of scope), avoiding feature creep.

**Recommendations for implementation:**

1. Before coding, verify the exact TypeScript interfaces for `SellerGroupCard` and `SellerGroupList` props to ensure `onDeleteLine` handler signature matches other handlers (`ReadyLineRowActionHandler` type).

2. Create a dedicated test file `tests/e2e/shopping-lists/ready-line-deletion.spec.ts` to keep Ready state deletion tests separate from Concept state tests, following the organization established by `line-deletion-undo.spec.ts` (which focuses on Concept state).

3. Use the exact toast message `'Line removed from shopping list'` for consistency with general shopping list terminology, or `'Removed part from Ready list'` to match the Concept state pattern if state-specific messaging is preferred.

4. When implementing the confirmation handler, ensure `updatePendingLine(line.id, true)` is called BEFORE opening the dialog, not after confirmation, to prevent rapid sequential clicks on the same line.

5. Add an explicit check `if (detailIsCompleted) return;` at the start of the delete handler to guard against race conditions where the list transitions to 'done' state while the dialog is open.
