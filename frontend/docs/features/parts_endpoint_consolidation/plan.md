# Parts Endpoint Consolidation - Implementation Plan

## 0) Research Log & Findings

**Discovery work:**
- Examined `/work/frontend/src/hooks/use-all-parts-with-locations.ts` - simple wrapper around `usePaginatedFetchAll` pointing to removed `/api/parts/with-locations` endpoint
- Reviewed `/work/frontend/src/hooks/use-paginated-fetch-all.ts` - generic pagination hook using manual state management with `api.GET` calls
- Analyzed `/work/frontend/src/components/parts/part-list.tsx` - main consumer making separate calls to `useAllPartsWithLocations()`, `useShoppingListMembershipIndicators()`, and `usePartKitMembershipIndicators()`
- Examined generated types in `types.ts:6369-6600` - confirmed `PartWithTotalSchemaList_a9993e3_PartWithTotalSchema` includes optional `kits`, `shopping_lists`, `locations`, `cover_url`, and `cover_thumbnail_url` fields
- Reviewed indicator hooks `/work/frontend/src/hooks/use-part-kit-memberships.ts` and `/work/frontend/src/hooks/use-part-shopping-list-memberships.ts` - both have separate single-part variants for detail pages and bulk indicator variants for list views
- Checked Playwright test `/work/frontend/tests/e2e/parts/part-list.spec.ts` - relies on `parts.waitForCards()` and instrumentation events
- Found query invalidation pattern using `queryClient.invalidateQueries({ queryKey: ['getPartsWithLocations'] })` in multiple files

**Key findings:**
- Backend has already removed `/api/parts/with-locations` and consolidated data into `/api/parts?include=locations,kits,shopping_lists,cover`
- Current implementation makes ~793 API calls for 791 parts (1 paginated fetch + 1 bulk shopping list POST + 791 individual kit GET requests)
- New consolidated endpoint will reduce to just 1 paginated request
- The paginated fetch infrastructure is already in place and working
- Kit and shopping list data structures in consolidated response match existing indicator hook types
- Query invalidation key needs updating from `getPartsWithLocations` to match new endpoint

**Conflicts resolved:**
- No file naming conflicts; new hook will replace old one cleanly
- Type compatibility confirmed between new response fields and existing indicator summaries
- Instrumentation scope `parts.list` already exists; no new events needed

---

## 1) Intent & Scope

**User intent**

Replace the deprecated `/api/parts/with-locations` endpoint with the new consolidated `/api/parts?include=locations,kits,shopping_lists,cover` endpoint in the parts list view. This change eliminates hundreds of redundant API calls by including kit memberships and shopping list indicators directly in the paginated parts response.

**Prompt quotes**

"The backend has already removed `/api/parts/with-locations` endpoint"

"The new endpoint is `/api/parts?include=locations,kits,shopping_lists,cover`"

"This reduces the API calls to just 1 paginated request"

**In scope**

- Create new hook `useAllParts` that fetches from `/api/parts?include=locations,kits,shopping_lists,cover`
- Update `PartList` component to use new hook and build indicator maps from consolidated response
- Remove deprecated `useAllPartsWithLocations` hook
- Update query invalidation keys from `getPartsWithLocations` to new endpoint key
- Ensure instrumentation continues working with new data flow
- Verify Playwright tests pass with single consolidated request

**Out of scope**

- Changes to part detail pages (they continue using single-part endpoints)
- Modifications to backend API (already completed)
- Removal of single-part indicator hooks (`usePartKitMemberships`, `usePartShoppingListMemberships`) - still needed for detail views
- Changes to `PartListItem` component beyond updating props if needed
- Cover image display changes (already using `CoverImageDisplay` component that handles URLs)

**Assumptions / constraints**

- Generated API types are up-to-date with latest OpenAPI spec from backend
- The `usePaginatedFetchAll` infrastructure continues to work as-is with query parameter support
- Backend includes all requested data when `include` parameter is provided
- Existing instrumentation events (`parts.list.ready`) remain unchanged
- Kit and shopping list data in consolidated response matches structure expected by indicator components
- Query invalidation happens at component mount (existing pattern in `PartList.tsx:51-54`)

---

## 2) Affected Areas & File Map

**Areas to create:**

