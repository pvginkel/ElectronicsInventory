# Plan Review: Box Detail Visual Layout

## 1) Summary & Decision

**Readiness**

The plan is thorough, well-researched, and follows the project's planning methodology with appropriate evidence and structure. It correctly identifies the major technical components, provides detailed implementation slices, and addresses key testing requirements. The feature aligns with the product brief's storage model and improves usability for the single-user hobby electronics inventory use case. However, the plan has several significant gaps around backend coordination, instrumentation completeness, and derived state handling that must be resolved before implementation can proceed safely.

**Decision**

`GO-WITH-CONDITIONS` — The plan demonstrates strong technical understanding and follows established patterns, but requires resolution of the backend data contract uncertainty (has_cover_attachment flag), clarification of search filtering behavior when locations have multiple parts, and completion of the instrumentation specification before implementation begins. The conditions are addressable without major redesign.

## 2) Conformance & Fit (with evidence)

**Conformance to refs**

- `docs/commands/plan_feature.md` — Pass — `plan.md:0-535` — Plan follows all required sections (Research Log, Intent & Scope, Affected Areas, Data Model, API Surface, Algorithms, Derived State, State Consistency, Errors, Observability, Lifecycle, Security, UX Impact, Test Plan, Implementation Slices, Risks, Confidence) with appropriate templates and evidence.

- `docs/product_brief.md` — Pass — `plan.md:43-92` — Plan aligns with product brief's storage model (boxes with numbered locations, left-to-right/top-to-bottom layout). The visual card approach directly supports the brief's goal "keep track of hobby electronics parts so you always know what you have, where it is" and the emphasis on labeling, storage, and finding things.

- `docs/contribute/architecture/application_overview.md` — Pass — `plan.md:109-125` — Plan correctly references domain-driven folder structure (`src/components/boxes/`, `src/hooks/`, `src/types/`), TanStack Query usage, generated API hooks, and camelCase transformation patterns.

- `docs/contribute/testing/playwright_developer_guide.md` — Partial — `plan.md:413-452` — Plan includes deterministic test scenarios with instrumentation hooks (data-testid attributes, waitForListLoading), but lacks explicit backend factory extensions needed for multi-part location scenarios. The plan mentions "factory helpers may need extension" (line 425) but does not detail what extensions are required or how to create deterministic multi-image part data.

**Fit with codebase**

- `src/components/boxes/box-details.tsx` — `plan.md:99-101` — Plan correctly identifies BoxDetails as orchestration layer and proposes adding search state + filter logic without disrupting existing instrumentation (useListLoadingInstrumentation at lines 74-99). Fits well.

- `src/hooks/use-box-locations.ts` — `plan.md:119-122` — Plan recognizes existing transformation hook and correctly notes need for has_cover_attachment field. However, the plan does not specify whether the hook should fail gracefully if backend omits this field or whether a migration strategy is needed. The hook already handles fallback for old format (lines 56-68), so this pattern could be extended.

- `src/components/documents/cover-image-display.tsx` — `plan.md:115-118` — Plan correctly identifies reuse opportunity and notes the component already handles lazy loading, errors, and placeholders. Fits perfectly with existing abstraction.

- `tests/e2e/boxes/boxes-detail.spec.ts` — `plan.md:131-133` — Plan proposes updating existing spec to cover new layout. Current spec (lines 65-66) uses `expectLocationOccupied` which checks data-is-occupied and data-primary-part-key attributes. Plan must clarify whether LocationContainer will preserve these attributes or if page object needs refactoring.

## 3) Open Questions & Ambiguities

**Question 1: Backend has_cover_attachment support**

- Question: Does the backend `/api/boxes/{box_no}/locations?include_parts=true` endpoint currently return `has_cover_attachment` in each part_assignment, or must the backend be extended first?
- Why it matters: Plan identifies this as top risk (plan.md:490-492) affecting N+1 query performance. If backend cannot provide this field, either: (a) accept O(N) cover attachment queries for N parts, (b) extend backend before frontend work begins, or (c) add compound query in hook to batch-fetch cover flags for all part keys in the response.
- Needed answer: Actual backend API response inspection or backend team confirmation of field availability. If field is missing, choose mitigation strategy and document it before slice 1. Current hook at use-box-locations.ts:8-14 does not transform this field, suggesting backend may not provide it yet.

