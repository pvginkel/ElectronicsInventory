# Plan Review: Pick List Shortfall Handling

## 1) Summary & Decision

**Readiness**

The plan is well-structured, demonstrates thorough research of existing code patterns, and aligns with the product brief's kit workflow requirements. It correctly identifies the generated API types, existing instrumentation hooks, and page object patterns. The two-step dialog approach is reasonable and mirrors patterns used elsewhere in the codebase. However, the plan has a critical gap in the API schema understanding (the `shortfall_handling` field has a `@default null` annotation meaning it is optional, not required as stated), and the test plan lacks sufficient specificity around factory setup for deterministic shortfall scenarios.

**Decision**

`GO-WITH-CONDITIONS` — The plan is implementable but requires clarification on: (1) the factory extension to seed parts with controlled stock levels for deterministic shortfall testing, (2) explicit instrumentation events for step transitions, and (3) confirmation that the existing dialog reset logic handles the new `shortfallParts` state correctly.

---

## 2) Conformance & Fit (with evidence)

**Conformance to refs**

- `docs/commands/plan_feature.md` — Pass — `plan.md:1-438` — Plan follows the template structure with all required sections including Research Log, Intent & Scope, Deterministic Test Plan, and Implementation Slices.
- `docs/product_brief.md` — Pass — `plan.md:35-64` — Feature aligns with product brief section 7 "Projects (kits)": "When you 'build,' the app can deduct quantities from chosen locations" and coverage determination. The shortfall handling enables partial fulfillment which is implicit in the brief's flexibility.
- `AGENTS.md` — Pass — `plan.md:231-235` — Plan specifies form instrumentation (`trackSubmit`, `trackSuccess`) and list loading instrumentation as required by "Treat instrumentation as part of the UI contract."
- `docs/contribute/architecture/application_overview.md` — Pass — `plan.md:6-28` — Plan references generated API hooks (`usePostKitsPickListsByKitId`), TanStack Query patterns, and the domain-driven folder layout.
- `docs/contribute/testing/playwright_developer_guide.md` — Partial — `plan.md:345-371` — Test plan mentions deterministic waits and factory usage, but does not specify how to seed parts with specific stock quantities to guarantee shortfall detection.

**Fit with codebase**

- `kit-pick-list-create-dialog.tsx` — `plan.md:92-94` — Component location is accurate; current structure at lines 220-291 shows single-step form that will need restructuring.
- `KitContentRow` type — `plan.md:150-163` — Reference to `kits.ts:150-163` is accurate; type includes `available`, `requiredPerUnit`, and `shortfall` fields needed for calculation.
- `useFormInstrumentation` — `plan.md:15,134-138` — Hook is already in use at dialog line 52; plan correctly identifies extending existing instrumentation.
- `kits-page.ts` page object — `plan.md:100-101,287-294` — Existing locators at lines 119-123 confirm pattern; plan's proposed test IDs follow the established `kits.detail.pick-list.create.*` namespace.
- `kit-factory.ts` — `plan.md:108-109` — Factory method `createPickList` at lines 191-205 does not currently support `shortfall_handling`; plan correctly identifies this gap but does not detail the signature change.

---

## 3) Open Questions & Ambiguities

- Question: How will tests deterministically seed inventory to guarantee shortfall scenarios?
- Why it matters: Without controlled stock levels, tests cannot reliably trigger the shortfall step. The existing test at `kit-detail.spec.ts:769-775` stocks 25 units via `/api/inventory/parts/{part_key}/stock`, but the plan does not specify quantities needed to trigger shortfall.
- Needed answer: Factory or test setup snippet showing: (a) kit with `requiredPerUnit = 10`, (b) part with stock = 5, (c) `requestedUnits = 2` so `10 * 2 = 20 > 5` triggers shortfall.

- Question: Should step transitions emit dedicated instrumentation events?
- Why it matters: The current `form` event taxonomy includes `open`, `submit`, `success`, `error`, `validation_error` phases. A step transition (units -> shortfall) is not a submit or success, but tests may need to wait for it deterministically.
- Needed answer: Either (a) confirm existing `form` events suffice and step is UI-only, or (b) propose a `ui_state` event with scope `kits.detail.pickLists.create.step` and phases `units`/`shortfall`.

- Question: Does the dialog reset effect handle the new `shortfallParts` state?
- Why it matters: `plan.md:300-304` references the existing reset effect at `kit-pick-list-create-dialog.tsx:145-154`, but the new `shortfallParts` state must be cleared to prevent stale data on re-open.
- Needed answer: Confirm the implementation will add `setShortfallParts([])` and `setCurrentStep('units')` to the reset effect.

---

## 4) Deterministic Playwright Coverage (new/changed behavior only)

