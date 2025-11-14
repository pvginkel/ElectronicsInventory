# AI Duplicate Detection — Technical Plan

## 0) Research Log & Findings

**Discovery Work:**

Examined the backend API changes to understand the new duplicate detection structure:
- `AIPartAnalysisResultSchema` now supports two mutually exclusive paths via `analysis_result` and `duplicate_parts` fields
- `DuplicateMatchEntry` schema defines: `part_key` (string), `confidence` ("high" | "medium"), `reasoning` (string)
- `PartAnalysisDetailsSchema` wraps the existing analysis fields that were previously at the top level

Reviewed current AI analysis workflow implementation:
- `src/hooks/use-ai-part-analysis.ts` (lines 1-137): Hook managing SSE connection and analysis lifecycle
- `src/lib/utils/ai-parts.ts` (lines 23-49): `transformAIPartAnalysisResult` currently expects flat structure
- `src/components/parts/ai-part-dialog.tsx` (lines 1-174): Dialog orchestrating input → progress → review steps
- `src/components/parts/ai-part-review-step.tsx` (lines 1-530): Review step displaying analysis results in grid layout

Relevant UI patterns discovered:
- `src/components/boxes/part-location-card.tsx` (lines 1-61): Card component with 128x128 cover image, part description, key, and quantity badge—ideal template for duplicate cards
- `src/components/ui/card.tsx` (lines 1-148): `grid-tile` variant with hover effects and click handling
- `src/components/ui/tooltip.tsx` (lines 1-216): Portal-based tooltip with rich content support
- `src/lib/utils/parts.ts` (lines 113-128): `formatPartForDisplay` utility for consistent part display

Data fetching capabilities:
- Generated hook `useGetPartsByPartKey` available for fetching full part details by 4-char key
- Hook signature: `(params, options) => ReturnType<typeof useQuery<PartResponseSchema>>`

**Conflicts Resolved:**

No architectural conflicts identified. The new duplicate detection paths fit cleanly into the existing AI analysis flow by introducing conditional rendering based on which fields are populated in the response.

---

## 1) Intent & Scope

**User intent**

Add duplicate detection UI to the AI part analysis workflow, supporting two distinct scenarios: (1) duplicate-only results when high-confidence matches are found, showing a dedicated grid screen of potential duplicates; (2) analysis-with-duplicates results showing the normal review form with a horizontal bar of duplicate parts at the top.

**Prompt quotes**

"When response contains ONLY `duplicate_parts` (no `analysis_result`): Show a new dedicated screen displaying only the duplicate matches"

"When response contains BOTH `analysis_result` AND `duplicate_parts`: Show the normal AI analysis review step (existing `AIPartReviewStep`) [with] a horizontal bar at the top of the scrollable content area"

"Grid layout that prefers wider over taller: 1x1 → 2x1 → 3x1 → 3x2 → 4x2 → 4x3 → 5x3 → 5x4"

"Clicking a card opens the part in a new browser tab (`/parts/{part_key}`)"

"Info icon next to confidence level with tooltip showing `reasoning`"

**In scope**

- Update `transformAIPartAnalysisResult` to handle nested `analysis_result` and new `duplicate_parts` structure
- Create duplicate-only screen component with responsive grid layout (1x1 → 2x1 → ... → 5x4)
- Create reusable duplicate card component based on part-location-card pattern with confidence badge and reasoning tooltip
- Fetch full part details for each duplicate using `useGetPartsByPartKey`
- Add horizontal duplicate bar to `AIPartReviewStep` when both analysis and duplicates present
- Render confidence levels (high vs medium) with distinct visual treatment
- Enable clicking duplicate cards/items to open part detail in new tab
- Add appropriate back button and messaging for duplicate-only screen
- Update `AIPartDialog` step routing to handle new duplicate-only case
- Error handling when neither field is populated

**Out of scope**

- Backend changes (already complete; API contract is defined)
- UI for selecting a duplicate as "the one to use" instead of creating new part
- Batch operations on duplicates
- Filtering or sorting duplicates by confidence
- Persisting user's decision to ignore duplicates
- Analytics or tracking of duplicate detection rates
- Confidence level threshold configuration

**Assumptions / constraints**

- Backend guarantees at least one of `analysis_result` or `duplicate_parts` is populated (error if both null)
- `duplicate_parts` array is never empty when present (backend ensures this)
- Part keys in `duplicate_parts` are valid and fetchable via `/api/parts/{part_key}`
- Opening part in new tab requires constructing route `/parts/{part_key}` (no navigation helper needed)
- Confidence enum is constrained to "high" | "medium" only (no "low" value)
- Grid layout calculations apply CSS-based responsive wrapping, not JavaScript layout computation
- Existing `AIPartReviewStep` scrollable content area already established; duplicate bar inserts at top
- Tooltip component (`src/components/ui/tooltip.tsx`) provides sufficient flexibility for reasoning display

---

## 2) Affected Areas & File Map

**Transform utility:**

- Area: `src/lib/utils/ai-parts.ts`
- Why: Update `transformAIPartAnalysisResult` to handle nested `analysis_result` and new `duplicate_parts` structure; map snake_case to camelCase for duplicate entries
- Evidence: `src/lib/utils/ai-parts.ts:23-49` — current transformer expects flat structure with fields like `description`, `manufacturer`, etc.; must adapt to nested `analysis_result?.description` and new `duplicate_parts` array

**Hook types:**

- Area: `src/hooks/use-ai-part-analysis.ts`
- Why: Update type imports to reference new `AIPartAnalysisResultSchema` structure; transformed result type changes to support optional `duplicateParts` array
- Evidence: `src/hooks/use-ai-part-analysis.ts:7` — imports `AIPartAnalysisResultSchema` from generated types; line 20 returns `ReturnType<typeof transformAIPartAnalysisResult>`

**Dialog orchestration:**

