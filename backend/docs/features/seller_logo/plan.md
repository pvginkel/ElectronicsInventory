# Seller Logo -- Technical Plan

## 0) Research Log & Findings

**Areas researched:**

- **Seller model** (`app/models/seller.py:1-28`): Simple model with `id`, `name`, `website`, `created_at`, `updated_at`. No S3 or image columns currently. No import of `build_cas_url`.
- **Part model cover_url pattern** (`app/models/part.py:103-116`): `cover_url` is a `@property` that calls `build_cas_url(cover.s3_key)` when a cover attachment exists. For the seller logo the pattern is simpler: just `build_cas_url(self.logo_s3_key)` directly, since the logo is a single nullable column rather than an indirect attachment reference.
- **Attachment.attachment_url pattern** (`app/models/attachment.py:68-74`): Calls `build_cas_url(self.s3_key, self.content_type, self.filename)`. For seller logos, we only need the hash (no content_type/filename since logos are always images served as preview thumbnails).
- **build_cas_url** (`app/utils/cas_url.py:10-52`): Accepts `s3_key`, optional `content_type` and `filename`. Returns `/api/cas/<hash>` URL. Works with nullable input (returns `None`).
- **S3Service.generate_cas_key** (`app/services/s3_service.py:73-83`): Computes SHA-256 hash of content bytes, returns `cas/{hash}`.
- **S3Service.file_exists** (`app/services/s3_service.py:199-218`): Used for CAS dedup check before upload.
- **DocumentService._create_attachment** (`app/services/document_service.py:241-328`): The "persist before S3" pattern: creates DB row, flushes, then checks `file_exists` for dedup, then uploads. On delete, no S3 deletion (CAS shared blobs).
- **detect_mime_type** (`app/utils/mime_handling.py:1-30`): Uses `python-magic` to detect MIME type from bytes. Trusts HTTP Content-Type for images, HTML, PDF.
- **SellerService** (`app/services/seller_service.py:1-163`): Currently takes only `db: Session` as constructor arg. No S3 dependency.
- **ServiceContainer seller_service** (`app/services/container.py:135`): `providers.Factory(SellerService, db=db_session)`. Needs `s3_service` added.
- **Seller schemas** (`app/schemas/seller.py:1-88`): `SellerResponseSchema` has 5 fields (id, name, website, created_at, updated_at). `SellerListSchema` has 3 fields (id, name, website). Neither has `logo_url`.
- **Seller API** (`app/api/sellers.py:1-75`): Standard CRUD. No multipart handling.
- **Seller tests** (`tests/services/test_seller_service.py`, `tests/api/test_seller_api.py`): Comprehensive CRUD tests. Schema structure tests explicitly assert field counts -- these will need updating.
- **Alembic migrations**: Latest is `021`. New migration will be `022`.
- **Test data** (`app/data/test_data/sellers.json`): 7 sellers with id/name/website. No `logo_s3_key` field; nullable column means no test data update needed.
- **AppSettings** (`app/app_config.py:138-139`): `allowed_image_types` defaults to `["image/jpeg", "image/png", "image/webp", "image/svg+xml"]`. Reusable for logo validation.

**Conflicts / decisions resolved:**

- The change brief says "validate uploaded file is an image using python-magic (same as DocumentService)." DocumentService uses `detect_mime_type` which calls `magic.from_buffer()`. For the logo, we call `detect_mime_type(file_bytes, None)` and check the result starts with `image/` (or is in `allowed_image_types`). Decision: use `allowed_image_types` from `AppSettings` for consistency.
- SellerService currently has no `app_settings` dependency. Adding `s3_service` is required per the brief. Adding `app_settings` is also needed for `allowed_image_types`. Alternative: hardcode `image/` prefix check. Decision: inject `app_settings` for consistency with DocumentService's validation.

---

## 1) Intent & Scope

**User intent**

Add a logo image to each seller entity so the frontend can display visual identity for sellers. This requires a new nullable column on the `sellers` table, two new API endpoints (upload and delete logo), schema updates to expose `logo_url`, and service-layer methods following the project's CAS storage pattern.

**Prompt quotes**

"Add `logo_s3_key` nullable string column to the `sellers` table"
"Follow 'persist DB before S3' pattern"
"No S3 deletion on logo delete (CAS blobs are never deleted)"
"Validate uploaded file is an image using python-magic (same as DocumentService)"

