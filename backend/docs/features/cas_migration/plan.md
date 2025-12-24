# CAS Migration — Technical Plan

## 0) Research Log & Findings

### Discovery Work

**Database schema & models:**
- Current `part_attachments` table has `s3_key` column (String 500, nullable) at `/work/backend/app/models/part_attachment.py:39`
- Current S3 keys follow pattern `parts/{part_id}/attachments/{uuid}.{ext}` generated at `/work/backend/app/services/s3_service.py:48-61`
- Parts table has `cover_attachment_id` foreign key at `/work/backend/app/models/part.py:51-53`
- No schema migration needed - just data migration to change s3_key values from UUID format to `cas/<hash>` format

**Storage & services:**
- S3Service handles all S3 operations at `/work/backend/app/services/s3_service.py`
- ImageService generates thumbnails cached locally at `/work/backend/app/services/image_service.py:40-53` using pattern `{attachment_id}_{size}.jpg`
- DocumentService orchestrates uploads/downloads with S3 at `/work/backend/app/services/document_service.py`
- Thumbnail storage path configured at `/work/backend/app/config.py:87-90` defaults to `/tmp/thumbnails`

**Current blob serving endpoints:**
- Cover thumbnails: `GET /api/parts/<key>/cover/thumbnail` at `/work/backend/app/api/documents.py:92-117`
- Attachment downloads: `GET /api/parts/<key>/attachments/<id>/download` at `/work/backend/app/api/documents.py:186-205`
- Attachment thumbnails: `GET /api/parts/<key>/attachments/<id>/thumbnail` at `/work/backend/app/api/documents.py:208-229`
- All use ETag-based caching requiring server round-trips for validation

**Response schemas:**
- PartAttachmentResponseSchema exposes `s3_key` field at `/work/backend/app/schemas/part_attachment.py:71-74`
- PartResponseSchema has `cover_attachment_id` and computed `has_cover_attachment` at `/work/backend/app/schemas/part.py:281-306`

**Storage consistency patterns:**
- Uploads: persist DB row → flush → upload to S3 (rollback on failure) at `/work/backend/app/services/document_service.py:306-343`
- Deletes: remove row → reassign cover → flush → best-effort S3 delete at `/work/backend/app/services/document_service.py:405-453`
- Copies: create row → flush → copy S3 object at `/work/backend/app/services/document_service.py:624-692`

**Config & settings:**
- No CAS-specific config exists yet; need to add `CAS_MIGRATION_DELETE_OLD_OBJECTS` boolean flag
- S3 bucket name at `/work/backend/app/config.py:57-60`
- Allowed types defined at `/work/backend/app/config.py:79-86`

**Test infrastructure:**
- ServiceContainer wires all services at `/work/backend/app/services/container.py`
- Test data loaded from `/work/backend/app/data/test_data/*.json` via TestDataService
- Tests exist at `/work/backend/tests/test_document_*.py` and `/work/backend/tests/test_parts_api.py`

### Areas of Special Interest

**Deduplication is intentional:**
- Same content → same SHA-256 hash → same S3 key `cas/<hash>`
- Multiple attachments can reference the same S3 object
- S3 cleanup after migration must not delete objects still referenced by other attachments

**Thumbnail cache key change:**
- Current: `{attachment_id}_{size}.jpg`
- After CAS: `{hash}_{size}.jpg`
- Migration must regenerate thumbnails OR clean old cache OR update ImageService to compute hash from s3_key

**Cover URL generation:**
- Replace `has_cover_attachment: bool` with `cover_url: str | null` in response schemas
- Backend constructs full CAS URL with proper query params: `/api/cas/<hash>?content_type=<mime>&disposition=inline&thumbnail=<size>`

**Migration ordering:**
- Must run BEFORE app serves CAS endpoint (old endpoints stay functional during migration)
- Migration can run incrementally (one attachment at a time with commit per row)
- On failure, skip attachment, log error, continue (idempotent: already-migrated rows ignored)

**Conflict Resolution:**

1. **Thumbnail path change:** Resolved by updating ImageService to derive hash from s3_key pattern `cas/<hash>` and use that hash for thumbnail cache key instead of attachment_id.

2. **GET /api/parts/<key>/cover metadata endpoint:** Keep it - it returns attachment metadata (id, title, etc.), not blob content. Only remove blob-serving endpoints.

3. **S3 cleanup safety:** After migration, enumerate all `cas/*` keys in database, then delete S3 objects NOT in that set (only if `CAS_MIGRATION_DELETE_OLD_OBJECTS=true`). This handles deduplication safely.

---

## 1) Intent & Scope

**User intent**

Migrate the S3 attachment storage from UUID-based keys to a Content-Addressable Storage (CAS) system using SHA-256 hashes. This enables `Cache-Control: immutable` headers on blob responses, eliminating cache revalidation round-trips and improving frontend performance for image/PDF viewing.

**Prompt quotes**

"Migrate the S3 storage system from UUID-based keys to a Content-Addressable Storage (CAS) system using SHA-256 hashes. This eliminates cache revalidation round-trips by enabling `Cache-Control: immutable` on all blob responses."

"The cas/ endpoint MUST NOT touch the database - all data comes from URL params"

"Replace the value in s3_key column with cas/<hash> format (clean migration, no new column)"

"Deduplication is intentional - same content = same hash = same S3 object"

"Thumbnails stay on local disk, but cache key changes from {attachment_id}_{size}.jpg to {hash}_{size}.jpg"

"Backend provides complete URLs in responses (cover_url, attachment URLs)"

"Migration: loop one-by-one, commit each, skip and log failures"

"Return 400 Bad Request if both content_type and thumbnail params are provided"

**In scope**

- New stateless CAS blob-serving endpoint at `GET /api/cas/<hash>` with query params for content_type, disposition, filename, thumbnail
- Data migration to convert existing `s3_key` values from `parts/{part_id}/attachments/{uuid}.{ext}` to `cas/<hash>` format
- S3 object migration: download, hash, re-upload to CAS key, update DB row (one-by-one with per-row commit)
- Update upload flow to compute SHA-256 hash and store at `cas/<hash>` in S3
- Update DocumentService copy flow to handle CAS keys
- Update ImageService thumbnail cache to use hash-based keys `{hash}_{size}.jpg` instead of `{attachment_id}_{size}.jpg`
- Add `cover_url` field to PartResponseSchema and PartListSchema (computed, full CAS URL or null)
- Add full attachment URLs to PartAttachmentResponseSchema/ListSchema
- Remove `s3_key` from API response schemas
- Remove blob-serving endpoints: cover/attachment download and thumbnail endpoints
- Optional S3 cleanup job to delete old UUID-based objects after migration (guarded by `CAS_MIGRATION_DELETE_OLD_OBJECTS` config flag)
- Startup migration hook to run data migration automatically (hard coded check for unmigrated s3_keys)
- Update test data JSON files if they reference s3_key values
- Comprehensive tests for CAS endpoint, migration, upload flow, thumbnail generation

**Out of scope**

- S3 garbage collection (no background job to detect orphaned CAS objects)
- Frontend implementation (document API changes only)
- Rollback mechanism (migration is forward-only; old endpoints removed after successful migration)
- Migration progress UI (CLI output or logs only)

**Assumptions / constraints**

- Migration runs automatically on app startup before serving requests (blocking)
- S3 bucket is accessible and credentials are valid
- SHA-256 collision probability is negligible for realistic attachment corpus
- Thumbnail regeneration after migration is acceptable (or old cache files are cleaned automatically)
- Database transaction per attachment during migration is acceptable (no batching needed for ~50-100 attachments in test data)
- CAS endpoint does not require authentication (same as current blob endpoints)
- Content-Type and filename metadata are stored in database and passed via query params (not inferred from S3 metadata)

