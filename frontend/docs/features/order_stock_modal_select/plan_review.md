### 1) Summary & Decision
**Readiness**
The plan covers the major UI refactor and instrumentation touchpoints, but conflicting search strategy guidance and missing backend/testing scaffolding signal gaps that would block a smooth slice kickoff.

**Decision**
`GO-WITH-CONDITIONS` — Resolve the instrumentation scope reuse problem and nail down deterministic Playwright backend hooks / search semantics before implementation proceeds.

### 2) Conformance & Fit (with evidence)
**Conformance to refs**
- `docs/product_brief.md` — Pass — `docs/features/order_stock_modal_select/plan.md:21-33` — “Replace the modal’s native dropdown…Shared component will load Concept lists…” keeps the shopping-list workflow intact for the single-user brief.
- `docs/contribute/architecture/application_overview.md` — Pass — `docs/features/order_stock_modal_select/plan.md:37-55` — Plan extends existing domain-driven folders (`components/shopping-lists`, `hooks`) and generated API hooks as required by the architecture overview.
- `docs/contribute/testing/playwright_developer_guide.md` — Fail — `docs/features/order_stock_modal_select/plan.md:247-261` omits the backend factory hooks the guide mandates for deterministic scenarios.

**Fit with codebase**
- `src/components/shopping-lists/concept-list-selector.tsx (new)` — `docs/features/order_stock_modal_select/plan.md:41-45` — Reuse intent is sound, but instrumentation is later hard-coded to `parts.orderStock.lists`, contradicting the reusable component goal.
- `src/components/shopping-lists/part/add-to-shopping-list-dialog.tsx` — `docs/features/order_stock_modal_select/plan.md:37-39` — Swap aligns with existing dialog pattern, yet removal of inline creation must retire `createNewList` state to avoid dead code paths.
- `src/hooks/use-shopping-lists.ts` — `docs/features/order_stock_modal_select/plan.md:45-47,92-95` — Hook extension is plausible, but the plan must clarify whether queries remain client-filtered or leverage backend search to keep cache keys coherent.

### 3) Open Questions & Ambiguities
- Question: Does `/api/shopping-lists` already support `status[]=concept` + `search` query params as assumed? (`docs/features/order_stock_modal_select/plan.md:33,92-95`)
  - Why it matters: Determines whether the new hook can rely on backend filtering or must stay client-side, impacting latency and cache design.
  - Needed answer: Confirmation from backend docs/owners on accepted query parameters and expected search semantics.
- Question: How will the reusable selector expose a consumer-defined list-loading instrumentation scope? (`docs/features/order_stock_modal_select/plan.md:41-45,199-203`)
  - Why it matters: Kits will need their own deterministic waits; a hard-coded scope ties the component to the parts flow.
  - Needed answer: Define a prop/contract for passing the scope (and default) or document a plan-specific reason it can stay parts-only.
- Question: Should search execution stay client-side (`docs/features/order_stock_modal_select/plan.md:141-145`) or trigger backend queries on each term (`docs/features/order_stock_modal_select/plan.md:112-118,92-95`)?
  - Why it matters: Impacts throttling, instrumentation metadata, and the number of React Query entries; conflicting statements risk divergent implementations.
  - Needed answer: Pick one strategy and document the supporting cache/instrumentation plan.

### 4) Deterministic Playwright Coverage (new/changed behavior only)
- Behavior: Order Stock modal — select existing Concept list
  - Scenarios:
    - Given Concept lists exist, When the user searches and selects an existing list, Then the selection persists through submit (`tests/e2e/shopping-lists/parts-entrypoints.spec.ts`).
    - Given a duplicate membership, When the user submits, Then a conflict banner surfaces and instrumentation fires validation events.
  - Instrumentation: `waitForListLoading(page, 'parts.orderStock.lists', 'ready')`, `waitTestEvent` for `ShoppingListMembership:addFromPart` (`docs/features/order_stock_modal_select/plan.md:247-253`).
  - Backend hooks: **Missing — plan does not specify factory calls or API helpers**, violating the Playwright guide requirement for API-first data seeding.
  - Gaps: Major — Coverage cannot be deterministic without defined backend setup/teardown steps.
  - Evidence: `docs/features/order_stock_modal_select/plan.md:247-253`.
- Behavior: Inline Concept list creation within selector
  - Scenarios:
    - Given no matching list, When inline creation completes, Then the new list auto-selects and submit succeeds.
    - Given validation errors, When the dialog submits empty fields, Then validation events emit.
  - Instrumentation: `waitTestEvent` for `ShoppingListCreate:concept`, `waitForListLoading` for selector refresh (`docs/features/order_stock_modal_select/plan.md:255-260`).
  - Backend hooks: **Missing — plan references seller harness but not the shopping list factories required for list creation assertions**.
  - Gaps: Major — Need explicit factory usage / backend coordination before coverage is actionable.
  - Evidence: `docs/features/order_stock_modal_select/plan.md:255-261`.

