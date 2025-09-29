# Playwright Route Mocking Analysis

This document inventories every mocking hook we currently use in the Playwright suite, explains why it was introduced, and outlines how to replace each mock so the tests can exercise the real backend. The analysis also covers the existing SSE mocking helper and proposes enforcement to prevent new mocks from slipping back in.

## Inventory of Route / SSE Mocks

| Location | Endpoint / Helper | Purpose of Mock | Data Setup Fix? | Backend Support Needed? | Remove Test? | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| `tests/e2e/types/type-list.spec.ts:17` | `page.route('**/api/types?include_stats=true', abort)` | Force a network failure to assert the error state UI | No – requires server-side failure | Yes – add test hook to emit 5xx when a sentinel query/header is present | No | Keep the assertion but trigger it via backend feature flag (e.g., `?testFailure=types`) |
| `tests/e2e/types/type-list.spec.ts:32` | Capture request to delay fulfillment for skeleton assertions | No – skeleton needs deterministic delay | Yes – expose backend delay toggle or add frontend test events for loading | No | Prefer emitting a `query:start` test event or backend delay flag instead of interception |
| `tests/e2e/types/type-list.spec.ts:50` | Return `[]` so the "No types yet" empty state renders | No – shared DB makes global emptiness impossible | Yes – support per-test tenant or scoped listing via backend | No | Backend could accept `?testTenant=<id>` seeded via factory to isolate results |
| `tests/e2e/types/type-list.spec.ts:68` | Return static list to exercise search persistence | **Yes** – seed three types via factories and rely on real API | No | No | Replace with `testData.types.create` calls and allow real backend filtering |
| `tests/e2e/types/type-selector.spec.ts:75` | Stub `POST /api/ai-parts/analyze` to hand out mock SSE stream URL | No – depends on AI service behaviour | Yes – backend should return deterministic stream when prompt contains sentinel | No | Introduce backend testing endpoint that registers a prebaked stream before the UI call |
| `tests/e2e/parts/part-list.spec.ts:13` | Delay `GET /api/parts/with-locations` to catch loading skeleton | No | Yes – same approach as Types (delay toggle or test-event instrumentation) | No | Emit loading test events or allow backend to delay when header is set |
| `tests/e2e/parts/part-list.spec.ts:33` | Force `500` to assert list error state | No | Yes – backend hook for 5xx | Optional | If we decide the UI shouldn't assert on network failures, drop the test; otherwise add backend toggle |
| `tests/e2e/parts/part-ai-creation.spec.ts:53` | Stub `POST /api/ai-parts/analyze` for AI dialog | No | Yes – sentinel-based analysis response | No | Same mechanism as TypeSelector |
| `tests/e2e/parts/part-ai-creation.spec.ts:61` | Intercept `POST /api/ai-parts/create` to call `/api/parts` directly | No – UI expects AI service orchestration | Yes – backend needs a testing path that creates deterministic parts for AI flows | No | Add backend testing endpoint (e.g., `/api/testing/ai/create`) triggered by sentinel prompt |
| `tests/e2e/parts/part-documents.spec.ts:61-185` | Stub attachments CRUD, cover toggle, previews, thumbnails | No – current backend requires S3 and lacks lightweight fixtures | Yes – provide testing endpoints for attachments that return placeholder assets | No | Implement backend helpers that accept simple JSON payloads and serve canned thumbnails/previews |
| `tests/e2e/specific/cover-presence.spec.ts:66-125` | Fabricate list of parts and cover assets | No – depends on attachment support above | Yes – once attachments API is test-friendly we can seed real parts | No | After backend supports attachments/cover via factories, rewrite test to use them |
| `tests/support/helpers/sse-mock.ts:48-137` | `sseMocker.mockSSE` & `sendEvent` | Simulate AI SSE stream events | No (today) | Yes – backend should emit canned streams when prompted with sentinel text | No | Keep helper only as thin transport once backend can be triggered without interception |
| `tests/support/helpers/sse-mock.ts:465-520` | `simulateDeploymentUpdate` / `simulateDeploymentSequence` | Fake deployment-version SSE notifications and banner state | No | Yes – backend should deliver version updates keyed by request ID or sentinel stream | No | Add backend support that processes `X-Request-Id` on `EventSource` and emits "deployment" events when test code calls a coordinating endpoint |

### Additional Observations

- `simulateDeploymentSequence` is currently unused by specs but remains an SSE helper. When dashboard/email coverage arrives, we should coordinate backend hooks before adopting it.
- No other `page.route` or `browserContext.route` usage exists outside the entries listed above.
- `mockSSE` and the deployment helpers are the only SSE-related mocks.

