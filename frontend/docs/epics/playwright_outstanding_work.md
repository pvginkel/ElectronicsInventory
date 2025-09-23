# Playwright Test Suite - Outstanding Work

This document consolidates all remaining work for the Playwright test suite implementation. Items are organized by category and priority.

## 1. Production Build Verification

### Build Analysis
- [x] Production build verification (manual process)
- [x] No test code in production bundles (needs build analysis)
- [x] Verify all test instrumentation is removed
- [x] Bundle size impact analysis
- [x] Performance impact verification

### Production Safety
- [x] Verify isTestMode() gates work correctly
- [x] Ensure no TEST_EVT emissions in production
- [x] Confirm no test fixtures leak to production
- [x] Validate no debug logging in production

## 2. Error Handling & Validation Patterns

### Form Validation Integration
- [ ] Form validation error integration
- [ ] Field-level error display patterns
- [ ] Form-level error aggregation
- [ ] Stable formId generation strategy

### Mutation Error Handling
- [ ] Mutation success/error event correlation
- [ ] Optimistic update rollback testing
- [ ] Retry logic testing
- [ ] Conflict resolution patterns (409 errors)

### Query Error Patterns
- [ ] Add global onSettled hook for query lifecycle
- [ ] Correlation ID propagation in query errors
- [ ] Integration with centralized error handling system
- [ ] Network failure simulation and recovery

### Console Error Management
- [ ] Audit and migrate misused console.error to console.warn/log
- [ ] Add ability to explicitly silence expected console.error in tests
- [ ] Document console error policy for new tests

## 3. Documentation & Patterns

### Testing Patterns Documentation
- [x] Document how to assert using TEST_EVT (see [docs/contribute/testing/error_handling_and_validation.md](../contribute/testing/error_handling_and_validation.md))
- [x] Event sequence assertion patterns (see [docs/contribute/testing/playwright_developer_guide.md](../contribute/testing/playwright_developer_guide.md) and [docs/contribute/architecture/test_instrumentation.md](../contribute/architecture/test_instrumentation.md))
- [x] Instrumentation extension guidelines (see [docs/contribute/architecture/test_instrumentation.md](../contribute/architecture/test_instrumentation.md))
- [x] Common testing patterns and anti-patterns (see [docs/contribute/testing/README.md](../contribute/testing/README.md))
- [x] Performance testing guidelines (see [docs/contribute/testing/no_sleep_patterns.md](../contribute/testing/no_sleep_patterns.md) and [docs/contribute/testing/ci_and_execution.md](../contribute/testing/ci_and_execution.md))

### Developer Guides
- [x] Guide for adding tests to new features (see [docs/contribute/howto/add_e2e_test.md](../contribute/howto/add_e2e_test.md))
- [x] Page Object Model best practices (see [docs/contribute/testing/page_objects.md](../contribute/testing/page_objects.md))
- [x] Factory pattern guidelines (see [docs/contribute/testing/factories_and_fixtures.md](../contribute/testing/factories_and_fixtures.md))
- [x] Selector strategy decisions (see [docs/contribute/testing/selector_patterns.md](../contribute/testing/selector_patterns.md))
- [x] Debugging failed tests guide (see [docs/contribute/testing/troubleshooting.md](../contribute/testing/troubleshooting.md))

## 4. Test Coverage Extension

### Core Test Infrastructure
- [ ] Expand API factories and helpers
  - [ ] Enhance `PartTestFactory` with stock/location/document helpers for complex UI preconditions
  - [ ] Add `BoxTestFactory` with capacity defaults, location seeding, and part-assignment utilities
  - [ ] Add `SellerTestFactory` with random name/URL generation and part linkage helpers
- [ ] Extend Playwright fixtures & page objects
  - [ ] Shared helpers for toast assertions, TEST_EVT capture, SSE mocking, and file upload utilities
  - [ ] Parts: list, detail, form, AI dialog, location editor, and document grid abstractions
  - [ ] Boxes: list/grid interactions and detailed location view helpers
  - [ ] Sellers: list/forms plus selector harness for inline creation
  - [ ] Dashboard: widget accessors (metrics, health score, low stock, docs, categories, storage) and sidebar/mobile shell controls
