# Part Stock Filters — Technical Plan

## 0) Research Log & Findings

### Discovery Summary

Searched the codebase for existing filter patterns, button/badge components, route search parameter handling, and instrumentation patterns:

1. **Parts Screen Architecture** – Found route at `src/routes/parts/index.tsx` with `validateSearch` for search terms, main list component at `src/components/parts/part-list.tsx` using `useMemo` for client-side filtering, and card component at `src/components/parts/part-card.tsx`.

2. **Filter State Management Examples** – Examined `src/routes/kits/index.tsx` which uses `validateSearch` to manage status filters via route search params and preserves them during navigation. The kits implementation uses `SegmentedTabs` for mutually exclusive filtering, which differs from our requirement.

3. **UI Components** – Found `Button` component with variants including 'outline' (line 40, `src/components/ui/button.tsx`) and 'default' for filled state. The `Badge` component exists (line 16, `src/components/ui/badge.tsx`) with 'outline' and 'default' variants but is a `<span>` element, not clickable. Determined that badge-style filter buttons should be implemented using `Button` with size variants and appropriate styling.

4. **Shopping List Membership Data** – The hook `useShoppingListMembershipIndicators` (line 245, `src/hooks/use-part-shopping-list-memberships.ts`) already fetches shopping list membership data for all visible parts and returns `summaryByPartKey` map with `hasActiveMembership` boolean, making filter logic straightforward.

5. **Part Data Model** – Parts have `total_quantity` field (line 84, `src/components/parts/part-card.tsx`) readily available in the `PartWithTotalAndLocationsSchema` type, enabling immediate stock filtering without additional API calls.

6. **Instrumentation Pattern** – Found `useListLoadingInstrumentation` usage (line 120, `src/components/parts/part-list.tsx`) that includes `totalCount`, `visibleCount`, and `filteredCount` in metadata. This pattern will extend naturally to include active filter state.

7. **Test Coverage** – Found existing Playwright specs in `tests/e2e/parts/part-list.spec.ts` testing search filtering and URL parameter updates. Page object at `tests/support/page-objects/parts-page.ts` provides locators and helpers for list interactions.

### Key Decisions Made

1. **Component Choice** – Will use `Button` component with `size="sm"` and toggle between `variant="outline"` (inactive) and `variant="default"` (active) to create badge-style filter buttons. This avoids creating a new component and leverages existing, tested UI primitives.

2. **Search Parameter Names** – Will use `hasStock` (boolean) and `onShoppingList` (boolean) as search param names for clarity and consistency with existing patterns.

3. **Filter Logic** – Filters combine with AND logic when both active: show parts that have stock AND are on shopping lists. When only one filter is active, show parts matching that criterion. When neither is active, show all parts (respecting search term if present).

4. **Layout** – Filter buttons will appear on a separate line below the search input, before the counts summary, maintaining visual hierarchy and avoiding horizontal crowding.

5. **Instrumentation** – Will extend `useListLoadingInstrumentation` metadata to include `activeFilters` array and separate `filteredBySearch` vs `filteredByFilters` counts for debugging and test assertions.

## 1) Intent & Scope

**User intent**

Add independent, toggleable filter buttons to the parts list screen that allow filtering by stock status (parts with `total_quantity > 0`) and shopping list membership (parts appearing on any active shopping list). Users can activate both filters simultaneously to show parts matching all criteria, or neither, or just one.

**Prompt quotes**

"Add filter buttons to the part screen" with "A filter to only show parts that have stock (parts with total_quantity > 0)" and "A filter to show parts that are on a shopping list" where "These work independently - both can be active, one can be active, or neither."

"NOT mutually exclusive - Filters should be independent toggles."

"Visual Design: Should look like badges: Outline style when NOT selected, Filled style when selected, Should be toggleable/clickable."

"Layout: Place filters on a separate line BELOW the search input (not replacing anything)."

"Multi-select filtering (filters combine with AND logic - if both active, show parts that are in stock AND on shopping list)."

**In scope**

- Add two filter toggle buttons ("In Stock" and "On Shopping List") below the search input in the parts list UI
- Persist filter state in route search parameters (`hasStock`, `onShoppingList`)
- Implement client-side filtering logic that combines with existing search term filtering
- Update counts display to reflect filtered results
- Extend instrumentation to track active filters and filtered counts
- Update or add Playwright tests to verify filter behavior and URL parameter handling
- Ensure filter state persists across navigation (back button, detail → list navigation)

**Out of scope**

- Server-side filtering or pagination changes (all filtering remains client-side)
- Filter state persistence beyond route search params (no localStorage or preferences)
- Additional filter criteria beyond stock and shopping list membership
- Filter combinations with OR logic or complex boolean expressions
- Mobile-specific filter UI patterns (filters will stack naturally on narrow viewports)
- Creating a new FilterBadge component (will use existing Button component)

**Assumptions / constraints**

- Shopping list membership data is already loaded via `useShoppingListMembershipIndicators` for all visible parts, so no additional API calls are required
- Part `total_quantity` is available in the existing API response, enabling immediate filtering
- Client-side filtering performance is acceptable for typical inventory sizes (hundreds to low thousands of parts)
- Filter buttons will use existing Button component with size and variant props to achieve badge-like appearance
- Search term filtering and filter button filtering are independent but combine (AND logic)

## 2) Affected Areas & File Map

### Route Module

- **Area**: `src/routes/parts/index.tsx`
- **Why**: Extend `validateSearch` to parse and normalize `hasStock` and `onShoppingList` boolean search parameters, update `PartsSearchState` type
- **Evidence**: Line 7-10 shows existing `validateSearch` function accepting `search: Record<string, unknown>` and returning normalized state with `search` string. Pattern at `src/routes/kits/index.tsx:14-22` demonstrates validating and normalizing typed search params including status filters.

### Parts List Component

- **Area**: `src/components/parts/part-list.tsx`
- **Why**: Accept filter props (`hasStock`, `onShoppingList`), render filter button UI below search input, extend `useMemo` filtering logic to include stock and shopping list criteria, update instrumentation metadata
- **Evidence**: Line 17-22 shows `PartListProps` interface accepting `searchTerm` and callbacks. Line 83-99 shows existing `useMemo` for search filtering. Line 203-210 shows `searchNode` in layout. Line 120-182 shows `useListLoadingInstrumentation` with `totalCount`, `visibleCount`, and `filteredCount` metadata.

