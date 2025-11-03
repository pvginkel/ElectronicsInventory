# Remove Dashboard Feature — Technical Plan

## 0) Research Log & Findings

### Discovery Summary

Conducted comprehensive search for dashboard-related code across the frontend codebase using multiple search strategies:

1. **Route discovery**: Located main dashboard route at `src/routes/dashboard.tsx`
2. **Component discovery**: Found 10 dashboard components in `src/components/dashboard/`
3. **Hook discovery**: Identified centralized dashboard hooks in `src/hooks/use-dashboard.ts`
4. **Test discovery**: Located 7 Playwright specs in `tests/e2e/dashboard/` and page object in `tests/support/page-objects/dashboard-page.ts`
5. **Test infrastructure**: Found dashboard fixture, selectors, and page object references
6. **Cross-test dependencies** (discovered during plan review):
   - Smoke test (`tests/smoke.spec.ts:73`) asserts dashboard selectors exist
   - End-to-end workflow test (`tests/e2e/workflows/end-to-end.spec.ts`) uses dashboard fixture and validates dashboard metrics
7. **Navigation discovery**: Confirmed no sidebar navigation link exists; index route redirects to `/parts`
8. **About page discovery**: Found dashboard feature description in About page
9. **Backlog discovery**: Located MetricsCard monitoring item in `docs/features/semantic_component_catalog/prioritized_backlog.md`

### Key Findings

**Isolation**: Dashboard code is well-isolated with clear boundaries:
- Single route file (`dashboard.tsx`)
- Dedicated hooks file (`use-dashboard.ts`)
- Isolated component directory (`src/components/dashboard/`)
- Self-contained test suite (`tests/e2e/dashboard/`)
- No sidebar navigation link (zero entry points from main navigation)

**API Surface**: Dashboard consumes 6 generated API hooks:
- `useGetDashboardStats`
- `useGetDashboardRecentActivity`
- `useGetDashboardLowStock`
- `useGetDashboardStorageSummary`
- `useGetDashboardCategoryDistribution`
- `useGetDashboardPartsWithoutDocuments`

**Unused Components**: Identified 2 components defined but not used in dashboard route:
- `QuickActions` (defined in `quick-actions.tsx`, never imported)
- `QuickFindWidget` (defined in `quick-find-widget.tsx`, never imported)

**Cross-References**:
- About page mentions "Dashboard Analytics" feature (line 38-39 of `src/routes/about.tsx`)
- Test fixtures include `dashboard: DashboardPage` (line 16 import, line 73 fixture registration in `tests/support/fixtures.ts`)
- Test selectors include `dashboard` object (in `tests/support/selectors.ts`)
- About page object has `ctaViewDashboard` locator (no longer used in current About page)
- Smoke test asserts dashboard selectors (line 73 of `tests/smoke.spec.ts`)
- End-to-end workflow test uses dashboard fixture (line 20 of `tests/e2e/workflows/end-to-end.spec.ts`) and validates dashboard after part creation (lines 37, 105-111)

**Generated Code Impact**: Generated API hooks and types will remain in `src/lib/api/generated/` but will have zero usage after removal. This is acceptable as generated code.

---

## 1) Intent & Scope

**User intent**

Remove all dashboard-related code from the frontend application, including the route, components, hooks, tests, and supporting infrastructure. The dashboard feature is not currently useful and will be redesigned from scratch in a future iteration.

**Prompt quotes**

"I don't find the dashboard as it is today useful."

"Can you completely remove the dashboard code from the app including any supporting code that is only used by the dashboard."

"I have a separate project to cleanup the code base of the app. I want to complete that before I add the dashboard back."

**In scope**

- Remove dashboard route (`src/routes/dashboard.tsx`)
- Remove dashboard hooks file (`src/hooks/use-dashboard.ts`)
- Remove all dashboard components directory (`src/components/dashboard/`)
- Remove dashboard Playwright test suite (`tests/e2e/dashboard/`)
- Remove dashboard page object (`tests/support/page-objects/dashboard-page.ts`)
- Remove dashboard fixture from test fixtures (`tests/support/fixtures.ts` - import and registration)
- Remove dashboard selectors from test selectors (`tests/support/selectors.ts`)
- Update smoke test to remove dashboard selector assertion (`tests/smoke.spec.ts`)
- Update end-to-end workflow test to remove dashboard usage (`tests/e2e/workflows/end-to-end.spec.ts`)
- Update About page to remove dashboard feature mention
- Remove unused `ctaViewDashboard` locator from About page object
- Remove MetricsCard monitoring item from semantic component catalog backlog

