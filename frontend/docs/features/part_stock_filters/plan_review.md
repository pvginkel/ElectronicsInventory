# Part Stock Filters — Plan Review

## 1) Summary & Decision

**Readiness**

The plan is comprehensive, well-researched, and demonstrates strong alignment with project patterns. It covers all 16 required sections with file:line evidence, proposes using existing UI primitives (Button component for filter badges), correctly identifies route search parameters as the state management strategy, and outlines detailed Playwright coverage. The filtering logic is straightforward client-side array operations with proper safety guards. However, there are several implementation gaps and ambiguities that need resolution before development: (1) the empty state condition at line 274-280 must be updated to trigger on filters as well as search, but the plan doesn't specify the exact logic; (2) filter state persistence during navigation is deferred to Slice 6 without confirming whether `handleSelectPart` should use `search: (prev) => prev` or explicit field preservation; (3) the instrumentation metadata structure adds `activeFilters` and `filterCounts` but doesn't clarify whether `filteredCount` should represent total filtered items or only search-filtered items when both mechanisms are active; (4) no discussion of what happens if both filters are inactive and search is also empty—whether `searchActive` should become `filtersOrSearchActive`.

**Decision**

`GO-WITH-CONDITIONS` — The plan is implementable and low-risk, but must clarify the empty state trigger logic (search vs filters vs both), confirm the navigation search preservation pattern, and define the instrumentation metadata semantics for combined search + filter scenarios. These are straightforward to resolve and don't require design changes, just explicit statements in the plan.

## 2) Conformance & Fit (with evidence)

**Conformance to refs**

- `docs/commands/plan_feature.md` — **Pass** — plan:39-669 — All 16 required sections present with evidence citations. Section 0 documents research (plan:3-33), section 1 includes verbatim prompt quotes (plan:41-51), section 2 provides file:line evidence for all touched areas (plan:80-117), sections 3-16 follow prescribed templates.

- `docs/contribute/architecture/application_overview.md` — **Pass** — plan:83-117 — Plan correctly references TanStack Router search param validation (plan:83-87 cites `src/routes/parts/index.tsx:7-10` and `src/routes/kits/index.tsx:14-22`), uses generated API types (plan:154 references `PartWithTotalAndLocationsSchema`), and proposes extending existing instrumentation hooks (plan:90-93 references `useListLoadingInstrumentation` at line 120 in part-list.tsx).

- `docs/contribute/testing/playwright_developer_guide.md` — **Pass** — plan:499-579 — Test plan follows "API-first data setup" principle (plan:517-521 proposes factory helpers like `testData.parts.create({ overrides: { total_quantity: 0 } })`), avoids request interception (plan:512 uses `waitForListLoading` event wait instead of mocking), and extends page object with new locators/methods (plan:570-578).

- `CLAUDE.md` — **Pass** — plan:90-93 — Plan proposes extending `useListLoadingInstrumentation` with new metadata fields (plan:162-183), which aligns with "Treat instrumentation as part of the UI contract" mandate. Test coverage is paired with UI changes across all slices (plan:580-631).

**Fit with codebase**

- `src/routes/kits/index.tsx:14-22` (validateSearch pattern) — plan:83-87, plan:123-133 — **Aligned** — Plan correctly models `PartsSearchState` interface extension and boolean coercion logic matching the kits route precedent. Evidence at plan:86 shows awareness of existing `validateSearch` function signature.

- `src/components/parts/part-list.tsx:83-99` (useMemo filtering) — plan:151-160 — **Aligned** — Plan proposes extending existing search filter with additional predicates for stock and shopping list membership. Evidence at plan:92 shows correct line reference to current filtering logic.

- `src/components/ui/button.tsx:8,40` (Button variants) — plan:100-105 — **Aligned** — Plan correctly identifies that Button component already supports `variant="outline"` and `variant="default"` needed for toggle appearance. No new component creation required.

- `src/hooks/use-part-shopping-list-memberships.ts:245-316` (membership data) — plan:95-99, plan:318-322 — **Aligned** — Plan recognizes `summaryByPartKey` map with `hasActiveMembership` boolean is already available, eliminating need for new API calls. Correctly notes undefined-safe lookup pattern needed.

- `src/routes/parts/index.tsx:19-21` (handleSelectPart navigation) — plan:366-372, plan:483-490, plan:625-631 — **Gap identified in plan** — Current `handleSelectPart` doesn't preserve search params. Plan correctly flags this in section 8 (plan:366-372) and defers fix to Slice 6 (plan:625-631), but doesn't specify exact implementation pattern. Should clarify whether to use `search: (prev) => prev` (preserves all params) or explicit `search: () => ({ search: prevSearch, hasStock, onShoppingList })` like kits route pattern at line 58-59.

