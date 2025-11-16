# Code Review — AI Analysis Warning Display

## 1) Summary & Decision

**Readiness**

The implementation correctly differentiates between hard failures (no analysis data) and soft failures (partial results with warning), adds appropriate UI for warning display, and includes comprehensive Playwright test coverage. The routing logic in `useAIPartAnalysis` properly checks for both `analysisFailureReason` and `description` presence before determining error vs. success paths. The warning bar follows established patterns from the duplicate bar, uses the standardized `Alert` component with proper instrumentation, and the new test scenario exercises the full soft-failure flow end-to-end.

**Decision**

`GO` — The implementation is complete, follows project patterns, and satisfies all plan requirements. No blocking issues or missing pieces. Code quality is high with helpful comments explaining the routing logic.

## 2) Conformance to Plan (with evidence)

**Plan alignment**

- Plan section 5 (routing logic) ↔ `src/hooks/use-ai-part-analysis.ts:39-60` — Implementation adds derived values `hasFailureReason` and `hasAnalysisData`, routes to error only when failure reason exists without analysis data, and routes to success (review step) when analysis data is present. Guidepost comment at lines 39-41 clearly explains the hard vs. soft failure distinction.

- Plan section 5 (warning bar display) ↔ `src/components/parts/ai-part-review-step.tsx:212-224` — Warning bar added immediately after heading and before duplicate bar using `Alert` component with `variant="warning"`, `icon={true}`, proper testId `parts.ai.review.warning-bar`, and nested span with testId `parts.ai.review.warning-message` displaying the exact failure reason text.

- Plan section 13 (soft failure test) ↔ `tests/e2e/parts/part-ai-creation.spec.ts:185-259` — New test creates analysis with both `analysis_result` and `analysis_failure_reason`, verifies dialog transitions to review step (not error state), asserts warning bar visibility and exact message text, confirms analysis fields are populated despite warning, and validates that submit button remains enabled.

- Plan section 9 (instrumentation) ↔ `tests/support/page-objects/ai-dialog-page.ts:16-17, 32-33` — Page object adds `warningBar` and `warningMessage` locators following the documented `parts.ai.review.*` naming scheme, mirroring the error message pattern from progress step.

**Gaps / deviations**

None. All plan deliverables are implemented as specified. The warning bar correctly appears above the duplicate bar, the routing logic properly distinguishes the two failure modes, and test coverage validates both scenarios end-to-end.

## 3) Correctness — Findings (ranked)

No correctness issues identified. The implementation correctly handles all edge cases outlined in the plan:

- Empty/whitespace-only failure reasons are filtered by the transformation layer (`src/lib/utils/ai-parts.ts:91`)
- Both warning bar and duplicate bar can coexist (conditional rendering is independent)
- Warning persists for the session (no dismiss logic, derives from analysisResult prop)
- Hard failures route to error state, soft failures route to review step with warning

## 4) Over-Engineering & Refactoring Opportunities

No over-engineering detected. The implementation is appropriately minimal:

- Reuses existing `Alert` component without creating custom warning UI
- Adds no new React state (warning visibility derives from prop presence)
- Introduces only necessary derived values (`hasFailureReason`, `hasAnalysisData`) for routing clarity
- Test follows existing patterns from the hard failure test at lines 133-183

## 5) Style & Consistency

**Pattern: Guidepost comments**

- Evidence: `src/hooks/use-ai-part-analysis.ts:39-41, 56-57` — Helpful comments explain routing logic intent and include both hard/soft failure scenarios
- Impact: Enhances maintainability by documenting the decision logic for future developers
- Recommendation: Excellent adherence to the readability comment guidelines from CLAUDE.md

**Pattern: Test naming and structure**

- Evidence: `tests/e2e/parts/part-ai-creation.spec.ts:185` — Test name clearly describes scenario: "displays warning bar when AI returns partial results with failure reason"
- Impact: Follows existing test naming conventions and provides clear intent
- Recommendation: No changes needed

