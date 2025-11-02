# Plan Review: Skeleton Loading Component Extraction

## 1) Summary & Decision

**Readiness**

The updated plan successfully addresses all three major issues from the previous review. The component API specification (Section 3, lines 242-295) now includes concrete defaults, explicit prop-to-style mapping rules, and critical testId placement requirements. The test validation strategy (Section 13, lines 519-523) introduces incremental per-component validation to catch selector breakage early. The investigation scope (Section 2, lines 162-218) properly separates confirmed skeleton components from those requiring investigation, avoiding premature refactoring commitments. The plan is implementation-ready with clear technical guidance.

**Decision**

`GO` — All major blocking issues resolved. The plan provides concrete API contracts, deterministic test coordination, and realistic scope boundaries. Minor clarifications remain but do not block implementation.

---

## 2) Conformance & Fit (with evidence)

**Conformance to refs**

- `docs/commands/plan_feature.md` — Pass — `plan.md:242-295` — Component API specification meets the "Data Model / Contracts" template requirement with explicit shape, mapping, and evidence. The defaults and prop-to-style mapping rules provide implementation precision.

- `docs/commands/plan_feature.md` — Pass — `plan.md:507-558` — Deterministic test plan section includes scenarios in Given/When/Then format, instrumentation hooks, validation strategy, and gaps assessment as required.

- `docs/contribute/architecture/application_overview.md` — Pass — `plan.md:59, 498` — Plan correctly references Tailwind CSS utilities, React 19 patterns, and `data-testid` instrumentation conventions matching the documented architecture.

- `docs/contribute/testing/playwright_developer_guide.md` — Pass — `plan.md:519-523` — Test validation strategy aligns with "Authoring Patterns" section: incremental validation after each component refactoring, immediate selector fix before proceeding, and reliance on existing instrumentation events without introducing new ones.

**Fit with codebase**

- `src/components/ui/skeleton.tsx` (new) — `plan.md:118-120` — Follows established pattern of placing reusable UI primitives in `src/components/ui/` alongside existing components like `Button`, `Card`, `EmptyState` (verified via `src/components/parts/part-list.tsx:5-7`).

- Dashboard skeleton functions — `plan.md:124-150` — Correctly identifies 7 dashboard components with dedicated skeleton functions that will be removed. Evidence cites exact line ranges (`low-stock-alerts.tsx:199-221`, etc.) matching codebase structure.

- Incremental test validation — `plan.md:519-523` — Aligns with dashboard test patterns in `tests/e2e/dashboard/low-stock.spec.ts` which rely on `dashboard.waitForLowStockReady()` and existing `data-testid` attributes. The strategy to preserve testId placement prevents breaking these selectors.

- Test instrumentation — `plan.md:392, 524` — Correctly notes that skeleton components rely on parent component instrumentation via `useListLoadingInstrumentation` (confirmed in `src/components/parts/part-list.tsx:11` import). Skeletons do not emit their own events, only render with testId attributes for selector targeting.

---

## 3) Open Questions & Ambiguities

**Resolved via research**

All previously open questions from the prior review have been resolved through either explicit plan updates or implicit clarification:

- **Question**: What are the concrete component defaults?
  - **Resolution**: Answered in `plan.md:266-295` with explicit defaults for every prop and variant.

- **Question**: How to prevent breaking Playwright selectors during refactoring?
  - **Resolution**: Answered in `plan.md:519-523` with incremental validation strategy.

- **Question**: Which components contain actual skeleton patterns vs. other animations?
  - **Resolution**: Separated into confirmed skeletons (lines 124-159) and investigation scope (lines 162-218).

**New questions discovered**

None. The plan is sufficiently detailed for implementation to proceed without additional blocking questions.

---

## 4) Deterministic Playwright Coverage (new/changed behavior only)

**Dashboard skeleton refactoring coverage**

- **Behavior**: Dashboard components display skeletons during loading (`/` route)
- **Scenarios**:
  - Given dashboard page loads with slow API responses, When page first renders, Then all 7 dashboard component skeletons display with correct `data-testid` attributes (`tests/e2e/dashboard/*.spec.ts`)
  - Given dashboard skeletons are visible, When API responses complete, Then skeletons disappear and real content appears (existing pattern in `low-stock.spec.ts:67-72`)
  - Given low stock skeleton renders, When inspecting DOM, Then skeleton has `data-testid="dashboard.low-stock.skeleton"` and contains 3 card placeholders (existing selector in `dashboard-page.ts:23`)