- `src/components/parts/part-list.tsx:274-280` (noResultsContent condition) — plan:274-280, plan:334-340 — **Implementation gap** — Plan notes at line 339 "Will need to adjust condition to show this state when filters are active too (not just search)" but doesn't specify the new condition. Current code shows `noResultsContent` when `searchActive` is true and `visibleCount === 0`. Plan should clarify: should this become `(searchActive || hasStockFilter || onShoppingListFilter) && visibleCount === 0`? Or introduce `filtersActive` derived boolean?

## 3) Open Questions & Ambiguities

- **Question:** What is the exact boolean condition to trigger `noResultsContent` vs `emptyContent`?
- **Why it matters:** Plan correctly identifies this ambiguity at line 339 ("Will need to adjust condition to show this state when filters are active too") but doesn't resolve it. Current code at `src/components/parts/part-list.tsx:274-280` renders `noResultsContent` when `searchActive && visibleCount === 0`, but with filters this logic breaks: if user activates "In Stock" filter with no search term, `searchActive` is false so `emptyContent` would show instead of `noResultsContent`.
- **Needed answer:** Define `filtersOrSearchActive = searchActive || hasStockFilter || onShoppingListFilter` and use `filtersOrSearchActive && visibleCount === 0` to trigger `noResultsContent`. Alternatively, if truly no parts exist (`parts.length === 0`), show `emptyContent` regardless of filters. Plan must specify this logic in section 5 or 12.

**Research performed:** Examining `src/components/parts/part-list.tsx:257-280` shows three content states: `emptyContent` (no parts exist), `noResultsContent` (search yielded nothing), and `listContent` (parts visible). The plan adds filters as a third filtering mechanism (after search, alongside types), so the condition must become `(searchActive || hasStockFilter || onShoppingListFilter) && visibleCount === 0 && parts.length > 0` for `noResultsContent`, and `parts.length === 0` for `emptyContent`. This ensures "No parts found" message appears when filters/search reduce results to zero, but "No parts yet" appears when database is empty.

---

- **Question:** Should `filteredCount` in instrumentation metadata represent (a) total filtered count including search + filters, or (b) only search-filtered count, with separate `filterCounts.afterFilters` for the final count?
- **Why it matters:** Plan proposes adding `filterCounts: { beforeFilters: number, afterFilters: number }` at line 175-178, but existing metadata already has `filteredCount` at line 172. This creates ambiguity: when search term and filters are both active, what does `filteredCount` represent? The plan at line 285 says `filteredCount = visibleCount < totalCount ? visibleCount : undefined`, which would be the final count after all filtering. But then `filterCounts.afterFilters` would duplicate this value. Is the intent to show: `totalCount` (all parts) → `beforeFilters` (after search) → `afterFilters` (after filters) → `filteredCount` (same as `afterFilters`)? Or should `filteredCount` remain as-is (representing search filtering only) and `filterCounts` show filter-specific impact?
- **Needed answer:** Clarify metadata structure. Recommended: keep `filteredCount` as final visible count (current behavior), remove `filterCounts` object to avoid duplication, and add `activeFilters: string[]` only (plan already proposes this at line 174). Tests can infer filter impact by comparing `filteredCount` to `totalCount` and checking `activeFilters` array. This is simpler and avoids confusion.

**Research performed:** Current `part-list.tsx:106-109` shows `filteredCount = filteredParts.length < parts.length ? filteredParts.length : undefined`, which is the final visible count. The `searchActive` flag at line 109 controls whether summary text shows "X of Y showing" or just "X parts". Adding filters introduces a second "active filtering" signal. Simplest solution: replace `searchActive` with `filtersOrSearchActive = searchActive || hasStockFilter || onShoppingListFilter`, use that for summary text decision, and keep `filteredCount` as final count. No need for `filterCounts` object—tests waiting on instrumentation can already see `totalCount` and `filteredCount` to calculate filter impact.

---

- **Question:** Should filter buttons be disabled or show loading state while shopping list membership query is pending?
- **Why it matters:** Plan notes at line 318-322 that `useShoppingListMembershipIndicators` query loads in parallel with parts data, and filter logic at line 331 handles missing map entries gracefully (returns undefined, excludes parts). But if user clicks "On Shopping List" filter before membership data loads, the filter will show zero results temporarily, then update when data arrives. This could be confusing.
- **Needed answer:** Acceptable to show zero results temporarily (graceful degradation, no crash), or should "On Shopping List" button be disabled with tooltip "Loading..." until `shoppingIndicators.isLoading` is false? Plan section 12 (UX Impact) and section 15 (Risks) should address this. Recommended: accept temporary zero results for simplicity, but add a note in section 8 (Errors & Edge Cases) documenting the transient empty state during shopping list query load.

