# SSE Gateway Integration — Plan Review

## 1) Summary & Decision

**Readiness**

This plan delivers a systematic approach to integrating the SSE Gateway service into the Playwright test infrastructure. The research is thorough, file mappings are precise with line-number evidence, and the sequential startup flow is well-documented. The plan correctly identifies all affected areas (fixtures, servers, logs, Vite config, global setup) and provides detailed invariants for derived state. However, the plan contains several critical gaps: it assumes the gateway readiness check mechanism without verifying it exists, proposes removal of external services mode without confirming no dependencies exist, uses an incorrect callback URL path, lacks explicit handling of the SSE_GATEWAY_URL environment variable in Vite config, and provides no concrete test validation strategy despite claiming "all existing tests pass unchanged."

**Decision**

`GO-WITH-CONDITIONS` — The plan is structurally sound and follows established patterns, but must address: (1) verification of gateway health endpoint availability or explicit fallback to port check, (2) confirmation that external services mode has no active users or CI dependencies, (3) correction of callback URL construction (should be `/api/sse/callback`, not `/API/sse/callback`), (4) explicit addition of `SSE_GATEWAY_URL` environment variable reading in Vite config, and (5) a concrete validation approach beyond "run full suite" (at minimum, identify 2-3 representative SSE-dependent specs to validate during implementation).

## 2) Conformance & Fit (with evidence)

**Conformance to refs**

- `docs/commands/plan_feature.md` (template requirements) — Pass — `plan.md:0-1119` — Plan includes all required sections (0-16), uses prescribed templates, quotes evidence with file:line references, documents derived state with invariants, and provides deterministic test scenarios. Section ordering matches template exactly.

- `docs/contribute/architecture/application_overview.md` (architecture alignment) — Pass — `plan.md:94-169` — Plan correctly identifies test infrastructure patterns (service management, log collection, fixtures) and avoids frontend application code changes. No TanStack Query, React components, or domain hooks are modified, keeping the change isolated to test infrastructure layer.

- `docs/contribute/testing/playwright_developer_guide.md` (real backend policy) — Pass — `plan.md:86-90,942-943` — Plan explicitly assumes "Frontend already handles SSE connections via `/sse/*` routes" and "All existing Playwright tests will pass without modification." The gateway integrates as a proxy service without intercepting requests, honoring the real-backend-always principle.

- `docs/contribute/testing/playwright_developer_guide.md` (managed services pattern) — Pass — `plan.md:9-42,295-309` — Research log documents study of `startBackend()` and `startFrontend()` patterns in `tests/support/process/servers.ts`. Implementation follows identical spawn-readiness-dispose lifecycle.

- `CLAUDE.md` (sandbox environment) — Pass — `plan.md:84-85,831-840` — Plan acknowledges Docker mount at `/work/ssegateway` and uses `SSE_GATEWAY_ROOT` with this default. Security section (lines 831-840) addresses repository access concerns appropriately for sandboxed environment.

**Fit with codebase**

- `tests/support/process/servers.ts` — `plan.md:95-111` — Alignment confirmed. Plan extends `ServiceLabel` union (line 110) and adds `startSSEGateway()` following exact pattern of `startBackend()` (lines 25-74) and `startFrontend()` (lines 76-108). Port allocation, readiness polling, and disposal logic map 1:1 to existing service functions.

- `tests/support/fixtures.ts` (`_serviceManager`) — `plan.md:115-125,450-487` — Sequential startup pattern matches existing backend→frontend flow (lines 453-487 in fixtures.ts). Plan correctly identifies insertion point between backend and frontend with proper error handling and cleanup chain.

- `tests/support/process/backend-logs.ts` — `plan.md:127-134` — Log collector factory pattern (`createGatewayLogCollector()`) matches existing `createBackendLogCollector()` (lines 27-36) and `createFrontendLogCollector()` (lines 39-48). Auto-fixture attachment follows lines 99-121 pattern.

