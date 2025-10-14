# 1) Summary & Decision
The plan captures the Phase 2 polish focus areas and ties them to existing React/TanStack surfaces, but it alters established instrumentation contracts and introduces ambiguous gating for seller group editing that would regress today’s flows.  
Decision: GO-WITH-CONDITIONS — resolve instrumentation id/metadata regressions and clarify seller group read-only logic.

# 2) Conformance & Fit (with evidence)
- **Conformance to refs**
  - Product brief — Pass. The scope keeps shopping list management responsive, matching the brief’s need to “maintain a shopping list for parts you don’t have yet” (docs/product_brief.md:64-68) and tightens Ready/Completed workflows (docs/features/shopping_list_detail_phase2/plan.md:3-5).
  - Plan template — Pass. Required sections are present (brief, relevant files, algorithms, Playwright coverage) and stay implementation-focused without code (docs/features/shopping_list_detail_phase2/plan.md:3-59).
  - AGENTS — Fail. AGENTS requires instrumentation stability (“Treat instrumentation as part of the UI contract” — AGENTS.md:34-41), but the plan introduces a new form id `"ShoppingListSellerOrderNote:edit"` (docs/features/shopping_list_detail_phase2/plan.md:31-33), diverging from today’s seller-specific ids.
- **Fit with codebase**
  - Reusing the existing ready toolbar pattern for a `ConceptToolbar` aligns with `MarkReadyFooter`’s instrumentation contract (`ShoppingListStatus:markReady`) already wired in `src/components/shopping-lists/mark-ready-footer.tsx:1-58` and recognized in Playwright (docs/features/shopping_list_detail_phase2/plan.md:19-21).
  - Guarding Ready actions via `isCompleted` should extend the route logic that currently mounts dialogs for both ready/done states (`src/routes/shopping-lists/$listId.tsx:203-370`) and respects `useListLoadingInstrumentation` metadata (docs/features/shopping_list_detail_phase2/plan.md:37-40).
  - Seller group polish targets the components actually rendering order notes and inline actions today (`src/components/shopping-lists/ready/seller-group-card.tsx:1-198`, `ready-line-row.tsx`, `seller-group-list.tsx`), so scope placement matches the domain modules (docs/features/shopping_list_detail_phase2/plan.md:30-36).

# 3) Open Questions & Ambiguities
- How should the `readOnly` flag differentiate between hiding “Mark group as Ordered” versus keeping “Edit Group” available when a group still needs note edits? Clarify before implementation to avoid cutting off seller collaboration (docs/features/shopping_list_detail_phase2/plan.md:32-33).
- What exact copy should the Completed toolbar helper show, and does it require localization or analytics tags? Provide the finalized string / instrumentation expectation (docs/features/shopping_list_detail_phase2/plan.md:39-40).
- For the wheel-capture change, should other consumers of `SearchableSelect` opt in, or is the handler globally safe? Spell out whether new props are optional and how they propagate (docs/features/shopping_list_detail_phase2/plan.md:27-29).

# 4) Deterministic Playwright Coverage (new/changed behavior only)
- **Concept header & toolbar regression** (docs/features/shopping_list_detail_phase2/plan.md:48-50)  
  Scenarios: Given a Concept list, When the detail page loads, Then badges mirror Overview chips and `ConceptToolbar` exposes `Mark Ready`. When the button fires, Then `ShoppingListStatus:markReady` submit/success events emit.  
  Instrumentation: `shopping-lists.concept.mark-ready.button`, existing `ShoppingListStatus:markReady` form id (`src/components/shopping-lists/mark-ready-footer.tsx:33-56`).  
  Backend hooks: Use real list factory + `waitTestEvent` like current ready flow (`tests/e2e/shopping-lists/shopping-lists.spec.ts:40-87`).
- **Add-part dialog scroll & sorting** (docs/features/shopping_list_detail_phase2/plan.md:50-53)  
  Scenarios: Given the Concept add-line dialog, When the selector list exceeds the viewport and the user scrolls the wheel, Then options scroll; When filtering, Then rendered text is `<description> (<key>)` sorted alphabetically.  
  Instrumentation: Need a stable container test id from `searchable-select` (today `data-testid` is provided by consumers); specify which id Playwright should target.  
  Backend hooks: Use existing `testData.parts.create` helpers to seed options (tests/e2e/shopping-lists/shopping-lists.spec.ts:102-153).
- **Seller group editing flow** (docs/features/shopping_list_detail_phase2/plan.md:51-52)  
  Scenarios: Given a Ready list with an order note, When “Edit Group” opens the dialog and submits changes, Then the inline panel updates visibility and instrumentation emits open/submit/success events.  
  Instrumentation: Must keep the seller-scoped form id `ShoppingListSellerOrderNote:{sellerId}` (`src/components/shopping-lists/ready/seller-group-card.tsx:111-119`); plan’s new id breaks the contract — mark **Major** until corrected.  
  Backend hooks: Rely on `useUpdateSellerOrderNoteMutation` against the real API (`src/hooks/use-shopping-lists.ts:667-760`).