- Area: `src/components/parts/ai-part-dialog.tsx`
- Why: Add new dialog step `'duplicates'` to `DialogStep` union; route to duplicate-only screen when `analysisResult.duplicateParts` present and `analysisResult.analysisResult` absent
- Evidence: `src/components/parts/ai-part-dialog.tsx:10` — `DialogStep = 'input' | 'progress' | 'review'`; lines 112-150 render step content via switch

**Review step enhancement:**

- Area: `src/components/parts/ai-part-review-step.tsx`
- Why: Add horizontal duplicate bar component when `analysisResult.duplicateParts` is present; position bar at top of scrollable content area below header
- Evidence: `src/components/parts/ai-part-review-step.tsx:207` — scrollable div wrapping grid layout; can insert duplicate bar before grid

**New duplicate-only screen:**

- Area: `src/components/parts/ai-duplicates-only-step.tsx` (create)
- Why: Dedicated step component rendering grid of duplicate cards when only duplicates returned; includes back button and explanatory messaging
- Evidence: Pattern follows `src/components/parts/ai-part-review-step.tsx:198-206` — header with title/description followed by scrollable content

**New duplicate card component:**

- Area: `src/components/parts/ai-duplicate-card.tsx` (create)
- Why: Reusable card showing part cover image, description, key, confidence badge, and reasoning tooltip; based on part-location-card structure
- Evidence: `src/components/boxes/part-location-card.tsx:1-61` — establishes pattern: `CoverImageDisplay` (128x128), description (2-line clamp), key (mono font), badge at bottom

**New duplicate bar component:**

- Area: `src/components/parts/ai-duplicate-bar.tsx` (create)
- Why: Horizontal scrollable bar displaying compact duplicate items when analysis includes both results and duplicates
- Evidence: User requirement for "horizontal bar at top of the scrollable content area (below header, above form fields)"

**New compact duplicate item:**

- Area: `src/components/parts/ai-duplicate-bar-item.tsx` (create)
- Why: Compact representation of duplicate for horizontal bar using flat inline layout: `[Part Key] "Description up to 40 chars..." [High ⓘ]` — all elements in one row for minimal bar height
- Evidence: User requirement specifies "Part key, Truncated description (40 chars with CSS ellipsis), Confidence level as a chip, Info icon with same reasoning tooltip"; design decision selects flat inline layout over nested chips or compact card

**Confidence badge component:**

- Area: `src/components/parts/ai-confidence-badge.tsx` (create)
- Why: Reusable component rendering confidence level ("high" | "medium") with distinct visual treatment; used in both card and bar contexts
- Evidence: User requirement: "Confidence level (distinguish high vs medium visually)"

**TypeScript type definitions:**

- Area: `src/types/ai-parts.ts` (create)
- Why: Define frontend TypeScript types for transformed duplicate entry structure (camelCase) separate from generated API types
- Evidence: Existing pattern in `src/lib/utils/ai-parts.ts:23` — `transformAIPartAnalysisResult` returns camelCase model

---

## 3) Data Model / Contracts

**Transformed AI analysis result:**

- Entity: Returned by `transformAIPartAnalysisResult`
- Shape:
  ```typescript
  {
    // Existing fields (now optional, present when analysis_result populated)
    description?: string;
    manufacturer?: string;
    manufacturerCode?: string;
    type?: string;
    typeIsExisting?: boolean;
    existingTypeId?: number;
    tags?: string[];
    documents?: DocumentSuggestionSchema[];
    dimensions?: string;
    voltageRating?: string;
    mountingType?: string;
    package?: string;
    pinCount?: number;
    pinPitch?: string;
    series?: string;
    inputVoltage?: string;
    outputVoltage?: string;
    productPageUrl?: string;
    seller?: null;
    sellerLink?: null;

    // New field
    duplicateParts?: DuplicatePartEntry[];
  }
  ```
- Mapping: `analysis_result` nested fields map to flat camelCase; `duplicate_parts` array entries transform `part_key → partKey`, `confidence → confidence`, `reasoning → reasoning`
- Evidence: `src/lib/utils/ai-parts.ts:23-49` — existing transformer structure

**Duplicate part entry (frontend model):**

- Entity: Single duplicate match (camelCase)
- Shape:
  ```typescript
  {
    partKey: string;        // 4-char part key
    confidence: 'high' | 'medium';
    reasoning: string;      // LLM explanation
  }
  ```
- Mapping: Direct snake_case to camelCase transform from `DuplicateMatchEntry` API schema
- Evidence: `openapi-cache/openapi.json` — `DuplicateMatchEntry` schema defines `part_key`, `confidence` enum, `reasoning`

**Part detail query:**

- Entity: TanStack Query cache key for fetching part by key
- Shape: `['getPartsByPartKey', { path: { part_key: string } }]`
- Mapping: Generated hook accepts `{ path: { part_key } }` params object
- Evidence: `src/lib/api/generated/hooks.ts` — `useGetPartsByPartKey` queryKey construction

**SSE result payload:**

- Entity: Raw SSE task result schema
- Shape:
  ```json
  {
    "analysis": {
      "analysis_result": { /* PartAnalysisDetailsSchema */ } | null,
      "duplicate_parts": [ /* DuplicateMatchEntry */ ] | null
    }
  }
  ```
- Mapping: Hook passes `sseResult.analysis` to `transformAIPartAnalysisResult`; transformer inspects both fields
- Evidence: `openapi-cache/openapi.json:46-80` — `AIPartAnalysisResultSchema` with two optional nested fields

---

## 4) API / Integration Surface

**Fetch part by key:**

- Surface: `GET /api/parts/{part_key}` via `useGetPartsByPartKey`
- Inputs: `{ path: { part_key: string } }`
- Outputs: `PartResponseSchema` including `key`, `description`, `manufacturer_code`, `has_cover_attachment`, etc.; queries run in parallel for multiple duplicates
- Errors: 404 if part key invalid (unlikely given backend provided it); global error handler shows toast; component can render placeholder or skip that duplicate
- Evidence: `src/lib/api/generated/hooks.ts` — hook signature and error handling via `toApiError`

