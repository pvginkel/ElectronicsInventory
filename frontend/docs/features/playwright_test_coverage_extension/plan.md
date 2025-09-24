# Playwright Test Coverage Extension - Technical Plan

## Brief Description

Implementation of comprehensive end-to-end test coverage for the Electronics Inventory application, extending the existing Playwright test infrastructure to cover all core features and user workflows. The implementation will be executed in phases corresponding to functional areas, with each phase requiring complete test suite verification before proceeding.

## Implementation Phases

The test coverage extension will be implemented in 6 distinct phases, each focusing on a specific functional area. Each phase must be completed, tested, and signed off before proceeding to the next.

## Phase Checklist

### Phase 1: Core Test Infrastructure ✅
- [x] Enhance API factories (PartTestFactory, BoxTestFactory, SellerTestFactory)
- [x] Extend Playwright fixtures and create shared page object utilities
- [x] Add deployment version update simulation hooks
- [x] Verify test suite runs successfully
- [x] Mark completed items in outstanding work document
- [x] Sign-off before proceeding to Phase 2

### Phase 2: Types Feature Coverage
- [x] Implement TypeList tests (loading states, search, badges)
- [x] Implement TypeSelector tests (inline create/edit)
- [x] Implement TypeForm instrumentation tests
- [x] Verify test suite runs successfully
- [x] Mark completed items in outstanding work document
- [x] Sign-off before proceeding to Phase 3

### Phase 3: Parts Feature Coverage
- [ ] Implement Part list & navigation tests
- [ ] Implement Part creation & editing tests
- [ ] Implement Part duplication & attachment tests
- [ ] Implement Location management tests
- [ ] Implement Document management tests
- [ ] Implement AI-assisted creation tests
- [ ] Implement Deletion rules & safeguards tests
- [ ] Verify test suite runs successfully
- [ ] Mark completed items in outstanding work document
- [ ] Sign-off before proceeding to Phase 4

### Phase 4: Boxes & Sellers Feature Coverage
- [ ] Implement Box list tests
- [ ] Implement Box detail tests
- [ ] Implement Seller list tests
- [ ] Implement SellerSelector integration tests
- [ ] Verify test suite runs successfully
- [ ] Mark completed items in outstanding work document
- [ ] Sign-off before proceeding to Phase 5

### Phase 5: Dashboard Coverage
- [ ] Implement Enhanced metrics cards tests
- [ ] Implement Inventory health score tests
- [ ] Implement Storage utilization grid tests
- [ ] Implement Recent activity timeline tests
- [ ] Implement Low stock alerts tests
- [ ] Implement Documentation status tests
- [ ] Implement Category distribution tests
- [ ] Verify test suite runs successfully
- [ ] Mark completed items in outstanding work document
- [ ] Sign-off before proceeding to Phase 6

### Phase 6: App Shell & Cross-Domain Workflows
- [ ] Implement Sidebar navigation tests
- [ ] Implement Mobile menu tests
- [ ] Implement Deployment notification banner tests
- [ ] Implement About page tests
- [ ] Implement Cross-domain workflow tests
- [ ] Implement test-event/toast instrumentation snapshots
- [ ] Verify test suite runs successfully
- [ ] Mark all completed items in outstanding work document
- [ ] Final sign-off

## Files and Functions to Create or Modify

### Phase 1: Core Test Infrastructure

**Files to Create:**
- `tests/api/factories/box-factory.ts` - BoxTestFactory with capacity defaults and location seeding
- `tests/api/factories/seller-factory.ts` - SellerTestFactory with random generation utilities
- `tests/support/page-objects/base-page.ts` - Base page object with common patterns
- `tests/support/helpers/test-events.ts` - Test-event capture and assertion utilities
- `tests/support/helpers/toast-helpers.ts` - Toast assertion helpers
- `tests/support/helpers/sse-mock.ts` - SSE mocking utilities
- `tests/support/helpers/file-upload.ts` - File upload mock utilities

