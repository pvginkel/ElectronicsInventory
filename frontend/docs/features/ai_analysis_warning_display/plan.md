# AI Analysis Warning Display — Technical Plan

## 0) Research Log & Findings

**Searched areas:**
- Reviewed `src/hooks/use-ai-part-analysis.ts` to understand current failure routing logic (lines 39-47)
- Examined `src/components/parts/ai-part-review-step.tsx` to identify where warning bar should be added (lines 210-214, duplicate bar pattern)
- Analyzed `src/components/parts/ai-part-progress-step.tsx` to understand error display (lines 23-56)
- Reviewed `src/components/parts/ai-part-dialog.tsx` to understand step routing (lines 34-54)
- Studied `src/components/parts/ai-duplicate-bar.tsx` as reference for warning bar UI pattern (lines 30-52)
- Examined `src/components/ui/alert.tsx` for warning banner component (lines 121-196)
- Reviewed `src/types/ai-parts.ts` to confirm `analysisFailureReason` field exists (line 49)
- Checked `src/lib/utils/ai-parts.ts` to understand transformation logic (lines 40-95)
- Examined `tests/e2e/parts/part-ai-creation.spec.ts` to understand existing test coverage (lines 133-183)
- Reviewed `tests/support/page-objects/ai-dialog-page.ts` for selectors (lines 1-75)

**Relevant components/hooks:**
- `useAIPartAnalysis` hook — contains the decision logic that currently routes to error (line 40 checks `analysisFailureReason?.trim()`)
- `AIPartReviewStep` component — where the warning bar will be displayed (already has duplicate bar pattern at line 212-214)
- `AIPartProgressStep` component — displays hard errors (lines 23-56)
- `Alert` UI component — standardized warning banner with variant support

**Conflicts resolved:**
- The current implementation (commit 5ca146e) routes to error when `analysisFailureReason` is present, regardless of whether `analysis_result` also exists
- The change brief indicates we need conditional routing: error if only failure reason, warning if both failure reason and analysis result are present
- The hook's `onResult` callback (lines 36-52) needs updated logic to check for presence of analysis data before routing to error

## 1) Intent & Scope

**User intent**

The AI analysis API can return both `analysis_failure_reason` and `analysis_result` simultaneously when the LLM encounters difficulties but still produces partial results. The system must differentiate between hard failures (no results) and soft failures (partial results with warnings), displaying appropriate UI for each scenario.

**Prompt quotes**

"Change the implementation to differentiate between two scenarios: 1. Failure reason + analysis result both present: Show the analysis result in the review step, but display a warning bar at the top indicating the LLM had trouble with the input. 2. Only failure reason present (no analysis result): Continue to show the error UI on the progress step as currently implemented."

"The current implementation is in the most recent git commit. The hook routing logic in `src/hooks/use-ai-part-analysis.ts` currently prioritizes failure reason and routes to error. The failure reason detection logic needs to be updated to check for the presence of analysis results before routing to error."

**In scope**

- Update `useAIPartAnalysis` hook to conditionally route based on presence of both `analysisFailureReason` and analysis data
- Add warning bar component to `AIPartReviewStep` that displays when `analysisFailureReason` is present
- Add `analysisFailureReason` prop to `AIPartReviewStep` interface
- Update Playwright tests to cover both scenarios (hard failure and soft failure with warning)
- Add page object locators for warning bar

**Out of scope**

- Changes to backend API contract (already supports simultaneous failure reason and analysis result)
- Changes to API transformation logic in `transformAIPartAnalysisResult` (already handles both fields)
- Changes to error display in `AIPartProgressStep` (works correctly for hard failures)
- Dismissible warning behavior (warning should persist through user session)
- Analytics or tracking for warning display frequency

**Assumptions / constraints**

- Backend API contract allows `analysis_result` and `analysis_failure_reason` to coexist in the response
- The presence of `description` field indicates valid analysis results (as used in `ai-part-dialog.tsx:39`)
- Warning bar should follow same visual pattern as duplicate bar (horizontal layout, prominent but not blocking)
- Tests use the existing `aiAnalysisMock` fixture which can emit both fields simultaneously
- Warning text should display the exact `analysisFailureReason` message without modification

