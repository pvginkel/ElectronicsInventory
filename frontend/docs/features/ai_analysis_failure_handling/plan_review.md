# Plan Review: AI Analysis Failure Handling

## 1) Summary & Decision

**Readiness**

The plan is implementation-ready. It correctly identifies that the existing progress step error UI already handles errors with retry/back functionality, eliminating the need for a new dedicated error step. The approach reuses existing patterns, provides clear technical detail with line-level evidence, and includes comprehensive test coverage with proper instrumentation. All three major issues from the previous review have been addressed: the validation logic now allows failure-only responses, the transformation correctly extracts the failure reason field, and the hook routing logic properly detects failure reasons and routes to the error callback. The plan demonstrates strong architectural fit and provides sufficient implementation guidance.

**Decision**

`GO` — The plan addresses all previous blockers, follows established patterns, provides clear implementation guidance with file/line evidence, and includes deterministic test coverage. The approach of reusing the existing progress step error UI is architecturally sound and minimizes complexity.

## 2) Conformance & Fit (with evidence)

**Conformance to refs**

- `docs/commands/plan_feature.md` — Pass — `plan.md:3-89` — Research log documents exploration of AI workflow components, hook layer, data transformation, SSE task hook, and testing infrastructure with specific file/line evidence
- `docs/contribute/architecture/application_overview.md` — Pass — `plan.md:80-91, 146-207` — Data model changes follow snake_case to camelCase mapping pattern via custom hooks; type extension in `src/types/ai-parts.ts` aligns with domain-driven organization
- `docs/contribute/testing/playwright_developer_guide.md` — Pass — `plan.md:505-556` — Test plan includes API-first setup via mock helper, deterministic waits on instrumentation (`data-step`, `data-state`, test-event signals), and proper use of page objects; no route interception beyond documented AI analysis SSE gap
- `docs/product_brief.md` — Pass — `plan.md:38-75` — AI helper workflow (Section 9) supports photo intake and analysis; failure handling allows user to refine query, consistent with "approve or edit before saving" pattern

**Fit with codebase**

- `src/hooks/use-ai-part-analysis.ts` — `plan.md:94-106` — Plan correctly identifies onResult callback (lines 36-39) as the decision point; proposed conditional check for `analysisFailureReason` presence aligns with existing error handling pattern via `onError` callback
- `src/lib/utils/ai-parts.ts` — `plan.md:86-91, 391-404` — Validation update at line 44 properly allows failure reason as third valid scenario alongside analysis_result and duplicate_parts; transformation logic addition follows existing snake_case mapping pattern
- `src/components/parts/ai-part-dialog.tsx` — `plan.md:109-112` — Dialog already handles onError by staying on progress step (lines 50-53); plan reuses this without introducing new step routing logic
- `src/components/parts/ai-part-progress-step.tsx` — `plan.md:113-118` — Existing error UI (lines 23-62) already displays error prop content and provides retry button; plan correctly identifies reuse opportunity
- `tests/support/helpers/ai-analysis-mock.ts` — `plan.md:119-131` — Plan extends `AiAnalysisCompletionOverrides` interface (line 49) to support `analysis_failure_reason` in mocked payloads; follows existing pattern for SSE test mocking

## 3) Open Questions & Ambiguities

All open questions from section 15 (lines 594-602) are appropriately scoped as out-of-scope follow-ups:

- Question: Should error UI differentiate between analysis failures vs network/SSE failures?
- Why it matters: Different user actions might be appropriate (retry/refine vs wait/reload)
- Needed answer: Current implementation treats both as errors with retry option. If differentiation needed, can add `data-error-type` attribute in future iteration. This is a reasonable deferral; the unified error UI is sufficient for MVP.

- Question: Should analytics track analysis failure reasons for product insights?
- Why it matters: Understanding common failure patterns could inform AI improvements
- Needed answer: Existing error instrumentation captures failures via `emitComponentError`. Product team can add analytics if needed. This is correctly scoped as out-of-scope; the instrumentation foundation is adequate.

No blocking ambiguities remain.

## 4) Deterministic Playwright Coverage (new/changed behavior only)

- Behavior: AI analysis failure reason display and retry flow
- Scenarios:
  - Given user opens AI dialog and submits a query, When AI analysis returns with `analysis_failure_reason` populated, Then progress step displays error state with failure message (`tests/e2e/parts/part-ai-creation.spec.ts` or new spec)
  - And dialog remains on progress step (does not advance to review)
  - And "Retry Analysis" button is visible
  - When user clicks "Retry Analysis", Then dialog transitions to input step
  - And input field contains original query text
  - When user modifies text and resubmits, Then analysis starts again (progress step shows analyzing state)