### Shopping List Membership Hook

- **Area**: `src/hooks/use-part-shopping-list-memberships.ts`
- **Why**: Already provides `summaryByPartKey` map with `hasActiveMembership` boolean per part; no changes required but will be referenced in filtering logic
- **Evidence**: Line 245-316 shows `useShoppingListMembershipIndicators` returning `summaryByPartKey: Map<string, ShoppingListMembershipSummary>` where summary includes `hasActiveMembership: boolean` (line 96).

### Button Component

- **Area**: `src/components/ui/button.tsx`
- **Why**: Already supports variants ('outline', 'default') and sizes ('sm', 'md', 'lg') needed for filter badges; no changes required
- **Evidence**: Line 8 defines `variant` prop with 'outline' and 'default' options. Line 9 defines `size` prop with 'sm' option. Lines 36-43 define variant classes including outline borders and default filled backgrounds.

### Playwright Specs

- **Area**: `tests/e2e/parts/part-list.spec.ts`
- **Why**: Add new test scenarios for filter button interactions, URL parameter updates, and combined filtering with search
- **Evidence**: Lines 63-83 show existing spec testing search filtering and URL updates with `page.waitForURL(/[?&]search=/)` pattern. Line 2 imports `makeUnique` helper for unique test data.

### Parts Page Object

- **Area**: `tests/support/page-objects/parts-page.ts`
- **Why**: Add locators for filter buttons and helper methods for toggling filters and asserting filter state
- **Evidence**: Lines 7-19 show existing locator definitions for parts list UI elements. Lines 76-93 show existing search helpers that wait for URL updates.

## 3) Data Model / Contracts

### Route Search Parameters

- **Entity / contract**: Parts route search state
- **Shape**:
  ```typescript
  interface PartsSearchState {
    search?: string;        // Existing search term
    hasStock?: boolean;     // NEW: Filter for parts with total_quantity > 0
    onShoppingList?: boolean; // NEW: Filter for parts on active shopping lists
  }
  ```
- **Mapping**: Search params are coerced from URL query strings (e.g., `?hasStock=true&onShoppingList=false`) to typed boolean values in `validateSearch`. Missing params default to `undefined` (filter inactive). Values like `"true"`, `"1"`, `true` coerce to `true`; all others coerce to `false` or `undefined`.
- **Evidence**: `src/routes/parts/index.tsx:7-10` shows existing `validateSearch` pattern. `src/routes/kits/index.tsx:14-16` demonstrates typed search state interface and coercion logic.

### Filter State in Component

- **Entity / contract**: Filter button active state in `PartList`
- **Shape**:
  ```typescript
  interface PartListProps {
    searchTerm?: string;
    hasStockFilter?: boolean;         // NEW: Whether "In Stock" filter is active
    onShoppingListFilter?: boolean;   // NEW: Whether "On Shopping List" filter is active
    onSelectPart?: (partId: string) => void;
    onCreatePart?: () => void;
    onCreateWithAI?: () => void;
  }
  ```
- **Mapping**: Route-level booleans pass directly to component props. Component uses these to render active/inactive button states and apply filtering logic.
- **Evidence**: `src/components/parts/part-list.tsx:17-22` shows existing `PartListProps` interface pattern.

### Filtered Parts Derivation

- **Entity / contract**: Derived filtered parts list based on search + filters
- **Shape**: Same as existing `filteredParts` — array of `PartWithTotalAndLocationsSchema`, but filtered by additional criteria
- **Mapping**: Extend existing `useMemo` at line 83-99 to chain additional filter predicates:
  1. Filter by search term (existing logic)
  2. If `hasStockFilter === true`, keep only parts where `part.total_quantity > 0`
  3. If `onShoppingListFilter === true`, keep only parts where `shoppingIndicatorMap.get(part.key)?.hasActiveMembership === true`
- **Evidence**: `src/components/parts/part-list.tsx:83-99` shows existing search filtering in `useMemo`. Line 116 shows `shoppingIndicatorMap` from `useShoppingListMembershipIndicators`.

### Instrumentation Metadata

- **Entity / contract**: List loading instrumentation metadata
- **Shape**:
  ```typescript
  {
    status: 'success',
    queries: { parts: 'success', types: 'success' },
    counts: { parts: number, types: number },
    totalCount: number,
    visibleCount: number,
    filteredCount?: number,        // Present if visibleCount < totalCount (any filtering active)
    searchTerm: string | null,
    activeFilters: string[]        // NEW: e.g., ['hasStock', 'onShoppingList'], or []
  }
  ```
- **Mapping**: Existing metadata at lines 125-139 in `part-list.tsx` will be extended to include `activeFilters` array listing which filters are active. The existing `filteredCount` field represents the final visible count after all filtering (search + filters), so no additional count fields are needed.
- **Evidence**: `src/components/parts/part-list.tsx:120-182` shows `useListLoadingInstrumentation` with `getReadyMetadata` callback building metadata object.

## 4) API / Integration Surface

### No New API Calls Required

All data needed for filtering is already loaded:

- **Part data with `total_quantity`**: Loaded via `useGetPartsWithLocations()` at line 26-31 of `part-list.tsx`
- **Shopping list memberships**: Loaded via `useShoppingListMembershipIndicators(partKeys)` at line 115 of `part-list.tsx`

### TanStack Router Navigation

- **Surface**: `useNavigate` from `@tanstack/react-router`
- **Inputs**: Updated search params object with `hasStock` and `onShoppingList` boolean flags
- **Outputs**: URL updates to reflect filter state (e.g., `/parts?hasStock=true&onShoppingList=true`), browser history entry, React re-render with new search params
- **Errors**: Navigation errors surface through TanStack Router's error boundaries (none expected for search param updates)
- **Evidence**: `src/routes/kits/index.tsx:35-46` shows `handleStatusChange` using `navigate({ to: '/kits', search: (prev) => ({ ...prev, status: nextStatus }) })` pattern to update search params while preserving others.

## 5) Algorithms & UI Flows