**In scope**

- New `logo_s3_key` column on Seller model with Alembic migration
- `logo_url` computed property on Seller model
- `set_logo()` and `delete_logo()` methods on SellerService
- `PUT /sellers/<id>/logo` and `DELETE /sellers/<id>/logo` API endpoints
- Schema updates (`logo_url` in SellerResponseSchema and SellerListSchema)
- `s3_service` (and `app_settings`) wired into SellerService via DI
- Comprehensive service and API tests

**Out of scope**

- Logo resizing or thumbnail generation (CAS handles image serving via CAS image service)
- Bulk logo management
- A separate logo-specific file size limit (the existing `max_image_size` from AppSettings is reused)
- Frontend changes (documented separately if needed)

**Assumptions / constraints**

- Single-user app, no concurrency concerns for logo uploads.
- CAS deduplication means the same logo image shared by multiple sellers is stored once.
- The CAS endpoint (`/api/cas/<hash>`) already supports serving images with thumbnail parameter; no new serving infrastructure needed.
- `python-magic` is already a project dependency (used in `detect_mime_type`).

---

## 1a) User Requirements Checklist

**User Requirements Checklist**

- [ ] Add `logo_s3_key` nullable string column to the `sellers` table
- [ ] Add `logo_url` property on Seller model using `build_cas_url()` (same pattern as Part.cover_url, Attachment.attachment_url)
- [ ] Create Alembic migration for the new column
- [ ] Create `PUT /sellers/<id>/logo` endpoint for multipart file upload
- [ ] Validate uploaded file is an image using python-magic (same as DocumentService)
- [ ] Follow "persist DB before S3" pattern: update logo_s3_key, flush, then upload to S3
- [ ] S3 upload uses CAS deduplication (skip upload if key already exists)
- [ ] Create `DELETE /sellers/<id>/logo` endpoint that sets logo_s3_key to None
- [ ] No S3 deletion on logo delete (CAS blobs are never deleted -- matches DocumentService/AttachmentSetService pattern)
- [ ] Add `logo_url` field to `SellerResponseSchema` and `SellerListSchema`
- [ ] Add `s3_service` dependency to `SellerService`
- [ ] Implement `set_logo()` and `delete_logo()` methods on `SellerService`
- [ ] Write comprehensive service tests for set_logo and delete_logo
- [ ] Write comprehensive API tests for PUT and DELETE logo endpoints
- [ ] Update test data if needed

---

## 2) Affected Areas & File Map

- Area: `app/models/seller.py`
- Why: Add `logo_s3_key` column and `logo_url` computed property.
- Evidence: `app/models/seller.py:13-28` -- current Seller model has no image/S3 columns.

- Area: `app/schemas/seller.py` -- `SellerResponseSchema`, `SellerListSchema`
- Why: Add `logo_url: str | None` field to both response schemas.
- Evidence: `app/schemas/seller.py:46-88` -- both schemas currently lack logo_url.

- Area: `app/services/seller_service.py` -- `SellerService`
- Why: Add `s3_service` and `app_settings` constructor dependencies; implement `set_logo()` and `delete_logo()` methods.
- Evidence: `app/services/seller_service.py:18-21` -- constructor currently takes only `db: Session`.

- Area: `app/services/container.py` -- `ServiceContainer.seller_service`
- Why: Wire `s3_service` and `app_config` into SellerService factory provider.
- Evidence: `app/services/container.py:135` -- `seller_service = providers.Factory(SellerService, db=db_session)`.

- Area: `app/api/sellers.py`
- Why: Add `PUT /<int:seller_id>/logo` and `DELETE /<int:seller_id>/logo` endpoints.
- Evidence: `app/api/sellers.py:1-75` -- current CRUD endpoints, no logo handling.

- Area: `alembic/versions/022_add_seller_logo_s3_key.py` (new file)
- Why: Add nullable `logo_s3_key VARCHAR(500)` column to `sellers` table.
- Evidence: `alembic/versions/021_create_part_sellers_table.py` -- latest migration is 021.

- Area: `tests/services/test_seller_service.py`
- Why: Add tests for `set_logo()` and `delete_logo()` service methods.
- Evidence: `tests/services/test_seller_service.py:1-413` -- existing seller service tests.

