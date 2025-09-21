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

### Service Orchestration (Phase 2 - Completed)
- ✅ Testing server script (scripts/testing-server.sh)
- ✅ Playwright webServer configuration for both frontend and backend
- ✅ VITE_TEST_MODE environment variable support
- ✅ Automatic service lifecycle management via Playwright
- ✅ Support for external service mode via PLAYWRIGHT_MANAGED_SERVICES
- ✅ Clean service termination on test completion

## Frontend Instrumentation

### Test Mode Configuration (Phase 2 - Completed)
- ✅ Add TEST_MODE environment flag (VITE_TEST_MODE)
- ✅ Conditional instrumentation based on TEST_MODE (src/lib/config/test-mode.ts)
- ✅ Ensure all instrumentation is no-op in production builds
- ✅ Runtime configuration for test mode via isTestMode() function
- ✅ TEST_MODE constant exported for use throughout app

### Structured Test Events System (Phase 2 - Foundation Completed, Phase 3 - Full Implementation)
- ✅ Create centralized emit utility for TEST_EVT (src/lib/test/event-emitter.ts)
- ✅ Basic event emission with TEST_EVT: prefix
- ✅ Mirror events to window.__TEST_SIGNALS__ (test mode only)
- ✅ TypeScript interfaces for event types (src/types/test-events.ts)
- ✅ clearTestSignals() and getTestSignals() utilities
- 📋 **Phase 3 - Carved Out**: Implement event kinds with specific payloads:
  - 📋 `route` - Navigation events (from→to)
  - 📋 `form` - Form lifecycle (id, phase: open|submit|success|error)
  - 📋 `api` - API calls (name, method, status, correlationId, durationMs)
  - 📋 `toast` - Toast notifications (level, code, message)
  - 📋 `error` - Application errors (scope, code, message, correlationId)
  - 📋 `query_error` - TanStack Query errors (queryKey, status, message)
  - [ ] `sse` - SSE events (streamId, phase: open|event|heartbeat|close) [Not in Phase 3 scope]

### Console Error Policy (Phase 2 - Completed)
- ✅ Console error tracking setup (src/lib/test/console-policy.ts)
- ✅ Track all console errors while still logging them
- ✅ getConsoleErrors() and clearConsoleErrors() utilities for test assertions
- [ ] Audit and migrate misused console.error to console.warn/log (deferred)
- [ ] Add ability to explicitly silence expected console.error in tests (deferred)

### Global Error & Toast Integration (Phase 3 - Carved Out)
- 📋 Wire toast layer to emit TEST_EVT:toast
- 📋 Wire error boundary to emit TEST_EVT:error
- 📋 Ensure consistent error surfacing across the app

### TanStack Query Integration (Phase 3 - Carved Out)
- 📋 Add global onError hook emitting TEST_EVT:query_error
- 📋 Include queryKey, HTTP status, normalized message in events
- 📋 Ensure domain validation errors trigger structured events
- [ ] Add global onSettled hook for query lifecycle (deferred)
- [ ] Correlation ID propagation in query errors (deferred)
- [ ] Integration with centralized error handling system (deferred)

### Router Instrumentation (Phase 3 - Carved Out)
- 📋 Emit TEST_EVT:route on every navigation
- 📋 Include from and to route information

### Forms & Mutations Instrumentation (Phase 3 - Carved Out)
- 📋 Emit TEST_EVT:form at lifecycle points (open, submit, success, error)
- 📋 Include stable formId in events
- 📋 Add minimal payload for debugging
- 📋 Start with TypeForm and PartForm components
- [ ] Form validation error integration (deferred)
- [ ] Mutation success/error event correlation (deferred)
- [ ] Stable formId generation strategy (deferred)

