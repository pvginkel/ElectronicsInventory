# Parts List Pagination - Implementation Plan

## 0) Research Log & Findings

### Discovery Summary

Searched the following areas to understand the current implementation:

1. **Parts List Component** (`src/components/parts/part-list.tsx:27-413`)
   - Currently calls `useGetPartsWithLocations()` with no parameters
   - Displays all returned parts in memory, applying client-side filtering and sorting
   - Uses `useListLoadingInstrumentation` with scope `parts.list` for test events

2. **Generated API Hook** (`src/lib/api/generated/hooks.ts:1241-1252`)
   - `useGetPartsWithLocations` accepts optional `params` object
   - Currently the OpenAPI schema shows no query parameters for `/api/parts/with-locations`

3. **OpenAPI Schema** (`openapi-cache/openapi.json:13001-13020`)
   - Endpoint `/api/parts/with-locations` currently has `parameters: []`
   - Returns `PartWithTotalAndLocationsSchemaList.a9993e3`

4. **Testing Infrastructure**
   - `useListLoadingInstrumentation` at `src/lib/test/query-instrumentation.ts:146-236`
   - Emits `list_loading` events with metadata including counts
   - Playwright uses `waitForListLoading` helper to await list states

5. **Conflicts Resolved**
   - The brief mentions updating the OpenAPI schema as step 1, so backend changes are assumed to be delivered first
   - Default limit of 1000 per page is specified in the brief
   - Automatic pagination (fetch all pages) vs. user-controlled pagination: brief specifies automatic background loading

### Key Findings

- No existing pagination patterns in the codebase (no `useInfiniteQuery` usage found)
- Parts list component structure is straightforward: single query, memo-based filtering
- Instrumentation is already in place and will need updated metadata to reflect paginated loading
- The solution will implement "fetch-all pagination" transparently—UI receives complete dataset after all pages load

---

## 1) Intent & Scope

**User intent**

Enable users to view all parts in their inventory when they have more than 50 parts, by implementing client-side pagination that automatically fetches all available data from the backend in batches.

**Prompt quotes**

"The parts list currently fetches only the first 50 parts from the backend due to a server-side limit. This means users cannot see all parts in their inventory if they have more than 50."

"Set a default limit of 1000 parts per page"

"Automatically fetch all pages by repeatedly calling the API with increasing offsets"

"Continue fetching until a response contains fewer than 1000 elements (indicating the last page)"

"Combine all fetched pages into a single result set for the parts list component"

**In scope**

- Create a custom hook `useAllPartsWithLocations` that wraps `useGetPartsWithLocations` and fetches all pages automatically
- Update the parts list component to use the new hook instead of the generated hook directly
- Maintain existing instrumentation contract with updated metadata to reflect multi-page loading
- Ensure loading states properly reflect paginated fetching (all pages loading, not just first page)
- Update counts in instrumentation metadata to reflect total fetched across all pages

**Out of scope**

- User-visible pagination UI (page numbers, next/prev buttons)
- Virtual scrolling or windowing optimizations
- Lazy loading (load-on-scroll) behavior
- Backend OpenAPI schema changes (assumed delivered separately)
- Changes to filtering, sorting, or search behavior
- Performance optimizations beyond basic sequential page fetching

**Assumptions / constraints**

- Backend has already added `limit` and `offset` query parameters to `/api/parts/with-locations` endpoint
- Backend returns fewer items than the limit when the last page is reached
- OpenAPI schema regeneration (`pnpm generate:api`) has been run to include the new parameters
- Sequential page fetching is acceptable (no parallel requests for multiple pages)
- All pages must complete before displaying any parts (no progressive rendering)
- Memory constraints allow loading all parts into browser memory simultaneously
- The 1000-per-page limit is a reasonable batch size for the expected inventory sizes

---

## 2) Affected Areas & File Map

### Primary Implementation

- **Area:** `src/hooks/use-all-parts-with-locations.ts` (new file)
- **Why:** Encapsulates the pagination logic, fetching all pages sequentially and combining results
- **Evidence:** Pattern established in `src/hooks/use-parts.ts:1-37` for custom hooks wrapping generated API calls

- **Area:** `src/components/parts/part-list.tsx`
- **Why:** Replace direct `useGetPartsWithLocations` call with `useAllPartsWithLocations`
- **Evidence:** Line 35 shows `useGetPartsWithLocations()` call; line 159 shows `useListLoadingInstrumentation` that needs updated to reflect paginated loading state

### Testing & Instrumentation

- **Area:** `src/lib/test/query-instrumentation.ts`
- **Why:** Possibly extend if pagination metadata is needed (current implementation may be sufficient)
- **Evidence:** Lines 146-236 define `useListLoadingInstrumentation` which already supports custom metadata via callbacks