- **Instrumentation**: Existing `data-testid` attributes preserved on outermost element (`plan.md:293-296`); parent components emit `ListLoading` events via `useListLoadingInstrumentation`; dashboard page object exposes `waitForLowStockReady()`, `waitForMetricsReady()`, etc. (`dashboard-page.ts:33-40, 51-55`)
- **Backend hooks**: No new backend coordination needed; existing dashboard API endpoints (`/api/dashboard/low-stock`, `/api/dashboard/metrics`, etc.) provide test data seeded via factories in spec setup
- **Gaps**: None; all dashboard components have existing test coverage that will be incrementally validated
- **Evidence**: `plan.md:519-525` validation strategy; `tests/e2e/dashboard/low-stock.spec.ts:66-72` existing test pattern; `tests/support/page-objects/dashboard-page.ts:33-40` page object instrumentation

**Parts detail skeleton refactoring coverage**

- **Behavior**: Part detail and location grid display skeletons during loading (`/parts/:partId` route)
- **Scenarios**:
  - Given part detail page loads, When part data is fetching, Then card skeleton displays with heading and grid placeholders (`plan.md:527-530`)
  - Given part locations are loading, When location grid renders, Then location skeleton shows header and 3 row placeholders (`plan.md:531-532`)
- **Instrumentation**: Update selectors if structure changes; preserve `data-testid` patterns for `parts.detail.*` scope (`plan.md:533-535`)
- **Backend hooks**: Existing parts API factories in `tests/api/factories/` provide part creation; no new backend coordination required
- **Gaps**: None stated; assumes existing parts test coverage
- **Evidence**: `plan.md:527-537`; `src/components/parts/part-details.tsx:424-437` skeleton implementation; `src/components/parts/part-location-grid.tsx:39-58` skeleton implementation

**List component skeleton refactoring coverage**

- **Behavior**: List pages display skeletons during data fetching (parts, types, sellers, boxes, etc.)
- **Scenarios**:
  - Given list page loads, When data is fetching, Then skeleton rows/cards display (`plan.md:540-543`)
  - Given skeleton renders, When API response arrives, Then skeleton replaced with table/grid content (`plan.md:543-544`)
- **Instrumentation**: Verify existing `data-testid` attributes remain intact; update tests relying on skeleton DOM structure (`plan.md:545-547`)
- **Backend hooks**: Existing list test patterns use factories to seed data; `waitForListLoading(page, 'parts.list', 'ready')` pattern already established (verified in `tests/support/page-objects/dashboard-page.ts:33-40`)
- **Gaps**: Acknowledged gap: "Some list components may not have explicit skeleton tests; acceptable (not adding new coverage, only refactoring)" (`plan.md:548-549`)
- **Evidence**: `plan.md:539-549`; `src/components/parts/part-list.tsx:234` existing skeleton with `data-testid="parts.list.loading.skeleton"`

**Regression testing**

- **Behavior**: All existing Playwright specs continue passing after skeleton refactoring
- **Scenarios**:
  - Given all existing Playwright specs, When refactored skeleton components render, Then no test failures occur (`plan.md:553-555`)
  - Given any test waiting for skeleton disappearance, When skeleton uses new primitives, Then test still detects loading → ready transition (`plan.md:555-557`)
- **Instrumentation**: No new instrumentation; preserve existing `data-testid` patterns (`plan.md:557`)
- **Backend hooks**: None; relies on existing test infrastructure
- **Gaps**: None; atomic refactoring ensures all components updated simultaneously (`plan.md:558`)
- **Evidence**: `plan.md:551-559`

**Summary**: Coverage is comprehensive for the refactoring scope. No new user-visible behavior is introduced, only internal implementation changes. Existing test coverage is explicitly preserved via incremental validation strategy and testId placement requirements.

---

## 5) Adversarial Sweep (must find ≥3 credible issues or declare why none exist)

**Minor — testId wrapper constraint needs implementation guidance**

