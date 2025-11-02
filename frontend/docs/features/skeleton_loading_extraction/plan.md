# Skeleton Loading Component Extraction — Technical Plan

## 0) Research Log & Findings

**Discovery Summary**

Searched the codebase for skeleton loading patterns using `animate-pulse` and `Skeleton` function names. Found 22 files with `animate-pulse` usage and 10 files with explicit skeleton components.

**Identified Skeleton Patterns**

1. **Dashboard Components** (7 files with explicit skeleton functions):
   - `src/components/dashboard/low-stock-alerts.tsx` — `LowStockSkeleton()` (lines 199-221)
   - `src/components/dashboard/documentation-status.tsx` — `DocumentationSkeleton()` (lines 142-173)
   - `src/components/dashboard/storage-utilization-grid.tsx` — `StorageGridSkeleton()` (lines 105-126)
   - `src/components/dashboard/category-distribution.tsx` — `CategoryDistributionSkeleton()` (lines 108-141)
   - `src/components/dashboard/recent-activity-timeline.tsx` — `ActivityTimelineSkeleton()` (lines 148-174)
   - `src/components/dashboard/enhanced-metrics-cards.tsx` — `MetricsCardsSkeleton()` (lines 189-211)
   - `src/components/dashboard/inventory-health-score.tsx` — inline skeleton (lines 184-189)

2. **Parts Components** (2 files):
   - `src/components/parts/part-details.tsx` — inline skeleton (lines 424-437)
   - `src/components/parts/part-location-grid.tsx` — inline skeleton (lines 39-58)

3. **Other Domain Components** (13 additional files with `animate-pulse`):
   - List components: part-list, type-list, seller-list, box-list, shopping-lists, kits
   - Detail components: shopping-list headers, kit headers, box-details, pick-list-detail
   - UI components: progress-bar, cover-image-display

**Common Styling Pattern**

All skeletons share the core pattern:
```tsx
<div className="bg-muted rounded animate-pulse" />
```

Variations include:
- **Shape**: `rounded` (default), `rounded-full` (circular), `rounded-lg` (larger radius)
- **Spacing**: `space-y-{n}`, `gap-{n}`, `flex`, `grid`
- **Size**: `w-{n}`, `h-{n}` (explicit dimensions)
- **Container**: Often wrapped in `Card`, `div`, or table structures

**Conflicts Resolved**

- **Question**: Should we support `className` prop for flexibility?
  - **Resolution**: NO. Requirement explicitly states NO className prop. All styling encapsulated.

- **Question**: Should we maintain backward compatibility?
  - **Resolution**: NO. Make breaking changes; remove all domain-specific skeleton wrappers.

- **Question**: How to handle visual differences after extraction?
  - **Resolution**: Accept minor visual differences as acceptable losses for consistency.

**Key Architectural Insight**

The application uses:
- React 19 with function components
- Tailwind CSS for styling
- Domain-driven folder structure (`src/components/<domain>`)
- Reusable UI components in `src/components/ui/`
- Test instrumentation via `data-testid` attributes

---

## 1) Intent & Scope

**User intent**

Extract highly repetitive skeleton loading patterns across 7+ dashboard components and other domain components into a centralized, reusable UI component library in `src/components/ui/`. Eliminate code duplication while standardizing skeleton loading visuals throughout the application.

**Prompt quotes**

"Skeleton loading patterns appear in 7+ dashboard components with highly repetitive code"

"All use: `bg-muted rounded animate-pulse` with variations for rectangular blocks, circular shapes, text lines, container spacing"

"Plan to REMOVE className props from any domain-specific skeleton wrappers completely (not deprecate, REMOVE)"

"Make breaking changes—do not attempt backward compatibility"

"Accept minor visual differences as acceptable losses for consistency"

**In scope**