**Out of scope**

- Backend API endpoints (remain for future dashboard redesign)
- Generated API hooks and types (remain in generated code, zero impact)
- Other routes or features that don't reference dashboard
- Dashboard redesign or replacement (future work)

**Assumptions / constraints**

- Dashboard code is not referenced by any other features (validated during research)
- Generated API code is acceptable to leave in place with zero usage
- Backend endpoints will remain available for future dashboard implementation
- No database migrations or backend changes required
- All dashboard tests will be removed (not converted or moved)

---

## 2) Affected Areas & File Map

### Route Files

- **Area**: Dashboard route
- **Why**: Main entry point for dashboard feature
- **Evidence**: `src/routes/dashboard.tsx:1-50` — Route definition with TanStack Router, composes all dashboard widgets

### Hook Files

- **Area**: Dashboard hooks
- **Why**: Centralized data-fetching layer for all dashboard widgets
- **Evidence**: `src/hooks/use-dashboard.ts:1-458` — Seven custom hooks (`useDashboardMetrics`, `useDashboardHealth`, `useDashboardStorage`, `useDashboardActivity`, `useDashboardLowStock`, `useDashboardDocumentation`, `useDashboardCategories`) wrapping generated API hooks

### Component Files (10 files)

- **Area**: EnhancedMetricsCards component
- **Why**: Dashboard-specific metrics display widget
- **Evidence**: `src/components/dashboard/enhanced-metrics-cards.tsx:1-187` — Displays 4 metric cards using `useDashboardMetrics` hook

- **Area**: InventoryHealthScore component
- **Why**: Dashboard-specific health score gauge widget
- **Evidence**: `src/components/dashboard/inventory-health-score.tsx:1-225` — Circular progress gauge with `useDashboardHealth` hook

- **Area**: StorageUtilizationGrid component
- **Why**: Dashboard-specific storage visualization widget
- **Evidence**: `src/components/dashboard/storage-utilization-grid.tsx:1-249` — Grid of storage boxes using `useDashboardStorage` hook

- **Area**: RecentActivityTimeline component
- **Why**: Dashboard-specific activity timeline widget
- **Evidence**: `src/components/dashboard/recent-activity-timeline.tsx:1-331` — Time-grouped activity feed using `useDashboardActivity` hook

- **Area**: LowStockAlerts component
- **Why**: Dashboard-specific low stock widget
- **Evidence**: `src/components/dashboard/low-stock-alerts.tsx:1-392` — Low stock list with quick actions using `useDashboardLowStock` hook

- **Area**: DocumentationStatus component
- **Why**: Dashboard-specific documentation progress widget
- **Evidence**: `src/components/dashboard/documentation-status.tsx:1-365` — Documentation coverage tracker using `useDashboardDocumentation` hook

- **Area**: CategoryDistribution component
- **Why**: Dashboard-specific category visualization widget
- **Evidence**: `src/components/dashboard/category-distribution.tsx:1-352` — Horizontal bar chart using `useDashboardCategories` hook

- **Area**: MetricsCard component
- **Why**: Standalone metrics card (unused in current dashboard)
- **Evidence**: `src/components/dashboard/metrics-card.tsx:1-49` — Reusable card component, superseded by EnhancedMetricsCards

- **Area**: QuickActions component
- **Why**: Dashboard quick action buttons (never integrated)
- **Evidence**: `src/components/dashboard/quick-actions.tsx:1-85` — Action grid not used in dashboard route

- **Area**: QuickFindWidget component
- **Why**: Dashboard part search widget (never integrated)
- **Evidence**: `src/components/dashboard/quick-find-widget.tsx:1-216` — Searchable part finder not used in dashboard route

### Test Files (10 files)

- **Area**: Dashboard metrics test
- **Why**: Tests EnhancedMetricsCards component
- **Evidence**: `tests/e2e/dashboard/metrics-cards.spec.ts:1-43` — Validates metrics match API data

- **Area**: Dashboard health score test
- **Why**: Tests InventoryHealthScore component
- **Evidence**: `tests/e2e/dashboard/health-score.spec.ts:1-81` — Validates health calculation and tooltip