- Area: New hook `src/hooks/use-all-parts.ts`
- Why: Replace deprecated `useAllPartsWithLocations` with hook that fetches from `/api/parts?include=locations,kits,shopping_lists,cover`
- Evidence: New file based on pattern from `use-all-parts-with-locations.ts:1-22`

**Areas to modify:**

- Area: `src/components/parts/part-list.tsx`
- Why: Replace `useAllPartsWithLocations()` with new `useAllParts()`, remove separate indicator hook calls, build indicator maps from consolidated response
- Evidence: `part-list.tsx:12` imports `useAllPartsWithLocations`, `part-list.tsx:15-16` imports indicator hooks, `part-list.tsx:31-37` calls parts hook, `part-list.tsx:92-96` calls shopping indicators, `part-list.tsx:150-155` calls kit indicators, `part-list.tsx:52` invalidates old query key

- Area: `src/hooks/use-shopping-lists.ts`
- Why: Update query invalidation from `getPartsWithLocations` to new parts endpoint key
- Evidence: `use-shopping-lists.ts:110` contains `queryClient.invalidateQueries({ queryKey: ['getPartsWithLocations'] })`

**Areas to delete:**

- Area: `src/hooks/use-all-parts-with-locations.ts`
- Why: Deprecated hook pointing to removed backend endpoint
- Evidence: `use-all-parts-with-locations.ts:21` calls `/api/parts/with-locations` which backend removed

**Areas reviewed but unchanged:**

- Area: `src/hooks/use-paginated-fetch-all.ts`
- Why: Generic pagination infrastructure works with query parameters; no changes needed
- Evidence: `use-paginated-fetch-all.ts:50` already supports query params via `(api.GET as any)(path, { params: { query: { ... } } })`

- Area: `src/components/parts/part-card.tsx`
- Why: Already receives indicator summaries as props; no structural changes needed
- Evidence: `part-card.tsx:25-32` accepts indicator summary props

- Area: `src/hooks/use-part-kit-memberships.ts`
- Why: Single-part variant still needed for detail pages; only bulk indicator variant (`usePartKitMembershipIndicators`) becomes redundant for list view
- Evidence: `use-part-kit-memberships.ts:172-228` exports single-part hook used elsewhere

- Area: `src/hooks/use-part-shopping-list-memberships.ts`
- Why: Single-part variant still needed for detail pages; only bulk indicator variant becomes redundant for list view
- Evidence: `use-part-shopping-list-memberships.ts:171-236` exports single-part hook used elsewhere

---

## 3) Data Model / Contracts

**New consolidated parts response:**

- Entity: Parts list with embedded indicators
- Shape:
  ```typescript
  // Type: PartWithTotalSchemaList_a9993e3_PartWithTotalSchema[]
  [
    {
      key: "ABCD",
      description: "...",
      total_quantity: 100,
      // ... other part fields ...

      // Optional included fields (null when not requested):
      locations: [
        { box_no: 1, loc_no: 2, qty: 50 },
        // ...
      ] | null,

      kits: [
        {
          kit_id: 42,
          kit_name: "ESP32 Board",
          status: "active",
          build_target: 10,
          required_per_unit: 2,
          reserved_quantity: 20,
          updated_at: "2024-01-15T10:30:00Z"
        }
      ] | null,

      shopping_lists: [
        {
          shopping_list_id: 5,
          shopping_list_name: "Q1 Order",
          shopping_list_status: "ready",
          line_id: 123,
          line_status: "new",
          needed: 50,
          ordered: 0,
          received: 0,
          note: "Urgent" | null,
          seller: { id: 1, name: "DigiKey", website: "..." } | null
        }
      ] | null,

      cover_url: "/api/attachments/123" | null,
      cover_thumbnail_url: "/api/attachments/123/thumbnail" | null
    }
  ]
  ```
- Mapping: No adapter needed; component builds indicator maps directly using `useMemo` with existing summary builder logic patterns
- Evidence: `types.ts:6369-6600` defines `PartWithTotalSchemaList_a9993e3_PartWithTotalSchema` with all optional include fields

**Kit membership summary (derived):**