**Question 2: Search filtering with multi-part locations**

- Question: When a location contains multiple parts and search matches only one part, should the location show all parts or only the matching part(s)?
- Why it matters: Plan states "For each location, filter partAssignments where key/description/manufacturer_code includes searchTerm" (plan.md:211) but does not clarify whether filtered partAssignments are displayed or if entire location is hidden/shown. User requirement "I would like to see all of them" (plan.md:59) suggests no collapsing, but filtering logic is ambiguous.
- Needed answer: UX decision — if location has Part A (matches search) and Part B (no match), render location container with: (a) only Part A card visible, or (b) both Part A and Part B cards visible with Part A highlighted, or (c) entire location visible without modification. Option (a) aligns with plan.md:212 "If location has no matching parts, exclude entire location" but creates inconsistency where partial-match locations show partial data.

**Question 3: Instrumentation completeness for search**

- Question: Should search filtering emit test events (e.g., `ui_state` with `{ scope: 'boxes.detail.search', phase: 'filtered', matchCount: N }`), or is client-side filtering considered deterministic enough to skip instrumentation?
- Why it matters: Plan states "No test events for search (client-side filtering is deterministic; tests can directly assert visible parts)" (plan.md:276), but this conflicts with project guidance that "instrumentation drives every deterministic wait" (docs/contribute/testing/playwright_developer_guide.md:130). If tests must wait for filtered results to stabilize before assertions, an event ensures no race conditions.
- Needed answer: Testing methodology decision — if tests use `page.waitForFunction(() => document.querySelectorAll('[data-testid^="boxes.detail.part-card"]').length === expectedCount)`, event is optional. If tests should be more robust, add event. Default should align with project's "test-event driven" philosophy.

## 4) Deterministic Playwright Coverage (new/changed behavior only)

**Behavior: Visual card layout with location containers**

- Scenarios:
  - Given a box with 3 locations (loc 1: 2 parts, loc 2: 1 part, loc 3: 8 parts), When I navigate to box detail, Then I see 3 location containers with correct part counts and flow layout
  - Given a box with mixed empty and occupied locations, When I view box detail, Then empty locations are not rendered (only occupied locations visible)
  - Given a location with 4 parts, When I view the location container, Then all 4 part cards display in a single bordered container with location name header
- Instrumentation: `waitForListLoading(page, 'boxes.detail', 'ready')`, `data-testid="boxes.detail.location-container.{boxNo}-{locNo}"`, `data-part-count="{count}"`, `data-testid="boxes.detail.part-card.{partKey}"`
- Backend hooks: `testData.boxes.create()` must support creating box, then `testData.parts.create()` + `testData.locations.assign()` (or equivalent) to build multi-part locations deterministically. Current spec at boxes-detail.spec.ts:22-31 creates box and assigns single part to location via parts UI, which is indirect and slow.
- Gaps: Plan does not specify backend factory methods needed to seed "location with N parts" directly via API. Without this, tests must loop through parts UI (slow, brittle) or require new backend test helpers. Add to plan: "Backend must expose POST /api/testing/locations/bulk-assign or equivalent to seed multi-part locations for tests."
- Evidence: plan.md:419-426

**Behavior: Search/filter across locations**

- Scenarios:
  - Given a box with parts "RLAY" and "MOSFET" in different locations, When I search "RLAY", Then only the location containing "RLAY" is visible
  - Given a search matching no parts, When I submit search, Then empty state "No parts match your search" displays with `data-testid="boxes.detail.locations.no-matches"`
  - Given an active search with results, When I clear the search input, Then all non-empty locations reappear