## 2) Affected Areas & File Map

- Area: `src/hooks/use-ai-part-analysis.ts`
- Why: Update the `onResult` callback to check for presence of analysis data before routing to error state
- Evidence: `src/hooks/use-ai-part-analysis.ts:36-52` — The `onResult` callback currently checks `transformedResult.analysisFailureReason?.trim()` and immediately routes to error without checking if analysis data is also present. Line 39: `if (transformedResult.analysisFailureReason?.trim()) { ... setError(failureMessage); ... return; }`

---

- Area: `src/components/parts/ai-part-review-step.tsx`
- Why: Accept `analysisFailureReason` prop and display warning bar at top of review step when present
- Evidence: `src/components/parts/ai-part-review-step.tsx:47-61` — Component interface and props. Lines 210-214 show existing duplicate bar pattern that warning bar should follow: `{analysisResult.duplicateParts && analysisResult.duplicateParts.length > 0 && (<AIPartDuplicateBar duplicateParts={analysisResult.duplicateParts} />)}`

---

- Area: `src/components/parts/ai-part-dialog.tsx`
- Why: Pass `analysisFailureReason` from analysis result to review step component
- Evidence: `src/components/parts/ai-part-dialog.tsx:162-176` — The review step case already receives `analysisResult` prop, needs to pass through the failure reason. Line 170: `<AIPartReviewStep analysisResult={analysisResult} onCreatePart={handleCreatePart} ... />`

---

- Area: `tests/e2e/parts/part-ai-creation.spec.ts`
- Why: Add test scenario for partial analysis with warning (both `analysis_result` and `analysis_failure_reason` present)
- Evidence: `tests/e2e/parts/part-ai-creation.spec.ts:133-183` — Existing test covers hard failure scenario (only failure reason). New test should emit both fields to verify warning bar appears on review step.

---

- Area: `tests/support/page-objects/ai-dialog-page.ts`
- Why: Add locators for warning bar and warning message elements
- Evidence: `tests/support/page-objects/ai-dialog-page.ts:13-29` — Existing locators for review step and other UI elements. Need to add `warningBar` and `warningMessage` similar to how `progressError` and `progressErrorMessage` are defined.

---

- Area: `tests/support/helpers/ai-analysis-mock.ts`
- Why: Verify mock helper supports emitting both `analysis_result` and `analysis_failure_reason` simultaneously
- Evidence: Referenced in `tests/e2e/parts/part-ai-creation.spec.ts:29-66` where analysis overrides are provided. Line 163-168 shows `emitCompleted` accepts custom result with `analysis_failure_reason`.

## 3) Data Model / Contracts

- Entity / contract: `TransformedAIPartAnalysisResult`
- Shape: Already includes `analysisFailureReason?: string` field (defined in `src/types/ai-parts.ts:49`)
  ```typescript
  {
    description?: string;        // Present indicates valid analysis
    manufacturer?: string;
    // ... other analysis fields
    duplicateParts?: DuplicatePartEntry[];
    analysisFailureReason?: string;  // Present indicates LLM had issues
  }
  ```
- Mapping: Backend `analysis_failure_reason` (snake_case) already mapped to `analysisFailureReason` (camelCase) by `transformAIPartAnalysisResult` function
- Evidence: `src/types/ai-parts.ts:49`, `src/lib/utils/ai-parts.ts:89-92` — Field definition and transformation logic: `if (result.analysis_failure_reason) { transformed.analysisFailureReason = result.analysis_failure_reason.trim() || undefined; }`

---

- Entity / contract: `AIPartReviewStepProps`
- Shape: Currently does not explicitly expose `analysisFailureReason`, accesses it through `analysisResult.analysisFailureReason`
  ```typescript
  interface AIPartReviewStepProps {
    analysisResult: TransformedAIPartAnalysisResult;  // Contains analysisFailureReason
    onCreatePart: (data: ReturnType<typeof transformToCreateSchema>, createAnother: boolean) => void;
    onBack?: () => void;
    onCancel?: () => void;
    isCreating?: boolean;
  }
  ```