- Area: `tests/api/test_seller_api.py`
- Why: Add tests for PUT/DELETE logo endpoints; update schema structure assertions.
- Evidence: `tests/api/test_seller_api.py:373-418` -- schema structure tests assert exact field sets that will change.

- Area: `app/data/test_data/sellers.json`
- Why: No changes needed. The new column is nullable with no default, so existing test data loads fine.
- Evidence: `app/data/test_data/sellers.json:1-37` -- 7 sellers with id/name/website only.

---

## 3) Data Model / Contracts

- Entity / contract: `sellers` table (updated)
- Shape:
  ```
  sellers
  -------
  id              INTEGER  PK AUTO
  name            VARCHAR(255) NOT NULL UNIQUE
  website         VARCHAR(500) NOT NULL
  logo_s3_key     VARCHAR(500) NULL          <-- NEW
  created_at      DATETIME NOT NULL
  updated_at      DATETIME NOT NULL
  ```
- Refactor strategy: New nullable column; no backfill needed. All existing rows get `NULL` for `logo_s3_key`.
- Evidence: `app/models/seller.py:13-28` -- current model definition.

- Entity / contract: `SellerResponseSchema` (updated)
- Shape:
  ```json
  {
    "id": 1,
    "name": "DigiKey",
    "website": "https://www.digikey.com",
    "logo_url": "/api/cas/abc123..." | null,
    "created_at": "2025-01-01T00:00:00",
    "updated_at": "2025-01-01T00:00:00"
  }
  ```
- Refactor strategy: Adding a new field to the response. BFF pattern means no backwards compatibility needed.
- Evidence: `app/schemas/seller.py:46-68` -- current response schema.

- Entity / contract: `SellerListSchema` (updated)
- Shape:
  ```json
  {
    "id": 1,
    "name": "DigiKey",
    "website": "https://www.digikey.com",
    "logo_url": "/api/cas/abc123..." | null
  }
  ```
- Refactor strategy: Adding a new field. BFF pattern means no backwards compatibility needed.
- Evidence: `app/schemas/seller.py:71-88` -- current list schema.

---

## 4) API / Integration Surface

- Surface: `PUT /api/sellers/<id>/logo`
- Inputs: Multipart form data with a `file` field containing the image. No other form fields required.
- Outputs: `SellerResponseSchema` (200) with updated `logo_url`. Side effect: S3 upload of logo content under CAS key.
- Errors: 400 (no file provided, not an image), 404 (seller not found), 409 (S3 upload failure via InvalidOperationException).
- Evidence: `app/api/attachment_sets.py:41-71` -- existing multipart upload pattern.

- Surface: `DELETE /api/sellers/<id>/logo`
- Inputs: Seller ID in URL path. No request body.
- Outputs: `SellerResponseSchema` (200) with `logo_url: null`. Side effect: `logo_s3_key` set to `None` in DB.
- Errors: 404 (seller not found).
- Evidence: `app/api/sellers.py:68-74` -- existing delete pattern returns 204; logo delete returns 200 with updated entity.

---

## 5) Algorithms & State Machines

- Flow: Logo upload (`set_logo`)
- Steps:
  1. Look up Seller by ID; raise `RecordNotFoundException` if not found.
  2. Read file bytes from the uploaded file object.
  3. Detect MIME type using `detect_mime_type(file_bytes, None)`. Note: `None` is passed as `http_content_type` intentionally -- for direct file uploads there is no authoritative HTTP Content-Type header, so we rely solely on magic-based detection. This differs from DocumentService's `_validate_file_type` which passes the declared content type for downloaded content.
  4. Validate detected type is in `app_settings.allowed_image_types`; raise `InvalidOperationException` if not.
  5. Validate file size against `app_settings.max_image_size`; raise `InvalidOperationException` if exceeded.
  6. Generate CAS key via `s3_service.generate_cas_key(file_bytes)`.
  7. Update `seller.logo_s3_key = cas_key` on the Seller model instance.
  8. Flush session (persist before S3).
  9. Check `s3_service.file_exists(cas_key)` for CAS dedup.
  10. If key does not exist in S3, upload via `s3_service.upload_file(BytesIO(file_bytes), cas_key, detected_type)`.
  11. Return the updated Seller instance.
- States / transitions: None (stateless operation).
- Hotspots: S3 upload latency; mitigated by CAS dedup (most re-uploads skip step 9).
- Evidence: `app/services/document_service.py:278-328` -- existing CAS upload with persist-before-S3 pattern.