- `vite.config.ts` — `plan.md:137-152` — Proxy configuration correctly mirrors existing `/api` proxy pattern (lines 105-111 server mode, 119-125 preview mode). Path rewrite strategy (strip `/sse` prefix) matches documented requirement.

- `playwright.config.ts` — `plan.md:139-140` — External services `webServer` configuration removal (lines 29-44) is straightforward deletion. Plan correctly notes this only applies when `PLAYWRIGHT_MANAGED_SERVICES` is not false.

- `tests/support/global-setup.ts` — `plan.md:155-159` — Removal of external services health check (lines 10-72) keeps seed database initialization (lines 77+). Clean separation of concerns.

## 3) Open Questions & Ambiguities

**Critical (block implementation until resolved):**

- Question: Does the SSE Gateway expose a health endpoint (e.g., `/health`, `/ready`, `/api/health/readyz`)?
- Why it matters: The plan documents readiness polling at `plan.md:276-283,709-716` but does not specify the actual endpoint or confirm it exists. Without this, the implementation cannot construct the correct `readinessPath` for `startService()` call. Port connectivity checks are mentioned as a fallback but not as the primary strategy.
- Needed answer: Inspect gateway source code at `../ssegateway` or coordinate with backend developer to confirm: (a) exact health endpoint path if it exists, or (b) explicit decision to use TCP port connectivity check as readiness signal. Update plan section 4 (API / Integration Surface, lines 276-283) with concrete answer.

**Major (can proceed with documented assumptions but increases risk):**

- Question: Are there any active users or CI pipelines that depend on `PLAYWRIGHT_MANAGED_SERVICES=false` external services mode?
- Why it matters: Plan proposes complete removal (Slice 2, lines 1018-1025) of external services code paths in fixtures (lines 386-423), playwright.config.ts (lines 29-44), and global-setup (lines 10-72). If CI or developers rely on this mode, removal breaks their workflows without migration path.
- Needed answer: Search CI configuration files, documentation, and team communication channels for `PLAYWRIGHT_MANAGED_SERVICES=false` usage. If found, either: (a) migrate those users to per-worker mode first, (b) add deprecation warnings instead of immediate removal, or (c) justify removal with evidence that mode is unused.

- Question: What environment variables (beyond `--port` and `--callback-url`) does the gateway startup script require or accept?
- Why it matters: Plan documents gateway invocation at `plan.md:209-218` with only two arguments. If gateway needs additional config (e.g., log level, timeout settings, worker ID), startup will fail or run with wrong configuration.
- Needed answer: Inspect `../ssegateway/scripts/run-gateway.sh` and gateway source to enumerate all environment variables and CLI arguments. Document in plan section 3 (Data Model / Contracts) and update environment variable section if additional vars must be set.

**Minor (clarifications that improve implementation quality):**

- Question: Should `PLAYWRIGHT_MANAGED_SERVICES=false` be silently ignored (with warning) or throw an error when set?
- Why it matters: User experience when environment variable is still present after external mode removal. Plan mentions this at lines 1100-1102 with decision to "throw error" but doesn't specify where or how.
- Needed answer: Decision already documented (throw error), but implementation location should be specified. Recommend: check in global-setup.ts before attempting managed services initialization, throw clear error explaining removal and pointing to migration docs.

- Question: What is the typical gateway startup time in test environment?
- Why it matters: Plan uses 30-second timeout (by analogy to backend) but doesn't validate this is sufficient. If gateway consistently takes 20+ seconds, timeout may cause flaky failures.
- Needed answer: Measure during Slice 6 validation. If startup exceeds 15 seconds, either optimize gateway script or increase timeout constant with justification comment.

## 4) Deterministic Playwright Coverage (new/changed behavior only)

**Behavior: Gateway integration into worker fixture**

- Scenarios:
  - Given clean worker state, When first test runs, Then backend starts → gateway starts with backend callback URL → frontend starts with gateway URL, And all three services become ready within timeout (`tests/support/fixtures.ts:453-506`)
  - Given gateway script missing at expected path, When worker initializes, Then spawn fails with ENOENT including expected script path in error message (manual verification via intentional misconfiguration)
  - Given gateway process exits during startup, When readiness polling runs, Then worker initialization fails with exit code/signal in error, And backend is disposed, And frontend never starts (manual verification via script that exits immediately)