- **Area:** `src/types/test-events.ts`
- **Why:** Extend `ListLoadingTestEvent['metadata']` interface to include optional `paginationInfo` field for type-safe Playwright assertions
- **Evidence:** Required for metadata contract in plan.md section 3 (Data Model / Contracts) and Playwright test assertions that access `event.metadata.paginationInfo.pagesFetched`
- **Change:** Add optional field to existing interface:
  ```typescript
  paginationInfo?: {
    pagesFetched: number;
    limit: number;
  }
  ```

- **Area:** `tests/e2e/parts/` (new directory with new specs)
- **Why:** Add Playwright coverage for pagination behavior (empty list, single page, multiple pages)
- **Evidence:** Pattern from `docs/contribute/testing/playwright_developer_guide.md:1-100` and factory pattern in `tests/api/factories/part-factory.ts:1-100`

### Type Definitions

- **Area:** `src/lib/api/generated/hooks.ts`
- **Why:** After regeneration, the `useGetPartsWithLocations` signature will accept query params for `limit` and `offset`
- **Evidence:** Line 1241-1252 shows current hook signature accepting optional `params`

- **Area:** `src/lib/api/generated/types.ts`
- **Why:** After regeneration, operation type will include query parameters
- **Evidence:** Line 10357-10376 shows current operation definition with `query?: never`

---

## 3) Data Model / Contracts

### API Request Parameters

- **Entity / contract:** Query parameters for GET `/api/parts/with-locations`
- **Shape:**
  ```typescript
  {
    limit?: number;   // Max items per page (default: 1000)
    offset?: number;  // Starting index (default: 0)
  }
  ```
- **Mapping:** Direct pass-through in query params; no snake_case to camelCase conversion needed
- **Evidence:** `src/lib/api/generated/hooks.ts:1246` shows params passed directly to `api.GET`

### Response Contract

- **Entity / contract:** Response from GET `/api/parts/with-locations`
- **Shape:** Array of `PartWithTotalAndLocationsSchema` (unchanged from current implementation)
  ```typescript
  type PartWithTotalAndLocationsSchemaList = Array<PartWithTotalAndLocationsSchema>;
  ```
- **Mapping:** Hook aggregates multiple response arrays into single array
- **Evidence:** `src/components/parts/part-list.tsx:31` expects array of parts

### Hook State Model

- **Entity / contract:** Return type of `useAllPartsWithLocations`
- **Shape:**
  ```typescript
  {
    data: PartWithTotalAndLocationsSchemaList;  // Combined results from all pages
    isLoading: boolean;                         // True during initial fetch of all pages
    isFetching: boolean;                        // True during any refetch operation
    error: Error | null;                        // First error encountered during pagination
    // Include standard React Query properties for compatibility
  }
  ```
- **Mapping:** Aggregates TanStack Query state across multiple sequential queries
- **Evidence:** `src/components/parts/part-list.tsx:30-35` destructures these properties

### Instrumentation Metadata

- **Entity / contract:** Metadata passed to `useListLoadingInstrumentation`
- **Shape:** Extended to include pagination info
  ```typescript
  {
    status: 'success' | 'error' | 'aborted';
    queries: { parts: string; types: string };
    counts: { parts: number; types: number };
    totalCount: number;      // Total parts across all pages
    visibleCount: number;    // After filtering
    filteredCount?: number;  // If filters active
    searchTerm: string | null;
    activeFilters: string[];
    paginationInfo?: {       // NEW: Optional pagination metadata
      pagesFetched: number;
      limit: number;
    };
  }
  ```
- **Mapping:** Custom hook returns pagination metadata alongside query state
- **Evidence:** `src/components/parts/part-list.tsx:164-179` shows current metadata structure

---

## 4) API / Integration Surface

### Parts With Locations Query (Paginated)

- **Surface:** `GET /api/parts/with-locations?limit={limit}&offset={offset}` via `useGetPartsWithLocations`
- **Inputs:**
  ```typescript
  params: {
    query: {
      limit: number;   // 1000
      offset: number;  // 0, 1000, 2000, ...
    }
  }
  ```
- **Outputs:**
  - **Success:** Array of parts for the requested page
  - **Cache updates:** None (read-only query); custom hook aggregates results in memory before returning
  - **Post-fetch state:** Hook continues fetching if `response.length === limit`; stops if `response.length < limit`
- **Errors:**
  - Network errors surface through standard TanStack Query error handling
  - Error boundaries handled by existing `ApiError` wrapper (`src/lib/api/api-error.ts`)
  - Toast notifications triggered by centralized error handler
  - Pagination stops on first error; partial results are discarded
