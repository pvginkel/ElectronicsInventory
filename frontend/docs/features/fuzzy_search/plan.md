# Fuzzy Search on All Search Boxes -- Technical Plan

## 0) Research Log & Findings

**Searched areas:**

- `docs/features/fuzzy_search/change_brief.md` -- algorithm specification and integration points.
- `docs/contribute/architecture/application_overview.md` -- stack overview (React 19, TanStack Router/Query, generated API hooks, domain-driven folders).
- `docs/contribute/testing/index.md` -- testing philosophy (real backend, API-first data setup, no mocks, instrumentation-driven waits).
- `src/lib/utils/` -- existing pure utility functions; no fuzzy/search utilities exist today.
- All six list screens and four dropdown selectors listed below.
- `../backend/app/data/test_data/parts.json` -- 1199-line file with representative electronics parts including keys, descriptions, manufacturer codes, types, tags, and sellers.
- `package.json` -- no Vitest dependency currently installed; only Playwright for E2E tests.
- Existing Playwright specs under `tests/e2e/` -- search tests exist for parts (`part-list.spec.ts`), but no dedicated fuzzy-search specs.

**Key findings:**

1. **Uniform substring pattern.** Every list screen and selector currently uses the same pattern: `term.toLowerCase(); ... .includes(term)`. Replacing this with a single `fuzzyMatch()` call is mechanically straightforward.

2. **Kits search is server-side.** `kit-overview-list.tsx` delegates search to the backend via `useKitsOverview(searchTerm)`, which passes the term as a query parameter to `useGetKits`. All other screens filter client-side. To apply fuzzy search to kits, the plan must shift kits to client-side filtering (fetch all kits regardless of search term, then filter locally). The alternative -- keeping the backend search and layering client-side fuzzy on top -- would produce confusing results since the backend substring match would pre-filter before fuzzy matching can run.

3. **Parts selector uses pre-built search tokens.** `use-parts-selector.ts` builds a `searchTokens[]` array per part. This will be replaced with a `data` array for `fuzzyMatch()`.

4. **No Vitest in project.** The project has no unit-test runner. The plan specifies adding Vitest as a dev dependency so the fuzzy algorithm can be validated with fast, isolated unit tests using real part data from `parts.json`.

5. **No conflicts.** No in-flight features touch the filter logic in these files.

---

## 1) Intent & Scope

**User intent**

Replace the exact substring matching currently used in every search box across the application with a fuzzy search algorithm that tolerates typos and diacritics, improving the user experience when searching for electronics parts, sellers, types, shopping lists, kits, and boxes.

**Prompt quotes**

- "Implement a fuzzy search algorithm and apply it to all search boxes in the application"
- "fuzzy search matching function that takes `data: Array<{term: string, type: 'literal' | 'text'}>` and `query: string` and returns `boolean`"
- "AND combinator: all query tokens must match at least one data token from any term"
- "Literal terms: prefix match"
- "Fuzzy terms: prefix-Levenshtein"
- "Levenshtein distance threshold derived from query token length, experimentally validated"

**In scope**

- New `fuzzyMatch()` utility with normalize, tokenize, Levenshtein distance, and threshold logic.
- Unit tests (Vitest) covering the algorithm against representative data from `parts.json`.
- Integration into all six list screens: parts, sellers, types, shopping lists, kits, boxes.
- Integration into all four dropdown selectors: part-selector, seller-selector, type-selector, shopping-list-selector.
- Shifting kits from server-side search to client-side fuzzy filtering.

**Out of scope**

- Backend search changes (the kits endpoint search parameter will simply no longer be sent by the frontend).
- Ranked/sorted results by match quality (binary match only).
- Per-field weighting or boosting.
- Changes to `DebouncedSearchInput` or `SearchableSelect` components themselves (only the filter callbacks change).

**Assumptions / constraints**

