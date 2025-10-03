# Playwright Deployment Sse Opt In

## Brief Description
Disable the automatic deployment SSE connection while the Playwright suite runs so `pnpm test -g "creates a new part and navigates to detail view"` no longer stalls on `waitForLoadState('networkidle')`, yet keep the streaming coverage by letting the deployment-specific specs establish and close the connection explicitly.

## Files / Modules In Scope
- `src/contexts/deployment-context.tsx` — adjust the auto-connect guard, expose manual SSE controls to Playwright during test runs, and keep the provider’s state in sync with fresh request ids.
- `src/lib/config/sse-request-id.ts` — keep id caching/reset logic but allow the provider to reacquire a new id on demand after Playwright clears it.
- `src/types/playwright-binding.d.ts` — add typings for the new `window.__deploymentSseControls` surface consumed by Playwright.
- `tests/support/helpers/deployment-sse.ts` (new) — helper that calls the bridge to opt into the stream, inspects status, and tears it down for individual specs.
- `tests/support/fixtures.ts` — expose a fixture (e.g., `deploymentSse`) that wires the helper into Playwright tests with automatic cleanup.
- `tests/e2e/deployment/deployment-banner.spec.ts` — use the fixture to connect, reset request ids, and disconnect when the streaming assertions finish.
- `docs/contribute/testing/playwright_developer_guide.md` — document the opt-in pattern so future streaming specs follow the same real-backend workflow.

## Technical Steps
1. **Gate automatic connections in the deployment context**
   - Derive `shouldAutoConnect = !isTestMode() && !import.meta.env.DEV` (or equivalent) so Playwright test mode no longer triggers `connectWithRequestId()` on mount or focus, while production builds keep existing behaviour.
   - Swap the memoised `deploymentRequestId` for state that calls `getDeploymentRequestId()` each time a connection is initiated so manual opt-ins observe freshly reset ids.
   - Ensure state updates (`isNewVersionAvailable`, `currentVersion`) still run when the stream is manually connected, and no regressions occur for non-test environments.

2. **Publish manual controls for Playwright**
   - Inside `DeploymentProvider`, detect test mode and register `window.__deploymentSseControls = { connect(requestId?), disconnect(), getStatus(), getRequestId() }`, capturing the provider’s `connectWithRequestId`, `disconnect`, live `isConnected`, and the latest request id state.
   - Make the bridge idempotent, refresh its request id snapshot just before each connect (calling `setDeploymentRequestId(getDeploymentRequestId())`), and remove it during unmount so parallel tests do not leak stale references.
   - Keep bridge registration scoped to the provider (instead of `sse-request-id.ts`) so it holds the correct callbacks without exporting provider internals.

3. **Type the new bridge**
   - Augment `src/types/playwright-binding.d.ts` so TypeScript recognises `window.__deploymentSseControls` with the correct method signatures, mirroring the helper API (including `getStatus()` returning `{ isConnected: boolean; requestId: string | null }` and `getRequestId(): string | null`).

4. **Author Playwright helper + fixture**
   - Add `tests/support/helpers/deployment-sse.ts` that validates the bridge is present, wraps `connect`/`disconnect`, and exposes utilities such as `ensureConnected()` and `getRequestId()` for specs (delegating to the bridge’s `getStatus`/`getRequestId`).
   - Update `tests/support/fixtures.ts` to provide a fixture (e.g., `{ deploymentSse }`) that instantiates the helper per test, disconnects in `finally`, and reuses `resetDeploymentRequestId(page)` when needed.

5. **Refactor streaming specs to opt in explicitly**
   - Update `tests/e2e/deployment/deployment-banner.spec.ts` so the existing scenario stays intact: call the fixture before waiting for SSE events, reset the request id, use the fixture’s `connect()` (which re-reads the fresh id) before the assertions, and disconnect at the end.
   - Confirm no other specs rely on the previous auto-connect; add a short guidepost comment noting that the deployment banner coverage manually opts in while its assertions remain unchanged.

6. **Document and validate**
   - Update `docs/contribute/testing/playwright_developer_guide.md` with a subsection covering deployment streaming: reference the new helper, emphasise the real-backend flow, and call out the no-mock policy.
   - Re-run `pnpm test -g "creates a new part and navigates to detail view"` (should now pass) and `pnpm test -g "Deployment banner streaming"` to verify the opt-in path, ensuring the fixture reports a new `requestId` after calling `resetDeploymentRequestId(page)`.

## Blocking Issues
- Streaming coverage remains backend-driven: the helper only exercises the live `/api/utils/version/stream` endpoint, and no `page.route` or SSE mocking is introduced.