**Existing AI analysis SSE:**

- Surface: `POST /api/ai-parts/analyze` → SSE stream at returned `stream_url`
- Inputs: `FormData` with `text` or `image`; stream URL returned in initial response
- Outputs: SSE events culminating in `AIPartAnalysisTaskResultSchema` with nested `analysis` field; hook already transforms via `transformAIPartAnalysisResult`
- Errors: Analysis failure emits error via SSE (existing `sseError` handling); empty analysis (neither field populated) throws error in transformer, surfaced via global error handler
- Evidence: `src/hooks/use-ai-part-analysis.ts:72-105` — fetch → SSE connection flow

**TanStack Query cache coordination:**

- Surface: No explicit mutation; queries for duplicate parts are independent read-only fetches
- Inputs: Array of part keys from `duplicate_parts`
- Outputs: Each query caches its `PartResponseSchema` under standard `['getPartsByPartKey', ...]` key
- Errors: If a duplicate fetch fails, that card can show fallback (e.g., key-only display); does not block rendering other duplicates
- Evidence: TanStack Query docs — parallel queries via multiple `useQuery` calls or `useQueries` hook

---

## 5) Algorithms & UI Flows

**Duplicate detection routing (AI dialog):**

- Flow: Analyze → Progress → Route based on result structure
- Steps:
  1. User submits analysis (input step → progress step)
  2. SSE completes; `transformAIPartAnalysisResult` returns transformed data
  3. Dialog checks `result.duplicateParts` and `result.analysisResult` (derived from presence of `description` field or similar marker)
  4. If `duplicateParts` present AND no `analysisResult`: set step to `'duplicates'`
  5. If both present OR only `analysisResult`: set step to `'review'` (existing behavior)
  6. If neither present: transformer throws error (backend contract violation); global error handler shows toast
- States / transitions: `DialogStep` union expands to `'input' | 'progress' | 'review' | 'duplicates'`; step state drives rendered component
- Hotspots: Conditional logic must correctly detect "analysis only" vs "duplicates only" vs "both"; transformer must return nullable fields to enable detection
- Evidence: `src/components/parts/ai-part-dialog.tsx:112-150` — step rendering switch; line 33 `onSuccess` callback sets step

**Duplicate-only screen render:**

- Flow: Display grid of duplicate cards with fetched part details
- Steps:
  1. Component receives `duplicateParts` array (frontend model)
  2. Extract `partKey` from each entry; trigger `useGetPartsByPartKey` query per duplicate
  3. Determine grid columns based on count: 1 → "1 col", 2 → "2 cols", 3 → "3 cols", 4-6 → "3 cols 2 rows max", 7-8 → "4 cols 2 rows max", 9-12 → "4 cols 3 rows max", 13-15 → "5 cols 3 rows max", 16-20 → "5 cols 4 rows max"
  4. Render header: "Potential Duplicates Found" + explanatory text
  5. Render grid with duplicate cards (loading states for pending queries)
  6. Render back button ("Go Back" to input step)
- States / transitions: Query loading → success → render card; query error → render fallback card with key only
- Hotspots: Parallel queries for N duplicates; TailwindCSS grid classes must adapt to count; clicking card must open new tab without navigation side effects
- Evidence: `src/components/boxes/part-location-card.tsx:16-59` — card click handler pattern

**Duplicate bar in review step:**

- Flow: Insert horizontal scrollable bar above form grid
- Steps:
  1. `AIPartReviewStep` receives `analysisResult`; check if `duplicateParts` present
  2. If present, fetch part details for each duplicate (same parallel query pattern)
  3. Render horizontal scrollable container above existing grid (line 207)
  4. Render compact duplicate items (part key, truncated description, confidence chip, info tooltip)
  5. Hover over item shows rich tooltip card (same structure as duplicate-only card)
  6. Click item opens part in new tab
- States / transitions: Bar scrolls out of view when user scrolls form content; no state coupling between bar and form
- Hotspots: Tooltip positioning must work within scrollable context; new tab navigation must not interfere with form state
- Evidence: `src/components/parts/ai-part-review-step.tsx:207` — scrollable content div

**Grid layout calculation:**

- Flow: CSS-based responsive grid (not JS computation)
- Steps:
  1. Count duplicates: `duplicateParts.length`
  2. Map count to grid classes:
     - 1: `grid-cols-1`
     - 2: `grid-cols-2`
     - 3: `grid-cols-3`
     - 4-6: `grid-cols-3 grid-rows-2`
     - 7-8: `grid-cols-4 grid-rows-2`
     - 9-12: `grid-cols-4 grid-rows-3`
     - 13-15: `grid-cols-5 grid-rows-3`
     - 16-20: `grid-cols-5 grid-rows-4`
     - 21+: `grid-cols-5` (overflow rows auto)
  3. Apply TailwindCSS `grid` with calculated classes
- States / transitions: Static class computation; no reactive layout on resize
- Hotspots: Edge case for >20 duplicates (unlikely); class mapping must be exhaustive
- Evidence: User requirement: "Grid layout that prefers wider over taller: 1x1 → 2x1 → 3x1 → 3x2 → 4x2 → 4x3 → 5x3 → 5x4"

**Open part in new tab:**

- Flow: Click duplicate → `window.open(/parts/{partKey})`
- Steps:
  1. User clicks duplicate card or bar item
  2. `onClick` handler calls `window.open(\`/parts/\${partKey}\`, '_blank')`
  3. Browser opens new tab (no state change in current tab)
- States / transitions: No navigation in current tab; no route instrumentation needed
- Hotspots: Ensure click event does not bubble if card is inside larger clickable area
- Evidence: User requirement: "Clicking a card opens the part in a new browser tab (`/parts/{part_key}`)"

