# Testing Content Deployment Support

## Brief Description
Expand testing-only backend fixtures so the Playwright suite can fetch deterministic image/PDF/HTML content via `/api/testing/content/*`, and add deployment SSE testing hooks that accept `request_id` query params plus a trigger endpoint for version updates keyed to those IDs.

## Files / Modules In Scope
- `app/api/testing.py` — rename `/fake-image`, add `/content/*` assets, expose deployment trigger endpoint.
- `app/schemas/testing.py` — replace `FakeImageQuerySchema` with new schemas for image/HTML inputs and deployment trigger payload.
- `app/services/testing_service.py` — implement fake image renderer, HTML fixture builders, and stream the bundled PDF asset.
- `app/api/utils.py:version_stream` — accept `request_id` query param and integrate subscriber delivery.
- `app/services/version_service.py` — convert to singleton, manage subscriber registry, queue version payloads.
- `app/services/container.py` — update providers for `version_service` and any new dependencies.
- `app/utils/__init__.py` (or helper) — fall back to query-string correlation IDs when headers are absent.
- `app/utils/sse_utils.py` — confirm helpers propagate explicit correlation IDs for queued events.
- Tests: `tests/api/test_testing.py`, `tests/test_utils_api.py`, new unit coverage for `VersionService` queueing/SSE flow, plus integration checks using `DocumentService.process_upload_url`.
- Docs: notification in `docs/features/testing_content_deployment_support/backend_changes.md` and frontend coordination items noted below.

## Implementation Plan

### Phase 1 – Deterministic content endpoints
1. **Rename fake image route**: Change `/api/testing/fake-image` to `/api/testing/content/image`, updating schema, filename (`testing-content-image.png`), cache headers, and all test references including non-testing guard checks.
2. **Serve deterministic assets**:
   - `/api/testing/content/pdf` must return the bundled `app/assets/fake-pdf.pdf` verbatim with `application/pdf` and `Content-Length` headers; do not require query parameters.
   - `/api/testing/content/html` and `/api/testing/content/html-with-banner` should accept a required `title`, rendering HTML via `TestingService.render_html_fixture(title, include_banner=False|True)` with deterministic meta tags and banner markup mirroring the frontend wrapper.
   - Ensure image endpoint still accepts `text` query parameter via updated `ContentImageQuerySchema`.
3. **Schema & validation updates**: Replace `FakeImageQuerySchema` with `ContentImageQuerySchema` for the image route; introduce HTML query schema requiring `title`, and omit schema for the PDF route (no params). Keep Spectree annotations aligned.
4. **Testing coverage using production parsers**:
   - Expand `tests/api/test_testing.py` to assert endpoint status codes, headers, and payload characteristics, retrieving `/api/testing/content/pdf` and comparing bytes to `app/assets/fake-pdf.pdf`.
   - Add integration tests that call `DocumentService.process_upload_url` against the new `/api/testing/content/*` URLs to confirm the real processing pipeline recognises image, pdf, and HTML-with-banner responses.
   - Update non-testing-mode guard tests to include all `/content/*` routes.

### Phase 2 – Deployment SSE correlation + trigger
5. **SSE request ID integration with Flask-Log-Request-ID**: When any SSE endpoint receives a `request_id` query parameter, set that value using the Flask-Log-Request-ID extension’s public API (e.g., via a before-request hook or helper) so `current_request_id()` exposes it. Do not modify `get_current_correlation_id()` to read query strings directly; rely entirely on the extension so this behaviour is shared by all SSE endpoints.
6. **Singleton version service with subscriber registry**: Convert container provider to singleton. In `VersionService`, implement thread-safe maps for live subscribers and pending events using `threading.RLock` plus per-subscriber queues. `register_subscriber(request_id)` must return a queue that is pre-populated with any pending events stored for that ID so nothing is dropped; `queue_version_event` should deliver immediately via `Queue.put_nowait` when a subscriber is present or append to the pending buffer when absent. Provide matching `unregister_subscriber` cleanup.
7. **Enhance `/api/utils/version/stream` while preserving separation**: Retrieve the correlation ID exclusively through `get_current_correlation_id()` (which delegates to Flask-Log-Request-ID). If that helper returns `None`, keep the existing behaviour of emitting the initial version without touching `VersionService`. When it returns a value—because the extension already injected the query-supplied `request_id`—register with `VersionService`, yield `connection_open`, push the initial `version` event using `fetch_frontend_version()` followed by any queue backlog, then block on the subscriber queue to stream queued events. Maintain heartbeats via `settings.SSE_HEARTBEAT_INTERVAL`, include correlation IDs in emitted events using existing SSE utilities, and unregister in `finally` blocks. Call out in code comments that this separation (extension sets IDs, service registration consumes them) must be preserved.
8. **Testing deployment trigger endpoint**: Add `POST /api/testing/deployments/version` accepting JSON `{request_id, version, changelog?}`. Validate inputs, call `VersionService.queue_version_event`, and return 202 with delivery status (indicate whether subscriber was present/pending). Guard with existing testing-mode check. Document deterministic payload shape for Playwright usage.
9. **Service shutdown integration**: Register `VersionService` with `ShutdownCoordinator` for lifetime notifications so disconnect events flush pending queues and stop accepting triggers after shutdown initiates.
10. **Test suite updates**: Add unit tests for new `VersionService` behaviour (live delivery, pending delivery, unregister on disconnect, queue pre-population, thread safety). Extend `tests/test_utils_api.py` (and related SSE tests) to confirm that providing `request_id` sets the Flask-Log-Request-ID value and results in subscriber registration, while omitting it leaves the stream unregistered. Add API tests verifying the deployment trigger endpoint’s success/failure paths and integration tests ensuring streamed events contain the provided `request_id` and payload.

## Follow-up / Coordination
- Document the backend work in `docs/features/testing_content_deployment_support/backend_changes.md` and notify frontend owners to update `../frontend/docs/features/playwright_ai_flow_adjustments/plan.md`, `../frontend/docs/features/playwright_deployment_sse_support/plan.md`, and `../frontend/docs/features/playwright_documents_real_backend/plan.md` to adopt `/api/testing/content/*` URLs and `request_id` query params.
- Share final payload formats (HTML banner markup, deployment trigger body) with the Playwright team so fixtures and skipped specs can adopt the backend changes without drift.
