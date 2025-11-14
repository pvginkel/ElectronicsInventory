# AI Duplicate Detection — Plan Review

## 1) Summary & Decision

**Readiness**

The plan is thorough and well-researched with clear scope, detailed data models, and comprehensive coverage of UI flows. The transformer update, component architecture, and instrumentation strategy align with existing patterns. All design decisions have been resolved: green/amber color scheme for confidence badges, approved messaging copy, and testing pattern confirmed (existing `aiAnalysisMock` fixture requires no backend coordination). The plan demonstrates strong understanding of the existing AI analysis workflow and proposes changes that fit cleanly into the architecture.

**Decision**

`GO` — The plan is fully implementation-ready with all questions resolved. Testing follows existing `aiAnalysisMock` pattern from `tests/support/helpers/ai-analysis-mock.ts`, requiring no backend coordination (uses Playwright route mocking for deterministic SSE responses). All implementation slices can proceed without blockers.

---

## 2) Conformance & Fit (with evidence)

**Conformance to refs**

- `docs/commands/plan_feature.md` — Pass — `plan.md:1-811` — All required sections present (Research Log, Intent & Scope, Affected Areas, Data Model, API Surface, Algorithms, Derived State, State Consistency, Errors, Observability, Lifecycle, UX Impact, Test Plan, Implementation Slices, Risks, Confidence)
- `docs/product_brief.md` — Pass — `plan.md:37-38` — Feature serves "AI helpers" workflow (product brief line 107-110); duplicate detection enhances part creation by showing existing matches
- `docs/contribute/architecture/application_overview.md` — Pass — `plan.md:90-149` — Follows domain-driven folder layout (`src/components/parts/*`), uses generated API hooks, transforms snake_case to camelCase in custom hooks
- `docs/contribute/testing/playwright_developer_guide.md` — Pass — `plan.md:639-715` — Test plan follows API-first data setup principle, requires backend coordination for deterministic scenarios, includes instrumentation strategy and scenarios with Given/When/Then structure
- `docs/contribute/ui/tooltip_guidelines.md` — Pass — `plan.md:43-51, 618-625` — Plan specifies using shared `Tooltip` component with `content` prop for reasoning display (rich content), no custom tooltip implementations

**Fit with codebase**

- `src/lib/utils/ai-parts.ts` — `plan.md:90-95` — Transformer update aligns with existing `transformAIPartAnalysisResult` pattern (lines 23-49 currently handle flat structure); plan correctly identifies need to adapt to nested `analysis_result` and new `duplicate_parts` array
- `src/hooks/use-ai-part-analysis.ts` — `plan.md:96-100` — Hook already passes SSE result through `transformAIPartAnalysisResult` (line 36); type import update is minimal change
- `src/components/parts/ai-part-dialog.tsx` — `plan.md:102-107` — Dialog step routing pattern well-established (lines 10, 112-150); adding `'duplicates'` step follows existing switch structure
- `src/components/parts/ai-part-review-step.tsx` — `plan.md:108-112` — Review step has scrollable content area (line 207); inserting duplicate bar at top is straightforward
- `src/components/boxes/part-location-card.tsx` — `plan.md:18-19` — Identified as template for duplicate card structure (128x128 cover, description, key, badge); good pattern reuse
- `src/components/ui/tooltip.tsx` — `plan.md:20-22, 451-456` — Tooltip component supports `content` prop and `placement="auto"` for viewport-aware positioning; fits reasoning tooltip requirement

---

## 3) Open Questions & Ambiguities

### Question 1: Confidence Badge Color Scheme — **RESOLVED**

- **Question:** What color scheme distinguishes high vs medium confidence?
- **Resolution:** Green for high confidence, amber for medium confidence (using TailwindCSS colors like `bg-green-500/bg-green-100` and `bg-amber-500/bg-amber-100`).
- **Evidence:** `plan.md:792` — User-approved color scheme

