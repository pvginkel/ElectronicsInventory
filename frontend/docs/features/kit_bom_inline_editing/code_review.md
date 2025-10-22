### 1) Summary & Decision

**Readiness**
The plan lays out inline create/edit/delete flows with overlay state that preserves the React Query source of truth (`docs/features/kit_bom_inline_editing/plan.md:125`, `docs/features/kit_bom_inline_editing/plan.md:136`, `docs/features/kit_bom_inline_editing/plan.md:147`) and keeps instrumentation gated on refetch readiness for deterministic assertions (`docs/features/kit_bom_inline_editing/plan.md:196`, `docs/features/kit_bom_inline_editing/plan.md:237`, `docs/features/kit_bom_inline_editing/plan.md:295`).

**Decision**
`GO` — Scope, instrumentation, and test coverage align with the epic expectations while keeping aggregate math on the server (`docs/epics/kits_feature_breakdown.md:87`, `docs/features/kit_bom_inline_editing/plan.md:129`).

### 2) Conformance to Plan (with evidence)

**Plan alignment**
- `§5 Add part inline` ↔ `docs/features/kit_bom_inline_editing/plan.md:125` — overlays a pending row instead of touching cache, matching the epic’s optimistic add requirement (`docs/epics/kits_feature_breakdown.md:87`).
- `§5 Edit existing row` ↔ `docs/features/kit_bom_inline_editing/plan.md:136` — keeps edits local until refetch, aligning with the conflict-handling contract (`docs/epics/kits_feature_breakdown.md:90`).
- `§9 Instrumentation` ↔ `docs/features/kit_bom_inline_editing/plan.md:237` — defers form success/error until list-loading “ready,” as required by the observability spec (`docs/epics/kits_feature_breakdown.md:99`).
- `§13 Deterministic tests` ↔ `docs/features/kit_bom_inline_editing/plan.md:295` — enumerates CRUD plus archived gating scenarios in Playwright, covering the mandated flows (`tests/e2e/kits/kit-detail.spec.ts:119`).

**Gaps / deviations**
- `Disable options for already-selected parts` — Plan notes the base select cannot disable options and may rely on filtering instead; confirm this still satisfies the requirement (`docs/features/kit_bom_inline_editing/plan.md:9`, `docs/epics/kits_feature_breakdown.md:87`).

### 3) Correctness — Findings (ranked)

None.

### 4) Over-Engineering & Refactoring Opportunities

None.

### 5) Style & Consistency

None.

### 6) Tests & Deterministic Coverage (new/changed behavior only)

- Surface: Kit detail BOM management
  - Scenarios:
    - Given create, edit (with conflict), delete, and archived gating, When the user exercises the inline controls, Then backend state and instrumentation settle deterministically (`docs/features/kit_bom_inline_editing/plan.md:295`).
  - Hooks: `KitContent:*` form events plus `kits.detail.contents` ready instrumentation (`docs/features/kit_bom_inline_editing/plan.md:302`).
  - Gaps: None; archived gating and conflict helper are explicitly listed (`docs/features/kit_bom_inline_editing/plan.md:299`).
  - Evidence: `docs/features/kit_bom_inline_editing/plan.md:295`

### 7) Adversarial Sweep (must attempt ≥3 credible failures or justify none)

- Checks attempted: Cache pollution from optimistic add, stale instrumentation after refetch, archived gating bypass on pending mutations.
- Evidence: `docs/features/kit_bom_inline_editing/plan.md:129`; `docs/features/kit_bom_inline_editing/plan.md:196`; `docs/features/kit_bom_inline_editing/plan.md:281`
- Why code held up: The plan renders pending rows outside the cache, clears overlays only after list-loading ready, and derives mutation guards from `detail.status`, closing the main failure paths.

### 8) Invariants Checklist (table)

- Invariant: Archived kits never expose mutation affordances
  - Where enforced: `isArchivedKit` derived state in Kit detail components (`docs/features/kit_bom_inline_editing/plan.md:163`)
  - Failure mode: Controls could trigger mutations on archived kits.
  - Protection: Gating every CTA/mutation trigger on `detail.status === 'archived'`.
  - Evidence: `docs/features/kit_bom_inline_editing/plan.md:162`
- Invariant: Part keys are unique among persisted rows
  - Where enforced: `existingPartKeys` filters the selector while allowing the current edit row (`docs/features/kit_bom_inline_editing/plan.md:170`)
  - Failure mode: Duplicate part selection could corrupt BOM data.
  - Protection: Selector excludes persisted keys and double-checks before submit.
  - Evidence: `docs/features/kit_bom_inline_editing/plan.md:167`
- Invariant: Optimistic overlays never contaminate aggregated metrics
  - Where enforced: Overlay state lives outside React Query cache and clears on ready events (`docs/features/kit_bom_inline_editing/plan.md:191`)
  - Failure mode: Bad totals if pending rows persist.
  - Protection: Pending rows render separately and reset after mutation settle + ready.
  - Evidence: `docs/features/kit_bom_inline_editing/plan.md:188`

### 9) Questions / Needs-Info

- Question: Will we extend `SearchableSelect` to truly disable already-selected parts, or is filtering them out acceptable?
  - Why it matters: The epic explicitly calls for disabled options; without UI affordance, product behavior might diverge.
  - Desired answer: Confirm UI direction and, if needed, outline the change enabling disabled state in the selector (`docs/features/kit_bom_inline_editing/plan.md:9`, `docs/features/kit_bom_inline_editing/plan.md:65`).

### 10) Risks & Mitigations (top 3)

- Risk: Selector may only filter parts instead of disabling them, diverging from product copy
  - Mitigation: Either enhance `SearchableSelect` to support disabled entries or secure product approval for filtering behavior.
  - Evidence: `docs/features/kit_bom_inline_editing/plan.md:9`
- Risk: Pending overlays could stick if refetch error paths forget to clear state
  - Mitigation: Implement the error-handling branch that resets overlays and add Playwright assertions for failure recovery.
  - Evidence: `docs/features/kit_bom_inline_editing/plan.md:228`
- Risk: Conflict scenario depends on a new factory helper; without it the test may become flaky
  - Mitigation: Land the deterministic `testData.kits.updateContent` helper alongside the spec and reuse it in the test slice.
  - Evidence: `docs/features/kit_bom_inline_editing/plan.md:299`

### 11) Confidence

Confidence: Medium — The plan is thorough, but clarity on the “disable vs filter” selector behavior is still pending.
