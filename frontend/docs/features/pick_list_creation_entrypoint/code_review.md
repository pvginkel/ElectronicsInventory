### 1) Summary & Decision
**Readiness**
Implementation largely mirrors the plan (new header action, dialog, Playwright flow), but two instrumentation regressions block the workflow and the suite.

**Decision**
`NO-GO` — UI-state instrumentation never re-emits after the pick-list refetch and the form incorrectly logs validation errors even on success (see Findings).

### 2) Conformance to Plan (with evidence)
**Plan alignment**
- `1) Intent & Scope — add header entrypoint` ↔ `src/components/kits/kit-detail-header.tsx:126-148` — `data-testid="kits.detail.actions.create-pick-list"` button wired to `onCreatePickList`.
- `2) Affected Areas — modal + instrumentation` ↔ `src/components/kits/kit-pick-list-create-dialog.tsx:45-208` — dialog encapsulates form state, mutation, `useListLoadingInstrumentation`, and toast handling.
- `2) Affected Areas — Playwright coverage` ↔ `tests/e2e/kits/kit-detail.spec.ts:628-774` — new scenario exercises validation, mutation events, success toast, and refreshed chips.

**Gaps / deviations**
- `1) Intent & Scope — refresh links metadata` — `useUiStateInstrumentation` only watches `queryStatus === 'pending'`, so the ready event never fires on background refetch `src/components/kits/kit-detail.tsx:44-81`.
- `9) Observability / Instrumentation` — `handleSubmit` re-validates after the form resets, emitting a spurious `validation_error` even on success `src/components/kits/kit-pick-list-create-dialog.tsx:180-200`.

### 3) Correctness — Findings (ranked)
- Title: Blocker — Links instrumentation never re-emits after pick list creation
  - Evidence: `src/components/kits/kit-detail.tsx:76-81` — `useUiStateInstrumentation('kits.detail.links', { isLoading: isKitIdValid ? queryStatus === 'pending' : false, ... })`.
  - Impact: `kits.detail.links` never transitions back to `loading/ready` during refetch, so Playwright’s `linksReload` waiter hangs and automated coverage cannot pass; observability of link counts is broken after the first load.
  - Fix: Include the fetch phase (`query.fetchStatus === 'fetching'`) in the instrumentation’s `isLoading` predicate so ready/error emits on refetch, mirroring the list instrumentation.
  - Confidence: High
- Title: Blocker — Successful submit still emits validation_error
  - Evidence: `src/components/kits/kit-pick-list-create-dialog.tsx:180-187` — `const message = validateRequestedUnits(form.values.requestedUnits); if (message) trackValidationError(...)`; coupled with the post-success reset in `src/components/kits/kit-pick-list-create-dialog.tsx:190-200` — `form.reset();`.
  - Impact: After a successful create (which closes and resets the form), the follow-up validation runs on the blank state and logs a `validation_error`, polluting instrumentation and violating the test taxonomy; downstream assertions can misinterpret the flow as failing validation.
  - Fix: Gate the post-submit validation so it only runs when submission was rejected (e.g., check `mutation.isPending`/return value or inspect `form.errors` before tracking).
  - Confidence: High

### 4) Over-Engineering & Refactoring Opportunities
- None observed.

### 5) Style & Consistency
- No substantive inconsistencies noticed beyond the blockers above.

### 6) Tests & Deterministic Coverage (new/changed behavior only)
- Surface: Kit detail header → pick list creation modal
- Scenarios:
  - Given an active kit, When I submit empty requested units, Then a validation error surfaces (`tests/e2e/kits/kit-detail.spec.ts:693-705`).
  - Given valid input, When I create a pick list, Then form/loader events fire, toast appears, backend reflects new pick list, and chip renders (`tests/e2e/kits/kit-detail.spec.ts:706-773`).