**Research performed:** `src/hooks/use-part-shopping-list-memberships.ts:245-316` shows `useShoppingListMembershipIndicators` returns `isLoading`, `isError`, and `summaryByPartKey` map. The hook calls multiple queries (list shopping lists, fetch all lines) so load time could be non-trivial. However, plan correctly notes at line 331 that filter logic guards with `?.hasActiveMembership === true`, so undefined entries safely exclude parts. Transient empty state is acceptable—no crashes, and list updates when data arrives. Plan should document this in section 8 but no code change needed.

## 4) Deterministic Playwright Coverage (new/changed behavior only)

**Filter Button Rendering and Toggle Interaction**

- **Behavior:** Parts list page filter buttons (plan:502-515)
- **Scenarios:**
  - Given user navigates to parts list, When page loads, Then "In Stock" and "On Shopping List" filter buttons are visible with outline style (inactive) ✅
  - Given filter button is inactive, When user clicks "In Stock" button, Then button changes to filled style (active), URL updates to include `?hasStock=true`, and list shows only parts with `total_quantity > 0` ✅
  - Given "In Stock" filter is active, When user clicks button again, Then button returns to outline style (inactive), URL updates to remove `hasStock` param, and list shows all parts (respecting search term if present) ✅
  - Given "In Stock" filter is active, When user clicks "On Shopping List" button, Then both buttons show filled style, URL includes both params (`?hasStock=true&onShoppingList=true`), and list shows parts matching both criteria ✅
- **Instrumentation:** Locators `page.getByTestId('parts.list.filter.hasStock')`, `page.getByTestId('parts.list.filter.onShoppingList')` (plan:510-511); URL assertions `await expect(page).toHaveURL(/hasStock=true/)` (plan:511); `waitForListLoading(page, 'parts.list', 'ready')` with metadata including `activeFilters` array (plan:512).
- **Backend hooks:** No new backend helpers needed—filter operates on already-loaded part data.
- **Gaps:** None identified in plan.
- **Evidence:** plan:502-514, plan:387-397

**Stock Filter Correctness**

- **Behavior:** Parts list filtered results showing only in-stock parts (plan:516-528)
- **Scenarios:**
  - Given parts with varying stock levels (some with `total_quantity > 0`, some with `total_quantity === 0`), When user activates "In Stock" filter, Then list shows only parts with `total_quantity > 0`, and counts summary shows "X of Y parts showing" ✅
  - Given "In Stock" filter is active with mixed stock parts, When user enters search term matching only out-of-stock parts, Then list shows zero results (filters are ANDed with search) ✅
- **Instrumentation:** Factory helpers `testData.parts.create({ overrides: { total_quantity: 0 } })` and `testData.parts.create({ overrides: { total_quantity: 10 } })` (plan:523); Backend API `apiClient.POST('/api/inventory/parts/{part_key}/stock', ...)` to create stock records (plan:524); Locators `parts.cardByKey(partKey)` to verify presence/absence (plan:525); Summary assertion `await parts.expectSummaryText(/\d+ of \d+ parts showing/i)` (plan:526).
- **Backend hooks:** Use existing `POST /api/inventory/parts/{part_key}/stock` endpoint to create stock records (evidence: `tests/e2e/parts/part-list.spec.ts:42-45` shows this pattern in use).
- **Gaps:** None.
- **Evidence:** plan:516-528

**Shopping List Filter Correctness**

- **Behavior:** Parts list filtered results showing only parts on active shopping lists (plan:530-541)
- **Scenarios:**
  - Given parts with and without active shopping list memberships, When user activates "On Shopping List" filter, Then list shows only parts appearing on ready or concept shopping lists (not done lists), and counts summary updates accordingly ✅
  - Given "On Shopping List" filter is active, When user activates "In Stock" filter, Then list shows only parts that are both on shopping lists AND have stock ✅
- **Instrumentation:** Factory helpers `testData.shoppingLists.create()` and `testData.shoppingLists.createLine(listId, { partKey, needed })` (plan:537); Membership verification by asserting visible parts have shopping list indicator icons (plan:538); List loading metadata assertion on `activeFilters` includes `'onShoppingList'` (plan:539).
- **Backend hooks:** Use existing shopping list and line creation factories (evidence: `tests/e2e/parts/part-list.spec.ts:122-176` shows shopping list membership test pattern).
- **Gaps:** None.
- **Evidence:** plan:530-541

**Combined Filters with Search**