- The parts test data at `../backend/app/data/test_data/parts.json` is representative enough to experimentally validate Levenshtein thresholds.
- Vitest will be added as a dev dependency; the project currently has no unit-test runner.
- Kits datasets are small enough for client-side filtering (same assumption already made for parts, sellers, types, boxes, and shopping lists).
- The `useKitsOverview` hook currently fetches both active and archived kits; removing the server-side `query` parameter will return all kits of each status, which is the desired behavior for client-side fuzzy filtering.

---

## 1a) User Requirements Checklist

**User Requirements Checklist**

- [ ] Create a fuzzy search matching function that takes `data: Array<{term: string, type: 'literal' | 'text'}>` and `query: string` and returns `boolean`
- [ ] Normalize: lowercase + strip diacritics via `String.normalize('NFD')` + remove combining marks regex
- [ ] Tokenize both query and data terms by matching `\S+` (non-whitespace), removing empties
- [ ] AND combinator: all query tokens must match at least one data token from any term
- [ ] Literal terms: prefix match -- data token starts with query token (after normalization)
- [ ] Fuzzy terms: prefix-Levenshtein -- take `data_token.slice(0, query_token.length)` from data, compute Levenshtein distance
- [ ] When data token is shorter than query token, compare full query token against full data token (do NOT truncate the query token)
- [ ] Levenshtein distance threshold derived from query token length, experimentally validated against representative test data from `../backend/app/data/test_data/parts.json`
- [ ] Apply fuzzy search to ALL list screens: parts, sellers, types, shopping lists, kits, boxes
- [ ] Apply fuzzy search to ALL dropdown selectors: part-selector, seller-selector, type-selector, shopping-list-selector
- [ ] Case-insensitive matching
- [ ] Diacritics removal using `String.normalize('NFD')`

---

## 2) Affected Areas & File Map

### New files

- Area: `src/lib/utils/fuzzy-search.ts`
- Why: Houses the `fuzzyMatch()` function, `normalize()` helper, `levenshteinDistance()` function, and `getThreshold()` mapping.
- Evidence: No existing fuzzy search utility in `src/lib/utils/` (only `parts.ts`, `debounce.ts`, etc.).

- Area: `src/lib/utils/__tests__/fuzzy-search.test.ts`
- Why: Unit tests for the fuzzy search algorithm using Vitest, validated against `parts.json` data.
- Evidence: No `__tests__/` directory or `.test.ts` files currently exist under `src/`.

- Area: `vitest.config.ts` (project root)
- Why: Configure Vitest for the project since no unit-test runner exists.
- Evidence: `package.json` has no vitest dependency; `vite.config.ts` has no test configuration.

### Modified files -- List screens

- Area: `src/components/parts/part-list.tsx`
- Why: Replace inline substring filter (lines 155-172) with `fuzzyMatch()` call.
- Evidence: `src/components/parts/part-list.tsx:157-172` -- six `.includes(term)` checks across displayId, displayDescription, manufacturerCode, manufacturer, sellerName, typeName, and tags.

- Area: `src/components/sellers/seller-list.tsx`
- Why: Replace inline substring filter (lines 65-76) with `fuzzyMatch()` call.
- Evidence: `src/components/sellers/seller-list.tsx:70-74` -- `name.includes(term) || website.includes(term)`.

- Area: `src/components/types/type-list.tsx`
- Why: Replace inline substring filter (lines 74-81) with `fuzzyMatch()` call.
- Evidence: `src/components/types/type-list.tsx:80` -- `type.name.toLowerCase().includes(term)`.

- Area: `src/components/shopping-lists/overview-list.tsx`
- Why: Replace inline substring filter (lines 89-100) with `fuzzyMatch()` call.
- Evidence: `src/components/shopping-lists/overview-list.tsx:94-98` -- `matchesName || matchesDescription || matchesSeller`.

- Area: `src/components/kits/kit-overview-list.tsx`
- Why: Add client-side fuzzy filtering; the component currently delegates search to the backend.
- Evidence: `src/components/kits/kit-overview-list.tsx:35` -- `useKitsOverview(searchTerm)` passes search to backend query param.

