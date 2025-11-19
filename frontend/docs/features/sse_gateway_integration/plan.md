# SSE Gateway Integration — Implementation Plan

## 0) Research Log & Findings

### Discovery Work

Examined the following areas to understand current patterns:

1. **Test Infrastructure** (`tests/support/process/servers.ts`):
   - `startBackend()` and `startFrontend()` functions provide the pattern for service management
   - Both use `getPort()` for dynamic port allocation
   - Common `startService()` helper handles process spawning, readiness checks, and lifecycle
   - `ServiceLabel` type currently supports 'backend' | 'frontend'
   - `serviceShouldLogLifecycle()` checks environment variables for log streaming

2. **Fixture Management** (`tests/support/fixtures.ts`):
   - `_serviceManager` worker-scoped fixture orchestrates backend and frontend startup
   - Sequential startup: Backend starts first, then frontend with backend URL
   - External services mode (`PLAYWRIGHT_MANAGED_SERVICES=false`) exists at lines 348-423
   - Log collectors (`BackendLogCollector`, `FrontendLogCollector`) capture and attach logs to tests

3. **Log Collection** (`tests/support/process/backend-logs.ts`):
   - `createServiceLogCollector()` is the generic factory pattern
   - Takes `workerIndex`, `streamToConsole`, `attachmentName`, `serviceLabel`
   - Log streaming controlled by `PLAYWRIGHT_<SERVICE>_LOG_STREAM` environment variables

4. **Configuration Files**:
   - `playwright.config.ts`: Contains `webServer` config for external services mode (lines 29-44)
   - `vite.config.ts`: Already has proxy configuration pattern for `/api` routes (lines 105-110, 119-125)
   - `.env.test.example`: Documents `PLAYWRIGHT_MANAGED_SERVICES` variable

5. **Global Setup** (`tests/support/global-setup.ts`):
   - Lines 10-24 handle external services mode with health checks
   - `initializeSeedDatabase()` function runs only for managed services

### Key Patterns Identified

- Service startup follows: allocate port → spawn process → wait for readiness → attach logs
- Readiness checks poll HTTP endpoints with configurable timeout
- All services integrate into the same `_serviceManager` fixture
- Environment variables follow pattern: `PLAYWRIGHT_<SERVICE>_LOG_STREAM`
- External services mode is a parallel code path that must be removed entirely

### Conflicts Resolved

- **Port allocation order**: Gateway must start after backend (needs callback URL) but before frontend (frontend needs gateway URL)
- **Readiness check**: Gateway has `/readyz` health endpoint (confirmed in `ssegateway/src/routes/health.ts`)
- **Gateway path**: Docker mounts at `/work/ssegateway`, will use `SSE_GATEWAY_ROOT` with this as default

## 1) Intent & Scope

### User intent

Integrate the new SSE Gateway service into the Playwright test infrastructure, replacing the external services mode with a unified per-worker isolation model where each worker manages its own backend, SSE gateway, and frontend instances.

### Prompt quotes

- "Remove: External services logic from `tests/support/fixtures.ts`, `webServer` configuration from `playwright.config.ts`, Related external services handling in `tests/support/global-setup.ts`"
- "Add the SSE Gateway as a third managed service alongside backend and frontend"
- "Start sequence: Backend → SSE Gateway → Frontend"
- "Configure Vite to proxy `/sse/*` requests to the SSE Gateway"
- "SSE Gateway logs should be captured and attached to test results"

### In scope

- Complete removal of external services mode (`PLAYWRIGHT_MANAGED_SERVICES=false` code path)
- `startSSEGateway()` function implementation in `tests/support/process/servers.ts`
- Integration of gateway into `_serviceManager` fixture with proper startup sequencing
- Gateway log collector creation and attachment to test results
- Vite proxy configuration for `/sse/*` requests in both server and preview modes
- `SSE_GATEWAY_ROOT` environment variable support with default fallback
- Environment variable documentation updates

### Out of scope

- Backend changes to SSE callback endpoint implementation
- Frontend application code changes (UI should remain unchanged)
- Gateway service implementation (already exists in separate repository)
- Migration or deprecation of existing SSE-related test helpers
- Performance optimization of gateway startup time

### Assumptions / constraints

- Gateway repository exists at `../ssegateway` relative to frontend root (Docker mount at `/work/ssegateway`)
- Gateway startup script exists at `<SSE_GATEWAY_ROOT>/scripts/run-gateway.sh`
- Gateway accepts `--port` and `--callback-url` arguments
- Gateway has `/readyz` health endpoint that returns 200 OK when configured and ready
- Backend `/api/sse/callback` endpoint is already implemented and ready
- All existing Playwright tests will pass without modification (no test changes required)
- Frontend already handles SSE connections via `/sse/*` routes

## 2) Affected Areas & File Map

### Core Test Infrastructure

- **Area**: `tests/support/process/servers.ts`
- **Why**: Add `startSSEGateway()` function and `SSEGatewayServerHandle` type; extend `ServiceLabel` union type
- **Evidence**: Lines 110, 295-309 show the pattern for service labels and lifecycle management; `startBackend` (lines 25-74) and `startFrontend` (lines 76-108) provide the implementation template

- **Area**: `tests/support/process/servers.ts` - `ServiceLabel` type
- **Why**: Extend union type to include 'sse-gateway' for log formatting and lifecycle control
- **Evidence**: Line 110 defines `type ServiceLabel = 'backend' | 'frontend'`

- **Area**: `tests/support/process/servers.ts` - `serviceShouldLogLifecycle()` function
- **Why**: Add case for 'sse-gateway' service to check `PLAYWRIGHT_GATEWAY_LOG_STREAM` environment variable
- **Evidence**: Lines 302-310 implement this pattern for backend and frontend

- **Area**: `tests/support/process/servers.ts` - Repository root helpers
- **Why**: Add `getSSEGatewayRepoRoot()` function following same pattern as `getBackendRepoRoot()` with `SSE_GATEWAY_ROOT` override support
- **Evidence**: Lines 346-350 show `getBackendRepoRoot()` implementation

### Fixture Integration

- **Area**: `tests/support/fixtures.ts` - `ServiceManager` type
- **Why**: Add `gatewayUrl` and `gatewayLogs` properties to ServiceManager type
- **Evidence**: Lines 47-54 define ServiceManager with backendUrl, frontendUrl, and log collectors

- **Area**: `tests/support/fixtures.ts` - `_serviceManager` fixture
- **Why**: Remove external services mode (lines 386-423), add gateway startup between backend and frontend, attach gateway logs
- **Evidence**: Lines 346-566 implement the worker-scoped fixture; lines 453-487 show sequential backend→frontend startup pattern

- **Area**: `tests/support/fixtures.ts` - imports
- **Why**: Import `startSSEGateway` function and gateway log collector types
- **Evidence**: Lines 39-45 import server functions and log collectors

### Log Collection

- **Area**: `tests/support/process/backend-logs.ts`
- **Why**: Add `createGatewayLogCollector()` factory function and `GatewayLogCollector` type alias
- **Evidence**: Lines 27-36 and 39-48 show the factory pattern for backend and frontend collectors