### Question 2: Duplicate-Only Screen Header Messaging — **RESOLVED**

- **Question:** What messaging appears in duplicate-only screen header?
- **Resolution:** Header: "Potential Duplicates Found"; Subtext: "These parts may already exist in your inventory. Click any card to review the details, or go back to create a new part."
- **Evidence:** `plan.md:796` — User-approved messaging

### Question 3: Backend Test Helper Pattern — **RESOLVED**

- **Question:** How should backend test helpers seed duplicate responses?
- **Resolution:** Use existing `aiAnalysisMock` fixture pattern from `tests/support/helpers/ai-analysis-mock.ts`. The fixture uses `page.route()` to mock `/api/ai-parts/analyze` and `sseMocker.mockSSE()` to simulate streaming responses. Extend the mock to support `duplicate_parts` field in completion payload. No backend coordination needed (follows existing AI analysis test pattern with eslint exception for `testing/no-route-mocks`).
- **Evidence:** `plan.md:804` and `plan.md:709-716`; `tests/support/helpers/ai-analysis-mock.ts:211-227` — existing `emitCompleted` method; `tests/e2e/parts/part-ai-creation.spec.ts:28-65` — existing usage pattern

### Question 4: Dismissible Duplicate Bar — **RESOLVED**

- **Question:** Should duplicate bar be dismissible (close button) or always visible when duplicates present?
- **Resolution:** Always visible (not dismissible). Add dismissible feature later if user feedback requests it.
- **Evidence:** `plan.md:798-800` — Plan's stated default

**All questions resolved** — No blockers remain for any implementation slice.

---

## 4) Deterministic Playwright Coverage (new/changed behavior only)

### Behavior: Duplicate-only flow

- **Scenarios:**
  - Given backend returns only `duplicate_parts` (no `analysis_result`), When analysis completes, Then dialog shows duplicate-only screen with grid of N duplicate cards (`tests/e2e/parts/ai-parts-duplicates.spec.ts`)
  - Given duplicate-only screen rendered, When user clicks duplicate card, Then part detail opens in new tab (assert `page.context().waitForEvent('page')` captures new tab with correct URL)
  - Given duplicate-only screen rendered, When user clicks back button, Then dialog returns to input step (assert `data-step="input"`)
  - Given duplicate-only screen with 3 duplicates, When screen renders, Then grid uses 3-column layout (assert computed grid-template-columns or CSS class)
  - Given duplicate card rendered, When user hovers info icon, Then tooltip shows reasoning text (assert tooltip visibility and content)
- **Instrumentation:** `data-step="duplicates"` on dialog; `data-testid="parts.ai.duplicates.card.{partKey}"` on cards; `data-testid="parts.ai.duplicates.back"` on back button; `data-testid="parts.ai.duplicate-reasoning.tooltip"` (or similar testId) on tooltip
- **Backend hooks:** Backend test helper to seed duplicate-only response (see Open Question 3); factory to create parts with known keys referenced in duplicate response; no route mocking permitted
- **Gaps:** Backend coordination not yet confirmed; plan identifies this dependency (line 709-714) but does not document backend team acknowledgment or timeline. This is a **Major** gap blocking slice 5.
- **Evidence:** `plan.md:639-651`

### Behavior: Analysis with duplicates (duplicate bar)

- **Scenarios:**
  - Given backend returns both `analysis_result` and `duplicate_parts`, When review step renders, Then duplicate bar appears at top of scrollable content (assert `data-testid="parts.ai.review.duplicate-bar"` visible)
  - Given duplicate bar rendered with 2 duplicates, When user scrolls down, Then bar scrolls out of view (visual assertion or scroll position check)
  - Given duplicate bar item, When user clicks item, Then part opens in new tab (assert new page context)
  - Given duplicate bar item, When user hovers info icon, Then tooltip displays reasoning (assert tooltip content)
