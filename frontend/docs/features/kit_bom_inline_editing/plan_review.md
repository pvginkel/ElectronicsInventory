### 1) Summary & Decision

**Readiness**
The plan captures the right surfaces and instrumentation hooks, but the optimistic update strategy leaves critical availability fields undefined and the Playwright slice skips archived-gating coverage. Those gaps make the slice risky to build without tightening the data model and test plan.

**Decision**
`GO-WITH-CONDITIONS` — resolve optimistic data accuracy and add archived gating coverage before implementation proceeds.

### 2) Conformance & Fit (with evidence)

**Conformance to refs**
- `docs/epics/kits_feature_breakdown.md` — Pass — `docs/features/kit_bom_inline_editing/plan.md:31` — "Add inline create/edit/delete UI to the BOM card in `KitDetail`, including optimistic cache updates, conflict handling, and status gating for archived kits."
- `docs/contribute/testing/playwright_developer_guide.md` — Fail — `docs/features/kit_bom_inline_editing/plan.md:278` — "Surface: Kit detail BOM management ... Gaps: None planned; all CRUD paths require coverage per spec." (no archived gating scenario despite the guide requiring deterministic coverage for every user-visible state).

**Fit with codebase**
- `useKitDetail` — `docs/features/kit_bom_inline_editing/plan.md:185` — "Source of truth: React Query cache for `['getKitsByKitId', { path: { kit_id } }]`." Plan aligns with current hook but needs clearer mutation utilities for complex optimistic merges.
- `KitBOMTable` — `docs/features/kit_bom_inline_editing/plan.md:125` — placeholder rows risk mismatching the table’s `KitContentRow` contract; implementation must reconcile with `src/types/kits.ts:147`.

### 3) Open Questions & Ambiguities

- Question: How will the inline create flow populate `inStock`, `reserved`, `available`, and `shortfall` for the optimistic placeholder row?
  - Why it matters: Those fields drive the summary badges and list-loading instrumentation; incorrect values will leak into user-visible totals.
  - Needed answer: Whether the UI should skip placeholder metrics, or whether we have a helper to fetch/derive them before inserting into the cache.
- Question: What deterministic helper will Playwright use to force a version conflict before submitting the inline edit?
  - Why it matters: Without a concrete factory/API hook, the conflict scenario in `docs/features/kit_bom_inline_editing/plan.md:282` risks flakiness.
  - Needed answer: Confirm the exact factory function or new helper that will mutate the same row out-of-band.

### 4) Deterministic Playwright Coverage (new/changed behavior only)

- Behavior: Inline add part
  - Scenarios:
    - Given an active kit with contents, When the user submits the inline add form, Then the new row appears with real backend data (`tests/e2e/kits/kit-detail.spec.ts`).
  - Instrumentation: `KitContent:create` form events plus `kits.detail.contents` list-loading ready (`docs/features/kit_bom_inline_editing/plan.md:284`).
  - Backend hooks: Kit factories create base kit + part (`docs/features/kit_bom_inline_editing/plan.md:12`).
  - Gaps: Ensure placeholder state does not block deterministic assertions once refetch resolves.
  - Evidence: `docs/features/kit_bom_inline_editing/plan.md:280-285`.
- Behavior: Inline edit quantity/note
  - Scenarios:
    - Given an existing row, When the user edits quantity and note, Then optimistic UI updates and final backend values match (`tests/e2e/kits/kit-detail.spec.ts`).
  - Instrumentation: `KitContent:update` submit/success + list-loading ready (`docs/features/kit_bom_inline_editing/plan.md:284`).
  - Backend hooks: Mutation helpers in factories must expose patch utilities.
  - Gaps: Need deterministic computation of availability fields before emitting success assertions.
  - Evidence: `docs/features/kit_bom_inline_editing/plan.md:281-284`.
- Behavior: Conflict recovery
  - Scenarios:
    - Given a forced backend update, When the user submits stale data, Then conflict error surfaces, refetch runs, and editor reopens (`tests/e2e/kits/kit-detail.spec.ts`).
  - Instrumentation: `KitContent:update` error event + follow-up success, list-loading ready.
  - Backend hooks: Explicit helper to mutate the content version out-of-band.
  - Gaps: Need concrete helper description; currently unspecified (`docs/features/kit_bom_inline_editing/plan.md:282`).
  - Evidence: `docs/features/kit_bom_inline_editing/plan.md:282-285`.
- Behavior: Inline delete
  - Scenarios:
    - Given an existing row, When the user confirms delete, Then the row disappears and backend reflects removal.
  - Instrumentation: `KitContent:delete` submit/success + list-loading ready.
  - Backend hooks: Factory to seed kit contents and verify deletion via API.
  - Gaps: None noted if availability metrics recompute after refetch.
  - Evidence: `docs/features/kit_bom_inline_editing/plan.md:283-285`.