- Entity: Kit indicator map built from consolidated response
- Shape:
  ```typescript
  Map<string, PartKitMembershipSummary> {
    "ABCD" => {
      partKey: "ABCD",
      kits: [...],  // sorted, active first
      hasMembership: true,
      activeCount: 1,
      archivedCount: 0,
      kitNames: ["ESP32 Board"]
    }
  }
  ```
- Mapping: Extract `part.kits` array, sort by status (active first) then name, build summary using same logic as `use-part-kit-memberships.ts:89-123`
- Evidence: `use-part-kit-memberships.ts:110-123` defines `createSummary` function, `use-part-kit-memberships.ts:101-108` defines `sortKits`

**Shopping list membership summary (derived):**

- Entity: Shopping list indicator map built from consolidated response
- Shape:
  ```typescript
  Map<string, ShoppingListMembershipSummary> {
    "ABCD" => {
      partKey: "ABCD",
      memberships: [...],
      hasActiveMembership: true,
      listNames: ["Q1 Order"],
      conceptListIds: [],
      activeCount: 1,
      conceptCount: 0,
      readyCount: 1,
      completedCount: 0
    }
  }
  ```
- Mapping: Extract `part.shopping_lists` array, filter to active (status !== 'done'), build summary using same logic as `use-part-shopping-list-memberships.ts:83-104`
- Evidence: `use-part-shopping-list-memberships.ts:83-104` defines `createSummary` function

**Query key structure:**

- Entity: React Query cache key for parts endpoint
- Shape: No query key needed; `usePaginatedFetchAll` manages state without React Query cache
- Mapping: Invalidation switches from `['getPartsWithLocations']` to `['getParts']` or similar
- Evidence: `use-paginated-fetch-all.ts:29-100` uses manual state management, not `useQuery`

---

## 4) API / Integration Surface

**New consolidated parts endpoint:**

- Surface: `GET /api/parts?limit=1000&offset=0&include=locations,kits,shopping_lists,cover`
- Inputs:
  - Query params: `limit: 1000`, `offset: number`, `include: "locations,kits,shopping_lists,cover"`
  - Called via `api.GET('/api/parts', { params: { query: { limit, offset, include } } })`
- Outputs:
  - Response: `PartWithTotalSchemaList_a9993e3_PartWithTotalSchema[]` with all include fields populated
  - Cache updates: None (hook uses manual state management, not React Query cache)
  - Post-fetch state: Component receives complete array after all pages fetched
- Errors:
  - Error boundaries: Errors set in hook's error state, displayed via `part-list.tsx:332-344` error content
  - Toast/notification: Global error handler via `toApiError` in paginated fetch hook
  - Retry semantics: Component remounts to retry (existing pattern)
- Evidence: `use-paginated-fetch-all.ts:48-70` shows pagination loop with error handling

**Removed indicator endpoints (no longer called from list view):**

- Surface: `GET /api/parts/{part_key}/kits` (per-part)
- Why removed: Data now included in consolidated response via `include=kits`
- Evidence: `use-part-kit-memberships.ts:69-74` calls this endpoint N times

- Surface: `POST /api/parts/shopping-list-memberships/query` (bulk)
- Why removed: Data now included in consolidated response via `include=shopping_lists`
- Evidence: `use-part-shopping-list-memberships.ts:41-52` calls this for bulk lookup

**Query invalidation:**

- Surface: `queryClient.invalidateQueries({ queryKey: ['getPartsWithLocations'] })` → update to match new endpoint
- Inputs: New query key matching parts endpoint (TBD based on generated hook name)
- Outputs: Triggers component remount and refetch
- Errors: N/A (invalidation always succeeds)
- Evidence: `part-list.tsx:51-54` invalidates on mount, `use-shopping-lists.ts:110` invalidates on shopping list changes

---

## 5) Algorithms & UI Flows

**Parts list initialization flow:**

- Flow: Component mount and data loading
- Steps:
  1. `PartList` component mounts
  2. Calls `queryClient.invalidateQueries()` with new parts endpoint key (line 51-54 pattern)
  3. `useAllParts()` hook initializes, triggers first page fetch with `include=locations,kits,shopping_lists,cover`
  4. Hook fetches pages sequentially (1000 parts per page) until backend returns < 1000 items
  5. Hook returns complete `parts` array to component
  6. Component builds type map from `useGetTypes()` (unchanged)
  7. Component derives kit indicator map via `useMemo` from `parts[].kits` field
  8. Component derives shopping indicator map via `useMemo` from `parts[].shopping_lists` field
  9. Component filters parts by search term, stock filter, shopping list filter (unchanged)
  10. Component renders cards with indicator data from derived maps
