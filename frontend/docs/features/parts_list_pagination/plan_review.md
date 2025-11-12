# Plan Review: Parts List Pagination

## 1) Summary & Decision

**Readiness**

The plan provides a comprehensive technical design for implementing automatic pagination in the parts list. It demonstrates strong understanding of the codebase architecture, includes detailed research findings, and proposes a straightforward sequential fetching approach. The instrumentation strategy is well-defined with proper test-event integration. However, several critical implementation gaps exist: the plan lacks concrete hook implementation details, contains a fundamental architectural mismatch with React Query's design patterns, omits required refetch-on-window-focus configuration, and underspecifies the Playwright backend coordination needed for multi-page test scenarios. The test coverage section describes scenarios but doesn't address backend factory performance concerns or provide guidance on managing 2500-part seed operations.

**Decision**

`GO-WITH-CONDITIONS` — The plan is implementable but requires clarification on the custom hook's state machine implementation, explicit TanStack Query configuration decisions (particularly around refetchOnWindowFocus), and concrete backend testing support for pagination scenarios. Address the Major findings below before implementation to prevent blocking issues during development.

---

## 2) Conformance & Fit (with evidence)

**Conformance to refs**

- `docs/commands/plan_feature.md` — Pass — `plan.md:1-758` — Plan follows all required sections (Research Log, Intent & Scope, Affected Areas, Data Model, API Surface, Algorithms, Derived State, Async Coordination, Errors, Observability, Lifecycle, Security, UX Impact, Test Plan, Slices, Risks, Confidence)

- `docs/product_brief.md` — Pass — `plan.md:43-49` — Aligns with product requirement: "Keep track of hobby electronics parts so you always know what you have" by enabling users to view all parts beyond the 50-item server limit

- `docs/contribute/architecture/application_overview.md` — Pass — `plan.md:92-95` — Follows documented pattern of custom hooks in `src/hooks/` wrapping generated API clients with domain-specific logic

- `docs/contribute/testing/playwright_developer_guide.md` — Partial — `plan.md:593-686` — Test scenarios properly rely on `waitForListLoading` and factory-based seeding, but Missing explicit backend coordination strategy for deterministic multi-page responses (see Major finding below)

- `docs/contribute/testing/index.md` — Pass — `plan.md:597-609,613-632` — Properly specifies API-first data setup via factories and instrumentation-driven assertions; correctly avoids request interception

**Fit with codebase**

- `src/components/parts/part-list.tsx` — Pass — `plan.md:96-99` — Correctly identifies line 35 as the `useGetPartsWithLocations()` call site and line 159 for instrumentation updates

- `src/lib/test/query-instrumentation.ts` — Pass — `plan.md:103-105,437-472` — Proper use of existing `useListLoadingInstrumentation` with extended metadata for pagination info

- `src/hooks/use-parts.ts` — Pass — `plan.md:94-95` — Correctly references this as the pattern for custom hooks wrapping generated API calls

- Generated API hooks pattern — Concern — `plan.md:496-526` — Plan describes a "pagination orchestrator" using `useEffect` to trigger sequential fetches, but does not specify whether the custom hook will use standard `useQuery` with manual refetch coordination or a more sophisticated state machine. This ambiguity could lead to race conditions or cache invalidation issues during implementation.

---

## 3) Open Questions & Ambiguities

**Question 1: Custom Hook Implementation Pattern**
- Question: Should `useAllPartsWithLocations` use a single `useQuery` with internal state to coordinate fetches, or maintain multiple query instances? How should the hook handle React Query's cache key to avoid conflicts with the generated hook?
- Why it matters: The plan describes sequential fetching (plan.md:229-246) but doesn't specify the TanStack Query mechanism. Using `useEffect` to trigger manual `refetch()` calls risks breaking React Query's declarative model and could cause cache thrashing during concurrent invalidations.
- Needed answer: Explicit decision on hook architecture—either (a) single `useQuery` with `enabled: false` + manual trigger, (b) separate internal `queryClient.fetchQuery` calls aggregated in state, or (c) wrapped `useQuery` with dynamic `queryKey` based on offset. Each has different cache and error handling implications.

**Research Finding**: TanStack Query's recommended pattern for sequential fetching is to use `queryClient.fetchQuery` in an effect or to leverage `useQueries` with dynamic array, not manual `refetch()` coordination. The plan should specify which approach to use and justify cache key strategy.

