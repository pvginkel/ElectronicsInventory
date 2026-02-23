# Seller Logo -- Code Review

## 1) Summary & Decision

**Readiness**

The seller logo implementation is clean, well-structured, and closely follows the approved plan and established project patterns. The model adds a nullable `logo_s3_key` column with a `logo_url` property mirroring `Part.cover_url`. The service layer correctly implements the "persist DB before S3" pattern with CAS deduplication. The API layer is thin and delegates to the service properly. The Alembic migration is straightforward. Schemas expose `logo_url` in both response and list schemas. Tests are comprehensive, covering happy paths, error conditions, edge cases (dedup, replace, S3 failure), and API-level validation. No correctness issues were found.

**Decision**

`GO` -- Implementation faithfully follows the plan, adheres to project architecture patterns, includes comprehensive tests, and no correctness issues were identified.

---

## 2) Conformance to Plan (with evidence)

**Plan alignment**

- `Plan Section 2: Model + logo_s3_key column` ↔ `app/models/seller.py:20` -- `logo_s3_key: Mapped[str | None] = mapped_column(String(500), nullable=True)` matches plan exactly.
- `Plan Section 2: logo_url property` ↔ `app/models/seller.py:28-35` -- `@property def logo_url` calls `build_cas_url(self.logo_s3_key)`, matching the Part.cover_url pattern as specified.
- `Plan Section 2: Alembic migration 022` ↔ `alembic/versions/022_add_seller_logo_s3_key.py:21-25` -- Adds `logo_s3_key VARCHAR(500) nullable` to `sellers` table. `down_revision = "021"` is correct.
- `Plan Section 2: SellerService.set_logo()` ↔ `app/services/seller_service.py:176-225` -- Implements all 10 steps from the plan: lookup, size validation, MIME detection, allowed type check, CAS key generation, persist-before-S3, dedup, upload.
- `Plan Section 2: SellerService.delete_logo()` ↔ `app/services/seller_service.py:227-245` -- Sets `logo_s3_key = None`, flushes, no S3 deletion. Matches plan exactly.
- `Plan Section 2: DI wiring` ↔ `app/services/container.py:135-140` -- `seller_service` Factory now receives `s3_service` and `app_settings=app_config`. Matches plan.
- `Plan Section 2: Schema updates` ↔ `app/schemas/seller.py:63-67` and `app/schemas/seller.py:93-97` -- `logo_url: str | None` added to both `SellerResponseSchema` and `SellerListSchema` with `Field(default=None)`.
- `Plan Section 4: PUT /sellers/<id>/logo` ↔ `app/api/sellers.py:77-99` -- Multipart upload endpoint with content-type check, file validation, and delegation to `seller_service.set_logo()`.
- `Plan Section 4: DELETE /sellers/<id>/logo` ↔ `app/api/sellers.py:102-110` -- Simple delegation to `seller_service.delete_logo()`, returns 200 with updated entity.
- `Plan Section 13: Test coverage` ↔ `tests/services/test_seller_service.py:419-628` and `tests/api/test_seller_api.py:429-693` -- All planned scenarios are implemented.

**Gaps / deviations**

- `Plan Section 5, Step 5: Validate file size against max_image_size` -- The plan lists size validation as step 5 (after MIME detection at step 3-4), but the implementation checks size first (before MIME detection) at `app/services/seller_service.py:195-201`. This is a benign deviation -- checking size first is actually an improvement because it avoids calling `detect_mime_type` on an oversized file. No issue.
- `Plan Section 2: app_settings dependency` -- The plan mentions injecting `app_settings` and the container wires `app_settings=app_config`. The parameter name in the Factory is `app_settings` mapping to the container's `app_config` provider, which is correct and consistent with how other services receive it (e.g., `CasImageService` at `app/services/container.py:115`).

---

## 3) Correctness -- Findings (ranked)

No Blocker or Major findings.

- Title: `Minor -- API logo endpoints lack @api.validate decorators for OpenAPI documentation`
- Evidence: `app/api/sellers.py:77-78` and `app/api/sellers.py:102-103` -- The `set_seller_logo` and `delete_seller_logo` endpoints do not have `@api.validate` decorators.
- Impact: These endpoints will not appear in the auto-generated OpenAPI specification. Functionally correct, but the API documentation will be incomplete.
- Fix: This is consistent with the existing pattern for multipart upload endpoints (e.g., `attachment_sets.py:41-42` also lacks `@api.validate` for file uploads since SpectTree does not support multipart schema validation). For the DELETE endpoint, adding `@api.validate(resp=SpectreeResponse(HTTP_200=SellerResponseSchema, HTTP_404=ErrorResponseSchema))` would be straightforward and would document the endpoint. For PUT, SpectTree's multipart limitation makes this harder.
- Confidence: High

