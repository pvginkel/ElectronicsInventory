# Pick List Shortfall Handling - Technical Plan

## 0) Research Log & Findings

**Searched areas:**
- `src/components/kits/kit-pick-list-create-dialog.tsx` - Existing dialog implementation
- `src/lib/api/generated/types.ts` and `hooks.ts` - Generated API types including new shortfall handling schema
- `src/types/kits.ts` - Domain models including `KitContentRow` with `available`, `requiredPerUnit`, `shortfall` fields
- `tests/e2e/kits/kit-detail.spec.ts` - Existing Playwright specs for kit detail and pick list creation
- `tests/support/page-objects/kits-page.ts` - Page object locators for pick list dialog
- `tests/api/factories/kit-factory.ts` - Factory methods for creating kits and pick lists
- `src/hooks/use-form-instrumentation.ts` - Form instrumentation patterns
- `docs/contribute/architecture/test_instrumentation.md` - Test event taxonomy

**Relevant components/hooks:**
- `KitPickListCreateDialog` - Single-step dialog that needs two-step flow
- `usePostKitsPickListsByKitId` - Generated mutation hook for creating pick lists
- `useFormInstrumentation` - Emits form lifecycle events for Playwright
- `useListLoadingInstrumentation` - Emits list loading events for deterministic waits

**Key findings:**
- The generated API types already include `KitPickListCreateSchema_b247181` with `shortfall_handling` field
- `shortfall_handling` is optional with `@default null` in the schema - the backend applies a server-side default when omitted, so existing code works correctly for the no-shortfall case
- `shortfall_handling` accepts a map of part keys to `{ action: 'limit' | 'omit' | 'reject' }` or `null`
- `KitContentRow` already has `available`, `requiredPerUnit`, and `shortfall` fields
- No existing RadioGroup component in `src/components/ui/` - will use native HTML radio inputs styled with Tailwind
- Existing tests in `kit-detail.spec.ts` cover pick list creation without shortfall; new spec section needed
- The `kit.contents` data comes from props, not React Query, so it may be stale if stock changes between dialog open and submission; backend remains source of truth and will reject invalid requests

**Conflicts resolved:**
- The API supports a "reject" action, but the UI requirement excludes it - the cancel button serves this purpose

---

## 1) Intent & Scope

**User intent**

Enhance the pick list creation dialog to guide users through shortfall handling decisions when some parts lack sufficient inventory. The dialog becomes a two-step flow: first collecting requested units, then (conditionally) presenting shortfall parts with resolution options before submission.

**Prompt quotes**

- "two-step dialog flow: step 1 for units entry, step 2 for shortfall handling choices"
- "Calculate shortfall when user clicks 'Continue' from step 1 (parts where requestedUnits * requiredPerUnit > available)"
- "If no shortfall detected, skip step 2 and create pick list directly"
- "For each shortfall part, show radio options: 'Limit' (include only available) and 'Omit' (skip part) - no 'Reject' option"
- "All shortfall parts must have an action selected before submit is enabled (no default selection)"
- "Let backend reject 'omit all' scenario and display error via standard toast mechanism"

**In scope**

- Two-step dialog flow within the existing `KitPickListCreateDialog` component
- Client-side shortfall calculation based on `kit.contents` data
- Shortfall step UI with part details and radio button choices
- Building `shortfall_handling` request payload
- Instrumentation for both steps (form events, list loading events)
- Playwright specs covering happy path, no-shortfall skip, and backend error scenarios

**Out of scope**

- "Reject" action in the UI (cancel button serves this purpose per requirements)
- Bulk "apply to all" actions
- Live recalculation of shortfall as user types units
- Changes to the backend API

**Assumptions / constraints**

- Backend API is already deployed and `shortfall_handling` field is accepted
- Kit detail data (`kit.contents`) is always available when dialog opens
- Backend returns 409 Conflict when all parts would be omitted
- No pagination needed for shortfall parts list (kit BOMs are typically small)

