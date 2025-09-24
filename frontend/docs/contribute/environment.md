# Environment Reference

This document captures the environment variables, port conventions, and configuration files used by the frontend during development and automated testing. Keep it close at hand when wiring up local services or debugging CI runs.

## Core Variables

| Variable | Default | Description |
| --- | --- | --- |
| `FRONTEND_URL` | `http://localhost:3100` (tests) / Vite default `http://localhost:3000` (dev) | Base URL the Playwright suite points to. Managed automatically when using `scripts/testing-server.sh`. |
| `BACKEND_URL` | `http://localhost:5100` | Backend base URL for Playwright fixtures and API factories. |
| `VITE_TEST_MODE` | `false` | Toggles frontend test instrumentation and test-event emission. Set to `true` automatically when running `scripts/testing-server.sh`. |
| `PLAYWRIGHT_MANAGED_SERVICES` | `true` | When not explicitly set to `false`, Playwright starts the frontend/backend via `scripts/testing-server.sh`. Set to `false` when you manage servers manually. |
| `APP_START_SCRIPT` / `APP_STOP_SCRIPT` | unset | Optional hook executed by Playwright before/after tests. Accepts `start` and `stop` args. |
| `WEB_START_SCRIPT` / `WEB_STOP_SCRIPT` | unset | Alternate hook for frontend orchestration. |

## Environment Files

- `.env` – consumed by Vite during local development. Use this for runtime values like API base URLs or feature flags that mirror production behavior.
- `.env.test` – automatically loaded by `playwright.config.ts` via `dotenv`. Use this to override Playwright-specific values such as `FRONTEND_URL`, `BACKEND_URL`, or toggling `PLAYWRIGHT_MANAGED_SERVICES`.

> `.env.test` is ignored by git; commit durable defaults to documentation and keep machine-specific overrides local.

## Ports & Managed Services

- **Frontend (test mode)**: `scripts/testing-server.sh` starts Vite on port **3100** with `VITE_TEST_MODE=true`.
- **Backend (test mode)**: `../backend/scripts/testing-server.sh` starts the Flask API on port **5100** with `FLASK_ENV=testing`.
- Playwright waits for both services to report healthy before running tests. See [CI & Execution](./testing/ci_and_execution.md) for health check details.

If you prefer to launch services manually, export `PLAYWRIGHT_MANAGED_SERVICES=false` and ensure the URLs above respond before invoking `pnpm playwright test`.

## Test Mode Responsibilities

When `VITE_TEST_MODE=true` the frontend:
- Enables emitters in `src/lib/test/*` to publish test-event payloads through the Playwright bridge.
- Registers the Playwright bridge (`window.__playwright_emitTestEvent`) for deterministic event capture.
- Ensures console policies treat unexpected errors as test failures.

Production builds automatically strip these hooks; keep instrumentation behind `isTestMode()` checks when adding new emitters. See [Test Instrumentation](./architecture/test_instrumentation.md) for details.

## Backend Collaboration

The Playwright suite assumes the backend exposes:
- `GET /api/health/readyz` – readiness probe used by managed services.
- `POST /api/testing/reset` – optional reset endpoint for clean runs (not yet automated).
- `GET /api/testing/logs/stream` – SSE stream available when `FLASK_ENV=testing`.

Coordinate with backend contributors to keep these endpoints aligned with documented behavior.