- Create new skeleton component primitives in `src/components/ui/skeleton.tsx`
- Define component API WITHOUT className prop (fully encapsulated styling)
- Identify and catalog ALL current skeleton usages (22+ files)
- Refactor all 7+ dashboard component skeletons to use new primitives
- Refactor parts component skeletons (part-details, part-location-grid)
- Update or remove other skeleton patterns across list/detail components
- Update Playwright tests for components with existing test coverage
- Remove all domain-specific skeleton wrapper functions completely
- Document the new skeleton component API and usage patterns

**Out of scope**

- Generic loading states that don't use skeleton patterns (spinners, progress bars)
- Backward compatibility layers or deprecation warnings
- Custom className prop support (explicitly excluded)
- Skeletons for components not yet built
- Animation timing or easing customization beyond Tailwind defaults
- Dark mode specific skeleton variations (use Tailwind's existing muted token)

**Assumptions / constraints**

- Tailwind CSS `bg-muted` token provides appropriate skeleton background in light/dark modes
- All skeleton usages can be standardized to a small set of primitive shapes
- Playwright tests use `data-testid` attributes for skeleton detection
- Breaking changes are acceptable for internal component refactoring
- Visual consistency is more valuable than preserving exact pixel-perfect layouts
- Components will be updated in a single atomic change (not gradual migration)

---

## 2) Affected Areas & File Map

**New Files**

- **Area**: `src/components/ui/skeleton.tsx`
- **Why**: New primitive skeleton component library with encapsulated styling
- **Evidence**: User requirement: "Create product brief: @docs/commands/create_brief.md"

**Modified Dashboard Components**

- **Area**: `src/components/dashboard/low-stock-alerts.tsx`
- **Why**: Replace `LowStockSkeleton()` function with new primitives; remove wrapper completely
- **Evidence**: `src/components/dashboard/low-stock-alerts.tsx:199-221` — dedicated skeleton function with card structure and repeated blocks

- **Area**: `src/components/dashboard/documentation-status.tsx`
- **Why**: Replace `DocumentationSkeleton()` with new primitives; remove wrapper
- **Evidence**: `src/components/dashboard/documentation-status.tsx:142-173` — skeleton with progress ring, milestones, and list items

- **Area**: `src/components/dashboard/storage-utilization-grid.tsx`
- **Why**: Replace `StorageGridSkeleton()` with new primitives; remove wrapper
- **Evidence**: `src/components/dashboard/storage-utilization-grid.tsx:105-126` — grid skeleton with 12 card placeholders

- **Area**: `src/components/dashboard/category-distribution.tsx`
- **Why**: Replace `CategoryDistributionSkeleton()` with new primitives; remove wrapper
- **Evidence**: `src/components/dashboard/category-distribution.tsx:108-141` — skeleton with bar chart placeholders and insights

- **Area**: `src/components/dashboard/recent-activity-timeline.tsx`
- **Why**: Replace `ActivityTimelineSkeleton()` with new primitives; remove wrapper
- **Evidence**: `src/components/dashboard/recent-activity-timeline.tsx:148-174` — timeline skeleton with grouped items and icons

- **Area**: `src/components/dashboard/enhanced-metrics-cards.tsx`
- **Why**: Replace `MetricsCardsSkeleton()` exported function with new primitives; remove wrapper
- **Evidence**: `src/components/dashboard/enhanced-metrics-cards.tsx:189-211` — grid of 4 metric card skeletons

- **Area**: `src/components/dashboard/inventory-health-score.tsx`
- **Why**: Replace inline skeleton JSX with new primitives
- **Evidence**: `src/components/dashboard/inventory-health-score.tsx:184-189` — circular skeleton for health gauge

**Modified Parts Components**

- **Area**: `src/components/parts/part-details.tsx`
- **Why**: Replace inline skeleton JSX in loading state with new primitives
- **Evidence**: `src/components/parts/part-details.tsx:424-437` — card with heading and grid skeleton placeholders

- **Area**: `src/components/parts/part-location-grid.tsx`
- **Why**: Replace inline skeleton JSX with new primitives
- **Evidence**: `src/components/parts/part-location-grid.tsx:39-58` — location grid skeleton with header and rows

**Components Requiring Investigation (animate-pulse found, skeleton usage to be confirmed)**

These files contain `animate-pulse` but require investigation to determine if they use skeleton loading patterns or other animations (e.g., progress indicators):

- **Area**: `src/components/parts/part-list.tsx`
- **Why**: Grep found `animate-pulse`; investigate if skeleton or other animation
- **Evidence**: Found in grep search for `animate-pulse`

- **Area**: `src/components/types/type-list.tsx`
- **Why**: Grep found `animate-pulse`; investigate if skeleton or other animation
- **Evidence**: Found in grep search for `animate-pulse`

- **Area**: `src/components/sellers/seller-list.tsx`
- **Why**: Grep found `animate-pulse`; investigate if skeleton or other animation
- **Evidence**: Found in grep search for `animate-pulse`

- **Area**: `src/components/shopping-lists/detail-header-slots.tsx`
- **Why**: Grep found `animate-pulse`; investigate if skeleton or other animation
- **Evidence**: Found in grep search for `animate-pulse`

- **Area**: `src/components/shopping-lists/overview-list.tsx`
- **Why**: Grep found `animate-pulse`; investigate if skeleton or other animation
- **Evidence**: Found in grep search for `animate-pulse`

- **Area**: `src/components/documents/cover-image-display.tsx`
- **Why**: Grep found `animate-pulse`; investigate if skeleton or other animation
- **Evidence**: Found in grep search for `animate-pulse`

- **Area**: `src/components/kits/kit-detail-header.tsx`
- **Why**: Grep found `animate-pulse`; investigate if skeleton or other animation
- **Evidence**: Found in grep search for `animate-pulse`

- **Area**: `src/components/kits/kit-overview-list.tsx`
- **Why**: Grep found `animate-pulse`; investigate if skeleton or other animation
- **Evidence**: Found in grep search for `animate-pulse`

- **Area**: `src/components/kits/kit-detail.tsx`
- **Why**: Grep found `animate-pulse`; investigate if skeleton or other animation
- **Evidence**: Found in grep search for `animate-pulse`

- **Area**: `src/components/boxes/box-list.tsx`
- **Why**: Grep found `animate-pulse`; investigate if skeleton or other animation
- **Evidence**: Found in grep search for `animate-pulse`

- **Area**: `src/components/boxes/box-details.tsx`
- **Why**: Grep found `animate-pulse`; investigate if skeleton or other animation
- **Evidence**: Found in grep search for `animate-pulse`

- **Area**: `src/components/pick-lists/pick-list-detail.tsx`
- **Why**: Grep found `animate-pulse`; investigate if skeleton or other animation
- **Evidence**: Found in grep search for `animate-pulse`

- **Area**: `src/components/ui/progress-bar.tsx`
- **Why**: Grep found `animate-pulse`; may be progress indicator, not skeleton
- **Evidence**: Found in grep search for `animate-pulse`

**Investigation Scope**: These 13 files will be examined during Slice 4 to determine if they contain actual skeleton patterns. Only confirmed skeleton usages will be refactored.

**Playwright Test Files** (if coverage exists)

- **Area**: `tests/e2e/dashboard/*.spec.ts`
- **Why**: Update skeleton selectors to match new component structure
- **Evidence**: Dashboard components have test coverage based on instrumentation in source

- **Area**: `tests/e2e/parts/*.spec.ts`
- **Why**: Update skeleton selectors for part-details and part-location-grid
- **Evidence**: Parts components use `data-testid` instrumentation extensively

---

## 3) Data Model / Contracts

**No API Contract Changes**

This refactoring is purely presentational. No backend API changes, no TanStack Query cache key changes, no request/response payload modifications.

**Component Props Contracts**

- **Entity**: `Skeleton` primitive component props
- **Shape**:
  ```typescript
  interface SkeletonProps {
    variant?: 'text' | 'circular' | 'rectangular' | 'avatar'
    width?: string | number  // e.g., '100%', 200, 'w-32'
    height?: string | number // e.g., 'h-4', 24
    testId?: string
  }
  ```
- **Mapping**: No snake_case/camelCase mapping needed; purely UI component
- **Evidence**: Derived from common patterns in all 22+ files using `animate-pulse`

- **Entity**: `SkeletonGroup` container props
- **Shape**:
  ```typescript
  interface SkeletonGroupProps {
    count?: number           // Number of skeleton items to render
    spacing?: 'tight' | 'normal' | 'loose' // space-y-1, space-y-2, space-y-4
    children?: React.ReactNode
    testId?: string
  }
  ```
- **Mapping**: Replaces repeated `Array.from({ length: N }).map()` patterns
- **Evidence**: `src/components/dashboard/low-stock-alerts.tsx:202` — `Array.from({ length: 3 }).map((_, i) => ...)`

**Component Defaults**

- **Skeleton component with no props**: `<Skeleton />` renders:
  - variant: `'rectangular'`
  - width: `'w-full'`
  - height: `'h-4'`
  - Rendered output: `<div className="bg-muted rounded animate-pulse w-full h-4" />`

- **Width/Height Prop Mapping**:
  - **String starting with 'w-' or 'h-'**: Applied as Tailwind class (e.g., `width="w-32"` → `className="...w-32"`)
  - **String ending with '%' or 'px'**: Applied as inline style (e.g., `width="100%"` → `style={{ width: '100%' }}`)
  - **Number**: Applied as inline style in pixels (e.g., `width={200}` → `style={{ width: '200px' }}`)
  - **Other strings**: Applied as Tailwind class (fallback for custom utilities)

- **Variant Defaults**:
  - `'text'`: width `'w-full'`, height `'h-4'`, rounded `'rounded'`
  - `'circular'`: width `'w-8'`, height `'h-8'`, rounded `'rounded-full'`
  - `'rectangular'`: width `'w-full'`, height `'h-4'`, rounded `'rounded'`
  - `'avatar'`: width `'w-10'`, height `'h-10'`, rounded `'rounded-full'`

- **SkeletonGroup with no props**: `<SkeletonGroup />` renders:
  - count: `3`
  - spacing: `'normal'` (`space-y-2`)
  - children: If not provided, renders `count` `<Skeleton />` elements

**testId Conventions**

- Primary skeleton container: `data-testid="{scope}.skeleton"`
- Individual skeleton items: `data-testid="{scope}.skeleton.card"` or `{scope}.skeleton.item"`
- Maintain existing patterns where possible for Playwright compatibility
- **Critical**: `data-testid` must be applied to the outermost element returned by Skeleton/SkeletonGroup (NO wrapper containers added)

---

## 4) API / Integration Surface

**No External API Integration**

This feature is purely presentational and does not interact with backend endpoints, TanStack Query, or event emitters.

**Internal Component API**

- **Surface**: `Skeleton` component exported from `src/components/ui/skeleton.tsx`
- **Inputs**: `variant`, `width`, `height`, `testId` props
- **Outputs**: Renders a single skeleton placeholder with encapsulated Tailwind styles
- **Errors**: N/A (no error states for static presentational component)
- **Evidence**: Pattern analysis across all skeleton usages

- **Surface**: `SkeletonGroup` component exported from `src/components/ui/skeleton.tsx`
- **Inputs**: `count`, `spacing`, `children`, `testId` props
- **Outputs**: Renders container with repeated skeleton items or custom children
- **Errors**: N/A
- **Evidence**: Repetition pattern in all dashboard skeletons

---

## 5) Algorithms & UI Flows

**Skeleton Component Render Flow**

- **Flow**: Component loading state triggers skeleton display
- **Steps**:
  1. Parent component detects `isLoading === true` from TanStack Query
  2. Parent renders skeleton component(s) instead of actual content
  3. Skeleton component applies Tailwind classes: `bg-muted rounded animate-pulse`
  4. Variant prop determines shape: `rounded` vs `rounded-full` vs `rounded-lg`
  5. Width/height props apply sizing via Tailwind utility classes or inline styles
  6. Component renders with `data-testid` for Playwright detection
  7. When `isLoading === false`, parent switches to real content
- **States / transitions**:
  - Loading → Skeleton visible
  - Ready → Skeleton hidden, content visible
- **Hotspots**: No performance concerns; static rendering only
- **Evidence**: `src/components/dashboard/low-stock-alerts.tsx:258-271` — conditional rendering based on `isLoading`

**Skeleton Group Render Flow**

- **Flow**: Generate multiple skeleton items efficiently
- **Steps**:
  1. SkeletonGroup receives `count` prop
  2. Internally uses `Array.from({ length: count }).map((_, i) => ...)`
  3. Renders children or default Skeleton primitives
  4. Applies spacing classes: `space-y-{n}` or `gap-{n}`
  5. Each item gets keyed index for React reconciliation
- **States / transitions**: Static; no state changes
- **Hotspots**: None; minimal render cost
- **Evidence**: Pattern repeated in all dashboard skeletons

**Refactoring Flow**

- **Flow**: Replace existing skeleton implementations
- **Steps**:
  1. Import new `Skeleton` and `SkeletonGroup` from `@/components/ui/skeleton`
  2. Remove old skeleton function declarations (e.g., `LowStockSkeleton()`)
  3. Replace skeleton JSX with new primitive composition
  4. Remove any domain-specific skeleton styling or structure
  5. Verify `data-testid` attributes match or update Playwright tests
  6. Delete unused skeleton wrapper functions
- **States / transitions**: N/A (one-time refactoring)
- **Hotspots**: Ensuring test coverage remains intact
- **Evidence**: User requirement: "REMOVE className props from any domain-specific skeleton wrappers completely"

---

## 6) Derived State & Invariants

**No Derived State**

Skeleton components are purely presentational and stateless. They do not derive values, maintain caches, or trigger side effects.

**Justification**: Skeletons are static placeholders that render based on parent component loading state only. No filtering, transformations, or computed values are needed.

---

## 7) State Consistency & Async Coordination

**No State Coordination Required**

Skeleton components are stateless presentational components. They do not interact with TanStack Query caches, React state, or instrumentation hooks beyond rendering.

**Parent Component Coordination**

- **Source of truth**: Parent component's `isLoading` state from TanStack Query
- **Coordination**: Parent conditionally renders skeleton vs. actual content
- **Async safeguards**: None needed; skeletons are synchronous renders
- **Instrumentation**: Skeletons render with `data-testid` attributes; parent components emit `ListLoading` events via `useListLoadingInstrumentation`
- **Evidence**: `src/components/dashboard/low-stock-alerts.tsx:258-271` — conditional skeleton rendering based on `isLoading && (!lowStockItems || lowStockItems.length === 0)`

---

## 8) Errors & Edge Cases

**No Error States**

Skeleton components cannot fail; they are static markup. Error handling resides in parent components.

**Edge Cases**

- **Case**: `count={0}` passed to SkeletonGroup
- **Surface**: `SkeletonGroup` component
- **Handling**: Render nothing (empty fragment or null)
- **Guardrails**: Document that `count` should be positive integer
- **Evidence**: Pattern analysis

- **Case**: Invalid width/height values
- **Surface**: `Skeleton` component
- **Handling**: Fall back to default Tailwind classes or omit inline styles
- **Guardrails**: TypeScript prop validation; accept string | number
- **Evidence**: Common Tailwind pattern

- **Case**: Missing `testId` prop
- **Surface**: All skeleton components
- **Handling**: Render without `data-testid` attribute (acceptable for non-tested components)
- **Guardrails**: Make `testId` optional
- **Evidence**: Not all components have Playwright coverage

---

## 9) Observability / Instrumentation

**Test Instrumentation**

- **Signal**: `data-testid="{scope}.skeleton"`
- **Type**: HTML attribute for Playwright selectors
- **Trigger**: Skeleton component render
- **Labels / fields**: N/A (static attribute)
- **Consumer**: Playwright tests waiting for loading → ready transitions
- **Evidence**: `src/components/dashboard/low-stock-alerts.tsx:201` — `data-testid="dashboard.low-stock.skeleton"`

- **Signal**: `data-testid="{scope}.skeleton.card"` or `{scope}.skeleton.item"`
- **Type**: HTML attribute for individual skeleton items
- **Trigger**: SkeletonGroup item render
- **Labels / fields**: Index or key for repeated items
- **Consumer**: Playwright tests asserting skeleton count or structure
- **Evidence**: `src/components/dashboard/low-stock-alerts.tsx:203` — `data-testid="dashboard.low-stock.skeleton.card"`

**No Additional Instrumentation**

Skeletons do not emit custom events, logs, or analytics. Parent components handle instrumentation via `useListLoadingInstrumentation`.

---

## 10) Lifecycle & Background Work

**No Lifecycle Hooks**

Skeleton components are pure presentational components with no effects, timers, subscriptions, or cleanup.

**Justification**: Skeletons render once and unmount when parent switches to actual content. No background work required.

---

## 11) Security & Permissions

**Not Applicable**

Skeleton loading components have no security implications. They do not handle sensitive data, authentication, authorization, or user input.

---

## 12) UX / UI Impact

**Entry Points**

All loading states across the application where skeletons are currently used:
- Dashboard route (`/`) — 7 component skeletons
- Parts detail route (`/parts/:partId`) — detail skeleton and location grid skeleton
- Other list routes (parts, types, sellers, boxes, kits, shopping-lists, pick-lists)

**Change**: Standardized skeleton visuals across all components

- **Before**: Inconsistent skeleton implementations with minor variations in spacing, sizing, and structure
- **After**: Unified skeleton primitives with consistent `bg-muted rounded animate-pulse` styling

**User Interaction**: No direct interaction with skeletons (they are passive loading indicators)

**Visual Differences**

- **Acceptable Losses**:
  - Minor spacing differences (e.g., `space-y-3` → `space-y-2`)
  - Slightly different block widths/heights
  - Simplified structures (fewer nested divs)
- **Rationale**: Consistency and maintainability outweigh pixel-perfect preservation

**Accessibility**

- Maintain `aria-label` or `role="img"` where appropriate (rare for skeletons)
- Skeletons are decorative; screen readers can ignore them
- Ensure parent components announce loading states via `aria-live` if needed (out of scope)

**Dependencies**

- Tailwind CSS utilities: `bg-muted`, `rounded`, `rounded-full`, `animate-pulse`, `space-y-*`, `gap-*`, `w-*`, `h-*`
- React 19 for component rendering
- No external UI libraries

**Evidence**: All dashboard components (`src/components/dashboard/*.tsx`) and parts components (`src/components/parts/*.tsx`)

---

## 13) Deterministic Test Plan

**Dashboard Skeleton Tests**

- **Surface**: `/` route dashboard page
- **Scenarios**:
  - **Given** dashboard page loads with slow API responses, **When** page first renders, **Then** all 7 dashboard component skeletons display with correct `data-testid` attributes
  - **Given** dashboard skeletons are visible, **When** API responses complete, **Then** skeletons disappear and real content appears
  - **Given** low stock skeleton renders, **When** inspecting DOM, **Then** skeleton has `data-testid="dashboard.low-stock.skeleton"` and contains 3 card placeholders
- **Instrumentation / hooks**:
  - Existing: `data-testid="dashboard.low-stock.skeleton"`, `data-testid="dashboard.documentation.skeleton"`, etc.
  - Updated: Ensure new skeleton primitives preserve these attributes on outermost element
  - **Critical**: Skeleton primitives must NOT introduce wrapper divs that would break selector paths
- **Validation Strategy**:
  - Incremental: After refactoring each dashboard component, run `pnpm playwright test tests/e2e/dashboard/` to catch selector breakage immediately
  - Fix any broken selectors before proceeding to next component
  - If selectors break despite preserving testId, adjust primitive implementation to ensure outermost element receives testId without wrappers
- **Gaps**: None; existing tests should continue passing with preserved testId placement
- **Evidence**: `src/components/dashboard/low-stock-alerts.tsx:201` — skeleton instrumentation

**Parts Detail Skeleton Tests**

- **Surface**: `/parts/:partId` route
- **Scenarios**:
  - **Given** part detail page loads, **When** part data is fetching, **Then** card skeleton displays with heading and grid placeholders
  - **Given** part locations are loading, **When** location grid renders, **Then** location skeleton shows header and 3 row placeholders
- **Instrumentation / hooks**:
  - Update selectors if skeleton structure changes
  - Preserve `data-testid` patterns for parts.detail.* scope
- **Gaps**: None
- **Evidence**: `src/components/parts/part-details.tsx:424-437` and `src/components/parts/part-location-grid.tsx:39-58`

**List Component Skeleton Tests**

- **Surface**: List pages (parts, types, sellers, boxes, etc.)
- **Scenarios**:
  - **Given** list page loads, **When** data is fetching, **Then** skeleton rows/cards display
  - **Given** skeleton renders, **When** API response arrives, **Then** skeleton replaced with table/grid content
- **Instrumentation / hooks**:
  - Verify existing `data-testid` attributes on skeletons remain intact
  - Update any tests that rely on skeleton DOM structure
- **Gaps**: Some list components may not have explicit skeleton tests; acceptable (not adding new coverage, only refactoring)
- **Evidence**: Grep search found `animate-pulse` in part-list, type-list, seller-list, box-list, shopping-lists, kits

**Regression Testing**

- **Surface**: All components using skeletons
- **Scenarios**:
  - **Given** all existing Playwright specs, **When** refactored skeleton components render, **Then** no test failures occur
  - **Given** any test waiting for skeleton disappearance, **When** skeleton uses new primitives, **Then** test still detects loading → ready transition
- **Instrumentation / hooks**: No new instrumentation; preserve existing `data-testid` patterns
- **Gaps**: None; atomic refactoring ensures all components updated simultaneously
- **Evidence**: User requirement: "Include Playwright test updates if the component has test coverage"

---

## 14) Implementation Slices

**Slice 1: Create Skeleton Primitives**

- **Goal**: Establish reusable skeleton component library
- **Touches**:
  - Create `src/components/ui/skeleton.tsx`
  - Export `Skeleton` and `SkeletonGroup` components
  - Define TypeScript interfaces
  - Add basic documentation comments
- **Dependencies**: None; can be built independently

**Slice 2: Refactor Dashboard Skeletons**

- **Goal**: Replace all 7 dashboard skeleton functions with primitives
- **Touches**:
  - `src/components/dashboard/low-stock-alerts.tsx`
  - `src/components/dashboard/documentation-status.tsx`
  - `src/components/dashboard/storage-utilization-grid.tsx`
  - `src/components/dashboard/category-distribution.tsx`
  - `src/components/dashboard/recent-activity-timeline.tsx`
  - `src/components/dashboard/enhanced-metrics-cards.tsx`
  - `src/components/dashboard/inventory-health-score.tsx`
- **Dependencies**: Slice 1 (skeleton primitives must exist)

**Slice 3: Refactor Parts Skeletons**

- **Goal**: Replace parts component skeletons with primitives
- **Touches**:
  - `src/components/parts/part-details.tsx`
  - `src/components/parts/part-location-grid.tsx`
- **Dependencies**: Slice 1

**Slice 4: Investigate and Refactor Remaining Component Skeletons**

- **Goal**: Investigate 13 components with `animate-pulse` and refactor confirmed skeleton patterns
- **Investigation Step**:
  - Read each of the 13 files listed in "Components Requiring Investigation"
  - Determine if `animate-pulse` is used for skeleton loading or other purposes (progress bars, etc.)
  - Create list of files with confirmed skeleton patterns
- **Refactoring Step**:
  - Only refactor files with confirmed skeleton loading patterns
  - Skip files where `animate-pulse` is used for non-skeleton animations
- **Touches** (pending investigation):
  - `src/components/parts/part-list.tsx`
  - `src/components/types/type-list.tsx`
  - `src/components/sellers/seller-list.tsx`
  - `src/components/shopping-lists/*.tsx`
  - `src/components/kits/*.tsx`
  - `src/components/boxes/*.tsx`
  - `src/components/pick-lists/*.tsx`
  - `src/components/documents/cover-image-display.tsx`
  - `src/components/ui/progress-bar.tsx` (likely excluded; progress bar not skeleton)
- **Dependencies**: Slice 1

**Slice 5: Update Playwright Tests**

- **Goal**: Verify skeleton refactoring doesn't break tests
- **Touches**:
  - `tests/e2e/dashboard/*.spec.ts` (if exist)
  - `tests/e2e/parts/*.spec.ts` (if exist)
  - Any other specs with skeleton assertions
- **Dependencies**: Slices 2, 3, 4 (all components refactored)

**Note**: All slices should be completed in a single atomic PR to avoid partial migration state.

---

## 15) Risks & Open Questions

**Risks**

- **Risk**: Playwright tests fail due to skeleton structure changes
- **Impact**: CI pipeline blocked; manual test updates required
- **Mitigation**: Preserve all existing `data-testid` attributes; run full Playwright suite before merge; update selectors as needed

- **Risk**: Minor visual regressions in skeleton layouts
- **Impact**: Users notice slightly different loading states; potential confusion
- **Mitigation**: Accept as documented trade-off per requirements; verify major layouts (dashboard, parts detail) visually before merge

- **Risk**: Missed skeleton usage in rarely visited components
- **Impact**: Inconsistent skeleton patterns remain in codebase
- **Mitigation**: Grep search for `animate-pulse` completed; manually review all 22 files; verify no additional patterns during implementation

- **Risk**: Breaking change disrupts parallel feature work
- **Impact**: Merge conflicts or component incompatibilities
- **Mitigation**: Coordinate with team; execute refactoring during quiet period; communicate breaking change in PR description

**Open Questions**

- **Question**: Should we support additional skeleton variants beyond text/circular/rectangular/avatar?
- **Why it matters**: May need different shapes for future components (e.g., pill-shaped badges, hexagonal icons)
- **Owner / follow-up**: Implementation; add variants on-demand if needed (YAGNI principle)

- **Question**: Should SkeletonGroup support flex vs. grid layouts?
- **Why it matters**: Some skeletons use `flex gap-{n}` instead of `space-y-{n}`
- **Owner / follow-up**: Implementation; add `layout` prop if pattern emerges frequently

- **Question**: Should skeleton animation duration/delay be configurable?
- **Why it matters**: Some UIs benefit from staggered or faster animations
- **Owner / follow-up**: Future enhancement; Tailwind `animate-pulse` sufficient for now

---

## 16) Confidence

**Confidence: High** — Refactoring is well-scoped with clear requirements, all affected files identified via comprehensive grep search, no API or state management changes required, and breaking changes explicitly approved. Risk mitigated by atomic implementation and existing test coverage verification.