- Mapping: No changes needed — `analysisResult.analysisFailureReason` can be accessed directly from existing prop
- Evidence: `src/components/parts/ai-part-review-step.tsx:47-53`

---

- Entity / contract: Warning bar test-event instrumentation
- Shape: No new test-events required — warning bar will use `data-testid` attributes for Playwright targeting
  ```typescript
  // Warning bar testId pattern
  data-testid="parts.ai.review.warning-bar"
  data-testid="parts.ai.review.warning-message"
  ```
- Mapping: Follows existing duplicate bar pattern (`parts.ai.review.duplicate-bar`)
- Evidence: `src/components/parts/ai-duplicate-bar.tsx:32` — Existing duplicate bar testId

## 4) API / Integration Surface

- Surface: No API changes required
- Inputs: Existing `TransformedAIPartAnalysisResult` contains all necessary fields
- Outputs: No changes to mutation or query hooks
- Errors: No new error surfaces — warning display is purely presentational
- Evidence: `src/hooks/use-ai-part-analysis.ts:8` — Type already imported from generated API types

---

- Surface: `useAIPartAnalysis` hook return value
- Inputs: No changes to input parameters
- Outputs: The `result` field continues to return `TransformedAIPartAnalysisResult | null`, which already includes `analysisFailureReason`
- Errors: Error routing logic changes internally — now only routes to error when `analysisFailureReason` is present AND analysis data is absent
- Evidence: `src/hooks/use-ai-part-analysis.ts:15-23` — Hook interface definition

## 5) Algorithms & UI Flows

- Flow: AI analysis result processing and routing
- Steps:
  1. SSE completes and delivers `AIPartAnalysisResult` to `useAIPartAnalysis.onResult` callback
  2. Transform result to camelCase via `transformAIPartAnalysisResult`
  3. Check if `transformedResult.analysisFailureReason` is present (trimmed non-empty string)
  4. **NEW:** If failure reason exists, check if analysis data also exists (via `transformedResult.description` presence)
  5. **Route to error** if failure reason exists AND description is absent (hard failure)
     - Emit component error event
     - Call `setError(failureMessage)`
     - Call `options.onError?.(failureMessage)`
     - Set `isAnalyzing` to false
     - Return early (stay on progress step which will show error UI)
  6. **Route to success** if description exists (soft failure with warning, or normal success)
     - Call `options.onSuccess?.(transformedResult)` which routes to review step
     - Set `isAnalyzing` to false
     - Review step component detects `analysisResult.analysisFailureReason` and displays warning bar
  7. Review step renders warning bar above duplicate bar when `analysisFailureReason` is present
- States / transitions: No new React states — routing logic uses existing `error` and `result` states in hook and `currentStep` in dialog
- Hotspots: The decision point at step 4-6 is critical — must check for analysis data presence to avoid false routing to error
- Evidence: `src/hooks/use-ai-part-analysis.ts:36-52`, `src/components/parts/ai-part-dialog.tsx:34-54`

---

- Flow: Warning bar display in review step
- Steps:
  1. `AIPartReviewStep` receives `analysisResult` prop
  2. Extract `analysisResult.analysisFailureReason`
  3. Check if failure reason is present and non-empty (trimmed check)
  4. If present, render `Alert` component with `variant="warning"` above content grid
  5. Warning bar displays between heading and duplicate bar section
  6. Warning persists for duration of review step (no dismiss functionality)
- States / transitions: Purely presentational — no state management within warning bar
- Hotspots: Warning bar should follow duplicate bar positioning (line 212-214) but appear above it
- Evidence: `src/components/parts/ai-part-review-step.tsx:210-214` — Duplicate bar placement pattern

## 6) Derived State & Invariants

