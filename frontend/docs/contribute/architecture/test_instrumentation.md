# Test Instrumentation

The frontend exposes deterministic telemetry while running in test mode (`VITE_TEST_MODE=true`). Instrumentation lives under `src/lib/test/` and emits structured console events prefixed with `TEST_EVT:`. Tests read these signals via Playwright helpers for precise assertions.

## Runtime Flow

1. `isTestMode()` (from `src/lib/config/test-mode.ts`) checks `import.meta.env.VITE_TEST_MODE === 'true'`.
2. When true, UI code calls helpers such as `trackFormSubmit` or `emitTestEvent`.
3. `src/lib/test/event-emitter.ts` prints `TEST_EVT: {...}` to `console.log` and pushes the payload to `window.__TEST_SIGNALS__` for debugging.
4. Playwright helpers (`waitTestEvent`, `expectConflictError`) parse these logs and return typed payloads.

## Event Taxonomy (`src/types/test-events.ts`)

| Kind | Payload fields |
| --- | --- |
| `route` | `from`, `to`, `params?` |
| `form` | `phase` (`open`\|`submit`\|`success`\|`error`\|`validation_error`), `formId`, `fields?`, `metadata?` |
| `api` | `operation`, `method`, `status`, `correlationId`, `durationMs` |
| `toast` | `level` (`success`\|`error`\|`warning`\|`info`), `code?`, `message` |
| `error` | `scope`, `code?`, `message`, `correlationId?` |
| `query_error` | `queryKey`, `status?`, `message`, `correlationId?`, `metadata?` |
| `sse` | `streamId`, `phase` (`open`\|`message`\|`error`\|`close`), `event`, `data?` |

All payloads include a `timestamp` (injected by the emitter).

## Instrumentation Modules

- **`event-emitter.ts`** – Core emitter that writes to console and `window.__TEST_SIGNALS__`.
- **`router-instrumentation.ts`** – Subscribes to TanStack Router transitions; emits `route` events.
- **`form-instrumentation.ts`** – Exposes `trackForm*` helpers and stable `generateFormId`.
- **`toast-instrumentation.ts`** – Hooks the toast provider to emit `toast` events.
- **`error-instrumentation.ts`** – Captures global error notifications and emits `error` events.
- **`query-instrumentation.ts`** – Wraps React Query to emit `query_error` events and tag conflicts (`metadata.isConflict = true`).
- **`api-instrumentation.ts`** – Optional integration for fetch wrappers to emit `api` metrics (operation, status, correlation ID).
- **`console-policy.ts`** – Enforces `console.error` -> throw during tests; Playwright’s fixture mirrors this policy to fail on unexpected errors.

## Adding New Emitters

1. Import `isTestMode()` to guard emissions.
2. Call the appropriate helper or `emitTestEvent` from `event-emitter.ts`.
3. Extend `TestEventKind` and union types in `src/types/test-events.ts` if introducing a new kind.
4. Update this document so contributors know how to consume the new signal.

Example for a custom stream:

```typescript
import { emitTestEvent } from '@/lib/test/event-emitter';
import { isTestMode } from '@/lib/config/test-mode';

function trackWizardStep(step: string) {
  if (!isTestMode()) return;
  emitTestEvent({
    kind: 'wizard',
    step,
  });
}
```

> Remember: production builds strip instrumentation dead code via `isTestMode()` guards. Keep new emitters behind the same check.

## Correlation IDs & Backend Logs

- The API client propagates `X-Request-Id` into `TEST_EVT:api.correlationId` when available.
- Backend SSE logging (`/api/testing/logs/stream`) includes the same ID, enabling cross-correlation.
- When diagnosing conflicts or errors, capture both the frontend event and backend log entry.

## Debugging with TEST_EVT

- In the browser console, run `window.__TEST_SIGNALS__` to inspect captured events during manual repro.
- Playwright helpers can filter by `kind`, `formId`, or `correlationId`.
- Tests should assert on event sequences sparingly—prefer UI assertions first, use TEST_EVT for invisible state (forms, toasts, background API behavior).

## Maintenance Checklist

- [ ] Keep `src/types/test-events.ts` synchronized with this doc.
- [ ] Document new emitters and helper functions when added.
- [ ] Ensure instrumentation modules short-circuit when `isTestMode()` is false.
- [ ] Update Playwright helpers if payload shapes evolve.

Related docs: [Error Handling & Validation](../testing/error_handling_and_validation.md), [Troubleshooting](../testing/troubleshooting.md).