### 5) **Adversarial Sweep (must find ≥3 credible issues or declare why none exist)**
**Major — Hard-coded list_loading scope blocks reuse**
**Evidence:** `docs/features/order_stock_modal_select/plan.md:13,41-45,199-203` — Plan promises a reusable selector but fixes instrumentation to `'parts.orderStock.lists'`.
**Why it matters:** Future kit consumers cannot emit distinct scopes, breaking deterministic waits or forcing duplicate components.
**Fix suggestion:** Parameterize the scope (and metadata builders) via props/defaults so consumers supply their own instrumentation identifiers.
**Confidence:** High.

**Major — Deterministic coverage lacks backend setup contract**
**Evidence:** `docs/features/order_stock_modal_select/plan.md:247-261`; `docs/contribute/testing/playwright_developer_guide.md:1-118`. Plan lists scenarios but omits required factory/API hooks, conflicting with the guide’s API-first mandate.
**Why it matters:** Without defined backend helpers, tests cannot seed lists or enforce validation states deterministically, risking flaky coverage.
**Fix suggestion:** Enumerate the `testData.shoppingLists` / `testData.parts` factory calls (and any new helpers) each scenario will use.
**Confidence:** High.

**Major — Search strategy contradictions**
**Evidence:** `docs/features/order_stock_modal_select/plan.md:112-118` (backend fetch per term) vs `docs/features/order_stock_modal_select/plan.md:141-145` (client-side filtering) vs `docs/features/order_stock_modal_select/plan.md:92-95` (optional search param).
**Why it matters:** Implementers cannot derive cache keys, throttling, or instrumentation metadata with conflicting guidance, inviting race conditions or double filtering.
**Fix suggestion:** Decide on backend vs client filtering, document the chosen cache key strategy, and adjust derived state/instrumentation notes accordingly.
**Confidence:** Medium.

### 6) Derived-Value & State Invariants (table)
- Derived value: `conceptListOptions`
  - Source dataset: React Query `useConceptShoppingListOptions` results (`docs/features/order_stock_modal_select/plan.md:112-118,141-145`)
  - Write / cleanup triggered: Populates `SearchableSelect` options; reset on modal close.
  - Guards: Debounce/throttle search term (needs concrete implementation).
  - Invariant: Options must mirror backend-filtered results for current search term without stale entries.
  - Evidence: `docs/features/order_stock_modal_select/plan.md:112-145`.
- Derived value: `createDialogOpen`
  - Source dataset: Local state toggled via selector action (`docs/features/order_stock_modal_select/plan.md:148-153`).
  - Write / cleanup triggered: Mounts `ListCreateDialog`; clears on close.
  - Guards: Disable action while selector loading to avoid overlapping dialogs.
  - Invariant: Order Stock form should never show inline fields simultaneously with the create dialog.
  - Evidence: `docs/features/order_stock_modal_select/plan.md:148-153`.
- Derived value: `instrumentationSnapshot`
  - Source dataset: Form memo capturing listId, needed quantity, seller override, part key (`docs/features/order_stock_modal_select/plan.md:155-159`).
  - Write / cleanup triggered: Feeds `trackSubmit/Success/Error`; cleaned when modal closes.
  - Guards: Ensure listId parsed to number before emission.
  - Invariant: Snapshot matches mutation payloads so `ShoppingListMembership:addFromPart` reflects real submissions.
  - Evidence: `docs/features/order_stock_modal_select/plan.md:155-159,192-198`.

### 7) Risks & Mitigations (top 3)
- Risk: Reusable selector ships with parts-only instrumentation scope, blocking other domains.
  - Mitigation: Accept a configurable scope prop and document default usage.
  - Evidence: `docs/features/order_stock_modal_select/plan.md:41-45,199-203`.
- Risk: Undefined backend setup for Playwright scenarios leading to nondeterministic coverage.
  - Mitigation: Enumerate required `testData` factories and any new backend helpers per scenario.
  - Evidence: `docs/features/order_stock_modal_select/plan.md:247-261`.
- Risk: Ambiguous search/filtering plan may double-filter or hammer the backend.
  - Mitigation: Choose client vs server search, align throttling + cache keys, and update plan steps accordingly.
  - Evidence: `docs/features/order_stock_modal_select/plan.md:92-145`.

### 8) Confidence
Confidence: Medium — The plan captures most touchpoints, but unresolved instrumentation scope and deterministic-testing details leave meaningful uncertainty until clarified.