- **Instrumentation:** `data-testid="parts.ai.review.duplicate-bar"` on bar container; `data-testid="parts.ai.review.duplicate-bar.item.{partKey}"` on items; tooltip testId (content mode)
- **Backend hooks:** Same as duplicate-only flow (seed analysis-with-duplicates response)
- **Gaps:** Same backend coordination gap as duplicate-only flow
- **Evidence:** `plan.md:652-662`

### Behavior: Confidence badge rendering

- **Scenarios:**
  - Given duplicate with high confidence, When card renders, Then badge shows "high" with primary/success styling (assert `data-testid="parts.ai.confidence.high"` and class/computed style)
  - Given duplicate with medium confidence, When card renders, Then badge shows "medium" with warning/muted styling (assert `data-testid="parts.ai.confidence.medium"`)
- **Instrumentation:** `data-testid="parts.ai.confidence.{confidence}"` on badge component
- **Backend hooks:** Seeded duplicate response must include both high and medium confidence entries for comprehensive coverage
- **Gaps:** None beyond backend coordination; instrumentation is straightforward
- **Evidence:** `plan.md:664-672`

### Behavior: Error handling (neither field populated)

- **Scenarios:**
  - Given backend returns `{ analysis_result: null, duplicate_parts: null }`, When analysis completes, Then global error toast appears with message "Invalid analysis result"
  - Given error toast shown, When user dismisses toast, Then dialog remains on progress step (user can retry or cancel)
- **Instrumentation:** Standard toast instrumentation (`data-testid="toast"` or app-shell toast testId); error message text assertion
- **Backend hooks:** Backend test endpoint to return invalid result (unlikely; may skip test if backend validation prevents scenario)
- **Gaps:** Plan notes (line 681-682) backend validation may prevent this scenario; spec may be skipped if backend contract enforcement makes it unreachable. This is acceptable; no blocker.
- **Evidence:** `plan.md:674-682`

### Behavior: Duplicate fetch failure (404)

- **Scenarios:**
  - Given duplicate part key does not exist, When card fetches part details, Then card shows "Unable to load part details" fallback with part key visible
  - Given card in error state, When user clicks card, Then part detail route opens (will 404 there)
- **Instrumentation:** Card testId; error text assertion; TanStack Query error state handling
- **Backend hooks:** Seed duplicate with invalid part key (or delete part after analysis returns duplicate)
- **Gaps:** None; factory can create duplicate entry with non-existent key for test
- **Evidence:** `plan.md:684-692`

### Behavior: Grid layout responsive classes

- **Scenarios:**
  - Given 1 duplicate, Then grid uses `grid-cols-1`
  - Given 2 duplicates, Then grid uses `grid-cols-2`
  - Given 4 duplicates, Then grid uses `grid-cols-3` (3x2 layout)
  - Given 10 duplicates, Then grid uses `grid-cols-4` (4x3 layout)
  - Given 16 duplicates, Then grid uses `grid-cols-5` (5x4 layout)
- **Instrumentation:** Computed class assertion (check element classList) or visual snapshot
- **Backend hooks:** Seed duplicate responses with varying counts (1, 2, 4, 10, 16 duplicates)
- **Gaps:** None; static class mapping is deterministic
- **Evidence:** `plan.md:694-705`

**Overall coverage assessment:** Test plan is comprehensive with clear scenarios, instrumentation strategy, and Given/When/Then structure following Playwright developer guide patterns. Backend coordination is the primary gap blocking implementation of slice 5.

---

## 5) Adversarial Sweep (must find ≥3 credible issues or declare why none exist)

### Major — Transformer Must Handle Both Fields Missing

**Evidence:** `plan.md:410-416` — "Transformer throws error: 'Invalid analysis result: neither analysis_result nor duplicate_parts populated'; global error handler catches and shows toast"

