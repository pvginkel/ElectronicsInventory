# Seller Logo -- Plan Review

## 1) Summary & Decision

**Readiness**

The plan is well-researched, tightly scoped, and closely follows established codebase patterns (CAS upload, persist-before-S3, model properties). The research log at `plan.md:1-28` demonstrates thorough code archaeology, and every file map entry is backed by line-range evidence. The test plan is comprehensive with clear Given/When/Then scenarios. There are a small number of issues: a contradictory out-of-scope statement about file size validation, a missing seller-lookup step in the `set_logo` algorithm, and no explicit mention of the SpectTree decoration pattern for the new endpoints. None of these are blockers.

**Decision**

`GO-WITH-CONDITIONS` -- Three Minor issues should be resolved before implementation to avoid ambiguity: the out-of-scope contradiction, the missing algorithm step, and clarification on SpectTree handling for multipart endpoints. All are straightforward fixes.

## 2) Conformance & Fit (with evidence)

**Conformance to refs**

- `CLAUDE.md` (layered architecture) -- Pass -- `plan.md:92-128` -- File map follows Model -> Service -> Schema -> API -> Migration ordering. Service owns business logic (validation, CAS key generation); API is thin (multipart extraction, delegation).
- `CLAUDE.md` (persist before S3) -- Pass -- `plan.md:205-207` -- "Update `seller.logo_s3_key`, flush session, then check `file_exists` / upload." Matches `S3 Storage Consistency` section in CLAUDE.md.
- `CLAUDE.md` (no S3 deletion on CAS delete) -- Pass -- `plan.md:220` -- "No S3 deletion per CAS policy." Matches `CLAUDE.md` guidance: "Log and swallow storage errors because S3 cleanup is best-effort."
- `CLAUDE.md` (DI pattern) -- Pass -- `plan.md:106-108` -- Plans to wire `s3_service` and `app_config` into SellerService Factory. References `container.py:135`.
- `CLAUDE.md` (test requirements) -- Pass -- `plan.md:333-383` -- Service and API test scenarios cover success paths, error conditions, edge cases, and schema structure assertions.
- `CLAUDE.md` (native_enum=False / no PG ENUM types) -- Pass (not applicable) -- New column is `VARCHAR(500)`, no enum involved.
- `docs/product_brief.md` (seller data) -- Pass -- `plan.md:31-36` -- Adding logo enriches the seller entity. Product brief Section 5 defines seller as having "Seller and seller product page link"; a logo is a natural visual extension. No product-brief conflict.
- `docs/commands/plan_feature.md` (required headings) -- Pass -- `plan.md:1-432` -- All 16 headings present. User Requirements Checklist included verbatim at `plan.md:70-88`.

**Fit with codebase**

- `app/services/seller_service.py` -- `plan.md:102-104` -- Constructor currently takes only `db: Session`. Plan correctly identifies need to add `s3_service` and `app_settings`. No other services depend on SellerService's constructor signature except the container (`container.py:135`) and `PartSellerService` / `ShoppingListLineService` which consume the factory output, not its constructor args. Verified at `container.py:136-141, 224-230`.
- `app/schemas/seller.py` -- `plan.md:98-100` -- Adding `logo_url: str | None` to both schemas is straightforward. `from_attributes=True` is already set at `seller.py:49,74`. The model `@property` pattern matches `Part.cover_url` at `part.py:103-116`.
- `app/utils/cas_url.py` -- `plan.md:10-11` -- `build_cas_url` returns `None` for `None` input (`cas_url.py:30-31`). Correctly used for `logo_url` property.
- `app/utils/mime_handling.py` -- `plan.md:26` -- Plan calls `detect_mime_type(file_bytes, None)`. This is valid but slightly differs from DocumentService's `_validate_file_type` at `document_service.py:139` which passes the declared `content_type` as `http_content_type`. For logos from direct file upload, `None` is reasonable (no HTTP Content-Type header to trust), and it forces magic-based detection which is more secure.
- `app/api/attachment_sets.py` -- `plan.md:185` -- Existing multipart upload pattern at `attachment_sets.py:41-71` does not use `@api.validate` (SpectTree does not handle multipart). The plan does not mention SpectTree handling for the new endpoints, but the established pattern is clear.

