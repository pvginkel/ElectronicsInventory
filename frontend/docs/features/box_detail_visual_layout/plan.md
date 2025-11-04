# Feature Plan: Box Detail Visual Layout

## 0) Research Log & Findings

**Discovery work performed:**

Searched the codebase for box-related components, API hooks, and test infrastructure. Key findings:

1. **Current implementation structure:**
   - Route: `src/routes/boxes/$boxNo.tsx` renders BoxDetails component
   - Main component: `src/components/boxes/box-details.tsx` (340 lines)
   - Location display: `src/components/boxes/location-list.tsx` → `location-item.tsx`
   - Data hook: `src/hooks/use-box-locations.ts` wraps `useGetBoxesLocationsByBoxNo`
   - API: `/api/boxes/{box_no}/locations?include_parts=true` returns `LocationWithPartsResponse[]`

2. **Current location rendering:**
   - `LocationList` renders a vertical list (`space-y-2`) of `LocationItem` components
   - Each `LocationItem` is a horizontal bar showing location number, part key/description, and quantity
   - Shows location count and has max-height scrolling
   - Empty locations are shown with "Empty" state

3. **Part display patterns elsewhere:**
   - `src/components/parts/part-card.tsx` (PartListItem) shows parts with 64x64 cover images via `CoverImageDisplay`
   - CoverImageDisplay component (`src/components/documents/cover-image-display.tsx`) supports small/medium/large sizes, lazy loading, and placeholders
   - Part data includes `has_cover_attachment` flag to avoid unnecessary queries

4. **Data model:**
   - `LocationDisplayData` includes: `boxNo`, `locNo`, `isOccupied`, `partAssignments[]`, `totalQuantity`
   - `PartAssignment` includes: `key`, `qty`, `manufacturer_code`, `description`
   - **Gap identified:** Part assignments lack `has_cover_attachment` flag needed for efficient image loading

5. **Testing infrastructure:**
   - Existing spec: `tests/e2e/boxes/boxes-detail.spec.ts`
   - Page object: `tests/support/page-objects/boxes-page.ts` with `expectLocationOccupied` helper
   - Instrumentation: `useListLoadingInstrumentation` with scope `boxes.detail` already in place
   - Test data: `tests/api/factories/box-factory.ts` available

6. **Conflicts resolved:**
   - Current `LocationItem` is fundamentally different UI (horizontal bar vs. card grid in container)
   - Will create new components rather than modifying existing ones to avoid disruption
   - Search will be client-side filtering (consistent with boxes list page pattern)

## 1) Intent & Scope

**User intent**

The box detail view currently shows locations as a simple list with minimal part information. Users working with physical inventory need to visually identify unlabeled parts by matching them to photos and descriptions. The current list view wastes space and doesn't leverage the visual information available. The user wants a card-based layout where location containers flow naturally, small locations sit side-by-side, and each part is shown with its thumbnail for easy visual identification.

**Prompt quotes**

"The locations section for boxes shows the parts that are in the locations. However, it's not really useful."

"I'm not labeling all components and that sometimes the location in the box is the only thing I have to go on."

"What if we just draw a location around parts and then flow everything left to right, top to bottom?"

"I wouldn't show empty locations then. It doesn't add value anyway."

"I would like to see all of them. I don't want anything collapsed. I think a search option at the top of the screen would be good."

**In scope**

- Replace vertical location list with flowing location container layout
- Create visual part cards showing thumbnail, name, part number, quantity
- Location containers wrap their parts (4 per row) and flow left-to-right, top-to-bottom
- Hide empty locations from display
- Add page-level search/filter box that filters across all locations
- Desktop-optimized layout (no mobile responsive requirements)
- Click-through to part detail page remains primary action
- Maintain existing instrumentation for `boxes.detail` scope

**Out of scope**

- Mobile/tablet responsive optimizations
- Inline quantity editing (remains on part detail page)
- Part movement between locations (remains on part detail page)
- Label printing
- Spatial layout visualization (user explicitly declined)
- Location metadata editing in this view
- Bulk operations or multi-select
- Pagination (all parts shown, client-side filter only)

**Assumptions / constraints**