- Title: `Minor -- Duplicated _make_png_bytes() and _make_pdf_bytes() helper methods across test classes`
- Evidence: `tests/services/test_seller_service.py:422-436` and `tests/api/test_seller_api.py:432-477` -- Both `TestSellerServiceLogo` and `TestSellerLogoAPI` define their own `_make_png_bytes()` and `_make_pdf_bytes()` static methods.
- Impact: Minor duplication. If the image generation logic needs to change, it must be updated in two places.
- Fix: Consider extracting these into shared fixtures in `tests/domain_fixtures.py` (there is already a `sample_image_file` fixture there). However, static method helpers co-located with their test class is also a valid pattern. Not blocking.
- Confidence: High

---

## 4) Over-Engineering & Refactoring Opportunities

No over-engineering was found. The implementation is minimal and appropriately scoped.

- Hotspot: None identified.

The code follows the simplest approach: a nullable column on the model, a property for URL generation, straightforward service methods, and thin API endpoints. There are no unnecessary abstractions, no premature generalization, and no extra indirection layers. This is exactly the right level of complexity for the feature.

---

## 5) Style & Consistency

- Pattern: Content-type validation in API layer is consistent with existing patterns
- Evidence: `app/api/sellers.py:85-87` matches `app/api/attachment_sets.py:48-53` and `app/api/ai_parts.py:64-67`
- Impact: None -- correctly follows existing conventions.
- Recommendation: None needed.

- Pattern: Service constructor injection matches project conventions
- Evidence: `app/services/seller_service.py:26-34` -- `db`, `s3_service`, `app_settings` follow the same constructor pattern as `DocumentService`, `CasImageService`, and other services that need S3 access.
- Impact: None -- correctly follows established DI pattern.
- Recommendation: None needed.

- Pattern: Error messages follow project conventions (`InvalidOperationException` with operation + reason)
- Evidence: `app/services/seller_service.py:198-200` -- `InvalidOperationException("set logo", "file too large, maximum size: ...")` matches the two-argument pattern used throughout the codebase.
- Impact: None -- consistent.
- Recommendation: None needed.

---

## 6) Tests & Deterministic Coverage (new/changed behavior only)

- Surface: `SellerService.set_logo()`
- Scenarios:
  - Given a valid PNG image, When `set_logo` is called, Then `logo_s3_key` is set to a CAS key and `logo_url` returns a valid URL (`tests/services/test_seller_service.py::TestSellerServiceLogo::test_set_logo_valid_png`)
  - Given a valid JPEG image, When `set_logo` is called, Then `logo_s3_key` is set (`tests/services/test_seller_service.py::TestSellerServiceLogo::test_set_logo_valid_jpeg`)
  - Given a PDF file, When `set_logo` is called, Then `InvalidOperationException` is raised (`tests/services/test_seller_service.py::TestSellerServiceLogo::test_set_logo_invalid_file_type_pdf`)
  - Given a text file, When `set_logo` is called, Then `InvalidOperationException` is raised (`tests/services/test_seller_service.py::TestSellerServiceLogo::test_set_logo_invalid_file_type_text`)
  - Given an oversized file, When `set_logo` is called, Then `InvalidOperationException` is raised (`tests/services/test_seller_service.py::TestSellerServiceLogo::test_set_logo_file_too_large`)
  - Given a non-existent seller, When `set_logo` is called, Then `RecordNotFoundException` is raised (`tests/services/test_seller_service.py::TestSellerServiceLogo::test_set_logo_nonexistent_seller`)
  - Given an existing logo, When `set_logo` is called with a different image, Then the CAS key is replaced (`tests/services/test_seller_service.py::TestSellerServiceLogo::test_set_logo_replaces_existing`)
  - Given a CAS key already in S3, When `set_logo` is called, Then `upload_file` is skipped (`tests/services/test_seller_service.py::TestSellerServiceLogo::test_set_logo_cas_dedup_skips_upload`)
  - Given S3 upload fails, When `set_logo` is called, Then exception propagates for rollback (`tests/services/test_seller_service.py::TestSellerServiceLogo::test_set_logo_s3_upload_failure_rolls_back`)
