# Plan Review — Parts Endpoint Consolidation

**Reviewed:** 2025-12-07
**Plan:** `docs/features/parts_endpoint_consolidation/plan.md`

---

## 1) Summary & Decision

**Readiness**

This plan delivers a focused refactor that replaces 793 API calls with a single consolidated request by leveraging backend work already completed. The research is thorough, the type compatibility is verified, and the implementation strategy correctly identifies that the component must build indicator maps inline rather than calling separate hooks. The derived state patterns follow existing architecture, instrumentation remains unchanged (critical for Playwright stability), and the risk surface is narrow—mostly query key updates and summary building logic extraction. The plan demonstrates strong evidence-based reasoning by quoting line numbers and types directly from the codebase.

**Decision**

`GO-WITH-CONDITIONS` — The plan is implementable with high confidence, but four conditions must be addressed before merging: (1) clarify the exact query invalidation key strategy since `usePaginatedFetchAll` doesn't use React Query cache; (2) verify no other consumers of `useAllPartsWithLocations` exist beyond the ones identified; (3) add explicit validation that the `include` parameter is passed correctly; (4) document the breaking change for any future consumers who might expect the old endpoint. These are clarifications and verification steps, not fundamental design flaws.

---

## 2) Conformance & Fit (with evidence)

**Conformance to refs**

- `docs/commands/plan_feature.md` — **Pass** — `plan.md:3-27` provides detailed research log with file paths and findings, meeting the "0) Research Log" requirement.
- `docs/commands/plan_feature.md` — **Pass** — `plan.md:72-94` explicitly lists areas to create, modify, delete, and review but unchanged, fulfilling the file map template.
- `docs/contribute/architecture/application_overview.md` — **Pass** — `plan.md:169` correctly identifies generated types from `types.ts:6369-6600` and `plan.md:188-210` adapts snake_case to camelCase using same patterns as existing indicator hooks.
- `docs/contribute/testing/playwright_developer_guide.md` — **Pass** — `plan.md:625-704` details deterministic test coverage with instrumentation events (`parts.list.ready`) and backend hooks (factories), adhering to real-backend and no-route-mocks policy.
- `docs/product_brief.md` — **Pass** — Change is transparent to user; consolidates API calls without altering UX. `plan.md:604-622` confirms no visible changes.

**Fit with codebase**

- `src/hooks/use-paginated-fetch-all.ts` — `plan.md:97-99` — Correctly identifies that hook uses manual state management (`useState`) not React Query cache, so invalidation targeting `['getPartsWithLocations']` won't actually trigger refetch. This is a **potential gap** that needs clarification (see Open Questions below).
- `src/components/parts/part-list.tsx:150-155` — `plan.md:149-155` — Plan correctly notes kit indicators currently load for **filtered** parts only, while shopping indicators load for **all** parts (line 92-96). New implementation must preserve this asymmetry because shopping list filter needs all parts' membership data.
- `src/hooks/use-part-kit-memberships.ts:110-123` — `plan.md:187-188` — Plan references exact summary building logic (`createSummary`, `sortKits`) to be extracted, demonstrating alignment with existing patterns.
- `src/hooks/use-part-shopping-list-memberships.ts:83-104` — `plan.md:209-210` — Similarly references shopping list summary building, confirming type compatibility.

---

## 3) Open Questions & Ambiguities

**Query invalidation mechanism (Major)**

- **Question:** The plan states `usePaginatedFetchAll` uses manual `useState` (not React Query cache), yet suggests updating invalidation from `['getPartsWithLocations']` to a new key. How does invalidating a query key trigger refetch if the hook doesn't use `useQuery`?
- **Why it matters:** If invalidation doesn't actually cause refetch, stale data will persist after mutations (e.g., adding part to shopping list won't refresh indicators).
- **Needed answer:** Either (A) the hook needs to subscribe to query invalidation events via `queryClient.getQueryCache().subscribe()` and set a local invalidation flag to trigger `useEffect` re-run, OR (B) component-level invalidation at mount (lines 50-54) is sufficient because users must navigate away and back to see updates. Plan should explicitly state which approach is implemented and why.

**Research performed:** Examining `part-list.tsx:50-54`, the invalidation happens in a `useEffect` with empty deps, which runs only once on mount. The `usePaginatedFetchAll` hook has `path` as the only dependency (line 91), so invalidation won't trigger refetch unless component remounts. This appears intentional ("Refetches on every mount" per hook comment line 8), but plan should confirm this is acceptable and that "stale until remount" is the intended behavior.

**Answer:** Based on hook architecture, invalidation is purely a "next mount will be fresh" signal, not a live refetch trigger. This is acceptable if documented. **Condition:** Plan should add to section 7 (Risks) that mutations won't refresh the list until user navigates away and back, and this is by design.