---

## 2) Affected Areas & File Map

**New files (create):**

- Area: `app/api/cas.py`
- Why: New stateless CAS blob-serving endpoint
- Evidence: Change brief specifies "Single CAS Endpoint" at `/api/cas/<hash>` with query params

- Area: `app/services/cas_migration_service.py`
- Why: Orchestrate data migration and S3 re-upload logic
- Evidence: Change brief specifies migration flow "loop one-by-one, commit each, skip and log failures"

- Area: `alembic/versions/XXX_cas_migration_note.py` (empty or minimal)
- Why: Document that s3_key column semantics changed (no schema change needed)
- Evidence: Change brief says "No schema migration needed - just data migration"

- Area: `tests/test_cas_api.py`
- Why: Test CAS endpoint behavior, validation, caching headers
- Evidence: Testing requirements per `/work/backend/CLAUDE.md:119-163`

- Area: `tests/test_cas_migration_service.py`
- Why: Test migration service logic, error handling, idempotency
- Evidence: Testing requirements per `/work/backend/CLAUDE.md:119-163`

**Modified files:**

- Area: `app/services/s3_service.py`
- Why: Add CAS-specific methods for hash-based key generation and deduplication check
- Evidence: Change brief specifies "Compute SHA-256 of uploaded bytes" and "skip upload if already exists"; current `generate_s3_key` at `/work/backend/app/services/s3_service.py:48-61`

- Area: `app/services/document_service.py`
- Why: Update upload flow to use CAS keys; update copy logic; add method to build CAS URLs
- Evidence: Upload at `/work/backend/app/services/document_service.py:306-343` must compute hash; copy at `624-692` must handle CAS keys

- Area: `app/services/image_service.py`
- Why: Change thumbnail cache key from `{attachment_id}_{size}.jpg` to `{hash}_{size}.jpg`
- Evidence: Current thumbnail path logic at `/work/backend/app/services/image_service.py:40-53`; change brief specifies "cache key changes from {attachment_id}_{size}.jpg to {hash}_{size}.jpg"

- Area: `app/schemas/part_attachment.py`
- Why: Remove `s3_key` field; add computed `download_url` and `thumbnail_url` fields
- Evidence: Current schema exposes `s3_key` at `/work/backend/app/schemas/part_attachment.py:71-74`; change brief says "Remove s3_key from API responses"

- Area: `app/schemas/part.py`
- Why: Replace `has_cover_attachment` with `cover_url` computed field
- Evidence: Current schema has `has_cover_attachment` at `/work/backend/app/schemas/part.py:299-306`; change brief says "Replace has_cover_attachment: bool with cover_url: str | null"

- Area: `app/api/documents.py`
- Why: Remove blob-serving endpoints (cover/attachment download and thumbnails); keep metadata endpoints
- Evidence: Cover thumbnail at `/work/backend/app/api/documents.py:92-117`, attachment download at `186-205`, attachment thumbnail at `208-229`; change brief says "Endpoints to Remove" for these paths

- Area: `app/config.py`
- Why: Add `CAS_MIGRATION_DELETE_OLD_OBJECTS` boolean flag
- Evidence: Change brief specifies "if CAS_MIGRATION_DELETE_OLD_OBJECTS=true" for cleanup

- Area: `app/__init__.py` (application factory startup hook)
- Why: Add startup migration check that runs before app serves requests
- Evidence: Application factory at `/work/backend/app/__init__.py`; migration must complete before app is ready

- Area: `app/services/container.py`
- Why: Wire new CAsMigrationService with dependencies
- Evidence: All services wired at `/work/backend/app/services/container.py:41-236`

- Area: `app/__init__.py` (application factory)
- Why: Register CAS blueprint
- Evidence: Existing blueprint registration pattern; new `cas_bp` must be added

- Area: `tests/test_document_service.py`
- Why: Update tests for new upload/copy logic using CAS keys
- Evidence: Existing tests at `/work/backend/tests/test_document_service.py`

- Area: `tests/test_document_api.py`
- Why: Update tests to verify removed endpoints return 404; verify new response schemas
- Evidence: Existing API tests at `/work/backend/tests/test_document_api.py`

- Area: `tests/test_parts_api.py`
- Why: Update tests to verify `cover_url` instead of `has_cover_attachment`
- Evidence: Existing tests at `/work/backend/tests/test_parts_api.py`

- Area: `tests/test_image_service.py`
- Why: Update tests for hash-based thumbnail cache keys
- Evidence: Existing tests at `/work/backend/tests/test_image_service.py`

- Area: `app/data/test_data/parts.json` (if needed)
- Why: Update s3_key values to CAS format if test data includes pre-seeded attachments
- Evidence: Test data files at `/work/backend/app/data/test_data/*.json`; per `/work/backend/CLAUDE.md:440-483`

---

## 3) Data Model / Contracts

**Database table: `part_attachments`**
- Entity / contract: `part_attachments.s3_key` column
- Shape: Column semantics change from `parts/{part_id}/attachments/{uuid}.{ext}` to `cas/<sha256-hex>` (no schema change, varchar(500) remains)
- Refactor strategy: Data migration rewrites all existing s3_key values; no new column added; no backward compatibility needed (migration is forward-only)
- Evidence: `/work/backend/app/models/part_attachment.py:39` defines nullable String(500) column

**API response: PartAttachmentResponseSchema**
- Entity / contract: PartAttachmentResponseSchema
- Shape (removed fields):
  ```json
  {
    "s3_key": null  // REMOVED - security concern, internal implementation detail
  }
  ```
- Shape (new computed fields):
  ```json
  {
    "download_url": "string | null",  // Full CAS URL: /api/cas/<hash>?content_type=<mime>&disposition=attachment&filename=<name>
    "thumbnail_url": "string | null"  // Full CAS URL with thumbnail param: /api/cas/<hash>?thumbnail=<size>
  }
  ```
- Refactor strategy: Remove `s3_key` field entirely; add `@computed_field` for `download_url` and `thumbnail_url` that construct CAS URLs from attachment metadata; frontend never sees S3 keys
- Evidence: `/work/backend/app/schemas/part_attachment.py:71-74` currently exposes s3_key

**API response: PartResponseSchema / PartListSchema**
- Entity / contract: Part response schemas
- Shape (removed computed field):
  ```json
  {
    "has_cover_attachment": true  // REMOVED - replaced by cover_url
  }
  ```
- Shape (new computed field):
  ```json
  {
    "cover_url": "string | null"  // Full CAS thumbnail URL or null: /api/cas/<hash>?thumbnail=<size>
  }
  ```
- Refactor strategy: Replace boolean flag with nullable URL string; construct CAS URL from cover_attachment relationship (if present) using thumbnail query param
- Evidence: `/work/backend/app/schemas/part.py:299-306` currently has `has_cover_attachment` computed field

**API endpoint: CAS blob serving**
- Entity / contract: `GET /api/cas/<hash>`
- Shape (query parameters):
  ```json
  {
    "content_type": "string (required if not thumbnail)",
    "disposition": "inline | attachment (optional, default inline)",
    "filename": "string (optional, used in Content-Disposition header)",
    "thumbnail": "integer (optional, pixel size for thumbnail generation)"
  }
  ```
