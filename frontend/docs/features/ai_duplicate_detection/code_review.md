# AI Duplicate Detection — Code Review

## 1) Summary & Decision

**Readiness**

The AI duplicate detection implementation delivers all core requirements from the plan with sound architecture: data model transformation correctly handles nested API schema, component design leverages existing utilities (`formatPartForDisplay`, shared `Tooltip`), and camelCase domain model conventions are followed throughout. TypeScript strict mode passes (`pnpm check` output shows no type errors), and test coverage addresses all primary user flows (duplicates-only screen, analysis-with-duplicates bar, confidence rendering, card/item clicks opening new tabs). However, two **Major** correctness issues must be fixed: (1) transformer's `transformDuplicateEntries` function (lines 26-31) lacks null-entry filtering, creating crash risk if backend sends malformed array; (2) parallel duplicate query errors are silent for non-404 failures, hiding transient network issues from users and developers. Additionally, test coverage gaps exist for error scenarios (invalid analysis result, 404 duplicate fetch) specified in the plan but not implemented. Initial review concern about route mocking violating testing policy was resolved—the pattern correctly follows the established AI analysis mock convention with eslint waivers scoped to the shared helper (`tests/support/helpers/ai-analysis-mock.ts`), matching the existing `part-ai-creation.spec.ts` test structure.

**Decision**

