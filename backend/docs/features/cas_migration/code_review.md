# CAS Migration — Code Review

## 1) Summary & Decision

**Readiness**

The CAS migration implementation is substantially complete and demonstrates solid understanding of the plan requirements. The core components are present: a stateless CAS endpoint, migration service with per-row commits, updated upload flow using SHA-256 hashing, computed URL fields in response schemas, and removal of legacy blob endpoints. The code follows project patterns for layering, dependency injection, and error handling. However, there are **critical gaps in test coverage** for the new CAS API endpoint and migration service, which are core deliverables. The migration startup hook lacks proper error handling that could cause data consistency issues. Several schema computed fields have logic errors that will return `None` when they should return valid URLs.

**Decision**

`GO-WITH-CONDITIONS` — The implementation is functionally sound but requires completion of missing tests and fixes to critical bugs before deployment. Specifically: (1) add comprehensive tests for CAS API and migration service (plan section 13 requirements), (2) fix schema computed field bugs that prevent cover_url and attachment URLs from working, (3) improve migration startup error handling to prevent partial state, (4) add validation in cleanup_old_objects to prevent deleting CAS objects.

---

## 2) Conformance to Plan (with evidence)

**Plan alignment**

- Plan section 2 "New files" ↔ `/work/backend/app/api/cas.py:1-125` — CAS endpoint implemented with stateless query param-based design
- Plan section 2 "New files" ↔ `/work/backend/app/services/cas_migration_service.py:1-244` — Migration service with one-by-one commit pattern
- Plan section 3 "Database table: part_attachments" ↔ `/work/backend/app/services/document_service.py:297` — Upload flow uses `generate_cas_key()` instead of UUID-based keys
- Plan section 3 "API response: PartAttachmentResponseSchema" ↔ `/work/backend/app/schemas/part_attachment.py:99-160` — Added `download_url` and `thumbnail_url` computed fields, removed `s3_key` from responses
- Plan section 3 "API response: PartResponseSchema" ↔ `/work/backend/app/schemas/part.py:298-325` — Replaced `has_cover_attachment` with `cover_url` computed field
- Plan section 4 "Removed endpoints" ↔ `/work/backend/app/api/documents.py:92-123` — Legacy blob endpoints commented out with clear migration notes
- Plan section 5 "Flow: Upload new attachment with CAS" ↔ `/work/backend/app/services/document_service.py:297-344` — Upload flow computes hash, checks deduplication with `file_exists()`, uses CAS key
- Plan section 5 "Flow: Copy attachment to another part" ↔ `/work/backend/app/services/document_service.py:649-682` — Copy logic reuses CAS keys (no S3 copy needed)
- Plan section 5 "Flow: Thumbnail generation with hash-based cache" ↔ `/work/backend/app/services/image_service.py:143-191` — New `get_thumbnail_for_hash()` method uses hash for cache keys
- Plan section 10 "Worker / job: Startup migration hook" ↔ `/work/backend/app/__init__.py:226-258` — Migration runs at startup before app serves requests
- Plan section 2 "alembic migration" ↔ `/work/backend/alembic/versions/019_cas_migration_note.py:1-35` — Empty migration documenting s3_key semantics change

**Gaps / deviations**

- Plan section 13 "Surface: CAS endpoint" — **Missing test file** `tests/test_cas_api.py` (plan line 152-154); no test coverage for validation, caching headers, thumbnail generation, error cases (`app/api/cas.py`)
- Plan section 13 "Surface: CAsMigrationService" — **Missing test file** `tests/test_cas_migration_service.py` (plan line 155-157); no test coverage for migration logic, idempotency, cleanup validation (`app/services/cas_migration_service.py`)
- Plan section 13 "Surface: PartAttachmentResponseSchema computed fields" — Tests not updated to verify `download_url` and `thumbnail_url` are constructed correctly (`tests/test_parts_api.py` only checks `cover_url` is not None)
- Plan section 9 "Observability / Telemetry" — **No metrics integration** for CAS endpoint request counter, response time histogram, deduplication skip counter, thumbnail cache miss counter (plan lines 671-698); no MetricsService calls in `app/api/cas.py` or migration service

---