- **Ready-line inline actions** (docs/features/shopping_list_detail_phase2/plan.md:52-53) — **Major** gap.  
  Scenarios: Define Given/When/Then for `Mark as Ordered`, `Undo`, `Update Stock`, `Edit` icon flows with assertions on state changes.  
  Instrumentation: Plan omits which form/test events to await (`ShoppingListLineOrder`, `ShoppingListLineRevert`, `ShoppingListLineReceive`, etc.); add explicit `waitTestEvent` hooks.  
  Backend hooks: Use existing real mutations via `useOrderShoppingListLineMutation`, `useRevertShoppingListLineMutation`, `useCompleteShoppingListLineMutation` (src/routes/shopping-lists/$listId.tsx:111-205).
- **Completed read-only view** (docs/features/shopping_list_detail_phase2/plan.md:53-53, 37-40)  
  Scenarios: Given a Done list, Then Ready rows render without action buttons, toolbar shows read-only copy, and list metadata reports done status.  
  Instrumentation: Keep `waitForListLoading(..., 'ready')` expectations that currently assert `{ status: 'done', view: 'ready' }` (tests/e2e/shopping-lists/shopping-lists.spec.ts:40-110).  
  Backend hooks: Use test data helpers to mark list done via real mutations before visiting.

# 5) **Adversarial Sweep**
- **[A] Major — Seller note instrumentation id regression**  
  **Evidence:** The plan introduces `"ShoppingListSellerOrderNote:edit"` for the dialog (`docs/features/shopping_list_detail_phase2/plan.md:31-33`), while the current component emits seller-scoped ids (`src/components/shopping-lists/ready/seller-group-card.tsx:111-119`). Tests assert these ids when syncing notes.  
  **Why it matters:** Changing the id breaks Playwright’s `waitTestEvent` hooks and analytics that rely on seller-specific labels, leaving note edits untracked.  
  **Fix suggestion:** Keep the existing `ShoppingListSellerOrderNote:{sellerId|groupKey}` id scheme when moving logic into the dialog.  
  **Confidence:** High.
- **[B] Major — Read-only flag blocks order note edits**  
  **Evidence:** Plan routes a `readOnly` flag “derived from list status or `group.hasNewLines`” to hide actions (docs/features/shopping_list_detail_phase2/plan.md:32-33). Today, the edit form is always available when `sellerId` exists (`src/components/shopping-lists/ready/seller-group-card.tsx:47-197`).  
  **Why it matters:** When a group has no `new` lines (all ordered/received), users still need to edit/clear notes. Collapsing both buttons under a `readOnly` flag removes that capability, blocking updates before completion.  
  **Fix suggestion:** Gate “Mark group as Ordered” off `group.hasNewLines`, but leave “Edit Group” active unless the entire list is completed.  
  **Confidence:** Medium.
- **[C] Major — Completed metadata contract break**  
  **Evidence:** Plan switches `getReadyMetadata` to report `view: 'completed'` for done lists (docs/features/shopping_list_detail_phase2/plan.md:37-40). Existing tests assert `{ status: 'done', view: 'ready' }` after mark-done (`tests/e2e/shopping-lists/shopping-lists.spec.ts:61-88`), and current hook maps done/ready into `'ready'` (src/hooks/use-shopping-lists.ts:688-705).  
  **Why it matters:** Changing the field breaks deterministic telemetry assertions and any analytics dashboards keyed on `view: 'ready'` for Ready/Done.  
  **Fix suggestion:** Keep `view: 'ready'` for done lists (maybe add a separate `status`/`isCompleted` flag) so instrumentation remains backward-compatible.  
  **Confidence:** High.

# 6) **Derived-Value & Persistence Invariants**
| Derived value | Source dataset (filtered/unfiltered) | Write/cleanup it triggers | Guard conditions | Invariant that must hold | Evidence (file:lines) |
| ------------- | ------------------------------------ | ------------------------- | ---------------- | ------------------------ | --------------------- |
| `isCompleted` flag guarding dialogs | `shoppingList.status` (unfiltered list detail) | Skips mounting order/stock dialogs and no-ops handlers | `status === 'done'` | No Ready mutations fire or mount when list is completed | docs/features/shopping_list_detail_phase2/plan.md:37-39 |
| Seller-group `readOnly` flag | `group.hasNewLines` (filtered per seller group) + overall list status | Hides “Mark group as Ordered” / “Edit Group” buttons | `!group.hasNewLines` or `status === 'done'` | Must not block note edits while list still in Ready state | docs/features/shopping_list_detail_phase2/plan.md:32-33 |
| `hasNewLines` aggregate in hook | `sellerGroups` array (aggregated) | Disables group-order button logic elsewhere | Aggregation truthy check | Aggregate must match any group with `hasNewLines` to avoid disabling order actions incorrectly | docs/features/shopping_list_detail_phase2/plan.md:40 |

# 7) Risks & Mitigations (top 3)
- Instrumentation id changes break Playwright assertions — keep existing `ShoppingListSellerOrderNote:{id}` format before introducing the dialog.
- Ambiguous `readOnly` gating removes seller note edits — split button gating so “Edit Group” stays available until the list is fully completed.
- Metadata contract drift (`view: 'ready'`) would fail current tests — preserve the existing value or add a new field while keeping compatibility.

# 8) Confidence
Medium — The plan is grounded in existing modules, but instrumentation and gating ambiguities create multiple high-confidence regressions that must be clarified before implementation.
