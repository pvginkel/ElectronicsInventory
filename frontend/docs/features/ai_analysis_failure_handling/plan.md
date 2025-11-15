# AI Analysis Failure Handling - Implementation Plan

## 0) Research Log & Findings

Explored the AI analysis workflow to understand the current implementation:

**Core Components & Architecture:**
- **Dialog Flow**: `src/components/parts/ai-part-dialog.tsx` manages step transitions between `input`, `progress`, `review`, and `duplicates` steps (lines 12, 126-181)
- **Hook Layer**: `src/hooks/use-ai-part-analysis.ts` wraps SSE task handling and transforms API results (lines 25-137)
- **Data Transformation**: `src/lib/utils/ai-parts.ts` handles snake_case to camelCase mapping via `transformAIPartAnalysisResult` (lines 40-89)
- **SSE Task Hook**: `src/hooks/use-sse-task.ts` manages EventSource connections and parses task events (lines 57-203)
- **Progress Step**: `src/components/parts/ai-part-progress-step.tsx` already displays error states with retry/cancel buttons (lines 23-62)

**Current Error Handling:**
- Progress step has error UI that shows when `error` prop is provided (lines 23-62)
- Currently handles SSE-level failures via `task_completed` with `success: false` or `task_failed` events (use-sse-task.ts:128-150)
- No dedicated handling for AI analysis failure reasons returned in the result payload itself

**API Contract Discovery:**
- OpenAPI schema shows new `analysis_failure_reason` field as optional string (openapi.json:49-54)
- Field exists at `AIPartAnalysisResultSchema.analysis_failure_reason` level
- When present, other fields should be ignored per change brief

**Testing Infrastructure:**
- AI analysis mock helper at `tests/support/helpers/ai-analysis-mock.ts` (lines 149-280)
- Page object at `tests/support/page-objects/ai-dialog-page.ts` provides dialog interaction helpers (lines 4-55)
- Existing spec at `tests/e2e/parts/part-ai-creation.spec.ts` demonstrates AI flow testing (lines 6-131)
- Mock supports `emitCompleted` with overrides and `emitFailure` for error scenarios (lines 218-251)

**Key Finding:**
The change brief requests a "new AI analysis step" but the existing progress step already handles errors with retry/back functionality. The implementation should reuse this existing error UI rather than creating a new step, simply routing analysis failures (where `analysis_failure_reason` is present) through the same error display path.

---

## 1) Intent & Scope

**User intent**

Add handling for the new `analysis_failure_reason` field returned by the AI analysis API. When this field contains content, the UI must display the failure message to the user and allow them to refine their query by returning to the input step.

**Prompt quotes**

"When this field contains content, the other response fields should be ignored and the system must treat this as the AI being unable to fulfill the request."

"Displays the failure message from `analysis_failure_reason` to the user"

"Allows the user to go back to the first screen to refine their query"

**In scope**

- Detect `analysis_failure_reason` field in the AI analysis result payload
- Transform the field from snake_case to camelCase in the frontend model
- Route analysis failures to the progress step's error UI
- Display the failure reason message to the user
- Provide "Retry Analysis" button that returns to input step with preserved query text
- Update AI analysis mock helper to support failure reason scenarios
- Add Playwright test coverage for the failure path

**Out of scope**

- Creating a dedicated new step component (reusing existing progress error UI)
- Handling other types of errors beyond `analysis_failure_reason` (SSE failures, network errors already handled)
- Backend changes (API already returns the field)
- Analytics or logging beyond existing error instrumentation
- UI design changes to the error display beyond showing the failure reason

**Assumptions / constraints**

- The backend API already returns `analysis_failure_reason` when AI cannot fulfill the request
- Generated API types include the new field (mentioned in change brief)
- When `analysis_failure_reason` is present, it's safe to ignore all other analysis result fields
- The existing progress step error UI is sufficient for displaying analysis failures
- Users will want to retry with a modified query when analysis fails
- Test mode instrumentation already captures component errors via `emitComponentError`

---

## 2) Affected Areas & File Map

**Frontend Types**