- Hooks: Container-based DI, `sample_pdf_bytes` fixture from `tests/domain_fixtures.py`, `patch.object` for S3 spy/mock.
- Gaps: None -- all plan scenarios are covered.
- Evidence: `tests/services/test_seller_service.py:438-568`

- Surface: `SellerService.delete_logo()`
- Scenarios:
  - Given a seller with a logo, When `delete_logo` is called, Then `logo_s3_key` and `logo_url` are None (`tests/services/test_seller_service.py::TestSellerServiceLogo::test_delete_logo_with_logo`)
  - Given a seller without a logo, When `delete_logo` is called, Then no error and `logo_s3_key` remains None (`tests/services/test_seller_service.py::TestSellerServiceLogo::test_delete_logo_without_logo`)
  - Given a non-existent seller, When `delete_logo` is called, Then `RecordNotFoundException` is raised (`tests/services/test_seller_service.py::TestSellerServiceLogo::test_delete_logo_nonexistent_seller`)
- Hooks: Container-based DI.
- Gaps: None.
- Evidence: `tests/services/test_seller_service.py:570-606`

- Surface: `Seller.logo_url` property
- Scenarios:
  - Given `logo_s3_key` is None, Then `logo_url` is None (`tests/services/test_seller_service.py::TestSellerServiceLogo::test_logo_url_none_when_no_logo`)
  - Given `logo_s3_key` is set, Then `logo_url` returns `/api/cas/<64-char-hash>` (`tests/services/test_seller_service.py::TestSellerServiceLogo::test_logo_url_returns_cas_url_when_set`)
- Hooks: Container-based DI.
- Gaps: None.
- Evidence: `tests/services/test_seller_service.py:608-628`

- Surface: `PUT /api/sellers/<id>/logo`
- Scenarios:
  - Given valid PNG upload, When PUT is sent, Then 200 with `logo_url` in response (`tests/api/test_seller_api.py::TestSellerLogoAPI::test_set_logo_success`)
  - Given no file in multipart, When PUT is sent, Then 400 (`tests/api/test_seller_api.py::TestSellerLogoAPI::test_set_logo_no_file`)
  - Given wrong content-type, When PUT is sent, Then 400 (`tests/api/test_seller_api.py::TestSellerLogoAPI::test_set_logo_invalid_content_type`)
  - Given PDF file, When PUT is sent, Then 409 (`tests/api/test_seller_api.py::TestSellerLogoAPI::test_set_logo_invalid_file_type`)
  - Given non-existent seller, When PUT is sent, Then 404 (`tests/api/test_seller_api.py::TestSellerLogoAPI::test_set_logo_seller_not_found`)
  - Given existing logo, When PUT is sent with different image, Then logo is replaced (`tests/api/test_seller_api.py::TestSellerLogoAPI::test_set_logo_replaces_existing`)
- Hooks: Flask test client, container-based DI with S3.
- Gaps: None.
- Evidence: `tests/api/test_seller_api.py:479-602`

- Surface: `DELETE /api/sellers/<id>/logo`
- Scenarios:
  - Given seller with logo, When DELETE is sent, Then 200 with `logo_url: null` (`tests/api/test_seller_api.py::TestSellerLogoAPI::test_delete_logo_with_logo`)
  - Given seller without logo, When DELETE is sent, Then 200 with `logo_url: null` (`tests/api/test_seller_api.py::TestSellerLogoAPI::test_delete_logo_without_logo`)
  - Given non-existent seller, When DELETE is sent, Then 404 (`tests/api/test_seller_api.py::TestSellerLogoAPI::test_delete_logo_seller_not_found`)
- Hooks: Flask test client, container-based DI.
- Gaps: None.
- Evidence: `tests/api/test_seller_api.py:604-648`