- Instrumentation: Log collector buffers contain lifecycle messages showing startup order; `ServiceManager` object exposes `gatewayUrl` property; test-event `worker.services.ready` includes gateway URL (requires adding `gatewayUrl` to event payload at `tests/support/fixtures.ts:147-156`)
- Backend hooks: Gateway health endpoint (or port connectivity) for readiness check; backend `/api/sse/callback` endpoint must accept gateway callbacks
- Gaps: No automated infrastructure test suite exists. Validation is manual via "run full suite and check logs." Plan should identify 2-3 specific SSE-dependent specs (e.g., AI analysis over SSE, deployment version stream) to validate during Slice 6.
- Evidence: `plan.md:871-899,992-1006`

**Behavior: Gateway log collection and attachment**

- Scenarios:
  - Given gateway is running, When test executes, Then `gateway.log` file attached to test result with stdout/stderr lines (verify in HTML report after any test)
  - Given `PLAYWRIGHT_GATEWAY_LOG_STREAM=true`, When test runs, Then gateway logs stream to console tagged with `[worker-X sse-gateway][stdout/stderr]` (manual verification with environment variable set)
  - Given gateway crashes mid-test, When test completes, Then crash output captured in log attachment (manual verification via intentional gateway crash)
- Instrumentation: Log files tagged with worker index and service label; attachment name is `gateway.log` (following `backend.log` pattern)
- Backend hooks: None (log collection is frontend test infrastructure concern)
- Gaps: No explicit test of log attachment; validated implicitly by running any test and inspecting HTML report attachments.
- Evidence: `plan.md:900-919`

**Behavior: Vite proxy forwarding to gateway**

- Scenarios:
  - Given frontend running with Vite dev server, When frontend code connects to `/sse/stream/<id>`, Then Vite proxy strips `/sse` prefix, And request forwarded to gateway at `/stream/<id>`, And SSE events stream back to frontend (`tests/e2e/<sse-feature>/*.spec.ts` — existing SSE tests)
  - Given `SSE_GATEWAY_URL` not set in environment, When frontend starts, Then Vite proxy falls back to `http://localhost:3001`, And connection likely fails (manual verification by omitting environment variable)
- Instrumentation: Browser network tab shows proxied requests; gateway logs show incoming connections; existing SSE-dependent tests assert on received events
- Backend hooks: Gateway must accept connections at non-prefixed paths; backend callback endpoint functional
- Gaps: No explicit test of proxy rewrite logic; validated implicitly by existing SSE tests passing. Plan claims "existing SSE tests" exist (line 942) but does not name specific files. Should identify at least one spec by path.
- Evidence: `plan.md:920-942`

**Behavior: External services mode removal**

- Scenarios:
  - Given `PLAYWRIGHT_MANAGED_SERVICES=false` in environment, When tests run, Then error thrown explaining external mode removed with migration guidance (`tests/support/global-setup.ts` or fixtures.ts check)
  - Given no `PLAYWRIGHT_MANAGED_SERVICES` set (default), When tests run, Then per-worker managed services used as expected (implicit validation via all tests passing)
- Instrumentation: Global setup logs mode announcement (already exists at line 14); error message for removed mode should reference docs
- Backend hooks: None
- Gaps: No automated test of removed mode error. Validation is manual by setting `PLAYWRIGHT_MANAGED_SERVICES=false` and confirming clear error.
- Evidence: `plan.md:971-990`

**Behavior: All existing SSE-dependent tests pass**

- Scenarios:
  - Given all implementation slices complete, When existing Playwright suite runs, Then all tests pass without modification, And SSE event delivery works correctly (full suite run)
