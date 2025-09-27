# Parts Playwright Stability - Technical Plan

## Brief Description

Document current failures in the Phase 3 Playwright coverage for Parts features and propose targeted fixes. Issues observed include unstable dependencies on live backend behavior (AI SSE flow, external attachment downloads, inventory mutations) and selectors that do not uniquely scope UI assertions.

## Relevant Files / Functions

- `tests/e2e/parts/part-ai-creation.spec.ts` – AI-assisted creation flow relying on `/api/ai-parts/analyze` SSE stream and `/api/ai-parts/create` mutation.
- `tests/e2e/parts/part-documents.spec.ts` – Document upload assertions tied to real attachment downloads.
- `tests/e2e/parts/part-duplication.spec.ts` – Duplicates parts and expects copied attachments immediately.
- `tests/e2e/parts/part-deletion.spec.ts` – Deletes parts while backend enforces zero-inventory guards.
- `tests/e2e/parts/part-list.spec.ts` – Exercises error state and filtering; selectors currently match multiple seeded records.
- `tests/e2e/parts/part-locations.spec.ts` – Relies on optimistic UI refresh without waiting for stock mutations to complete.
- `tests/support/fixtures.ts` and new page objects (`parts-page.ts`, `ai-dialog-page.ts`, `document-grid-page.ts`, `location-editor-page.ts`) – foundation for injecting additional mocks/helpers.
- Backend entry points used by tests: `/api/ai-parts/analyze`, `/api/ai-parts/create`, `/api/parts/{part_key}/attachments`, `/api/inventory/parts/{part_key}/stock`, `/api/parts/{part_key}`, `/api/testing/fake-image`.

## Problem Scenarios & Proposed Fixes

### Scenario A: AI-assisted creation stalls (SSE + POST dependencies)
- Problem: The analyze request is already being mocked in other suites—our spec returns a stream URL pointing at a fake host, so the UI can’t open the SSE. Because we never fulfill the route with a relative URL, the frontend falls back to the real backend and waits forever.
- Proposal:
  1. Reuse the existing interception pattern from `tests/e2e/types/type-selector.spec.ts`: fulfill `**/api/ai-parts/analyze` with a JSON body whose `stream_url` is a relative path and then drive `sseMocker.sendEvent` against that path.
  2. Optionally intercept `/api/ai-parts/create` as well (or let the backend handle it—the endpoint generates unique keys and does not conflict).
  3. Focus assertions on step transitions and final navigation to the new part detail view.

### Scenario B: Document upload waits on real HTTP download
- Problem: `part-documents.spec.ts` previously depended on downloading `https://example.com/logic-analyzer-datasheet.pdf`. The external fetch regularly times out in CI, so the UI never receives the completion toast and the test stalls.
- Proposal:
  1. Point the upload helper at the backend’s deterministic asset endpoint (`${BACKEND_URL}/api/testing/fake-image?text=abc`) so every test run exercises a controlled download source.
  2. Intercept `POST /api/parts/{part_key}/attachments` and fulfill immediately with a fabricated JSON payload that references the fake image asset (ID, title, type, preview URL) to keep the attachment grid consistent without waiting on backend processing.
  3. Stub `GET /api/parts/{part_key}/attachments` after creation to return the same fabricated list so subsequent assertions and page reloads observe the uploaded document.
  4. Update `DocumentGridPage.setAsCover` (and related helpers) to wait for the toast or a settled `POST`/`GET` network event before asserting on cover state, ensuring the deterministic asset flow stays observable.

### Scenario C: Part duplication attachments not rendered
- Problem: Backend already duplicates attachments synchronously (see `DocumentService.copy_attachment_to_part` and `POST /api/parts/copy-attachment`). Failures stem from the frontend/test harness observing the detail page before React Query has refetched the new attachments.
- Proposal:
  1. After the duplication form submits, wait for navigation to the new part detail route and either trigger a manual refetch (e.g., reload) or poll `/api/parts/{part_key}/attachments` until the expected attachments are returned.
  2. Extend the page object with a helper that waits for the attachments query to settle (watch `GET /api/parts/{part_key}/attachments` network call) before asserting tile counts.
  3. Drop toast assertions; focus on verifying the new part key differs from the source and the attachment grid reflects the API response.