- States / transitions:
  - Loading: `isLoading: true` during initial fetch
  - Fetching: `isFetching: true` during pagination loop
  - Ready: `isLoading: false, isFetching: false` with data populated
  - Error: `error: Error` with error content displayed
- Hotspots:
  - Indicator map derivation in `useMemo` - runs on every parts data change, must be efficient
  - Filtering logic - now runs only once per render instead of waiting for separate indicator calls
  - Re-render pressure reduced: no separate indicator hook state changes
- Evidence: `part-list.tsx:28-78` shows current initialization pattern

**Kit indicator map building:**

- Flow: Derive kit membership summaries from consolidated response
- Steps:
  1. Component receives `parts` array with `kits` field populated
  2. `useMemo` hook runs with `parts` as dependency
  3. For each part, extract `part.kits ?? []` array
  4. Sort kits: active status first, then alphabetically by name
  5. Build summary: count active vs archived, extract names
  6. Store in `Map<partKey, PartKitMembershipSummary>`
  7. Return map for card props
- States / transitions: Synchronous derivation, no async state
- Hotspots: Runs on every parts change; must handle null `kits` field gracefully
- Evidence: `use-part-kit-memberships.ts:101-123` shows sorting and summary building logic

**Shopping list indicator map building:**

- Flow: Derive shopping list membership summaries from consolidated response
- Steps:
  1. Component receives `parts` array with `shopping_lists` field populated
  2. `useMemo` hook runs with `parts` as dependency
  3. For each part, extract `part.shopping_lists ?? []` array
  4. Filter to active memberships: `listStatus !== 'done' && lineStatus !== 'done'`
  5. Build summary: separate concept vs ready lists, extract names
  6. Store in `Map<partKey, ShoppingListMembershipSummary>`
  7. Return map for card props
- States / transitions: Synchronous derivation, no async state
- Hotspots: Runs on every parts change; must handle null `shopping_lists` field gracefully
- Evidence: `use-part-shopping-list-memberships.ts:83-104` shows filtering and summary building logic

**Filter application flow (unchanged):**

- Flow: Search and filter interactions
- Steps:
  1. User types in search input or toggles filter
  2. Debounced search updates URL search params
  3. Component receives new props, filters `parts` array
  4. Filters apply to all parts first, then filtered set used for kit indicators
  5. Filtered parts rendered in grid
- States / transitions: Synchronous filtering via `useMemo`, no loading state
- Hotspots: Shopping list filter now reads from indicator map built from all parts (not filtered)
- Evidence: `part-list.tsx:99-156` shows filter application logic

---

## 6) Derived State & Invariants

**Kit indicator map:**

- Derived value: `Map<string, PartKitMembershipSummary>` built from parts response
- Source:
  - Unfiltered input: `parts[].kits` field from consolidated API response
  - Built in component via `useMemo(() => { ... }, [parts])`
- Writes / cleanup: None; read-only map for card props
- Guards:
  - Null check: `part.kits ?? []` handles missing field
  - Empty array creates empty summary with `hasMembership: false`
- Invariant: Map keys match part keys exactly; no orphaned or missing entries
- Evidence: Pattern from `part-list.tsx:150-155` (current kit indicator usage)

**Shopping list indicator map:**

- Derived value: `Map<string, ShoppingListMembershipSummary>` built from parts response
- Source:
  - Unfiltered input: `parts[].shopping_lists` field from consolidated API response
  - Built in component via `useMemo(() => { ... }, [parts])`
- Writes / cleanup: None; read-only map for card props
- Guards:
  - Null check: `part.shopping_lists ?? []` handles missing field
  - Active filter: `listStatus !== 'done' && lineStatus !== 'done'`
  - Empty array creates empty summary with `hasActiveMembership: false`
- Invariant: Map must include ALL parts (not just filtered) so shopping list filter can reference it
- Evidence: `part-list.tsx:92-97` shows shopping indicators loaded for ALL parts (critical for filter)

**Type name map (unchanged):**