**Pattern: TestId naming scheme**

- Evidence: `src/components/parts/ai-part-review-step.tsx:217, 220` — Uses `parts.ai.review.warning-bar` and `parts.ai.review.warning-message` following the documented `feature.section.element` pattern
- Impact: Consistent with existing selectors like `parts.ai.review.duplicate-bar` (line 32 of ai-duplicate-bar.tsx)
- Recommendation: No changes needed

## 6) Tests & Deterministic Coverage (new/changed behavior only)

**Surface: AI part creation dialog — soft failure scenario**

**Scenarios:**
- Given AI analysis returns both `analysis_result` and `analysis_failure_reason` (`tests/e2e/parts/part-ai-creation.spec.ts:185-259`)
- When user submits prompt and SSE completes with partial results
- Then dialog transitions to review step (line 246: `await partsAI.waitForReview()`)
- And warning bar is visible (line 250: `await expect(partsAI.warningBar).toBeVisible()`)
- And warning message displays exact failure reason text (line 251: `await expect(partsAI.warningMessage).toHaveText(warningMessage)`)
- And analysis fields are populated (lines 254-260: assertions for description, manufacturer, manufacturer code)
- And user can create part despite warning (line 263: `await expect(partsAI.reviewSubmit).toBeEnabled()`)

**Hooks:**
- Uses existing `aiAnalysisMock` fixture to emit both fields simultaneously in `emitCompleted` call (lines 237-241)
- Leverages new page object locators: `partsAI.warningBar` and `partsAI.warningMessage` (lines 250-251)
- Asserts dialog step attribute: `data-step="review"` (line 249)
- No additional instrumentation events needed beyond existing list loading and form tracking

**Gaps:** None. Test coverage is comprehensive for the soft failure path.

**Evidence:**
- Test spec: `tests/e2e/parts/part-ai-creation.spec.ts:185-259`
- Page object additions: `tests/support/page-objects/ai-dialog-page.ts:16-17, 32-33`
- Routing logic: `src/hooks/use-ai-part-analysis.ts:43-60`
- Warning bar UI: `src/components/parts/ai-part-review-step.tsx:212-224`

---

**Surface: AI part creation dialog — hard failure scenario (existing coverage)**

**Scenarios:**
- Existing test at lines 133-183 already covers hard failure case (only `analysis_failure_reason`, no `analysis_result`)
- Verifies dialog stays on progress step and displays error UI
- No changes needed to existing test; routing logic update maintains backward compatibility

**Hooks:** Existing instrumentation and test expectations remain valid

**Gaps:** None

**Evidence:** `tests/e2e/parts/part-ai-creation.spec.ts:133-183`

## 7) Adversarial Sweep (must attempt ≥3 credible failures or justify none)

**Checks attempted:**

1. **Race condition: SSE result arrives after dialog unmount**
   - Evidence: `src/hooks/use-ai-part-analysis.ts:36-61` — `onResult` callback executes synchronously within SSE handler, and `setIsAnalyzing(false)` is called in both success and error paths before any async operations
   - Why code held up: Dialog state transitions are controlled by `onSuccess`/`onError` callbacks which fire before SSE cleanup. No async gap between result processing and state updates.

2. **State desync: Warning bar rendered when no failure reason present**
   - Evidence: `src/components/parts/ai-part-review-step.tsx:213` — Conditional rendering checks `analysisResult.analysisFailureReason` truthiness. Transformation layer strips empty strings to `undefined` (`src/lib/utils/ai-parts.ts:91`)
   - Why code held up: React conditional (`{analysisResult.analysisFailureReason && ...}`) prevents rendering when field is `undefined` or empty. No risk of empty warning bars.

3. **Routing ambiguity: Both error and success callbacks fire**
   - Evidence: `src/hooks/use-ai-part-analysis.ts:47-60` — Early return at line 53 prevents success callback when routing to error. Only one path executes per `onResult` invocation.
   - Why code held up: Guard condition with early return creates mutually exclusive routing paths. No scenario where both `setError` and `onSuccess` execute.