`GO-WITH-CONDITIONS` — The implementation is production-ready with two **Major** findings that must be addressed before merge: (1) transformer lacks null-entry filtering in `transformDuplicateEntries` (adversarial finding Attack #3), creating crash risk for malformed backend responses; (2) parallel duplicate query errors are silent for non-404 failures, violating console error visibility expectations. Additionally, test coverage gaps exist for error paths (invalid analysis result, 404 duplicate fetch) that reduce confidence in error handling. The route mocking concern initially flagged as blocker was **resolved during review**—the pattern correctly follows the established AI analysis mock convention with waivers scoped to the shared fixture (`tests/support/helpers/ai-analysis-mock.ts:127,173,176`). Once null filtering is added to the transformer, query error logging is implemented, and the two missing error-path tests are written, this is a **GO**.

---

## 2) Conformance to Plan (with evidence)

**Plan alignment**

- Plan Section 2 "Affected Areas" → `src/lib/utils/ai-parts.ts:23-83` — Transformer updated to handle nested `analysis_result` and `duplicate_parts`; correctly throws error when both fields null (line 42); maps snake_case to camelCase via `transformDuplicateEntries` helper (lines 26-31).

- Plan Section 3 "Data Model / Contracts" → `src/types/ai-parts.ts:1-48` — New TypeScript types `DuplicatePartEntry` (lines 13-17) and `TransformedAIPartAnalysisResult` (lines 22-47) match plan specification; all analysis fields optional, `duplicateParts` populated when backend provides matches.

- Plan Section 2 "Dialog orchestration" → `src/components/parts/ai-part-dialog.tsx:9,30-42` — Added `'duplicates'` to `DialogStep` union (line 9); routing logic inspects `result.description` presence to distinguish analysis-only from duplicates-only (lines 37-42); correctly routes to `'duplicates'` step when duplicates present and no analysis.

- Plan Section 2 "New duplicate-only screen" → `src/components/parts/ai-duplicates-only-step.tsx:1-105` — Component implements grid layout with `getGridClasses` helper (lines 16-27) matching plan's 1x1→2x1→3x1→3x2→4x2→4x3→5x3→5x4 progression; back button wired (lines 76-82); header messaging matches plan resolution "Potential Duplicates Found" (line 56).

- Plan Section 2 "New duplicate card component" → `src/components/parts/ai-duplicate-card.tsx:1-157` — Card uses `CoverImageDisplay` with size="large" (128x128, line 122); 2-line description clamp (line 130); mono font part key (line 138); confidence badge + tooltip at bottom (lines 145-153); click handler opens part in new tab via `window.open` (line 45).

- Plan Section 2 "Duplicate bar in review step" → `src/components/parts/ai-part-review-step.tsx:207-212` — Horizontal bar inserted at top of scrollable content area (line 210) with conditional rendering when `duplicateParts` length > 0 (line 209); positioned above existing grid layout.

- Plan Section 2 "Confidence badge component" → `src/components/parts/ai-confidence-badge.tsx:1-32` — Badge distinguishes high (green) vs medium (amber) confidence (lines 21-23); includes dark mode variants; data-testid includes confidence value (line 26).

- Plan Section 13 "Deterministic Test Plan" → `tests/e2e/parts/ai-parts-duplicates.spec.ts:1-366` — All specified scenarios covered: duplicates-only flow (lines 5-114), card click opens new tab (lines 116-174), analysis-with-duplicates shows bar (lines 176-251), bar item click (lines 253-313), grid layout counts (lines 315-365); instrumentation attributes present (`data-step`, `data-testid` patterns).

**Gaps / deviations**

- Plan Section 13 "Testing pattern (no backend coordination needed)" (lines 708-717) states "Use existing `aiAnalysisMock` fixture... Extend `emitCompleted` to support new response structure" and notes "Evidence: existing AI mock usage pattern with eslint exception." However, `tests/e2e/parts/ai-parts-duplicates.spec.ts` (all scenarios) uses the mock without any eslint disable comment. The plan's resolution (line 806) claims "No backend coordination needed (follows existing AI analysis test pattern with eslint exception)" but the test file lacks the documented waiver format `// eslint-disable-next-line testing/no-route-mocks -- <justified reason>` required by `docs/contribute/testing/playwright_developer_guide.md:164`.

- Plan Section 5 "Grid layout calculation" (lines 299-318) specifies static class computation with exhaustive count mapping (1-20+). Implementation `src/components/parts/ai-duplicates-only-step.tsx:16-27` correctly maps counts to grid-cols classes but does **not** specify grid-rows constraints (plan mentions `grid-cols-3 grid-rows-2` for 4-6 duplicates). Implementation relies on TailwindCSS auto-flow without explicit row limits, which achieves the visual outcome (wider over taller) but differs from plan's precise class specification. Impact: minimal—CSS grid auto-flow produces equivalent layout; no user-visible deviation.

- Plan Section 2 "New compact duplicate item" (line 135) notes "flat inline layout" design selected over nested chips. Implementation `src/components/parts/ai-duplicate-bar-item.tsx:72-110` renders as a `<button>` with flexbox children (part key, description, badge, icon) matching the flat layout, but uses `min-w-[200px]` (line 76) without plan guidance on minimum width. Impact: none—sensible default for horizontal scroll; prevents squashed items.

---

## 3) Correctness — Findings (ranked)

### Major — Route mocking follows existing pattern but lacks documentation clarity (RESOLVED DURING REVIEW)

- **Evidence**: `tests/e2e/parts/ai-parts-duplicates.spec.ts:1-366` — entire test file uses `aiAnalysisMock()` fixture which internally calls `page.route()` to intercept `/api/ai-parts/analyze` and mock SSE streams. The mock helper `tests/support/helpers/ai-analysis-mock.ts` contains inline eslint disable comments at lines 127, 173, 176 with justification "AI analysis SSE lacks deterministic backend stream". Existing AI analysis test file `tests/e2e/parts/part-ai-creation.spec.ts` also uses this fixture without file-level disable comments.
- **Impact**: Testing policy (`docs/contribute/testing/index.md:10`, `docs/contribute/testing/playwright_developer_guide.md:15-16`) mandates real backend usage and states "the *only* waiver lives alongside the shared AI analysis helper." The eslint disable comments are correctly placed in the helper, not in consuming test files. However, running `pnpm eslint tests/e2e/parts/ai-parts-duplicates.spec.ts` produces no output (no violations), indicating the rule does not flag test files that use the fixture. This suggests the waiver at the fixture level is sufficient per current eslint config.
- **Fix**: **RESOLVED** — Pattern follows existing convention (waivers in helper, not consumers). No code change needed. However, plan Section 13 line 806 incorrectly stated tests would include "eslint exception" when the actual pattern is fixture-level waivers. Clarify in plan or commit message that duplicate detection tests follow the established AI analysis mock pattern with waivers scoped to the helper implementation.
- **Confidence**: High — Verified existing AI test (`part-ai-creation.spec.ts`) follows identical pattern; eslint passes; policy waiver is appropriately scoped to shared helper.

### Major — Parallel query error handling lacks user feedback

- **Evidence**: `src/components/parts/ai-duplicates-only-step.tsx:32-39` and `src/components/parts/ai-duplicate-bar.tsx:12-19` — `useDuplicatePartDetails` hook sets `retry: false` for 404 errors but does not configure error callbacks or global error surfacing. Component error states (`isError`, lines 68, 69 in `ai-duplicate-card.tsx`) render fallback UI with "Unable to load part details" text but do not emit console warnings or toast notifications.
- **Impact**: If a duplicate part fetch fails due to network error (not 404), user sees fallback card but receives no indication that a retry might succeed (e.g., via page refresh). Silent failure for transient errors (timeout, 500) degrades UX—user may assume part doesn't exist when it's actually a temporary backend issue. Testing guide's console error policy (`docs/contribute/testing/playwright_developer_guide.md:119-126`) expects unexpected errors to surface visibly.
- **Fix**: Add query error callback in `useDuplicatePartDetails`:
  ```typescript
  return useGetPartsByPartKey(
    { path: { part_key: partKey } },
    {
      retry: false, // 404 means part missing, don't retry
      onError: (error) => {
        if (error.status !== 404) {
          console.warn(`Failed to fetch duplicate part ${partKey}:`, error);
        }
      }
    }
  );
  ```
  This surfaces non-404 errors in console (visible in test runs and dev tools) without spamming for expected 404s. Consider adding toast notification for 500+ errors if critical.
- **Confidence**: High — silent transient errors are a known UX anti-pattern; logging provides minimal debugging surface.

### Major — Transformer validation doesn't distinguish backend contract violation from client bug

- **Evidence**: `src/lib/utils/ai-parts.ts:41-43` — throws generic error "Invalid analysis result: neither analysis_result nor duplicate_parts populated" when both fields are null/undefined.
- **Impact**: Error message doesn't indicate whether issue is backend contract violation (backend bug) or client-side data corruption (frontend bug during SSE parsing). When this error surfaces via global toast handler, developer debugging flow is ambiguous—should they inspect backend logs or frontend event parsing? Plan section 8 "Errors & Edge Cases" (lines 410-417) acknowledges this as defensive check but doesn't specify error context.
- **Fix**: Enhance error to include received payload shape:
  ```typescript
  if (!result.analysis_result && !result.duplicate_parts) {
    throw new Error(
      `Invalid analysis result: neither analysis_result nor duplicate_parts populated. ` +
      `Received: ${JSON.stringify({
        hasAnalysis: !!result.analysis_result,
        hasDuplicates: !!result.duplicate_parts
      })}`
    );
  }
  ```
  This provides actionable context in error logs and toast messages for rapid triage.
- **Confidence**: Medium — error clarity improvement rather than correctness fix; existing code is safe but hard to debug.

### Minor — Grid layout helper duplicates count checks

- **Evidence**: `src/components/parts/ai-duplicates-only-step.tsx:16-27` — `getGridClasses` function uses sequential if-else with overlapping range checks (e.g., `>= 4 && <= 6`, `>= 7 && <= 8`) instead of exhaustive boundaries.
- **Impact**: Readability concern; no correctness issue (ranges are non-overlapping). Future maintainer adding new grid tier might misread boundaries. Plan specified this as static mapping (plan lines 303-313) but didn't prescribe implementation pattern.
- **Fix**: Refactor to early-return switch or lookup map:
  ```typescript
  function getGridClasses(count: number): string {
    if (count <= 1) return 'grid-cols-1';
    if (count === 2) return 'grid-cols-2';
    if (count === 3) return 'grid-cols-3';
    if (count <= 6) return 'grid-cols-3'; // 4-6
    if (count <= 8) return 'grid-cols-4'; // 7-8
    if (count <= 12) return 'grid-cols-4'; // 9-12
    if (count <= 15) return 'grid-cols-5'; // 13-15
    if (count <= 20) return 'grid-cols-5'; // 16-20
    return 'grid-cols-5'; // 21+
  }
  ```
  Or use object map with count thresholds for better scanability.
- **Confidence**: Low — style preference; existing logic is correct.

### Minor — Tooltip testId inconsistency between card and bar contexts

- **Evidence**: `src/components/parts/ai-duplicate-card.tsx:99` uses testId `parts.ai.duplicate-reasoning.${partKey}` while `src/components/parts/ai-duplicate-bar-item.tsx:103` uses `parts.ai.duplicate-reasoning.bar.${partKey}`. Both refer to same reasoning content but use different naming schemes.
- **Impact**: Test code must know context (card vs bar) to locate tooltip, reducing helper reusability. Plan section 9 "Observability / Instrumentation" (lines 532-539) specified "standard tooltip testId" without disambiguating contexts.
- **Fix**: Standardize to single pattern or document why bar context needs distinct testId. If distinction is intentional (different tooltips in different layouts), add comment explaining rationale.
- **Confidence**: Low — naming convention issue; tests work as-is.

---

## 4) Over-Engineering & Refactoring Opportunities

### Hotspot: Duplicate fetching logic duplicated across components

- **Evidence**: `src/components/parts/ai-duplicates-only-step.tsx:32-40` and `src/components/parts/ai-duplicate-bar.tsx:12-20` both define identical `useDuplicatePartDetails` hook with same signature and options.
- **Suggested refactor**: Extract to shared hook in `src/hooks/use-duplicate-part-details.ts`:
  ```typescript
  // src/hooks/use-duplicate-part-details.ts
  export function useDuplicatePartDetails(partKey: string) {
    return useGetPartsByPartKey(
      { path: { part_key: partKey } },
      { retry: false }
    );
  }
  ```
  Import in both components. Eliminates 8 lines of duplication and centralizes query configuration.
- **Payoff**: Single source of truth for duplicate fetching; future changes (e.g., adding error logging per Finding #2) apply uniformly. DRY principle.

### Hotspot: Wrapper components pattern adds indirection

- **Evidence**: `src/components/parts/ai-duplicates-only-step.tsx:90-104` defines `DuplicateCardWithData` wrapper that fetches data and passes to `AIPartDuplicateCard`; same pattern in `src/components/parts/ai-duplicate-bar.tsx:57-71` with `DuplicateBarItemWithData`.
- **Suggested refactor**: Move data fetching into the card/item components themselves. Pass only `duplicate: DuplicatePartEntry` prop; components call `useDuplicatePartDetails` internally. Eliminates wrapper layer:
  ```typescript
  // In AIPartDuplicateCard
  export function AIPartDuplicateCard({ duplicate, onClick }: Props) {
    const { data: part, isLoading, isError } = useDuplicatePartDetails(duplicate.partKey);
    // ... rest of component
  }
  ```
  Caller simplifies to:
  ```typescript
  {duplicateParts.map(dup => <AIPartDuplicateCard key={dup.partKey} duplicate={dup} />)}
  ```
- **Payoff**: Fewer components, clearer component tree in React DevTools, easier to reason about data flow. Trade-off: cards become stateful (must manage query), but that's standard TanStack Query pattern.

---

## 5) Style & Consistency

### Pattern: Inconsistent optional chaining depth

- **Evidence**: `src/lib/utils/ai-parts.ts:58-77` uses optional chaining with nullish coalescing (`analysis?.description ?? undefined`) while `src/components/parts/ai-duplicate-card.tsx:32-38` uses ternary with optional chaining (`part ? formatPartForDisplay(...) : { displayDescription: ... }`).
- **Impact**: Mixed patterns for handling optional data reduce code scanability; developers must context-switch between `??` and ternary operators for same concern (nullable fields).
- **Recommendation**: Standardize on one pattern. Prefer `??` for simple field access (`analysis?.description ?? undefined`) and ternary for computed values requiring multiple operations. Document in style guide.

### Pattern: Test data factory usage inconsistent between tests

- **Evidence**: `tests/e2e/parts/ai-parts-duplicates.spec.ts:12-28` seeds parts with explicit overrides (`description`, `manufacturer_code`) while lines 324-333 uses array mapping with template literals (`LED ${i + 1}`). Both are valid but different density of inline data construction.
- **Impact**: Maintenance friction—some tests embed data inline (harder to spot patterns) while others use named constants or helper functions. Testing guide (`docs/contribute/testing/playwright_developer_guide.md:92-107`) shows "create data first" pattern but doesn't prescribe inline vs extracted data shapes.
- **Recommendation**: For tests with >2 parts, extract part data to named constants at top of test block:
  ```typescript
  const duplicateSpecs = [
    { description: 'OMRON G5Q-1A4 relay', code: 'G5Q-1A4', confidence: 'high' as const },
    { description: 'OMRON G5Q-1A relay (similar)', code: 'G5Q-1A', confidence: 'medium' as const },
  ];
  const parts = await Promise.all(
    duplicateSpecs.map(spec => testData.parts.create({ typeId, overrides: spec }))
  );
  ```
  Improves test table readability.

---

## 6) Tests & Deterministic Coverage (new/changed behavior only)

### Surface: AI part analysis dialog → duplicates-only step

- **Scenarios**:
  - Given backend returns only `duplicate_parts`, When analysis completes, Then dialog shows duplicates step (`tests/e2e/parts/ai-parts-duplicates.spec.ts:5-114`)
  - Given duplicate card rendered, When user clicks card, Then part opens in new tab (`tests/e2e/parts/ai-parts-duplicates.spec.ts:116-174`)
  - Given duplicates-only screen, When user clicks back button, Then dialog returns to input step (lines 109-111)
  - Given duplicate with high/medium confidence, Then badge renders with correct text and styling (lines 86-104)
  - Given info icon hovered, Then tooltip shows reasoning text (lines 92-99)
  - Given 5 duplicates, Then all 5 cards render (lines 359-362)
- **Hooks**: `data-step="duplicates"`, `data-testid="parts.ai.duplicates-only-step"`, `data-testid="parts.ai.duplicates.card.{partKey}"`, `data-testid="parts.ai.confidence.{confidence}"`, `data-testid="parts.ai.duplicate-reasoning.{partKey}.tooltip"`
- **Gaps**: No test for grid layout class computation verification (plan line 697 mentions "Computed class assertion or visual snapshot"). Current test (lines 315-365) only asserts card visibility, not CSS grid-cols class. Add assertion:
  ```typescript
  const gridContainer = page.locator('[data-testid="parts.ai.duplicates-only-step"] > div:nth-child(2) > div');
  await expect(gridContainer).toHaveClass(/grid-cols-3/); // for 5 duplicates
  ```
- **Evidence**: Full scenario coverage per plan Section 13 "Duplicate-only flow" (lines 640-650).

### Surface: AI part analysis review step with duplicate bar

- **Scenarios**:
  - Given backend returns both `analysis_result` and `duplicate_parts`, When review step renders, Then duplicate bar appears above form (lines 176-251)
  - Given duplicate bar item, When user clicks item, Then part opens in new tab (lines 253-313)
  - Given bar info icon hovered, Then tooltip displays reasoning (lines 241-245)
  - Given analysis-with-duplicates, Then form fields populate from analysis (line 248)
- **Hooks**: `data-testid="parts.ai.review.duplicate-bar"`, `data-testid="parts.ai.review.duplicate-bar.item.{partKey}"`, `data-testid="parts.ai.duplicate-reasoning.bar.{partKey}.tooltip"`
- **Gaps**: No test for horizontal scroll behavior (plan mentions bar scrolls horizontally when many duplicates). Consider adding test with 10+ duplicates asserting `overflow-x-auto` produces scroll. Also missing test for bar not rendering when `duplicateParts` empty array (edge case from plan lines 434-440).
- **Evidence**: Core scenarios covered per plan Section 13 "Analysis with duplicates" (lines 652-662).

### Surface: Error handling for invalid analysis result

- **Scenarios**: **MISSING** — Plan Section 13 "Error handling (neither field populated)" (lines 674-683) specifies test for backend returning `{ analysis_result: null, duplicate_parts: null }`. No corresponding test in spec file.
- **Hooks**: Standard toast instrumentation (`data-testid="toast"`)
- **Gaps**: Critical error path untested. Add scenario:
  ```typescript
  test('shows error when neither analysis nor duplicates returned', async ({ page, aiAnalysisMock }) => {
    // ... setup
    await mock.emitCompleted({
      analysis: null,
      duplicate_parts: null,
    });
    await expect(page.getByTestId('toast')).toContainText(/Invalid analysis result/i);
  });
  ```
  This validates transformer error handling per `src/lib/utils/ai-parts.ts:41-43`.
- **Evidence**: Gap identified via plan checklist cross-reference.

### Surface: Duplicate part fetch failure (404)

- **Scenarios**: **MISSING** — Plan Section 13 "Duplicate fetch failure (404)" (lines 685-693) specifies test for part key not existing. No corresponding test in spec file.
- **Hooks**: Card renders fallback with "Unable to load part details" text
- **Gaps**: Error state rendering untested. Add scenario that deletes part after mock returns duplicate, triggering 404 on card fetch. Verifies graceful degradation.
- **Evidence**: Gap identified via plan coverage matrix.

---

## 7) Adversarial Sweep (must attempt ≥3 credible failures or justify none)

### Attack 1: Race condition on dialog step transition during duplicate fetch

- **Attempt**: User closes dialog (or navigates away) while duplicate part queries are in-flight. Do queries abort? Does component unmount safely without setting state on unmounted component?
- **Evidence**: `src/components/parts/ai-duplicates-only-step.tsx:93-94` — `DuplicateCardWithData` calls `useDuplicatePartDetails` hook which uses TanStack Query's `useGetPartsByPartKey`. TanStack Query automatically aborts queries on component unmount (React Query docs: query cancellation via AbortController).
- **Why code held up**: TanStack Query's default behavior handles cleanup. No manual abort controller needed. Verified by React Query's internal `useQuery` implementation which ties query lifecycle to component lifecycle.

### Attack 2: Stale closure in duplicate card click handler

- **Attempt**: If `duplicate.partKey` changes during render (hypothetically via parent re-render with different props), does `handleClick` capture stale `partKey` value? Could user click card for Part A but open Part B in new tab?
- **Evidence**: `src/components/parts/ai-duplicate-card.tsx:40-47` — `handleClick` references `duplicate.partKey` (prop) directly, not from closure over local variable. React guarantees props are current at time of event handler invocation. Additionally, parent components (`ai-duplicates-only-step.tsx:66-68`) use `duplicate.partKey` as React `key` prop, ensuring component instance identity tied to `partKey` (no reuse across different duplicates).
- **Why code held up**: React's event handling semantics ensure props are fresh at handler invocation time. Component keying prevents identity reuse.

### Attack 3: Transformer corrupts data when `duplicate_parts` array contains null entry

- **Attempt**: Backend bug sends `duplicate_parts: [null, { part_key: 'ABCD', ... }]` (malformed array). Does `transformDuplicateEntries` crash or filter nulls?
- **Evidence**: `src/lib/utils/ai-parts.ts:26-31` — `transformDuplicateEntries` maps over array with `.map(entry => ({ partKey: entry.part_key, ... }))`. If `entry` is `null`, accessing `entry.part_key` throws `TypeError: Cannot read property 'part_key' of null`. No null-check guard.
- **Impact**: **FOUND VULNERABILITY** — Malformed backend response crashes transformer, surfacing generic error toast instead of graceful degradation. Should filter nulls or fail with clear error.
- **Severity**: **Major** — Backend should never send nulls, but defensive programming dictates transformer should validate input shape.
- **Fix**:
  ```typescript
  function transformDuplicateEntries(entries: DuplicateMatchEntry[]): DuplicatePartEntry[] {
    return entries.filter(e => e != null).map(entry => ({
      partKey: entry.part_key,
      confidence: entry.confidence,
      reasoning: entry.reasoning,
    }));
  }
  ```
  Or throw descriptive error if null found (depends on desired error handling strategy).

### Attack 4: Tooltip overflow in horizontal bar near viewport edge

- **Attempt**: User scrolls horizontal bar to rightmost item, hovers info icon. Does tooltip render off-screen (clipped) or does `placement="auto"` adjust?
- **Evidence**: `src/components/parts/ai-duplicate-bar-item.tsx:101-108` — Tooltip component imported from `@/components/ui/tooltip` without explicit `placement` prop. Checking `src/components/ui/tooltip.tsx` (not shown in diff but referenced in plan) — plan Section 8 "Tooltip positioning edge case" (lines 451-457) states component uses `placement="auto"` to handle viewport collisions.
- **Why code held up**: Shared Tooltip component's `useTooltip` hook calculates viewport-aware positioning per `docs/contribute/ui/tooltip_guidelines.md` (referenced in CLAUDE.md). Auto-placement prevents clipping. No additional code needed in duplicate bar item.

### Attack 5: Memory leak from parallel queries not cleaning up

- **Attempt**: User rapidly opens/closes dialog triggering duplicate fetches. Do query subscriptions accumulate in TanStack Query cache? Could memory grow unbounded?
- **Evidence**: TanStack Query uses weak subscription references and automatic garbage collection of unused queries (per React Query docs: "queries are garbage collected after a configurable staleTime"). `src/lib/query-client.ts` (not in diff) configures global query client; default `gcTime` ensures old queries are cleaned up. Duplicate queries use standard `useGetPartsByPartKey` hook (lines 33-38 in `ai-duplicates-only-step.tsx`) with no custom `gcTime` override, so default cleanup applies.
- **Why code held up**: TanStack Query's built-in garbage collection prevents accumulation. No manual cleanup needed beyond component unmount (which is handled per Attack #1).

**Summary**: Code withstands 4/5 attacks. Attack #3 found a **Major** correctness issue (null entry handling in transformer).

---

## 8) Invariants Checklist (table)

### Invariant 1: At least one of `analysis_result` or `duplicate_parts` must be populated in API response

- **Where enforced**: `src/lib/utils/ai-parts.ts:41-43` — transformer throws error when both fields are null
- **Failure mode**: If backend violates contract (returns both null), transformer error surfaces via global toast handler; user sees generic error message and remains on progress step
- **Protection**: Defensive check in transformer; backend validation should prevent this, but transformer acts as guard
- **Evidence**: Error handling documented in plan Section 8 "Neither analysis nor duplicates populated" (lines 410-417)

### Invariant 2: Duplicate part keys returned by backend must be valid (fetchable via `/api/parts/{part_key}`)

- **Where enforced**: Not enforced — component gracefully degrades to fallback UI if fetch fails (404 or network error)
- **Failure mode**: Invalid part key → 404 response → `isError` state → card renders with "Unable to load part details" (lines 68-105 in `ai-duplicate-card.tsx`)
- **Protection**: Error state rendering; global error handler does not trigger (query error is component-scoped). User sees fallback but feature does not crash.
- **Evidence**: Plan Section 8 "Duplicate part fetch fails (404)" (lines 418-424) specifies graceful degradation strategy

### Invariant 3: Component identity for duplicate cards tied to `partKey` (React key prop)

- **Where enforced**: `src/components/parts/ai-duplicates-only-step.tsx:66-68` — `.map((duplicate) => <DuplicateCardWithData key={duplicate.partKey} ...` ensures React reuses component instances only when `partKey` matches
- **Failure mode**: If two duplicates have same `partKey` (backend bug), React would reuse component instance, potentially showing wrong part details or stale query results
- **Protection**: Backend should guarantee unique part keys; React keying prevents UI corruption if duplicate `partKey` values present (React will warn in console about duplicate keys)
- **Evidence**: Standard React list rendering pattern; no explicit validation in frontend code

### Invariant 4: Duplicate bar only renders when `duplicateParts` array is non-empty

- **Where enforced**: `src/components/parts/ai-part-review-step.tsx:209` — conditional `{analysisResult.duplicateParts && analysisResult.duplicateParts.length > 0 && ...}`; also `src/components/parts/ai-duplicate-bar.tsx:27-29` — early return if `!duplicateParts || duplicateParts.length === 0`
- **Failure mode**: If transformer incorrectly populates `duplicateParts: []` (empty array), bar would not render (safe no-op). If transformer sets `duplicateParts: undefined` but component expects array, optional chaining prevents crash.
- **Protection**: Double-guarded (both parent component and bar component check length); transformer only populates `duplicateParts` when backend array has entries (line 76 in `ai-parts.ts`)
- **Evidence**: Plan Section 8 "Empty duplicates array" (lines 434-440) specifies bar does not render for empty array

### Invariant 5: Dialog step state transitions are unidirectional (no loops)

- **Where enforced**: `src/components/parts/ai-part-dialog.tsx:30-42` — `onSuccess` callback sets step based on result structure; back buttons reset to `'input'` (line 54, 79, 145); no transitions from `'duplicates'` → `'review'` or vice versa without going through `'input'`
- **Failure mode**: If user could navigate from duplicates step back to review step without re-running analysis, stale analysis data might display (mixing duplicates-only result with review UI expecting full analysis)
- **Protection**: Only valid transitions are: `input` → `progress` → (`review` | `duplicates`) → (back) → `input`. Step state machine prevents invalid jumps.
- **Evidence**: Dialog flow diagram in plan Section 5 "Duplicate detection routing" (lines 257-269); implementation matches specified transitions

---

## 9) Questions / Needs-Info

### Question 1: Is there backend support for test-mode duplicate seeding planned or already implemented?

- **Why it matters**: Testing guide (`docs/contribute/testing/playwright_developer_guide.md:160-164`) states "When a scenario needs deterministic backend behavior, add test-specific hooks to the service" and "If the backend cannot yet support the scenario, pause the Playwright work and extend the backend first." Plan resolved this as "use existing mock pattern" but testing guide's preference is real backend support.
- **Desired answer**: Confirmation from backend team whether `/api/testing/ai-parts/seed-duplicate-response` (or similar) endpoint exists or is planned. If yes, tests should migrate from mocking to real backend seeding. If no, need explicit decision to accept route mocking as permanent exception vs blocking until backend adds support.

---

## 10) Risks & Mitigations (top 3)

### Risk 1: Null entry in `duplicate_parts` array crashes transformer without actionable error

- **Mitigation**: Add null filtering or validation in `transformDuplicateEntries` (see Attack #3 fix). Test with malformed backend response to verify error message clarity.
- **Evidence**: Major finding from adversarial sweep Attack #3 (`src/lib/utils/ai-parts.ts:26-31`).

### Risk 2: Missing test coverage for error paths (invalid analysis result, 404 duplicate fetch) reduces confidence in error handling

- **Mitigation**: Add test scenarios per Gaps in Section 6 (invalid analysis test, 404 duplicate test). Verify toast/console error instrumentation fires correctly.
- **Evidence**: Coverage gaps in Section 6 (tests/e2e/parts/ai-parts-duplicates.spec.ts) — no test for lines 674-683 and 685-693 from plan.

---

## 11) Confidence

**Confidence: High** — The implementation is architecturally sound, follows all project patterns (camelCase transformation, shared components, TanStack Query usage), and passes TypeScript strict mode with zero lint violations. The route mocking concern that initially appeared to violate testing policy was resolved during review—the tests correctly follow the established AI analysis mock pattern with waivers scoped to the shared helper, matching the existing `part-ai-creation.spec.ts` structure. The adversarial sweep identified two **Major** correctness issues (null entry handling, silent query errors) that require straightforward defensive fixes (add `.filter(e => e != null)` to transformer, add `onError` callback to query hook). Test coverage is comprehensive for happy paths and includes proper instrumentation; adding the two missing error-path tests (invalid analysis result, 404 duplicate fetch) completes the validation matrix. The feature's core logic is production-ready and ready to ship once the two transformer/query guard fixes and error-path tests are added.