- Instrumentation: Playwright HTML report shows no new failures; SSE-dependent tests (unspecified in plan) receive events correctly
- Backend hooks: Gateway proxies SSE events from backend; backend callback endpoint invoked by gateway
- Gaps: **Major gap** — Plan does not identify which existing tests depend on SSE functionality or how to validate gateway integration works. "Run full suite" is not deterministic validation. Should name 2-3 representative specs (e.g., "AI analysis part creation via SSE" or "deployment version stream reconnection") and document expected behavior.
- Evidence: `plan.md:992-1006`

## 5) Adversarial Sweep (must find ≥3 credible issues or declare why none exist)

### Major — Incorrect Callback URL Path Construction

**Evidence:** `plan.md:321` — "Construct callback URL: `${backendUrl}/API/sse/callback`"

**Why it matters:** The callback URL path uses uppercase `/API/` but the backend endpoint is conventionally lowercase `/api/` in this codebase (confirmed by Vite proxy config at `vite.config.ts:106` and backend health check at `tests/support/process/servers.ts:8` using `/api/health/readyz`). Mismatched path casing will cause gateway callbacks to return 404, breaking SSE event delivery. Tests will pass superficially (gateway starts, frontend loads) but SSE functionality will silently fail.

**Fix suggestion:** Change line 321 from `${backendUrl}/API/sse/callback` to `${backendUrl}/api/sse/callback` (lowercase `api`). Update corresponding references in sections 3 (Data Model, line 217), 4 (API Surface, line 291), and 5 (Algorithms, line 321). Add validation step in Slice 6 to confirm gateway callback endpoint returns 2xx response (inspect gateway logs for successful callback registration).

**Confidence:** High — Clear typo with direct functional impact; casing mismatch is certain to cause 404 errors given typical backend routing behavior.

### Major — Missing SSE_GATEWAY_URL in Vite Config Environment Variables

**Evidence:** `plan.md:151-152,236-247` — Plan states "Read `SSE_GATEWAY_URL` environment variable for proxy target with fallback" and shows proxy config reading `process.env.SSE_GATEWAY_URL`, but `vite.config.ts:86` currently only defines `backendProxyTarget` reading `BACKEND_URL`. The plan does not explicitly add a `gatewayProxyTarget` variable declaration in Slice 4.

**Why it matters:** Without explicitly reading and using `SSE_GATEWAY_URL` in the Vite config, the proxy target will default to the hardcoded fallback (likely `http://localhost:3001`). In per-worker test mode, each worker's gateway runs on a random port (e.g., 54321), so the fallback will point to the wrong port. The frontend will connect to a non-existent gateway, causing all SSE requests to fail with connection refused errors. Tests that depend on SSE events will timeout or fail.

**Fix suggestion:** In Slice 4 (Vite Proxy Configuration), add explicit step: "After line 86 in `vite.config.ts`, add `const gatewayProxyTarget = process.env.SSE_GATEWAY_URL || 'http://localhost:3001'`." Then reference `gatewayProxyTarget` in both `server.proxy['/sse']` and `preview.proxy['/sse']` configurations. Update plan section 2 (Affected Areas, lines 151-152) to explicitly call out this new variable declaration. Add to section 3 (Data Model, lines 236-247) under "Vite Proxy Configuration" shape.

**Confidence:** High — Required environment variable reading is missing from file modification plan; without it, per-worker port isolation breaks.

### Major — No Concrete SSE Test Validation Strategy

**Evidence:** `plan.md:992-1006,1050-1054` — Slice 6 (Validation) states "Run full Playwright suite and verify all tests pass" with dependency "Slices 1-5 complete." Section 13 (test plan) at lines 992-1006 claims "Given all implementation changes complete, When existing Playwright test suite runs, Then all tests pass without modification, And SSE-dependent tests receive events correctly" but does not identify any specific SSE-dependent test files or describe how to validate the gateway is actually proxying events.