**Evidence:** `plan.md:293-296` — "Critical: `data-testid` must be applied to the outermost element returned by Skeleton/SkeletonGroup (NO wrapper containers added)"

**Why it matters:** React components often introduce implicit wrapper divs when returning multiple elements or applying container styling. If the implementation doesn't receive explicit guidance on how to apply testId to the outermost element without wrappers, it may inadvertently break selectors like `dashboard.low-stock.skeleton` which expect the testId on the skeleton container itself.

**Fix suggestion:** Add to Section 5 (Algorithms & UI Flows) or Section 14 (Implementation Slices - Slice 1) explicit implementation note: "Skeleton component must return a single root element (div) with testId applied directly to that element. SkeletonGroup must return a container div with testId applied, containing mapped children. Use React Fragments only when testId is not provided."

**Confidence:** Medium — The requirement is stated but lacks implementation-level detail on how to achieve it.

---

**Minor — Width/height prop mapping ambiguity for edge cases**

**Evidence:** `plan.md:274-279` — Width/height prop mapping rules define string/number handling but don't address invalid inputs like negative numbers, non-numeric strings without Tailwind prefixes, or conflicting props.

**Why it matters:** Implementation will need to handle edge cases like `width={-10}`, `width="abc"`, or simultaneous `width="w-full"` and inline style conflicts. Without guidance, the implementation may throw runtime errors or produce unexpected CSS.

**Fix suggestion:** Add to Section 8 (Errors & Edge Cases) explicit edge case handling:
- **Case**: Negative or zero width/height values
- **Handling**: Log warning in development, fall back to variant defaults
- **Case**: Non-Tailwind string without CSS units
- **Handling**: Apply as custom Tailwind class (may be user-defined utility), document limitation
- **Case**: Conflicting inline styles from multiple props
- **Handling**: Last-applied wins (standard CSS behavior)

**Confidence:** Medium — Edge cases are not addressed but may surface during implementation or code review.

---

**Minor — Investigation scope creates waterfall risk**

**Evidence:** `plan.md:595-614` — Slice 4 defers investigation of 13 components until after Slices 1-3 complete. This creates a sequential dependency where scope expansion in Slice 4 could invalidate time estimates or force additional work.

**Why it matters:** If investigation reveals complex skeleton patterns requiring new primitives (e.g., pill-shaped badges, staggered animations), the implementation may need to revisit Slice 1 to add variants or props. This waterfall structure delays discovery of requirements until late in the implementation.

**Fix suggestion:** **Move investigation to Slice 0 (before Slice 1 implementation).** Add:
- **Slice 0: Investigate Remaining Components**
  - **Goal**: Confirm which of 13 components use skeleton patterns vs. other animations
  - **Touches**: Read each file in "Components Requiring Investigation" section (lines 162-218)
  - **Output**: Finalized list of components for Slice 4 refactoring
  - **Dependencies**: None; can run immediately
  - **Risk mitigation**: Ensures primitive API in Slice 1 accounts for all discovered patterns

Alternatively, note in Slice 4 that new variant requirements will trigger a return to Slice 1, but this adds rework risk.

**Confidence:** High — Sequential dependency is a known project management risk that can be mitigated by reordering.

---

**Checks attempted that found no issues:**

- **Cache invalidation risk**: Skeletons are stateless presentational components with no TanStack Query cache interactions. No risk of stale data or cache corruption (`plan.md:372-377, 382-393`).

- **Optimistic update conflicts**: Skeletons render based on parent component `isLoading` state only. No mutations, no optimistic updates, no rollback coordination required (`plan.md:382-393`).

- **React concurrency gotchas**: Skeletons have no effects, timers, or subscriptions. Pure render functions eliminate concurrency risks (`plan.md:449-454`).

- **Instrumentation drift**: Plan explicitly requires preserving existing `data-testid` attributes and parent component instrumentation (`plan.md:392, 433-441`). Incremental validation strategy catches drift early (`plan.md:519-523`).

- **Breaking change coordination**: Plan explicitly acknowledges breaking changes and recommends coordinating with team during quiet period (`plan.md:645-648`). Risk is accepted per requirements.