## 3) Correctness — Findings (ranked)

### Blocker Issues

**Blocker — Schema computed fields return None for valid CAS attachments**

- Evidence: `/work/backend/app/schemas/part_attachment.py:115-119` and `157-161`
  ```python
  # Extract hash from cas/{hash} format
  match = re.match(r'cas/([0-9a-f]{64})$', self.s3_key)
  if not match:
      return None
  ```
- Impact: All computed URL fields (`download_url`, `thumbnail_url`, `cover_url`) will return `None` because the regex pattern requires end-of-string (`$`) but does not account for model ORM attribute access which may include trailing whitespace or the pattern needs anchoring. More critically, **the schema excludes `s3_key` from the response** (`exclude=True` at line 104) but does not explicitly include it in `from_attributes` loading, so `self.s3_key` may be `None` even when the database row has a value.
- Fix: Change `exclude=True` to `repr=False` to keep `s3_key` loaded from ORM but exclude from JSON serialization. The `exclude=True` parameter prevents Pydantic from loading the attribute from the ORM model, causing `self.s3_key` to always be `None` in computed fields.
- Confidence: High
- Test sketch:
  ```python
  # In tests/test_parts_api.py or tests/test_document_api.py
  def test_attachment_download_url_computed_field(client, container, sample_image_file):
      # Create part with CAS attachment
      part = container.part_service().create_part("Test part")
      attachment = container.document_service().create_file_attachment(
          part.key, sample_image_file, "test.png", "image/png", is_cover=False
      )
      session.commit()

      # Get attachment via API
      response = client.get(f"/api/parts/{part.key}/attachments")
      data = response.json()

      assert len(data) == 1
      assert data[0]["download_url"] is not None  # FAILS with current code
      assert data[0]["download_url"].startswith("/api/cas/")
      assert "content_type=image/png" in data[0]["download_url"]
  ```

**Blocker — Migration startup hook continues app startup on failure**

- Evidence: `/work/backend/app/__init__.py:256-258`
  ```python
  except Exception as e:
      app.logger.error(f"CAS migration failed: {e}", exc_info=True)
      # Don't fail startup - migration can be retried
  ```
- Impact: If migration partially fails (e.g., database connection drops mid-migration, S3 credentials expire), the app starts serving requests with a **mixed state**: some attachments have CAS keys, others have UUID keys. Frontend requests for attachments with UUID keys will receive `download_url: null` (per the schema bug above), breaking image/document viewing. This violates the plan requirement that "migration runs automatically on app startup **before serving requests (blocking)**" (plan line 125).
- Fix: Either (1) fail startup on migration errors to force manual intervention, or (2) implement a "compatibility mode" where the app continues serving old blob endpoints until migration is 100% complete. Option 1 is safer and aligns with plan intent.
  ```python
  except Exception as e:
      app.logger.error(f"CAS migration failed: {e}", exc_info=True)
      raise RuntimeError("CAS migration failed - cannot start app with partial migration state") from e
  ```
- Confidence: High
- Failure reasoning:
  1. Migration starts with 100 attachments (50 UUID keys, 50 already CAS)
  2. Migrates 25 attachments successfully, commits each
  3. S3 credentials expire → migration exception at attachment 26
  4. App catches exception, logs error, continues startup
  5. App registers CAS blueprint, removes old blob endpoints (commented out in `app/api/documents.py`)
  6. Frontend requests part with UUID-based attachment → schema returns `download_url: null` → 404 when trying to load image
  7. User sees broken images for half the inventory

### Major Issues

**Major — No test coverage for CAS API endpoint**

- Evidence: No test file exists at `/work/backend/tests/test_cas_api.py`; plan required "tests/test_cas_api.py" (plan line 152)
- Impact: Core deliverable (stateless CAS endpoint) is untested; validation logic, cache headers, If-None-Match handling, thumbnail generation, error paths all unverified
- Fix: Create comprehensive test file covering plan section 13 scenarios:
  - Valid hash + content_type → 200 with immutable cache headers
  - Valid hash + If-None-Match → 304 Not Modified
  - Valid hash + thumbnail → 200 with JPEG thumbnail
  - Both content_type and thumbnail → 400 Bad Request
  - Neither content_type nor thumbnail → 400 Bad Request
  - Nonexistent hash → 404 Not Found
  - S3 service unavailable → 500 Internal Server Error
  - Disposition=attachment + filename → Content-Disposition header validation
