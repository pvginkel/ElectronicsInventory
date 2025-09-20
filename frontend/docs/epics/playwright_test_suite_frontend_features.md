# Playwright Test Suite - Frontend Features Checklist

This checklist tracks all frontend features required for the complete Playwright test suite implementation, derived from the test suite epics.

## Status Legend
- ✅ Completed (Phase 1)
- 🚧 In Progress (Phase 2)
- ⏳ Planned (Future phases)
- [ ] Not yet scheduled

## Core Playwright Infrastructure

### Basic Setup
- [x] Install @playwright/test dependency
- [x] Create playwright.config.ts with Chromium-only configuration
- [x] Set headless mode as default
- [x] Configure viewport (1280x720)
- [x] Set global expect timeout to 10s
- [x] Disable retries
- [x] Configure test artifacts directories (screenshots, videos, traces)
- [x] Add Playwright scripts to package.json (playwright, playwright:headed, playwright:ui, playwright:install)
- [x] Update .gitignore for Playwright artifacts
- [x] Create TypeScript config for Playwright tests (tsconfig.playwright.json)

### Test Infrastructure
- [x] Create custom test fixtures (tests/support/fixtures.ts)
- [x] Environment URL fixtures (FRONTEND_URL, BACKEND_URL)
- [x] SSE-aware timeout fixture (30-35s for specific operations)
- [x] Readiness polling fixtures for health checks (assumes services already running)
- [x] Helper utilities (tests/support/helpers.ts)
  - [x] generateRandomId() for prefix-shortId pattern
  - [x] awaitEvent(kind, filter, timeout) for console event monitoring
  - [x] emitTestEvt(kind, payload) wrapper
- [x] Centralized selectors (tests/support/selectors.ts)
- [x] Test directory structure (tests/e2e/, tests/e2e/specific/)
- [x] Environment configuration (.env.test.example)
- [x] Basic smoke test for verification

### Service Orchestration (Phase 2 - In Progress)
- 🚧 Optional start/stop script execution fixtures
- 🚧 APP_START_SCRIPT / APP_STOP_SCRIPT environment variables
- 🚧 WEB_START_SCRIPT / WEB_STOP_SCRIPT environment variables
- 🚧 Script daemonization and PID management
- 🚧 Automatic service lifecycle management
- 🚧 Global teardown for service cleanup

## Frontend Instrumentation

### Test Mode Configuration (Phase 2 - In Progress)
- 🚧 Add TEST_MODE environment flag (VITE_TEST_MODE)
- 🚧 Conditional instrumentation based on TEST_MODE
- 🚧 Ensure all instrumentation is no-op in production builds
- 🚧 Build-time vs runtime configuration for test mode
- 🚧 Production build verification that test code is excluded

### Structured Test Events System (Phase 2 - Foundation, Phase 3 - Full Implementation)
- 🚧 Create centralized emit utility for TEST_EVT (foundation only)
- 🚧 Log one-line JSON prefixed with `TEST_EVT:` to console (stub implementation)
- 🚧 Mirror events to window.__TEST_SIGNALS__ (test mode only) (structure prepared)
- ⏳ Implement event kinds with specific payloads:
  - [ ] `route` - Navigation events (from→to)
  - [ ] `form` - Form lifecycle (id, phase: open|submit|success|error)
  - [ ] `api` - API calls (name, method, status, correlationId, durationMs)
  - [ ] `toast` - Toast notifications (level, code, message)
  - [ ] `error` - Application errors (scope, code, message, correlationId)
  - [ ] `query_error` - TanStack Query errors (queryKey, status, message)
  - [ ] `sse` - SSE events (streamId, phase: open|event|heartbeat|close)

### Console Error Policy (Phase 2 - In Progress)
- 🚧 Configure tests to treat console.error as test failure
- 🚧 Audit and migrate misused console.error to console.warn/log
- 🚧 Add ability to explicitly silence expected console.error in tests

### Global Error & Toast Integration (Phase 3 - Planned)
- ⏳ Wire toast layer to emit TEST_EVT:toast
- ⏳ Wire error boundary to emit TEST_EVT:error
- ⏳ Ensure consistent error surfacing across the app

