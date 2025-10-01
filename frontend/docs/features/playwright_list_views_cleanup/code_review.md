# Code Review

## Findings

- **High – `waitForUiState` can return stale events, hiding regressions**  \
  File: `tests/support/helpers.ts:45`  \
  Because `waitForUiState` delegates to `waitTestEvent`, it scans the shared event buffer for the first matching payload. The buffer keeps every event emitted since the test started, so repeated waits (for example after `page.reload()` in `tests/e2e/types/type-list.spec.ts`) will match an earlier `ui_state` emission instead of waiting for the fresh one triggered by the reload. That means the specs no longer prove that new loading/ready events fire—regressions in the new instrumentation (or mis-scoped helpers) could slip through while the tests still pass. Please update the helper to ignore events that were already consumed (e.g. by tracking the last seen cursor/timestamp per `(scope, phase)` or clearing the buffer between waits) so each call waits on a new emission.

## Confidence

Low – focused doc/code inspection without running the suite.
