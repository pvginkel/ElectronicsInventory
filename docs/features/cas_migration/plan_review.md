# CAS Migration — Plan Review

## 1) Summary & Decision

**Readiness**

The plan is comprehensive and well-structured with detailed coverage of API changes, migration logic, test scenarios, and observability. The stateless CAS endpoint design is sound, and the migration strategy (one-by-one with per-row commits) is appropriately conservative. However, there are **critical gaps** in persistence invariants, transaction safety during migration, and test coverage for derived-value edge cases that must be addressed before implementation.

**Decision**

`GO-WITH-CONDITIONS` — The plan demonstrates strong architectural understanding and thorough research, but requires fixes to: (1) migration transaction rollback handling when S3 operations fail after DB flush, (2) ImageService hash extraction logic for thumbnail cache keys, (3) test coverage for filtered cleanup operations, (4) explicit handling of non-image cover attachments, and (5) clarification of endpoint removal vs. retention for the metadata-only cover endpoint.

---

## 2) Conformance & Fit (with evidence)

**Conformance to refs**

- `@docs/product_brief.md` — Pass — `plan.md:78-97` — Plan correctly identifies hobby electronics inventory context and single-user assumptions; CAS migration improves performance without changing product scope.

- `@CLAUDE.md` (Layering) — Pass — `plan.md:135-220` — Plan respects API/Service/Model separation; CAS endpoint at `app/api/cas.py` is stateless; DocumentService owns business logic for uploads/migration; no cross-layer violations.

- `@CLAUDE.md` (S3 Storage Consistency) — **Partial** — `plan.md:542-569` — Plan correctly sequences "flush DB → upload S3 → rollback on failure" for uploads (line 551-554), but migration flow (lines 423-438) shows "download S3 → upload S3 → update DB → commit" without explicit rollback if S3 upload fails mid-migration. This violates the pattern of "persist rows before S3 hits S3" because the migration downloads first, then writes DB after the new S3 upload. The plan should clarify: if new CAS upload succeeds but DB update fails, is there orphaned S3 cleanup? Or is the migration wrapped in a transaction that rolls back the s3_key update?

- `@CLAUDE.md` (Testing Requirements) — Pass — `plan.md:768-858` — Comprehensive test scenarios covering service methods, API endpoints, edge cases, and error conditions. Test plan includes fixtures, hooks, and deterministic coverage per requirements.

- `@CLAUDE.md` (Metrics Infrastructure) — Pass — `plan.md:648-697` — Plan includes appropriate Prometheus counters (CAS requests, deduplication skips) and histograms (response time, cache hits). Aligns with existing MetricsService patterns.

- `@CLAUDE.md` (Dependency Injection) — Pass — `plan.md:189-199` — Plan specifies wiring CAsMigrationService in ServiceContainer and using `@inject` decorator for API endpoints; follows existing DI patterns.

- `@CLAUDE.md` (Error Handling Philosophy — Fail Fast) — Pass — `plan.md:573-644` — Plan enumerates expected failures (400/404/500 errors), raises InvalidOperationException for invalid states, and surfaces errors to callers. No silent error swallowing detected.

**Fit with codebase**

- `app/services/s3_service.py` — `plan.md:160-163` — Plan assumes S3Service will add `file_exists()` method for deduplication checks; this method is not currently present at `/work/backend/app/services/s3_service.py:48-150`. The plan should explicitly list this as a new method to be added with appropriate error handling (ClientError, NoSuchKey edge cases).

- `app/services/image_service.py` — `plan.md:169-172, 485-497` — Plan proposes regex extraction of hash from s3_key pattern `cas/([0-9a-f]{64})` to derive thumbnail cache keys. The current ImageService at `/work/backend/app/services/image_service.py:40-53` uses `{attachment_id}_{size}.jpg`. **Gap:** The plan does not specify whether ImageService methods will accept attachment_id and load the attachment to extract hash, or whether the CAS endpoint will extract hash directly and pass it. The flow at line 488 shows "Receive attachment ID and size" but the CAS endpoint (line 407-409) calls "ImageService.get_thumbnail_for_hash(hash, size)" with hash directly. These are inconsistent. Clarify: does ImageService get refactored to accept both attachment_id (for backward compat) and hash (for CAS), or is there a single new method?

