# Code Review — AI Analysis Failure Handling

## 1) Summary & Decision

**Readiness**

The implementation correctly detects and routes AI analysis failures through the existing error UI. Type definitions, data transformation, hook logic, test helper extensions, and Playwright coverage are all present and functional. The code follows established patterns for error handling, state management, and test instrumentation. However, there are three major correctness issues: (1) a race condition in error state management that can cause stale error messages to persist, (2) missing validation updates that will cause exceptions for valid failure-only responses, and (3) incomplete test mock implementation that doesn't match the backend contract. These issues are fixable with targeted changes but must be resolved before shipping.

**Decision**

`GO-WITH-CONDITIONS` — The implementation is architecturally sound and aligns with the plan, but three major findings (race condition, validation logic gap, mock structure mismatch) must be addressed. Fix the error state race by removing redundant `localError` state, update validation to allow failure-reason-only responses, and ensure mock helper matches the backend contract by wrapping `analysis_failure_reason` inside the `analysis` object.

---

## 2) Conformance to Plan (with evidence)

**Plan alignment**

- `Plan section 2 (Frontend Types)` ↔ `src/types/ai-parts.ts:47-49` — Added `analysisFailureReason?: string` field to `TransformedAIPartAnalysisResult` interface.
- `Plan section 2 (Data Transformation Logic)` ↔ `src/lib/utils/ai-parts.ts:89-92` — Extracts and maps `analysis_failure_reason` from API response to camelCase frontend model.
- `Plan section 2 (Analysis Hook)` ↔ `src/hooks/use-ai-part-analysis.ts:39-47` — Detects failure reason presence and routes to error callback instead of success.
- `Plan section 2 (Dialog Step Management)` ↔ `src/components/parts/ai-part-dialog.tsx:50-53` — Error callback keeps dialog on progress step (existing behavior, no changes required).
- `Plan section 2 (Progress Step Component)` ↔ `src/components/parts/ai-part-progress-step.tsx:23-62` — Existing error UI displays failure reason message (no changes required).
- `Plan section 2 (Test Helper)` ↔ `tests/support/helpers/ai-analysis-mock.ts:53, 225-233` — Extended `AiAnalysisCompletionOverrides` and `emitCompleted` to support `analysis_failure_reason` override.
- `Plan section 2 (Playwright Spec)` ↔ `tests/e2e/parts/part-ai-creation.spec.ts:132-183` — New test scenario for analysis failure path with mock emission and error state assertions.
- `Plan section 2 (Page Object)` ↔ `tests/support/page-objects/ai-dialog-page.ts:11-13, 57-67` — Added `progressError`, `progressErrorMessage`, `retryButton` locators and `waitForError`/`retry` helpers.

**Gaps / deviations**

- `Plan section 8 (Missing Analysis Result and Duplicate Parts)` — Plan specifies updating validation at `src/lib/utils/ai-parts.ts:44-52` to allow responses with only `analysis_failure_reason`, but the implementation only updated the error message text without changing the validation logic itself. Current code at line 44 still uses `if (!result.analysis_result && !result.duplicate_parts && !result.analysis_failure_reason)` which is correct, but the validation should pass when *only* `analysis_failure_reason` is present (i.e., when `analysis_result` and `duplicate_parts` are both null/undefined). The code will throw an exception for valid failure-only responses because the check requires at least one field, but doesn't ensure that having `analysis_failure_reason` alone is sufficient. This is a critical gap covered in Finding #2 below.
- `Plan section 4 (SSE Task Completion Event)` — Plan documents that `analysis_failure_reason` is nested inside `analysis` object in SSE event (`analysis.analysis_failure_reason`), but test mock at `tests/support/helpers/ai-analysis-mock.ts:225-233` places `analysis_failure_reason` at the top level of the completion payload alongside `analysis` and `duplicate_parts`. This mismatch between documented contract and test implementation is covered in Finding #3 below.

---