- **Evidence:** `src/lib/api/generated/hooks.ts:1241-1252` shows query hook structure

### Types Query (Unchanged)

- **Surface:** `GET /api/types` via `useGetTypes`
- **Inputs:** None
- **Outputs:** Array of types (existing behavior unchanged)
- **Errors:** Existing error handling unchanged
- **Evidence:** `src/components/parts/part-list.tsx:36-41` shows parallel types query

---

## 5) Algorithms & UI Flows

### Flow: Initial Parts List Load with Pagination

- **Flow:** Component mount → fetch all pages → display results
- **Steps:**
  1. Component calls `useAllPartsWithLocations()`
  2. Custom hook initiates first query with `{ limit: 1000, offset: 0 }`
  3. Hook awaits first response; if `response.length === 1000`, continues to step 4; otherwise jumps to step 6
  4. Hook fetches next page with `{ limit: 1000, offset: 1000 }`
  5. Repeat step 3-4 with incrementing offset until `response.length < 1000`
  6. Hook aggregates all pages into single array
  7. Hook returns aggregated array with `isLoading: false`
  8. Component receives full dataset and proceeds with existing filter/sort logic
  9. Instrumentation emits `list_loading` event with `phase: 'ready'` and total count metadata
- **States / transitions:**
  - `isLoading: true` → entire pagination in progress
  - `isLoading: false, isFetching: false` → all pages loaded
  - `error !== null` → pagination failed, partial data discarded
- **Hotspots:**
  - Sequential fetching may be slow for very large inventories (10,000+ parts = 10+ sequential requests)
  - No progress indicator for multi-page loads (loading state is binary)
  - Memory pressure if inventory exceeds browser limits (unlikely with typical electronics inventory)
- **Evidence:** `src/components/parts/part-list.tsx:27-75` shows existing loading state management

### Flow: Refetch on Data Invalidation

- **Flow:** User creates/edits/deletes part → query invalidation → refetch all pages
- **Steps:**
  1. Mutation completes (e.g., `usePostInventoryPartsStockByPartKey`)
  2. Mutation hook invalidates `['getPartsWithLocations']` query key
  3. Custom hook detects invalidation, sets `isFetching: true`
  4. Pagination logic re-executes (steps 2-8 from previous flow)
  5. UI shows loading state during refetch (existing 200ms debounce preserved)
  6. Fresh data replaces stale data atomically
- **States / transitions:**
  - `isFetching: true` during background refetch
  - Existing data remains visible during refetch (stale-while-revalidate)
- **Hotspots:**
  - Large inventories will have slow refetch times
  - Consider disabling automatic refetch on window focus for this query
- **Evidence:** `src/components/parts/part-list.tsx:48-51` shows query invalidation pattern

---

## 6) Derived State & Invariants

### Derived value: Aggregated Parts Array

- **Derived value:** `allParts`
- **Source:** Multiple paginated API responses combined sequentially
  - Input: Array responses from `GET /api/parts/with-locations` with varying offsets
  - Combination: `[...page1, ...page2, ...page3]`
- **Writes / cleanup:**
  - No persistent writes; array exists in React Query cache under custom query key
  - Cache invalidation triggers complete refetch of all pages
  - Component unmount cleanup handled by React Query garbage collection
- **Guards:**
  - Pagination continues only if previous request succeeded
  - Partial results discarded if any page fetch fails
  - Hook ensures sequential fetching (no concurrent page requests)
- **Invariant:**
  - Aggregated array must contain complete dataset (all pages) or be empty (on error)
  - Never expose partial dataset to component (e.g., only first N pages)
  - Array order matches backend order (parts from page 1, then page 2, etc.)
- **Evidence:** Pattern similar to `src/hooks/use-parts.ts:16-23` for derived calculations

### Derived value: Total Parts Count

- **Derived value:** `totalCount`
- **Source:** `allParts.length` after all pages fetched
  - Replaces current `parts.length` usage in component
- **Writes / cleanup:**
  - Passed to instrumentation metadata for test assertions
  - Drives UI count display via `ListScreenCounts`
- **Guards:**
  - Count reflects aggregated array length, not first-page response
  - Loading state prevents premature count display
- **Invariant:**
  - Count must equal sum of all page lengths: `Σ(pageN.length)`
  - Count must remain stable during filtering (total ≠ visible)
- **Evidence:** `src/components/parts/part-list.tsx:140` uses `parts.length` for total count

### Derived value: Loading State

- **Derived value:** `isLoading` (any page in-flight during initial load)
- **Source:** Custom hook internal state tracking pagination progress
  - True from mount until all pages fetched
  - Separate from `isFetching` (background refetch)
