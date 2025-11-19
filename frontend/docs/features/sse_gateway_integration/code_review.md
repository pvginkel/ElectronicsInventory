# Code Review: SSE Gateway Integration

## 1) Summary & Decision

**Readiness**

The SSE Gateway integration implementation successfully removes external services mode and establishes per-worker managed services for backend, SSE gateway, and frontend. The code follows established patterns from the existing backend and frontend service management, with proper sequential startup coordination, log collection, health checks, and cleanup. TypeScript strict mode passes, all patterns are consistent with the codebase conventions, and the changes align closely with the approved plan. The implementation is infrastructure-focused with no UI changes, correctly leaving existing Playwright specs untouched.

**Decision**

`GO` — Implementation is complete, correct, and ready for production. All plan requirements are met, TypeScript strict mode passes, patterns are consistent, and the removal of external services mode is clean. The gateway integration follows the established service management architecture precisely.

## 2) Conformance to Plan (with evidence)

**Plan alignment**

- `Section 1: Intent & Scope - Remove external services logic` ↔ `tests/support/fixtures.ts:369-412` — External services mode conditional logic completely removed from `_serviceManager` fixture
- `Section 1: Intent & Scope - Remove external services logic` ↔ `playwright.config.ts:25-42` — `webServer` configuration array completely removed
- `Section 1: Intent & Scope - Remove external services logic` ↔ `tests/support/global-setup.ts:7-24` — External services health checks removed, replaced with error if `PLAYWRIGHT_MANAGED_SERVICES=false` detected
- `Section 2: startSSEGateway() function` ↔ `tests/support/process/servers.ts:113-144` — Gateway startup function implemented with port allocation, script path resolution, callback URL construction, and readiness check
- `Section 2: Gateway log collector` ↔ `tests/support/process/backend-logs.ts:52-62` — `createGatewayLogCollector()` factory added following existing pattern
- `Section 2: ServiceManager extension` ↔ `tests/support/fixtures.ts:47-54` — `gatewayUrl` and `gatewayLogs` properties added to ServiceManager type
- `Section 2: Fixture integration` ↔ `tests/support/fixtures.ts:453-509` — Gateway startup integrated between backend and frontend with sequential promise chain
- `Section 2: Vite proxy configuration` ↔ `vite.config.ts:112-117,132-137` — `/sse` proxy rules added to both server and preview modes with path rewriting
- `Section 2: Environment variable support` ↔ `tests/support/process/servers.ts:393-398` — `SSE_GATEWAY_ROOT` environment variable support with default fallback
- `Section 2: Documentation updates` ↔ `.env.test.example:4-10`, `docs/contribute/environment.md:9-20`, `docs/contribute/testing/ci_and_execution.md:37-50` — Environment variables, service management, and log streaming documented

**Gaps / deviations**

None identified. All plan commitments have been implemented correctly and completely. The implementation matches the plan's technical specifications precisely.

## 3) Correctness — Findings (ranked)

No blocker or major issues identified. The implementation is correct and complete.

## 4) Over-Engineering & Refactoring Opportunities

No over-engineering observed. The implementation:
- Reuses existing patterns from backend/frontend service management
- Adds minimal new abstractions (only `SSEGatewayServerHandle` type alias)
- Follows DRY principle via shared `startService()` helper
- Maintains consistent naming and structure across all three services

The code is appropriately factored for infrastructure management.

## 5) Style & Consistency

No substantive consistency issues. The implementation demonstrates excellent adherence to project patterns:

- **Pattern**: Service startup functions (`startBackend`, `startFrontend`, `startSSEGateway`)
- **Evidence**: `tests/support/process/servers.ts:25-144` — All three functions follow identical structure: port allocation → script path resolution → args construction → `startService()` call
- **Impact**: Maintenance is straightforward; extending to a fourth service would be trivial
- **Recommendation**: None needed; pattern is well-established and correctly applied

- **Pattern**: Log collector factories
- **Evidence**: `tests/support/process/backend-logs.ts:27-62` — All three collectors (`createBackendLogCollector`, `createFrontendLogCollector`, `createGatewayLogCollector`) use identical factory pattern with consistent parameters
- **Impact**: Log attachment and streaming behavior is uniform across all services
- **Recommendation**: None needed; pattern is consistent

- **Pattern**: ServiceLabel enum extension
- **Evidence**: `tests/support/process/servers.ts:146` — Type extended to include `'sse-gateway'`; `serviceShouldLogLifecycle()` updated at lines 345-346
- **Impact**: Gateway lifecycle logging integrates seamlessly with existing infrastructure
- **Recommendation**: None needed; pattern extended correctly

## 6) Tests & Deterministic Coverage (new/changed behavior only)

**Surface**: Test infrastructure (no UI changes)

**Scenarios**:

