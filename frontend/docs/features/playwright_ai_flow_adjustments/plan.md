# Playwright AI Flow Adjustments

## Brief Description
Re-align the AI-assisted Playwright flows with the real-backend policy from `docs/features/playwright_test_coverage_extension/route_mocking_analysis.md`: centralize the sanctioned AI analysis SSE mock behind a shared helper with explicit lint waivers, stop intercepting `/api/ai-parts/create`, and have both AI specs exercise the real endpoint while sharing the same mocked analysis choreography.

## Files / Modules In Scope
- `tests/support/helpers/ai-analysis-mock.ts` (new) — shared helper that registers the approved AI analysis mock response/SSE stream.
- `tests/support/fixtures.ts` — expose the new helper as a fixture and ensure cleanup between tests.
- `docs/contribute/testing/factories_and_fixtures.md` — document how the AI document helpers are consumed in Playwright specs.
- `tests/e2e/parts/part-ai-creation.spec.ts` — remove the `page.route('**/api/ai-parts/create', …)` interception, adopt the shared helper, and capture the created part from the real response/navigation.
- `tests/e2e/types/type-selector.spec.ts` — drop inline mocking logic, reuse the shared helper for AI analysis, and keep the test focused on UI behaviour.
- `tests/support/helpers/sse-mock.ts` — extend with any utility needed by the helper (e.g., connection waiters) and document the AI exception inline.
- Backend repository (implemented) — `/api/testing/content/*` endpoints (image, pdf, html, html-with-banner) now live; coordinate with backend notes in `../backend/docs/features/testing_content_deployment_support/backend_changes.md`.

## Technical Steps
1. **Introduce shared AI analysis mock helper**
   - Add `tests/support/helpers/ai-analysis-mock.ts` exporting a factory such as `createAiAnalysisMock(page, sseMocker)` that:
     - Applies a single `page.route('**/api/ai-parts/analyze', …)` with `// eslint-disable-next-line testing/no-route-mocks -- AI analysis SSE lacks deterministic backend stream` directly above it.
     - Uses `sseMocker.mockSSE` to pre-register the task-specific stream and exposes convenience methods (`emitStarted()`, `emitProgress(text, value)`, `emitCompleted(analysisPayload)`, `waitForConnection()`), so specs no longer manipulate raw SSE events.
     - Automatically unregisters the route in a `dispose()` method to avoid bleeding interceptors into other specs.
   - Keep the helper’s default payloads aligned with the backend contract (reuse the shape currently in `part-ai-creation.spec.ts`, but accept overrides so tests can tweak details when needed).

2. **Wire helper into Playwright fixtures**
   - Extend `tests/support/fixtures.ts` with a fixture (e.g., `aiAnalysisMock`) that instantiates the helper per test, guarantees `dispose()` runs in `finally`, and surfaces helper methods to specs alongside existing fixtures.
   - Ensure any new TypeScript types live next to the helper and are imported into the fixture without weakening strict mode.

3. **Adopt deterministic document fixtures from backend testing endpoints**
   - Backend work has landed; rely on the shipped routes instead of fabricating documents:
    - `GET /api/testing/content/pdf` → streams a deterministic PDF (see backend notes for bundled asset expectations).
     - `GET /api/testing/content/html?title=<text>` → returns HTML without the banner wrapper.
     - `GET /api/testing/content/html-with-banner?title=<text>` → returns HTML that includes the standard banner wrapper alongside the supplied title.
   - Document the `/api/testing/content/*` family in `docs/contribute/testing/factories_and_fixtures.md`, including the renamed image helper so authors stop referencing the legacy path.
   - Update AI specs to reference the new base path (e.g., ``const documentBase = `${backendUrl}/api/testing/content`;``) so `/api/ai-parts/create` remains fully backed by the real backend in every environment.
   - Action item: every mention of the old `/api/testing/fake-image` helper must be updated to `/api/testing/content/image` (including docs and fixtures) to stay aligned with the backend rename.

4. **Refactor `part-ai-creation.spec.ts` to rely on the real create endpoint**
   - Replace inline `page.route` and manual SSE event code with the helper/fixture methods; the spec should only orchestrate the scenario at a high level.
   - Remove the `/api/ai-parts/create` route interception. Instead, wrap `partsAI.submitReview()` in a `Promise.all` that includes `page.waitForResponse('**/api/ai-parts/create')`, assert the response status, and parse the JSON body to capture the new part key.
   - Use the navigation URL as a fallback verification (`await parts.getUrl()` → regex for `/parts/<key>`). With the actual key, keep the existing `apiClient.GET('/api/parts/{part_key}')` assertions.
   - Confirm no other mocks remain in the file; update guidepost comments if needed to clarify the flow now that the helper owns the low-level details.

5. **Refactor `type-selector.spec.ts` to consume the shared helper**
   - Remove the local `page.route` for `analyze` and the direct `sseMocker.sendEvent` calls; instead, request a session from the helper and invoke its convenience methods to deliver the `task_started` and `task_completed` events.
   - Adjust the spec to request a distinct stream/task id via helper options if necessary, keeping the test deterministic while matching the same workflow as the part-creation spec.
   - Verify the spec contains no leftover `testing/no-route-mocks` suppressions—the only waiver should live inside the helper.

6. **Polish supporting utilities**
   - If the helper needs functionality like “await first SSE connection,” add a method such as `waitForConnection(pattern, timeout)` to `tests/support/helpers/sse-mock.ts` so specs stop using ad-hoc `expect.poll` or `waitForFunction` calls.
   - Update any relevant docstrings/comments to point back to the AI exception policy, keeping the helper as the single place that justifies the mock.
   - Remove unused code from `tests/support/helpers/sse-mock.ts`.

7. **Validation**
   - Run `pnpm playwright test tests/e2e/parts/part-ai-creation.spec.ts tests/e2e/types/type-selector.spec.ts --project=chromium --workers=1`.
   - Follow up with `pnpm playwright test` to guard against regressions elsewhere.