- **Area**: `tests/support/fixtures.ts` - fixture exports
- **Why**: Add `gatewayLogs` fixture following same pattern as `backendLogs` and `frontendLogs`
- **Evidence**: Lines 99-121 define auto-fixtures for log attachment

### Configuration Files

- **Area**: `playwright.config.ts`
- **Why**: Remove `webServer` configuration array (lines 29-44) completely
- **Evidence**: Lines 13, 29-44 implement external services mode webServer configuration

- **Area**: `vite.config.ts` - server.proxy
- **Why**: Add `/sse` proxy configuration to forward requests to SSE Gateway with path rewriting
- **Evidence**: Lines 105-111 define existing `/api` proxy configuration as template

- **Area**: `vite.config.ts` - preview.proxy
- **Why**: Add `/sse` proxy configuration to preview mode matching server mode
- **Evidence**: Lines 119-125 define existing `/api` proxy configuration for preview mode

- **Area**: `vite.config.ts` - environment variables
- **Why**: Add `gatewayProxyTarget` variable that reads `SSE_GATEWAY_URL` environment variable for proxy target with fallback to `http://localhost:3001`
- **Evidence**: Line 86 shows `backendProxyTarget` pattern for environment-driven configuration (`const backendProxyTarget = process.env.BACKEND_URL || 'http://localhost:5000'`)

### Global Setup

- **Area**: `tests/support/global-setup.ts`
- **Why**: Remove external services health check logic (lines 10-72, keeping only the managed services path and seed database initialization)
- **Evidence**: Lines 10-24 implement external services mode conditional; lines 26-72 perform health checks

### Documentation

- **Area**: `.env.test.example`
- **Why**: Remove or update `PLAYWRIGHT_MANAGED_SERVICES` documentation; add `SSE_GATEWAY_ROOT` and `PLAYWRIGHT_GATEWAY_LOG_STREAM` variables
- **Evidence**: Lines 4-7 document the managed services toggle

- **Area**: `docs/contribute/environment.md`
- **Why**: Document new `SSE_GATEWAY_ROOT` and `PLAYWRIGHT_GATEWAY_LOG_STREAM` environment variables
- **Evidence**: Referenced in change brief as environment variable destination

- **Area**: `docs/contribute/testing/ci_and_execution.md`
- **Why**: Update service management documentation to reflect removal of external services mode
- **Evidence**: Referenced in CLAUDE.md as CI execution documentation

## 3) Data Model / Contracts

### Service Startup Configuration

- **Entity / contract**: `startSSEGateway` function parameters
- **Shape**:
  ```typescript
  {
    workerIndex: number,
    backendUrl: string,       // Base URL for callback endpoint
    excludePorts?: number[],  // Ports to avoid during allocation
    streamLogs?: boolean,     // Whether to stream logs to console
    port?: number            // Optional fixed port (for testing)
  }
  ```
- **Mapping**: Direct parameter passing, no transformation needed
- **Evidence**: `tests/support/process/servers.ts:25-34,76-82` show parameter patterns for `startBackend` and `startFrontend`

### Service Handle Return Type

- **Entity / contract**: `SSEGatewayServerHandle` type
- **Shape**:
  ```typescript
  {
    url: string,                              // Full gateway base URL
    port: number,                             // Allocated port
    process: ChildProcessWithoutNullStreams, // Node process handle
    dispose(): Promise<void>                 // Cleanup function
  }
  ```
- **Mapping**: Identical to existing `ServerHandle` type, aliased for clarity
- **Evidence**: `tests/support/process/servers.ts:15-20,22-23` define the ServerHandle pattern

### Gateway Script Invocation

- **Entity / contract**: Command-line arguments for `run-gateway.sh`
- **Shape**:
  ```bash
  <SSE_GATEWAY_ROOT>/scripts/run-gateway.sh \
    --port <dynamically-allocated-port> \
    --callback-url <backend-url>/api/sse/callback
  ```
- **Mapping**: Construct callback URL by appending `/api/sse/callback` to backend base URL
- **Evidence**: Change brief lines 43-47 specify required arguments

### Environment Variables

- **Entity / contract**: Process environment during gateway startup
- **Shape**:
  ```typescript
  {
    ...process.env,
    SSE_GATEWAY_URL: string // Set by fixture for frontend consumption
  }
  ```
- **Mapping**: Gateway URL set after successful startup, consumed by frontend during its startup
- **Evidence**: Change brief line 53; `tests/support/process/servers.ts:102-106` show environment variable pattern for frontend

### Vite Proxy Configuration

- **Entity / contract**: Proxy rule for SSE requests
- **Shape**:
  ```typescript
  {
    '/sse': {
      target: process.env.SSE_GATEWAY_URL || 'http://localhost:3001',
      changeOrigin: true,
      secure: false,
      rewrite: (path) => path.replace(/^\/sse/, '')
    }
  }
  ```
- **Mapping**: Strip `/sse` prefix when forwarding to gateway
- **Evidence**: `vite.config.ts:105-111` show proxy configuration pattern; change brief lines 24-27 specify rewrite requirement

### ServiceManager Extension

- **Entity / contract**: `ServiceManager` type in fixtures
- **Shape** (new fields only):
  ```typescript
  {
    gatewayUrl: string,
    gatewayLogs: GatewayLogCollector,
    // ... existing fields
  }
  ```
- **Mapping**: Add gateway URL and log collector alongside existing backend/frontend properties
- **Evidence**: `tests/support/fixtures.ts:47-54` define current ServiceManager shape

## 4) API / Integration Surface

### Gateway Startup Script

- **Surface**: Shell script execution via `spawn()`
- **Inputs**:
  - Script path: `${SSE_GATEWAY_ROOT}/scripts/run-gateway.sh`
  - Arguments: `['--port', String(port), '--callback-url', callbackUrl]`
  - Environment: Inherited from `process.env`
- **Outputs**: Process handle with stdout/stderr streams for log collection
- **Errors**: Process spawn failures, script not found, startup timeout, exit during startup
- **Evidence**: `tests/support/process/servers.ts:135-139` spawn child processes for services

### Gateway Readiness Check

- **Surface**: HTTP GET to `/readyz` endpoint (Kubernetes-style readiness probe)
- **Inputs**: Gateway base URL (e.g., `http://127.0.0.1:<port>`)
- **Outputs**: HTTP 200 OK with `{"status": "ready", "configured": true}` when gateway is ready to accept traffic
- **Errors**: HTTP 503 if callback URL not configured, connection refused (not started), timeout (startup failed), process exit before ready
- **Evidence**: `tests/support/process/servers.ts:177-232` implement waitForStartup polling logic; `ssegateway/src/routes/health.ts:39-55` defines `/readyz` endpoint behavior

### Backend Callback Endpoint

- **Surface**: Gateway calls `POST /api/sse/callback` on backend
- **Inputs**: Backend URL provided via `--callback-url` argument
- **Outputs**: Not directly observable by frontend test infrastructure
- **Errors**: Gateway logs will show callback failures if backend is unreachable
- **Evidence**: Change brief line 20 and line 47 specify callback endpoint requirement

### Frontend SSE Connection