- Shape (response headers):
  ```json
  {
    "Content-Type": "<from query param or image/jpeg for thumbnails>",
    "Content-Disposition": "<inline|attachment>; filename=<filename if provided>",
    "Cache-Control": "public, max-age=31536000, immutable",
    "ETag": "\"<hash>\""
  }
  ```
- Refactor strategy: No backward compatibility; old blob endpoints removed entirely; frontend must migrate to CAS URLs
- Evidence: Change brief specifies stateless endpoint with query params

**Config setting: CAS_MIGRATION_DELETE_OLD_OBJECTS**
- Entity / contract: Application configuration
- Shape:
  ```python
  CAS_MIGRATION_DELETE_OLD_OBJECTS: bool = Field(
      default=False,
      description="Delete old UUID-based S3 objects after CAS migration completes"
  )
  ```
- Refactor strategy: Default false for safety; explicit opt-in for cleanup
- Evidence: Change brief specifies "if CAS_MIGRATION_DELETE_OLD_OBJECTS=true"

**Thumbnail cache file naming**
- Entity / contract: Local filesystem thumbnail cache
- Shape: Path pattern changes from `/tmp/thumbnails/{attachment_id}_{size}.jpg` to `/tmp/thumbnails/{hash}_{size}.jpg`
- Refactor strategy: Derive hash from s3_key (extract from `cas/<hash>` pattern); old thumbnails orphaned but harmless (TempFileManager cleanup will remove based on age)
- Evidence: `/work/backend/app/services/image_service.py:40-53` generates paths

---

## 4) API / Integration Surface

**New endpoint: CAS blob serving**
- Surface: `GET /api/cas/<hash>`
- Inputs:
  - Path param: `hash` (64-char hex SHA-256)
  - Query params:
    - `content_type` (string, required if `thumbnail` not provided; MIME type of content)
    - `disposition` (string, optional, values: `inline` | `attachment`, default `inline`)
    - `filename` (string, optional, used in `Content-Disposition` header)
    - `thumbnail` (integer, optional, pixel size for square thumbnail generation; mutually exclusive with `content_type`)
- Outputs:
  - Success (200): Binary content with headers `Content-Type`, `Content-Disposition`, `Cache-Control: public, max-age=31536000, immutable`, `ETag: "<hash>"`
  - Conditional (304): Not Modified if `If-None-Match` matches ETag
  - Client error (400): Bad Request if both `content_type` and `thumbnail` provided, or if neither provided
  - Client error (404): Not Found if S3 object does not exist at `cas/<hash>`
  - Server error (500): S3 download failure or thumbnail generation failure
- Errors:
  - 400: "Cannot specify both content_type and thumbnail parameters"
  - 400: "Must specify either content_type or thumbnail parameter"
  - 404: "Content not found" (S3 object missing)
  - 500: "Failed to retrieve content" (S3 error)
  - 500: "Failed to generate thumbnail" (PIL error)
- Evidence: Change brief specifies "Single CAS Endpoint" with validation rules

**Modified endpoint: Part response schemas**
- Surface: All endpoints returning `PartResponseSchema` or `PartListSchema` (GET /api/parts, GET /api/parts/<key>, etc.)
- Inputs: No change
- Outputs:
  - Added field: `cover_url: string | null` (full CAS URL with thumbnail param, or null if no cover)
  - Removed field: `has_cover_attachment: bool`
- Errors: No change
- Evidence: Change brief specifies "Replace has_cover_attachment: bool with cover_url: str | null"

**Modified endpoint: Attachment response schemas**
- Surface: All endpoints returning `PartAttachmentResponseSchema` or `PartAttachmentListSchema`
- Inputs: No change
- Outputs:
  - Removed field: `s3_key: string | null`
  - Added field: `download_url: string | null` (full CAS URL with content_type and disposition params)
  - Added field: `thumbnail_url: string | null` (full CAS URL with thumbnail param, only for image attachments)
- Errors: No change
- Evidence: Change brief specifies "Remove s3_key from API responses" and "Add pre-built CAS URLs to attachment responses"

**Removed endpoints:**
- Surface: `GET /api/parts/<key>/cover/thumbnail`
- Inputs: N/A (removed)
- Outputs: 404 Not Found after migration
- Errors: N/A
- Evidence: `/work/backend/app/api/documents.py:92-117`; change brief lists this endpoint under "Endpoints to Remove"

- Surface: `GET /api/parts/<key>/attachments/<id>/download`
- Inputs: N/A (removed)
- Outputs: 404 Not Found after migration
- Errors: N/A
- Evidence: `/work/backend/app/api/documents.py:186-205`; change brief lists this endpoint under "Endpoints to Remove"

- Surface: `GET /api/parts/<key>/attachments/<id>/thumbnail`
- Inputs: N/A (removed)
- Outputs: 404 Not Found after migration
- Errors: N/A
- Evidence: `/work/backend/app/api/documents.py:208-229`; change brief lists this endpoint under "Endpoints to Remove"

**Retained endpoint (metadata only):**
- Surface: `GET /api/parts/<key>/cover`
- Inputs: No change (part_key path param)
- Outputs: No change (returns `CoverAttachmentResponseSchema` with attachment metadata, not blob content)
- Errors: No change
- Evidence: `/work/backend/app/api/documents.py:76-89`; returns attachment metadata only, not file content

**Startup migration hook:**
- Surface: Application startup in `app/__init__.py` (runs before app serves requests)
- Inputs:
  - Config: `CAS_MIGRATION_DELETE_OLD_OBJECTS` (boolean, triggers S3 cleanup after migration)
- Outputs:
  - Logs: Migration progress (attachment ID, hash, status)
  - App startup blocked until migration completes
- Errors:
  - Database connection failure → app fails to start
  - S3 credential error → app fails to start
  - Individual attachment errors → logs warning, continues to next attachment (non-fatal)
- Evidence: Migration is one-time; code can be removed after production migrates; `/work/backend/app/__init__.py` shows startup patterns

---

## 5) Algorithms & State Machines

**Flow: CAS endpoint request handling**
- Flow: Serve blob content from CAS storage
- Steps:
  1. Parse `hash` from URL path; validate 64-char hex format
  2. Parse query params: `content_type`, `disposition`, `filename`, `thumbnail`
  3. Validate: if `thumbnail` present, `content_type` must be absent (return 400 if both)
  4. Validate: at least one of `thumbnail` or `content_type` must be present (return 400 if neither)
  5. Check `If-None-Match` header; if matches `"<hash>"`, return 304 with ETag
  6. If `thumbnail` param present:
     a. Derive hash from path
     b. Call ImageService.get_thumbnail_for_hash(hash, size) → returns path or generates
     c. Return file with `Content-Type: image/jpeg`, ETag, immutable Cache-Control
  7. Else (content_type param present):
     a. Build S3 key: `cas/<hash>`
     b. Download from S3Service.download_file(s3_key) → BytesIO or raises InvalidOperationException
     c. Set Content-Type from query param
     d. Set Content-Disposition: `<inline|attachment>; filename=<filename if provided>`
     e. Return file with ETag, immutable Cache-Control
  8. On S3 NoSuchKey error → return 404
  9. On other S3 error → return 500
- States / transitions: None (stateless request/response)
- Hotspots: S3 download latency for large PDFs; thumbnail generation CPU for first request; local disk I/O for cached thumbnails
- Evidence: Change brief specifies "Stateless: No database access" and validation rules