- Area: `src/hooks/use-kits.ts`
- Why: Stop sending search term to backend; return all kits for client-side filtering.
- Evidence: `src/hooks/use-kits.ts:13-22` -- `createKitsQueryParams` adds `query.query = trimmed` when search term is present.

- Area: `src/components/boxes/box-list.tsx`
- Why: Replace inline substring filter (lines 48-59) with `fuzzyMatch()` call.
- Evidence: `src/components/boxes/box-list.tsx:54-57` -- `boxNumber.includes(term) || description.includes(term)`.

### Modified files -- Dropdown selectors

- Area: `src/hooks/use-parts-selector.ts`
- Why: Replace `searchTokens`-based substring filter (lines 156-169) with `fuzzyMatch()` call. Remove `buildSearchTokens()` helper.
- Evidence: `src/hooks/use-parts-selector.ts:162-168` -- `option.name.toLowerCase().includes(term)` and `searchTokens.some(token => token.includes(term))`.

- Area: `src/components/sellers/seller-selector.tsx`
- Why: Replace inline substring filter (lines 38-44) with `fuzzyMatch()` call.
- Evidence: `src/components/sellers/seller-selector.tsx:41-43` -- `seller.name.toLowerCase().includes(term)`.

- Area: `src/hooks/use-types.ts`
- Why: Replace substring filter in `useTypesSearch()` (lines 17-35) with `fuzzyMatch()` call.
- Evidence: `src/hooks/use-types.ts:26-28` -- `type.name.toLowerCase().includes(term)`.

- Area: `src/components/shopping-lists/shopping-list-selector.tsx`
- Why: Replace inline substring filter (lines 130-136) with `fuzzyMatch()` call.
- Evidence: `src/components/shopping-lists/shopping-list-selector.tsx:135` -- `option.name.toLowerCase().includes(term)`.

---

## 3) Data Model / Contracts

- Entity / contract: `FuzzySearchData` (new type)
- Shape:
  ```ts
  type FuzzyTermType = 'literal' | 'text';
  interface FuzzySearchTerm {
    term: string;
    type: FuzzyTermType;
  }
  // Function signature:
  function fuzzyMatch(data: FuzzySearchTerm[], query: string): boolean;
  ```
- Mapping: Each call site builds a `FuzzySearchTerm[]` array from its domain model. Part keys and box numbers use `type: 'literal'`. All other text fields (description, name, manufacturer, tags, etc.) use `type: 'text'`.
- Evidence: Change brief specifies `data: Array<{term: string, type: 'literal' | 'text'}>`.

No API contract changes. No TanStack Query cache key changes (except kits, where the search param is removed from the query key).

---

## 4) API / Integration Surface

- Surface: `GET /api/kits` (generated hook: `useGetKits`)
- Inputs: Currently receives `query` parameter with search term. After this change, `query` will no longer be sent.
- Outputs: Returns all kits for the requested status (active/archived). No change in response shape.
- Errors: No change -- existing error handling in `kit-overview-list.tsx` continues to work.
- Evidence: `src/hooks/use-kits.ts:13-22` -- `createKitsQueryParams` builds the query object. After the change, the `query` field will be omitted regardless of search term.

All other screens already fetch full datasets client-side and filter locally. No other API changes.

---

## 5) Algorithms & UI Flows

### Flow: Fuzzy match evaluation

- Flow: `fuzzyMatch(data, query)` -- called from each filter callback
- Steps:
  1. If `query` is empty (whitespace-only after trim), return `true` (all records match).
  2. Normalize `query`: lowercase + strip diacritics via `str.normalize('NFD').replace(/[\u0300-\u036f]/g, '')`.
  3. Tokenize `query` by matching `/\S+/g`, yielding `queryTokens[]`.
  4. For each `data` entry, normalize its `term` and tokenize into `dataTokens[]`.
  5. For each `queryToken`, check if it matches at least one `dataToken` from any data entry:
     - **Literal terms**: `dataToken.startsWith(queryToken)` (prefix match).
     - **Text terms**:
       a. If `dataToken.length >= queryToken.length`: take `prefix = dataToken.slice(0, queryToken.length)`, compute `levenshteinDistance(queryToken, prefix)`.
       b. If `dataToken.length < queryToken.length`: compute `levenshteinDistance(queryToken, dataToken)` (compare full strings, do NOT truncate the query token).
       c. Match if `distance <= getThreshold(queryToken.length)`.
  6. Return `true` only if ALL query tokens matched (AND combinator).