- Total parts across all locations in a single box remains manageable (<100 parts typical)
- Backend `/api/boxes/{box_no}/locations?include_parts=true` endpoint already returns part assignments with descriptions
- Part cover images are accessible via existing `CoverImageDisplay` pattern
- Users have ~7 boxes currently, not expecting significant growth
- Physical box locations map to database `loc_no` order (left-to-right, top-to-bottom)
- Search can be fully client-side (no backend pagination needed)
- Part assignment data ideally includes `has_cover_attachment` flag; if unavailable, CoverImageDisplay will query per-part (acceptable tradeoff with TanStack Query caching)
- Search filtering shows only matching parts within locations; locations with zero matching parts are hidden entirely

## 2) Affected Areas & File Map

- Area: Box detail route
  Why: No changes needed, already renders BoxDetails component
  Evidence: src/routes/boxes/$boxNo.tsx:8-21 — renders BoxDetails with boxNo prop and navigation handler

- Area: BoxDetails main component
  Why: Add search state, filter logic, pass search results to LocationList; remains orchestration layer
  Evidence: src/components/boxes/box-details.tsx:27-340 — fetches box data and locations, renders layout with summary and locations cards

- Area: LocationList component
  Why: Replace vertical stack (`space-y-2`) with flexbox flow layout (`flex flex-wrap`); pass filtered locations
  Evidence: src/components/boxes/location-list.tsx:18-32 — currently renders `space-y-2` vertical list of LocationItem components

- Area: LocationItem component
  Why: Replace with LocationContainer that renders a bordered container with internal parts grid; horizontal bar UI no longer appropriate
  Evidence: src/components/boxes/location-item.tsx:8-68 — renders single horizontal bar with location badge and part summary

- Area: New PartLocationCard component
  Why: Create card component for individual parts within location containers; shows image, name, part number, quantity
  Evidence: Similar pattern exists in src/components/parts/part-card.tsx:35-172 — PartListItem shows 64x64 cover image, name, metadata

- Area: CoverImageDisplay component
  Why: Reuse for part thumbnails; no changes needed, already supports multiple sizes and lazy loading
  Evidence: src/components/documents/cover-image-display.tsx:16-103 — handles image loading, PDFs, placeholders, sizes (small=64px, medium=96px)

- Area: useBoxLocationsWithParts hook
  Why: May need to fetch additional part data (cover attachment flags) or coordinate with separate parts query
  Evidence: src/hooks/use-box-locations.ts:5-82 — transforms API location response to LocationDisplayData, includes PartAssignment array

- Area: LocationDisplayData type
  Why: No changes needed; `partAssignments` array already includes key, qty, manufacturer_code, description
  Evidence: src/types/locations.ts:17-22 — LocationDisplayData extends LocationWithParts with display fields

- Area: PartAssignment type
  Why: Needs `has_cover_attachment?: boolean` field added to enable efficient CoverImageDisplay usage
  Evidence: src/types/locations.ts:3-8 — PartAssignment interface defines part data in locations

- Area: Box detail Playwright spec
  Why: Update tests to assert on new card-based layout, location containers, search filtering, and hidden empty locations
  Evidence: tests/e2e/boxes/boxes-detail.spec.ts:19-108 — tests location display, usage metrics, deletion flow

- Area: BoxesPage page object
  Why: Add locators for part cards, location containers, search input; update `expectLocationOccupied` to work with new DOM structure
  Evidence: tests/support/page-objects/boxes-page.ts:189-210 — defines `locationItem()` locator and occupation assertions

## 3) Data Model / Contracts

- Entity / contract: LocationDisplayData (no change)
  Shape: `{ boxNo: number, locNo: number, isOccupied: boolean, partAssignments: PartAssignment[] | null, totalQuantity: number, displayText: string, isEmpty: boolean, stylingClasses: string }`
  Mapping: Already camelCase; hook transforms snake_case API response
  Evidence: src/types/locations.ts:17-22

- Entity / contract: PartAssignment (enhancement recommended)
  Shape: Current: `{ key: string, qty: number, manufacturer_code?: string, description?: string }`
         Recommended: Add `has_cover_attachment?: boolean` field
  Mapping: If backend provides `has_cover_attachment`, hook maps to camelCase `hasCoverAttachment`; if unavailable, field remains undefined and CoverImageDisplay will query as needed
  Evidence: src/types/locations.ts:3-8