- **Surface**: Frontend connects to `/sse/*` routes, proxied to gateway
- **Inputs**: Vite proxy configuration routes requests based on environment
- **Outputs**: SSE event stream forwarded from gateway
- **Errors**: Proxy misconfiguration would surface as connection failures in browser console
- **Evidence**: `vite.config.ts:105-111` show proxy mechanics; frontend SSE code already implemented

### Log Stream Attachment

- **Surface**: Test result attachment via `TestInfo.attach()`
- **Inputs**: Gateway stdout/stderr streams, worker index, test info
- **Outputs**: `gateway.log` file attached to test results on failure
- **Errors**: Stream errors logged but don't fail tests
- **Evidence**: `tests/support/process/backend-logs.ts:101-154` implement log attachment pattern

## 5) Algorithms & UI Flows

### Service Startup Sequence (Per Worker)

- **Flow**: Worker initialization - sequential service startup
- **Steps**:
  1. Worker fixture initialization triggered by first test
  2. Allocate port for backend via `getPort()`
  3. Start backend with SQLite database path
  4. Attach backend log streams to collector
  5. Wait for backend readiness at `/api/health/readyz`
  6. Allocate port for gateway via `getPort({ exclude: [backendPort] })`
  7. Construct callback URL: `${backendUrl}/api/sse/callback`
  8. Start gateway with `--port` and `--callback-url` arguments
  9. Attach gateway log streams to collector
  10. Wait for gateway readiness at `/readyz` endpoint (HTTP 200 OK)
  11. Set `SSE_GATEWAY_URL` environment variable to gateway URL
  12. Allocate port for frontend via `getPort({ exclude: [backendPort, gatewayPort] })`
  13. Start frontend with `BACKEND_URL` and `SSE_GATEWAY_URL` environment variables
  14. Attach frontend log streams to collector
  15. Wait for frontend readiness at `/`
  16. Provide ServiceManager with all URLs and collectors to test fixtures
- **States / transitions**:
  - Not started → Backend starting → Gateway starting → Frontend starting → All ready → Tests running → Cleanup
  - Any startup failure triggers disposal of already-started services
- **Hotspots**: Sequential dependencies block parallelization; gateway startup adds ~2-5 seconds to worker initialization
- **Evidence**: `tests/support/fixtures.ts:453-487` show current backend→frontend sequence

### Gateway Startup Implementation

- **Flow**: `startSSEGateway()` function execution
- **Steps**:
  1. Validate required parameters (workerIndex, backendUrl)
  2. Allocate port or use provided port
  3. Resolve gateway root from `SSE_GATEWAY_ROOT` environment variable or default to `../ssegateway`
  4. Construct script path: `${gatewayRoot}/scripts/run-gateway.sh`
  5. Construct callback URL: `${backendUrl}/api/sse/callback`
  6. Build args array: `['--port', port, '--callback-url', callbackUrl]`
  7. Spawn process via `startService()` helper
  8. Register process for cleanup on exit
  9. Optionally stream logs to console based on `PLAYWRIGHT_GATEWAY_LOG_STREAM`
  10. Poll for readiness at `/readyz` endpoint (HTTP 200 OK indicates ready)
  11. Return ServerHandle with url, port, process, dispose function
- **States / transitions**:
  - Spawning → Polling readiness → Ready → Running → Disposed
  - Timeout or exit during polling → Error thrown → Cleanup triggered
- **Hotspots**: Readiness check timeout duration impacts worker startup time
- **Evidence**: `tests/support/process/servers.ts:124-167` implement startService() pattern

### Test Execution with Gateway Logs

- **Flow**: Individual test execution with log collection
- **Steps**:
  1. Test starts, `gatewayLogs` auto-fixture attaches to test
  2. Log collector calls `attachToTest(testInfo)`
  3. Create output file at `testInfo.outputPath('gateway.log')`
  4. Replay buffered gateway logs from worker startup
  5. Set up listener for new gateway log lines
  6. Test executes (gateway continues logging)
  7. Test completes (pass or fail)
  8. Fixture cleanup: stop listening, close file stream
  9. Attach log file to test result if logs were captured
  10. Log file visible in Playwright HTML report
- **States / transitions**: Not attached → Replaying buffer → Listening → Stopped → Attached
- **Hotspots**: Large log volumes could impact test cleanup time
- **Evidence**: `tests/support/fixtures.ts:99-121` show auto-fixture pattern; `tests/support/process/backend-logs.ts:101-154` implement attachment logic

### Vite Proxy Request Flow

- **Flow**: Frontend SSE connection via Vite proxy
- **Steps**:
  1. Frontend code initiates SSE connection to `/sse/stream/<request-id>`
  2. Vite dev server matches `/sse` proxy rule
  3. Proxy rewrites path: `/sse/stream/<request-id>` → `/stream/<request-id>`
  4. Proxy forwards request to `SSE_GATEWAY_URL` target
  5. Gateway receives request at `/stream/<request-id>`
  6. Gateway establishes SSE connection and streams events
  7. Vite proxy streams response back to frontend
  8. Frontend processes SSE events
- **States / transitions**: Request → Path rewrite → Proxy forward → Gateway response → Event stream
- **Hotspots**: Proxy misconfiguration causes connection failures that are difficult to debug
- **Evidence**: `vite.config.ts:105-111` show proxy pattern; change brief lines 24-27 specify rewrite requirement

## 6) Derived State & Invariants

### Gateway Callback URL Construction

- **Derived value**: `callbackUrl`
  - **Source**: Backend base URL (e.g., `http://127.0.0.1:5100`) from `startBackend()` return value
  - **Writes / cleanup**: Passed to gateway as `--callback-url` argument; no writes, immutable after construction
  - **Guards**: Backend URL must be valid HTTP URL; appending `/api/sse/callback` must produce valid URL
  - **Invariant**: Callback URL must remain stable during gateway lifetime; backend must be reachable at this URL when gateway attempts callbacks
  - **Evidence**: Change brief line 20 and line 47; `tests/support/fixtures.ts:459-463` show backend handle usage

### SSE_GATEWAY_URL Environment Variable

- **Derived value**: `SSE_GATEWAY_URL` environment variable
  - **Source**: Gateway URL from `startSSEGateway()` return value (e.g., `http://127.0.0.1:3001`)
  - **Writes / cleanup**: Set on `process.env` before frontend startup; removed during fixture cleanup
  - **Guards**: Must be set before `startFrontend()` is called; frontend reads this during Vite configuration
  - **Invariant**: Environment variable must be available when frontend process spawns; Vite proxy configuration reads this at server start time
  - **Evidence**: Change brief line 53; `tests/support/fixtures.ts:517-518` show environment variable management

### Gateway Log Streaming Decision

- **Derived value**: `streamLogs` boolean for gateway
  - **Source**: `PLAYWRIGHT_GATEWAY_LOG_STREAM` environment variable (string 'true' → boolean true)
  - **Writes / cleanup**: Passed to `startSSEGateway()`; no writes, read-only decision
  - **Guards**: Only 'true' string (exact match) enables streaming; any other value disables
  - **Invariant**: Streaming decision must be consistent with other services (backend, frontend) for coherent debugging experience
  - **Evidence**: `tests/support/process/servers.ts:302-310` implement this pattern; `tests/support/fixtures.ts:350-353` show environment variable checks