- Behavior: Archived gating
  - Scenarios:
    - Missing coverage for disabling add/edit/delete when `status === 'archived'`.
  - Instrumentation: Should assert absence of form events when kit archived.
  - Backend hooks: Factory to seed archived kit state.
  - Gaps: **Major** — plan omits this required scenario despite scope call-out.
  - Evidence: `docs/features/kit_bom_inline_editing/plan.md:31`, `docs/features/kit_bom_inline_editing/plan.md:278-285`, `docs/epics/kits_feature_breakdown.md:117`.

### 5) **Adversarial Sweep**

**Major — Optimistic create row lacks inventory metrics**
**Evidence:** `docs/features/kit_bom_inline_editing/plan.md:125` — "On submit, call create mutation; optimistically insert a placeholder row with draft values and pending flag." + `src/types/kits.ts:147` — `KitContentRow` requires `inStock`, `reserved`, `available`, `shortfall`.  
**Why it matters:** Without server-calculated numbers, the placeholder pollutes aggregates and instrumentation metadata, misinforming users and Playwright.  
**Fix suggestion:** Skip inserting a full row until the server payload arrives, or inject a stub that is excluded from aggregates/instrumentation.  
**Confidence:** High.

**Major — Optimistic edit assumes we can recompute availability**
**Evidence:** `docs/features/kit_bom_inline_editing/plan.md:136` — "Submit patch mutation ... optimistically update values in cache while marking row as syncing."  
**Why it matters:** Updating `requiredPerUnit` changes `totalRequired`, `available`, and `shortfall`, but the frontend lacks the backend formula; ad hoc math risks diverging from canonical availability.  
**Fix suggestion:** Limit optimistic edits to the user-facing fields (quantity, note) and rely on refetch to refresh availability metrics before emitting success instrumentation.  
**Confidence:** High.

**Major — Archived gating lacks deterministic coverage**
**Evidence:** `docs/features/kit_bom_inline_editing/plan.md:31` — scope includes "status gating for archived kits," but `docs/features/kit_bom_inline_editing/plan.md:278-285` lists no archived scenario; `docs/epics/kits_feature_breakdown.md:117` mandates BOM actions respect archived gating.  
**Why it matters:** Without a Playwright check, the archived guard can regress silently, violating product requirements.  
**Fix suggestion:** Add a scenario that seeds an archived kit, asserts controls disabled, and ensures no form instrumentation fires.  
**Confidence:** High.

### 6) **Derived-Value & State Invariants (table)**

- Derived value: `existingPartKeys`
  - Source dataset: `contents.map(row => row.part.key)` (`docs/features/kit_bom_inline_editing/plan.md:162`).
  - Write / cleanup triggered: Filters part selector options, influencing allowed submissions.
  - Guards: Allows current row’s key while editing.
  - Invariant: Filter must exclude placeholder rows lacking part metadata to avoid blocking future adds.
  - Evidence: `docs/features/kit_bom_inline_editing/plan.md:162-167`.
- Derived value: `bomAggregates`
  - Source dataset: `summarizeKitContents(contents)` (`docs/features/kit_bom_inline_editing/plan.md:169`).
  - Write / cleanup triggered: Drives badges and instrumentation payloads.
  - Guards: Requires accurate row data; placeholder rows must not affect totals.
  - Invariant: Aggregates should only sum authoritative server-backed rows.
  - Evidence: `docs/features/kit_bom_inline_editing/plan.md:169-174`.
- Derived value: `mutationPendingState`
  - Source dataset: Local mutation statuses + optimistic IDs (`docs/features/kit_bom_inline_editing/plan.md:176`).
  - Write / cleanup triggered: Disables controls and shows pending indicators.
  - Guards: Reset after `query.refetch()` resolves.
  - Invariant: Pending state must clear even when refetch errors.
  - Evidence: `docs/features/kit_bom_inline_editing/plan.md:176-181`.

### 7) Risks & Mitigations (top 3)

- Risk: Aggregates drift when placeholder rows lack backend metrics.
  - Mitigation: Only merge server responses into the cache; keep placeholders out of aggregates.
  - Evidence: `docs/features/kit_bom_inline_editing/plan.md:125`, `docs/features/kit_bom_inline_editing/plan.md:169-174`.
- Risk: Optimistic edit math diverges from backend availability formulas.
  - Mitigation: Restrict optimistic updates to editable fields and refetch before signaling success.
  - Evidence: `docs/features/kit_bom_inline_editing/plan.md:136-138`.
- Risk: Archived gating regressions ship without tests.
  - Mitigation: Add Playwright scenario that seeds an archived kit and asserts controls remain disabled.
  - Evidence: `docs/features/kit_bom_inline_editing/plan.md:31`, `docs/features/kit_bom_inline_editing/plan.md:278-285`, `docs/epics/kits_feature_breakdown.md:117`.

### 8) Confidence

Confidence: Medium — The plan hits key surfaces, but optimistic data gaps and missing gating coverage introduce significant uncertainty until clarified.