## 3) Open Questions & Ambiguities

- Question: Should `set_logo` accept a `seller_id` parameter and look up the seller internally, or receive a seller instance from the API layer?
- Why it matters: The `set_logo` algorithm at `plan.md:197-208` starts at "Read file bytes" without mentioning how the seller entity is obtained. The `delete_logo` flow (`plan.md:215`) explicitly starts with "Look up Seller by ID." This inconsistency leaves the method signature ambiguous.
- Needed answer: Add the seller lookup step to `set_logo` for symmetry with `delete_logo`, or explicitly document that the API endpoint passes the `seller_id` and the service method handles the lookup.

- Question: Is there an explicit maximum logo size independent of the general `max_image_size`?
- Why it matters: The Out of Scope section at `plan.md:58` says "Logo file size limit enforcement (use existing `max_image_size` from AppSettings)" is out of scope, but the algorithm at `plan.md:204` includes "Validate file size against `app_settings.max_image_size`." These statements contradict each other.
- Needed answer: Clarify that file size validation IS in scope (using the existing `max_image_size` setting), and remove it from the Out of Scope list.

## 4) Deterministic Backend Coverage (new/changed behavior only)

- Behavior: `SellerService.set_logo()` -- CAS logo upload
- Scenarios:
  - Given a seller exists and a valid PNG, When `set_logo` is called, Then `logo_s3_key` is set and `logo_url` returns a CAS URL (`tests/services/test_seller_service.py::TestSellerService::test_set_logo_png`)
  - Given a seller and a PDF, When `set_logo` is called, Then `InvalidOperationException` is raised (`tests/services/test_seller_service.py::TestSellerService::test_set_logo_invalid_type`)
  - Given a seller and an oversized image, When `set_logo` is called, Then `InvalidOperationException` is raised (`tests/services/test_seller_service.py::TestSellerService::test_set_logo_too_large`)
  - Given a seller with an existing logo, When `set_logo` is called with a new image, Then `logo_s3_key` is updated (`tests/services/test_seller_service.py::TestSellerService::test_set_logo_replaces_existing`)
  - Given a CAS key that already exists in S3, When `set_logo` is called, Then the upload is skipped (dedup) (`tests/services/test_seller_service.py::TestSellerService::test_set_logo_dedup`)
- Instrumentation: No new metrics planned. Existing Flask request metrics and S3 service metrics cover the operations. Acceptable for a minor feature.
- Persistence hooks: Alembic migration `022_add_seller_logo_s3_key.py` adds nullable `VARCHAR(500)` column. No test data update needed (nullable column, existing sellers get `NULL`). DI wiring updated in `container.py`.
- Gaps: None.
- Evidence: `plan.md:335-346`, `plan.md:114-116`

- Behavior: `SellerService.delete_logo()` -- logo removal
- Scenarios:
  - Given a seller with a logo, When `delete_logo` is called, Then `logo_s3_key` is `None` (`tests/services/test_seller_service.py::TestSellerService::test_delete_logo`)
  - Given a seller without a logo, When `delete_logo` is called, Then no error is raised (`tests/services/test_seller_service.py::TestSellerService::test_delete_logo_no_logo`)
  - Given a non-existent seller ID, When `delete_logo` is called, Then `RecordNotFoundException` (`tests/services/test_seller_service.py::TestSellerService::test_delete_logo_not_found`)
- Instrumentation: None needed.
- Persistence hooks: Same migration as above.
- Gaps: None.
- Evidence: `plan.md:348-355`