- **Writes / cleanup:**
  - Drives skeleton display in component
  - Gates instrumentation `list_loading` event emission
- **Guards:**
  - Must remain true until final page confirms completion
  - Transition to false must be atomic with data availability
- **Invariant:**
  - `isLoading` implies `data` is empty or stale
  - `!isLoading && !error` implies `data` contains complete dataset
- **Evidence:** `src/components/parts/part-list.tsx:43-75` shows loading state management

---

## 7) State Consistency & Async Coordination

### Primary Source of Truth

- **Source of truth:** TanStack Query cache for combined parts array
- **Coordination:** Custom hook manages sequential fetching internally; component sees single unified query state
  - Hook uses internal state machine to track pagination progress
  - Component continues using existing `isLoading`, `isFetching`, `error` patterns
  - No changes needed to component-level state management
- **Async safeguards:**
  - Abort controller for query cancellation if component unmounts mid-pagination
  - React Query's built-in stale response protection (newer queries supersede older)
  - Sequential fetching prevents race conditions between pages
- **Instrumentation:**
  - `useListLoadingInstrumentation` continues operating on hook state
  - Emit `list_loading:loading` when first page fetch starts
  - Emit `list_loading:ready` only after all pages complete
  - Metadata includes total items fetched across all pages
- **Evidence:** `src/lib/test/query-instrumentation.ts:175-211` shows instrumentation coordination

### Query Invalidation Strategy

- **Source of truth:** `['getPartsWithLocations']` query key (no parameters in key)
- **Coordination:**
  - Custom hook uses TanStack Query's standard invalidation
  - Mutations continue calling `queryClient.invalidateQueries({ queryKey: ['getPartsWithLocations'] })`
  - Invalidation triggers complete re-pagination (not incremental updates)
- **Async safeguards:**
  - Background refetch uses `isFetching` flag to show stale data
  - 200ms debounced loading indicator prevents flashing on quick refetches
  - Existing debounce logic at `src/components/parts/part-list.tsx:53-75` handles this
- **Instrumentation:**
  - Existing instrumentation captures refetch state via `isFetching` parameter
  - No changes needed to instrumentation logic
- **Evidence:** `src/components/parts/part-list.tsx:48-51` shows invalidation pattern

---

## 8) Errors & Edge Cases

### Failure: Network error during pagination

- **Failure:** Any page fetch fails (network error, 500, timeout)
- **Surface:** `useAllPartsWithLocations` hook returns error state
- **Handling:**
  - Pagination stops immediately on first error encountered
  - Partial results discarded (do not display incomplete dataset)
  - Error surfaces to component via standard `error` property
  - Existing error card displays failure message
  - User can trigger retry via query refetch (pull-to-refresh or navigation)
- **Cache Behavior on Error:**
  - Hook returns `{ data: undefined, error: <error> }` when any page fails
  - Do NOT populate React Query cache (`['allPartsWithLocations']`) with partial results
  - Accumulated state in hook is explicitly cleared on error: `setAccumulatedParts([])`
  - Cache remains empty or contains stale previous successful result (if any)
  - Query invalidation always triggers full re-pagination from offset 0 (not resume from failed offset)
- **Error Path Flow:**
  1. Page N fetch throws error
  2. Hook catches error in try/catch block
  3. Set error state: `setPaginationError(error)`
  4. Clear accumulated parts: `setAccumulatedParts([])`
  5. Set loading state false: `setIsLoadingPages(false)`
  6. Return `{ data: undefined, isLoading: false, error }` to component
  7. Do not call `queryClient.setQueryData(['allPartsWithLocations'], ...)`
- **Guardrails:**
  - Hook validation ensures no partial data exposure
  - Component error UI prevents interaction with missing data
  - Instrumentation emits `list_loading:error` with error details
  - Retry always starts fresh pagination sequence (no offset memory)
- **Evidence:** `src/components/parts/part-list.tsx:321-337` shows error card implementation

### Failure: Backend returns empty first page

- **Failure:** GET `/api/parts/with-locations?limit=1000&offset=0` returns `[]`
- **Surface:** Parts list component
- **Handling:**
  - Hook completes immediately (0 pages fetched)
  - Component displays empty state
  - No error raised (empty inventory is valid)
- **Guardrails:**
  - Pagination logic checks `response.length < 1000` (satisfied by empty array)
  - Empty state messaging remains unchanged
- **Evidence:** `src/components/parts/part-list.tsx:339-354` shows empty state

### Failure: Backend inconsistency during pagination (offset drift)

