# Vite `/api` Proxy Integration

## Brief Description

Implement a Vite development proxy that forwards `/api` traffic to the backend while removing the runtime dependency on `VITE_API_BASE_URL`. Review every usage of `VITE_API_BASE_URL` and `BACKEND_URL`, keeping only the ones required outside the browser, and update the UI code to rely on the proxied `/api` path without shortcutting `getApiBaseUrl()` to an empty string.

## Relevant Files & Modules

- `vite.config.ts` – add the `/api` proxy configuration (dev + preview) and surface dev-time defaults for the backend target.
- `scripts/testing-server.sh` – stop exporting `VITE_API_BASE_URL`, ensure the proxy target is available when Playwright launches the dev server.
- `src/lib/utils/api-config.ts` – remove the helper and eliminate `VITE_API_BASE_URL` usage in browser code.
- `src/lib/utils/thumbnail-urls.ts`, `src/hooks/use-document-upload.ts`, `src/hooks/use-url-preview.ts`, `src/hooks/use-version-sse.ts`, `src/hooks/use-ai-part-analysis.ts`, `src/components/parts/ai-document-grid-wrapper.tsx` – replace helper calls with `/api/...` paths.
- `scripts/generate-api.js` and generated `src/lib/api/generated/client.ts` – align the OpenAPI client with the proxied base path.
- Playwright helpers (`tests/api/client.ts`, `tests/support/fixtures.ts`, `tests/support/global-setup.ts`, `tests/e2e/**`) – review `BACKEND_URL` usage, centralize where it cannot be removed.
- Documentation (`docs/contribute/environment.md`, `.env.example`, any doc/examples mentioning `VITE_API_BASE_URL`) – describe the proxy workflow and updated environment expectations.

## Implementation Plan

### Phase 1 – Vite Proxy & Environment Wiring
- Extend `vite.config.ts` with matching `server.proxy['/api']` and `preview.proxy['/api']` entries so that requests hit the backend during local development and `pnpm preview`. Pull the proxy target from `process.env.BACKEND_URL` with a default of `http://localhost:5000`, and log guidance when the backend is unreachable.
- Update `scripts/testing-server.sh` to export `BACKEND_URL=http://localhost:5100` (if not already set) before `pnpm dev`, remove `VITE_API_BASE_URL`, and document the expectation so Playwright-managed runs automatically proxy to the test backend on port 5100.
- Verify `.env` guidance: if `.env` or `.env.example` currently define `VITE_API_BASE_URL`, replace it with optional `BACKEND_URL` notes or remove it entirely so new contributors follow the proxy path by default.

### Phase 2 – Runtime API URL Refactor
- Remove `getApiBaseUrl()` entirely and inline `/api/...` paths where needed. Delete the helper file once no imports remain.
- Update UI call sites (hooks, utilities, components) to use `/api/...` strings directly and prevent duplicated segments when concatenating paths.
- Ensure the document upload hook and other `fetch` calls no longer rely on environment-derived origins.

### Phase 3 – Generated Client Alignment
- Modify `scripts/generate-api.js` so the generated client uses `baseUrl: '/api'` instead of embedding `import.meta.env.VITE_API_BASE_URL`. Re-run the generator to update `src/lib/api/generated/client.ts` and confirm no stale env references remain.
- Audit any other generated outputs (hooks, type factories) to confirm they do not capture `VITE_API_BASE_URL` indirectly.

### Phase 4 – `BACKEND_URL` Usage Review
- Inspect each occurrence of `BACKEND_URL` in the test suite. Consolidate the logic into a shared helper (e.g., `tests/support/backend-url.ts`) so only one file reads the environment variable and exposes the default `http://localhost:5100`.
- Replace per-file `process.env.BACKEND_URL ?? ...` snippets with the shared helper. Document why the Playwright/node-side utilities still need a backend origin (they bypass the browser/proxy to seed data), satisfying the requirement to remove usages only where possible.

### Phase 5 – Documentation & Verification
- Refresh `docs/contribute/environment.md` (and any other references) to explain the `/api` proxy, note that UI code hard-codes `/api`, and document how Playwright/test tooling relies on `BACKEND_URL` to reach the backend directly.
- Note the proxy behavior in any onboarding or testing docs that previously walked contributors through setting `VITE_API_BASE_URL`.
- After refactors, run `pnpm type-check`, `pnpm lint`, and exercise smoke flows via both `pnpm dev` and `pnpm preview` to confirm the proxy works for regular fetches, SSE streams, and uploads.

## Considerations

- Validate download, preview, and SSE flows after the switch to `/api/...` paths to ensure reverse proxies route every request correctly.
- Coordinate with backend contributors if the default backend port (currently inconsistent between 5000 in code and 5100 in docs) needs to be standardized as part of this change.
- Once this proxy work lands, update `docs/features/playwright_deployment_sse_support/plan.md` so it no longer depends on `src/lib/utils/api-config.ts`, replaces `${baseUrl}` references with the proxied `/api` path strategy, and reflects the new proxy-aware SSE URL approach.
