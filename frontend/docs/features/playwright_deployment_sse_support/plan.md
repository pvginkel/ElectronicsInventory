# Playwright Deployment SSE Support

## Brief Description
Enable deployment-version notifications to run exclusively against the real backend by attaching deterministic correlation ids to SSE connections, wiring the deployment banner to use them, and removing the Playwright-only deployment stream mocks. Backend support (request_id-aware stream plus `POST /api/testing/deployments/version`) is live, so the plan now focuses on integrating with those services.

## Files / Modules In Scope
- `src/hooks/use-version-sse.ts` — origin of the deployment EventSource connection; needs request-id handling and query-string injection.
- `src/contexts/deployment-context.tsx` — manages lifecycle of the deployment stream; must seed/pass correlation ids and stay test-aware.
- `src/lib/config/test-mode.ts` + new helper `src/lib/config/sse-request-id.ts` — centralise id generation/persistence and expose a Playwright reset hook guarded by `isTestMode()`.
- `src/types/playwright-binding.d.ts` — extend the global `Window` shape with the reset bridge so TypeScript recognises it.
- `src/hooks/use-deployment-notification.ts` — surface the seeded request id alongside the existing deployment banner state.
- `tests/support/helpers/sse-mock.ts:465-520` — delete `simulateDeploymentUpdate` / `simulateDeploymentSequence` and guard any legacy exports with lint suppressions.
- `tests/support/helpers/test-events.ts` — wire assertions for the new deployment SSE test event stream.
- `tests/e2e/_fixtures/deployment-banner.spec.ts` (new file name placeholder) — future Playwright coverage skeleton capturing the backend-driven flow once available.
- `docs/contribute/testing/playwright_developer_guide.md` and `docs/features/playwright_test_coverage_extension/route_mocking_analysis.md` — document the new real-backend approach and cross-link the lint policy.

## Frontend Implementation Plan
1. **Correlation ID lifecycle helper**
   - Create `src/lib/config/sse-request-id.ts` exporting `getDeploymentRequestId()`.
   - On first call, guard for a browser runtime (`typeof window !== 'undefined'`) before reading `sessionStorage.getItem('deploymentSseRequestId')`; if absent, generate `crypto.randomUUID()` and persist it when storage exists so reconnects reuse a stable value.
   - Expose a `resetDeploymentRequestId()` utility that clears the cached id only when `isTestMode()` returns true. In test mode attach it to `window.__resetDeploymentRequestId` so Playwright can call it via `page.evaluate`, and add a helper (e.g. `tests/support/helpers/deployment-reset.ts`) that wraps that bridge.
   - Update `src/types/playwright-binding.d.ts` (or a nearby ambient declaration) to include the optional `__resetDeploymentRequestId` so the new bridge remains type-safe.

2. **Thread id through deployment provider**
   - Inside `DeploymentProvider` (`src/contexts/deployment-context.tsx`), call `getDeploymentRequestId()` during initialisation (e.g., `useMemo`) and hand the value to `useVersionSSE` via a new `connect(requestId)` signature.
   - Extend `DeploymentContextValue` (and its consumer hook `useDeploymentNotification`) to expose the seeded `deploymentRequestId`, keeping downstream usage typed.
   - Ensure the provider shares the request id through context so any future instrumentation (e.g., toast messages or Playwright hooks) can read it without re-computing, and make sure `checkForUpdates()` reuses that memoized id so reconnects preserve correlation.

3. **Update `useVersionSSE` connection**
   - Expand `useVersionSSE` to accept optional `requestId` and `extraParams` args when invoking `connect`.
   - Build the stream URL as `/api/utils/version/stream?${params.toString()}` with `params.set('request_id', requestId)` whenever provided, matching the backend contract.
   - Maintain existing retry/backoff logic; the only change is the URL construction.
   - Fail fast (throw or console.error + abort connect) when running outside `import.meta.env.DEV` and no request id is passed so missing wiring surfaces immediately; continue tolerating the omission in development to avoid breaking local exploration.