### Filter Toggle Flow

- **Flow**: User clicks a filter button to toggle filter on/off
- **Steps**:
  1. User clicks "In Stock" or "On Shopping List" button
  2. Component invokes handler (e.g., `handleToggleStockFilter` or `handleToggleShoppingListFilter`)
  3. Handler calls `navigate({ to: '/parts', search: (prev) => ({ ...prev, hasStock: !prev.hasStock }), replace: true })`
  4. Route `validateSearch` normalizes new search state
  5. Component re-renders with updated filter props
  6. Filter button visual state updates (outline ↔ filled)
  7. `useMemo` recalculates `filteredParts` using new filter criteria
  8. List re-renders showing filtered parts
  9. Counts summary updates to show "X of Y parts showing"
  10. Instrumentation emits updated metadata with `activeFilters` array
- **States / transitions**: Filter button toggles between `variant="outline"` (inactive) and `variant="default"` (active). List transitions from full set to filtered subset. Counts update reactively.
- **Hotspots**: `useMemo` recalculation on every filter or search change (mitigated by memoization dependencies). Large part lists (>1000) may see minor rendering delay, acceptable for this use case.
- **Evidence**: `src/routes/kits/index.tsx:35-46` shows toggle pattern with `navigate` and `replace: true`. `src/components/parts/part-list.tsx:83-99` shows existing `useMemo` filter pattern.

### Combined Filtering Logic Flow

- **Flow**: Apply search term + filters in sequence
- **Steps**:
  1. Start with full `parts` array from API
  2. Apply search term filter if `searchTerm.trim()` is non-empty (existing logic lines 83-99)
  3. If `hasStockFilter === true`, filter result to parts where `part.total_quantity > 0`
  4. If `onShoppingListFilter === true`, filter result to parts where `shoppingIndicatorMap.get(part.key)?.hasActiveMembership === true`
  5. Assign filtered result to `filteredParts`
  6. Sort `filteredParts` by description (existing logic line 101-104)
  7. Render sorted parts in `CollectionGrid`
- **States / transitions**: Filtering is synchronous and deterministic. No loading states between filter changes since all data is client-side.
- **Hotspots**: Chaining multiple filters in `useMemo` may iterate parts array multiple times. Can optimize with single-pass filter if performance becomes concern (unlikely).
- **Evidence**: `src/components/parts/part-list.tsx:83-99` shows existing search filter. Line 116 shows `shoppingIndicatorMap` ready for lookup.

### URL Parameter Persistence Flow

- **Flow**: Filter state persists across navigation and browser back/forward
- **Steps**:
  1. User activates filters and navigates to part detail page
  2. Detail page navigation preserves search params in history
  3. User clicks back button or navigates to `/parts` from elsewhere
  4. Route `validateSearch` reads `hasStock` and `onShoppingList` from URL
  5. Component receives filter props from route search state
  6. Filters render in active state, list shows filtered results matching URL params
- **States / transitions**: Browser history stack maintains filter state. No local state storage required.
- **Hotspots**: None—URL is single source of truth for filter state.
- **Evidence**: `src/routes/parts/index.tsx:7-10` shows `validateSearch` runs on every route navigation. `src/routes/kits/index.tsx:54-59` shows search params preserved during navigation to detail pages.

### Part Detail Navigation Preservation

- **Flow**: Preserve filter state when navigating from list to detail
- **Steps**:
  1. User clicks part card or selection handler
  2. `handleSelectPart` in route component calls `navigate({ to: '/parts/$partId', params: { partId }, search: (prev) => prev })`
  3. TanStack Router preserves all search params (`search`, `hasStock`, `onShoppingList`) in URL
  4. Browser back button returns to list with full search state intact
- **Pattern choice**: Use `search: (prev) => prev` for automatic preservation of all search parameters, avoiding need to enumerate individual fields explicitly
- **Invariant**: Filter and search state persists bidirectionally across list ↔ detail navigation
- **Evidence**: `src/routes/kits/index.tsx:54-62` shows precedent for search param preservation during navigation; `src/routes/parts/index.tsx:19-21` shows current `handleSelectPart` implementation requiring update

### Empty State Selection Logic

- **Flow**: Determine which empty state to render based on data availability and filtering activity
- **Steps**:
  1. Calculate `filtersOrSearchActive = searchActive || hasStockFilter || onShoppingListFilter`
  2. If `parts.length === 0` (no parts in database), render `emptyContent` ("No parts yet" with CTA)
  3. Else if `filtersOrSearchActive && visibleCount === 0` (filtering yielded no results), render `noResultsContent` ("No parts found")
  4. Else if `visibleCount > 0`, render `listContent`
- **States / transitions**: Empty state selection is synchronous and deterministic. Current logic uses `searchActive` flag alone; updated logic includes filter flags.
- **Invariant**: Empty state message accurately reflects whether user is filtering (show actionable "No parts found") vs database is empty (show "No parts yet" with create CTA)
- **Evidence**: Current logic at `src/components/parts/part-list.tsx:257-280` uses `searchActive` flag. Will extend to include filter flags for consistent empty state handling.

### Counts Summary Display Logic

- **Flow**: Determine counts summary format based on filtering activity
- **Steps**:
  1. Calculate `filtersOrSearchActive = searchActive || hasStockFilter || onShoppingListFilter`
  2. Set `filteredCount = filtersOrSearchActive && visibleCount < totalCount ? visibleCount : undefined`
  3. Pass `filteredCount` to `ListScreenCounts` component
  4. Component renders "X of Y parts showing" when `filteredCount` is present, "X parts" otherwise
- **Invariant**: Both search term and filter buttons trigger the "X of Y parts showing" display format, ensuring consistent UX whether user is searching or filtering
- **Evidence**: `src/components/parts/part-list.tsx:212-227` shows `ListScreenCounts` usage with `filteredCount` prop

## 6) Derived State & Invariants

### Filtered Parts List

- **Derived value**: `filteredParts` array
- **Source**:
  - Unfiltered: `parts` from `useGetPartsWithLocations()`
  - Filters: `searchTerm` string, `hasStockFilter` boolean, `onShoppingListFilter` boolean
  - Membership data: `shoppingIndicatorMap` from `useShoppingListMembershipIndicators(partKeys)`
