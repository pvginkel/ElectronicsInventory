# List Refinements – Technical Plan

## 0) Research Log & Findings

**Searched areas:**
- All list routes and components (kits, parts, boxes, sellers, shopping-lists)
- Current debounce implementation in kits (`src/components/kits/kit-overview-list.tsx`)
- Existing `useDebouncedValue` hook (`src/lib/utils/debounce.ts`)
- `ListScreenLayout` component (`src/components/layout/list-screen-layout.tsx`)
- TanStack Router usage patterns across list routes
- Instrumentation patterns via `useListLoadingInstrumentation`
- Playwright test patterns for search functionality

**Key findings:**
1. **Kits already implements debounced search** (`src/components/kits/kit-overview-list.tsx:38-50`) using the pattern:
   - Local state `searchInput` for immediate UI updates
   - `useDebouncedValue(searchInput, 300)` to delay URL updates
   - Two useEffect hooks: one to sync URL→input, one to sync debounced→URL
   - Clear button calls `onSearchChange('')` directly, bypassing debounce

2. **Four lists need debounce added**: Parts (`src/components/parts/part-list.tsx:92-105`), Boxes (`src/components/boxes/box-list.tsx:115-133`), Sellers (`src/components/sellers/seller-list.tsx:117-135`), Shopping Lists (`src/components/shopping-lists/overview-list.tsx:184-196`) all update URL on every keystroke.

3. **Current architecture duplicates search state management** across all list components:
   - Each component owns local search state
   - Each implements handleSearchChange navigation logic
   - Each renders its own Input + clear button UI

4. **ListScreenLayout accepts a search prop** (`src/components/layout/list-screen-layout.tsx:8`) as ReactNode, making it ideal for embedding a reusable search component.

5. **Instrumentation dependency**: All lists use `useListLoadingInstrumentation` and include searchTerm in metadata; debounced search must preserve this contract so Playwright specs can assert on search state.

6. **Conflict identified**: The kits route component (`src/routes/kits/index.tsx:48-68`) defines `handleSearchChange` that the KitOverviewList calls. Moving search state into a reusable component will require routes to pass simpler props (just the current searchTerm from URL) rather than change callbacks, since the component will manage navigation internally.

**Resolution:** Create a self-contained `<DebouncedSearchInput>` component that accepts only the current `searchTerm` from the route's URL state, manages its own debounced local state, and directly calls `navigate()` to update the URL. This eliminates the need for parent components to own search handlers and makes the component fully portable across all list views.

---

## 1) Intent & Scope

**User intent**

Improve search performance across all list views by applying debounced search (already implemented for kits) to parts, boxes, sellers, and shopping lists. The solution must avoid duplicating the debounce logic by centralizing it into a reusable component.

**Prompt quotes**

"Refactor search debounce (introduced for kits) throughout the app by creating a reusable search component"

"The solution must centralize the debounce logic, NOT duplicate it across multiple list components"

"Preferably embed the search component in the list view template (ListScreenLayout) or create a standalone component that can be easily dropped into each list"

"Ensure clear button bypasses debounce for instant feedback"

**In scope**

- Create a reusable `DebouncedSearchInput` component that encapsulates debounced search logic
- Refactor kits list to use the new reusable component (validate architecture)
- Apply reusable component to parts, boxes, sellers, and shopping lists
- Ensure URL-based search parameters continue to work (TanStack Router integration)
- Maintain browser back/forward compatibility
- Preserve instrumentation contracts for Playwright tests
- Clear button must bypass debounce delay

**Out of scope**

- Changing the visual design of search inputs
- Adding advanced search features (filters, operators, etc.)
- Modifying backend search endpoints or query logic
- Changing debounce delay timing (keep 300ms from kits implementation)
- Search functionality for non-list views (e.g., selector dialogs, forms)

**Assumptions / constraints**

- All list routes use TanStack Router's `validateSearch` to manage URL query parameters
- Existing `useDebouncedValue` hook (`src/lib/utils/debounce.ts`) is sufficient; no new debounce utilities needed
- Test instrumentation must continue emitting searchTerm in metadata for `list_loading` events
- Component must work with React 19 and TanStack Router v1
- Playwright specs that assert on search behavior will continue to pass after refactor

---

## 2) Affected Areas & File Map

**New component:**
- **File**: `src/components/common/debounced-search-input.tsx`
- **Why**: Centralized debounced search component that all lists will use
- **Evidence**: N/A (new file). Pattern derived from `src/components/kits/kit-overview-list.tsx:38-50,103-110,158-180`

**Updated list components:**
- **File**: `src/components/kits/kit-overview-list.tsx`
- **Why**: Replace inline search implementation with new reusable component (validation refactor)
- **Evidence**: Lines 38-50 (debounce state), 103-110 (handlers), 158-180 (search UI)
- **Change**: Remove local search state and handlers; use `DebouncedSearchInput`; switch from `debouncedSearch` to URL `searchTerm` for queries/instrumentation

- **File**: `src/components/parts/part-list.tsx`
- **Why**: Replace immediate URL update with debounced component
- **Evidence**: Lines 92-105 (handleSearchChange, handleClearSearch), 231-252 (search UI)
- **Change**: Remove navigate import and handlers; use `DebouncedSearchInput`