**Files to Modify:**
- `tests/api/factories/part-factory.ts` - Add stock, location, and document helper methods
- `tests/support/fixtures.ts` - Add shared fixtures for toast assertions, test-event capture

### Phase 2: Types Feature Coverage

**Files to Create:**
- `tests/e2e/types/type-list.spec.ts` - TypeList component tests
- `tests/e2e/types/type-selector.spec.ts` - TypeSelector inline creation tests
- `tests/e2e/types/type-form.spec.ts` - TypeForm instrumentation tests

**Files to Modify:**
- `tests/e2e/types/TypesPage.ts` - Extend with badge and search assertion methods

### Phase 3: Parts Feature Coverage

**Files to Create:**
- `tests/support/page-objects/parts-page.ts` - PartsPage object with list, detail, form abstractions
- `tests/support/page-objects/ai-dialog-page.ts` - AI dialog page object
- `tests/support/page-objects/location-editor-page.ts` - Location editor page object
- `tests/support/page-objects/document-grid-page.ts` - Document grid page object
- `tests/e2e/parts/part-list.spec.ts` - Part list tests
- `tests/e2e/parts/part-crud.spec.ts` - Part creation/editing tests
- `tests/e2e/parts/part-duplication.spec.ts` - Part duplication tests
- `tests/e2e/parts/part-locations.spec.ts` - Location management tests
- `tests/e2e/parts/part-documents.spec.ts` - Document management tests
- `tests/e2e/parts/part-ai-creation.spec.ts` - AI-assisted creation tests (see AI Testing Specifics section)
- `tests/e2e/parts/part-deletion.spec.ts` - Deletion rules tests

### Phase 4: Boxes & Sellers Feature Coverage

**Files to Create:**
- `tests/support/page-objects/boxes-page.ts` - BoxesPage object with list/grid interactions
- `tests/support/page-objects/box-detail-page.ts` - BoxDetailPage object
- `tests/support/page-objects/sellers-page.ts` - SellersPage object
- `tests/support/page-objects/seller-selector-page.ts` - SellerSelector harness
- `tests/e2e/boxes/box-list.spec.ts` - Box list tests
- `tests/e2e/boxes/box-detail.spec.ts` - Box detail tests
- `tests/e2e/sellers/seller-crud.spec.ts` - Seller CRUD operations tests
- `tests/e2e/sellers/seller-integration.spec.ts` - SellerSelector integration tests

### Phase 5: Dashboard Coverage

**Files to Create:**
- `tests/support/page-objects/dashboard-page.ts` - DashboardPage with widget accessors
- `tests/e2e/dashboard/metrics-cards.spec.ts` - Enhanced metrics tests
- `tests/e2e/dashboard/health-score.spec.ts` - Health score tests
- `tests/e2e/dashboard/storage-utilization.spec.ts` - Storage grid tests
- `tests/e2e/dashboard/recent-activity.spec.ts` - Activity timeline tests
- `tests/e2e/dashboard/low-stock.spec.ts` - Low stock alerts tests
- `tests/e2e/dashboard/documentation-status.spec.ts` - Documentation status tests
- `tests/e2e/dashboard/category-distribution.spec.ts` - Category distribution tests

### Phase 6: App Shell & Cross-Domain Workflows

**Files to Create:**
- `tests/support/page-objects/app-shell-page.ts` - AppShellPage for navigation and layout
- `tests/support/page-objects/about-page.ts` - AboutPage object
- `tests/e2e/shell/navigation.spec.ts` - Sidebar and mobile menu tests
- `tests/e2e/shell/deployment-banner.spec.ts` - Deployment notification tests
- `tests/e2e/about/about-page.spec.ts` - About page tests
- `tests/e2e/workflows/end-to-end.spec.ts` - Cross-domain workflow tests
- `tests/e2e/workflows/instrumentation-snapshots.spec.ts` - Test-event/toast snapshots

## Algorithms and Patterns

### Test-Event Capture Pattern
1. Hook into the Playwright binding for test-event emissions
2. Store events in a circular buffer with timestamp and metadata
3. Provide assertion helpers to validate event sequences
4. Clear buffer between test scenarios