- **Area**: Dashboard storage test
- **Why**: Tests StorageUtilizationGrid component
- **Evidence**: `tests/e2e/dashboard/storage-utilization.spec.ts` — Validates storage grid rendering

- **Area**: Dashboard activity test
- **Why**: Tests RecentActivityTimeline component
- **Evidence**: `tests/e2e/dashboard/recent-activity.spec.ts` — Tests activity timeline grouping

- **Area**: Dashboard low stock test
- **Why**: Tests LowStockAlerts component
- **Evidence**: `tests/e2e/dashboard/low-stock.spec.ts` — Tests low stock list

- **Area**: Dashboard documentation test
- **Why**: Tests DocumentationStatus component
- **Evidence**: `tests/e2e/dashboard/documentation-status.spec.ts` — Tests documentation progress

- **Area**: Dashboard categories test
- **Why**: Tests CategoryDistribution component
- **Evidence**: `tests/e2e/dashboard/category-distribution.spec.ts` — Tests category visualization

- **Area**: Dashboard page object
- **Why**: Playwright page object providing dashboard selectors and helpers
- **Evidence**: `tests/support/page-objects/dashboard-page.ts:1-121` — Page object with `gotoDashboard()`, `waitForMetricsReady()`, and locator methods

- **Area**: Smoke test
- **Why**: Verifies test infrastructure includes dashboard selectors
- **Evidence**: `tests/smoke.spec.ts:73` — Asserts `selectors.dashboard.page` exists, will fail after dashboard removal

- **Area**: End-to-end workflow test
- **Why**: Cross-domain workflow validates dashboard metrics after part creation
- **Evidence**: `tests/e2e/workflows/end-to-end.spec.ts:20,37,105-111` — Imports dashboard fixture, calls dashboard API, navigates to dashboard, validates metrics

### Test Infrastructure Files

- **Area**: Test fixtures
- **Why**: Remove dashboard fixture import and registration
- **Evidence**: `tests/support/fixtures.ts:16` — Imports `DashboardPage` class, `tests/support/fixtures.ts:73` — Registers `dashboard` fixture

- **Area**: Test selectors
- **Why**: Remove dashboard selector definitions
- **Evidence**: `tests/support/selectors.ts` — Contains `dashboard` object with nested selectors (`dashboard.page`, `dashboard.cards.*`, `dashboard.charts.container`)

### About Page

- **Area**: About page route
- **Why**: Remove dashboard feature description
- **Evidence**: `src/routes/about.tsx:36-40` — Features array contains "Dashboard Analytics" item (icon, title, description)

- **Area**: About page object
- **Why**: Remove unused dashboard CTA locator
- **Evidence**: `tests/support/page-objects/about-page.ts` — Contains `ctaViewDashboard` locator (no longer exists in About page UI)

### Documentation Files

- **Area**: Semantic component catalog backlog
- **Why**: Remove MetricsCard monitoring item
- **Evidence**: `docs/features/semantic_component_catalog/prioritized_backlog.md:126-130` — Phase 3 monitoring section contains MetricsCard entry referencing dashboard

---

## 3) Data Model / Contracts

### Dashboard API Contracts (Generated, Remaining Unused)

- **Entity**: Dashboard stats
- **Shape**: `{ totalParts: number; totalBoxes: number; lowStockCount: number; recentChanges7d: number; recentChanges30d: number }`
- **Mapping**: Snake_case from backend to camelCase in generated types
- **Evidence**: `src/lib/api/generated/hooks.ts` — `useGetDashboardStats` hook

- **Entity**: Dashboard activity
- **Shape**: `{ items: Array<{ id: string; type: 'addition' | 'removal' | 'move'; partId: string; timestamp: string; ... }> }`
- **Mapping**: Snake_case to camelCase in generated types
- **Evidence**: `src/lib/api/generated/hooks.ts` — `useGetDashboardRecentActivity` hook

- **Entity**: Dashboard low stock
- **Shape**: `{ items: Array<{ partId: string; partName: string; quantity: number; minQuantity: number; ... }> }`
- **Mapping**: Snake_case to camelCase in generated types
- **Evidence**: `src/lib/api/generated/hooks.ts` — `useGetDashboardLowStock` hook