- Flow: Logo delete (`delete_logo`)
- Steps:
  1. Look up Seller by ID (raise `RecordNotFoundException` if not found).
  2. Set `seller.logo_s3_key = None`.
  3. Flush session.
  4. Return the updated Seller instance.
- States / transitions: None.
- Hotspots: None. No S3 deletion per CAS policy.
- Evidence: `app/services/attachment_set_service.py:135-175` -- CAS delete pattern (no S3 delete).

---

## 6) Derived State & Invariants

- Derived value: `logo_url`
  - Source: `Seller.logo_s3_key` (unfiltered, single column).
  - Writes / cleanup: Read-only computed property; no writes or cleanup triggered.
  - Guards: `build_cas_url` returns `None` when `logo_s3_key` is `None` or not in CAS format.
  - Invariant: `logo_url` is always `None` when `logo_s3_key` is `None`, and always a valid `/api/cas/<hash>` URL when `logo_s3_key` is set.
  - Evidence: `app/utils/cas_url.py:10-52` -- `build_cas_url` null-safety.

- Derived value: `logo_s3_key` (CAS key stored on seller)
  - Source: SHA-256 hash of uploaded image bytes.
  - Writes / cleanup: Written on `set_logo`; cleared (set to `None`) on `delete_logo`. No S3 cleanup on delete (CAS shared).
  - Guards: Validated image type before generating CAS key. Flush before S3 upload ensures rollback on upload failure.
  - Invariant: If `logo_s3_key` is non-null, there exists a corresponding object in S3 under that key (guaranteed by persist-then-upload + dedup check).
  - Evidence: `app/services/document_service.py:303-328` -- same invariant for attachments.

- Derived value: Seller response schemas (`logo_url` field)
  - Source: `Seller.logo_url` property via Pydantic `from_attributes=True`.
  - Writes / cleanup: None (read-only serialization).
  - Guards: `from_attributes=True` reads the `@property` automatically.
  - Invariant: Every seller API response includes `logo_url` as `str | None`.
  - Evidence: `app/schemas/seller.py:49` -- `model_config = ConfigDict(from_attributes=True)`.

---

## 7) Consistency, Transactions & Concurrency

- Transaction scope: Each request runs in a single SQLAlchemy session. The `set_logo` method flushes (not commits) within the session; the Flask request lifecycle handles commit/rollback via the session middleware.
- Atomic requirements: The `logo_s3_key` column update and flush must happen before the S3 upload. If the S3 upload fails, the exception propagates and the session transaction is rolled back by Flask's error handling, removing the `logo_s3_key` value.
- Retry / idempotency: CAS dedup makes repeated uploads idempotent -- same content produces the same key, and `file_exists` check skips re-upload. Re-uploading a different image is also safe (just overwrites the column value).
- Ordering / concurrency controls: Single-user app; no locking needed. Multiple logo uploads for the same seller simply overwrite `logo_s3_key`.
- Evidence: `app/services/document_service.py:278-328` -- identical persist-then-upload transaction pattern.

---

## 8) Errors & Edge Cases

- Failure: No file in multipart upload request
- Surface: `PUT /sellers/<id>/logo` API endpoint
- Handling: 400 with error message "No file provided"
- Guardrails: Check `request.files` before reading bytes.
- Evidence: `app/api/attachment_sets.py:52-53` -- same pattern for attachment uploads.

- Failure: Uploaded file is not an image (e.g., PDF, text file)
- Surface: `SellerService.set_logo()` raises `InvalidOperationException`
- Handling: 409 via Flask error handler. Message: "Cannot set logo because file type not allowed: application/pdf"
- Guardrails: `detect_mime_type` + check against `allowed_image_types`.
- Evidence: `app/services/document_service.py:124-152` -- `_validate_file_type` pattern.

- Failure: Uploaded file exceeds max image size
- Surface: `SellerService.set_logo()` raises `InvalidOperationException`
- Handling: 409 via Flask error handler. Message: "Cannot set logo because file too large, maximum size: 10.0MB"
- Guardrails: Check `len(file_bytes)` against `app_settings.max_image_size`.
- Evidence: `app/services/document_service.py:154-171` -- `_validate_file_size` pattern.