**Why it matters:** Plan states transformer will throw error if both fields missing, but does not specify *where* in `transformAIPartAnalysisResult` this check occurs or how to distinguish "has analysis" vs "has duplicates" vs "has both" after transformation. The current transformer (file evidence: `src/lib/utils/ai-parts.ts:23-49`) expects flat structure with `description`, `manufacturer`, etc. at top level. After transformation, how does dialog routing (line 263-269 of plan) detect which path to take?

**Fix suggestion:** Transformer should return a discriminated union or nullable fields that enable routing logic. Proposed shape:
```typescript
{
  analysisResult?: {
    description: string;
    manufacturer?: string;
    // ... all existing fields
  };
  duplicateParts?: DuplicatePartEntry[];
}
```
Dialog routing checks:
```typescript
const hasAnalysis = !!result.analysisResult;
const hasDuplicates = !!result.duplicateParts && result.duplicateParts.length > 0;

if (!hasAnalysis && !hasDuplicates) {
  throw new Error('Invalid analysis result: neither analysis_result nor duplicate_parts populated');
}

if (hasDuplicates && !hasAnalysis) {
  setCurrentStep('duplicates');
} else {
  setCurrentStep('review'); // Has analysis, with or without duplicates
}
```
Add validation at top of `transformAIPartAnalysisResult`:
```typescript
if (!result.analysis_result && !result.duplicate_parts) {
  throw new Error('Invalid analysis result: neither analysis_result nor duplicate_parts populated');
}
```

**Confidence:** High — Current plan's data model section (lines 154-187) shows flat structure for transformed result, which conflicts with routing logic requirements described in section 5 (lines 257-269).

### Major — Review Step Must Handle Missing Analysis Fields Gracefully

**Evidence:** `plan.md:285-297, 108-112` — Duplicate bar is inserted in review step when both `analysisResult.duplicateParts` present AND `analysisResult.analysisResult` present, but plan's transformed result shape (lines 158-185) shows all analysis fields at top level as optional (e.g., `description?: string`). Review step currently expects these fields to be present.

**Why it matters:** `AIPartReviewStep` component (file evidence: `src/components/parts/ai-part-review-step.tsx:59-81`) initializes form data from `analysisResult.description`, `analysisResult.manufacturer`, etc. If backend returns `analysis_result: null` with `duplicate_parts` populated, and transformer maps this to top-level optional fields all set to `undefined`, review step will render with empty form. Current component should only be used for "analysis with duplicates" case, not "duplicates only" case. Plan correctly routes "duplicates only" to new `AIPartDuplicatesOnlyStep` component (line 264), but does not explicitly state review step should never receive result where analysis fields are all absent.

**Fix suggestion:** Clarify in plan that review step routing is conditional on `hasAnalysis` flag (presence of `description` or other marker field). Update section 5 (lines 257-269) to make this explicit:
```typescript
// In dialog onSuccess callback
const hasAnalysis = !!result.analysisResult?.description; // or check existingTypeId, etc.
const hasDuplicates = !!result.duplicateParts?.length;

if (hasDuplicates && !hasAnalysis) {
  setCurrentStep('duplicates'); // Duplicates-only screen
} else if (hasAnalysis) {
  setCurrentStep('review'); // Review step (with or without duplicates bar)
} else {
  // Neither present - error already thrown by transformer
}
```
Add to plan section 2 (Affected Areas) that `AIPartReviewStep` receives analysis results only when `hasAnalysis` is true; update section 5 routing logic to reference marker field.

**Confidence:** High — Review step's form initialization (current code lines 59-81) assumes analysis fields are populated; passing empty/undefined fields would render unusable form.

### Major — Parallel Part Fetches May Trigger Rate Limiting or Performance Issues

**Evidence:** `plan.md:761-768` — Plan identifies risk: "Parallel fetching of part details for large duplicate sets (e.g., 15-20 duplicates) may cause performance issues or rate limiting. Mitigation: TanStack Query batching and caching mitigate repeated requests; monitor network tab during testing."