This change is infrastructure-only. No new Playwright specs are required because:
1. The change does not add or modify user-facing UI
2. Existing SSE-dependent tests (identified in plan as `deployment-banner.spec.ts` and `part-ai-creation.spec.ts`) will implicitly validate gateway integration
3. The plan explicitly states "All existing Playwright tests will pass without modification (no test changes required)" (plan section 1, line 89)

**Hooks**:
- Gateway logs captured via `createGatewayLogCollector()` and attached as `gateway.log` to test results
- Gateway URL exposed via `gatewayUrl` fixture
- ServiceManager ready event includes `gatewayUrl` in metadata (`tests/support/fixtures.ts:175`)

**Gaps**:
None. Infrastructure changes correctly avoid adding test specs. Validation should be performed by running existing SSE-dependent specs with `PLAYWRIGHT_GATEWAY_LOG_STREAM=true` to observe gateway behavior, as specified in plan section 14 (Slice 6).

**Evidence**:
- `tests/support/fixtures.ts:114-127` — `gatewayLogs` auto-fixture mirrors `backendLogs` and `frontendLogs` patterns
- `tests/support/fixtures.ts:102-106` — `gatewayUrl` fixture provides URL to tests
- No test specs modified in diff (correct for infrastructure change)

## 7) Adversarial Sweep (must attempt ≥3 credible failures or justify none)

### Attack 1: Gateway startup race with frontend Vite config evaluation

**Concern**: Frontend process spawns before `SSE_GATEWAY_URL` is set on `process.env`, causing Vite proxy to read undefined value.

**Evidence**:
- `tests/support/fixtures.ts:517-522` — `SSE_GATEWAY_URL` set immediately before `startFrontend()` call
- `tests/support/fixtures.ts:461-488` — Promise chain ensures gateway fully started before frontend starts
- `vite.config.ts:87` — Fallback to `http://localhost:3001` prevents startup failure

**Why code held up**: Sequential promise chain (`gatewayPromise.then(async ({ backendHandle, gatewayHandle }) => ...)`) guarantees gateway is resolved before frontend starts. Environment variable is set synchronously before spawn, and Vite reads it during config evaluation. Fallback value provides safety net.

### Attack 2: Gateway process crashes during startup, leaking backend process

**Concern**: If gateway fails to start, backend process might remain running without cleanup.

**Evidence**:
- `tests/support/fixtures.ts:472-483` — Gateway startup wrapped in try/catch that calls `await backendHandle.dispose()` on error
- `tests/support/fixtures.ts:519-530` — Promise.all replaced with sequential await ensures cleanup ordering
- `tests/support/fixtures.ts:553-589` — Comprehensive disposal in finally block handles all services

**Why code held up**: Error handling at each startup stage ensures previously-started services are disposed. The sequential promise chain allows each stage to catch errors and clean up its dependencies. Finally block provides additional safety net.

### Attack 3: Port collision between gateway and backend/frontend

**Concern**: Dynamic port allocation might assign same port to multiple services in a worker.

**Evidence**:
- `tests/support/fixtures.ts:440-442` — Ports allocated with explicit exclusion: `getPort()`, `getPort({ exclude: [backendPort] })`, `getPort({ exclude: [backendPort, gatewayPort] })`
- `tests/support/process/servers.ts:120-125` — `startSSEGateway()` respects `excludePorts` parameter

**Why code held up**: Port exclusion chain prevents collisions. Each service's allocated port is added to the exclusion list for subsequent services. Worker isolation (worker-scoped fixture) prevents cross-worker collisions.

### Attack 4: Environment variable pollution across workers

**Concern**: Multiple workers setting `SSE_GATEWAY_URL` could interfere with each other.

**Evidence**:
- `tests/support/fixtures.ts:369` — Fixture is worker-scoped (`[async ({}, use, workerInfo) => ...]`)
- `tests/support/fixtures.ts:390-392` — Previous environment variable values stored before mutation
- `tests/support/fixtures.ts:598-600` — Previous values restored in finally block

**Why code held up**: Worker-scoped fixtures ensure each worker has isolated execution context. Environment variable backup/restore prevents pollution. Node.js worker isolation guarantees separate `process.env` per worker.

### Attack 5: Gateway readiness check passes but callback URL is unreachable

**Concern**: Gateway `/readyz` endpoint might return 200 OK even if backend callback URL is misconfigured or unreachable.

**Evidence**:
- Gateway implementation (external to frontend) determines readiness criteria
- `tests/support/fixtures.ts:453-463` — Backend started and verified ready before gateway receives callback URL
- `tests/support/process/servers.ts:128` — Callback URL constructed as `${backendUrl}/api/sse/callback` using verified backend URL

**Why code held up**: Sequential startup guarantees backend is reachable when gateway starts. Callback URL construction is deterministic from verified backend URL. If gateway's readiness check is insufficient (doesn't validate callback connectivity), tests will fail downstream with clear error messages and gateway logs will show callback failures. This is acceptable because the gateway service itself owns the readiness contract—if it reports ready but fails later, that's a gateway implementation issue, not a frontend infrastructure issue.