---

## 1a) User Requirements Checklist

**User Requirements Checklist**

- [ ] Implement two-step dialog flow: step 1 for units entry, step 2 for shortfall handling choices
- [ ] Calculate shortfall when user clicks "Continue" from step 1 (parts where requestedUnits * requiredPerUnit > available)
- [ ] If no shortfall detected, skip step 2 and create pick list directly
- [ ] Show each shortfall part with: part key, description, required vs available quantities, shortfall amount
- [ ] For each shortfall part, show radio options: "Limit" (include only available) and "Omit" (skip part) - no "Reject" option
- [ ] All shortfall parts must have an action selected before submit is enabled (no default selection)
- [ ] Build shortfall_handling request payload mapping part keys to chosen actions
- [ ] Let backend reject "omit all" scenario and display error via standard toast mechanism

---

## 2) Affected Areas & File Map

- Area: `src/components/kits/kit-pick-list-create-dialog.tsx`
- Why: Transform single-step dialog into two-step flow with conditional shortfall handling
- Evidence: `kit-pick-list-create-dialog.tsx:45-291` - Current single-step form with units input and submit

- Area: `src/types/kits.ts` (new type additions)
- Why: Add shortfall calculation helper and types for shortfall part rows
- Evidence: `kits.ts:150-159` - Existing `KitContentRow` with `available`, `requiredPerUnit`, `shortfall` fields

- Area: `tests/support/page-objects/kits-page.ts`
- Why: Add locators for shortfall step UI elements (radio buttons, continue button, shortfall rows)
- Evidence: `kits-page.ts:119-123` - Existing pick list dialog locators

- Area: `tests/e2e/kits/kit-detail.spec.ts`
- Why: Add new test scenarios for shortfall handling flow
- Evidence: `kit-detail.spec.ts:739-916` - Existing pick list creation test

- Area: `tests/api/factories/kit-factory.ts`
- Why: Extend `createPickList` to support `shortfall_handling` parameter
- Evidence: `kit-factory.ts:191-205` - Existing `createPickList` method without shortfall support

---

## 3) Data Model / Contracts

- Entity / contract: `ShortfallPartRow` (new local type)
- Shape:
  ```typescript
  interface ShortfallPartRow {
    partKey: string;
    partDescription: string;
    requiredQuantity: number;  // requestedUnits * requiredPerUnit
    availableQuantity: number;
    shortfallAmount: number;   // requiredQuantity - availableQuantity
    selectedAction: 'limit' | 'omit' | null;
  }
  ```
- Mapping: Derived from `KitContentRow` during shortfall calculation
- Evidence: `kits.ts:150-163` - Source `KitContentRow` type

- Entity / contract: `KitPickListCreateSchema_b247181` (existing generated type)
- Shape:
  ```typescript
  {
    requested_units: number;
    shortfall_handling?: {
      [partKey: string]: { action: 'limit' | 'omit' | 'reject' }
    } | null;  // Optional field with @default null - backend handles missing field
  }
  ```
- Mapping: UI maps selected actions to this payload format before mutation; omits field entirely when no shortfall parts exist (backend applies default)
- Evidence: `types.ts:3351-3374` - Generated schema definition with `@default null` annotation

- Entity / contract: `KitPickListSnapshot` (extended instrumentation type)
- Shape:
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
- Mapping: Extended from existing snapshot to include shortfall metadata for Playwright assertions
- Evidence: `kit-pick-list-create-dialog.tsx:31-36` - Existing snapshot type to extend

- Entity / contract: Dialog step state
- Shape:
  ```typescript
  type DialogStep = 'units' | 'shortfall';
  ```
- Mapping: Controls which step content renders in the dialog
- Evidence: New state introduced in dialog component

---

## 4) API / Integration Surface

