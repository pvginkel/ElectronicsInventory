# Code Review: Fuzzy Search on All Search Boxes

## 1) Summary & Decision

**Readiness**

The implementation is well-executed and closely follows the approved plan. The core `fuzzyMatch()` algorithm in `src/lib/utils/fuzzy-search.ts` is clean, well-documented, and thoroughly tested with 59 Vitest unit tests covering normalization, Levenshtein distance, threshold mapping, and all matching modes. All 10 search integration points (6 list screens + 4 dropdown selectors) have been migrated from substring to fuzzy matching with consistent patterns. The kits migration from server-side to client-side filtering is handled correctly, with query key simplification propagated to `kit-archive-controls.tsx` optimistic updates. TypeScript strict mode passes, lint is clean, and the build succeeds. Two gaps exist: (1) no Playwright E2E tests were added or updated for the behavior change, which the project's Definition of Done normally requires, and (2) the plan's data array specification for the shopping-list selector is misleading but the implementation is actually correct given the available type shape.

**Decision**

`GO-WITH-CONDITIONS` -- The core change is sound and mechanically correct. Ship after addressing the minor findings below, particularly verifying Playwright specs pass and considering whether an E2E smoke test for fuzzy behavior is warranted to prevent regressions.

---

## 2) Conformance to Plan (with evidence)

**Plan alignment**

- `plan.md section 1: fuzzyMatch() utility` -- `src/lib/utils/fuzzy-search.ts:1-161` -- Full implementation of normalize, tokenize, levenshteinDistance, getThreshold, tokenMatches, and fuzzyMatch matching the algorithm specification exactly.
- `plan.md section 1a: User Requirements Checklist` -- All checklist items are satisfied: NFD normalization (`fuzzy-search.ts:33-34`), tokenization via `/\S+/g` (`fuzzy-search.ts:42`), AND combinator (`fuzzy-search.ts:155`), literal prefix match (`fuzzy-search.ts:112`), prefix-Levenshtein for text (`fuzzy-search.ts:117-126`), threshold via `Math.floor(length / 4)` (`fuzzy-search.ts:100`).
- `plan.md section 2: File Map` -- All 14 files listed in the plan are touched in the diff. The new files (`fuzzy-search.ts`, `fuzzy-search.test.ts`, `vitest.config.ts`) are present.
- `plan.md section 4: API/Integration Surface` -- `src/hooks/use-kits.ts:11-16` -- `createKitsQueryParams` no longer includes `query` parameter, matching the plan's intent.
- `plan.md section 5: Kits client-side filtering` -- `src/components/kits/kit-overview-list.tsx:56-73` -- New `useMemo` with `fuzzyMatch` replaces server-side delegation. `counts` now reflects unfiltered totals via `buckets.active.length`/`buckets.archived.length` (`use-kits.ts:57-60`).
- `plan.md section 5: Data arrays per domain` -- All 7 domain data arrays match the plan specification. Parts (`part-list.tsx:163-170`), sellers (`seller-list.tsx:72-75`), seller selector (`seller-selector.tsx:38`), types (`type-list.tsx:80`), shopping lists overview (`overview-list.tsx:96-101`), kits (`kit-overview-list.tsx:66-69`), boxes (`box-list.tsx:53-56`), parts selector (`use-parts-selector.ts:142-149`), type selector via `use-types.ts:26`, shopping-list selector (`shopping-list-selector.tsx:136-139`).
- `plan.md section 13: Unit tests` -- `src/lib/utils/__tests__/fuzzy-search.test.ts` -- 59 tests covering all planned scenarios including empty queries, exact matching, typo tolerance, literal terms, AND combinator, diacritics, edge cases, mixed terms, representative parts data, and box number matching.
- `plan.md section 14: Slice 1 (Vitest setup)` -- `vitest.config.ts` and `package.json` `test:unit` script present.

**Gaps / deviations**

