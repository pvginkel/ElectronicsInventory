### 1) Summary & Decision
**Readiness**
New workspace stitches TanStack Router, query instrumentation, and live availability together as planned, but archived-kit back navigation is miswired and zero-stock lines never raise shortfalls, so core operator flows regress (`src/components/kits/kit-link-chip.tsx:36-65`, `src/components/pick-lists/pick-list-lines.tsx:136-264`).

**Decision**
`GO-WITH-CONDITIONS` — Ship once archived-kit status/context is preserved and zero-stock shortfalls are surfaced.

### 2) Conformance to Plan (with evidence)
**Plan alignment**
- `Flow: Pick list detail load` ↔ `src/components/pick-lists/pick-list-detail.tsx:86-110` — detail query drives instrumentation and kicks off per-part availability as described in `docs/features/pick_list_workspace_readonly/plan.md:141-148`.
- `Flow: Group and render line allocations` ↔ `src/components/pick-lists/pick-list-lines.tsx:120-193` — lines are grouped per kit content with live availability wiring per `docs/features/pick_list_workspace_readonly/plan.md:153-160`.

**Gaps / deviations**
- `Flow: Breadcrumb & back-navigation context` — kit crumb derived from the detail is missing; breadcrumbs stop at “Pick List …” (`docs/features/pick_list_workspace_readonly/plan.md:164-171`, `src/components/pick-lists/pick-list-detail.tsx:111-125`).
- `Flow: Group and render line allocations` — plan called for `PartInlineSummary` in group headers but markup is reimplemented inline, risking divergence (`docs/features/pick_list_workspace_readonly/plan.md:153-160`, `src/components/pick-lists/pick-list-lines.tsx:120-147`).
- `Intent & Scope` metadata commitment — header omits created/updated timestamps even though plan listed them with `requested_units` and status (`docs/features/pick_list_workspace_readonly/plan.md:24`, `src/components/pick-lists/pick-list-detail.tsx:156-180`).

### 3) Correctness — Findings (ranked)
- Title: Major — Archived pick lists render wrong kit status and lose archived context
  - Evidence: `src/components/kits/kit-link-chip.tsx:36-65`, `src/components/pick-lists/pick-list-detail.tsx:144-152`
  - Impact: Deep-linking to an archived kit’s pick list shows the chip as “Active” and routes back with `status=active`, so the kit vanishes when the operator follows breadcrumbs back to the overview.
  - Fix: Source the real kit status (map `kit_status` from the detail payload or fetch kit detail) and only default to `'active'` when that data is unavailable; keep the return search optional so archived context survives.
  - Confidence: Medium
- Title: Major — Zero-stock lines never flag a shortfall when availability omits the location
  - Evidence: `src/hooks/use-pick-list-availability.ts:150-162`, `src/components/pick-lists/pick-list-lines.tsx:136-193`, `src/components/pick-lists/pick-list-lines.tsx:217-264`
  - Impact: When a location empties and the API drops it from `/parts/{part_key}/locations`, `inStockQuantity` becomes `null`, the UI prints “Not tracked”, and the shortfall chip never appears, hiding real out-of-stock situations.
  - Fix: Treat missing availability rows as `0` for the targeted location (either in `getLineAvailabilityQuantity` or before `computeShortfall`) and emit both the zero count and the shortfall alert.
  - Confidence: Medium

### 4) Over-Engineering & Refactoring Opportunities
- Hotspot: `PickListLines` group headers duplicate part summary markup
  - Evidence: `src/components/pick-lists/pick-list-lines.tsx:120-147`
  - Suggested refactor: Reuse `PartInlineSummary` as the plan outlined instead of hand-rolling the summary block.
  - Payoff: Keeps part metadata consistent across surfaces and reduces drift when the shared summary evolves.

### 5) Style & Consistency
- Pattern: Table rows force a background that clips rounded corners/design tokens reviewers flagged
  - Evidence: `src/components/pick-lists/pick-list-lines.tsx:155`
  - Impact: Detail tables don’t match other workspaces and regress a concern already noted in `docs/epics/kits_outstanding_changes.md`.
  - Recommendation: Drop the `bg-background` row class (or align with the shared table pattern) so borders render correctly.