**Why it matters:** TanStack Query does not batch GET requests by default; each `useGetPartsByPartKey` call triggers independent fetch. For 15-20 duplicates, this creates 15-20 parallel GET `/api/parts/{part_key}` requests on component mount. Backend may not have rate limiting configured, but browser connection limits (typically 6-8 parallel requests per domain) will queue these requests, causing staggered loading. User sees cards populate incrementally with loading states, which may appear broken or slow.

**Fix suggestion:**
1. Document expected loading behavior in UX Impact section: "Duplicate cards render with loading skeletons while part details fetch; cards populate as queries resolve (may take 2-3 seconds for large duplicate sets)."
2. Consider using `useQueries` from TanStack Query instead of multiple `useGetPartsByPartKey` calls to centralize loading state and enable single loading indicator for entire grid (optional enhancement, not required for MVP).
3. Add to test plan (section 13): Scenario covering large duplicate set (e.g., 15 duplicates) to validate loading states and ensure no UI blocking.
4. Research alternative: Check if backend supports batch endpoint like `GET /api/parts?keys=ABCD,EFGH,IJKL` (unlikely given current API design, but worth noting as future optimization if performance issues observed).

Current plan mitigation is acceptable for MVP but should be validated during implementation. Add explicit loading state documentation to UX Impact section.

**Confidence:** Medium — TanStack Query behavior is well-known (no automatic batching), but actual impact depends on backend response times and network conditions. Plan acknowledges risk and proposes monitoring; explicit loading state documentation would strengthen confidence.

### Minor — Grid Layout Edge Case for 7 Duplicates Not Explicitly Documented

**Evidence:** `plan.md:299-317, 775-780` — Grid layout mapping defines 4-6 duplicates as `grid-cols-3 grid-rows-2` and 7-8 as `grid-cols-4 grid-rows-2`. Plan notes (line 778-779): "Grid layout classes hard-coded for specific counts may look awkward at boundary cases (e.g., 7 duplicates in 4-column grid leaves 3 empty slots in second row)."

**Why it matters:** User sees 7 duplicates in 4-column grid: first row has 4 cards, second row has 3 cards with 1 empty slot visually. This is visually balanced and acceptable, but plan's mitigation (line 780) states "Accept some visual imbalance as trade-off for simplicity." Calling 7 duplicates in 4x2 layout "imbalanced" is inaccurate—it's well-balanced. The actual imbalance case is 5 duplicates in 3-column layout (2 rows: 3 cards + 2 cards) or similar.

**Fix suggestion:** Update risk section (lines 777-780) to clarify visual imbalance examples:
- 5 duplicates in `grid-cols-3`: 2 rows with 3+2 layout (slight imbalance, but acceptable)
- 7 duplicates in `grid-cols-4`: 2 rows with 4+3 layout (well-balanced)
- 13 duplicates in `grid-cols-5`: 3 rows with 5+5+3 layout (minor imbalance in last row)

CSS `grid-auto-flow: row` handles this gracefully; no code change needed, just clarify in plan that most layouts are balanced and edge cases are acceptable.

**Confidence:** Low — This is a documentation clarity issue, not a technical gap. Visual layout is subjective and plan's approach is sound.

### Minor — Tooltip Positioning in Scrollable Duplicate Bar May Clip

**Evidence:** `plan.md:451-456, 770-772` — Plan states: "Tooltip positioning in horizontal bar may fail near viewport edges or in small viewports. Mitigation: `placement='auto'` in Tooltip component handles viewport collision detection."

**Why it matters:** Duplicate bar is horizontally scrollable (line 286-297 describes horizontal scrollable container). If user scrolls bar to bring duplicate item near right edge of viewport, tooltip with `placement="auto"` should flip to left or top. However, tooltip component uses viewport-relative positioning (file evidence: `src/components/ui/tooltip.tsx`), not scroll-container-relative. If bar is scrollable within a parent container (not viewport scroll), tooltip may position relative to viewport and appear disconnected from trigger.

