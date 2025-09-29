# Playwright Deployment SSE Support

## Brief Description
Update the frontend so deployment notifications are exercised via real SSE streams keyed by application-supplied correlation IDs. This removes the need for `simulateDeploymentUpdate`/`simulateDeploymentSequence` mocks.

## Files / Modules In Scope
- `src/lib/api/sse.ts` (or wherever EventSource clients are instantiated)
- `src/hooks/use-deployment-banner.ts` (or equivalent) to ensure correlation ids are propagated
- `tests/support/helpers/sse-mock.ts` (deprecate deployment helpers, retain only AI-specific logic)
- Any Playwright specs that will eventually cover deployment notifications (TBD once backend support lands)

## Frontend Tasks
1. **Propagate correlation IDs on EventSource connections**
   - Update the application’s SSE client to include an `X-Request-Id` (or similar) header on every `EventSource` request. The value should be generated per session (e.g., UUID stored in local storage) so Playwright tests can configure a deterministic value via environment.

2. **Expose configuration for tests**
   - Allow the Playwright suite to set the correlation id (e.g., via `VITE_TEST_SSE_REQUEST_ID`). The app should use this value when present to make backend targeting deterministic during tests.

3. **Retire deployment mocks**
   - Remove `simulateDeploymentUpdate` / `simulateDeploymentSequence` from `sse-mock.ts`, or gate them behind the new lint rule so they are no longer used once backend support is ready.
   - Update any documentation to highlight the real-backend path for deployment notifications.

4. **Add coverage placeholder**
   - Prepare a stub spec (skipped test) illustrating how deployment banner coverage will look once the backend trigger endpoint is available. This ensures the flow is documented but not yet executed.

5. **Validation**
   - Smoke-test the app to confirm SSE connections still function and the header is present (verify via devtools or logging).
   - Coordinate with backend once their trigger endpoint exists to add the actual Playwright assertions.

## Backend Requirements (for coordination)
- Introduce a testing endpoint (e.g., `POST /api/testing/deployments/trigger`) that accepts the request id and deployment payload, emits deployment events over the matching SSE connection, and returns acknowledgement.
- Log/trace correlation ids so failures can be debugged easily during tests.
- Ensure the SSE endpoint honours the `X-Request-Id` header set by the frontend.