- **Entity**: Dashboard storage summary
- **Shape**: `{ boxes: Array<{ boxId: number; boxNumber: string; capacity: number; used: number; locations: number; ... }> }`
- **Mapping**: Snake_case to camelCase in generated types
- **Evidence**: `src/lib/api/generated/hooks.ts` — `useGetDashboardStorageSummary` hook

- **Entity**: Dashboard category distribution
- **Shape**: `{ categories: Array<{ categoryName: string; partCount: number }> }`
- **Mapping**: Snake_case to camelCase in generated types
- **Evidence**: `src/lib/api/generated/hooks.ts` — `useGetDashboardCategoryDistribution` hook

- **Entity**: Dashboard undocumented parts
- **Shape**: `{ parts: Array<{ partId: string; partName: string; ... }> }`
- **Mapping**: Snake_case to camelCase in generated types
- **Evidence**: `src/lib/api/generated/hooks.ts` — `useGetDashboardPartsWithoutDocuments` hook

**Note**: All generated hooks and types remain in place after dashboard removal. They have zero usage and zero impact on the application.

---

## 4) API / Integration Surface

### Dashboard-Specific Generated Hooks (Unused After Removal)

- **Surface**: `GET /api/dashboard/stats` via `useGetDashboardStats`
- **Inputs**: None
- **Outputs**: Stats object with totals and change counts
- **Errors**: Handled by TanStack Query error boundaries
- **Evidence**: `src/hooks/use-dashboard.ts:82-137` — Used by `useDashboardMetrics` and `useDashboardHealth`

- **Surface**: `GET /api/dashboard/recent-activity` via `useGetDashboardRecentActivity`
- **Inputs**: None
- **Outputs**: Activity items array
- **Errors**: Handled by TanStack Query error boundaries
- **Evidence**: `src/hooks/use-dashboard.ts:316-344` — Used by `useDashboardActivity`

- **Surface**: `GET /api/dashboard/low-stock` via `useGetDashboardLowStock`
- **Inputs**: None
- **Outputs**: Low stock items array
- **Errors**: Handled by TanStack Query error boundaries
- **Evidence**: `src/hooks/use-dashboard.ts:346-376` — Used by `useDashboardLowStock`

- **Surface**: `GET /api/dashboard/storage-summary` via `useGetDashboardStorageSummary`
- **Inputs**: None
- **Outputs**: Storage boxes array with utilization data
- **Errors**: Handled by TanStack Query error boundaries
- **Evidence**: `src/hooks/use-dashboard.ts:279-314` — Used by `useDashboardStorage`

- **Surface**: `GET /api/dashboard/category-distribution` via `useGetDashboardCategoryDistribution`
- **Inputs**: None
- **Outputs**: Category distribution array
- **Errors**: Handled by TanStack Query error boundaries
- **Evidence**: `src/hooks/use-dashboard.ts:426-457` — Used by `useDashboardCategories`

- **Surface**: `GET /api/dashboard/parts-without-documents` via `useGetDashboardPartsWithoutDocuments`
- **Inputs**: None
- **Outputs**: Undocumented parts array
- **Errors**: Handled by TanStack Query error boundaries
- **Evidence**: `src/hooks/use-dashboard.ts:378-424` — Used by `useDashboardDocumentation`

**Cache Invalidation**: Dashboard-specific cache keys (prefixed with `dashboard`) will no longer be populated. No manual invalidation required; keys naturally expire.

---

## 5) Algorithms & UI Flows

### Dashboard Page Render Flow (Removed)

- **Flow**: Dashboard page load
- **Steps**:
  1. TanStack Router navigates to `/dashboard`
  2. Dashboard route component mounts
  3. Seven widget components mount in parallel
  4. Each widget triggers its corresponding hook (`useDashboardMetrics`, etc.)
  5. Hooks trigger generated API hooks with configured cache times
  6. `useListLoadingInstrumentation` emits loading events for each widget
  7. Widgets render loading skeletons during data fetch
  8. On success, widgets render data with `useListLoadingInstrumentation` emitting ready events
  9. On error, widgets render error states
- **States / transitions**: Each widget: `loading` → `ready` | `error` | `empty`
- **Hotspots**: Seven parallel queries on initial load, activity polling every 5 seconds
- **Evidence**: `src/routes/dashboard.tsx:1-50` — Route composition, `src/hooks/use-dashboard.ts` — Hook implementations

### Health Score Calculation Algorithm (Removed)

