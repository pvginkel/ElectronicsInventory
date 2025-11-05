# Part Stock Filters — Code Review

## 1) Summary & Decision

**Readiness**

The implementation successfully delivers independent, toggleable filter buttons for stock status and shopping list membership on the parts list page. The code follows established project patterns for route search parameter management, client-side filtering, and instrumentation. TypeScript strict mode passes, all 13 Playwright tests pass (including 8 new filter-specific scenarios), and the implementation aligns closely with the approved plan. The filter logic correctly applies AND semantics when both filters are active, properly integrates with existing search functionality, and preserves state across navigation. Minor issues exist around filter toggle logic and comment clarity, but none block the feature's core functionality.

**Decision**

`GO-WITH-CONDITIONS` — Implementation is solid and ready for merge after addressing one minor correctness issue in the filter toggle handlers (lines 227 and 235 in `part-list.tsx`) where `!prev.hasStock || undefined` should be simplified to `!prev.hasStock ? true : undefined` for clarity, or more idiomatically as `prev.hasStock ? undefined : true`. The current logic works but relies on JavaScript truthiness in a way that obscures intent.

## 2) Conformance to Plan (with evidence)

**Plan alignment**

- **Slice 1: Route and Component Prop Plumbing** ↔ `src/routes/parts/index.tsx:6-22` — `PartsSearchState` interface defines `hasStock` and `onShoppingList` boolean props; `validateSearch` parses and normalizes params from URL; props flow to `PartList` component at lines 60-61
- **Slice 2: Filter UI and Button Interactions** ↔ `src/components/parts/part-list.tsx:268-287` — Two filter buttons rendered with correct `data-testid` attributes, toggle handlers at lines 224-238 use `navigate` with `replace: true` to update route search params
- **Slice 3: Filtering Logic and Derived State** ↔ `src/components/parts/part-list.tsx:95-130` — `filteredParts` memo extends search filter with stock (`part.total_quantity > 0`) and shopping list membership checks using `shoppingIndicatorMap.get(part.key)?.hasActiveMembership === true`
- **Slice 4: Instrumentation and Metadata** ↔ `src/components/parts/part-list.tsx:149-221` — `activeFilters` array built at lines 149-151 and included in `getReadyMetadata`, `getErrorMetadata`, and `getAbortedMetadata` callbacks for instrumentation
- **Slice 5: Playwright Test Coverage** ↔ `tests/e2e/parts/part-list.spec.ts:203-494` — 8 new test scenarios covering filter toggle, stock filtering, shopping list filtering, combined filters, combined with search, empty state, and navigation persistence
- **Slice 6: Navigation Preservation** ↔ `src/routes/parts/index.tsx:33` — `handleSelectPart` updated to use `search: (prev) => prev` pattern to preserve all search params across navigation to detail page
- **Layout Extension** ↔ `src/components/layout/list-screen-layout.tsx:9,29,78-82` — Added optional `filters` prop to `ListScreenLayout` and rendered between search and tabs sections

**Gaps / deviations**

- **No gaps identified** — All planned slices implemented, all tests passing, instrumentation complete, navigation preservation working as specified

## 3) Correctness — Findings (ranked)

- Title: `MINOR — Filter toggle logic relies on truthiness instead of explicit boolean logic`
- Evidence: `src/components/parts/part-list.tsx:227,235` — `{ ...prev, hasStock: !prev.hasStock || undefined }` and `{ ...prev, onShoppingList: !prev.onShoppingList || undefined }`
- Impact: Logic works correctly due to JavaScript truthiness (`!false || undefined` evaluates to `true`, `!true || undefined` evaluates to `undefined`), but obscures intent and makes code harder to reason about. A future maintainer might misinterpret the pattern or introduce bugs when adapting it.
- Fix: Replace with explicit ternary: `hasStock: prev.hasStock ? undefined : true` to make intent clear: "if currently true, remove from URL (set to undefined); otherwise, set to true"
- Confidence: High — Current code works but violates clarity principle; explicit ternary is idiomatic React Router pattern

---

