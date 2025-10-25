### 1) Summary & Decision

**Readiness**
The UI slice is sketched coherently, but the testing lane is under-specified: the plan never explains how the new spec will seed kit usage data or cover failure states, so we cannot yet guarantee deterministic coverage.

**Decision**
`GO-WITH-CONDITIONS` — tighten the Playwright plan (data seeding, error-path strategy, navigation waits) before implementation proceeds.

### 2) Conformance & Fit (with evidence)

**Conformance to refs**
- `docs/contribute/testing/index.md` — Fail — docs/features/part_detail_cross_navigation/plan.md:182-187 — "Instrumentation / hooks: `waitForListLoading(page, 'parts.detail.kitUsage', phase)`… Gaps: Error-state coverage deferred…" leaves data seeding and failure handling undefined, conflicting with the testing guideline that specs seed state through factories and escalate backend blockers (`docs/contribute/testing/index.md:9-12`, `docs/contribute/testing/index.md:50-52`).
- `docs/contribute/architecture/application_overview.md` — Pass — docs/features/part_detail_cross_navigation/plan.md:42-53 — "Area: src/components/parts/part-kit-usage-indicator.tsx (new)… Area: src/hooks/use-part-kit-usage.ts (new)" keeps the feature within the documented domain-driven structure.

**Fit with codebase**
- `PartDetails` header actions — docs/features/part_detail_cross_navigation/plan.md:42-47 — Plan acknowledges the correct insertion point, but should spell out how the indicator coexists with the current button stack in `DetailScreenLayout` to avoid layout regressions.
- `MembershipIndicator` reuse — docs/features/part_detail_cross_navigation/plan.md:45-48 — Reusing the shared indicator matches existing patterns, but the plan must clarify the summary/model adapter so that TypeScript doesn’t regress (current helpers are not exported for the new schema).

### 3) Open Questions & Ambiguities

- Question: How will the spec seed a part plus one-or-more consuming kits via `testData` so the tooltip has deterministic rows?  
  Why it matters: Without explicit factory calls, the Playwright flow risks relying on ambient data and flaking.  
  Needed answer: Outline the concrete API factory steps (e.g., `testData.parts.create`, `testData.kits.createWithContents`) in the test plan.
- Question: What backend hook (or documented limitation) will let us exercise the indicator’s error state without intercepting requests?  
  Why it matters: Testing docs require either real coverage or a declared blocking issue before Playwright work begins.  
  Needed answer: Either define the backend trigger to induce an error or add a Blocking Issues section describing the gap.
- Question: How will the spec wait for the destination kit detail view to finish loading after clicking a tooltip row?  
  Why it matters: Without an explicit `kits.detail` wait, navigation assertions can race against React Query.  
  Needed answer: Commit to using `waitForListLoading(page, 'kits.detail', 'ready')` (or equivalent) after the click.

### 4) Deterministic Playwright Coverage (new/changed behavior only)

- Behavior: Part detail kit usage indicator  
  - Scenarios:  
    - Given a part referenced by active kits, When the detail view loads, Then the indicator appears, exposes tooltip rows, and clicking a row navigates to the kit detail page (`tests/e2e/parts/part-cross-navigation.spec.ts`).  
    - Given a part with no active kits, When the detail view loads, Then the indicator is absent while other header actions remain accessible (`tests/e2e/parts/part-cross-navigation.spec.ts`).  
  - Instrumentation: `waitForListLoading(page, 'parts.detail.kitUsage', phase)` with row-level `data-testid` selectors (plan).  
  - Backend hooks: **Missing** — plan does not describe which `testData` factories will create the part+kit relationship needed for deterministic assertions.  
  - Gaps: (1) No strategy for inducing/covering the error path; (2) No wait plan for `kits.detail` readiness after navigation.  
  - Evidence: docs/features/part_detail_cross_navigation/plan.md:182-187.

### 5) **Adversarial Sweep**

