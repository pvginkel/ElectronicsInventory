# Playwright Documents Real Backend

## Brief Description
Align the document-management Playwright coverage with the real-backend policy outlined in `docs/features/playwright_test_coverage_extension/route_mocking_analysis.md` by replacing every network stub with live API usage. The scope spans the document grid flows and the cover-presence regression checks so the suite asserts against the same attachments / cover endpoints used in production.

## Files / Modules In Scope
- `tests/api/factories/part-factory.ts` (and new helpers under `tests/api/factories/` if separation improves clarity)
- `tests/api/index.ts`
- `tests/e2e/parts/part-documents.spec.ts`
- `tests/e2e/specific/cover-presence.spec.ts`
- `tests/support/page-objects/document-grid-page.ts`
- `tests/support/page-objects/parts-page.ts`
- `tests/support/helpers/toast-helpers.ts`
- `tests/support/fixtures.ts`

## Technical Steps

### 1. Expand attachment test factories
- Fold the FormData / JSON upload logic currently in `tests/e2e/parts/part-duplication.spec.ts` into the part factory (or a sibling `attachment-factory`) so tests can create, list, delete, and mark cover attachments through `/api/parts/{part_key}/attachments` and `/api/parts/{part_key}/cover`.
- Provide helpers for:
  - Creating URL attachments (`POST` JSON payload) and binary attachments (FormData) that return the parsed response.
  - Listing attachments and retrieving the current cover attachment for assertion purposes.
  - Setting / clearing the cover image so spec set-up can run without UI interception.
- Add read helpers that surface the part detail and list responses (e.g., `GET /api/parts/{part_key}` or `GET /api/parts/with-locations`) so specs can assert `cover_attachment_id` or `has_cover_attachment` without reimplementing fetch logic.
- Expose the new helpers via `createTestDataBundle` so they are available in Playwright fixtures (`testData.parts.attachments.*`).
- Document in helper comments that `/api/testing/fake-image?text=...` is deterministic today; if flakiness ever suggests otherwise, coordinate with backend to harden the endpoint.

### 2. Surface helpers in shared fixtures
- Update `tests/support/fixtures.ts` to type the new attachment helpers on `testData` (e.g., `testData.parts.attachments.createUrl`).
- Where convenient, inject a lightweight wrapper on `apiClient` (or reuse the helper) so specs can fetch the current cover state without issuing raw `fetch` calls.

### 3. Rewrite `part-documents.spec.ts`
- Remove every `page.route` handler and local in-memory attachment store.
- Test flow:
  1. Create a part via `testData.parts.create`.
  2. Use UI interactions to add a URL document (relies on the backend upload; no stubbing). Continue to rely on `/api/testing/fake-image?text=...` as the preview source.
  3. After each action (create, set cover, delete) verify both sides:
     - UI: reuse `DocumentGridPage` helpers to wait for modal closure, tile visibility, cover toggle state, and eventual removal, then assert the preview `<img>` resolves with both the expected `alt` text and a `src` that matches the backend thumbnail URL (or wait on the thumbnail/preview network response) so the test fails if the image never loads.
     - Backend: call the attachment helper (or `apiClient`) to confirm the attachment count and cover metadata match the action; prefer `testData.parts.attachments.getCover(part.key)` when you need the cover payload, and use the part detail/list helpers when you specifically need `cover_attachment_id`.
  4. Replace the previous `expect.poll` over in-memory state with assertions against the returned API payload by invoking the helper best matched to the data you need (e.g., `await testData.parts.attachments.getCover(part.key)` for cover payloads).
- Adjust waits so they rely on existing page-object response watchers (`waitForResponse`) plus toast helper timeouts; extend `toastHelper` only if real network latency requires it.
- Ensure the spec covers thumbnail / preview rendering by asserting the preview image element resolves with the expected alt text sourced from the attachment title.

### 4. Rewrite `cover-presence.spec.ts`
- Pre-seed data through helpers instead of `page.route`:
  - Create two parts via `testData`—one without attachments, one where the helper uploads a deterministic image (e.g., use the binary helper with `/api/testing/fake-image`) and marks it as the cover so the backend flags `has_cover_attachment` and serves a real thumbnail.
  - If the list view requires types, reuse factory helpers so the parts surface naturally in `/api/parts/with-locations`.
- Update the test to:
  - Navigate to `/parts` and wait for the real list load (existing `PartsPage.waitForCards`).
  - Assert UI state: the cover part renders an `<img>` (or PDF placeholder) with the seeded title in the `alt`, while the uncovered part shows the “No cover image” placeholder.
  - Track responses via `page.on('response')` (read-only) to confirm the app requests `/api/parts/{part_key}/cover` for the part flagged with `has_cover_attachment` (allowing multiple requests in case the client revalidates).
  - For extra safety, query the backend via `testData.parts.attachments.getCover` to confirm the cover remains set post-render.
- Remove all route stubs and inline mock data.

### 5. Page object and helper updates
- Extend `DocumentGridPage` with helper(s) to expose cover toggle state (e.g., check the button tooltip or data attribute) so the spec can assert cover status without direct DOM queries.
- Update `PartsPage` to surface locators for the cover thumbnail / placeholder if needed by the new assertions.
- Tweak `toast-helpers` only if the real backend introduces timing that causes existing waits to flake; otherwise keep the helper untouched.

## Validation
- `pnpm playwright test tests/e2e/parts/part-documents.spec.ts tests/e2e/specific/cover-presence.spec.ts --project=chromium --workers=1`
- `pnpm playwright test --project=chromium`
- If helper changes touch lint rules, run `pnpm lint tests`.

## Notes / Follow-ups
- `/api/testing/fake-image` currently produces deterministic output; if the new coverage encounters non-deterministic content, raise it with the backend team so they can solidify the response.
- No additional backend work is expected, but keep `docs/features/playwright_test_coverage_extension/route_mocking_analysis.md` handy to ensure future specs reuse these helpers instead of slipping back into route mocks.