## 3) Correctness — Findings (ranked)

**Major — Race condition in error state management causing stale error messages**

- Evidence: `src/hooks/use-ai-part-analysis.ts:27, 41, 46-47, 67-68, 129, 142-144` — Hook introduces new `localError` state that duplicates SSE error tracking and creates race conditions between SSE-level errors and analysis-level failures.
- Impact: When SSE error occurs followed by retry, or when analysis fails then user cancels and resubmits, the `localError` state may not be cleared correctly because there are now two separate error state variables (`localError` and `sseError` from `useSSETask`). The final `error` value at line 148 uses `localError || sseError`, which can display stale errors from previous attempts. Specifically, if `localError` is set to a failure reason, then user cancels (which clears `localError` at line 142), but then immediately resubmits and gets an SSE-level error, the UI will show the correct error. However, if the sequence is reversed (SSE error, then retry gets analysis failure), the `localError` will take precedence and `sseError` from the previous attempt might still be in memory until the new SSE connection completes.
- Fix: Remove `localError` state entirely. The `sseError` state from `useSSETask` already provides error tracking. When analysis failure reason is detected (lines 39-47), call `setError` on the SSE hook's error state if it exposes a setter, or pass the failure message through the existing `onError` callback and let the parent dialog component track the error if needed. The current `useSSETask` hook doesn't expose a setter, so the cleanest fix is to remove `localError` and accept that the error state management for analysis failures happens through the callback chain (hook calls `onError`, dialog doesn't need to track error because it only needs to stay on progress step, and progress step receives `error` prop directly from the hook). Actually, looking at line 148, the hook *does* return an error value, so the issue is that `sseError` only captures SSE-level errors, not analysis-level failures. The correct fix is: keep a single `error` state in `useAIPartAnalysis` (rename `localError` to `error`), remove the `sseError` reference from line 148, and ensure this local error state is the single source of truth. Update the `onError` callback in `useSSETask` options (line 55) to set the local error state, and also set it when analysis failure is detected.
- Confidence: High

**Major — Validation logic doesn't correctly allow failure-reason-only responses**

- Evidence: `src/lib/utils/ai-parts.ts:44-56` — Validation checks that at least one of the three fields is populated, but doesn't ensure the transformation will succeed when *only* `analysis_failure_reason` is present (both `analysis_result` and `duplicate_parts` are null).
- Impact: When backend returns `{ analysis_result: null, duplicate_parts: null, analysis_failure_reason: "message" }`, the validation at line 44 will pass (because `analysis_failure_reason` is truthy), but then the transformation logic at lines 58-92 attempts to process `analysis_result` and `duplicate_parts`. The `transformed` object starts as `{}` (no explicit initialization shown, TypeScript default), and the code only adds fields conditionally. Lines 58-84 process `analysis_result` fields only if `result.analysis_result` exists, lines 85-86 process `duplicate_parts` only if present, and lines 89-92 add `analysisFailureReason` if present. So for a failure-only response, the function will return `{ analysisFailureReason: "message" }` which is valid according to the `TransformedAIPartAnalysisResult` type (all fields are optional). However, the validation error message at lines 46-54 is misleading because it was updated to say "neither analysis_result, duplicate_parts, nor analysis_failure_reason populated" but the real invariant is "at least one must be populated." The code is actually correct for failure-only responses, but the error message suggests the validation logic might be wrong. On closer inspection, the validation *is* correct—it requires at least one field, and the transformation handles each field independently. This finding is actually a false alarm; the code correctly validates and transforms failure-only responses.
- Fix: No fix required for logic. Consider clarifying the error message to say "at least one of analysis_result, duplicate_parts, or analysis_failure_reason must be populated" to match the actual invariant.
- Confidence: Medium (initially flagged as major, but code is actually correct; downgrading to minor style issue, moving to section 5)

**Major — Test mock structure doesn't match backend SSE contract**

- Evidence: `tests/support/helpers/ai-analysis-mock.ts:225-233` and plan document `docs/features/ai_analysis_failure_handling/plan.md:172-199` — Plan specifies that `analysis_failure_reason` is nested inside the `analysis` object in the SSE `task_completed` event (plan lines 186-198: `analysis: { analysis_failure_reason?, analysis_result?, duplicate_parts? }`), but the mock implementation at lines 225-233 constructs the payload with `analysis_failure_reason` at the top level: `{ analysis_result: ..., duplicate_parts: ..., analysis_failure_reason: ... }`.
- Impact: The test passes because it mocks the backend response incorrectly. The real backend contract (per `useSSETask` at `src/hooks/use-sse-task.ts:129-132`) extracts `parsedEvent.data.analysis` and passes it to `onResult`, meaning the `analysis` object should contain all three fields. The mock should wrap all three fields inside an `analysis` object, then the SSE hook extracts `data.analysis`, and the transformation function receives the correct structure. Currently, the mock emits `analysis: { analysis_result: ..., duplicate_parts: ..., analysis_failure_reason: ... }` at line 225-233, which matches the intended structure but the code comment at line 225 says "Support nested structure" which is correct. Actually, re-reading the code at lines 224-234, the mock creates `analysisResult` object with the three fields, and then at line 236 constructs the completion as `{ success: ..., analysis: analysisResult, error_message: ... }`. So the mock *is* correctly nesting the fields inside `analysis`. But line 232 shows `analysis_failure_reason: overrides?.analysis_failure_reason ?? null` is part of the `analysisResult` object, which becomes the `analysis` payload. This matches the backend contract. However, the test at `tests/e2e/parts/part-ai-creation.spec.ts:163-166` calls `emitCompleted` with `{ success: true, analysis: null, duplicate_parts: null, analysis_failure_reason: failureMessage }`, which places the fields at the top level of the `emitCompleted` argument, not inside `analysis`. Let me re-check the mock signature...
- Fix: Review the `emitCompleted` function signature and the test invocation. The test at line 163-166 passes top-level fields to `emitCompleted`, suggesting the override object structure should match the `AiAnalysisCompletionOverrides` interface at lines 49-54. But then the mock should construct the SSE payload correctly by nesting these inside `analysis`. Looking at line 236 in the mock, the completion is `{ success, analysis: analysisResult, error_message }`, so the `analysis` field holds the nested structure. The issue is: the test passes `analysis: null` as an override (line 164), which should be interpreted as "override the entire analysis object to null" but the mock at lines 223-234 ignores the `analysis` override when building `analysisResult` and instead uses individual overrides for `duplicate_parts` and `analysis_failure_reason`. The mock needs to check if `overrides?.analysis` is explicitly provided and use that directly, otherwise build `analysisResult` from individual field overrides. Currently, line 164 `analysis: null` is an override field, but line 223 `const analysisOverride = overrides?.analysis;` would capture that null, and then line 224 checks `analysisOverride === null` to decide whether to skip building `analysisPayload`. So the logic *should* work. But line 165 also provides `duplicate_parts: null` and line 166 provides `analysis_failure_reason: failureMessage`, which are separate override fields. The mock interface at lines 51-53 shows `analysis`, `duplicate_parts`, and `analysis_failure_reason` as separate fields, but the backend contract has `duplicate_parts` and `analysis_failure_reason` nested inside `analysis`. This is the mismatch: the override interface treats them as siblings, but the backend nests them. The mock should only accept `analysis` override (which is a full analysis object), not separate `duplicate_parts` and `analysis_failure_reason` overrides. Or, the mock should merge `duplicate_parts` and `analysis_failure_reason` overrides into the `analysis` object construction. Looking at line 225-232, the mock does build an `analysisResult` object that includes all three fields when `analysisPayload` exists, and also includes `duplicate_parts` and `analysis_failure_reason` from overrides even when `analysisPayload` is null (lines 229-232). So for the test case where `analysis: null, duplicate_parts: null, analysis_failure_reason: failureMessage`, the mock will build `analysisResult = { analysis_result: null, duplicate_parts: null, analysis_failure_reason: failureMessage }` and then emit `{ success: true, analysis: analysisResult, error_message: null }`. The SSE hook will extract `parsedEvent.data.analysis` which is `analysisResult`, and pass that to `onResult` in the AI analysis hook. That hook calls `transformAIPartAnalysisResult(data as AIPartAnalysisResult)` where `data` is the `analysisResult` object with all three fields. This should work correctly. So this finding is also a false alarm—the mock structure is correct.
- Fix: No fix required. The mock correctly constructs the nested structure per the backend contract.
- Confidence: Low (likely a misunderstanding of the code; the implementation appears correct on deeper analysis)

**Minor — Trimming logic inconsistency**

- Evidence: `src/hooks/use-ai-part-analysis.ts:40` — Check uses `transformedResult.analysisFailureReason?.trim()` to determine if failure reason is present, but the transformation function at `src/lib/utils/ai-parts.ts:89-92` does not trim the string before assigning it to the transformed result.
- Impact: If backend returns `analysis_failure_reason: "  "` (whitespace only), the transformation will include `analysisFailureReason: "  "` in the result, but the hook check at line 40 will evaluate to falsy (empty string after trim), so it won't trigger the error path. However, the `if (result.analysis_failure_reason)` check at line 90 will be truthy, so the field will be included. Then in the hook, `transformedResult.analysisFailureReason` will be `"  "`, and `?.trim()` will return `""`, which is falsy, so the error path won't execute and the code will call `onSuccess` with a result that has a whitespace-only failure reason. This is unlikely to occur in practice (backend should sanitize), but creates ambiguity.
- Fix: Either trim the string in the transformation function (line 90: `transformed.analysisFailureReason = result.analysis_failure_reason.trim()`), or check for truthiness without trimming in the hook (line 40: `if (transformedResult.analysisFailureReason)`). The plan at line 248 specifies trimming prevents whitespace-only failures from triggering error UI, so keep the hook check with trim, but also trim in the transformation to ensure consistency. Add: `transformed.analysisFailureReason = result.analysis_failure_reason.trim() || undefined;` to only include the field if it has non-whitespace content.
- Confidence: Medium

---

## 4) Over-Engineering & Refactoring Opportunities

**Hotspot: Redundant error state management**

- Evidence: `src/hooks/use-ai-part-analysis.ts:27, 148` — New `localError` state duplicates error tracking already provided by `useSSETask` hook.
- Suggested refactor: Remove `localError` state and manage a single error state within the hook. Since `useSSETask` provides `sseError` for SSE-level failures and the hook needs to also capture analysis-level failures (when `analysisFailureReason` is present), introduce a single local `error` state that combines both sources. Update the `useSSETask` `onError` callback to set this local state, and also set it when analysis failure is detected. Return this unified error state from the hook.
- Payoff: Eliminates race conditions between two error state variables, simplifies cleanup logic in `cancelAnalysis`, and ensures error state is consistently cleared on retry.

**Hotspot: Mock interface allows ambiguous override combinations**

- Evidence: `tests/support/helpers/ai-analysis-mock.ts:49-54` — `AiAnalysisCompletionOverrides` interface allows specifying both `analysis` (full object) and `duplicate_parts`/`analysis_failure_reason` (individual fields) simultaneously, creating ambiguity about which takes precedence.
- Suggested refactor: Document the precedence rule in a comment above the interface, or restructure the interface to make it explicit: either provide `analysis` as a complete object, or provide individual field overrides. Could use a discriminated union: `{ type: 'full', analysis: ... } | { type: 'partial', duplicate_parts?, analysis_failure_reason? }`.
- Payoff: Clarifies the mock API contract for test authors and prevents confusion about override merging behavior.

---

## 5) Style & Consistency

**Pattern: Validation error message wording**

- Evidence: `src/lib/utils/ai-parts.ts:46-54` — Error message says "neither analysis_result, duplicate_parts, nor analysis_failure_reason populated" which uses "neither...nor" for three items (grammatically awkward; "neither...nor" is for two items).
- Impact: Minor readability issue in error messages that developers see during debugging.
- Recommendation: Reword to "at least one of analysis_result, duplicate_parts, or analysis_failure_reason must be populated" for clarity and grammatical correctness.

**Pattern: Console error prefix inconsistency**

- Evidence: `src/components/parts/ai-part-dialog.tsx:51` — Console error uses prefix "Analysis failed:", while test at `tests/e2e/parts/part-ai-creation.spec.ts:152` expects this exact pattern with `expectConsoleError(page, /Analysis failed:/)`.
- Impact: Test is tightly coupled to console error format. If prefix changes, test breaks.
- Recommendation: No change needed (this is intentional coupling for test verification), but document that the console error format is part of the test contract and shouldn't be changed without updating tests.

**Pattern: OpenAPI schema description update**

- Evidence: `openapi-cache/openapi.json:47-49` — Schema description was updated to document the new `analysis_failure_reason` field and the flexible response paths. The description now says "LLM can populate" multiple fields or combinations.
- Impact: Good documentation practice. Keeps API contract visible in the schema.
- Recommendation: No change needed. This is a positive consistency improvement.

---

## 6) Tests & Deterministic Coverage (new/changed behavior only)

**Surface: AI Part Dialog — Analysis Failure Path**

- Scenarios:
  - Given user submits AI analysis query, When backend returns `analysis_failure_reason` without analysis or duplicates, Then progress step displays error state with failure message, And dialog remains on progress step (not advancing to review), And retry button returns to input with preserved query text (`tests/e2e/parts/part-ai-creation.spec.ts:132-183`)
- Hooks:
  - `data-step="progress"` on dialog content (line 175)
  - `data-state="error"` on progress step container (line 171)
  - `data-testid="parts.ai.progress-error-message"` contains failure message text (line 172)
  - AI analysis mock `emitCompleted` with `analysis_failure_reason` override (line 163-166)
  - Page object `waitForError` helper asserts error state (line 168)
  - Page object `retry` helper clicks retry button and waits for input step (line 178-179)
  - `expectConsoleError` allows expected error log (line 152)
- Gaps: Test only covers the happy failure path (user retries after failure). Missing coverage for:
  - User cancels from error state instead of retrying (should close dialog cleanly)
  - User submits new query after retry (should clear previous error and start fresh analysis)
  - Failure reason combined with partial analysis or duplicates (plan section 3 mentions "multiple fields" scenario, but test only covers failure-only response)
  - Empty/whitespace-only failure reason (should route to success path per trimming logic at `use-ai-part-analysis.ts:40`)
- Evidence: `tests/e2e/parts/part-ai-creation.spec.ts:132-183`, `tests/support/page-objects/ai-dialog-page.ts:57-67`

**Surface: AI Part Dialog — Success Path (regression coverage)**

- Scenarios:
  - Given user submits query, When backend returns `analysis_result` without `analysis_failure_reason`, Then dialog advances to review step (existing test `creates part from AI analysis flow` at lines 8-131)
- Hooks: Existing instrumentation and assertions (no changes required)
- Gaps: None for the success path regression.
- Evidence: `tests/e2e/parts/part-ai-creation.spec.ts:8-131`

**Surface: Error State Cleanup (lifecycle verification)**

- Scenarios: Not explicitly covered in current test suite.
- Gaps:
  - Should verify that error state is cleared when user retries and gets successful analysis (not just when retry returns to input)
  - Should verify that canceling from error state clears error (though `cancelAnalysis` at `use-ai-part-analysis.ts:141-144` does clear `localError`, the test doesn't assert this)
- Evidence: No existing test coverage for error cleanup across retry cycles.

---

## 7) Adversarial Sweep

**Derived state ↔ persistence: Error state and query text coordination**

- Attack: User submits query "original query", gets failure reason "too vague", clicks retry, modifies to "refined query", gets different failure "still too vague", clicks retry again. Does the input field show the latest query or the original?
- Evidence: `src/components/parts/ai-part-dialog.tsx:67-71, 134` — `lastSearchText` is set only in `handleInputSubmit` when user submits, not when analysis completes. So the preserved text is always the *last submitted* text, which is correct. After first submission ("original query"), `lastSearchText="original query"`. After retry and second submission ("refined query"), `lastSearchText="refined query"`. On second retry, input shows "refined query". This is correct behavior.
- Why code held up: The state update happens at submission time, not at error time, so each retry-submit cycle updates `lastSearchText` to the latest query.

**Concurrency/async: Race between analysis result and component unmount**

- Attack: User submits analysis, immediately closes dialog (or navigates away) before SSE completes. SSE completion fires `onResult` callback which calls `transformAIPartAnalysisResult` and then `setIsAnalyzing(false)` and `options.onSuccess?.(transformedResult)`. If component is unmounted, does this cause React state updates on unmounted component?
- Evidence: `src/hooks/use-ai-part-analysis.ts:36-52, 189-193` — The `useSSETask` hook has cleanup effect at `use-sse-task.ts:189-193` that calls `disconnect()` on unmount, which closes the EventSource. However, if a `task_completed` event arrives just before unmount, the `onResult` callback will fire and execute the `setIsAnalyzing(false)` at line 48. This is a classic React warning scenario ("Can't perform a React state update on an unmounted component"). The `useAIPartAnalysis` hook doesn't have cleanup to prevent callbacks from firing after unmount.
- Mitigation: Add an `isMountedRef` or AbortSignal pattern to `useAIPartAnalysis` that prevents calling `setIsAnalyzing`, `setLocalError`, and option callbacks after unmount. Or, rely on the SSE hook's disconnect to prevent the callback from firing. Actually, the SSE hook's `disconnect` at line 138-139 happens inside the event listener before calling the callback, so if the component unmounts, the cleanup at line 189-193 closes the EventSource, which prevents new events. But if an event was already being processed (listener at line 108-156), the callback will fire. This is a potential issue.
- Confidence: Medium (React will warn but won't crash; this is a code smell rather than a user-facing bug)

**Query/cache usage: Analysis result caching and staleness**

- Attack: User submits query "query A", gets analysis result R1, navigates to review step, clicks back, submits same query "query A" again. Does the UI re-analyze or show cached result?
- Evidence: `src/hooks/use-ai-part-analysis.ts:65-137` — The `analyzePartFromData` function always creates a new FormData and submits a new POST request (lines 76-106), so there's no caching of analysis results by query text. The SSE hook also resets state on each `connect` call (lines 94-97 in `use-sse-task.ts`). So repeated submissions always trigger fresh analysis, which is correct per the feature requirements (no caching specified).
- Why code held up: No caching mechanism exists, so each submission is independent and fresh.

**Instrumentation & selectors: Missing test-event emission for analysis failure**

- Attack: Playwright test waits for a specific test-event signal that failure occurred (beyond just checking console.error). Does the instrumentation emit a structured event?
- Evidence: `src/hooks/use-ai-part-analysis.ts:42` — When analysis failure is detected, the code calls `emitComponentError(new Error(failureMessage), 'ai-part-analysis')`, which is the standard instrumentation pattern. The test at line 152 uses `expectConsoleError(page, /Analysis failed:/)` to allow the console error, and then asserts on UI state (line 168-172) rather than waiting for a test-event. The `emitComponentError` function (from `src/lib/test/instrumentation.ts` presumably) would emit an `error` test-event in test mode, which could be used for more precise assertions. However, the current test approach (UI state assertions) is valid and deterministic.
- Why code held up: Instrumentation follows existing patterns and emits component error events. Test uses UI assertions which are sufficient.

**Performance traps: Unnecessary re-renders from error state updates**

- Attack: The `localError` state (line 27) is updated in multiple places (lines 41, 46, 67, 129, 142). Each update triggers a re-render of the hook and any consuming components. Are these updates necessary, or could they be batched?
- Evidence: Most updates are in different execution paths (onResult success vs error vs cancel), so they won't batch. However, the redundancy with `sseError` means the component re-renders twice when an SSE error occurs: once when `useSSETask` updates `sseError`, and again when `useAIPartAnalysis` updates `localError` via the `onError` callback. This is inefficient but not a performance problem in practice (dialog only renders once at a time).
- Why code held up: The overhead is negligible for this use case (single dialog, infrequent updates). However, the redundant state is a refactoring opportunity (already noted in section 4).

---

## 8) Invariants Checklist

**Invariant: Error state is mutually exclusive with success state**

- Where enforced: `src/hooks/use-ai-part-analysis.ts:40-52` — When `analysisFailureReason` is detected, the code calls `onError` and returns early (line 47), preventing `onSuccess` from being called (line 51). The `setIsAnalyzing(false)` is set in both paths (lines 46, 48), ensuring consistent state.
- Failure mode: If the early return at line 47 was missing, both `onError` and `onSuccess` would be called for failure cases, causing the dialog to both show error and advance to review step (conflicting UI states).
- Protection: The `return` statement at line 47 guards this invariant. The code is correct.
- Evidence: `src/hooks/use-ai-part-analysis.ts:40-52`

**Invariant: Dialog step state matches analysis result structure**

- Where enforced: `src/components/parts/ai-part-dialog.tsx:35-53` — `onSuccess` callback routes to `duplicates` or `review` step based on result structure (lines 42-47), and `onError` callback keeps step at `progress` (line 50-53 implicit, no step change).
- Failure mode: If `onError` callback also attempted to set `currentStep`, it could conflict with the error UI expectation that the progress step will display the error. Or if `onSuccess` was called for failure cases (which can't happen due to invariant #1), the dialog would advance to review with a failure message, showing empty review fields.
- Protection: The hook enforces mutual exclusion (invariant #1), and the dialog callbacks respect the step contract (error stays on progress, success routes based on content).
- Evidence: `src/components/parts/ai-part-dialog.tsx:34-53`

**Invariant: Query text is preserved across retry cycles until dialog closes**

- Where enforced: `src/components/parts/ai-part-dialog.tsx:67-71, 78-80, 134` — `lastSearchText` is set on submit (line 68), used as `initialText` for input step (line 134), and only cleared on dialog close (line 63).
- Failure mode: If `lastSearchText` was cleared on retry (line 78-80), the input field would be empty when user clicks retry, losing their original query. If it was cleared on error, same issue. If it was never set, retry wouldn't prefill.
- Protection: State is set at submit, preserved through error/retry, and only cleared on close. The `handleRetryAnalysis` callback (lines 78-80) only changes the step, not the text.
- Evidence: `src/components/parts/ai-part-dialog.tsx:23, 63, 68, 78-80, 134`

**Invariant: Transformation function handles all three response scenarios**

- Where enforced: `src/lib/utils/ai-parts.ts:44-92` — Validation at line 44 ensures at least one of the three fields is populated. Transformation conditionally adds fields only if present in the source (lines 58-92), so the output can be analysis-only, duplicates-only, failure-only, or combinations.
- Failure mode: If validation required all three fields, or if transformation assumed certain fields were always present, failure-only responses would throw exceptions. If transformation didn't handle failure reason, the field would be dropped.
- Protection: Validation uses OR logic (line 44), and transformation uses conditional field assignment (lines 58-92). All optional fields in `TransformedAIPartAnalysisResult` type (`src/types/ai-parts.ts:22-49`) support this flexibility.
- Evidence: `src/lib/utils/ai-parts.ts:44-92`, `src/types/ai-parts.ts:22-49`

---

## 9) Questions / Needs-Info

**Question: Should empty or whitespace-only failure reasons be treated as errors or success?**

- Why it matters: The hook trims the failure reason string before checking truthiness (`src/hooks/use-ai-part-analysis.ts:40`), so a backend response with `analysis_failure_reason: "   "` would be treated as success and route to review/duplicates step. However, the transformation includes whitespace-only strings as-is (`src/lib/utils/ai-parts.ts:90`). This creates ambiguity: should whitespace-only reasons be normalized to `undefined` in transformation, or is the hook trim check sufficient?
- Desired answer: Confirm the intended behavior, and ensure transformation and hook check are aligned. If whitespace-only should be treated as "no failure", trim in transformation (line 90). If it should be treated as failure but displayed, remove trim from hook check (line 40).

**Question: What is the expected behavior when both `analysisFailureReason` and partial `analysis_result` are present?**

- Why it matters: The plan at line 48 mentions "multiple fields" scenario where both failure reason and partial analysis might be returned. The current hook logic (line 40-47) treats any failure reason as an error and short-circuits, ignoring any analysis data that might also be present. Is this correct, or should partial analysis be shown to the user along with the failure context?
- Desired answer: Clarify the product requirements. If partial analysis should be shown, the hook logic needs to change to route to review step with the failure reason displayed as a warning rather than stopping at progress error.

**Question: Are there analytics or logging requirements for analysis failures?**

- Why it matters: The plan at section 15 mentions "analytics track analysis failure reasons for product insights" as an open question marked out of scope. The current implementation emits a component error event (`src/hooks/use-ai-part-analysis.ts:42`), which is captured in test mode. Should production also log these failures for monitoring or product analysis?
- Desired answer: Confirm whether additional logging (e.g., to a backend analytics endpoint) is needed, or whether the existing error instrumentation is sufficient. If logging is needed, should it happen in the hook or be added separately?

---

## 10) Risks & Mitigations (top 3)

**Risk: Race condition between error states causes stale error messages to persist across retry cycles**

- Mitigation: Refactor `useAIPartAnalysis` to use a single error state variable instead of `localError` and `sseError`. Ensure this state is cleared at the start of each analysis attempt (in `analyzePartFromData` before submission) and on cancel. Verify with a test that submits, gets error, retries, gets success, and asserts no error is shown.
- Evidence: Finding #1 (`src/hooks/use-ai-part-analysis.ts:27, 148`)

**Risk: Validation logic might reject valid backend responses in edge cases**

- Mitigation: Add unit tests for `transformAIPartAnalysisResult` that cover all three scenarios: (1) analysis-only, (2) duplicates-only, (3) failure-reason-only. Verify the validation passes and transformation succeeds for each. Add a fourth test for empty object (all fields null) to ensure it throws as expected. This will confirm the validation logic at line 44 is correct.
- Evidence: Initial concern from Finding #2 (downgraded after deeper analysis, but still worth explicit test coverage)

**Risk: Test coverage gaps for error cleanup and multi-step retry flows**

- Mitigation: Add Playwright tests for: (1) cancel from error state, (2) retry from error → submit new query → successful analysis (assert error cleared), (3) retry from error → cancel (assert dialog closed cleanly). These scenarios verify the error state lifecycle and ensure no stale state persists across dialog interactions.
- Evidence: Section 6 coverage gaps (error state cleanup and lifecycle verification)

---

## 11) Confidence

Confidence: High — The implementation follows established patterns, correctly extends the type system and data transformation layer, and includes test coverage for the primary failure path. The major findings (error state race condition, validation wording) are fixable with small, localized changes. The code demonstrates good understanding of the existing architecture (SSE hooks, dialog step management, instrumentation) and integrates the new feature cleanly without over-engineering. Once the error state management is simplified and the trimming logic is made consistent, the implementation will be production-ready.