- **Behavior:** Parts list with search term + both filters active (plan:543-556)
- **Scenarios:**
  - Given parts with various stock levels, shopping list memberships, and descriptions, When user activates both filters and enters search term, Then list shows only parts matching search term AND having stock AND appearing on shopping lists ✅
  - Given all filters active with zero matches, When filters reduce results to empty, Then show "No parts found" empty state and counts show "0 of X parts showing" ✅
- **Instrumentation:** Seed diverse part data with factory overrides (plan:550); Apply search via `parts.search(term)` (plan:551); Click filter buttons via page object helpers (plan:552); Assert final visible count and summary text (plan:553).
- **Backend hooks:** No new helpers needed—combines existing patterns.
- **Gaps:** None.
- **Evidence:** plan:543-555

**Filter State Persistence Across Navigation**

- **Behavior:** Parts list filter state during navigation to detail and back (plan:557-568)
- **Scenarios:**
  - Given user activates "In Stock" filter, When user clicks part card to view detail and then navigates back, Then filter remains active, URL includes `hasStock=true`, and list shows filtered results ✅
  - Given user activates both filters, When user navigates to part detail and back via browser back button, Then both filters remain active ✅
- **Instrumentation:** Activate filters (plan:564), navigate to detail via `parts.openCardByKey(partKey)` (plan:564), use `page.goBack()` to return (plan:565), assert URL params and filter button styles (plan:566).
- **Backend hooks:** No new helpers needed.
- **Gaps:** **Minor gap** — Plan defers implementation to Slice 6 (plan:625-631) and notes at line 371 that `handleSelectPart` needs updating to preserve search params, but doesn't specify exact pattern. Should clarify in plan section 5 or 14 whether to use `search: (prev) => prev` (blanket preservation) or explicit field passing like kits route `search: () => ({ search, hasStock, onShoppingList })`. Tests will fail if Slice 6 implementation doesn't match test expectations.
- **Evidence:** plan:557-568, plan:625-631

**Page Object Extensions**

- **Behavior:** Extend `tests/support/page-objects/parts-page.ts` with filter helpers (plan:570-578)
- **Scenarios:**
  - Add locators: `hasStockFilterButton`, `onShoppingListFilterButton` (plan:574)
  - Add methods: `async activateStockFilter()`, `async deactivateStockFilter()`, `async activateShoppingListFilter()`, `async deactivateShoppingListFilter()`, `async expectFilterActive(filterName)`, `async expectFilterInactive(filterName)` (plan:575)
- **Instrumentation:** Use `getByTestId` for button locators, check button `data-state` attribute or variant class for active/inactive state (plan:576).
- **Backend hooks:** Not applicable—page object helpers only.
- **Gaps:** None.
- **Evidence:** plan:570-578

**Overall Coverage Assessment:** Plan provides comprehensive scenario coverage for all new behaviors: filter toggle, individual filter correctness, combined filtering, empty states, and navigation persistence. All scenarios include concrete instrumentation (testid selectors, event waits, URL assertions) and backend setup via factories. Only minor gap is navigation preservation pattern ambiguity (noted above).

## 5) Adversarial Sweep (must find ≥3 credible issues or declare why none exist)

**Major — Empty State Condition Not Fully Specified**

**Evidence:** plan:274-280, plan:334-340 — Plan states at line 279 "Try adjusting your search terms or create a new part" for `noResultsContent`, and at line 339 notes "Will need to adjust condition to show this state when filters are active too (not just search)". Current code at `src/components/parts/part-list.tsx:274-280` shows `noResultsContent` is conditional, but plan doesn't specify the updated condition.

**Why it matters:** Without clarifying the trigger logic, implementer could:
1. Forget to update the condition, causing filters to show wrong empty state (generic "No parts yet" instead of "No parts found")
2. Use inconsistent logic (e.g., trigger on filters but not search, or vice versa)
3. Create infinite loop if condition references derived state incorrectly

Current code likely uses a prop or local `showNoResults` flag based on `searchActive`. Plan must define: `const filtersOrSearchActive = searchActive || hasStockFilter || onShoppingListFilter; const showNoResults = filtersOrSearchActive && visibleCount === 0 && parts.length > 0; const showEmpty = parts.length === 0 && !partsLoading;`. Then render `noResultsContent` when `showNoResults` is true, `emptyContent` when `showEmpty` is true.

**Fix suggestion:** Add to section 5 (Algorithms & UI Flows) or section 12 (UX Impact):

```
### Empty State Selection Logic

- Flow: Determine which empty state to render based on data availability and filtering activity
- Steps:
  1. Calculate `filtersOrSearchActive = searchActive || hasStockFilter || onShoppingListFilter`
  2. If `parts.length === 0` (no parts in database), render `emptyContent` ("No parts yet" with CTA)
  3. Else if `filtersOrSearchActive && visibleCount === 0` (filtering yielded no results), render `noResultsContent` ("No parts found")
  4. Else if `visibleCount > 0`, render `listContent`
- Evidence: Current logic at `src/components/parts/part-list.tsx:257-280` uses `searchActive` flag. Extend to include filter flags.
```