### 6) Tests & Deterministic Coverage (new/changed behavior only)
- Surface: Pick list detail workspace
  - Scenarios:
    - Given seeded lines, When opening `/pick-lists/<id>`, Then detail metadata and availability render with instrumentation waits (`tests/e2e/pick-lists/pick-list-detail.spec.ts:7-121`)
    - Given navigation from kit detail, When clicking the pick list chip, Then the kit context is preserved through the chip (`tests/e2e/pick-lists/pick-list-detail.spec.ts:123-197`)
  - Hooks: `waitForListLoading('pickLists.detail')`, `waitForUiState('pickLists.detail.load')`, `waitForUiState('pickLists.detail.availability')`
  - Gaps: No coverage for archived kits (status badge + return status) or for zero-stock locations that disappear from availability, so both majors above slip through.
  - Evidence: `tests/e2e/pick-lists/pick-list-detail.spec.ts:7-197`

### 7) Adversarial Sweep
- Title: Major — Archived pick lists render wrong kit status and lose archived context
  - Evidence: `src/components/kits/kit-link-chip.tsx:36-65`, `src/components/pick-lists/pick-list-detail.tsx:144-152`
  - Impact: Breadcrumb navigation returns users to the wrong filter, hiding archived kits after a deep link.
  - Fix: Carry the true kit status/search when emitting the chip.
  - Confidence: Medium
- Title: Major — Zero-stock lines never flag a shortfall when availability omits the location
  - Evidence: `src/components/pick-lists/pick-list-lines.tsx:136-193`, `src/components/pick-lists/pick-list-lines.tsx:217-264`
  - Impact: Operators miss depleted bins because both the count and shortfall chip stay blank.
  - Fix: Default missing availability to `0` and compute the deficit.
  - Confidence: Medium
- Checks attempted: Query churn producing duplicate availability fetches; instrumentation abort handling; group subtotal consistency
  - Evidence: `src/hooks/use-pick-list-detail.ts:64-101`, `src/components/pick-lists/pick-list-detail.tsx:70-110`, `src/types/pick-lists.ts:180-207`
  - Why code held up: Part keys are deduped via `Set`, instrumentation ties directly to TanStack statuses, and grouping accumulates totals once per line.

### 8) Invariants Checklist
- Invariant: Availability requests only fire once per unique part key
  - Where enforced: `src/hooks/use-pick-list-detail.ts:64-82`
  - Failure mode: Duplicate queries hammer the API and skew loading instrumentation
  - Protection: `Set` deduplication before calling `usePickListAvailability`
  - Evidence: `src/hooks/use-pick-list-detail.ts:64-82`
- Invariant: List loading instrumentation mirrors TanStack query states
  - Where enforced: `src/components/pick-lists/pick-list-detail.tsx:70-110`
  - Failure mode: Playwright waits desync from UI, leading to flakiness
  - Protection: `useListLoadingInstrumentation` toggles on `isLoading || isFetching`
  - Evidence: `src/components/pick-lists/pick-list-detail.tsx:70-110`
- Invariant: Group metrics reflect summed line quantities
  - Where enforced: `src/types/pick-lists.ts:180-207`
  - Failure mode: Header chips disagree with table rows, confusing operators
  - Protection: Totals accumulate while iterating lines, maintaining parity
  - Evidence: `src/types/pick-lists.ts:180-207`, `src/components/pick-lists/pick-list-lines.tsx:120-190`

### 9) Questions / Needs-Info
- Question: Does the pick list detail response expose the kit’s lifecycle status (e.g., `kit_status`)?
  - Why it matters: Without it we cannot truthfully label the kit chip or preserve archived filters.
  - Desired answer: Confirm whether the API includes the status or if we should fetch kit detail separately.
- Question: When `/parts/{part_key}/locations` omits a location, should the UI treat it as zero or “unknown”?
  - Why it matters: Determines whether missing rows must trigger a shortfall warning.
  - Desired answer: Clarify the contract so the shortfall fix aligns with backend expectations.

### 10) Risks & Mitigations (top 3)
- Risk: Archived pick list navigation returns users to the wrong filter, hiding the kit from the overview
  - Mitigation: Carry real kit status/search when building `KitLinkChip`
  - Evidence: Correctness finding `src/components/kits/kit-link-chip.tsx:36-65`
- Risk: Operators miss empty bins because shortfalls never surface when locations drop from availability
  - Mitigation: Default missing availability to `0` and emit the warning
  - Evidence: Correctness finding `src/components/pick-lists/pick-list-lines.tsx:136-264`
- Risk: Lacking kit breadcrumb slows navigation and deviates from the agreed UX
  - Mitigation: Add the kit crumb derived from the detail response
  - Evidence: `src/components/pick-lists/pick-list-detail.tsx:111-125`

### 11) Confidence
Confidence: Medium — Read the commits and tests in depth, but didn’t run the UI end-to-end to observe archived-kit behavior directly.*** End Patch