- Surface: Schema/response integration (existing test updates)
- Scenarios:
  - Given a seller, When GET `/api/sellers/<id>` is called, Then response fields include `logo_url` (6 total fields) (`tests/api/test_seller_api.py::TestSellerAPI::test_seller_response_schema_structure`)
  - Given a seller, When GET `/api/sellers` is called, Then list items include `logo_url` (4 total fields) (`tests/api/test_seller_api.py::TestSellerAPI::test_seller_list_schema_structure`)
  - Given a seller with logo, When GET `/api/sellers` is called, Then `logo_url` contains CAS URL (`tests/api/test_seller_api.py::TestSellerLogoAPI::test_logo_url_in_list_after_upload`)
  - Given a seller with logo, When GET `/api/sellers/<id>` is called, Then `logo_url` contains CAS URL (`tests/api/test_seller_api.py::TestSellerLogoAPI::test_logo_url_in_detail_after_upload`)
- Hooks: Flask test client.
- Gaps: None.
- Evidence: `tests/api/test_seller_api.py:379-426` and `tests/api/test_seller_api.py:650-693`

---

## 7) Adversarial Sweep

### Attack 1: Persist-before-S3 pattern -- can logo_s3_key be left dangling?

- Checks attempted: If `s3_service.upload_file()` raises an exception after `self.db.flush()` has persisted `logo_s3_key`, does the transaction roll back properly?
- Evidence: `app/services/seller_service.py:217-222` -- The service flushes at line 219, then attempts S3 upload at line 222. If upload fails, the exception propagates up to Flask's request handler, which rolls back the session transaction. The `logo_s3_key` value set at line 218 is therefore never committed.
- Test confirmation: `tests/services/test_seller_service.py:554-568` -- `test_set_logo_s3_upload_failure_rolls_back` mocks `upload_file` to raise `InvalidOperationException` and confirms the exception propagates.
- Why code held up: The persist-before-S3 pattern is correctly implemented. A failed upload causes the entire request transaction to roll back, so `logo_s3_key` is never committed to the database.

### Attack 2: CAS dedup -- can file_exists return stale data?

- Checks attempted: If `file_exists` returns True but the blob was actually deleted from S3, the logo_s3_key would point to a non-existent blob.
- Evidence: `app/services/seller_service.py:221-222` -- CAS blobs are never deleted (by design, per CLAUDE.md and plan). The `file_exists` check at line 221 is a dedup optimization, not a correctness guard. Even if `file_exists` returned a stale True, the only consequence would be a missing blob served as a 404 by the CAS endpoint -- which is a pre-existing CAS infrastructure concern, not specific to this feature.
- Why code held up: CAS immutability is a project-wide invariant. The seller logo feature correctly relies on it.

### Attack 3: Migration chain integrity -- does 022 depend on 021?

- Checks attempted: Migration 022 has `down_revision = "021"`. Is 021 committed and present in the migration chain?
- Evidence: `alembic/versions/021_create_part_sellers_table.py` is committed in the `part_sellers` branch (`git log` shows commit `ea31b03`). Migration 022 at `alembic/versions/022_add_seller_logo_s3_key.py:16` correctly declares `down_revision: str | None = "021"`. The upgrade/downgrade functions only add/drop a single nullable column and have no dependency on the 021 migration's table.
- Why code held up: The migration chain is correctly ordered and the operations are independent (adding a column to an existing table).

### Attack 4: DI wiring -- is seller_service properly receiving s3_service?

- Checks attempted: Verified that the container wires `s3_service` and `app_settings` into `SellerService`, and that all downstream consumers of `seller_service` (like `PartSellerService`, `ShoppingListLineService`) are unaffected.
- Evidence: `app/services/container.py:135-140` -- `seller_service = providers.Factory(SellerService, db=db_session, s3_service=s3_service, app_settings=app_config)`. The `SellerService` constructor at `app/services/seller_service.py:26-34` accepts these parameters and stores them. Downstream services like `PartSellerService` at `container.py:141-146` inject `seller_service` by reference, so the additional constructor params are transparent.
- Why code held up: The Factory pattern creates a new instance per request with the correct dependencies. The container wiring is correct and tested implicitly by all tests that use `container.seller_service()`.

### Attack 5: Test data drift -- does sellers.json need updating?

- Checks attempted: The new column is nullable with no default. Existing test data in `app/data/test_data/sellers.json` does not include `logo_s3_key`.
- Evidence: `app/data/test_data/sellers.json` -- 7 sellers with `id`, `name`, `website` only. Since `logo_s3_key` is `nullable=True` (at `app/models/seller.py:20`), existing rows will have `NULL` for this column. The `load-test-data` command will work without modification.
- Why code held up: Nullable columns do not require test data updates. The plan explicitly noted this at `plan.md` section 2, Area `app/data/test_data/sellers.json`.

