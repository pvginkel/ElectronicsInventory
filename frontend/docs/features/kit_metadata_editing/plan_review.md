### 1) Summary & Decision
**Readiness**
The plan covers the primary flows and references the right surfaces, but key guardrails are underspecified: it omits Playwright coverage for the BOM gating it promises, resets form state via `useEffect` in a way that will wipe in-progress edits, and never spells out how validation telemetry fires despite requiring those events (`docs/features/kit_metadata_editing/plan.md:25-27`, `docs/features/kit_metadata_editing/plan.md:186-213`).

**Decision**
`GO-WITH-CONDITIONS` — Resolve the BOM gating coverage gap, replace the destructive form reset strategy, and document validation instrumentation to meet the epic’s observability mandate.

### 2) Conformance & Fit (with evidence)
**Conformance to refs**
- `docs/epics/kits_feature_breakdown.md` — Fail — `docs/features/kit_metadata_editing/plan.md:25-27`, `docs/features/kit_metadata_editing/plan.md:216-220` — The epic requires “ensure BOM action buttons respect the same gating” and “Playwright coverage adds scenarios … archived gating (modal blocked, actions disabled)” (`docs/epics/kits_feature_breakdown.md:117-126`), but the plan’s coverage only checks the header button and tooltip, leaving BOM actions unverified.
- `docs/contribute/ui/forms.md` — Fail — `docs/features/kit_metadata_editing/plan.md:186-187`, `docs/features/kit_metadata_editing/plan.md:210-212` — Form guidance says “Manage local state with `useFormState`” and “When performing validation, call `trackValidationError` / `trackValidationErrors`” (`docs/contribute/ui/forms.md:13-19`), yet the plan proposes resetting via `useEffect` and never commits to emitting validation events.
- `docs/contribute/architecture/application_overview.md` — Pass — The plan routes mutations through `usePatchKitsByKitId` and updates React Query caches (“Mutation hook … wraps `usePatchKitsByKitId` with optimistic cache writes” `docs/features/kit_metadata_editing/plan.md:70-101`), aligning with “Generated API client” and “React Query handles caching and background refresh” guidance (`docs/contribute/architecture/application_overview.md:30-41`).

**Fit with codebase**
- `KitDetail` — `docs/features/kit_metadata_editing/plan.md:42-44`, `docs/features/kit_metadata_editing/plan.md:138-141` — Matches existing ownership of modal state and instrumentation in `src/components/kits/kit-detail.tsx`.
- `KitBOMTable` — `docs/features/kit_metadata_editing/plan.md:50-53`, `docs/features/kit_metadata_editing/plan.md:216-220` — Plan sends the read-only flag downstream but never exercises it in tests, so alignment with `kit-bom-table.tsx` remains speculative.

### 3) Open Questions & Ambiguities
- Question: Which specific BOM interactions must respect `isEditable`, and how will the UI communicate that state?  
  Why it matters: Without enumerating the affected controls, implementation can miss disabling actions the epic calls out, and tests cannot assert the right affordances.  
  Needed answer: List the BOM buttons/menus gated by `isEditable` and the expected disabled/tooltip behavior (`docs/features/kit_metadata_editing/plan.md:25-27`, `docs/epics/kits_feature_breakdown.md:117-119`).
- Question: How are the `nameChanged` / `buildTargetChanged` fields for instrumentation derived?  
  Why it matters: Tests will rely on these flags, but the plan never explains how they compare form values to the snapshot.  
  Needed answer: Specify the comparison logic and when the snapshot updates so the fields stay deterministic (`docs/features/kit_metadata_editing/plan.md:163-165`).

### 4) Deterministic Playwright Coverage (new/changed behavior only)
- Behavior: Active kit metadata edit dialog  
  - Scenarios:  
    - Given an active kit, When valid metadata is submitted, Then the modal closes, toast appears, detail/overview update, and `KitDetail:metadata` fires submit/success (`tests/e2e/kits/kit-detail.spec.ts`).  
  - Instrumentation: `waitTestEvent('form', evt => evt.formId === 'KitDetail:metadata')`, `waitForListLoading(page, 'kits.detail', 'ready')` (`docs/features/kit_metadata_editing/plan.md:210-213`).  
  - Backend hooks: Use kit factories plus PATCH helpers to seed/verify (`docs/features/kit_metadata_editing/plan.md:208-214`).  
  - Gaps: None noted.  
  - Evidence: `docs/features/kit_metadata_editing/plan.md:208-214`.
- Behavior: Validation failures in the dialog  
  - Scenarios: Given blank name or build target < 1, When submit is pressed, Then inline errors display and validation events emit.  
  - Instrumentation: Needs `trackValidationError` / `waitForFormValidationError`, but the plan does not describe how they fire.  
  - Backend hooks: None (client-side).  
  - Gaps: **Major** — Missing plan for producing the validation events the test waits on (`docs/features/kit_metadata_editing/plan.md:210-212`, `docs/contribute/ui/forms.md:17-19`).  
  - Evidence: `docs/features/kit_metadata_editing/plan.md:210-212`.