**Confidence:** High — This is a deterministic UI condition that must be correct for proper user feedback. Current plan leaves it ambiguous.

---

**Major — Instrumentation Metadata Structure Has Redundancy**

**Evidence:** plan:162-183, plan:289-296 — Plan proposes adding both `filteredCount` (line 172) and `filterCounts: { beforeFilters: number, afterFilters: number }` (lines 175-178) to instrumentation metadata. At line 285, plan states `filteredCount = visibleCount < totalCount ? visibleCount : undefined`, which makes `filteredCount` the final count after search + filters. Then `filterCounts.afterFilters` would equal `filteredCount` (or `visibleCount`), creating duplication.

**Why it matters:** Redundant metadata fields confuse test authors and increase maintenance burden. Tests asserting on `filteredCount` vs `filterCounts.afterFilters` may produce inconsistent expectations. Additionally, `beforeFilters` is ambiguous: does it mean before filter buttons are applied (but after search), or before all filtering (raw `parts.length`)? If the former, then:
- `totalCount = parts.length` (all parts from API)
- `beforeFilters = searchFilteredParts.length` (after search, before filter buttons)
- `afterFilters = visibleCount` (after search + filters)
- `filteredCount = visibleCount < totalCount ? visibleCount : undefined` (same as `afterFilters`)

This creates confusion. Simpler structure: `totalCount`, `visibleCount`, `filteredCount` (optional, only if filtered), and `activeFilters: string[]`. Tests can derive filter impact by comparing counts and checking which filters are active.

**Fix suggestion:** Revise section 3 (Data Model / Contracts) instrumentation metadata shape (lines 162-183):

```typescript
{
  status: 'success',
  queries: { parts: 'success', types: 'success' },
  counts: { parts: number, types: number },
  totalCount: number,
  visibleCount: number,
  filteredCount?: number,        // Present if visibleCount < totalCount (any filtering active)
  searchTerm: string | null,
  activeFilters: string[],       // e.g., ['hasStock', 'onShoppingList'], or []
}
```

Remove `filterCounts` object entirely. Update section 6 (Derived State & Invariants) at lines 289-296 to remove `filterCounts` entry. This simplifies metadata and eliminates ambiguity.

**Confidence:** High — Metadata structure is part of the test contract and must be clear.

---

**Major — Navigation Search Preservation Pattern Not Specified**

**Evidence:** plan:366-372, plan:483-490, plan:625-631 — Plan identifies at line 369-371 that detail page navigation should preserve search params and defers fix to Slice 6, but doesn't specify the implementation pattern. Current `handleSelectPart` at `src/routes/parts/index.tsx:19-21` is:

```typescript
const handleSelectPart = (partId: string) => {
  navigate({ to: '/parts/$partId', params: { partId } });
};
```

Plan must specify whether to use:

**Option A:** `search: (prev) => prev` (preserves all search params automatically)
```typescript
const handleSelectPart = (partId: string) => {
  navigate({ to: '/parts/$partId', params: { partId }, search: (prev) => prev });
};
```

**Option B:** Explicit field preservation (like kits route at line 58-59)
```typescript
const handleSelectPart = (partId: string) => {
  const { search, hasStock, onShoppingList } = searchState;
  navigate({
    to: '/parts/$partId',
    params: { partId },
    search: () => ({ search, hasStock, onShoppingList }),
  });
};
```

**Why it matters:** Playwright test at plan:557-568 expects filter state to persist when navigating to detail and back. If implementer uses Option A, all params preserve automatically (simpler). If they use Option B, they must remember to include new filter params explicitly (error-prone if more filters added later). Additionally, if detail route doesn't accept these search params in its own `validateSearch`, they may be silently dropped.

**Fix suggestion:** Add to section 5 (Algorithms & UI Flows) under "URL Parameter Persistence Flow" or create new subsection:

```
### Part Detail Navigation Preservation

- Flow: Preserve filter state when navigating from list to detail
- Steps:
  1. User clicks part card or selection handler
  2. `handleSelectPart` in route component calls `navigate({ to: '/parts/$partId', params: { partId }, search: (prev) => prev })`
  3. TanStack Router preserves all search params (`search`, `hasStock`, `onShoppingList`) in URL
  4. Browser back button returns to list with full search state intact
- Pattern choice: Use `search: (prev) => prev` (Option A) for automatic preservation, avoiding need to enumerate fields
- Evidence: `src/routes/kits/index.tsx:54-62` shows both patterns in use; prefer Option A for maintainability
```

