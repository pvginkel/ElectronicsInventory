# Goals & non-goals

* **Goals**

  * Reliable **Playwright** suite (Chromium, headless by default) that drives the real frontend **against the real backend**.
  * Make **Claude Code** effective via **structured, machine-readable visibility** (console/events), not pixels.
  * Cover one feature end-to-end now: **Types** (CRUD + delete blocked when reverse deps exist), with both **“specific” near-unit flows** and **E2E flows** implemented in Playwright.
  * Allow fast iteration: re-runnable on **dirty DB**; optional full reset for end-to-end runs.
* **Non-goals**

  * No separate React unit test suite.
  * No reliance on screenshots/videos for LLM decision-making (humans may inspect artifacts).
  * CI specifics, merge gates, and Types field rules are out of scope here.

# LLM-first visibility (no images)

**Test mode switch**

* Add `TEST_MODE=true` (frontend) and use existing `FLASK_ENV=testing` (backend). Production disables all test instrumentation.

**Backend log streaming**

* SSE endpoint `/api/testing/logs/stream` provides real-time backend application logs
* Structured JSON format with timestamp, level, logger, message, correlation_id
* Critical for LLM observability - allows Playwright and Claude to see backend errors, database queries, service operations
* Streams logs from connection time onward (no historical buffer)
* Only available in testing mode

**Structured console events**

* Frontend emits **one-line JSON** prefixed with `TEST_EVT:`; also mirrors to `window.__TEST_SIGNALS__` (in test mode).
* Minimal, stable event “kinds” the LLM can assert on:

  * `route` (from→to), `form` (id, phase: open|submit|success|error), `api` (name, method, status, correlationId, durationMs), `toast` (level, code, message), `error` (scope, code, message, correlationId), `query_error` (tanstack key, status), `sse` (streamId, phase: open|event|heartbeat|close).
* **Policy:** any `console.error` = **test failure** unless explicitly silenced in a test.

**Hooks to instrument**

* Centralized toast/error layer logs `toast` + `error`.
* TanStack Query `onError` logs `query_error` (include queryKey, HTTP status, normalized message).
* Router logs `route` on navigation.
* Forms & mutations log `form` at open, submit, success, error.
* API client logs `api` with `correlationId` (from `X-Request-Id` if present or locally generated).
* SSE client logs `sse` heartbeats every 30s; tests use **longer awaits** only when a stream is explicitly part of the flow.

# Selector strategy & accessibility

* Adopt **`data-testid="..."`** attributes as primary selectors; stable names per feature, e.g.:

  * `types.page`, `types.list.table`, `types.list.row`, `types.form.name`, `types.form.submit`, `toast.error`, `toast.info`.
* Do not rely on text/role selectors for core flows.
* **Prerequisite**: Components must be refactored to accept data-* attributes and forward refs (see component refactoring guide).

# Data & environment strategy

**Testing endpoints**

* Backend exposes **only in testing mode** (FLASK_ENV=testing):

  * `GET /api/health/readyz` → existing endpoint enhanced to check database connectivity and migration status
  * `POST /api/testing/reset?seed=true|false` → drops/recreates schema and optionally loads the predefined dev dataset
  * `GET /api/testing/logs/stream` → SSE stream of backend application logs for test observability
* No localhost/IP gating; **environment flag is the only guard**

**Dirty DB re-runs**

* Tests **never clean up**. All test-created entities use a `prefix-<shortId>` scheme (e.g., `type-e48af0`) to avoid collisions.
* Suite supports two setups:

  1. **Clean run**: call `reset?seed=true|false`, then run E2E scripts.
  2. **Dirty run**: skip reset, rely on randomized names; specific tests and E2E both must tolerate preexisting data.

# Orchestration & config

**Playwright config (policy)**

* **Chromium only**, headless by default, **retries disabled**, **expect timeout 10s** (global cap).
* Allow **one exception bucket**: named fixtures with a **higher timeout only for SSE-dependent steps** (never blanket increases).
* Base URLs are required inputs; scripts are **optional**:

  * `FRONTEND_URL`, `BACKEND_URL`
  * Optional `APP_START_SCRIPT` / `APP_STOP_SCRIPT` (single script; accepts `start|stop`).
  * Optional `WEB_START_SCRIPT` / `WEB_STOP_SCRIPT` (single script; accepts `start|stop`).

**Runner lifecycle**

1. If start scripts provided, Playwright runs them (scripts daemonize and exit immediately)
2. Playwright polls for readiness:
   * `GET /api/health/readyz` (backend)
   * Frontend HTTP 200 on root
3. If "clean run" requested, call `POST /api/testing/reset?...`
4. Execute tests
5. If provided, call stop scripts

**Artifacts**

* Keep screenshots/videos/traces for humans. LLM ignores them; it relies on console events and assertions only.

# Test layout & coverage model

**Foldering**

* `tests/e2e/` for full flows.
* `tests/e2e/specific/` for narrow “near-unit” flows (fast checks of single UI concerns).
* `tests/support/` for fixtures, selectors, and helpers (e.g., `emit`, `awaitEvent(kind, filter, timeout)`).

**Two kinds of Playwright tests**

* **Specific tests** (near-unit with a real browser & backend):

  * Examples (generic patterns, not Types-specific rules): validation behavior, inline error surfaces, blocked delete shows error toast+event, list refresh after mutation, pagination guardrails.