- States / transitions: Pure function, no state. Called inside `useMemo` filter callbacks.
- Hotspots: Levenshtein is O(m*n) per token pair. With typical inventories (hundreds to low thousands of items, few tokens each), this is negligible. No optimization needed unless dataset exceeds ~10k items.
- Evidence: Change brief sections "Algorithm Specification" steps 1-6.

### Flow: Levenshtein distance calculation

- Flow: Classic dynamic-programming Levenshtein distance
- Steps:
  1. Allocate a single-row DP array of size `min(a.length, b.length) + 1`.
  2. Fill using standard insertion/deletion/substitution costs.
  3. Return final cell value.
- States / transitions: Pure function, O(m*n) time, O(min(m,n)) space.
- Hotspots: None for expected input sizes (tokens are typically 1-20 characters).
- Evidence: Standard algorithm; no existing implementation in the codebase.

### Flow: Threshold derivation

- Flow: `getThreshold(queryTokenLength)` maps token length to maximum allowed Levenshtein distance.
- Steps:
  1. Start with formula: `Math.floor(tokenLength / 4)`.
  2. This gives: 1-3 chars = 0 typos, 4-7 chars = 1 typo, 8-11 chars = 2 typos, 12-15 chars = 3 typos.
  3. Validate experimentally against `parts.json` data: simulate common typo queries (e.g., "resisror" for "resistor", "capcitor" for "capacitor") and verify results.
  4. Adjust if false positives or false negatives are excessive.
- States / transitions: Pure function.
- Hotspots: The threshold directly controls precision/recall trade-off.
- Evidence: Change brief: "Threshold: Experiment with the test data set".

### Flow: Kits client-side filtering (new)

- Flow: Kit overview search moves from server-side to client-side
- Steps:
  1. `useKitsOverview` always fetches all kits (no `query` param). The `createKitsQueryParams` function is simplified to never include a `query` field.
  2. `kit-overview-list.tsx` receives **all** kits in `buckets.active` and `buckets.archived` (no longer server-filtered).
  3. `counts` (derived from `buckets.active.length` and `buckets.archived.length` at line 65-68) now reflects the **total** (unfiltered) number of kits per status. This is the desired behavior -- it mirrors how all other list screens compute totals from the full dataset.
  4. A new `useMemo` in `kit-overview-list.tsx` applies `fuzzyMatch()` to the kits for the active tab, producing `filteredActiveKits`. The fuzzy data array is `[{ term: kit.name, type: 'text' }, { term: kit.description ?? '', type: 'text' }]`.
  5. `filteredActiveKits` replaces the current direct use of `activeKits` (which was previously `buckets.active` or `buckets.archived`). All downstream references -- rendering, `ListScreenCounts`, and instrumentation metadata -- use `filteredActiveKits.length` for the `visible` count.
  6. `ListScreenCounts` receives `total={counts[status]}` (unfiltered total) and `filtered={filteredActiveKits.length}` when search is active, matching the pattern used by seller-list, type-list, box-list, etc.
- States / transitions: Same as other list screens. `useMemo` recomputes when `searchTerm` or `buckets` change.
- Hotspots: Kit counts are typically small (tens). No performance concern.
- Note on instrumentation metadata: Currently `useListLoadingInstrumentation` emits `totals: counts` and `visible: activeKits.length`. After migration, `counts` reflects unfiltered totals and `visible` reflects filtered count, aligning with how all other list screens already work. The existing Playwright test at `kits-overview.spec.ts:144-163` asserts on card visibility (not instrumentation counts), so it remains valid.
- Evidence: `src/hooks/use-kits.ts:41-79` and `src/components/kits/kit-overview-list.tsx:35,55,64-88`.

