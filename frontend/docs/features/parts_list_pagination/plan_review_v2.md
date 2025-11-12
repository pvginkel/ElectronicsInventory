# Plan Review v2: Parts List Pagination

## 1) Summary & Decision

**Readiness**

The updated plan addresses all five Major findings from the first review with concrete, implementable solutions. The custom hook architecture now specifies a manual `queryClient.fetchQuery` loop pattern (lines 554-594), the type system updates include explicit `paginationInfo` extension to `test-events.ts` (lines 106-115), cache invalidation behavior on pagination errors is thoroughly defined with explicit cleanup steps (lines 387-405), backend consistency risks include detailed test guidance with sequential factory seeding (lines 433-460), and the window focus refetch configuration decision is documented with explicit query options (lines 595-612). The plan demonstrates production-ready technical depth with clear separation of concerns, deterministic test coverage, and realistic acknowledgment of limitations. All implementation paths are concrete and actionable.

**Decision**

`GO` — The plan is ready for implementation. All blocking ambiguities have been resolved with explicit technical decisions. The remaining known limitations (sequential fetch performance, offset-based pagination drift) are appropriately scoped for MVP with clear technical debt tracking and user-facing mitigations documented.

---

## 2) Conformance & Fit (with evidence)

**Conformance to refs**

- `docs/commands/plan_feature.md` — Pass — `plan.md:1-832` — Plan maintains all required sections with updates addressing review findings

- `docs/product_brief.md` — Pass — `plan.md:43-49` — Unchanged alignment with product requirement to view all parts beyond 50-item limit

- `docs/contribute/architecture/application_overview.md` — Pass — `plan.md:554-594` — Now explicitly follows manual `queryClient.fetchQuery` pattern, which aligns with React Query's design for sequential dependent queries

- `docs/contribute/testing/playwright_developer_guide.md` — Pass — `plan.md:433-460` — Test scenarios now include explicit backend coordination strategy: sequential factory seeding with `await` loops, no parallel `Promise.all` for multi-part seeding

- `docs/contribute/testing/index.md` — Pass — `plan.md:686-710` — Properly specifies API-first data setup with deterministic sequential seeding to prevent offset drift

**Fit with codebase**

- `src/components/parts/part-list.tsx` — Pass — `plan.md:96-99` — Component integration point unchanged; correctly identified

- `src/lib/test/query-instrumentation.ts` — Pass — `plan.md:103-105, 494-527` — Instrumentation metadata extension properly specified with type-safe contract

- `src/types/test-events.ts` — Pass — `plan.md:106-115` — NEW: Explicit type extension for `paginationInfo` field added to affected areas, resolving type safety gap from first review

- `src/hooks/use-parts.ts` — Pass — `plan.md:554-594` — Custom hook now follows concrete implementation pattern using `queryClient.fetchQuery` in async loop, consistent with TanStack Query best practices for sequential fetching

- Generated API hooks pattern — Pass — `plan.md:554-577` — Resolved: Plan now specifies manual fetch pattern with `useQueryClient()` + `useEffect` managing async pagination loop, avoiding hooks-rules violations

---

## 3) Open Questions & Ambiguities

No blocking open questions remain. All ambiguities from the first review have been addressed:

**Resolved Question 1: Custom Hook Implementation Pattern**
- Original uncertainty: "Should `useAllPartsWithLocations` use a single `useQuery` with internal state to coordinate fetches, or maintain multiple query instances?"
- Resolution: `plan.md:554-577` now explicitly specifies manual `queryClient.fetchQuery` loop in `useEffect` with state accumulation pattern, including code sketch showing async/await pagination loop
- Evidence: Architecture decision documented with clear rationale: "Cannot call `useGetPartsWithLocations` multiple times with different offsets (violates hooks rules)"