- Derived value: `hasAnalysisData`
  - Source: Presence of `transformedResult.description` (non-null/non-empty check)
  - Writes / cleanup: Used to determine routing in `useAIPartAnalysis.onResult` callback — does not write to state, only controls conditional routing via early return
  - Guards: Must check `description` presence before calling `options.onError` to prevent routing to error when partial results exist
  - Invariant: If `description` is present, the result must contain valid analysis data and should route to review step even if `analysisFailureReason` is also present
  - Evidence: `src/components/parts/ai-part-dialog.tsx:39` — Uses `!!result.description` to determine if analysis is present

---

- Derived value: `shouldShowWarning`
  - Source: `!!analysisResult.analysisFailureReason?.trim()` in review step component
  - Writes / cleanup: Controls conditional rendering of warning bar — no side effects or cache updates
  - Guards: Warning only shows when on review step AND failure reason is non-empty string
  - Invariant: Warning bar is visible if and only if user is on review step with `analysisFailureReason` present
  - Evidence: `src/components/parts/ai-part-review-step.tsx:212-214` — Pattern for conditional bar rendering

---

- Derived value: `shouldRouteToError`
  - Source: `!!analysisFailureReason && !description` in hook's onResult callback
  - Writes / cleanup: Triggers error state via `setError(message)` and prevents success callback — blocks navigation to review step
  - Guards: Only routes to error when failure reason exists AND no description exists (hard failure)
  - Invariant: Error routing occurs if and only if `analysisFailureReason` is present without accompanying analysis data
  - Evidence: `src/hooks/use-ai-part-analysis.ts:39-47` — Current error routing logic (will be updated)

## 7) State Consistency & Async Coordination

- Source of truth: `useAIPartAnalysis` hook state — manages `error`, `isAnalyzing`, and SSE `result`
- Coordination: Dialog component (`AIPartDialog`) subscribes to hook's `onSuccess` and `onError` callbacks to determine step routing. Review step renders based on `analysisResult` prop passed from dialog.
- Async safeguards: Existing SSE abort handling remains unchanged. Hook's `onResult` callback executes synchronously once SSE completes, so no race conditions between routing decisions.
- Instrumentation: Existing `emitComponentError` call remains for hard failures. No new instrumentation events needed — warning bar uses standard `data-testid` attributes for Playwright selectors.
- Evidence: `src/hooks/use-ai-part-analysis.ts:25-60`, `src/components/parts/ai-part-dialog.tsx:27-54` — Hook state management and dialog coordination

## 8) Errors & Edge Cases

- Failure: Hard analysis failure (only `analysis_failure_reason`, no `analysis_result`)
- Surface: `AIPartProgressStep` component displays error UI
- Handling: Hook routes to error state, dialog stays on progress step, user sees error message with retry button
- Guardrails: Existing behavior — no changes needed
- Evidence: `src/components/parts/ai-part-progress-step.tsx:23-56`, `tests/e2e/parts/part-ai-creation.spec.ts:133-183`

---

- Failure: Soft analysis failure (`analysis_failure_reason` + partial `analysis_result`)
- Surface: `AIPartReviewStep` displays warning bar at top
- Handling: Hook routes to success, dialog transitions to review step, warning bar appears above content with failure message
- Guardrails: Warning is non-dismissible to ensure user sees the message. User can still proceed to create part or go back to input.
- Evidence: New behavior — this is the primary change in this plan

---

- Failure: Empty or whitespace-only `analysis_failure_reason`
- Surface: Transformation layer strips empty failure reasons
- Handling: `transformAIPartAnalysisResult` already trims and converts empty strings to `undefined` (line 91)
- Guardrails: Hook's `trim()` check (line 40) prevents empty strings from triggering error routing
- Evidence: `src/lib/utils/ai-parts.ts:89-92` — `transformed.analysisFailureReason = result.analysis_failure_reason.trim() || undefined;`

---

- Failure: Both `analysis_result` and `duplicate_parts` present with `analysis_failure_reason`
- Surface: Review step shows both duplicate bar and warning bar
- Handling: Warning bar renders above duplicate bar. Both bars are conditionally rendered independently.
- Guardrails: CSS spacing between bars handled via existing `mb-6` classes
- Evidence: `src/components/parts/ai-part-review-step.tsx:212-214` — Duplicate bar pattern shows independent conditional rendering