- **File**: `src/components/boxes/box-list.tsx`
- **Why**: Replace immediate URL update with debounced component
- **Evidence**: Lines 115-133 (handleSearchChange, handleClearSearch), 162-185 (search UI rendering)
- **Change**: Remove navigate import and handlers; use `DebouncedSearchInput`

- **File**: `src/components/sellers/seller-list.tsx`
- **Why**: Replace immediate URL update with debounced component
- **Evidence**: Lines 117-135 (handleSearchChange, handleClearSearch), 208-231 (search UI rendering)
- **Change**: Remove navigate import and handlers; use `DebouncedSearchInput`

- **File**: `src/components/shopping-lists/overview-list.tsx`
- **Why**: Replace immediate URL update with debounced component
- **Evidence**: Lines 184-196 (handleSearchChange, handleClearSearch), 327-348 (search UI rendering)
- **Change**: Remove navigate import and handlers; use `DebouncedSearchInput`

**Updated route components:**
- **File**: `src/routes/kits/index.tsx`
- **Why**: Remove handleSearchChange callback (component will own navigation)
- **Evidence**: Lines 48-67 (handleSearchChange definition), 106 (onSearchChange prop)
- **Change**: Remove `handleSearchChange` callback and `onSearchChange` prop

- **File**: `src/routes/parts/index.tsx`
- **Why**: Already minimal; no changes needed
- **Evidence**: Lines 6-10 (validateSearch), 46 (searchTerm prop only)
- **Change**: None

- **File**: `src/routes/boxes/index.tsx`
- **Why**: Already minimal; no changes needed
- **Evidence**: Lines 5-8 (validateSearch), 16 (searchTerm prop only)
- **Change**: None

- **File**: `src/routes/sellers/index.tsx`
- **Why**: Already minimal; no changes needed
- **Evidence**: Lines 5-8 (validateSearch), 16 (searchTerm prop only)
- **Change**: None

- **File**: `src/routes/shopping-lists/index.tsx`
- **Why**: Already minimal; no changes needed
- **Evidence**: Lines 5-7 (validateSearch), 17 (searchTerm prop only)
- **Change**: None

**Test updates:**
- **File**: `tests/e2e/kits/kits-overview.spec.ts`
- **Why**: Verify search debounce behavior still works after refactor
- **Evidence**: Lines 140-159 (search persistence test)
- **Change**: Run existing tests; confirm no regressions

- **File**: `tests/e2e/parts/part-list.spec.ts`
- **Why**: Add tests to verify debounced search
- **Change**: Add scenario: type search term → wait for list_loading ready → verify URL and results

- **File**: `tests/e2e/boxes/boxes-list.spec.ts`
- **Why**: Add tests to verify debounced search
- **Change**: Add scenario: type search term → wait for list_loading ready → verify URL and results

- **File**: `tests/e2e/sellers/sellers-list.spec.ts`
- **Why**: Add tests to verify debounced search
- **Change**: Add scenario: type search term → wait for list_loading ready → verify URL and results

- **File**: `tests/e2e/shopping-lists/shopping-lists.spec.ts`
- **Why**: Add tests to verify debounced search
- **Change**: Add scenario: type search term → wait for list_loading ready → verify URL and results

**Page object updates:**
- **File**: `tests/support/page-objects/kits-page.ts`
- **Why**: Search method needs to wait for debounce completion
- **Evidence**: Line 242-244 (search method currently fills immediately)
- **Change**: After filling input, call `await waitForListLoading(page, 'kits.overview', 'ready')`

- Similar updates for: `tests/support/page-objects/parts-page.ts`, `boxes-page.ts`, `sellers-page.ts`, `shopping-lists-page.ts`

---

## 3) Data Model / Contracts

**Component props contract:**
```typescript
interface DebouncedSearchInputProps {
  // Current search term from URL (controlled by route)
  searchTerm: string;

  // Route path for navigation (e.g., '/parts', '/kits')
  routePath: string;

  // Placeholder text for the input
  placeholder?: string;

  // Test ID prefix for instrumentation
  testIdPrefix: string;

  // Optional: additional search params to preserve during navigation
  // Example: kits needs to preserve 'status' param
  preserveSearchParams?: (currentSearch: Record<string, unknown>) => Record<string, unknown>;
}
```

**Concrete usage examples:**

```typescript
// Parts, Boxes, Sellers (simple - no preserveSearchParams needed)
<DebouncedSearchInput
  searchTerm={searchTerm}
  routePath="/parts"
  placeholder="Search parts..."
  testIdPrefix="parts.list"
/>

// Shopping lists (simple - validateSearch handles default '')
<DebouncedSearchInput
  searchTerm={searchTerm}
  routePath="/shopping-lists"
  placeholder="Search shopping lists..."
  testIdPrefix="shopping-lists.overview"
/>

// Kits (complex - preserve status param)
<DebouncedSearchInput
  searchTerm={searchTerm}
  routePath="/kits"
  placeholder="Search kits..."
  testIdPrefix="kits.overview"
  preserveSearchParams={(current) => ({
    status: current.status as KitStatus
  })}
/>
```

