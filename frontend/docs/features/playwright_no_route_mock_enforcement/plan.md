# Playwright No Route Mock Enforcement

## Brief Description
Fortify the Playwright suite’s “real backend” contract for the Hobby Electronics Inventory app by removing every remaining `page.route`/`route.fulfill`/`mockSSE` interception, introducing an ESLint rule (`testing/no-route-mocks`) that blocks regressions, and documenting the single AI SSE carve-out so contributors keep end-to-end flows backed by deterministic backend fixtures rather than browser-side fakes.

## Files / Modules In Scope
- `tests/e2e/types/type-list.spec.ts` — drop failure/delay/empty-state intercepts and rely on seeded data plus frontend instrumentation (loading test events) per the route mocking analysis.
- `tests/e2e/types/type-selector.spec.ts` — replace the mocked AI analysis kick-off with the shared helper so the spec keeps only the approved SSE plumbing.
- `tests/e2e/parts/part-list.spec.ts`, `tests/e2e/parts/part-documents.spec.ts`, `tests/e2e/parts/part-ai-creation.spec.ts`, `tests/e2e/specific/cover-presence.spec.ts` — migrate each spec off mocked routes by seeding fixtures or calling testing helpers over HTTP.
- `tests/api/factories/attachment-factory.ts` & `tests/api/index.ts` — add attachments factories and expose them from `createTestDataBundle()` so specs can call `testData.attachments.*` instead of inline mocks.
- `src/components/types/TypeList.tsx` and `src/components/parts/part-list.tsx` — emit deterministic loading test events (behind `isTestMode()`) that Playwright can await instead of relying on artificial request delays.
- `src/lib/test/query-instrumentation.ts`, `src/lib/test/event-emitter.ts`, and `src/types/test-events.ts` — extend instrumentation to cover the new list loading hooks, document the emitted events, and keep the shared test-event schema in sync.
- `tests/support/helpers/sse-mock.ts` — limit helpers to the sanctioned AI dialog flow and surface guidance for the new lint rule.
- New ESLint rule: `scripts/eslint-rules/testing/no-route-mocks.ts` plus unit tests in `scripts/eslint-rules/testing/__tests__/no-route-mocks.test.ts`.
- `eslint.config.js` — register the custom rule and scope it to Playwright sources.
- `package.json` — ensure the `lint` script covers the new rule without extra flags, merge the existing `lint` and `type-check` scripts into a `pnpm check` composite command, and extend `pnpm build` so it invokes the lint step (failing the build if linting or type-checking regresses).
- Documentation touchpoints: `docs/contribute/testing/index.md`, `docs/contribute/testing/playwright_developer_guide.md`, `docs/contribute/testing/ci_and_execution.md`, `docs/commands/plan_feature.md`, `AGENTS.md`.
- `docs/features/playwright_test_coverage_extension/route_mocking_analysis.md` — link the enforcement work back to the completed migrations.

## Technical Steps
1. **Remove existing route mocks before enabling enforcement**
  - `tests/e2e/types/type-list.spec.ts`: (a) delete the abort-based failure scenario as agreed in the analysis, (b) migrate the loading skeleton assertion to use frontend instrumentation (e.g., emit a `types.list.loading` test event from the UI while TanStack Query is fetching), and (c) seed three types via `testData.types.create` for the search persistence case. Confirm the spec exercises the live `GET /api/types?include_stats=true` endpoint end-to-end.
  - `tests/e2e/parts/part-list.spec.ts`: mirror the Types strategy by watching the frontend instrumentation hook (e.g., `parts.list.loading`) to assert skeleton visibility while the real request is in-flight, and ensure the list data comes from `testData.parts.create`. Remove the temporary network error scenario.
  - Introduce an attachments factory (`tests/api/factories/attachment-factory.ts`) and wire it through `createTestDataBundle` so Playwright gets a `testData.attachments` namespace for seeding documents, covers, previews, and thumbnails against the real `/api/parts/:id/attachments/**` surface.
  - `tests/e2e/parts/part-documents.spec.ts` & `tests/e2e/specific/cover-presence.spec.ts`: rely on the new `testData.attachments.*` helpers (plus any existing testing endpoints) to seed attachment state, replacing the inline route handlers entirely.
  - `tests/e2e/parts/part-ai-creation.spec.ts`: adopt the shared AI analysis mock helper from `docs/features/playwright_ai_flow_adjustments/plan.md`, keep the SSE analysis mock path encapsulated there, delete the `page.route('**/api/ai-parts/create')` interception, let the spec exercise the real create call using the payload coming from the review form, and capture the created part key by awaiting the real `/api/ai-parts/create` response (falling back to the post-submit URL if needed).
  - `tests/e2e/types/type-selector.spec.ts`: replace the inline `page.route`/`sseMocker` usage with the shared AI helper so both specs rely on the same sanctioned mock surface.
  - Update `tests/support/page-objects/TypesPage.ts` and `tests/support/page-objects/parts-page.ts` (plus any related fixtures) to wait on the new loading test-event helpers instead of DOM-only skeleton checks, keeping the Playwright support layer aligned with the instrumentation.
  - Update `src/components/types/TypeList.tsx` and `src/components/parts/part-list.tsx` to emit `types.list.loading` / `parts.list.loading` events via `queryInstrumentation` while their respective TanStack Query requests are pending in test mode; extend `src/types/test-events.ts` (and any related enums) so the new event payloads compile cleanly, and expose matching helpers in `tests/support` for specs to await.
  - Ensure every spec that formerly relied on `await page.route` now uses `testData` factories, documented instrumentation hooks, or the AI helper. Capture any remaining backend gaps in the feature’s tracking issue before moving on.

