# Playwright Per Worker Backend Plan

## Brief Description
Configure the Playwright suite so every worker boots its own Electronics Inventory backend against the in-memory SQLite database that CI already relies on, and pair it with a worker-scoped frontend proxy. This keeps fixtures aligned with the “real backend” policy while guaranteeing isolation between workers for both app layers.

## Relevant Files and Functions
- `playwright.config.ts` — drop the backend from `webServer`, leave a fallback when managed services are disabled, and ensure the worker-scoped fixtures can feed per-worker frontend origins into Playwright by overriding `baseURL`.
- `tests/support/fixtures.ts` — replace the current `backendUrl` fixture with a worker-scoped `playwrightBackend` fixture that starts/stops services and publishes the per-worker URLs; add a matching `playwrightFrontend` fixture that launches Vite, threads the worker backend URL via env, and exposes the per-worker frontend origin (while overriding `baseURL` for relative navigation).
- `tests/support/backend-url.ts` — update helpers so they defer to the worker fixture instead of the global `BACKEND_URL`.
- `tests/support/global-setup.ts` — only run health checks when `PLAYWRIGHT_MANAGED_SERVICES=false`; otherwise defer readiness to the worker fixtures.
- `tests/support/process/backend-server.ts` (new) — Node helper that shells out to `../backend/scripts/testing-server.sh --port=<port> --sqlite-db=<worker-db-path>`, waits on `/api/health/readyz`, and exposes teardown hooks. Each worker copies a pre-seeded SQLite database prepared during global setup.
- `tests/support/process/frontend-server.ts` (new) — helper that launches `pnpm dev --port=<frontendPort>` with `BACKEND_URL=<worker-backend-url>` and `VITE_TEST_MODE=true`, then waits for `/` to become ready before publishing teardown hooks.
- `tests/support/process/backend-logs.ts` (new) — utility that subscribes to backend `stdout`/`stderr`, tags each line with `workerIndex`, and exposes hooks so test-scoped fixtures can attach logs to `testInfo`.
- `package.json` — add the streaming dependency (`split2`) used by the backend log helper and include `get-port` to supply random port allocation.
- `tests/support/api/test-data.ts` (if needed) — ensure higher-level factories call the worker URL to stay backend-driven.
- `../backend/scripts/testing-server.sh` (optional) — document-only touch; no direct code change required if we call Flask directly, but note that we must leave it untouched for non-Playwright flows.

## Plan
### Phase 1 – Worker Backend Orchestration
1. Build `tests/support/process/backend-server.ts` that acquires a random available TCP port (via `get-port` or equivalent) per worker, exports `startBackend(workerIndex, { sqliteDbPath })` returning `{ url, dispose, stdout, stderr }`, and spawns `../backend/scripts/testing-server.sh --port=<port> --sqlite-db=<worker-db-path>`.
2. Arrange for global setup to call `../backend/scripts/initialize-sqlite-database.sh --db <seed> --load-test-data` once per run, then copy the resulting file for each worker before launching the backend. After the script reports ready, confirm `/api/health/readyz` responds 200 using the assigned port.
3. Emit structured logs (including the exact script invocation, worker index, and port) to ease debugging, following `docs/contribute/testing/playwright_developer_guide.md` guidance on deterministic setup.

### Phase 2 – Worker Frontend Proxy
1. Mirror the backend helper with `tests/support/process/frontend-server.ts` that acquires a random frontend port per worker (distinct from the backend port), launches `pnpm dev --port=<frontendPort>` with env `BACKEND_URL=<worker-backend-url>` and `VITE_TEST_MODE=true`, and waits for `GET /` to return 200.
2. Publish the per-worker frontend URL alongside teardown hooks so fixtures can close the Vite process when the worker finishes. Tag stdout/stderr with the worker index for troubleshooting.
3. Update `playwright.config.ts` so `PLAYWRIGHT_MANAGED_SERVICES` is the single source of truth: when the flag is anything other than `'false'`, disable the existing `webServer` array and let the worker fixture launch both services per worker; when it is `'false'`, skip the worker-managed startup entirely and expect contributors to point `FRONTEND_URL`/`BACKEND_URL` at externally managed servers.

