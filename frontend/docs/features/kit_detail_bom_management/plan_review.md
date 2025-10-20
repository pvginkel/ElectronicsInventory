### 1) Summary & Decision
**Readiness**
Plan covers the major surfaces but key behaviors (availability rollups, duplicate prevention, filter telemetry) are underspecified or misaligned with references, so implementation would ship with incorrect data and failing coverage.

**Decision**
`GO-WITH-CONDITIONS` — Must fix availability snapshot source, front-end duplicate guard, and filter instrumentation before execution.

### 2) Conformance & Fit (with evidence)
**Conformance to refs**
- `docs/epics/kits_feature_breakdown.md` — Fail — `docs/features/kit_detail_bom_management/plan.md:201-208`, `docs/features/kit_detail_bom_management/plan.md:262-265`, `docs/epics/kits_feature_breakdown.md:68-72` — "validation ensures integer ≥1 and unique part per kit" followed by "Guardrails: ... rely on backend duplicate enforcement."
- `docs/contribute/testing/playwright_developer_guide.md` — Fail — `docs/features/kit_detail_bom_management/plan.md:362-368`, `docs/features/kit_detail_bom_management/plan.md:248-252`, `docs/contribute/architecture/test_instrumentation.md:35-36` — Filter scenario expects fresh metadata from `waitForListLoading`, but list-loading emitters only fire on query lifecycle changes.
- `docs/contribute/architecture/application_overview.md` — Pass — `docs/features/kit_detail_bom_management/plan.md:181-208` — Plan reuses `DetailScreenLayout`, TanStack Router routes, and generated hooks per architecture guidance.

**Fit with codebase**
- `KitDetail` workspace — `docs/features/kit_detail_bom_management/plan.md:181-209` — Aligns with existing `PartDetails` structure and instrumentation hooks.
- `KitContent` state — `docs/features/kit_detail_bom_management/plan.md:222-240` — Derived state list matches existing detail screens, but availability snapshot source conflicts with expected full-data aggregates.

### 3) Open Questions & Ambiguities
- Question: Will linked shopping/pick list chips ship in this slice? (docs/features/kit_detail_bom_management/plan.md:432-434)
  - Why it matters: Scope creep or omission affects header layout and data mapping.
  - Needed answer: Confirm whether to render read-only chips now or defer entirely.
- Question: What event type emits `kits.detail.toolbar` updates? (docs/features/kit_detail_bom_management/plan.md:263-266)
  - Why it matters: Choice between `ui_state` vs `list_loading` dictates Playwright waits.
  - Needed answer: Specify emitter (`useUiStateInstrumentation`?) and trigger cadence (filters, refetches).

### 4) Deterministic Playwright Coverage (new/changed behavior only)
- Behavior: Kit detail load & filter toolbar
  - Scenarios:
    - Given seeded contents, When navigating from overview, Then computed columns render (`tests/e2e/kits/kit-detail.spec.ts`).
    - Given a filter term, When searching by part key, Then table trims rows and telemetry reports updated filtered/total counts.
  - Instrumentation: `waitForListLoading(page, 'kits.detail', 'ready')`; requires secondary emitter for filter deltas.
  - Backend hooks: `testData.kits.createDetailWithContents`.
  - Gaps: **Major —** `list_loading` scope will not re-emit on client-side filter changes; need explicit `ui_state` (or similar) event to unblock assertions.
  - Evidence: `docs/features/kit_detail_bom_management/plan.md:362-368`, `docs/features/kit_detail_bom_management/plan.md:248-252`.

- Behavior: Edit kit metadata
  - Scenarios: Active kit edit success & validation failure sequences with instrumentation waits.
  - Instrumentation: `waitTestEvent('KitDetail:metadata')`, toast helpers.
  - Backend hooks: `testData.kits.create`.
  - Gaps: None noted.
  - Evidence: `docs/features/kit_detail_bom_management/plan.md:372-378`.

- Behavior: BOM create/update/delete (including conflict)
  - Scenarios: Create row, handle 409 conflict, delete row.
  - Instrumentation: `KitContent:*` form events, `expectConflictError`, detail refetch waits.
  - Backend hooks: Factories to seed kit + parts; API helper to bump version for conflict.
  - Gaps: Conflict prep acceptable; ensure helper lives in `tests/api/factories`.
  - Evidence: `docs/features/kit_detail_bom_management/plan.md:380-387`.

- Behavior: Archived kit read-only gating
  - Scenarios: Archived detail renders with disabled controls.
  - Instrumentation: `kits.detail` ready metadata includes archived status.
  - Backend hooks: Factory to archive kit before visit.
  - Gaps: None noted.
  - Evidence: `docs/features/kit_detail_bom_management/plan.md:389-394`.