- Surface: `POST /api/kits/{kit_id}/pick-lists` via `usePostKitsPickListsByKitId`
- Inputs: `{ requested_units: number, shortfall_handling: { [partKey]: { action } } | null }`
- Outputs: `KitPickListDetailSchema_b247181` on success; 409 Conflict if all parts omitted
- Errors: Standard toast via `showException`; 409 displays backend error message
- Evidence: `hooks.ts:1189-1199` - Generated mutation hook

- Surface: Cache invalidation
- Inputs: Mutation success callback
- Outputs: Invalidates kit detail and pick list queries (existing behavior)
- Errors: N/A
- Evidence: `hooks.ts:1199` - `onSuccess` in generated hook

---

## 5) Algorithms & UI Flows

- Flow: Two-step pick list creation
- Steps:
  1. User opens dialog; `DialogStep = 'units'` renders units input and "Continue" button
  2. User enters requested units and clicks "Continue"
  3. Frontend calculates shortfall parts: filter `kit.contents` where `requestedUnits * requiredPerUnit > available`
  4. If no shortfall parts: skip to step 7 (direct submission)
  5. If shortfall parts exist: transition to `DialogStep = 'shortfall'`; render shortfall table with radio buttons
  6. User selects action for each part; "Create Pick List" button becomes enabled when all parts have selections
  7. User clicks submit; build `shortfall_handling` payload from selections
  8. Call mutation with `{ requested_units, shortfall_handling }`
  9. On success: close dialog, show toast, trigger cache invalidation
  10. On 409 error: display error message via toast, remain on shortfall step
- States / transitions: `units` -> (calculate) -> `shortfall` | `submit`; `shortfall` -> `submit`
- Hotspots: Shortfall calculation is synchronous and runs on button click, not on every keystroke
- Evidence: `kit-pick-list-create-dialog.tsx:68-123` - Current submission flow to extend

- Flow: Shortfall calculation
- Steps:
  1. Get `requestedUnits` from form state
  2. For each `content` in `kit.contents`:
     - Calculate `requiredQuantity = requestedUnits * content.requiredPerUnit`
     - If `requiredQuantity > content.available`: add to shortfall list
  3. Return array of `ShortfallPartRow` sorted by shortfall amount descending
- States / transitions: Pure function, no state
- Hotspots: None - kit contents are typically < 50 rows
- Evidence: `kits.ts:196-265` - Similar pattern in `buildKitShoppingListPreview`

---

## 6) Derived State & Invariants

- Derived value: `shortfallParts`
  - Source: Computed from `kit.contents` and `requestedUnits` when user clicks "Continue"
  - Writes / cleanup: Stored in component state; cleared when dialog closes
  - Guards: Only computed when `requestedUnits` is valid (> 0)
  - Invariant: Must reflect the units value at calculation time, not current input value
  - Evidence: `kit-pick-list-create-dialog.tsx:63-67` - Form state management

- Derived value: `allActionsSelected`
  - Source: Derived from `shortfallParts` checking that every row has non-null `selectedAction`
  - Writes / cleanup: Controls submit button disabled state
  - Guards: Returns `false` if `shortfallParts` is empty (should not happen on shortfall step)
  - Invariant: Must accurately reflect selection state for submit button enablement
  - Evidence: New derived state in dialog component

- Derived value: `shortfallHandlingPayload`
  - Source: Built from `shortfallParts` with selected actions
  - Writes / cleanup: Used only at submission time, not stored
  - Guards: Only included in request when there are shortfall parts
  - Invariant: Must map part keys correctly to API schema format `{ action: 'limit' | 'omit' }`
  - Evidence: `types.ts:3371-3373` - API schema for payload

---

## 7) State Consistency & Async Coordination

- Source of truth: `kit` prop provides contents; `shortfallParts` state holds calculated rows with selections
- Coordination: Shortfall step UI reads from `shortfallParts` state; selections update individual row entries
- Async safeguards: Mutation `isPending` prevents double submission; dialog cannot close during mutation
- Instrumentation:
  - `form` event with `phase: 'submit'` emitted at submission start
  - `form` event with `phase: 'success'` or `phase: 'error'` emitted on completion
  - `list_loading` event with `scope: 'kits.detail.pickLists.create'` for deterministic waits