---

## 8) Invariants Checklist

- Invariant: If `logo_s3_key` is non-null, a corresponding CAS blob exists in S3.
  - Where enforced: `app/services/seller_service.py:217-222` -- Flush persists the key, then upload ensures the blob exists (or was already present via dedup).
  - Failure mode: S3 upload fails after flush, leaving a committed `logo_s3_key` pointing to nothing.
  - Protection: The exception propagates, causing Flask to roll back the transaction. The `logo_s3_key` is never committed. Tested at `tests/services/test_seller_service.py:554-568`.
  - Evidence: `app/services/seller_service.py:215-222`

- Invariant: `logo_url` is always `None` when `logo_s3_key` is `None`, and always a valid `/api/cas/<hash>` URL when `logo_s3_key` is set.
  - Where enforced: `app/models/seller.py:28-35` -- The `@property` delegates to `build_cas_url()`.
  - Failure mode: `build_cas_url` returns `None` for a non-CAS-format key, or returns a malformed URL.
  - Protection: `build_cas_url` at `app/utils/cas_url.py:10-52` validates the CAS key format with regex `^cas/[0-9a-f]{64}$`. The `generate_cas_key` method always produces keys in this format. Tested at `tests/services/test_seller_service.py:608-628`.
  - Evidence: `app/utils/cas_url.py:7,30-36` and `app/models/seller.py:35`

- Invariant: Deleting a seller's logo never deletes the S3 blob (CAS immutability).
  - Where enforced: `app/services/seller_service.py:227-244` -- `delete_logo` only sets `logo_s3_key = None` and flushes. No S3 operations are performed.
  - Failure mode: Someone adds S3 deletion to `delete_logo`, breaking CAS sharing.
  - Protection: The method explicitly documents "No S3 deletion is performed because CAS blobs may be shared" in the docstring. Tested at `tests/services/test_seller_service.py:570-585`.
  - Evidence: `app/services/seller_service.py:229-231`

- Invariant: File type validation uses magic-based content detection, not HTTP headers or file extensions.
  - Where enforced: `app/services/seller_service.py:203-206` -- Passes `None` as `http_content_type` to `detect_mime_type`, forcing content-based detection.
  - Failure mode: Passing a truthy `http_content_type` would let the caller spoof the MIME type.
  - Protection: The `None` parameter is intentional and documented with a guidepost comment. Tested with PDF and text file inputs at `tests/services/test_seller_service.py:463-482`.
  - Evidence: `app/services/seller_service.py:203-206` and `app/utils/mime_handling.py:19-25`

---

## 9) Questions / Needs-Info

No blocking questions. The implementation is complete and aligns with the plan.

---

## 10) Risks & Mitigations (top 3)

- Risk: S3 unavailability during API tests could cause test failures in environments without MinIO.
- Mitigation: The service tests for S3 failure (`test_set_logo_s3_upload_failure_rolls_back`) use `patch.object` to mock S3. The API tests that exercise the full upload path (`test_set_logo_success`, `test_set_logo_replaces_existing`, etc.) require a working S3 backend. The test infrastructure already provides MinIO for the test suite, so this is the existing status quo, not a new risk.
- Evidence: `tests/services/test_seller_service.py:554-568` (mocked) and `tests/api/test_seller_api.py:479-501` (integration)

- Risk: SVG files may be rejected due to `python-magic` detecting them as `text/xml` rather than `image/svg+xml`.
- Mitigation: The plan acknowledges this at section 15 and accepts the limitation for a hobby app. PNG and JPEG are the primary use cases for seller logos. If SVG support is needed later, a specific SVG detection fallback can be added to `detect_mime_type`.
- Evidence: `app/services/seller_service.py:206-207` and `app/app_config.py:138-139`

- Risk: Empty file bytes (0-length) could pass through to `detect_mime_type` and `generate_cas_key`.
- Mitigation: An empty file would fail the magic-based MIME detection (returning `application/x-empty` or similar), which is not in `allowed_image_types`, so the upload would be rejected with "file type not allowed". This is the correct behavior and does not require an explicit empty-file check.
- Evidence: `app/services/seller_service.py:206-211`

---

## 11) Confidence

Confidence: High -- The implementation is clean, follows established patterns precisely, and is comprehensively tested with 15 service tests and 11 API tests covering all plan scenarios including error paths, edge cases, and CAS deduplication.