- Area: `src/types/ai-parts.ts`
- Why: Add `analysisFailureReason` field to `TransformedAIPartAnalysisResult` interface
- Evidence: `src/types/ai-parts.ts:22-47` — Existing `TransformedAIPartAnalysisResult` interface with optional analysis and duplicate fields

**Data Transformation Logic**

- Area: `src/lib/utils/ai-parts.ts` — `transformAIPartAnalysisResult` function
- Why: Extract and map `analysis_failure_reason` from API response to camelCase frontend model
- Evidence: `src/lib/utils/ai-parts.ts:40-89` — Current transformation logic that maps analysis_result and duplicate_parts from snake_case

**Analysis Hook**

- Area: `src/hooks/use-ai-part-analysis.ts` — `useAIPartAnalysis` hook
- Why: Detect analysis failure reason in transformed result and route to error state instead of success callback
- Implementation: After line 37 (`const transformedResult = ...`), add conditional check:
  ```typescript
  if (transformedResult.analysisFailureReason) {
    options.onError?.(transformedResult.analysisFailureReason);
    setIsAnalyzing(false);
    return;
  }
  ```
  Then call `options.onSuccess?.(transformedResult)` only if no failure reason present.
- Evidence: `src/hooks/use-ai-part-analysis.ts:34-46` — `onResult` callback in `useSSETask` that currently calls `onSuccess` with transformed result

**Dialog Step Management**

- Area: `src/components/parts/ai-part-dialog.tsx` — `AIPartDialog` component
- Why: Handle analysis failure by staying on progress step in error state (no routing to review/duplicates)
- Evidence: `src/components/parts/ai-part-dialog.tsx:34-54` — `onSuccess` callback that routes to review or duplicates step based on result structure

**Progress Step Component**

- Area: `src/components/parts/ai-part-progress-step.tsx` — Error display
- Why: Already displays error message from `error` prop; will show `analysisFailureReason` content
- Evidence: `src/components/parts/ai-part-progress-step.tsx:23-62` — Error UI with message display at line 43, retry button at line 48

**Test Helper**

- Area: `tests/support/helpers/ai-analysis-mock.ts` — `AiAnalysisMockSession` interface and `emitCompleted` function
- Why: Add support for emitting `analysis_failure_reason` in mocked SSE payloads
- Changes:
  1. Extend `AiAnalysisCompletionOverrides` interface (line 49) to include:
     ```typescript
     analysis_failure_reason?: string | null;
     ```
  2. Update `emitCompleted` function (lines 218-243) to include `analysis_failure_reason`
     in the completion payload when override is provided
- Evidence: `tests/support/helpers/ai-analysis-mock.ts:49-54, 218-243` — `AiAnalysisCompletionOverrides` interface and `emitCompleted` function that builds completion payload

**Playwright Spec**

- Area: `tests/e2e/parts/part-ai-creation.spec.ts` or new spec file
- Why: Add test scenario for analysis failure reason path
- Evidence: `tests/e2e/parts/part-ai-creation.spec.ts:6-131` — Existing test demonstrates AI flow from input → progress → review with mock

**Page Object**

- Area: `tests/support/page-objects/ai-dialog-page.ts`
- Why: Add helper to wait for and assert on error state in progress step
- Evidence: `tests/support/page-objects/ai-dialog-page.ts:9-10, 20-21` — Existing `progressStep` and `progressMessage` locators

---

## 3) Data Model / Contracts

**Frontend Type Extension**

- Entity / contract: `TransformedAIPartAnalysisResult` interface
- Shape:
  ```typescript
  interface TransformedAIPartAnalysisResult {
    // Existing analysis fields (all optional)...
    description?: string;
    manufacturer?: string;
    // ... other fields ...

    // NEW: Analysis failure reason
    analysisFailureReason?: string;

    // Existing duplicate detection field
    duplicateParts?: DuplicatePartEntry[];
  }
  ```
- Mapping: `analysis_failure_reason` (snake_case API) → `analysisFailureReason` (camelCase frontend)
- Evidence: `src/types/ai-parts.ts:22-47`, `src/lib/utils/ai-parts.ts:40-89`

