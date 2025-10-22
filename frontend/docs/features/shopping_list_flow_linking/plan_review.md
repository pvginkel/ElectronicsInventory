### 1) Summary & Decision
**Readiness**
The plan now matches the updated epic for the honor-reserved default (dialog initializes ON in the flow — `docs/features/shopping_list_flow_linking/plan.md:140-142`; epic confirms ON — `docs/epics/kits_feature_breakdown.md:177-180`) and relies on chip metadata fields we have documented (`requested_units`, `honor_reserved` — `docs/epics/kits_feature_breakdown.md:205-206`). Remaining blockers are implementation-level: the unlink instrumentation event referenced by tests is still undefined (`docs/features/shopping_list_flow_linking/plan.md:245-256`, `docs/features/shopping_list_flow_linking/plan.md:312-314`), the plan asks to bolt destructive controls onto `ShoppingListLinkChip` even though the component is a link-only wrapper today (`docs/features/shopping_list_flow_linking/plan.md:45-47`, `docs/features/shopping_list_flow_linking/plan.md:156-159`; `src/components/shopping-lists/shopping-list-link-chip.tsx:1-47`), and cache invalidation only covers append, leaving unlink flows underspecified (`docs/features/shopping_list_flow_linking/plan.md:204-206`). These gaps must be addressed before implementation starts.

**Decision**
`GO-WITH-CONDITIONS` — Resolve unlink instrumentation, chip structure, and query invalidation details.

### 2) Conformance & Fit (with evidence)
**Conformance to refs**
- `docs/epics/kits_feature_breakdown.md` — Pass — `docs/features/shopping_list_flow_linking/plan.md:140-142` — “Honor-reserved toggle... initializes ... ON” matches “Honor-reserved toggle defaulting to ON.” `docs/epics/kits_feature_breakdown.md:177-180`
- `docs/contribute/testing/playwright_developer_guide.md` — Fail — `docs/features/shopping_list_flow_linking/plan.md:312-314` cites `KitShoppingList:unlink` waits, but the observability inventory omits the event (`docs/features/shopping_list_flow_linking/plan.md:245-256`) despite the guide’s mandate to define instrumentation before spec work (`docs/contribute/testing/playwright_developer_guide.md:9-10`)

**Fit with codebase**
- `ShoppingListLinkChip` — `docs/features/shopping_list_flow_linking/plan.md:45-47`, `docs/features/shopping_list_flow_linking/plan.md:156-159` — Plan adds menus/unlink controls to a component currently rendered as a bare `<Link>` (`src/components/shopping-lists/shopping-list-link-chip.tsx:1-47`), risking nested interactive elements unless the structure is reworked.
- React Query invalidation — `docs/features/shopping_list_flow_linking/plan.md:204-206` — Only the append path mentions invalidating `['getShoppingListsByListId', listId]`; unlink flow lacks equivalent guidance, so the list detail chips may never drop the removed kit link.

### 3) Open Questions & Ambiguities
- Question: Which test-instrumentation event (name + payload) should emit for unlink so Playwright can `waitTestEvent` deterministically?  
  Why it matters: Specs expect `KitShoppingList:unlink` (`docs/features/shopping_list_flow_linking/plan.md:312-314`), but no such signal is scoped in the observability plan.  
  Needed answer: Document the event (likely another `trackForm*` channel) alongside payload fields before spec updates.
- Question: How will `ShoppingListLinkChip` be restructured to expose an unlink affordance without nesting interactive elements inside the router link?  
  Why it matters: Current component is a link; adding buttons or menus inside violates accessible HTML (`src/components/shopping-lists/shopping-list-link-chip.tsx:1-47`).  
  Needed answer: Spell out the new structure (e.g., split navigation vs. actions) so implementation follows established patterns.
- Question: What cache invalidation strategy ensures shopping list detail and overview queries drop a kit after unlink?  
  Why it matters: Section `State Consistency` only covers append (`docs/features/shopping_list_flow_linking/plan.md:204-206`), leaving unlink refresh behavior undefined.  
  Needed answer: Explicitly list the queries to invalidate/refresh on unlink.

