### 1) Summary & Decision
**Readiness**
The slice covers the primary flows, but it never states that the modal will delegate creation/selection to `ShoppingListSelector`, leaving the create path ambiguous, and it still omits cache invalidation and list-loading instrumentation for the new shopping-list kits query, so determinism and cross-surface updates remain at risk.

**Decision**
`GO-WITH-CONDITIONS` — Document the selector hand-off, add bidirectional invalidation, and pair `shoppingLists.detail.kits` with list-loading instrumentation before implementation.

### 2) Conformance & Fit (with evidence)
**Conformance to refs**
- `docs/epics/kits_feature_breakdown.md` — Fail — `docs/features/shopping_list_flow_linking/plan.md:160-176` — The plan never states that the Order Stock modal must reuse `ShoppingListSelector` (which already embeds `ListCreateDialog`), leaving the “create Concept list” requirement from `docs/epics/kits_feature_breakdown.md:192-209` unaccounted for in the documented flow.
- `docs/contribute/testing/playwright_developer_guide.md` — Fail — `docs/features/shopping_list_flow_linking/plan.md:281-284` — "Signal: `shoppingLists.detail.kits` — Type: `ui_state`" (Guide mandates `waitForListLoading` scopes for data fetches; only `ui_state` is planned.)

**Fit with codebase**
- `useGetShoppingListsKitsByListId` — `docs/features/shopping_list_flow_linking/plan.md:178-187` — Refetching only kit detail / list detail leaves this query stale; add explicit invalidation so shopping-list headers update immediately.
- `ShoppingListSelector` integration — `docs/features/shopping_list_flow_linking/plan.md:160-174` — Plan should explicitly call out that the modal reuses the selector (and its built-in create flow) so the form only ever handles existing Concept list IDs.

### 3) Open Questions & Ambiguities
- Question: Can the plan explicitly state that `ShoppingListSelector` (with its baked-in `ListCreateDialog`) provides the Concept list ID, and that the form never sends `new_list_*` fields? (`docs/features/shopping_list_flow_linking/plan.md:160-176`)
- Why it matters: Documenting this ensures developers do not reimplement inline creation or omit the selector’s instrumentation hooks.
- Needed answer: Add a note in the plan describing the selector dependency and ensuring its instrumentation scope stays aligned.

### 4) Deterministic Playwright Coverage (new/changed behavior only)
- Behavior: Kit detail order stock (create & append)  
  - Scenarios:
    - Given shortages exist, When I submit for a new Concept list, Then the toast shows the create message and kit chips include requested units (`tests/e2e/kits/kit-detail.spec.ts`).  
    - Given an existing Concept list, When I append while ignoring reserved stock, Then backend quantities merge and instrumentation reflects the new totals.
  - Instrumentation: `kits.detail.orderStock` UI state, `KitShoppingList:orderStock` form events (`docs/features/shopping_list_flow_linking/plan.md:166-176`, `docs/features/shopping_list_flow_linking/plan.md:260-272`).
  - Backend hooks: Factories in `tests/api/factories/kit-factory.ts` / `shopping-list-factory.ts` seeded for kit/list linkage.
  - Gaps: Selector dependency undocumented (Major); shopping-list kits query never invalidated, so cross-route assertions would read stale data (Major).
  - Evidence: `docs/features/shopping_list_flow_linking/plan.md:166-187`.

- Behavior: Kit detail unlink  
  - Scenarios:
    - Given multiple linked lists, When I confirm unlink, Then the chip disappears and instrumentation shows reduced counts.  
    - Given an archived kit, When I attempt unlink, Then the control is disabled with tooltip feedback.
  - Instrumentation: `kits.detail.links` ready events, toast instrumentation.
  - Backend hooks: Kit factory helpers for seeded links.
  - Gaps: No plan to invalidate `useGetShoppingListsKitsByListId`, so the reciprocal list view remains stale (Major).
  - Evidence: `docs/features/shopping_list_flow_linking/plan.md:178-187`.

- Behavior: Shopping list detail kit chips  
  - Scenarios:
    - Given a linked kit, When I load the detail page, Then kit chips render with status + units.  
    - When I unlink from the list, Then chips disappear here and on kit detail after navigation.
  - Instrumentation: Planned `shoppingLists.detail.kits` `ui_state`.
  - Backend hooks: Shopping list factory ensures kit linkage state.
  - Gaps: Missing `list_loading` scope so Playwright cannot `waitForListLoading`; cross-side invalidation absent (Major).
  - Evidence: `docs/features/shopping_list_flow_linking/plan.md:178-187`, `docs/features/shopping_list_flow_linking/plan.md:281-284`.