- Entity / contract: GET /api/boxes/{box_no}/locations response
  Shape: `LocationWithPartsResponse[]` where each location includes `part_assignments[]`
  Mapping: `useBoxLocationsWithParts` transforms to LocationDisplayData; needs to preserve/transform `has_cover_attachment` if backend provides it
  Evidence: src/hooks/use-box-locations.ts:8-14 — calls API with `include_parts: 'true'` query param

- Entity / contract: Search filter state (new)
  Shape: `{ searchTerm: string }` — local component state in BoxDetails
  Mapping: Client-side filter against `part.key`, `part.description`, `part.manufacturer_code`
  Evidence: Similar pattern in src/components/parts/part-list.tsx:83-98 — filters parts by search term

- Entity / contract: Filtered locations list (derived)
  Shape: `LocationDisplayData[]` with partAssignments filtered by search term; empty locations (after filtering) excluded
  Mapping: Derived in BoxDetails component, passed to LocationList
  Evidence: New logic; pattern based on part-list filtering

## 4) API / Integration Surface

- Surface: GET /api/boxes/{box_no}/locations?include_parts=true / useGetBoxesLocationsByBoxNo
  Inputs: `{ path: { box_no: number }, query: { include_parts: 'true' } }`
  Outputs: `LocationResponseSchemaList_a9993e3` (array of locations with part_assignments); errors surface through TanStack Query error boundary
  Errors: Standard API error handling via ApiError, toast notifications; useListLoadingInstrumentation tracks loading/error states
  Evidence: src/hooks/use-box-locations.ts:8-14; src/components/boxes/box-details.tsx:41-46

- Surface: Part cover images (indirect via CoverImageDisplay)
  Inputs: `partId: string`, `hasCoverAttachment?: boolean`, `size: 'small' | 'medium' | 'large'`
  Outputs: CoverImageDisplay internally calls useCoverAttachment hook which queries GET /api/parts/{id}/attachments?cover=true; renders image or placeholder
  Errors: Image load failures handled internally with fallback to PDF icon or placeholder; no error surfacing to parent
  Evidence: src/components/documents/cover-image-display.tsx:23-103; src/hooks/use-cover-image.ts (referenced but not read in this research)

- Surface: No new backend endpoints required
  Inputs: N/A
  Outputs: Current API sufficient if backend can include `has_cover_attachment` in part_assignments or accept it as limitation (will trigger extra queries)
  Errors: If backend cannot provide flag, each PartLocationCard may trigger unnecessary cover attachment query (acceptable tradeoff)
  Evidence: Discussed in data model section; need to verify backend capability or document performance implication

## 5) Algorithms & UI Flows

- Flow: Box detail page load with new layout
  Steps:
    1. Route mounts BoxDetails component with `boxNo` param
    2. BoxDetails fetches box metadata via `useGetBoxesByBoxNo` and locations via `useBoxLocationsWithParts`
    3. useBoxLocationsWithParts returns sorted LocationDisplayData array (by loc_no)
    4. BoxDetails filters locations to exclude empty ones (isEmpty: true)
    5. BoxDetails passes non-empty locations to LocationList
    6. LocationList renders flexbox container
    7. For each location, render LocationContainer component
    8. LocationContainer renders bordered box with location name header
    9. LocationContainer renders CSS grid of PartLocationCard components (4 columns)
    10. Each PartLocationCard renders CoverImageDisplay, part name, part number, quantity
    11. useListLoadingInstrumentation emits `boxes.detail` ready event
  States / transitions: `isLoading` → `ready` | `error`; search state independent
  Hotspots: Multiple CoverImageDisplay mounts may trigger concurrent API calls for part images (mitigated by hasCoverAttachment flag and TanStack Query caching)
  Evidence: src/components/boxes/box-details.tsx:32-98 — existing data fetching and instrumentation

