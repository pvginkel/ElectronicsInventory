# Fuzzy Search Plan Review

## 1) Summary & Decision

**Readiness**

The plan is thorough, well-researched, and demonstrates strong alignment with the codebase. The algorithm specification is precise, the file map is exhaustive with accurate line-range evidence, and the kits server-to-client migration is soundly reasoned. The main concerns are: (1) the Playwright coverage gap for kits search, which transitions from server-side to client-side filtering and currently has an E2E spec that exercises that search behavior, (2) the seller selector omits the `website` field from fuzzy search data when the list screen includes it, and (3) the plan's assertion that no new Playwright specs are needed warrants closer scrutiny given the CLAUDE.md mandate that UI features ship with matching test coverage.

**Decision**

`GO-WITH-CONDITIONS` -- The plan is implementation-ready after addressing the kits Playwright regression risk, the seller selector field coverage gap, and clarifying the project's test coverage coupling requirement for this change.

## 2) Conformance & Fit (with evidence)

**Conformance to refs**

- `docs/commands/plan_feature.md` -- Pass -- All 17 required sections are present and follow the prescribed templates faithfully. The Research Log, User Requirements Checklist, and Implementation Slices are all properly structured.
- `docs/product_brief.md` -- Pass -- `plan.md:34-35` -- "Replace the exact substring matching currently used in every search box" aligns with product brief section 7: "One simple search box. Type anything (part ID, manufacturer code, type, tag, words in the description, seller, file name)." The fuzzy enhancement improves the core search UX.
- `docs/contribute/architecture/application_overview.md` -- Pass -- `plan.md:92-93` -- New utility placed in `src/lib/utils/`, consistent with the documented directory layout (`src/lib/utils/ -- Pure functions shared across features`).
- `docs/contribute/testing/playwright_developer_guide.md` -- Partial -- `plan.md:434-444` -- The plan states "No new Playwright specs are required" and defers typo-specific E2E scenarios. While the algorithmic logic is well-covered by unit tests, the project's CLAUDE.md states: "Ship instrumentation changes and matching Playwright coverage in the same slice; a UI feature is incomplete without automated verification." The kits migration from server-side to client-side filtering is a user-visible behavioral change that warrants explicit E2E validation.
- `docs/contribute/testing/index.md` -- Pass -- `plan.md:97-98` -- Vitest unit tests follow the "real data" philosophy by using `parts.json` for threshold validation. The plan avoids mocks and request interception.
- `docs/features/fuzzy_search/change_brief.md` -- Pass -- All six algorithm specification steps from the change brief are faithfully reproduced in the plan's section 5 (`plan.md:190-202`).

**Fit with codebase**

- `src/components/kits/kit-overview-list.tsx` -- `plan.md:122-124` -- The plan correctly identifies `useKitsOverview(searchTerm)` at line 35 as the delegation point. However, the component currently relies on the server to filter kits, meaning `buckets.active` and `buckets.archived` already reflect server-filtered results. After the migration, these buckets will contain all kits, and a new `useMemo` must filter both before they reach `activeKits` at line 55. The plan describes this correctly at `plan.md:233-238`.
- `src/hooks/use-kits.ts` -- `plan.md:127-128` -- Confirmed: `createKitsQueryParams` at lines 13-22 adds `query.query = trimmed` when search term is present. The plan's approach to simply omit this parameter is sound.
- `src/hooks/use-parts-selector.ts` -- `plan.md:137-138` -- Confirmed: `buildSearchTokens()` at lines 52-70 and the filter at lines 156-169 use substring matching. The plan correctly identifies this for replacement.
- `src/components/sellers/seller-selector.tsx` -- `plan.md:141-143` -- The plan says the seller selector filters on `seller.name.toLowerCase().includes(term)` (line 41-43 of the file). This is accurate. However, the seller list screen (`seller-list.tsx:70-74`) also filters on `website`. The plan's data array for "Sellers list (and seller selector)" at `plan.md:259-263` includes website, but the seller selector currently does NOT filter on website. This is a pre-existing inconsistency, not introduced by the plan, but the plan should note it explicitly or choose to harmonize the fields.
- `src/components/boxes/box-list.tsx` -- `plan.md:132-133` -- Confirmed: line 55 uses `String(box.box_no)` for the box number search. The plan's data array at `plan.md:294` correctly uses `String(box.box_no)` with `type: 'literal'`.

## 3) Open Questions & Ambiguities