- **Flow**: Health score computation
- **Steps**:
  1. `useDashboardHealth` aggregates five queries (stats, documentation, storage, low stock, activity)
  2. Compute documentation coverage: `(totalParts - undocumentedCount) / totalParts * 100`
  3. Compute stock health: `(totalParts - lowStockCount) / totalParts * 100`
  4. Compute organization: `(activeBoxes / totalBoxes) * 100`
  5. Compute activity score: `Math.min(recentChanges7d / 10, 1) * 100`
  6. Apply weighted average: `(documentation * 0.4) + (stock * 0.25) + (organization * 0.2) + (activity * 0.15)`
  7. Clamp result to 0-100 range
- **States / transitions**: `loading` → `ready` (with computed score) | `error`
- **Hotspots**: Five-query dependency fan-out, client-side aggregation
- **Evidence**: `src/hooks/use-dashboard.ts:139-277` — Health hook with weighted formula

**Impact of Removal**: All dashboard flows, algorithms, and state machines will be deleted. No other features depend on these flows.

---

## 6) Derived State & Invariants

### Dashboard Health Score (Removed)

- **Derived value**: Health score (0-100)
  - **Source**: Five queries (stats, documentation, storage, low stock, activity)
  - **Writes / cleanup**: No writes; read-only computed value for display
  - **Guards**: Clamps to 0-100 range, handles missing data as 0
  - **Invariant**: Score must be between 0 and 100 inclusive
  - **Evidence**: `src/hooks/use-dashboard.ts:139-277`

### Dashboard Low Stock Critical Count (Removed)

- **Derived value**: Critical items count (quantity <= 2)
  - **Source**: Low stock query filtered by quantity threshold
  - **Writes / cleanup**: No writes; read-only filtered count
  - **Guards**: Only counts items with `quantity <= 2`
  - **Invariant**: Count must be <= total low stock items
  - **Evidence**: `src/components/dashboard/low-stock-alerts.tsx` — Criticality logic

### Dashboard Storage Utilization Percentage (Removed)

- **Derived value**: Overall utilization percentage
  - **Source**: Storage query aggregating all boxes
  - **Writes / cleanup**: No writes; read-only computed percentage
  - **Guards**: Handles division by zero (0% if no boxes)
  - **Invariant**: Percentage must be between 0 and 100 inclusive
  - **Evidence**: `src/components/dashboard/storage-utilization-grid.tsx` — Utilization calculation

### Dashboard Activity Time Grouping (Removed)

- **Derived value**: Activity items grouped by time period
  - **Source**: Activity query grouped by relative time (Just Now, Today, Yesterday, This Week, Earlier)
  - **Writes / cleanup**: No writes; read-only grouping for display
  - **Guards**: Falls back to "Earlier" for unmatched timestamps
  - **Invariant**: Each item appears in exactly one group
  - **Evidence**: `src/components/dashboard/recent-activity-timeline.tsx` — Grouping logic

**Impact of Removal**: All derived state specific to dashboard will be deleted. No other features depend on these computations.

---

## 7) State Consistency & Async Coordination

### Dashboard Widget Cache Coordination (Removed)

- **Source of truth**: TanStack Query cache with per-endpoint cache keys
- **Coordination**: Each widget independently fetches and caches data; no cross-widget state sharing
- **Async safeguards**: TanStack Query automatic request deduplication, stale-time prevents over-fetching
- **Instrumentation**: `useListLoadingInstrumentation` emits `ListLoading` events for each widget (state: `loading` → `ready` | `error` | `empty`)
- **Evidence**: `src/hooks/use-dashboard.ts:13-20` — Cache time configuration, `src/hooks/use-dashboard.ts:46-80` — Instrumentation hook

### Dashboard Activity Polling (Removed)

- **Source of truth**: Activity query with 0s stale time (always fresh)
- **Coordination**: Refetch every 5 seconds via TanStack Query `refetchInterval`
- **Async safeguards**: TanStack Query cancels in-flight requests on unmount
- **Instrumentation**: Emits `ListLoading` events on each poll cycle
- **Evidence**: `src/hooks/use-dashboard.ts:316-344` — Activity hook with `refetchInterval: 5000`

**Impact of Removal**: All dashboard-specific cache keys will no longer be populated. TanStack Query will automatically clean up unused cache entries.

---

## 8) Errors & Edge Cases

