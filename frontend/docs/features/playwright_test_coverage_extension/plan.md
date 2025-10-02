# Playwright Test Coverage Extension - Technical Plan

## Brief Description
Extend the Playwright suite so every core workflow in the Electronics Inventory frontend is covered end-to-end against the real backend. Phases 1-3 landed via follow-up plans that removed route mocks, centralized AI helpers, and wired deployment SSE support. The remaining phases expand coverage across boxes, sellers, dashboard widgets, and cross-domain workflows while leaning on shared instrumentation and factories documented under `docs/contribute/`.

## Implementation Phases
Progress is tracked across six phases. Phases 1-3 were delivered through:
- `docs/features/playwright_ai_flow_adjustments/plan.md`
- `docs/features/playwright_documents_real_backend/plan.md`
- `docs/features/playwright_list_views_cleanup/plan.md`
- `docs/features/playwright_deployment_sse_support/plan.md`
- `docs/features/playwright_no_route_mock_enforcement/plan.md`

The plan below reflects that baseline and focuses on the remaining roadmap.

## Phase Checklist

### Phase 1: Core Test Infrastructure ✅
- [x] Enhance API factories (Part, Box, Seller, Attachments) to seed complex scenarios
- [x] Extend Playwright fixtures, shared helpers, and page object primitives
- [x] Integrate deployment banner coverage with the real backend SSE trigger
- [x] Verify test suite runs successfully
- [x] Update outstanding work document for infra completion (synced 2025-10-02)
- [x] Sign-off before proceeding to Phase 2

### Phase 2: Types Feature Coverage ✅
- [x] Implement TypeList tests (loading states, search, badges)
- [x] Implement TypeSelector tests (inline create/edit) using shared AI helper
- [x] Implement TypeForm instrumentation tests
- [x] Verify test suite runs successfully
- [x] Mark completed items in outstanding work document (synced 2025-09-29)
- [x] Sign-off before proceeding to Phase 3

### Phase 3: Parts Feature Coverage ✅
- [x] Implement Part list & navigation tests with list_loading instrumentation
- [x] Implement Part creation & editing tests on the real backend
- [x] Implement Part duplication & attachment tests using API factories
- [x] Implement Location management tests via inventory endpoints
- [x] Implement Document management tests backed by `/api/testing/content/*`
- [x] Implement AI-assisted creation tests via `aiAnalysisMock`
- [x] Implement Deletion rules & safeguards tests with toast/test-event assertions
- [x] Verify test suite runs successfully
- [x] Mark completed items in outstanding work document (synced 2025-09-29)
- [x] Sign-off before proceeding to Phase 4

### Phase 4: Boxes & Sellers Feature Coverage
- [x] Add list_loading instrumentation, test IDs, and toast/test-event hooks to Boxes & Sellers UIs without introducing route mocks
- [x] Implement Box list coverage (loading, search, creation/edit/delete, usage summaries, navigation to detail)
- [x] Implement Box detail coverage (location grid with part assignments, usage metrics, delete guard + instrumentation)
- [x] Implement Seller list coverage (search, CRUD, external link assertions) using real backend data
- [x] Implement Seller selector integration coverage (inline create, selection persistence, Part form integration)
- [x] Verify test suite runs successfully
- [x] Update outstanding work document for Boxes/Sellers
- [x] Sign-off before proceeding to Phase 5

### Phase 5: Dashboard Coverage
- [x] Add dashboard instrumentation (`ui_state`/`list_loading`) and data-testids for metrics, health, storage, activity, documentation, and alerts
- [x] Implement Enhanced metrics cards tests (loading, value computation, trend metadata)
- [x] Implement Inventory health score tests (inputs from stats, low stock, documentation)
- [x] Implement Storage utilization grid tests (ordering, tooltips, navigation to box detail)
- [x] Implement Recent activity timeline tests (grouping, pagination)
- [x] Implement Low stock alerts tests (severity styling, CTA handling)
- [x] Implement Documentation status tests (milestones, celebration state)
- [x] Implement Category distribution tests (chart rendering, tooltips, expand/collapse)
- [x] Verify test suite runs successfully
- [x] Update outstanding work document for dashboard
- [x] Sign-off before proceeding to Phase 6