Also update Slice 6 description (plan:625-631) to specify this pattern explicitly.

**Confidence:** High — Navigation preservation is critical for UX and tested in Playwright. Ambiguity here leads to implementation churn.

---

**Minor — Shopping List Membership Query Timing Not Addressed in UX Section**

**Evidence:** plan:315-322, plan:326-332, plan:634-647 — Plan correctly identifies in section 7 (line 318-322) that shopping list membership query loads in parallel and filter logic guards against missing data. Section 8 (line 326-332) notes that filter shows zero results if query fails or data is missing. Section 15 (Risks) doesn't list this as a risk, but section 12 (UX Impact) doesn't document the transient empty state during load.

**Why it matters:** If `useShoppingListMembershipIndicators` query takes 500ms to load, and user immediately clicks "On Shopping List" filter, the list will show zero parts for 500ms (because `summaryByPartKey` is empty or undefined during load), then populate when data arrives. This could be perceived as a bug or flicker. While plan correctly guards against crashes (line 331), it doesn't address whether this transient empty state is acceptable UX or needs mitigation (e.g., disable "On Shopping List" button until `!shoppingIndicators.isLoading`).

**Fix suggestion:** Add to section 8 (Errors & Edge Cases):

```
### Shopping List Filter Activated During Data Load

- Failure: User clicks "On Shopping List" filter before `useShoppingListMembershipIndicators` query completes
- Surface: Parts list content area
- Handling: List temporarily shows zero results (because `summaryByPartKey` is empty), then updates when query resolves. Counts summary shows "0 of X parts showing" briefly. No error message, no crash.
- Guardrails: Filter logic guards with `?.hasActiveMembership === true` so undefined entries safely exclude parts. List re-renders automatically when query completes due to TanStack Query reactivity.
- Acceptable degradation: Transient empty state lasts <500ms in typical network conditions. User can deactivate filter immediately if confused. Alternative mitigation (disable button during load) adds complexity without significant UX benefit.
- Evidence: `src/hooks/use-part-shopping-list-memberships.ts:245-316` shows query lifecycle. Plan section 7 (lines 315-322) documents coordination.
```

**Confidence:** Medium — This is a minor UX edge case unlikely to cause real issues, but worth documenting for completeness.

---

**Minor — `filteredCount` Display Logic May Show Confusing Summary Text**

**Evidence:** plan:276-287, plan:407-414 — Plan states at line 285 `filteredCount = visibleCount < totalCount ? visibleCount : undefined` (only set when filtering reduces count), and at line 222 "Counts summary shows 'X of Y parts showing'". At line 109, current code checks `searchActive` to decide summary text format. Plan proposes keeping this pattern but doesn't clarify what happens when only filters are active (no search term).

**Why it matters:** If user activates "In Stock" filter with no search term:
- `searchActive = false` (no search term entered)
- `hasStockFilter = true`
- `visibleCount < totalCount` (filter reduced count)
- Current code: `filteredCount` would be set, but summary text decision depends on `searchActive` only

Does summary show "X parts" (because `searchActive` is false) or "X of Y parts showing" (because `filteredCount` is present)? Plan says at line 222 summary "updates to reflect filtered results" and at line 478 "Counts summary updates to show 'X of Y parts showing' when filters are active", but doesn't specify whether `ListScreenCounts` component key is `searchActive` or `filteredCount !== undefined`.

**Fix suggestion:** Clarify in section 5 or 12:

```
### Counts Summary Display Logic

Current `ListScreenCounts` component (at `src/components/layout/list-screen-counts.tsx`) displays:
- "X parts" when no filtering active (full list shown)
- "X of Y parts showing" when filtering reduces count

Trigger condition for "X of Y" format: `filteredCount !== undefined` (rather than `searchActive`). This ensures both search term and filter buttons trigger filtered display.

Update logic:
1. Calculate `filtersOrSearchActive = searchActive || hasStockFilter || onShoppingListFilter`
2. Set `filteredCount = filtersOrSearchActive && visibleCount < totalCount ? visibleCount : undefined`
3. Pass `filteredCount` to `ListScreenCounts` component
4. Component renders "X of Y" when `filteredCount` is present, "X" otherwise

Evidence: `src/components/parts/part-list.tsx:212-227` shows `ListScreenCounts` usage.
```

This ensures filter buttons trigger the same "X of Y showing" display as search.

**Confidence:** Medium — This is likely implementer-obvious, but explicit statement prevents confusion.

---

**Checks attempted but no issues found:**

- **TanStack Query cache invalidation risk:** Checked whether filter changes could trigger unintended query invalidation or refetch. Plan correctly notes at line 310-314 "Filters do not invalidate or refetch queries. All filtering is client-side on cached data." No risk identified.