- Evidence: `kit-pick-list-create-dialog.tsx:52-53,156-179` - Existing instrumentation hooks

---

## 8) Errors & Edge Cases

- Failure: User enters 0 or negative units
- Surface: Units input validation on step 1
- Handling: Show inline validation error; prevent transition to step 2
- Guardrails: Existing `validateRequestedUnits` function
- Evidence: `kit-pick-list-create-dialog.tsx:309-325` - Existing validation

- Failure: All shortfall parts marked as "Omit"
- Surface: Backend returns 409 Conflict
- Handling: Display error via `showException` toast; remain on shortfall step
- Guardrails: No frontend prevention per requirements
- Evidence: Change brief: "Let backend reject 'omit all' scenario and display error via standard toast mechanism"

- Failure: Network error during submission
- Surface: Mutation error handler
- Handling: Display generic error toast via `showException`
- Guardrails: Mutation `isPending` prevents re-submission attempts
- Evidence: `kit-pick-list-create-dialog.tsx:109-121` - Existing error handling

- Failure: No kit contents exist
- Surface: Dialog should not open or should show empty state
- Handling: This is an edge case - kits typically have contents before pick list creation
- Guardrails: Existing UI likely prevents opening dialog for empty kits
- Evidence: Out of scope - existing behavior preserved

---

## 9) Observability / Instrumentation

- Signal: `form` event (`KitPickList:create`)
- Type: instrumentation event
- Trigger: On form open, submit, success, error, validation_error
- Labels / fields: `{ kitId, requestedUnits, pickListId (on success), hasShortfall, shortfallCount }`
- Consumer: Playwright `waitTestEvent` helper
- Evidence: `kit-pick-list-create-dialog.tsx:25,81-103` - Existing form instrumentation

- Signal: `list_loading` event (`kits.detail.pickLists.create`)
- Type: instrumentation event
- Trigger: On mutation loading/ready/error states
- Labels / fields: `{ kitId, requestedUnits, pickListId, status }`
- Consumer: Playwright `waitForListLoading` helper
- Evidence: `kit-pick-list-create-dialog.tsx:156-179` - Existing list loading instrumentation

- Signal: `data-testid` attributes for shortfall step
- Type: test selectors
- Trigger: Static attributes on rendered elements
- Labels / fields:
  - `kits.detail.pick-list.create.step.units`
  - `kits.detail.pick-list.create.step.shortfall`
  - `kits.detail.pick-list.create.shortfall.row.{partKey}`
  - `kits.detail.pick-list.create.shortfall.row.{partKey}.limit`
  - `kits.detail.pick-list.create.shortfall.row.{partKey}.omit`
  - `kits.detail.pick-list.create.continue`
  - `kits.detail.pick-list.create.back`
- Consumer: Playwright page object locators
- Evidence: `kits-page.ts:119-123` - Existing dialog locator pattern

---

## 10) Lifecycle & Background Work

- Hook / effect: Reset state when dialog opens
- Trigger cadence: On `open` prop change to `true`
- Responsibilities: Clear `shortfallParts` state (`setShortfallParts([])`), reset `currentStep` to 'units' (`setCurrentStep('units')`), reset form values, clear any selection state
- Cleanup: Existing effect handles cleanup; must be extended to include new state variables
- Evidence: `kit-pick-list-create-dialog.tsx:145-154` - Existing reset effect to extend

- Hook / effect: Shortfall calculation effect (not used - calculation is synchronous)
- Trigger cadence: N/A - calculation happens on button click, not in effect
- Responsibilities: N/A
- Cleanup: N/A
- Evidence: Design decision to avoid live recalculation complexity

---

## 11) Security & Permissions

