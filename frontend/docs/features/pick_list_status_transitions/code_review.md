### 1) Summary & Decision
**Readiness**
Implementation lands the planned pick/undo UX, cache plumbing, and deterministic tests, but the pending-action guard currently blocks every line instead of isolating the active one, so operators cannot work down a list fluidly.

**Decision**
`GO-WITH-CONDITIONS` — Limit the disabled state to the targeted line before shipping (`src/components/pick-lists/pick-list-lines.tsx:183-184`).

### 2) Conformance to Plan (with evidence)
**Plan alignment**
- `Slice: Execution hook & cache plumbing` ↔ `src/hooks/use-pick-list-execution.ts:80-369` — new hook wraps the generated pick/undo mutations, emits `pickLists.detail.execution`, and invalidates detail/membership/availability caches.
- `Slice: UI controls & instrumentation integration` ↔ `src/components/pick-lists/pick-list-detail.tsx:60-177` — detail screen wires the execution hook, availability instrumentation, and passes pending state into the lines table.
- `Slice: Playwright coverage & page objects` ↔ `tests/e2e/pick-lists/pick-list-detail.spec.ts:124-218` — end-to-end spec drives pick and undo flows while asserting instrumentation metadata and toasts.

**Gaps / deviations**
- `Flow: Pick a line from the workspace` — plan promises that only the active line is locked while pending, but `const disablePick = executionPending || isCompleted;` and `const disableUndo = executionPending || !isCompleted;` disable every row (`src/components/pick-lists/pick-list-lines.tsx:183-184`, `docs/features/pick_list_status_transitions/plan.md:104-129`).

### 3) Correctness — Findings (ranked)
- Title: Major — Pending state disables all lines, blocking concurrent picks
  - Evidence: `src/components/pick-lists/pick-list-lines.tsx:183-184` — `const disablePick = executionPending || isCompleted;`
  - Impact: While one mutation is in flight the table no longer lets operators act on other lines, contradicting the plan’s invariant that only the active line be locked and slowing fulfillment during large picks.
  - Fix: Track pending line IDs (set or map) in the execution hook and gate buttons with per-line checks (e.g., `isPending`) so other rows stay interactive.
  - Confidence: High

### 4) Over-Engineering & Refactoring Opportunities
- Hotspot: None observed.

### 5) Style & Consistency
- Pattern: No substantive style issues detected.

### 6) Tests & Deterministic Coverage (new/changed behavior only)
- Surface: Pick list detail workspace
  - Scenarios:
    - Given an open line, When the user clicks `Pick`, Then instrumentation reports ready with `action: 'pick'` and the UI flips to completed (`tests/e2e/pick-lists/pick-list-detail.spec.ts:124-205`).
    - Given a completed line, When the user clicks `Undo`, Then instrumentation reports ready with `action: 'undo'` and the UI returns to open (`tests/e2e/pick-lists/pick-list-detail.spec.ts:207-218`).
  - Hooks: `waitForUiState('pickLists.detail.execution', …)` plus `toastHelper.expectSuccessToast` ensure deterministic waits.
  - Gaps: No spec exercises parallel picks/undos, so the “only the active line locks” invariant remains unverified.
- Surface: Kit detail integration
  - Scenarios:
    - Given a kit with an open pick list, When the user picks a line, Then the kit badge updates to Completed and overview counts refresh (`tests/e2e/kits/kit-detail.spec.ts:622-655`).
  - Hooks: Uses shared page objects with `waitForListLoading` and `waitForUiState` instrumentation events.
  - Gaps: Same missing parallel-action coverage noted above.

### 7) Adversarial Sweep (must attempt ≥3 credible failures or justify none)
- Checks attempted: concurrent line actions (revealed Major finding), optimistic availability adjustments, instrumentation metadata for error states.
- Evidence: `src/components/pick-lists/pick-list-lines.tsx:170-259`, `src/hooks/use-pick-list-execution.ts:180-238`, `src/lib/test/ui-state.ts:48-109`.
- Why code held up: Availability cache math clamps quantities and invalidates per part, and error instrumentation funnels through `toast.showException`, so aside from the pending-line gating the other probes behaved as expected.

### 8) Invariants Checklist (table)
- Invariant: Pick list header status equals `completed` iff open-line count is zero
  - Where enforced: `src/types/pick-lists.ts:300-337`
  - Failure mode: Header could misreport completion if metrics drift
  - Protection: Recompute metrics in `applyPickListLineStatusPatch` on every optimistic update.
  - Evidence: `src/types/pick-lists.ts:318-337`
- Invariant: Availability cache never drops below zero
  - Where enforced: `src/hooks/use-pick-list-execution.ts:200-233`
  - Failure mode: Negative stock display after pick mutation
  - Protection: Clamp with `Math.max(location.qty + delta, 0)` before writing.
  - Evidence: `src/hooks/use-pick-list-execution.ts:214-222`
- Invariant: Execution instrumentation includes line and kit identifiers
  - Where enforced: `src/hooks/use-pick-list-execution.ts:235-259`
  - Failure mode: Playwright waits would lack metadata to assert transitions
  - Protection: `ExecutionReadyMetadata` extends `ExecutionMetadata` so ready events always include `{ pickListId, kitId, lineId }`.
  - Evidence: `src/hooks/use-pick-list-execution.ts:235-255`

### 9) Questions / Needs-Info
- None.

### 10) Risks & Mitigations (top 3)
- Risk: Whole-table disablement slows operators during large picks
  - Mitigation: Implement per-line pending tracking before release
  - Evidence: Major finding (`src/components/pick-lists/pick-list-lines.tsx:183-184`)
- Risk: Availability cache may show stale data if mutation touches unseen parts
  - Mitigation: Add regression where multiple lines sharing a part are mutated sequentially to verify invalidation flow
  - Evidence: `src/hooks/use-pick-list-execution.ts:234-264`
- Risk: Instrumentation coverage depends on ready metadata staying stable
  - Mitigation: Keep Playwright assertions (e.g., `tests/e2e/pick-lists/pick-list-detail.spec.ts:188-218`) in sync if metadata shape changes.

### 11) Confidence
Confidence: Medium — Flow matches plan aside from the pending-state regression, but fixes are scoped and tests already cover the main execution paths.