- **Writes / cleanup**: None—purely derived for rendering. No cache mutations or side effects.
- **Guards**:
  - Shopping list lookup guards against missing map entries with `shoppingIndicatorMap.get(part.key)?.hasActiveMembership === true` (undefined-safe)
  - Stock filter checks `part.total_quantity > 0` (numeric comparison, safe for 0 and negative values)
  - Search term defaults to empty string if undefined (line 84)
- **Invariant**: `filteredParts.length <= parts.length` always holds. Visible count never exceeds total count. Filters only remove items, never add.
- **Evidence**: `src/components/parts/part-list.tsx:83-99` shows existing derivation pattern. Line 106-108 shows `totalCount` and `visibleCount` calculation maintaining invariant.

### Filter Active State

- **Derived value**: Button `variant` prop (`'outline'` | `'default'`)
- **Source**: `hasStockFilter` and `onShoppingListFilter` boolean props from route search params
- **Writes / cleanup**: None—directly maps boolean to variant string
- **Guards**: Default to `'outline'` (inactive) if prop is `undefined` or `false`
- **Invariant**: Button visual state always matches route search param state. No local UI state drift.
- **Evidence**: `src/components/ui/button.tsx:8` shows variant type. Existing route/component prop flow ensures consistency.

### Counts Summary

- **Derived value**: `totalCount`, `visibleCount`, `filteredCount` for display
- **Source**:
  - `totalCount = parts.length` (all parts from API)
  - `visibleCount = filteredParts.length` (after search + filters)
  - `filtersOrSearchActive = searchActive || hasStockFilter || onShoppingListFilter`
  - `filteredCount = filtersOrSearchActive && visibleCount < totalCount ? visibleCount : undefined` (only show if any filtering active)
- **Writes / cleanup**: None—purely derived for display and instrumentation
- **Guards**: `filteredCount` is optional; only set when any filtering mechanism (search or filters) reduces visible count
- **Invariant**: `visibleCount <= totalCount` always holds. If no filters or search active, `filteredCount` is `undefined` and summary shows "X parts". If filtering active, summary shows "X of Y parts showing".
- **Evidence**: `src/components/parts/part-list.tsx:106-109` shows existing count derivation. Lines 218-223 show `ListScreenCounts` component consuming these values.

### Active Filters Array for Instrumentation

- **Derived value**: `activeFilters` string array
- **Source**: `hasStockFilter` and `onShoppingListFilter` booleans
- **Writes / cleanup**: Built inline in `getReadyMetadata` callback, no persistent state
- **Guards**: Only includes filter names where corresponding boolean is `true`
- **Invariant**: Array contains 0, 1, or 2 strings: `['hasStock']`, `['onShoppingList']`, `['hasStock', 'onShoppingList']`, or `[]` (order is deterministic: stock before shopping list)
- **Evidence**: Pattern established by existing instrumentation at `src/components/parts/part-list.tsx:125-139` building metadata object inline.

## 7) State Consistency & Async Coordination

### Source of Truth

- **Source of truth**: Route search parameters managed by TanStack Router
- **Coordination**: Component receives filter state as props derived from `Route.useSearch()`. Button click handlers call `navigate()` to update route search params. Route `validateSearch` normalizes params. Component re-renders with new props. No local component state for filter toggles.
- **Async safeguards**: Filter changes are synchronous client-side operations. No async coordination needed. Query data (parts, shopping list memberships) is already loaded; filters operate on cached data.
- **Instrumentation**: `useListLoadingInstrumentation` observes `partsLoading`, `typesFetching`, and `error` states from TanStack Query. Filter changes do not trigger new queries, so instrumentation continues tracking existing query lifecycle. Metadata includes current filter state in `activeFilters` for test assertions.
- **Evidence**: `src/routes/parts/index.tsx:6-12` shows route managing search state. `src/components/parts/part-list.tsx:120-182` shows instrumentation coordinated with query state, not filter state.

### Query Cache Stability

- **Source of truth**: TanStack Query cache for `getPartsWithLocations` and `getTypes`
- **Coordination**: Filters do not invalidate or refetch queries. All filtering is client-side on cached data. Cache invalidation happens independently (e.g., on part creation/update) via existing patterns.
- **Async safeguards**: No new async operations introduced. Existing query error handling remains unchanged.
- **Instrumentation**: Instrumentation already tracks query states. Filter state is orthogonal—filters operate on successful query results.
- **Evidence**: `src/components/parts/part-list.tsx:26-37` shows query hooks. Lines 44-70 show cache invalidation via `queryClient.invalidateQueries`, unrelated to filtering.

### Shopping List Membership Data Timing

- **Source of truth**: `useShoppingListMembershipIndicators` query
- **Coordination**: Shopping list membership data loads in parallel with parts data. Filters check `shoppingIndicatorMap.get(part.key)?.hasActiveMembership` which is safe even if query is pending (returns `undefined`, part excluded from "On Shopping List" filter results).
- **Async safeguards**: Filter logic handles missing map entries gracefully. If shopping list query fails, "On Shopping List" filter shows no parts (acceptable degradation). Error state displays separately via existing error handling.
- **Instrumentation**: Shopping list query has its own instrumentation scope (`parts.list.shoppingListIndicators` at line 299). Parts list instrumentation is independent but metadata can reference filter state.
- **Evidence**: `src/components/parts/part-list.tsx:115-118` shows shopping list indicators query running in parallel. `src/hooks/use-part-shopping-list-memberships.ts:299-307` shows separate instrumentation scope.

## 8) Errors & Edge Cases

### Shopping List Data Load Failure

- **Failure**: `useShoppingListMembershipIndicators` query fails or returns error
- **Surface**: Filter logic in `PartList` component
- **Handling**: "On Shopping List" filter shows zero results (no parts match because `hasActiveMembership` is undefined for all parts). User sees filtered count of 0. Existing error display for shopping list indicators (separate from main error state) remains visible if implemented.
- **Guardrails**: Filter logic guards with `?.hasActiveMembership === true`, so `undefined` or missing entries safely exclude parts. No crashes. Filter button remains clickable.
- **Evidence**: `src/hooks/use-part-shopping-list-memberships.ts:309-316` shows shopping list query error handling. Filter logic will use safe navigation (`?.`) to handle missing data.

