# Plan Review: AI Analysis Warning Display

## 1) Summary & Decision

**Readiness**

The plan is implementation-ready with clear scope, comprehensive evidence, and well-defined test coverage. It demonstrates deep understanding of the existing codebase through extensive file citations and follows established architectural patterns. The routing logic update is straightforward and properly guards against both hard failures (error state) and soft failures (warning display). All required UI components, test infrastructure, and data contracts already exist, minimizing implementation risk. The plan correctly identifies that no backend changes are needed and leverages existing SSE infrastructure.

**Decision**

`GO` — Plan meets all conformance requirements, provides sufficient implementation detail with evidence, and defines deterministic test scenarios. The change is minimal, well-scoped, and builds on proven patterns.

## 2) Conformance & Fit (with evidence)

**Conformance to refs**

- `docs/commands/plan_feature.md` — Pass — `plan.md:1-425` — Plan follows all required section headings (0-16), provides evidence citations with file:line references throughout, uses required templates for data models, API surfaces, algorithms, test plans, and risks. Research log (section 0) documents discovery work comprehensively.

- `docs/product_brief.md` — Pass — `plan.md:28-38` — Feature aligns with AI helpers scope (section 9, lines 106-109 of product brief: "Auto-tagging from the description and manufacturer code. Photo intake...tries to recognize the part number...fetch a datasheet PDF"). The plan correctly handles partial AI results which fits the product intent of AI assistance being helpful but fallible.

- `docs/contribute/architecture/application_overview.md` — Pass — `plan.md:100-114, 145-158` — Plan correctly references generated API types (`TransformedAIPartAnalysisResult` from `src/types/ai-parts.ts`), uses existing transformation layer (`transformAIPartAnalysisResult`), and follows camelCase domain model convention. No ad hoc fetch usage—relies on existing SSE infrastructure and TanStack Query for mutations.

- `docs/contribute/testing/playwright_developer_guide.md` — Pass — `plan.md:336-382` — Test plan uses existing `aiAnalysisMock` fixture for deterministic backend behavior (follows "Backend Extensions for Complex Flows" guidance from guide lines 161-165), adds proper page object locators (`warningBar`, `warningMessage`), relies on `data-testid` attributes without request interception, and specifies Given/When/Then scenarios with clear instrumentation expectations.

**Fit with codebase**

- `src/hooks/use-ai-part-analysis.ts` — `plan.md:66-68` — Plan correctly identifies the routing decision at lines 39-47 where `analysisFailureReason` triggers error state without checking for presence of analysis data. The proposed fix (check for `description` presence before routing to error) aligns with how `ai-part-dialog.tsx:39` already uses `!!result.description` as the indicator of valid analysis.

- `src/components/parts/ai-part-review-step.tsx` — `plan.md:72-75` — Plan references existing duplicate bar pattern (lines 210-214) as template for warning bar placement. Component already accepts `analysisResult` prop containing `analysisFailureReason` field, so no interface changes needed—warning bar can access `analysisResult.analysisFailureReason` directly.

- `src/components/ui/alert.tsx` — `plan.md:319-325` — Plan correctly identifies `Alert` component with `variant="warning"` (line 8 defines 'warning' variant, lines 126 map to amber styling). Component requires `testId` prop and supports icon display, matching plan's instrumentation requirements.

- `tests/e2e/parts/part-ai-creation.spec.ts` — `plan.md:84-87` — Plan extends existing test structure (lines 133-183 cover hard failure scenario). New test will follow same `aiAnalysisMock` pattern but emit both `analysis_result` and `analysis_failure_reason` simultaneously, which the mock already supports per line 163-168.

- `tests/support/page-objects/ai-dialog-page.ts` — `plan.md:90-92` — Plan adds locators following existing naming convention (`progressError` at line reference becomes `warningBar`, `progressErrorMessage` becomes `warningMessage`), maintaining consistency with `parts.ai.review.*` namespace.

## 3) Open Questions & Ambiguities

No blocking open questions remain. The plan addresses two product-level questions (dismissible warning, analytics tracking) in section 15 (lines 412-420) and correctly defers them as out-of-scope for initial implementation with clear rationale.

Research was performed adequately:
- Plan examined 16 source files (lines 5-15) to understand existing patterns
- Confirmed backend contract supports simultaneous fields (line 58)
- Verified transformation logic handles both fields (line 114)
- Checked test infrastructure supports dual-field emission (lines 96-98)