- Flow: Search / filter interaction
  Steps:
    1. User types in search input (debounced, 300ms typical)
    2. BoxDetails updates local `searchTerm` state
    3. useMemo derives filtered locations list:
       - For each location, filter partAssignments to only include matching parts:
         - Match against: `part.key`, `part.description ?? ''`, `part.manufacturer_code ?? ''` (defensive null checks)
         - Case-insensitive comparison using `.toLowerCase().includes(searchTerm.toLowerCase())`
         - Create new location object with filtered partAssignments array containing only matching parts
       - If location has no matching parts (filtered array empty), exclude entire location from results
       - Result: Array of locations where each location contains only the parts that match the search
    4. Pass filtered locations (with partial part lists) to LocationList
    5. LocationList re-renders with subset of locations, each showing only matching parts
    6. Empty search shows all non-empty locations with all parts (original behavior)
    7. Emit search state change event for test instrumentation (scope: `boxes.detail.search`, phase: `filtered` | `cleared`)
  States / transitions: Instant filtering, no loading state; maintains location grouping; partial matches within locations
  Hotspots: Large part counts could cause re-render lag; useMemo memoization should suffice for <100 parts
  Evidence: Pattern from src/components/parts/part-list.tsx:83-98; defensive null handling added per review

- Flow: Part card click-through
  Steps:
    1. User clicks PartLocationCard
    2. Navigate to `/parts/${partKey}` route
    3. Part detail page loads
  States / transitions: Standard TanStack Router navigation
  Hotspots: None
  Evidence: Existing pattern throughout app; PartListItem uses onClick prop

## 6) Derived State & Invariants

- Derived value: Filtered locations list
  Source: `useBoxLocationsWithParts` data + local `searchTerm` state
  Writes / cleanup: No writes; purely derived for display
  Guards: Ensure partAssignments is not null before filtering; use defensive null coalescing (`?? ''`) for optional part fields (description, manufacturer_code); handle empty array gracefully
  Invariant: Filtered locations contain only parts matching the search term; locations with zero matching parts are excluded entirely; partial matches are allowed (e.g., location with 4 parts may show only 1 matching part)
  Evidence: src/components/boxes/box-details.tsx:41-46 (data source); new filtering logic to be added; user clarification: "only show parts that match the filter"

- Derived value: Empty location visibility
  Source: LocationDisplayData `isEmpty` field or `partAssignments.length === 0` after filtering
  Writes / cleanup: No writes; determines rendering
  Guards: Must check both isEmpty flag and post-filter partAssignments length
  Invariant: Empty locations never render; users explicitly requested this to reduce clutter
  Evidence: User requirement: "I wouldn't show empty locations then. It doesn't add value anyway."

- Derived value: Location container width
  Source: Number of parts in location after filtering
  Writes / cleanup: No writes; CSS flexbox naturally sizes containers based on 4-column grid width
  Guards: Container must not exceed viewport width; parts grid uses 4 columns max
  Invariant: Small locations (1-3 parts) can sit side-by-side; large locations (9+ parts) push subsequent locations to new row naturally
  Evidence: Design doc docs/features/box_detail_visual_layout/ux-design-box-detail-flowing-locations.md

- Derived value: Part card size and grid layout
  Source: Fixed design spec: 150px card width, 4 cards per row, 12px gap
  Writes / cleanup: No writes; static CSS
  Guards: Cards must not overflow location container
  Invariant: Location container width ≈ (150px × columns) + (12px × (columns-1)) + 24px padding + 4px border
  Evidence: docs/features/box_detail_visual_layout/ux-design-box-detail-flowing-locations.md — container math section

## 7) State Consistency & Async Coordination

- Source of truth: TanStack Query cache for locations data (`['getBoxesLocationsByBoxNo', { path: { box_no }, query: { include_parts: 'true' } }]`); local React state for search term
  Coordination: useBoxLocationsWithParts hook ensures single query cache entry; BoxDetails local search state is independent and does not trigger refetch
  Async safeguards: TanStack Query handles stale data, background refetch, abort on unmount; search is synchronous derived state
  Instrumentation: useListLoadingInstrumentation already tracks `boxes.detail` scope with loading/ready/error phases; search does not emit separate events (instant client-side operation)
  Evidence: src/components/boxes/box-details.tsx:74-99 — instrumentation setup

- Source of truth: CoverImageDisplay internal queries for part cover images
  Coordination: Each CoverImageDisplay manages its own query; TanStack Query deduplicates concurrent requests for same part; cache invalidation handled automatically when user updates part attachments (TanStack Query invalidates on mutation completion)
  Async safeguards: useCoverAttachment hook (inside CoverImageDisplay) handles loading states, errors internally; lazy loading attribute defers off-screen images; dataUpdatedAt timestamp forces reload when cache entry is refreshed
  Instrumentation: No specific instrumentation for image loads (too granular); errors logged to console but don't fail page load
  Evidence: src/components/documents/cover-image-display.tsx:23-39; cache invalidation via mutation success callbacks (standard pattern)