**API Response Shape**

- Entity / contract: `AIPartAnalysisResultSchema` from generated types
- Shape: Backend returns at top level of result:
  ```json
  {
    "analysis_failure_reason": "Could not identify component from provided text" | null,
    "analysis_result": { ... } | null,
    "duplicate_parts": [...] | null
  }
  ```
- Mapping: Field extracted in `transformAIPartAnalysisResult` and added to transformed result
- Evidence: `openapi-cache/openapi.json:49-54` — Schema definition for `analysis_failure_reason`

**SSE Task Completion Event**

- Entity / contract: `task_completed` event data payload
- Shape: Nested structure remains unchanged:
  ```typescript
  {
    success: boolean,
    analysis: {
      analysis_failure_reason?: string,
      analysis_result?: { ... },
      duplicate_parts?: [...]
    } | null,
    error_message: string | null
  }
  ```
- Mapping: `analysis` field passes through to `transformAIPartAnalysisResult`
- Evidence: `src/hooks/use-sse-task.ts:128-141` — `task_completed` event handling

**Error State Propagation**

- Entity / contract: Component state in `useAIPartAnalysis` hook
- Shape: When `analysisFailureReason` is present, treat as error rather than success
- Mapping: Hook detects failure reason and calls `onError` callback instead of `onSuccess`
- Evidence: `src/hooks/use-ai-part-analysis.ts:34-46` — Hook callbacks configuration

---

## 4) API / Integration Surface

**SSE Task Stream**

- Surface: EventSource connection to task stream URL (e.g., `/api/tasks/{task_id}/stream`)
- Inputs: Task ID from initial analyze request
- Outputs: `task_event` messages with `task_completed` data containing `analysis.analysis_failure_reason`
- Errors: Failure reason is not an error at SSE level (success=true with failure reason), handled as analysis-level failure
- Evidence: `src/hooks/use-sse-task.ts:108-156` — SSE event listener handling task_event messages

**No New HTTP Endpoints**

- Surface: Existing `/api/ai-parts/analyze` endpoint unchanged
- Inputs: FormData with text/image (unchanged)
- Outputs: Returns task_id and stream_url (unchanged), failure reason comes through SSE stream
- Errors: HTTP-level errors already handled by existing error handling
- Evidence: `src/hooks/use-ai-part-analysis.ts:73-90` — Form submission to analyze endpoint

**State Management**

- Surface: `useAIPartAnalysis` hook state
- Inputs: Transformed result from SSE task hook
- Outputs: Either calls `onSuccess(result)` or `onError(failureReason)` based on presence of `analysisFailureReason`
- Errors: Analysis failure routed through error callback, causing dialog to stay on progress step in error state
- Evidence: `src/hooks/use-ai-part-analysis.ts:25-137`, `src/components/parts/ai-part-dialog.tsx:34-54`

---

## 5) Algorithms & UI Flows

**Analysis Result Processing Flow**

- Flow: Transform and route AI analysis result
- Steps:
  1. SSE `task_completed` event arrives with success=true and analysis payload
  2. `useSSETask` extracts `parsedEvent.data.analysis` and calls `onResult` callback
  3. `useAIPartAnalysis` receives raw API result and calls `transformAIPartAnalysisResult`
  4. Transformation extracts `analysis_failure_reason` and maps to `analysisFailureReason`
  5. Hook checks if `transformedResult.analysisFailureReason?.trim()` is present (truthy after trimming)
  6. If present: calls `onError(transformedResult.analysisFailureReason)` and sets `isAnalyzing=false`, then returns
  7. If absent: calls `onSuccess(transformedResult)` (existing behavior)
  8. Dialog's `onError` callback keeps `currentStep='progress'` so error UI displays
  9. Dialog's `onSuccess` callback would route to review/duplicates (not executed for failures)
- States / transitions:
  - Initial: `currentStep='input'` → User submits → `currentStep='progress'`
  - Success path: Progress → Review/Duplicates (existing)
  - Failure path: Progress (stays) with error state displayed
  - Retry: Progress error → Input with preserved text (via `handleRetryAnalysis`)