Not applicable - this feature operates within existing kit permissions; no new authorization concerns.

---

## 12) UX / UI Impact

- Entry point: Kit detail page -> Pick Lists panel -> "Add" button
- Change: Dialog now potentially has two steps instead of one
- User interaction:
  1. Step 1 unchanged: enter requested units
  2. Button changes from "Create Pick List" to "Continue" when proceeding to step 2
  3. Step 2 (new): review shortfall parts, select actions via radio buttons
  4. "Create Pick List" button disabled until all selections made
  5. "Back" button on step 2 returns to step 1 (preserves units input)
- Dependencies: Relies on `kit.contents` being populated; existing dialog styling components
- Evidence: `kit-pick-list-create-dialog.tsx:220-291` - Current dialog structure

- Entry point: Shortfall step layout
- Change: New table showing shortfall parts with radio button columns
- User interaction:
  - Part key and description displayed for identification
  - "Required" and "Available" columns show quantities
  - "Shortfall" column shows deficit
  - Radio buttons for "Limit" and "Omit" per row, no default selection
- Dependencies: None beyond existing UI components
- Evidence: `kit-bom-row-editor.tsx` - Similar tabular layout pattern in kit detail

---

## 13) Deterministic Test Plan

- Surface: Pick list creation with shortfall handling
- Scenarios:
  - Given a kit with parts where stock is insufficient for requested units, When user enters units and clicks Continue, Then shortfall step displays with affected parts listed
  - Given shortfall step is displayed, When user selects "Limit" for all parts, Then submit button becomes enabled and pick list is created with limited quantities
  - Given shortfall step is displayed, When user selects "Omit" for all parts, Then backend returns error and toast displays error message (pattern: `/cannot.*omit|insufficient/i`)
  - Given shortfall step is displayed, When user clicks Back, Then units step is shown with previously entered value preserved
  - Given a kit with sufficient stock for requested units, When user enters units and clicks Continue, Then pick list is created directly (step 2 skipped)
- Instrumentation / hooks:
  - `waitTestEvent(page, 'form', evt => evt.formId === 'KitPickList:create' && evt.phase === 'submit')`
  - `waitTestEvent(page, 'form', evt => evt.formId === 'KitPickList:create' && evt.phase === 'success')`
  - `waitTestEvent(page, 'form', evt => evt.formId === 'KitPickList:create' && evt.phase === 'error')` (for 409 scenario)
  - `waitForListLoading(page, 'kits.detail.pickLists.create', 'ready')`
  - `page.getByTestId('kits.detail.pick-list.create.shortfall.row.{partKey}.limit')`
  - `page.getByTestId('kits.detail.pick-list.create.continue')`
  - `page.getByTestId('kits.detail.pick-list.create.back')`
  - `expectConsoleError(page, /409|conflict/i)` (for 409 scenario)
- Test data setup (deterministic shortfall):
  - Create part with `testData.parts.create()`
  - Add stock: `apiClient.POST('/api/inventory/parts/{part_key}/stock', { body: { box_no, loc_no: 1, qty: 15 } })`
  - Create kit with `testData.kits.create({ overrides: { build_target: 5 } })`
  - Add content: `testData.kits.addContent(kit.id, { partId, requiredPerUnit: 10 })`
  - Request 2 units: `10 * 2 = 20 required > 15 available` triggers shortfall
- Gaps: None - all scenarios from requirements covered
- Evidence: `kit-detail.spec.ts:739-916` - Existing pattern for pick list creation tests

- Surface: Shortfall row display
- Scenarios:
  - Given shortfall step is displayed, When viewing a shortfall row, Then part key, description, required quantity, available quantity, and shortfall amount are visible
  - Given shortfall step is displayed, When no action is selected for a part, Then submit button is disabled
- Instrumentation / hooks:
  - `kits.detailCreatePickListShortfallRow(partKey)` page object method
  - `expect(submitButton).toBeDisabled()` assertion
