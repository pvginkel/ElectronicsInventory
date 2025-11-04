# Search Bar Clear Button Fix — Technical Plan

**Review Status:** Plan reviewed and updated to address findings from `plan_review.md`

## 0) Research Log & Findings

**Discovery Work:**
- Located the `DebouncedSearchInput` component at `src/components/ui/debounced-search-input.tsx:1-111`
- Found the component is used in 5 list views: parts, boxes, sellers, kits, and shopping lists
- Examined existing Playwright tests in `tests/e2e/parts/part-list.spec.ts:63-109` which test search clearing
- Inspected page object implementations in `tests/support/page-objects/parts-page.ts:82-93` and `tests/support/page-objects/boxes-page.ts:44-48`
- Verified all 4 page objects with clearSearch methods: parts, boxes, sellers (line 44-54), and kits (line 246-251)
- Confirmed shopping-lists page object does not have a clearSearch method

**Key Finding:**
All page object `clearSearch()` methods follow the same pattern:
1. Click the clear button (`parts.list.search.clear`)
2. **Then also** programmatically call `searchInput.fill('')`

This workaround suggests the clear button click alone doesn't update the input field's DOM value. The tests pass because they compensate by filling the input programmatically, masking the underlying bug.

**Evidence:**
- `tests/support/page-objects/parts-page.ts:82-93` — clearSearch clicks button then calls `fill('')` on line 87
- `tests/support/page-objects/boxes-page.ts:44-48` — identical pattern, `fill('')` on line 48
- `src/components/ui/debounced-search-input.tsx:71-85` — handleClear calls `setSearchInput('')` then navigates immediately

**Conflict Resolution:**
The existing tests in `part-list.spec.ts:63-83` and `part-list.spec.ts:85-109` both verify clearing behavior and pass, but only because the page object compensates for the broken clear button. We need a new test that isolates the clear button click without the fill workaround.

---

## 1) Intent & Scope

**User intent**

Fix the search bar clear button so clicking it properly clears the input field's visual value without requiring programmatic compensation in tests.

**Prompt quotes**

"The clear button on the search bar in the part list view screen doesn't clear the search bar."
"Write a plan to fix this"
"Make sure to write a failing Playwright test first TDD style."

**In scope**

- Write a failing Playwright test that clicks the clear button and asserts the input value is empty (without calling fill)
- Diagnose and fix the root cause in `DebouncedSearchInput` component
- Remove the compensating `fill('')` workarounds from all page object `clearSearch()` methods
- Verify all existing search-related tests continue to pass after the fix

**Out of scope**

- Changes to debounce timing or navigation behavior
- Modifications to search filtering logic or URL parameter handling
- Updates to other search-related features not directly related to the clear button
- Backend changes (this is purely a frontend UI bug)

**Assumptions / constraints**

- The bug is reproducible and not browser-specific
- The fix should maintain the existing debounced search and immediate navigation behavior
- All 4 page object implementations with `clearSearch()` methods (parts, boxes, sellers, kits) need workaround removal after fix
- The `DebouncedSearchInput` component is used in 5 list views (parts, boxes, sellers, kits, shopping lists), but only 4 have page object clearSearch methods
- Tests must continue to use the real backend without mocking or intercepting requests
- The fix must not introduce regressions in existing search functionality

---

## 2) Affected Areas & File Map

- Area: DebouncedSearchInput component
- Why: Contains the broken handleClear implementation
- Evidence: `src/components/ui/debounced-search-input.tsx:71-85` — handleClear sets state then navigates; `src/components/ui/debounced-search-input.tsx:90-96` — Input is controlled by searchInput state

- Area: Parts page object clearSearch method
- Why: Contains workaround fill('') that masks the bug
- Evidence: `tests/support/page-objects/parts-page.ts:82-93` — line 87 calls `fill('')` after clicking clear button

- Area: Boxes page object clearSearch method
- Why: Contains identical workaround
- Evidence: `tests/support/page-objects/boxes-page.ts:44-48` — line 48 calls `fill('')` after clicking clear button

- Area: Sellers page object clearSearch method
- Why: Contains identical workaround (clicks button then calls fill(''))
- Evidence: `tests/support/page-objects/sellers-page.ts:44-54` — line 48 calls `fill('')` after clicking clear button

- Area: Kits page object clearSearch method
- Why: Contains variant workaround pattern (clicks button with force, falls back to fill('') if not visible)
- Evidence: `tests/support/page-objects/kits-page.ts:246-251` — line 251 calls `fill('')` as fallback when button not visible

- Area: Part list Playwright spec
- Why: Needs new failing test that isolates clear button behavior
- Evidence: `tests/e2e/parts/part-list.spec.ts:63-83` — existing test "filters by search term and clears search" uses the workaround