**Resolved Question 2: Backend Factory Performance Strategy**
- Original uncertainty: "How should test factories efficiently seed 2500 parts for multi-page scenarios without causing test timeouts?"
- Resolution: `plan.md:433-460` adds explicit test guidance requiring sequential `await` factory loops (not parallel) with example test structure; accepts slower seeding as necessary for deterministic boundaries
- Evidence: "Use sequential `await` for factory loops: `for (let i = 0; i < 2500; i++) { await testData.parts.create(...) }`" (line 436)

**Resolved Question 3: Window Focus Refetch Configuration**
- Original uncertainty: "What is the exact React Query configuration for `refetchOnWindowFocus` in the custom hook?"
- Resolution: `plan.md:595-612` promotes this to explicit configuration decision with `refetchOnWindowFocus: false`, `refetchOnReconnect: false`, `staleTime: 5 * 60 * 1000` (5 minutes), including rationale and user impact documentation
- Evidence: "Disable automatic refetch on window focus and reconnect" with detailed trade-off analysis (lines 598-609)

---

## 4) Deterministic Playwright Coverage (new/changed behavior only)

**Behavior 1: Single-page load (< 1000 parts)**
- Scenarios:
  - Given backend has 50 parts, When user navigates to `/parts`, Then hook fetches one page, Then `list_loading:ready` emits with `metadata.paginationInfo.pagesFetched: 1` (`plan.md:670-683`)
- Instrumentation: `waitForListLoading(page, 'parts.list', 'ready')` + assertions on `event.metadata.totalCount` and `event.metadata.paginationInfo.pagesFetched`
- Backend hooks: Factory seeding via `testData.parts.create()` loop
- Gaps: None
- Evidence: `plan.md:670-683`

**Behavior 2: Multi-page load (> 1000 parts)**
- Scenarios:
  - Given backend has 2500 parts (requires 3 page fetches), When user navigates to `/parts`, Then hook fetches pages 1-3 sequentially, Then all 2500 parts display (`plan.md:686-706`)
- Instrumentation: `waitForListLoading` + `totalCount === 2500` + `paginationInfo.pagesFetched === 3`
- Backend hooks: Sequential factory seeding with explicit guidance: "Use sequential `await` for factory loops" (line 436)
- Gaps: None — Resolved: Plan now includes explicit test guidance (lines 433-460) ensuring deterministic pagination boundaries via sequential seeding before navigation
- Evidence: `plan.md:686-706, 433-460`

**Behavior 3: Empty list**
- Scenarios:
  - Given backend has zero parts, When user navigates to `/parts`, Then pagination completes immediately with `metadata.totalCount: 0` (`plan.md:725-738`)
- Instrumentation: `waitForListLoading` + `page.getByTestId('parts.list.empty')`
- Backend hooks: No seeding (clean start)
- Gaps: None
- Evidence: `plan.md:725-738`

**Behavior 4: Exactly 1000 parts (boundary case)**
- Scenarios:
  - Given backend has exactly 1000 parts, When user navigates to `/parts`, Then hook fetches page 1 (1000 parts) + page 2 (empty), Then `pagesFetched === 2` (`plan.md:743-757`)
- Instrumentation: `waitForListLoading` + boundary assertion on `pagesFetched`
- Backend hooks: Factory loop creating exactly 1000 parts
- Gaps: None
- Evidence: `plan.md:743-757`

**Behavior 5: Pagination error handling**
- Scenarios:
  - Given backend returns error on any page fetch, When pagination encounters error, Then `list_loading:error` emits and error card displays (`plan.md:708-722`)
- Instrumentation: `waitForListLoading(page, 'parts.list', 'error')`
- Backend hooks: Acknowledged limitation — Plan documents this as "Deferred: Mark as known gap; requires backend testing endpoint to inject errors mid-pagination" (lines 718-722)
- Gaps: Minor (acceptable for MVP) — Backend lacks deterministic error injection for pagination scenarios; error path tested only for first-page failures via existing error handling coverage
- Evidence: `plan.md:708-722`

---

## 5) Adversarial Sweep (must find ≥3 credible issues or declare why none exist)