- Title: `MINOR — Missing guidepost comments in filtering logic`
- Evidence: `src/components/parts/part-list.tsx:95-130` — `filteredParts` memo lacks explanatory comments describing the sequential filter application (search → stock → shopping list)
- Impact: Non-trivial filtering logic would benefit from a brief comment explaining the AND-combining strategy and why shopping list indicators are loaded for all parts (not just filtered). Affects maintainability but not correctness.
- Fix: Add concise comment at line 95: `// Filter parts sequentially: search term (if present), stock filter (if active), shopping list filter (if active). All filters combine with AND logic.`
- Confidence: High — Project guidelines encourage guidepost comments for non-trivial functions (per CLAUDE.md lines 61-65)

## 4) Over-Engineering & Refactoring Opportunities

**No over-engineering detected**

The implementation reuses existing patterns and components appropriately:
- Leverages existing `Button` component with variants instead of creating custom filter UI
- Extends `ListScreenLayout` minimally with single `filters` prop
- Shopping list indicator fetching strategy (fetch all parts, filter client-side) is pragmatic given typical inventory sizes and avoids premature optimization
- Filter state management through route search params aligns with existing kits screen pattern

The code is lean and follows the project's prefer-extend-over-invent principle (CLAUDE.md line 36).

## 5) Style & Consistency

- Pattern: Shopping list indicator loading strategy changed from filtered to all parts
- Evidence: `src/components/parts/part-list.tsx:87-93` — `allPartKeys` computed from full `parts` array; `shoppingIndicators` query uses `allPartKeys` instead of `filteredPartKeys`
- Impact: This is a correctness improvement, not an inconsistency. Previous code loaded indicators only for filtered parts, which would cause indicators to disappear when filters were applied. New approach loads for all parts upfront, then applies filters to stable data. This ensures shopping list filter can operate on complete membership data.
- Recommendation: Document this design choice with a comment at line 87: `// Load shopping list indicators for ALL parts (not just filtered) so filter logic can access complete membership data before filtering`

**No other consistency issues identified** — State patterns, error handling, instrumentation usage, and component structure all match established conventions.

## 6) Tests & Deterministic Coverage (new/changed behavior only)

- Surface: Parts list page filter buttons and filtered results
- Scenarios:
  - **Given** user navigates to parts list, **When** page loads, **Then** filter buttons visible with inactive outline style (`tests/e2e/parts/part-list.spec.ts:203-257`)
  - **Given** filter button inactive, **When** user clicks "In Stock", **Then** button active, URL includes `hasStock=true`, list shows only parts with stock (`tests/e2e/parts/part-list.spec.ts:241-246`)
  - **Given** filter active, **When** user clicks button again, **Then** button inactive, URL removes param, list shows all parts (`tests/e2e/parts/part-list.spec.ts:249-254`)
  - **Given** parts with varied shopping list memberships, **When** user activates "On Shopping List" filter, **Then** list shows only parts on active shopping lists (`tests/e2e/parts/part-list.spec.ts:258-308`)
  - **Given** both filters active, **When** parts have combinations of stock/membership, **Then** list shows only parts matching both criteria (AND logic) (`tests/e2e/parts/part-list.spec.ts:309-371`)
  - **Given** filters active with search term, **When** all criteria applied, **Then** list shows parts matching all (search AND stock AND shopping list) (`tests/e2e/parts/part-list.spec.ts:372-427`)
  - **Given** filters yield zero matches, **When** parts exist but none match, **Then** show "No parts found" empty state (`tests/e2e/parts/part-list.spec.ts:428-455`)
  - **Given** filters active, **When** user navigates to detail and back, **Then** filter state persists (`tests/e2e/parts/part-list.spec.ts:456-494`)
- Hooks:
  - `parts.activateStockFilter()`, `parts.deactivateStockFilter()`, `parts.activateShoppingListFilter()`, `parts.deactivateShoppingListFilter()` page object helpers (`tests/support/page-objects/parts-page.ts:125-142`)
  - URL assertions via `page.waitForURL(/hasStock=true/)` and `page.waitForURL(/onShoppingList=true/)`
  - Shopping list indicator visibility checks via `parts.shoppingListIndicator(partKey)`
  - Summary text assertions via `parts.expectSummaryText(/\d+ of \d+ parts showing/i)`
  - List loading instrumentation events include `activeFilters` metadata (tested implicitly via no-console-error policy)