- Hotspots: Decision point is in `useAIPartAnalysis` after transformation; trimming prevents whitespace-only failure reasons from triggering error UI
- Evidence: `src/hooks/use-ai-part-analysis.ts:36-39`, `src/components/parts/ai-part-dialog.tsx:34-54, 78-80`

**User Retry Flow**

- Flow: User retries analysis after failure
- Steps:
  1. Progress step displays error with "Retry Analysis" button
  2. User clicks retry → triggers `onRetry` callback
  3. Dialog's `handleRetryAnalysis` sets `currentStep='input'`
  4. Input step renders with `initialText={lastSearchText}` (preserved from original submission)
  5. User modifies input and resubmits
  6. Flow returns to step 1 of Analysis Result Processing Flow
- States / transitions: `progress[error]` → `input[prefilled]` → `progress[analyzing]` → success or failure
- Hotspots: `lastSearchText` state must persist through error to enable prefilling
- Evidence: `src/components/parts/ai-part-dialog.tsx:78-80, 67-71, 130-135`

**Back to Input Flow**

- Flow: Alternative to retry (same button currently used)
- Steps:
  1. Progress step error shows "Retry Analysis" button (reuses existing pattern)
  2. Button triggers same `handleRetryAnalysis` → returns to input
  3. Query text preserved via `lastSearchText` state
- States / transitions: Same as retry flow (progress error → input)
- Hotspots: Single button serves both "retry" and "back" semantics
- Evidence: `src/components/parts/ai-part-progress-step.tsx:47-51`, `src/components/parts/ai-part-dialog.tsx:78-80`

---

## 6) Derived State & Invariants

**Analysis Failure Detection**

- Derived value: Whether to treat result as error vs success
- Source: `transformedResult.analysisFailureReason` presence (string vs undefined)
- Writes / cleanup: Calls either `onError` or `onSuccess` callback, never both
- Guards: Check must happen after transformation but before callbacks
- Invariant: If `analysisFailureReason` is present (truthy string), `onError` is called; otherwise `onSuccess` is called with the result
- Evidence: `src/hooks/use-ai-part-analysis.ts:36-39`

**Query Text Preservation**

- Derived value: `lastSearchText` state in dialog
- Source: User input from initial submission (`handleInputSubmit` sets it)
- Writes / cleanup: Set on submit, cleared on dialog close, preserved through error states
- Guards: Must not clear on error/retry transitions, only on dialog close
- Invariant: Text remains available for retry flow until dialog closes
- Evidence: `src/components/parts/ai-part-dialog.tsx:23, 67-71, 60-65`

**Step Routing Logic**

- Derived value: `currentStep` state determining which UI renders
- Source: Analysis result structure (hasAnalysis, hasDuplicates, hasFailure)
- Writes / cleanup: Updated in `onSuccess` or stays at 'progress' in `onError`
- Guards: Failure reason takes precedence → stay on progress; otherwise route based on duplicates/analysis
- Invariant: Never route to review/duplicates when `analysisFailureReason` present; always stay on progress to show error
- Evidence: `src/components/parts/ai-part-dialog.tsx:34-54`

**Error Message Display**

- Derived value: Error text shown in progress step
- Source: `analysisError` state from `useAIPartAnalysis` hook
- Writes / cleanup: Set by `onError` callback when failure reason detected, cleared on retry
- Guards: Only displayed when `error` prop is truthy
- Invariant: Error message in UI exactly matches `analysisFailureReason` content from API
- Evidence: `src/components/parts/ai-part-progress-step.tsx:43`, `src/components/parts/ai-part-dialog.tsx:50-53, 142`

---

## 7) State Consistency & Async Coordination

**Hook State Coordination**

- Source of truth: `useAIPartAnalysis` hook state (`result`, `error`, `isAnalyzing`)
- Coordination: SSE task hook manages connection/events, analysis hook adds failure detection layer, dialog consumes via callbacks
- Async safeguards: `isAnalyzing` gate prevents concurrent submissions, SSE disconnect on unmount, error/success callbacks set `isAnalyzing=false`
- Instrumentation: `emitComponentError` already called for analysis failures (will capture failure reason in error message)
- Evidence: `src/hooks/use-ai-part-analysis.ts:26, 39, 42-44`