- **Failure:** Parts added/removed between page fetches causing duplicates or missing items
  - **Example:** Inventory has 1500 parts. During page 2 fetch, another user adds part at offset 500. Page 2 returns parts 1000-1999 (including the newly added one), causing last part from page 1 to appear in page 2 as well (duplicate).
- **Surface:** Aggregated results may contain duplicate or missing items
- **Handling:**
  - Accepted as eventual consistency trade-off for initial implementation
  - User can manually refresh to get consistent snapshot
  - No optimistic locking or pagination tokens in this release
- **UX Mitigation:**
  - Add code comment in custom hook: "KNOWN LIMITATION: Offset-based pagination is vulnerable to data drift if parts are added/removed during fetching. Future enhancement: cursor-based pagination."
  - Consider adding timestamp or "last refreshed" indicator in UI footer (out of scope for initial implementation, log as technical debt)
  - Mutations triggered by current user still invalidate and refetch (maintains consistency for self-initiated changes)
- **Test Guidance to Ensure Deterministic Behavior:**
  - **Critical:** All Playwright factory seeding must complete BEFORE navigating to `/parts` route
  - Use sequential `await` for factory loops: `for (let i = 0; i < 2500; i++) { await testData.parts.create(...) }`
  - Do NOT use parallel `Promise.all([...factories])` for multi-part seeding in pagination tests
  - Wait for seeding completion: `await page.waitForTimeout(100)` after factory loop to ensure backend processing finishes
  - Example test structure:
    ```typescript
    test('loads 2500 parts across 3 pages', async ({ page, testData }) => {
      // Seed all parts FIRST (before navigation)
      for (let i = 0; i < 2500; i++) {
        await testData.parts.create({ description: `Part ${i}` });
      }

      // THEN navigate to trigger pagination
      await page.goto('/parts');
      await waitForListLoading(page, 'parts.list', 'ready');

      // Assertions...
    });
    ```
- **Technical Debt:**
  - Log follow-up ticket: "Implement cursor-based pagination for parts list to prevent offset drift"
  - Backend requirement: Return `cursor` token with each page response, accept `cursor` param instead of numeric offset
  - Prevents duplicates/missing items when data changes during pagination
- **Guardrails:**
  - Test isolation ensures no concurrent mutations during pagination test execution
  - Sequential factory seeding guarantees deterministic page boundaries
  - Accepted limitation for real-world usage (low-impact for hobby inventory use case)
- **Evidence:** No existing handling for this edge case; standard offset-based pagination limitation

### Edge Case: Exactly 1000 parts

- **Failure:** Backend returns exactly 1000 parts (edge case: triggers extra empty fetch)
- **Surface:** Hook fetches second page unnecessarily
- **Handling:**
  - Hook requests page 2 with `offset: 1000`
  - Backend returns `[]` (no more parts)
  - Hook detects `response.length === 0 < 1000` and stops
  - One extra request, but correct final result
- **Guardrails:**
  - Pagination continues condition: `response.length === limit`
  - Empty response correctly terminates pagination
- **Evidence:** Documented behavior based on algorithm design

### Edge Case: Browser memory limits

- **Failure:** Extremely large inventory exceeds browser memory (>100k parts)
- **Surface:** Hook may cause browser slowdown or crash
- **Handling:**
  - Out of scope for initial implementation
  - Document known limitation in code comments
  - Future: Consider virtual scrolling or true pagination UI
- **Guardrails:**
  - None in initial implementation
  - Assumption: typical electronics inventory < 10k parts
- **Evidence:** No existing handling; new limitation introduced

---

## 9) Observability / Instrumentation

### Signal: List Loading Events (Enhanced)

- **Signal:** `list_loading` test event
- **Type:** Instrumentation event (test mode only)
- **Trigger:**
  - `phase: 'loading'` when pagination starts (first page fetch begins)
  - `phase: 'ready'` when pagination completes (all pages fetched)
  - `phase: 'error'` if any page fetch fails
  - `phase: 'aborted'` if component unmounts during pagination
- **Labels / fields:**
  ```typescript
  {
    scope: 'parts.list',
    phase: 'loading' | 'ready' | 'error' | 'aborted',
    metadata: {
      status: 'success' | 'error' | 'aborted',
      queries: { parts: string, types: string },
      counts: { parts: number, types: number },
      totalCount: number,
      visibleCount: number,
      filteredCount?: number,
      searchTerm: string | null,
      activeFilters: string[],
      paginationInfo?: {
        pagesFetched: number,
        limit: number
      }
    }
  }
  ```
- **Consumer:**
  - Playwright via `waitForListLoading(page, 'parts.list', 'ready')`
  - Test assertions on `metadata.totalCount` and `metadata.paginationInfo.pagesFetched`