- Failure: Seller not found
- Surface: Both PUT and DELETE logo endpoints
- Handling: 404 via `RecordNotFoundException` -> Flask error handler.
- Guardrails: `get_seller()` already raises this.
- Evidence: `app/services/seller_service.py:46-61` -- existing pattern.

- Failure: S3 upload fails
- Surface: `SellerService.set_logo()` during upload step
- Handling: `InvalidOperationException` propagates, Flask rolls back the transaction (logo_s3_key is not persisted).
- Guardrails: Persist-before-S3 pattern ensures no dangling column values.
- Evidence: `app/services/document_service.py:308-326` -- same S3 failure handling.

- Failure: Non-multipart Content-Type on logo upload
- Surface: `PUT /sellers/<id>/logo` API endpoint
- Handling: 400 with error message "Content-Type must be multipart/form-data"
- Guardrails: Check `request.content_type` before processing.
- Evidence: `app/api/ai_parts.py:64-67` -- existing content-type check pattern.

---

## 9) Observability / Telemetry

This is a minor feature with simple request-response flows. No new metrics are warranted -- the existing Flask request metrics and S3 service metrics (latency, errors) already cover the operations. If logo uploads become frequent or latency-sensitive, metrics can be added later.

No new background work, no new timers, no new counters.

---

## 10) Background Work & Shutdown

No background work is introduced by this feature. Logo upload and delete are synchronous request-scoped operations. No shutdown hooks needed.

---

## 11) Security & Permissions

- Concern: File upload validation (prevent non-image uploads masquerading as images)
- Touchpoints: `SellerService.set_logo()` validates using `python-magic` (content-based detection, not header-based).
- Mitigation: `detect_mime_type` uses `magic.from_buffer()` to detect actual content type regardless of declared Content-Type or file extension.
- Residual risk: Polyglot files that pass magic detection as images. Acceptable for a single-user hobby app.
- Evidence: `app/utils/mime_handling.py:1-30` -- magic-based detection.

---

## 12) UX / UI Impact

- Entry point: Seller detail page and seller list views
- Change: Frontend can now display seller logos wherever sellers appear (lists, part details, shopping lists).
- User interaction: The `logo_url` field in seller responses provides a CAS URL that can be used with `?thumbnail=<size>` for rendering.
- Dependencies: Frontend needs to call `PUT /api/sellers/<id>/logo` with multipart form data and handle `DELETE /api/sellers/<id>/logo`.

---

## 13) Deterministic Test Plan

- Surface: `SellerService.set_logo()`
- Scenarios:
  - Given a seller exists and a valid PNG image, When `set_logo` is called, Then `seller.logo_s3_key` is set to a CAS key and `seller.logo_url` returns a `/api/cas/<hash>` URL.
  - Given a seller exists and a valid JPEG image, When `set_logo` is called, Then `seller.logo_s3_key` is updated accordingly.
  - Given a seller exists and a PDF file, When `set_logo` is called, Then `InvalidOperationException` is raised with "file type not allowed".
  - Given a seller exists and an image exceeding max size, When `set_logo` is called, Then `InvalidOperationException` is raised with "file too large".
  - Given a seller exists and already has a logo, When `set_logo` is called with a new image, Then `logo_s3_key` is updated to the new CAS key (replaces previous).
  - Given a non-existent seller ID, When `set_logo` is called, Then `RecordNotFoundException` is raised.
  - Given a seller exists and an image whose CAS key already exists in S3, When `set_logo` is called, Then the S3 upload is skipped (dedup) and the key is still assigned.
- Fixtures / hooks: `sample_image_file` fixture (from `tests/domain_fixtures.py`), `sample_pdf_bytes` fixture, mock or real S3Service. Container fixture provides wired SellerService.
- Gaps: None.
- Evidence: `tests/domain_fixtures.py:82-90` -- `sample_image_file` fixture creates 100x100 PNG.

- Surface: `SellerService.delete_logo()`
- Scenarios:
  - Given a seller with a logo, When `delete_logo` is called, Then `seller.logo_s3_key` is set to `None` and `seller.logo_url` returns `None`.
  - Given a seller without a logo, When `delete_logo` is called, Then no error is raised and `seller.logo_s3_key` remains `None`.
  - Given a non-existent seller ID, When `delete_logo` is called, Then `RecordNotFoundException` is raised.
