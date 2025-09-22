# Backend — required changes

1. **Environment-gated test mode**

* Use existing `FLASK_ENV=testing` to control availability of testing endpoints.
* In production (FLASK_ENV != testing), test endpoints must not exist.

2. **Testing endpoints (real backend)**

* `GET /api/health/readyz` — enhance existing endpoint to return "ready" **only after** DB connection and migrations are complete (in addition to shutdown check).
* `POST /api/testing/reset?seed=true|false` — atomically drop/recreate schema and (optionally) load the predefined dev dataset. Returns a concise status payload (e.g., mode, seeded yes/no).
* `GET /api/testing/logs/stream` — SSE endpoint streaming backend application logs as structured JSON with correlation IDs. Critical for LLM observability during test debugging.
* No auth; endpoints **exist only** when `FLASK_ENV` is testing.

3. **Error model normalization**

* Ensure all API errors conform to a consistent structure (human message, details/fieldErrors, correlationId).
* Deletions blocked by reverse dependencies must return a clear domain code (e.g., `TYPE_IN_USE` for type deletion) and HTTP 409.
* Keep machine-readable error codes minimal - only for specific blocked operations.

4. **Correlation IDs**

* Use Flask-Log-Request-ID package to handle `X-Request-Id` header.
* Generate if absent; echo it back on responses.
* Accept client-supplied values for trace continuity.

5. **SSE hygiene**

* Maintain the existing \~30s heartbeat; send explicit “heartbeat” events with the same correlationId chain.
* On open/close, send clear event types so the frontend can surface structured test signals.

6. **CORS / dual-port dev support**

* No changes needed - dual-port development already works.

7. **Reset concurrency & safety**

* During `reset`, reject concurrent API work with a well-formed 503 and Retry-After: 5 header.
* `reset` must be idempotent and leave the system ready for immediate test use.

8. **Seed dataset policy**

* Use existing test data loader (already available).
* Tests **may not rely** on specific records; seed is for "realistic background," not fixtures.

9. **Start/stop integration (optional)**

* Start script should daemonize the dev server and store PID in a known location, then exit immediately.
* Stop script reads PID, sends termination signal, and cleans up PID file.
* Scripts don't block - use `/api/health/readyz` to check when ready.

10. **Backend log streaming**

* Add custom logging handler that captures all application logs (INFO level and above).
* Stream logs from connection time onward via SSE with structured JSON format:
  - timestamp (ISO format)
  - level (ERROR, WARNING, INFO, DEBUG)
  - logger name
  - message
  - correlation_id (from Flask-Log-Request-ID)
  - extra fields
* No historical buffering - only logs generated after SSE connection established.
* Essential for LLM debugging - allows tests to correlate frontend events with backend operations.

---

# Frontend — required changes

## Component Refactoring Prerequisites (NEW - Pre-Phase 4)

Before implementing selectors and tests, components must be refactored to:

1. **Accept native props**: Extend `React.ComponentPropsWithoutRef<element>` to accept all HTML attributes including `data-*`
2. **Forward refs**: Use `React.forwardRef` to enable DOM element access in tests
3. **Improve accessibility**: Semantic HTML, proper ARIA attributes, keyboard support
4. **No backward compatibility concerns**: The app is small enough to refactor entirely - update all usages as needed

This follows the patterns in `docs/epics/component_refactoring.md`.

**Reusable UI components** (need full refactoring):
- Button, Input, Dialog, Form components
- Card, Badge, ProgressBar, Toast
- SearchableSelect, DropdownMenu

**Domain components** (minimal changes - just add data-testid):
- TypeForm, PartForm - only need to add data-testid attributes directly, no refactoring needed

## Test Infrastructure Changes

1. **Test mode switch**

* Add a single flag (e.g., `TEST_MODE=true`) derived from env/build config that **enables/disables all instrumentation**.
* In production, test instrumentation must be a no-op (no logs, no globals).

2. **Structured test signals (LLM-first)**

* Provide a tiny, centralized **emit** utility that:

  * Logs **one-line JSON** prefixed `TEST_EVT:` to `console.log`.
  * Mirrors the same object into `window.__TEST_SIGNALS__` (in test mode only).
* Event kinds (stable schema): `route`, `form` (phase), `api` (method/status/duration/correlationId), `toast` (level/code/message), `error` (scope/code/message/correlationId), `query_error` (TanStack), `sse` (open/event/heartbeat/close).

3. **Console-as-truth policy**

* Treat any `console.error` as **test failure** by default.
* Ensure app code doesn’t misuse `console.error` for non-errors; migrate such logs to `console.warn`/`log`.

4. **Global error & toast surfacing**

* Wire the centralized toast/error layer to emit `TEST_EVT:toast` and `TEST_EVT:error` with stable fields.
* Ensure the same path is used for TanStack Query errors (see below).

5. **TanStack Query integration**