- Question: Should the seller selector include the `website` field in fuzzy search data to match the seller list screen?
- Why it matters: The plan's data array at `plan.md:259-263` shows `[{ term: seller.name, type: 'text' }, { term: seller.website ?? '', type: 'text' }]` for "Sellers list (and seller selector)." But the current seller selector (`seller-selector.tsx:38-44`) only filters on `name`, not `website`. If the plan intends to add `website` to the selector, that is a scope expansion (albeit minor). If it intends to keep the selector name-only, the data array section is misleading by grouping them together.
- Needed answer: Clarify whether the seller selector data array includes `website` or not, and update the plan accordingly.

- Question: Does the kits query key change cause a cache miss and redundant refetch for existing users?
- Why it matters: `plan.md:170` notes "the search param is removed from the query key," and `plan.md:313` says "the query key changes (loses `query` field), causing React Query to refetch on first load after the change." This is correct and expected, but the plan should confirm that both the active and archived kits queries lose the `query` parameter simultaneously, and that no stale entries remain in the cache keyed under the old shape.
- Needed answer: Research indicates this is handled cleanly. When `createKitsQueryParams` stops including the `query` field, all new calls use the new key shape. Old cached entries under the previous key shape will simply be unused and eventually garbage collected by React Query's `gcTime`. No explicit cache cleanup is needed.

- Question: What is the box number matching semantic under fuzzy search?
- Why it matters: The plan designates `String(box.box_no)` as `type: 'literal'`, meaning strict prefix match. Currently, `box-list.tsx:57` uses `boxNumber.includes(term)`, which is a substring match (e.g., searching "2" matches box 12, 20, 21, etc.). Switching to prefix-only means "2" would match box 2, 20, 21, etc., but NOT box 12. This is a behavioral change for box number search.
- Needed answer: This is likely intentional since part keys also use literal/prefix matching, and box numbers are typically searched by their leading digits. However, the plan should explicitly acknowledge this behavioral difference and confirm it is desired.

## 4) Deterministic Playwright Coverage (new/changed behavior only)

- Behavior: Kits overview client-side filtering (migration from server-side)
- Scenarios:
  - Given kits exist with distinct names, When user types a search term, Then only matching kits appear (existing test at `tests/e2e/kits/kits-overview.spec.ts:144-163`)
  - Given kits exist in active and archived tabs, When user searches "Synth" and switches tabs, Then search persists across tabs (existing test covers this)
- Instrumentation: `ListLoading:ready` event for `kits.overview` scope, existing `waitForListLoading` helper
- Backend hooks: `testData.kits.create()` factory already exists
- Gaps: The existing kits overview search test at `tests/e2e/kits/kits-overview.spec.ts:144-163` exercises server-side search. After the migration to client-side filtering, this test should continue to pass since fuzzy matching is strictly more permissive than the backend's search. However, the plan does not explicitly confirm this. **The `counts` metadata in the kits instrumentation (`plan.md:65-68`) derives from `buckets.active.length`/`buckets.archived.length`, which currently reflect server-filtered results. After migration, `counts` will reflect total (unfiltered) counts while `activeKits` will reflect filtered counts. This changes the semantics of the instrumentation metadata.** This should be explicitly addressed.
- Evidence: `plan.md:230-239`, `tests/e2e/kits/kits-overview.spec.ts:144-163`

- Behavior: Fuzzy matching on all list screens (replacing substring)
- Scenarios:
  - Given parts exist with unique descriptions, When user searches by exact description, Then matching part appears (existing tests at `tests/e2e/parts/part-list.spec.ts:63-108`)
  - Given sellers exist, When user searches by name, Then matching seller appears (existing tests at `tests/e2e/sellers/sellers-list.spec.ts`)
- Instrumentation: Existing `ListLoading:ready` events with `searchTerm` and count metadata
- Backend hooks: Existing factories for parts, sellers, types, kits, boxes, shopping lists
- Gaps: No new E2E scenarios for typo-tolerant matching. The plan justifies this with unit test coverage. This is acceptable for the algorithm itself, but does not cover the integration wiring (i.e., that each call site correctly builds the `FuzzySearchTerm[]` array). Consider adding at least one smoke test that verifies a minor typo returns results on the parts list to validate end-to-end wiring.
- Evidence: `plan.md:434-445`

## 5) Adversarial Sweep (must find >=3 credible issues or declare why none exist)

**Major -- Kits instrumentation `counts` semantics change after client-side migration**

**Evidence:** `plan.md:233-238` and `src/components/kits/kit-overview-list.tsx:55-57,64-88`

Currently, `buckets.active` and `buckets.archived` are server-filtered, so `counts.active` and `counts.archived` (lines 65-68 of `kit-overview-list.tsx`) reflect the number of kits matching the search term. After migration, `buckets` will contain ALL kits (unfiltered), so `counts` will always reflect totals regardless of search term. The `activeKits` variable at line 55 will need to be the filtered list, but the `counts` object at line 65 is derived from `buckets.active.length`/`buckets.archived.length` (the unfiltered data).