### Flow: Building the `data` array per domain

Each call site constructs the `FuzzySearchTerm[]` array from its domain model:

**Parts list** (and parts selector):
```
[
  { term: displayId, type: 'literal' },
  { term: displayDescription, type: 'text' },
  { term: displayManufacturerCode ?? '', type: 'text' },
  { term: displayManufacturer ?? '', type: 'text' },
  { term: sellerName ?? '', type: 'text' },
  { term: typeName ?? '', type: 'text' },
  ...tags.map(tag => ({ term: tag, type: 'text' })),
]
```

**Sellers list:**
```
[
  { term: seller.name, type: 'text' },
  { term: seller.website ?? '', type: 'text' },
]
```

**Seller selector:**
```
[
  { term: seller.name, type: 'text' },
]
```
Note: The seller selector currently only filters on `name` (not `website`). This plan preserves that behavior. The seller list screen includes `website` in its search, matching its existing substring filter at `seller-list.tsx:70-74`.

**Types list** (and type selector via `useTypesSearch`):
```
[
  { term: type.name, type: 'text' },
]
```

**Shopping lists overview** (and shopping-list selector):
```
[
  { term: list.name, type: 'text' },
  { term: list.description ?? '', type: 'text' },
  { term: list.primarySellerName ?? '', type: 'text' },
]
```

**Kits overview:**
```
[
  { term: kit.name, type: 'text' },
  { term: kit.description ?? '', type: 'text' },
]
```

**Boxes list:**
```
[
  { term: String(box.box_no), type: 'literal' },
  { term: box.description ?? '', type: 'text' },
]
```

---

## 6) Derived State & Invariants

- Derived value: `filteredParts` / `filteredSellers` / `filteredTypes` / etc.
  - Source: Full dataset from TanStack Query cache + current `searchTerm` from URL or local state.
  - Writes / cleanup: Drives `visibleCount`, `filteredCount`, and instrumentation metadata. No persistent writes.
  - Guards: Empty search term returns all records (fuzzyMatch returns `true` when query is empty).
  - Invariant: Filtered set is always a subset of the full dataset. Changing the search algorithm does not alter this invariant.
  - Evidence: `src/components/parts/part-list.tsx:151-190`, `src/components/sellers/seller-list.tsx:65-76`, and analogous blocks in all other list/selector files.

- Derived value: `kits buckets` (post-migration to client-side filtering)
  - Source: Full kit lists from `useGetKits` (active + archived), now always unfiltered. `searchTerm` drives a new client-side `useMemo` filter.
  - Writes / cleanup: `counts` object reflects **unfiltered** totals (derived from `buckets.active.length`/`buckets.archived.length`). `filteredActiveKits` (new) drives rendering and instrumentation `visible` count.
  - Guards: Kits query no longer includes a search param; the query key changes (loses `query` field), causing React Query to refetch on first load after the change. Old cached entries under the previous key shape are harmless and GC-eligible.
  - Invariant: `counts.active + counts.archived` equals total kits across both statuses (unfiltered). `filteredActiveKits.length <= counts[status]` when search is active. Both tabs must reflect the same search term simultaneously.
  - Evidence: `src/hooks/use-kits.ts:56-63`, `src/components/kits/kit-overview-list.tsx:55,64-88`.

- Derived value: `searchTokens` in `use-parts-selector.ts` (removed)
  - Source: Was built from part fields; replaced by inline `FuzzySearchTerm[]` construction.
  - Writes / cleanup: `PartSelectorOptionMeta.searchTokens` field and `buildSearchTokens()` function are deleted. No downstream consumers besides the filter callback.
  - Guards: N/A (removal).
  - Invariant: After removal, the `filteredBySearch` useMemo must use `fuzzyMatch()` with equivalent field coverage.
  - Evidence: `src/hooks/use-parts-selector.ts:52-70`.

---