**Dialog Step Synchronization**

- Source of truth: `currentStep` state in `AIPartDialog`
- Coordination: Transitions triggered by analysis hook callbacks (`onSuccess`, `onError`)
- Async safeguards: Step only changes after analysis completes (success or error), cancel handler resets to input
- Instrumentation: Dialog step exposed via `data-step` attribute on dialog content for test assertions
- Evidence: `src/components/parts/ai-part-dialog.tsx:21, 34-54, 195`

**SSE Connection Lifecycle**

- Source of truth: `eventSourceRef` in `useSSETask` hook
- Coordination: Connect on analyze submit, disconnect on completion/error/cancel/unmount
- Async safeguards: Cleanup in useEffect return, retry logic with exponential backoff, connection state tracking
- Instrumentation: Could emit SSE events via `sse` test-event kind if needed (currently not instrumented)
- Evidence: `src/hooks/use-sse-task.ts:63-86, 189-193`

---

## 8) Errors & Edge Cases

**Analysis Failure Reason Present**

- Failure: API returns `analysis_failure_reason` with message (e.g., "Could not identify component from provided text")
- Surface: Progress step in error state
- Handling: Display failure message, show "Retry Analysis" button, preserve query text for retry
- Guardrails: Check for truthiness of `analysisFailureReason`, route through error path instead of success
- Evidence: `src/components/parts/ai-part-progress-step.tsx:23-62` — Error UI

**Empty Failure Reason String**

- Failure: API returns empty string `""` for `analysis_failure_reason`
- Surface: Should treat as no failure (empty string is falsy in JS)
- Handling: Route to normal success path (review/duplicates)
- Guardrails: Truthiness check (`if (analysisFailureReason)`) treats empty string as no failure
- Evidence: Hook failure detection logic (to be added)

**Failure Reason with Success=False**

- Failure: SSE event has `success=false` AND `analysis.analysis_failure_reason` present
- Surface: Progress step error state
- Handling: Existing `success=false` path already routes to error; failure reason would be additional context
- Guardrails: If `success=false`, SSE hook already calls `onError` with `error_message`; prefer that over failure reason
- Evidence: `src/hooks/use-sse-task.ts:128-141` — Checks success flag first

**Network/SSE Failures**

- Failure: Connection errors, timeout, malformed events (existing error cases)
- Surface: Progress step error state
- Handling: Existing SSE error handling remains unchanged
- Guardrails: Separate from analysis failure reason; handled at SSE/network level
- Evidence: `src/hooks/use-sse-task.ts:164-180` — EventSource error handler

**Missing Analysis Result and Duplicate Parts**

- Failure: Both `analysis_result` and `duplicate_parts` are null but no `analysis_failure_reason`
- Surface: Transformation function validation
- Handling: Update validation at line 44 from:
  ```typescript
  if (!result.analysis_result && !result.duplicate_parts) { throw ... }
  ```
  to:
  ```typescript
  if (!result.analysis_result && !result.duplicate_parts && !result.analysis_failure_reason) { throw ... }
  ```
  This allows responses with only analysis_failure_reason to pass validation.
- Guardrails: Validation now accepts failure reason as valid third scenario alongside analysis_result and duplicate_parts
- Evidence: `src/lib/utils/ai-parts.ts:44-52` — Current validation logic

**Dialog Close During Error State**

- Failure: User closes dialog while error is displayed
- Surface: Dialog onClose handler
- Handling: Existing cleanup clears `lastSearchText`, closes dialog
- Guardrails: Ensure error state doesn't persist into next dialog open
- Evidence: `src/components/parts/ai-part-dialog.tsx:57-65, 119-124` — Reset logic on open/close

---

## 9) Observability / Instrumentation

**Component Error Emission**