- Gaps: None
- Evidence: `kits-page.ts:121-123` - Existing submit button locator

---

## 14) Implementation Slices

- Slice: Add shortfall calculation utility
- Goal: Pure function to compute shortfall parts from kit contents and requested units
- Touches: `src/types/kits.ts`
- Dependencies: None

- Slice: Update dialog component with two-step state
- Goal: Introduce `currentStep` state and conditional rendering for units vs shortfall steps
- Touches: `src/components/kits/kit-pick-list-create-dialog.tsx`
- Dependencies: Shortfall calculation utility

- Slice: Implement shortfall step UI
- Goal: Render shortfall parts table with radio buttons and selection state
- Touches: `src/components/kits/kit-pick-list-create-dialog.tsx`
- Dependencies: Two-step state management

- Slice: Wire up submission with shortfall_handling payload
- Goal: Build and send `shortfall_handling` payload when shortfall parts exist
- Touches: `src/components/kits/kit-pick-list-create-dialog.tsx`
- Dependencies: Shortfall step UI with selection state

- Slice: Add instrumentation for shortfall flow
- Goal: Emit appropriate form events and update test IDs for Playwright
- Touches: `src/components/kits/kit-pick-list-create-dialog.tsx`
- Dependencies: Core functionality complete

- Slice: Update page object and factory
- Goal: Add locators for shortfall UI (including back button, continue button, shortfall rows, radio buttons) and extend `createPickList` factory method to support `shortfallHandling` parameter
- Touches: `tests/support/page-objects/kits-page.ts`, `tests/api/factories/kit-factory.ts`
- Dependencies: Component instrumentation complete
- New page object methods:
  - `detailCreatePickListContinue` - Continue button locator
  - `detailCreatePickListBack` - Back button locator
  - `detailCreatePickListStep(step: 'units' | 'shortfall')` - Step container locator
  - `detailCreatePickListShortfallRow(partKey: string)` - Row locator by part key
  - `detailCreatePickListShortfallRadio(partKey: string, action: 'limit' | 'omit')` - Radio button locator

- Slice: Write Playwright specs
- Goal: Cover all shortfall handling scenarios with deterministic tests
- Touches: `tests/e2e/kits/kit-detail.spec.ts`
- Dependencies: Page object and factory updates

---

## 15) Risks & Open Questions

- Risk: Radio button styling may not match existing form aesthetics
- Impact: Inconsistent UI appearance
- Mitigation: Style radio inputs with Tailwind using existing form color tokens; use `sr-only` labels with visible custom styling if needed

- Risk: Large BOM with many shortfall parts could crowd the dialog
- Impact: Poor UX for edge cases
- Mitigation: Add max-height with scroll on shortfall list; typical kits have < 50 parts so this is low risk

- Risk: Backend 409 error message format may not be user-friendly
- Impact: Confusing error display
- Mitigation: Backend already provides descriptive error messages; existing `showException` handles display

- Risk: Stale `kit.contents` data if stock changes between dialog open and submission
- Impact: Shortfall calculation may not match actual stock; backend may reject or produce unexpected results
- Mitigation: Accept as inherent to optimistic UI pattern used throughout the app; backend is source of truth and will reject invalid requests with appropriate error messages; no frontend guard needed

All questions resolved autonomously per directive:
- No "Reject" option per requirements - cancel button serves this purpose
- No live recalculation per requirements - calculation happens on "Continue" click only
- No bulk actions per requirements - each part requires individual selection
- Back button preserves units input - existing form state management handles this naturally

---

## 16) Confidence

Confidence: High - The backend API is already deployed with regenerated types (optional `shortfall_handling` field with server-side default), the existing dialog structure is straightforward to extend, and similar two-step/conditional patterns exist in other dialogs (e.g., AI cleanup dialog). The shortfall calculation reuses existing `KitContentRow` data that is already available. Test infrastructure changes are incremental extensions to existing patterns.