- Instrumentation:
  - `data-step="progress"` on dialog during error (line 195 in ai-part-dialog.tsx)
  - `data-state="error"` on progress step container (line 25 in ai-part-progress-step.tsx)
  - `data-testid="parts.ai.progress-error-message"` contains failure reason text (line 43 in ai-part-progress-step.tsx)
  - AI analysis mock helper's `emitCompleted` with `analysis_failure_reason` override (plan lines 218-243)
  - Page object method to assert progress error state (needs addition to ai-dialog-page.ts)
- Gaps: Page object needs helper method to wait for and assert on error state; plan should call this out explicitly in section 2 (Affected Areas)
- Evidence: `plan.md:505-541, tests/support/helpers/ai-analysis-mock.ts:218-243, tests/support/page-objects/ai-dialog-page.ts:20-41`

**Minor gap**: Plan mentions "Page object method to assert progress error state" (line 527) but does not include ai-dialog-page.ts in the Affected Areas section 2. Implementation slice should add this file for completeness.

- Behavior: Success path unchanged (regression coverage)
- Scenarios:
  - Given user submits query, When AI returns with `analysis_result` and no `analysis_failure_reason`, Then progress advances to review (existing behavior preserved)
- Instrumentation: Existing test coverage in `part-ai-creation.spec.ts`
- Gaps: None; covered by existing spec
- Evidence: `plan.md:530-541, tests/e2e/parts/part-ai-creation.spec.ts:6-131`

- Behavior: Validation error handling for result structure
- Scenarios:
  - Given API returns result with `analysis_failure_reason` but no analysis/duplicates, When transformation processes result, Then function returns successfully with `analysisFailureReason` field
  - Given API returns result with neither `analysis_result`, `duplicate_parts`, nor `analysis_failure_reason`, When transformation processes result, Then function throws validation error
- Instrumentation: Unit test assertions (could add to test suite)
- Gaps: Plan suggests unit tests but does not include them in implementation slice or test plan scenarios; this is acceptable as the E2E scenario will exercise the transformation path
- Evidence: `plan.md:543-556, src/lib/utils/ai-parts.ts:44-52`

## 5) Adversarial Sweep

**Minor — Whitespace-only failure reason edge case**

**Evidence:** `plan.md:366-372, 586-589` — Plan mentions trimming in algorithm flow (line 249) and risk mitigation (line 587) but does not show explicit `.trim()` in the proposed hook logic at lines 96-106

**Why it matters:** API could return `analysis_failure_reason: "   "` (whitespace-only), which would pass truthiness check `if (transformedResult.analysisFailureReason)` but display blank error message to user

**Fix suggestion:** Update hook logic proposal at line 98 to include trim check:
```typescript
if (transformedResult.analysisFailureReason?.trim()) {
  options.onError?.(transformedResult.analysisFailureReason);
  setIsAnalyzing(false);
  return;
}
```
This aligns with plan's stated intent at line 249: "Hook checks if `transformedResult.analysisFailureReason?.trim()` is present (truthy after trimming)"

**Confidence:** High

**Minor — Mock helper interface extension incomplete**

**Evidence:** `plan.md:123-129` — Plan states "Extend `AiAnalysisCompletionOverrides` interface (line 49) to include: `analysis_failure_reason?: string | null;`" but the actual mock helper at `ai-analysis-mock.ts:49-54` shows the interface does not yet have this field

**Why it matters:** Without updating the interface, TypeScript will reject passing `analysis_failure_reason` in test overrides, blocking test implementation

**Fix suggestion:** Affected Areas section correctly identifies the change needed. However, the current `emitCompleted` function (lines 218-243) builds the payload from `overrides.analysis`, `overrides.duplicate_parts`, and `overrides.error_message`. To support failure reason, the implementation must either:
1. Add `analysis_failure_reason` to the `AiAnalysisCompletionOverrides` interface and wire it through to the `analysis` payload in `emitCompleted`, OR
2. Add `analysis_failure_reason` as a top-level field in the completion override structure to match the nested API contract where it lives under `analysis.analysis_failure_reason`

The plan should clarify whether `analysis_failure_reason` is a sibling to `analysis_result`/`duplicate_parts` (top-level in the `analysis` object) or a field within `analysis_result`. Based on the OpenAPI reference at line 181 and the transformation logic evidence, it appears to be a sibling. The mock's `emitCompleted` logic at lines 224-231 creates a nested `analysis` object with `analysis_result` and `duplicate_parts`; failure reason should be added at the same level:
```typescript
const analysisResult = {
  analysis_result: analysisPayload,
  duplicate_parts: overrides?.duplicate_parts ?? null,
  analysis_failure_reason: overrides?.analysis_failure_reason ?? null,
};
```

**Confidence:** High

**Minor — Page object missing in implementation slice**

**Evidence:** `plan.md:563-575, 139-143` — Implementation slice does not list `tests/support/page-objects/ai-dialog-page.ts` but Affected Areas section 2 (lines 139-143) identifies it needs a helper to wait for/assert error state; Test Plan section 13 (line 527) references "Page object method to assert progress error state"

**Why it matters:** Without updating the page object, test implementation will rely on ad hoc selectors instead of centralized helpers, reducing maintainability