- Instrumentation: `data-testid="boxes.detail.search"`, visible location containers and part cards, empty state testid
- Backend hooks: Existing factory methods sufficient (seed parts with known keys, assign to locations, search by key substring)
- Gaps: Plan does not specify debouncing behavior for search input. If debouncing is added (plan.md:517), tests must account for delay or wait for a stabilization signal. If instant filtering, tests can assert immediately after `.fill()`. Clarify in plan.md section 5 (Algorithms & UI Flows).
- Evidence: plan.md:429-436

**Behavior: Part card click-through and image loading**

- Scenarios:
  - Given a part card with a cover image (has_cover_attachment: true), When the card renders, Then the thumbnail displays correctly via CoverImageDisplay
  - Given a part card without a cover image, When the card renders, Then a placeholder icon is displayed
  - Given a visible part card, When I click it, Then I navigate to `/parts/{partKey}` route
- Instrumentation: Click `data-testid="boxes.detail.part-card.{partKey}"`, assert navigation via `page.url()` or TanStack Router test events
- Backend hooks: `testData.attachments.addCover(partId)` to seed deterministic cover images (referenced in playwright_developer_guide.md:44)
- Gaps: None identified for click-through. Image loading determinism depends on backend seeding cover images and frontend setting `hasCoverAttachment` correctly from part_assignments data.
- Evidence: plan.md:437-444

**Behavior: Location container visual grouping and flow**

- Scenarios:
  - Given a location with 1 part, When I view box detail alongside another 1-part location, Then both containers appear side-by-side in the same row (flexbox flow)
  - Given a location with 9 parts (3 rows of 4-column grid), When I view box detail, Then the location container spans multiple rows and subsequent locations wrap to new line
- Instrumentation: `data-part-count` attribute on location containers, CSS layout assertions (optional, can be deferred to manual visual QA)
- Backend hooks: Seed locations with varying part counts (1, 4, 9+) using bulk assign helper
- Gaps: Plan does not define how to test flow layout deterministically. Playwright cannot reliably assert "side-by-side" without flaky getBoundingClientRect checks. Recommend: assert containers are visible and have expected part counts, defer precise flow layout verification to manual QA or screenshot testing.
- Evidence: plan.md:445-452

## 5) Adversarial Sweep (must find ≥3 credible issues or declare why none exist)

**Major — Search filter does not account for null/undefined part fields**

**Evidence:** plan.md:211-213 — "For each location, filter partAssignments where key/description/manufacturer_code includes searchTerm (case-insensitive)" and plan.md:311-315 — "Guard against null/undefined key; filter out invalid assignments or show error badge" and types/locations.ts:3-8 — PartAssignment allows optional manufacturer_code and description.

**Why it matters:** If partAssignments contains an entry with null or undefined manufacturer_code or description, the filter logic `part.description.toLowerCase().includes(searchTerm.toLowerCase())` will throw "Cannot read property 'toLowerCase' of undefined" at runtime. TypeScript types declare these fields optional, but plan does not specify defensive checks in filter logic.

**Fix suggestion:** In plan.md section 5 (Algorithms & UI Flows, step 3), revise filtering algorithm to: "For each location, filter partAssignments where `(part.key ?? '').toLowerCase().includes(searchTerm) || (part.description ?? '').toLowerCase().includes(searchTerm) || (part.manufacturer_code ?? '').toLowerCase().includes(searchTerm)`, using nullish coalescing to handle missing fields gracefully. Add to section 8 (Errors & Edge Cases) a failure case: 'Part assignment data has null description or manufacturer_code' with handling 'Use nullish coalescing in filter logic; treat null as empty string for matching purposes.'"

**Confidence:** High — TypeScript types explicitly allow optional fields; filter logic must defend against this.

---

**Major — Missing cache invalidation strategy when part images are updated**

**Evidence:** plan.md:269-271 — "CoverImageDisplay internal queries for part cover images... TanStack Query deduplicates concurrent requests for same part" and cover-image-display.tsx:23-39 — useCoverAttachment hook caches cover metadata and images, uses dataUpdatedAt and coverAttachment.updated_at for cache busting.