### Toast Assertion Pattern
1. Monitor role="status" elements for toast notifications
2. Capture toast text, type (success/error/info), and timing
3. Provide fluent assertions for toast content and sequence
4. Handle toast auto-dismiss timing in assertions

### SSE Mock Pattern
1. Intercept EventSource connections
2. Simulate server-sent events with controlled timing
3. Test reconnection logic and heartbeat handling
4. Validate correlation IDs between frontend and mock events

### Factory Enhancement Pattern
1. Create domain object with minimal required fields
2. Add helper methods for common test scenarios (with stock, with documents)
3. Support override parameters for edge case testing
4. Return both created object and related entities for assertion

## AI Testing Specifics

The AI-assisted creation tests in Phase 3 should cover the following scenarios if implemented:

### Auto-tagging from Description/Manufacturer Code
- Test that entering a manufacturer code like "OMRON G5Q-1A4" generates appropriate tags (e.g., "relay", "5V", "SPDT")
- Test that descriptions like "0603 100nF ceramic capacitor" produce tags like "SMD", "0603", "100nF", "ceramic"
- Verify tag suggestions appear in real-time as the user types
- Test that users can accept, modify, or reject suggested tags
- Verify test-event emissions for AI tag generation (start, success, failure)

### Photo Intake (Mobile Camera)
- Mock file upload with sample component images
- Test that the AI recognizes part numbers from images (e.g., IC markings, label text)
- Verify category suggestions based on visual recognition
- Test fallback behavior when recognition confidence is low
- Verify user can override AI suggestions before saving

### Datasheet Auto-fetching
- Test that entering a known part number triggers datasheet search
- Mock external API responses for datasheet URLs
- Verify PDF is downloaded and attached to the part automatically
- Test user confirmation flow before storing fetched documents
- Handle cases where multiple datasheets are found or none are found
- Verify test-event payloads for datasheet fetch attempts and results

### Edge Cases & Error Handling
- Test AI service unavailability (graceful degradation)
- Test rate limiting scenarios
- Verify toast notifications for AI failures don't block manual entry
- Test that AI features can be disabled/skipped entirely
- Verify correlation IDs link AI requests to form submissions

### Instrumentation Requirements
Each AI interaction should emit test events with:
- `kind: 'ai'`
- `feature`: 'auto-tag' | 'photo-intake' | 'datasheet-fetch'
- `phase`: 'request' | 'success' | 'failure' | 'user-override'
- `correlationId`: linking to the parent form operation
- `metadata`: confidence scores, suggestion counts, processing time

## Phase 1 Completion Notes (2025-09-23)

Phase 1 has been successfully completed with all core test infrastructure enhancements in place:

**Implemented Features:**
- Enhanced PartTestFactory with stock, location, and document helper methods
- Created BoxTestFactory with capacity defaults and location seeding
- Created SellerTestFactory with vendor database and random generation utilities
- Created BasePage object providing common page interaction patterns
- Implemented test-event capture system for instrumentation assertions
- Implemented ToastHelper for toast notification testing
- Implemented SSEMocker with deployment version update simulation
- Implemented FileUploadHelper for file upload testing
- Integrated all helpers into Playwright fixtures

**Test Status:**
- All 23 existing tests passing
- TypeScript compilation successful
- Test infrastructure verified and working

Ready to proceed with Phase 2: Types Feature Coverage.

---

## Execution Strategy

Each phase follows this execution pattern:

1. **Implementation**: Create/modify files according to phase requirements
2. **Test Execution**: Run full test suite with `pnpm playwright test`
3. **Debug & Fix**: Address any failures using `pnpm playwright test --debug`
4. **Documentation Update**: Mark completed items in `docs/epics/playwright_outstanding_work.md`
5. **Sign-off**: Obtain approval before proceeding to next phase

The phased approach ensures:
- Incremental progress with clear checkpoints
- Early detection of infrastructure issues
- Maintainable test suite growth
- Clear progress tracking through the outstanding work document