### TanStack Query Integration (Phase 3 - Planned)
- ⏳ Add global onError hook emitting TEST_EVT:query_error
- [ ] Add global onSettled hook for query lifecycle
- [ ] Include queryKey, HTTP status, normalized message in events
- [ ] Ensure domain validation errors trigger structured events
- [ ] Correlation ID propagation in query errors
- [ ] Integration with centralized error handling system

### Router Instrumentation (Phase 3 - Planned)
- ⏳ Emit TEST_EVT:route on every navigation
- ⏳ Include from and to route information

### Forms & Mutations Instrumentation (Phase 3 - Planned)
- ⏳ Emit TEST_EVT:form at lifecycle points (open, submit, success, error)
- [ ] Include stable formId in events
- [ ] Add minimal payload for debugging
- [ ] Form validation error integration
- [ ] Mutation success/error event correlation
- [ ] Stable formId generation strategy

### API Client Instrumentation (Phase 3 - Planned)
- ⏳ Emit TEST_EVT:api for every request/response
- [ ] Include operation name, method, status, duration
- [ ] Propagate X-Request-Id header
- [ ] Generate correlation ID if not present
- [ ] Extract operation name from OpenAPI client
- [ ] Duration measurement (durationMs)
- [ ] Request/response lifecycle tracking

### SSE Client Instrumentation (Phase 3 - Planned)
- ⏳ Emit TEST_EVT:sse for connection lifecycle
- [ ] Log open, close, and heartbeat events (~30s intervals)
- [ ] Include minimal metadata for debugging
- [ ] Stream ID management
- [ ] Event type logging
- [ ] Integration with SSE-aware timeout fixtures

## UI Testing Support

### Data Test Attributes (Phase 4 - Planned)
- ⏳ Adopt data-test attributes as primary selector strategy
- [ ] Apply to Types screens and components
- [ ] Establish comprehensive naming patterns:
  - [ ] Page level: types.page, parts.page, boxes.page, etc.
  - [ ] Lists: types.list.table, types.list.row
  - [ ] Forms: types.form.name, types.form.submit
  - [ ] Toasts: toast.error, toast.info, toast.success
  - [ ] Common UI: button.primary, modal.close
  - [ ] Generic patterns for reusable components
- [ ] Stable selector maintenance policy
- [ ] Selector documentation and guidelines

### Dual-Port Development Support
- [ ] Verify API base URL handling in dual-port setups
- [ ] Ensure deterministic URL resolution from config
- [ ] Prevent fallback to production assumptions

### Timeout Handling
- [ ] Avoid long silent states in UI flows
- [ ] Add visible spinners/toasts for long operations
- [ ] Emit corresponding structured events for test synchronization
- [ ] SSE-specific timeout handling (30-35s for SSE operations)
- [ ] Clear indication of waiting states

### Testing Utilities Exposure (Phase 2 - Foundation)
- 🚧 Expose emitTestEvt helper for LLM usage (stub implementation)
- ⏳ Document helper usage in CLAUDE.md
- 🚧 Ensure helper is no-op in production builds

## Documentation (Partially in current plan)

### Developer Documentation
- [x] Basic Playwright setup documentation (implicit in plan)
- [ ] Add "UI Testing (Playwright) — How Claude should work" section to CLAUDE.md
- [ ] Document how to run tests locally
- [ ] Document how to add data-test selectors
- [ ] Document how to assert using TEST_EVT
- [ ] Document console.error policy
- [ ] Document correlation ID usage
- [ ] Document randomized naming convention (prefix-shortId)
- [ ] Document timeout strategies (10s default, SSE exceptions)
- [ ] Event sequence assertion patterns
- [ ] Instrumentation extension guidelines
- [ ] Production safety requirements

### Backend Integration Documentation
- [ ] Document backend testing endpoints usage
- [ ] Document correlation ID propagation
- [ ] Document backend log streaming:
  - [ ] How to connect to /api/testing/logs/stream
  - [ ] How to parse structured JSON logs
  - [ ] How to correlate frontend and backend events
  - [ ] How to debug with SQL queries and service operations
  - [ ] Example assertions on backend logs