**Question 2: Backend Factory Performance Strategy**
- Question: How should test factories efficiently seed 2500 parts for multi-page scenarios without causing test timeouts?
- Why it matters: The plan acknowledges "Seeding 2500 parts may be slow in tests (performance consideration)" (plan.md:630-631) but defers with "Consider smaller test (e.g., 1500 parts → 2 pages)". This sidesteps the core requirement: validating the pagination logic handles 3+ pages correctly.
- Needed answer: Either (a) backend provides bulk-insert testing endpoint for efficient seeding, (b) tests accept longer timeouts for thorough coverage, or (c) plan confirms 2-page coverage (1001 parts) is sufficient and 3+ pages are out of scope for automated testing.

**Research Finding**: Checking `tests/api/factories/part-factory.ts` pattern would reveal if bulk creation is supported. The plan should either confirm factories support efficient batch operations or document the need for backend bulk-insert support.

**Question 3: Window Focus Refetch Configuration**
- Question: What is the exact React Query configuration for `refetchOnWindowFocus` in the custom hook?
- Why it matters: Plan notes "Consider adding `refetchOnWindowFocus: false`" and "Document decision in code comments" (plan.md:535-537) but leaves this as optional background work. For large inventories, this setting directly impacts user experience—refetching 10,000+ parts on every tab focus is unacceptable.
- Needed answer: Explicit configuration decision with justification. If disabled, document the trade-off (stale data risk vs. performance). If enabled, confirm the UX impact is acceptable.

---

## 4) Deterministic Playwright Coverage (new/changed behavior only)

**Behavior 1: Single-page load (< 1000 parts)**
- Scenarios:
  - Given backend has 50 parts, When user navigates to `/parts`, Then hook fetches one page, Then `list_loading:ready` emits with `paginationInfo.pagesFetched: 1` (`plan.md:597-610`)
- Instrumentation: `waitForListLoading(page, 'parts.list', 'ready')` + metadata assertions on `totalCount`, `paginationInfo.pagesFetched`
- Backend hooks: Factory seeding via `testData.parts.create()` loop
- Gaps: None identified
- Evidence: `plan.md:597-610`

**Behavior 2: Multi-page load (> 1000 parts)**
- Scenarios:
  - Given backend has 2500 parts, When user navigates to `/parts`, Then hook fetches 3 pages sequentially, Then all 2500 parts display (`plan.md:613-632`)
- Instrumentation: `waitForListLoading` + assertions on `totalCount === 2500` and `pagesFetched === 3`
- Backend hooks: Factory loop creating 2500 parts
- Gaps: **Major** — No specification for how backend ensures deterministic page boundaries during concurrent factory seeding. If parts are created sequentially via 2500 individual POST requests, there's risk of test timeout. Plan acknowledges "Seeding 2500 parts may be slow" but doesn't provide mitigation strategy or backend bulk-insert requirement.
- Evidence: `plan.md:624-631`

**Behavior 3: Empty list**
- Scenarios:
  - Given backend has zero parts, When user navigates to `/parts`, Then pagination completes immediately with empty state (`plan.md:651-666`)
- Instrumentation: `waitForListLoading` + `metadata.totalCount === 0` + `page.getByTestId('parts.list.empty')`
- Backend hooks: No seeding (clean database start)
- Gaps: None
- Evidence: `plan.md:651-666`

**Behavior 4: Exactly 1000 parts (boundary case)**
- Scenarios:
  - Given backend has exactly 1000 parts, When user navigates to `/parts`, Then hook fetches page 1 (1000 parts) + page 2 (empty), Then `pagesFetched === 2` (`plan.md:669-685`)
- Instrumentation: Standard `waitForListLoading` + boundary assertion
- Backend hooks: Factory loop creating exactly 1000 parts
- Gaps: None
- Evidence: `plan.md:669-685`

**Behavior 5: Pagination error handling**
- Scenarios:
  - Given backend returns error on second page fetch, When pagination encounters 500 error, Then `list_loading:error` emits and error card displays (`plan.md:635-649`)
- Instrumentation: `waitForListLoading(page, 'parts.list', 'error')`
- Backend hooks: **Major Gap** — Plan explicitly defers: "Difficult to test without backend support for error injection" and marks as "known gap" requiring "backend testing endpoint to inject errors mid-pagination" (`plan.md:643-649`)
- Gaps: **Major** — Missing backend coordination. Plan should either (a) require backend to implement deterministic error injection for pagination testing, or (b) accept that error path is tested only for first-page failures (existing coverage) and document the limitation.
- Evidence: `plan.md:635-649`

---

## 5) Adversarial Sweep (must find ≥3 credible issues or declare why none exist)

**Major — Custom Hook State Machine Undefined**