- [ ] Add testing hooks to simulate deployment-version updates for banner coverage

### Types Feature Coverage
- [ ] Cover TypeList loading/empty/error states and persisted search queries
- [ ] Verify part-count badges update after creating and deleting linked parts
- [ ] Exercise TypeSelector inline create/edit flows inside Part form and AI review experiences
- [ ] Assert TypeForm instrumentation emits expected TEST_EVT sequences (open, submit, success, validation)

### Parts Feature Coverage
- [ ] Part list & navigation
  - [ ] Validate card rendering (cover image, type badge, tags, vendor link, quantity summary)
  - [ ] Search by description/manufacturer code/type/tag and confirm clear search resets results
  - [ ] Loading skeleton, API error card, empty-state CTA, and navigation from list to detail/AI dialog
- [ ] Part creation & editing
  - [ ] Create part with required/optional fields; verify success toast, redirect, and persisted values
  - [ ] Form validation edges (required description, numeric bounds, max lengths) and cancel behavior
  - [ ] SellerSelector inline creation, tag add/remove, and mounting type selector behaviors
  - [ ] Edit existing part, confirm updated metadata, and ensure cancel leaves data unchanged
- [ ] Part duplication & attachment copy
  - [ ] Launch duplicate from detail, deselect attachments, toggle cover, observe copy progress UI, and assert success/error toasts
  - [ ] Confirm duplicated part retains specs/tags while generating new identifiers
- [ ] Location management
  - [ ] Add stock manually and via `Use Suggested` when type recommendations exist
  - [ ] Adjust quantities with increment/decrement, inline edits (including zero to delete) and verify total quantity badge updates
  - [ ] Prevent duplicate box/location assignments and surface backend errors via toast instrumentation
- [ ] Document management
  - [ ] Upload file attachment (mock backend) and add URL attachment with preview/skeleton/error handling
  - [ ] Operate media viewer (open image/PDF, carousel navigation), set cover, and delete with confirmation
  - [ ] Validate clipboard paste upload path and camera option gracefully disabling when unavailable
- [ ] AI-assisted creation
  - [ ] Full happy path: input → SSE progress → review adjustments → create part (single + create-another loops)
  - [ ] Failure handling: server analysis error displays retry; cancel returns to input step cleanly
  - [ ] Review editing: convert suggested type into real type, adjust documents/tags, select seller before submit
  - [ ] Dialog lifecycle regressions (close/reopen resets state appropriately)
- [ ] Deletion rules & safeguards
  - [ ] Delete succeeds only when total quantity is zero and redirects to list with toast
  - [ ] Attempting delete with stock present surfaces error toast and preserves record

### Boxes Feature Coverage
- [ ] Box list
  - [ ] Create/edit/delete flows with validation (capacity bounds, description length) and toast assertions
  - [ ] Search by box number/description, handle empty/filter-empty/error states, and confirm usage metrics update after part moves
- [ ] Box detail
  - [ ] Verify summary (number, description, capacity, usage bar, last updated) reflects API data
  - [ ] Location list styling for occupied vs empty slots, part badges, quantities, and fallback rendering when enhanced API fails
  - [ ] Delete from detail redirects back to list; edit dialog updates live metadata

### Sellers Feature Coverage
- [ ] Seller list create/edit/delete flows with URL/name validation, loading/empty/error views, and toast checks
- [ ] Ensure deleting seller associated with parts surfaces backend error (or confirm allowed behavior) without losing associations
- [ ] SellerSelector inline creation from Part form & AI review, including website link opening in new tab

### Dashboard Coverage
- [ ] Enhanced metrics cards show data, skeleton during load, and reflect updated fixtures (parts/boxes/low stock)
- [ ] Inventory health score renders tooltip breakdown, hover behavior, and click target
- [ ] Storage utilization grid ordering, summary stats, empty/error states, and navigation to box detail
- [ ] Recent activity timeline grouping, show more/less controls, empty CTA, and part navigation
- [ ] Low stock alerts: severity styling, quick-add toggle, dismiss/restore, show more flow, and CTA navigation
- [ ] Documentation status: milestone badges, quick fix list, bulk upload CTA placeholder, and 100% celebration state
- [ ] Category distribution: bar rendering, tooltips, smart insights, show-all toggle, and navigation hooks