**Flow: Data migration (startup hook)**
- Flow: One-by-one attachment migration with per-row commit, runs on app startup
- Steps:
  1. Check if migration needed: `SELECT COUNT(*) FROM part_attachments WHERE s3_key IS NOT NULL AND s3_key NOT LIKE 'cas/%'`
  2. If count == 0: log "No migration needed", skip to cleanup check (step 6)
  3. Log "Starting CAS migration for {count} attachments"
  4. Loop: Get first unmigrated attachment: `SELECT * FROM part_attachments WHERE s3_key IS NOT NULL AND s3_key NOT LIKE 'cas/%' LIMIT 1`
     a. If none found → migration complete, break loop
     b. Download content from S3: `s3_service.download_file(old_s3_key)` → bytes
     c. Compute SHA-256 hash: `hashlib.sha256(bytes).hexdigest()`
     d. Build new S3 key: `cas/<hash>`
     e. Check if CAS object exists: `s3_service.file_exists(new_s3_key)`
     f. If not exists: upload to S3: `s3_service.upload_file(bytes, new_s3_key, content_type)`
     g. Update database: `attachment.s3_key = new_s3_key`
     h. Commit transaction: `session.commit()`
     i. Log success: "Migrated attachment {id}: {old_key} → {new_key} ({hash})"
     j. On error (download, upload): log error, skip to next iteration (orphaned CAS objects are acceptable - immutable and harmless)
     k. On DB commit error: log error, rollback, skip to next iteration
     l. Go to step 4 (loop continues until no unmigrated attachments remain)
  5. Log summary: "Migration complete: {migrated_count} attachments migrated, {error_count} errors"
  6. If `CAS_MIGRATION_DELETE_OLD_OBJECTS=true`:
     a. **Pre-validation**: Query `SELECT COUNT(*) FROM part_attachments WHERE s3_key IS NOT NULL AND s3_key NOT LIKE 'cas/%'`
     b. If count > 0: log error "Cannot run cleanup: {count} attachments not yet migrated", skip cleanup
     c. Query all distinct s3_keys: `SELECT DISTINCT s3_key FROM part_attachments WHERE s3_key LIKE 'cas/%'`
     d. Build set of protected CAS keys
     e. List all S3 objects in bucket (paginated)
     f. For each object NOT in protected set AND NOT starting with `cas/`:
        - Delete from S3: `s3_service.delete_file(key)`
        - Log: "Deleted old object: {key}"
        - On error: log warning, continue (best-effort cleanup)
     g. Log summary: "Cleanup complete: {deleted_count} old objects deleted"
  7. App startup continues (migration hook complete)
- States / transitions: None (sequential processing)
- Hotspots: S3 download/upload bandwidth for large files; database transaction commit frequency (once per attachment); listing all S3 objects for cleanup (pagination needed)
- Evidence: Change brief specifies "loop one-by-one, commit each, skip and log failures" and "if CAS_MIGRATION_DELETE_OLD_OBJECTS=true"

**Flow: Upload new attachment with CAS**
- Flow: Hash content before upload, deduplicate at S3 level
- Steps:
  1. Receive file upload or URL content (existing logic in DocumentService)
  2. Read file bytes into memory: `file_bytes = file_data.read()`
  3. Validate file type and size (existing logic)
  4. Compute SHA-256 hash: `hash_hex = hashlib.sha256(file_bytes).hexdigest()`
  5. Build S3 key: `s3_key = f"cas/{hash_hex}"`
  6. Create PartAttachment row with s3_key, content_type, file_size
  7. Flush database: `db.flush()` (to get attachment.id)
  8. Handle cover attachment logic (existing)
  9. Check if S3 object exists: `if s3_service.file_exists(s3_key): skip_upload = True`
  10. If not exists: upload to S3: `s3_service.upload_file(BytesIO(file_bytes), s3_key, content_type)`
  11. Return attachment (with new s3_key format in DB)
- States / transitions: None (sequential)
- Hotspots: SHA-256 computation for large files (CPU-bound); deduplication check adds one S3 head_object call per upload
- Evidence: `/work/backend/app/services/document_service.py:306-343` shows current upload flow; change brief specifies "Compute SHA-256 of uploaded bytes" and "skip upload if already exists"

**Flow: Copy attachment to another part (CAS-aware)**
- Flow: Copy CAS-based attachment without re-uploading (S3 object shared)
- Steps:
  1. Validate source attachment exists (existing logic)
  2. Validate target part exists (existing logic)
  3. Extract hash from source s3_key: `hash = source.s3_key.split('/')[-1]` (assumes `cas/<hash>` format)
  4. Create new PartAttachment row with same s3_key (no unique key needed, content is immutable)
  5. Flush database
  6. Handle cover attachment logic (existing)
  7. Skip S3 copy operation (object already exists at `cas/<hash>`)
  8. Return new attachment
- States / transitions: None
- Hotspots: Database write only; no S3 operations (deduplication benefit)
- Evidence: `/work/backend/app/services/document_service.py:624-692` shows current copy logic; CAS enables zero-copy for identical content

**Flow: Thumbnail generation with hash-based cache**
- Flow: Generate or retrieve cached thumbnail using hash from s3_key
- Steps:
  1. Receive s3_key and size from CAS endpoint (hash already extracted from URL path)
  2. **For CAS endpoint path**: hash is already known from URL, use directly
  3. **For legacy code paths** (during migration transition):
     a. Load attachment from database: `attachment = get_attachment(attachment_id)`
     b. Try CAS format: `match = re.match(r'cas/([0-9a-f]{64})', attachment.s3_key)`
     c. If match: `cache_key = match.group(1)` (hash-based)
     d. If no match (legacy UUID format): `cache_key = str(attachment.id)` (fallback to attachment_id-based)
  4. Build thumbnail cache path: `{THUMBNAIL_STORAGE_PATH}/{cache_key}_{size}.jpg`
  5. If cache file exists: return path
  6. Else: download from S3 using s3_key, generate thumbnail with PIL, save to cache path
  7. Return path
- States / transitions: None
- Hotspots: Regex extraction of hash; first-time thumbnail generation for each hash/size combo (CPU + S3 download)
- Evidence: `/work/backend/app/services/image_service.py:96-113` shows current thumbnail logic; fallback ensures thumbnails work during migration transition

---

## 6) Derived State & Invariants

- Derived value: CAS URL for attachment download
  - Source: Unfiltered attachment metadata from database (`s3_key`, `content_type`, `filename`)
  - Writes / cleanup: No persistent writes; URL string constructed on-the-fly in response schema
  - Guards: Only compute if `s3_key` is not null; validate s3_key starts with `cas/` before extracting hash
  - Invariant: Every attachment with non-null s3_key must have valid `cas/<hash>` format after migration completes
  - Evidence: `/work/backend/app/schemas/part_attachment.py:71-74` will add `@computed_field` for `download_url`

- Derived value: CAS URL for part cover thumbnail
  - Source: Unfiltered part.cover_attachment relationship (if present)
  - Writes / cleanup: No persistent writes; URL string constructed in PartResponseSchema computed field
  - Guards: Only compute if `cover_attachment_id` is not null; derive hash from cover_attachment.s3_key
  - Invariant: If `cover_attachment_id` is set, the referenced attachment must have valid `cas/<hash>` s3_key and be an image type
  - Evidence: `/work/backend/app/schemas/part.py:299-306` will replace `has_cover_attachment` with `cover_url` computed field

- Derived value: Thumbnail cache file path from hash
  - Source: Unfiltered s3_key from attachment row (`cas/<hash>`)
  - Writes / cleanup: Local filesystem write (thumbnail JPEG); cleaned by TempFileManager based on age (existing logic)
  - Guards: Regex validation that s3_key matches `cas/[0-9a-f]{64}` before extracting hash
  - Invariant: Thumbnail cache path must always use hash component from s3_key, never attachment_id
  - Evidence: `/work/backend/app/services/image_service.py:40-53` will change path generation logic