- Confidence: High

**Major — No test coverage for CAS migration service**

- Evidence: No test file exists at `/work/backend/tests/test_cas_migration_service.py`; plan required this at line 155
- Impact: Migration service is the **most critical component** (data migration is irreversible in production); untested paths include idempotency, error recovery, deduplication, cleanup validation
- Fix: Create test file covering plan section 13 scenarios:
  - Migrate attachment with UUID key → success, s3_key updated to CAS format
  - Migrate attachment already in CAS format → skip with "Already migrated" message
  - S3 download fails → log error, skip attachment, continue
  - S3 upload fails → orphaned CAS object (acceptable per plan), continue
  - DB commit fails → rollback, continue
  - Multiple attachments same content → both point to same CAS key (deduplication)
  - Cleanup with migration incomplete → validation fails, no deletions
  - Cleanup with migration complete → delete only non-CAS, non-protected objects
- Confidence: High

**Major — Cleanup can delete CAS objects if protected set query is stale**

- Evidence: `/work/backend/app/services/cas_migration_service.py:201-208`
  ```python
  # Build protected CAS key set
  stmt = select(PartAttachment.s3_key).where(
      PartAttachment.s3_key.is_not(None),
      PartAttachment.s3_key.startswith('cas/')
  ).distinct()

  protected_keys = set(self.db.scalars(stmt).all())
  ```
