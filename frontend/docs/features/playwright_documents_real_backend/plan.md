# Playwright Documents Real Backend

## Brief Description
Rework the documents and cover presence Playwright specs to use the real attachments API (including the `/api/testing/fake-image` helper) instead of stubbing network calls.

## Files / Modules In Scope
- `tests/e2e/parts/part-documents.spec.ts`
- `tests/e2e/specific/cover-presence.spec.ts`
- `tests/support/page-objects/parts-page.ts`
- `tests/support/page-objects/document-grid-page.ts`
- `tests/support/helpers/toast-helpers.ts` (if wait logic needs tuning)
- Any new attachment-seeding utilities under `tests/api/`

## Technical Steps
1. **Introduce attachment factory helpers**
   - Extend `tests/api/factories/part-factory.ts` (or create a dedicated helper) to POST new attachments via `/api/parts/{part_key}/attachments` and toggle covers via `/api/parts/{part_key}/cover`.
   - Expose these helpers through `createTestDataBundle` for reuse across specs.

2. **Refactor `part-documents.spec.ts`**
   - Replace `page.route` handlers with factory calls that seed the initial state and use live API mutations for create/delete/cover actions.
   - For previews/thumbnails, rely on `/api/testing/fake-image?text=...` URLs returned by the backend; remove any manual `route.fulfill` responders.
   - Adjust assertions to wait on the UI changes triggered by real network responses.

3. **Refactor `cover-presence.spec.ts`**
   - Use the new helpers to create two parts (one with a cover, one without) and issue real requests to mark the cover.
   - Allow the list view to load without interception and assert on `has_cover_attachment` behaviour.

4. **Page object / helper updates**
   - If additional selectors or waits are needed for real API responses, add them to the relevant page objects.
   - Ensure toast helper timeouts accommodate live response times.

5. **Validation**
   - Run `npx playwright test tests/e2e/parts/part-documents.spec.ts tests/e2e/specific/cover-presence.spec.ts --project=chromium --workers=1`.
   - Execute the full suite afterwards.