### App Shell & Auxiliary Pages
- [ ] Sidebar navigation collapse/expand, active route styling, and link coverage for Dashboard/Parts/Boxes/Types/Sellers/About
- [ ] Mobile menu overlay open/close interactions and navigation behavior
- [ ] Deployment notification banner appears when simulated version SSE fires and reload button refreshes app
- [ ] About page hero CTAs, feature grid counts, and quick start guide visibility
- [ ] Smoke test for root layout ensuring QueryClientProvider/ToastProvider bootstrap without console errors

### Cross-Domain Workflows & Regression Guards
- [ ] End-to-end flow: create type → create part (with seller + location) → verify Part detail, Type part counts, and dashboard metrics update
- [ ] Move part between boxes and assert both Part detail and Box detail reflect new allocation
- [ ] Delete box with assigned parts is blocked (toast + unchanged locations)
- [ ] Capture TEST_EVT / toast instrumentation snapshots for critical flows (form submit success/error, document upload failure, AI analysis error)

## 5. Test Artifacts & Debugging

### Artifact Organization
- [ ] Artifact organization for LLM consumption
  - [ ] Structured metadata for failures
  - [ ] Context extraction for debugging
  - [ ] Key frame extraction from videos
  - [ ] Failure categorization
- [ ] Human-readable artifact naming
  - [ ] Descriptive folder structures
  - [ ] Clear file naming conventions
  - [ ] Timestamp and test name inclusion
  - [ ] Failure reason in artifact names

### Debugging Enhancements
- [ ] Enhanced error messages in assertions
- [ ] Stack trace improvements
- [ ] Test step logging
- [ ] Visual regression testing setup

## 6. Backend Integration (nice to haves)

### Backend Testing Endpoints
- [ ] Handle `/api/testing/reset?seed=true|false` endpoint (test mode only)
  - Reset database to clean state
  - Optional seed data parameter
  - Run before test suites (not individual tests)
- [ ] Reset concurrency handling (503 responses with Retry-After)
  - Handle concurrent reset requests gracefully
  - Implement retry logic with backoff

### Backend Log Streaming
- [ ] Connect to `/api/testing/logs/stream` SSE endpoint
- [ ] Parse structured JSON log format:
  - [ ] timestamp (ISO format)
  - [ ] level (ERROR, WARNING, INFO, DEBUG)
  - [ ] logger name
  - [ ] message
  - [ ] correlation_id (from Flask-Log-Request-ID)
  - [ ] extra fields
- [ ] Stream consumption from connection time (no historical buffer)
- [ ] Correlation ID matching between frontend TEST_EVT and backend logs
- [ ] Test helper to consume and filter log stream during test execution
- [ ] Assertion helpers for backend log content
- [ ] Error detection in backend logs
- [ ] SQL query visibility for debugging
- [ ] Service operation tracking

### Backend Integration Documentation
- [ ] Document backend testing endpoints usage
- [ ] Document correlation ID propagation
- [ ] Document backend log streaming:
  - [ ] How to connect to `/api/testing/logs/stream`
  - [ ] How to parse structured JSON logs
  - [ ] How to correlate frontend and backend events
  - [ ] How to debug with SQL queries and service operations
  - [ ] Example assertions on backend logs
- [ ] Document reset endpoint usage (`/api/testing/reset`)
- [ ] Document FLASK_ENV=testing requirements
- [ ] Document readyz endpoint enhancements
- [ ] Document correlation ID debugging workflows

## 7. SSE (Server-Sent Events) Instrumentation

### SSE Client Implementation
- [ ] Emit TEST_EVT:sse for connection lifecycle
- [ ] Log open, close, and heartbeat events (~30s intervals)
- [ ] Include minimal metadata for debugging
- [ ] Stream ID management
- [ ] Event type logging
- [ ] Integration with SSE-aware timeout fixtures

### SSE-Specific Timeout Handling
- [ ] SSE-specific timeout handling (30-35s for SSE operations)
- [ ] Clear indication of waiting states for SSE connections
- [ ] Handle SSE reconnection scenarios in tests