**Evidence:** `plan.md:496-526` — "Hook / effect: Custom React hook managing pagination state machine" with "Responsibilities: 1. Maintain internal offset counter (`currentOffset` state) 2. Trigger sequential queries via `useGetPartsWithLocations` with varying offsets 3. Accumulate results in internal array (`accumulatedParts` state)"

**Why it matters:** The plan describes maintaining `currentOffset` and `accumulatedParts` in React state, triggering queries via `useEffect` watching query results, but never specifies how to call the generated `useGetPartsWithLocations` hook with different offsets on each iteration. React hooks cannot be called conditionally or in loops. The described approach of "trigger sequential queries via `useGetPartsWithLocations` with varying offsets" is architecturally impossible with standard hook rules. This will block implementation immediately.

**Fix suggestion:** Specify one of these concrete approaches:
1. **Manual fetch pattern**: Use `queryClient.fetchQuery` in a `useEffect` with `async/await` loop, accumulate results in state, then return synthetic query state
2. **Dynamic query key**: Single `useQuery` with `queryKey: ['getPartsWithLocations', { offset: currentOffset }]`, manually trigger next fetch via state update when previous completes
3. **useQueries pattern**: Dynamically build query array as pages complete (less suitable for sequential requirement)

Research the TanStack Query docs and existing codebase patterns for sequential dependent queries. The fix must preserve React Query's declarative API and cache integration.

**Confidence:** High

---

**Major — Pagination Info Metadata Not Defined in Type System**

**Evidence:** `plan.md:166-184` — Data contract shows `paginationInfo?: { pagesFetched: number; limit: number }` added to instrumentation metadata, but no evidence that `src/types/test-events.ts` or the `ListLoadingTestEvent` type will be updated to include this optional field.

**Why it matters:** Playwright specs will assert on `event.metadata.paginationInfo.pagesFetched` (plan.md:602, 621), but if the TypeScript type for `ListLoadingTestEvent['metadata']` doesn't include `paginationInfo`, this will either cause type errors during implementation or silent test failures if the field is missing at runtime. The plan must ensure type safety end-to-end.

**Fix suggestion:** Add explicit file change in section 2 (Affected Areas):
- Area: `src/types/test-events.ts`
- Why: Extend `ListLoadingTestEvent['metadata']` interface to include optional `paginationInfo: { pagesFetched: number; limit: number }`
- Evidence: Required for type-safe instrumentation usage in `plan.md:164-184` and Playwright assertions in `plan.md:602,621`

Also verify that `useListLoadingInstrumentation` hook's `getReadyMetadata` callback return type allows arbitrary metadata properties or if it needs explicit typing.

**Confidence:** High

---

**Major — Cache Invalidation Strategy Incomplete for Partial Failure**

**Evidence:** `plan.md:327-360` — "Query Invalidation Strategy" describes standard invalidation via `queryClient.invalidateQueries({ queryKey: ['getPartsWithLocations'] })` but error handling section (plan.md:365-379) states "Partial results discarded (do not display incomplete dataset)" when any page fails.

**Why it matters:** If pagination fetches pages 1-2 successfully then page 3 fails, the plan says "partial results discarded" but doesn't specify what gets written to the React Query cache under key `['getPartsWithLocations']`. Does the hook return `error` state with `data: undefined`, leaving stale previous data in cache? Or does it explicitly clear cache on error? Mutation invalidation will then trigger refetch—will it restart from offset 0 or remember the failed offset? This ambiguity risks displaying stale data or infinite retry loops.

**Fix suggestion:** In section 8 (Errors & Edge Cases), add explicit cache behavior on pagination failure:
- Hook must return `{ data: undefined, error: <error> }` when any page fails (do not populate cache with partial results)
- Include cleanup step: on error, explicitly set accumulated state to empty array before returning error state
- Confirm invalidation-triggered refetch always starts from offset 0 (full re-pagination)
- Document in algorithm flow (section 5) the error path: "On error: discard accumulated pages, return undefined data, surface error to component"

**Confidence:** High

---

**Major — Backend Pagination Consistency Risk Unmitigated**

**Evidence:** `plan.md:395-405` — "Failure: Backend inconsistency during pagination (offset drift)" with "Handling: Accepted as eventual consistency trade-off" and "Guardrails: No special handling; rely on user-triggered refresh for consistency"

**Why it matters:** This is not a rare edge case—it's a deterministic failure mode for any active inventory. If a user is viewing the parts list while another device adds part 1001 during page 2 fetch, the aggregated results will contain duplicates or skip items. The plan correctly identifies the issue but provides no UX mitigation (e.g., warning banner, optimistic locking, pagination tokens). More critically, Playwright tests that seed data concurrently with pagination could exhibit flaky failures when backend processing doesn't match offset boundaries. The plan must either (a) accept the limitation with explicit documentation for users and tests, or (b) propose backend pagination token support as a follow-up dependency.