- Source of truth: Search term state (local to BoxDetails component)
  Coordination: No coordination needed; purely local UI state; no URL sync required (differs from boxes list which syncs search to URL)
  Async safeguards: N/A (synchronous)
  Instrumentation: Emits `boxes.detail.search` test event with phase `filtered` (when searchTerm is non-empty) or `cleared` (when searchTerm is empty); includes metadata: `{ searchTerm, matchingLocationCount, matchingPartCount }`
  Evidence: New implementation; test events enable deterministic Playwright assertions on filtered state

## 8) Errors & Edge Cases

- Failure: Locations API fails to load
  Surface: BoxDetails component via useBoxLocationsWithParts error state
  Handling: Existing error fallback shows "Failed to load location details" message; falls back to basic location view from box.locations array (no part details)
  Guardrails: useListLoadingInstrumentation emits error event; error boundary catches unhandled errors
  Evidence: src/components/boxes/box-details.tsx:270-288

- Failure: Part cover image fails to load (404, network error)
  Surface: CoverImageDisplay component
  Handling: Component catches onError event, displays placeholder icon or PDF icon; does not propagate error to parent
  Guardrails: imageError state prevents retry loop; placeholder ensures UI remains intact
  Evidence: src/components/documents/cover-image-display.tsx:66-73

- Failure: Box has no locations at all
  Surface: LocationList component
  Handling: Existing empty state "No locations available" message displays
  Guardrails: Check `locations.length === 0` before rendering list
  Evidence: src/components/boxes/location-list.tsx:9-14

- Failure: All locations are empty (or all filtered out by search)
  Surface: LocationList component after filtering
  Handling: Empty state shows "No parts found" or similar message (new)
  Guardrails: Check filtered locations length; distinguish between "no locations" vs "no matches"
  Evidence: New logic required; similar to src/components/parts/part-list.tsx empty state handling

- Failure: Location has parts but all lack descriptions/images
  Surface: PartLocationCard components
  Handling: CoverImageDisplay shows placeholder; part name shows part key as fallback
  Guardrails: formatPartForDisplay utility (from part-card pattern) handles missing description gracefully
  Evidence: src/components/parts/part-card.tsx:48 uses formatPartForDisplay

- Failure: Part assignment data missing required fields (key is null)
  Surface: PartLocationCard component or filter logic
  Handling: Guard against null/undefined key; filter out invalid assignments or show error badge
  Guardrails: TypeScript types enforce `key: string`; runtime guard needed if API returns malformed data
  Evidence: src/types/locations.ts:4 — key is required string

- Failure: Search term is extremely long or contains special regex characters
  Surface: Search filter logic
  Handling: Use `.includes()` rather than regex to avoid injection; truncate search input with maxLength attribute
  Guardrails: Standard input validation; toLowerCase() for case-insensitive comparison
  Evidence: Pattern from src/components/parts/part-list.tsx:86-96 — uses `.toLowerCase().includes()`

## 9) Observability / Instrumentation

- Signal: boxes.detail list loading events (ready, loading, error)
  Type: Instrumentation event via useListLoadingInstrumentation
  Trigger: On location data fetch completion in BoxDetails component
  Labels / fields: `{ scope: 'boxes.detail', boxNo, capacity, locationCount, usagePercentage }` (success) or `{ error, boxNo }` (error)
  Consumer: Playwright spec waits for `boxes.detail` ready event via `waitForListLoading(page, 'boxes.detail', 'ready')`
  Evidence: src/components/boxes/box-details.tsx:74-99

- Signal: Part card testid attributes
  Type: data-testid HTML attributes
  Trigger: Rendered on each PartLocationCard mount
  Labels / fields: `data-testid="boxes.detail.part-card.{partKey}"`, `data-part-key="{partKey}"`
  Consumer: Playwright assertions to verify part visibility and click interactions
  Evidence: Pattern from src/components/parts/part-card.tsx:54-55