**Component gets current search via:**
```typescript
// Inside DebouncedSearchInput component
const currentSearch = Route.useSearch(); // From TanStack Router
```

**Note**: Debounce delay is hardcoded to 300ms (not configurable per list) based on product decision.

**Evidence**: Derived from kits implementation (`src/components/kits/kit-overview-list.tsx:16-23` for props pattern) and route navigation patterns across all list routes.

**Internal component state:**
```typescript
// Local state for immediate UI feedback
const [searchInput, setSearchInput] = useState(searchTerm);

// Debounced value that triggers URL navigation (300ms fixed delay)
const debouncedSearch = useDebouncedValue(searchInput, 300);
```

**Evidence**: `src/components/kits/kit-overview-list.tsx:38-39`

**URL search parameter shape** (unchanged):
```typescript
// Parts, boxes, sellers
{ search?: string }

// Kits (preserves status)
{ search?: string; status: 'active' | 'archived' }

// Shopping lists
{ search: string }  // Required, defaults to ''
```

**Evidence**: Route validateSearch implementations:
- Parts: `src/routes/parts/index.tsx:7-9`
- Boxes: `src/routes/boxes/index.tsx:5-8`
- Sellers: `src/routes/sellers/index.tsx:5-8`
- Shopping lists: `src/routes/shopping-lists/index.tsx:5-7`
- Kits: `src/routes/kits/index.tsx:14-22`

---

## 4) API / Integration Surface

**No backend API changes required.** This is purely a frontend refactor.

**TanStack Router navigation:**

- **Surface**: `useNavigate()` hook from `@tanstack/react-router` (called by `DebouncedSearchInput` component)
- **Inputs**:
  - `to`: route path (from `routePath` prop)
  - `search`: search parameter object or updater function
  - `replace`: true (to avoid filling history with every keystroke)
- **Outputs**: Browser URL updated, route re-renders with new search params
- **Errors**: Navigation errors surface through router error boundaries (existing behavior)
- **Evidence**: `src/components/kits/kit-overview-list.tsx:51-59` shows pattern; all list routes use identical navigation strategy

**Navigation implementation in component:**
```typescript
// Inside DebouncedSearchInput
const navigate = useNavigate();
const currentSearch = Route.useSearch();

useEffect(() => {
  if (debouncedSearch === searchTerm) return; // Guard against redundant navigation

  const baseSearch = preserveSearchParams
    ? preserveSearchParams(currentSearch)
    : {};

  navigate({
    to: routePath,
    search: debouncedSearch
      ? { ...baseSearch, search: debouncedSearch }
      : baseSearch,
    replace: true,
  });
}, [debouncedSearch, searchTerm, routePath, navigate, preserveSearchParams, currentSearch]);
```

**Clear button implementation:**
```typescript
const handleClear = useCallback(() => {
  setSearchInput(''); // Update local state immediately

  const baseSearch = preserveSearchParams
    ? preserveSearchParams(currentSearch)
    : {};

  // Navigate immediately (bypass debounce)
  navigate({
    to: routePath,
    search: baseSearch, // No search param
    replace: true,
  });
}, [navigate, routePath, preserveSearchParams, currentSearch]);
```

**Race condition mitigation**: Clear button calls navigate immediately and sets `searchInput = ''`. The debounce useEffect guard (`debouncedSearch === searchTerm`) prevents the old debounced value from overwriting the cleared state because after clear completes, URL `searchTerm` becomes `undefined`, and when old debounce timer fires with `debouncedSearch = "old value"`, the guard sees they don't match and navigates—but by then user has already cleared and URL is empty, so this navigation is a no-op (same search state).

**TanStack Query cache behavior:**

- **Surface**: List queries automatically refetch when URL search param changes
- **Inputs**: Updated `searchTerm` prop (from URL) flows to hooks like `useKitsOverview(searchTerm)`, `useGetPartsWithLocations()` + client-side filtering
- **Outputs**: Query cache invalidates/refetches, `useListLoadingInstrumentation` emits loading/ready events
- **Errors**: Query errors surface through existing error handling (no changes)
- **Evidence**: `src/components/kits/kit-overview-list.tsx:52` shows query hook; parts list uses client-side filtering `src/components/parts/part-list.tsx:111-127`

**IMPORTANT CHANGE FROM RESEARCH FINDINGS**: Parent list components now use `searchTerm` from URL instead of `debouncedSearch` for:
1. Query hooks (e.g., `useKitsOverview(searchTerm)` instead of `useKitsOverview(debouncedSearch)`)
2. Client-side filtering (e.g., `filteredParts` computed from `searchTerm`)
3. Instrumentation metadata (`searchTerm: searchActive ? searchTerm : null`)

This works because `searchTerm` (URL) is updated only after debounce completes. Parent components don't need access to intermediate `debouncedSearch` values.

---

## 5) Algorithms & UI Flows

**Flow: User types in search input**