**Fix suggestion:** Strengthen section 8 (Errors & Edge Cases) entry:
1. Escalate user-facing impact: Add UX documentation requirement—UI should display timestamp of data snapshot or add manual refresh button with clear semantics ("Reload to ensure consistency")
2. Test guidance: Add note to section 13 (Deterministic Test Plan): "All factory seeding must complete before navigation to `/parts` to ensure deterministic pagination boundaries. Use sequential `await` for factory loops, not parallel `Promise.all`."
3. Technical debt ticket: Log follow-up for backend pagination cursor support (return `cursor` token with each page, pass on next request instead of numeric offset) to prevent drift in future releases

**Confidence:** Medium (issue is real, but "eventual consistency trade-off" may be acceptable for MVP; needs explicit acknowledgment and test guardrails)

---

**Minor — Window Focus Refetch Decision Deferred**

**Evidence:** `plan.md:527-537` — "Background Work: Query Refetch on Window Focus" with "Consider adding `refetchOnWindowFocus: false`" and "Document decision in code comments"

**Why it matters:** This is framed as optional background work, but for large inventories (10,000+ parts requiring 10+ sequential fetches), automatic refetch on window focus creates unacceptable UX. Plan should make explicit decision now rather than defer, since it affects query configuration in the initial implementation.

**Fix suggestion:** Promote to explicit configuration decision in section 4 (API / Integration Surface):
- Add query options to surface description: `useGetPartsWithLocations` will be called with `{ refetchOnWindowFocus: false, refetchOnReconnect: false }` to prevent slow re-pagination on tab focus
- Justify trade-off: Users accept stale data after leaving tab; manual refresh available via navigation or mutation invalidation
- Remove from "Background Work" section—this should ship with initial implementation, not as follow-up

**Confidence:** Medium

---

**Minor — Instrumentation 200ms Debounce Preservation Not Verified**

**Evidence:** `plan.md:255` — "Existing 200ms debounce preserved" in refetch flow, referencing `src/components/parts/part-list.tsx:53-75`, but custom hook returns `isLoading` boolean directly from internal state (plan.md:307-321). Component currently debounces `showLoading` state based on `partsLoading || partsFetching` (component lines 43-75), but plan doesn't verify this debounce logic will work correctly with custom hook's loading semantics.

**Why it matters:** If custom hook's `isLoading` represents "any page in-flight during initial load" (plan.md:308), it may have different timing characteristics than the generated hook's `isLoading`. The component's debounce logic assumes `isLoading` transitions from `true → false` happen within ~200ms for quick loads, but multi-page fetch could take seconds. This might cause unexpected loading flash behavior.

**Fix suggestion:** In section 5 (Algorithms & UI Flows), clarify loading state contract:
- Custom hook's `isLoading: true` should remain stable across all page fetches during initial load (never flicker between pages)
- Confirm component's existing 200ms debounce logic (`hideLoadingTimeoutRef`) will work correctly—minimum 200ms display, but gracefully handle multi-second loads
- Add explicit note: "Component debounce prevents flashing on quick single-page loads (<200ms), but does not hide multi-page loading progress"

**Confidence:** Low (likely works as-is, but worth explicit verification)

---

## 6) Derived-Value & State Invariants (table)

**Derived value 1: Aggregated Parts Array**
- Source dataset: Unfiltered — Multiple paginated API responses (`GET /api/parts/with-locations` with offsets 0, 1000, 2000, ...)
- Write / cleanup triggered: Custom hook maintains aggregated array in React state; React Query cache stores final combined result under `['getPartsWithLocations']` key (plan.md:273-288, 327-329)
- Guards: Sequential fetching ensures pages accumulate in order; error on any page discards all accumulated data (plan.md:281-283)
- Invariant: Aggregated array must represent complete dataset (all pages fetched) OR be empty (on error/loading); never expose partial dataset to component (plan.md:284-287)
- Evidence: `plan.md:271-288`
- **Flag**: Uses **unfiltered** source (raw backend responses) to build **persistent** derived state (React Query cache), but plan.md:369-378 specifies partial results are discarded on error. Guarded by error handling—no write to cache if pagination incomplete. **Pass with verification**: Confirm custom hook implementation never calls `queryClient.setQueryData(['getPartsWithLocations'], partialResults)` on error path.

---

