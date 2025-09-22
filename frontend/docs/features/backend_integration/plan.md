# Backend Integration for Playwright Testing - Technical Plan

## Brief Description

Implement backend testing endpoints and integration for the Playwright test suite to enable test-mode functionality including database reset, seed data management, and backend log streaming. These endpoints are only available when the backend is running in testing mode (`FLASK_ENV=testing`).

## Files to Create or Modify

### Test Suite Files

#### 1. `tests/api/backend-testing.ts` (NEW)
- Backend testing client for reset endpoint and SSE log streaming
- Handle 503 responses with retry logic for concurrent reset requests
- Parse structured JSON logs from SSE stream
- Correlation ID extraction from logs

#### 2. `tests/support/backend-fixtures.ts` (NEW)
- `resetBackend` fixture for database reset with seed option
- `backendLogStream` fixture for SSE log consumption
- `waitForBackendReady` helper using readyz endpoint
- Retry logic with exponential backoff for 503 responses

#### 3. `tests/support/fixtures.ts` (MODIFY)
- Add `backendTesting` fixture exposing reset and log functions
- Add `correlationId` fixture for tracking requests across frontend/backend
- Integrate backend fixtures into existing test setup

#### 4. `tests/support/global-setup.ts` (MODIFY)
- Add optional database reset before FULL test suite runs only
- Skip reset when running single test or spec file
- Check `RESET_DATABASE` environment variable
- Call reset endpoint with seed parameter based on config
- Handle 503 responses with retry logic

#### 5. `tests/helpers/backend-logs.ts` (NEW)
- Helper functions to consume and filter SSE log stream
- `waitForBackendLog(pattern, timeout)` helper
- `assertNoBackendErrors()` helper
- Correlation ID matching between frontend events and backend logs

### Configuration Files

#### 6. `playwright.config.ts` (MODIFY)
- Add `RESET_DATABASE` environment variable handling
- Add `SEED_DATA` environment variable for seed parameter
- Document testing endpoint usage in comments

#### 7. `.env.test.example` (MODIFY)
- Add `RESET_DATABASE=true|false` example
- Add `SEED_DATA=true|false` example

## Step-by-Step Implementation

### Phase 1: Reset Endpoint Integration

1. **Create Backend Testing Client**
   - Create `tests/api/backend-testing.ts` with typed client for `/api/testing/reset`
   - Implement POST request with `seed` query parameter
   - Handle 200 success and 503 busy responses
   - Extract and respect `Retry-After` header on 503

2. **Add Reset Logic to Global Setup**
   - Detect if running full suite vs single test/spec
   - Only reset database when running full suite
   - Check `RESET_DATABASE` environment variable
   - If true and full suite, call reset endpoint before tests start
   - Implement retry logic with exponential backoff for 503 responses
   - Maximum 5 retries with increasing delays

3. **Create Reset Fixture**
   - Add `resetBackend(seed: boolean)` fixture
   - Available to all tests via fixtures
   - Handle concurrent reset protection

### Phase 2: SSE Log Streaming

1. **Create SSE Client**
   - Add SSE client to `tests/api/backend-testing.ts`
   - Connect to `/api/testing/logs/stream` endpoint
   - Parse JSON log format with fields:
     - timestamp (ISO format)
     - level (ERROR, WARNING, INFO, DEBUG)
     - logger (logger name)
     - message (log message)
     - correlation_id (from Flask-Log-Request-ID)
     - extra (additional fields)

2. **Create Log Stream Fixture**
   - Add `backendLogStream` fixture for test consumption
   - Buffer logs from connection time
   - Provide filter and search capabilities
   - Auto-close connection after test

3. **Create Log Assertion Helpers**
   - `waitForBackendLog(pattern, timeout)`: Wait for specific log entry
   - `getBackendLogs(filter)`: Get filtered log entries
   - `assertNoBackendErrors()`: Fail if ERROR level logs detected
   - `getLogsByCorrelationId(id)`: Get all logs for a correlation ID

### Phase 3: Correlation ID Integration

1. **Extract Correlation IDs**
   - Parse `X-Request-Id` header from API responses
   - Store in test context for later matching
   - Match with backend logs using correlation_id field

2. **Create Correlation Helpers**
   - `trackApiCall(apiPromise)`: Wrapper to capture correlation ID
   - `getBackendLogsForRequest(correlationId)`: Get related backend logs
   - `assertBackendOperation(correlationId, operation)`: Verify backend executed expected operations

## Algorithms and Logic

### Reset Retry Algorithm
```
1. Check if running full test suite (not single test/spec)
2. If single test/spec: Skip reset entirely
3. If full suite and RESET_DATABASE=true:
   a. Send POST to /api/testing/reset?seed={true|false}
   b. If 200: Success, continue
   c. If 503:
      - Extract Retry-After header (default 5 seconds)
      - Wait for specified duration
      - Retry request (max 5 attempts)
      - Use exponential backoff: delay * 2^attempt
   d. If other error: Fail immediately
```

### SSE Log Consumption
```
1. Open SSE connection to /api/testing/logs/stream
2. For each event:
   a. Parse JSON payload
   b. Store in memory buffer with timestamp index
   c. Emit to active filters/watchers
3. Handle connection lifecycle:
   a. Reconnect on unexpected close
   b. Clear buffer on test completion
   c. Close connection in test teardown
```

### Correlation ID Tracking
```
1. Frontend makes API call
2. Extract X-Request-Id from response headers
3. Store correlation ID in test context
4. Filter backend logs by correlation_id field
5. Assert on backend operations for that request
```

## Environment Variables

- `RESET_DATABASE`: If `true`, reset database before FULL test suite (ignored for single test/spec runs)
- `SEED_DATA`: If `true`, load seed data after reset (default: `true`)
- `BACKEND_URL`: Backend API URL (existing)

## Error Handling

1. **Reset Endpoint Unavailable**:
   - Fail test suite with clear error message
   - Assume backend should be in testing mode

2. **Concurrent Reset Protection**:
   - Handle 503 responses gracefully
   - Implement retry with backoff
   - Fail test suite if reset fails after retries

3. **SSE Connection Issues**:
   - Auto-reconnect on unexpected disconnection
   - Log connection state changes
   - Continue tests even if log streaming fails (non-critical)

## Testing the Integration

1. **Reset Endpoint Test**:
   - Create test that calls reset endpoint directly
   - Verify database is clean after reset
   - Verify seed data is present when seed=true

2. **Log Streaming Test**:
   - Create test that generates known backend operations
   - Verify logs are captured in stream
   - Verify correlation IDs match between frontend and backend

3. **Concurrent Reset Test**:
   - Simulate concurrent reset requests
   - Verify retry logic handles 503 correctly
   - Verify only one reset executes at a time