---

- Failure: User navigates back from review step after seeing warning
- Surface: Return to input step with preserved text
- Handling: Existing back button behavior — warning bar is destroyed when review step unmounts, reappears if user re-submits and gets same result
- Guardrails: No state persistence needed — warning derives from analysis result which is preserved during dialog session
- Evidence: `src/components/parts/ai-part-dialog.tsx:115-117` — Back button handler

## 9) Observability / Instrumentation

- Signal: Warning bar container element
- Type: `data-testid` attribute for Playwright targeting
- Trigger: Rendered when review step is active AND `analysisResult.analysisFailureReason` is present
- Labels / fields: `data-testid="parts.ai.review.warning-bar"`
- Consumer: Playwright test assertions checking warning visibility
- Evidence: `src/components/parts/ai-duplicate-bar.tsx:32` — Pattern for duplicate bar testId

---

- Signal: Warning message text element
- Type: `data-testid` attribute for Playwright targeting
- Trigger: Rendered within warning bar to display failure reason text
- Labels / fields: `data-testid="parts.ai.review.warning-message"` (mirrors `parts.ai.progress-error-message` pattern)
- Consumer: Playwright test assertions verifying exact warning text content
- Evidence: `src/components/parts/ai-part-progress-step.tsx:38` — Pattern for error message testId

---

- Signal: Component error event (hard failures only)
- Type: `emitComponentError` test-event
- Trigger: When hook detects hard failure (failure reason without analysis data)
- Labels / fields: Component context `'ai-part-analysis'`, error message from `analysisFailureReason`
- Consumer: Existing Playwright test expects console error via `expectConsoleError(page, /Analysis failed:/)`
- Evidence: `src/hooks/use-ai-part-analysis.ts:42`, `tests/e2e/parts/part-ai-creation.spec.ts:153` — Existing error instrumentation and test

## 10) Lifecycle & Background Work

- Hook / effect: None required for warning display
- Trigger cadence: N/A — warning bar is purely presentational component
- Responsibilities: N/A
- Cleanup: Warning bar unmounts when review step unmounts (standard React cleanup)
- Evidence: N/A — no lifecycle effects needed

---

- Hook / effect: SSE connection cleanup (existing)
- Trigger cadence: On dialog close or analysis cancellation
- Responsibilities: Disconnect SSE stream, reset hook state
- Cleanup: Existing `disconnectSSE()` call in `cancelAnalysis` callback
- Evidence: `src/hooks/use-ai-part-analysis.ts:139-143` — Cancel analysis handler

## 11) Security & Permissions

Not applicable — no authentication, authorization, or data exposure concerns. Warning message displays server-provided text already visible in API response.

## 12) UX / UI Impact

- Entry point: AI part creation dialog, review step
- Change: New warning banner appears at top of review step when LLM encountered issues but still produced partial results
- User interaction: User sees warning explaining LLM difficulties, can review analysis data below, proceed to create part, or go back to retry with different input
- Dependencies: `Alert` component from `src/components/ui/alert.tsx` with `variant="warning"`
- Evidence: `src/components/ui/alert.tsx:121-196` — Alert component implementation

---

- Entry point: AI part creation dialog, progress step
- Change: No UI changes for hard failures — existing error display remains
- User interaction: Unchanged — user sees error message with retry/cancel buttons
- Dependencies: Existing `AIPartProgressStep` error UI
- Evidence: `src/components/parts/ai-part-progress-step.tsx:23-56`

## 13) Deterministic Test Plan

- Surface: AI part creation dialog — soft failure scenario
- Scenarios:
  - Given AI analysis returns both `analysis_result` and `analysis_failure_reason`
  - When user submits prompt and SSE completes with partial results
  - Then dialog transitions to review step (not error state)
  - And warning bar is visible at top of review step
  - And warning message displays exact `analysis_failure_reason` text
  - And user can see analysis fields populated below warning
  - And user can create part despite warning