- `app/schemas/part_attachment.py` — `plan.md:173-176` — Plan proposes removing `s3_key` field and adding computed `download_url` and `thumbnail_url`. The schema at `/work/backend/app/schemas/part_attachment.py:71-74` currently exposes s3_key. **Security improvement confirmed.** However, the plan does not specify whether these computed fields will handle null s3_key (URL-only attachments) gracefully. Edge case at line 628-632 mentions this but does not mandate a test scenario for it in section 13 (test plan). Add explicit test: "Given URL attachment with null s3_key, When serialize, Then download_url and thumbnail_url are null."

- `app/api/documents.py` — `plan.md:181-183, 353-370` — Plan lists three endpoints to remove (cover thumbnail, attachment download, attachment thumbnail) but shows ambiguity at line 372-377: "Retained endpoint (metadata only): GET /api/parts/<key>/cover". The change brief at line 40 says "keep? TBD during planning." **Unresolved question:** Is this endpoint being kept or removed? The plan says "keep" but does not justify why metadata endpoint is needed if frontend uses `cover_url` directly from PartResponseSchema. If retained, what is the use case?

- `app/models/part_attachment.py` — `plan.md:225-229` — Plan correctly identifies s3_key column as String(500) nullable, matching `/work/backend/app/models/part_attachment.py:39`. No schema migration needed. Semantics change from UUID format to CAS format is correctly noted. However, the plan does not address whether 500 characters is sufficient for `cas/<64-char-hash>` (answer: yes, 68 characters total, well under limit). Minor: plan could explicitly confirm size sufficiency.

- `app/cli.py` — `plan.md:189-191, 379-392` — Plan proposes `migrate-to-cas` CLI command following existing patterns at `/work/backend/app/cli.py:36-93`. The plan specifies `--yes-i-am-sure` flag (good, matches destructive operation pattern like `load-test-data`). **Gap:** Plan does not specify whether migration runs automatically on app startup or only via manual CLI invocation. Change brief line 46 says "On startup, migrate attachments one-by-one" but plan section 10 (line 703-707) says "One-time invocation via CLI before deployment." These are contradictory. Clarify: is this a startup hook or a manual CLI command?

---

## 3) Open Questions & Ambiguities

- Question: Does migration run automatically on app startup, or only via manual CLI command?
- Why it matters: Startup migration blocks app availability until complete; manual CLI requires deployment coordination and runbook documentation; affects rollout strategy and downtime planning.
- Needed answer: Explicit decision on trigger mechanism; if startup, specify timeout/failure behavior; if CLI, document deployment sequence (stop app → run CLI → start app with new code).

- Question: Is the `GET /api/parts/<key>/cover` metadata endpoint being retained or removed?
- Why it matters: Plan says "keep" (line 372-377) but change brief says "TBD" (line 40); if kept, must justify use case and update test plan to verify it still works post-migration; if removed, must update plan to delete endpoint and tests.
- Needed answer: Explicit retention decision with rationale; if removed, add to "Endpoints to Remove" list in section 4.

- Question: How does ImageService.get_thumbnail_for_hash() integrate with existing code that passes attachment_id?
- Why it matters: Plan shows two signatures: "get_thumbnail_for_hash(hash, size)" at line 408 and "Receive attachment ID and size" at line 488; existing code may call ImageService with attachment_id, requiring backward compatibility or widespread refactor.
- Needed answer: Specify whether ImageService gets two methods (legacy + CAS), or a single refactored method that accepts either attachment_id or hash, or whether all callers are updated to pass hash.