### Shopping List Filter Activated During Data Load

- **Failure**: User clicks "On Shopping List" filter before `useShoppingListMembershipIndicators` query completes
- **Surface**: Parts list content area
- **Handling**: List temporarily shows zero results (because `summaryByPartKey` is empty or undefined during load), then updates when query resolves. Counts summary shows "0 of X parts showing" briefly. No error message, no crash.
- **Guardrails**: Filter logic guards with `?.hasActiveMembership === true` so undefined entries safely exclude parts. List re-renders automatically when query completes due to TanStack Query reactivity.
- **Acceptable degradation**: Transient empty state lasts <500ms in typical network conditions. User can deactivate filter immediately if confused. Alternative mitigation (disable button during load) adds complexity without significant UX benefit.
- **Evidence**: `src/hooks/use-part-shopping-list-memberships.ts:245-316` shows query lifecycle. Plan section 7 (lines 347-353) documents coordination between filter logic and shopping list query state.

### No Parts Match Active Filters

- **Failure**: User activates filters but zero parts match criteria (e.g., all parts out of stock, or none on shopping lists)
- **Surface**: Parts list content area
- **Handling**: Show "No parts found" empty state with message "Try adjusting your search terms or create a new part." (generic message applies to both search and filters). Counts summary shows "0 of X parts showing". Empty state triggers when `filtersOrSearchActive && visibleCount === 0 && parts.length > 0` (see section 5 "Empty State Selection Logic").
- **Guardrails**: Empty state provides clear feedback. Filters remain visible and active (filled style persists) so user can deactivate them. No broken UI or crashes.
- **Evidence**: `src/components/parts/part-list.tsx:274-280` shows `noResultsContent` rendered based on filtering activity. Updated logic in section 5 specifies exact condition.

### All Filters Active with Search, Zero Results

- **Failure**: User has both filters on + search term, and zero parts match all criteria
- **Surface**: Parts list content area
- **Handling**: Same as previous case—show "No parts found" empty state. Counts show "0 of X parts showing". User can clear search or toggle filters to broaden results.
- **Guardrails**: Empty state is generic enough for combined search + filters scenario. No specific "try removing filters" message needed initially (can add in future enhancement).
- **Evidence**: Same as previous case—`noResultsContent` state.

### Filter Button Rapid Toggling

- **Failure**: User rapidly clicks filter button multiple times in quick succession
- **Surface**: Filter button click handlers and route navigation
- **Handling**: Each click calls `navigate({ replace: true })` which replaces current history entry. Multiple rapid clicks result in last state winning. No route transition errors or UI flicker expected.
- **Guardrails**: React's event batching and TanStack Router's state management handle rapid updates. No debouncing required for boolean toggles.
- **Evidence**: `src/routes/kits/index.tsx:35-46` shows similar toggle pattern with `replace: true`. No debouncing or rate limiting present.

### Filter State with Missing Search Params

- **Failure**: User navigates to `/parts` without search params, or with malformed params (e.g., `?hasStock=invalid`)
- **Surface**: Route `validateSearch` function
- **Handling**: `validateSearch` normalizes and coerces params. Missing params default to `undefined` (filters inactive). Invalid boolean strings coerce to `false` or `undefined` based on logic (e.g., `"invalid"` → `false` or treat as `undefined`).
- **Guardrails**: Type coercion in `validateSearch` ensures component always receives well-formed props (`boolean | undefined`). No crashes or invalid state.
- **Evidence**: `src/routes/kits/index.tsx:14-22` shows param normalization with fallback defaults. Will follow same pattern for boolean coercion.

### Filter State Persisting Incorrectly Across Navigation

- **Failure**: User navigates from parts list to part detail and back, expecting filter state to persist, but it's lost
- **Surface**: Navigation flow between `/parts` and `/parts/:id`
- **Handling**: Detail page navigation should preserve search params when constructing navigation link (similar to `src/routes/kits/index.tsx:54-59`). If not preserved, user sees all parts on back navigation (filters reset). This is edge case—typically browser back button preserves URL completely.
- **Guardrails**: Ensure part detail navigation handlers pass current search state. Add search params to back navigation link if detail page has one.
- **Evidence**: `src/routes/parts/index.tsx:19-21` shows `handleSelectPart` navigating to detail without preserving search. Will need to update to preserve search params.

## 9) Observability / Instrumentation

### Filter State in List Loading Events

- **Signal**: `list_loading` test event with `activeFilters` metadata
- **Type**: Instrumentation event via `useListLoadingInstrumentation`
- **Trigger**: Emitted on list `ready`, `error`, or `aborted` phases, whenever parts list finishes loading or encounters error
- **Labels / fields**:
  - `activeFilters`: Array of active filter names, e.g., `['hasStock']`, `['onShoppingList']`, `['hasStock', 'onShoppingList']`, or `[]`
  - `totalCount`: Total parts in database
  - `visibleCount`: Parts visible after all filtering (search + filters)
  - `filteredCount`: Optional, present when `visibleCount < totalCount` due to any filtering activity
- **Consumer**: Playwright specs use `waitForListLoading(page, 'parts.list', 'ready')` and can assert on metadata to verify filters are active. Tests can derive filter impact by comparing `totalCount`, `visibleCount`, and checking `activeFilters` array.
- **Evidence**: `src/components/parts/part-list.tsx:120-182` shows existing `useListLoadingInstrumentation` with metadata callbacks. Will extend `getReadyMetadata` to include `activeFilters` array.

### Filter Button Interactions

- **Signal**: `data-testid` attributes on filter buttons for Playwright targeting
- **Type**: Test identifier for UI element selection
- **Trigger**: Rendered when filter buttons are mounted
- **Labels / fields**:
  - `parts.list.filter.hasStock` — "In Stock" filter button
  - `parts.list.filter.onShoppingList` — "On Shopping List" filter button
- **Consumer**: Playwright page object locators and click actions
- **Evidence**: `src/components/parts/part-list.tsx:196-199` shows existing `data-testid` pattern on buttons. Will follow same convention for filter buttons.

### URL Parameter Tracking in Tests