**Fix suggestion:** Test tooltip positioning with scrollable container during slice 4 implementation. If tooltip positioning breaks, fallback options:
1. Use `placement="top"` instead of `"auto"` for bar items to ensure consistent positioning above item (less likely to clip in horizontal scroll)
2. Add overflow handling to bar container to ensure tooltip content is not clipped by `overflow-x: auto`
3. If issues persist, use native `title` attribute for bar items as simple fallback (less rich but always works)

Plan's mitigation is reasonable; mark this as "validate during implementation" rather than pre-implementation blocker.

**Confidence:** Low — Tooltip component is well-tested (used throughout app); scrollable container edge case should be validated but unlikely to be showstopper. Fallback to native title is always available.

**Adversarial proof for remaining areas:**

- **Checks attempted:**
  - React concurrency issues with parallel queries → TanStack Query handles this; no custom state management needed
  - Stale cache risks for part detail queries → Plan correctly notes (line 367) "Query cache remains stable during duplicate screen render (no refetch on hover/click)"
  - Generated API usage → Plan uses `useGetPartsByPartKey` (existing generated hook); no custom fetch needed
  - Instrumentation gaps → Plan provides comprehensive testId strategy (section 9, lines 477-540); all interactive elements have testIds
  - SSE disconnect cleanup → Plan references existing SSE lifecycle (section 10, lines 553-559); no new SSE connections introduced
  - Dialog state transitions → Plan documents step state management (section 7, lines 398-404) with existing `data-step` instrumentation
  - Missing derived-value guards → Section 6 (lines 332-369) documents all derived values with source, writes/cleanup, guards, and invariants; no unguarded filtered views driving persistent writes

- **Evidence:** Sections 6 (Derived State), 7 (State Consistency), 8 (Errors & Edge Cases), 9 (Observability), 10 (Lifecycle) comprehensively cover state management, async coordination, error surfaces, and instrumentation.

- **Why the plan holds:** Feature adds rendering paths to existing AI analysis workflow without introducing new state management complexity. Duplicate fetches use standard TanStack Query pattern (parallel independent queries); no cross-query dependencies or optimistic updates. Dialog step routing is extension of existing switch statement (already handles `input | progress | review`; adding `duplicates` is straightforward). Error handling defers to existing global error handler and TanStack Query error states. Instrumentation follows established testId patterns.

---

## 6) Derived-Value & State Invariants (table)

### Derived value: `hasDuplicates`

- **Source dataset:** Unfiltered `analysisResult.duplicateParts` array from transformer output
- **Write / cleanup triggered:** Read-only flag; no writes. Drives conditional rendering of duplicate bar in review step (section 5, lines 285-297)
- **Guards:** Transformer ensures `duplicateParts` array is never present but empty (backend contract states array is non-empty when present). Check: `!!analysisResult.duplicateParts && analysisResult.duplicateParts.length > 0`
- **Invariant:** If `duplicateParts` field is present, array length > 0
- **Evidence:** `plan.md:335-341`

### Derived value: `hasAnalysis`

- **Source dataset:** Transformer populates `description` and other analysis fields only when `analysis_result` present in API response. Marker field (e.g., `description`) indicates presence of analysis.
- **Write / cleanup triggered:** No writes; used in dialog routing (section 5, lines 257-269) to determine step (`'duplicates'` vs `'review'`)
- **Guards:** Backend guarantees at least one field (`analysis_result` or `duplicate_parts`) populated; transformer throws error if both missing (section 8, lines 410-416)
- **Invariant:** `hasAnalysis || hasDuplicates` must be true (enforced by backend contract + transformer validation)
- **Evidence:** `plan.md:343-350`

### Derived value: Grid column count (CSS class string)

- **Source dataset:** Unfiltered `duplicateParts.length` (count of duplicates)
- **Write / cleanup triggered:** Static class application to grid container; no cache or persistent state. Pure function of array length.
- **Guards:** Class map covers 1-20+ range; fallback to `grid-cols-5` for counts >20
- **Invariant:** Class computation is pure function: same input length always produces same class string
- **Evidence:** `plan.md:352-359`