4. **Cache invalidation: Analysis result persists across retries**
   - Evidence: `src/components/parts/ai-part-dialog.tsx:58-61` — Dialog resets to input step on open, clearing `currentStep` state. Hook's `result` state is managed by SSE and gets replaced on subsequent analysis.
   - Why code held up: Each new analysis triggers fresh SSE connection and replaces previous result. No persistent cache between dialog sessions.

## 8) Invariants Checklist (table)

**Invariant 1: Warning bar visible if and only if user is on review step with non-empty analysisFailureReason**

- Where enforced: `src/components/parts/ai-part-review-step.tsx:213-224` — Conditional render checks `analysisResult.analysisFailureReason` truthiness within review step component
- Failure mode: Warning appears when no failure reason exists (empty bar), or fails to appear when failure reason is present
- Protection: Transformation layer (`src/lib/utils/ai-parts.ts:91`) strips empty/whitespace strings to `undefined`, React conditional prevents rendering falsy values
- Evidence: Test asserts warning bar visibility only after emitting non-empty `analysis_failure_reason` (`tests/e2e/parts/part-ai-creation.spec.ts:250`)

**Invariant 2: Error routing occurs if and only if analysisFailureReason present without description**

- Where enforced: `src/hooks/use-ai-part-analysis.ts:43-53` — Explicit check `hasFailureReason && !hasAnalysisData` guards error path with early return
- Failure mode: Soft failures (partial results) incorrectly route to error state, preventing user from reviewing analysis
- Protection: Boolean flags derived from trimmed failure reason and description presence ensure precise routing logic
- Evidence: Hard failure test verifies error routing (`tests/e2e/parts/part-ai-creation.spec.ts:171-176`), soft failure test verifies review routing (`tests/e2e/parts/part-ai-creation.spec.ts:246-249`)

**Invariant 3: Exactly one of error state or success callback fires per analysis result**

- Where enforced: `src/hooks/use-ai-part-analysis.ts:47-60` — Early return at line 53 after error path prevents success callback execution
- Failure mode: Both error and success handlers execute, causing dialog to transition to review step while also showing error UI
- Protection: Control flow guard (early return) creates mutually exclusive paths; `setIsAnalyzing(false)` called in both branches ensures cleanup happens exactly once
- Evidence: Test suite validates dialog step attribute matches expected state (`data-step="progress"` for errors at line 176, `data-step="review"` for success at line 249)

## 9) Questions / Needs-Info

None. All requirements are clear and implementation is complete.

## 10) Risks & Mitigations (top 3)

**Risk 1: User confusion from non-dismissible warning**

- Mitigation: Plan explicitly documents decision to make warning non-dismissible (section 15). If user feedback indicates friction, dismissible behavior can be added in follow-up iteration. Current implementation ensures visibility for safety-critical information.
- Evidence: Plan section 15, question "Should warning bar be dismissible?"

**Risk 2: Long failure messages overflow warning bar on mobile**

- Mitigation: `Alert` component uses responsive flex layout with wrapping (`src/components/ui/alert.tsx:159`). Text content automatically wraps within container. If testing reveals issues, add `max-h-32 overflow-y-auto` classes.
- Evidence: Plan section 15 acknowledges this risk and suggests mitigation approach

**Risk 3: Backend contract change removes dual-field emission**

- Mitigation: Backend contract is stable per commit 5ca146e. Transformation layer validates at least one of the three fields is present (`src/lib/utils/ai-parts.ts:44-52`), throwing error if contract violated. Integration test on backend side should verify dual-field emission capability.
- Evidence: Plan section 15, third risk item

## 11) Confidence

Confidence: High — Implementation precisely follows the approved plan, reuses existing patterns (Alert component, duplicate bar placement, test structure), introduces no new abstractions, and includes comprehensive test coverage for both failure modes. Routing logic is clear with helpful comments, and all edge cases from the plan are handled correctly.