### 5) **Adversarial Sweep**
**Major — Selector dependency undocumented**  
**Evidence:** `docs/features/shopping_list_flow_linking/plan.md:160-176` omits any statement that the modal will embed `ShoppingListSelector`, yet `docs/epics/kits_feature_breakdown.md:192-209` requires creating Concept lists; the selector already encapsulates that behavior.  
**Why it matters:** Without documenting the dependency, implementation may attempt a bespoke inline create flow or omit the selector’s instrumentation, leading to duplicated work and gaps in determinism.  
**Fix suggestion:** Explicitly note that the modal reuses `ShoppingListSelector` (with built-in `ListCreateDialog`) and that the form only handles existing Concept list IDs returned from it.  
**Confidence:** High.

**Major — Missing bidirectional cache invalidation**  
**Evidence:** `docs/features/shopping_list_flow_linking/plan.md:171-187` — invalidate only kit detail / shopping list detail, no mention of `getShoppingListsKitsByListId`.  
**Why it matters:** Shopping list detail headers will never show newly linked/unlinked kits, breaking the “bidirectional traceability” requirement and yielding inconsistent tests.  
**Fix suggestion:** Add explicit invalidation / cache update for `useGetShoppingListsKitsByListId` (and any derived hook) after create, append, and unlink mutations.  
**Confidence:** High.

**Major — No `list_loading` instrumentation for shopping-list kit query**  
**Evidence:** `docs/features/shopping_list_flow_linking/plan.md:281-284` — only `ui_state` planned for `shoppingLists.detail.kits`; `docs/contribute/testing/playwright_developer_guide.md:82-109` prescribes `waitForListLoading` for list data.  
**Why it matters:** Playwright cannot deterministically wait for the new data feed, encouraging brittle timeouts and violating instrumentation policy.  
**Fix suggestion:** Pair the `ui_state` scope with `useListLoadingInstrumentation` (e.g., `shoppingLists.detail.kits`) so tests can call `waitForListLoading(..., 'ready')`.  
**Confidence:** High.

### 6) **Derived-Value & State Invariants (table)**
- Derived value: `orderPreviewTotals`
  - Source dataset: Kit BOM contents + `{units, honorReserved}` (`docs/features/shopping_list_flow_linking/plan.md:200-207`)
  - Write / cleanup triggered: Modal preview summary & instrumentation metadata.
  - Guards: Memoised on `[units, honorReserved, contents]`; skip when contents empty.
  - Invariant: Totals never negative or fractional.
  - Evidence: `docs/features/shopping_list_flow_linking/plan.md:200-207`

- Derived value: `sortedShoppingLinks`
  - Source dataset: `kit.detail.shoppingListLinks` (`docs/features/shopping_list_flow_linking/plan.md:208-214`)
  - Write / cleanup triggered: Chip render order + instrumentation payloads.
  - Guards: Stable sort after optimistic updates.
  - Invariant: Concept links precede ready/done.
  - Evidence: `docs/features/shopping_list_flow_linking/plan.md:208-214`

- Derived value: `canOrderStock`
  - Source dataset: Kit status + presence of contents (`docs/features/shopping_list_flow_linking/plan.md:215-219`)
  - Write / cleanup triggered: Button enablement.
  - Guards: Recompute after refetch/mutation.
  - Invariant: Archived kits cannot launch the dialog.
  - Evidence: `docs/features/shopping_list_flow_linking/plan.md:215-219`

### 7) Risks & Mitigations (top 3)
- Risk: Selector dependency is implicit, so developers might re-implement inline list creation or miss instrumentation.  
  - Mitigation: Document that `ShoppingListSelector` (with `ListCreateDialog`) handles creation and that the modal only receives selected Concept list IDs.  
  - Evidence: `docs/features/shopping_list_flow_linking/plan.md:160-176`

- Risk: Shopping list detail chips stay stale after kit-side mutations, undermining bidirectional traceability.  
  - Mitigation: Invalidate / update `getShoppingListsKitsByListId` alongside kit detail caches.  
  - Evidence: `docs/features/shopping_list_flow_linking/plan.md:171-187`

- Risk: Missing `list_loading` scope forces flaky Playwright waits for the new kit-link list.  
  - Mitigation: Add `useListLoadingInstrumentation` (`shoppingLists.detail.kits`) and extend tests accordingly.  
  - Evidence: `docs/features/shopping_list_flow_linking/plan.md:281-284`

### 8) Confidence
Confidence: High — The blockers stem from concrete contract omissions and instrumentation gaps directly observable in the plan.