- Behavior: Archived kit gating  
  - Scenarios: Given an archived kit, When the user attempts to edit, Then the button stays disabled, tooltip explains read-only, and BOM actions stay disabled.  
  - Instrumentation: UI assertions plus absence of form events (`docs/features/kit_metadata_editing/plan.md:216-220`).  
  - Backend hooks: Seed archived kit variant.  
  - Gaps: **Major** — Plan omits verification that BOM action buttons remain disabled even though the epic requires it (`docs/features/kit_metadata_editing/plan.md:25-27`, `docs/features/kit_metadata_editing/plan.md:216-220`, `docs/epics/kits_feature_breakdown.md:117-126`).  
  - Evidence: `docs/features/kit_metadata_editing/plan.md:216-220`.

### 5) Adversarial Sweep (must find ≥3 credible issues or declare why none exist)
**Major — Missing BOM gating coverage**  
**Evidence:** `docs/features/kit_metadata_editing/plan.md:25-27`, `docs/features/kit_metadata_editing/plan.md:216-220`; `docs/epics/kits_feature_breakdown.md:117-126` — “propagate a read-only flag to downstream BOM interactions” while coverage only checks the header button.  
**Why it matters:** Without exercising BOM controls, archived kits can still mutate via overlooked actions, violating the epic contract and leaving tests blind to regressions.  
**Fix suggestion:** Extend the Playwright plan to assert that each BOM action is disabled (or error-toasted) when `isEditable` is false, matching tooltip expectations.  
**Confidence:** High

**Major — Destructive form reset via `useEffect`**  
**Evidence:** `docs/features/kit_metadata_editing/plan.md:186-187` — “Use `useEffect` to reset form values whenever `KitDetail` changes,” contrasted with the `BoxForm` pattern that only resets on close/success (`src/components/boxes/box-form.tsx:32-86`) and the form guidance to lean on `useFormState` (`docs/contribute/ui/forms.md:13-19`).  
**Why it matters:** React Query refetches during an open modal (e.g., cache invalidation after optimistic update) will clobber user edits mid-typing, and instrumentation snapshots (`useFormInstrumentation`) will lose the diff the tests expect.  
**Fix suggestion:** Initialize form state from props when opening the modal and call `form.reset(newValues)` on success/close instead of watching the entire detail object in an effect.  
**Confidence:** High

**Major — Validation instrumentation undefined**  
**Evidence:** `docs/features/kit_metadata_editing/plan.md:210-212` promises validation events, but instrumentation only lists open/submit/success/error fields (`docs/features/kit_metadata_editing/plan.md:160-165`) and never explains emitting `trackValidationError`, despite the requirement (`docs/contribute/ui/forms.md:17-19`, `docs/epics/kits_feature_breakdown.md:125`).  
**Why it matters:** Playwright relies on deterministic validation events; without an explicit plan, validation tests will flake or fail silently.  
**Fix suggestion:** Commit to calling `trackValidationError(s)` inside validation handlers and describe the trigger in the instrumentation section.  
**Confidence:** Medium

### 6) Derived-Value & State Invariants (table)
- Derived value: `isEditable`  
  - Source dataset: `detail.status` from `useKitDetail`.  
  - Write / cleanup triggered: Enables/disables header edit button and BOM actions; prevents modal opening (`docs/features/kit_metadata_editing/plan.md:129-133`).  
  - Guards: None beyond status equality.  
  - Invariant: When `isEditable` is false, no mutation path (header or BOM) can fire.  
  - Evidence: `docs/features/kit_metadata_editing/plan.md:147-148`.
- Derived value: `initialFormValues`  
  - Source dataset: Latest `KitDetail` properties.  
  - Write / cleanup triggered: Seeds `useFormState` before modal render and on manual resets.  
  - Guards: Should only refresh when modal opens or after success to avoid wiping edits.  
  - Invariant: Initial values must reflect the backend response corresponding to the open modal instance.  
  - Evidence: `docs/features/kit_metadata_editing/plan.md:148-149`.
- Derived value: `mutationPayload`  
  - Source dataset: Trimmed form values with build target parsed to number.  
  - Write / cleanup triggered: Drives optimistic cache writes and PATCH body (`docs/features/kit_metadata_editing/plan.md:88-96`).  
  - Guards: Ensure normalization mirrors backend schema and skip no-op trimming differences.  
  - Invariant: Payload must stay in sync with camelCase detail structures so optimistic cache matches subsequent refetch.  
  - Evidence: `docs/features/kit_metadata_editing/plan.md:90-101`.

### 7) Risks & Mitigations (top 3)
- Risk: Archived kits retain active BOM controls because coverage never exercises them.  
  Mitigation: Document the disabled-state expectations per action and add corresponding Playwright assertions.  
  Evidence: `docs/features/kit_metadata_editing/plan.md:25-27`, `docs/features/kit_metadata_editing/plan.md:216-220`, `docs/epics/kits_feature_breakdown.md:117-126`.
- Risk: Modal reinitializes while open, erasing user edits during background refetch.  
  Mitigation: Follow existing form patterns (`useFormState` + explicit resets) instead of effect-based resets.  
  Evidence: `docs/features/kit_metadata_editing/plan.md:186-187`, `src/components/boxes/box-form.tsx:32-86`.
- Risk: Validation telemetry gap causes Playwright waits to hang or fail.  
  Mitigation: Explicitly wire `trackValidationError`/`waitForFormValidationError` into the validation flow.  
  Evidence: `docs/features/kit_metadata_editing/plan.md:210-212`, `docs/contribute/ui/forms.md:17-19`.

### 8) Confidence
<confidence_template>Confidence: Medium — The architecture alignment is sound, but the unresolved coverage and instrumentation gaps must be addressed before build-out.</confidence_template>
