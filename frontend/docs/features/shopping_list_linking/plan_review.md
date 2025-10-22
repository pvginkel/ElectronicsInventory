### 1) Summary & Decision
**Readiness**
The slice coverage is broad, but key instrumentation work is underspecified (the plan only commits to “Add new `useUiStateInstrumentation` scope `kits.detail.shoppingLists.dialog`” at `docs/features/shopping_list_linking/plan.md:201-203`, contrary to the `AGENTS.md:40-41` directive to wire `trackForm*`/`useListLoadingInstrumentation`) and the note-prefix contract is left undecided even though the epic defines it (`docs/features/shopping_list_linking/plan.md:145`, `docs/features/shopping_list_linking/plan.md:278-280`, `docs/epics/kits_feature_breakdown.md:177-193`).

**Decision**
`GO-WITH-CONDITIONS` — Resolve the instrumentation omissions and align the note-prefix behavior with the epic before implementation proceeds.

### 2) Conformance & Fit (with evidence)
**Conformance to refs**
- `docs/product_brief.md` — Pass — `docs/features/shopping_list_linking/plan.md:28-35` — “Build a streamlined kit-to-shopping-list dialog… Surface kit ⇄ shopping list chips…” matches the brief’s kit↔shopping list workflow.
- `docs/epics/kits_feature_breakdown.md:177-203` — Fail — `docs/features/shopping_list_linking/plan.md:145`, `docs/features/shopping_list_linking/plan.md:278-280` — The plan defers whether users edit `note_prefix` (“assume optional simple text box”) while the epic already specifies “Append `[From Kit <name>]: <BOM note>`” without user choice.
- `docs/contribute/testing/playwright_developer_guide.md:187` — Fail — `docs/features/shopping_list_linking/plan.md:198-204` — Instrumentation section omits the required `trackFormSubmit`/`trackFormSuccess` hooks for the new dialog form.

**Fit with codebase**
- `src/components/kits/kit-detail.tsx` — `docs/features/shopping_list_linking/plan.md:199-204` — Updating `buildLinkReadyMetadata` aligns with existing `useUiStateInstrumentation('kits.detail.links', …)` scaffolding.
- `src/routes/shopping-lists/$listId.tsx` — `docs/features/shopping_list_linking/plan.md:160-166` — Extending header slots and confirm flow is compatible with the current TanStack Router route.
- `src/components/shopping-lists/shopping-list-link-chip.tsx` — `docs/features/shopping_list_linking/plan.md:191-195` — Reusing the shared chip component maintains styling parity.

### 3) Open Questions & Ambiguities
- Question: How will unlink remain accessible for keyboard and touch users when the destructive affordance is hidden on hover?  
  Why it matters: Without a focus/touch path, unlinking may be impossible on mobile or via keyboard.  
  Needed answer: Confirm focus-visible/touch-friendly alternatives alongside the hover reveal (`docs/features/shopping_list_linking/plan.md:153-155`, `docs/epics/kits_feature_breakdown.md:199-203`).

- Question: Should the dialog expose `note_prefix` as a user-editable field or always send the deterministic prefix from the epic?  
  Why it matters: Diverging from the prescribed prefix risks backend mismatches and inconsistent provenance.  
  Needed answer: Decide whether to auto-populate `[From Kit <name>]` with no UI control or document the customized behavior (`docs/features/shopping_list_linking/plan.md:145`, `docs/features/shopping_list_linking/plan.md:278-280`, `docs/epics/kits_feature_breakdown.md:177-193`).

### 4) Deterministic Playwright Coverage (new/changed behavior only)
- Behavior: Kit detail shopping list workflow  
  - Scenarios:  
    - Given a kit, When the dialog creates a concept list with honor reserved ON, Then a chip appears and toast fires (`docs/features/shopping_list_linking/plan.md:239-242`).  
    - Given an existing list, When append with honor reserved OFF, Then API verifies merged quantities and chip count updates (`docs/features/shopping_list_linking/plan.md:240-242`).  
    - Given a linked list, When unlink after confirmation, Then chip disappears post-refetch (`docs/features/shopping_list_linking/plan.md:242-243`).  
  - Instrumentation: Only `useUiStateInstrumentation` is planned; no `trackFormSubmit`/`trackFormSuccess` or list-loading hook is promised (`docs/features/shopping_list_linking/plan.md:198-204`).  
  - Backend hooks: Uses real mutations and concept list factories per plan (`docs/features/shopping_list_linking/plan.md:239-243`).  
  - Gaps: Missing commitment to `trackForm*` events and `useListLoadingInstrumentation` for the dialog/query, needed for deterministic waits.  
  - Evidence: `docs/features/shopping_list_linking/plan.md:239-245`.

- Behavior: Shopping list detail reciprocal chips  
  - Scenarios: visiting list renders kit chips and post-unlink both list and kit reflect removal (`docs/features/shopping_list_linking/plan.md:247-250`).  
  - Instrumentation: Plan promises only a `useUiStateInstrumentation('shoppingLists.detail.kits')` scope, omitting list-loading signals (`docs/features/shopping_list_linking/plan.md:198-204`).  
  - Backend hooks: Relies on real factories and GET `/shopping-lists/{id}/kits` (`docs/features/shopping_list_linking/plan.md:246-251`).  
  - Gaps: Need explicit `useListLoadingInstrumentation` scope for the new query to keep waits deterministic.  
  - Evidence: `docs/features/shopping_list_linking/plan.md:246-251`.

