# Testing Content Deployment Support – Backend Notes

## Summary
- Rename the existing `/api/testing/fake-image` helper to `/api/testing/content/image` and keep returning a deterministic PNG attachment (`testing-content-image.png`).
- Add `/api/testing/content/pdf`, `/api/testing/content/html`, and `/api/testing/content/html-with-banner` so Playwright can fetch stable document fixtures:
  - The PDF route must stream the bundled asset at `app/assets/fake-pdf.pdf` verbatim (no query parameters).
  - HTML routes accept a required `title` parameter and should render deterministic markup, with the banner variant including the standard frontend wrapper.
- Update the testing service to expose helpers for serving the static PDF and rendering HTML fixtures, while reusing the existing fake-image generator.
- Extend the SSE infrastructure so `/api/utils/version/stream` always registers with `VersionService`, emits correlation IDs on every event, and honours a `request_id` query parameter (falling back to the auto-generated ID when none is supplied).
- Upgrade `VersionService` into a singleton with per-subscriber queues, pending buffers, and an idle-cleanup worker so Playwright can disconnect/reconnect without leaking memory.
- Provide `POST /api/testing/deployments/version` so Playwright can trigger version notifications by supplying `{request_id, version, changelog?}`; the endpoint returns whether the payload was delivered immediately or queued for later consumption.

## Testing & Validation
- Reuse `DocumentService.process_upload_url` within tests to verify the new `/api/testing/content/*` endpoints produce payloads the production pipeline recognises (image, PDF, HTML with banner metadata).
- Expand API/SSE tests to cover the new routes, confirm non-testing guards remain enforced, and assert that version events include the supplied `request_id`.

## Frontend Coordination
- Frontend plans referencing `/api/testing/fake-image` or `/api/testing/ai/documents/*` must be updated to the new `/api/testing/content/*` pattern.
- The deployment SSE plan should expect `request_id` in the query string and document the trigger endpoint used by Playwright to simulate banner updates.