- Derived value: Protected CAS key set for cleanup
  - Source: Filtered query `SELECT DISTINCT s3_key FROM part_attachments WHERE s3_key LIKE 'cas/%'`
  - Writes / cleanup: S3 delete operations for unprotected keys (best-effort, logged failures)
  - Guards: Cleanup only runs if `CAS_MIGRATION_DELETE_OLD_OBJECTS=true`; filtered query ensures only CAS keys protected (not old UUID keys)
  - Invariant: Must not delete any S3 object referenced by any attachment row in database
  - Evidence: Change brief specifies cleanup guarded by config flag; migration must build protected set before deleting

- Derived value: Deduplication decision during upload
  - Source: Unfiltered SHA-256 hash of uploaded bytes
  - Writes / cleanup: Conditional S3 upload (skip if object exists); database write always occurs
  - Guards: S3 `file_exists()` check before upload; idempotent (re-uploading same content is safe)
  - Invariant: Every unique content hash maps to exactly one S3 object at `cas/<hash>`; multiple DB rows can reference same S3 key
  - Evidence: Change brief specifies "skip upload if already exists - deduplication"

---

## 7) Consistency, Transactions & Concurrency

**Migration transaction scope:**
- Transaction scope: One database transaction per attachment during migration; each commit includes only one attachment update
- Atomic requirements: For each attachment: (1) S3 upload of new CAS object, (2) database update of s3_key column must succeed together or roll back
- Retry / idempotency: Migration is idempotent - attachments with s3_key starting with `cas/` are skipped; re-running migration processes only unmigrated attachments; S3 uploads are idempotent (overwriting same content with same hash is safe)
- Ordering / concurrency controls: No locking needed (single-threaded CLI migration); migration should not run concurrently with app serving requests (deployment coordination required)
- Evidence: Change brief specifies "commit each" and migration runs "one-by-one"; `/work/backend/app/cli.py:96-120` shows database transaction pattern

**Upload transaction scope:**
- Transaction scope: One transaction per upload request (existing pattern in DocumentService)
- Atomic requirements: (1) PartAttachment row insert, (2) cover_attachment_id update (if applicable), (3) S3 upload must succeed or roll back database changes
- Retry / idempotency: Client retries create duplicate attachments (existing behavior); S3 upload idempotent (overwriting same hash is safe); deduplication check (`file_exists`) adds eventual consistency risk (S3 object may not be visible immediately after upload by another client) but acceptable
- Ordering / concurrency controls: Database flush before S3 upload ensures attachment row exists before external storage write; S3 failure triggers exception → rollback
- Evidence: `/work/backend/app/services/document_service.py:306-343` shows existing transaction pattern with flush before S3 upload

**CAS endpoint concurrency:**
- Transaction scope: No database transactions (stateless endpoint)
- Atomic requirements: None (read-only S3 operations)
- Retry / idempotency: Fully idempotent (GET requests); safe to retry on failure
- Ordering / concurrency controls: No database access, no locks; S3 reads are eventually consistent; thumbnail cache writes are not atomic (concurrent requests for same hash/size may generate duplicate thumbnails, but last-write-wins is acceptable)
- Evidence: Change brief specifies "cas/ endpoint MUST NOT touch the database"

**Cleanup transaction scope (optional):**
- Transaction scope: No database writes during cleanup; read-only query to build protected set; S3 deletes are non-transactional (best-effort)
- Atomic requirements: None (cleanup failures are logged and ignored)
- Retry / idempotency: Idempotent (deleting already-deleted object is safe in S3)
- Ordering / concurrency controls: Cleanup must run AFTER migration completes; must not run concurrently with uploads (risk of deleting newly uploaded CAS objects not yet in database)
- Evidence: Change brief specifies S3 cleanup is "best-effort" and logged failures; cleanup phase is separate from migration

---

## 8) Errors & Edge Cases

**Failure: CAS endpoint - both content_type and thumbnail params provided**
- Surface: `GET /api/cas/<hash>?content_type=...&thumbnail=...`
- Handling: Return 400 Bad Request with error message "Cannot specify both content_type and thumbnail parameters"
- Guardrails: Validation logic at start of endpoint handler; reject request before any S3 operations
- Evidence: Change brief specifies "Return 400 Bad Request if both content_type and thumbnail params are provided"

**Failure: CAS endpoint - neither content_type nor thumbnail provided**
- Surface: `GET /api/cas/<hash>` (no query params)
- Handling: Return 400 Bad Request with error message "Must specify either content_type or thumbnail parameter"
- Guardrails: Validation logic checks both params are absent
- Evidence: Change brief implies mutual exclusivity but at least one required

**Failure: CAS endpoint - S3 object not found**
- Surface: `GET /api/cas/<hash>?content_type=...`
- Handling: Return 404 Not Found with error message "Content not found"
- Guardrails: Catch S3Service.download_file() raising InvalidOperationException with NoSuchKey; log warning (hash may be orphaned or migration incomplete)
- Evidence: `/work/backend/app/services/s3_service.py:97-122` shows S3 download error handling

**Failure: CAS endpoint - thumbnail generation fails (corrupted image)**
- Surface: `GET /api/cas/<hash>?thumbnail=150`
- Handling: Return 500 Internal Server Error with error message "Failed to generate thumbnail"
- Guardrails: Catch PIL exceptions in ImageService.get_thumbnail_for_hash(); log error with hash and stack trace
- Evidence: `/work/backend/app/services/image_service.py:55-94` shows thumbnail generation with PIL error handling

**Failure: Migration - attachment download fails (S3 unavailable)**
- Surface: `inventory-cli migrate-to-cas --yes-i-am-sure`
- Handling: Log error "Failed to download attachment {id} from S3: {error}"; rollback transaction for that attachment; continue to next attachment; do not fail entire migration
- Guardrails: Wrap S3Service.download_file() in try/except per attachment; count errors and report in final summary
- Evidence: Change brief specifies "skip and log failures" for migration

**Failure: Migration - hash collision (extremely unlikely)**
- Surface: `inventory-cli migrate-to-cas --yes-i-am-sure`
- Handling: SHA-256 collision probability is negligible (<10^-60 for realistic corpus); if detected (two different contents hash to same value), second upload would overwrite first → data corruption; no guardrail implemented (accept theoretical risk)
- Guardrails: None (collision detection would require downloading existing CAS object and comparing bytes, too expensive)
- Evidence: Cryptographic assumption of SHA-256 security

**Failure: Upload - file too large for in-memory hash**
- Surface: POST /api/parts/<key>/attachments (file upload)
- Handling: Flask request.files.read() already loads entire file into memory (existing behavior); hashing adds negligible overhead; file size limits enforced before hashing (MAX_FILE_SIZE)
- Guardrails: Existing file size validation at `/work/backend/app/services/document_service.py:175-192`
- Evidence: `/work/backend/app/config.py:71-78` defines MAX_FILE_SIZE (100MB); SHA-256 can handle this in memory

**Failure: Thumbnail cache path derivation - s3_key not in CAS format**
- Surface: ImageService.get_thumbnail_for_hash() called with attachment having old UUID-based s3_key
- Handling: Regex match on `cas/([0-9a-f]{64})` fails; raise InvalidOperationException "Cannot derive hash from s3_key: {s3_key}"
- Guardrails: Regex validation before extracting hash; error surfaces to API caller (500 or 404 depending on context)
- Evidence: Thumbnail logic at `/work/backend/app/services/image_service.py:96-113` will add regex validation