- Derived value: `Map<number, string>` mapping type IDs to names
- Source: Separate `useGetTypes()` query result
- Writes / cleanup: None
- Guards: Map.get returns undefined for missing types
- Invariant: Must remain available for search filtering and card display
- Evidence: `part-list.tsx:83-89` builds type map from types query

**Filtered parts array:**

- Derived value: Subset of parts matching search term + filters
- Source:
  - Unfiltered: `parts` array from `useAllParts()`
  - Filtered by: search term (description, ID, MFR code, type name, tags), hasStock (total_quantity > 0), onShoppingList (indicator map lookup)
- Writes / cleanup: None; derives new array on every change
- Guards: All filters use AND logic; missing values default to no match
- Invariant: Shopping list filter MUST read from indicator map built from ALL parts, not filtered subset
- Evidence: `part-list.tsx:101-136` shows sequential filter application logic

**Sorted parts array:**

- Derived value: Filtered parts sorted alphabetically by description
- Source: `filteredParts` with locale-aware sort applied
- Writes / cleanup: None; creates new array reference for stable rendering
- Guards: Sort is case-insensitive with numeric awareness
- Invariant: Sort must preserve filter results exactly; no additions or removals
- Evidence: `part-list.tsx:138-141` shows sort implementation

---

## 7) State Consistency & Async Coordination

**Source of truth:**

- Parts data: Manual state in `usePaginatedFetchAll` hook (not React Query cache)
- Types data: React Query cache via `useGetTypes()`
- Indicator data: Derived synchronously from parts data
- Evidence: `use-paginated-fetch-all.ts:29-100` uses `useState` for data, not `queryClient.setQueryData`

**Coordination:**

- Parts and types load in parallel via separate hooks
- Indicator maps derive from parts data via `useMemo` (synchronous)
- No coordination needed between indicators - both read from same parts array
- Component shows loading until both parts and types are ready
- Evidence: `part-list.tsx:45-78` shows loading state debouncing for both queries

**Async safeguards:**

- Abort controller: `usePaginatedFetchAll.ts:37` creates controller, aborts on unmount
- Cancelled flag: `usePaginatedFetchAll.ts:36` prevents state updates after unmount
- Stale response protection: Hook checks `!cancelled` before calling `setData` (line 72)
- No suspense boundaries: Component handles loading inline
- Evidence: `use-paginated-fetch-all.ts:85-90` shows cleanup logic

**Instrumentation:**

- Events emitted: `parts.list` scope with phases `loading`, `ready`, `error`
- When:
  - `loading` emitted when `partsLoading || typesLoading` is true
  - `ready` emitted when both queries complete with success
  - `error` emitted when either query fails
- Metadata includes: `totalCount`, `visibleCount`, `filteredCount`, `searchTerm`, `activeFilters`, `paginationInfo`
- Consumer: Playwright tests use `waitForListLoading(page, 'parts.list', 'ready')`
- Evidence: `part-list.tsx:162-231` shows `useListLoadingInstrumentation` integration

**Query invalidation timing:**

- When: On component mount (useEffect with empty deps)
- What: Invalidates query key matching parts endpoint
- Why: Forces fresh data when navigating back to list
- Evidence: `part-list.tsx:50-54` invalidates `getPartsWithLocations` (to be updated)

---

## 8) Errors & Edge Cases

**Parts endpoint failure:**

- Failure: `GET /api/parts` returns 4xx/5xx or network error during pagination
- Surface: `PartList` component receives `error` from hook
- Handling:
  - Error content displayed via `part-list.tsx:332-344` (card with error message)
  - Instrumentation emits `error` phase with error details
  - User must remount component to retry (navigate away and back)
- Guardrails:
  - Partial results discarded - if any page fails, entire dataset is dropped
  - No stale data shown - error state prevents rendering old data
- Evidence: `use-paginated-fetch-all.ts:77-82` sets error state on failure

**Types endpoint failure:**

- Failure: `GET /api/types` fails (separate query)
- Surface: `PartList` component receives `typesError`
- Handling:
  - Combined error displayed (parts error OR types error)
  - Type names unavailable for cards and search
  - Cards show without type badges
- Guardrails: Both queries must succeed for ready state
- Evidence: `part-list.tsx:80` combines errors, `part-list.tsx:393-401` shows error precedence