**Why it matters:** The `ListScreenCounts` component at line 127-133 uses `counts[status]` as the `total` prop. The `useListLoadingInstrumentation` at lines 64-88 emits `totals: counts` and `visible: activeKits.length`. If `counts` now reflects the unfiltered total while `activeKits` reflects the filtered count, the semantics align correctly (total = all, visible = filtered). But this is a semantic change from the current behavior where `counts` already reflects server-filtered results. The existing kits Playwright test at `kits-overview.spec.ts:156-158` searches for "Synth" and expects only the matching kit to be visible. If the instrumentation metadata changes shape, downstream tests relying on `counts` values may need adjustment.

**Fix suggestion:** The plan should add a note in section 5 (Flow: Kits client-side filtering) explicitly addressing how `counts` and `activeKits` relate after migration. Specifically: (1) `counts` should continue to reflect the TOTAL number of kits per status (active/archived), (2) a new `filteredKits` or equivalent should drive the visible list, and (3) the `ListScreenCounts` component should receive `total={counts[status]}` and `filtered={filteredActiveKits.length}` when a search is active. This mirrors the pattern used by all other list screens (e.g., `seller-list.tsx:83-85`). The plan's step 4 at `plan.md:237` says "The filtered list replaces the current direct use of `buckets.active`/`buckets.archived`" but does not specify that `counts` must remain derived from the unfiltered buckets.

**Confidence:** High

---

**Major -- Seller selector field coverage inconsistency in plan data arrays**

**Evidence:** `plan.md:259-263` vs `src/components/sellers/seller-selector.tsx:38-44`

The plan at `plan.md:259-263` groups "Sellers list (and seller selector)" together with a data array of `[{ term: seller.name }, { term: seller.website ?? '' }]`. However, the actual seller selector at `seller-selector.tsx:41` only filters on `seller.name.toLowerCase().includes(term)` -- it does not include `website`. The seller list at `seller-list.tsx:70-74` does include both `name` and `website`.

**Why it matters:** If the implementer follows the plan literally, they will add `website` to the seller selector's fuzzy data, expanding the selector's search surface beyond its current behavior. This is a minor scope expansion, but should be an explicit, deliberate choice rather than an accidental side effect of grouping in the plan.

**Fix suggestion:** Split the data array documentation into separate entries:

Sellers list:
```
[
  { term: seller.name, type: 'text' },
  { term: seller.website ?? '', type: 'text' },
]
```

Seller selector:
```
[
  { term: seller.name, type: 'text' },
]
```

Or, if adding `website` to the selector is desired, note it as an intentional improvement.

**Confidence:** High

---

**Minor -- Box number search changes from substring to prefix match**

**Evidence:** `plan.md:294` -- `{ term: String(box.box_no), type: 'literal' }` vs `src/components/boxes/box-list.tsx:55-57` -- `boxNumber.includes(term)`

The current box list uses `String(box.box_no).includes(term)`, which is substring matching: searching "2" matches box 2, 12, 20, 21, 22, 32, etc. The plan designates box numbers as `type: 'literal'`, which means prefix matching only: "2" matches box 2, 20, 21, 22, etc., but NOT box 12, 32, etc.

**Why it matters:** This is a subtle behavioral regression for users who search for box numbers using substring patterns (e.g., searching "5" to find box 15). Box numbers are typically small integers, so the impact is limited, but it is a change in behavior that the plan does not acknowledge.

**Fix suggestion:** Add a note in section 8 (Errors & Edge Cases) acknowledging this behavioral change. If prefix-only is desired for box numbers (consistent with part keys), state it explicitly. If substring semantics should be preserved, consider using `type: 'text'` for box numbers or adding substring fallback logic for literal terms.

**Confidence:** Medium

---

**Minor -- Missing `pnpm test:unit` script in implementation details**

**Evidence:** `plan.md:489` -- "add a `pnpm test:unit` script to `package.json`" is mentioned only in the risks section, not in the file map or implementation slices.

**Why it matters:** The Vitest setup (config file + `package.json` script) is part of the deliverable but is only fully described in section 15 (Risks). Section 2 (File Map) mentions `vitest.config.ts` and `package.json` but does not specify the script addition. Section 14 (Slice 1) lists `package.json (add vitest)` but a developer might miss the script addition.

**Fix suggestion:** Add an explicit note in the Slice 1 description: "Add vitest as devDependency and `test:unit` script to `package.json`."

**Confidence:** Low

## 6) Derived-Value & State Invariants (table)