All Major findings from the first review have been addressed. Performing adversarial checks on the updated plan:

**Check 1: Cache Key Conflicts Between Individual Pages and Aggregated Result**
- Targeted invariant: Custom hook uses `queryClient.fetchQuery` with `queryKey: ['getPartsWithLocations', { limit: 1000, offset }]` (line 566), then stores final result under `['allPartsWithLocations']` (line 593). Risk: Individual page caches could conflict with component expectations or mutation invalidations.
- Evidence: `plan.md:566, 593` — "Cache Key Strategy: Use separate cache key `['allPartsWithLocations']` for aggregated result to avoid conflicts with individual page queries"
- Why the plan holds: Explicit separation of individual page caches (parameterized by offset) from aggregated result cache prevents conflicts. Mutations invalidate `['getPartsWithLocations']` which won't directly match `['allPartsWithLocations']`, so custom hook must track invalidation manually.
- **Finding: Minor potential gap** — How does custom hook detect when mutations invalidate the underlying `['getPartsWithLocations']` queries? Plan mentions "track manual invalidation flag in state" (line 581) but doesn't specify the mechanism. Is this a subscription to the query cache, or does the hook re-run on props change?

**Minor — Invalidation Detection Mechanism Underspecified**

**Evidence:** `plan.md:580-582` — "On invalidation: track manual invalidation flag in state, re-trigger pagination loop"

**Why it matters:** The hook uses a separate cache key `['allPartsWithLocations']` for the aggregated result (line 593), but mutations call `queryClient.invalidateQueries({ queryKey: ['getPartsWithLocations'] })` (existing pattern from `part-list.tsx:49`). If the custom hook doesn't subscribe to invalidation events on the base query key pattern, it won't detect when mutations require refetch. The plan mentions "track manual invalidation flag" but doesn't specify how this flag gets set (query cache subscription, context, or other mechanism).

**Fix suggestion:** Add explicit invalidation detection mechanism in section 10 (Lifecycle & Background Work):
- Option A: Hook subscribes to query cache events matching `['getPartsWithLocations']` pattern (excluding specific offset params) via `queryClient.getQueryCache().subscribe(event => ...)` and sets invalidation flag on matching events
- Option B: Component-level effect watches for mutations completing and explicitly calls custom hook's refetch method (breaks encapsulation)
- Option C: Custom hook uses `useQuery` with `queryKey: ['allPartsWithLocations']` and mutations explicitly invalidate both `['getPartsWithLocations']` and `['allPartsWithLocations']` (requires mutation updates)

Recommend Option A or C for proper encapsulation. Document the chosen approach in the hook lifecycle section.

**Confidence:** Medium (implementation may handle this correctly via implicit TanStack Query behavior, but explicit documentation prevents confusion)

---

**Check 2: Race Condition Between Pagination Loop and Component Unmount**
- Targeted invariant: Hook uses abort signal to cancel in-flight requests on unmount (line 589). Risk: If component unmounts mid-pagination, accumulated state could leak or emit incomplete instrumentation events.
- Evidence: `plan.md:589-591` — "Cleanup: Track abort signal in ref, cancel in-flight requests on unmount; Reset accumulated state before starting new pagination sequence; Clear pagination state on error"
- Why the plan holds: Abort controller cleanup is documented, and `useListLoadingInstrumentation` already emits `phase: 'aborted'` on unmount (query-instrumentation.ts:218-235). Hook's cleanup will cancel fetch promises and prevent state updates on unmounted component. Instrumentation hook's cleanup effect handles abort event emission.
- **Pass**: Proper coordination between fetch cancellation and instrumentation abort events.

---

**Check 3: Loading State Flicker Between Pages**
- Targeted invariant: Custom hook's `isLoading` should remain stable during multi-page fetch, not flicker between each page request (line 308: "true from component mount until final page confirms completion")
- Evidence: `plan.md:307-321` — Derived value definition states `isLoading` transitions only once from true to false after all pages complete
- Why the plan holds: Manual state management (`setIsLoadingPages(false)` only after loop completes) ensures stable loading state. Hook doesn't expose individual page loading states to component. Component's existing 200ms debounce (lines 53-75) provides additional flicker protection for quick loads.
- **Pass**: Loading state contract is explicit and prevents flicker. Component debounce adds redundant protection but doesn't conflict.