## 7) State Consistency & Async Coordination

- Source of truth: TanStack Query cache for each entity (parts, sellers, types, shopping lists, kits, boxes). `searchTerm` from URL (list screens) or local `useState` (selectors).
- Coordination: `useMemo` recomputes filtered results whenever the data or search term changes. No cross-component coordination needed since each filter is self-contained.
- Async safeguards: No new async behavior introduced. `fuzzyMatch()` is synchronous and runs inside `useMemo`. Existing stale-while-revalidate behavior is preserved.
- Instrumentation: No changes to `useListLoadingInstrumentation` calls. The metadata (counts, searchTerm, etc.) continues to reflect the filtered results accurately because the instrumentation reads from the same derived state.
- Evidence: All instrumentation blocks in the affected files (e.g., `src/components/parts/part-list.tsx:252-321`, `src/components/sellers/seller-list.tsx:88-115`).

---

## 8) Errors & Edge Cases

- Failure: Empty or whitespace-only query
- Surface: All list screens and selectors
- Handling: `fuzzyMatch()` returns `true` immediately, showing all records. Matches current behavior.
- Guardrails: Early return in `fuzzyMatch()` when `query.trim()` is empty.
- Evidence: Current pattern at e.g. `src/components/sellers/seller-list.tsx:66-68`.

- Failure: Data term is empty string or undefined/null
- Surface: Optional fields like `manufacturer`, `seller`, `description` in various entities.
- Handling: Empty-string terms produce zero tokens after tokenization and are effectively skipped. Call sites must coalesce `null`/`undefined` to `''` before passing to `fuzzyMatch()`.
- Guardrails: Each call site uses `?? ''` for nullable fields (matching existing patterns).
- Evidence: Current pattern at `src/components/parts/part-list.tsx:166-170`.

- Failure: Very long query strings
- Surface: All search inputs
- Handling: Performance degrades linearly with token count. In practice, users rarely type more than a few words. No explicit guard needed.
- Guardrails: `DebouncedSearchInput` already debounces input by 300ms, limiting recomputation frequency.
- Evidence: `src/components/primitives/debounced-search-input.tsx`.

- Failure: Unicode edge cases (non-Latin scripts, emoji)
- Surface: All search inputs
- Handling: `normalize('NFD')` + combining-mark removal handles Latin diacritics. Non-Latin scripts pass through unchanged and match via Levenshtein distance. Emoji tokenize as single tokens and match only on exact or near-exact match.
- Guardrails: The algorithm is permissive by design; unrecognized characters simply contribute to Levenshtein distance.
- Evidence: Change brief specifies `String.normalize('NFD')` + combining marks regex.

- Failure: Box number search changes from substring to prefix match
- Surface: Boxes list
- Handling: The current box list uses `String(box.box_no).includes(term)` (substring match), so searching "2" matches boxes 2, 12, 20, 21, 32, etc. After this change, box numbers use `type: 'literal'` (prefix match), so "2" matches boxes 2, 20, 21, etc., but NOT box 12 or 32. This is an intentional alignment with how part keys work (prefix-only for structured identifiers). Box numbers are typically small integers searched by leading digits, so this matches user intent.
- Guardrails: If users report confusion, box numbers could be switched to `type: 'text'` to restore substring-like fuzzy matching.
- Evidence: `src/components/boxes/box-list.tsx:54-57`.

- Failure: Kits search regression after moving to client-side
- Surface: Kits overview list
- Handling: If the kits dataset grows large enough that client-side filtering becomes slow, this could be reverted to server-side. Current kit counts are small.
- Guardrails: Monitor rendering performance; consider memoization with `useMemo` (already planned).
- Evidence: `src/hooks/use-kits.ts:41-79`.

---

## 9) Observability / Instrumentation

No new instrumentation signals are required. The existing `useListLoadingInstrumentation` calls on every list screen and selector already emit metadata including `searchTerm`, `visibleCount`, `filteredCount`, and `totalCount`. These derived values are computed after filtering, so switching from substring to fuzzy matching automatically updates the emitted counts.