**Why it matters:** If a user navigates to box detail, sees part thumbnails, then navigates to a part detail page and uploads a new cover image, then returns to box detail, the stale thumbnail may display due to TanStack Query staleTime. Plan does not specify cache invalidation strategy for this scenario. While CoverImageDisplay uses reloadToken based on dataUpdatedAt (cover-image-display.tsx:26-34), the box detail view does not know to refetch locations data when a part's cover changes.

**Fix suggestion:** Add to plan.md section 7 (State Consistency & Async Coordination): "When user navigates back to box detail from part detail (or any other route), TanStack Query background refetch will update cover images per configured staleTime. If stale images are unacceptable, add cache invalidation: on successful cover image upload (in part detail flow), invalidate queries with key matching `['getCoverAttachment', { path: { id: partId } }]` to force fresh fetch when box detail remounts. Alternatively, document that stale images are acceptable until next background refetch (typically 5 minutes per default staleTime config)." Check actual staleTime in src/lib/query-client.ts and adjust recommendation accordingly.

**Confidence:** Medium — Depends on project's staleness tolerance and actual staleTime config. If staleTime is aggressive (e.g., 5 minutes) and users frequently edit covers, this becomes user-visible. If staleTime is short or users rarely edit covers, impact is low.

---

**Major — Instrumentation gap: no test event when locations are filtered to zero results**

**Evidence:** plan.md:353-358 — "Empty state after filtering testid... Rendered when filtered locations array is empty... Consumer: Playwright test asserts empty state message after entering non-matching search" and plan.md:276 — "No test events for search (client-side filtering is deterministic; tests can directly assert visible parts)."

**Why it matters:** Plan proposes tests assert empty state `data-testid="boxes.detail.locations.no-matches"` after entering non-matching search, but without a test event signaling "filtering complete," tests must use arbitrary waits or poll for element visibility. This violates project principle "instrumentation drives every deterministic wait" (docs/contribute/testing/playwright_developer_guide.md:130). If search input is debounced (plan.md:517), race conditions become likely.

**Fix suggestion:** Add to plan.md section 9 (Observability / Instrumentation) a new signal: "Search filter completion event — Type: Instrumentation event via custom hook (e.g., useSearchInstrumentation) — Trigger: After useMemo recomputes filtered locations and React finishes rendering — Labels / fields: `{ scope: 'boxes.detail.search', phase: 'complete', totalLocations, visibleLocations, searchTerm }` — Consumer: Playwright helper `waitForSearchComplete(page, 'boxes.detail', expectedCount)` ensures tests wait for filtered results before assertions." If debouncing is added, this event must fire after debounce completes.

**Confidence:** High — Project testing philosophy requires deterministic waits via instrumentation, not element polling. Search is a new user-visible behavior and needs instrumentation.

---

**Minor — Part card size calculation assumes fixed dimensions but does not account for long part names or descriptions**

**Evidence:** plan.md:252-257 — "Part card size and grid layout... 150px card width, 4 cards per row, 12px gap... Invariant: Location container width ≈ (150px × columns) + (12px × (columns-1)) + 24px padding + 4px border" and plan.md:411-414 — "Part cards within locations... thumbnail (120x120px recommended), part name/description (2 lines), part number, quantity badge."

**Why it matters:** If a part has a very long name or manufacturer code, the card content may overflow the fixed 150px width, causing text wrapping that breaks the vertical alignment of cards in the grid or causes horizontal overflow. Plan does not specify text truncation or ellipsis strategy for card content.

**Fix suggestion:** Add to plan.md section 12 (UX / UI Impact) under "Part cards within locations" entry: "Part name and description text must be truncated with ellipsis if exceeding card width. Use Tailwind classes `truncate` or `line-clamp-2` on text elements to ensure cards maintain consistent height and width. Add to section 8 (Errors & Edge Cases): 'Failure: Part has very long name or description — Surface: PartLocationCard text rendering — Handling: Apply `line-clamp-2` to description and `truncate` to manufacturer code; show full text in title attribute for tooltip on hover — Guardrails: CSS prevents layout breakage — Evidence: Design constraint from plan.md:252-257.'"

