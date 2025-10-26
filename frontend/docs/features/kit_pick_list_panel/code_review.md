### 1) Summary & Decision
**Readiness**
Panel wiring, navigation context preservation, and instrumentation largely match the plan (`src/components/kits/kit-pick-list-panel.tsx:132-228`, `tests/e2e/kits/kit-detail.spec.ts:512-930`, `tests/e2e/pick-lists/pick-list-detail.spec.ts:232-320`), but the empty-state branch promised in the plan is missing so kits without pick lists render an empty card shell (`src/components/kits/kit-pick-list-panel.tsx:170-199` shows only the guarded `CardContent`, `docs/features/kit_pick_list_panel/plan.md:188-192`).

**Decision**
`GO-WITH-CONDITIONS` — Panel omits the required empty-state messaging, leaving a blank body for kits without pick lists (`src/components/kits/kit-pick-list-panel.tsx:170-199`).

### 2) Conformance to Plan (with evidence)
**Plan alignment**
- §5 Flow: Render pick list panel ↔ `src/components/kits/kit-detail.tsx:393-399` — body now renders `<KitPickListPanel ... />` ahead of the BOM card.
- §1 In scope (chip removal) ↔ `src/components/kits/kit-detail-header.tsx:202-239` — header only exposes shopping list chips and refreshed empty copy (`Link a shopping list to reserve parts. Pick lists now live in the panel below.`).
- §5 Flow: Resume pick list from panel ↔ `src/components/kits/kit-pick-list-panel.tsx:173-207` — tiles link via `buildPickListDetailSearch({ kitId, status, search })` and emit navigation events.

**Gaps / deviations**
- §8 Errors & Edge Cases — “No pick lists linked yet” empty state never renders; the card stops at the header because the only branch is `CardContent` guarded by `openPickLists.length > 0 || completedPickLists.length > 0` (`src/components/kits/kit-pick-list-panel.tsx:170-199`, `docs/features/kit_pick_list_panel/plan.md:188-192`).
- §7 State Consistency & Async Coordination — instrumentation for `kits.detail.pickLists.panel` is hand-emitted instead of using `useUiStateInstrumentation`, so aborted/error phases aren’t surfaced (`src/components/kits/kit-pick-list-panel.tsx:75-93`, `docs/features/kit_pick_list_panel/plan.md:165-171`).

### 3) Correctness — Findings (ranked)
- Title: **Major** — Panel lacks empty-state copy
- Evidence: `src/components/kits/kit-pick-list-panel.tsx:170-199` — `CardContent` only renders when open or completed pick lists exist; no fallback message follows the guarded block.
  - Impact: Kits with zero pick lists show a blank card after removing header chips, leaving users without guidance and contradicting the approved plan.
  - Fix: Add a `CardContent` branch (with the scripted copy) when both arrays are empty so the panel communicates the new entry point.
  - Confidence: High

### 4) Over-Engineering & Refactoring Opportunities
None observed.

### 5) Style & Consistency
- Pattern: Manual instrumentation instead of shared hook
  - Evidence: `src/components/kits/kit-pick-list-panel.tsx:75-93` — direct `emitUiState({ scope: 'kits.detail.pickLists.panel', phase: 'ready', ... })` replaces documented `useUiStateInstrumentation`.
  - Impact: Diverges from the project’s instrumentation pattern and drops built-in aborted/error handling.
  - Recommendation: Wrap the metadata emission in `useUiStateInstrumentation` for consistency.

### 6) Tests & Deterministic Coverage (new/changed behavior only)
- Surface: Kit detail pick list panel
  - Scenarios:
    - Given a kit with open/completed lists, When the panel renders and lines progress, Then navigation, toggle, and refetch instrumentation fire (`tests/e2e/kits/kit-detail.spec.ts:512-930`).
  - Hooks: `kits.detail.pickLists.panel`, `kits.detail.pickLists.navigate`, `kits.detail.pickLists.toggle`.
  - Gaps: No Playwright coverage for the zero-pick-list empty state now that chips were removed.
  - Evidence: `tests/e2e/kits/kit-detail.spec.ts:512-930`.
- Surface: Pick list detail navigation
  - Scenarios:
    - Given navigation from the panel, When pick detail loads (active or archived contexts), Then breadcrumbs preserve kit filters and no chip renders (`tests/e2e/pick-lists/pick-list-detail.spec.ts:232-320`).
  - Hooks: `kits.detail.pickLists.navigate`, breadcrumb selectors.
  - Gaps: None noted beyond the empty-state gap above.
  - Evidence: `tests/e2e/pick-lists/pick-list-detail.spec.ts:232-320`.

### 7) Adversarial Sweep (must attempt ≥3 credible failures or justify none)
- Checks attempted: Context preservation during resume navigation; archived-kit gating on creation button versus tile links; instrumentation updates after completing a pick.
- Evidence: `src/components/kits/kit-pick-list-panel.tsx:132-207`, `tests/e2e/pick-lists/pick-list-detail.spec.ts:232-320`, `tests/e2e/kits/kit-detail.spec.ts:600-742`.
- Why code held up: Links always use `buildPickListDetailSearch`, creation toggles off via `kit.status === 'active'`, and refetch-driven metadata emissions update counts after completion.

### 8) Invariants Checklist (table)
- Invariant: Archived kits cannot create new pick lists
  - Where enforced: `src/components/kits/kit-pick-list-panel.tsx:132-168`
  - Failure mode: Archived kits could spawn new picks, breaking workflow rules
  - Protection: Button disables with tooltip when `kit.status !== 'active'`
  - Evidence: `tests/e2e/kits/kit-detail.spec.ts:512-930`
- Invariant: Panel metadata matches rendered counts
  - Where enforced: `src/components/kits/kit-pick-list-panel.tsx:75-93`
  - Failure mode: Playwright waits would flake on stale counts
  - Protection: Metadata derives from filtered arrays just before render
  - Evidence: `tests/e2e/kits/kit-detail.spec.ts:600-654`
- Invariant: Completed toggle only appears when completed pick lists exist
  - Where enforced: `src/components/kits/kit-pick-list-panel.tsx:209-238`
  - Failure mode: Users could toggle an empty section
  - Protection: Guarded by `completedPickLists.length > 0`
  - Evidence: `tests/e2e/kits/kit-detail.spec.ts:678-742`

### 9) Questions / Needs-Info
None.

### 10) Risks & Mitigations (top 3)
- Risk: Blank panel for kits without pick lists confuses users about the new entry point
  - Mitigation: Implement the empty-state copy and assert it in Playwright
  - Evidence: `src/components/kits/kit-pick-list-panel.tsx:170-199`
- Risk: Manual instrumentation could miss aborted/error phases needed for deterministic waits
  - Mitigation: Switch to `useUiStateInstrumentation` with proper loading/error wiring
  - Evidence: `src/components/kits/kit-pick-list-panel.tsx:75-93`
- Risk: Missing empty-state test leaves regressions undetected
  - Mitigation: Add a Playwright scenario that asserts the copy when no pick lists are present
  - Evidence: `tests/e2e/kits/kit-detail.spec.ts:512-930`

### 11) Confidence
Confidence: Medium — Core flows look exercised by tests, but the uncovered empty-state regression and instrumentation divergence keep me cautious.