### Port Exclusion Chain

- **Derived value**: `excludePorts` array for each service
  - **Source**: Accumulated ports from previously started services
  - **Writes / cleanup**: Passed to `getPort()` for each service startup; no persistence
  - **Guards**: Must include all previously allocated ports to avoid conflicts
  - **Invariant**: Backend port → excluded for gateway; backend + gateway ports → excluded for frontend; prevents port collisions within worker
  - **Evidence**: `tests/support/fixtures.ts:450-451,472` show port exclusion pattern; `tests/support/process/servers.ts:43-46,84-88` use excludePorts

### Gateway Root Path Resolution

- **Derived value**: `gatewayRoot` absolute path
  - **Source**: `SSE_GATEWAY_ROOT` environment variable OR default `../ssegateway` relative to frontend root
  - **Writes / cleanup**: Read once during `startSSEGateway()`; cached in function scope
  - **Guards**: Must be absolute path to existing directory; script must exist at `${gatewayRoot}/scripts/run-gateway.sh`
  - **Invariant**: Gateway root must remain stable during test run; cannot change between workers or tests
  - **Evidence**: `tests/support/process/servers.ts:346-350` show repository root pattern; change brief lines 29-33 specify gateway root requirements

### Service Manager Complete State

- **Derived value**: Fully-initialized `ServiceManager` object
  - **Source**: Combination of backend, gateway, and frontend startup results plus log collectors
  - **Writes / cleanup**: Created after all three services are ready; disposed during fixture cleanup
  - **Guards**: All three service handles must be defined; all URLs must be reachable
  - **Invariant**: ServiceManager represents a complete, ready-to-test environment; partial initialization is invalid and must be cleaned up
  - **Evidence**: `tests/support/fixtures.ts:508-523,546-553` construct and validate ServiceManager

## 7) State Consistency & Async Coordination

### Service Startup Sequence Coordination

- **Source of truth**: Promise chain in `_serviceManager` fixture ensures sequential startup
- **Coordination**:
  - Backend promise starts immediately
  - Gateway promise waits for backend promise resolution to get `backendUrl`
  - Frontend promise waits for gateway promise resolution to get `gatewayUrl`
  - All promises resolve before fixture provides ServiceManager to tests
- **Async safeguards**:
  - `Promise.all([backendPromise, gatewayPromise, frontendPromise])` ensures all services are ready
  - Process exit listeners detect premature failures during startup
  - Timeout in `waitForStartup()` prevents indefinite hangs
  - Cleanup logic disposes already-started services if later service fails
- **Instrumentation**: Worker log lines show sequential startup progress; log streaming controlled by environment variables
- **Evidence**: `tests/support/fixtures.ts:453-506` implement sequential startup with promises; `tests/support/process/servers.ts:177-232` implement async readiness polling

### Log Collector Stream Attachment

- **Source of truth**: Each `Collector` instance owns its buffer and listener set
- **Coordination**:
  - Process streams attached immediately after spawn
  - Test attachments replay buffered lines then listen for new lines
  - Multiple tests can attach concurrently (per-test listeners)
  - Cleanup removes individual test listeners without affecting active tests
- **Async safeguards**:
  - Stream errors caught and logged without crashing collector
  - File write errors rejected via Promise to surface test attachment failures
  - Listener cleanup in `finally` blocks ensures no leaked subscriptions
- **Instrumentation**: Log lines tagged with `[worker-X service][stdout/stderr]` format; stream errors logged with `<<stream error>>` marker
- **Evidence**: `tests/support/process/backend-logs.ts:77-95,101-154` implement stream attachment and listener management

### Environment Variable Propagation

- **Source of truth**: `process.env` at time of service spawn
- **Coordination**:
  - Gateway URL set on `process.env.SSE_GATEWAY_URL` after gateway starts
  - Frontend inherits environment variables including `SSE_GATEWAY_URL` during spawn
  - Vite config reads `SSE_GATEWAY_URL` when configuring proxy rules
  - Environment variables restored to previous values during fixture cleanup
- **Async safeguards**:
  - Store previous values before mutation
  - Restore in `finally` block to prevent cross-worker pollution
  - Worker scope ensures each worker has isolated environment
- **Instrumentation**: None (environment variables are internal coordination mechanism)
- **Evidence**: `tests/support/fixtures.ts:363-364,417-419,517-522,559-560` manage environment variable lifecycle

### Readiness Polling vs Process Exit Race

- **Source of truth**: `Promise.race([exitPromise, pollPromise])` determines outcome
- **Coordination**:
  - Exit listeners attached before polling starts
  - Poll checks readiness endpoint in loop until success or timeout
  - Exit listener rejects if process exits before ready
  - First promise to settle (exit or ready) wins the race
- **Async safeguards**:
  - Exit listener detached after polling succeeds to prevent late rejections
  - Timeout ensures poll doesn't run forever
  - Poll interval prevents tight loop (200ms between checks)
- **Instrumentation**: Log lines show readiness URL and timeout in error messages; exit code/signal logged on premature exit
- **Evidence**: `tests/support/process/servers.ts:177-232` implement polling vs exit race logic

### Vite Proxy Configuration Timing

- **Source of truth**: Vite server configuration evaluated when `startFrontend()` spawns process
- **Coordination**:
  - `SSE_GATEWAY_URL` must be set before frontend script executes
  - Vite reads environment variable during config evaluation (top-level import time)
  - Proxy target locked in at frontend server start; cannot change dynamically
- **Async safeguards**:
  - Sequential startup ensures gateway URL available before frontend starts
  - Fallback to `http://localhost:3001` prevents startup failure if environment variable missing
  - Proxy plugin logs warning if target unreachable (non-blocking)
- **Instrumentation**: Vite proxy status plugin already logs backend reachability; same pattern will apply to gateway
- **Evidence**: `vite.config.ts:43-84,86` show proxy target configuration and status plugin pattern

## 8) Errors & Edge Cases

### Gateway Script Not Found

- **Failure**: Shell script missing at `<SSE_GATEWAY_ROOT>/scripts/run-gateway.sh`
- **Surface**: `startSSEGateway()` function during `spawn()` call
- **Handling**:
  - Process spawn fails with ENOENT error
  - Error thrown from `startService()` helper
  - Fixture catches error and disposes backend service
  - Worker initialization fails, preventing tests from running
- **Guardrails**: Clear error message includes expected script path; test output shows gateway root resolution
- **Evidence**: `tests/support/process/servers.ts:135-139` spawn process; `tests/support/fixtures.ts:501-505` handle startup errors

### Gateway Startup Timeout

- **Failure**: Gateway process starts but doesn't become ready within timeout (default 30s)
- **Surface**: `waitForStartup()` polling loop in `startSSEGateway()`
- **Handling**:
  - Polling loop exceeds timeout threshold
  - Timeout error thrown with readiness URL in message
  - Process termination triggered via dispose()
  - Gateway logs attached to test result showing startup output
- **Guardrails**: Timeout configurable via constant; logs reveal why gateway didn't become ready
- **Evidence**: `tests/support/process/servers.ts:220-228` implement timeout logic; lines 10-11 define timeout constants