**Other consumers of deprecated hook (Major)**

- **Question:** Does any code outside `part-list.tsx` import `useAllPartsWithLocations`?
- **Why it matters:** Deleting the hook will break those consumers.
- **Needed answer:** Codebase search before deletion.

**Research performed:** Grep shows only `part-list.tsx` imports `useAllPartsWithLocations` in production code; other hits are in docs for this feature and the pagination feature. **Answer:** No other consumers found. Safe to delete.

**Include parameter validation (Minor)**

- **Question:** How can implementation verify the `include` parameter is correctly formatted and passed to the API?
- **Why it matters:** Typo in include string (e.g., `include=kits,shoppinglists` instead of `shopping_lists`) would cause silent data omission, breaking indicators.
- **Needed answer:** Either TypeScript enforcement via typed query params (if generated client supports it) or runtime assertion that response contains expected fields.

**Research performed:** The generated API client uses `(api.GET as any)` casting (see `use-paginated-fetch-all.ts:50`) because query params aren't in schema. This bypasses type safety. **Condition:** Add to section 8 (Errors) a guardrail that checks `parts[0]?.kits !== undefined || parts.length === 0` after fetch and throws descriptive error if include fields are missing despite successful response. This catches backend misconfiguration early.

**Breaking change documentation (Minor)**

- **Question:** Should plan document that `/api/parts/with-locations` removal is a breaking change for any external clients (e.g., scripts, notebooks)?
- **Why it matters:** If tooling exists outside this repo that hits the old endpoint, it will break.
- **Needed answer:** Out of scope for frontend plan (backend responsibility), but worth noting.

**Answer:** Plan correctly scopes to frontend only. Backend team owns external client communication. No action needed.

---

## 4) Deterministic Playwright Coverage (new/changed behavior only)

**Behavior: Parts list loading with consolidated data**

- **Scenarios:**
  - Given database has parts with kit memberships and shopping list memberships
  - When user navigates to parts list
  - Then parts load via single consolidated endpoint with `include=locations,kits,shopping_lists,cover`
  - And kit badges display correctly on cards
  - And shopping list badges display correctly on cards
  - And all existing filters (search, hasStock, onShoppingList) continue working
- **Instrumentation:**
  - `waitForListLoading(page, 'parts.list', 'ready')` ensures data loaded
  - `parts.waitForCards()` waits for card grid to render
  - No new events needed (scope `parts.list` unchanged)
- **Backend hooks:**
  - `testData.parts.create()` seeds parts
  - `testData.parts.addStock()` creates locations
  - Shopping list and kit factories seed memberships via existing API
  - Network inspection can verify single `/api/parts?include=...` call (optional assertion)
- **Gaps:** None identified. Plan states existing tests should pass without modification (`plan.md:642`), which is ideal.
- **Evidence:** `plan.md:625-643`, `tests/e2e/parts/part-list.spec.ts:1-50` shows existing patterns.

**Behavior: Shopping list filter with indicator data from consolidated response**

- **Scenarios:**
  - Given database has 10 parts, 3 on shopping lists
  - When user toggles "On Shopping List" filter
  - Then only 3 parts display
  - And summary shows "3 of 10 parts showing"
  - And filter correctly reads indicator data built from all parts (not filtered subset)
- **Instrumentation:**
  - `parts.waitForCards()` for filtered results
  - `parts.expectSummaryText(/3 of 10 parts showing/i)`
  - Filter toggle via `data-testid="parts.list.filter.onShoppingList"`
- **Backend hooks:**
  - `testData.shoppingLists.create()` with lines pointing to parts