- **Evidence:** `src/lib/test/query-instrumentation.ts:185-210` defines event structure

### Signal: Parts List Container Test ID

- **Signal:** `data-testid="parts.list.container"`
- **Type:** DOM attribute for test selection
- **Trigger:** Rendered when parts data available and count > 0
- **Labels / fields:** N/A (selector only)
- **Consumer:** Playwright via `page.getByTestId('parts.list.container')`
- **Evidence:** `src/components/parts/part-list.tsx:365` shows existing test ID

### Signal: Parts List Summary Counts

- **Signal:** `data-testid="parts.list.summary"` with text content
- **Type:** UI element rendering count metadata
- **Trigger:** Updated after pagination completes with total and filtered counts
- **Labels / fields:** Text format: "Showing {visible} of {total} parts" or "Showing {filtered} / {total} parts"
- **Consumer:** Playwright assertions on visible text content
- **Evidence:** `src/components/parts/part-list.tsx:296-308` shows summary rendering

---

## 10) Lifecycle & Background Work

### Hook: useAllPartsWithLocations

- **Hook / effect:** Custom React hook managing pagination state machine
- **Architecture Decision:** Use manual `queryClient.fetchQuery` loop in `useEffect` with state accumulation (not declarative `useQuery` calls)
  - **Rationale:** Cannot call `useGetPartsWithLocations` multiple times with different offsets (violates hooks rules). Manual fetch pattern allows sequential async/await loop while preserving React Query cache integration.
  - **Implementation approach:**
    1. Use `useQueryClient()` to get query client reference
    2. Maintain pagination state in React state: `accumulatedParts`, `currentOffset`, `isLoadingPages`, `paginationError`
    3. `useEffect` runs on mount/invalidation, executes async pagination loop:
       ```typescript
       async function fetchAllPages() {
         let offset = 0;
         const allParts = [];
         while (true) {
           const { data, error } = await queryClient.fetchQuery({
             queryKey: ['getPartsWithLocations', { limit: 1000, offset }],
             queryFn: async () => api.GET('/api/parts/with-locations', { params: { query: { limit: 1000, offset } } })
           });
           if (error) throw error;
           allParts.push(...data);
           if (data.length < 1000) break;
           offset += 1000;
         }
         return allParts;
       }
       ```
    4. Return synthetic query state matching `useQuery` interface for component compatibility
- **Trigger cadence:**
  - On mount: initiate pagination immediately via `useEffect` dependency array
  - On invalidation: track manual invalidation flag in state, re-trigger pagination loop
  - On props change: N/A (hook takes no parameters initially)
- **Responsibilities:**
  1. Execute sequential `queryClient.fetchQuery` calls with incrementing offsets
  2. Accumulate results in local state array during loop
  3. Determine when pagination is complete (response length < 1000)
  4. Populate React Query cache with final aggregated result under `['allPartsWithLocations']` key
  5. Return unified query state to component (matches `useQuery` interface)
- **Cleanup:**
  - Track abort signal in ref, cancel in-flight requests on unmount
  - Reset accumulated state before starting new pagination sequence
  - Clear pagination state on error (do not expose partial results)
- **Evidence:** Pattern similar to TanStack Query docs for dependent/serial queries; `src/hooks/use-parts.ts` for custom hook structure
- **Cache Key Strategy:** Use separate cache key `['allPartsWithLocations']` for aggregated result to avoid conflicts with individual page queries under `['getPartsWithLocations', { limit, offset }]`

### Query Configuration: Refetch Behavior

- **Configuration:** Explicit React Query options for pagination hook
- **Decision:** Disable automatic refetch on window focus and reconnect
  - `refetchOnWindowFocus: false`
  - `refetchOnReconnect: false`
  - `staleTime: 5 * 60 * 1000` (5 minutes - treat data as fresh to prevent frequent re-pagination)
- **Rationale:**
  - Large inventories (10,000+ parts requiring 10+ sequential fetches) make automatic refetch unacceptable UX
  - User can manually refresh via navigation or mutation invalidation
  - Trade-off: Users accept potentially stale data after leaving tab; explicit refresh available
- **User Impact:**
  - Parts data remains cached when user switches tabs
  - Manual refresh required if user wants to check for updates after returning to tab
  - Mutations still trigger automatic refetch via invalidation (preserves data consistency for user-initiated changes)
- **Evidence:** TanStack Query configuration options; performance requirement for multi-page loads
- **Documentation:** Include code comment in custom hook explaining this configuration decision and trade-offs

---

## 11) Security & Permissions