### 5) Adversarial Sweep
**Major — Form instrumentation is incomplete**  
**Evidence:** `docs/features/shopping_list_linking/plan.md:145-204` — “emit form instrumentation `pending`” / “Add new `useUiStateInstrumentation` scope…” without `trackForm*`; `AGENTS.md:40-41`; `docs/contribute/testing/playwright_developer_guide.md:187`.  
**Why it matters:** Playwright waits rely on `trackFormSubmit` / `trackFormSuccess`; without them the new dialog becomes non-deterministic.  
**Fix suggestion:** Commit to generating a stable form id, wiring `trackFormOpen/Submit/Success/Error`, and documenting the specific scope in the plan.  
**Confidence:** High.

**Major — Missing list-loading instrumentation for new queries**  
**Evidence:** `docs/features/shopping_list_linking/plan.md:183-204` — introduces `useKitShoppingListLinks` / `useShoppingListKitLinks` but only mentions `useUiStateInstrumentation`; `AGENTS.md:40-41`; `docs/epics/kits_feature_breakdown.md:68-70`.  
**Why it matters:** Without `useListLoadingInstrumentation`, tests cannot deterministically observe the new query states, violating the documented contract.  
**Fix suggestion:** Add explicit `useListLoadingInstrumentation` scopes (e.g., `kits.detail.links` if split, `shoppingLists.detail.kits`) with ready/error metadata.  
**Confidence:** High.

**Major — Note prefix behavior conflicts with epic**  
**Evidence:** `docs/features/shopping_list_linking/plan.md:145`, `docs/features/shopping_list_linking/plan.md:278-280` — “optional note prefix… assume optional simple text box”; `docs/epics/kits_feature_breakdown.md:177-193` — deterministic prefix behavior.  
**Why it matters:** Shipping optional user input risks diverging from backend expectations and creating inconsistent provenance notes.  
**Fix suggestion:** Align the plan with the epic by specifying the fixed prefix logic (or document approved deviation) and update tests accordingly.  
**Confidence:** Medium.

### 6) Derived-Value & State Invariants
- Derived value: `effectiveNeeded`  
  - Source dataset: Kit content rows’ `requiredPerUnit`, `available` plus dialog `units` / honor toggle (`docs/features/shopping_list_linking/plan.md:171`).  
  - Write / cleanup triggered: Guides mutation payload preparation and toast messaging.  
  - Guards: None yet; needs declarative clamp before sending.  
  - Invariant: Never compute negative needed quantities; clamp to zero before mutation.  
  - Evidence: `docs/features/shopping_list_linking/plan.md:171`, `docs/epics/kits_feature_breakdown.md:179-181`.

- Derived value: `canSubmit`  
  - Source dataset: Dialog validation state, pending flag, selected existing/new list inputs (`docs/features/shopping_list_linking/plan.md:173`).  
  - Write / cleanup triggered: Enables the submit button and drives Playwright assertions.  
  - Guards: Requires valid units and either existing list selection or trimmed name.  
  - Invariant: Submit must stay disabled while mutation pending or when both list paths are empty.  
  - Evidence: `docs/features/shopping_list_linking/plan.md:173`.

- Derived value: `showUnlinkIcon`  
  - Source dataset: Chip hover/focus state plus mutation pending flag (`docs/features/shopping_list_linking/plan.md:175`).  
  - Write / cleanup triggered: Controls whether the destructive icon renders; prevents duplicate DELETE calls.  
  - Guards: Mutation pending should suppress icon.  
  - Invariant: Never surface the unlink icon when a deletion is in flight.  
  - Evidence: `docs/features/shopping_list_linking/plan.md:175`.

### 7) Risks & Mitigations (top 3)
- Risk: Instrumentation gaps leave Playwright without deterministic handles for the new dialog and reciprocal list query.  
  Mitigation: Document `trackForm*` + `useListLoadingInstrumentation` scopes now (`docs/features/shopping_list_linking/plan.md:198-204`; `AGENTS.md:40-41`).  
  Evidence: `docs/features/shopping_list_linking/plan.md:198-204`.

- Risk: Ambiguous note-prefix handling causes backend/UI contract drift.  
  Mitigation: Commit to the epic-defined deterministic prefix or secure stakeholder approval for user-editable text before build.  
  Evidence: `docs/features/shopping_list_linking/plan.md:145`, `docs/features/shopping_list_linking/plan.md:278-280`, `docs/epics/kits_feature_breakdown.md:177-193`.

- Risk: Hover-only unlink affordance may strand touch/keyboard users.  
  Mitigation: Plan explicit focus-visible/touch interactions (e.g., persistent action button on focus) before implementation.  
  Evidence: `docs/features/shopping_list_linking/plan.md:153-155`, `docs/epics/kits_feature_breakdown.md:199-203`.

### 8) Confidence
<confidence_template>Confidence: Medium — Core flows are mapped, but unresolved instrumentation and contract details introduce non-trivial risk.</confidence_template>