- **Signal**: URL query string with filter params (`?hasStock=true&onShoppingList=true`)
- **Type**: Browser URL observable by Playwright
- **Trigger**: Updated when user toggles filters via `navigate({ replace: true })`
- **Labels / fields**: Boolean search params parsed by `validateSearch`
- **Consumer**: Playwright assertions like `await expect(page).toHaveURL(/hasStock=true/)`
- **Evidence**: `tests/e2e/parts/part-list.spec.ts:99` shows existing URL assertion pattern `await expect(page).toHaveURL(/search=/)` for search param. Will use same pattern for filter params.

### Filtered Counts in Summary

- **Signal**: Summary text showing "X of Y parts showing" vs "X parts"
- **Type**: User-visible text, observable by Playwright
- **Trigger**: Rendered when `filteredCount` is defined (filtering is active)
- **Labels / fields**: N/A—text pattern for assertion
- **Consumer**: Playwright assertion `await parts.expectSummaryText(/\d+ of \d+ parts showing/i)`
- **Evidence**: `tests/e2e/parts/part-list.spec.ts:78` shows existing summary text assertion. Will extend to verify filtered counts when filters are active.

## 10) Lifecycle & Background Work

### Filter Button Render Effect

- **Hook / effect**: No custom effects required—filter buttons render declaratively based on props
- **Trigger cadence**: On every render when props change (route search params update)
- **Responsibilities**: Render filter buttons with correct variant (`outline` | `default`) based on `hasStockFilter` and `onShoppingListFilter` props
- **Cleanup**: None—buttons are standard React elements
- **Evidence**: Button component is pure functional component with no effects (`src/components/ui/button.tsx`). Part list renders buttons in layout section between search and counts.

### `useMemo` Recalculation for Filtered Parts

- **Hook / effect**: `useMemo` for `filteredParts` derivation
- **Trigger cadence**: On dependency change: `parts`, `searchTerm`, `typeMap`, `hasStockFilter`, `onShoppingListFilter`, `shoppingIndicatorMap`
- **Responsibilities**: Filter parts array by search term, stock status, and shopping list membership in sequence. Return filtered array.
- **Cleanup**: None—pure computation, no side effects
- **Evidence**: `src/components/parts/part-list.tsx:83-99` shows existing `useMemo` pattern for search filtering. Will extend dependencies and logic to include new filters.

### Query Invalidation on Navigation

- **Hook / effect**: `useEffect` calling `queryClient.invalidateQueries` on mount
- **Trigger cadence**: On component mount
- **Responsibilities**: Invalidate parts and types queries to ensure fresh data on navigation to list page
- **Cleanup**: None—invalidation is fire-and-forget
- **Evidence**: `src/components/parts/part-list.tsx:44-47` shows existing invalidation effect. No changes needed—filters operate on already-fetched data.

### No Background Polling or Revalidation

No new background work or polling introduced. Filters operate on cached query data. Existing query revalidation logic (stale time, refetch on window focus) remains unchanged and sufficient.

## 11) Security & Permissions

Not applicable. Filtering is client-side UI logic operating on data the user is already authorized to view. No new API calls, no server-side filtering, no permission checks required.

Filter state in URL search params is user-controlled and non-sensitive. Malicious param values (e.g., `?hasStock=<script>`) are coerced to booleans by `validateSearch`, not rendered or executed.

## 12) UX / UI Impact

### Entry Point

- **Entry point**: Parts list page at `/parts` route
- **Change**: Add two filter toggle buttons below the search input, before the counts summary
- **User interaction**: User clicks "In Stock" button to show only parts with quantity > 0. Clicks "On Shopping List" button to show only parts on active shopping lists. Clicks button again to deactivate filter. Can activate both filters simultaneously.
- **Dependencies**:
  - `Button` component with `variant` and `size` props
  - Route search params for state persistence
  - `useShoppingListMembershipIndicators` hook for membership data
- **Evidence**: `src/components/parts/part-list.tsx:203-210` shows search input placement in layout. Filter buttons will appear after `searchNode`, before `countsNode`.

### Filter Button Visual Design

- **Entry point**: Inline with parts list UI, below search input
- **Change**: Two small buttons with badge-like appearance:
  - Inactive: `variant="outline"`, `size="sm"` — outline border, transparent background, muted text color
  - Active: `variant="default"`, `size="sm"` — filled background, primary foreground color
- **User interaction**: Visual toggle on click. Active state clearly distinguishes selected filters.
- **Dependencies**: `Button` component styling at `src/components/ui/button.tsx:36-49`
- **Evidence**: Button outline variant defined at line 40 (`border border-input bg-background hover:bg-accent`). Default variant at line 37 (`bg-primary text-primary-foreground`). Small size at line 46 (`h-8 px-2 text-sm`).

### Filtered Results Feedback

- **Entry point**: Parts list content area and counts summary
- **Change**: Counts summary updates to show "X of Y parts showing" when filters are active (matching existing search filter behavior). If zero results, show "No parts found" empty state.
- **User interaction**: Immediate feedback when filters applied. User sees reduced list and updated counts. Can toggle filters or clear search to broaden results.
- **Dependencies**: `ListScreenCounts` component at `src/components/layout/list-screen-counts.tsx`, existing empty state components
- **Evidence**: `src/components/parts/part-list.tsx:212-227` shows counts and summary rendering. Lines 274-280 show empty state for no results.

### Filter State Persistence Across Navigation

- **Entry point**: Part detail pages and back navigation
- **Change**: Update part detail navigation links to preserve filter search params, ensuring back button restores filtered view
- **User interaction**: User activates filters, clicks a part to view detail, clicks back. Sees filtered list as they left it.
- **Dependencies**: Navigation handlers in route component and card click handlers
- **Evidence**: `src/routes/parts/index.tsx:19-21` shows `handleSelectPart` navigation. Will update to preserve `search` params.

### Accessibility

- **Entry point**: Filter buttons
- **Change**: Buttons are native `<button>` elements with keyboard accessibility, focus indicators, and screen reader support built into `Button` component
- **User interaction**: Keyboard users can tab to filter buttons, press Enter/Space to toggle. Screen readers announce button label and state.
- **Dependencies**: `Button` component a11y features (focus-visible ring, role="button")
- **Evidence**: `src/components/ui/button.tsx:34` shows `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring` classes for keyboard focus. Line 78 renders native `<button>` element.