- **Gaps:** None. Critical invariant (filter reads from **all** parts' indicators, not just filtered) is documented in plan.md:357-358 and section 6 derived values.
- **Evidence:** `plan.md:675-689`, `part-list.tsx:129-133` shows filter logic.

**Behavior: Kit indicator display remains accurate**

- **Scenarios:**
  - Given part is member of 2 active kits
  - When part card renders
  - Then kit indicator badge shows count "2"
  - And tooltip shows kit names sorted (active first, then alphabetical)
- **Instrumentation:**
  - `parts.cardByKey(partKey)` selector
  - Existing MembershipIndicator component handles display
- **Backend hooks:**
  - `testData.kits.create()` with parts
- **Gaps:** None. Summary building logic (`sortKits`, `createSummary`) explicitly referenced.
- **Evidence:** `plan.md:645-658`, `use-part-kit-memberships.ts:101-123`.

---

## 5) Adversarial Sweep (must find ≥3 credible issues or declare why none exist)

**Major — Null coalescing might not match existing behavior**

**Evidence:** `plan.md:481-487` states `part.kits ?? []` treats null as empty array, but existing hook `use-part-kit-memberships.ts:77` returns `usages: data ?? []` after API fetch. The types match, but plan doesn't verify backend guarantees non-null when `include=kits` is requested.

**Why it matters:** If backend omits `kits` field (not just sets it null), TypeScript `part.kits` would be `undefined`, not `null`, and `?? []` would still work. But if backend returns `kits: null` when no memberships exist, component sees empty array (correct). However, if backend returns `kits: null` when `include` param is missing (backend bug), component silently shows no indicators instead of failing fast.

**Fix suggestion:** In new `useAllParts` hook, after aggregating all pages, add assertion:
```typescript
if (allItems.length > 0 && allItems[0].kits === undefined) {
  throw new Error('Backend returned parts without kits field; include parameter may be missing');
}
```
This catches misconfiguration early. Apply same check for `shopping_lists` field. Add to `plan.md` section 8 (Errors & Edge Cases) under new subsection "Include parameter validation."

**Confidence:** High — Generated types show fields as `| null` not `| undefined`, so backend should always include them when requested, but defensive check is low-cost insurance.

**Major — Kit indicator loading scope changes without justification**

**Evidence:** `plan.md:149-155` and `part-list.tsx:150-155` show current implementation loads kit indicators for **filtered** parts only (after search/filters applied). Plan proposes building kit indicator map from **all** parts in consolidated response (`plan.md:286-299`). This is a behavior change.

**Why it matters:** If list has 1000 parts but user filters to 10, current implementation makes 10 kit API calls; new implementation includes kit data for all 1000 in single request (good), but then builds summaries for all 1000 (potentially wasteful if only 10 are displayed). More importantly, this changes the invariant: shopping indicators must cover all parts (for filter), but kit indicators only need filtered set (for display).

**Fix suggestion:** Plan should clarify whether to build kit indicator map for all parts (matching shopping indicators) or filtered parts (matching current behavior). If filtered, move indicator map building to `useMemo` that depends on `filteredParts`. If all, justify the computation cost (likely negligible for 1000 parts). Add explicit discussion to section 6 (Derived State) under "Kit indicator map" entry. Recommended: build for all parts (simpler, consistent with shopping indicators, enables future kit-based filtering without refactor).

**Confidence:** Medium — Both approaches work, but plan should explicitly choose and document the decision.

**Minor — Query invalidation key update might miss edge cases**

**Evidence:** `plan.md:88` lists `use-shopping-lists.ts:110` as needing invalidation key update. Grep shows this is inside `invalidateInventoryQueries` helper which is called by shopping list mutation hooks. But plan doesn't verify whether other files invalidate the same key outside this helper.

**Why it matters:** If scattered invalidation calls exist, they'll use stale keys after refactor, causing cache staleness.

**Fix suggestion:** Before deleting `useAllPartsWithLocations`, search codebase for all `'getPartsWithLocations'` string references (not just imports of the hook). Update all to new key convention. Grep performed earlier shows 2 production files (`part-list.tsx:52`, `use-shopping-lists.ts:110`) and several docs. Add verification step to `plan.md` section 14 (Implementation Slices) under Slice 2: "Search codebase for all string literal references to 'getPartsWithLocations' and update to new key."

**Confidence:** High — Grep already performed, only 2 files found, but plan should formalize this as a checklist item.

**Checks attempted (no additional issues found):**

- **Stale cache risk from React concurrent rendering:** Not applicable; `useMemo` derivations are synchronous and parts data comes from manual state, not concurrent Suspense.
- **Instrumentation phase ordering:** Plan preserves exact same `parts.list` scope and phases (`loading`, `ready`, `error`); no new events. Safe.
- **Type mismatch between backend and frontend summaries:** Types verified in sections above; `PartKitUsageSchema` and `PartShoppingListMembershipSchema` in consolidated response match existing hook expectations.
- **Filter logic correctness:** Verified shopping list filter must read from all parts (plan documents this in section 6, line 357-358). Search filter operates on unfiltered parts first, then applies shopping filter (correct order, line 129-133 of current code).

**Why the plan holds:** The refactor removes complexity (fewer API calls, fewer hooks, fewer async states) rather than adding it. Type compatibility is confirmed, indicator building logic is copied from existing hooks (not reimplemented), and instrumentation remains unchanged. The three findings above are clarifications and defensive checks, not fundamental blockers.

---

## 6) Derived-Value & State Invariants (table)

**Kit indicator map**

- **Derived value:** `Map<string, PartKitMembershipSummary>` built from parts response
- **Source dataset:** **Ambiguous** — Plan states "unfiltered input: `parts[].kits`" (line 338) but current code loads indicators only for filtered parts. See Adversarial Sweep finding above.
- **Write / cleanup triggered:** None; read-only map for card props
- **Guards:** Null check `part.kits ?? []`, empty array creates summary with `hasMembership: false`
- **Invariant:** Map keys match part keys exactly; no orphaned entries. Summary sorting preserves active-first order.
- **Evidence:** `plan.md:333-344`

**Shopping list indicator map**

- **Derived value:** `Map<string, ShoppingListMembershipSummary>` built from parts response
- **Source dataset:** **Unfiltered** — Must include ALL parts, not just filtered, because shopping list filter needs to query this map
- **Write / cleanup triggered:** None; read-only map for card props
- **Guards:** Null check `part.shopping_lists ?? []`, active filter `listStatus !== 'done' && lineStatus !== 'done'`, empty array creates summary with `hasActiveMembership: false`
- **Invariant:** Map MUST include ALL parts (not filtered subset), otherwise shopping list filter breaks. This is critical.
- **Evidence:** `plan.md:346-358`, `part-list.tsx:92-97` comment states "Load shopping list indicators for ALL parts (not just filtered)"

**Type name map (unchanged)**

- **Derived value:** `Map<number, string>` mapping type IDs to names
- **Source dataset:** Separate `useGetTypes()` query (React Query managed)
- **Write / cleanup triggered:** None
- **Guards:** Map.get returns undefined for missing types
- **Invariant:** Must remain available for search filtering (matches type name) and card display
- **Evidence:** `plan.md:360-367`, `part-list.tsx:83-89`

**Filtered parts array**

- **Derived value:** Subset of parts matching search + filters
- **Source dataset:** Unfiltered `parts` array, filtered by search term, hasStock, onShoppingList
- **Write / cleanup triggered:** None; derives new array on every change
- **Guards:** Sequential AND filters; missing values default to no match
- **Invariant:** Shopping list filter MUST read from indicator map built from ALL parts (not filtered subset). Filter application order matters: search first, then stock, then shopping list.
- **Evidence:** `plan.md:369-378`, `part-list.tsx:101-136`

**Sorted parts array**

- **Derived value:** Filtered parts sorted alphabetically by description
- **Source dataset:** `filteredParts` with locale-aware sort
- **Write / cleanup triggered:** None; creates new array reference for stable rendering
- **Guards:** Sort is case-insensitive with numeric awareness
- **Invariant:** Sort preserves filter results exactly; no additions or removals
- **Evidence:** `plan.md:380-387`, `part-list.tsx:138-141`

**Violation check:** Shopping list indicator map is correctly documented as requiring **unfiltered** input with guards against missing fields. No filtered-to-persistent-write risk identified. All derived values are read-only; no cache writes or cleanup happen.

---

## 7) Risks & Mitigations (top 3)

**Backend `include` parameter not working as expected**

- **Risk:** If backend doesn't populate `kits`, `shopping_lists`, or `locations` fields despite `include` parameter, UI shows parts without indicators (silent failure).
- **Mitigation:** Add defensive assertion after fetch: verify first item (if any) has expected fields defined (not undefined). Throw descriptive error if missing. Backend team confirms implementation complete, but this guards against regression. Test with real backend during development.
- **Evidence:** `plan.md:742-746`, `use-paginated-fetch-all.ts:50` shows `(api.GET as any)` bypasses type checking.

**Indicator summary building logic differs from existing hooks**

- **Risk:** If inline summary building deviates from `use-part-kit-memberships.ts:110-123` or `use-part-shopping-list-memberships.ts:83-104`, indicators show incorrect counts/names.
- **Mitigation:** Extract exact functions (`createSummary`, `sortKits`) into shared utility module under `src/lib/utils/parts-indicators.ts`. Both old hooks (if kept for detail pages) and new component use same code. Unit test the utility if confidence is low. Verify in Playwright that kit counts and names match expected values.
- **Evidence:** `plan.md:748-752`, existing hooks define summary logic.

**Missing query invalidation references cause stale data**

- **Risk:** If `['getPartsWithLocations']` is invalidated in files not identified by plan, those invalidations become no-ops after key change, leaving stale cache.
- **Mitigation:** Search codebase for all string literal occurrences of `'getPartsWithLocations'` (not just imports). Grep performed above found `part-list.tsx:52` and `use-shopping-lists.ts:110`. Update both to new convention. Document in implementation checklist. Note: since `usePaginatedFetchAll` doesn't use React Query cache, invalidation is "next mount will refetch" signal, not immediate refetch.
- **Evidence:** `plan.md:754-758`, grep results show 2 production files.

---

## 8) Confidence

**Confidence: High** — The backend change is complete and verified, type compatibility is demonstrated with line-number precision, the refactor eliminates complexity rather than adding it, existing instrumentation remains untouched (Playwright tests should pass as-is), and the research log shows thorough exploration of affected code. The four conditions in Section 1 are clarifications, not design flaws. Implementation is straightforward refactoring with clear patterns to follow from existing indicator hooks.

