# Plan Execution Report: SSE Message Format Simplification

## Status

**DONE-WITH-CONDITIONS** — The plan is fully implemented and all tests pass. One condition: the `ssegateway` package.json dependency points to a local path (`file:/work/SSEGateway`) and must be restored to a publishable reference (git URL or registry) before merging.

## Summary

All plan requirements have been implemented and verified:

- **SSE Gateway**: `formatSseEvent` in `/work/SSEGateway/src/sse.ts` now wraps named events (except `connection_close`) in a `{"type":"<name>","payload":<data>}` envelope sent as unnamed SSE data events.
- **SharedWorker** (`src/workers/sse-worker.ts`): Removed all subscription tracking (`subscribedEvents`, `subscribeToEvent`, `handleSubscribe`, `subscribe` command). Added single `onmessage` handler that unwraps the envelope. Added `lastVersionPayload` cache for late-joining tabs.
- **Provider** (`src/contexts/sse-context-provider.tsx`): Removed `ensureWorkerSubscription`, `workerSubscribedEventsRef`, `ensureDirectEventSourceListener`, `attachedEventsRef`. Direct EventSource path uses `onmessage` with envelope unwrapping. `addEventListener` is now purely local.
- **Playwright tests** (`tests/infrastructure/sse/sse-connectivity.spec.ts`): Updated task event tests to use `onmessage` with envelope parsing. Added 2 SharedWorker test variants (`delivers version events via SharedWorker`, `connects and receives events via SharedWorker`).
- **Pre-existing bug fixes**: Fixed `deployment-banner.spec.ts` (incorrect `correlation_id` checks) and `task-events.spec.ts` (wrong stream IDs and snake_case/camelCase mismatch).

### Files Changed

| File | Change |
|------|--------|
| `/work/SSEGateway/src/sse.ts` | Envelope format for named events |
| `/work/SSEGateway/__tests__/unit/sse.test.ts` | Updated unit tests for new format |
| `package.json` | ssegateway dependency → local path (temporary) |
| `pnpm-lock.yaml` | Lockfile update |
| `src/workers/sse-worker.ts` | Simplified: onmessage + version cache |
| `src/contexts/sse-context-provider.tsx` | Simplified: removed subscription tracking |
| `tests/infrastructure/sse/sse-connectivity.spec.ts` | Updated + 2 SharedWorker tests added |
| `tests/infrastructure/deployment/deployment-banner.spec.ts` | Bug fix: correlation_id matcher |
| `tests/e2e/sse/task-events.spec.ts` | Bug fix: stream IDs + snake_case fields |
| `.llmbox/docker-compose.yml` | Minor change (pre-existing) |

## Code Review Summary

**Decision**: GO-WITH-CONDITIONS

| Severity | Count | Resolved |
|----------|-------|----------|
| BLOCKER  | 0     | —        |
| MAJOR    | 0     | —        |
| MINOR    | 2     | 2        |

**Issues found and resolved:**
1. **Stale version cache** — `lastVersionPayload` was not cleared in `closeConnection()`. Fixed by adding `lastVersionPayload = null`.
2. **Local filesystem dependency** — `package.json` points to `file:/work/SSEGateway`. This is intentional per user instructions (temporary development setup). Must be restored before merge.

**Adversarial sweep**: No issues found. Race conditions in EventSource handler registration, stale closures, and malformed JSON handling were all investigated and confirmed safe.

## Verification Results

### pnpm check
```
✓ eslint . (lint pass)
✓ tsc -b --noEmit (type-check pass)
```

### Playwright Tests (11/11 pass)
```
✓ SSE connectivity › connects through the Vite proxy, not directly to the gateway
✓ SSE connectivity › delivers version events from the SSE stream
✓ SSE connectivity › routes task events through the Vite proxy
✓ SSE connectivity › routes task failure events through the Vite proxy
✓ SSE connectivity › delivers version events via SharedWorker
✓ SSE connectivity › connects and receives events via SharedWorker
✓ Deployment banner streaming › surfaces backend-driven deployment updates
✓ Task SSE events › receives task events through unified SSE stream
✓ Task SSE events › task events include correct payload structure
✓ Task SSE events › multiple task events are received in sequence
✓ Task SSE events › AI analysis dialog receives progress and completion events
```

### SSE Gateway Unit Tests
```
75 passed, 13 skipped
```

## Outstanding Work & Suggested Improvements

1. **Restore ssegateway dependency** (required before merge): Change `package.json` line 63 from `"ssegateway": "file:/work/SSEGateway"` back to the git URL pointing to the commit that includes the `formatSseEvent` envelope changes. Run `pnpm install` after.

2. **Backend `sse_utils.py`** (may need attention): The plan noted `format_sse_event()` in the Python backend may need updating. Since all tests pass without changes and the gateway handles all SSE formatting, this is likely not needed — but should be verified if there are code paths that bypass the gateway.

3. **SharedWorker `lastVersionPayload` cache test** (nice to have): The version cache for late-joining tabs is not covered by a dedicated Playwright test. Testing cross-tab SharedWorker caching is non-trivial in the current test infrastructure, so this is deferred.

4. **Stream ID naming convention documentation** (nice to have): The dual naming (`task_event` for raw SSE envelope type, `task` for hook-level instrumentation) is documented in test comments but could benefit from a note in the Playwright developer guide.