- `plan.md section 5: Shopping lists overview "(and shopping-list selector)"` -- The plan states the shopping-list selector should use `[name, description, primarySellerName]` as its data array, identical to the overview. The implementation at `shopping-list-selector.tsx:136-139` uses only `[name]`. This is actually correct because `ShoppingListOption` (defined at `src/types/shopping-lists.ts:22-27`) does not carry `description` or `primarySellerName` fields -- only the `ShoppingListOverviewSummary` type does. The plan's grouping was misleading, but the implementation is type-safe and correct.
- `plan.md section 13: Playwright E2E tests` -- The plan explicitly states "No new Playwright specs are required" and existing tests should pass unchanged. This is a reasonable position given the superset-matching property of fuzzy search, but no evidence was provided that existing Playwright specs were actually executed. The project's Definition of Done in `CLAUDE.md` states "Playwright specs are created or updated in the same change."

---

## 3) Correctness -- Findings (ranked)

- Title: `Minor -- Vitest config duplicates path aliases already defined in tsconfig`
- Evidence: `vitest.config.ts:7-12` -- Six alias entries manually mirror `tsconfig.json` paths.
- Impact: If a new alias is added to `tsconfig.json` but not `vitest.config.ts`, unit tests will break with an opaque import error. Maintenance friction for future contributors.
- Fix: Use `vite-tsconfig-paths` plugin or Vitest's built-in `resolve.alias` from the existing Vite config. Alternatively, since the only test file currently imports from a relative path (`../fuzzy-search`), the aliases are not even exercised yet and could be removed entirely until needed.
- Confidence: High

- Title: `Minor -- useMemo for static kits query params is unnecessary`
- Evidence: `src/hooks/use-kits.ts:36-43` -- `activeParams` and `archivedParams` are wrapped in `useMemo` with empty dependency arrays, but they return a new object literal that never changes.
- Impact: No functional bug; just unnecessary indirection now that the search term dependency has been removed. The `useMemo(() => createKitsQueryParams('active'), [])` could be replaced with a module-level constant since the params are truly static.
- Fix: Move `const ACTIVE_PARAMS = createKitsQueryParams('active')` and `const ARCHIVED_PARAMS = createKitsQueryParams('archived')` to module scope.
- Confidence: High

- Title: `Minor -- Shopping-list selector data array omits description and seller fields`
- Evidence: `src/components/shopping-lists/shopping-list-selector.tsx:136-139` -- Only `name` is included. The `ShoppingListOption` type at `src/types/shopping-lists.ts:22-27` does not expose `description` or `primarySellerName`.
- Impact: Users cannot fuzzy-search shopping lists by description or seller in dropdown selectors, only on the overview screen. This is a pre-existing limitation (substring matching also only searched `name`), but the plan's phrasing `(and shopping-list selector)` could mislead reviewers into thinking all three fields are searched in both contexts.
- Fix: No code fix needed. Clarify in the plan that the selector operates on a narrower type than the overview. If richer selector search is desired later, the `ShoppingListOption` type would need to be extended.
- Confidence: High

---

## 4) Over-Engineering & Refactoring Opportunities

- Hotspot: Vitest alias duplication
- Evidence: `vitest.config.ts:7-12` -- Six `path.resolve(__dirname, ...)` entries that mirror `tsconfig.json`.
- Suggested refactor: Remove the explicit aliases and rely on a `vite-tsconfig-paths` plugin, or simplify to just the `@` root alias since the test file only uses relative imports.
- Payoff: One fewer file to maintain when paths change; reduces onboarding confusion about "which aliases are canonical."

- Hotspot: `buildSearchTokens` removal leaves clean code
- Evidence: `src/hooks/use-parts-selector.ts` (diff lines removing `buildSearchTokens`) -- The old helper pre-computed lowercase tokens per option. The new approach builds the `FuzzySearchTerm[]` inline in the filter callback.
- Suggested refactor: None needed. The inline construction at `use-parts-selector.ts:142-149` is clear and follows the same pattern as all other integration points. The removal of `buildSearchTokens` and the `searchTokens` field from `PartSelectorOptionMeta` is a net simplification.
- Payoff: Already realized.

---

## 5) Style & Consistency

- Pattern: Consistent integration pattern across all 10 search points
- Evidence: Every integration follows the same shape: check for empty search, build `FuzzySearchTerm[]`, call `fuzzyMatch(data, searchTerm)`. Examples at `box-list.tsx:52-58`, `seller-list.tsx:71-78`, `type-list.tsx:79-81`, `part-list.tsx:155-173`, `overview-list.tsx:91-104`, `kit-overview-list.tsx:60-72`.
- Impact: Low maintenance cost; easy to onboard contributors to the pattern.
- Recommendation: No action needed. This is well done.