- Derived value: `filteredParts` (and analogous values for all list screens)
  - Source dataset: Full dataset from TanStack Query cache (unfiltered) + `searchTerm` from URL or local state
  - Write / cleanup triggered: Drives `visibleCount`, `filteredCount` for `ListScreenCounts` and instrumentation metadata. No persistent writes.
  - Guards: Empty search term returns all records (`fuzzyMatch` returns `true` for empty query). `useMemo` recomputes only when data or search term changes.
  - Invariant: Filtered set is always a strict subset of the full dataset. Changing from substring to fuzzy matching preserves this invariant because `fuzzyMatch` is a pure boolean filter.
  - Evidence: `plan.md:303-308`, `src/components/parts/part-list.tsx:151-190`

- Derived value: `kits buckets` (post-migration)
  - Source dataset: Full kit lists from `useGetKits` (active + archived), now always unfiltered
  - Write / cleanup triggered: `counts` object (derived from unfiltered `buckets`), `activeKits` (will be derived from filtered buckets), instrumentation metadata
  - Guards: Query key changes when `query` parameter is removed; React Query will refetch. Stale cached entries under the old key shape are harmless and GC-eligible.
  - Invariant: `counts.active + counts.archived` must equal total kits across both statuses (unfiltered). `activeKits.length <= counts[status]` must hold when search is active. Both tabs must reflect the same search term simultaneously.
  - Evidence: `plan.md:310-315`, `src/hooks/use-kits.ts:56-63`

- Derived value: `searchTokens` in `use-parts-selector.ts` (removed)
  - Source dataset: Was built from part fields in `buildSearchTokens()` at lines 52-70
  - Write / cleanup triggered: `PartSelectorOptionMeta.searchTokens` field and `buildSearchTokens()` function are deleted. Only consumed by `filteredBySearch` useMemo.
  - Guards: N/A (removal). The replacement `FuzzySearchTerm[]` must cover the same fields.
  - Invariant: After removal, the fuzzy match data array must include all fields that `buildSearchTokens` covered: `displayId`, `displayDescription`, `displayManufacturerCode`, `typeName`, `manufacturer`, `seller.name`, and `tags`. The plan's parts list data array at `plan.md:247-256` covers all of these.
  - Evidence: `plan.md:317-322`, `src/hooks/use-parts-selector.ts:52-70`

## 7) Risks & Mitigations (top 3)

- Risk: Kits Playwright test regression due to server-to-client search migration. The existing test at `kits-overview.spec.ts:144-163` searches for "Synth" and expects specific kits to appear/disappear. After migration, the search semantics change from backend substring to client-side fuzzy. While fuzzy is more permissive, the instrumentation metadata shape may change, and the `counts` object now reflects unfiltered totals.
- Mitigation: Run the kits overview spec suite after slices 2-3 are complete (already planned in Slice 4). Explicitly verify that `counts` in instrumentation metadata correctly separates total vs. filtered counts. Add a brief note in the plan about expected metadata changes.
- Evidence: `plan.md:483-485`, `tests/e2e/kits/kits-overview.spec.ts:144-163`

- Risk: False positives from fuzzy matching cause existing Playwright count assertions to fail. Tests like `parts.expectSummaryText(/1 of \d+ parts showing/i)` rely on exact match counts. If fuzzy matching returns additional results that substring would not, the "1 of" assertion could become "2 of".
- Mitigation: The plan correctly notes at `plan.md:485` that tests use `makeUnique` prefixes, making false-positive matches extremely unlikely. This risk is low but should be validated in Slice 4.
- Evidence: `plan.md:483-485`, `tests/e2e/parts/part-list.spec.ts:63-83`

- Risk: Levenshtein threshold too permissive for short tokens, causing "LED" to match "LCD" (distance = 1, threshold for 3-char token = 0 with `Math.floor(3/4) = 0`). Actually, with the proposed formula, 3-char tokens have threshold 0, so this specific case is safe. The risk zone is 4-7 character tokens where threshold = 1: "MOSFET" (6 chars) would match "MOSFTT" but also "MOSFIT", "MOSFEX", etc.
- Mitigation: The plan's experimental validation against `parts.json` in unit tests (Slice 1) is the correct approach. The `Math.floor(tokenLength / 4)` formula is conservative. The plan should emphasize that the threshold validation step in Slice 1 is a gate for proceeding to Slices 2-3.
- Evidence: `plan.md:220-228`, `plan.md:475-477`

## 8) Confidence

Confidence: High -- The plan demonstrates thorough codebase research, accurate file-level evidence, and a sound mechanical integration strategy. The conditions raised are specific and addressable without redesigning the approach. The algorithm specification from the change brief is faithfully reproduced, and the uniform nature of the existing filter pattern makes integration straightforward.