2. **Constrain SSE helpers to the approved exception**
   - Update `tests/support/helpers/sse-mock.ts` so the exported helpers require explicit identification of the approved AI analysis flow (e.g., via an enum or hard-coded id). Remove generic helpers that let specs fabricate arbitrary SSE payloads.
   - Inside the helper and in the consuming specs, add inline guidance referencing the forthcoming lint rule so future contributors understand why the exception exists and how to request additional backend support instead of adding new mocks.

3. **Author the `testing/no-route-mocks` ESLint rule**
   - Place the rule under `scripts/eslint-rules/testing/no-route-mocks.ts` using the ESLint rule creator from `@eslint/eslintrc`. Detect any of the following inside `tests/**`: `page.route`, `browserContext.route`, `route.fulfill`, `route.abort`, `context.route`, and calls to `sseMocker.mockSSE`/`mockSSEWithHeartbeat`.
   - Treat patterns where the callee name is aliased (e.g., destructured from fixtures) as violations by resolving identifiers through the scope manager.
   - Allow suppression only when the leading comment matches `// eslint-disable-next-line testing/no-route-mocks -- <justified reason>`; parse the comment to ensure a reason is present and fail otherwise.
   - Write unit tests in `scripts/eslint-rules/testing/__tests__/no-route-mocks.test.ts` that cover: allowed code (no mocks), rejected code with each API, and the single approved suppression for the AI SSE flow.

4. **Baseline lint debt and converge scripts**
   - Resolve current ESLint violations across the repository so the new rule is added on a clean slate; blocking issues should be captured and fixed within this feature to avoid cargo-cult suppressions.
   - Replace the separate `pnpm lint` and `pnpm type-check` invocations with a shared `pnpm check` command that runs both tasks (linting + TypeScript project references) in sequence.
   - Update contributor docs to call out `pnpm check` as the default pre-push guard, and ensure automation (see Step 8) references the consolidated command.

5. **Integrate the rule into the lint configuration**
   - Register the custom rule in `eslint.config.js` by extending the Playwright-specific configuration block (e.g., add a config entry targeting `tests/**/*.{ts,tsx}`) and enabling `'testing/no-route-mocks': 'error'`.
   - Export the rule through a local plugin namespace (e.g., `plugins: { testing: { rules: { 'no-route-mocks': rule } } }`) so it is picked up without publishing a package.
   - Confirm the lint stage (now invoked via `pnpm check`) loads the new rule without additional CLI arguments; adjust the script only if necessary (for example, to pass `--report-unused-disable-directives`).

6. **Document the enforcement policy**
  - `docs/contribute/testing/index.md`: spell out that route/SSE mocking is prohibited, describe the AI dialog exemption, and link to the frontend instrumentation + backend coordination steps required for deterministic fixtures.
  - `docs/contribute/testing/playwright_developer_guide.md`: add a subsection on replacing mocks with backend seeds and frontend instrumentation (loading events), include the expected suppression comment for the AI flow, and reference the lint rule so developers know where violations originate.
  - `docs/contribute/testing/ci_and_execution.md`: note that maintainers must run `pnpm lint` locally before merging when specs change (until automated CI is introduced) and that any lint failure on the new rule blocks approval.
  - `docs/commands/plan_feature.md`: extend the planning checklist so feature plans explicitly confirm Playwright coverage is backend-driven and call out required backend support under “Blocking issues”.
  - `AGENTS.md`: keep the pointer light but highlight that contributors should defer to the updated testing docs for the no-mock policy.
  - Cross-reference `docs/features/playwright_test_coverage_extension/route_mocking_analysis.md` so readers can see the original findings the enforcement closes out.

7. **Apply the sanctioned suppression**
   - Keep the lint suppression co-located with the shared AI analysis helper so the only waiver lives next to the sanctioned mock implementation.
   - Verify no spec carries its own suppression; if an additional backend gap remains, document it inline and in the tracking issue before proceeding.

8. **Validation**
   - Run `pnpm check` (aliasing lint + type-check) to ensure the new rule flags any lingering mocks and that TypeScript still compiles cleanly.
   - Execute the affected Playwright specs (`pnpm playwright tests/e2e/types/type-list.spec.ts`, etc.) to confirm they succeed against the real backend after the intercepts are removed.
   - Capture the instrumentation and helper dependencies (loading test events, shared AI analysis helper) in the frontend tracking issue so follow-up work is visible to both teams.

## Dependencies / Open Questions
- Frontend must emit deterministic loading instrumentation for list views (`types.list.loading`, `parts.list.loading`) so Playwright can assert skeleton states without mocks; the plan must include the corresponding UI changes.
- Shared AI analysis helper from `docs/features/playwright_ai_flow_adjustments/plan.md` must land so both specs reuse the sanctioned mock surface (and its embedded lint suppression).
- Confirm whether additional deployment SSE coverage is planned; if so, expand the plan to include the backend trigger flow outlined in the route mocking analysis before enabling lint enforcement there. -- Answer is that deployment SSE is handled by adding support in the backend.
- Decide when to automate lint execution in CI; until pipelines exist, the contributor documentation update in Step 5 serves as the gate.