### Gateway Process Crashes During Startup

- **Failure**: Gateway process exits with non-zero code before becoming ready
- **Surface**: Process 'exit' event during `waitForStartup()` polling
- **Handling**:
  - Exit listener rejects with exit code/signal in error message
  - Exit promise wins race against polling promise
  - Error propagates up to fixture, triggers cleanup
  - Gateway stdout/stderr logs captured and available for debugging
- **Guardrails**: Exit code and signal included in error message; log attachment shows crash details
- **Evidence**: `tests/support/process/servers.ts:192-207` implement exit listener

### Port Allocation Failure

- **Failure**: All ports in range exhausted or reserved
- **Surface**: `getPort()` call in `startSSEGateway()`
- **Handling**:
  - `getPort()` rejects with error
  - Error propagates to fixture, triggers cleanup
  - Already-started services (backend) disposed
- **Guardrails**: Unlikely in practice (ephemeral port range is large); excludePorts prevents worker self-collision
- **Evidence**: `tests/support/fixtures.ts:450-451` show getPort() usage; port exhaustion handling inherent to get-port library

### Backend Unreachable During Gateway Startup

- **Failure**: Backend URL passed to gateway is incorrect or backend not responding
- **Surface**: Gateway process starts but callback endpoint unreachable
- **Handling**:
  - Gateway may log callback failures to stderr
  - Readiness check may still pass if gateway listens without testing callback
  - Tests may fail later when SSE connections don't receive events
- **Guardrails**: Gateway logs attached to test results reveal callback errors; sequential startup ensures backend is ready before gateway starts
- **Evidence**: `tests/support/fixtures.ts:453-463` ensure backend ready before gateway startup

### Vite Proxy Misconfiguration

- **Failure**: `/sse` requests not proxied correctly or path rewrite broken
- **Surface**: Frontend SSE connection attempts in tests
- **Handling**:
  - Browser console shows 404 or connection errors
  - Playwright page console listener may catch error (depending on error type)
  - Test fails with timeout waiting for SSE events
  - Gateway logs show no incoming connections
- **Guardrails**: Vite config pattern matches existing `/api` proxy; testing against real backend validates proxy
- **Evidence**: `vite.config.ts:105-111` show proxy configuration; `tests/support/fixtures.ts:162-195` catch console errors

### SSE_GATEWAY_URL Not Set in Frontend Environment

- **Failure**: Environment variable not propagated to frontend process
- **Surface**: Vite config evaluation during frontend startup
- **Handling**:
  - Fallback to `http://localhost:3001` used instead
  - Proxy targets wrong gateway instance (likely non-existent)
  - Tests fail with SSE connection errors
- **Guardrails**: Explicit environment variable setting in fixture; fallback value provides hint in error messages
- **Evidence**: `tests/support/fixtures.ts:517-522` set environment variables; `vite.config.ts:86` shows fallback pattern

### Gateway Shutdown Timeout

- **Failure**: Gateway process doesn't respond to SIGTERM during cleanup
- **Surface**: `dispose()` function during fixture teardown
- **Handling**:
  - Wait 5 seconds for graceful exit after SIGTERM
  - If not exited, send SIGKILL
  - Wait additional 5 seconds for forced exit
  - Proceed with worker cleanup regardless
- **Guardrails**: Two-stage termination (SIGTERM → SIGKILL); timeout ensures cleanup doesn't hang indefinitely
- **Evidence**: `tests/support/process/servers.ts:234-258` implement termination logic

### Concurrent Test Log Writes

- **Failure**: Multiple tests in same worker attaching logs simultaneously
- **Surface**: Log collector listener registration in `attachToTest()`
- **Handling**:
  - Each test gets independent file stream
  - Each test gets independent listener
  - Listener set allows concurrent registrations
  - Each test writes to separate output file
- **Guardrails**: Thread-safe listener set (JavaScript single-threaded); per-test output files prevent conflicts
- **Evidence**: `tests/support/process/backend-logs.ts:66-67,128` use Set for listeners and per-test files

### Gateway Repository Not Present

- **Failure**: `SSE_GATEWAY_ROOT` points to non-existent directory or default `../ssegateway` doesn't exist
- **Surface**: Path resolution in `getSSEGatewayRepoRoot()`
- **Handling**:
  - Resolved path is invalid
  - Script path construction produces invalid path
  - Spawn fails with ENOENT (same as "Script Not Found" case)
  - Error message includes attempted script path
- **Guardrails**: Error message reveals expected path; Docker compose configuration mounts gateway repository
- **Evidence**: `tests/support/process/servers.ts:338-350` show repo root resolution; `.llmbox/docker-compose.yml:24-25` mount gateway

## 9) Observability / Instrumentation

### Gateway Process Lifecycle Logging

- **Signal**: Lifecycle log lines (starting, ready, stopping)
- **Type**: Console log via `serviceShouldLogLifecycle()` check
- **Trigger**: Gateway startup initiation, readiness success, disposal initiation
- **Labels / fields**: Worker index, service label ('sse-gateway'), URL, port, PID
- **Consumer**: Human developers debugging test runs; CI log output
- **Evidence**: `tests/support/process/servers.ts:128-133,155-159,244-246` log lifecycle events

### PLAYWRIGHT_GATEWAY_LOG_STREAM Environment Variable

- **Signal**: Real-time console output of gateway stdout/stderr
- **Type**: Console stream via `streamProcessOutput()`
- **Trigger**: Environment variable `PLAYWRIGHT_GATEWAY_LOG_STREAM=true` before test run
- **Labels / fields**: Worker index, service label, stream source (stdout/stderr), line content
- **Consumer**: Developers debugging gateway behavior during test runs; CI troubleshooting
- **Evidence**: `tests/support/process/servers.ts:261-292,302-310` implement log streaming

### Gateway Log File Attachment

- **Signal**: `gateway.log` file attached to test results
- **Type**: Playwright test attachment
- **Trigger**: Auto-fixture calls `attachToTest()` for every test; logs written during test execution
- **Labels / fields**: Worker index, service label, stream source, line content with timestamp
- **Consumer**: Playwright HTML report viewers; post-test debugging
- **Evidence**: `tests/support/process/backend-logs.ts:101-154` implement log attachment; `tests/support/fixtures.ts:99-121` show auto-fixture pattern for backend/frontend

### Service Manager Ready Event

- **Signal**: Test event showing all services ready with URLs
- **Type**: `ui_state` test event emitted via test event bridge
- **Trigger**: Page fixture initialization after ServiceManager is ready (already exists for backend/frontend)
- **Labels / fields**: `backendUrl`, `frontendUrl`, `gatewayUrl` (to be added)
- **Consumer**: Test debugging; validates environment URLs are correctly configured
- **Evidence**: `tests/support/fixtures.ts:147-156,277-286` emit worker.services ready event

### Gateway Startup Timing

- **Signal**: Readiness log line with elapsed time
- **Type**: Console log during gateway startup completion
- **Trigger**: Successful readiness check after polling loop
- **Labels / fields**: Worker index, service label, URL, elapsed milliseconds (optional)
- **Consumer**: Performance monitoring; identifying slow startup
- **Evidence**: `tests/support/process/servers.ts:177-190` implement timing logic (performance.now())