- Hooks: `useListLoadingInstrumentation` scope `kits.detail.pickLists.create` and `useFormInstrumentation` scope `KitPickList:create` (`src/components/kits/kit-pick-list-create-dialog.tsx:63-187`); `useUiStateInstrumentation` for links (`src/components/kits/kit-detail.tsx:71-81`).
- Gaps: `linksReload` awaits a `ui_state` ready event that the current implementation never emits because `isLoading` ignores `query.fetchStatus === 'fetching'` (`src/components/kits/kit-detail.tsx:44-81`).
- Evidence: `tests/e2e/kits/kit-detail.spec.ts:718-753`.

### 7) Adversarial Sweep (must attempt ≥3 credible failures or justify none)
- Title: Blocker — Links instrumentation never re-emits after pick list creation
  - Evidence: `src/components/kits/kit-detail.tsx:76-81` — `isLoading` omits the fetching phase, so `linksReload` cannot resolve.
  - Impact: Deterministic waits stall and UI telemetry misses the state transition.
  - Fix: Treat `query.fetchStatus === 'fetching'` as loading.
  - Confidence: High
- Checks attempted: duplicate submission sprint (submit button disabled via `mutation.isPending`, `src/components/kits/kit-pick-list-create-dialog.tsx:63-108`); cancel while pending (dialog close guard prevents aborting a live mutation, `src/components/kits/kit-pick-list-create-dialog.tsx:190-203`); archived kits triggering the modal (button disabled and handler short-circuits, `src/components/kits/kit-detail-header.tsx:136-148`, `src/components/kits/kit-detail.tsx:93-98`).
- Evidence: `src/components/kits/kit-pick-list-create-dialog.tsx:63-203`, `src/components/kits/kit-detail-header.tsx:136-148`, `src/components/kits/kit-detail.tsx:93-124`.
- Why code held up: State guards and disabled controls block those races, so no additional failures surfaced beyond the instrumentation blockers.

### 8) Invariants Checklist (table)
- Invariant: Only active kits may open the create dialog
  - Where enforced: `src/components/kits/kit-detail-header.tsx:136-148`, `src/components/kits/kit-detail.tsx:93-124`
  - Failure mode: Archived kits could spawn mutations against policy
  - Protection: Button disabled and click handler early-return when `detail.status !== 'active'`
  - Evidence: `src/components/kits/kit-detail-header.tsx:140-148`
- Invariant: Prevent concurrent pick list submissions
  - Where enforced: `src/components/kits/kit-pick-list-create-dialog.tsx:68-205`
  - Failure mode: Double submit races creating duplicates
  - Protection: `mutation.isPending` short-circuit, disabled submit, close guard
  - Evidence: `src/components/kits/kit-pick-list-create-dialog.tsx:68-205`
- Invariant: Success events include new pick list identifiers for tests
  - Where enforced: `src/components/kits/kit-pick-list-create-dialog.tsx:96-158`
  - Failure mode: Tests cannot assert backend state without IDs
  - Protection: Snapshot stored before instrumentation ready metadata emission
  - Evidence: `src/components/kits/kit-pick-list-create-dialog.tsx:96-158`

### 9) Questions / Needs-Info
- None.

### 10) Risks & Mitigations (top 3)
- Risk: `kits.detail.links` telemetry stalls after first fetch.
  - Mitigation: Feed `query.fetchStatus === 'fetching'` into `useUiStateInstrumentation`.
  - Evidence: Blocker finding `src/components/kits/kit-detail.tsx:76-81`.
- Risk: Form emits false `validation_error` after success, obscuring analytics.
  - Mitigation: Only call `trackValidationError` when submission was rejected or validation actually failed.
  - Evidence: Blocker finding `src/components/kits/kit-pick-list-create-dialog.tsx:180-200`.
- Risk: Mutation keeps default `queryClient.invalidateQueries()` plus manual refetch, causing redundant network churn.
  - Mitigation: Override the mutation’s `onSuccess` to target the detail query or rely solely on explicit `query.refetch`.
  - Evidence: `src/components/kits/kit-pick-list-create-dialog.tsx:59-107`, `src/lib/api/generated/hooks.ts:975-985`.

### 11) Confidence
Confidence: Medium — Core flow is in place, but the identified instrumentation regressions show the slice needs another pass.