---

## 6) Derived State & Invariants

**Duplicate presence flag:**

- Derived value: `hasDuplicates = !!analysisResult.duplicateParts && analysisResult.duplicateParts.length > 0`
- Source: Filtered from `transformAIPartAnalysisResult` output; unfiltered input is SSE payload `analysis` field
- Writes / cleanup: No writes; read-only flag driving conditional rendering of duplicate bar in review step
- Guards: Transformer ensures `duplicateParts` array is never present but empty (backend contract); if backend violates, empty array renders no bar (safe fallback)
- Invariant: If `duplicateParts` present, length > 0
- Evidence: `src/components/parts/ai-part-review-step.tsx` — will check `analysisResult.duplicateParts?.length` before rendering bar

**Analysis presence flag:**

- Derived value: `hasAnalysis = !!analysisResult.description` (or similar marker field from `analysis_result`)
- Source: Transformer populates `description` and other fields only when `analysis_result` present in API response
- Writes / cleanup: No writes; used in dialog to route to `'duplicates'` vs `'review'` step
- Guards: Backend guarantees at least one field populated; if both missing, transformer throws error caught by global handler
- Invariant: `hasAnalysis || hasDuplicates` must be true (enforced by backend + transformer error)
- Evidence: `src/components/parts/ai-part-dialog.tsx:33-39` — success callback routes based on result structure

**Grid column count:**

- Derived value: TailwindCSS class string computed from `duplicateParts.length`
- Source: Unfiltered `duplicateParts` array (no sorting or filtering applied)
- Writes / cleanup: Static class application; no cache or persistent state
- Guards: Class map covers 1-20+ range; fallback to `grid-cols-5` for overflow
- Invariant: Class computation is pure function of array length
- Evidence: Component file `src/components/parts/ai-duplicates-only-step.tsx` (to be created)

**Fetched part details map:**

- Derived value: Map of `partKey → PartResponseSchema | undefined` from parallel queries
- Source: `useGetPartsByPartKey` queries keyed by each `partKey` in `duplicateParts`
- Writes / cleanup: TanStack Query manages cache; no manual cleanup needed; stale-while-revalidate default behavior
- Guards: Missing part (404) results in `undefined`; card renders fallback (key + "Unable to load details")
- Invariant: Query cache remains stable during duplicate screen render (no refetch on hover/click)
- Evidence: `src/hooks/use-parts.ts:10-28` — TanStack Query usage pattern

---

## 7) State Consistency & Async Coordination

**Parallel duplicate fetches:**

- Source of truth: TanStack Query cache keyed by `['getPartsByPartKey', { path: { part_key } }]`
- Coordination: All queries triggered on component mount; each query independently resolves; no cross-query dependencies
- Async safeguards: Component unmount aborts in-flight queries (TanStack Query default); stale queries do not update unmounted component state
- Instrumentation: No custom instrumentation for duplicate fetches (standard TanStack Query behavior); queries emit network events visible in React Query DevTools
- Evidence: `src/lib/api/generated/hooks.ts` — `useGetPartsByPartKey` uses standard `useQuery` with abort on unmount

**SSE result to dialog state:**

- Source of truth: `sseResult` state in `useSSETask` hook; transformed result passed to dialog `onSuccess`
- Coordination: `transformAIPartAnalysisResult` runs in `onResult` callback (line 36); transformed data triggers dialog step update (line 33 callback)
- Async safeguards: SSE disconnect on component unmount (line 122); duplicate `onSuccess` calls prevented by `isAnalyzing` guard (line 48-50)
- Instrumentation: SSE hook emits progress events; completion triggers step transition observable via `data-step` attribute on dialog content
- Evidence: `src/hooks/use-ai-part-analysis.ts:24-45` — SSE hook wiring; `src/components/parts/ai-part-dialog.tsx:164` — `data-step` instrumentation

**Duplicate bar scroll independence:**

- Source of truth: Browser scroll position on review step content div
- Coordination: Duplicate bar fixed at top of scrollable area; no state synchronization between bar and form
- Async safeguards: Bar does not trigger reflows on scroll; tooltip positioning recalculates on hover (not scroll)
- Instrumentation: No scroll instrumentation needed; bar visibility is visual-only concern
- Evidence: `src/components/parts/ai-part-review-step.tsx:207` — `overflow-y-auto` scrollable container

**Dialog step transitions:**

- Source of truth: `currentStep` state in `AIPartDialog`
- Coordination: `onSuccess` callback sets step based on result structure; back button handlers reset step to `'input'`
- Async safeguards: Step transition while analysis in progress prevented by `isAnalyzing` check; canceling analysis resets to `'input'`
- Instrumentation: `data-step` attribute on dialog content (`src/components/parts/ai-part-dialog.tsx:164`) enables Playwright assertions
- Evidence: `src/components/parts/ai-part-dialog.tsx:19` — step state; lines 33-39, 59-66 — transition handlers

---

## 8) Errors & Edge Cases

**Neither analysis nor duplicates populated:**

- Failure: Backend violates contract; SSE returns `{ analysis_result: null, duplicate_parts: null }`
- Surface: `transformAIPartAnalysisResult`
- Handling: Transformer throws error: `"Invalid analysis result: neither analysis_result nor duplicate_parts populated"`; global error handler catches and shows toast; user remains on progress step with error state
- Guardrails: Backend has validation preventing this; transformer acts as defensive check; error message guides debugging
- Evidence: `src/lib/utils/ai-parts.ts:23` — transformer will add validation logic

**Duplicate part fetch fails (404):**

- Failure: Part key in `duplicate_parts` does not exist (backend data integrity issue)
- Surface: `useGetPartsByPartKey` query for that duplicate
- Handling: Query error state; duplicate card renders fallback: key + "Unable to load part details"; info tooltip shows reasoning; card remains clickable (opens part detail which will 404)
- Guardrails: Card gracefully degrades; other duplicates render normally; global error handler does not trigger (query error is component-scoped)
- Evidence: TanStack Query error handling pattern; card component checks `query.isError`