**Empty parts response:**

- Failure: No parts exist in inventory
- Surface: `PartList` receives empty array
- Handling: Empty state with "No parts yet" message and CTA to create first part
- Guardrails: Empty array is valid state, not error
- Evidence: `part-list.tsx:346-360` shows empty content

**Search returns no results:**

- Failure: Filter criteria match zero parts
- Surface: `PartList` has `filtersOrSearchActive: true` and `visibleCount: 0`
- Handling: No results state with "No parts found" message
- Guardrails: Distinguishes between empty database and no matches
- Evidence: `part-list.tsx:363-369` shows no results content, `part-list.tsx:398` checks `filtersOrSearchActive`

**Null indicator fields:**

- Failure: Backend omits `kits`, `shopping_lists`, or `locations` despite `include` param (should not happen)
- Surface: Part object has `kits: null` or `shopping_lists: null`
- Handling:
  - Nullish coalescing: `part.kits ?? []` treats null as empty array
  - Empty summaries created with `hasMembership: false`, `activeCount: 0`
  - Cards render without indicator badges
- Guardrails: All null checks use `?? []` pattern to prevent crashes
- Evidence: Pattern from existing null handling in components

**Component unmount during fetch:**

- Failure: User navigates away while pagination in progress
- Surface: `usePaginatedFetchAll` hook cleanup runs
- Handling:
  - Abort controller cancels in-flight requests
  - Cancelled flag prevents setState calls
  - No errors logged or surfaced
- Guardrails: Cleanup in `useEffect` return function
- Evidence: `use-paginated-fetch-all.ts:87-90` aborts and sets cancelled flag

**Invalidation race:**

- Failure: Shopping list mutation invalidates parts while list is loading
- Surface: Component remounts mid-fetch
- Handling:
  - Previous fetch aborted via cleanup
  - New fetch starts with fresh data
  - No stale data shown
- Guardrails: Each mount creates new abort controller
- Evidence: `use-paginated-fetch-all.ts:35-90` shows per-mount lifecycle

---

## 9) Observability / Instrumentation

**Parts list loading events:**

- Signal: `parts.list` loading/ready/error events
- Type: `list_loading` instrumentation event
- Trigger:
  - `loading` when `partsLoading || typesLoading`
  - `ready` when both queries complete successfully
  - `error` when either query fails
  - Emitted by `useListLoadingInstrumentation` hook
- Labels / fields:
  - `scope: "parts.list"`
  - `totalCount: number` - total parts fetched
  - `visibleCount: number` - parts after filtering
  - `filteredCount: number | undefined` - count when filters active
  - `searchTerm: string | null` - active search text
  - `activeFilters: string[]` - e.g., `["hasStock", "onShoppingList"]`
  - `paginationInfo: { pagesFetched: number, limit: 1000 }`
- Consumer: Playwright `waitForListLoading(page, 'parts.list', 'ready')`
- Evidence: `part-list.tsx:162-231` shows instrumentation hook configuration

**No new instrumentation events needed:**

- Shopping list indicators: No separate loading event (derived synchronously from parts)
- Kit indicators: No separate loading event (derived synchronously from parts)
- Rationale: Single parts fetch provides all data, so single loading lifecycle suffices
- Evidence: Current implementation has separate `parts.list.shoppingListIndicators` and `parts.list.kitIndicators` scopes which will be removed

**Data attributes (unchanged):**

- `data-testid="parts.list"` - root container
- `data-testid="parts.list.card"` - individual cards
- `data-part-key="{partKey}"` - card identifier for selection
- `data-testid="parts.list.summary"` - count summary
- `data-testid="parts.list.loading"` - loading skeleton
- Evidence: `part-list.tsx:404,319,54` shows existing test IDs

---

## 10) Lifecycle & Background Work

**Parts fetch effect:**

- Hook / effect: `usePaginatedFetchAll` internal `useEffect`
- Trigger cadence: On mount (path dependency never changes)
- Responsibilities:
  - Fetch sequential pages until < 1000 items returned
  - Aggregate results into single array
  - Handle errors and set loading states
  - Update `pagesFetched` counter
- Cleanup: Abort controller cancels requests, cancelled flag prevents setState
- Evidence: `use-paginated-fetch-all.ts:35-90` shows effect implementation