## 8) Invariants Checklist (table)

- **Invariant**: Gateway must start after backend and before frontend to satisfy dependency chain
  - **Where enforced**: `tests/support/fixtures.ts:455-509` — Promise chain with `backendReadyPromise.then(() => startGateway).then(() => startFrontend)`
  - **Failure mode**: Frontend Vite config reads undefined `SSE_GATEWAY_URL` if frontend starts before gateway; gateway receives invalid callback URL if backend not ready
  - **Protection**: Sequential promise chaining prevents out-of-order startup; startup failures propagate and trigger cleanup
  - **Evidence**: Lines 453-509 show explicit dependency chain; fallback values in `vite.config.ts:87` provide additional safety

- **Invariant**: Gateway callback URL must point to the same backend instance that the worker started
  - **Where enforced**: `tests/support/process/servers.ts:128` — Callback URL constructed directly from `options.backendUrl` parameter received from fixture
  - **Failure mode**: Gateway callbacks would fail or hit wrong backend if URL mismatch occurs
  - **Protection**: Single source of truth (`backendHandle.url`) used for both callback URL construction and environment variable; no intermediate copies or transformations
  - **Evidence**: `tests/support/fixtures.ts:461` passes `backendHandle.url` to `startSSEGateway()`; line 128 constructs callback URL from this parameter

- **Invariant**: Each worker must have isolated service instances (no port sharing)
  - **Where enforced**: `tests/support/fixtures.ts:440-442` — Port exclusion chain prevents collisions within worker; worker-scoped fixture (line 369) prevents cross-worker interference
  - **Failure mode**: Services crash with EADDRINUSE if port collision occurs; cross-worker data contamination if services shared
  - **Protection**: Dynamic port allocation with exclusion lists; worker-scoped fixture lifecycle; cleanup disposes services per worker
  - **Evidence**: `getPort()` calls with cumulative exclusions; `scope: 'worker'` implicit in fixture signature

- **Invariant**: Gateway logs must be captured and available for test debugging
  - **Where enforced**: `tests/support/fixtures.ts:468-470` — Gateway process streams attached to log collector immediately after startup
  - **Failure mode**: Gateway errors invisible during test failures, hindering debugging
  - **Protection**: Streams attached before readiness check completes; auto-fixture attaches logs to every test; log collector buffers lines for late-attaching tests
  - **Evidence**: Lines 468-470 attach streams; lines 114-127 define auto-fixture; `tests/support/process/backend-logs.ts:77-95` implement buffering

- **Invariant**: Services must be disposed in reverse startup order (frontend → gateway → backend)
  - **Where enforced**: `tests/support/fixtures.ts:557-577` — Disposal sequence explicitly ordered with frontend first, gateway second, backend third
  - **Failure mode**: Backend shutdown while gateway still running could cause gateway errors; frontend shutdown while proxying could cause connection errors
  - **Protection**: Sequential disposal with error handling per service; finally block ensures disposal even on test failure
  - **Evidence**: Lines 557-577 show reverse-order disposal with try/catch per service

## 9) Questions / Needs-Info

No unresolved questions. The implementation is complete and clear.

## 10) Risks & Mitigations (top 3)

- **Risk**: Gateway startup time could significantly increase test suite execution time
  - **Mitigation**: Monitor test run duration before/after integration; optimize gateway startup script if needed; consider parallel health checks (not feasible due to callback URL dependency, but could optimize gateway internal initialization)
  - **Evidence**: Plan section 15 acknowledges 2-5 second startup overhead per worker; timeout set to 30 seconds (`tests/support/process/servers.ts:12`)

- **Risk**: Gateway `/readyz` endpoint may not fully validate callback connectivity, causing late failures
  - **Mitigation**: Rely on existing test coverage to surface callback issues; gateway logs attached to test results will show callback failures; improve gateway readiness check if tests reveal insufficient validation
  - **Evidence**: Adversarial sweep attack #5; plan section 8 documents "Backend Unreachable During Gateway Startup" scenario (lines 573-582)

- **Risk**: Fallback URL in Vite proxy config (`http://localhost:3001`) may mask configuration errors during development
  - **Mitigation**: Gateway startup failure will cause test worker initialization to fail with clear error; development usage outside tests follows standard port conventions; consider adding warning if `SSE_GATEWAY_URL` undefined during Vite startup (similar to backend proxy status plugin)
  - **Evidence**: `vite.config.ts:87` defines fallback; `tests/support/fixtures.ts:453-509` ensures environment variable set for tests; `vite.config.ts:43-84` show backend proxy status plugin pattern that could be extended to gateway

## 11) Confidence

**Confidence: High** — Implementation follows established patterns precisely, TypeScript strict mode passes, external services mode removal is complete, sequential startup coordination is correct, and all plan requirements are met. The code demonstrates excellent understanding of the existing service management architecture and extends it cleanly to include the SSE gateway.