### 5) **Adversarial Sweep (must find ≥3 credible issues or declare why none exist)**
**Major — Availability snapshot loses total context**
**Evidence:** `docs/features/kit_detail_bom_management/plan.md:228-231`, `docs/epics/kits_feature_breakdown.md:55-62` — "Lifecycle: Derived from current filtered rows" conflicts with requirement to show computed columns for the whole BOM.
**Why it matters:** When a filter is applied the toolbar/instrumentation would report totals for only the filtered subset, so aggregated availability/shortfall data and Playwright assertions become wrong.
**Fix suggestion:** Derive `availabilitySnapshot` from the full contents collection; surface filtered counts separately (e.g., `{ total, filtered }`) while keeping aggregates authoritative.
**Confidence:** High

**Major — Duplicate protection deferred to backend**
**Evidence:** `docs/features/kit_detail_bom_management/plan.md:201-205`, `docs/features/kit_detail_bom_management/plan.md:262-265`, `docs/epics/kits_feature_breakdown.md:68-72` — Plan promises unique-part validation but states "rely on backend duplicate enforcement."
**Why it matters:** Users would submit a duplicate row, hit a backend error, and instrumentation/tests would surface conflicts instead of preventing entry as required.
**Fix suggestion:** Track existing part IDs client-side (disable selector options / show inline error) so duplicates never submit; backend remains final guard.
**Confidence:** High

**Major — Filter coverage depends on non-firing telemetry**
**Evidence:** `docs/features/kit_detail_bom_management/plan.md:362-368`, `docs/features/kit_detail_bom_management/plan.md:248-252`, `docs/contribute/architecture/test_instrumentation.md:35-36` — Scenario asserts on `waitForListLoading(... 'kits.detail')` after filtering, but `list_loading` only emits on query lifecycle.
**Why it matters:** Playwright spec will hang or read stale metadata because filter changes never trigger a new `list_loading` event; determinism breaks.
**Fix suggestion:** Emit a dedicated `ui_state` (or manual test event) when filter-derived metrics change, and update the test plan to wait on that scope instead.
**Confidence:** High

### 6) **Derived-Value & State Invariants (table)**
- Derived value: filteredContents
  - Source dataset: Full kit contents filtered by search tokens.
  - Write / cleanup triggered: Recomputes on filter text or kit change; cleared on route change.
  - Guards: Trimmed, case-insensitive search; reset when `kitId` changes.
  - Invariant: Every entry must belong to the current kit contents; filtered length ≤ total.
  - Evidence: `docs/features/kit_detail_bom_management/plan.md:222-226`

- Derived value: availabilitySnapshot
  - Source dataset: Currently filtered rows (needs adjustment to full contents).
  - Write / cleanup triggered: Recomputed after mutations/refetch.
  - Guards: Zero-safe math, clamp negative availability.
  - Invariant: Aggregate counts should reflect authoritative totals regardless of filter; update plan to maintain this.
  - Evidence: `docs/features/kit_detail_bom_management/plan.md:228-232`

- Derived value: isReadOnly
  - Source dataset: Kit status + mutation pending flags.
  - Write / cleanup triggered: Recomputed on status changes or mutation lifecycle updates.
  - Guards: Prevents mutation handlers from firing when archived/pending.
  - Invariant: When true, no mutation call should fire and UI controls stay disabled.
  - Evidence: `docs/features/kit_detail_bom_management/plan.md:234-238`

- Derived value: conflictState
  - Source dataset: Mutation error responses (409) + refetch completion.
  - Write / cleanup triggered: Set on conflict error, cleared after refetch.
  - Guards: Prevents stale retries; drives guidance messaging.
  - Invariant: While populated, inline editor stays disabled until fresh data loads.
  - Evidence: `docs/features/kit_detail_bom_management/plan.md:240-244`

### 7) Risks & Mitigations (top 3)
- Risk: Availability snapshot/reporting only covers filtered rows, misrepresenting totals and shortfall math.
  - Mitigation: Compute aggregates from the full contents list, then layer filter metadata separately.
  - Evidence: `docs/features/kit_detail_bom_management/plan.md:228-231`

- Risk: Duplicate part protection left to backend errors, violating UX requirement and producing noisy instrumentation.
  - Mitigation: Add client-side duplicate guard (disable options or inline validation) before sending mutation.
  - Evidence: `docs/features/kit_detail_bom_management/plan.md:201-205`, `docs/features/kit_detail_bom_management/plan.md:262-265`

- Risk: Filter Playwright spec relies on telemetry that never fires, causing flaky or blocked tests.
  - Mitigation: Introduce a `ui_state`/custom event that emits whenever filter-derived metadata updates and point the spec to it.
  - Evidence: `docs/features/kit_detail_bom_management/plan.md:362-368`, `docs/features/kit_detail_bom_management/plan.md:248-252`

### 8) Confidence
Confidence: Medium — Core architecture choices align, but the identified telemetry and validation gaps must be clarified/resolved before development can safely proceed.