- **React concurrency/suspense gotchas:** Checked whether `useMemo` dependencies could cause stale closures or tearing. Plan correctly lists all dependencies at line 429 (`parts`, `searchTerm`, `typeMap`, `hasStockFilter`, `onShoppingListFilter`, `shoppingIndicatorMap`). All are stable references or primitives. No risk.

- **Button focus/keyboard accessibility:** Checked whether filter buttons maintain focus after toggle. Plan references Button component a11y features at line 493-497 (focus-visible ring, native button element). No additional handling needed—React rerenders with updated props, focus remains on clicked button.

- **Route search param type coercion edge cases:** Checked whether malformed boolean params like `?hasStock=` or `?hasStock=truee` would break. Plan notes at line 360-364 that `validateSearch` normalizes and coerces params, with fallback to `undefined` for invalid values. Pattern at `src/routes/kits/index.tsx:14-16` shows precedent. No risk if implemented consistently.

- **Multiple rapid filter toggles causing race conditions:** Checked whether clicking filter button rapidly could cause URL/state drift. Plan addresses at line 349-356: `navigate({ replace: true })` replaces current history entry, last state wins, no route transition errors expected. React event batching handles this. No risk.

## 6) Derived-Value & State Invariants (table)

**Derived value: `filteredParts`**
- **Source dataset:** Unfiltered `parts` from `useGetPartsWithLocations()`, filtered by `searchTerm` (string), `hasStockFilter` (boolean), `onShoppingListFilter` (boolean), `shoppingIndicatorMap` (Map from `useShoppingListMembershipIndicators`), and `typeMap` (Map from `useGetTypes`)
- **Write / cleanup triggered:** None — purely derived for rendering via `useMemo`. No cache mutations, no side effects, no persistent storage writes.
- **Guards:** (1) Search term defaults to empty string if undefined (line 84 of part-list.tsx). (2) Shopping list lookup guards with `?.hasActiveMembership === true` to handle undefined map entries (plan:261). (3) Stock filter checks `part.total_quantity > 0` (numeric comparison, safe for 0 and negative values, plan:262).
- **Invariant:** `filteredParts.length <= parts.length` always holds. Visible count never exceeds total count. Filters only remove items, never add. Each filter is a pure predicate returning boolean; chaining multiple filters can only reduce or maintain count, never increase.
- **Evidence:** plan:252-266, plan:83-99 (current code), plan:151-160 (proposed extension)

**Derived value: Filter button `variant` prop**
- **Source dataset:** `hasStockFilter` and `onShoppingListFilter` booleans from route search params (`Route.useSearch()`)
- **Write / cleanup triggered:** None — directly maps boolean to variant string for Button component render. No persistent state, no cache writes.
- **Guards:** Default to `variant="outline"` (inactive appearance) if prop is `undefined` or `false`. Use `variant="default"` (filled appearance) if prop is `true`.
- **Invariant:** Button visual state always matches route search param state. No local UI state drift. Single source of truth (URL search params) ensures consistency across renders and navigation events.
- **Evidence:** plan:267-275

**Derived value: `totalCount`, `visibleCount`, `filteredCount` for display**
- **Source dataset:** `parts` array from API (unfiltered), `filteredParts` array (after search + filters)
- **Write / cleanup triggered:** None — purely derived for display in `ListScreenCounts` component and instrumentation metadata. No persistent writes, no cache mutations.
- **Guards:** `filteredCount` is optional; only set when filtering reduces visible count (`filteredCount = visibleCount < totalCount ? visibleCount : undefined`, plan:282). This prevents showing "X of X showing" (redundant) when all parts are visible.
- **Invariant:** `visibleCount <= totalCount` always holds (cannot show more parts than exist). If no filters or search active, `filteredCount` is `undefined` and summary shows "X parts" instead of "X of Y showing". If `visibleCount === 0` and `parts.length > 0`, must show appropriate empty state (handled by separate condition).
- **Evidence:** plan:276-287, current code at `src/components/parts/part-list.tsx:106-109`, plan:212-227 (summary rendering)

**Derived value: `activeFilters` string array for instrumentation**
- **Source dataset:** `hasStockFilter` and `onShoppingListFilter` booleans from route search params
- **Write / cleanup triggered:** Built inline in `getReadyMetadata` callback passed to `useListLoadingInstrumentation`. No persistent state, no cache writes. Metadata is emitted as test event payload but not stored.
- **Guards:** Only includes filter names where corresponding boolean is `true`. Array construction is pure: `const activeFilters = []; if (hasStockFilter) activeFilters.push('hasStock'); if (onShoppingListFilter) activeFilters.push('onShoppingList');`.
- **Invariant:** Array contains 0, 1, or 2 strings: `[]` (no filters), `['hasStock']`, `['onShoppingList']`, or `['hasStock', 'onShoppingList']`. Order is deterministic (stock before shopping list). Tests can assert exact array contents.
- **Evidence:** plan:289-296, plan:374-386

