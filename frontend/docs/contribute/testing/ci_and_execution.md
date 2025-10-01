# CI & Execution

This guide covers how Playwright runs locally and in CI, including managed services, environment variables, and execution policies.

## Running Locally

```bash
# Install browser dependencies once
pnpm exec playwright install

# Default run (headless)
pnpm playwright

# Focus on a single file
pnpm playwright tests/e2e/types/types-workflow.spec.ts

# Focus on a single test
pnpm playwright -g 'workflow with multiple types'

# Debug mode (headed inspector)
pnpm playwright --debug
```

Playwright is configured in `playwright.config.ts` with `headless: true` by default. Debug mode is the only supported headed execution.

## Managed Services

By default (`PLAYWRIGHT_MANAGED_SERVICES` not set to `false`), Playwright starts the frontend and backend for you:

- `./scripts/testing-server.sh` – Launches Vite on **3100** with `VITE_TEST_MODE=true`.
- `../backend/scripts/testing-server.sh` – Launches Flask backend on **5100** with `FLASK_ENV=testing`.

Health checks:
- Frontend: waits for HTTP 200 at the base URL (`FRONTEND_URL`).
- Backend: polls `GET /api/health/readyz`.

To manage servers manually (e.g., when debugging), export `PLAYWRIGHT_MANAGED_SERVICES=false` and ensure both ports respond before running the suite.

## Global Setup

`tests/support/global-setup.ts` runs before the suite:
- Loads `.env.test`.
- Validates required environment variables (`FRONTEND_URL`, `BACKEND_URL`).
- Opportunity to seed data or warm caches.

## Execution Policies

- **Browser**: Chromium only (`devices['Desktop Chrome']`).
- **Retries**: Disabled; tests must be deterministic.
- **Parallelism**: Fully parallel locally; CI limits to 1 worker for stability.
- **Timeouts**: Global `expect` timeout is 10s. Use the shared `sseTimeout` fixture for longer SSE waits (35s).
- **Artifacts**: Videos retained on failure, screenshots on failure, traces on first retry.

## Environment Overrides

Use `.env.test` or shell exports to tweak execution:

```bash
# Point to running services
export FRONTEND_URL=http://localhost:4173
export BACKEND_URL=http://localhost:8000
export PLAYWRIGHT_MANAGED_SERVICES=false
pnpm playwright
```

## CI Integration

- Suites run headless with managed services.
- Ensure backend repo is available (CI scripts expect `../backend/`).
- Artifacts (`test-results/`, `playwright-report/`) should be collected for debugging.
- Treat failing `console.error` output as blocking unless deliberately silenced via helpers.

## Debugging Tips

- Use `pnpm playwright --debug` to launch the inspector and step through tests.
- Use the `testEvents` fixture (e.g., `await testEvents.dumpEvents()`) to inspect emitted payloads when debugging locally.
- When managed services fail to start, run scripts manually to inspect output (`./scripts/testing-server.sh start`).

Related docs: [Environment Reference](../environment.md), [Playwright Developer Guide](./playwright_developer_guide.md), [Troubleshooting](./troubleshooting.md).