---

**Check 4: Error on Final Page Doesn't Clear Accumulated Data**
- Targeted invariant: "Partial results discarded (do not display incomplete dataset)" (line 369)
- Evidence: `plan.md:387-405` — NEW: Explicit error path flow including "4. Clear accumulated parts: `setAccumulatedParts([])`" and "6. Do not call `queryClient.setQueryData(['allPartsWithLocations'], ...)`"
- Why the plan holds: Resolved from first review — Plan now includes explicit cleanup step clearing accumulated state on error (line 394) and confirms cache is not populated with partial results (line 399). Hook returns `{ data: undefined, error }` which prevents component from displaying partial data.
- **Pass**: Error path is thoroughly specified with explicit guardrails preventing partial data exposure.

---

**Adversarial Summary:**

Found 1 Minor issue (invalidation detection mechanism underspecified) but no blocking concerns. All Major findings from first review have been properly addressed with concrete implementation details. The plan demonstrates defensive design with explicit error paths, cache cleanup, and state invariants.

---

## 6) Derived-Value & State Invariants (table)

**Derived value 1: Aggregated Parts Array**
- Source dataset: Unfiltered — Multiple paginated API responses from `GET /api/parts/with-locations` with offsets 0, 1000, 2000, ...
- Write / cleanup triggered: Accumulated in React state during pagination loop (`allParts.push(...data)` per line 570), then written to React Query cache under `['allPartsWithLocations']` after successful completion; cleared on error via `setAccumulatedParts([])` (line 394)
- Guards: Sequential fetching ensures pages accumulate in order (line 283); error on any page triggers explicit state clear (line 394); no cache write on error (line 399)
- Invariant: Array must represent complete dataset (all pages fetched) OR be empty/undefined (on error/loading); never expose partial dataset to component (lines 284-287, 396)
- Evidence: `plan.md:271-288, 387-405`
- **Pass**: Guards are explicit and comprehensive. Error path cleanup added in v2 prevents partial data exposure.

---

**Derived value 2: Total Parts Count**
- Source dataset: Filtered — Computed from `allParts.length` after complete pagination (line 291)
- Write / cleanup triggered: Passed to instrumentation metadata as `totalCount` (line 513); drives `ListScreenCounts` UI (line 297)
- Guards: Loading state prevents count exposure until all pages fetched (line 300); count calculation in `useMemo` dependent on complete array (line 299)
- Invariant: `totalCount === Σ(pageN.length)` across all fetched pages; must remain stable during client-side filtering (total ≠ visible) (lines 302-304)
- Evidence: `plan.md:290-305`
- **Pass**: Instrumentation separates `totalCount` (unfiltered) from `visibleCount` (filtered), maintaining correct semantics for test assertions.

---

**Derived value 3: Loading State (isLoading)**
- Source dataset: Filtered — Custom hook internal state (`isLoadingPages`) tracking pagination progress (lines 558, 585)
- Write / cleanup triggered: Drives skeleton display in component; gates instrumentation `list_loading:ready` event emission (lines 313-314)
- Guards: Remains true until final page confirms completion (line 316); atomic transition to false with data availability (line 317)
- Invariant: `isLoading === true` implies `data` is empty or stale; `!isLoading && !error` implies `data` contains complete dataset (lines 319-320)
- Evidence: `plan.md:307-321, 554-594`
- **Pass**: Loading state is internal to hook and only transitions once after full aggregation. No risk of premature false state.

---