1. User types character into search input
2. Component updates local `searchInput` state immediately (React re-render)
3. Input value reflects new text instantly (no perceived lag)
4. `useDebouncedValue` hook starts 300ms timer
5. If user types again within 300ms, timer resets
6. After 300ms of no typing, `debouncedSearch` state updates
7. `useEffect` detects `debouncedSearch` change
8. Component calls `navigate({ to, search, replace: true })`
9. TanStack Router updates URL query parameter
10. Route component re-renders with new `searchTerm` from URL
11. Updated `searchTerm` prop flows to list component
12. Query hook refetches with new search term OR client-side filtering re-computes
13. `useListLoadingInstrumentation` emits `loading` event
14. Query completes, instrumentation emits `ready` event with `searchTerm` in metadata

**States / transitions:**
- `searchInput` (local to DebouncedSearchInput): Updates on every keystroke
- `debouncedSearch` (local to DebouncedSearchInput): Updates 300ms after last keystroke
- `searchTerm` (URL, passed as prop to parent): Updates when `debouncedSearch` triggers navigation
- Query loading states: `isLoading` / `isFetching` → `ready` or `error`

**Hotspots:**
- Re-render on every keystroke (acceptable; only updates controlled input)
- Potential race condition if user navigates away before debounce completes (mitigated by useEffect cleanup in `useDebouncedValue`)
- Browser back/forward must sync URL → `searchInput` state (requires useEffect to watch `searchTerm` prop)

**Evidence**: `src/components/kits/kit-overview-list.tsx:38-50` implements this exact flow

**Flow: User clicks clear button**

1. User clicks clear button
2. Component sets `searchInput` to `''` immediately
3. Component calls `navigate({ to, search: { /* baseSearch only */ }, replace: true })` immediately
4. Debounce is bypassed entirely
5. URL updates instantly
6. Route re-renders with empty `searchTerm`
7. Query refetches with no search filter OR client-side filtering shows all results

**States / transitions:**
- `searchInput` → `''`
- URL `searchTerm` → `undefined` or `''`
- Query refetches immediately OR filtering shows all

**Race condition guard**: Old debounce timer may still fire after clear. The useEffect guard (`if (debouncedSearch === searchTerm) return`) prevents redundant navigation. After clear completes, `searchTerm` (URL) is empty. When old timer fires, `debouncedSearch` has old value, doesn't match `searchTerm`, but navigation to same empty state is idempotent.

**Evidence**: `src/components/kits/kit-overview-list.tsx:107-110` shows clear bypassing debounce

**Flow: Browser back/forward navigation**

1. User clicks browser back/forward
2. TanStack Router updates route search state
3. Route component re-renders with `searchTerm` from URL
4. DebouncedSearchInput receives new `searchTerm` prop
5. `useEffect` watching `searchTerm` updates `searchInput` to match
6. Input displays value from URL history
7. No navigation triggered (avoids infinite loop)

**States / transitions:**
- URL changes → `searchTerm` prop changes → `searchInput` state syncs

**Evidence**: `src/components/kits/kit-overview-list.tsx:41-43` syncs URL → local state

---

## 6) Derived State & Invariants

**Derived value: debouncedSearch** (internal to DebouncedSearchInput)
- **Source**: Local `searchInput` state (unfiltered user input)
- **Writes / cleanup**: Triggers URL navigation via `navigate()`; `useDebouncedValue` cleans up timeout on unmount
- **Guards**: `useEffect` compares `debouncedSearch === searchTerm` to avoid redundant navigation
- **Invariant**: `debouncedSearch` must eventually converge with `searchTerm` prop after debounce period, ensuring URL reflects intended search state
- **Evidence**: `src/components/kits/kit-overview-list.tsx:46-50`

**Derived value: searchActive** (in parent list components)
- **Source**: `searchTerm.trim().length > 0` (from URL, not debouncedSearch)
- **Writes / cleanup**: Passed to `useListLoadingInstrumentation` metadata; determines whether `filtered` count appears
- **Guards**: None (pure derived boolean)
- **Invariant**: Must accurately reflect whether a search filter is applied so Playwright tests can assert on filtered state. Uses URL `searchTerm` which updates only after debounce completes.
- **Evidence**: Updated from `src/components/kits/kit-overview-list.tsx:69,86` to use `searchTerm` instead of `debouncedSearch`

**Derived value: filteredCount** (in parent list components)
- **Source**: Filtered list length when search is active
- **Writes / cleanup**: Displayed in `<ListScreenCounts>`; included in instrumentation metadata
- **Guards**: Only set if `filteredLists.length < allLists.length`
- **Invariant**: When `searchActive`, instrumentation metadata must include `filtered: <count>` for Playwright assertions
- **Evidence**: `src/components/kits/kit-overview-list.tsx:154` shows conditional `filtered` prop

**Derived value: searchInput** (internal to DebouncedSearchInput, synced from URL)
- **Source**: `searchTerm` prop from route
- **Writes / cleanup**: `setSearchInput(searchTerm)` on prop change
- **Guards**: `useEffect` dependency on `searchTerm` ensures sync only fires when URL changes
- **Invariant**: After browser navigation (back/forward), `searchInput` must match URL to prevent user seeing stale input value
- **Evidence**: `src/components/kits/kit-overview-list.tsx:41-43`

---