**Why the plan holds:** The refactoring is narrowly scoped to presentational components with no state, no side effects, and no API integration. The primary risks (test breakage, visual regression) are explicitly mitigated via incremental validation and preserved testId patterns. The three minor issues above are edge cases or process optimizations, not fundamental design flaws.

---

## 6) Derived-Value & State Invariants (table)

**None; proof provided**

**Evidence**: Skeleton components are stateless, side-effect-free presentational components that accept props and return JSX (`plan.md:372-377, 449-454`). They do not:
- Derive values from filtered datasets
- Trigger cache writes or cleanup
- Maintain local state or context
- Perform computations that affect persistent storage
- Coordinate with feature flags or guards

**Justification**: The refactoring moves static skeleton JSX from inline implementations to reusable components without changing when or how skeletons render. Parent components continue to control loading state via TanStack Query's `isLoading` flag, and skeletons remain passive placeholders. No derived state is introduced.

**Invariant verification**: The plan explicitly states "No Derived State" in Section 6 (lines 372-377) with justification. Parent component coordination is documented in Section 7 (lines 387-393) but does not create new derived values—only references existing `isLoading` state.

---

## 7) Risks & Mitigations (top 3)

**Risk 1: Playwright tests fail due to skeleton structure changes**

- **Mitigation**: Preserve all existing `data-testid` attributes on outermost elements (`plan.md:296`); run incremental validation after each component refactoring (`plan.md:519-523`); fix selectors immediately before proceeding to next component; ensure primitives do not introduce wrapper divs that break selector paths
- **Evidence**: `plan.md:633-637` — Risk explicitly acknowledged with mitigation strategy; `plan.md:519-523` — Validation strategy ties directly to mitigation

**Risk 2: Minor visual regressions in skeleton layouts**

- **Mitigation**: Accept as documented trade-off per requirements (`plan.md:80, 484-488`); verify major layouts (dashboard, parts detail) visually before merge; document that consistency/maintainability outweigh pixel-perfect preservation
- **Evidence**: `plan.md:638-641` — Risk acknowledged with acceptance rationale; `plan.md:484-488` — "Acceptable Losses" section documents expected differences

**Risk 3: Missed skeleton usage in rarely visited components**

- **Mitigation**: Grep search for `animate-pulse` completed and documented 22 files (`plan.md:7, 23-27`); manually review all identified files during implementation; Slice 4 investigation step confirms skeleton patterns before refactoring (`plan.md:595-614`)
- **Evidence**: `plan.md:642-644` — Risk acknowledged with mitigation; `plan.md:0-27` — Research log provides evidence of exhaustive search; `plan.md:218` — Investigation scope explicitly limits refactoring to confirmed patterns only

---

## 8) Confidence

**Confidence: High** — The updated plan resolves all major blocking issues from the previous review. Component API is concrete with defaults and mapping rules. Test validation strategy is incremental and deterministic. Investigation scope is properly separated from confirmed refactoring work. The three minor issues identified in the adversarial sweep are edge cases that can be addressed during implementation or code review without blocking progress. The plan is implementation-ready and well-aligned with project standards.

---

## Summary of Major Issue Resolution

**Issue 1: Component API too vague**
- **Status**: ✅ RESOLVED
- **Evidence**: `plan.md:266-295` provides concrete defaults, explicit prop-to-style mapping rules, and testId placement requirements
- **Quality**: Sufficient for implementation; minor edge case handling can be addressed during code review

**Issue 2: No test validation strategy**
- **Status**: ✅ RESOLVED
- **Evidence**: `plan.md:519-523` introduces incremental validation after each component refactoring with immediate selector fixes
- **Quality**: Aligns with established Playwright patterns; prevents waterfall test breakage

**Issue 3: Investigation scope mixed with execution**
- **Status**: ✅ RESOLVED
- **Evidence**: `plan.md:162-218` separates confirmed skeletons from investigation scope; Slice 4 explicitly includes investigation step before refactoring
- **Quality**: Scope is realistic; minor optimization available (move investigation to Slice 0) but not blocking

**Remaining Concerns**: Only the three minor issues identified in Section 5 (Adversarial Sweep) remain. These are edge cases and process optimizations that do not block implementation. The plan is ready for execution.