- Signal: Location container testid attributes
  Type: data-testid HTML attributes
  Trigger: Rendered on each LocationContainer mount
  Labels / fields: `data-testid="boxes.detail.location-container.{boxNo}-{locNo}"`, `data-location-id="{boxNo}-{locNo}"`, `data-part-count="{partCount}"`
  Consumer: Playwright assertions to verify location grouping, part counts, and flow layout
  Evidence: Pattern from existing LocationItem src/components/boxes/location-item.tsx:17-21

- Signal: Search input testid
  Type: data-testid HTML attribute
  Trigger: Rendered on BoxDetails mount
  Labels / fields: `data-testid="boxes.detail.search"`
  Consumer: Playwright test fills input and asserts filtered results
  Evidence: Pattern from boxes list src/components/boxes/box-list.tsx (referenced in page object)

- Signal: Search state change event
  Type: Test instrumentation event
  Trigger: After searchTerm state update and filtering is complete
  Labels / fields: `{ scope: 'boxes.detail.search', phase: 'filtered' | 'cleared', searchTerm: string, matchingLocationCount: number, matchingPartCount: number }`
  Consumer: Playwright test waits for filtered event to ensure deterministic assertions after search input; enables reliable verification of filter results
  Evidence: New implementation; addresses review requirement for test-friendly search instrumentation

- Signal: Empty state after filtering testid
  Type: data-testid HTML attribute
  Trigger: Rendered when filtered locations array is empty
  Labels / fields: `data-testid="boxes.detail.locations.no-matches"`
  Consumer: Playwright test asserts empty state message after entering non-matching search
  Evidence: New; similar to src/components/boxes/location-list.tsx:11

## 10) Lifecycle & Background Work

- Hook / effect: CoverImageDisplay image loading
  Trigger cadence: On mount for each visible part card; lazy loading defers off-screen images until scrolled into view
  Responsibilities: Fetch cover attachment metadata via useCoverAttachment; load thumbnail image via img src; handle errors
  Cleanup: TanStack Query manages cache lifecycle; image onError handled in component state
  Evidence: src/components/documents/cover-image-display.tsx:23-39

- Hook / effect: useBoxLocationsWithParts data fetch
  Trigger cadence: On component mount; background refetch per TanStack Query staleTime config
  Responsibilities: Fetch locations with part assignments; transform to LocationDisplayData; sort by loc_no
  Cleanup: TanStack Query aborts in-flight requests on unmount
  Evidence: src/hooks/use-box-locations.ts:8-82

- Hook / effect: Search term debouncing (if implemented)
  Trigger cadence: On user input; debounce delays filtering (optional optimization)
  Responsibilities: Update searchTerm state after debounce delay
  Cleanup: Clear timeout on unmount or subsequent input
  Evidence: Optional; src/components/ui/debounced-search-input.tsx exists in codebase for this pattern

- Hook / effect: useListLoadingInstrumentation
  Trigger cadence: On isLoading / isFetching / error state changes
  Responsibilities: Emit test-event payloads for Playwright consumption; track loading phases
  Cleanup: No explicit cleanup; event emission is side-effect only
  Evidence: src/components/boxes/box-details.tsx:74-99

## 11) Security & Permissions

Not applicable. This feature modifies display of existing box and part data; no new permission checks or authorization logic required. Part and location visibility is already controlled by backend API access. Frontend renders data as provided by authenticated API responses.

## 12) UX / UI Impact

- Entry point: Boxes detail page `/boxes/{boxNo}`
  Change: Replace vertical list of location items with flowing grid of location containers; each container shows visual part cards
  User interaction: Users can now visually scan part images to identify physical parts; search filters across all locations; click any part card to navigate to part detail
  Dependencies: CoverImageDisplay component, existing part detail route
  Evidence: src/routes/boxes/$boxNo.tsx:4-21

- Entry point: Location section in box detail
  Change: Remove max-height scrolling container; locations flow naturally down the page; empty locations hidden
  User interaction: Scroll page to see more locations (no inner scroll area); location boundaries are visually distinct with borders
  Dependencies: LocationDisplayData from useBoxLocationsWithParts
  Evidence: src/components/boxes/box-details.tsx:264-294

- Entry point: Search input (new)
  Change: Add search input at top of page (near header actions)
  User interaction: Type to filter parts across all locations; locations with no matching parts are hidden; clear search shows all
  Dependencies: Local state management in BoxDetails
  Evidence: New addition; placement similar to boxes list search

