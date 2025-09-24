# Playwright Native Event Bridge – Technical Plan

## Brief Description
Replace the current app-to-Playwright communication mechanisms with a Playwright-native binding that provides direct, type-safe communication without relying on console parsing or global variables.

## Existing Communication Mechanisms
- **Legacy structured console logs (`TEST_EVT:`)** — `src/lib/test/event-emitter.ts` previously logged JSON payloads prefixed with `TEST_EVT:` when `isTestMode()` was true; Playwright helpers listened to `page.waitForEvent('console')` and parsed these strings. (To be replaced.)
- **In-page event buffer (`window.__TEST_SIGNALS__`)** — The same emitter pushes each payload into a global array so tests (and manual debugging) can poll them (`tests/support/helpers/test-events.ts`). Production build scripts assert the array is absent.
- **Expected-error registry (`window.__registerExpectedError`)** — `tests/support/fixtures.ts` exposes a function that lets tests mark console errors as "expected"; application code does not call into Playwright but relies on this glue for tolerating intentional errors.
- **Miscellaneous custom events (`window.dispatchEvent('deployment-update')`, `mock-sse-event`)** — Helpers in `tests/support/helpers/sse-mock.ts` and other utilities fire DOM events for test orchestration; these target the application, not Playwright, and remain outside the scope of replacing app→Playwright signalling.

## Files & Functions to Modify
- `src/lib/test/event-emitter.ts` — Update to use Playwright binding instead of window.__TEST_SIGNALS__.
- `src/lib/test/*` (router, form, toast, error, query instrumentation) — No changes needed, they already funnel through the central emitter.
- `tests/support/fixtures.ts` — Add Playwright binding registration and event buffer management.
- `tests/support/helpers.ts` — Update `waitTestEvent` to use fixture buffer instead of console parsing.
- `tests/support/helpers/test-events.ts` — Refactor `TestEventCapture` to use fixture buffer instead of window.__TEST_SIGNALS__.
- `scripts/verify-production-build.cjs` — Remove __TEST_SIGNALS__ check, add __playwright_emitTestEvent check.
- `docs/contribute/architecture/test_instrumentation.md` — Update to describe new Playwright-native flow.
- `docs/contribute/testing/playwright_developer_guide.md` — Update helper documentation to reflect new implementation.

## Playwright-Native Bridge Implementation
1. **Register Playwright binding in fixture**
   - In `tests/support/fixtures.ts`, add a testEvents fixture that calls `page.exposeBinding('__playwright_emitTestEvent')` before page navigation.
   - Maintain a 500-event circular buffer per test. When buffer overflows, silently drop oldest events.
   - If binding registration fails, fail the test suite immediately.

2. **Update emitter to use binding**
   - Modify `emitTestEvent` in `src/lib/test/event-emitter.ts` to check for `window.__playwright_emitTestEvent`.
   - When binding exists, invoke it with the event payload.
  - Remove all `window.__TEST_SIGNALS__` code.

3. **Refactor Playwright helpers**
   - Update `waitTestEvent` in `tests/support/helpers.ts` to query the fixture buffer instead of parsing console.
   - Refactor `TestEventCapture` class to read from fixture buffer instead of polling window.__TEST_SIGNALS__.
   - Update `emitTestEvent` helper function to use the binding for synthetic event injection.

4. **Update production safety checks**
   - Modify `scripts/verify-production-build.cjs` to check for `__playwright_emitTestEvent` instead of `__TEST_SIGNALS__`.
   - Ensure the binding invocation is tree-shaken in production builds.

5. **TypeScript type definitions**
   - Create `src/types/playwright-binding.d.ts` with conditional typing based on `import.meta.env.VITE_TEST_MODE`.
   - Declare global `__playwright_emitTestEvent` function type only in test mode.

## Algorithm for Event Flow
1. **Fixture initialization**:
   - Register `__playwright_emitTestEvent` binding that pushes events to a circular buffer (size: 500).
   - Track buffer cursor position and implement promise-based waiters for specific events.

2. **Event emission**:
   - App calls `emitTestEvent(payload)`.
   - Function checks for `window.__playwright_emitTestEvent` existence.
   - If present, calls binding with full event (including timestamp).

3. **Event consumption**:
   - `waitTestEvent` and `TestEventCapture` methods query fixture buffer.
   - Buffer provides synchronous access to recent events and async waiting for future events.
   - No more console parsing or DOM global polling.

## Error Handling
- **Binding registration failure**: Fixture setup will throw, failing the entire test suite.
- **Buffer overflow**: Silently drop oldest events when exceeding 500 events.
- **Missing binding in app**: No payload is emitted; tests relying on the bridge will fail, making the misconfiguration visible.

## Testing Strategy
1. **Unit tests for the bridge**:
   - Create `tests/unit/playwright-bridge.test.ts` to verify:
     - Binding registration and invocation
     - Circular buffer behavior (overflow, cursor management)
     - Event filtering and waiting logic

2. **Integration tests**:
   - Create `tests/e2e/test-infrastructure.spec.ts` to verify:
     - Events flow correctly from app to Playwright
     - All event types (route, form, api, toast, error, query, sse) work
     - Synthetic event injection via helper works
     - Buffer correctly handles high-frequency events

3. **Production build verification**:
   - Ensure `pnpm build && pnpm verify:production` confirms no binding code in production
   - Add specific test that production build doesn't contain `__playwright_emitTestEvent`

## Documentation Updates
- `docs/contribute/architecture/test_instrumentation.md` — Replace window.__TEST_SIGNALS__ references with Playwright binding explanation.
- `docs/contribute/testing/playwright_developer_guide.md` — Update waitTestEvent and TestEventCapture documentation.
- `docs/contribute/testing/factories_and_fixtures.md` — Document the new testEvents fixture behavior.
- Remove all references to window.__TEST_SIGNALS__ from documentation.