4. **Surface id for instrumentation and tests**
   - Emit a test event once the deployment SSE connects via the existing `emitTestEvent` helper (`src/lib/test/event-emitter.ts`) using the current taxonomy, for example `emitTestEvent({ kind: 'sse', streamId: 'deployment.version', phase: 'open', event: 'connected', data: { requestId, correlationId: requestId } })`, and guard it behind `isTestMode()` so Playwright can capture the id for backend triggers.
   - Update `tests/support/helpers/test-events.ts` to provide assertion helpers for the new `kind: 'sse'` event so the future spec can wait on it without bypassing the schema, and mention in the helper docs that backend events now echo `correlation_id` on every message for correlation consistency.

5. **Detach deployment mocks**
   - Remove `simulateDeploymentUpdate` and `simulateDeploymentSequence` definitions from `tests/support/helpers/sse-mock.ts` (`lines 465-520`). If other helpers reference them, replace calls with `throw new Error('Removed – use backend trigger')` so accidental usage fails loudly.
   - Add an inline comment near the remaining `SSEMocker` exports clarifying that AI analysis is the only permitted mock (per route-mocking analysis).

6. **Plan the Playwright spec scaffold**
   - Create `tests/e2e/deployment/deployment-banner.spec.ts` with a skipped test outlining the intended flow: reset/request the correlation id, wait for the `kind: 'sse'` event with `streamId: 'deployment.version'` and `phase: 'open'`, call the real trigger endpoint (`POST /api/testing/deployments/version`), assert banner visibility, and verify the SSE payload includes the echoed `correlation_id` from the backend event stream.
   - Capture/assert the trigger response payload (`{ requestId, delivered, status }`) so the spec reflects when the backend delivered immediately versus queued for a reconnect.
   - Document the prerequisites in a leading comment so it’s unskipped once frontend wiring lands; backend support is ready.

7. **Documentation touch points**
   - Update `docs/contribute/testing/playwright_developer_guide.md` to call out that deployment coverage relies on the `request_id` query param and the `POST /api/testing/deployments/version` trigger, replacing the old mock section and pointing to the `/api/testing/content/*` fixture family (PNG image helper, PDF stream, HTML, and HTML-with-banner) for deterministic assets.
   - Amend `docs/features/playwright_test_coverage_extension/route_mocking_analysis.md` to mark the deployment mock removal as “In progress/complete” and link back to this feature plan (highlight the backend’s `correlation_id` echo semantics).

8. **Validation steps**
   - Manually load the app in production build mode (`pnpm build && pnpm preview`) and verify via browser devtools network panel that the deployment SSE request includes `?request_id=` and uses a stable value across reconnects.
   - In Playwright test mode, assert the emitted `requestId` persists across reconnects, and exercise `window.__resetDeploymentRequestId` (via the helper) to confirm the next connection receives a fresh id that the backend echoes back as `correlation_id` on the SSE payloads.

## Backend Support (implemented)
- `GET /api/utils/version/stream` now accepts `request_id`, registers every subscription with the singleton `VersionService`, drains any queued events that accumulated while the client was offline, and emits `correlation_id` with each SSE payload (auto-generating a request id when none is supplied). The service tracks subscriber activity and evicts idle channels.
- `POST /api/testing/deployments/version` accepts `{ request_id, version, changelog? }`, returning `202` with `{ requestId, delivered, status }` to explain whether the payload was delivered immediately or queued for later. It enforces testing-mode guards and fans out through `VersionService` so reconnects receive pending events.
- Deterministic assets for Playwright now live under `/api/testing/content/image`, `/api/testing/content/pdf`, `/api/testing/content/html`, and `/api/testing/content/html-with-banner` (replacing the former `/api/testing/fake-image` helper). The image endpoint serves the bundled `testing-content-image.png`, the PDF stream returns `app/assets/fake-pdf.pdf`, and the HTML routes require a `title` query parameter; the banner variant wraps the standard frontend banner chrome.
- Telemetry already records the correlation id for observability, and backend queues ensure Playwright-triggered deployments can reconnect without losing updates.