**Failure: Cleanup deletes object still referenced by attachment (race condition)**
- Surface: `inventory-cli migrate-to-cas --delete-old-objects --yes-i-am-sure` run concurrently with upload
- Handling: Upload creates new attachment → flush DB → upload S3 → commit; Cleanup queries DB for protected set → might miss newly created attachment if query runs between flush and commit; S3 delete could orphan newly created attachment
- Guardrails: Document in migration guide that cleanup must not run concurrently with app; require app shutdown or deployment coordination
- Evidence: Deployment best practice; no code-level lock (CLI runs outside app process)

**Edge case: Attachment with null s3_key (URL-only attachments)**
- Surface: All code paths handling attachments
- Handling: URL attachments have `attachment_type=URL` and `s3_key=null`; migration skips these (WHERE s3_key IS NOT NULL); CAS URL computation skips if s3_key is null; no thumbnail available
- Guardrails: Null checks in computed fields; existing handling at `/work/backend/app/models/part_attachment.py:39`
- Evidence: `/work/backend/app/models/part_attachment.py:25-23` shows AttachmentType.URL

**Edge case: Cover attachment not an image**
- Surface: PartResponseSchema.cover_url computed field
- Handling: cover_url should only be computed if cover_attachment.content_type starts with 'image/'; if cover is a PDF, **return null gracefully** (do not raise exception - fail gracefully to avoid breaking GET /api/parts/<key>)
- Guardrails: Validation in computed field checks `has_preview` property; log warning if cover_attachment is not an image (data integrity issue but non-fatal)
- Evidence: `/work/backend/app/models/part_attachment.py:60-64` shows `has_preview` property checks content_type

**Edge case: Deduplication - two attachments same content, different filenames**
- Surface: Upload flow
- Handling: Both attachments share same s3_key (`cas/<hash>`); each has unique filename/title in DB; frontend sees two distinct attachments with different download URLs (different filename query param)
- Guardrails: Intentional design; deduplication saves S3 storage; metadata (filename, title) remains distinct per attachment
- Evidence: Change brief specifies "Deduplication is intentional - same content = same hash = same S3 object"

---

## 9) Observability / Telemetry

**Signal: Migration progress log**
- Type: Structured log (INFO level)
- Trigger: Per-attachment during `migrate-to-cas` command
- Labels / fields: `attachment_id`, `old_s3_key`, `new_s3_key`, `hash`, `status` (success/error)
- Consumer: CLI output; log aggregation for deployment monitoring
- Evidence: Migration flow requires per-attachment logging; `/work/backend/app/cli.py` shows logging patterns

**Signal: Migration summary log**
- Type: Structured log (INFO level)
- Trigger: End of `migrate-to-cas` command
- Labels / fields: `total_attachments`, `migrated_count`, `error_count`, `deleted_objects_count` (if cleanup ran)
- Consumer: Deployment verification; success criteria check
- Evidence: CLI command must report overall status

**Signal: CAS endpoint request counter**
- Type: Counter
- Trigger: Each request to `GET /api/cas/<hash>`
- Labels / fields: `status_code` (200, 304, 400, 404, 500), `is_thumbnail` (boolean)
- Consumer: Prometheus metrics dashboard; track CAS adoption and cache hit rate
- Evidence: `/work/backend/CLAUDE.md:256-287` describes MetricsService integration for API endpoints

**Signal: CAS endpoint response time histogram**
- Type: Histogram
- Trigger: Each request to `GET /api/cas/<hash>`
- Labels / fields: `is_thumbnail` (boolean), `cache_hit` (boolean, for thumbnails)
- Consumer: Performance monitoring; identify slow S3 downloads or thumbnail generation
- Evidence: `/work/backend/CLAUDE.md:256-287` describes Histogram usage for latency

**Signal: Deduplication skip counter**
- Type: Counter
- Trigger: Upload flow when `s3_service.file_exists(cas_key)` returns True
- Labels / fields: None (increment only)
- Consumer: Track deduplication effectiveness; cost savings metric
- Evidence: Deduplication is key feature; worth tracking adoption

**Signal: Thumbnail cache miss counter**
- Type: Counter
- Trigger: ImageService generates new thumbnail (cache miss)
- Labels / fields: `size` (thumbnail pixel size)
- Consumer: Track thumbnail generation load; optimize cache sizing
- Evidence: Existing ImageService logs at `/work/backend/app/services/image_service.py:17`

**Signal: Old S3 object deletion log**
- Type: Structured log (INFO level for success, WARNING for failure)
- Trigger: Cleanup phase of `migrate-to-cas --delete-old-objects`
- Labels / fields: `s3_key`, `status` (deleted/error)
- Consumer: Verify cleanup completed; audit orphaned objects
- Evidence: Change brief specifies S3 cleanup is best-effort and logged

---

## 10) Background Work & Shutdown

**Worker / job: Startup migration hook**
- Trigger cadence: One-time execution during app startup (before serving requests)
- Responsibilities: Check for unmigrated attachments, iterate and migrate each, download from S3, hash, upload to CAS location, update DB row; optionally delete old S3 objects if config flag set
- Shutdown handling: Migration blocks startup until complete; SIGINT during migration leaves partial state but is idempotent (can resume on next startup); per-row commits ensure progress is saved
- Evidence: `/work/backend/app/__init__.py` shows startup patterns; migration code can be deleted after production migrates

**Worker / job: Thumbnail generation (on-demand)**
- Trigger cadence: Event-driven (triggered by CAS endpoint request with `?thumbnail=` param)
- Responsibilities: Download image from S3, resize with PIL, save to local cache; subsequent requests served from cache
- Shutdown handling: No background thread (synchronous request handling); temp files cleaned by TempFileManager background thread (existing)
- Evidence: `/work/backend/app/services/image_service.py:55-94` shows synchronous thumbnail generation; `/work/backend/CLAUDE.md:384-437` describes TempFileManager shutdown integration

**Note on existing background workers:**
- No new background threads introduced by CAS migration
- Existing TempFileManager cleanup thread handles orphaned thumbnail files (age-based cleanup)
- MetricsService background thread (existing) will emit new CAS-related metrics
- Evidence: `/work/backend/CLAUDE.md:384-437` describes existing shutdown integration for MetricsService and TempFileManager

---

## 11) Security & Permissions

**Concern: S3 key exposure**
- Touchpoints: API response schemas (PartAttachmentResponseSchema, PartAttachmentListSchema)
- Mitigation: Remove `s3_key` field from all API responses; replace with computed `download_url` and `thumbnail_url` that construct full CAS URLs with query params; S3 keys remain internal implementation detail
- Residual risk: None; frontend never sees S3 bucket structure
- Evidence: `/work/backend/app/schemas/part_attachment.py:71-74` currently exposes s3_key (security issue)

**Concern: Unauthorized blob access**
- Touchpoints: CAS endpoint `GET /api/cas/<hash>`
- Mitigation: No authentication required (existing behavior for blob endpoints); hashes are 64-char SHA-256 (unguessable without prior knowledge); `Cache-Control: immutable` is safe because content cannot be modified
- Residual risk: If hash is leaked, anyone can access content; acceptable for hobby inventory use case (no sensitive data expected); auth can be added later if needed
- Evidence: Existing blob endpoints at `/work/backend/app/api/documents.py:92-229` have no auth; CAS maintains same security posture