- Signal: `ListLoading:ready` events (existing)
- Type: Instrumentation event (test mode only)
- Trigger: When data finishes loading and filtering is complete
- Labels / fields: `searchTerm`, `visibleCount`, `filteredCount`, `totalCount` (unchanged)
- Consumer: Playwright wait helpers (`waitTestEvent`)
- Evidence: `src/components/parts/part-list.tsx:252-321`, `src/components/sellers/seller-list.tsx:88-115`, and analogous blocks in all affected files.

---

## 10) Lifecycle & Background Work

No new lifecycle hooks, timers, or subscriptions are introduced. The `fuzzyMatch()` function is pure and synchronous, called inside existing `useMemo` hooks.

- Hook / effect: `useMemo` (existing, in each list/selector component)
- Trigger cadence: Recomputes when dependencies change (data array, search term)
- Responsibilities: Applies `fuzzyMatch()` filter to the dataset
- Cleanup: N/A (useMemo has no cleanup)
- Evidence: `src/components/parts/part-list.tsx:151`, `src/components/sellers/seller-list.tsx:65`, etc.

---

## 11) Security & Permissions

Not applicable. Fuzzy search is a client-side filter over data already fetched and authorized by the backend. No new data exposure, authentication, or authorization changes.

---

## 12) UX / UI Impact

- Entry point: Every search input across the application (6 list screens + 4 selectors)
- Change: Search results now tolerate typos and diacritics. Previously, "resisror" would return zero results; now it matches "resistor". Previously, "nael" would return zero results; now it matches "nail" or similar short terms.
- User interaction: Users type queries as before. Results appear with more tolerance for misspellings. The search input UI, debounce behavior, and clear-search functionality remain unchanged.
- Dependencies: `fuzzyMatch()` utility function.
- Evidence: All affected files listed in section 2.

---

## 13) Deterministic Test Plan

### Unit tests (Vitest) -- `src/lib/utils/__tests__/fuzzy-search.test.ts`