## 13) Deterministic Test Plan

### Filter Button Rendering and Toggle Interaction

- **Surface**: Parts list page filter buttons
- **Scenarios**:
  - **Given** user navigates to parts list, **When** page loads, **Then** "In Stock" and "On Shopping List" filter buttons are visible with outline style (inactive)
  - **Given** filter button is inactive, **When** user clicks "In Stock" button, **Then** button changes to filled style (active), URL updates to include `?hasStock=true`, and list shows only parts with `total_quantity > 0`
  - **Given** "In Stock" filter is active, **When** user clicks button again, **Then** button returns to outline style (inactive), URL updates to remove `hasStock` param, and list shows all parts (respecting search term if present)
  - **Given** "In Stock" filter is active, **When** user clicks "On Shopping List" button, **Then** both buttons show filled style, URL includes both params (`?hasStock=true&onShoppingList=true`), and list shows parts matching both criteria
- **Instrumentation / hooks**:
  - Locators: `page.getByTestId('parts.list.filter.hasStock')`, `page.getByTestId('parts.list.filter.onShoppingList')`
  - URL assertions: `await expect(page).toHaveURL(/hasStock=true/)`, `await expect(page).toHaveURL(/onShoppingList=true/)`
  - List loading event: `await waitForListLoading(page, 'parts.list', 'ready')` with metadata including `activeFilters` array
- **Gaps**: None—full coverage planned
- **Evidence**: `tests/e2e/parts/part-list.spec.ts:63-109` shows existing patterns for search filtering, URL assertions, and summary text checks. Will extend with filter button scenarios.

### Stock Filter Correctness

- **Surface**: Parts list filtered results
- **Scenarios**:
  - **Given** parts with varying stock levels (some with `total_quantity > 0`, some with `total_quantity === 0`), **When** user activates "In Stock" filter, **Then** list shows only parts with `total_quantity > 0`, and counts summary shows "X of Y parts showing"
  - **Given** "In Stock" filter is active with mixed stock parts, **When** user enters search term matching only out-of-stock parts, **Then** list shows zero results (filters are ANDed with search)
- **Instrumentation / hooks**:
  - Factory helpers: `testData.parts.create({ overrides: { total_quantity: 0 } })` and `testData.parts.create({ overrides: { total_quantity: 10 } })`
  - Backend API: Create stock records via `apiClient.POST('/api/inventory/parts/{part_key}/stock', ...)`
  - Locators: `parts.cardByKey(partKey)` to verify presence/absence
  - Summary assertion: `await parts.expectSummaryText(/\d+ of \d+ parts showing/i)`
- **Gaps**: None
- **Evidence**: `tests/e2e/parts/part-list.spec.ts:25-61` shows part creation with stock records and metadata assertions on cards.

### Shopping List Filter Correctness

- **Surface**: Parts list filtered results
- **Scenarios**:
  - **Given** parts with and without active shopping list memberships, **When** user activates "On Shopping List" filter, **Then** list shows only parts appearing on ready or concept shopping lists (not done lists), and counts summary updates accordingly
  - **Given** "On Shopping List" filter is active, **When** user activates "In Stock" filter, **Then** list shows only parts that are both on shopping lists AND have stock
- **Instrumentation / hooks**:
  - Factory helpers: `testData.shoppingLists.create()` and `testData.shoppingLists.createLine(listId, { partKey, needed })`
  - Membership verification: Assert visible parts have shopping list indicator icons (existing test pattern at lines 122-176)
  - List loading metadata: Assert `activeFilters` includes `'onShoppingList'`
- **Gaps**: None
- **Evidence**: `tests/e2e/parts/part-list.spec.ts:122-176` shows shopping list membership test with tooltip verification. Will extend to verify filtered list contains only parts with memberships.

### Combined Filters with Search

- **Surface**: Parts list with all filtering mechanisms active
- **Scenarios**:
  - **Given** parts with various stock levels, shopping list memberships, and descriptions, **When** user activates both filters and enters search term, **Then** list shows only parts matching search term AND having stock AND appearing on shopping lists
  - **Given** all filters active with zero matches, **When** filters reduce results to empty, **Then** show "No parts found" empty state and counts show "0 of X parts showing"
- **Instrumentation / hooks**:
  - Seed diverse part data with factory overrides
  - Apply search via `parts.search(term)`
  - Click filter buttons via page object helpers
  - Assert final visible count and summary text
- **Gaps**: None
- **Evidence**: Combines patterns from existing search test (lines 63-83) with filter toggle patterns (to be added).

### Filter State Persistence Across Navigation

- **Surface**: Parts list filter state during navigation
- **Scenarios**:
  - **Given** user activates "In Stock" filter, **When** user clicks part card to view detail and then navigates back, **Then** filter remains active, URL includes `hasStock=true`, and list shows filtered results
  - **Given** user activates both filters, **When** user navigates to part detail and back via browser back button, **Then** both filters remain active
- **Instrumentation / hooks**:
  - Activate filters, navigate to detail via `parts.openCardByKey(partKey)`
  - Use `page.goBack()` to return
  - Assert URL params and filter button styles (via locator checks or button attributes)
- **Gaps**: None
- **Evidence**: Navigation pattern at `tests/e2e/parts/part-list.spec.ts:25-61` shows card click and detail page transition. Will extend to verify filter state persists.

### Page Object Extensions

- **Surface**: `tests/support/page-objects/parts-page.ts`
- **Scenarios**:
  - Add locators: `hasStockFilterButton`, `onShoppingListFilterButton`
  - Add methods: `async activateStockFilter()`, `async deactivateStockFilter()`, `async activateShoppingListFilter()`, `async deactivateShoppingListFilter()`, `async expectFilterActive(filterName: 'hasStock' | 'onShoppingList')`, `async expectFilterInactive(filterName)`
- **Instrumentation / hooks**: Use `getByTestId` for button locators, check button `data-state` attribute or variant class for active/inactive state
- **Gaps**: None
- **Evidence**: `tests/support/page-objects/parts-page.ts:7-19` shows existing locator pattern. Lines 76-93 show helper method pattern for interactions.

