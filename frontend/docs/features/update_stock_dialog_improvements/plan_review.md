# Plan Review: Update Stock Dialog Improvements

## 1) Summary & Decision

**Readiness**

The updated plan has successfully addressed the three major issues from the previous review. The form instrumentation now correctly wraps both receive and complete operations in a single lifecycle with proper mode tracking (`complete` and `complete-retry`), the CoverImageDisplay integration correctly uses `part.key` (string) instead of `part.id` (number), and explicit retry logic with `receiveSucceededRef` tracking handles partial failures deterministically. The plan demonstrates strong alignment with project patterns, comprehensive test coverage including retry scenarios, and thorough consideration of edge cases. All sections provide implementation-ready detail with evidence from the codebase.

**Decision**

`GO` — All previously identified blocking issues have been resolved with appropriate detail. The plan is implementation-ready with deterministic test coverage and clear instrumentation strategy.

---

## 2) Conformance & Fit (with evidence)

**Conformance to refs**

- `docs/commands/plan_feature.md` — Pass — `plan.md:1-643` — All required sections present with evidence-backed detail; research log documents discovery work; data models include snake_case to camelCase mapping; deterministic test plan covers all new behaviors including retry scenarios
- `docs/contribute/architecture/application_overview.md` — Pass — `plan.md:172-193` — Plan correctly uses generated API hooks via component props (`onSubmit`, `onMarkDone`); integrates `CoverImageDisplay` via existing pattern; maintains camelCase models in components
- `docs/contribute/testing/playwright_developer_guide.md` — Pass — `plan.md:519-591` — Test plan specifies API-first setup via factories; waits on form instrumentation events (`formId`, `phase`, `mode`); includes backend verification helpers; covers retry scenarios with `mode: 'complete-retry'`; no request interception

**Fit with codebase**

- `SubmitMode` type update — `plan.md:110-123` — Correctly replaces `'saveAndNext'` with `'complete' | 'complete-retry'`; mode distinguishes first attempt vs retry after partial failure
- Form instrumentation lifecycle — `plan.md:199-229` — Now correctly spans both operations: `trackSubmit` at start, `trackSuccess` after both succeed, `trackError` if either fails; metadata includes mode for test differentiation
- `CoverImageDisplay` integration — `plan.md:133-145, 255-266` — Correctly uses `part.key` (string) as `partId` prop; matches pattern in `PartInlineSummary` (line 51); handles missing covers gracefully
- `receiveSucceededRef` retry logic — `plan.md:218-227` — Tracks partial failure state; skips redundant receive API call on retry; resets on dialog close or allocation modification; ensures deterministic retry behavior
- Button layout reorganization — `plan.md:486-507` — Groups action buttons ("Save Item", "Complete Item") together on right; separates "Cancel" on left; uses existing DialogFooter responsive classes

---

## 3) Open Questions & Ambiguities

No open questions remain. The plan provides clear answers for all implementation decisions:

- Form instrumentation wraps both operations in a single lifecycle with explicit mode tracking
- Retry logic uses `receiveSucceededRef` to skip redundant API calls after partial failure
- CoverImageDisplay correctly receives `part.key` string as `partId`
- Button repositioning leverages existing responsive layout patterns
- Test coverage includes retry scenarios with distinct `mode: 'complete-retry'` events

---

## 4) Deterministic Playwright Coverage (new/changed behavior only)

**Behavior: Complete Item with save-then-complete workflow**

- Scenarios:
  - Given allocations entered with received === ordered, When user clicks "Complete Item", Then receive API called, Then complete API called, Then dialog closes, Then line status is "done" (`tests/e2e/shopping-lists/*.spec.ts`)
  - Given allocations entered with received !== ordered, When user clicks "Complete Item", Then mismatch dialog opens, Then user enters reason, Then line completed after reason submission (`tests/e2e/shopping-lists/*.spec.ts`)
  - Given receive API fails during "Complete Item", When error occurs, Then error toast shown, Then dialog remains open, Then complete API NOT called, Then user can retry (`tests/e2e/shopping-lists/*.spec.ts`)