**Derived value 2: Total Parts Count**
- Source dataset: Filtered — Computed from `allParts.length` after complete pagination, then used in instrumentation metadata and UI count display (plan.md:290-305)
- Write / cleanup triggered: Passed to `useListLoadingInstrumentation` as `metadata.totalCount`, written to test-event payloads for Playwright assertions; drives `ListScreenCounts` component rendering (plan.md:296-297)
- Guards: Loading state prevents count display until all pages fetched; count calculation happens in `useMemo` dependent on complete `allParts` array (plan.md:299-300)
- Invariant: `totalCount === Σ(pageN.length)` across all fetched pages; must remain stable during client-side filtering (total ≠ visible) (plan.md:302-304)
- Evidence: `plan.md:290-305`
- **Pass**: Filtering happens client-side after aggregation, so total count correctly reflects unfiltered backend state. Instrumentation separates `totalCount` (unfiltered) from `visibleCount` (filtered), maintaining correct semantics.

---

**Derived value 3: Pagination Progress (isLoading)**
- Source dataset: Filtered — Custom hook internal state tracking fetch progress; true from component mount until final page confirms completion (plan.md:307-321)
- Write / cleanup triggered: Drives skeleton display in component (plan.md:313); gates instrumentation `list_loading:ready` event emission until false (plan.md:314)
- Guards: Transition to false is atomic with `data` availability; must remain true until final page confirms pagination complete (plan.md:316-317)
- Invariant: `isLoading === true` implies `data` is empty or stale; `!isLoading && !error` implies `data` contains complete dataset (plan.md:319-320)
- Evidence: `plan.md:307-321`
- **Pass**: Loading state is internal to hook and only surfaces as `false` when aggregation completes. No risk of premature write.

---

**Derived value 4: Pagination Metadata for Instrumentation**
- Source dataset: Filtered — Derived from custom hook's internal page counter (`pagesFetched`) and configured `limit` constant (1000) (plan.md:163-184)
- Write / cleanup triggered: Included in `list_loading:ready` event metadata for Playwright assertions (plan.md:461-467); no persistent storage
- Guards: Only emitted when `phase: 'ready'`, ensuring pagination completed successfully (plan.md:442-443)
- Invariant: `pagesFetched` must equal actual API calls made; `limit` must match configured value (1000); both must be present when pagination used >1 page (plan.md:462-464)
- Evidence: `plan.md:437-472`
- **Pass**: Metadata is ephemeral (test-event payload only), derived from internal hook state, and guarded by successful completion. No persistent write risk.

---

## 7) Risks & Mitigations (top 3)

**Risk 1: Sequential page fetching causes unacceptable load times for large inventories**
- Mitigation: Plan acknowledges this with "Accept slow loading for initial release (rare case)" and "Document known limitation in code comments" (plan.md:711-717). Proposes parallel fetching or progressive rendering as future enhancement.
- Evidence: `plan.md:711-717`
- **Recommendation**: Add explicit performance baseline to plan—define "acceptable" loading time (e.g., "10,000 parts = 10 sequential requests ≈ 10-15 seconds acceptable for MVP"). If baseline is unknown, add user research dependency to validate assumption before implementation.

---

**Risk 2: Custom hook implementation pattern ambiguity blocks development**
- Mitigation: Currently unmitigated—plan describes state machine responsibilities but not concrete React Query integration approach (see Major finding above).
- Evidence: `plan.md:496-526`
- **Recommendation**: Clarify hook architecture before implementation starts. Proposed fix: Research TanStack Query sequential fetch patterns, choose between `queryClient.fetchQuery` loop or dynamic `queryKey` approach, document decision in plan with code sketch.

---

**Risk 3: Backend data drift during pagination causes duplicate/missing items**
- Mitigation: Plan accepts eventual consistency trade-off, relies on user manual refresh (plan.md:395-405, 732-737).
- Evidence: `plan.md:732-737`
- **Recommendation**: Strengthen mitigation by adding test guidance (sequential factory seeding, not parallel) and UX documentation requirement (display data timestamp or refresh affordance). Consider logging technical debt ticket for backend cursor-based pagination.

---

## 8) Confidence

**Confidence: Medium** — The plan demonstrates strong domain knowledge and comprehensive coverage of most implementation aspects, but critical gaps in the custom hook's React Query integration pattern, incomplete type system updates for instrumentation metadata, and deferred decisions on window focus refetch configuration create implementation blockers. The test strategy is sound conceptually but underspecified regarding backend factory performance and error injection support. After resolving the Major findings (particularly the hook state machine architecture and cache invalidation behavior on error), confidence would rise to High.