### API Client Instrumentation (Phase 3 - Carved Out)
- 📋 Emit TEST_EVT:api for every request/response
- 📋 Include operation name, method, status, duration
- 📋 Propagate X-Request-Id header
- 📋 Generate correlation ID if not present
- 📋 Extract operation name from OpenAPI client
- 📋 Duration measurement (durationMs)
- 📋 Request/response lifecycle tracking

### SSE Client Instrumentation (Not in Phase 3)
- [ ] Emit TEST_EVT:sse for connection lifecycle
- [ ] Log open, close, and heartbeat events (~30s intervals)
- [ ] Include minimal metadata for debugging
- [ ] Stream ID management
- [ ] Event type logging
- [ ] Integration with SSE-aware timeout fixtures

## Component Refactoring (Pre-Phase 4 - NEW)

### Goals
- 🎯 Enable components to accept data-* attributes (required for data-testid)
- 🎯 Forward refs to DOM elements for better Playwright interaction
- 🎯 Improve accessibility (a11y) which improves test discoverability
- 🎯 **No backward compatibility required** - refactor the entire app as needed

### Core Refactoring Pattern
- [ ] All components extend React.ComponentPropsWithoutRef<element>
- [ ] Use React.forwardRef for ref forwarding
- [ ] Props spread order: {...props} first, then critical props
- [ ] Class merging with cn() utility
- [ ] Event handler composition instead of replacement
- [ ] displayName set for all components

### High Priority Components (Types Workflow)
- [ ] Button (`src/components/ui/button.tsx`)
  - [ ] Convert to forwardRef
  - [ ] Extend native button props
  - [ ] Enforce type="button" by default
  - [ ] Compose onClick handlers
- [ ] Input (`src/components/ui/input.tsx`)
  - [ ] Convert to forwardRef
  - [ ] Extend native input props
  - [ ] Add aria-invalid support
  - [ ] Handle aria-describedby for errors
- [ ] Dialog (`src/components/ui/dialog.tsx`)
  - [ ] Forward refs through Radix primitives
  - [ ] Allow pass-through props (overlayProps, contentProps)
  - [ ] Use DialogPrimitive.Description for a11y
  - [ ] Ensure data-* reaches DOM
- [ ] Form Components (`src/components/ui/form.tsx`)
  - [ ] FormField forwards refs and data-*
  - [ ] FormControl passes props to inputs
  - [ ] FormMessage has aria-live
  - [ ] FormLabel connects with htmlFor
- [ ] Card Components (`src/components/ui/card.tsx`)
  - [ ] Card, CardHeader, CardContent, CardFooter
  - [ ] All extend native div props
  - [ ] All forward refs
- [ ] SearchableSelect (`src/components/ui/searchable-select.tsx`)
  - [ ] Complex combobox ARIA pattern
  - [ ] Forward ref to input element
  - [ ] Proper role and aria attributes

### Medium Priority Components
- [ ] Badge (`src/components/ui/badge.tsx`)
- [ ] ProgressBar (`src/components/ui/progress-bar.tsx`)
  - [ ] Add role="progressbar"
  - [ ] Include aria-valuemin/max/now
  - [ ] Support indeterminate state
- [ ] Toast (`src/components/ui/toast.tsx`)
  - [ ] Forward props through Radix Toast
  - [ ] Ensure data-* reaches toast items
- [ ] DropdownMenu (`src/components/ui/dropdown-menu.tsx`)
  - [ ] Trigger accepts data-* attributes

### Domain Components (Minimal Changes)
- [ ] TypeForm (`src/components/types/TypeForm.tsx`)
  - [ ] Use refactored base components (Button, Input, etc.)
  - [ ] Add data-testid attributes directly to elements
  - Note: No need for ref forwarding or extending native props
- [ ] PartForm (`src/components/parts/PartForm.tsx`)
  - [ ] Use refactored base components
  - [ ] Add data-testid attributes directly to elements
  - Note: Domain components just need test IDs, not full refactoring