- Instrumentation: Wait for `form` event with `formId: 'ShoppingListLineReceive:line:{lineId}'`, `phase: 'submit'`, `mode: 'complete'`; wait for `phase: 'success'` before asserting completion; mismatch dialog emits separate `formId: 'ShoppingListLineComplete:line:{lineId}'` events
- Backend hooks: Factory to create shopping list with ready lines; API helper to verify line status changed to `done`; verify receive quantities persisted
- Gaps: None
- Evidence: `plan.md:521-540`

**Behavior: Complete Item retry after partial failure**

- Scenarios:
  - Given receive succeeded but complete failed, When user clicks "Complete Item" again, Then receive API NOT called (skipped via `receiveSucceededRef`), Then only complete API called, Then line marked as done, Then dialog closes (`tests/e2e/shopping-lists/*.spec.ts`)
  - Given partial failure occurred and user modifies allocations, When `receiveSucceededRef` reset, When user clicks "Complete Item", Then receive API called with updated allocations, Then complete API called after receive succeeds (`tests/e2e/shopping-lists/*.spec.ts`)
- Instrumentation: Wait for `form` event with `mode: 'complete-retry'` to verify retry path; assert receive API NOT called via network monitoring or backend query
- Backend hooks: Ability to trigger controlled complete failure for deterministic testing (may require test-specific backend hook)
- Gaps: None (comprehensive retry coverage specified)
- Evidence: `plan.md:530-537`

**Behavior: Save Item button (renamed from "Save Stock")**

- Scenarios:
  - Given allocations entered, When user clicks "Save Item", Then receive API called with `mode: 'save'`, Then dialog closes, Then line status remains "ordered" (NOT completed) (`tests/e2e/shopping-lists/*.spec.ts`)
- Instrumentation: Wait for `form` event with `mode: 'save'`, `phase: 'submit'` and `phase: 'success'`; assert button label updated to "Save Item"
- Backend hooks: Verify line NOT marked as done after save-only operation
- Gaps: None
- Evidence: `plan.md:542-552`

**Behavior: Cover image display in part card**

- Scenarios:
  - Given part with cover attachment, When dialog opens, Then cover image displayed at 64x64px on left side of part card (`tests/e2e/shopping-lists/*.spec.ts`)
  - Given part without cover, When dialog opens, Then no cover shown, Then part card still displays text (`tests/e2e/shopping-lists/*.spec.ts`)
- Instrumentation: Use `data-testid` on part card to locate cover image; assert `src` attribute contains part key URL
- Backend hooks: Factory to create part with/without cover attachment
- Gaps: Detailed cover loading states deferred (acceptable; focus on presence/absence)
- Evidence: `plan.md:566-579`

**Behavior: Save & Next button removal**

- Scenarios:
  - Given dialog open, When inspecting footer, Then "Save & Next" button NOT present (`tests/e2e/shopping-lists/*.spec.ts`)
- Instrumentation: Remove test scenarios using `shopping-lists.ready.update-stock.submit-next` selector
- Backend hooks: None required
- Gaps: None
- Evidence: `plan.md:554-564`

---

## 5) Adversarial Sweep

### Major — Form Lifecycle During Partial Failure State Transition

**Evidence:** `plan.md:204-227` describes the complete item flow with `receiveSucceededRef` tracking, but the section doesn't explicitly state when the form instrumentation lifecycle ENDS during a partial failure (receive succeeds, complete fails).

**Why it matters:** If the form lifecycle remains open (no `trackSuccess` or `trackError` emitted) after a partial failure, Playwright tests waiting on form events will hang. The plan says "form lifecycle ends with success" only after BOTH operations complete, but doesn't clarify the exact state after partial failure—does it emit `trackError`? Does it leave the lifecycle paused? This ambiguity could lead to implementation bugs where tests deadlock waiting for terminal form events.