## 4) Deterministic Playwright Coverage (new/changed behavior only)

- Behavior: AI part creation dialog — soft failure with warning
- Scenarios:
  - Given AI analysis returns both `analysis_result` and `analysis_failure_reason`, When user submits prompt and SSE completes, Then dialog transitions to review step (not progress step with error) (`tests/e2e/parts/part-ai-creation.spec.ts` — new test)
  - Given warning bar is visible on review step, When user inspects warning message, Then exact `analysis_failure_reason` text is displayed
  - Given partial analysis with warning, When user clicks "Add Part", Then part creation succeeds despite warning
- Instrumentation:
  - `data-testid="parts.ai.review.warning-bar"` on Alert container (plan line 277)
  - `data-testid="parts.ai.review.warning-message"` on message text element (plan line 286)
  - `data-step="review"` on dialog to verify routing (plan line 351)
  - Existing `emitComponentError` only fires for hard failures (plan lines 292-297)
- Backend hooks: Existing `aiAnalysisMock` fixture with `emitCompleted` override to include both `analysis_result` and `analysis_failure_reason` fields (plan lines 347-350, evidence at `tests/e2e/parts/part-ai-creation.spec.ts:163-168`)
- Gaps: None — all elements defined with clear test expectations
- Evidence: `plan.md:336-382` test plan section with three scenario blocks covering soft failure, hard failure (existing), and warning+duplicate bar coexistence

---

- Behavior: Hard failure routing (existing behavior verification)
- Scenarios:
  - Given AI analysis returns only `analysis_failure_reason` (no `analysis_result`), When SSE completes, Then dialog stays on progress step showing error UI
- Instrumentation: Existing test at lines 133-183 of spec file
- Backend hooks: Existing `aiAnalysisMock` with `emitCompleted({ analysis: null, analysis_failure_reason: "..." })`
- Gaps: None — existing coverage confirmed in plan line 364-366
- Evidence: `plan.md:355-366`, `tests/e2e/parts/part-ai-creation.spec.ts:133-183`

---

- Behavior: Warning bar and duplicate bar coexistence
- Scenarios:
  - Given AI analysis returns `analysis_result`, `duplicate_parts`, AND `analysis_failure_reason`, When review step renders, Then both warning bar and duplicate bar are visible and warning bar appears above duplicate bar
- Instrumentation:
  - Assert both `partsAI.warningBar` and duplicate bar selector visible
  - Visual ordering can be verified via bounding box checks (optional, noted as potentially manual QA)
- Backend hooks: `aiAnalysisMock` emits all three fields
- Gaps: Visual ordering verification acknowledged as potentially manual; functional visibility assertions sufficient for automation (plan line 380)
- Evidence: `plan.md:370-382`

## 5) Adversarial Sweep (must find ≥3 credible issues or declare why none exist)

**Minor — Warning bar placement may conflict with duplicate bar spacing**

**Evidence:** `plan.md:194` and `src/components/parts/ai-part-review-step.tsx:210-214` — Plan states "Warning bar displays between heading and duplicate bar section" and "Warning bar should follow duplicate bar positioning (line 212-214) but appear above it."

**Why it matters:** Both bars use `mb-6` margin (duplicate bar line 31 in `ai-duplicate-bar.tsx`). If warning bar is inserted immediately before duplicate bar without proper spacing, visual hierarchy may be unclear or spacing may stack incorrectly.

**Fix suggestion:** Plan should specify exact placement within the review step component structure. Based on current duplicate bar at line 212-214 which appears after heading (line 203-208) and before content grid (line 216), the warning bar should be inserted at line 211 (before duplicate bar conditional) with its own `mb-6` class. Update plan section 5 (lines 185-195) to clarify: "Warning bar renders at line 211 (between heading div and duplicate bar conditional), uses `mb-6` class for consistent spacing with duplicate bar pattern."

**Confidence:** High

---

**Minor — Plan doesn't specify warning bar max-height for long failure messages**

**Evidence:** `plan.md:400-402` — Risks section mentions "Long failure messages cause warning bar to overflow" and suggests "If needed, add `max-h-32 overflow-y-auto`" but defers to implementation review. Section 5 (lines 185-195) doesn't specify scrolling behavior in the core algorithm description.