### Dashboard Data Fetch Failures (Removed)

- **Failure**: Any dashboard API endpoint returns error
- **Surface**: Corresponding widget component
- **Handling**: Widget renders error state with generic error message; no retry button
- **Guardrails**: TanStack Query error boundaries prevent crash; instrumentation emits error state
- **Evidence**: `src/hooks/use-dashboard.ts` — All hooks return error states, components handle errors

### Dashboard Empty States (Removed)

- **Failure**: API returns empty data (e.g., no low stock items)
- **Surface**: Corresponding widget component
- **Handling**: Widget renders "No items" or empty placeholder state
- **Guardrails**: Instrumentation emits `empty` state for tests
- **Evidence**: `src/components/dashboard/low-stock-alerts.tsx`, `src/components/dashboard/recent-activity-timeline.tsx` — Empty state rendering

### Dashboard Route Direct Navigation (Removed)

- **Failure**: User navigates to `/dashboard` directly (e.g., bookmark, manual URL)
- **Surface**: TanStack Router
- **Handling**: Currently allowed; after removal, will result in 404 or redirect
- **Guardrails**: No sidebar link exists, so accidental navigation unlikely
- **Evidence**: `src/routes/dashboard.tsx` — Route definition

**Impact of Removal**: After removal, navigating to `/dashboard` will result in TanStack Router 404 behavior. No error handling changes required.

---

## 9) Observability / Instrumentation

### Dashboard Widget Loading Events (Removed)

- **Signal**: `ListLoading` events for each widget
- **Type**: Test instrumentation event
- **Trigger**: Emitted by `useListLoadingInstrumentation` hook in each dashboard hook
- **Labels / fields**: `{ state: 'loading' | 'ready' | 'error' | 'empty', listName: 'dashboard-metrics' | 'dashboard-health' | ... }`
- **Consumer**: Playwright tests via `waitForListLoading` helper
- **Evidence**: `src/hooks/use-dashboard.ts:46-80` — Instrumentation hook, `tests/e2e/dashboard/` — All tests rely on these events

### Dashboard Widget UI State Events (Removed)

- **Signal**: `UiState` events for widget state transitions
- **Type**: Test instrumentation event
- **Trigger**: Emitted by `useUiStateInstrumentation` hook in dashboard components
- **Labels / fields**: `{ state: 'loading' | 'ready' | 'error' | 'empty', component: 'dashboard-metrics' | ... }`
- **Consumer**: Playwright tests via `waitForUiState` helper
- **Evidence**: `src/hooks/use-dashboard.ts` — UI state instrumentation in hooks

### Dashboard Test IDs (Removed)

- **Signal**: `data-testid` attributes on all dashboard elements
- **Type**: Test selector
- **Trigger**: Rendered by dashboard components
- **Labels / fields**: Prefix `dashboard.*` (e.g., `dashboard.metrics.card.parts`, `dashboard.health.score`)
- **Consumer**: Playwright tests and page objects
- **Evidence**: `src/components/dashboard/` — All components, `tests/support/page-objects/dashboard-page.ts` — Page object selectors

**Impact of Removal**: All dashboard-specific instrumentation will be deleted. No other features emit or consume these events.

---

## 10) Lifecycle & Background Work

### Dashboard Activity Polling (Removed)

- **Hook / effect**: TanStack Query `refetchInterval` in `useDashboardActivity`
- **Trigger cadence**: Every 5 seconds while dashboard mounted
- **Responsibilities**: Fetch latest activity items from backend
- **Cleanup**: TanStack Query automatically stops polling on unmount
- **Evidence**: `src/hooks/use-dashboard.ts:316-344` — Activity hook with `refetchInterval: 5000`

### Dashboard Widget Mount Effects (Removed)

- **Hook / effect**: React `useEffect` in dashboard components for instrumentation setup
- **Trigger cadence**: On mount
- **Responsibilities**: Initialize test event bridge, emit initial loading events
- **Cleanup**: Test event bridge cleanup on unmount
- **Evidence**: `src/hooks/use-dashboard.ts:46-80` — Instrumentation hook setup

**Impact of Removal**: All dashboard lifecycle hooks and polling will be removed. No background work will persist after removal.

---

## 11) Security & Permissions

Not applicable. Dashboard displays read-only aggregated data with no authentication or authorization logic. Backend API endpoints handle security; frontend removal has no security impact.