- Signal: `error` test-event
- Type: Test instrumentation event via `emitComponentError`
- Trigger: When analysis hook detects failure reason and calls `onError`, existing instrumentation in hook already emits component error
- Labels / fields: `scope='ai-part-analysis'`, `message=analysisFailureReason`
- Consumer: Playwright error helpers, test assertions
- Evidence: `src/hooks/use-ai-part-analysis.ts:42` — Existing `emitComponentError` call in `onError` callback

**Dialog Step Attribute**

- Signal: `data-step` attribute on dialog content
- Type: DOM attribute for test selectors
- Trigger: Rendered whenever dialog is open, reflects current step
- Labels / fields: `data-step="progress"` when showing error
- Consumer: Playwright assertions on step state
- Evidence: `src/components/parts/ai-part-dialog.tsx:195` — `data-step={currentStep}`

**Progress Step State Attribute**

- Signal: `data-state` attribute on progress step container
- Type: DOM attribute for test selectors
- Trigger: Rendered when progress step is active, reflects error vs running state
- Labels / fields: `data-state="error"` when error displayed, `data-state="running"` when analyzing
- Consumer: Playwright assertions to distinguish error from loading
- Evidence: `src/components/parts/ai-part-progress-step.tsx:25, 65` — `data-state` attribute

**Error Message Test ID**

- Signal: `data-testid="parts.ai.progress-error-message"` on error message element
- Type: Test selector for error text content
- Trigger: Rendered when error prop is present in progress step
- Labels / fields: Text content is the error message
- Consumer: Playwright assertions to verify failure reason is displayed
- Evidence: `src/components/parts/ai-part-progress-step.tsx:43` — Existing testid on error message

---

## 10) Lifecycle & Background Work

**No New Lifecycle Requirements**

- Hook / effect: Existing SSE connection cleanup in `useSSETask`
- Trigger cadence: On unmount or disconnect
- Responsibilities: Close EventSource connection, clear retry timeouts
- Cleanup: Already handled by existing useEffect in SSE hook
- Evidence: `src/hooks/use-sse-task.ts:189-193` — Cleanup effect

**Dialog State Reset**

- Hook / effect: Existing useEffect in `AIPartDialog` that resets on open/close
- Trigger cadence: When `open` prop changes
- Responsibilities: Reset step to input, clear creating flag, clear search text on close
- Cleanup: Handled by effect dependency on `open`
- Evidence: `src/components/parts/ai-part-dialog.tsx:57-65` — Reset effect

---

## 11) Security & Permissions

**No Security Impact**

This feature does not introduce new security concerns. The failure reason message comes from the backend API which already validates and sanitizes content. Displaying the message in the UI follows existing patterns for error message rendering.

---

## 12) UX / UI Impact

**Progress Step Error Display**

- Entry point: AI Part Dialog → Progress Step (error state)
- Change: Error message will now display AI analysis failure reasons in addition to SSE/network errors
- User interaction: User sees failure reason (e.g., "Could not identify component from provided text"), can click "Retry Analysis" to return to input with preserved query
- Dependencies: Existing progress step error UI, no design changes needed
- Evidence: `src/components/parts/ai-part-progress-step.tsx:23-62` — Error UI structure

**Input Step Prefill on Retry**

- Entry point: AI Part Dialog → Input Step (after error retry)
- Change: Input field will be prefilled with original query text when retrying from failure
- User interaction: User can modify the prefilled text before resubmitting
- Dependencies: `initialText` prop already supported by input step
- Evidence: `src/components/parts/ai-part-input-step.tsx:10, 14, 50` — initialText prop and usage

---

## 13) Deterministic Test Plan

**Analysis Failure Reason Scenario**

- Surface: AI Part Dialog flow
- Scenarios:
  - Given user opens AI dialog and submits a query
  - When AI analysis returns with `analysis_failure_reason` populated
  - Then progress step displays error state with failure message
  - And dialog remains on progress step (does not advance to review)
  - And "Retry Analysis" button is visible
  - When user clicks "Retry Analysis"
  - Then dialog transitions to input step
  - And input field contains original query text
  - When user modifies text and resubmits
  - Then analysis starts again (progress step shows analyzing state)