* Add global `onError`/`onSettled` hooks that emit `TEST_EVT:query_error` with `queryKey`, HTTP status (if present), normalized message, and correlationId.
* Confirm that domain validation errors also trigger structured events through the same path.

6. **Router & forms instrumentation**

* Router: emit `TEST_EVT:route` on every navigation (from→to).
* Forms/mutations: emit `TEST_EVT:form` at `open`, `submit`, `success`, `error` with a stable `formId` and minimal payload.

7. **API client instrumentation**

* On every request/response, emit `TEST_EVT:api` with operation name, method, status, correlationId, and duration.
* Propagate `X-Request-Id` if present; generate one if not, matching backend policy.

8. **SSE client instrumentation**

* Emit `TEST_EVT:sse` for `open`, each `event` type received (minimal metadata), periodic `heartbeat`, and `close`.
* No extra UI changes; this is for machine visibility.

9. **Selectors for stability**

* Adopt `data-testid="..."` attributes as the **primary selector** strategy.
* Apply them across the **Types** screens and any shared controls used in those flows.
* Keep names short and semantic (e.g., `types.page`, `types.form.name`, `types.list.row`, `toast.error`).
* **Prerequisite**: Components must first be refactored to accept data-* attributes and forward refs.

10. **Dual-port dev/testing hardening**

* Verify the frontend’s API base URL handling in **dual-port** setups (no proxy).
* Ensure the base URL is resolved deterministically from config in dev/testing and cannot fall back to production assumptions.

11. **Instrumentation ergonomics for LLM**

* Expose a minimal, documented helper (e.g., `emitTestEvt`) that the LLM may **sprinkle into UI code** during test authoring.
* In production builds, the helper is a no-op; in test mode, it emits signals as above.

12. **Timeout semantics in UX**

* Avoid long “silent” states in flows under test. Where unavoidable (e.g., waiting for SSE), ensure a visible toast/spinner and corresponding structured events so tests can wait deterministically.

13. **Documentation notes (front-end side)**

* Add a "UI Testing (Playwright) — How Claude should work" section to your AGENTS frontend doc covering:

  * How to run locally (headless), required URLs, optional start/stop scripts.
  * How to add `data-testid` selectors.
  * How to assert using `TEST_EVT` and treat `console.error`.
  * How to connect to backend log stream (`/api/testing/logs/stream`) for debugging.
  * How to correlate frontend events with backend logs using correlation IDs.
  * Randomized name convention (`prefix-<shortId>`).
  * 10s default timeout; SSE-aware steps called out explicitly.

---

# Cross-cutting (runner/policy/docs) — minimal, non-code decisions

1. **Runner inputs & lifecycle**

* Inputs (required): `FRONTEND_URL`, `BACKEND_URL`.
* Optional: `WEB_START_SCRIPT` / `WEB_STOP_SCRIPT`, `APP_START_SCRIPT` / `APP_STOP_SCRIPT` (single scripts each; accept `start|stop`).
* Lifecycle: if scripts provided → start (daemonize), poll `…/health/readyz` and frontend 200 → (optional) call `reset?seed=…` for clean runs → execute → stop.

2. **Playwright policies**

* Chromium only, headless default, **no retries**, global expect timeout **10s**.
* Provide a **named SSE-aware wait pattern** only for flows that legitimately rely on SSE/heartbeat (no blanket increases).
* Keep screenshots/videos/traces for humans; LLM ignores them.

3. **Data strategy**

* Tests do **not** clean up. Use randomized suffixes so the suite can re-run on a dirty DB.
* Seed dataset available via reset, but tests must **not** depend on specific records being present.
* Prerequisite entities are created via backend APIs from Playwright fixtures; UI flows only exercise the functionality under test.

4. **Types pilot (scope marker)**

* Apply selectors and instrumentation to the Types flows.
* Ensure **blocked delete with reverse dependencies** is surfaced via normalized backend error → toast/error → `TEST_EVT` so the suite can assert without reading the UI.

5. **Docs**

* Add succinct sections to **AGENTS-frontend.md** and **AGENTS-backend.md** describing:

  * FLASK_ENV=testing flag and what it enables.
  * Testing endpoints and expected responses.
  * Event taxonomy, selector policy, and how the LLM should extend tests/instrumentation.

---

## Acceptance (for designers to target)

* **Components are refactored** to accept data-* attributes, forward refs, and follow accessibility best practices.
* In **test mode**, the app emits the agreed `TEST_EVT` taxonomy; in production it does not.
* Backend exposes `reset` and `logs/stream` only in test mode and returns stable, machine-usable responses; `readyz` enhanced with DB checks.
* Backend log streaming provides structured JSON logs with correlation IDs for complete observability.
* The Types flow is fully selectable via `data-testid` attributes and surfaces a **blocked delete** through standardized errors → toasts → structured events.
* Playwright can run headless against a real backend with **only URLs provided**, and optionally orchestrate start/stop via scripts.
* Default test assertions complete within **≤10s**; SSE-related waits are explicit and limited in scope.