- Behavior: `PUT /api/sellers/<id>/logo` -- multipart upload endpoint
- Scenarios:
  - Given a seller and valid PNG, When PUT with multipart, Then 200 with `logo_url` in response (`tests/api/test_seller_api.py::TestSellerLogoApi::test_upload_logo`)
  - Given no file in request, When PUT, Then 400 (`tests/api/test_seller_api.py::TestSellerLogoApi::test_upload_logo_no_file`)
  - Given non-image file, When PUT, Then 409 (`tests/api/test_seller_api.py::TestSellerLogoApi::test_upload_logo_invalid_type`)
  - Given non-existent seller, When PUT, Then 404 (`tests/api/test_seller_api.py::TestSellerLogoApi::test_upload_logo_not_found`)
  - Given wrong Content-Type, When PUT, Then 400 (`tests/api/test_seller_api.py::TestSellerLogoApi::test_upload_logo_wrong_content_type`)
- Instrumentation: None needed.
- Persistence hooks: No new SpectTree decorations needed for multipart (matches `attachment_sets.py` pattern).
- Gaps: None.
- Evidence: `plan.md:357-366`

- Behavior: `DELETE /api/sellers/<id>/logo` -- logo deletion endpoint
- Scenarios:
  - Given a seller with a logo, When DELETE, Then 200 with `logo_url: null` (`tests/api/test_seller_api.py::TestSellerLogoApi::test_delete_logo`)
  - Given a seller without a logo, When DELETE, Then 200 with `logo_url: null` (`tests/api/test_seller_api.py::TestSellerLogoApi::test_delete_logo_no_logo`)
  - Given non-existent seller, When DELETE, Then 404 (`tests/api/test_seller_api.py::TestSellerLogoApi::test_delete_logo_not_found`)
- Instrumentation: None needed.
- Persistence hooks: None beyond the migration.
- Gaps: None.
- Evidence: `plan.md:368-375`

- Behavior: Updated schema structure assertions
- Scenarios:
  - Given a seller, When GET by ID, Then response includes `logo_url` field (6 fields total) (`tests/api/test_seller_api.py::test_seller_response_schema_structure`)
  - Given a seller, When GET list, Then each item includes `logo_url` field (4 fields total) (`tests/api/test_seller_api.py::test_seller_list_schema_structure`)
- Instrumentation: N/A.
- Persistence hooks: N/A.
- Gaps: None.
- Evidence: `plan.md:377-383`, existing tests at `tests/api/test_seller_api.py:373-418`

## 5) Adversarial Sweep

**Minor -- Missing seller lookup step in `set_logo` algorithm**
**Evidence:** `plan.md:197-208` -- The `set_logo` flow starts at "Read file bytes from the uploaded file object" (step 1) and reaches "Update `seller.logo_s3_key = cas_key` on the Seller model instance" (step 6) without ever looking up the seller by ID. Compare with `delete_logo` at `plan.md:215` which correctly starts with "Look up Seller by ID (raise `RecordNotFoundException` if not found)."
**Why it matters:** Without this step, the implementer must infer that `set_logo` should accept `seller_id` and call `self.get_seller(seller_id)`. The missing step makes the algorithm incomplete and could lead to the API endpoint performing the lookup instead, violating the service-owns-business-logic pattern.
**Fix suggestion:** Add step 0 to `set_logo`: "Look up Seller by ID; raise `RecordNotFoundException` if not found."
**Confidence:** High

**Minor -- Out-of-scope contradiction on file size validation**
**Evidence:** `plan.md:58` says "Logo file size limit enforcement (use existing `max_image_size` from AppSettings)" is **out of scope**. But `plan.md:204` says step 4 is "Validate file size against `app_settings.max_image_size`; raise `InvalidOperationException` if exceeded." The `max_image_size` error case is also documented at `plan.md:274-278`.
**Why it matters:** An implementer reading the Out of Scope section would skip file size validation, but the algorithm and error section include it. This is confusing and contradictory.
**Fix suggestion:** Remove the file size line from Out of Scope. It is clearly in scope per the algorithm. The "out of scope" intent was likely about a *separate* logo-specific size limit, not about using the existing one.
**Confidence:** High

