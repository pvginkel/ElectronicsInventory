# SSE Gateway Integration — Change Brief

## Context

The backend's Server-Sent Events (SSE) implementation in Python was causing thread pool issues. To resolve this, a new standalone SSE Gateway service was created in the `../ssegateway` directory. This gateway handles SSE connections and forwards events via callbacks to the backend.

## Required Changes

### 1. Remove External Services Mode
The `PLAYWRIGHT_MANAGED_SERVICES=false` code path is no longer needed. All tests should use the per-worker isolation model where each worker gets its own backend, frontend, and database instances. Remove:
- External services logic from `tests/support/fixtures.ts`
- `webServer` configuration from `playwright.config.ts`
- Related external services handling in `tests/support/global-setup.ts`

### 2. Integrate SSE Gateway into Per-Worker Test Infrastructure
Add the SSE Gateway as a third managed service alongside backend and frontend:
- Create a `startSSEGateway()` function in `tests/support/process/servers.ts` similar to `startBackend()` and `startFrontend()`
- Use dynamic port allocation via `getPort()` to avoid conflicts
- Start sequence: Backend → SSE Gateway → Frontend
- Gateway startup requires the backend URL for the callback endpoint (`/api/sse/callback`)
- Frontend startup needs the gateway URL passed as `SSE_GATEWAY_URL` environment variable

### 3. Add Vite Proxy Configuration
Configure Vite to proxy `/sse/*` requests to the SSE Gateway:
- Add proxy configuration in `vite.config.ts` for both `server.proxy` and `preview.proxy`
- Proxy should rewrite `/sse/...` to `/...` on the gateway
- Target should use `process.env.SSE_GATEWAY_URL` with fallback to `http://localhost:3001`

### 4. Make Gateway Root Configurable
The path to the SSE Gateway repository should be configurable:
- Add `SSE_GATEWAY_ROOT` environment variable support
- Default to `../ssegateway` relative to frontend repository root
- Use this path to locate `scripts/run-gateway.sh`

### 5. Log Collection
SSE Gateway logs should be captured and attached to test results:
- Create gateway log collector similar to backend/frontend
- Support `PLAYWRIGHT_GATEWAY_LOG_STREAM` environment variable for debugging
- Attach logs to test results on failure

## Technical Details

**Gateway Startup Script**: `<SSE_GATEWAY_ROOT>/scripts/run-gateway.sh`

**Required Arguments**:
- `--port <port>` — Dynamically allocated port number
- `--callback-url <url>` — Backend callback URL (e.g., `http://localhost:5100/api/sse/callback`)

**Readiness Check**: The gateway should be polled for readiness. Check with backend developer if a health endpoint exists, or implement port connectivity check.

**Environment Variables**:
- `SSE_GATEWAY_ROOT` — Path to gateway repository (default: `../ssegateway`)
- `SSE_GATEWAY_URL` — Gateway base URL (set automatically by test infrastructure)
- `PLAYWRIGHT_GATEWAY_LOG_STREAM` — Stream gateway logs to console (default: false)

## Success Criteria

1. External services mode is completely removed
2. Each Playwright worker starts its own isolated gateway instance
3. Gateway logs are captured and attached to test results
4. Vite correctly proxies `/sse/*` requests to the gateway
5. All existing Playwright tests pass without modification
6. Gateway process is properly cleaned up after tests complete