- Entry point: Part cards within locations
  Change: New visual card component with thumbnail (120x120px recommended), part name/description (2 lines max), part number (1 line), quantity badge
  User interaction: Click card to navigate to part detail page; hover shows pointer cursor
  Dependencies: CoverImageDisplay, formatPartForDisplay utility, navigation hook
  Evidence: Pattern from src/components/parts/part-card.tsx:59-117
  Text overflow handling: Part name truncated with ellipsis (`overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 2`) after 2 lines; part number truncated with ellipsis after 1 line; full text available via title attribute tooltip on hover

## 13) Deterministic Test Plan

- Surface: Box detail page with visual part cards layout
  Scenarios:
    - Given a box with multiple locations each containing parts, When I navigate to box detail, Then I see location containers flowing left-to-right with part cards inside each container
    - Given a location with 1 part, When viewing box detail, Then that location container displays as a small box that can sit alongside other small containers
    - Given a location with 9 parts, When viewing box detail, Then that location container spans multiple rows with 4 parts per row and an incomplete last row
    - Given a box with some empty locations, When I view box detail, Then empty locations are not displayed (only non-empty locations visible)
  Instrumentation / hooks: `waitForListLoading(page, 'boxes.detail', 'ready')`, `data-testid="boxes.detail.location-container.{boxNo}-{locNo}"`, `data-testid="boxes.detail.part-card.{partKey}"`, `data-part-count` attribute
  Gaps: Backend must return `has_cover_attachment` in part_assignments or accept extra queries; factory helpers may need extension for multi-part locations
  Evidence: tests/e2e/boxes/boxes-detail.spec.ts:19-76

- Surface: Search / filter functionality
  Scenarios:
    - Given a box with parts, When I enter a part key in search input and wait for `boxes.detail.search` filtered event, Then only locations containing that part are displayed (partial matches: location shows only matching parts)
    - Given a location with 4 parts where only 1 matches search, When I filter, Then that location displays with only 1 part card visible
    - Given a search that matches no parts, When I view box detail and wait for filtered event, Then an empty state message "No parts match your search" is displayed with `data-testid="boxes.detail.locations.no-matches"`
    - Given an active search filter, When I clear the search input and wait for `boxes.detail.search` cleared event, Then all non-empty locations are displayed again with all their parts
  Instrumentation / hooks: `data-testid="boxes.detail.search"`, wait for test event `{ scope: 'boxes.detail.search', phase: 'filtered' | 'cleared' }`, `data-testid="boxes.detail.locations.no-matches"`, assert on visible location containers and part card counts
  Gaps: Backend factory helper needed to create deterministic multi-part locations for partial match testing (e.g., `testData.boxes.addMultiplePartsToLocation(boxNo, locNo, partKeys[])`)
  Evidence: New test coverage required; pattern from boxes list tests; instrumentation enables deterministic wait points

- Surface: Part card interaction
  Scenarios:
    - Given a part card with a cover image, When the part loads, Then the thumbnail displays the cover image
    - Given a part card without a cover image, When the part loads, Then a placeholder icon is displayed
    - Given a visible part card, When I click it, Then I navigate to that part's detail page
  Instrumentation / hooks: Click `data-testid="boxes.detail.part-card.{partKey}"`, assert navigation to `/parts/{partKey}`
  Gaps: None; click-through is standard navigation
  Evidence: tests/support/page-objects/boxes-page.ts

- Surface: Location container visual grouping
  Scenarios:
    - Given a location with 4 parts, When I view box detail, Then all 4 part cards are contained within a single bordered location container with the location name header
    - Given multiple locations with 1 part each, When I view box detail, Then these location containers appear side-by-side in the same row
  Instrumentation / hooks: `data-testid="boxes.detail.location-container.{boxNo}-{locNo}"`, `data-part-count="{count}"`, CSS layout assertions (optional)
  Gaps: None; DOM structure is sufficient
  Evidence: New test coverage; design docs/features/box_detail_visual_layout/ux-design-box-detail-flowing-locations.md

## 14) Implementation Slices

- Slice: Update types and data model
  Goal: Enhance PartAssignment type with hasCoverAttachment field; ensure hook transforms data correctly
  Touches: src/types/locations.ts, src/hooks/use-box-locations.ts
  Dependencies: Verify backend provides `has_cover_attachment` in part_assignments or document workaround