- Pattern: Comment quality follows project guidelines
- Evidence: `src/lib/utils/fuzzy-search.ts:1-14` -- Module-level JSDoc describes the algorithm overview. `fuzzy-search.ts:88-101` -- Threshold function documents the formula and its bands. `kit-overview-list.tsx:56` -- Guidepost comment explains the migration from server-side to client-side.
- Impact: Good readability; aligns with the "guidepost comments" guideline in `CLAUDE.md`.
- Recommendation: No action needed.

- Pattern: `as const` assertion used for tag mapping in parts
- Evidence: `src/components/parts/part-list.tsx:170` -- `...(part.tags ?? []).map(tag => ({ term: tag, type: 'text' as const }))` and similarly at `use-parts-selector.ts:149`.
- Impact: The `as const` is necessary because `.map()` widens the `type` field to `string` without it, which would not satisfy the `FuzzyTermType` union. This is correct TypeScript usage.
- Recommendation: No action needed.

---

## 6) Tests & Deterministic Coverage (new/changed behavior only)

- Surface: `fuzzyMatch()` pure function
- Scenarios:
  - Given empty/whitespace query, When fuzzyMatch is called, Then returns true (`fuzzy-search.test.ts:117-128`)
  - Given exact match, When fuzzyMatch is called, Then returns true (`fuzzy-search.test.ts:135-149`)
  - Given typo within threshold, When fuzzyMatch is called with text terms, Then returns true (`fuzzy-search.test.ts:157-196`)
  - Given data token shorter than query, When full comparison is done, Then matches correctly (`fuzzy-search.test.ts:203-215`)
  - Given literal terms, When prefix match is checked, Then strict prefix enforcement works (`fuzzy-search.test.ts:221-242`)
  - Given multi-word query, When AND combinator is applied, Then all tokens must match (`fuzzy-search.test.ts:248-273`)
  - Given diacritics in query or data, When NFD normalization runs, Then matching ignores diacritics (`fuzzy-search.test.ts:279-287`)
  - Given representative electronics parts, When common typos are searched, Then sensible results emerge (`fuzzy-search.test.ts:339-411`)
  - Given box numbers as literal terms, When searched by prefix, Then substring matching is correctly prevented (`fuzzy-search.test.ts:417-432`)
- Hooks: N/A (pure unit tests via Vitest)
- Gaps: No Playwright E2E tests were added or confirmed to have been run. The plan justifies this by noting that fuzzy search is a strict superset of substring matching, so existing tests should continue to pass. However, the Definition of Done states Playwright specs should be "created or updated in the same change." At minimum, the existing Playwright search specs should be confirmed passing. Ideally, at least one smoke-level E2E test exercising a typo query would guard against regressions (e.g., if the fuzzy algorithm is accidentally reverted or broken, existing tests that only use exact strings would not catch it).

- Surface: Kits overview client-side filtering migration
- Scenarios:
  - Existing kits Playwright tests exercise card visibility and status transitions but do not assert on search-specific instrumentation counts (`tests/e2e/kits/kits-overview.spec.ts` per plan reference).
- Hooks: `useListLoadingInstrumentation` at `kit-overview-list.tsx:82-106` emits `kits.overview` events with `visible`, `filtered`, `totals`, and `searchTerm` metadata. These events are now driven by `filteredKits.length` instead of the server-filtered `activeKits.length`.
- Gaps: No E2E test specifically verifies that kits search filtering works client-side after the migration. The risk is low given the small dataset assumption, but the migration from server-side to client-side is a behavioral change that could regress if the backend endpoint changes behavior.
- Evidence: `kit-overview-list.tsx:60-73` (filter logic), `kit-overview-list.tsx:82-106` (instrumentation)

---

## 7) Adversarial Sweep (must attempt >= 3 credible failures or justify none)

- Checks attempted: Derived state driving writes, query/cache key mismatch after kits migration, performance traps, stale closure in filter callbacks, instrumentation drift.
- Evidence: See individual analyses below.
- Why code held up: All probed fault lines are closed by the implementation's design choices.

