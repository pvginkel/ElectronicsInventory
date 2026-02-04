# Code Review: Pick List Shortfall Handling

## 1) Summary & Decision

**Readiness**
The implementation faithfully delivers the two-step pick list creation flow described in the plan. The dialog conditionally displays a shortfall step when parts have insufficient stock, allows users to select limit/omit actions per part, and submits the properly-formatted payload to the backend. All plan requirements have corresponding code: validation on units step, shortfall calculation, radio button selection enforcement, back navigation with preserved state, and instrumentation for Playwright. The test suite covers happy path, no-shortfall skip, back button preservation, backend error handling, and multiple shortfall parts with mixed actions.

**Decision**
`GO` - The implementation is complete, well-structured, and matches the plan. Instrumentation is properly wired, tests are comprehensive and follow project patterns, and TypeScript strict mode is satisfied. No blockers or major issues identified.

---

## 2) Conformance to Plan (with evidence)

**Plan alignment**
- `plan.md:79-80` "Implement two-step dialog flow" -> `kit-pick-list-create-dialog.tsx:64,278-282` - `currentStep` state and conditional rendering in `handleSubmit`
- `plan.md:81` "Calculate shortfall when user clicks Continue" -> `kit-pick-list-create-dialog.tsx:194-195` - `calculateShortfallParts` called in `handleContinue`
- `plan.md:82` "If no shortfall detected, skip step 2" -> `kit-pick-list-create-dialog.tsx:197-199` - Direct call to `handleCreatePickList()` when `shortfall.length === 0`
- `plan.md:83` "Show each shortfall part with part key, description, quantities" -> `kit-pick-list-create-dialog.tsx:525-536` - `ShortfallPartRowComponent` renders all required fields
- `plan.md:84` "For each shortfall part, show radio options: Limit and Omit" -> `kit-pick-list-create-dialog.tsx:539-562` - Radio inputs for limit/omit per part
- `plan.md:85` "All shortfall parts must have an action selected before submit is enabled" -> `kit-pick-list-create-dialog.tsx:215,302` - `allActionsSelected` check gates submit button
- `plan.md:86` "Build shortfall_handling request payload" -> `kit-pick-list-create-dialog.tsx:93-106` - `buildShortfallHandlingPayload` function
- `plan.md:87` "Let backend reject omit all scenario" -> `kit-detail.spec.ts:1807-1881` - Test verifies error toast on 409

**Gaps / deviations**
- None identified. All plan commitments are implemented as specified.

---

## 3) Correctness - Findings (ranked)

No blockers or major correctness issues identified. The implementation correctly handles:

- Shortfall calculation using the documented formula (`requestedUnits * requiredPerUnit > available`)
- State isolation between dialog instances (reset on open at lines 234-246)
- Mutation guard preventing double submission (line 110-112)
- Proper payload construction for both shortfall and no-shortfall cases

**Minor - Redundant null check in validation flow**

- Evidence: `kit-pick-list-create-dialog.tsx:189-192` - `parseRequestedUnits` is called after validation has already passed, but there is still a null guard
- Impact: No functional impact; defensive coding
- Fix: None required - this is reasonable defensive programming
- Confidence: Low (not an issue)

---

## 4) Over-Engineering & Refactoring Opportunities

**Observation: Well-decomposed component structure**

The dialog component is broken into `UnitsStep`, `ShortfallStep`, and `ShortfallPartRowComponent` sub-components, which keeps the main component readable. This is appropriate decomposition, not over-engineering.

**Minor hotspot: Callback dependency chain**

- Hotspot: `handleCreatePickList` callback has many dependencies
- Evidence: `kit-pick-list-create-dialog.tsx:176` - 8 dependencies in useCallback
- Suggested refactor: Consider extracting mutation logic into a custom hook if this pattern recurs, but current complexity is acceptable for a single dialog
- Payoff: Marginal; current implementation is clear

---

## 5) Style & Consistency

**Pattern: Consistent with existing dialog patterns**

- Evidence: The implementation follows the same patterns as the existing shopping list dialog (`kit-shopping-list-dialog.tsx`) for form handling, instrumentation, and state management
- Impact: Positive - maintains codebase consistency
- Recommendation: None required

**Pattern: Proper instrumentation extension**

- Evidence: `kit-pick-list-create-dialog.tsx:35-42` - Extended `KitPickListSnapshot` to include `hasShortfall` and `shortfallCount` fields
- Impact: Enables Playwright tests to assert on shortfall metadata
- Recommendation: None required

**Pattern: Test ID naming convention followed**

- Evidence: `kit-pick-list-create-dialog.tsx:368,449,525,547,559` - All new test IDs follow `kits.detail.pick-list.create.*` hierarchy
- Impact: Consistent with existing selector patterns
- Recommendation: None required

---

## 6) Tests & Deterministic Coverage (new/changed behavior only)

**Surface: Pick list creation with shortfall handling**
- Scenarios:
  - Given a kit with parts where stock is insufficient, When user enters units and clicks Continue, Then shortfall step displays (`kit-detail.spec.ts:1535-1649`)
  - Given shortfall step, When user selects Limit for all parts, Then pick list is created with limited quantities (`kit-detail.spec.ts:1615-1648`)
  - Given shortfall step, When user selects Omit for all parts, Then backend returns error and toast displays (`kit-detail.spec.ts:1807-1881`)
  - Given shortfall step, When user clicks Back, Then units step shown with value preserved (`kit-detail.spec.ts:1741-1805`)
  - Given sufficient stock, When user clicks Continue, Then pick list created directly (`kit-detail.spec.ts:1651-1739`)
  - Given multiple shortfall parts, When mixed actions selected, Then pick list created successfully (`kit-detail.spec.ts:1883-1997`)