**Major — Playwright coverage lacks deterministic data seeding**  
**Evidence:** docs/features/part_detail_cross_navigation/plan.md:182-185; docs/contribute/testing/index.md:9-12 — "Given a part referenced by active kits… tooltip lists kit rows…" with no mention of factories contradicts the API-first testing requirement.  
**Why it matters:** Without scripted seeding, the spec could flake or silently pass against stale fixture data.  
**Fix suggestion:** Document the exact `testData.parts` and `testData.kits` calls (including linking the part into kit contents) inside the test plan.  
**Confidence:** High.

**Major — Error path deferred without a blocking issue**  
**Evidence:** docs/features/part_detail_cross_navigation/plan.md:186-187; docs/contribute/testing/index.md:50-52 — "Gaps: Error-state coverage deferred…" violates the rule to note backend blockers up front.  
**Why it matters:** Implementers lack guidance on whether to build coverage, extend the backend, or postpone the feature.  
**Fix suggestion:** Add a “Blocking Issues” section naming the missing backend hook (or define how to trigger the failure deterministically) before coding starts.  
**Confidence:** High.

**Major — Navigation readiness lacks deterministic wait**  
**Evidence:** docs/features/part_detail_cross_navigation/plan.md:182-185 — scenarios stop at clicking the row, with instrumentation only for `parts.detail.kitUsage`; no commitment to wait on `kits.detail` events.  
**Why it matters:** Clicking into kit detail without waiting for its `list_loading` signal invites flaky assertions on partially rendered content.  
**Fix suggestion:** Extend the coverage plan to wait for `waitForListLoading(page, 'kits.detail', 'ready')` (or another documented hook) after navigation.  
**Confidence:** Medium.

**Minor — Summary adapter reuse needs a typed plan**  
**Evidence:** docs/features/part_detail_cross_navigation/plan.md:63-69 — "Adapt… via `mapKitReservation`" yet the helper currently accepts the kit-detail schema and is not exported.  
**Why it matters:** Without clarifying the adapter change, the implementation might resort to `any` casts or duplicate mapping logic.  
**Fix suggestion:** Call out the intent to extract a shared transformer (e.g., introduce a `toKitUsageEntry` utility) that supports both schemas safely.  
**Confidence:** Medium.

### 6) Derived-Value & State Invariants

- Derived value: `hasKitUsage`  
  - Source dataset: Summary.activeCount (plan).  
  - Write / cleanup triggered: Controls indicator render path.  
  - Guards: Only expose when query status is `success`.  
  - Invariant: Indicator stays hidden for zero active kits.  
  - Evidence: docs/features/part_detail_cross_navigation/plan.md:95-102.
- Derived value: `sortedKits`  
  - Source dataset: Usage entries sorted by `reservedQuantity` desc then `updatedAt` desc.  
  - Write / cleanup triggered: Provides tooltip ordering and deterministic expectations.  
  - Guards: Memoized on `partId` plus the raw list to avoid churn.  
  - Invariant: Ordering stable for identical data sets.  
  - Evidence: docs/features/part_detail_cross_navigation/plan.md:101-106.
- Derived value: `usageTotals`  
  - Source dataset: Reduce reserved/build counts across mapped entries.  
  - Write / cleanup triggered: Powers optional tooltip summary + instrumentation metadata.  
  - Guards: Defaults to zero when query errors or returns empty.  
  - Invariant: Aggregated totals match the per-row values displayed.  
  - Evidence: docs/features/part_detail_cross_navigation/plan.md:107-112.

### 7) Risks & Mitigations (top 3)

- Risk: Playwright spec flakiness from missing data seeding instructions.  
  Mitigation: Add explicit `testData` factory steps for both the populated and empty-kit scenarios.  
  Evidence: docs/features/part_detail_cross_navigation/plan.md:182-185.
- Risk: Unclear handling for indicator error states.  
  Mitigation: Either define the backend trigger plus assertions or log a Blocking Issues section before implementation.  
  Evidence: docs/features/part_detail_cross_navigation/plan.md:186-187.
- Risk: Navigation assertions racing kit detail load.  
  Mitigation: Commit to waiting on `kits.detail` instrumentation (or equivalent helper) after clicking a tooltip row.  
  Evidence: docs/features/part_detail_cross_navigation/plan.md:182-185.

### 8) Confidence

<confidence_template>Confidence: Medium — The architectural direction is sound, but unresolved testing gaps leave meaningful uncertainty.</confidence_template>