**Duplicate part fetch network failure:**

- Failure: Network timeout or connection error during parallel fetches
- Surface: One or more `useGetPartsByPartKey` queries
- Handling: TanStack Query retries (default 3 attempts); if all fail, card shows "Unable to load" fallback; user can refresh page to retry
- Guardrails: Other duplicates succeed independently; no cascade failure
- Evidence: TanStack Query default retry behavior (`src/lib/query-client.ts`)

**Empty duplicates array (backend bug):**

- Failure: `duplicate_parts` field present but array is empty
- Surface: Duplicate-only step or duplicate bar component
- Handling: Transformer allows empty array (no error); duplicate-only step renders header + "No duplicates found" message + back button; duplicate bar does not render (conditional on `.length > 0`)
- Guardrails: Backend should prevent this; UI treats as safe no-op
- Evidence: Component conditional rendering

**User navigates away during duplicate fetches:**

- Failure: User closes dialog or navigates while duplicate queries in flight
- Surface: Dialog unmount / route change
- Handling: TanStack Query aborts in-flight queries on component unmount; no memory leaks
- Guardrails: Standard React Query cleanup
- Evidence: TanStack Query lifecycle documentation

**Tooltip positioning edge case:**

- Failure: Duplicate bar item near viewport edge; tooltip content would overflow screen
- Surface: Tooltip component with `content` prop and `placement="auto"`
- Handling: `useTooltip` hook calculates viewport-aware position; `placement="auto"` adjusts to best fit (top/bottom/left/right)
- Guardrails: Tooltip component already handles this (`src/components/ui/tooltip.tsx:4`)
- Evidence: `src/components/ui/tooltip.tsx:43-48` — tooltip hook with placement logic

**Confidence value not "high" or "medium":**

- Failure: Backend returns invalid confidence (e.g., "low" or typo)
- Surface: Confidence badge component
- Handling: TypeScript type narrowing prevents compile-time; runtime fallback renders badge with neutral styling + confidence string as-is
- Guardrails: OpenAPI schema constrains enum; backend validates; badge component adds `default` case
- Evidence: `openapi-cache/openapi.json` — `confidence` enum restricted to ["high", "medium"]

**Grid layout with >20 duplicates:**

- Failure: Not a failure; edge case for very large duplicate sets
- Surface: Duplicate-only step grid
- Handling: Grid class defaults to `grid-cols-5`; additional rows auto-flow; vertical scroll within dialog content area
- Guardrails: TailwindCSS grid auto-rows; dialog scrollable content handles overflow
- Evidence: User requirement grid mapping stops at 5x4; overflow is implicit

---

## 9) Observability / Instrumentation

**Dialog step transition (duplicates):**

- Signal: `data-step="duplicates"` on dialog content
- Type: Instrumentation attribute (data-testid pattern)
- Trigger: Dialog `currentStep` state set to `'duplicates'` when analysis returns duplicates-only result
- Labels / fields: `data-step` value distinguishes between `'input' | 'progress' | 'review' | 'duplicates'`
- Consumer: Playwright can assert `await expect(page.getByTestId('parts.ai.dialog')).toHaveAttribute('data-step', 'duplicates')`
- Evidence: `src/components/parts/ai-part-dialog.tsx:164` — existing `data-step` attribute

**Duplicate card click:**

- Signal: `data-testid="parts.ai.duplicates.card.{partKey}"`
- Type: Instrumentation attribute
- Trigger: Each duplicate card rendered in duplicate-only grid
- Labels / fields: `{partKey}` dynamically inserted (e.g., `parts.ai.duplicates.card.ABCD`)
- Consumer: Playwright can locate specific duplicate card for interaction assertions
- Evidence: Pattern from `src/components/boxes/part-location-card.tsx:21` — `data-part-key`

**Duplicate bar presence:**

- Signal: `data-testid="parts.ai.review.duplicate-bar"`
- Type: Instrumentation attribute
- Trigger: Duplicate bar component rendered when `analysisResult.duplicateParts` present in review step
- Labels / fields: None; binary presence/absence
- Consumer: Playwright asserts bar visibility when analysis includes duplicates
- Evidence: Standard component testId pattern

**Duplicate bar item click:**

- Signal: `data-testid="parts.ai.review.duplicate-bar.item.{partKey}"`
- Type: Instrumentation attribute
- Trigger: Each compact duplicate item in horizontal bar
- Labels / fields: `{partKey}` identifying which duplicate
- Consumer: Playwright can verify bar items and click behavior
- Evidence: Testid naming convention

**Confidence badge rendering:**

- Signal: `data-testid="parts.ai.confidence.{confidence}"` on badge component
- Type: Instrumentation attribute
- Trigger: Badge renders with `confidence="high"` or `"medium"`
- Labels / fields: `{confidence}` value (e.g., `parts.ai.confidence.high`)
- Consumer: Playwright asserts confidence level visual rendering
- Evidence: Component testId pattern

**Back button (duplicates screen):**

- Signal: `data-testid="parts.ai.duplicates.back"`
- Type: Instrumentation attribute
- Trigger: Back button rendered in duplicate-only step
- Labels / fields: None
- Consumer: Playwright clicks back to return to input step
- Evidence: Pattern from `src/components/parts/ai-part-review-step.tsx:500` — `data-testid="parts.ai.review.back"`

**Reasoning tooltip visibility:**

- Signal: No custom event; standard tooltip visibility assertions
- Type: DOM visibility check
- Trigger: User hovers info icon next to confidence badge; tooltip appears via portal
- Labels / fields: `data-testid="parts.ai.duplicate-reasoning.tooltip"` (content mode tooltip)
- Consumer: Playwright `await infoIcon.hover(); await expect(tooltip).toBeVisible()`
- Evidence: `src/components/ui/tooltip.tsx` — portal-based rendering; `docs/contribute/ui/tooltip_guidelines.md:246-261` — testing pattern