## 7) State Consistency & Async Coordination

**Source of truth**: URL search parameters (managed by TanStack Router)

**Coordination**:
1. URL (`searchTerm` prop) → DebouncedSearchInput local `searchInput` state (one-way sync via useEffect)
2. DebouncedSearchInput local `searchInput` → `debouncedSearch` (via `useDebouncedValue` hook)
3. `debouncedSearch` → URL navigation (via `navigate()` call in useEffect inside component)
4. Updated URL `searchTerm` → parent list component → query refetch or client-side filtering

This creates a unidirectional flow: user input → local state → debounced state → URL → prop → query/filter.

**Async safeguards**:
- `useDebouncedValue` cleanup: Returns cleanup function that clears timeout if component unmounts before debounce completes
  - **Evidence**: `src/lib/utils/debounce.ts:15-17`
- `useEffect` guard: Compares `debouncedSearch === searchTerm` before navigating to avoid infinite loops
  - **Evidence**: `src/components/kits/kit-overview-list.tsx:46-47`
- TanStack Router `replace: true`: Prevents history pollution; back/forward navigation uses actual URL state
  - **Evidence**: `src/components/kits/kit-overview-list.tsx:57`
- Query abort: TanStack Query automatically aborts in-flight requests when search parameters change
  - **Evidence**: Standard TanStack Query behavior; `useListLoadingInstrumentation` detects aborts and emits `aborted` events

**Instrumentation**:
- `useListLoadingInstrumentation` in parent components receives `searchTerm` from URL (not `debouncedSearch`)
- Metadata includes `searchTerm: searchActive ? searchTerm : null` where `searchActive = searchTerm.trim().length > 0`
- Ensures Playwright tests wait on `list_loading` events that reflect the final search state (after debounce completes and URL updates)
- **Evidence**: Updated from `src/components/kits/kit-overview-list.tsx:77-101`

**Coordination with tests**:
- Tests use `waitForListLoading(page, scope, 'ready')` to wait for query completion
- Instrumentation metadata includes searchTerm so tests can assert expected search state
- **Evidence**: `tests/e2e/kits/kits-overview.spec.ts:152-158` shows search assertions

---

## 8) Errors & Edge Cases

**Failure: User navigates away before debounce completes**
- **Surface**: Component unmounts while `useDebouncedValue` timeout is pending
- **Handling**: `useDebouncedValue` cleanup function clears timeout; no navigation occurs
- **Guardrails**: React useEffect cleanup ensures no memory leaks or stale updates
- **Evidence**: `src/lib/utils/debounce.ts:15-17`