### Vite Proxy Status Check

- **Signal**: Console warning if gateway unreachable during Vite startup
- **Type**: Console log via `backendProxyStatusPlugin` pattern
- **Trigger**: Vite dev server or preview server start; probe gateway health endpoint
- **Labels / fields**: Gateway URL, HTTP status or error reason
- **Consumer**: Developers starting Vite manually; proxy configuration validation
- **Evidence**: `vite.config.ts:43-84` implement backend proxy status plugin as template

### Process Spawn Errors

- **Signal**: Process error event logged to service logs
- **Type**: Stderr log via `streamProcessOutput()` error handler
- **Trigger**: Node process emits 'error' event (e.g., spawn failure)
- **Labels / fields**: Worker index, service label, error message
- **Consumer**: Debugging service startup failures
- **Evidence**: `tests/support/process/servers.ts:275-278` handle stream errors

### Gateway Ready URL Polling

- **Signal**: Readiness URL in timeout error message
- **Type**: Error message thrown from `waitForStartup()`
- **Trigger**: Gateway doesn't become ready within timeout
- **Labels / fields**: Worker index, service label, readiness URL, timeout duration
- **Consumer**: Debugging readiness check failures; identifying missing health endpoint
- **Evidence**: `tests/support/process/servers.ts:226-228` include readiness URL in timeout error

## 10) Lifecycle & Background Work

### Gateway Process Spawn and Monitoring

- **Hook / effect**: Process spawn via `child_process.spawn()` in `startService()`
- **Trigger cadence**: Once per worker during fixture initialization
- **Responsibilities**:
  - Spawn shell script process with arguments
  - Pipe stdout/stderr streams to log collector
  - Monitor process exit events during startup and runtime
  - Register process for emergency shutdown on signals (SIGINT, SIGTERM)
- **Cleanup**:
  - Send SIGTERM on dispose()
  - Wait 5 seconds for graceful exit
  - Send SIGKILL if still running
  - Remove from activeChildren set
  - Close log collector streams
- **Evidence**: `tests/support/process/servers.ts:135-146,353-384` implement spawn and cleanup

### Gateway Log Stream Listeners

- **Hook / effect**: Stream piping via `stream.pipe(split2())` and listener attachment
- **Trigger cadence**: Immediately after process spawn; listeners added per test
- **Responsibilities**:
  - Split stdout/stderr streams into lines
  - Buffer lines for replay to late-attaching tests
  - Notify all active test listeners of new lines
  - Write lines to per-test log files
- **Cleanup**:
  - Remove listener from set when test completes
  - Close per-test file stream
  - Destroy split2 transform stream
  - Dispose collector when worker shuts down
- **Evidence**: `tests/support/process/backend-logs.ts:77-95,121-153,156-161` implement stream lifecycle

### Readiness Polling Loop

- **Hook / effect**: Async polling via `setInterval` pattern in `waitForStartup()`
- **Trigger cadence**: Every 200ms starting immediately after process spawn
- **Responsibilities**:
  - Fetch readiness endpoint (or check port connectivity)
  - Check elapsed time against timeout
  - Resolve promise when ready
  - Reject promise on timeout
  - Stop polling on process exit
- **Cleanup**:
  - Polling stops when readiness achieved or timeout occurs
  - Exit listener removed after poll completes
  - No ongoing background work after function returns
- **Evidence**: `tests/support/process/servers.ts:209-232` implement polling loop with timeout

### Environment Variable Lifecycle

- **Hook / effect**: `process.env` mutation during fixture setup and teardown
- **Trigger cadence**: Once during worker fixture initialization; once during teardown
- **Responsibilities**:
  - Store previous `SSE_GATEWAY_URL` value (may be undefined)
  - Set `SSE_GATEWAY_URL` to gateway URL after startup
  - Restore previous value during fixture cleanup
- **Cleanup**:
  - Restore happens in `finally` block regardless of test outcomes
  - Prevents environment pollution across workers (worker scope guarantees isolation)
- **Evidence**: `tests/support/fixtures.ts:363-364,417-419,517-522,559-560` manage environment lifecycle

### Emergency Shutdown Handlers

- **Hook / effect**: Process-level signal listeners (`process.once('SIGINT')`, `process.once('SIGTERM')`)
- **Trigger cadence**: Registered once when first process is spawned
- **Responsibilities**:
  - Kill all active child processes on signal
  - Prevent orphaned service processes
  - Exit with appropriate code (130 for SIGINT, 143 for SIGTERM)
- **Cleanup**:
  - Handlers registered with `once()` so they only run once
  - Iterate activeChildren set and send SIGTERM to each
  - Ignore cleanup failures (process may already be terminating)
- **Evidence**: `tests/support/process/servers.ts:353-384` implement emergency shutdown

### Service Handle Disposal

- **Hook / effect**: `dispose()` function on ServerHandle returned from `startSSEGateway()`
- **Trigger cadence**: Called during `disposeServices()` in fixture cleanup
- **Responsibilities**:
  - Initiate graceful shutdown via SIGTERM
  - Wait for exit or timeout
  - Force kill via SIGKILL if needed
  - Return promise that resolves when cleanup complete
- **Cleanup**:
  - Idempotent: calling dispose() multiple times is safe (checks exitCode)
  - Gateway disposed after frontend in reverse startup order
  - Cleanup happens in fixture `finally` block
- **Evidence**: `tests/support/process/servers.ts:234-259` implement disposal; `tests/support/fixtures.ts:526-544` call dispose

## 11) Security & Permissions

### SSE Gateway Callback Authentication

- **Concern**: Gateway makes unauthenticated callbacks to backend `/api/sse/callback` endpoint
- **Touchpoints**: Gateway process invocation with `--callback-url` argument; backend endpoint implementation
- **Mitigation**:
  - Backend endpoint may implement IP-based validation (localhost only)
  - Callback URL only provided to gateway during startup (not exposed to browser)
  - Test environment isolation prevents cross-worker callback interference
- **Residual risk**:
  - If backend callback endpoint is open, any process on localhost could send callbacks
  - Acceptable for test environment; production callback authentication is backend responsibility
  - This plan only addresses test infrastructure, not production security
- **Evidence**: Change brief line 20; backend implementation not visible in frontend repository

### Gateway Repository Access

- **Concern**: Test infrastructure spawns arbitrary shell scripts from gateway repository
- **Touchpoints**: `SSE_GATEWAY_ROOT` environment variable; script path resolution in `getSSEGatewayRepoRoot()`
- **Mitigation**:
  - Gateway repository is trusted (sibling repository in same organization)
  - Docker compose explicitly mounts gateway repository read-write
  - No user input in script path (only environment variable or hardcoded default)
  - Script execution isolated to test worker process, not production
