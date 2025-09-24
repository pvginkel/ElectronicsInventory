# Code Review — Phase 1 Core Test Infrastructure

## Summary
The staged Phase 1 implementation introduces helpful scaffolding (factories, fixtures, helpers), but I spotted two high-priority gaps that block the intent of the plan. Both need to be addressed before we can rely on the new helpers.

## Findings

### 1. TEST_EVT capture never observes real emissions (High)
- **File**: `tests/support/helpers/test-events.ts`
- **Details**: The helper hooks `window.dispatchEvent` and waits for `CustomEvent('TEST_EVT')`, yet the app instrumentation (`src/lib/test/event-emitter.ts`) emits events by logging `console.log('TEST_EVT: …')` and pushing into `window.__TEST_SIGNALS__`. No code dispatches that custom event, so `TestEventCapture.getEvents()` always returns an empty array, making the new assertions fail. We should instead tap into the existing console prefix or `__TEST_SIGNALS__` buffer.

### 2. SSE deployment simulation bypasses the actual EventSource channel (High)
- **File**: `tests/support/helpers/sse-mock.ts`
- **Details**: Helpers such as `simulateDeploymentUpdate` emit `mock-sse-event`/`deployment-update` custom events and tweak storage, but our UI (`src/hooks/use-version-sse.ts`) listens to `/api/utils/version/stream` via `EventSource` for `event: 'version'` payloads. The mock never feeds those events through the intercepted SSE route, so tests won’t observe a version change or banner. The mock should stream the formatted SSE message (with the expected event name) through the routed response to reach the `EventSource` listener.

## Recommendation
Resolve the two high-severity issues above and re-run the Phase 1 verification checklist (TypeScript + Playwright smoke) once addressed.