**Derived value: `filtersOrSearchActive` (proposed, see issue above)**
- **Source dataset:** `searchActive` boolean (current code line 109), `hasStockFilter` boolean, `onShoppingListFilter` boolean
- **Write / cleanup triggered:** None — derived flag used to decide empty state display (`noResultsContent` vs `emptyContent`) and summary text format. No writes, no side effects.
- **Guards:** Simple boolean OR: `filtersOrSearchActive = searchActive || hasStockFilter || onShoppingListFilter`. Always defined (never undefined).
- **Invariant:** `filtersOrSearchActive` is true if any filtering mechanism is active (search term, stock filter, shopping list filter). Used to trigger "No parts found" message when `visibleCount === 0`. Ensures consistent empty state handling across search and filters.
- **Evidence:** plan:334-340 identifies need for this flag (empty state condition adjustment). Current code uses `searchActive` only; plan proposes extending.

**Summary:** All derived values are read-only, side-effect-free, and properly guarded. No filtered views drive persistent writes (major risk avoided). State invariants are simple and testable: counts never invert (visible ≤ total), filter buttons reflect URL params exactly, and empty state selection is deterministic based on data availability and filtering activity.

## 7) Risks & Mitigations (top 3)

**Risk:** Large part inventories (>1000 parts) may cause noticeable lag when toggling filters due to multiple array iterations in `useMemo` (search filter pass, then stock filter pass, then shopping list filter pass, then sort).

**Mitigation:** `useMemo` dependencies ensure recalculation only when necessary (plan:429). If performance issue arises during implementation, optimize with single-pass filter combining all predicates in one iteration:

```typescript
const filteredParts = useMemo(() => {
  const term = searchTerm.trim().toLowerCase();
  return parts.filter(part => {
    // Apply search filter
    if (term && ![displayId, displayDescription, ...].some(field => field.includes(term))) return false;
    // Apply stock filter
    if (hasStockFilter && part.total_quantity <= 0) return false;
    // Apply shopping list filter
    if (onShoppingListFilter && !shoppingIndicatorMap.get(part.key)?.hasActiveMembership) return false;
    return true;
  });
}, [parts, searchTerm, hasStockFilter, onShoppingListFilter, shoppingIndicatorMap, typeMap]);
```

This reduces from O(3n) worst case to O(n). Test with large dataset seeded via factory loop (e.g., 2000 parts) to establish baseline. Accept minor lag (<200ms) as acceptable for client-side filtering—most inventories have <500 parts.

**Evidence:** plan:638-643, plan:426-433

---

**Risk:** Filter state not preserved during part detail navigation if `handleSelectPart` doesn't pass search params, causing user confusion when back button returns to unfiltered list.

**Mitigation:** Explicitly update `handleSelectPart` in `src/routes/parts/index.tsx` to preserve search state using `search: (prev) => prev` pattern (see Major issue #3 above). Add Playwright test scenario (already planned at plan:557-568) to catch regression. Implement in Slice 6 before final delivery.

**Evidence:** plan:366-372, plan:483-490, plan:625-631

---

**Risk:** Shopping list membership query fails or is slow, causing "On Shopping List" filter to show incorrect or empty results temporarily, confusing users.

**Mitigation:** Filter logic guards with `?.hasActiveMembership === true` (plan:261, plan:331), so undefined or missing entries safely exclude parts—no crashes. If query fails, filter shows zero results (plan:326-332), which is acceptable degradation (user sees empty list, can deactivate filter, error handling for shopping list query is separate). If query is slow (>500ms), list shows transient empty state then populates when data arrives (React Query reactivity). Document this behavior in error/edge case section (see Minor issue #4 above). No code change needed—graceful degradation is sufficient.

**Evidence:** plan:315-322, plan:326-332, plan:634-643

## 8) Confidence

**Confidence: High** — The plan is thorough, well-researched, and low-risk. Feature leverages proven patterns (route search params, client-side filtering, existing Button and instrumentation components) with no new API dependencies or complex async coordination. The primary concerns raised in this review are specification gaps (empty state condition, metadata structure, navigation preservation pattern) rather than architectural flaws. Once these are clarified with explicit logic statements in sections 5, 6, and 14, the plan becomes fully implementable without guesswork. Test coverage is comprehensive and follows established Playwright patterns. Risk profile is minimal—main gotcha is performance with very large datasets, which is testable and easily mitigatable if needed.