---

## 10) Lifecycle & Background Work

**Duplicate query lifecycle:**

- Hook / effect: `useGetPartsByPartKey` called per duplicate in array
- Trigger cadence: On component mount (duplicate-only step or review step)
- Responsibilities: Fetch part details for display; cache in TanStack Query; render loading/success/error states
- Cleanup: Queries abort on component unmount (TanStack Query default); cache persists for stale-while-revalidate
- Evidence: `src/lib/api/generated/hooks.ts` — `useQuery` lifecycle; no custom `useEffect` needed

**SSE connection (existing):**

- Hook / effect: `useSSETask` manages EventSource connection
- Trigger cadence: On analysis submission; disconnects on cancel or completion
- Responsibilities: Stream progress events; emit final result; handle SSE errors
- Cleanup: `disconnectSSE` closes EventSource; called on component unmount or cancel button click
- Evidence: `src/hooks/use-ai-part-analysis.ts:119-122` — cancel handler; `useSSETask` hook manages EventSource

**Dialog state reset:**

- Hook / effect: `useEffect` in `AIPartDialog` watching `open` prop
- Trigger cadence: On dialog open/close
- Responsibilities: Reset `currentStep` to `'input'`; clear `lastSearchText` on close
- Cleanup: None needed; state reset is immediate
- Evidence: `src/components/parts/ai-part-dialog.tsx:43-51` — reset effect

**Tooltip positioning recalculation:**

- Hook / effect: `useTooltip` hook recalculates position on trigger ref changes or window scroll/resize
- Trigger cadence: On hover (open tooltip); on mousemove near tooltip
- Responsibilities: Calculate viewport-aware position; update tooltip portal coordinates
- Cleanup: Tooltip closes on mouse leave or Escape key; position listeners removed
- Evidence: `src/components/ui/tooltip.tsx:4` — `useTooltip` hook manages positioning

---

## 11) Security & Permissions (if applicable)

Not applicable. Duplicate detection does not introduce new authorization surfaces, data exposure risks, or role-based visibility requirements. All data flows through existing authenticated API endpoints with standard error handling.

---

## 12) UX / UI Impact

**Duplicate-only screen:**

- Entry point: AI part analysis dialog when backend returns only `duplicate_parts`
- Change: New full-screen step replacing review step; shows grid of potential duplicate parts with cover images, confidence badges, and reasoning tooltips
- User interaction: User can click any duplicate card to open part detail in new tab; back button returns to input step to retry analysis or enter different data
- Dependencies: Requires part detail API endpoint (`/api/parts/{part_key}`) functional; cover image display relies on attachment system
- Evidence: User requirement: "Show a new dedicated screen displaying only the duplicate matches"

**Duplicate bar in review step:**

- Entry point: AI part analysis review step when backend returns both `analysis_result` and `duplicate_parts`
- Change: Horizontal scrollable bar inserted at top of scrollable content area (below header, above form grid); displays compact duplicate items with key, truncated description, confidence chip, info icon
- User interaction: User scrolls horizontally to view all duplicates; hovers info icon to see reasoning tooltip; clicks item to open part in new tab; bar scrolls out of view when user scrolls down to form fields
- Dependencies: Tooltip component must work within scrollable context; part fetch queries must complete for display
- Evidence: User requirement: "Add a horizontal bar at the top of the scrollable content area (below header, above form fields)"

**Confidence visual distinction:**

- Entry point: Duplicate card and bar item rendering
- Change: High confidence uses distinct color/border (e.g., green or blue badge); medium confidence uses muted color (e.g., yellow or gray badge)
- User interaction: User visually distinguishes confidence at a glance; tooltip provides reasoning details on hover
- Dependencies: Design decision on color scheme (high: primary/success theme; medium: warning/muted theme)
- Evidence: User requirement: "Confidence level (distinguish high vs medium visually)" — design question deferred to implementation

**Back button wording:**

- Entry point: Duplicate-only screen back button
- Change: Button text matches existing review step pattern: "Go Back"
- User interaction: Click returns to input step; analysis state resets
- Dependencies: Dialog step state management
- Evidence: `src/components/parts/ai-part-review-step.tsx:495-503` — existing back button as "Go Back"

**Info icon tooltip:**

- Entry point: Confidence badge in duplicate card and bar item
- Change: Info icon (standard icon library icon, e.g., `Info` from lucide-react) positioned next to confidence badge; tooltip displays `reasoning` text from duplicate entry
- User interaction: Hover icon to see tooltip; tooltip dismisses on mouse leave or Escape key
- Dependencies: Tooltip component with `content` prop for rich text; reasoning string from backend
- Evidence: `docs/contribute/ui/tooltip_guidelines.md:32-55` — rich content tooltip usage

**Part detail new tab navigation:**

- Entry point: Click on duplicate card or bar item
- Change: Opens `/parts/{partKey}` in new browser tab (not in-dialog navigation)
- User interaction: User reviews part in new tab; returns to analysis dialog in original tab
- Dependencies: Route `/parts/{partKey}` must be defined and functional
- Evidence: User requirement: "Clicking a card opens the part in a new browser tab (`/parts/{part_key}`)"

---

## 13) Deterministic Test Plan (new/changed behavior only)

**Duplicate-only flow:**

- Surface: AI part analysis dialog → duplicate-only step
- Scenarios:
  - Given backend returns only `duplicate_parts` (no `analysis_result`), When analysis completes, Then dialog shows duplicate-only screen with grid of N duplicate cards
  - Given duplicate-only screen rendered, When user clicks duplicate card, Then part detail opens in new tab (assert `window.open` called with correct URL via Playwright context)
  - Given duplicate-only screen rendered, When user clicks back button, Then dialog returns to input step
  - Given duplicate-only screen with 3 duplicates, When screen renders, Then grid uses 3-column layout (assert CSS class or computed layout)
  - Given duplicate card rendered, When user hovers info icon, Then tooltip shows reasoning text