## Detailed Recommendations

### Types – `tests/e2e/types/type-list.spec.ts`
- **Error state (line 17)**: retain the UI assertion, but add a backend testing hook (e.g., `GET /api/testing/fail-next?target=types`) that forces the next `/api/types` call to throw a 500. Tests would call the hook via `apiClient` before navigating.
- **Loading skeleton (line 32)**: either
  1. add a backend delay toggle activated via header/query, or
  2. emit a `testEvent('types.list.load', { phase: 'start' })` in the frontend and assert against that without manipulating the network.
- **Empty state (line 50)**: introduce backend scoping. Example: factories create a `testWorkspaceId`, and the list request includes `?workspace=<id>` so that only that workspace’s data is returned. Without that isolation we cannot guarantee emptiness.
- **Search persistence (line 68)**: replace the mocked payload with three real types seeded by factories; nothing prevents using the live backend here.

### Types – `tests/e2e/types/type-selector.spec.ts`
- Replace the `analyze` stub with a backend sentinel. Proposed workflow:
  1. Test seeds a prebaked AI response via `POST /api/testing/ai/register` (payload includes stream id, events, and sentinel phrase `test-response-12345`).
  2. The UI submits the sentinel phrase; the backend returns the registered stream and emits the canned events.
- Treat SSE mocking as a thin wrapper that only drives already-registered backend streams; no direct application-side data fabrication should remain.

### Parts – `tests/e2e/parts/part-list.spec.ts`
- Mirror the Types approach for skeleton and error-state tests. If we decide network failures are outside the UI contract, remove the error test entirely; otherwise, rely on the same backend failure hook.

### Parts – `tests/e2e/parts/part-ai-creation.spec.ts`
- Use the same sentinel-driven workflow as TypeSelector. The backend should own:
  - Registering AI analysis payloads (`POST /api/testing/ai/register`)
  - Streaming canned SSE events once the sentinel prompt is observed
  - Optionally creating parts directly when `/api/ai-parts/create` receives a matching sentinel payload (so the test can avoid intercepting that endpoint).
- `mockSSE` can remain as a control surface for test code to observe connections, but the actual events should originate from the backend.

### Parts – `tests/e2e/parts/part-documents.spec.ts`
- Extend the backend with testing helpers, for example:
  - `POST /api/testing/parts/{part_key}/attachments` to create placeholder attachments bound to the real part record.
  - `POST /api/testing/attachments/{id}/set-cover` to toggle cover images.
  - Static routes that return canned thumbnails/previews without hitting S3.
- Once those exist, replace the mocked routes with real API calls using the existing factories.

### Parts – `tests/e2e/specific/cover-presence.spec.ts`
- After the attachment helpers are available, create two parts via factories:
  1. Part with no attachments.
  2. Part with an attachment marked as cover via backend helper.
- The spec can then load the real list and assert on `has_cover_attachment` behaviour without any interception.

### SSE Deployment Notifications – `simulateDeploymentUpdate` & `simulateDeploymentSequence`
- Although not currently exercised by tests, these helpers should be backed by the service. Suggested approach:
  1. Ensure the application itself attaches an `X-Request-Id` (or equivalent correlation id) to every `EventSource` connection. Tests can then supply sentinel ids via environment/config, and the backend can correlate incoming SSE connections without Playwright-level intervention.
  2. Add a backend endpoint such as `POST /api/testing/deployments/trigger` that accepts the request id and version payload. The backend stores the payload and, when the matching SSE connection appears, emits deployment events over the real stream.
  3. Update future tests to call the backend trigger instead of `simulateDeploymentSequence`.
- Once implemented, consider removing the helper or leaving it as a thin wrapper that merely calls the backend trigger.

## SSE Mocking Considerations

The current `SSEMocker` overrides the browser’s `EventSource` so tests can inject events directly. This is acceptable for rapid feedback, but to align with the real-backend policy we should:

1. Use `SSEMocker` only as a transport inspection tool (to assert connection counts, etc.).
2. Drive actual event payloads from the backend by registering them ahead of time with a testing endpoint.
3. Require tests to interact with the UI using sentinel inputs (e.g., `test-response-12345`) that the backend recognises and responds to with the pre-registered SSE stream.
4. For deployment notifications, add support for matching streams via `X-Request-Id`, allowing Playwright to trigger specific version sequences without mocking.

If a scenario arises where backend-driven SSE is infeasible, the test should include an inline waiver explaining why (`// eslint-disable-next-line testing/no-route-mocks -- backend cannot simulate live telemetry`). Each waiver needs review and sign-off.

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