- Fixtures / hooks: Standard container fixture.
- Gaps: None.
- Evidence: `tests/services/test_seller_service.py:1-413` -- existing test structure.

- Surface: `PUT /api/sellers/<id>/logo` API endpoint
- Scenarios:
  - Given a seller exists, When a valid PNG image is uploaded via multipart, Then 200 is returned with SellerResponseSchema including `logo_url`.
  - Given a seller exists, When no file is included in the multipart request, Then 400 is returned.
  - Given a seller exists, When a non-image file (PDF) is uploaded, Then 409 is returned.
  - Given a non-existent seller ID, When logo upload is attempted, Then 404 is returned.
  - Given a seller exists, When Content-Type is not multipart/form-data, Then 400 is returned.
- Fixtures / hooks: Flask test client, S3 mock or test container.
- Gaps: None.
- Evidence: `tests/api/test_seller_api.py:1-419` -- existing API test patterns.

- Surface: `DELETE /api/sellers/<id>/logo` API endpoint
- Scenarios:
  - Given a seller with a logo, When DELETE logo is called, Then 200 is returned with `logo_url: null`.
  - Given a seller without a logo, When DELETE logo is called, Then 200 is returned with `logo_url: null` (no error).
  - Given a non-existent seller ID, When DELETE logo is called, Then 404 is returned.
- Fixtures / hooks: Flask test client.
- Gaps: None.
- Evidence: `tests/api/test_seller_api.py:282-306` -- existing delete patterns.

- Surface: Schema structure assertions (existing tests)
- Scenarios:
  - Given a seller, When GET `/api/sellers/<id>` is called, Then response has fields `{id, name, website, logo_url, created_at, updated_at}` (6 fields).
  - Given a seller, When GET `/api/sellers` is called, Then each item has fields `{id, name, website, logo_url}` (4 fields).
- Fixtures / hooks: Standard test fixtures.
- Gaps: None.
- Evidence: `tests/api/test_seller_api.py:373-418` -- existing structure tests that assert field sets (must be updated).

---

## 14) Implementation Slices

- Slice: Model + Migration
- Goal: Database schema is updated with the new column and the Seller model exposes `logo_url`.
- Touches: `app/models/seller.py`, `alembic/versions/022_add_seller_logo_s3_key.py` (new).
- Dependencies: None (foundation for everything else).

- Slice: Service + DI Wiring
- Goal: SellerService can upload and delete logos via CAS S3 storage.
- Touches: `app/services/seller_service.py`, `app/services/container.py`.
- Dependencies: Slice 1 (model changes).

- Slice: Schemas + API
- Goal: Frontend can upload/delete logos and see `logo_url` in all seller responses.
- Touches: `app/schemas/seller.py`, `app/api/sellers.py`.
- Dependencies: Slice 2 (service methods).

- Slice: Tests
- Goal: Full test coverage for new service methods and API endpoints.
- Touches: `tests/services/test_seller_service.py`, `tests/api/test_seller_api.py`.
- Dependencies: Slices 1-3 (implementation complete).

---

## 15) Risks & Open Questions

- Risk: S3 unavailable during tests (sandbox environment without MinIO).
- Impact: Logo upload tests that call real S3 will fail.
- Mitigation: Service tests should mock `s3_service` (generate_cas_key, file_exists, upload_file). API tests use the container which may have S3 available via test infra; if not, mock at the service level.

- Risk: Existing test assertions on exact schema field counts break when `logo_url` is added.
- Impact: Two existing test methods fail (`test_seller_response_schema_structure`, `test_seller_list_schema_structure`).
- Mitigation: Update those test assertions as part of the tests slice.

- Risk: `detect_mime_type` behavior with edge-case image formats (e.g., SVG may detect as `text/xml`).
- Impact: SVG logos might be rejected.
- Mitigation: `allowed_image_types` includes `image/svg+xml` but `magic` may detect SVGs as `text/xml` or `text/html`. For a hobby app, this is acceptable -- users can use PNG/JPEG. If SVG support is needed later, add a specific SVG check.

No open questions remain -- the change brief is precise and all patterns are well-established in the codebase.

---

## 16) Confidence

Confidence: High -- This is a minor, well-scoped addition that directly follows established CAS upload and model property patterns found throughout the codebase (Part.cover_url, Attachment.attachment_url, DocumentService._create_attachment).