**Failure: Empty search string**
- **Surface**: User clears input or clicks clear button
- **Handling**: Component navigates with search param omitted (or set to `''` depending on route's validateSearch)
- **Guardrails**: Route `validateSearch` normalizes empty/undefined search to consistent shape
- **Evidence**: `src/routes/parts/index.tsx:7-9` shows optional search handling

**Failure: Special characters in search input**
- **Surface**: User types characters that need URL encoding
- **Handling**: TanStack Router automatically encodes URL parameters
- **Guardrails**: No manual encoding needed; router handles it
- **Evidence**: Standard TanStack Router behavior

**Edge case: Rapid tab switching (kits only)**
- **Surface**: User searches "Synth", switches to archived tab before debounce completes
- **Handling**: Tab switch navigation cancels pending search navigation; `searchInput` state preserved
- **Guardrails**: useEffect guard (`debouncedSearch === searchTerm`) prevents duplicate navigation
- **Evidence**: `src/routes/kits/index.tsx:35-46` shows handleStatusChange preserving search

**Edge case: Browser back during debounce period**
- **Surface**: User types search, immediately hits browser back before 300ms elapses
- **Handling**: Browser navigation overrides pending debounce; useEffect syncs `searchInput` to URL state
- **Guardrails**: `searchTerm` useEffect dependency ensures input reflects history state
- **Evidence**: `src/components/kits/kit-overview-list.tsx:41-43`

**Edge case: Programmatic navigation with search params**
- **Surface**: User clicks a link that includes search params (e.g., `navigate({ to: '/parts', search: { search: 'LED' } })`)
- **Handling**: Component receives `searchTerm='LED'` prop, syncs `searchInput` via useEffect
- **Guardrails**: Same URL sync mechanism handles all navigation sources
- **Evidence**: Same useEffect pattern

**Validation: searchTerm exceeds reasonable length**
- **Surface**: User pastes very long string into search input
- **Handling**: No frontend validation; backend search handles it
- **Guardrails**: Backend query performance is a backend concern; frontend remains responsive
- **Evidence**: N/A (no current validation)

---

## 9) Observability / Instrumentation

**Signal: list_loading events**
- **Type**: Instrumentation event (test-mode only)
- **Trigger**: Emitted by `useListLoadingInstrumentation` in each list component when queries transition loading → ready/error
- **Labels / fields**:
  - `scope`: e.g., `'kits.overview'`, `'parts.list'`, `'boxes.list'`
  - `phase`: `'loading' | 'ready' | 'error' | 'aborted'`
  - `metadata.searchTerm`: **URL `searchTerm`** (not `debouncedSearch`) if active, else `null`
  - `metadata.filtered`: count of results when search is active
  - `metadata.visible`, `metadata.totals`: result counts
- **Consumer**: Playwright `waitForListLoading` helper
- **Evidence**: Updated from `src/components/kits/kit-overview-list.tsx:77-101`, `src/lib/test/query-instrumentation.ts:132-236`

**IMPORTANT**: Instrumentation now uses URL `searchTerm` instead of `debouncedSearch`. During debounce period (user typed but 300ms hasn't elapsed), `searchInput` has user's input but `searchTerm` (URL) hasn't updated yet, so instrumentation correctly reports no active search. Once debounce completes and URL updates, instrumentation includes the search term.

**Signal: data-testid attributes**
- **Type**: DOM attributes for Playwright selectors
- **Trigger**: Rendered by component
- **Labels / fields**:
  - Search container: `{prefix}.search` or `{prefix}.search-container`
  - Search input: `{prefix}.search.input`
  - Clear button: `{prefix}.search.clear`
- **Consumer**: Playwright page objects (e.g., `tests/support/page-objects/kits-page.ts:83-84`)
- **Evidence**: `src/components/kits/kit-overview-list.tsx:159-180`

**Signal: Input value changes (for debugging)**
- **Type**: React DevTools state inspection
- **Trigger**: On every keystroke (`searchInput` state) and debounce completion (`debouncedSearch` state)
- **Labels / fields**: Component state in DevTools
- **Consumer**: Developers debugging search behavior
- **Evidence**: Standard React state inspection

**Signal: URL query parameter changes**
- **Type**: Browser URL updates
- **Trigger**: After debounce completes or clear button clicked
- **Labels / fields**: `?search=<term>` in URL
- **Consumer**: Browser history, external link sharing, Playwright URL assertions
- **Evidence**: `src/routes/kits/index.tsx:51-59` shows navigation pattern

---

## 10) Lifecycle & Background Work

**Hook / effect: Sync URL searchTerm → local searchInput** (inside DebouncedSearchInput)
- **Trigger cadence**: On mount and whenever `searchTerm` prop changes (browser back/forward, direct navigation)
- **Responsibilities**: Ensures input displays the value from URL, preventing stale state after navigation
- **Cleanup**: None needed (simple state update)
- **Evidence**: `src/components/kits/kit-overview-list.tsx:41-43`

**Hook / effect: Sync debouncedSearch → URL navigation** (inside DebouncedSearchInput)
- **Trigger cadence**: 300ms after `debouncedSearch` changes (debounced user input)
- **Responsibilities**: Navigates to update URL with new search term; guards against redundant navigation
- **Cleanup**: None needed (navigation is fire-and-forget)
- **Evidence**: `src/components/kits/kit-overview-list.tsx:45-50`

**Hook / effect: useDebouncedValue internal timer**
- **Trigger cadence**: On every `value` change; delayed by `delayMs` (300ms)
- **Responsibilities**: Manages setTimeout to delay state update
- **Cleanup**: Clears timeout on unmount or when value changes before timeout completes
- **Evidence**: `src/lib/utils/debounce.ts:10-17`

**Hook / effect: useListLoadingInstrumentation (in parent components)**
- **Trigger cadence**: On mount and whenever `isLoading`, `isFetching`, or `error` change
- **Responsibilities**: Emits `list_loading` test events for Playwright; tracks query lifecycle
- **Cleanup**: Emits `aborted` event on unmount if query was in flight
- **Evidence**: `src/lib/test/query-instrumentation.ts:175-235`

---

## 11) Security & Permissions

**Concern: XSS via search input**
- **Touchpoints**: User-provided search term rendered in URL and potentially in error messages
- **Mitigation**: React automatically escapes JSX interpolations; TanStack Router encodes URL parameters; no innerHTML usage
- **Residual risk**: Low; standard React protections apply. Backend must sanitize search input for SQL/query injection (out of scope).
- **Evidence**: React XSS protections are framework-level; no special handling needed in component

**Concern: Unauthorized data access via search**
- **Touchpoints**: Search queries hit backend endpoints that filter data
- **Mitigation**: Backend enforces authorization; frontend search is cosmetic (filters local cache)
- **Residual risk**: Acceptable; this is a UI optimization, not a security boundary
- **Evidence**: Search filters client-side data (`src/components/parts/part-list.tsx:111-127`); backend queries remain the source of truth

Not applicable otherwise; this is a UI refinement with no authentication, authorization, or data exposure changes.

---

## 12) UX / UI Impact

**Entry point: List overview pages**
- **Change**: Search input behavior changes from instant URL updates to 300ms debounced updates
- **User interaction**: Users will see their typed text immediately in the input (no perceived lag), but URL and query won't update until 300ms after they stop typing. This reduces backend load and improves performance on slow connections.
- **Dependencies**: Relies on existing `Input` component, `ClearButtonIcon`, TanStack Router navigation
- **Evidence**: Pattern proven in kits (`src/components/kits/kit-overview-list.tsx`)

**Entry point: Clear search button**
- **Change**: No user-facing change; clear button continues to instantly clear search
- **User interaction**: Click → instant URL update and query refetch (bypasses debounce)
- **Dependencies**: `ClearButtonIcon` component, TanStack Router navigation
- **Evidence**: `src/components/kits/kit-overview-list.tsx:107-110`

**Entry point: Browser back/forward**
- **Change**: No user-facing change; input continues to reflect URL history state
- **User interaction**: Browser navigation → input updates to match URL
- **Dependencies**: TanStack Router, useEffect URL sync
- **Evidence**: `src/components/kits/kit-overview-list.tsx:41-43`

**Entry point: Direct URL access with search param**
- **Change**: No user-facing change; visiting `/parts?search=capacitor` will display "capacitor" in input
- **User interaction**: Page load with search param → input pre-filled
- **Dependencies**: Route validateSearch, useEffect URL sync
- **Evidence**: Route validateSearch implementations across all list routes

**Visual changes**: None. Component reuses existing UI primitives and styling from kits implementation.

---

## 13) Deterministic Test Plan

**Surface: Debounced search input behavior**

**Scenarios**:
- **Given** user visits a list overview page (parts, boxes, sellers, shopping lists, kits)
  **When** user types a search term and waits for query completion
  **Then** URL updates with search parameter, list filters to matching results, instrumentation emits `list_loading` ready event with `searchTerm` in metadata

- **Given** user is typing a search term
  **When** user types multiple characters within 300ms
  **Then** URL does not update until 300ms after last keystroke

- **Given** user has entered a search term and results are filtered
  **When** user clicks the clear button
  **Then** URL updates immediately (no debounce delay), list shows all results, instrumentation emits ready event with `searchTerm: null`

- **Given** user has searched and navigated to a filtered view
  **When** user clicks browser back button
  **Then** search input reflects previous search state from URL, list displays previous results

- **Given** user searches on one tab (kits: active/archived; shopping lists: active/completed)
  **When** user switches tabs
  **Then** search term is preserved in the new tab (URL includes search param)

- **Given** user accesses a list URL with a search query parameter directly (e.g., `/parts?search=resistor`)
  **When** page loads
  **Then** search input displays "resistor", list is filtered, instrumentation includes searchTerm metadata

**Instrumentation / hooks**:
- `data-testid="{list-prefix}.search"` or `"{list-prefix}.search-container"`
- `data-testid="{list-prefix}.search.input"`
- `data-testid="{list-prefix}.search.clear"`
- `waitForListLoading(page, '{scope}', 'ready')` with metadata assertions on `searchTerm` and `filtered` fields

**Playwright wait strategy (EXPLICIT)**:

After typing in search input, tests must wait for debounce completion + query completion. **Use `waitForListLoading` helper**:

```typescript
// Example: Search for parts
await page.getByTestId('parts.list.search').fill('resistor');

// Wait for debounce (300ms) + query completion
await waitForListLoading(page, 'parts.list', 'ready');

// Now assert URL and results
await expect(page).toHaveURL(/search=resistor/);
// ... additional assertions
```

**Page object pattern**:

```typescript
// tests/support/page-objects/parts-page.ts
async search(term: string) {
  await this.page.getByTestId('parts.list.search').fill(term);
  await waitForListLoading(this.page, 'parts.list', 'ready');
}
```

**Why this works**: `waitForListLoading` naturally waits for:
1. Debounce timer (300ms)
2. URL navigation
3. Query refetch
4. Results rendered

No fixed waits (`page.waitForTimeout`) needed. Tests remain deterministic.

**Alternative**: Wait for URL parameter change:
```typescript
await page.getByTestId('parts.list.search').fill('resistor');
await page.waitForURL(/search=resistor/); // Waits for debounce + navigation
```

Both approaches are deterministic. `waitForListLoading` is preferred because it also confirms query completion.

**Gaps**:
- Performance testing for debounce on slow networks (manual testing only; out of Playwright scope)
- Accessibility testing for screen reader announcements during search (defer to manual QA)

**Evidence**:
- Existing kits test: `tests/e2e/kits/kits-overview.spec.ts:140-159`
- Page object search method: `tests/support/page-objects/kits-page.ts:242-244`

---

## 14) Implementation Slices

**Slice 1: Create reusable component and refactor kits**
- **Goal**: Validate architecture by refactoring kits list (which already has debounce) to use new component
- **Touches**:
  - Create `src/components/common/debounced-search-input.tsx` with:
    - `searchTerm`, `routePath`, `placeholder`, `testIdPrefix`, `preserveSearchParams` props
    - Internal state: `searchInput`, `debouncedSearch`
    - useEffect for URL sync and debounced navigation
    - Clear button handler that bypasses debounce
  - Update `src/components/kits/kit-overview-list.tsx`:
    - Remove local `searchInput`, `debouncedSearch` state (lines 38-39)
    - Remove both useEffects (lines 41-50)
    - Remove `handleSearchInputChange`, `handleClearSearch` (lines 103-110)
    - Replace `searchNode` JSX with `<DebouncedSearchInput>` component
    - Update `useKitsOverview(searchTerm)` call (was `debouncedSearch`, now uses `searchTerm` from URL)
    - Update instrumentation to use `searchTerm` instead of `debouncedSearch`
  - Update `src/routes/kits/index.tsx`:
    - Remove `handleSearchChange` callback (lines 48-67)
    - Remove `onSearchChange` prop from `<KitOverviewList>`
  - **Validation**:
    - Run `pnpm check` (TypeScript, lint, build)
    - Run `pnpm playwright test tests/e2e/kits/kits-overview.spec.ts` **5-10 times** to catch timing issues
    - Verify no console errors, no test flakes
- **Dependencies**: None (kits already has debounce; this is a refactor)

**Slice 2: Apply to parts list**
- **Goal**: Add debounced search to parts list
- **Touches**:
  - Update `src/components/parts/part-list.tsx`:
    - Remove `navigate` import
    - Remove `handleSearchChange`, `handleClearSearch` (lines 92-109)
    - Replace `searchNode` with `<DebouncedSearchInput routePath="/parts" ... />`
  - Update `tests/e2e/parts/part-list.spec.ts`:
    - Add test scenario: fill search → wait for list_loading ready → assert URL and filtered results
  - Update `tests/support/page-objects/parts-page.ts`:
    - Update search method to call `waitForListLoading` after filling input
  - **Validation**: Run `pnpm playwright test tests/e2e/parts/`
- **Dependencies**: Slice 1 (component must exist)

**Slice 3: Apply to boxes list**
- **Goal**: Add debounced search to boxes list
- **Touches**:
  - Update `src/components/boxes/box-list.tsx`
  - Update `tests/e2e/boxes/boxes-list.spec.ts`
  - Update `tests/support/page-objects/boxes-page.ts`
  - **Validation**: Run `pnpm playwright test tests/e2e/boxes/`
- **Dependencies**: Slice 1

**Slice 4: Apply to sellers list**
- **Goal**: Add debounced search to sellers list
- **Touches**:
  - Update `src/components/sellers/seller-list.tsx`
  - Update `tests/e2e/sellers/sellers-list.spec.ts`
  - Update `tests/support/page-objects/sellers-page.ts`
  - **Validation**: Run `pnpm playwright test tests/e2e/sellers/`
- **Dependencies**: Slice 1

**Slice 5: Apply to shopping lists**
- **Goal**: Add debounced search to shopping lists
- **Touches**:
  - Update `src/components/shopping-lists/overview-list.tsx`
  - Update `tests/e2e/shopping-lists/shopping-lists.spec.ts`
  - Update `tests/support/page-objects/shopping-lists-page.ts`
  - **Validation**: Run `pnpm playwright test tests/e2e/shopping-lists/`
- **Dependencies**: Slice 1

---

## 15) Risks & Open Questions

**Risk: Playwright test timing regressions**
- **Impact**: Tests that fill search inputs may fail if they assert too quickly (before debounce completes)
- **Mitigation**: Update page object search methods to call `await waitForListLoading(page, scope, 'ready')` after filling input. This waits for debounce (300ms) + query completion. Document pattern in test plan (section 13).

**Risk: User confusion during debounce period**
- **Impact**: Users on very slow connections might type, then navigate away before seeing results
- **Mitigation**: 300ms is short enough to be imperceptible for most users; input shows immediate feedback; backend queries are the actual performance bottleneck, not debounce delay

**Risk: preserveSearchParams callback complexity for complex routes**
- **Impact**: Kits needs to preserve `status` param; callback uses `Record<string, unknown>` which loses type safety
- **Mitigation**: Accept type assertion (`current.status as KitStatus`) as pragmatic trade-off for reduced route code. Document concrete examples in section 3. Only kits route needs this; simple routes (parts, boxes, sellers, shopping lists) don't need callback.

**Decision: Debounce delay is NOT configurable per list**
- **Rationale**: Use 300ms universally across all lists (proven pattern from kits). Simplifies component API and maintains consistent UX. Query performance optimization should be addressed at the backend/caching layer, not via variable frontend delays.
- **Impact**: Removes `debounceMs` prop from component interface; hardcode 300ms constant

**Decision: NO loading indicator during debounce period**
- **Rationale**: Current kits implementation has no debounce indicator and feels natural; input updates instantly providing immediate feedback. Adding a "pending" indicator would draw attention to the delay rather than hiding it.
- **Impact**: No additional UI state or loading spinner needed; keeps component simpler

**Decision: Parent components use URL searchTerm, not debouncedSearch**
- **Rationale**: By the time URL updates, debounce has completed. Parent components don't need intermediate debounced values. This simplifies state management and keeps derived values (searchActive, filteredCount) accessible to parent.
- **Impact**: Queries and instrumentation use `searchTerm` from URL. During debounce period, search is considered inactive (correct behavior).

---

## 16) Confidence

**Confidence: High** — Pattern is already proven in kits implementation; no new architectural concepts introduced. TanStack Router and Query integration are well-understood. Instrumentation contract is preserved (uses URL searchTerm). Playwright test coverage exists and will validate refactor. Main risk is test timing, which is mitigated by documented `waitForListLoading` strategy. All architectural ambiguities from review have been resolved with concrete examples and explicit implementation guidance.