- **Residual risk**:
  - Malicious `SSE_GATEWAY_ROOT` could point to attacker-controlled directory
  - Acceptable for test environment where environment variables are trusted
  - Not applicable to production (tests don't run in production)
- **Evidence**: `.llmbox/docker-compose.yml:24-25` mount gateway; `tests/support/process/servers.ts:346-350` show repo root pattern

### Test Data Isolation

- **Concern**: Gateway may handle events for multiple workers if port collision occurs
- **Touchpoints**: Port allocation in `startSSEGateway()`; worker-scoped fixtures
- **Mitigation**:
  - Dynamic port allocation via `getPort()` prevents collisions
  - Each worker gets unique gateway instance on unique port
  - Vite proxy in frontend targets worker-specific gateway URL
  - No cross-worker data sharing possible
- **Residual risk**: None (worker isolation is fundamental to per-worker service model)
- **Evidence**: `tests/support/fixtures.ts:450-451` allocate unique ports; worker scope at line 565

## 12) UX / UI Impact

*Not applicable.* This change only affects test infrastructure. The frontend application UI is not modified. Users do not interact with Playwright test services.

### Developer Experience Impact

- **Entry point**: Running Playwright tests via `pnpm playwright test`
- **Change**:
  - External services mode (`PLAYWRIGHT_MANAGED_SERVICES=false`) no longer supported
  - Tests now start three services per worker instead of two (backend, gateway, frontend)
  - Worker startup time increases by ~2-5 seconds (gateway startup overhead)
  - Log files now include `gateway.log` alongside `backend.log` and `frontend.log`
- **User interaction**: Developers see three-service lifecycle logs during test runs if log streaming enabled
- **Dependencies**: Gateway repository must be present at `../ssegateway` or `SSE_GATEWAY_ROOT` location
- **Evidence**: Change brief success criteria; `tests/support/fixtures.ts:346-566` implement worker fixture

## 13) Deterministic Test Plan

### Gateway Startup Verification

- **Surface**: Worker fixture initialization
- **Scenarios**:
  - **Given** gateway repository exists at default location
    **When** worker starts for first test
    **Then** gateway process spawns with correct arguments
    **And** gateway becomes ready within timeout
    **And** `gatewayUrl` is set on ServiceManager
  - **Given** `SSE_GATEWAY_ROOT` environment variable set to custom path
    **When** worker starts
    **Then** gateway script resolved from custom path
  - **Given** gateway script missing
    **When** worker starts
    **Then** spawn fails with clear error message including expected path
  - **Given** gateway doesn't respond to readiness check
    **When** worker waits for startup
    **Then** timeout error thrown after 30 seconds
    **And** gateway process is killed
    **And** gateway logs attached to test output
- **Instrumentation / hooks**:
  - Check log collector buffer for lifecycle log lines
  - Verify `SSE_GATEWAY_URL` environment variable set
  - Inspect ServiceManager object for gatewayUrl property
  - Not relying on Playwright selectors (infrastructure layer)
- **Gaps**: Manual verification needed initially; no automated test of test infrastructure
- **Evidence**: `tests/support/process/servers.ts:124-167` startup logic; `tests/support/fixtures.ts:453-506` fixture integration

### Gateway Log Collection

- **Surface**: Test execution with log attachment
- **Scenarios**:
  - **Given** gateway is running and logging
    **When** test executes and completes
    **Then** `gateway.log` file attached to test result
    **And** log file contains gateway stdout/stderr lines
  - **Given** `PLAYWRIGHT_GATEWAY_LOG_STREAM=true`
    **When** test runs
    **Then** gateway logs stream to console in real-time
  - **Given** gateway crashes during test
    **When** test completes (likely with failure)
    **Then** gateway crash output captured in log attachment
- **Instrumentation / hooks**:
  - Examine test result attachments for `gateway.log`
  - Check console output for log streaming
  - Verify log lines tagged with `[worker-X sse-gateway][stdout/stderr]`
- **Gaps**: Automated verification would require infrastructure test suite (out of scope)
- **Evidence**: `tests/support/process/backend-logs.ts:101-154` log attachment pattern; `tests/support/fixtures.ts:99-121` auto-fixture pattern

### Vite Proxy Configuration

- **Surface**: Frontend SSE connections during tests
- **Scenarios**:
  - **Given** frontend is running with Vite dev server
    **When** frontend code connects to `/sse/stream/<id>`
    **Then** request proxied to gateway without `/sse` prefix
    **And** gateway receives request at `/stream/<id>`
    **And** SSE events stream back to frontend
  - **Given** `SSE_GATEWAY_URL` not set
    **When** frontend starts
    **Then** Vite proxy falls back to `http://localhost:3001`
    **And** connection likely fails (wrong gateway)
  - **Given** gateway is unreachable
    **When** Vite proxy attempts connection
    **Then** console warning logged (non-blocking)
- **Instrumentation / hooks**:
  - Existing SSE-related tests will validate proxy behavior implicitly
  - Browser network tab shows proxy requests during manual verification
  - Gateway logs show incoming connections if proxy working
- **Gaps**: No explicit test of proxy rewrite logic; validated implicitly by existing SSE tests
- **Evidence**: `vite.config.ts:105-111` proxy pattern; existing SSE tests in test suite

### Sequential Startup Order

- **Surface**: Worker fixture initialization
- **Scenarios**:
  - **Given** worker starting
    **When** services initialize
    **Then** backend starts first and becomes ready
    **And** gateway starts second with backend callback URL
    **And** frontend starts third with gateway URL
    **And** all three URLs available in ServiceManager
  - **Given** backend startup fails
    **When** worker initialization runs
    **Then** gateway never starts
    **And** frontend never starts
    **And** worker initialization fails with backend error
  - **Given** gateway startup fails
    **When** worker initialization runs
    **Then** backend is disposed
    **And** frontend never starts
    **And** worker initialization fails with gateway error
- **Instrumentation / hooks**:
  - Check log collector buffers for startup order
  - Verify ServiceManager not provided if any service fails
  - Inspect cleanup logic for partial service disposal
- **Gaps**: Manual verification by inducing failures (out of scope for initial implementation)
- **Evidence**: `tests/support/fixtures.ts:453-506` implement sequential startup with promises

### External Services Mode Removal

- **Surface**: Playwright configuration and global setup
- **Scenarios**:
  - **Given** `PLAYWRIGHT_MANAGED_SERVICES=false` in environment
    **When** tests run
    **Then** error thrown explaining external mode removed
    **Or** setting is ignored and per-worker mode used
  - **Given** no `PLAYWRIGHT_MANAGED_SERVICES` set (default)
    **When** tests run
    **Then** per-worker managed services used
  - **Given** `webServer` configuration in playwright.config.ts
    **When** configuration loaded
    **Then** webServer is undefined (external mode removed)
- **Instrumentation / hooks**:
  - Check global setup logs for mode announcement
  - Verify no health check logic for external services
  - Inspect Playwright config structure (no webServer property)
- **Gaps**: No automated verification of removed code (manual code review)
- **Evidence**: `playwright.config.ts:29-44` current webServer config; `tests/support/global-setup.ts:10-72` external mode logic

### Existing Tests Pass Unchanged

- **Surface**: All current Playwright specs
- **Scenarios**:
  - **Given** all implementation changes complete
    **When** existing Playwright test suite runs
    **Then** all tests pass without modification
    **And** no new test failures introduced
    **And** SSE-dependent tests receive events correctly
- **Instrumentation / hooks**:
  - Run specific SSE tests first: `tests/e2e/deployment/deployment-banner.spec.ts` and `tests/e2e/parts/part-ai-creation.spec.ts` with `PLAYWRIGHT_GATEWAY_LOG_STREAM=true`
  - Verify gateway logs show callback registration, connection establishment, and event delivery
  - Run full Playwright suite (`pnpm playwright test`)
  - Check HTML report for any new failures
  - Compare pass rate before and after implementation
- **Gaps**: None (primary acceptance criterion with explicit SSE test validation)
- **Evidence**: Change brief success criterion #5; existing test suite stability requirement

## 14) Implementation Slices

### Slice 1: Gateway Startup Function

- **Goal**: Implement `startSSEGateway()` function with log collection
- **Touches**:
  - `tests/support/process/servers.ts`: Add function, types, constants
  - `tests/support/process/backend-logs.ts`: Add gateway log collector factory
- **Dependencies**: None (standalone implementation)

### Slice 2: External Services Removal

- **Goal**: Remove external services mode completely
- **Touches**:
  - `tests/support/fixtures.ts`: Delete lines 386-423 (external services branch)
  - `playwright.config.ts`: Delete `webServer` configuration (lines 29-44)
  - `tests/support/global-setup.ts`: Delete external mode health checks (lines 10-72, keep seed database logic)
- **Dependencies**: None (removal only)

### Slice 3: Fixture Integration

- **Goal**: Integrate gateway into `_serviceManager` fixture
- **Touches**:
  - `tests/support/fixtures.ts`: Add gateway startup between backend and frontend, add log fixture, update ServiceManager type
- **Dependencies**: Slice 1 must be complete

### Slice 4: Vite Proxy Configuration

- **Goal**: Add `/sse` proxy rules to Vite config
- **Touches**:
  - `vite.config.ts`: Add proxy configuration for server and preview modes
- **Dependencies**: Slice 3 must be complete (frontend needs `SSE_GATEWAY_URL` available)

### Slice 5: Documentation and Cleanup

- **Goal**: Update documentation and environment variable examples
- **Touches**:
  - `.env.test.example`: Remove or update `PLAYWRIGHT_MANAGED_SERVICES`, add gateway variables
  - `docs/contribute/environment.md`: Document new variables
  - `docs/contribute/testing/ci_and_execution.md`: Update service management documentation
- **Dependencies**: Slices 1-4 complete

### Slice 6: Validation

- **Goal**: Validate gateway integration with specific SSE tests, then run full suite
- **Touches**: No code changes, verification only
- **Tasks**:
  1. Run specific SSE-dependent tests in isolation with log streaming:
     - `PLAYWRIGHT_GATEWAY_LOG_STREAM=true pnpm playwright test tests/e2e/deployment/deployment-banner.spec.ts`
     - `PLAYWRIGHT_GATEWAY_LOG_STREAM=true pnpm playwright test tests/e2e/parts/part-ai-creation.spec.ts`
  2. Verify in gateway logs:
     - Callback registration succeeded (backend POST to `/api/sse/callback` returns 200)
     - SSE connections opened (`GET /stream/<id>` requests)
     - Events delivered (matching test expectations)
  3. Confirm these specific tests pass and receive SSE events correctly
  4. Execute full suite: `pnpm playwright test`
  5. Review HTML report for new failures
  6. Check gateway logs attached to test results (`gateway.log` attachment)
  7. Confirm no regressions in existing functionality
- **Dependencies**: Slices 1-5 complete

## 15) Risks & Open Questions

### Risks

- **Risk**: Gateway startup adds 2-5 seconds to worker initialization, slowing test runs
- **Impact**: Developer productivity reduced; CI runtime increased
- **Mitigation**:
  - Keep gateway startup timeout reasonable (30s like backend)
  - Optimize gateway script for fast startup
  - Parallelize backend and gateway startup if possible (not currently feasible due to callback URL dependency)

- **Risk**: Gateway readiness check implementation (RESOLVED)
- **Impact**: Initially unknown whether gateway had health endpoint
- **Resolution**: Confirmed gateway has `/readyz` endpoint in `ssegateway/src/routes/health.ts` that returns 200 OK when configured and ready. Use standard HTTP polling pattern like backend.
- **Mitigation**:
  - Check with backend developer for health endpoint existence
  - Implement port connectivity check as fallback
  - Document readiness check approach in code comments

- **Risk**: Gateway process may not exit cleanly on SIGTERM
- **Impact**: Worker cleanup hangs, requiring SIGKILL and 5-second delay
- **Mitigation**:
  - Two-stage termination (SIGTERM → wait → SIGKILL) already implemented
  - Log warnings for forced kills to surface cleanup issues

- **Risk**: Vite proxy path rewriting may not work correctly with SSE protocol
- **Impact**: SSE connections fail, tests cannot verify SSE-dependent features
- **Mitigation**:
  - Follow existing `/api` proxy pattern which works
  - Test proxy configuration manually before full suite run
  - Gateway logs will show if requests arrive with wrong paths

- **Risk**: Existing tests may depend on external services mode in undocumented ways (RESOLVED)
- **Impact**: Removing external mode could break hidden workflows or CI configurations
- **Resolution**: Searched for `PLAYWRIGHT_MANAGED_SERVICES` usage - found only in documentation (testing guides) but not used in CI configuration (`.llmbox/docker-compose.yml` has no references). Safe to remove.
- **Mitigation**:
  - Add clear error message in global-setup.ts if `PLAYWRIGHT_MANAGED_SERVICES=false` is detected
  - Document removal in commit message
  - Update testing documentation to reflect per-worker-only model

### Open Questions

- **Question**: Does SSE Gateway expose a health endpoint? (RESOLVED)
- **Answer**: Yes, gateway has `/readyz` endpoint at `ssegateway/src/routes/health.ts:39-55` that returns 200 OK when callback URL is configured and server is ready. Use standard HTTP polling with `readinessPath = '/readyz'`.

- **Question**: Should `PLAYWRIGHT_MANAGED_SERVICES=false` setting be ignored (with warning) or throw error?
- **Decision**: Throw clear error in global-setup.ts explaining external services mode has been removed. Error message should point users to per-worker managed services documentation and explain how to migrate (remove the environment variable).

- **Question**: What is the typical gateway startup time?
- **Why it matters**: Determines if 30-second timeout is appropriate or should be adjusted
- **Owner / follow-up**: Measure during implementation; adjust timeout constant if needed

- **Question**: Does gateway require any environment variables beyond port and callback URL?
- **Why it matters**: Affects process spawn environment variable setup
- **Owner / follow-up**: Inspect gateway documentation or source code; coordinate with backend developer

- **Question**: Should gateway repository location be validated at startup or fail lazily when script not found?
- **Why it matters**: Affects error message clarity and debugging experience
- **Owner / follow-up**: Decision: fail lazily (let spawn fail with ENOENT) for consistency with existing pattern

## 16) Confidence

**Confidence: High** — Implementation follows well-established patterns in existing codebase, gateway integration is clearly specified, and removal of external services mode is straightforward deletion. Primary uncertainty is gateway readiness check mechanism, which has fallback options.