**Concern: Hash enumeration attack**
- Touchpoints: CAS endpoint `GET /api/cas/<hash>`
- Mitigation: SHA-256 hash space is 2^256; brute-force enumeration is infeasible; no directory listing provided
- Residual risk: Negligible; attacker would need ~10^70 requests to find valid hash
- Evidence: Cryptographic security of SHA-256

---

## 12) UX / UI Impact

**Entry point: Part detail view (frontend)**
- Change: Cover thumbnail URL changes from `/api/parts/<key>/cover/thumbnail?size=150` to `/api/cas/<hash>?thumbnail=150`
- User interaction: No visible change; images load faster due to immutable caching (browser never revalidates)
- Dependencies: Frontend must use `cover_url` field from API response instead of constructing URL from part key
- Evidence: Change brief specifies "Backend provides complete URLs in responses (cover_url, attachment URLs)"

**Entry point: Attachment list (frontend)**
- Change: Download/view URLs change from `/api/parts/<key>/attachments/<id>/download` to `/api/cas/<hash>?content_type=<mime>&disposition=<inline|attachment>&filename=<name>`
- User interaction: No visible change; PDFs and images load faster due to immutable caching
- Dependencies: Frontend must use `download_url` and `thumbnail_url` fields from attachment schema instead of constructing URLs from part key and attachment ID
- Evidence: Change brief specifies "Add pre-built CAS URLs to attachment responses"

**Entry point: Migration CLI (developer/operator)**
- Change: New command `inventory-cli migrate-to-cas --yes-i-am-sure` available
- User interaction: Run command during deployment; monitor log output for errors; verify summary shows all attachments migrated
- Dependencies: Deployment runbook must include migration step before new code deployed; CLI must be run with app stopped or in maintenance mode
- Evidence: Migration required before removing old blob endpoints

---

## 13) Deterministic Test Plan

**Surface: CAS endpoint (app/api/cas.py)**
- Scenarios:
  - Given valid hash and content_type query param, When GET /api/cas/<hash>?content_type=application/pdf, Then return 200 with PDF bytes, Content-Type header, immutable Cache-Control, ETag
  - Given valid hash and If-None-Match header matches ETag, When GET /api/cas/<hash>?content_type=..., Then return 304 Not Modified
  - Given valid hash and thumbnail query param, When GET /api/cas/<hash>?thumbnail=150, Then return 200 with JPEG thumbnail, Content-Type: image/jpeg, immutable Cache-Control
  - Given valid hash and thumbnail with If-None-Match header matches ETag, When GET /api/cas/<hash>?thumbnail=150 with If-None-Match, Then return 304 Not Modified
  - Given both content_type and thumbnail params, When GET /api/cas/<hash>?content_type=...&thumbnail=150, Then return 400 Bad Request
  - Given neither content_type nor thumbnail param, When GET /api/cas/<hash>, Then return 400 Bad Request
  - Given nonexistent hash, When GET /api/cas/<hash>?content_type=..., Then return 404 Not Found
  - Given S3 service unavailable, When GET /api/cas/<hash>?content_type=..., Then return 500 Internal Server Error
  - Given disposition=attachment and filename query params, When GET /api/cas/<hash>?content_type=...&disposition=attachment&filename=test.pdf, Then return Content-Disposition: attachment; filename="test.pdf"
  - Given disposition=inline (default), When GET /api/cas/<hash>?content_type=..., Then return Content-Disposition: inline
- Fixtures / hooks: Mock S3Service to return test content or raise errors; seed test attachment with known hash; mock ImageService for thumbnail tests
- Gaps: None
- Evidence: `/work/backend/tests/test_document_api.py` shows existing API test patterns

**Surface: CAsMigrationService (app/services/cas_migration_service.py)**
- Scenarios:
  - Given attachment with UUID-based s3_key, When migrate_attachment(), Then download from old key, compute hash, upload to cas/<hash>, update DB s3_key, return success
  - Given attachment with cas/ s3_key, When migrate_attachment(), Then skip migration, return skipped status
  - Given S3 download fails, When migrate_attachment(), Then log error, skip attachment, continue to next
  - Given S3 upload fails, When migrate_attachment(), Then log error, skip attachment (orphaned CAS object acceptable), continue to next
  - Given S3 upload succeeds but DB commit fails, When migrate_attachment(), Then rollback transaction, log error, continue (orphaned CAS object acceptable - immutable and harmless)
  - Given multiple attachments with same content, When migrate_all(), Then both point to same cas/<hash> key (deduplication via file_exists check)
  - Given cleanup flag enabled and migration complete, When cleanup_old_objects(), Then delete S3 objects not in protected CAS key set, log deletions
  - Given cleanup flag enabled but migration incomplete, When cleanup_old_objects(), Then log error "Cannot run cleanup", skip cleanup (no deletions)
  - Given cleanup flag disabled, When cleanup_old_objects(), Then no-op
- Fixtures / hooks: Create test attachments with mock S3 objects; mock S3Service methods; use in-memory database for rollback tests
- Gaps: None
- Evidence: `/work/backend/tests/test_document_service.py` shows service test patterns

**Surface: DocumentService upload flow (app/services/document_service.py)**
- Scenarios:
  - Given file upload, When create_file_attachment(), Then compute hash, create attachment with cas/<hash> s3_key, upload to S3, return attachment
  - Given identical file uploaded twice, When create_file_attachment() second time, Then skip S3 upload (deduplication), create separate DB row with same s3_key
  - Given URL attachment, When create_url_attachment(), Then compute hash of downloaded content, store with cas/<hash> s3_key
- Fixtures / hooks: Mock S3Service.file_exists() to control deduplication behavior; inject test files with known hashes
- Gaps: None
- Evidence: `/work/backend/tests/test_document_service.py:194-224` shows existing upload tests

**Surface: DocumentService copy flow (app/services/document_service.py)**
- Scenarios:
  - Given source attachment with cas/<hash> s3_key, When copy_attachment_to_part(), Then create new attachment with same s3_key, skip S3 copy, return new attachment
- Fixtures / hooks: Create source attachment with CAS key; mock S3Service to verify no copy operation called
- Gaps: None
- Evidence: `/work/backend/tests/test_document_service.py` shows copy tests

**Surface: ImageService thumbnail generation (app/services/image_service.py)**
- Scenarios:
  - Given attachment with cas/<hash> s3_key and size=150, When get_thumbnail_for_hash(), Then extract hash, check cache at {hash}_150.jpg, generate if missing, return path
  - Given thumbnail cache hit, When get_thumbnail_for_hash(), Then return cached path without S3 download
  - Given s3_key not matching cas/ format, When get_thumbnail_for_hash(), Then raise InvalidOperationException
- Fixtures / hooks: Mock attachment with CAS s3_key; mock S3Service.download_file(); mock filesystem for cache tests
- Gaps: None
- Evidence: `/work/backend/tests/test_image_service.py` shows existing thumbnail tests

**Surface: PartAttachmentResponseSchema computed fields (app/schemas/part_attachment.py)**
- Scenarios:
  - Given attachment with cas/<hash> s3_key and content_type, When serialize to PartAttachmentResponseSchema, Then download_url contains /api/cas/<hash>?content_type=...&disposition=attachment&filename=...
  - Given image attachment with cas/<hash> s3_key, When serialize, Then thumbnail_url contains /api/cas/<hash>?thumbnail=150
  - Given PDF attachment with cas/<hash> s3_key, When serialize, Then thumbnail_url is null (only images have thumbnails)
  - Given URL-type attachment with null s3_key, When serialize, Then download_url is null and thumbnail_url is null
  - Given attachment with legacy UUID s3_key (during migration), When serialize, Then download_url and thumbnail_url are null (force migration first)