### Phase 3 – Fixture Integration, Logging, & Cleanup
1. Extend `tests/support/fixtures.ts` to register a worker fixture (using `test.extend<{ frontendUrl: string; backendUrl: string; disposeServices: () => Promise<void>; backendLogs: BackendLogCapture; }>`). On `provide`, start both worker-scoped services, set `process.env.FRONTEND_URL`/`BACKEND_URL` to the worker origins, call `test.use({ baseURL: frontendUrl })`, wire `apiClient` and `testData` to the worker backend URL, and ensure `finally` tears both processes down.
2. Use `tests/support/process/backend-logs.ts` inside the worker fixture to buffer backend `stdout`/`stderr`, expose a test-scoped `backendLogs` fixture that writes per-spec attachments via `testInfo.attach('backend.log', { path: testInfo.outputPath('backend.log') })`, and optionally streams to `process.stdout` only when `PLAYWRIGHT_BACKEND_LOG_STREAM=true`.
3. Remove the legacy `getBackendUrl()` dependency by threading the worker URL into helpers that need it (e.g., `createApiClient`, toast helpers). Update browser-page helpers that rely on relative navigation to continue working through the overridden `baseURL`.
4. Update `tests/support/global-setup.ts` so it skips backend/frontend liveness probes when `PLAYWRIGHT_MANAGED_SERVICES !== 'false'` because worker fixtures now own the lifecycle.

### Phase 4 – Playwright Configuration & Docs Touchpoints
1. Refresh `docs/contribute/testing/playwright_developer_guide.md` (and linked testing docs) to document the per-worker backend lifecycle, call out the `PLAYWRIGHT_MANAGED_SERVICES` toggle, and reiterate the instrumentation expectations (`useListLoadingInstrumentation`, `trackForm*`, no `page.route`).
2. Verify that existing `tests/support/api` factories read `process.env.BACKEND_URL` or accept the injected `backendUrl`; adjust signatures if they assume a global.

## Step-by-Step Guidance / Algorithms
- **Worker backend startup:** (a) acquire `backendPort = await getPort()` (seeded with a preferred range if desired), (b) copy the seeded SQLite file to a worker-specific temp path, (c) spawn `../backend/scripts/testing-server.sh --port ${backendPort} --sqlite-db ${workerDbPath}`, (d) pipe `stdout`/`stderr` through the logging helper, (e) poll `/api/health/readyz` until it responds 200, (f) resolve the fixture with `http://127.0.0.1:${backendPort}` and register teardown that kills the process and removes the temp DB.
- **Worker frontend startup:** (a) acquire `frontendPort = await getPort({ exclude: [backendPort] })`, (b) spawn `pnpm dev --port ${frontendPort}` with env `BACKEND_URL=<backendUrl>` and `VITE_TEST_MODE=true`, (c) wait for `GET /` to return 200, (d) expose `http://127.0.0.1:${frontendPort}` as `frontendUrl` and feed it into `test.use({ baseURL })`.
- **Logging capture:** (a) wire `spawnedProcess.stdout`/`stderr` through `split2`, (b) tag lines with `[worker-${workerIndex}]`, (c) append them to a worker buffer and to an optional live stream, (d) in the test-scoped fixture, open `fs.createWriteStream(testInfo.outputPath('backend.log'))`, subscribe to worker events when the test starts, (e) close the stream and call `testInfo.attach` during teardown.
- **Cleanup:** On worker teardown, first close the frontend (to avoid new proxy traffic) and then terminate the backend. Confirm both processes exit to prevent orphaned servers between retries.

## Playwright Coverage
1. **Worker isolation smoke (`tests/e2e/parallel/worker-isolation.spec.ts`)** — `test.describe.parallel` that spawns two tests creating unique entities via the UI, asserts via instrumentation (`useListLoadingInstrumentation` events) that each worker only sees its own records, and hits `backendUrl`-scoped helpers to confirm backend state while attaching per-test backend logs.
2. **Seed bootstrap verification (`tests/e2e/setup/reset.spec.ts`)** — validate that every freshly spawned worker sees the expected seeded inventory by navigating through the UI, waiting on the documented loading instrumentation, and asserting known seed records exist without invoking manual reset helpers; confirm backend logs capture the startup load-test-data run.
3. **Health and instrumentation guard (`tests/smoke.spec.ts`)** — extend the existing smoke test to confirm that the worker-provided backend URL is emitted in the test event bridge so Playwright consumers don’t fall back to the global `getBackendUrl()` helper, assert the log attachment exists for traceability, and verify the frontend URL aligned with `baseURL` matches the worker-launched server.

Tests stay backend-driven because they interact with the running Flask server, wait on `ListLoading`/`Form` instrumentation, and never intercept network calls, consistent with `docs/contribute/testing/index.md`.

## Blocking Issues
- None identified; ensure `poetry` dependencies remain pre-installed in the CI container so the worker-spawned backend can launch without extra tooling.