**Confidence:** Medium — Visual overflow is a UX issue, not a functional blocker. Can be caught in manual QA or visual regression testing, but better to specify in plan to avoid rework.

---

**Minor — Derived value for "empty locations after filtering" does not have explicit cleanup or guard**

**Evidence:** plan.md:237-243 — "Derived value: Empty location visibility... Invariant: Empty locations never render; users explicitly requested this to reduce clutter... Must check both isEmpty flag and post-filter partAssignments length" and plan.md:299-303 — "Failure: All locations are empty (or all filtered out by search)... Handling: Empty state shows 'No parts found' or similar message... Check filtered locations length; distinguish between 'no locations' vs 'no matches'."

**Why it matters:** Plan correctly identifies the need to distinguish "box has no locations" vs "all locations filtered out," but does not specify the guard condition clearly. If `locations` is undefined (e.g., during loading or error state) and search term is non-empty, the derived filter logic may throw or render incorrect empty state.

**Fix suggestion:** Add to plan.md section 6 (Derived State & Invariants) under "Filtered locations list": "Guards: Check `locations` is defined and is array before filtering; if undefined, return empty array and rely on existing 'No locations available' empty state (location-list.tsx:9-14). Ensure filtering logic handles edge case where `locations` is undefined due to loading or error state, to prevent 'Cannot read property map of undefined' runtime error." Also clarify in section 5 step 3: "If locations is undefined or null, skip filtering and pass empty array to LocationList."

**Confidence:** Medium — TypeScript types may catch this if strictly enforced, but defensive runtime check is safer. Impact is a potential runtime crash if error state coincides with active search term.

## 6) Derived-Value & State Invariants (table)

**Derived value: Filtered locations list**

- Source dataset: `useBoxLocationsWithParts` data (sorted by loc_no) + local `searchTerm` state (unfiltered source, filtered in useMemo)
- Write / cleanup triggered: No persistent writes; purely derived for rendering. Filtering happens synchronously in useMemo, no async cleanup. When searchTerm clears, filter returns to full list.
- Guards: Must check `locations` is defined before filtering (see Adversarial Sweep finding above). Must use nullish coalescing on part fields (key, description, manufacturer_code) to avoid null.toLowerCase() errors.
- Invariant: Filtered list length ≤ original locations length. A location with all parts filtered out must not appear in filtered list (equivalent to empty location, hidden per user requirement). If searchTerm is empty string, filtered list equals original list (minus empty locations).
- Evidence: plan.md:229-236, plan.md:211-216

**Derived value: Empty location visibility (pre-filter and post-filter)**

- Source dataset: LocationDisplayData `isEmpty` field (from hook) and post-filter `partAssignments.length === 0` (from filter logic)
- Write / cleanup triggered: No writes; controls rendering decision. When locations data changes (e.g., part added/removed, refetch), isEmpty field updates; when search changes, post-filter check updates.
- Guards: Check both `isEmpty` flag and `partAssignments.length === 0` after filtering to handle case where location is occupied but all parts are filtered out (plan.md:239-243). Ensure rendering logic handles undefined locations array gracefully.
- Invariant: No location with `isEmpty: true` or `partAssignments.length === 0` (post-filter) is rendered. User explicitly requested "I wouldn't show empty locations then. It doesn't add value anyway." (plan.md:57). Breaking this invariant clutters UI against user preference.
- Evidence: plan.md:237-243, plan.md:299-303

**Derived value: Part card rendering order within location containers**

- Source dataset: `partAssignments` array within each LocationDisplayData (unfiltered or filtered depending on context)
- Write / cleanup triggered: No writes; determines render order of PartLocationCard components. If backend returns part_assignments in arbitrary order, frontend must not reorder (preserve backend order) or must sort explicitly (e.g., by part key alphabetically).
- Guards: Check `partAssignments` is non-null array before mapping. If null, render "No parts" state (should not occur if location is occupied, but defensive check prevents crash).
- Invariant: Part cards within a location container render in the order provided by backend API (loc_no sorted, but part_assignments order within location is undefined in plan). If deterministic order is required (e.g., alphabetical by part key), plan must specify sorting logic in hook or component.
- Evidence: plan.md:198-200 (LocationContainer renders grid of PartLocationCard components), use-box-locations.ts:50 (partAssignments passed through from API)