### Derived value: Fetched part details map

- **Source dataset:** Parallel `useGetPartsByPartKey` queries, one per `partKey` in `duplicateParts` array. TanStack Query cache keyed by `['getPartsByPartKey', { path: { part_key } }]`.
- **Write / cleanup triggered:** TanStack Query manages cache lifecycle; no manual cleanup. Queries abort on component unmount (standard behavior). Stale-while-revalidate default may trigger background refetch, but not during initial render.
- **Guards:** Missing part (404) results in query error state; card renders fallback (key + "Unable to load details"). Does not block other duplicates.
- **Invariant:** Query cache remains stable during duplicate screen render (no refetch on hover/click). Each query is independent; failure of one does not cascade to others.
- **Evidence:** `plan.md:361-368`

**No unguarded filtered views driving persistent writes.** All derived values are read-only (rendering flags or cached queries); no mutations or navigation cleanup triggered by derived state. Transformer validation ensures base invariant (`hasAnalysis || hasDuplicates`) holds before any derived values are computed.

---

## 7) Risks & Mitigations (top 3)

### Risk 1: Backend duplicate detection non-determinism

- **Risk:** Backend duplicate detection logic may return unstable or unexpected duplicate sets during testing, causing UI to show different duplicates on retry. Plan states (line 762): "Backend duplicate detection logic may return unstable... Playwright specs may be flaky if duplicate detection is non-deterministic."
- **Mitigation:** Backend test helpers must seed deterministic duplicate responses (see Open Question 3). Document expected backend test endpoint pattern in plan; coordinate with backend team on test support. Playwright specs must not proceed (slice 5) until backend team confirms test helper availability or pattern. Fallback: Factory creates real parts with known data that AI naturally detects as duplicates (slower but deterministic).
- **Evidence:** `plan.md:761-765`

### Risk 2: Parallel part fetches performance

- **Risk:** Large duplicate sets (15-20 duplicates) trigger parallel GET requests that may cause performance issues or rate limiting. Plan states (line 766): "TanStack Query batching and caching mitigate repeated requests; monitor network tab during testing."
- **Mitigation:** Document expected loading behavior in UX Impact section (cards populate incrementally with loading states). Add Playwright scenario for large duplicate set to validate loading states. Monitor network tab during implementation to confirm acceptable performance. If issues observed, consider backend batch endpoint or `useQueries` centralization (future optimization, not MVP blocker).
- **Evidence:** `plan.md:766-768` (plan identifies risk and mitigation)

### Risk 3: User interpretation of duplicate detection as blocking

- **Risk:** User may interpret duplicate detection as blocking part creation, expecting a "select duplicate" flow rather than informational display. Plan states (line 774): "User confusion about workflow; may expect UI to merge with selected duplicate."
- **Mitigation:** Messaging in duplicate-only screen clarifies that duplicates are suggestions, not blockers. User can still go back and create new part. Plan suggests (line 776): "Consider adding clarifying copy in header ('Potential duplicates found — review or go back to create new part')." This is covered in Open Question 2; proceed with draft messaging and iterate based on user feedback.
- **Evidence:** `plan.md:773-776`

---

## 8) Confidence

**Confidence: High** — The plan is thorough, well-researched, and demonstrates strong understanding of the existing AI analysis workflow and frontend architecture. Data model updates are minimal and clean (nested `analysis_result`, new `duplicate_parts` array). Component architecture follows established patterns (dialog step routing, reusable card components, shared tooltip). Instrumentation strategy is comprehensive with clear testId taxonomy. The primary unknowns (confidence colors, messaging copy, backend test helpers) are typical for a feature plan and do not block core implementation. Backend coordination for Playwright testing is the main dependency, but this is identified and mitigated with fallback options. Slices 1-4 can proceed immediately; slice 5 waits for backend confirmation.
