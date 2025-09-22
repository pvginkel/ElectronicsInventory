# Playwright Test Suite - Outstanding Work

This document consolidates all remaining work for the Playwright test suite implementation. Items are organized by category and priority.

## 1. Production Build Verification

### Build Analysis
- [ ] Production build verification (manual process)
- [ ] No test code in production bundles (needs build analysis)
- [ ] Verify all test instrumentation is removed
- [ ] Bundle size impact analysis
- [ ] Performance impact verification

### Production Safety
- [ ] Verify isTestMode() gates work correctly
- [ ] Ensure no TEST_EVT emissions in production
- [ ] Confirm no test fixtures leak to production
- [ ] Validate no debug logging in production

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
- [ ] Document how to assert using TEST_EVT (extend current partial docs)
- [ ] Event sequence assertion patterns
- [ ] Instrumentation extension guidelines
- [ ] Common testing patterns and anti-patterns
- [ ] Performance testing guidelines

### Developer Guides
- [ ] Guide for adding tests to new features
- [ ] Page Object Model best practices
- [ ] Factory pattern guidelines
- [ ] Selector strategy decisions
- [ ] Debugging failed tests guide

## 4. Test Coverage Extension

### Parts Feature Tests
- [ ] Create PartFactory for test data
  - [ ] Random part generation helpers
  - [ ] Location assignment helpers
  - [ ] Quantity management helpers
- [ ] Create PartPage object model
  - [ ] Navigation and element locators
  - [ ] High-level actions (createPart, editPart, deletePart)
  - [ ] Location management actions
  - [ ] Quantity adjustment actions
- [ ] Parts CRUD operations tests
  - [ ] Create part with all fields
  - [ ] Edit part details
  - [ ] Delete part (with and without locations)
  - [ ] Validation tests
- [ ] Part-Type relationship tests
  - [ ] Create part with existing type
  - [ ] Change part type
  - [ ] Handle type deletion with existing parts
- [ ] Part locations and quantities tests
  - [ ] Add part to location
  - [ ] Move part between locations
  - [ ] Split quantities across locations
  - [ ] Remove from location
- [ ] Part search and filtering

### Boxes Feature Tests
- [ ] Create BoxFactory for test data
  - [ ] Random box number generation
  - [ ] Location generation within boxes
- [ ] Create BoxPage object model
  - [ ] Navigation and element locators
  - [ ] High-level actions (createBox, editBox, deleteBox)
  - [ ] Location management within boxes
- [ ] Box CRUD operations tests
  - [ ] Create box with locations
  - [ ] Edit box details
  - [ ] Delete box (empty and with parts)
- [ ] Location management tests
  - [ ] View box locations
  - [ ] Check location availability
  - [ ] Location assignment workflows
- [ ] Box organization tests
  - [ ] Location suggestions
  - [ ] Box fill patterns

### Seller Feature Tests
- [ ] Create SellerFactory for test data
- [ ] Seller management tests
  - [ ] Add seller to part
  - [ ] Edit seller information
  - [ ] Remove seller
- [ ] Seller-Part relationship tests
  - [ ] Multiple parts from same seller
  - [ ] Seller product links
  - [ ] Search by seller

### Cross-Feature Workflows
- [ ] Part creation complete workflow
  - [ ] Create type → Create part → Assign location → Adjust quantity
- [ ] Box organization workflow
  - [ ] Create box → Add parts → Reorganize locations
- [ ] Search across entities
  - [ ] Global search functionality
  - [ ] Filter by type, box, location
- [ ] Location suggestion workflow
  - [ ] Get suggestions for new part
  - [ ] Accept/reject suggestions
- [ ] Quantity management workflow
  - [ ] Receive items → Distribute to locations
  - [ ] Use items → Update quantities
  - [ ] Move items between locations

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