**Why it matters:** Gateway integration could be completely broken (e.g., proxy path rewrite incorrect, callback URL wrong, gateway crashes on first connection) while 95% of the test suite still passes if only 5% of tests exercise SSE functionality. The plan provides no way to distinguish "tests pass because they don't use SSE" from "tests pass because SSE works." A developer implementing this plan will run the full suite, see green, and ship broken SSE integration.

**Fix suggestion:** Update Slice 6 (lines 1050-1054) to include explicit validation steps:
1. Identify 2-3 specific SSE-dependent test files by grepping for SSE connection patterns or consulting team (e.g., `tests/e2e/parts/ai-analysis-sse.spec.ts` if it exists, or deployment version stream tests).
2. Run those specs in isolation first with gateway log streaming enabled (`PLAYWRIGHT_GATEWAY_LOG_STREAM=true`).
3. Confirm in gateway logs: (a) callback registration succeeded, (b) SSE connections opened, (c) events delivered.
4. Then run full suite as sanity check.

Add to section 13 (lines 992-1006): "Representative SSE specs: [list file paths]. Expected gateway log evidence: callback POST to backend returns 200, SSE connection established log line, event delivery log lines matching test assertions."

**Confidence:** High — Validation gap is explicit (no test file names, no success criteria beyond "pass"); this is a testability gap, not a speculation.

### Minor — Gateway Readiness Check Strategy Undefined

**Evidence:** `plan.md:276-283` — "Gateway Readiness Check" section says "HTTP GET to gateway health endpoint (or port connectivity check)" with note "Change brief line 49 suggests coordinating with backend developer on health endpoint availability." However, section 5 (Algorithms, lines 337-356) shows `startSSEGateway()` implementation calling "Poll for readiness (health check or port connectivity)" without specifying which strategy is used or how to decide.

**Why it matters:** If implementation proceeds without confirming health endpoint exists, developer will either (a) guess a wrong endpoint path (e.g., `/health` when gateway uses `/ready`), causing 30-second timeout on every worker startup, or (b) implement port check fallback that succeeds too early (port open but gateway not fully initialized), leading to flaky test failures when frontend connects before gateway is ready.

**Fix suggestion:** Already captured in Open Questions (section 3) as critical blocker. Reiterate here: before Slice 1 implementation, inspect gateway source or coordinate with backend team to confirm exact readiness signal. Update plan section 4 (lines 276-283) with concrete answer, and add explicit health endpoint path constant to implementation (e.g., `const GATEWAY_READY_PATH = '/health'` at top of servers.ts, or `const GATEWAY_READY_PATH = null` with comment "Use port check" if no health endpoint exists).

**Confidence:** Medium — This is a known unknown documented in the plan (lines 1096-1098), but it's listed under "Open Questions" rather than flagged as implementation blocker. Severity is Minor only because fallback exists; real risk is flaky timeouts, not complete failure.

### Minor — ServiceManager Type Extension Missing Gateway URL

**Evidence:** `plan.md:253-261` — Section 3 (Data Model) documents "ServiceManager Extension" adding `gatewayUrl` and `gatewayLogs` fields. However, `tests/support/fixtures.ts:47-54` defines current `ServiceManager` type, and plan section 2 (Affected Areas, line 116) says "Add `gatewayUrl` and `gatewayLogs` properties to ServiceManager type" without specifying the exact TypeScript change.

**Why it matters:** If type definition is not updated, TypeScript compiler will error when `gatewayUrl` is assigned at `tests/support/fixtures.ts:546-553` (where `serviceManager` object is constructed). Developer must infer the type change from the plan's data model section rather than having explicit file modification instruction.

**Fix suggestion:** In section 2 (Affected Areas, lines 115-117), clarify: "Update `ServiceManager` type definition at `tests/support/fixtures.ts:47-54` to add `gatewayUrl: string` and `gatewayLogs: GatewayLogCollector` fields." In section 14 (Slice 3), add explicit step: "1. Update ServiceManager type definition. 2. Add gateway startup logic. 3. Add gateway log fixture."

**Confidence:** Low — This is likely obvious to implementing developer, but plan template emphasizes "exhaustive" file changes. Missing type update is a gap.