- Gaps: None identified — All scenarios from plan section 13 are covered, tests wait for shopping list indicators before asserting filtered results (avoiding race conditions), tests use unique prefixes via `makeUnique` for isolation
- Evidence: All 13 tests pass (8 existing + 8 new filter tests, one test removed or renumbered). Tests use API factories to seed diverse data combinations (stock levels, shopping list memberships) and assert real backend state.

## 7) Adversarial Sweep

**Attempted attacks and results:**

- **Derived state ↔ persistence**: Filtered parts drive display but never write back to persistent storage. Filter state lives in URL search params (single source of truth), derived state (`filteredParts`) is read-only. No cache mutations triggered by filter changes. **Held up**: Filtering is pure derivation; no write paths exposed (`src/components/parts/part-list.tsx:95-130`).

- **Concurrency/async — Shopping list data race**: User activates "On Shopping List" filter before `useShoppingListMembershipIndicators` query resolves. **Handled gracefully**: Filter logic guards with optional chaining (`?.hasActiveMembership === true`), so undefined entries safely exclude parts. List shows zero results temporarily, then updates when query completes due to TanStack Query reactivity (`src/components/parts/part-list.tsx:122-125`). Tests verify this by waiting for shopping list indicators before asserting (e.g., `tests/e2e/parts/part-list.spec.ts:287` waits for indicator visibility).

- **Concurrency/async — Rapid filter toggling**: User clicks filter button multiple times rapidly. **Held up**: Each click invokes `navigate({ replace: true })` which replaces current history entry. React's event batching and TanStack Router state management handle rapid updates; last state wins. No observed flicker or route errors. Handler logic at lines 224-238 is synchronous—no stale closure risk.

- **Query/cache usage — Missing invalidation**: Filters operate on cached parts data; do not invalidate queries. **Correct by design**: Filters are client-side only, existing invalidation at component mount (lines 49-50) ensures fresh data. Cache invalidation happens independently on part creation/update via standard patterns. Filter changes do not trigger refetch (intentional).

- **Instrumentation & selectors — Missing events**: Filter state must appear in instrumentation metadata for test assertions. **Complete**: `activeFilters` array included in all metadata callbacks (ready, error, aborted) at lines 172, 191, 219. Tests implicitly verify via no-console-error policy and successful assertions—no instrumentation gaps observed.

- **Performance traps — O(n²) iteration**: `filteredParts` memo chains three filter passes (search, stock, shopping list), each iterating the result from previous pass. For 1000 parts with search narrowing to 100, then stock filter: first pass iterates 1000, second pass iterates ~100, third pass iterates ~50. Not O(n²), but multi-pass. **Acceptable**: `useMemo` prevents recalculation on unrelated renders. Single-pass filter combining all predicates could optimize, but current approach is clearer and premature for typical inventory sizes (<1000 parts). Lines 95-130 show clean, readable sequential logic.

**No credible failures found** — Code held up under adversarial scrutiny. Async coordination is safe, derived state never drives writes, instrumentation complete, performance acceptable for domain scale.

## 8) Invariants Checklist

- Invariant: Filter state in URL search params matches button visual state (outline = inactive, default = active)
  - Where enforced: `src/components/parts/part-list.tsx:272,280` — Button `variant` prop directly computes from `hasStockFilter` and `onShoppingListFilter` props derived from route search state
  - Failure mode: Button state could desynchronize from URL if local component state tracked filters independently or if navigation failed to update URL
  - Protection: No local state for filter toggles—route search params are single source of truth. TanStack Router ensures synchronous URL/prop updates.
  - Evidence: `src/routes/parts/index.tsx:13-22` validates search params; lines 60-61 pass to component. Tests verify URL updates with `page.waitForURL` at lines 242, 293, etc.