---

## 12) UX / UI Impact

### Dashboard Route Removal

- **Entry point**: Direct URL navigation to `/dashboard`
- **Change**: Route will no longer exist; navigating to `/dashboard` will result in 404
- **User interaction**: No sidebar link exists, so users cannot accidentally navigate to dashboard
- **Dependencies**: None
- **Evidence**: `src/routes/dashboard.tsx` — Route definition, `src/components/layout/sidebar.tsx:18-26` — Sidebar navigation items (no dashboard link)

### About Page Feature List Update

- **Entry point**: About page (`/about`)
- **Change**: Remove "Dashboard Analytics" feature from features grid
- **User interaction**: Users will see 5 features instead of 6 in the features grid
- **Dependencies**: About page component
- **Evidence**: `src/routes/about.tsx:36-40` — Features array with dashboard item

**Impact**: Minimal UX impact. Dashboard was not linked from sidebar, so removal will not disrupt normal user workflows. Users who bookmarked `/dashboard` will encounter 404.

---

## 13) Deterministic Test Plan

### Removal Verification Scenarios

**Surface**: Dashboard route and components

**Scenarios**:
- **Given** the dashboard code has been removed, **When** navigating to `/dashboard`, **Then** TanStack Router returns 404 or redirects to index
- **Given** all dashboard tests have been removed, **When** running `pnpm playwright test`, **Then** no dashboard specs are executed
- **Given** dashboard fixture and selectors removed, **When** importing fixtures, **Then** no dashboard references exist
- **Given** About page updated, **When** viewing About page, **Then** "Dashboard Analytics" feature is not displayed

**Instrumentation / hooks**: No new instrumentation required; verification via existing test infrastructure

**Gaps**: Manual verification recommended for:
- Confirming no dangling imports or references in non-dashboard code
- Checking that `pnpm check` passes (TypeScript compilation, linting)
- Ensuring no runtime errors after dashboard removal

**Evidence**: No existing tests for removal scenarios (not applicable)

### Regression Testing Requirements

**Surface**: Existing features unrelated to dashboard

**Scenarios**:
- **Given** dashboard removed, **When** running full Playwright suite, **Then** all non-dashboard tests pass
- **Given** dashboard removed, **When** running `pnpm check`, **Then** TypeScript and linting pass
- **Given** dashboard removed, **When** building application, **Then** build succeeds with no errors

**Instrumentation / hooks**: Existing test infrastructure (Playwright, TypeScript, ESLint)

**Gaps**: None; existing CI verification is sufficient

**Evidence**: `docs/contribute/testing/ci_and_execution.md` — Local run expectations

---

## 14) Implementation Slices

### Slice 1: Remove Dashboard Components and Route

- **Goal**: Delete dashboard route, components, and hooks
- **Touches**:
  - `src/routes/dashboard.tsx` (delete)
  - `src/hooks/use-dashboard.ts` (delete)
  - `src/components/dashboard/*.tsx` (delete entire directory)
- **Dependencies**: None; isolated deletion

### Slice 2: Remove Dashboard Tests

- **Goal**: Delete dashboard Playwright tests, page object, and update tests that reference dashboard
- **Touches**:
  - `tests/e2e/dashboard/*.spec.ts` (delete entire directory)
  - `tests/support/page-objects/dashboard-page.ts` (delete)
  - `tests/smoke.spec.ts` (remove line 73: dashboard selector assertion)
  - `tests/e2e/workflows/end-to-end.spec.ts` (remove dashboard fixture from test signature at line 20, remove dashboard API calls at lines 37 and 108, remove dashboard navigation and validation at lines 105-111)
- **Dependencies**: Must happen after Slice 1 to avoid import errors

### Slice 3: Clean Up Test Infrastructure

- **Goal**: Remove dashboard from fixtures and selectors
- **Touches**:
  - `tests/support/fixtures.ts` line 16 (remove import: `import { DashboardPage } from './page-objects/dashboard-page';`)
  - `tests/support/fixtures.ts` line 73 (remove from TestFixtures type: `dashboard: DashboardPage;`)
  - `tests/support/fixtures.ts` (remove dashboard fixture registration in test.extend block)
  - `tests/support/selectors.ts` (remove entire `dashboard` object with nested selectors)
- **Dependencies**: Must happen after Slice 2 (page object deletion and test updates)