Not applicable for this change. Parts list visibility is already controlled by authentication at the route level. Pagination does not introduce new authorization surfaces or expose sensitive data beyond what the existing endpoint returns.

---

## 12) UX / UI Impact

### Entry point: Parts List Route

- **Entry point:** `/parts` route
- **Change:**
  - Loading state may take longer for large inventories (multiple sequential requests)
  - No visual change to loading skeleton or empty/error states
  - Count displays total across all pages instead of capped at 50
- **User interaction:**
  - User waits for complete pagination before seeing any parts
  - No pagination controls (next/prev buttons) in UI
  - User cannot interact with partial results during loading
- **Dependencies:**
  - Backend `/api/parts/with-locations` must accept `limit` and `offset` parameters
  - OpenAPI schema regeneration must complete before frontend changes
- **Evidence:** `src/components/parts/part-list.tsx:243-413` shows parts list layout

### Change: Summary Count Display

- **Entry point:** Parts list header
- **Change:**
  - "Showing X of Y parts" will display Y > 50 for first time
  - Filtered count (when search/filters active) still calculated client-side
- **User interaction:**
  - User sees accurate total inventory count
  - No interaction change (counts are read-only display)
- **Dependencies:**
  - Custom hook must return complete dataset
- **Evidence:** `src/components/parts/part-list.tsx:294-309` shows count rendering

### Change: Loading Duration

- **Entry point:** Initial page load and data refetch
- **Change:**
  - Loading spinner may display longer for inventories > 1000 parts
  - No progress indicator (e.g., "Loading page 2 of 5")
- **User interaction:**
  - User experiences longer wait but no interaction change
  - Existing 200ms debounce prevents flashing on quick loads
- **Dependencies:**
  - Component loading state logic unchanged
- **Evidence:** `src/components/parts/part-list.tsx:43-75` shows loading debounce

---

## 13) Deterministic Test Plan

### Surface: Parts List with Single Page

- **Scenarios:**
  - **Given** backend has fewer than 1000 parts
  - **When** user navigates to `/parts`
  - **Then** hook fetches single page (offset=0, limit=1000)
  - **Then** pagination completes immediately
  - **Then** `list_loading` event emits with `metadata.paginationInfo.pagesFetched: 1`
  - **Then** all parts display in grid
- **Instrumentation / hooks:**
  - `waitForListLoading(page, 'parts.list', 'ready')`
  - Assert on event metadata: `totalCount` matches parts created
  - Assert on event metadata: `paginationInfo.pagesFetched === 1`
  - `page.getByTestId('parts.list.container')` for grid visibility
- **Gaps:** None
- **Evidence:** Pattern from `docs/contribute/testing/playwright_developer_guide.md:93-100`

### Surface: Parts List with Multiple Pages

- **Scenarios:**
  - **Given** backend has 2500 parts (requires 3 page fetches)
  - **When** user navigates to `/parts`
  - **Then** hook fetches page 1 (offset=0, returns 1000 parts)
  - **Then** hook fetches page 2 (offset=1000, returns 1000 parts)
  - **Then** hook fetches page 3 (offset=2000, returns 500 parts)
  - **Then** pagination completes (response.length < 1000)
  - **Then** `list_loading` event emits with `metadata.paginationInfo.pagesFetched: 3`
  - **Then** all 2500 parts display in grid
- **Instrumentation / hooks:**
  - Seed 2500 parts via factory loop: `for (let i = 0; i < 2500; i++) await testData.parts.create()`
  - `waitForListLoading(page, 'parts.list', 'ready')`
  - Assert `totalCount === 2500`
  - Assert `paginationInfo.pagesFetched === 3`
  - Count visible cards in grid equals 2500
- **Gaps:**
  - Seeding 2500 parts may be slow in tests (performance consideration)
  - Consider smaller test (e.g., 1500 parts → 2 pages) for faster execution
- **Evidence:** Factory pattern from `tests/api/factories/part-factory.ts:33-90`

### Surface: Parts List with Pagination Error

- **Scenarios:**
  - **Given** backend returns error on second page fetch
  - **When** hook fetches page 1 (success), then page 2 (500 error)
  - **Then** pagination stops immediately
  - **Then** `list_loading` event emits with `phase: 'error'`
  - **Then** error card displays with message
  - **Then** no parts display (partial data discarded)
- **Instrumentation / hooks:**
  - Difficult to test without backend support for error injection
  - **Deferred:** Mark as known gap; requires backend testing endpoint to inject errors mid-pagination
- **Gaps:**
  - Backend lacks deterministic error injection for pagination scenarios
  - Alternative: Test error on first page fetch (existing error handling coverage)