### 4) Deterministic Playwright Coverage (new/changed behavior only)
- Behavior: Kit detail shopping list dialog (create/append)  
  Scenarios:
  - Given an active kit, When the dialog opens, Then honor-reserved defaults ON; When submitting (create or append), Then toast + chip update succeed (`docs/features/shopping_list_flow_linking/plan.md:303-308`).  
  Instrumentation: `KitShoppingList:create` form events (`docs/features/shopping_list_flow_linking/plan.md:245-249`).  
  Backend hooks: `POST /kits/{kit_id}/shopping-lists`, concept list lookup (`docs/features/shopping_list_flow_linking/plan.md:110-118`).  
  Gaps: None — requirements and plan now align.  
  Evidence: `docs/epics/kits_feature_breakdown.md:177-206`

- Behavior: Kit detail unlink chip  
  Scenarios:
  - Given linked chip, When user confirms unlink, Then chip disappears and instrumentation decrements counts (`docs/features/shopping_list_flow_linking/plan.md:312-314`).  
  Instrumentation: Missing `KitShoppingList:unlink` event (plan references but does not define).  
  Backend hooks: `DELETE /kit-shopping-list-links/{link_id}` (`docs/features/shopping_list_flow_linking/plan.md:130-134`).  
  Gaps: **Major** — Add unlink instrumentation entry so Playwright has a deterministic wait.  
  Evidence: `docs/features/shopping_list_flow_linking/plan.md:245-256`, `docs/contribute/testing/playwright_developer_guide.md:9-10`

- Behavior: Shopping list detail kit chips  
  Scenarios:
  - Given linked kits, When detail loads, Then chips render with stale badge and navigate to kit; When unlinking from list side, Then chip disappears and instrumentation signals ready (`docs/features/shopping_list_flow_linking/plan.md:318-322`).  
  Instrumentation: `shoppingLists.detail.links` ui_state (`docs/features/shopping_list_flow_linking/plan.md:252-256`).  
  Backend hooks: `GET /shopping-lists/{list_id}/kits`, `DELETE /kit-shopping-list-links/{link_id}` (`docs/features/shopping_list_flow_linking/plan.md:99-105`, `docs/features/shopping_list_flow_linking/plan.md:130-134`).  
  Gaps: None noted.

### 5) Adversarial Sweep (must find ≥3 credible issues or declare why none exist)
**Major — Unlink instrumentation undefined**  
**Evidence:** `docs/features/shopping_list_flow_linking/plan.md:312-314`, `docs/features/shopping_list_flow_linking/plan.md:245-256`; `docs/contribute/testing/playwright_developer_guide.md:9-10`  
**Why it matters:** Playwright can’t deterministically wait for unlink completion without a `KitShoppingList:unlink` test event, leading to flakes or manual timeouts.  
**Fix suggestion:** Add a `trackFormSubmit/success/error` plan for unlink (mirroring the dialog event) and document payload fields.  
**Confidence:** High

**Major — Chip structure ambiguity risks invalid HTML**  
**Evidence:** Plan assigns unlink UI to `ShoppingListLinkChip` (`docs/features/shopping_list_flow_linking/plan.md:45-47`, `docs/features/shopping_list_flow_linking/plan.md:156-159`), which is currently a pure `<Link>` (`src/components/shopping-lists/shopping-list-link-chip.tsx:1-47`).  
**Why it matters:** Injecting buttons/menus inside a `<Link>` creates nested interactive controls that break keyboard navigation and violate ARIA/HTML semantics.  
**Fix suggestion:** Update the plan to split navigation from actions (e.g., wrap chip content in a container with separate action button) per existing design patterns.  
**Confidence:** Medium