### Accessibility Improvements
- [ ] Use semantic HTML elements
- [ ] Add ARIA attributes only when needed
- [ ] Ensure keyboard navigation works
- [ ] Connect labels to inputs
- [ ] Add aria-describedby for error states

### Testing Approach
- [ ] Verify each component after refactoring
- [ ] Check data-testid appears in DOM
- [ ] Test ref.current?.focus() works
- [ ] No visual regressions
- [ ] TypeScript type checking passes

## UI Testing Support

### Data Test Attributes (Phase 4 - Planned, depends on Pre-Phase 4)
- ⏳ Adopt data-testid attributes as primary selector strategy
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

### Testing Utilities Exposure (Phase 2 - Completed)
- ✅ Expose emitTestEvent helper for LLM usage (src/lib/test/event-emitter.ts)
- [ ] Document helper usage in CLAUDE.md (deferred to Phase 4)
- ✅ Ensure helper is no-op in production builds

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

### Build-Time Safety (Phase 2 - Completed)
- ✅ Conditional compilation of test features
- ✅ Test mode detection and gating via isTestMode()
- ✅ Runtime safety checks (all test functions are no-op in production)
- [ ] Production build verification (manual process, deferred)
- [ ] No test code in production bundles (needs build analysis, deferred)

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

**Phase 2 - Service Orchestration & Test Mode (Completed):** 20 items
- ✅ Service orchestration via Playwright webServer
- ✅ Test mode configuration infrastructure
- ✅ Console error policy and tracking
- ✅ Test event system foundation
- ✅ Build-time safety for production

**Phase 3 - Frontend Instrumentation (Completed):** ~25 items
- ✅ Full structured test events (TEST_EVT) implementation
- ✅ Router instrumentation (from→to navigation tracking)
- ✅ API client instrumentation (correlation IDs, duration)
- ✅ Toast and error boundary integration
- ✅ TanStack Query error hooks
- ✅ Forms lifecycle tracking (TypeForm and PartForm initially)
- Note: SSE client instrumentation deferred to later phase

**Pre-Phase 4 - Component Refactoring (NEW - To Be Implemented):** ~35 items
- 🎯 Refactor all UI components to accept data-* attributes
- 🎯 Forward refs to DOM elements
- 🎯 Improve accessibility (ARIA, semantic HTML)
- 🎯 Maintain backward compatibility
- 🎯 Follow patterns from component refactoring guide

**Phase 4 - UI Testing & Types Features (Planned, depends on Pre-Phase 4):** ~25 items
- ⏳ Data-testid attributes implementation
- ⏳ Types feature test coverage
- ⏳ Test patterns and helpers
- ⏳ Documentation updates

**Phase 5 - Backend Integration (Planned):** ~15 items
- ⏳ Backend testing endpoints integration
- ⏳ Backend log streaming for LLM observability
- ⏳ Reset endpoint and correlation IDs
- ⏳ Full end-to-end test capabilities

### Implementation Progress
- **Completed:** ~46% (Phases 1, 2, and 3)
- **Next Up:** Pre-Phase 4 Component Refactoring
- **Remaining:** ~54% (Pre-Phase 4, Phase 4, Phase 5, and deferred items)

### Current Focus: Pre-Phase 4 Component Refactoring
The component refactoring plan (`docs/features/component_refactoring_pre_phase4/plan.md`) addresses:
1. **Critical Requirement**: Components must accept data-testid attributes for Playwright testing
2. **Accessibility**: Improved ARIA support and semantic HTML benefits both testing and users
3. **Best Practices**: Following the patterns from `docs/epics/component_refactoring.md`
4. **Full Refactoring Freedom**: No backward compatibility needed - update the entire app as necessary

### Why Pre-Phase 4 is Essential
- Phase 4 tests require components to accept data-testid attributes
- Current components don't forward native props or refs
- Refactoring improves both testability and accessibility
- Aligns codebase with React best practices

The phased approach ensures a solid foundation for testing, with component refactoring enabling reliable test selectors in Phase 4.