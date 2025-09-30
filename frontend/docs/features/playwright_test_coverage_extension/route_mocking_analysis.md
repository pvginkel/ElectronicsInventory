# Playwright Route Mocking Analysis

## Execution Checklist
- [ ] Playwright AI Flow Adjustments — establishes the shared AI analysis helper and fixture plumbing that downstream plans and lint enforcement require, eliminating bespoke SSE mocks in the AI specs first.
- [ ] Playwright Documents Real Backend — migrates document workflows to factories and real endpoints so attachment coverage is already backend-driven before we tighten linting.
- [ ] Playwright List Views Cleanup — injects list-view test instrumentation and real data seeding, which the enforcement plan depends on to replace loading-route hacks.
- [ ] Playwright Deployment SSE Support — removes the deployment stream mocks while backend triggers are fresh, preventing new lint failures once enforcement lands.
- [ ] Playwright No Route Mock Enforcement — enables the lint gate only after every targeted spec is on real data and the sanctioned AI helper exists, minimizing churn from late-breaking violations.

This document inventories every mocking hook we currently use in the Playwright suite, explains why it was introduced, and outlines how to replace each mock so the tests can exercise the real backend. The analysis also covers the existing SSE mocking helper and proposes enforcement to prevent new mocks from slipping back in.

## Inventory of Route / SSE Mocks

| Location | Endpoint / Helper | Purpose of Mock | Data Setup Fix? | Backend Support Needed? | Remove Test? | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| `tests/e2e/types/type-list.spec.ts:17` | `page.route('**/api/types?include_stats=true', abort)` | Force a network failure to assert the error state UI | No | No | **Yes** | Drop this scenario—we do not simulate transient network failures in Playwright. |
| `tests/e2e/types/type-list.spec.ts:32` | `page.route('**/api/types?include_stats=true', handler)` | Pause the list response to surface loading skeletons | No – requires a deterministic delay | **Yes** – add backend delay toggles or assert via frontend test events | **No** | Replace interception with backend-controlled delays or explicit loading instrumentation. |
| `tests/e2e/types/type-list.spec.ts:50` | `page.route('**/api/types?include_stats=true', fulfill [])` | Force an empty list to render the "no types" state | No – baseline migrations seed required types | No | **Yes** | Empty state cannot occur in production; remove the test. |
| `tests/e2e/types/type-list.spec.ts:68` | `page.route('**/api/types?include_stats=true', fulfill list)` | Provide deterministic data for search persistence | **Yes** – seed three types via factories | No | **No** | Seed data with `testData.types.create` and exercise the real endpoint. |
| `tests/e2e/types/type-selector.spec.ts:75` | `POST /api/ai-parts/analyze` | Hand out a canned SSE stream for AI review | No – depends on AI service behaviour | **Yes** – backend should return a deterministic stream for sentinel prompts | **No** | Introduce a backend testing endpoint that registers the stream ahead of the UI call. |
| `tests/e2e/parts/part-list.spec.ts:13` | `GET /api/parts/with-locations` | Delay list fetch to surface loading skeletons | No | **Yes** – mirror the Types solution (delay toggle or loading test events) | **No** | Move to backend-controlled delays or explicit instrumentation; stop intercepting once available. |
| `tests/e2e/parts/part-list.spec.ts:33` | `GET /api/parts/with-locations` | Force a 500 response to assert error state | No | No | **Yes** | Remove this test; we are not simulating random network failures. |
| `tests/e2e/parts/part-ai-creation.spec.ts:53` | `POST /api/ai-parts/analyze` | Provide SSE data for the AI analysis dialog | No | No (keep mocked for now) | **No** | Retain the SSE mock for this flow and document the lint waiver covering the exception. |
| `tests/e2e/parts/part-ai-creation.spec.ts:61` | `POST /api/ai-parts/create` | Proxy AI create requests to `/api/parts` | No – endpoint is callable directly | No | **No** | Stop intercepting; call `/api/ai-parts/create` directly in the test. |
| `tests/e2e/parts/part-documents.spec.ts:61-185` | `GET/POST /api/parts/{part_key}/attachments*` | Stub attachments CRUD, cover toggles, thumbnails | No – backend already exposes deterministic endpoints | No | **No** | Use the real API and leverage `/api/testing/fake-image?text=...` for placeholder assets. |
| `tests/e2e/specific/cover-presence.spec.ts:66-125` | `GET /api/parts/with-locations**`, `GET /api/parts/{key}/cover*` | Fabricate parts with/without cover assets | No – relies on proper attachment helpers | No | **No** | Once attachments run against the backend, seed data via factories and drop the mocks entirely. |
| `tests/support/helpers/sse-mock.ts:48-137` | `sseMocker.mockSSE` / `sendEvent` | Simulate AI SSE stream events | No (today) | Partial – long-term preference is backend-driven SSE, but AI analysis remains mocked for now | **No** | Keep only the AI analysis SSE mock; every usage must include a documented lint suppression. |
| `tests/support/helpers/sse-mock.ts:465-520` | `simulateDeploymentUpdate` / `simulateDeploymentSequence` | Fake deployment-version SSE notifications and banner state | No | **Yes** – backend should emit deployment events keyed by the app-supplied request id | **No** | Add backend support keyed by `X-Request-Id` so tests can trigger deployment streams without mocking. |


### Additional Observations