- Instrumentation / hooks: `data-step="duplicates"` on dialog; `data-testid="parts.ai.duplicates.card.{partKey}"` on cards; `data-testid="parts.ai.duplicates.back"` on back button; `data-testid="parts.ai.duplicate-reasoning.tooltip"` on tooltip
- Gaps: Backend test helper to seed duplicate-only response (see backend coordination section below)
- Evidence: Pattern from existing AI analysis specs (to be created)

**Analysis with duplicates (duplicate bar):**

- Surface: AI part analysis review step with duplicate bar
- Scenarios:
  - Given backend returns both `analysis_result` and `duplicate_parts`, When review step renders, Then duplicate bar appears at top of scrollable content
  - Given duplicate bar rendered with 2 duplicates, When user scrolls down, Then bar scrolls out of view (visual assertion or scroll position check)
  - Given duplicate bar item, When user clicks item, Then part opens in new tab
  - Given duplicate bar item, When user hovers info icon, Then tooltip displays reasoning
- Instrumentation / hooks: `data-testid="parts.ai.review.duplicate-bar"` on bar container; `data-testid="parts.ai.review.duplicate-bar.item.{partKey}"` on items; standard tooltip testId
- Gaps: Backend test helper to seed analysis-with-duplicates response
- Evidence: Review step rendering already tested; bar is additive

**Confidence badge rendering:**

- Surface: Duplicate card and bar item
- Scenarios:
  - Given duplicate with high confidence, When card renders, Then badge shows "high" with primary/success styling (assert class or computed style)
  - Given duplicate with medium confidence, When card renders, Then badge shows "medium" with warning/muted styling
- Instrumentation / hooks: `data-testid="parts.ai.confidence.{confidence}"` on badge
- Gaps: None; static rendering
- Evidence: Component unit test or E2E visual assertion

**Error handling (neither field populated):**

- Surface: Analysis result transformer
- Scenarios:
  - Given backend returns `{ analysis_result: null, duplicate_parts: null }`, When analysis completes, Then global error toast appears with message "Invalid analysis result"
  - Given error toast shown, When user dismisses toast, Then dialog remains on progress step (user can retry or cancel)
- Instrumentation / hooks: Standard toast instrumentation (`data-testid="toast"`); error message text assertion
- Gaps: Backend test endpoint to return invalid result (unlikely; may skip test if backend validation prevents scenario)
- Evidence: `src/lib/test/error-instrumentation.ts` — toast events

**Duplicate fetch failure (404):**

- Surface: Duplicate card in duplicate-only screen
- Scenarios:
  - Given duplicate part key does not exist, When card fetches part details, Then card shows "Unable to load part details" fallback with part key visible
  - Given card in error state, When user clicks card, Then part detail route opens (will 404 there)
- Instrumentation / hooks: Card testId; error text assertion
- Gaps: Backend test helper to seed duplicate with invalid part key (or delete part after analysis)
- Evidence: Component handles query error state

**Grid layout responsive classes:**

- Surface: Duplicate-only step grid container
- Scenarios:
  - Given 1 duplicate, Then grid uses `grid-cols-1`
  - Given 2 duplicates, Then grid uses `grid-cols-2`
  - Given 4 duplicates, Then grid uses `grid-cols-3` (3x2 layout)
  - Given 10 duplicates, Then grid uses `grid-cols-4` (4x3 layout)
  - Given 16 duplicates, Then grid uses `grid-cols-5` (5x4 layout)
- Instrumentation / hooks: Computed class assertion or visual snapshot
- Gaps: None; static class mapping
- Evidence: CSS class logic in component

**Testing pattern (no backend coordination needed):**

- Use existing `aiAnalysisMock` fixture from `tests/support/helpers/ai-analysis-mock.ts`
- Pattern: Mock `/api/ai-parts/analyze` endpoint and SSE stream using Playwright route mocking
- Extend `emitCompleted` to support new response structure:
  - `analysis: { analysis_result: {...}, duplicate_parts: null }` for analysis-only
  - `analysis: { analysis_result: null, duplicate_parts: [{...}] }` for duplicates-only
  - `analysis: { analysis_result: {...}, duplicate_parts: [{...}] }` for both
- Create test parts via API for duplicate part keys to enable full part detail fetching
- Evidence: `tests/e2e/parts/part-ai-creation.spec.ts:28-65` — existing AI mock usage pattern; `tests/support/helpers/ai-analysis-mock.ts:211-227` — `emitCompleted` method

---

## 14) Implementation Slices (only if large)

**Slice 1: Data model & transformer update**

- Goal: Update `transformAIPartAnalysisResult` to handle new API structure; add TypeScript types for frontend duplicate model
- Touches: `src/lib/utils/ai-parts.ts`, `src/types/ai-parts.ts` (create), `src/hooks/use-ai-part-analysis.ts` (type imports)
- Dependencies: None; standalone schema update

**Slice 2: Duplicate-only screen (no styling polish)**

- Goal: Create `AIPartDuplicatesOnlyStep` component with basic grid layout; fetch part details; render cards with placeholder confidence badges; back button wired
- Touches: `src/components/parts/ai-duplicates-only-step.tsx` (create), `src/components/parts/ai-duplicate-card.tsx` (create), `src/components/parts/ai-part-dialog.tsx` (add `'duplicates'` step routing)
- Dependencies: Slice 1 complete (transformer returns `duplicateParts`)

**Slice 3: Confidence badge & tooltip**

- Goal: Create `AIPartConfidenceBadge` component with high/medium visual distinction; integrate tooltip with reasoning on info icon
- Touches: `src/components/parts/ai-confidence-badge.tsx` (create), update duplicate card to use badge
- Dependencies: Slice 2 complete (cards render)