- Slice: Create PartLocationCard component
  Goal: Reusable card component for parts in location containers; shows image, name, part number, quantity
  Touches: src/components/boxes/part-location-card.tsx (new), CoverImageDisplay reuse, formatPartForDisplay utility
  Dependencies: PartAssignment type updated in slice 1

- Slice: Create LocationContainer component
  Goal: Bordered container with location name header and 4-column parts grid
  Touches: src/components/boxes/location-container.tsx (new)
  Dependencies: PartLocationCard from slice 2

- Slice: Update LocationList for flexbox flow layout
  Goal: Replace vertical stack with flex wrap layout; render LocationContainer components; handle empty state
  Touches: src/components/boxes/location-list.tsx
  Dependencies: LocationContainer from slice 3

- Slice: Add search to BoxDetails
  Goal: Add search input, filter locations by part data, pass filtered results to LocationList
  Touches: src/components/boxes/box-details.tsx
  Dependencies: LocationList updates from slice 4

- Slice: Update Playwright tests
  Goal: Add test coverage for new layout, search, part cards, location containers; update page object helpers
  Touches: tests/e2e/boxes/boxes-detail.spec.ts, tests/support/page-objects/boxes-page.ts
  Dependencies: All UI slices complete; instrumentation in place

## 15) Risks & Open Questions

**Risks:**

- Risk: Backend may not provide `has_cover_attachment` flag in part_assignments
  Impact: Each part card triggers separate cover attachment query; could cause N+1 query problem for locations with many parts
  Mitigation: Verify backend capability before slice 1; if unavailable, accept extra queries (TanStack Query deduplicates and caches) or add compound query in hook; document performance tradeoff

- Risk: Large number of parts (50+) with images may cause slow initial render
  Impact: Page feels sluggish; many concurrent image requests
  Mitigation: Leverage lazy loading attribute on images; CoverImageDisplay already implements this; browser limits concurrent requests naturally; consider virtualization only if user reports issues

- Risk: Search filtering logic may have edge cases with special characters or null values
  Impact: Runtime errors or incorrect filtering
  Mitigation: RESOLVED - Defensive null coalescing (`?? ''`) added to algorithm for optional fields (description, manufacturer_code); use `.includes()` not regex to avoid injection; standard input validation applied

- Risk: Existing tests may break due to DOM structure changes (LocationItem → LocationContainer + PartLocationCard)
  Impact: Test failures in CI; need to update page object locators
  Mitigation: Plan slice 6 to update tests alongside UI changes; run tests frequently during implementation

- Risk: CSS flexbox flow layout may not behave as expected with varying container widths
  Impact: Locations overlap or break onto new lines awkwardly
  Mitigation: Test with real data (1-part, 4-part, 9-part scenarios); define max-width constraints if needed; validate design with user

**Open Questions:**

- Question: Does backend include `has_cover_attachment` in `/api/boxes/{box_no}/locations?include_parts=true` response?
  Why it matters: Determines whether we can efficiently load part images or need extra queries/workaround
  Owner / follow-up: Check backend API contract during slice 1; plan accepts both scenarios (with flag = optimal, without flag = acceptable with TanStack Query caching)
  Status: Mitigated in plan; implementation will handle both cases gracefully

- Question: Should search input be debounced, or is instant filtering acceptable?
  Why it matters: Instant filtering is simpler but may lag with 100+ parts; debouncing adds complexity
  Owner / follow-up: Implement instant filtering first (useMemo should suffice); add debouncing only if user reports lag during implementation
  Status: Decision to start with instant filtering; can iterate based on performance

- Question: Should we show location count badge after filtering ("Showing 3 of 5 locations")?
  Why it matters: Helps user understand filtering is active; adds UI element
  Owner / follow-up: UX decision; can defer to later polish pass if not requested; not in current scope
  Status: Out of scope for initial implementation; can be added in future iteration if user requests

## 16) Confidence

Confidence: High — The implementation follows established patterns (card-based layouts exist in parts list, CoverImageDisplay is proven, TanStack Query caching handles image loads), the scope is well-defined with clear requirements, the main risk (backend data contract for cover attachment flags) is identifiable and mitigatable, and the existing test infrastructure supports deterministic coverage of the new UI.