- Hooks:
  - `waitTestEvent(page, 'form', evt => evt.formId === 'KitPickList:create' && evt.phase === 'success')`
  - `waitForListLoading(page, 'kits.detail.pickLists.create', 'ready')`
  - `expectConsoleError(page, /409|conflict|omit|cannot/i)` for error case
- Gaps: None - all requirements from plan section 13 are covered

**Surface: Page object extensions**
- Evidence: `kits-page.ts:53-56,128-131,379-390` - Added locators for Continue, Back, step containers, and shortfall row/radio methods
- Coverage: All new UI elements have corresponding page object methods

**Surface: Factory extension**
- Evidence: `kit-factory.ts:13,17-19,199-208` - Added `ShortfallAction` type and `shortfallHandling` parameter to `createPickList`
- Coverage: Factory method supports all shortfall handling scenarios

---

## 7) Adversarial Sweep (must attempt >= 3 credible failures or justify none)

**Checks attempted:**

1. **Derived state driving persistent write** - Examined whether `shortfallParts` state could become stale relative to actual stock
   - Evidence: `kit-pick-list-create-dialog.tsx:194-195` - Shortfall calculated from `kit.contents` prop at Continue click
   - Why code held up: This is acknowledged in the plan (`plan.md:459-461`) as an inherent optimistic UI pattern. The backend remains source of truth and will reject invalid requests. No additional guard needed in frontend.

2. **Race window between step transition and submission** - Checked if user could double-click Continue and trigger multiple mutations
   - Evidence: `kit-pick-list-create-dialog.tsx:110-112` - `mutation.isPending` check prevents concurrent submissions
   - Evidence: `kit-pick-list-create-dialog.tsx:197-199` - No shortfall case calls `handleCreatePickList` which has the same guard
   - Why code held up: Mutation pending state blocks re-entry

3. **State cleanup on dialog close** - Verified shortfall state is properly reset
   - Evidence: `kit-pick-list-create-dialog.tsx:241-243,294-295` - Both open effect and close handler reset `currentStep` and `shortfallParts`
   - Why code held up: State is cleared on both open and close transitions

4. **Stale closure in callbacks** - Examined whether callbacks could capture stale state
   - Evidence: `kit-pick-list-create-dialog.tsx:176,205` - Dependencies properly declared in useCallback
   - Why code held up: React hooks rules followed; dependencies correctly specified

5. **Missing cache invalidation** - Verified mutation success triggers appropriate cache updates
   - Evidence: `kit-pick-list-create-dialog.tsx:157` - `onSuccess(response)` callback invoked, which is wired to parent's cache invalidation
   - Why code held up: Existing pattern preserved; parent component handles invalidation

---

## 8) Invariants Checklist (table)

- Invariant: All shortfall parts must have a selected action before submission is allowed
  - Where enforced: `kit-pick-list-create-dialog.tsx:215,302` - `allActionsSelected` computed and checked in `isSubmitDisabled`
  - Failure mode: Submit button could be enabled with incomplete selections
  - Protection: `shortfallParts.every(part => part.selectedAction !== null)` check
  - Evidence: `kit-detail.spec.ts:1612-1621,1966-1974` - Tests verify disabled state until all selections made

- Invariant: Dialog state must be reset when reopened
  - Where enforced: `kit-pick-list-create-dialog.tsx:234-246` - Effect runs when `open` changes to true
  - Failure mode: Previous shortfall selections could persist across dialog openings
  - Protection: Effect resets `currentStep`, `shortfallParts`, and form values
  - Evidence: `kit-pick-list-create-dialog.tsx:241-244` - All state variables reset

- Invariant: Backend receives properly formatted shortfall_handling payload
  - Where enforced: `kit-pick-list-create-dialog.tsx:93-106,141-143` - `buildShortfallHandlingPayload` constructs payload, mutation includes it
  - Failure mode: Malformed payload could cause 400 errors
  - Protection: Payload only includes parts with non-null `selectedAction`; returns `null` when no shortfall
  - Evidence: `kit-detail.spec.ts:1633-1639,1986-1992` - Tests verify `hasShortfall` and `shortfallCount` in success events

---

## 9) Questions / Needs-Info

None - all requirements are clearly specified in the plan and implementation matches.

---

## 10) Risks & Mitigations (top 3)

- Risk: Backend 409 error message may not be user-friendly for "omit all" scenario
  - Mitigation: Test confirms toast displays; backend team should ensure descriptive error messages
  - Evidence: `kit-detail.spec.ts:1875-1876` - Test expects `/cannot|omit|empty/i` pattern

- Risk: Large BOMs with many shortfall parts could crowd the dialog
  - Mitigation: Implemented with `max-h-64 overflow-y-auto` for scrollable table (`kit-pick-list-create-dialog.tsx:457`)
  - Evidence: Plan acknowledges low risk as kits typically have < 50 parts

- Risk: Stale kit contents data if stock changes between dialog open and submission
  - Mitigation: Backend validates and rejects invalid requests; this is documented as accepted optimistic UI pattern
  - Evidence: `plan.md:459-461` - Risk documented and accepted

---

## 11) Confidence

Confidence: High - The implementation fully conforms to the plan, follows established project patterns for dialogs and instrumentation, has comprehensive Playwright coverage, and no correctness issues were identified during adversarial analysis. The code is well-structured with appropriate decomposition and defensive programming.