- **Evidence:** `docs/contribute/testing/index.md:49-51` notes backend testing hook expectations

### Surface: Empty Parts List

- **Scenarios:**
  - **Given** backend has zero parts
  - **When** user navigates to `/parts`
  - **Then** hook fetches page 1 (offset=0, returns empty array)
  - **Then** pagination completes immediately
  - **Then** `list_loading` event emits with `metadata.totalCount: 0`
  - **Then** empty state displays ("No parts yet")
- **Instrumentation / hooks:**
  - No factory seeding (start with empty database)
  - `waitForListLoading(page, 'parts.list', 'ready')`
  - Assert `metadata.totalCount === 0`
  - `page.getByTestId('parts.list.empty')` for empty state
- **Gaps:** None
- **Evidence:** `src/components/parts/part-list.tsx:339-354` shows empty state

### Surface: Parts List Exactly 1000 Parts

- **Scenarios:**
  - **Given** backend has exactly 1000 parts
  - **When** user navigates to `/parts`
  - **Then** hook fetches page 1 (offset=0, returns 1000 parts)
  - **Then** hook fetches page 2 (offset=1000, returns empty array)
  - **Then** pagination completes (0 < 1000)
  - **Then** `list_loading` event emits with `metadata.paginationInfo.pagesFetched: 2`
  - **Then** all 1000 parts display in grid
- **Instrumentation / hooks:**
  - Seed exactly 1000 parts via factory loop
  - `waitForListLoading(page, 'parts.list', 'ready')`
  - Assert `totalCount === 1000`
  - Assert `paginationInfo.pagesFetched === 2` (includes empty page fetch)
- **Gaps:** None (edge case coverage)
- **Evidence:** Edge case from algorithm design

---

## 14) Implementation Slices

This is a small, cohesive change that should be delivered in a single slice.

### Slice: Pagination Implementation & Testing

- **Goal:** Enable viewing all parts via automatic pagination
- **Touches:**
  - `src/hooks/use-all-parts-with-locations.ts` (new custom hook)
  - `src/components/parts/part-list.tsx` (switch to new hook)
  - `tests/e2e/parts/parts-list-pagination.spec.ts` (new test coverage)
  - `tests/e2e/parts/PartsPage.ts` (new page object if needed, or extend existing)
- **Dependencies:**
  - Backend must support `limit` and `offset` parameters
  - OpenAPI schema updated and regenerated (`pnpm generate:api`)
  - Verify regenerated types include query parameters in `useGetPartsWithLocations`

---

## 15) Risks & Open Questions

### Risks

- **Risk:** Sequential page fetching is slow for large inventories
  - **Impact:** Users with 10,000+ parts wait 10+ seconds for list to load
  - **Mitigation:**
    - Accept slow loading for initial release (rare case)
    - Document known limitation in code comments
    - Future enhancement: parallel page fetching or progressive rendering

- **Risk:** Refetch after mutations is slow
  - **Impact:** Creating/editing a part triggers full re-pagination
  - **Mitigation:**
    - Consider optimistic updates for mutations (update cache without refetch)
    - Disable automatic refetch on window focus
    - Future enhancement: incremental cache updates instead of full refetch

- **Risk:** Memory usage for very large inventories
  - **Impact:** Browser slowdown or crash with >50k parts
  - **Mitigation:**
    - Document assumed max inventory size (~10k parts)
    - Monitor production usage; add virtual scrolling if needed
    - Future enhancement: true pagination with UI controls

- **Risk:** Backend data changes during pagination cause inconsistencies
  - **Impact:** Duplicates or missing parts in aggregated result
  - **Mitigation:**
    - Accept eventual consistency trade-off
    - User can manually refresh for consistent snapshot
    - Future enhancement: backend pagination tokens for consistency

### Open Questions

- **Question:** Should we implement parallel page fetching instead of sequential?
  - **Why it matters:** Could reduce loading time by 50%+ for multi-page loads
  - **Owner / follow-up:** Frontend team decision; requires coordination if backend has rate limits

- **Question:** Should we disable refetch on window focus for this query?
  - **Why it matters:** Slow refetches could frustrate users who tab back to app
  - **Owner / follow-up:** UX decision; needs user testing feedback

- **Question:** What is the expected max inventory size?
  - **Why it matters:** Determines if progressive rendering is needed
  - **Owner / follow-up:** Product team or user research (validate assumption of <10k parts)

---

## 16) Confidence

**Confidence: High** — The implementation is straightforward (sequential API calls with aggregation), the existing architecture supports custom hooks wrapping generated clients, and instrumentation patterns are well-established. The main unknowns are performance characteristics with very large inventories, which are addressable post-launch if needed.