**Derived value: Location container width and flex wrapping**

- Source dataset: Number of parts in location (partAssignments.length) and fixed card width (150px) + gap (12px) + padding (24px) + border (4px)
- Write / cleanup triggered: No writes; CSS flexbox handles layout automatically. If viewport width changes (resize), flexbox reflows naturally. No JavaScript calculation or state update needed.
- Guards: CSS must prevent container width from exceeding viewport. Use `flex-wrap: wrap` on location grid and `max-width: 100%` or similar constraint to avoid horizontal overflow. Plan mentions "4 cards per row" (plan.md:255) but does not specify responsive behavior if viewport is narrower than 4 cards × 150px.
- Invariant: Location containers flow left-to-right, top-to-bottom in page. Small locations (1-3 parts) can sit side-by-side if viewport width allows; large locations (9+ parts) wrap parts internally (4 columns) and push subsequent locations to new row. No overlap or horizontal scroll (unless viewport is extremely narrow, in which case plan explicitly excludes mobile responsive requirements, plan.md:73-74).
- Evidence: plan.md:246-257, plan.md:68-69 (desktop-optimized layout)

## 7) Risks & Mitigations (top 3)

**Risk: Backend does not provide has_cover_attachment flag, causing N+1 cover attachment queries**

- Mitigation: Before starting slice 1 (plan.md:456-460), confirm backend capability. If backend cannot provide flag: (a) extend backend to include `has_cover_attachment` in part_assignments response (preferred), (b) add compound query in frontend hook to batch-fetch cover flags for all part keys in response (acceptable tradeoff, adds complexity), or (c) accept extra queries and document performance implication (plan already notes TanStack Query deduplicates and caches, plan.md:492). If (c) is chosen, add performance monitoring to ensure box detail pages with 50+ parts remain responsive.
- Evidence: plan.md:490-492, plan.md:145-151 (PartAssignment type enhancement)

**Risk: Existing Playwright tests break due to DOM structure changes without clear migration path**

- Mitigation: Plan includes slice 6 to update tests (plan.md:481-484), but does not specify whether existing `expectLocationOccupied` helper (boxes-detail.spec.ts:65) will be refactored or replaced. Before slice 4 (LocationList changes), document page object migration strategy: either preserve data-is-occupied and data-primary-part-key attributes on new LocationContainer component (simpler), or refactor page object to use new data-testid selectors (data-part-count, etc.). Run existing tests against new UI in slice 6 to catch breakage early. Use feature flag to enable new layout incrementally if rollback is needed.
- Evidence: plan.md:501-504, boxes-detail.spec.ts:65, plan.md:342-344 (location container testid)

**Risk: Search filtering logic has edge cases with special characters, null values, or extremely long search terms**

- Mitigation: Implement defensive filter logic as specified in Adversarial Sweep finding above (nullish coalescing, toLowerCase() guards). Add unit tests for filter function with edge cases: empty string search, null part fields, search terms containing regex special characters (handled by .includes(), plan.md:320), very long search terms (>100 chars, truncate with maxLength attribute on input, plan.md:319). Add to slice 5 (plan.md:476-479): "Write unit tests for search filter logic before integrating into BoxDetails component; test with malformed part data (null description, undefined manufacturer_code) and edge case search terms."
- Evidence: plan.md:497-500, plan.md:316-321

## 8) Confidence

**Confidence: Medium** — The plan demonstrates strong technical understanding, follows project patterns, and provides detailed implementation guidance. However, three significant uncertainties reduce confidence: (1) backend has_cover_attachment support is unknown and critically affects performance, (2) search filtering behavior with multi-part locations and null fields needs clarification to avoid runtime errors, and (3) instrumentation for search completion is missing despite project's test-event-driven philosophy. Resolving these conditions before slice 1 will raise confidence to High.