### Phase 6: App Shell & Cross-Domain Workflows
- [x] Add app shell instrumentation/test IDs for sidebar, mobile menu, and global toasts while keeping deployment banner wiring intact
- [x] Implement sidebar navigation tests (desktop collapse, active route styling, link coverage)
- [x] Implement mobile menu tests (open/close transitions, navigation)
- [x] Extend deployment banner coverage to assert reload CTA behaviour while using the real backend trigger
- [x] Implement About page tests (hero CTAs, feature grid, quick start guide)
- [x] Implement cross-domain workflow tests (type -> part with seller + location -> dashboard visibility, box reassignment, delete protection)
- [x] Capture test-event/toast instrumentation snapshots for critical flows (form success/error, document failure, AI error)
- [x] Verify test suite runs successfully
- [x] Update outstanding work document with final items
- [x] Final sign-off

## Files and Functions to Create or Modify

### Delivered (Phases 1-3)
Baseline work is covered by the executed plans above. Core artifacts include:
- Shared AI analysis helper and fixture plumbing (`tests/support/helpers/ai-analysis-mock.ts`)
- Attachment/box/seller factories surfaced through `createTestDataBundle`
- List-view instrumentation and lint enforcement (`testing/no-route-mocks`)
- Deployment SSE request-id plumbing and backend trigger documentation
No further changes are required unless follow-up bugs appear.

### Phase 4: Boxes & Sellers Feature Coverage

**Files to Modify**
- `src/components/boxes/box-list.tsx`, `box-card.tsx`, `box-details.tsx`, `location-list.tsx` - add `data-testid`s, list_loading instrumentation, confirm toast/test-event emissions, and dark-mode safe selectors.
- `src/hooks/use-box-locations.ts` - expose helper metadata for part assignments (quantity, tags) and ensure sorting aligns with test assertions.
- `src/components/sellers/seller-list.tsx`, `seller-card.tsx`, `seller-form.tsx`, `seller-selector.tsx`, `seller-create-dialog.tsx` - add instrumentation, test IDs, inline create affordances, and guard external link handling.
- `src/hooks/use-sellers.ts` - thread search term instrumentation and provide eager state signals for tests.
- `tests/api/factories/box-factory.ts`, `tests/api/factories/part-factory.ts`, `tests/api/index.ts` - add helpers to add stock via `/api/inventory/parts/{part_key}/stock`, seed locations, and relate sellers.
- `tests/support/fixtures.ts` - expose `boxes`, `boxDetail`, and `sellers` page objects plus seller selector harness.
- `docs/contribute/testing/factories_and_fixtures.md`, `docs/contribute/testing/playwright_developer_guide.md` - document new helpers and instrumentation expectations.

**Files to Create**
- `tests/support/page-objects/boxes-page.ts` and `box-detail-page.ts`
- `tests/support/page-objects/sellers-page.ts` and `seller-selector-harness.ts`
- `tests/e2e/boxes/box-list.spec.ts`, `tests/e2e/boxes/box-detail.spec.ts`
- `tests/e2e/sellers/seller-crud.spec.ts`, `tests/e2e/sellers/seller-selector.spec.ts`
- Utility helper `tests/support/helpers/box-location.ts` (optional) for asserting location grid state.

### Phase 5: Dashboard Coverage

**Files to Modify**
- `src/hooks/use-dashboard.ts` - emit scoped `ui_state`/`list_loading` events with metadata per widget.
- `src/components/dashboard/*` - add `data-testid`s, guard loading skeletons with instrumentation, surface accessible names for charts/cards.
- `src/components/ui/` primitives used by dashboard (e.g., charts) - ensure deterministic rendering in test mode.
- `tests/support/fixtures.ts` - add `dashboard` page object fixture.
- Documentation updates mirroring new instrumentation (`docs/contribute/architecture/test_instrumentation.md`).

**Files to Create**
- `tests/support/page-objects/dashboard-page.ts`
- `tests/e2e/dashboard/metrics-cards.spec.ts`
- `tests/e2e/dashboard/health-score.spec.ts`
- `tests/e2e/dashboard/storage-utilization.spec.ts`
- `tests/e2e/dashboard/recent-activity.spec.ts`
- `tests/e2e/dashboard/low-stock.spec.ts`
- `tests/e2e/dashboard/documentation-status.spec.ts`
- `tests/e2e/dashboard/category-distribution.spec.ts`

### Phase 6: App Shell & Cross-Domain Workflows

**Files to Modify**
- `src/routes/__root.tsx`, `src/components/layout/sidebar.tsx`, `src/components/ui/deployment-notification-bar.tsx` - add test IDs, expose mobile menu state, ensure reload CTA instrumentation.
- `src/components/parts/part-form.tsx` (or equivalent) - surface seller/location selectors for cross-domain workflows.
- `tests/e2e/parts/part-crud.spec.ts` (or new workflow spec) - integrate seller/location assertions.
- Documentation: `docs/contribute/testing/playwright_developer_guide.md` (navigation instrumentation), `docs/features/playwright_test_coverage_extension/route_mocking_analysis.md` (mark completion).