- Behavior: Pick list creation with shortfall detection (step 2 displayed)
- Scenarios:
  - Given a kit with part requiring 10 units/build and 15 units in stock, When user enters 2 requested units and clicks Continue, Then shortfall step displays showing 5-unit shortfall (`tests/e2e/kits/kit-detail.spec.ts`)
  - Given shortfall step is displayed, When user selects "Limit" for the shortfall part, Then submit button becomes enabled
- Instrumentation: `waitTestEvent(page, 'form', evt => evt.formId === 'KitPickList:create' && evt.phase === 'submit')`, `page.getByTestId('kits.detail.pick-list.create.step.shortfall')`, `page.getByTestId('kits.detail.pick-list.create.shortfall.row.{partKey}.limit')`
- Backend hooks: `kit-factory.ts:createPickList` extended with `shortfallHandling` parameter; `parts.addStock(partKey, qty)` helper to seed inventory
- Gaps: **Missing factory method to seed part with exact stock quantity.** Currently tests use raw API call at `kit-detail.spec.ts:770-775`. Need deterministic helper.
- Evidence: `plan.md:345-361`, `kit-detail.spec.ts:769-775`

- Behavior: No-shortfall skip (step 2 bypassed)
- Scenarios:
  - Given a kit with part requiring 10 units/build and 50 units in stock, When user enters 2 requested units and clicks Continue, Then pick list is created directly without shortfall step
- Instrumentation: `waitTestEvent(page, 'form', evt => evt.formId === 'KitPickList:create' && evt.phase === 'success')`, `waitForListLoading(page, 'kits.detail.pickLists.create', 'ready')`
- Backend hooks: Same as above with sufficient stock
- Gaps: None
- Evidence: `plan.md:353`

- Behavior: Backend 409 error on "omit all" attempt
- Scenarios:
  - Given shortfall step with single shortfall part, When user selects "Omit" and submits, Then error toast displays and dialog remains on shortfall step
- Instrumentation: `waitTestEvent(page, 'form', evt => evt.formId === 'KitPickList:create' && evt.phase === 'error')`, `expectConsoleError(page, /409|conflict|cannot omit/i)`
- Backend hooks: Same shortfall setup as first scenario
- Gaps: **Plan does not specify the exact error message pattern from backend for test assertion.**
- Evidence: `plan.md:351`, `playwright_developer_guide.md:121-126`

- Behavior: Back button preserves units input
- Scenarios:
  - Given shortfall step is displayed, When user clicks Back, Then units step is shown with previously entered value preserved
- Instrumentation: `page.getByTestId('kits.detail.pick-list.create.back')` (not defined in plan), `expect(requestedUnitsInput).toHaveValue('2')`
- Gaps: **"Back" button `data-testid` not defined in plan.** Should be `kits.detail.pick-list.create.back`.
- Evidence: `plan.md:329`, `plan.md:287-293` (missing back button)

---

## 5) Adversarial Sweep (must find >=3 credible issues or declare why none exist)

**Major — Missing `shortfall_handling` field in no-shortfall case**

**Evidence:** `plan.md:23-24,94` — "Existing code needs to be updated to pass `shortfall_handling: null` for the no-shortfall case (currently missing this field)" vs `kit-pick-list-create-dialog.tsx:92-95` — current code sends `{ requested_units: requestedUnits }` without `shortfall_handling`.

**Why it matters:** The plan correctly identifies this but the API schema at `types.ts:3358-3373` shows `shortfall_handling` with `@default null`, meaning it is optional with a server-side default. The plan states it is "required" which is incorrect. If the implementation adds explicit `null` unnecessarily, it works but creates confusion. More critically, the plan should verify whether the backend currently handles missing vs explicit null differently.

**Fix suggestion:** Verify backend behavior with `GET /api/openapi.json` to confirm `shortfall_handling` is optional. If optional with server default, the current code is already correct for the no-shortfall case. Update plan section 3 to reflect accurate schema semantics.

**Confidence:** High

---

**Major — Shortfall calculation may use stale `kit.contents` data**

**Evidence:** `plan.md:203-208` — "Computed from `kit.contents` and `requestedUnits` when user clicks 'Continue'" and "Invariant: Must reflect the units value at calculation time, not current input value" vs `kit-pick-list-create-dialog.tsx:46-50` — `kit` comes from props, not from React Query.

**Why it matters:** If the user opens the dialog, another session modifies part stock, and then the user clicks Continue, the shortfall calculation uses stale `kit.contents` data. The backend will then reject or produce unexpected results because actual stock differs. This is a race condition that could confuse users.

**Fix suggestion:** Accept this as inherent to the optimistic UI pattern already used throughout the app. Add a note in the plan acknowledging this limitation and document that the backend is the source of truth—if stock changed, the backend will handle it appropriately (possibly with 409 Conflict). Alternatively, invalidate kit detail query when dialog opens, but this adds latency.

**Confidence:** Medium

---

**Major — Back button `data-testid` missing from instrumentation section**