**Why it matters:** Backend can return arbitrarily long `analysis_failure_reason` messages. Without defined constraints, extremely long messages could push content offscreen or break layout on mobile viewports. The Alert component (lines 1-197 of `src/components/ui/alert.tsx`) uses flex layout but doesn't enforce height limits.

**Fix suggestion:** Add to section 5 algorithm (after line 191): "5a. If `analysisFailureReason` exceeds 200 characters, truncate with ellipsis or wrap within max-height container (`max-h-32 overflow-y-auto`)." Then update section 12 UX Impact (line 322) to note: "Warning text may scroll if longer than ~4 lines to maintain layout stability." This converts the risk mitigation into a planned behavior.

**Confidence:** Medium (depends on typical failure message length in production, but guardrails are cheap)

---

**Minor — Test plan doesn't verify warning persistence across back/forward navigation**

**Evidence:** `plan.md:266-270` — Section 8 edge case describes "User navigates back from review step after seeing warning" and states "warning derives from analysis result which is preserved during dialog session." However, section 13 test plan (lines 336-382) only covers initial warning display, not back button behavior.

**Why it matters:** The dialog's `lastSearchText` state (line 23 in `ai-part-dialog.tsx`) is preserved across back navigation, but `analysisResult` comes from hook state which may reset. If the hook doesn't persist result across step transitions, the warning could disappear when user returns to review step after clicking back. Section 7 (lines 224-230) claims coordination is correct but doesn't cite evidence from hook implementation.