**Derived value 4: Pagination Metadata**
- Source dataset: Filtered — Derived from hook's internal page counter and configured limit constant (lines 517-520)
- Write / cleanup triggered: Included in `list_loading:ready` event metadata for Playwright assertions (line 519); ephemeral, no persistent storage
- Guards: Only emitted when `phase: 'ready'` after successful pagination (line 248)
- Invariant: `pagesFetched` must equal actual API calls made; `limit` must match configured value (1000); both present when pagination used multiple pages (lines 517-520)
- Evidence: `plan.md:494-527`
- **Pass**: Metadata is ephemeral (test-event payload only) and type-safe (explicit `test-events.ts` extension in lines 106-115).

---

## 7) Risks & Mitigations (top 3)

**Risk 1: Sequential page fetching causes slow load times for large inventories**
- Mitigation: Plan accepts this limitation for MVP with explicit documentation (line 788: "Accept slow loading for initial release"). Disables automatic refetch on window focus to prevent repeated slow loads (lines 595-612). Future enhancement logged as technical debt: parallel fetching or progressive rendering.
- Evidence: `plan.md:785-791, 595-612`
- **Assessment:** Properly scoped for MVP. Mitigation (disabled auto-refetch) prevents compounding the UX issue. Performance baseline documented (10,000 parts = 10+ sequential requests).

---

**Risk 2: Backend data drift during pagination causes duplicates/missing items**
- Mitigation: Strengthened in v2 — Now includes explicit test guidance requiring sequential factory seeding (lines 433-460), UX documentation for refresh affordance (line 430), and technical debt ticket for cursor-based pagination (lines 454-456).
- Evidence: `plan.md:420-461, 807-811`
- **Assessment:** Properly mitigated for MVP. Test guidance ensures deterministic Playwright runs. User-facing limitation documented with manual refresh escape hatch. Backend enhancement path identified.

---

**Risk 3: Type safety gap in instrumentation metadata**
- Mitigation: Resolved from first review — `src/types/test-events.ts` extension explicitly added to affected areas (lines 106-115) with concrete type definition for `paginationInfo` field.
- Evidence: `plan.md:106-115`
- **Assessment:** No longer a risk. Type system updates included in implementation scope ensure end-to-end type safety from hook to Playwright assertions.

---

## 8) Confidence

**Confidence: High** — The plan is implementation-ready with all blocking ambiguities resolved. The custom hook architecture uses a well-documented TanStack Query pattern (manual `queryClient.fetchQuery` loop), type system updates are explicit and concrete, error handling includes comprehensive cleanup paths, and test coverage accounts for deterministic factory seeding requirements. The one Minor finding (invalidation detection mechanism) is a documentation improvement, not a blocker—implementation will likely handle this correctly via standard React Query cache observation, but explicit documentation would prevent confusion. The plan demonstrates mature engineering judgment by accepting appropriate MVP limitations (sequential fetch performance, offset-based pagination drift) with clear mitigations and technical debt tracking.

---

## Summary of Changes from First Review

**Major Findings Addressed:**

1. **Custom Hook State Machine** — Resolved: Lines 554-594 specify concrete manual `queryClient.fetchQuery` loop pattern with code sketch
2. **Pagination Info Type Definition** — Resolved: Lines 106-115 add explicit `test-events.ts` extension to affected areas
3. **Cache Invalidation on Error** — Resolved: Lines 387-405 define explicit error path with state cleanup and cache non-population
4. **Backend Consistency Risk** — Resolved: Lines 433-460 add test guidance for sequential factory seeding with example structure
5. **Window Focus Refetch** — Resolved: Lines 595-612 promote to explicit configuration decision with query options and rationale

**Minor Findings Addressed:**

1. **Instrumentation Debounce** — Verified: Loading state contract (lines 307-321) confirms stable `isLoading` across pages, compatible with component's 200ms debounce

**New Minor Finding:**

1. **Invalidation Detection Mechanism** — Underspecified but non-blocking; implementation can proceed with documentation improvement recommended

**Recommendation:** Proceed to implementation. Address the Minor invalidation detection documentation gap during development when the mechanism becomes clear in code. All critical decisions are locked and technically sound.