**Attack 1: Cache key mismatch after kits query parameter removal**

The kits query key changed from `['getKits', { query: { status, query: searchTerm } }]` to `['getKits', { query: { status } }]`. If any consumer still used the old key shape, it would read stale or undefined data.

- Evidence: `src/hooks/use-kits.ts:18-19` -- `buildKitsQueryKey` is the single source of truth for the key. All consumers (`kit-archive-controls.tsx:55-56,214-215`, `kit-overview-list.tsx` via `useKitsOverview`) go through this function. The `onSettled` callbacks in `kit-archive-controls.tsx:93-98,144-150` use `queryKey: ['getKits']` (prefix match), which invalidates all kit queries regardless of key shape.
- Why code held up: Centralized key construction and prefix-based invalidation ensure no stale reads.

**Attack 2: Filtered state driving persistent operations**

Could the fuzzy-filtered kit list accidentally drive a mutation (archive/unarchive) on the wrong kit?

- Evidence: `kit-archive-controls.tsx:32` -- `KitArchiveControls` receives a `kit: KitSummary` prop directly, not a filtered index. Mutations operate on `kit.id` (`kit-archive-controls.tsx:109,159`), not on a position in the filtered array. The `applyStatusTransition` function at `kit-archive-controls.tsx:208-225` uses `buildKitsQueryKey` without any search parameter, operating on the unfiltered cache.
- Why code held up: Mutations are identity-based (kit ID), not position-based; the filter is purely a view layer concern.

**Attack 3: O(n*m*k) performance in fuzzy filter for large datasets**

For each item in the list, fuzzy matching tokenizes all data terms and computes Levenshtein distance for each query-token/data-token pair. With n items, m data tokens per item, and k query tokens, the filter is O(n * m * k * L^2) where L is token length.

- Evidence: `src/lib/utils/fuzzy-search.ts:139-159` -- The filter runs inside `useMemo` at each call site. The `DebouncedSearchInput` at `src/components/primitives/debounced-search-input.tsx` debounces by 300ms, limiting recomputation frequency.
- Why code held up: The project's datasets are small (hundreds to low thousands of items). Token counts per item are typically 5-10. Token lengths are typically under 20 characters. Levenshtein for 20-character strings is ~400 operations. Even with 1000 items * 10 tokens * 3 query tokens, total operations are ~12 million simple comparisons per keystroke, well within the 300ms debounce window on modern hardware.

**Attack 4: Stale closure in kit-overview-list filteredKits useMemo**

- Evidence: `kit-overview-list.tsx:60-73` -- `useMemo` depends on `[kitsForTab, searchActive, searchTerm]`. `kitsForTab` is derived from `buckets` which comes from React Query data. `searchTerm` is a prop from the URL. Both are stable references that update when their source changes.
- Why code held up: No stale closure risk because `useMemo` correctly lists all dependencies. React Query's structural sharing ensures `buckets` reference changes only when data actually changes.

---

## 8) Invariants Checklist (table)

- Invariant: Filtered set is always a subset of the full dataset
  - Where enforced: Every `useMemo` filter callback in all 10 integration points (e.g., `part-list.tsx:152-174`, `seller-list.tsx:68-79`, `kit-overview-list.tsx:60-72`)
  - Failure mode: If `fuzzyMatch` returned `true` for items not in the source array, or if the filter callback mutated the source.
  - Protection: `Array.filter` always produces a subset. `fuzzyMatch` is a pure predicate with no side effects (`fuzzy-search.ts:139-159`).
  - Evidence: All filter callbacks use `items.filter(item => fuzzyMatch(data, searchTerm))` pattern.

- Invariant: Empty query always shows all records
  - Where enforced: `src/lib/utils/fuzzy-search.ts:143-145` -- early return `true` when `queryTokens.length === 0`.
  - Failure mode: If normalization or tokenization produced non-empty tokens from a whitespace-only query.
  - Protection: `normalize` lowercases and strips diacritics but does not alter whitespace. `tokenize` matches `/\S+/g` which returns `null` (coerced to `[]`) for whitespace-only input. Unit test at `fuzzy-search.test.ts:121-123` verifies this.
  - Evidence: `fuzzy-search.ts:41-42`, `fuzzy-search.test.ts:117-128`