- Area: Boxes list Playwright spec
- Why: May need verification after fix
- Evidence: `tests/e2e/boxes/boxes-list.spec.ts` — uses boxes page object clearSearch

- Area: Sellers list Playwright spec
- Why: May need verification after fix
- Evidence: `tests/e2e/sellers/sellers-list.spec.ts` — uses sellers page object clearSearch

---

## 3) Data Model / Contracts

No API contract changes required. This is a pure UI state management fix.

- Entity / contract: Local component state (searchInput)
- Shape: `string` — the current value of the search input field
- Mapping: Controlled input binds to `searchInput` state via `value={searchInput}`
- Evidence: `src/components/ui/debounced-search-input.tsx:34` — `useState(searchTerm)`; line 90 — `value={searchInput}`

- Entity / contract: URL search parameter
- Shape: `{ search?: string }` in route search params
- Mapping: `searchTerm` prop comes from route validation, fed into component; debounced changes navigate to update URL
- Evidence: `src/routes/parts/index.tsx:7-10` — validateSearch extracts search param; `src/components/ui/debounced-search-input.tsx:48-65` — useEffect navigates on debounced changes

---

## 4) API / Integration Surface

No backend API changes required.

- Surface: URL navigation (TanStack Router)
- Inputs: `{ to: routePath, search: { search?: string }, replace: true }`
- Outputs: URL updates, route re-renders, searchTerm prop updates
- Errors: None expected (client-side only)
- Evidence: `src/components/ui/debounced-search-input.tsx:58-64` — navigate call in debounce effect; lines 80-84 — navigate call in handleClear

---

## 5) Algorithms & UI Flows

**Current (broken) clear button flow:**

- Flow: User clicks clear button on search input
- Steps:
  1. User clicks button with `data-testid="${testIdPrefix}.search.clear"`
  2. `handleClear` callback fires (line 71)
  3. `setSearchInput('')` is called to update local state (line 73)
  4. `navigate({ to: routePath, search: baseSearch })` is called immediately (lines 80-84)
  5. URL updates, route re-renders
  6. `DebouncedSearchInput` receives new `searchTerm=''` prop
  7. `useEffect` at line 43-45 fires and calls `setSearchInput(searchTerm)` → `setSearchInput('')`
  8. **BUG:** Input field value doesn't reflect the state change visually
- States / transitions: searchInput state → '' → Input value should be '' but isn't
- Hotspots: Race between setSearchInput and navigate causing re-render before state flush
- Evidence: `src/components/ui/debounced-search-input.tsx:71-85`

**Proposed (fixed) clear button flow — Option A (selected):**

- Flow: User clicks clear button on search input
- Steps:
  1. User clicks button with `data-testid="${testIdPrefix}.search.clear"`
  2. `handleClear` callback fires
  3. `handleClear` calls `navigate()` to clear the URL search param (remove 'search' key)
  4. URL updates, route re-renders with `searchTerm=''` prop
  5. The existing sync effect at line 43-45 fires: `useEffect(() => setSearchInput(searchTerm), [searchTerm])`
  6. `setSearchInput('')` is called via the sync effect
  7. Input field value updates to empty string
  8. Clear button disappears (conditional render based on searchInput at line 97)
- States / transitions: URL updates → searchTerm prop '' → searchInput state '' → Input value ''
- Hotspots: Remove redundant `setSearchInput('')` call from handleClear to avoid race; rely solely on the existing prop-sync effect
- Evidence: `src/components/ui/debounced-search-input.tsx:43-45` — existing sync effect will handle state update after navigation completes

**Fix Implementation (Option A):**
Remove the `setSearchInput('')` call from `handleClear` (line 73). The existing useEffect that syncs `searchTerm` → `searchInput` will update the local state after navigation completes. This eliminates the race condition and is the simplest, most React-idiomatic approach.

---

## 6) Derived State & Invariants

- Derived value: `debouncedSearch`
  - Source: `useDebouncedValue(searchInput, 300)` from local searchInput state
  - Writes / cleanup: Triggers navigation via useEffect when debouncedSearch !== searchTerm
  - Guards: Debounce timer clears on searchInput change or component unmount
  - Invariant: debouncedSearch should always lag searchInput by 300ms unless bypassed (clear button)
  - Evidence: `src/components/ui/debounced-search-input.tsx:37` — debouncedSearch definition; lines 48-65 — navigation effect

- Derived value: Clear button visibility
  - Source: `searchInput` (truthy check at line 97)
  - Writes / cleanup: Button conditionally renders, no writes
  - Guards: Only shows when searchInput has content
  - Invariant: Button disappears when searchInput is empty
  - Evidence: `src/components/ui/debounced-search-input.tsx:97-107`