**Major — Unlink cache invalidation unspecified**  
**Evidence:** `docs/features/shopping_list_flow_linking/plan.md:204-206` only call out invalidating `['getShoppingListsByListId', listId]` for append, yet unlink flow (`docs/features/shopping_list_flow_linking/plan.md:156-159`) does not list which queries refresh.  
**Why it matters:** Without explicit invalidation, shopping list detail pages and overview badges could retain deleted links, desynchronizing UI and instrumentation.  
**Fix suggestion:** Extend the state coordination section to enumerate unlink invalidations (kit detail, shopping list detail, overview) and sequencing.  
**Confidence:** Medium

### 6) Derived-Value & State Invariants (table)
- Derived value: `requestedUnits`  
  - Source dataset: `detail.buildTarget` seeds dialog state (`docs/features/shopping_list_flow_linking/plan.md:174-177`).  
  - Write / cleanup triggered: Submitted via `POST /kits/{kit_id}/shopping-lists`; reset when dialog closes (`docs/features/shopping_list_flow_linking/plan.md:140-144`).  
  - Guards: Clamp to ≥1 before submit (`docs/features/shopping_list_flow_linking/plan.md:174-179`).  
  - Invariant: Dialog always reopens with honor-reserved ON and a positive unit count (`docs/epics/kits_feature_breakdown.md:177-180`).  
  - Evidence: `docs/features/shopping_list_flow_linking/plan.md:140-179`

- Derived value: `neededQuantityByContent`  
  - Source dataset: Kit contents + `requestedUnits` + honor-reserved toggle (`docs/features/shopping_list_flow_linking/plan.md:181-184`).  
  - Write / cleanup triggered: Packed into mutation payload per submit, recomputed on reopen (`docs/features/shopping_list_flow_linking/plan.md:147-154`).  
  - Guards: Zero-clamp negatives per epic requirement (`docs/epics/kits_feature_breakdown.md:177-183`).  
  - Invariant: No negative/fractional quantities reach the backend (`docs/features/shopping_list_flow_linking/plan.md:181-186`).  
  - Evidence: `docs/features/shopping_list_flow_linking/plan.md:181-186`

- Derived value: `linkageInstrumentationMetadata`  
  - Source dataset: `detail.shoppingListLinks` and `detail.pickLists` (`docs/features/shopping_list_flow_linking/plan.md:188-190`).  
  - Write / cleanup triggered: Emitted via `useUiStateInstrumentation('kits.detail.links', …)` after queries settle (`docs/features/shopping_list_flow_linking/plan.md:188-194`, `docs/features/shopping_list_flow_linking/plan.md:240-241`).  
  - Guards: Must incorporate fresh counts (stale, honor-reserved) sourced from the updated chip API (`docs/epics/kits_feature_breakdown.md:205-206`).  
  - Invariant: Instrumentation payload matches rendered chip state before emitting ready events (`docs/features/shopping_list_flow_linking/plan.md:188-194`).  
  - Evidence: `docs/features/shopping_list_flow_linking/plan.md:188-194`

### 7) Risks & Mitigations (top 3)
- Risk: Missing unlink instrumentation leaves Playwright without deterministic waits.  
  Mitigation: Add a scoped `KitShoppingList:unlink` event with payload definition in the plan.  
  Evidence: `docs/features/shopping_list_flow_linking/plan.md:245-256`, `docs/features/shopping_list_flow_linking/plan.md:312-314`
- Risk: Embedding destructive actions inside the link chip could break accessibility.  
  Mitigation: Revise the plan to describe a split control pattern (dedicated action button/menu).  
  Evidence: `docs/features/shopping_list_flow_linking/plan.md:45-47`, `docs/features/shopping_list_flow_linking/plan.md:156-159`, `src/components/shopping-lists/shopping-list-link-chip.tsx:1-47`
- Risk: Unlink might not refresh dependent queries, causing stale chips and instrumentation counts.  
  Mitigation: Enumerate React Query invalidations for unlink (kit detail, shopping list detail, overview).  
  Evidence: `docs/features/shopping_list_flow_linking/plan.md:156-159`, `docs/features/shopping_list_flow_linking/plan.md:204-206`

### 8) Confidence
<confidence_template>Confidence: Medium — Product requirements and data contracts are now aligned, but instrumentation and state-management gaps still need explicit fixes.</confidence_template>