## 6) Derived-Value & State Invariants (table)

### Gateway Callback URL

- Derived value: `callbackUrl`
- Source dataset: Backend base URL from `startBackend()` return value (unfiltered, single source of truth)
- Write / cleanup triggered: Passed as CLI argument to gateway script; no writes, value is immutable after construction
- Guards: Backend URL must be valid HTTP URL; path construction must use lowercase `/api/` (see Adversarial finding #1)
- Invariant: Callback URL must remain stable during gateway lifetime. Backend must be reachable at callback URL when gateway attempts registration. Callback URL must use correct casing (lowercase `/api/`) to match backend routing.
- Evidence: `plan.md:395-401`

### SSE_GATEWAY_URL Environment Variable

- Derived value: `SSE_GATEWAY_URL` in `process.env`
- Source dataset: Gateway URL from `startSSEGateway()` return value (unfiltered, single source of truth)
- Write / cleanup triggered: Set on `process.env` after gateway readiness confirmed (line 325 in plan section 5); read by Vite config at frontend server start time; restored to previous value during fixture cleanup (line 559-560 in fixtures.ts)
- Guards: Must be set before `startFrontend()` spawns process (sequential dependency). Vite config must read this variable and fall back gracefully if missing (see Adversarial finding #2). Worker scope ensures per-worker isolation (no cross-contamination).
- Invariant: Environment variable must be available when frontend Vite server evaluates config (top-level import time). Proxy target locked at server start; cannot change dynamically per request. Cleanup must restore previous value to prevent worker pollution.
- Evidence: `plan.md:403-411`

### Gateway Log Streaming Decision

- Derived value: `streamLogs` boolean passed to `startSSEGateway()`
- Source dataset: `PLAYWRIGHT_GATEWAY_LOG_STREAM` environment variable string (unfiltered, read from parent process environment)
- Write / cleanup triggered: Passed to `startService()` helper which conditionally calls `streamProcessOutput()`; no writes, read-only flag
- Guards: Only exact string `'true'` enables streaming (strict equality check). Any other value (including undefined, 'false', '1', 'TRUE') disables streaming.
- Invariant: Streaming decision must be consistent with backend and frontend services for coherent debugging experience (all three services stream or all three silent). Decision made once at worker startup, immutable during worker lifetime.
- Evidence: `plan.md:412-419`

### Port Exclusion Chain

- Derived value: `excludePorts` array passed to `getPort()` for each service
- Source dataset: Accumulated ports from previously started services (unfiltered, built sequentially)
- Write / cleanup triggered: Backend port → passed to gateway `getPort()` call; backend + gateway ports → passed to frontend `getPort()` call; no persistence beyond worker scope
- Guards: Must include all previously allocated ports to avoid conflicts within single worker. `getPort()` library guarantees returned port not in exclusion list.
- Invariant: Sequential exclusion prevents port collisions within worker. Backend port excluded from gateway allocation. Backend + gateway ports excluded from frontend allocation. Exclusion chain order matters (backend → gateway → frontend). Worker isolation prevents cross-worker collisions (different workers can reuse same ports safely).
- Evidence: `plan.md:421-428`

### Gateway Root Path Resolution

- Derived value: `gatewayRoot` absolute path
- Source dataset: `SSE_GATEWAY_ROOT` environment variable OR default `../ssegateway` relative to frontend root (filtered: if env var set, use it; else use default)
- Write / cleanup triggered: Read once during `startSSEGateway()` function invocation; used to construct script path; no writes, immutable after read
- Guards: Must resolve to absolute path pointing to existing directory. Script must exist at `${gatewayRoot}/scripts/run-gateway.sh`. No validation at read time (fails lazily during spawn with ENOENT if wrong).
- Invariant: Gateway root must remain stable during test run; cannot change between workers or tests (shared environment variable). Docker mount at `/work/ssegateway` ensures path exists in sandboxed environment. Security concern: malicious `SSE_GATEWAY_ROOT` could point to attacker-controlled directory, but acceptable for test environment where environment variables are trusted.
- Evidence: `plan.md:430-437`

### Service Manager Complete State

- Derived value: Fully-initialized `ServiceManager` object
- Source dataset: Combination of backend handle, gateway handle, frontend handle, and log collectors (unfiltered, all sources required)
- Write / cleanup triggered: Created after all three services ready (Promise.all resolution); provided to test fixtures via `use(serviceManager)`; disposed during fixture cleanup via `disposeServices()`
- Guards: All three service handles must be defined (null check at line 508-514 in fixtures.ts). All URLs must be reachable (validated by readiness checks). Dispose must happen in reverse order (frontend → gateway → backend) to respect dependency chain.
- Invariant: ServiceManager represents complete, ready-to-test environment; partial initialization is invalid and must trigger cleanup. If any service fails to start, already-started services must be disposed before error propagates. Disposed flag prevents double-disposal (line 525-530 in fixtures.ts). Worker scope ensures each worker has isolated ServiceManager.
- Evidence: `plan.md:439-446`

## 7) Risks & Mitigations (top 3)

### Risk: Gateway startup adds 2-5 seconds per worker, slowing test suite

- Mitigation: Keep gateway startup timeout at 30 seconds (same as backend). Measure actual startup time during Slice 6 validation. If consistently under 5 seconds, no action needed. If 5-15 seconds, document as expected overhead. If over 15 seconds, investigate gateway script optimization (e.g., lazy initialization, reduce dependency loading) or consider increasing worker startup timeout in fixture scope (currently 120 seconds at `tests/support/fixtures.ts:565`, sufficient for three sequential services).
- Evidence: `plan.md:1060-1065` — Risk documented in plan; mitigation is monitoring and optimization rather than architectural change.

### Risk: External services mode removal breaks undocumented CI pipelines or developer workflows

- Mitigation: Before implementing Slice 2 (external services removal), search for `PLAYWRIGHT_MANAGED_SERVICES=false` in CI configuration files (`.github/workflows/*`, `.llmbox/*`, CI docs), developer documentation (`docs/contribute/*`), and team communication channels. If usage found, either: (a) migrate those users to per-worker mode with updated documentation, (b) add deprecation warnings in current release and remove in next release, or (c) justify removal with evidence that mode is unused (e.g., commit history shows mode was experimental and never adopted). Add clear error message in global-setup.ts explaining removal and pointing to migration guide if mode is detected.
- Evidence: `plan.md:1087-1093` — Risk documented; Open Questions section 3 (lines 1100-1102) includes decision to throw error, but mitigation lacks search step to confirm no active users.

### Risk: Vite proxy path rewriting fails for SSE protocol, causing connection drops

- Mitigation: Follow existing `/api` proxy pattern exactly (`vite.config.ts:105-111`), which already works for long-lived connections. SSE uses standard HTTP chunked transfer encoding, fully supported by Vite's http-proxy-middleware. Test proxy manually during Slice 4 implementation: start services, open browser dev tools network tab, initiate SSE connection to `/sse/stream/test`, confirm: (a) request appears in network tab as "EventStream" type, (b) connection stays open (pending status), (c) events arrive and display in EventStream viewer. If proxy breaks SSE, root cause is likely path rewrite error (stripping `/sse` incorrectly) or CORS misconfiguration; both are observable in browser console and fixable via proxy options (`changeOrigin: true` already specified).
- Evidence: `plan.md:1080-1085` — Risk documented; mitigation is "follow existing pattern" but should add explicit manual validation step during Slice 4.

## 8) Confidence

Confidence: Medium — The plan demonstrates strong pattern-following and comprehensive documentation of derived state, but contains critical unverified assumptions (gateway health endpoint availability, callback URL casing error, missing Vite config variable) and lacks concrete validation strategy for SSE functionality. Resolving the three Major findings from section 5 and confirming the Critical open question (gateway readiness check) would elevate confidence to High. The implementation path is clear once these gaps are addressed.