- Derived value: Filtered parts list (example from consuming component)
  - Source: searchTerm prop filtering parts array
  - Writes / cleanup: None (pure derivation)
  - Guards: Uses trim() and toLowerCase() for case-insensitive matching
  - Invariant: Empty searchTerm shows unfiltered list
  - Evidence: `src/components/parts/part-list.tsx:83-99` — filteredParts memo

---

## 7) State Consistency & Async Coordination

- Source of truth: URL search param is the source of truth; local searchInput is an ephemeral UI optimization
- Coordination: searchInput syncs FROM searchTerm prop via useEffect; changes to searchInput trigger debounced navigation to update URL
- Async safeguards: Debounce cleanup on unmount (useDebouncedValue returns cleanup); navigation redundancy guard at line 50-52
- Instrumentation: List components emit `list_loading` events with searchTerm metadata when queries complete
- Evidence: `src/components/ui/debounced-search-input.tsx:43-45` — sync effect; `src/components/parts/part-list.tsx:120-182` — useListLoadingInstrumentation includes searchTerm

**Current issue:**
The immediate navigate() call in handleClear triggers a re-render before the setSearchInput('') state update has flushed to the DOM. React's batching should handle this, but the controlled input's value binding might not update in time.

**Proposed coordination:**
Use a useEffect or ensure state update completes before navigation. Alternatively, rely on the sync effect (line 43-45) to handle the clear after navigation completes, but remove the redundant setSearchInput in handleClear to avoid race.

---

## 8) Errors & Edge Cases

- Failure: Clear button clicked but input field retains old value
- Surface: DebouncedSearchInput component
- Handling: Current workaround in page objects calls fill('') to force clear; this plan removes that workaround after fixing the root cause
- Guardrails: Test will verify input.value is '' after clear button click
- Evidence: `tests/support/page-objects/parts-page.ts:87` — fill('') workaround

- Failure: URL doesn't update after clear button click
- Surface: DebouncedSearchInput component
- Handling: Existing tests verify URL via `page.waitForURL(/^(?!.*search)/)`
- Guardrails: Test already covers this; should continue to pass after fix
- Evidence: `tests/e2e/parts/part-list.spec.ts:107` — URL assertion

- Failure: Debounced navigation fires after clear button (redundant)
- Surface: DebouncedSearchInput component
- Handling: Guard at line 50-52 prevents redundant navigation if debouncedSearch === searchTerm
- Guardrails: No action needed; existing guard should suffice
- Evidence: `src/components/ui/debounced-search-input.tsx:50-52`

- Failure: Clear button disappears before click completes (race condition)
- Surface: DebouncedSearchInput component
- Handling: Button visibility depends on searchInput state; state update should happen synchronously
- Guardrails: Test will verify button click succeeds
- Evidence: `src/components/ui/debounced-search-input.tsx:97`

- Edge case: handleClear called when input is already empty
- Surface: DebouncedSearchInput component
- Handling: Current implementation is idempotent — navigating with no search param when already at no search param is safe; guard at line 50-52 prevents redundant navigation
- Guardrails: No special handling needed; behavior is already safe
- Evidence: `src/components/ui/debounced-search-input.tsx:50-52` — navigation guard; line 97 — button only renders when searchInput is truthy, so user shouldn't encounter this scenario

---

## 9) Observability / Instrumentation

- Signal: List loading ready event with searchTerm: null
- Type: Instrumentation event (test mode only)
- Trigger: After clear completes and list re-renders with no search filter
- Labels / fields: `{ searchTerm: null, totalCount, visibleCount }`
- Consumer: Playwright waitForListLoading helper
- Evidence: `src/components/parts/part-list.tsx:138` — searchActive ? searchTerm : null

- Signal: Search input value assertion
- Type: Playwright locator assertion
- Trigger: After clear button click in test
- Labels / fields: `data-testid="${testIdPrefix}.search.input"` with `value=""`
- Consumer: New failing test in part-list.spec.ts
- Evidence: `tests/support/page-objects/parts-page.ts:27` — searchInput locator; `tests/e2e/parts/part-list.spec.ts:82` — existing assertion

- Signal: URL parameter absence
- Type: Playwright URL assertion
- Trigger: After clear completes
- Labels / fields: URL should not match `/search=/`
- Consumer: Existing tests in part-list.spec.ts
- Evidence: `tests/e2e/parts/part-list.spec.ts:107` — URL check after clear

---

## 10) Lifecycle & Background Work

- Hook / effect: useEffect syncing searchTerm prop → searchInput state
- Trigger cadence: On mount, on searchTerm prop change (browser back/forward)
- Responsibilities: Keep local searchInput in sync with URL-based searchTerm
- Cleanup: None needed (state setter is stable)
- Evidence: `src/components/ui/debounced-search-input.tsx:43-45`