**Slice 4: Duplicate bar in review step**

- Goal: Add horizontal duplicate bar to `AIPartReviewStep`; create compact bar item component; wire fetching and click handlers
- Touches: `src/components/parts/ai-duplicate-bar.tsx` (create), `src/components/parts/ai-duplicate-bar-item.tsx` (create), `src/components/parts/ai-part-review-step.tsx` (insert bar)
- Dependencies: Slice 3 complete (confidence badge reusable)

**Slice 5: Instrumentation & Playwright specs**

- Goal: Add all `data-testid` attributes; write Playwright specs for duplicate-only flow, analysis-with-duplicates flow, confidence rendering, error cases
- Touches: All components from slices 2-4 (add testIds), `tests/e2e/parts/ai-parts-duplicates.spec.ts` (create), `tests/api/factories/ai-parts.ts` (add duplicate seeding helper if backend supports)
- Dependencies: Slices 1-4 complete; backend test helpers available

**Slice 6: UI polish & design finalization**

- Goal: Refine grid spacing, confidence badge colors, duplicate bar styling, tooltip content formatting, responsive layout tweaks
- Touches: All components (CSS classes, layout adjustments)
- Dependencies: Slice 5 complete (tests validate functionality)

---

## 15) Risks & Open Questions

**Risks:**

- Risk: Backend duplicate detection logic may return unstable or unexpected duplicate sets during testing, causing UI to show different duplicates on retry
- Impact: Playwright specs may be flaky if duplicate detection is non-deterministic
- Mitigation: Backend test helpers must seed deterministic duplicate responses; document expected backend test endpoint pattern in plan; coordinate with backend team on test support

- Risk: Parallel fetching of part details for large duplicate sets (e.g., 15-20 duplicates) may cause performance issues or rate limiting
- Impact: Duplicate-only screen loading may be slow; potential for backend overload
- Mitigation: TanStack Query batching and caching mitigate repeated requests; monitor network tab during testing; consider lazy-loading images if performance issue observed; backend should handle burst of requests gracefully

- Risk: Tooltip positioning in horizontal bar may fail near viewport edges or in small viewports
- Impact: Tooltip content may be clipped or positioned off-screen
- Mitigation: `placement="auto"` in Tooltip component handles viewport collision detection; test on various viewport sizes; fallback to native `title` attribute if rich tooltip proves problematic in bar context

- Risk: User may interpret duplicate detection as blocking part creation, expecting a "select duplicate" flow rather than informational display
- Impact: User confusion about workflow; may expect UI to merge with selected duplicate
- Mitigation: Messaging in duplicate-only screen clarifies that duplicates are suggestions, not blockers; user can still go back and create new part; consider adding clarifying copy in header ("Potential duplicates found — review or go back to create new part")

- Risk: Grid layout classes hard-coded for specific counts may look awkward at boundary cases (e.g., 7 duplicates in 4-column grid leaves 3 empty slots in second row)
- Impact: Visual imbalance in grid layout
- Mitigation: Accept some visual imbalance as trade-off for simplicity; CSS grid auto-flow handles this reasonably; user testing can validate if adjustment needed

**Design decisions:**

- Decision: Duplicate bar item layout — **Flat horizontal item with inline elements**
- Rationale: Selected "Option A" design: `[Part Key] "Description up to 40 chars..." [High ⓘ]` — everything in one row, chip for confidence, info icon clickable for tooltip. This keeps the bar height minimal while maintaining scanability. Visual refinement can be iterated during implementation.
- Evidence: User preference for Option A over nested chips or compact card design

**Open questions:**

- Question: What color scheme distinguishes high vs medium confidence? (e.g., green badge for high, yellow for medium? or blue for high, gray for medium?)
- Why it matters: Visual design must be intuitive and accessible (color-blind safe); affects badge component styling and testing assertions
- Owner / follow-up: **RESOLVED** — Green for high confidence, amber for medium confidence (using TailwindCSS colors like `bg-green-500/bg-green-100` and `bg-amber-500/bg-amber-100` or semantic variants)

- Question: What messaging appears in duplicate-only screen header? (e.g., "Potential Duplicates Found" or "These parts may already exist in your inventory")
- Why it matters: Tone and clarity affect user understanding of workflow; messaging must not imply part creation is blocked
- Owner / follow-up: **RESOLVED** — Use "Potential Duplicates Found" as header with subtext "These parts may already exist in your inventory. Click any card to review the details, or go back to create a new part."

- Question: Should duplicate bar be dismissible (close button) or always visible when duplicates present?
- Why it matters: User may find bar distracting after reviewing duplicates; dismissible bar requires state management
- Owner / follow-up: User requirement does not specify dismissible; proceed with always-visible bar; add dismissible feature later if user feedback requests it

- Question: How should backend test helpers seed duplicate responses? (dedicated endpoint, factory pattern, or existing test mode toggle?)
- Why it matters: Affects Playwright spec implementation and backend coordination effort
- Owner / follow-up: **RESOLVED** — Use existing `aiAnalysisMock` fixture pattern from `tests/support/helpers/ai-analysis-mock.ts`. The fixture uses `page.route()` to mock `/api/ai-parts/analyze` and `sseMocker.mockSSE()` to simulate streaming responses. Extend the mock to support `duplicate_parts` field in completion payload. No backend coordination needed (follows existing AI analysis test pattern with eslint exception for `testing/no-route-mocks`).

---

## 16) Confidence

Confidence: High — The feature scope is well-defined with clear API contracts and established UI patterns to follow. The existing AI analysis workflow provides a solid foundation for adding duplicate detection paths. Parallel part fetching via TanStack Query is a standard pattern with known performance characteristics. The primary unknowns are design decisions (confidence colors, messaging copy) that can be resolved during implementation without blocking progress. Backend coordination for test helpers is the largest dependency but does not affect core feature implementation.