- [ ] Document reset endpoint usage (/api/testing/reset)
- [ ] Document FLASK_ENV=testing requirements
- [ ] Document readyz endpoint enhancements
- [ ] Document correlation ID debugging workflows

## Test Coverage Requirements

### Types Feature Tests (Phase 4 - Planned)
- ⏳ Create specific tests for Types CRUD operations
- [ ] Create E2E test for complete Types workflow
- [ ] Test blocked delete with reverse dependencies (TYPE_IN_USE error)
- [ ] Test HTTP 409 response handling for blocked operations
- [ ] Test validation edge cases:
  - [ ] Duplicate name handling
  - [ ] Whitespace normalization
  - [ ] Too-long names
  - [ ] Invalid characters
  - [ ] Transient server/network error handling
- [ ] Test error handling and recovery
- [ ] Domain-specific error code surfacing via TEST_EVT

### Test Patterns
- [ ] Implement data randomization (prefix-shortId scheme)
- [ ] Implement no-cleanup policy
- [ ] Handle dirty database state
- [ ] Support both clean and dirty test runs
- [ ] Test tolerance for preexisting data
- [ ] Collision avoidance with randomized suffixes

## Backend Integration Points

### API Communication
- [x] Handle /api/health/readyz endpoint (for readiness polling)
- [ ] Handle /api/testing/reset?seed=true|false endpoint (test mode only)
- [ ] Propagate correlation IDs (X-Request-Id header)
- [ ] Reset concurrency handling (503 responses with Retry-After)

### Backend Log Streaming (Phase 5 - Planned)
- ⏳ Connect to /api/testing/logs/stream SSE endpoint
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

### Environment Detection
- [ ] Detect FLASK_ENV=testing on backend
- [ ] Conditionally enable test features based on backend mode

## Performance and Production Safety

### Build-Time Safety (Phase 2 - In Progress)
- 🚧 Conditional compilation of test features
- [ ] Production build verification
- [ ] Test mode detection and gating
- [ ] Runtime safety checks
- [ ] No test code in production bundles

### Performance Optimizations
- [ ] Minimal overhead for test instrumentation
- [ ] Efficient event emission
- [ ] Compact payload requirements
- [ ] Event batching where appropriate

## Artifacts and Debugging (Partially in current plan)

### Test Artifacts
- [x] Screenshot configuration (only-on-failure)
- [x] Video configuration (retain-on-failure)
- [x] Trace configuration (on-first-retry)
- [ ] Artifact organization for LLM consumption
- [ ] Human-readable artifact naming

## Summary

### Phase Status

**Phase 1 - Basic Infrastructure (Completed):** 21 items
- ✅ Core Playwright infrastructure
- ✅ Basic test helpers and fixtures
- ✅ Directory structure and configuration
- ✅ Readiness polling (health checks)

**Phase 2 - Service Orchestration & Test Mode (In Progress):** ~20 items
- 🚧 Service orchestration (start/stop scripts)
- 🚧 Test mode configuration infrastructure
- 🚧 Console error policy
- 🚧 Test event system foundation (stub only)
- 🚧 Build-time safety for production

**Phase 3 - Frontend Instrumentation (Planned):** ~30 items
- ⏳ Full structured test events (TEST_EVT) implementation
- ⏳ Router, API, and forms instrumentation
- ⏳ TanStack Query integration
- ⏳ Toast and error boundary integration
- ⏳ SSE client instrumentation

**Phase 4 - UI Testing & Types Features (Planned):** ~25 items
- ⏳ Data-test attributes implementation
- ⏳ Types feature test coverage
- ⏳ Test patterns and helpers
- ⏳ Documentation updates

**Phase 5 - Backend Integration (Planned):** ~15 items
- ⏳ Backend testing endpoints integration
- ⏳ Backend log streaming for LLM observability
- ⏳ Reset endpoint and correlation IDs
- ⏳ Full end-to-end test capabilities

### Implementation Progress
- **Completed:** ~19% (Phase 1)
- **In Progress:** ~18% (Phase 2)
- **Remaining:** ~63% (Phases 3-5)

The phased approach ensures each layer builds properly on the previous one, with Phase 2 providing the critical infrastructure for test mode and service management that subsequent phases will depend on.