- Instrumentation / hooks:
  - `data-step="progress"` on dialog during error
  - `data-state="error"` on progress step container
  - `data-testid="parts.ai.progress-error-message"` contains failure reason text
  - AI analysis mock helper's `emitCompleted` with `analysis_failure_reason` override
  - Page object method to assert progress error state
- Gaps: None — full coverage of failure path
- Evidence: `tests/support/helpers/ai-analysis-mock.ts:218-243`, `tests/support/page-objects/ai-dialog-page.ts:20-41`

**Success Path Unchanged Scenario**

- Surface: AI Part Dialog flow (regression coverage)
- Scenarios:
  - Given user opens AI dialog and submits a query
  - When AI analysis returns with `analysis_result` populated and no `analysis_failure_reason`
  - Then progress step advances to review step (existing behavior)
  - And review step displays analysis results
- Instrumentation / hooks:
  - `data-step="review"` on dialog after success
  - Existing review step assertions
- Gaps: Covered by existing `part-ai-creation.spec.ts`
- Evidence: `tests/e2e/parts/part-ai-creation.spec.ts:6-131`

**Validation Error Handling Scenario**

- Surface: `transformAIPartAnalysisResult` function
- Scenarios:
  - Given API returns result with neither `analysis_result` nor `duplicate_parts` nor `analysis_failure_reason`
  - When transformation function processes result
  - Then function throws validation error (existing behavior preserved)
  - Given API returns result with `analysis_failure_reason` but no analysis/duplicates
  - When transformation function processes result
  - Then function returns successfully with `analysisFailureReason` field populated
- Instrumentation / hooks: Unit test assertions (could add to test suite)
- Gaps: Validation update to allow failure reason as valid scenario
- Evidence: `src/lib/utils/ai-parts.ts:44-52`

---

## 14) Implementation Slices

This is a small, focused change. Implement as a single coherent slice:

**Single Slice: Analysis Failure Handling**

- Slice: Complete failure reason handling
- Goal: Detect and display analysis failure reasons, allow user retry
- Touches:
  1. `src/types/ai-parts.ts` — Add `analysisFailureReason` field
  2. `src/lib/utils/ai-parts.ts` — Extract and map field, update validation
  3. `src/hooks/use-ai-part-analysis.ts` — Detect failure reason and route to error
  4. `tests/support/helpers/ai-analysis-mock.ts` — Support failure reason in mock
  5. `tests/support/page-objects/ai-dialog-page.ts` — Add error state helper
  6. `tests/e2e/parts/part-ai-creation.spec.ts` or new spec — Test failure scenario
- Dependencies: None (builds on existing error UI and flow)

---

## 15) Risks & Open Questions

**Risks**

- Risk: Failure reason message might be too technical for end users
- Impact: User confusion about how to refine query
- Mitigation: Accept backend message as-is; if problematic in practice, request backend to provide user-friendly messages

- Risk: Empty string or whitespace-only failure reason could show confusing error
- Impact: Blank error message in UI
- Mitigation: Trim and check truthiness before routing to error path

- Risk: Validation logic might reject valid failure-only results
- Impact: Exception thrown instead of displaying failure reason
- Mitigation: Update validation in `transformAIPartAnalysisResult` to allow failure reason as valid scenario

**Open Questions**

- Question: Should the error UI differentiate between analysis failures vs network/SSE failures?
- Why it matters: Different user actions might be appropriate (retry/refine vs wait/reload)
- Owner / follow-up: Current implementation treats both as errors with retry option; if differentiation needed, can add `data-error-type` attribute in future iteration

- Question: Should analytics track analysis failure reasons for product insights?
- Why it matters: Understanding common failure patterns could inform AI improvements
- Owner / follow-up: Out of scope for this change; existing error instrumentation captures failures; product team can add analytics if needed

---

## 16) Confidence

Confidence: High — The implementation is straightforward, reuses existing error UI and flow patterns, and the API contract is well-defined. The main work is detecting the failure reason field and routing to the appropriate callback. Testing infrastructure already supports mocking SSE responses with custom payloads.