- Instrumentation / hooks:
  - Use existing `aiAnalysisMock` fixture to emit both fields in `emitCompleted` call
  - Add locators to `AIDialogPage`: `warningBar` and `warningMessage`
  - Assert `partsAI.warningBar` is visible
  - Assert `partsAI.warningMessage` contains expected text
  - Assert dialog has `data-step="review"` (not `"progress"`)
- Gaps: None
- Evidence: `tests/e2e/parts/part-ai-creation.spec.ts:133-183` — Existing hard failure test to extend

---

- Surface: AI part creation dialog — hard failure scenario (existing test)
- Scenarios:
  - Given AI analysis returns only `analysis_failure_reason` (no `analysis_result` or `duplicate_parts`)
  - When user submits prompt and SSE completes with failure
  - Then dialog stays on progress step
  - And error UI is displayed with failure message
  - And retry button is visible
- Instrumentation / hooks: Existing test coverage at lines 133-183 — no changes needed
- Gaps: None
- Evidence: `tests/e2e/parts/part-ai-creation.spec.ts:133-183`

---

- Surface: Warning bar and duplicate bar coexistence
- Scenarios:
  - Given AI analysis returns `analysis_result`, `duplicate_parts`, AND `analysis_failure_reason`
  - When dialog transitions to review step
  - Then both warning bar and duplicate bar are visible
  - And warning bar appears above duplicate bar
- Instrumentation / hooks:
  - Use `aiAnalysisMock` to emit all three fields
  - Assert both `partsAI.warningBar` and existing duplicate bar selector are visible
  - Verify visual ordering via screenshot comparison or bounding box checks (optional)
- Gaps: Visual ordering verification may be manual QA — functional visibility assertions sufficient for automation
- Evidence: `src/components/parts/ai-part-review-step.tsx:212-214` — Duplicate bar rendering

## 14) Implementation Slices

Not applicable — change is small enough to implement in a single slice.

**Single slice: Update routing logic and add warning bar**
- Goal: Differentiate hard failures from soft failures and display warnings for partial results
- Touches: `use-ai-part-analysis.ts`, `ai-part-review-step.tsx`, `ai-part-dialog.tsx`, test spec, page object
- Dependencies: None — all required UI components and test infrastructure already exist

## 15) Risks & Open Questions

- Risk: User ignores warning and creates low-quality part
- Impact: Part inventory contains less accurate data than normal AI analysis
- Mitigation: Warning bar uses prominent amber styling with warning icon. User must actively scroll past warning to create part. Future enhancement could add confirmation dialog for warned parts (out of scope).

---

- Risk: Long failure messages cause warning bar to overflow
- Impact: UI layout breaks or text is truncated on small screens
- Mitigation: `Alert` component uses responsive flex layout with wrapping. Test with long message to verify rendering. If needed, add `max-h-32 overflow-y-auto` to warning content (can be addressed in implementation review).

---

- Risk: Backend changes contract and stops sending both fields simultaneously
- Impact: Tests fail, warning bar never appears in production
- Mitigation: Backend contract is stable per commit 5ca146e documentation. If contract changes, transformation logic will detect missing fields via existing error handling. Add integration test to backend test suite verifying dual-field emission (backend team responsibility).

---

- Question: Should warning bar be dismissible?
- Why it matters: User experience — persistent warning may annoy power users who understand the risk
- Owner / follow-up: Product decision — defaulting to non-dismissible to ensure visibility. Can add dismiss functionality in future iteration if user feedback indicates need.

---

- Question: Should analytics track warning display frequency?
- Why it matters: Understanding how often LLM produces partial results helps prioritize prompt engineering improvements
- Owner / follow-up: Analytics/product team — out of scope for initial implementation. Tracking can be added via existing instrumentation patterns in follow-up work.

## 16) Confidence

Confidence: High — All required infrastructure exists (Alert component, test fixtures, transformation logic). Change is localized to routing logic and presentational layer. Existing test for hard failure provides clear template for soft failure test. Risk surface is small with well-defined fallback behavior.