**Minor -- `detect_mime_type` invocation differs from DocumentService pattern**
**Evidence:** `plan.md:201-202` says "Detect MIME type using `detect_mime_type(file_bytes, None)`." DocumentService at `document_service.py:139` passes the declared content type: `detect_mime_type(file_data, content_type)`. For multipart uploads, `request.files['file'].content_type` is available and could be passed.
**Why it matters:** Passing `None` as `http_content_type` forces pure magic-based detection. This is slightly more secure but means SVG files (which `magic` may detect as `text/xml`) could be rejected even though they are in `allowed_image_types`. The plan already acknowledges the SVG edge case at `plan.md:421-423`, so this is intentional and acceptable.
**Fix suggestion:** No change needed, but the plan should explicitly note this intentional divergence from DocumentService and the rationale (no HTTP Content-Type header for direct file uploads vs. downloaded content). A brief comment in the algorithm would suffice.
**Confidence:** Medium

## 6) Derived-Value & Persistence Invariants

- Derived value: `Seller.logo_url` (computed property)
  - Source dataset: Unfiltered; single column `logo_s3_key` on the same row.
  - Write / cleanup triggered: None. Read-only property, no persistence side effects.
  - Guards: `build_cas_url` at `cas_url.py:30-36` returns `None` for `None` or non-CAS-format input. No filtered view involved.
  - Invariant: `logo_url` is `None` if and only if `logo_s3_key` is `None` or not in `cas/<hash>` format.
  - Evidence: `plan.md:227-232`, `app/utils/cas_url.py:10-52`

- Derived value: `logo_s3_key` (CAS key on seller row)
  - Source dataset: SHA-256 hash of uploaded image bytes.
  - Write / cleanup triggered: Written by `set_logo` (column update + flush + S3 upload); cleared by `delete_logo` (column set to `None` + flush). No S3 cleanup on delete (CAS shared blobs).
  - Guards: Image type validation via `detect_mime_type` + `allowed_image_types` check before generating the CAS key. Flush before S3 upload ensures rollback on upload failure.
  - Invariant: If `logo_s3_key` is non-null, an S3 object exists at that CAS key. Guaranteed by persist-then-upload with dedup check.
  - Evidence: `plan.md:234-239`, `document_service.py:303-328`

- Derived value: Schema serialization of `logo_url`
  - Source dataset: `Seller.logo_url` property, read via Pydantic `from_attributes=True`.
  - Write / cleanup triggered: None (read-only serialization path).
  - Guards: `from_attributes=True` configured on both `SellerResponseSchema` (`seller.py:49`) and `SellerListSchema` (`seller.py:74`). Pydantic reads `@property` accessors automatically.
  - Invariant: Every seller API response includes `logo_url` as `str | None`, consistent with the model property.
  - Evidence: `plan.md:241-246`, `app/schemas/seller.py:46-88`

No filtered views drive persistent writes in this feature. All derived values use unfiltered, single-row data.

## 7) Risks & Mitigations (top 3)

- Risk: S3 unavailable during service tests causes test failures.
- Mitigation: Plan at `plan.md:413-415` correctly identifies this and recommends mocking `s3_service` in service tests. The existing `sample_image_file` fixture at `tests/domain_fixtures.py:82-90` is reusable. API tests may need the container's S3 or a mock, but this is a standard testing concern.
- Evidence: `plan.md:413-415`, `tests/domain_fixtures.py:82-90`

- Risk: Existing schema structure tests break on field count change.
- Mitigation: Plan at `plan.md:417-419` explicitly identifies the two tests (`test_seller_response_schema_structure`, `test_seller_list_schema_structure`) at `tests/api/test_seller_api.py:373-418` that assert exact field sets and marks them for update. This is well-handled.
- Evidence: `plan.md:417-419`, `tests/api/test_seller_api.py:385,411`

- Risk: SVG files rejected due to `python-magic` detecting them as `text/xml`.
- Mitigation: Plan acknowledges at `plan.md:421-423` that this is acceptable for a hobby app. PNG/JPEG cover the primary use case.
- Evidence: `plan.md:421-423`, `app/app_config.py:138-139`

## 8) Confidence

Confidence: High -- The plan is well-researched, follows established codebase patterns precisely, and has comprehensive test coverage. The three Minor issues identified are straightforward clarifications that do not affect the fundamental design.