## 14) Implementation Slices

### Slice 1: Route and Component Prop Plumbing

- **Goal**: Establish filter state flow from URL to component without UI or logic changes
- **Touches**:
  - `src/routes/parts/index.tsx` — Update `validateSearch` to parse `hasStock` and `onShoppingList` params, define `PartsSearchState` interface
  - `src/components/parts/part-list.tsx` — Add `hasStockFilter` and `onShoppingListFilter` props to `PartListProps`, pass from route component
- **Dependencies**: None—foundational plumbing
- **Verification**: TypeScript compilation passes, props flow to component (can add temporary console.log to verify)

### Slice 2: Filter UI and Button Interactions

- **Goal**: Render filter buttons and wire click handlers to update route search params
- **Touches**:
  - `src/components/parts/part-list.tsx` — Render filter buttons below search input, implement `handleToggleStockFilter` and `handleToggleShoppingListFilter` handlers using `navigate({ search, replace: true })`
- **Dependencies**: Slice 1 complete
- **Verification**: Filter buttons visible, clicking toggles URL params, button styles update (can verify visually or with manual URL inspection)

### Slice 3: Filtering Logic and Derived State

- **Goal**: Implement client-side filtering based on active filters
- **Touches**:
  - `src/components/parts/part-list.tsx` — Extend `useMemo` for `filteredParts` to apply stock and shopping list filters, update counts derivation
- **Dependencies**: Slice 2 complete (buttons functional, URL params update)
- **Verification**: Activating filters reduces visible parts, counts update, empty state shows when zero results

### Slice 4: Instrumentation and Metadata

- **Goal**: Extend list loading instrumentation to include filter state
- **Touches**:
  - `src/components/parts/part-list.tsx` — Update `getReadyMetadata`, `getErrorMetadata`, `getAbortedMetadata` callbacks to include `activeFilters` array (e.g., `['hasStock', 'onShoppingList']` or `[]`)
- **Dependencies**: Slice 3 complete (filtering logic working)
- **Verification**: Instrumentation events include correct metadata with `activeFilters` array (can verify with manual console inspection in test mode, or via Playwright test event assertions)

### Slice 5: Playwright Test Coverage

- **Goal**: Add comprehensive test scenarios for filter interactions
- **Touches**:
  - `tests/support/page-objects/parts-page.ts` — Add filter button locators and helper methods
  - `tests/e2e/parts/part-list.spec.ts` — Add test cases for filter toggle, stock filtering, shopping list filtering, combined filters, persistence
- **Dependencies**: Slices 1-4 complete (feature fully functional)
- **Verification**: All new Playwright specs pass, `pnpm playwright test` green

### Slice 6: Navigation Preservation

- **Goal**: Ensure filter state persists when navigating to part detail and back
- **Touches**:
  - `src/routes/parts/index.tsx` — Update `handleSelectPart` to use `search: (prev) => prev` pattern for automatic preservation of all search parameters (`search`, `hasStock`, `onShoppingList`)
- **Dependencies**: Slices 1-5 complete (filters working and tested)
- **Implementation pattern**: Use `navigate({ to: '/parts/$partId', params: { partId }, search: (prev) => prev })` to preserve all search params automatically without enumerating individual fields
- **Verification**: Navigate to detail with filters active, back button restores filtered view, Playwright test verifies persistence (already specified in section 13)

## 15) Risks & Open Questions

### Risks

- **Risk**: Shopping list membership query fails or is slow, causing "On Shopping List" filter to show incorrect results (zero parts or stale data)
- **Impact**: Users may think filter is broken or that no parts are on shopping lists when data hasn't loaded yet
- **Mitigation**: Filter logic safely handles missing data (undefined-safe checks). Consider adding loading indicator or disabled state for "On Shopping List" button while query is pending. Alternatively, accept graceful degradation (filter shows zero results until data loads).

- **Risk**: Large part inventories (>1000 parts) may cause noticeable lag when toggling filters due to array iteration in `useMemo`
- **Impact**: UI feels sluggish on filter toggle for large datasets
- **Mitigation**: `useMemo` memoizes results, so re-renders without dependency changes are fast. If performance issue arises, optimize with single-pass filter combining all criteria. Test with large dataset seeded via factory loop to establish baseline.

- **Risk**: Filter state not preserved during part detail navigation if handlers don't pass search params
- **Impact**: User loses filter context when navigating to detail and back, leading to confusion
- **Mitigation**: Explicitly pass search state in navigation handlers (Slice 6 addresses this). Add Playwright test to catch regression.

### Open Questions

- **Question**: Should "No parts found" empty state message differentiate between search + filters, or remain generic?
- **Why it matters**: User guidance—specific message could suggest "try removing filters" vs "try different search term"
- **Owner / follow-up**: UX/Product decision. Default to generic message for simplicity; can enhance in follow-up iteration based on user feedback.

- **Question**: Should filter buttons show counts (e.g., "In Stock (24)") or remain label-only?
- **Why it matters**: Counts provide preview of filter impact, but add complexity (need to calculate counts before applying filter, or live-update button labels)
- **Owner / follow-up**: UX decision. Start without counts for simplicity. Can add as enhancement if users request it.

- **Question**: Should filters have keyboard shortcuts (e.g., "S" for Stock, "L" for Shopping List)?
- **Why it matters**: Power users may benefit from keyboard efficiency
- **Owner / follow-up**: Accessibility/UX decision. Defer to future enhancement—not blocking for MVP.

- **Question**: Should filter state persist in localStorage or user preferences for session continuity?
- **Why it matters**: User may want default filter view across sessions
- **Owner / follow-up**: Product decision. Out of scope for this iteration—filters reset to inactive on fresh page load.

## 16) Confidence

**Confidence: High** — Feature leverages existing, proven patterns (route search params, client-side filtering, Button component variants) with no new API dependencies or complex async coordination. Shopping list membership data is already loaded, part `total_quantity` is readily available, and filtering logic is straightforward. Test coverage plan is comprehensive and follows established Playwright patterns. Risk profile is low—primary concern is performance with large datasets, which is testable and mitigatable.
