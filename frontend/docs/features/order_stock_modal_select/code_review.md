### 1) Summary & Decision
<review_summary_template>
**Readiness**
Order Stock dialog now delegates list selection to the reusable, instrumented selector (`src/components/shopping-lists/part/add-to-shopping-list-dialog.tsx:303` — `<ShoppingListSelector …>`) while the shared component wraps query filtering, optimistic inline creation, and test events (`src/components/shopping-lists/shopping-list-selector.tsx:71-272` — `useShoppingListOptions` + `ListCreateDialog`). Supporting hook normalization and dialog prefills line up with the intended flow (`src/hooks/use-shopping-lists.ts:646-701` — `useShoppingListOptions`, `src/components/shopping-lists/list-create-dialog.tsx:98-118` — `initialName` hydrate on open).

**Decision**
GO — Implementation matches the approved slice and Playwright specs exercise the new create/select paths against the real backend (`tests/e2e/shopping-lists/parts-entrypoints.spec.ts:9-108`).
</review_summary_template>

### 2) Conformance to Plan (with evidence)
<plan_conformance_template>
**Plan alignment**
- `plan.md:22-24` ↔ `src/components/shopping-lists/part/add-to-shopping-list-dialog.tsx:303-317` — `<ShoppingListSelector … enableCreate …>` replaces the native `<select>` and drops inline create fields.
- `plan.md:42-47` ↔ `src/components/shopping-lists/shopping-list-selector.tsx:71-213` — new selector component encapsulates status-filtered loading, instrumentation, and inline creation handoff.
- `plan.md:46-49` ↔ `src/hooks/use-shopping-lists.ts:646-701` — `useShoppingListOptions` wraps `useGetShoppingLists` with status normalization and option mapping.
- `plan.md:54-56` ↔ `src/components/shopping-lists/list-create-dialog.tsx:98-118` — dialog accepts `initialName/initialDescription` and seeds fields when opened from the selector.
- `plan.md:132-147` ↔ `tests/e2e/shopping-lists/parts-entrypoints.spec.ts:9-108` — Playwright specs now drive the searchable selector, inline creation, and conflict instrumentation.

**Gaps / deviations**
- None.
</plan_conformance_template>

### 3) Correctness — Findings (ranked)
None.

### 4) Over-Engineering & Refactoring Opportunities
None.

### 5) Style & Consistency
None.

### 6) Tests & Deterministic Coverage (new/changed behavior only)
<test_coverage_template>
- Surface: Order Stock modal — concept creation path
  - Scenarios:
    - Given a part with seller + backend lists, When the user creates a concept list through the selector, Then the dialog auto-selects it and submits successfully (`tests/e2e/shopping-lists/parts-entrypoints.spec.ts:9-80`).
  - Hooks: `parts.orderStock.lists` list-loading waits + `ShoppingListCreate:concept`/`ShoppingListMembership:addFromPart` form events (`tests/e2e/shopping-lists/parts-entrypoints.spec.ts:21-52`).
  - Gaps: None.
  - Evidence: `tests/e2e/shopping-lists/parts-entrypoints.spec.ts:9-80`
</test_coverage_template>
<test_coverage_template>
- Surface: Order Stock modal — duplicate membership guard
  - Scenarios:
    - Given an existing concept list containing the part, When the user selects it via search and submits, Then the backend 409 surfaces the conflict banner/toast (`tests/e2e/shopping-lists/parts-entrypoints.spec.ts:82-109`).
  - Hooks: Selector harness waits on `parts.orderStock.lists` and reuse of form instrumentation (`tests/e2e/shopping-lists/parts-entrypoints.spec.ts:95-106`).
  - Gaps: None.
  - Evidence: `tests/e2e/shopping-lists/parts-entrypoints.spec.ts:82-109`
</test_coverage_template>

### 7) Adversarial Sweep (must attempt ≥3 credible failures or justify none)
<adversarial_proof_template>
- Checks attempted: race between inline create and query refetch; reopening dialog with cached data still emitting deterministic events; conflict banner clearing after changing selection.
- Evidence: `src/components/shopping-lists/shopping-list-selector.tsx:99-167` — optimistic option + `refetch`; `src/components/shopping-lists/shopping-list-selector.tsx:204-213` — `useListLoadingInstrumentation`; `src/components/shopping-lists/part/add-to-shopping-list-dialog.tsx:206-220` — `applyListSelection` resets conflict state.
- Why code held up: Optimistic option keeps the new list selectable until the refetch completes, instrumentation monitors `isLoading/isFetching` for each reopen, and resetting the form selection clears the conflict path before resubmission.
</adversarial_proof_template>

### 8) Invariants Checklist (table)
<invariant_template>
- Invariant: Submit requires an allowed shopping list ID.
  - Where enforced: `src/components/shopping-lists/part/add-to-shopping-list-dialog.tsx:69-82` — `validationRules.listId` ensures a trimmed ID is present.
  - Failure mode: Submitting without a list would hit the backend with `NaN` and throw.
  - Protection: Validation plus `handleSubmit` replays validation telemetry before attempting the mutation.
  - Evidence: `src/components/shopping-lists/part/add-to-shopping-list-dialog.tsx:241-263`
</invariant_template>
<invariant_template>
- Invariant: Selector options honor the caller-provided statuses.
  - Where enforced: `src/hooks/use-shopping-lists.ts:683-690` — filter by `allowedStatuses` before mapping options.
  - Failure mode: Showing disallowed lists could let parts slip into non-concept flows.
  - Protection: Normalized status set and query parameterization keep options scoped.
  - Evidence: `src/components/shopping-lists/shopping-list-selector.tsx:121-129`
</invariant_template>
<invariant_template>
- Invariant: Newly created list is auto-selected and marked for validation.
  - Where enforced: `src/components/shopping-lists/shopping-list-selector.tsx:150-167` — `handleListCreated` calls `onChange` + optimistic option; `src/components/shopping-lists/part/add-to-shopping-list-dialog.tsx:206-220` — `applyListSelection` sets form value and touches the field.
  - Failure mode: Users could create a list but submit without it selected, leading to empty `listId`.
  - Protection: Shared apply helper updates the form state and resets conflict error on every change.
  - Evidence: `src/components/shopping-lists/part/add-to-shopping-list-dialog.tsx:206-220`
</invariant_template>

### 9) Questions / Needs-Info
None.

### 10) Risks & Mitigations (top 3)
<risk_template>
- Risk: Client-side filtering may bog down as list counts grow because every keystroke scans all options.
- Mitigation: Monitor option counts and switch to backend search/pagination when thresholds are hit.
- Evidence: `src/components/shopping-lists/shopping-list-selector.tsx:114-119`
</risk_template>
<risk_template>
- Risk: Reused selector could emit conflicting list-loading scopes if consumers copy the hard-coded string from the dialog.
- Mitigation: Document unique scope expectations and prefer constants per feature.
- Evidence: `src/components/shopping-lists/part/add-to-shopping-list-dialog.tsx:222-230`
</risk_template>
<risk_template>
- Risk: Test harness builds a regex directly from the typed name, so characters like `[]` or `+` could break creation flows during E2E runs.
- Mitigation: Escape user-provided terms before constructing the regex inside the harness.
- Evidence: `tests/support/page-objects/shopping-list-selector-harness.ts:86-103`
</risk_template>

### 11) Confidence
<confidence_template>Confidence: High — Reviewed selector lifecycle, optimistic create, and test coverage without uncovering blocking issues.</confidence_template>