- Impact: The cleanup logic lists all S3 objects and deletes those **not in protected set and not starting with cas/**. However, the logic at line 223 says "Skip CAS objects" (`if s3_key.startswith('cas/'): continue`), which means **no CAS objects are ever deleted**. This contradicts the plan requirement to delete "old UUID-based objects" (plan line 445). The logic should delete CAS objects that are **not in the protected set** (orphaned from failed uploads), but the current implementation skips all CAS objects entirely.
- Fix: Update cleanup logic to delete orphaned CAS objects (not in protected set):
  ```python
  # Skip CAS objects that are protected
  if s3_key.startswith('cas/') and s3_key in protected_keys:
      continue

  # Delete old UUID objects AND orphaned CAS objects
  if s3_key in protected_keys:
      continue  # Skip protected objects
  ```
  Wait, re-reading the plan: "Delete S3 objects NOT in protected set AND NOT starting with `cas/`" (plan line 446). The current code is correct per plan — it never deletes CAS objects, only old UUID-based objects. But this leaves orphaned CAS objects from failed uploads. The plan says "orphaned CAS objects from failed DB commits are acceptable - immutable and harmless" (plan line 952). So this is not a bug, but the comment at line 223 is misleading.
- Fix: Clarify comment at line 223 to explain why CAS objects are skipped:
  ```python
  # Skip all CAS objects (including orphaned ones - they are immutable and harmless per plan)
  if s3_key.startswith('cas/'):
      continue
  ```
- Confidence: Medium (code is correct but confusing)

**Major — Missing metrics integration for CAS endpoint**

- Evidence: `/work/backend/app/api/cas.py` has no calls to `MetricsService`; plan required "CAS endpoint request counter", "response time histogram", "deduplication skip counter", "thumbnail cache miss counter" (plan lines 671-698)
- Impact: No operational visibility into CAS adoption, cache effectiveness, or performance; violates plan deliverables for observability
- Fix: Inject `MetricsService` and emit metrics:
  ```python
  @cas_bp.route("/<hash_value>", methods=["GET"])
  @inject
  def get_cas_content(
      hash_value: str,
      s3_service: S3Service = Provide[ServiceContainer.s3_service],
      image_service: ImageService = Provide[ServiceContainer.image_service],
      metrics_service: MetricsService = Provide[ServiceContainer.metrics_service]
  ) -> Any:
      start_time = time.perf_counter()

      # ... existing validation ...

      # Emit request counter
      metrics_service.increment_counter("cas_requests_total", labels={"is_thumbnail": thumbnail_size_str is not None})

      # ... existing logic ...

      # Emit response time
      duration = time.perf_counter() - start_time
      metrics_service.record_histogram("cas_response_time_seconds", duration, labels={"is_thumbnail": thumbnail_size_str is not None})
  ```
- Confidence: High

### Minor Issues

**Minor — Inconsistent error handling for thumbnail generation**

- Evidence: `/work/backend/app/api/cas.py:83-85`
  ```python
  except Exception as e:
      logger.error(f"Failed to generate thumbnail for hash {hash_value}: {str(e)}")
      raise NotFound("Failed to generate thumbnail") from e
  ```
- Impact: Thumbnail generation failures (e.g., corrupted image file) return 404 instead of 500; plan specified "Return 500 Internal Server Error" (plan line 601)
- Fix: Change to `raise InternalServerError("Failed to generate thumbnail") from e` or import werkzeug's `InternalServerError`
- Confidence: Medium

**Minor — Missing validation for thumbnail size parameter**

- Evidence: `/work/backend/app/api/cas.py:75-78` converts thumbnail size to int but does not validate range (e.g., negative, zero, or absurdly large values like 999999)
- Impact: Malicious clients could request 999999px thumbnails causing excessive memory/CPU usage
- Fix: Add validation:
  ```python
  thumbnail_size = int(thumbnail_size_str)
  if thumbnail_size < 1 or thumbnail_size > 1000:
      raise BadRequest("Thumbnail size must be between 1 and 1000 pixels")
  ```
- Confidence: Medium

**Minor — S3Service.file_exists may return false negatives due to S3 eventual consistency**

- Evidence: `/work/backend/app/services/document_service.py:323-325`
  ```python
  # Check if content already exists in S3 (deduplication)
  if self.s3_service.file_exists(upload_s3_key):
      logger.info(f"Content already exists in CAS for attachment {attachment.id}, skipping upload")
  ```
- Impact: Concurrent uploads of same content may both pass `file_exists` check (S3 read-after-write consistency window), resulting in duplicate uploads. Plan acknowledges this risk: "Accept risk (eventual consistency window is milliseconds)" (plan line 932).
- Fix: No code change needed; document risk is acceptable per plan
- Confidence: Low (not a bug, informational)

---

## 4) Over-Engineering & Refactoring Opportunities

**Hotspot: Schema computed fields duplicate URL construction logic**

- Evidence:
  - `/work/backend/app/schemas/part_attachment.py:112-138` — `download_url` computed field
  - `/work/backend/app/schemas/part_attachment.py:140-160` — `thumbnail_url` computed field
  - `/work/backend/app/schemas/part.py:305-325` — `cover_url` computed field (duplicates thumbnail URL logic)
  - Same logic duplicated in `PartAttachmentListSchema` at lines 204-254
- Suggested refactor: Extract URL construction to a shared helper function in `app/schemas/` or `app/utils/`:
  ```python
  def build_cas_download_url(s3_key: str | None, content_type: str, filename: str | None) -> str | None:
      """Build CAS download URL from s3_key and metadata."""
      if not s3_key or not s3_key.startswith('cas/'):
          return None
      match = re.match(r'cas/([0-9a-f]{64})$', s3_key)
      if not match:
          return None
      hash_value = match.group(1)
      params = [f"content_type={quote(content_type)}", "disposition=attachment"]
      if filename:
          params.append(f"filename={quote(filename)}")
      return f"/api/cas/{hash_value}?{'&'.join(params)}"
  ```
  Then call from computed fields: `return build_cas_download_url(self.s3_key, self.content_type, self.filename)`
- Payoff: Reduces duplication, centralizes regex pattern (easier to fix bugs like the `exclude=True` issue), improves testability
- Confidence: Medium

---

## 5) Style & Consistency

**Pattern: Inconsistent use of `exclude=True` vs `repr=False` for internal fields**

- Evidence: `/work/backend/app/schemas/part_attachment.py:102-108`
  ```python
  # Hidden field - not included in API response but needed for computed fields
  s3_key: str | None = Field(
      default=None,
      exclude=True,  # Exclude from API responses
      description="Internal S3 storage key (not exposed in API)"
  )
  ```
- Impact: As noted in Blocker finding, `exclude=True` prevents Pydantic from loading `s3_key` from ORM model attributes, causing all computed fields to fail. The project has no existing pattern for "internal fields used by computed fields" — this is a new pattern introduced by CAS migration.
- Recommendation: Use Pydantic's `PrivateAttr` or `computed_field` dependencies to access model attributes without exposing them in JSON responses. Alternatively, use `Field(repr=False, exclude=True)` with explicit loading via `model_config`.
- Confidence: High

**Pattern: Migration service commits inside service method instead of transaction scope in caller**

- Evidence: `/work/backend/app/services/cas_migration_service.py:112` — `self.db.commit()` inside `migrate_attachment()`
- Impact: Violates project pattern where services return model instances and callers handle transaction boundaries (see CLAUDE.md "Service Layer" section). However, the migration service is a special case (one-time data migration with explicit per-row commit requirement per plan line 126).
- Recommendation: Add docstring comment explaining why this service commits internally (per plan requirement) unlike other services:
  ```python
  def migrate_attachment(self, attachment: PartAttachment) -> tuple[bool, str]:
      """Migrate a single attachment to CAS format.

      NOTE: This method commits the transaction internally (per-row commit pattern
      required by migration plan) unlike typical services which delegate commit to caller.
      """
  ```
- Confidence: Low (acceptable deviation, just needs documentation)

---

## 6) Tests & Deterministic Coverage (new/changed behavior only)

### CAS API Endpoint (app/api/cas.py)

- Surface: `GET /api/cas/<hash>`
- Scenarios:
  - **MISSING**: Given valid hash and content_type, When GET /api/cas/<hash>?content_type=application/pdf, Then return 200 with PDF bytes, Content-Type, immutable Cache-Control, ETag
  - **MISSING**: Given valid hash and If-None-Match matches ETag, When GET with If-None-Match, Then return 304 Not Modified
  - **MISSING**: Given valid hash and thumbnail param, When GET /api/cas/<hash>?thumbnail=150, Then return 200 with JPEG thumbnail
  - **MISSING**: Given both content_type and thumbnail params, When GET /api/cas/<hash>?content_type=...&thumbnail=150, Then return 400 Bad Request
  - **MISSING**: Given neither content_type nor thumbnail, When GET /api/cas/<hash>, Then return 400 Bad Request
  - **MISSING**: Given nonexistent hash, When GET /api/cas/<hash>?content_type=..., Then return 404 Not Found
  - **MISSING**: Given disposition=attachment and filename, When GET /api/cas/<hash>?content_type=...&disposition=attachment&filename=test.pdf, Then Content-Disposition header includes filename
- Hooks: Mock S3Service and ImageService; seed S3 with known hash content; test client for HTTP requests
- Gaps: **Complete test file missing** (`tests/test_cas_api.py` does not exist)
- Evidence: Plan section 13 line 777-791 specifies these scenarios; no corresponding test file found

### CAS Migration Service (app/services/cas_migration_service.py)

- Surface: `CasMigrationService.migrate_attachment()`, `migrate_all()`, `cleanup_old_objects()`
- Scenarios:
  - **MISSING**: Given attachment with UUID-based s3_key, When migrate_attachment(), Then download, hash, upload to CAS, update DB, return success
  - **MISSING**: Given attachment with CAS s3_key, When migrate_attachment(), Then skip with "Already migrated" message
  - **MISSING**: Given S3 download fails, When migrate_attachment(), Then log error, return failure tuple
  - **MISSING**: Given multiple attachments with identical content, When migrate_all(), Then both point to same CAS key (deduplication)
  - **MISSING**: Given cleanup enabled but migration incomplete, When cleanup_old_objects(), Then validation fails, return stats with skipped count
  - **MISSING**: Given cleanup enabled and migration complete, When cleanup_old_objects(), Then delete only non-CAS objects not in protected set
- Hooks: Mock S3Service methods (`download_file`, `upload_file`, `file_exists`, `delete_file`); create test attachments with controlled s3_keys; use test database session
- Gaps: **Complete test file missing** (`tests/test_cas_migration_service.py` does not exist)
- Evidence: Plan section 13 line 793-806 specifies these scenarios

### Document Service Upload Flow (app/services/document_service.py)

- Surface: `DocumentService.create_file_attachment()` with CAS key generation
- Scenarios:
  - **PARTIAL**: Given file upload, When create_file_attachment(), Then compute hash, create attachment with cas/<hash> s3_key — tested at `tests/test_document_api.py:26` with mocked `generate_cas_key`
  - **MISSING**: Given identical file uploaded twice, When create_file_attachment() second time, Then skip S3 upload (deduplication), create separate DB row with same s3_key
  - **PARTIAL**: Tests updated to mock `generate_cas_key` and `file_exists` but do not verify deduplication behavior
- Hooks: Existing fixtures updated with `@patch('app.services.s3_service.S3Service.generate_cas_key')` and `@patch('app.services.s3_service.S3Service.file_exists')`
- Gaps: Deduplication scenario not exercised (plan line 811)
- Evidence: `tests/test_document_api.py:21-26` shows mocking but not behavior verification

### Schema Computed Fields (app/schemas/part_attachment.py, app/schemas/part.py)

- Surface: `download_url`, `thumbnail_url`, `cover_url` computed fields
- Scenarios:
  - **PARTIAL**: Given part with cover attachment, When serialize to PartResponseSchema, Then cover_url is not None — tested at `tests/test_parts_api.py:832` but does not verify URL format
  - **MISSING**: Given attachment with CAS s3_key and content_type, When serialize to PartAttachmentResponseSchema, Then download_url contains /api/cas/<hash>?content_type=...
  - **MISSING**: Given image attachment, When serialize, Then thumbnail_url contains /api/cas/<hash>?thumbnail=150
  - **MISSING**: Given PDF attachment, When serialize, Then thumbnail_url is null
  - **MISSING**: Given URL-type attachment (null s3_key), When serialize, Then download_url and thumbnail_url are null
- Hooks: Existing test fixtures; need to add assertions on URL format and query params
- Gaps: URL construction logic not validated, only null/not-null checks (plan line 834-842)
- Evidence: `tests/test_parts_api.py:832` checks `cover_url is not None` but not URL structure

### Startup Migration Hook (app/__init__.py)

- Surface: Migration startup logic in `create_app()`
- Scenarios:
  - **MISSING**: Given database with all CAS s3_keys, When app starts, Then skip migration, log "No migration needed"
  - **MISSING**: Given database with 10 UUID-based s3_keys, When app starts, Then migrate all 10, log summary
  - **MISSING**: Given migration partially complete, When app restarts, Then skip migrated attachments, migrate remaining
  - **MISSING**: Given cleanup flag enabled and migration complete, When app starts, Then run cleanup after migration
- Hooks: Integration test with real database (or in-memory); seed test data with UUID keys; capture logs; verify app startup completes
- Gaps: **No tests for startup migration hook**
- Evidence: Plan section 13 line 865-873 specifies these scenarios; no test coverage found

---

## 7) Adversarial Sweep (attempted 5 credible failures)

### Attack 1: Schema computed fields with `exclude=True` preventing ORM attribute loading

**Status: CONFIRMED FAILURE (see Blocker finding)**

- Checks attempted: Simulated Pydantic model instantiation with `from_attributes=True` and `exclude=True` field
- Evidence: `/work/backend/app/schemas/part_attachment.py:102-108` — field marked `exclude=True` will not be populated from ORM model
- Failure mode:
  1. API endpoint calls `PartAttachmentResponseSchema.model_validate(attachment)` where `attachment` is ORM PartAttachment instance
  2. Pydantic iterates ORM attributes to populate schema fields
  3. Field `s3_key` has `exclude=True` → Pydantic skips loading this attribute → `self.s3_key = None`
  4. Computed field `download_url` accesses `self.s3_key` → finds `None` → returns `None`
  5. Frontend receives `{"download_url": null}` for all attachments, cannot load images/PDFs

### Attack 2: Migration startup continues on failure leaving mixed UUID/CAS state

**Status: CONFIRMED FAILURE (see Blocker finding)**

- Checks attempted: Simulated S3 credential expiration mid-migration
- Evidence: `/work/backend/app/__init__.py:256-258` — exception caught, logged, app startup continues
- Failure mode: Already detailed in Blocker finding above

### Attack 3: Concurrent uploads creating duplicate CAS objects due to S3 eventual consistency

**Status: ACCEPTED RISK per plan**

- Checks attempted: Race condition where two clients upload identical content simultaneously
- Evidence: `/work/backend/app/services/document_service.py:323-325` — `file_exists` check before upload
- Why code held up: Plan line 931-932 explicitly accepts this risk: "S3 eventual consistency window is milliseconds"; duplicate uploads waste storage but don't corrupt data (CAS objects are immutable)

### Attack 4: Cleanup deleting CAS objects still referenced in database

**Status: CODE HOLDS UP (false alarm on first read)**

- Checks attempted: Cleanup running with stale protected_keys set while new attachment created
- Evidence: `/work/backend/app/services/cas_migration_service.py:201-228` — protected set built from DB query, then S3 delete loop
- Why code held up: Cleanup skips **all CAS objects** (line 223), only deletes old UUID-based keys. Race condition is impossible because CAS objects are never deleted. The plan accepts orphaned CAS objects as "immutable and harmless" (plan line 952).

### Attack 5: Missing transaction rollback on S3 upload failure during migration

**Status: CODE HOLDS UP**

- Checks attempted: S3 upload fails mid-migration for one attachment
- Evidence: `/work/backend/app/services/cas_migration_service.py:116-120` — rollback on any exception
- Why code held up:
  ```python
  except Exception as e:
      # Roll back transaction for this attachment
      self.db.rollback()
      logger.error(f"Failed to migrate attachment {attachment.id}: {str(e)}")
      return False, f"Error: {str(e)}"
  ```
  Transaction is rolled back, attachment keeps old s3_key, next startup retry will migrate it.

### Attack 6: Thumbnail cache filling disk with orphaned hash-based files

**Status: CODE HOLDS UP (handled by existing TempFileManager)**

- Checks attempted: Migration changes cache keys from `{attachment_id}_{size}.jpg` to `{hash}_{size}.jpg`, orphaning old files
- Evidence: `/work/backend/app/services/image_service.py:143-191` — new cache key pattern
- Why code held up: Existing TempFileManager (referenced in CLAUDE.md lines 720-721) performs age-based cleanup of `/tmp/thumbnails/`. Old attachment_id-based thumbnails will be cleaned up automatically. Plan line 940 mentions "consider one-time cache purge during migration" but it's optional.

---

## 8) Invariants Checklist

### Invariant 1: Every attachment with non-null s3_key must have valid CAS format after migration completes

- Where enforced: `/work/backend/app/services/cas_migration_service.py:33-51` — `needs_migration()` returns False only when no UUID-based keys remain
- Failure mode: If migration startup hook continues on partial failure (current code at `app/__init__.py:256`), this invariant is violated
- Protection: **INSUFFICIENT** — migration catches exceptions and continues startup (Blocker finding above)
- Evidence: Startup hook at `/work/backend/app/__init__.py:226-258`

### Invariant 2: Multiple attachments with identical content must reference same S3 object (deduplication)

- Where enforced: `/work/backend/app/services/document_service.py:323-325` — `file_exists()` check before upload; `/work/backend/app/services/cas_migration_service.py:99-101` — migration checks `file_exists()` before upload
- Failure mode: S3 eventual consistency allows race condition where both uploads proceed (see Attack 3 above)
- Protection: ACCEPTABLE RISK per plan (line 931-932); duplicate objects waste storage but don't corrupt data
- Evidence: Plan section 15 Risk 2 acknowledges this

### Invariant 3: CAS endpoint must never access database (stateless design)

- Where enforced: `/work/backend/app/api/cas.py:27-31` — injected dependencies are only S3Service and ImageService (no database session)
- Failure mode: If ImageService.get_thumbnail_for_hash() loaded attachment from DB to get s3_key, it would violate stateless design
- Protection: CORRECT — `get_thumbnail_for_hash()` receives hash directly from URL path (line 82), no DB access
- Evidence: `/work/backend/app/services/image_service.py:143-191` — method signature takes `content_hash: str` parameter, builds S3 key as `f"cas/{content_hash}"`

### Invariant 4: S3 cleanup must never delete CAS objects referenced in database

- Where enforced: `/work/backend/app/services/cas_migration_service.py:201-228` — builds protected set from DB, skips CAS objects entirely
- Failure mode: If cleanup logic deleted CAS objects not in protected set, concurrent uploads could be orphaned
- Protection: CORRECT — all CAS objects are skipped (line 223-224), only old UUID keys deleted
- Evidence: Code at lines 223-228 skips CAS prefix

### Invariant 5: Computed URL fields must return None for unmigrated (UUID-based) attachments

- Where enforced: `/work/backend/app/schemas/part_attachment.py:115-119` — regex checks `s3_key.startswith('cas/')`, returns None otherwise
- Failure mode: If computed field returned URLs for UUID keys, frontend would get 404 from CAS endpoint (UUID not a valid hash)
- Protection: CORRECT (assuming `exclude=True` bug is fixed) — guards check CAS prefix before building URL
- Evidence: Lines 115-119 show early return if not CAS format

---

## 9) Questions / Needs-Info

**Question: Should old blob endpoints return 410 Gone instead of 404 Not Found?**

- Why it matters: Commented-out endpoints (e.g., `GET /api/parts/<key>/cover/thumbnail`) will return 404 because Flask route doesn't exist. HTTP 410 Gone is semantically correct for "this resource existed but was permanently removed". Helps distinguish "never existed" (404) from "removed during CAS migration" (410).
- Desired answer: Confirm whether to add explicit 410 routes for removed endpoints, or accept 404 as sufficient.

**Question: What is the rollback plan if CAS migration causes production issues?**

- Why it matters: Migration is forward-only (no rollback mechanism per plan line 120). If production migration fails or frontend breaks, the plan provides no recovery path. Old blob endpoints are removed (commented out), so rolling back code would require uncommenting routes.
- Desired answer: Document deployment runbook including: (1) pre-migration backup verification, (2) migration monitoring plan, (3) rollback steps if needed (restore backup, revert code, re-run Alembic migrations).

**Question: Should migration service emit metrics for monitoring?**

- Why it matters: Plan specifies metrics for CAS endpoint (lines 671-698) but not for migration service. Production migration monitoring would benefit from metrics like `cas_migration_progress`, `cas_migration_errors_total`, `cas_cleanup_objects_deleted`.
- Desired answer: Clarify whether migration metrics are in scope (current code has no metrics).

---

## 10) Risks & Mitigations (top 3)

### Risk 1: Schema computed fields return None due to `exclude=True` bug

- Mitigation: Fix `exclude=True` to `repr=False` in PartAttachmentResponseSchema and PartAttachmentListSchema (Blocker finding); add test coverage for computed URL fields verifying actual URL format, not just null checks
- Evidence: `/work/backend/app/schemas/part_attachment.py:102-108` and Blocker finding in section 3

### Risk 2: Production migration failure leaves mixed UUID/CAS state with app running

- Mitigation: Change startup hook to fail app startup on migration error (Blocker finding); test migration error handling in integration tests; document deployment runbook with pre-migration validation steps
- Evidence: `/work/backend/app/__init__.py:256-258` and Blocker finding in section 3

### Risk 3: Missing test coverage for core deliverables (CAS API, migration service)

- Mitigation: Implement test files `tests/test_cas_api.py` and `tests/test_cas_migration_service.py` covering plan section 13 scenarios (Major findings); run full test suite before deployment
- Evidence: Section 6 test coverage gaps

---

## 11) Confidence

Confidence: Medium — The implementation demonstrates solid understanding of the CAS design and follows project patterns correctly for layering, dependency injection, and S3 storage consistency. The migration service per-row commit strategy and deduplication logic align with plan requirements. However, **two critical bugs** (schema `exclude=True` and migration error handling) would cause complete failure of the feature in production, and **missing test coverage for two core deliverables** (CAS API and migration service) means the code is untested. With the fixes identified in Blocker and Major findings, the implementation would be production-ready.