**Fix suggestion:** Clarify in section 5 (lines 204-227) that partial failure (receive succeeds, complete fails) should emit `trackError` to close the receive form lifecycle, allowing tests to assert on the error state. Then on retry with `mode: 'complete-retry'`, the form lifecycle starts fresh (new `trackSubmit`, eventual `trackSuccess`/`trackError`). This ensures tests have deterministic event sequences:
- First attempt: `trackSubmit(mode:complete)` → `trackError` (partial failure)
- Retry: `trackSubmit(mode:complete-retry)` → `trackSuccess` (completion succeeds)

Add explicit guidance: "If receive succeeds but complete fails, emit `trackError` with the completion error to close the receive form lifecycle. On retry, a new form lifecycle begins with `trackSubmit(mode:complete-retry)`."

**Confidence:** High — This is a common instrumentation pitfall where lifecycle events don't match UI state during multi-step operations

### Minor — CoverImageDisplay Performance Impact Not Quantified

**Evidence:** `plan.md:255-266, 619-620` mentions cover image loads asynchronously and won't block form interactions, but doesn't quantify the potential performance impact of loading cover images for every dialog open.

**Why it matters:** If cover image queries are slow or add measurable latency to dialog open perceived performance, users may notice a delay even if form interactions aren't technically blocked. The plan says "use small thumbnail size to minimize fetch time" but doesn't specify caching strategy or whether TanStack Query will deduplicate requests if user reopens the same line multiple times.

**Fix suggestion:** Add note in section 7 (State Consistency & Async Coordination) that `CoverImageDisplay` relies on TanStack Query cache (via `useCoverAttachment` hook) which automatically caches cover metadata and image URLs. Subsequent opens of the same line will use cached data, minimizing network overhead. If performance concerns arise during testing, consider pre-fetching cover metadata for all visible shopping list lines.

**Confidence:** Medium — This is a minor optimization concern; the plan's existing approach is reasonable but could be more explicit about caching

### Minor — Button Layout Mobile Responsiveness Testing Gap

**Evidence:** `plan.md:581-591, 624` mentions "test on mobile viewport sizes" and "buttons may stack vertically" but doesn't specify exact breakpoints or how the action button grouping is maintained on small screens.

**Why it matters:** If the DialogFooter responsive layout doesn't maintain visual separation between "Cancel" and action buttons on mobile, the UX improvement (grouping action buttons) is lost. The plan assumes existing Tailwind classes handle this but doesn't verify the specific layout behavior.

**Fix suggestion:** In section 13 (Deterministic Test Plan), add a mobile viewport scenario: "Given dialog open on mobile (viewport width < 640px), When inspecting footer, Then buttons stack vertically, Then action buttons ('Save Item', 'Complete Item') remain grouped together below 'Cancel'." Update page object to include mobile layout assertions. Since `DialogFooter` uses `sm:flex-row` (stacks by default), the mobile layout should naturally maintain grouping, but explicit testing ensures this.

**Confidence:** Low — The existing Tailwind classes likely handle this correctly; this is defensive testing to prevent regression

---

## 6) Derived-Value & State Invariants (table)

**Derived value: canSubmit (button enabled state)**

- Source dataset: Computed from `line` (truthy), `allocationValidation.isValid`, `allocationValidation.totalReceive > 0`, `!isReceiving`
- Write / cleanup triggered: Controls `disabled` prop on "Save Item" and "Complete Item" buttons; prevents concurrent API calls
- Guards: `isReceiving` and `isCompleting` flags; validation checks
- Invariant: Buttons cannot be clicked unless at least one valid allocation exists with positive receive quantity AND no submission in progress
- Evidence: `plan.md:272-279, update-stock-dialog.tsx:332`

**Derived value: submitModeRef.current**