- Fixtures / hooks: Create test attachments with various types and s3_keys
- Gaps: None
- Evidence: `/work/backend/tests/test_parts_api.py` shows schema validation tests

**Surface: PartResponseSchema cover_url computed field (app/schemas/part.py)**
- Scenarios:
  - Given part with cover_attachment_id set to image attachment with CAS s3_key, When serialize to PartResponseSchema, Then cover_url contains /api/cas/<hash>?thumbnail=150
  - Given part with null cover_attachment_id, When serialize, Then cover_url is null
  - Given part with cover pointing to PDF attachment (non-image), When serialize, Then cover_url is null (graceful handling, log warning)
  - Given part with cover pointing to URL-type attachment (null s3_key), When serialize, Then cover_url is null
- Fixtures / hooks: Create test parts with various cover configurations
- Gaps: None
- Evidence: `/work/backend/tests/test_parts_api.py` shows part schema tests

**Surface: Removed blob endpoints (app/api/documents.py)**
- Scenarios:
  - Given migrated database, When GET /api/parts/<key>/cover/thumbnail, Then return 404 Not Found (endpoint removed)
  - Given migrated database, When GET /api/parts/<key>/attachments/<id>/download, Then return 404 Not Found (endpoint removed)
  - Given migrated database, When GET /api/parts/<key>/attachments/<id>/thumbnail, Then return 404 Not Found (endpoint removed)
  - Given migrated database, When GET /api/parts/<key>/cover (metadata endpoint), Then return 200 with attachment metadata (endpoint retained)
- Fixtures / hooks: None (route removal verification)
- Gaps: None
- Evidence: `/work/backend/tests/test_document_api.py` shows endpoint tests

**Surface: Startup migration hook (app/__init__.py / CAsMigrationService)**
- Scenarios:
  - Given database with all CAS s3_keys (already migrated), When app starts, Then skip migration, log "No migration needed"
  - Given database with 10 UUID-based s3_keys, When app starts, Then migrate all 10, log progress and summary
  - Given migration partially complete (5 of 10 migrated), When app restarts, Then skip first 5 (already CAS), migrate remaining 5
  - Given CAS_MIGRATION_DELETE_OLD_OBJECTS=true and all migrated, When app starts, Then run cleanup after migration
  - Given CAS_MIGRATION_DELETE_OLD_OBJECTS=true but migration incomplete (errors), When cleanup phase runs, Then skip cleanup with error log
- Fixtures / hooks: Use TestDataService to seed attachments; mock S3Service for deterministic tests; capture startup logs
- Gaps: None
- Evidence: `/work/backend/app/__init__.py` shows startup patterns

---

## 14) Implementation Slices

**Slice 1: CAS infrastructure (no migration yet)**
- Goal: Ship CAS endpoint and updated upload flow; old endpoints still functional
- Touches:
  - `app/api/cas.py` (new CAS endpoint with validation, S3 download, thumbnail generation)
  - `app/services/s3_service.py` (add hash-based key helpers, deduplication check)
  - `app/services/document_service.py` (update upload flow to compute hash and use CAS keys)
  - `app/services/image_service.py` (update thumbnail cache to use hash-based keys with fallback to attachment_id for old data)
  - `app/config.py` (add CAS_MIGRATION_DELETE_OLD_OBJECTS flag)
  - `app/__init__.py` (register CAS blueprint)
  - `app/services/container.py` (wire dependencies)
  - `tests/test_cas_api.py` (CAS endpoint tests)
  - `tests/test_document_service.py` (upload flow tests)
  - `tests/test_image_service.py` (thumbnail cache tests)
- Dependencies: None; fully additive (old endpoints unchanged)

**Slice 2: Migration tooling**
- Goal: Ship migration service with startup hook; runs automatically on app start
- Touches:
  - `app/services/cas_migration_service.py` (migration logic, cleanup logic)
  - `app/__init__.py` (add startup hook to run migration before serving requests)
  - `alembic/versions/XXX_cas_migration_note.py` (empty migration documenting s3_key semantics change)
  - `tests/test_cas_migration_service.py` (migration service tests)
- Dependencies: Slice 1 must be deployed first (CAS endpoint and upload flow operational)

**Slice 3: API response schema updates**
- Goal: Ship computed fields for CAS URLs; remove s3_key from responses; remove old blob endpoints
- Touches:
  - `app/schemas/part_attachment.py` (remove s3_key, add download_url and thumbnail_url computed fields)
  - `app/schemas/part.py` (replace has_cover_attachment with cover_url computed field)
  - `app/api/documents.py` (remove cover thumbnail, attachment download, attachment thumbnail endpoints)
  - `tests/test_parts_api.py` (update schema validation tests)
  - `tests/test_document_api.py` (verify removed endpoints return 404)
- Dependencies: Migration must be run in all environments before this slice deployed (frontend relies on computed URLs)

**Slice 4: Test data cleanup**
- Goal: Update test data to reflect CAS migration
- Touches:
  - `app/data/test_data/parts.json` (if needed, update s3_key values to CAS format)
  - CI/CD pipeline (add migration step to test data loading)
- Dependencies: Slice 2 deployed (migration tooling available)

---

## 15) Risks & Open Questions

**Risks:**

- Risk: App startup blocked during migration for large attachment corpus
- Impact: Extended startup time; health checks may fail if migration takes too long
- Mitigation: Migration runs once per deployment (idempotent); for very large corpora, consider staging migration; logging shows progress

- Risk: S3 eventual consistency causes deduplication race (two concurrent uploads of same content both pass file_exists check)
- Impact: Minor - duplicate S3 objects uploaded, wasted storage; both attachments work correctly
- Mitigation: Accept risk (eventual consistency window is milliseconds); cleanup job can deduplicate later if needed

- Risk: Large attachments (100MB PDFs) cause memory pressure during hash computation
- Impact: Worker process OOM or slow request handling
- Mitigation: Existing MAX_FILE_SIZE limit (100MB) is acceptable for in-memory hashing; Python hashlib.sha256() is efficient; monitor memory usage post-deployment

- Risk: Thumbnail cache fills disk due to hash-based naming (old attachment_id-based cache not cleaned)
- Impact: Disk space exhaustion in /tmp/thumbnails
- Mitigation: TempFileManager age-based cleanup handles orphaned files; consider one-time cache purge during migration

- Risk: Old blob endpoints removed before all clients updated to use CAS URLs
- Impact: 404 errors for clients using old hardcoded URLs or outdated API responses
- Mitigation: Deploy schema changes (Slice 3) only after frontend updated; consider temporary redirects from old endpoints to CAS (out of scope for MVP)

**Open questions: None**

All requirements clarified:
- Migration runs on app startup (not CLI)
- Cleanup pre-validates migration is complete before deleting
- ImageService has fallback for legacy s3_keys during transition
- Orphaned CAS objects from failed DB commits are acceptable (immutable, harmless)
- Non-image cover attachments return null gracefully (no exception)

---

## 16) Confidence

Confidence: High — The plan is well-defined with clear implementation slices, comprehensive test coverage, and explicit handling of migration risks. The CAS design is stateless and immutable by nature, reducing complexity. The migration strategy (one-by-one with per-row commit) is conservative and idempotent. Evidence from the existing codebase (S3Service, DocumentService, ImageService) shows solid patterns for storage operations and error handling. The main deployment coordination (running migration before schema changes) is documented as a risk with clear mitigation.