**Evidence:** `plan.md:287-293` — Lists `data-testid` attributes but does not include back button; `plan.md:329` — "Back button on step 2 returns to step 1"

**Why it matters:** The test scenario at `plan.md:354` requires asserting back button behavior, but without a `data-testid`, Playwright must use fragile role-based selection. This violates the test ID policy at `playwright_developer_guide.md:186`.

**Fix suggestion:** Add `kits.detail.pick-list.create.back` to the instrumentation section. Also add corresponding locator to page object update slice.

**Confidence:** High

---

**Minor — Form instrumentation snapshot missing `hasShortfall` and `shortfallCount` fields**

**Evidence:** `plan.md:272` — "Labels / fields: `{ kitId, requestedUnits, pickListId (on success), hasShortfall, shortfallCount }`" vs `kit-pick-list-create-dialog.tsx:31-36` — Current `KitPickListSnapshot` has `kitId`, `requestedUnits`, `pickListId`, `status`.

**Why it matters:** The plan proposes adding `hasShortfall` and `shortfallCount` to instrumentation metadata, but does not update the `KitPickListSnapshot` type definition in section 3. Tests expecting these fields will fail if they are not added.

**Fix suggestion:** Update Data Model section 3 to include the extended snapshot type with new fields:
```typescript
interface KitPickListSnapshot {
  kitId: number;
  requestedUnits: number | null;
  pickListId?: number;
  status?: string;
  hasShortfall?: boolean;
  shortfallCount?: number;
}
```

**Confidence:** High

---

## 6) Derived-Value & State Invariants (table)

- Derived value: `shortfallParts`
  - Source dataset: Filtered from `kit.contents` where `requestedUnits * requiredPerUnit > available`
  - Write / cleanup triggered: Stored in component state; cleared when dialog closes; used to build `shortfall_handling` payload at submission
  - Guards: Only computed when `requestedUnits > 0`; calculation is triggered by explicit button click, not reactive
  - Invariant: Must be recalculated if user navigates back to step 1 and changes units before re-clicking Continue
  - Evidence: `plan.md:203-208`

- Derived value: `allActionsSelected`
  - Source dataset: Filtered view of `shortfallParts` checking `selectedAction !== null`
  - Write / cleanup triggered: Controls submit button `disabled` state; no persistent writes
  - Guards: Returns `true` when `shortfallParts.length === 0` (handled by skip-to-submit path)
  - Invariant: Must update immediately when any radio button changes
  - Evidence: `plan.md:209-215`

- Derived value: `shortfallHandlingPayload`
  - Source dataset: Transformed from `shortfallParts` with non-null `selectedAction`
  - Write / cleanup triggered: Passed to mutation; determines backend line creation behavior
  - Guards: Only included in request when `shortfallParts.length > 0`; passes `null` when no shortfall (per plan, though schema shows this is optional)
  - Invariant: Must map `partKey` to `{ action: selectedAction }` format matching `KitPickListCreateSchema.b247181.ShortfallActionSchema`
  - Evidence: `plan.md:217-222`, `types.ts:3385-3390`

> **Note:** The `shortfallParts` derived value drives a persistent write (the mutation payload) based on a filtered view. This is acceptable because the filter is user-initiated (click Continue) and the user explicitly reviews the filtered set before submission. No automated cleanup risk.

---

## 7) Risks & Mitigations (top 3)

- Risk: Stale `kit.contents` data causes user confusion when backend rejects pick list creation with different error than expected.
- Mitigation: Document in UX that backend is source of truth; existing error handling via `showException` will display backend message. Consider invalidating kit query on dialog open in future iteration.
- Evidence: `plan.md:203-208`, `kit-pick-list-create-dialog.tsx:46-50`

- Risk: Factory and test setup complexity for deterministic shortfall scenarios may cause flaky tests.
- Mitigation: Extend `kit-factory.ts` with a `createWithContentsAndStock` helper that seeds both kit contents and part inventory in one call. Use explicit quantities that guarantee shortfall (e.g., `requiredPerUnit=10`, stock=5, `requestedUnits=2`).
- Evidence: `plan.md:402-406`, `kit-factory.ts:100-110`

- Risk: Radio button implementation may deviate from existing form patterns, causing accessibility or styling inconsistencies.
- Mitigation: Plan acknowledges no existing `RadioGroup` component. Implementation should use native radio inputs with `sr-only` labels and Tailwind styling consistent with existing form fields. Consider extracting to `src/components/ui/radio-group.tsx` if reusable.
- Evidence: `plan.md:26,414-418`

---

## 8) Confidence

Confidence: Medium — The plan is thorough and well-researched, but the API schema misunderstanding and missing test infrastructure details (factory methods, back button test ID) require corrections before implementation can proceed smoothly. Once addressed, implementation risk is low given the clear alignment with existing patterns.