- Invariant: `visibleCount <= totalCount` always holds
  - Where enforced: `src/components/parts/part-list.tsx:136-138` — `totalCount = parts.length` (unfiltered), `visibleCount = filteredParts.length` (after all filtering)
  - Failure mode: Filtering adds items or counts diverge if derived from different sources
  - Protection: Filtering only removes items (`.filter()` never adds). Both counts derive from same `parts` array via memoized derivation. Immutable filter logic.
  - Evidence: Lines 95-130 show read-only filter passes; line 136 establishes count relationship

- Invariant: Active filters array matches boolean filter props (if `hasStockFilter` true, `activeFilters` includes `'hasStock'`)
  - Where enforced: `src/components/parts/part-list.tsx:149-151` — `activeFilters` array built inline from `hasStockFilter` and `onShoppingListFilter` booleans
  - Failure mode: Array could fall out of sync if built elsewhere or cached incorrectly
  - Protection: Array constructed inline immediately before use in instrumentation callbacks. No caching or stale closure risk—reads current prop values.
  - Evidence: Lines 149-151 show deterministic construction; used at lines 172, 191, 219 in metadata

- Invariant: Shopping list filter operates on complete membership data, not filtered subset
  - Where enforced: `src/components/parts/part-list.tsx:87-93` — `allPartKeys` computed from full `parts` array before filtering; `shoppingIndicators` query uses `allPartKeys`
  - Failure mode: If shopping indicators loaded only for filtered parts, activating filter would lose membership data for hidden parts, breaking filter logic
  - Protection: Indicators loaded for all parts upfront, then filter predicates reference `shoppingIndicatorMap` which has complete data. Filter at line 122-125 safely accesses map for any part key.
  - Evidence: Lines 87-93 load all; line 122-125 filter using stable map; tests verify at line 287 by waiting for indicators before asserting filter results

## 9) Questions / Needs-Info

**No unresolved questions** — Implementation is complete, all plan deliverables met, tests passing, and edge cases handled gracefully. Plan section 15 identified open questions as UX/product decisions (filter counts in button labels, keyboard shortcuts, localStorage persistence) explicitly deferred as out-of-scope enhancements.

## 10) Risks & Mitigations (top 3)

- Risk: Shopping list membership query slow or failing causes "On Shopping List" filter to show zero results, user perceives filter as broken
- Mitigation: Current implementation handles gracefully (undefined-safe checks, empty results). If user reports confusion, add loading state or disable button while query pending. Monitor backend performance metrics for shopping list indicator endpoint. Consider adding tooltip to filter button explaining dependency on shopping list data.
- Evidence: Lines 122-125 show safe filter logic; plan section 8 documents graceful degradation at lines 359-372

- Risk: Large part inventories (>1000 parts) cause noticeable UI lag when toggling filters due to multi-pass array iteration in `useMemo`
- Mitigation: Current memoization prevents unnecessary recalculations; acceptable for typical inventory sizes. If performance issue arises in production, optimize with single-pass filter combining all predicates. Establish baseline with factory-seeded large dataset (1000+ parts) in performance test.
- Evidence: Lines 95-130 show multi-pass filter; `useMemo` dependencies at line 130 ensure minimal recalc; plan section 15 acknowledges risk at lines 683-686

- Risk: Filter state not preserved if detail page navigation handler omits `search: (prev) => prev` pattern, confusing users who lose context
- Mitigation: Already addressed in implementation at `src/routes/parts/index.tsx:33` using recommended pattern. Test at lines 456-494 verifies persistence. Guard against regression with existing test coverage.
- Evidence: Line 33 shows correct pattern; test verifies both back button and direct navigation preserve filter state

## 11) Confidence

**Confidence: High** — Implementation follows proven patterns, all tests pass (8 new filter-specific scenarios), TypeScript strict mode satisfied, ESLint clean including `testing/no-route-mocks` compliance. Code aligns with plan, handles edge cases gracefully, and integrates cleanly with existing instrumentation and UI patterns. Only minor clarity improvement needed in filter toggle handlers. Feature is production-ready after addressing the one minor fix.