**Fix suggestion:** Add to section 13 test scenarios (after line 353): "Given user on review step with warning, When user clicks 'Go Back' then re-submits same prompt, Then warning reappears on review step with same message." This scenario would catch any state management bugs. Alternatively, research the `useAIPartAnalysis` hook to confirm `result` state persists when `isAnalyzing` is false and document the evidence in section 7 (currently line 228 claims "Review step renders based on `analysisResult` prop passed from dialog" but doesn't prove dialog preserves the result during back navigation).

**Confidence:** Medium (may be a non-issue if result state is indeed preserved, but plan should verify with evidence)

---

**Check attempted:** Stale cache / TanStack Query invalidation after part creation with warning

**Evidence:** `plan.md:224-230` — Section 7 states "Dialog component subscribes to hook's `onSuccess` and `onError` callbacks to determine step routing. Review step renders based on `analysisResult` prop passed from dialog." No mention of query invalidation or cache updates related to warning display.

**Why the plan holds:** Warning bar is purely presentational (line 193: "Purely presentational — no state management within warning bar"). Part creation mutation (`usePostAiPartsCreate` at `ai-part-dialog.tsx:25`) follows standard mutation pattern which automatically invalidates parts list cache per application architecture (section 4 of `docs/contribute/architecture/application_overview.md:36-40`). Warning does not affect cache keys or write any derived state, so no additional invalidation needed.

---

**Check attempted:** React 18 concurrent rendering issues with SSE result and routing decision

**Evidence:** `plan.md:227-228` — "Hook's `onResult` callback executes synchronously once SSE completes, so no race conditions between routing decisions."

**Why the plan holds:** The app uses React 19 (per `docs/contribute/architecture/application_overview.md:7`), but even with concurrent features, the SSE `onResult` callback (lines 36-53 of `use-ai-part-analysis.ts`) sets state synchronously within a single event tick (`setError`, `options.onSuccess`, `setIsAnalyzing` all called sequentially). The dialog's routing logic (lines 35-49 of `ai-part-dialog.tsx`) is driven by the `onSuccess` callback which updates `currentStep` state, triggering a single re-render. No async coordination needed.

---

**Check attempted:** Warning bar displays HTML/script injection from backend failure message

**Evidence:** `plan.md:62` — "Warning text should display the exact `analysisFailureReason` message without modification."

**Why the plan holds:** React automatically escapes string content rendered as children (line 171 of `alert.tsx` renders `{children}` which will be the failure reason string). The Alert component doesn't use `dangerouslySetInnerHTML`, so XSS is prevented by React's default escaping. Backend is trusted source (server-side generated message), and even if backend were compromised, React's JSX escaping provides defense-in-depth.

## 6) Derived-Value & State Invariants (table)

- Derived value: `hasAnalysisData`
  - Source dataset: `transformedResult.description` from SSE result (filtered check: non-null/non-empty)
  - Write / cleanup triggered: Determines routing via early return in `useAIPartAnalysis.onResult` — if description absent, calls `setError()` and returns early to stay on progress step; if description present, calls `options.onSuccess()` to route to review step
  - Guards: Conditional check at `use-ai-part-analysis.ts:40` (currently only checks `analysisFailureReason`, plan updates to check both `analysisFailureReason` AND `!description`)
  - Invariant: If `description` is present, must route to review step regardless of `analysisFailureReason` presence; if `description` is absent AND `analysisFailureReason` present, must route to error state
  - Evidence: `plan.md:199-204`, `src/hooks/use-ai-part-analysis.ts:36-52`, `src/components/parts/ai-part-dialog.tsx:39`

- Derived value: `shouldShowWarning`
  - Source dataset: `analysisResult.analysisFailureReason` from review step props (filtered check: trimmed non-empty string)
  - Write / cleanup triggered: Controls conditional rendering of Alert component in review step — no side effects, no cache writes, purely presentational
  - Guards: Warning only renders when `currentStep === 'review'` AND `analysisFailureReason?.trim()` is truthy (double guard: dialog step state + field presence)
  - Invariant: Warning bar visible if and only if user is on review step with non-empty `analysisFailureReason`
  - Evidence: `plan.md:207-213`, `src/components/parts/ai-part-review-step.tsx:212-214` (duplicate bar pattern)

- Derived value: `shouldRouteToError`
  - Source dataset: `transformedResult.analysisFailureReason` and `transformedResult.description` (combined boolean logic)
  - Write / cleanup triggered: Triggers error state mutation via `setError(message)`, emits component error event, calls `options.onError` callback, prevents `options.onSuccess` callback (blocks navigation to review step)
  - Guards: Only routes to error when `analysisFailureReason` exists AND `description` does NOT exist (logical AND condition)
  - Invariant: Error routing occurs if and only if `analysisFailureReason` present without accompanying `description` field; success routing occurs if `description` present regardless of `analysisFailureReason`
  - Evidence: `plan.md:216-222`, `src/hooks/use-ai-part-analysis.ts:39-47`

None of these derived values use filtered datasets to drive persistent writes. All guards are appropriate:
- `hasAnalysisData` uses presence check (not filter) on unfiltered SSE result
- `shouldShowWarning` is display-only with no write side effects
- `shouldRouteToError` has explicit guards (requires failure reason AND absence of description)

No Major findings — all derived values properly scoped and guarded.

## 7) Risks & Mitigations (top 3)

- Risk: User ignores warning and creates part with incomplete/inaccurate data
- Mitigation: Warning bar uses prominent amber `variant="warning"` styling with AlertTriangle icon (default for warning variant per `alert.tsx:134`). Non-dismissible to ensure visibility. User must actively scroll past warning to reach "Add Part" button. Future enhancement could add confirmation dialog (deferred, out of scope per plan line 397).
- Evidence: `plan.md:394-397`, `src/components/ui/alert.tsx:121-137` (warning variant styling)

- Risk: Long failure messages break layout or become unreadable
- Mitigation: Alert component uses responsive flex layout with text wrapping (`flex gap-3` and `flex-1` content container at `alert.tsx:159-172`). Plan acknowledges risk and suggests `max-h-32 overflow-y-auto` if needed during implementation review (line 402). Recommendation: make this explicit in plan (see adversarial finding #2 above).
- Evidence: `plan.md:400-402`, `src/components/ui/alert.tsx:159-172`

- Risk: Backend changes contract and stops sending both `analysis_result` and `analysis_failure_reason` simultaneously
- Mitigation: Backend contract is stable per commit 5ca146e. Transformation logic (`transformAIPartAnalysisResult`) handles missing fields gracefully (returns `undefined` for absent fields). If backend changes behavior, tests will fail immediately (new test asserts both fields present), alerting team to contract break. Plan recommends backend integration test (backend team responsibility, line 408).
- Evidence: `plan.md:406-408`, `src/lib/utils/ai-parts.ts:89-92` (transformation trims and converts empty to undefined)

## 8) Confidence

Confidence: High — All required infrastructure exists (Alert component, test fixtures, transformation logic). Change is localized to routing logic and presentational layer with clear fallback behavior. Existing test for hard failure provides template for soft failure test. Risk surface is small (single conditional in hook, one new Alert in review component, two new test locators). No backend changes required. Plan provides extensive evidence (16 files examined, 40+ line citations) demonstrating thorough understanding of existing architecture and patterns.