**Fix suggestion:** Add item 5.5 to the implementation slice:
```
5. tests/support/page-objects/ai-dialog-page.ts — Add `waitForProgressError()` helper method:
   ```typescript
   async waitForProgressError(message?: string | RegExp): Promise<void> {
     await expect(this.progressStep).toHaveAttribute('data-state', 'error');
     const errorMessage = this.page.getByTestId('parts.ai.progress-error-message');
     await expect(errorMessage).toBeVisible();
     if (message) {
       await expect(errorMessage).toContainText(message);
     }
   }
   ```
```
This completes the instrumentation contract mentioned in the test plan.

**Confidence:** Medium — The test could be written without this helper using inline selectors, but adding it aligns with established page object patterns

## 6) Derived-Value & State Invariants (table)

- Derived value: Analysis failure detection
  - Source dataset: `transformedResult.analysisFailureReason` (unfiltered, direct from transformation)
  - Write / cleanup triggered: Calls `onError` callback, sets `isAnalyzing=false`, does NOT call `onSuccess`
  - Guards: Trimmed truthiness check prevents whitespace-only failures (per plan line 249, implementation needed per Finding 1)
  - Invariant: If `analysisFailureReason` is present (truthy after trim), exactly one callback is invoked (`onError`), never both `onError` and `onSuccess`
  - Evidence: `plan.md:290-297, src/hooks/use-ai-part-analysis.ts:36-39`

- Derived value: Query text preservation
  - Source dataset: `lastSearchText` state from user input (unfiltered, captured on submit)
  - Write / cleanup triggered: Set on `handleInputSubmit`, cleared on dialog close, preserved through error states
  - Guards: Must not clear on error/retry transitions (only on close)
  - Invariant: Text remains available for retry flow until dialog closes; enables prefilling input step on retry
  - Evidence: `plan.md:299-306, src/components/parts/ai-part-dialog.tsx:23, 67-71, 60-65`

- Derived value: Step routing logic
  - Source dataset: Analysis result structure (hasAnalysis, hasDuplicates, hasFailure derived from transformed result)
  - Write / cleanup triggered: `onSuccess` sets `currentStep` to review/duplicates, `onError` keeps `currentStep='progress'`
  - Guards: Failure reason takes precedence; if present, stay on progress regardless of other fields
  - Invariant: Never route to review/duplicates when `analysisFailureReason` present; always stay on progress to show error via existing error UI
  - Evidence: `plan.md:308-316, src/components/parts/ai-part-dialog.tsx:34-54`

No filtered views drive persistent writes. All derived values are properly guarded.

## 7) Risks & Mitigations (top 3)

- Risk: Failure reason message might be too technical for end users
  - Mitigation: Accept backend message as-is per plan; if problematic in practice, request backend to provide user-friendly messages. Backend owns message content; frontend displays verbatim.
  - Evidence: `plan.md:580-584`

- Risk: Validation logic might reject valid failure-only results (addressed in current revision)
  - Mitigation: Validation updated from `if (!result.analysis_result && !result.duplicate_parts)` to include `&& !result.analysis_failure_reason` check, allowing failure reason as valid third scenario
  - Evidence: `plan.md:390-404, src/lib/utils/ai-parts.ts:44-52`

- Risk: Whitespace-only failure reason could show confusing blank error (partially addressed)
  - Mitigation: Plan states trim check at line 249 but proposed implementation at lines 96-106 does not include `.trim()`; see Finding 1 for fix
  - Evidence: `plan.md:586-589`

All risks have mitigations; implementation should apply trim check as stated in algorithm flow.

## 8) Confidence

Confidence: High — The plan addresses all previous review blockers (validation, transformation, routing), reuses existing error UI to minimize new code, provides clear file/line evidence for all changes, includes comprehensive test coverage with proper instrumentation, and demonstrates strong fit with established patterns. Minor findings are straightforward to address during implementation (add `.trim()` check, extend mock interface, add page object helper). The architectural decision to reuse the progress step error UI rather than create a new step is sound and simplifies implementation.

---

## Review Notes

This is the second review of this plan. The previous review identified three major issues:

1. **Validation logic would reject failure-only responses** — RESOLVED. Plan now updates validation at `src/lib/utils/ai-parts.ts:44` to allow `analysis_failure_reason` as valid scenario (lines 391-404).

2. **Transformation logic did not extract failure reason** — RESOLVED. Plan adds `analysisFailureReason` field to `TransformedAIPartAnalysisResult` interface and maps it in transformation function (lines 146-207).

3. **Hook did not route failure reason to error callback** — RESOLVED. Plan adds conditional check in `useAIPartAnalysis` onResult callback to detect failure reason and call `onError` instead of `onSuccess` (lines 94-106).

The updated plan successfully addresses all blockers. The three minor findings identified in this review are implementation details that can be handled during coding without revising the plan document. The plan is ready for implementation.