- `simulateDeploymentSequence` is currently unused by specs but remains an SSE helper. When dashboard/email coverage arrives, we should coordinate backend hooks before adopting it.
- No other `page.route` or `browserContext.route` usage exists outside the entries listed above.
- `mockSSE` and the deployment helpers are the only SSE-related mocks.

## Detailed Recommendations

### Types – `tests/e2e/types/type-list.spec.ts`
- **Error state (line 17)**: remove the test. We no longer simulate arbitrary network failures, so the Playwright suite should not intercept this request.
- **Loading skeleton (line 32)**: move to instrumentation. Either expose a backend delay toggle or add a `types.list.load` test event so the test can assert the loading state without capturing the request.
- **Empty state (line 50)**: remove the test—the application always ships with seed data, so this branch is unreachable.
- **Search persistence (line 68)**: seed three types with `testData.types.create` and let the real endpoint handle filtering.

### Types – `tests/e2e/types/type-selector.spec.ts`
- Replace the `analyze` stub with a backend sentinel. Proposed workflow:
  1. Test seeds a prebaked AI response via `POST /api/testing/ai/register` (payload includes stream id, events, and sentinel phrase `test-response-12345`).
  2. The UI submits the sentinel phrase; the backend returns the registered stream and emits the canned events.
- Treat SSE mocking as a thin wrapper that only drives already-registered backend streams; no direct application-side data fabrication should remain.

### Parts – `tests/e2e/parts/part-list.spec.ts`
- Adopt the same strategy as Types: expose a deterministic loading signal (backend delay toggle or `parts.list.load` test event) and stop intercepting the list call.
- Remove the 500-error scenario; we are not attempting to validate random network failures.

### Parts – `tests/e2e/parts/part-ai-creation.spec.ts`
- Keep the SSE mock for the analysis dialog. This flow is still too complex to drive from the backend; make sure every usage carries the explicit lint suppression referencing the AI exception.
- Drop the interception around `/api/ai-parts/create`; the test can call that endpoint directly with the payload generated from the review step.

### Parts – `tests/e2e/parts/part-documents.spec.ts`
- Switch to the live attachments endpoints. They already support creating links and toggling covers, and the `/api/testing/fake-image?text=...` helper provides deterministic assets for thumbnails/previews.
- Remove all `page.route` stubs in this spec once the test seeds attachments through the API client.

### Parts – `tests/e2e/specific/cover-presence.spec.ts`
- Once the document tests switch to the real attachments API, reuse the same helpers here: seed one part without attachments and one with a cover set via the backend, then drop the route stubs entirely.

### SSE Deployment Notifications – `simulateDeploymentUpdate` & `simulateDeploymentSequence`
- Although not currently exercised by tests, these helpers should be backed by the service. Suggested approach:
  1. Ensure the application itself attaches an `X-Request-Id` (or equivalent correlation id) to every `EventSource` connection. Tests can then supply sentinel ids via environment/config, and the backend can correlate incoming SSE connections without Playwright-level intervention.
  2. Add a backend endpoint such as `POST /api/testing/deployments/trigger` that accepts the request id and version payload. The backend stores the payload and, when the matching SSE connection appears, emits deployment events over the real stream.
  3. Update future tests to call the backend trigger instead of `simulateDeploymentSequence`.
- Once implemented, consider removing the helper or leaving it as a thin wrapper that merely calls the backend trigger.

## SSE Mocking Considerations

The current `SSEMocker` overrides the browser’s `EventSource` so tests can inject events directly. To stay within the real-backend policy:

1. Restrict mocking to explicitly approved flows—the AI analysis dialog is the only current exception, and every usage must carry a lint suppression that references this policy.
2. For any new SSE coverage, register payloads through backend testing endpoints and use sentinel inputs (for example `test-response-12345`) so the live service emits the events without Playwright interception.
3. Ensure the application includes a correlation id (e.g., `X-Request-Id`) on every `EventSource` connection so targeted backend triggers—like the deployment stream—can identify the correct subscriber.

If a scenario truly cannot be exercised via the backend, document the limitation next to the lint suppression (`// eslint-disable-next-line testing/no-route-mocks -- backend cannot simulate live telemetry`) and secure sign-off from both frontend and backend maintainers.

## Enforcement Proposal

To prevent new mocks from being introduced silently:

1. **Custom ESLint Rule**
   - Create a `testing/no-route-mocks` rule that flags any usage of `page.route`, `browserContext.route`, `route.fulfill`, `route.abort`, or `mockSSE` within `tests/**`.
   - Allow opt-out via explicit disable comments that include a reason (e.g., `// eslint-disable-next-line testing/no-route-mocks -- backend sentinel for SSE not yet available`).
2. **CI Gate**
   - Add the rule to the existing ESLint configuration (`eslint.config.js`) and ensure `pnpm lint` runs in CI for every PR touching `tests/**`.
3. **Plan Review Checklist**
   - Update the feature planning template (`docs/commands/plan_feature.md`) to remind designers to review the Playwright requirements and to call out backend prerequisites in the “Blocking Issues” section.
4. **Code Review Guidance**
   - Document in `docs/contribute/testing/playwright_developer_guide.md` (already updated) that any ESLint waiver for the rule requires approval from both frontend and backend maintainers.

With these steps we can migrate the existing mocks toward backend-backed workflows and keep the suite aligned with the “real backend” contract going forward.