**Query invalidation effect:**

- Hook / effect: `useEffect` in `PartList` component
- Trigger cadence: On mount (empty dependency array)
- Responsibilities:
  - Invalidate parts query key
  - Invalidate types query key
  - Force fresh data load
- Cleanup: None needed (invalidation is immediate)
- Evidence: `part-list.tsx:50-54` shows invalidation pattern

**Loading visibility debounce:**

- Hook / effect: `useEffect` in `PartList` tracking loading state changes
- Trigger cadence: When any loading/fetching state changes
- Responsibilities:
  - Show loading immediately when fetching starts
  - Delay hiding loading by 200ms to prevent flicker
  - Clear timeout on unmount
- Cleanup: Clears timeout via `clearTimeout` and ref
- Evidence: `part-list.tsx:56-78` shows debounce logic

**No background polling:**

- No SSE subscriptions in parts list
- No interval-based revalidation
- Data refreshes only on mount or explicit user action
- Evidence: No `setInterval` or SSE code in component

---

## 11) Security & Permissions

Not applicable for this change. No authentication, authorization, or data exposure concerns. Parts list is a read-only view using existing API security model.

---

## 12) UX / UI Impact

**No visible UX changes:**

- Entry point: `/parts` route (unchanged)
- Change: API call consolidation happens transparently to user
- User interaction: Identical - cards render with same data, filters work identically
- Dependencies:
  - Parts must load completely before indicators appear (single fetch provides both)
  - Loading state duration may change slightly (fewer parallel requests)
- Evidence: `part-list.tsx:1-420` component structure remains intact

**Potential UX improvement:**

- Faster initial load: Single consolidated request instead of ~793 separate calls
- Reduced network overhead: 99% fewer HTTP requests
- More consistent loading state: No staggered indicator loading after cards appear
- Evidence: Brief states single consolidated request vs current 793 calls

---

## 13) Deterministic Test Plan

**Parts list loading with consolidated data:**

- Surface: `/parts` list view
- Scenarios:
  - Given database has parts with kit memberships and shopping list memberships
  - When user navigates to parts list
  - Then parts load via single consolidated endpoint with `include=locations,kits,shopping_lists,cover`
  - And kit badges display correctly on cards
  - And shopping list badges display correctly on cards
  - And all existing filters (search, hasStock, onShoppingList) continue working
- Instrumentation / hooks:
  - `waitForListLoading(page, 'parts.list', 'ready')` ensures data loaded
  - `parts.waitForCards()` waits for card grid to render
  - No separate indicator loading events needed
  - Network inspection can verify single `/api/parts` call with `include` parameter
- Gaps: None - existing test coverage should pass with no modifications
- Evidence: `part-list.spec.ts:1-100` shows existing test patterns

**Kit indicator display:**

- Surface: Part cards in list view
- Scenarios:
  - Given part is member of 2 active kits
  - When part card renders
  - Then kit indicator badge shows count "2"
  - And tooltip shows kit names and metadata
- Instrumentation / hooks:
  - `parts.cardByKey(partKey)` selector
  - `data-testid="parts.list.card.kit-indicator"` for badge
  - Existing MembershipIndicator component handles display
- Gaps: None - indicator component unchanged
- Evidence: `part-card.tsx:100-112` shows kit indicator implementation

**Shopping list indicator display:**

- Surface: Part cards in list view
- Scenarios:
  - Given part appears on 1 shopping list
  - When part card renders
  - Then shopping list indicator badge shows count "1"
  - And tooltip shows list name and status
- Instrumentation / hooks:
  - `parts.cardByKey(partKey)` selector
  - `data-testid="parts.list.card.shopping-list-indicator"` for badge
  - Existing MembershipIndicator component handles display
- Gaps: None - indicator component unchanged
- Evidence: `part-card.tsx:88-99` shows shopping list indicator implementation

**Shopping list filter with consolidated data:**

- Surface: `/parts` with `onShoppingList=true` filter
- Scenarios:
  - Given database has 10 parts, 3 on shopping lists
  - When user toggles "On Shopping List" filter
  - Then only 3 parts display
  - And summary shows "3 of 10 parts showing"
  - And filter uses indicator data from consolidated response