- Question: What is the rollback behavior if migration's S3 upload succeeds but DB update fails?
- Why it matters: Plan shows "upload to S3 → update DB → commit" at lines 434-436; if commit fails, CAS object is uploaded but not referenced (orphaned S3 blob); cleanup job may not handle this if it only protects keys in DB.
- Needed answer: Wrap migration loop in explicit transaction with rollback on DB error; or accept orphaned CAS objects as harmless (immutable, can be GC'd later); or add "on DB failure, best-effort delete newly uploaded CAS object."

- Question: Are thumbnails regenerated immediately during migration, or lazily on first CAS request?
- Why it matters: Plan section 1 (line 54) mentions "Migration must regenerate thumbnails OR clean old cache OR update ImageService"; section 5 (line 485-497) describes lazy generation; these are contradictory.
- Needed answer: Confirm lazy generation is the approach (old thumbnails orphaned, cleaned by TempFileManager age-based logic); or specify eager regeneration during migration.

---

## 4) Deterministic Backend Coverage (new/changed behavior only)

- Behavior: CAS endpoint `GET /api/cas/<hash>` (new stateless blob serving)
- Scenarios:
  - Given valid hash and content_type, When GET /api/cas/<hash>?content_type=application/pdf, Then return 200 with PDF bytes, immutable Cache-Control, ETag (`tests/test_cas_api.py::test_cas_endpoint_download_pdf`)
  - Given valid hash and If-None-Match matches ETag, When GET with If-None-Match header, Then return 304 Not Modified (`tests/test_cas_api.py::test_cas_endpoint_etag_304`)
  - Given both content_type and thumbnail params, When GET with both, Then return 400 Bad Request (`tests/test_cas_api.py::test_cas_endpoint_validation_both_params`)
  - Given neither param, When GET without params, Then return 400 Bad Request (`tests/test_cas_api.py::test_cas_endpoint_validation_no_params`)
  - Given nonexistent hash, When GET, Then return 404 Not Found (`tests/test_cas_api.py::test_cas_endpoint_not_found`)
  - Given S3 unavailable, When GET, Then return 500 Internal Server Error (`tests/test_cas_api.py::test_cas_endpoint_s3_error`)
- Instrumentation: Counter for CAS requests (by status code, is_thumbnail), Histogram for response time (by cache hit), logged at INFO level
- Persistence hooks: No DB writes (stateless); S3 reads only; thumbnail cache writes to local disk (cleaned by TempFileManager)
- Gaps: **Missing test for disposition and filename query params** (plan line 778 mentions this but no corresponding test scenario listed). Add scenario: "Given disposition=attachment and filename, When GET, Then Content-Disposition header includes filename."
- Evidence: `plan.md:769-781, 664-677`

- Behavior: Migration service `CAsMigrationService.migrate_attachment()` (data migration per attachment)
- Scenarios:
  - Given attachment with UUID s3_key, When migrate_attachment(), Then download, hash, upload to CAS, update DB, commit (`tests/test_cas_migration_service.py::test_migrate_attachment_success`)
  - Given attachment with cas/ s3_key, When migrate_attachment(), Then skip and return skipped status (`tests/test_cas_migration_service.py::test_migrate_attachment_already_migrated`)
  - Given S3 download fails, When migrate_attachment(), Then log error, rollback, return error status (`tests/test_cas_migration_service.py::test_migrate_attachment_download_failure`)
  - Given S3 upload fails, When migrate_attachment(), Then log error, rollback, return error status (`tests/test_cas_migration_service.py::test_migrate_attachment_upload_failure`)
  - Given deduplication (CAS object exists), When migrate_attachment(), Then skip S3 upload, update DB only (`tests/test_cas_migration_service.py::test_migrate_attachment_deduplication`)
- Instrumentation: Per-attachment INFO log with attachment_id, old_key, new_key, hash, status; summary log with counts
- Persistence hooks: DB transaction per attachment (flush + commit); S3 upload idempotent
- Gaps: **No test for DB update failure after S3 upload succeeds** (orphaned CAS object scenario). Add scenario: "Given S3 upload succeeds but DB commit fails, When migrate_attachment(), Then rollback transaction, log error, leave CAS object orphaned (acceptable)."
- Evidence: `plan.md:783-794, 651-661`

- Behavior: Upload flow with CAS hash computation (DocumentService.create_file_attachment modified)
- Scenarios:
  - Given file upload, When create_file_attachment(), Then compute SHA-256, create attachment with cas/<hash> s3_key, upload to S3 (`tests/test_document_service.py::test_create_attachment_with_cas_key`)
  - Given identical file uploaded twice, When create_file_attachment() second time, Then skip S3 upload (deduplication), create separate DB row (`tests/test_document_service.py::test_create_attachment_deduplication`)
- Instrumentation: Counter for deduplication skips; existing upload metrics
- Persistence hooks: DB flush before S3 upload (existing pattern); rollback on S3 failure
- Gaps: None
- Evidence: `plan.md:796-802, 678-683`

- Behavior: Thumbnail generation with hash-based cache keys (ImageService refactor)
- Scenarios:
  - Given attachment with cas/<hash> s3_key, When get_thumbnail_for_hash(), Then extract hash via regex, check cache at {hash}_150.jpg, generate if missing (`tests/test_image_service.py::test_thumbnail_hash_based_cache`)
  - Given s3_key not matching cas/ pattern, When get_thumbnail_for_hash(), Then raise InvalidOperationException (`tests/test_image_service.py::test_thumbnail_invalid_s3_key_format`)
- Instrumentation: Counter for cache misses; existing thumbnail metrics
- Persistence hooks: Local filesystem write to thumbnail cache; cleaned by TempFileManager
- Gaps: **No test for concurrent thumbnail generation** (two requests for same hash/size racing to write cache file). While plan acknowledges "last-write-wins is acceptable" at line 560, this should have an explicit test demonstrating thread safety or documenting the known race. Add scenario or accept risk explicitly.
- Evidence: `plan.md:812-819, 684-690`

- Behavior: PartAttachmentResponseSchema computed fields (download_url, thumbnail_url)
- Scenarios:
  - Given attachment with cas/<hash> s3_key, When serialize, Then download_url contains /api/cas/<hash>?content_type=...&disposition=attachment&filename=... (`tests/test_parts_api.py::test_attachment_response_includes_cas_urls`)
  - Given image attachment, When serialize, Then thumbnail_url contains /api/cas/<hash>?thumbnail=150 (`tests/test_parts_api.py::test_attachment_response_thumbnail_url`)
  - Given PDF attachment, When serialize, Then thumbnail_url is null (`tests/test_parts_api.py::test_attachment_response_pdf_no_thumbnail`)
  - Given URL attachment with null s3_key, When serialize, Then download_url and thumbnail_url are null (`tests/test_parts_api.py::test_attachment_response_url_type_no_cas`) **[MISSING from plan test section 13]**
- Instrumentation: None (schema serialization)
- Persistence hooks: None (computed fields, no writes)
- Gaps: **Missing test for null s3_key case** (noted above). Add to plan section 13.
- Evidence: `plan.md:821-829, plan.md:628-632`

- Behavior: PartResponseSchema cover_url computed field (replaces has_cover_attachment)
- Scenarios:
  - Given part with cover_attachment_id pointing to image, When serialize, Then cover_url contains /api/cas/<hash>?thumbnail=150 (`tests/test_parts_api.py::test_part_response_cover_url`)
  - Given part with null cover_attachment_id, When serialize, Then cover_url is null (`tests/test_parts_api.py::test_part_response_no_cover`)
  - Given part with cover pointing to PDF, When serialize, Then cover_url is null or raise exception (`tests/test_parts_api.py::test_part_response_cover_not_image`) **[AMBIGUOUS in plan]**
- Instrumentation: None (schema serialization)
- Persistence hooks: None (computed fields)
- Gaps: **Plan is ambiguous on non-image cover handling** (line 634-638: "return null (or throw InvalidOperationException to signal data integrity issue)"). This must be decided and tested. Recommend: return null and log warning (fail gracefully) rather than raising exception (fail fast would break GET /api/parts/<key> if data integrity issue exists).
- Evidence: `plan.md:831-838, 634-638`

- Behavior: S3 cleanup after migration (optional, guarded by CAS_MIGRATION_DELETE_OLD_OBJECTS)
- Scenarios:
  - Given cleanup flag enabled and protected CAS key set, When cleanup_old_objects(), Then delete S3 objects not in protected set, log deletions (`tests/test_cas_migration_service.py::test_cleanup_old_objects`)
  - Given cleanup flag disabled, When cleanup_old_objects(), Then no-op (`tests/test_cas_migration_service.py::test_cleanup_disabled`)
- Instrumentation: INFO log per deleted object; WARNING log on delete failures (best-effort)
- Persistence hooks: Read-only DB query to build protected set; S3 deletes are non-transactional
- Gaps: **No test for concurrent upload during cleanup** (race condition at line 622-626). Plan documents this as deployment coordination requirement but does not include a test demonstrating the failure mode. Recommend adding integration test: "Given cleanup running and concurrent upload, When upload creates new CAS object mid-cleanup, Then cleanup might delete newly created object (data loss)." Or add locking/coordination mechanism.
- Evidence: `plan.md:790-791, 622-626, 692-697`

---

## 5) Adversarial Sweep (must find ≥3 credible issues or declare why none exist)

**Major — Migration transaction does not rollback S3 upload on DB commit failure**

**Evidence:** `plan.md:423-438` shows migration flow: "Download S3 → Compute hash → Check exists → Upload S3 → Update DB → Commit" (lines 431-436). If DB commit fails (line 436) after S3 upload succeeds (line 434), the transaction rolls back the s3_key update but leaves the newly uploaded CAS object in S3. Cleanup job (lines 439-446) only protects keys currently in the database (line 440), so this orphaned object survives cleanup. While plan acknowledges "idempotent" at line 546, it does not address this specific failure mode.

**Why it matters:** Migration is not transactional across S3 and DB; partial failure leaves orphaned blobs in S3 bucket, wasting storage. Over many migration failures, this could accumulate significant orphaned data. Cleanup job cannot safely delete these because it runs after migration completes, and newly uploaded CAS objects are not yet in the protected set.

**Fix suggestion:** Add to migration flow (section 5, line 437): "j. On DB commit error: attempt best-effort S3 delete of new CAS object (log failure, continue)." Or explicitly document in section 7 (Consistency) that orphaned CAS uploads are acceptable because they are immutable and harmless (recommend against this unless storage cost is truly negligible).

**Confidence:** High — Code flow is explicit, and DB-vs-S3 transaction gap is a well-known distributed system failure mode.

---

**Major — ImageService hash extraction assumes s3_key is always CAS format post-migration**

**Evidence:** `plan.md:485-497` describes thumbnail flow: "Extract hash from s3_key: `match = re.match(r'cas/([0-9a-f]{64})', attachment.s3_key)` → `hash = match.group(1)`" (line 490). If regex match fails, plan says "raise InvalidOperationException" (line 618-620). However, plan does not specify **when** ImageService switches to hash-based cache keys. If migration is in progress (some attachments migrated, some not), or if migration fails midway, ImageService may receive attachments with old UUID s3_keys, causing exceptions.

**Why it matters:** Breaks thumbnail serving during migration rollout or partial migration failures. Users see 500 errors for thumbnails on unmigrated attachments. Plan section 14 (Implementation Slices) shows slice 1 updates ImageService "with fallback to attachment_id for old data" (line 870), but section 5 (Algorithms) does not describe this fallback logic.

**Fix suggestion:** Reconcile sections 5 and 14. Add to line 490: "If s3_key matches `cas/([0-9a-f]{64})`, extract hash; else if s3_key matches `parts/.*/attachments/.*`, fall back to `{attachment_id}_{size}.jpg` cache key (legacy). Raise InvalidOperationException only if s3_key is null or malformed." Add test scenario: "Given attachment with UUID s3_key during migration, When get_thumbnail(), Then use attachment_id fallback for cache key."

**Confidence:** High — Plan sections contradict each other; fallback logic is mentioned but not detailed.

---

**Major — Cleanup job uses filtered query to build protected set, risking deletion of valid CAS objects**

**Evidence:** `plan.md:524-529` describes cleanup: "Filtered query `SELECT DISTINCT s3_key FROM part_attachments WHERE s3_key LIKE 'cas/%'`" builds protected set (line 526). Plan acknowledges at line 527: "filtered query ensures only CAS keys protected (not old UUID keys)." However, the WHERE clause filters **only** CAS keys, meaning old UUID keys are **intentionally excluded** from the protected set. Cleanup then deletes "each object NOT in protected set AND NOT starting with `cas/`" (line 443-444).

**Why it matters:** The cleanup logic at line 443 says "For each object NOT in protected set AND NOT starting with `cas/`" — this correctly excludes CAS objects from deletion even if not in DB. But the filtered query (line 526) only protects CAS keys, so old UUID keys **not yet migrated** will be deleted by cleanup if they are not in the protected set. If migration is incomplete, cleanup destroys unmigrated attachments. Plan does not mandate "cleanup only runs after migration 100% complete."

**Fix suggestion:** Add to section 5 (Algorithms, line 439): "5. Verify migration is complete: assert no attachments with s3_key NOT LIKE 'cas/%' exist before starting cleanup." Or change cleanup filter to: "For each object NOT in protected set AND starting with `parts/` (old UUID pattern)" to explicitly target only old keys. Update invariant at line 528 to: "Must not delete any S3 object referenced by any attachment OR any object not yet migrated."

**Confidence:** High — Filtered query logic + deletion condition create a data loss path if cleanup runs before migration completes.

---

**Minor — Test plan does not cover ETag validation for thumbnails**

**Evidence:** `plan.md:770-781` lists CAS endpoint test scenarios. Line 772 covers ETag validation for content downloads: "Given If-None-Match header matches ETag, When GET with If-None-Match, Then return 304 Not Modified." However, this scenario uses `content_type` param. Plan does not include equivalent scenario for thumbnails: "Given If-None-Match header matches ETag, When GET /api/cas/<hash>?thumbnail=150 with If-None-Match, Then return 304 Not Modified."

**Why it matters:** Thumbnails should benefit from ETag caching just like full content; frontend may send If-None-Match for thumbnail requests. Missing test means this behavior is untested and may break.

**Fix suggestion:** Add test scenario at line 773: "Given valid hash and thumbnail param with If-None-Match matching ETag, When GET /api/cas/<hash>?thumbnail=150, Then return 304 Not Modified (`tests/test_cas_api.py::test_cas_endpoint_thumbnail_etag_304`)."

**Confidence:** Medium — Plan explicitly covers ETag for downloads but omits it for thumbnails; could be intentional (thumbnails always regenerated) but more likely an oversight.

---

## 6) Derived-Value & Persistence Invariants (stacked entries)

- Derived value: CAS URL for attachment download
  - Source dataset: Unfiltered attachment metadata from database (s3_key, content_type, filename) via PartAttachmentResponseSchema computed field
  - Write / cleanup triggered: No persistent writes; URL string constructed in-memory during schema serialization
  - Guards: Null check on s3_key before URL construction; regex validation that s3_key matches `cas/[0-9a-f]{64}` format
  - Invariant: Every attachment with non-null s3_key must have valid `cas/<hash>` format after migration completes; s3_key values must never be exposed in API responses (security)
  - Evidence: `plan.md:503-508, 231-247`

- Derived value: CAS URL for part cover thumbnail
  - Source dataset: Unfiltered part.cover_attachment relationship (loaded via selectin) used in PartResponseSchema.cover_url computed field
  - Write / cleanup triggered: No persistent writes; URL constructed in-memory; no cleanup (cover_attachment_id FK constraint ensures referential integrity)
  - Guards: Null check on cover_attachment_id before accessing relationship; content_type validation that cover is an image (plan ambiguous at line 634-638: should validate and return null if not image, or raise exception?)
  - Invariant: If cover_attachment_id is set, the referenced attachment must exist (FK enforced) and should be an image type (application-level invariant, not DB-enforced); cover_url must be null if cover is not an image
  - Evidence: `plan.md:510-515, 634-638`

- Derived value: Thumbnail cache file path from hash (hash-based cache key)
  - Source dataset: Unfiltered s3_key from attachment row, extracted via regex `cas/([0-9a-f]{64})`
  - Write / cleanup triggered: Local filesystem write to `/tmp/thumbnails/{hash}_{size}.jpg`; cleanup via TempFileManager age-based deletion (existing background thread)
  - Guards: Regex validation that s3_key matches `cas/[0-9a-f]{64}` before extracting hash (line 520); fallback to attachment_id-based cache key for legacy s3_keys (mentioned in slice 1, line 870, but not detailed in algorithm section 5)
  - Invariant: Thumbnail cache path must always use hash component from s3_key (if CAS format) or attachment_id (if legacy format); never mix hash and attachment_id for same attachment
  - Evidence: `plan.md:517-522, 485-497`

- Derived value: Protected CAS key set for cleanup (determines which S3 objects to delete)
  - Source dataset: **Filtered** query `SELECT DISTINCT s3_key FROM part_attachments WHERE s3_key LIKE 'cas/%'` (line 526)
  - Write / cleanup triggered: S3 delete operations for all objects NOT in protected set AND NOT starting with `cas/` (line 443-444)
  - Guards: Cleanup only runs if `CAS_MIGRATION_DELETE_OLD_OBJECTS=true` (config flag); filtered query intentionally excludes non-CAS keys from protection
  - Invariant: **Must not delete any S3 object referenced by any attachment row in database** (line 528) — **VIOLATED** if cleanup runs before migration completes, because unmigrated attachments (UUID s3_keys) are not in protected set and will be deleted
  - Evidence: `plan.md:524-529, 439-446` — **Major finding: filtered view drives persistent delete without guard ensuring migration is complete**

- Derived value: Deduplication decision during upload (whether to skip S3 upload)
  - Source dataset: Unfiltered SHA-256 hash of uploaded file bytes (computed in-memory)
  - Write / cleanup triggered: Conditional S3 upload (skip if `s3_service.file_exists(cas/<hash>)` returns True); database write always occurs (new attachment row created even if content is duplicate)
  - Guards: S3 head_object call to check existence before upload; eventual consistency risk (plan acknowledges at line 915-917: concurrent uploads of same content may both upload, wasting storage, but acceptable)
  - Invariant: Every unique content hash maps to at most one S3 object at `cas/<hash>` (deduplication goal); multiple DB rows can reference same S3 key (intentional)
  - Evidence: `plan.md:531-536, 452-468`

---

## 7) Risks & Mitigations (top 3)

- Risk: Migration run without verifying 100% completion before cleanup job executes, resulting in deletion of unmigrated attachment blobs (data loss)
- Mitigation: Add pre-cleanup validation step to migration service: query `SELECT COUNT(*) FROM part_attachments WHERE s3_key NOT LIKE 'cas/%' AND s3_key IS NOT NULL`; if count > 0, abort cleanup with error "Migration incomplete, cannot run cleanup safely." Document in deployment runbook that cleanup flag should only be enabled after verifying migration success.
- Evidence: `plan.md:524-529` (filtered cleanup query), `plan.md:439-446` (cleanup flow), section 5 Adversarial Sweep finding on filtered delete

- Risk: S3 eventual consistency causes deduplication race: two concurrent uploads of same content both pass `file_exists()` check and upload duplicate CAS objects
- Mitigation: Accept risk as documented at plan line 915-917 ("Minor - duplicate S3 objects uploaded, wasted storage; both attachments work correctly"). Add monitoring counter for deduplication skips (line 678-682) to track effectiveness; consider eventual cleanup job to detect and remove duplicate CAS objects (out of scope for MVP). Eventual consistency window is milliseconds; probability of collision is low for realistic upload rate.
- Evidence: `plan.md:915-917, 531-536`

- Risk: ImageService hash extraction fails for old UUID s3_keys during partial migration, breaking thumbnail serving with 500 errors
- Mitigation: Implement fallback logic in ImageService (mentioned at plan line 870 but not detailed): if s3_key matches `cas/[0-9a-f]{64}`, use hash-based cache key; else use attachment_id-based cache key (legacy). Ensure CAS endpoint can handle both cache key formats. Add test scenarios for both cases. Document that full migration must complete before old cache files can be purged.
- Evidence: `plan.md:485-497` (hash extraction algorithm), `plan.md:870` (slice 1 mentions fallback), section 5 Adversarial Sweep finding on ImageService

---

## 8) Confidence

Confidence: Medium — The plan demonstrates strong research (comprehensive file map with line-level evidence, detailed algorithm flows, thoughtful error enumeration) and correctly identifies most architectural touchpoints. However, **critical gaps in transaction safety** (migration rollback, cleanup pre-conditions) and **algorithmic ambiguities** (ImageService fallback logic contradictions between sections 5 and 14, non-image cover handling, startup vs. CLI migration trigger) reduce confidence that implementation would succeed without significant rework. The plan is 80% ready; addressing the Major findings (migration transaction rollback, ImageService fallback reconciliation, cleanup validation) and resolving open questions (startup vs. CLI, cover endpoint retention) would raise confidence to High.