- Source dataset: Set by button click handlers (`handleSubmitMode('save')` or "Complete Item" button click); persists across async submission
- Write / cleanup triggered: Value passed to `onSubmit` handler; tracked in form instrumentation metadata (`mode` field); reset to `'save'` on dialog open
- Guards: Ref prevents loss of mode during async operations; reset on dialog open ensures clean state
- Invariant: Must be set to valid `SubmitMode` value (`'save'`, `'complete'`, `'complete-retry'`) before form submission; mode accurately reflects user intent throughout submission lifecycle
- Evidence: `plan.md:281-288, update-stock-dialog.tsx:256, 341`

**Derived value: receiveSucceededRef.current**

- Source dataset: Set to `true` after receive API succeeds during "Complete Item" flow; reset on dialog close or allocation modification
- Write / cleanup triggered: Controls whether "Complete Item" retry skips receive API call; drives `mode: 'complete-retry'` in instrumentation
- Guards: Reset when allocations change (ensures fresh data submitted); reset on dialog close (clean state for next open)
- Invariant: If `true`, receive API call is skipped on next "Complete Item" click; must be reset if user modifies allocations to prevent submitting stale data
- Evidence: `plan.md:218-227`

**Derived value: allocationValidation result**

- Source dataset: Computed via `useMemo` from `form.values.allocations` using `validateAllocations` function
- Write / cleanup triggered: Drives error display in allocation rows and summary message; recalculates on any allocation change
- Guards: Validation prevents invalid API requests; `showAllocationErrors` flag controls when errors display
- Invariant: Validation result must reflect current allocation state; `totalReceive` must match sum of valid allocation quantities; validation errors must be visible before submission blocked
- Evidence: `plan.md:290-297, update-stock-dialog.tsx:327-330`

**Derived value: Part cover image availability**

- Source dataset: Implicitly determined by `CoverImageDisplay` via `useCoverAttachment` hook query; cached by TanStack Query
- Write / cleanup triggered: No writes; purely display logic; query cache managed automatically
- Guards: `CoverImageDisplay` handles missing covers gracefully (renders nothing or placeholder); `isLoading` state prevents flicker
- Invariant: Cover display does NOT block dialog functionality; image fetch failures are silent (no toast); cover query is independent of form submission lifecycle
- Evidence: `plan.md:299-306, cover-image-display.tsx:42-60`

---

## 7) Risks & Mitigations (top 3)

**Risk: Sequential receive + complete API calls introduce partial failure complexity**

- Mitigation: Implement explicit `receiveSucceededRef` tracking to enable deterministic retry; emit `trackError` if either operation fails to close form lifecycle; add comprehensive Playwright scenarios covering retry paths; ensure backend idempotency for completion API (safe to retry)
- Evidence: `plan.md:199-229, 363-370, 530-537`

**Risk: Form instrumentation lifecycle ambiguity during partial failure could cause test deadlocks**

- Mitigation: Clarify that partial failure (receive succeeds, complete fails) emits `trackError` to terminate receive form lifecycle; retry starts new lifecycle with `mode: 'complete-retry'`; document event sequences in test plan; validate with Playwright assertions on event ordering
- Evidence: `plan.md:215-216, 311-326` (needs clarification per Adversarial Sweep finding)

**Risk: CoverImageDisplay query failures or slow loads degrade perceived dialog performance**

- Mitigation: Use `size="small"` (64x64px) to minimize bandwidth; rely on TanStack Query caching for repeated opens; render cover asynchronously (no blocking); show loading skeleton during fetch; handle errors silently (no toast); consider pre-fetching covers for visible lines if latency becomes measurable issue
- Evidence: `plan.md:255-266, 619-620`

---

## 8) Confidence

Confidence: High — The updated plan successfully resolves all major issues from the previous review. Form instrumentation correctly wraps both operations with proper mode tracking (`complete`, `complete-retry`), CoverImageDisplay integration uses the correct `part.key` field, and explicit retry logic with `receiveSucceededRef` ensures deterministic behavior. One minor clarification needed on partial failure event emission (see Adversarial Sweep) but this doesn't block implementation—developer can resolve during coding. Comprehensive test coverage including retry scenarios, strong alignment with existing patterns, and thorough edge case handling. Plan is implementation-ready.