- Instrumentation / hooks:
  - `parts.waitForCards()` for filtered results
  - `parts.expectSummaryText(/3 of 10 parts showing/i)`
  - Filter toggle via `data-testid="parts.list.filter.onShoppingList"`
- Gaps: None - filter logic unchanged, data source updated
- Evidence: `part-list.tsx:129-133` shows shopping list filter logic

**Search with type names:**

- Surface: `/parts` with search term
- Scenarios:
  - Given part has type "Resistor"
  - When user searches for "Resistor"
  - Then part appears in results
  - And type map continues working from separate types query
- Instrumentation / hooks:
  - `parts.search(term)` helper
  - `parts.expectSummaryText(/1 of \d+ parts/i)`
- Gaps: None - types query unchanged
- Evidence: `part-list.tsx:104-119` shows search logic including type name matching

---

## 14) Implementation Slices

**Slice 1: Create new hook and update component:**

- Goal: Replace deprecated endpoint with consolidated fetch
- Touches:
  - Create `src/hooks/use-all-parts.ts`
  - Update `src/components/parts/part-list.tsx` to use new hook
  - Build indicator maps from consolidated response
  - Update imports and remove old indicator hook calls
- Dependencies: Generated types must be current

**Slice 2: Update query invalidation and cleanup:**

- Goal: Remove deprecated code and update invalidation keys
- Touches:
  - Delete `src/hooks/use-all-parts-with-locations.ts`
  - Update `src/hooks/use-shopping-lists.ts` query invalidation key
  - Find and update any other invalidation references
- Dependencies: Slice 1 complete

**Slice 3: Verify Playwright tests:**

- Goal: Ensure all existing tests pass without modification
- Touches:
  - Run `/work/frontend/tests/e2e/parts/part-list.spec.ts`
  - Run `/work/frontend/tests/e2e/parts/part-crud.spec.ts`
  - Run any other specs touching parts list
  - Verify network calls show single consolidated request
- Dependencies: Slice 2 complete

---

## 15) Risks & Open Questions

**Risks:**

- Risk: Backend `include` parameter not working as expected
- Impact: Parts load without embedded indicator data; UI shows no badges
- Mitigation: Test with real backend during development; backend team confirms implementation complete

- Risk: Generated types out of sync with backend schema
- Impact: TypeScript compilation errors or runtime type mismatches
- Mitigation: Run `pnpm generate:api` before starting implementation; verify `PartWithTotalSchemaList_a9993e3_PartWithTotalSchema` has all expected fields

- Risk: Indicator summary building logic differs from existing hooks
- Impact: Kit/shopping list badges show incorrect counts or data
- Mitigation: Extract exact summary building logic from existing hooks into utility functions; unit test if needed

- Risk: Missing query invalidation references
- Impact: Stale data shown after mutations
- Mitigation: Search codebase for all `getPartsWithLocations` references before declaring complete

- Risk: Playwright tests break due to instrumentation changes
- Impact: CI fails, blocking merge
- Mitigation: Run full test suite locally; keep instrumentation scope unchanged (`parts.list`)

**Open questions:**

- Question: What query key name should replace `getPartsWithLocations`?
- Why it matters: Multiple files use this for invalidation
- Owner / follow-up: Check generated hooks for `/api/parts` GET endpoint; likely `getParts` or similar. If no generated query key exists (since we're using manual pagination), use `['parts.list']` or `['allParts']` as convention.

- Question: Should we add query parameters to invalidation key (e.g., `['getParts', { include: '...' }]`)?
- Why it matters: Cache invalidation precision
- Owner / follow-up: No - `usePaginatedFetchAll` doesn't use React Query cache, so invalidation key doesn't need parameter specificity. Use simple key like `['parts.list']`.

- Question: Do any other components or routes use `useAllPartsWithLocations`?
- Why it matters: Could break other parts of the app
- Owner / follow-up: Search codebase before deleting hook. If found, expand scope to update those call sites.

---

## 16) Confidence

Confidence: High — The backend change is complete, the data structures align perfectly with existing indicator types, and the consolidation eliminates complexity rather than adding it. The existing pagination infrastructure requires no changes, and the component already handles similar derived state patterns. The main implementation work is extracting existing summary building logic into the component layer, which is straightforward refactoring with clear patterns to follow.