- Surface: `fuzzyMatch()` pure function
- Scenarios:
  - Given empty query, When fuzzyMatch is called, Then returns true for any data
  - Given exact match query, When fuzzyMatch is called, Then returns true
  - Given query with one typo in a 5-char token ("resis" for "resis"), When fuzzyMatch is called with text terms, Then returns true (distance 0 = exact prefix)
  - Given query "resisror" for data term "resistor", When fuzzyMatch is called, Then returns true (1 typo in 8-char token, threshold = 2)
  - Given query "capcitor" for data term "capacitor", When fuzzyMatch is called, Then returns true (1 transposition in 8-char token)
  - Given query "xyz" for data term "abc", When fuzzyMatch is called, Then returns false (distance 3 > threshold 0 for 3-char token)
  - Given literal term with query prefix, When fuzzyMatch is called, Then returns true (exact prefix match)
  - Given literal term with typo in prefix, When fuzzyMatch is called, Then returns false (literal = strict prefix)
  - Given multi-word query "shift register", When data has terms "8-bit shift register", Then returns true (AND combinator: both tokens match)
  - Given multi-word query "shift amplifier", When data has terms "8-bit shift register", Then returns false (AND combinator: "amplifier" doesn't match)
  - Given query with diacritics "resistor", When data has "resistor" (no diacritics), Then returns true (normalization strips diacritics)
  - Given data token shorter than query token, When fuzzyMatch is called, Then full query token is compared against full data token (no truncation of query)
  - Given representative parts from `parts.json`, When searching with common typo queries, Then matches are sensible (validate threshold experimentally)
- Instrumentation / hooks: N/A (pure unit tests)
- Gaps: None.
- Evidence: New file.

### Playwright E2E tests -- existing specs

Existing Playwright search tests (e.g., `tests/e2e/parts/part-list.spec.ts` lines 63-133) currently search by exact description strings. Since fuzzy search is strictly more permissive than substring matching, **all existing search tests continue to pass without modification** -- any query that matched via substring will also match via fuzzy search.

No new Playwright specs are required for the fuzzy search algorithm itself (covered by unit tests). If future work adds typo-specific E2E scenarios, those can be added incrementally.

- Surface: All list and selector Playwright specs
- Scenarios:
  - Given existing search tests, When fuzzy search replaces substring matching, Then all existing test assertions remain valid (superset matching)
- Instrumentation / hooks: Existing `ListLoading:ready` events and `waitTestEvent` helpers
- Gaps: No typo-specific E2E scenarios are added in this slice. Justification: the fuzzy algorithm is thoroughly covered by unit tests, and E2E tests are expensive to maintain for algorithmic edge cases. Typo-scenario E2E tests can be added later if needed.
- Evidence: `tests/e2e/parts/part-list.spec.ts`, `tests/e2e/sellers/sellers-list.spec.ts`, etc.

---

## 14) Implementation Slices

- Slice: 1 -- Fuzzy search utility + unit tests
- Goal: Ship the core algorithm with comprehensive test coverage.
- Touches: `src/lib/utils/fuzzy-search.ts`, `src/lib/utils/__tests__/fuzzy-search.test.ts`, `vitest.config.ts`, `package.json` (add vitest as devDependency and `test:unit` script).
- Dependencies: None. This slice is self-contained. The threshold validation step in this slice is a gate for proceeding to Slices 2-3 -- if the experimentally derived thresholds produce unacceptable false positives, adjust before integrating.

- Slice: 2 -- Integrate into list screens
- Goal: All six list screens use fuzzy matching.
- Touches: `src/components/parts/part-list.tsx`, `src/components/sellers/seller-list.tsx`, `src/components/types/type-list.tsx`, `src/components/shopping-lists/overview-list.tsx`, `src/components/kits/kit-overview-list.tsx`, `src/hooks/use-kits.ts`, `src/components/boxes/box-list.tsx`.
- Dependencies: Slice 1 must be complete.

- Slice: 3 -- Integrate into dropdown selectors
- Goal: All four dropdown selectors use fuzzy matching.
- Touches: `src/hooks/use-parts-selector.ts`, `src/components/sellers/seller-selector.tsx`, `src/hooks/use-types.ts`, `src/components/shopping-lists/shopping-list-selector.tsx`.
- Dependencies: Slice 1 must be complete. Can run in parallel with Slice 2.

- Slice: 4 -- Verify Playwright specs
- Goal: Confirm all existing E2E search tests pass with fuzzy matching.
- Touches: No file changes; run existing specs.
- Dependencies: Slices 2 and 3 must be complete.

---

## 15) Risks & Open Questions

- Risk: Levenshtein threshold too permissive, causing false positives
- Impact: Users see irrelevant results in search (e.g., "LED" matches "LCD").
- Mitigation: Start with conservative `Math.floor(tokenLength / 4)` threshold. Validate against `parts.json` in unit tests. Tighten if needed.

- Risk: Kits client-side migration introduces performance regression with large kit datasets
- Impact: Slow rendering on kits overview page.
- Mitigation: Current kit counts are small (tens). If the dataset grows, the server-side search parameter can be re-introduced alongside client-side fuzzy filtering.

- Risk: Existing Playwright tests become flaky due to fuzzy matching returning additional results
- Impact: Count assertions (`expectSummaryText`) may fail if fuzzy matching includes unintended matches.
- Mitigation: Existing tests use unique randomized descriptions (e.g., `makeUnique('Automation Relay')`), making false-positive matches extremely unlikely. Run full Playwright suite in Slice 4.

- Risk: Missing Vitest setup causes friction
- Impact: Developers unfamiliar with the new test runner.
- Mitigation: Minimal Vitest config; add a `pnpm test:unit` script to `package.json`. Vitest works out of the box with Vite's config.

---

## 16) Confidence

Confidence: High -- the algorithm is well-specified, the integration points are uniform and mechanical, existing tests provide a regression safety net, and the kits migration is low-risk given small dataset sizes.