### Slice 4: Update About Page and Documentation

- **Goal**: Remove dashboard references from About page and backlog
- **Touches**:
  - `src/routes/about.tsx` (remove dashboard feature from features array)
  - `tests/support/page-objects/about-page.ts` (remove `ctaViewDashboard` locator)
  - `docs/features/semantic_component_catalog/prioritized_backlog.md` (remove MetricsCard item)
- **Dependencies**: None; can run in parallel with other slices

### Slice 5: Verification and Cleanup

- **Goal**: Verify removal and run full test suite
- **Touches**:
  - Run `pnpm check` to verify TypeScript and linting (expect: no errors)
  - Run `pnpm playwright test` to verify all tests pass (expect: all specs pass, dashboard specs no longer executed)
  - Search codebase for remaining "dashboard" references (expect: only generated API code and this plan document)
  - Verify dashboard route returns 404: manually navigate to `/dashboard` in browser (expect: TanStack Router 404)

**Verification Commands**:
```bash
# TypeScript and linting verification
pnpm check
# Expected output: All checks pass, no TypeScript errors

# Full test suite (should skip dashboard specs)
pnpm playwright test
# Expected output: All tests pass, no dashboard specs in output

# Search for remaining dashboard references (should only find generated code)
grep -r "dashboard" src/ --include="*.ts" --include="*.tsx" | grep -v "src/lib/api/generated"
# Expected output: Empty (no matches outside generated code)

# Search test directory (should only find this plan and review docs)
grep -r "dashboard" tests/ --include="*.ts"
# Expected output: Empty (no matches)

# Verify no dashboard imports remain
grep -r "import.*dashboard" src/ tests/ --include="*.ts" --include="*.tsx"
# Expected output: Empty (no matches)

# Check route file doesn't exist
ls src/routes/dashboard.tsx
# Expected output: "No such file or directory"

# Check component directory doesn't exist
ls src/components/dashboard/
# Expected output: "No such file or directory"

# Check test directory doesn't exist
ls tests/e2e/dashboard/
# Expected output: "No such file or directory"
```

- **Dependencies**: Must happen after all other slices complete

---

## 15) Risks & Open Questions

**Risk**: Smoke test and e2e workflow test dependencies (identified during plan review)

- **Impact**: Tests fail immediately after dashboard removal if not updated
- **Mitigation**: Plan updated to include explicit updates to `tests/smoke.spec.ts` (line 73) and `tests/e2e/workflows/end-to-end.spec.ts` (lines 20, 37, 105-111) in Slice 2

**Risk**: Dangling imports or references to dashboard code in non-dashboard files

- **Impact**: TypeScript compilation errors or runtime crashes
- **Mitigation**: Run `pnpm check` immediately after removal; search codebase for "dashboard" references; rely on TypeScript to catch missing imports; explicit import removal documented in Slice 3

**Risk**: Generated API hooks remain unused but cause confusion

- **Impact**: Future developers may wonder why dashboard hooks exist in generated code
- **Mitigation**: Accept as normal for generated code; backend endpoints remain for future dashboard redesign; no action required

**Risk**: Users with bookmarks or direct links to `/dashboard` encounter 404

- **Impact**: Minor UX confusion for users who bookmarked dashboard
- **Mitigation**: Acceptable; dashboard was not useful and had no sidebar link; users will adapt to using other routes

**Risk**: Removal inadvertently affects other features

- **Impact**: Regression in unrelated features
- **Mitigation**: Run full Playwright suite after removal; dashboard code is well-isolated with only two cross-test dependencies (now documented and addressed in plan)

**Risk**: About page test may reference dashboard feature

- **Impact**: About page test failures after dashboard feature removed
- **Mitigation**: Review About page test after updating features array; update assertions if needed

**Open Question**: Should we redirect `/dashboard` to `/parts` or let it 404?

- **Why it matters**: User experience for bookmarked dashboard links
- **Owner / follow-up**: Decision can be made during implementation; recommend 404 for simplicity (TanStack Router default behavior)

---

## 16) Confidence

**Confidence**: High — Dashboard code is well-isolated with clear boundaries, comprehensive research identified all affected areas (including two cross-test dependencies discovered during plan review and now addressed), removal is straightforward deletion with explicit steps for all updates, concrete verification commands provided, and full test suite will verify no regressions. Plan has been reviewed and updated to address all critical issues.