### Scenario D: Deletion guard conflicts with backend inventory rules
- Problem: The backend correctly blocks deletion when stock exists. Our “delete succeeds” test does seed data via the API, but we never ensure stock stays at zero before clicking Delete, and the “blocks deletion” test still expects to land on `/parts` afterwards.
- Proposal:
  1. In the “delete succeeds” path, double-check the API‐reported quantity (and remove residual stock via `DELETE /api/inventory/parts/{part_key}/stock` if needed) so the UI delete is deterministic.
  2. In the “blocks deletion when stock exists” path, keep the API seeding but adjust assertions: verify toast / dialog state instead of expecting navigation. That matches the documented behavior and keeps the test guarding the rule.
  3. Extend page objects to expose the confirm dialog and toast helper methods for these assertions.
- Optional backend enhancement: expose a `/api/testing/parts/{part_key}/force-delete` endpoint (guarded by `isTestMode()`) for cleanup scenarios without changing production logic.

### Scenario E: Locations editor row stays visible by design
- Problem: The spec expects the inline row to disappear after saving, but the UI intentionally keeps the row visible so the user can add the next location. Assertions that look for the row to be hidden will always fail.
- Proposal:
  1. Update helpers to confirm that the quantity changes (and the total row updates) instead of checking `toBeHidden`.
  2. When editing or removing stock, await the relevant network response and then assert on the computed totals/row content rather than the row’s presence.

### Scenario F: List search & error-state selectors are too broad
- Problem: Search uses generic keywords, matching many pre-seeded records. Summary text assertions (`/1 of/`) fail because filtered result count >1. Error-state test occasionally fetches real data after route cleanup.
- Proposal:
  1. Use unique descriptions generated per test (`randomPartDescription`) and search for the full description to isolate results.
  2. After clearing the Playwright route, ensure no pending requests reuse the failing handler (call `page.unroute` after the assertion or reload the page).
  3. Relax summary expectations to verify the filtered card exists and `summary` text includes the unique description count rather than hard-coded `1 of` patterns.

## Step-by-Step Outline

1. **Introduce deterministic network mocks**
   - Register Playwright `page.route` handlers for AI endpoints and attachments before the UI triggers them.
   - Reuse the `tests/e2e/types/type-selector.spec.ts` interception pattern: fulfill AI analyze requests with a relative `stream_url` and drive events through the existing `sseMocker` utilities.
   - Fabricate backend-like JSON responses (matching generated TypeScript types) to keep UI caches consistent.
2. **Augment page objects with awaitable helpers**
   - Extend `parts-page.ts` to expose confirm dialogs, toast assertions, and attachment polling utilities.
   - Update `location-editor-page.ts` to await `waitForResponse` on stock endpoints before verifying DOM changes.
3. **Stabilize test data creation**
   - Prefer `randomTypeName`/`randomPartDescription` to eliminate unique constraint collisions.
   - When backend state is mutated (stock add/remove), ensure cleanup via API before next assertions.
4. **Update specs per scenario**
   - Refactor each failing spec to call new helpers, rely on mocks, and adjust expectations as described above.
5. **Optional backend enhancements (if desired)**
   - Add test-only switches (`?testMode=true`) or dedicated endpoints to bypass slow operations (AI SSE, attachment downloads, force delete). Implement behind `isTestMode()` gating so production behavior remains unchanged.

## Implementation Phases

1. **Phase 1 – Test Harness Stabilization**
   - Add Playwright route mocks for AI analyze/create and attachment uploads.
   - Update fixtures/page objects to expose SSE + polling utilities.
   - Regenerate failing specs to use deterministic data.
2. **Phase 2 – Backend Support (optional)**
   - Evaluate feasibility of lightweight test-mode endpoints to eliminate route mocks.
   - Document any new endpoints in `docs/contribute/testing` if implemented.
3. **Phase 3 – Regression & Cleanup**
   - Re-run `pnpm playwright test tests/e2e/parts` to confirm stability.
   - Update `docs/features/playwright_test_coverage_extension/plan.md` Phase 3 checklist and outstanding work log once tests are deterministic.