**Files to Create**
- `tests/support/page-objects/app-shell-page.ts`
- `tests/support/page-objects/about-page.ts`
- `tests/e2e/shell/navigation.spec.ts`
- `tests/e2e/shell/mobile-menu.spec.ts`
- Extend `tests/e2e/deployment/deployment-banner.spec.ts` or add `tests/e2e/shell/deployment-banner-cta.spec.ts` for reload assertion
- `tests/e2e/workflows/end-to-end.spec.ts`
- `tests/e2e/workflows/instrumentation-snapshots.spec.ts`

## Algorithms and Patterns

### Test-Event Capture Pattern
1. Use the `TestEventCapture` fixture to await events via `waitTestEvent` / `waitForListLoading`.
2. Assert event sequences in tandem with UI state; prefer `Promise.all` to tie UI actions with instrumentation.
3. Clear buffers between scenarios (`testEvents.clearEvents`) before capturing new flows.

### Toast Assertion Pattern
1. Use `ToastHelper` for `role="status"` tracking and ensure tests await dismissal logic when needed.
2. Combine toast checks with backend verification (e.g., follow-up GET) to confirm state persisted.
3. Leverage toast-level metadata in emitted events for severity and codes.

### SSE Pattern (AI Analysis Only)
1. Use the shared `aiAnalysisMock` helper to register the sanctioned `/api/ai-parts/analyze` stream with lint waiver inline.
2. Drive flows with helper methods (`waitForConnection`, `emitStarted`, `emitProgress`, `emitCompleted`) and dispose sessions per test.
3. All other SSE usage (deployment banner) must rely on real backend triggers.

### Factory Enhancement Pattern
1. Prefer API-first helpers that create boxes, sellers, and parts with related entities.
2. Use new helpers to add stock to specific locations and retrieve occupancy metadata for assertions.
3. Return structured objects (including correlation IDs) to sync UI and backend expectations.

### List Loading Instrumentation
1. Wrap TanStack Query usage with `useListLoadingInstrumentation` to emit deterministic `list_loading` events.
2. Provide `scope` constants like `boxes.list`, `sellers.list`, `dashboard.metrics`.
3. Attach metadata (counts, degraded queries) so tests can assert readiness and fallbacks without intercepting requests.

## AI Testing Specifics
- Continue using the real `/api/ai-parts/create` endpoint; capture the response and follow-up detail fetches for verification.
- Rely on `aiAnalysisMock` solely for analysis SSE choreography; maintain the lint suppression within the helper.
- For datasheet/photo scenarios, use `/api/testing/content/*` assets and backend instrumentation instead of request interception.
- Emit `kind: 'ai'` test events (request, success, failure, user override) from the feature code so Playwright can assert telemetry.
- Exercise failure modes by toggling backend-provided fallbacks (service unavailable, rate limits) rather than mocking responses.

## Phase 1 Completion Notes (2025-09-23)
- Enhanced Part, Box, Seller, and Attachment factories with helpers for documents, stock, and random data.
- Created BasePage, PartsPage, AI dialog, Location editor, and Document grid page objects.
- Implemented test-event capture, toast helper, SSE mocker (AI-only), and file upload helper; wired them into fixtures.
- Added deployment SSE request-id helper, frontend wiring, and the backend-driven Playwright spec (`tests/e2e/deployment/deployment-banner.spec.ts`).
- All existing tests (23+) pass, TypeScript strict mode remains green, and lint (including `testing/no-route-mocks`) runs clean.

Ready to continue with Phase 4 once the above prerequisites remain satisfied.

## Execution Strategy
1. **Implementation**: Update frontend instrumentation and factories first, then add/extend page objects and specs using real backend helpers.
2. **Targeted Tests**: Run feature-specific specs (e.g., `pnpm playwright test tests/e2e/boxes/box-list.spec.ts`) before the full suite.
3. **Full Validation**: Execute `pnpm playwright test` and `pnpm check` (lint + type-check) to guard against regressions and lint violations.
4. **Documentation Update**: Reflect new helpers/instrumentation in `docs/contribute/` and adjust `docs/epics/playwright_outstanding_work.md`.
5. **Sign-off**: Confirm stakeholders review results before moving to the next phase; keep `testing/no-route-mocks` and instrumentation lint rules green.