* **Integration/E2E scripts**:

  * Happy path: open Types page → create → list reflects new type → rename → list reflects change → delete attempt → **blocked** when reverse deps exist (assert on `toast`/`error` + domain message) → create again with randomized name.

# Error handling policy (what the LLM asserts)

* Failing signals:

  * Any `console.error`.
  * Any `TEST_EVT:error` or `TEST_EVT:query_error` unless tests explicitly expect them.
* Passing signals:

  * Expected sequence of `route`, `form`, `api` (2xx), and `toast` (level `info`|`success`) within **≤10s** per step (SSE steps may use a named 30–35s await only when applicable).
* Tests prefer **console events** over parsing UI toasts; toasts remain visible for humans.

# “Types” pilot coverage (in scope, details deferred)

* **Happy path**: list → create randomized name → visible in list → rename → visible renamed → delete attempt → if reverse deps exist, **fail with clear error** (assert on `TEST_EVT:toast/error` + `api` 4xx/409 if applicable).
* **Edge patterns** (domain specifics left to your later analysis): duplicate name handling, whitespace normalization, too-long names, invalid characters, transient server/network error path (shows normalized error).
* This pilot sets the **selector naming**, **event taxonomy**, and **data randomization** patterns used by future features.

# LLM usage playbook

> Maintained contributor guidance now lives in `docs/contribute/testing/playwright_developer_guide.md` and related pages. Use the summary below for historical context when updating the epics.

Add sections to your **AGENTS-frontend.md** and **AGENTS-backend.md**:

**AGENTS-frontend.md → “UI Testing (Playwright) — How Claude should work”**

1. **Run locally**

   * Ensure `FRONTEND_URL` and `BACKEND_URL` are set; optionally set `WEB_START_SCRIPT`/`APP_START_SCRIPT` and matching `*_STOP_SCRIPT`s.
   * If start scripts exist: run them (they daemonize and exit), then poll `GET /api/health/readyz`.
   * For clean runs, call `POST /api/testing/reset?seed=true` before tests.
2. **Add a new test**

   * Prefer `data-testid` selectors; add them if missing.
   * Use randomized names with `prefix-<shortId>`.
   * Do **not** clean up.
3. **Interpret signals**

   * Read `console` for `TEST_EVT:` lines; treat any `console.error`/`TEST_EVT:error` as failure unless the test expects it.
   * Connect to `/api/testing/logs/stream` to monitor backend logs during test execution.
   * Correlate frontend events with backend logs using correlation IDs.
   * Prefer asserting on `api` + `toast` + `form` event sequences rather than DOM text.
4. **Debug with backend logs**

   * When tests fail, examine backend log stream for root causes.
   * Match correlation IDs between frontend TEST_EVT and backend logs.
   * Backend logs show SQL queries, service operations, error stack traces.
5. **Extend instrumentation**

   * Use `emitTestEvt(kind, payload)` utility (provided by the app in test mode).
   * Never emit in production builds (utility is a no-op outside test mode).
6. **Timeouts**

   * Default 10s per assertion; only use the provided **SSE-aware helper** for streams (up to \~35s).

**AGENTS-backend.md → "Test reset endpoints & IDs"**

1. Endpoints only in **testing** mode (FLASK_ENV=testing):

   * `GET /api/health/readyz` (enhanced with DB/migration checks)
   * `POST /api/testing/reset?seed=true|false`
   * `GET /api/testing/logs/stream` (SSE stream of backend logs)
2. **No auth**, environment flag gates availability.
3. **X-Request-Id** handled by Flask-Log-Request-ID package; the frontend propagates/echoes it in `TEST_EVT:api`.
4. Log streaming provides structured JSON with correlation IDs for debugging.
5. Seeding data is allowed but tests must be robust to extra data.

# Acceptance criteria

* Running `pnpm playwright test` (with `FRONTEND_URL`/`BACKEND_URL` set) executes:

  * At least one **specific** test and one **E2E** test for **Types**, both **fully headless**, both passing solely via **console events** + selectors.
* Frontend in test mode **emits** the agreed `TEST_EVT` taxonomy; production build does not.
* Backend exposes `reset` endpoint **only** in testing mode; `readyz` enhanced with DB/migration checks.
* No retries, global expect timeout **10s**, SSE steps use named longer await only when needed.
* Deleting a Type with reverse deps is **blocked** and verifiably surfaced to the test via `TEST_EVT`.

# Risks & mitigations

* **Flakiness from async UI:** Mitigate with event-sequence assertions (e.g., wait for `api:success` then `form:success`).
* **SSE heartbeat (30s):** Scope longer awaits to SSE-related steps only; never relax global defaults.
* **Selector drift:** Lock on `data-testid`; mandate adding selectors in UI changes.
* **Over-logging:** Keep payloads compact; log IDs/status/codes, not full bodies.

# Rollout steps (high-level)

1. **Instrumentation** (frontend): add test mode flag + `emitTestEvt`, wire to toasts, TanStack Query errors, router, forms, API, SSE.
2. **Backend reset/health** endpoints behind env flag.
3. **Component refactoring**: Update UI components to accept data-* attributes, forward refs, and improve accessibility.
4. **Selector pass** on Types screens/components with data-testid attributes.
5. **Playwright skeleton**: config (no retries, 10s), fixtures (URLs, optional scripts), helpers (awaitEvent, id suffix).
6. **Pilot tests**: one specific + one E2E for Types (including blocked delete with clear surfacing).
7. **Docs**: add AGENTS sections above.