- Hook / effect: useEffect syncing debouncedSearch → URL navigation
- Trigger cadence: 300ms after searchInput changes
- Responsibilities: Navigate to update URL search param after user stops typing
- Cleanup: Implicit in useDebouncedValue (clears timeout on change/unmount)
- Evidence: `src/components/ui/debounced-search-input.tsx:48-65`

- Hook / effect: useDebouncedValue internal timer
- Trigger cadence: Starts on searchInput change, fires after 300ms
- Responsibilities: Delay propagation of searchInput → debouncedSearch
- Cleanup: clearTimeout on unmount or value change
- Evidence: `src/lib/utils/debounce.ts:10-17`

---

## 11) Security & Permissions

Not applicable — this is a client-side UI bug fix with no security implications.

---

## 12) UX / UI Impact

- Entry point: Search input in list views (parts, boxes, sellers, kits, shopping lists)
- Change: Clear button (X icon) will now properly clear the input field's visual value when clicked
- User interaction: User clicks clear button → input field immediately shows empty value → filtered results show all items → URL updates to remove search param
- Dependencies: DebouncedSearchInput component; all list views using it
- Evidence: `src/components/ui/debounced-search-input.tsx:98-107` — clear button; `src/components/parts/part-list.tsx:203-210` — usage in PartList

---

## 13) Deterministic Test Plan

**New test (TDD — should fail before fix):**

- Surface: Part list search input clear button
- Scenarios:
  - Given: User has navigated to parts list and entered a search term
  - When: User clicks the clear button (without programmatic fill compensation)
  - Then: Input field value is empty string
  - Then: URL no longer contains search param
  - Then: All parts are visible (not filtered)
- Instrumentation / hooks: `data-testid="parts.list.search.input"`, `data-testid="parts.list.search.clear"`, `waitForListLoading` helper
- Gaps: None
- Evidence: New test to be added in `tests/e2e/parts/part-list.spec.ts`

**Updated page object methods:**

- Surface: Page object clearSearch helpers
- Scenarios:
  - Given: clearSearch is called on any page object (parts, boxes, sellers, kits)
  - When: Clear button is clicked
  - Then: Input clears without needing programmatic fill('')
- Instrumentation / hooks: Existing locators for searchInput and searchClear
- Gaps: None — removal of workaround
- Evidence: `tests/support/page-objects/parts-page.ts:82-93`, `tests/support/page-objects/boxes-page.ts:44-48`

**Regression coverage:**

- Surface: Existing search tests
- Scenarios:
  - Existing tests in `part-list.spec.ts:63-83` and `part-list.spec.ts:85-109` should continue passing
  - Tests in `boxes-list.spec.ts`, `sellers-list.spec.ts` using clearSearch should continue passing
- Instrumentation / hooks: Existing test infrastructure
- Gaps: None
- Evidence: All specs using clearSearch method

---

## 14) Implementation Slices

This is a small bug fix; no slicing required. Implement atomically:

1. Write failing test
2. Fix DebouncedSearchInput handleClear
3. Update all page object clearSearch methods
4. Verify all tests pass

---

## 15) Risks & Open Questions

**Risks:**

- Risk: Fix might introduce timing issue in other browsers or under load
- Impact: Clear button might not work reliably in all scenarios
- Mitigation: Run tests in multiple browsers (Chromium, Firefox, WebKit); verify CI passes

- Risk: Existing tests might fail if they rely on the fill('') workaround
- Impact: Test suite breaks after removing workaround
- Mitigation: Verify all search-related tests pass locally before committing

- Risk: Other components might have similar state/navigation race issues
- Impact: Bug might resurface in other contexts
- Mitigation: Review other uses of immediate navigate() after setState in the codebase

**Open Questions:**

- Question: Why does the current handleClear implementation fail to update the input field?
- Why it matters: Understanding root cause ensures the fix is correct
- Owner / follow-up: Developer implementing the fix should debug with React DevTools to observe state updates vs. DOM rendering

- Question: Are there other places in the codebase where setState + immediate navigate might cause similar issues?
- Why it matters: Might indicate a broader pattern to address
- Owner / follow-up: Code search for `navigate` calls immediately after `setState` calls

- Question: Should we add a useEffect to handle clear instead of doing it inline in handleClear?
- Why it matters: Might be a more React-idiomatic pattern
- Owner / follow-up: Evaluate during implementation; prefer simplest fix that works

---

## 16) Confidence

Confidence: High — The bug is well-understood from code inspection and test behavior; the workaround in page objects confirms the issue; fix should be straightforward state management correction.