- Invariant: Kits counts reflect unfiltered totals while visible/filtered reflect post-filter counts
  - Where enforced: `src/hooks/use-kits.ts:57-60` -- `counts` derived from `buckets.active.length`/`buckets.archived.length` (unfiltered). `kit-overview-list.tsx:90-91` -- `visible: filteredKits.length`, `filtered: filteredKits.length`.
  - Failure mode: If `counts` were accidentally derived from `filteredKits` instead of `buckets`, the tab badges would change with search input.
  - Protection: `counts` is computed in `useKitsOverview()` from the raw bucket data, before any filtering is applied in the component. Tab items at `kit-overview-list.tsx:124-125` read `counts.active` and `counts.archived` directly.
  - Evidence: `use-kits.ts:57-60`, `kit-overview-list.tsx:120-138`

- Invariant: Literal terms enforce strict prefix matching (no fuzzy tolerance)
  - Where enforced: `src/lib/utils/fuzzy-search.ts:110-113` -- `if (termType === 'literal') return dataToken.startsWith(queryToken)`.
  - Failure mode: If the `literal` branch were accidentally removed or fell through to the Levenshtein logic.
  - Protection: The early return on line 112 prevents fallthrough. Unit tests at `fuzzy-search.test.ts:221-242` verify strict prefix behavior including rejection of typos.
  - Evidence: `fuzzy-search.ts:109-113`, `fuzzy-search.test.ts:230-232`

---

## 9) Questions / Needs-Info

- Question: Were existing Playwright E2E search specs executed against the fuzzy search implementation?
- Why it matters: The plan claims existing tests pass unchanged because fuzzy matching is a superset of substring matching. This is theoretically sound, but practical confirmation is needed. A false-positive from fuzzy matching could cause count assertions in Playwright specs to fail (e.g., if `expectSummaryText` asserts an exact count that now includes additional fuzzy matches).
- Desired answer: Confirmation that `pnpm playwright test` was run (or at minimum the search-related specs in `tests/e2e/parts/part-list.spec.ts`, `tests/e2e/sellers/sellers-list.spec.ts`, `tests/e2e/kits/kits-overview.spec.ts`, etc.) and all passed.

---

## 10) Risks & Mitigations (top 3)

- Risk: Fuzzy matching introduces false positives in Playwright count assertions. If any E2E spec asserts an exact count after searching, and fuzzy matching returns additional matches that substring matching would not, the spec will fail.
- Mitigation: Run the full Playwright suite before merging. The plan notes that factory-generated test data uses `makeUnique()` prefixes, making accidental fuzzy collisions unlikely, but this should be verified empirically.
- Evidence: `plan.md section 13` (Playwright section), `CLAUDE.md` Definition of Done

- Risk: Box number search behavioral change (substring to prefix) surprises users. Previously searching "2" in boxes matched box 12, 20, 32, etc. Now it only matches 2, 20-29, 200+. This is intentional per the plan but is a user-facing behavior change.
- Mitigation: The plan documents this as intentional (`plan.md section 8: Box number search changes`). If users report confusion, the box number type can be changed from `'literal'` to `'text'` at `box-list.tsx:53`.
- Evidence: `src/components/boxes/box-list.tsx:53`, `plan.md section 8`

- Risk: Kits client-side migration may cause a visible flash of all results before the filter applies on slow devices.
- Mitigation: The `useMemo` at `kit-overview-list.tsx:60-72` applies the filter synchronously within the render cycle, so there should be no visual flash. React's batched rendering ensures the filtered result is displayed in the same paint. Additionally, kit datasets are small.
- Evidence: `kit-overview-list.tsx:60-72`

---

## 11) Confidence

Confidence: High -- The algorithm implementation is clean and well-tested (59 unit tests, all passing). The integration across all 10 search points is mechanically consistent. TypeScript strict mode, lint, and build all pass. The kits server-to-client migration correctly propagates query key changes to all consumers. The only outstanding concern is the lack of confirmed Playwright execution, which is a procedural gap rather than a code quality issue.
